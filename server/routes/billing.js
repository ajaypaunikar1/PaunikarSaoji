import express from 'express';
import prisma from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { printBillReceipt } from '../utils/printer.js';

const router = express.Router();

// @route   GET /api/billing
// @desc    Get all bills
router.get('/', protect, async (req, res) => {
  try {
    const list = await prisma.bill.findMany({});
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/billing/pending-bills
// @desc    Get all unpaid bills
router.get('/pending-bills', async (req, res) => {
  try {
    const pending = await prisma.bill.findMany({
      where: { paymentStatus: 'Pending' }
    });
    res.json({ success: true, data: pending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/generate
// @desc    Generate tax invoice bill
router.post('/generate', protect, async (req, res) => {
  const { tableId, discount, gstPct = 5, orderId, isParcel, containerCharge } = req.body;

  try {
    const parcel = !!isParcel;

    let order;
    let billTableId;
    if (parcel) {
      if (!orderId) {
        return res.status(400).json({ success: false, message: 'orderId is required for parcel bills' });
      }
      order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      billTableId = 0;
    } else {
      const table = await prisma.table.findUnique({ where: { id: Number(tableId) } });
      if (!table || !table.orderId) {
        return res.status(400).json({ success: false, message: 'Table has no active order' });
      }
      order = await prisma.order.findUnique({ where: { id: table.orderId } });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      billTableId = Number(tableId);
    }

    // Calculations
    const discountVal = Number(discount) || 0;
    const containerVal = parcel ? (Number(containerCharge) || 0) : 0;
    const subtotal = order.grandTotal;
    const gst = Math.round(subtotal * (Number(gstPct) / 100) * 100) / 100;
    const grandTotal = Math.round((subtotal + gst - discountVal + containerVal) * 100) / 100;

    // Check for existing pending bill
    const existing = await prisma.bill.findFirst({
      where: { orderId: order.id, paymentStatus: 'Pending' }
    });

    let newBill;
    if (existing) {
      newBill = await prisma.bill.update({
        where: { id: existing.id },
        data: {
          subtotal,
          gst,
          discount: discountVal,
          containerCharge: containerVal,
          grandTotal,
          timestamp: new Date().toLocaleTimeString()
        }
      });
    } else {
      newBill = await prisma.bill.create({
        data: {
          id: `bill-${Date.now()}`,
          orderId: order.id,
          tableId: billTableId,
          subtotal,
          gst,
          discount: discountVal,
          containerCharge: containerVal,
          grandTotal,
          isParcel: parcel,
          paymentStatus: 'Pending',
          timestamp: new Date().toLocaleTimeString()
        }
      });
    }

    // Print Receipt to Counter Printer
    printBillReceipt(newBill, order);

    if (!parcel) {
      // Set Table status to Billing
      await prisma.table.update({
        where: { id: billTableId },
        data: { status: 'Billing' }
      });
    }

    // Create Notification
    const notif = await prisma.notification.create({
      data: {
        title: parcel ? 'Parcel Bill Generated' : `Bill Generated - Table ${billTableId}`,
        message: `Total: ₹${grandTotal} (Subtotal: ₹${subtotal}, GST: ₹${gst})`,
        type: 'Billing',
        timestamp: new Date().toLocaleTimeString(),
        read: false
      }
    });

    // Broadcast
    const io = req.app.get('io');
    io.emit('bill_generated', newBill);
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));
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
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const updatedBill = await prisma.bill.update({
      where: { id: req.params.id },
      data: {
        paymentStatus: 'Paid',
        paymentMethod
      }
    });

    // Update table status to Available
    const table = await prisma.table.findUnique({ where: { id: bill.tableId } });
    if (table && table.orderId === bill.orderId) {
      await prisma.table.update({
        where: { id: bill.tableId },
        data: {
          status: 'Available',
          orderId: null,
          waiterId: null,
          guests: 0
        }
      });
    }

    // Set Order to Served
    await prisma.order.update({
      where: { id: bill.orderId },
      data: { status: 'Served' }
    });

    // Broadcast
    const io = req.app.get('io');
    io.emit('bill_paid', { billId: bill.id, method: paymentMethod, tableId: bill.tableId });
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));
    io.emit('orders_sync', await prisma.order.findMany({}));

    res.json({ success: true, message: 'Checkout complete, payment processed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/:id/print
// @desc    Manually trigger thermal printing of a bill to network printer
router.post('/:id/print', protect, async (req, res) => {
  try {
    let bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) {
      bill = await prisma.bill.findFirst({ where: { orderId: req.params.id } });
    }
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }
    const order = await prisma.order.findUnique({ where: { id: bill.orderId } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    printBillReceipt(bill, order);
    res.json({ success: true, message: 'Receipt sent to network printer' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/reset-checkout/:tableId
// @desc    Reset table status from Billing back to Occupied if checkout requested by mistake
router.post('/reset-checkout/:tableId', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.tableId);
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    const newStatus = table.orderId ? 'Occupied' : 'Available';
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: { status: newStatus }
    });

    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

    res.json({ success: true, data: updatedTable, message: `Table ${tableId} status reset to ${newStatus}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/billing/cancel-request
// @desc    Request item cancellation
router.post('/cancel-request', protect, async (req, res) => {
  const { orderId, itemText, reason } = req.body;

  try {
    const newReq = await prisma.cancellationRequest.create({
      data: {
        orderId,
        itemText,
        reason,
        requestedBy: req.user.name,
        status: 'Pending',
        timestamp: new Date().toLocaleTimeString()
      }
    });

    const notif = await prisma.notification.create({
      data: {
        title: `Cancellation Request`,
        message: `Refund/removal request for "${itemText}" in Order ${orderId.substring(4,8)}. Reason: ${reason}`,
        type: 'Cancellation',
        timestamp: new Date().toLocaleTimeString(),
        read: false
      }
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
    const list = await prisma.cancellationRequest.findMany({});
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
    const cancelReq = await prisma.cancellationRequest.findUnique({ where: { id: req.params.id } });
    if (!cancelReq) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const updatedReq = await prisma.cancellationRequest.update({
      where: { id: req.params.id },
      data: { status }
    });

    if (status === 'Approved') {
      const order = await prisma.order.findUnique({ where: { id: cancelReq.orderId } });
      if (order && Array.isArray(order.items)) {
        // Remove item from order
        const updatedItems = order.items.filter(item => {
          const detail = `${item.name} (${item.portion})`;
          return detail.toLowerCase() !== cancelReq.itemText.toLowerCase() && item.name.toLowerCase() !== cancelReq.itemText.toLowerCase();
        });
        const grandTotal = updatedItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
        
        await prisma.order.update({
          where: { id: order.id },
          data: {
            items: updatedItems,
            grandTotal
          }
        });

        // Update pending bill if it exists
        const pendingBill = await prisma.bill.findFirst({
          where: { orderId: order.id, paymentStatus: 'Pending' }
        });
        if (pendingBill) {
          const newGst = Math.round(grandTotal * 0.05 * 100) / 100;
          const newGrandTotal = Math.round((grandTotal + newGst - pendingBill.discount + (pendingBill.containerCharge || 0)) * 100) / 100;
          
          const updatedBill = await prisma.bill.update({
            where: { id: pendingBill.id },
            data: {
              subtotal: grandTotal,
              gst: newGst,
              grandTotal: newGrandTotal
            }
          });
          
          const io = req.app.get('io');
          io.emit('bill_generated', updatedBill); // broadcast updated bill
        }
      }
    }

    const io = req.app.get('io');
    io.emit('cancel_status_updated', updatedReq);
    io.emit('orders_sync', await prisma.order.findMany({}));

    res.json({ success: true, message: `Request status set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
