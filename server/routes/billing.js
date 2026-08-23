import express from 'express';
import { Table, Order, Bill, Notification, CancellationRequest, Settings } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/billing
// @desc    Get all bills
router.get('/', protect, async (req, res) => {
  try {
    const list = await Bill.find();
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
  // GST % must always be supplied by the client (from Settings); the legacy
  // default of 5 is kept only as a last-resort fallback for old clients.
  const { tableId, discount, gstPct = 5, orderId, isParcel, containerCharge } = req.body;
  const gstPercentage = Math.max(0, Number(gstPct) || 0);

  try {
    const parcel = !!isParcel;

    let order;
    let billTableId;
    if (parcel) {
      if (!orderId) {
        return res.status(400).json({ success: false, message: 'orderId is required for parcel bills' });
      }
      order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      billTableId = 0;
    } else {
      const table = await Table.findById(Number(tableId));
      if (!table || !table.orderId) {
        return res.status(400).json({ success: false, message: 'Table has no active order' });
      }
      order = await Order.findById(table.orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      billTableId = Number(tableId);
    }

    // Calculations
    const discountVal = Math.max(0, Math.min(Number(discount) || 0, order.grandTotal)); // never go negative
    const containerVal = parcel ? (Number(containerCharge) || 0) : 0;
    const subtotal = order.grandTotal;
    const gst = Math.round(subtotal * (gstPercentage / 100) * 100) / 100;
    const grandTotal = Math.max(0, Math.round((subtotal + gst - discountVal + containerVal) * 100) / 100);

    // Check for existing pending bill
    const existing = await Bill.findOne({
      orderId: order.id,
      paymentStatus: 'Pending'
    });

    let newBill;
    if (existing) {
      existing.subtotal = subtotal;
      existing.gst = gst;
      existing.gstPct = gstPercentage;
      existing.discount = discountVal;
      existing.containerCharge = containerVal;
      existing.grandTotal = grandTotal;
      existing.timestamp = new Date().toLocaleTimeString();
      newBill = await existing.save();
    } else {
      newBill = await Bill.create({
        _id: `bill-${Date.now()}`,
        orderId: order.id,
        tableId: billTableId,
        subtotal,
        gst,
        gstPct: gstPercentage,
        discount: discountVal,
        containerCharge: containerVal,
        grandTotal,
        isParcel: parcel,
        paymentStatus: 'Pending',
        timestamp: new Date().toLocaleTimeString()
      });
    }

    // Bill thermal printing now happens client-side via Web Serial
    // (the Billing screen prints from the returned bill data).

    if (!parcel) {
      // Set Table status to Billing
      await Table.findByIdAndUpdate(billTableId, { status: 'Billing' });
    }

    // Create Notification
    const notif = await Notification.create({
      title: parcel ? 'Parcel Bill Generated' : `Bill Generated - Table ${billTableId}`,
      message: `Total: ₹${grandTotal} (Subtotal: ₹${subtotal}, GST: ₹${gst})`,
      type: 'Billing',
      timestamp: new Date().toLocaleTimeString(),
      read: false
    });

    // Broadcast
    const io = req.app.get('io');
    io.emit('bill_generated', newBill);
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));
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
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    bill.paymentStatus = 'Paid';
    bill.paymentMethod = paymentMethod;
    await bill.save();

    // Update table status to Available
    const table = await Table.findById(bill.tableId);
    if (table && table.orderId === bill.orderId) {
      table.status = 'Available';
      table.orderId = null;
      table.waiterId = null;
      table.guests = 0;
      await table.save();
    }

    // Set Order to Served
    await Order.findByIdAndUpdate(bill.orderId, { status: 'Served' });

    // Broadcast
    const io = req.app.get('io');
    io.emit('bill_paid', { billId: bill.id, method: paymentMethod, tableId: bill.tableId, orderId: bill.orderId });
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));
    io.emit('orders_sync', await Order.find());

    res.json({ success: true, message: 'Checkout complete, payment processed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/:id/print
// @desc    Bill data / print-intent endpoint. Physical printing is performed
//          client-side via Web Serial; this endpoint only returns the bill and
//          its order so the frontend can generate the ESC/POS receipt.
router.post('/:id/print', protect, async (req, res) => {
  try {
    let bill = await Bill.findById(req.params.id);
    if (!bill) {
      bill = await Bill.findOne({ orderId: req.params.id });
    }
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }
    const order = await Order.findById(bill.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      data: { bill, order },
      message: 'Print the receipt from the browser using Web Serial.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/reset-checkout/:tableId
// @desc    Reset table status from Billing back to Occupied if checkout requested by mistake
router.post('/reset-checkout/:tableId', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.tableId);
    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    const newStatus = table.orderId ? 'Occupied' : 'Available';
    table.status = newStatus;
    await table.save();

    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, data: table, message: `Table ${tableId} status reset to ${newStatus}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/cancel-request
// @desc    Request item cancellation
router.post('/cancel-request', protect, async (req, res) => {
  const { orderId, itemText, reason } = req.body;

  try {
    const newReq = await CancellationRequest.create({
      orderId,
      itemText,
      reason,
      requestedBy: req.user.name,
      status: 'Pending',
      timestamp: new Date().toLocaleTimeString()
    });

    const notif = await Notification.create({
      title: `Cancellation Request`,
      message: `Refund/removal request for "${itemText}" in Order ${orderId.substring(4,8)}. Reason: ${reason}`,
      type: 'Cancellation',
      timestamp: new Date().toLocaleTimeString(),
      read: false
    });

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
    const list = await CancellationRequest.find();
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
    const cancelReq = await CancellationRequest.findById(req.params.id);
    if (!cancelReq) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    cancelReq.status = status;
    const updatedReq = await cancelReq.save();

    if (status === 'Approved') {
      const order = await Order.findById(cancelReq.orderId);
      if (order && Array.isArray(order.items)) {
        // itemText format: "<name> (<portion>) x<qty>" — the x<qty> suffix is
        // optional; legacy requests without it cancel the entire line.
        const qtyMatch = cancelReq.itemText.match(/\s*x(\d+)\s*$/i);
        const cancelQty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
        const baseText = cancelReq.itemText.replace(/\s*x\d+\s*$/i, '').trim().toLowerCase();

        const updatedItems = [];
        let remainingToCancel = cancelQty;
        for (const item of order.items) {
          const detail = `${item.name} (${item.portion})`.toLowerCase();
          const matchesLine =
            !cancelQty || remainingToCancel > 0
              ? (detail === baseText || item.name.toLowerCase() === baseText)
              : false;
          if (!matchesLine) {
            updatedItems.push(item);
            continue;
          }
          const removeQty = cancelQty === null ? item.quantity : Math.min(remainingToCancel, item.quantity);
          if (cancelQty !== null) remainingToCancel -= removeQty;
          const leftQty = item.quantity - removeQty;
          if (leftQty > 0) {
            updatedItems.push({ ...item, quantity: leftQty });
          }
        }
        const grandTotal = updatedItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);

        order.items = updatedItems;
        order.markModified('items');
        order.grandTotal = grandTotal;
        await order.save();

        // Update pending bill if it exists
        const pendingBill = await Bill.findOne({
          orderId: order.id,
          paymentStatus: 'Pending'
        });
        if (pendingBill) {
          // Honour the bill's own GST %; fall back to the restaurant setting
          // for legacy bills created before gstPct was persisted.
          let billGstPct = pendingBill.gstPct;
          if (typeof billGstPct !== 'number') {
            const settings = await Settings.findOne();
            billGstPct = settings?.gstEnabled === false ? 0 : (settings?.gstPct ?? 18);
          }
          const safeDiscount = Math.min(pendingBill.discount || 0, grandTotal);
          const newGst = Math.round(grandTotal * (billGstPct / 100) * 100) / 100;
          const newGrandTotal = Math.max(0,
            Math.round((grandTotal + newGst - safeDiscount + (pendingBill.containerCharge || 0)) * 100) / 100
          );

          pendingBill.subtotal = grandTotal;
          pendingBill.gst = newGst;
          pendingBill.discount = safeDiscount;
          pendingBill.grandTotal = newGrandTotal;
          const updatedBill = await pendingBill.save();

          const io = req.app.get('io');
          io.emit('bill_generated', updatedBill); // broadcast updated bill
        }
      }
    }

    const io = req.app.get('io');
    io.emit('cancel_status_updated', updatedReq);
    io.emit('orders_sync', await Order.find());

    res.json({ success: true, message: `Request status set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
