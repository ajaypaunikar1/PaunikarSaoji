import express from 'express';
import { Table, Order, Bill, User, Notification } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

class RequestQueue {
  constructor() {
    this.queue = Promise.resolve();
  }
  enqueue(action) {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          const result = await action();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

const orderQueue = new RequestQueue();

// @route   GET /api/orders
// @desc    Get all orders (including Served / historical ones)
router.get('/', protect, async (req, res) => {
  try {
    const all = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, data: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/orders/active
// @desc    Get active orders (Pending, Preparing, Ready)
router.get('/active', async (req, res) => {
  try {
    const activeOrders = await Order.find({ status: { $ne: 'Served' } });
    res.json({ success: true, data: activeOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/orders/reset
// @desc    Reset all orders, bills, and table statuses (Admin only)
router.delete('/reset', protect, async (req, res) => {
  try {
    await Order.deleteMany({});
    await Bill.deleteMany({});
    await Table.updateMany({}, {
      $set: {
        status: 'Available',
        orderId: null,
        waiterId: null,
        guests: 0
      }
    });

    // Broadcast Socket Events
    const io = req.app.get('io');
    io.emit('orders_sync', []);
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, message: 'All orders, bills and tables have been reset successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/orders
// @desc    Create new order (Waiter places order)
router.post('/', protect, async (req, res) => {
  const { tableId, items, notes, isParcel, customerName } = req.body;

  try {
    const result = await orderQueue.enqueue(async () => {
      const user = await User.findById(req.user.id);
      if (user && user.status === 'Disabled') {
        throw new Error('Your account is currently disabled. You cannot place new orders.');
      }

      const parcel = !!isParcel;
      const effectiveTableId = parcel ? 0 : Number(tableId);

      if (!parcel) {
        const table = await Table.findById(effectiveTableId);
        if (!table) {
          throw new Error('Table not found');
        }
      }

      const orderId = `ord-${Date.now()}`;
      const timestamp = new Date().toLocaleTimeString();
      const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

      // Calculate Grand Total
      const orderItems = items.map((item, idx) => ({
        ...item,
        id: `${orderId}-item-${idx}`
      }));
      const grandTotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      const newOrder = await Order.create({
        _id: orderId,
        tableId: effectiveTableId,
        waiterId: req.user.id,
        items: orderItems,
        status: 'Pending',
        notes,
        timestamp,
        date,
        isParcel: parcel,
        customerName: parcel ? (customerName || null) : null,
        grandTotal
      });

      // KOT thermal printing now happens client-side via Web Serial
      // (KDS screen auto-prints when it receives the order_created socket event).

      if (!parcel) {
        // Link table
        const table = await Table.findById(effectiveTableId);
        table.status = 'Occupied';
        table.orderId = orderId;
        table.waiterId = req.user.id;
        table.guests = table.guests || 2;
        await table.save();
      }

      // Create Notification
      const notif = await Notification.create({
        title: parcel ? 'New Parcel Order' : `New Order - Table ${effectiveTableId}`,
        message: `${orderItems.length} items ordered by ${req.user.name}${parcel && customerName ? ` for ${customerName}` : ''}`,
        type: 'Order',
        timestamp,
        read: false
      });

      // Broadcast Socket Events
      const io = req.app.get('io');
      io.emit('order_created', newOrder);
      io.emit('tables_sync', await Table.find().sort({ _id: 1 }));
      io.emit('notification_received', notif);

      return newOrder;
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/orders/:id
// @desc    Update order (add items/append items)
router.put('/:id', protect, async (req, res) => {
  try {
    const result = await orderQueue.enqueue(async () => {
      const user = await User.findById(req.user.id);
      if (user && user.status === 'Disabled') {
        throw new Error('Your account is currently disabled. You cannot edit orders.');
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        throw new Error('Order not found');
      }

      const { items } = req.body;
      let finalOrder = order;

      if (items) {
        // Calculate newly added items for KOT printing
        const newlyAddedItems = [];
        const orderItems = Array.isArray(order.items) ? order.items : [];

        items.forEach(item => {
          const existingItem = orderItems.find(i => i.name === item.name && i.portion === item.portion);
          if (!existingItem) {
            newlyAddedItems.push(item);
          } else if (item.quantity > existingItem.quantity) {
            newlyAddedItems.push({
              ...item,
              quantity: item.quantity - existingItem.quantity
            });
          }
        });

        const grandTotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

        order.items = items;
        order.markModified('items');
        order.grandTotal = grandTotal;
        if (req.body.status) order.status = req.body.status;
        finalOrder = await order.save();

        if (newlyAddedItems.length > 0) {
          // KOT for newly added items is printed client-side via Web Serial
          // (KDS auto-prints when it receives the order_updated socket event).
        }
      } else if (req.body.status) {
        order.status = req.body.status;
        finalOrder = await order.save();
      }

      // Broadcast Socket Events
      const io = req.app.get('io');
      io.emit('order_updated', finalOrder);
      io.emit('orders_sync', await Order.find());

      return finalOrder;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status (Chef advances queue)
router.put('/:id/status', protect, async (req, res) => {
  const { status } = req.body;

  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Create Notification
    const notif = await Notification.create({
      title: `Order ${status} - Table ${order.tableId}`,
      message: `Order #${order.id.substring(4, 8)} status advanced to ${status}`,
      type: 'Kitchen',
      timestamp: new Date().toLocaleTimeString(),
      read: false
    });

    // Broadcast Socket Events
    const io = req.app.get('io');
    io.emit('order_status_updated', { id: order.id, status: order.status });
    io.emit('orders_sync', await Order.find());
    io.emit('notification_received', notif);

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/orders/:id
// @desc    Delete an unbilled order (used by table merge to retire source orders)
router.delete('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Safety: never delete an order that already has a bill against it
    const bill = await Bill.findOne({ orderId: order.id });
    if (bill) {
      return res.status(409).json({ success: false, message: 'Order has a bill and cannot be deleted' });
    }

    // Release any table still pointing at this order
    await Table.updateMany({ orderId: order.id }, { $set: { orderId: null } });

    await order.deleteOne();

    const io = req.app.get('io');
    io.emit('orders_sync', await Order.find());
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
