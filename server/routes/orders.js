import express from 'express';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import User from '../models/User.js';
import Bill from '../models/Bill.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import { printKOT } from '../utils/printer.js';

const router = express.Router();

// A simple promise-based lock/queue to handle concurrent order submissions sequentially
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
    const all = await Order.find({}).sort({ _id: -1 });
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
    await Table.updateMany({}, { status: 'Available', orderId: undefined, waiterId: undefined, guests: 0 });
    
    // Broadcast Socket Events
    const io = req.app.get('io');
    io.emit('orders_sync', []);
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));
    
    res.json({ success: true, message: 'All orders, bills and tables have been reset successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/orders
// @desc    Create new order (Waiter places order)
router.post('/', protect, async (req, res) => {
  const { tableId, items, notes } = req.body;

  try {
    const result = await orderQueue.enqueue(async () => {
      const user = await User.findById(req.user.id);
      if (user && user.status === 'Disabled') {
        throw new Error('Your account is currently disabled. You cannot place new orders.');
      }

      const table = await Table.findOne({ id: tableId });
      if (!table) {
        throw new Error('Table not found');
      }

      const orderId = `ord-${Date.now()}`;
      const timestamp = new Date().toLocaleTimeString();

      // Calculate Grand Total
      const orderItems = items.map((item, idx) => ({
        ...item,
        id: `${orderId}-item-${idx}`
      }));
      const grandTotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      const newOrder = new Order({
        id: orderId,
        tableId,
        waiterId: req.user.id,
        items: orderItems,
        status: 'Pending',
        notes,
        timestamp,
        grandTotal
      });

      await newOrder.save();

      // Print KOT to Kitchen
      printKOT(newOrder);

      // Link table
      table.status = 'Occupied';
      table.orderId = orderId;
      table.waiterId = req.user.id;
      table.guests = table.guests || 2;
      await table.save();

      // Create Notification
      const notif = new Notification({
        id: `notif-${Date.now()}`,
        title: `New Order - Table ${tableId}`,
        message: `${orderItems.length} items ordered by ${req.user.name}`,
        type: 'Order',
        timestamp,
        read: false
      });
      await notif.save();

      // Broadcast Socket Events
      const io = req.app.get('io');
      io.emit('order_created', newOrder);
      io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));
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

      const order = await Order.findOne({ id: req.params.id });
      if (!order) {
        throw new Error('Order not found');
      }

      const { items } = req.body;
      if (items) {
        // Calculate newly added items for KOT printing
        const newlyAddedItems = [];
        items.forEach(item => {
          const existingItem = order.items.find(i => i.name === item.name && i.portion === item.portion);
          if (!existingItem) {
            newlyAddedItems.push(item);
          } else if (item.quantity > existingItem.quantity) {
            newlyAddedItems.push({
              ...item,
              quantity: item.quantity - existingItem.quantity
            });
          }
        });

        order.items = items;
        order.grandTotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

        if (newlyAddedItems.length > 0) {
          printKOT({ ...order.toObject(), items: newlyAddedItems });
        }
      }

      if (req.body.status) {
        order.status = req.body.status;
      }

      await order.save();

      // Broadcast Socket Events
      const io = req.app.get('io');
      io.emit('order_updated', order);
      io.emit('orders_sync', await Order.find({}));

      return order;
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
    const order = await Order.findOne({ id: req.params.id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status;
    await order.save();

    // Create Notification
    const notif = new Notification({
      id: `notif-${Date.now()}`,
      title: `Order ${status} - Table ${order.tableId}`,
      message: `Order #${order.id.substring(4, 8)} status advanced to ${status}`,
      type: 'Kitchen',
      timestamp: new Date().toLocaleTimeString(),
      read: false
    });
    await notif.save();

    // Broadcast Socket Events
    const io = req.app.get('io');
    io.emit('order_status_updated', { id: order.id, status: order.status });
    io.emit('orders_sync', await Order.find({}));
    io.emit('notification_received', notif);

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
