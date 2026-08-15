import express from 'express';
import prisma from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { printKOT } from '../utils/printer.js';

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
    const all = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/orders/active
// @desc    Get active orders (Pending, Preparing, Ready)
router.get('/active', async (req, res) => {
  try {
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { not: 'Served' }
      }
    });
    res.json({ success: true, data: activeOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/orders/reset
// @desc    Reset all orders, bills, and table statuses (Admin only)
router.delete('/reset', protect, async (req, res) => {
  try {
    await prisma.order.deleteMany({});
    await prisma.bill.deleteMany({});
    await prisma.table.updateMany({
      data: {
        status: 'Available',
        orderId: null,
        waiterId: null,
        guests: 0
      }
    });
    
    // Broadcast Socket Events
    const io = req.app.get('io');
    io.emit('orders_sync', []);
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));
    
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
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user && user.status === 'Disabled') {
        throw new Error('Your account is currently disabled. You cannot place new orders.');
      }

      const parcel = !!isParcel;
      const effectiveTableId = parcel ? 0 : Number(tableId);

      if (!parcel) {
        const table = await prisma.table.findUnique({ where: { id: effectiveTableId } });
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

      const newOrder = await prisma.order.create({
        data: {
          id: orderId,
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
        }
      });

      // Print KOT to Kitchen
      printKOT(newOrder);

      if (!parcel) {
        // Link table
        await prisma.table.update({
          where: { id: effectiveTableId },
          data: {
            status: 'Occupied',
            orderId: orderId,
            waiterId: req.user.id,
            guests: (await prisma.table.findUnique({ where: { id: effectiveTableId } }))?.guests || 2
          }
        });
      }

      // Create Notification
      const notif = await prisma.notification.create({
        data: {
          title: parcel ? 'New Parcel Order' : `New Order - Table ${effectiveTableId}`,
          message: `${orderItems.length} items ordered by ${req.user.name}${parcel && customerName ? ` for ${customerName}` : ''}`,
          type: 'Order',
          timestamp,
          read: false
        }
      });

      // Broadcast Socket Events
      const io = req.app.get('io');
      io.emit('order_created', newOrder);
      io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));
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
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user && user.status === 'Disabled') {
        throw new Error('Your account is currently disabled. You cannot edit orders.');
      }

      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
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

        finalOrder = await prisma.order.update({
          where: { id: req.params.id },
          data: {
            items,
            grandTotal,
            status: req.body.status || undefined
          }
        });

        if (newlyAddedItems.length > 0) {
          printKOT({ ...finalOrder, items: newlyAddedItems });
        }
      } else if (req.body.status) {
        finalOrder = await prisma.order.update({
          where: { id: req.params.id },
          data: { status: req.body.status }
        });
      }

      // Broadcast Socket Events
      const io = req.app.get('io');
      io.emit('order_updated', finalOrder);
      io.emit('orders_sync', await prisma.order.findMany({}));

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
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status }
    });

    // Create Notification
    const notif = await prisma.notification.create({
      data: {
        title: `Order ${status} - Table ${order.tableId}`,
        message: `Order #${order.id.substring(4, 8)} status advanced to ${status}`,
        type: 'Kitchen',
        timestamp: new Date().toLocaleTimeString(),
        read: false
      }
    });

    // Broadcast Socket Events
    const io = req.app.get('io');
    io.emit('order_status_updated', { id: order.id, status: order.status });
    io.emit('orders_sync', await prisma.order.findMany({}));
    io.emit('notification_received', notif);

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
