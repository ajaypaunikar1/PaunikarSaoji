import express from 'express';
import Bill from '../models/Bill.js';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import Notification from '../models/Notification.js';
import CancellationRequest from '../models/CancellationRequest.js';
import { protect } from '../middleware/auth.js';
import { printBillReceipt } from '../utils/printer.js';

const router = express.Router();

// @route   GET /api/billing
// @desc    Get all bills
router.get('/', protect, async (req, res) => {
  try {
    const list = await Bill.find({});
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/billing/pending-bills
// @desc    Get all unpaid bills
router.get('/pending-bills', async (req, res) => {
  try {
    const pending = await Bill.find({ paymentStatus: 'Pending' });
    res.json({ success: true, data: pending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/generate
// @desc    Generate tax invoice bill
router.post('/generate', protect, async (req, res) => {
  const { tableId, discount } = req.body;

  try {
    const table = await Table.findOne({ id: tableId });
    if (!table || !table.orderId) {
      return res.status(400).json({ success: false, message: 'Table has no active order' });
    }

    const order = await Order.findOne({ id: table.orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Calculations
    const discountVal = Number(discount) || 0;
    const subtotal = order.grandTotal;
    const gst = Math.round(subtotal * 0.05 * 100) / 100;
    const grandTotal = Math.round((subtotal + gst - discountVal) * 100) / 100;

    const newBill = new Bill({
      id: `bill-${Date.now()}`,
      orderId: order.id,
      tableId,
      subtotal,
      gst,
      discount: discountVal,
      grandTotal,
      paymentStatus: 'Pending',
      timestamp: new Date().toLocaleTimeString()
    });

    await newBill.save();

    // Print Receipt to Counter Printer
    printBillReceipt(newBill, order);

    // Set Table status to Billing
    table.status = 'Billing';
    await table.save();

    // Create Notification
    const notif = new Notification({
      id: `notif-${Date.now()}`,
      title: `Bill Generated - Table ${tableId}`,
      message: `Total: ₹${grandTotal} (Subtotal: ₹${subtotal}, GST: ₹${gst})`,
      type: 'Billing',
      timestamp: new Date().toLocaleTimeString(),
      read: false
    });
    await notif.save();

    // Broadcast
    const io = req.app.get('io');
    io.emit('bill_generated', newBill);
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));
    io.emit('notification_received', notif);

    res.status(201).json({ success: true, data: newBill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/:id/pay
// @desc    Process payment and release table
router.post('/:id/pay', protect, async (req, res) => {
  const { paymentMethod } = req.body;

  try {
    const bill = await Bill.findOne({ id: req.params.id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    bill.paymentStatus = 'Paid';
    bill.paymentMethod = paymentMethod;
    await bill.save();

    // Update table status to Available
    const table = await Table.findOne({ id: bill.tableId });
    if (table && table.orderId === bill.orderId) {
      table.status = 'Available';
      table.orderId = undefined;
      table.waiterId = undefined;
      table.guests = 0;
      await table.save();
    }

    // Set Order to Served
    const order = await Order.findOne({ id: bill.orderId });
    if (order) {
      order.status = 'Served';
      await order.save();
    }

    // Broadcast
    const io = req.app.get('io');
    io.emit('bill_paid', { billId: bill.id, method: paymentMethod, tableId: bill.tableId });
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));
    io.emit('orders_sync', await Order.find({}));

    res.json({ success: true, message: 'Checkout complete, payment processed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/cancel-request
// @desc    Request item cancellation
router.post('/cancel-request', protect, async (req, res) => {
  const { orderId, itemText, reason } = req.body;

  try {
    const newReq = new CancellationRequest({
      id: `cancel-${Date.now()}`,
      orderId,
      itemText,
      reason,
      requestedBy: req.user.name,
      status: 'Pending',
      timestamp: new Date().toLocaleTimeString()
    });

    await newReq.save();

    const notif = new Notification({
      id: `notif-${Date.now()}`,
      title: `Cancellation Request`,
      message: `Refund/removal request for "${itemText}" in Order ${orderId.substring(4,8)}. Reason: ${reason}`,
      type: 'Cancellation',
      timestamp: new Date().toLocaleTimeString(),
      read: false
    });
    await notif.save();

    const io = req.app.get('io');
    io.emit('cancel_requested', newReq);
    io.emit('notification_received', notif);

    res.status(201).json({ success: true, data: newReq });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/billing/cancel-requests
// @desc    Get all cancellation requests
router.get('/cancel-requests', protect, async (req, res) => {
  try {
    const list = await CancellationRequest.find({});
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/billing/cancel-requests/:id
// @desc    Approve/Reject cancellation request
router.put('/cancel-requests/:id', protect, async (req, res) => {
  const { status } = req.body;

  try {
    const cancelReq = await CancellationRequest.findOne({ id: req.params.id });
    if (!cancelReq) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    cancelReq.status = status;
    await cancelReq.save();

    if (status === 'Approved') {
      const order = await Order.findOne({ id: cancelReq.orderId });
      if (order) {
        // Remove item from order
        order.items = order.items.filter(item => {
          const detail = `${item.name} (${item.portion})`;
          return detail.toLowerCase() !== cancelReq.itemText.toLowerCase() && item.name.toLowerCase() !== cancelReq.itemText.toLowerCase();
        });
        order.grandTotal = order.items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
        await order.save();

        // Update pending bill if it exists
        const pendingBill = await Bill.findOne({ orderId: order.id, paymentStatus: 'Pending' });
        if (pendingBill) {
          pendingBill.subtotal = order.grandTotal;
          pendingBill.gst = Math.round(pendingBill.subtotal * 0.05 * 100) / 100;
          pendingBill.grandTotal = Math.round((pendingBill.subtotal + pendingBill.gst - pendingBill.discount) * 100) / 100;
          await pendingBill.save();
          
          const io = req.app.get('io');
          io.emit('bill_generated', pendingBill); // broadcast updated bill
        }
      }
    }

    const io = req.app.get('io');
    io.emit('cancel_status_updated', cancelReq);
    io.emit('orders_sync', await Order.find({}));

    res.json({ success: true, message: `Request status set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
