import express from 'express';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import Bill from '../models/Bill.js';
import Settings from '../models/Settings.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/tables
// @desc    Get all tables
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ id: 1 });
    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/:id/status
// @desc    Update table status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const table = await Table.findOne({ id: req.params.id });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    table.status = req.body.status;
    await table.save();

    // Broadcast change
    const io = req.app.get('io');
    io.emit('table_status_changed', { id: table.id, status: table.status });

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/tables/transfer
// @desc    Transfer Table A orders to Table B
router.post('/transfer', protect, async (req, res) => {
  const { sourceId, destinationId } = req.body;

  try {
    const sourceTable = await Table.findOne({ id: sourceId });
    const destTable = await Table.findOne({ id: destinationId });

    if (!sourceTable || !destTable) {
      return res.status(404).json({ success: false, message: 'Tables not found' });
    }

    if (sourceTable.status === 'Available') {
      return res.status(400).json({ success: false, message: 'Source table is empty' });
    }

    if (destTable.status !== 'Available') {
      return res.status(400).json({ success: false, message: 'Destination table is occupied' });
    }

    // Move orders
    const activeOrderId = sourceTable.orderId;
    if (activeOrderId) {
      const order = await Order.findOne({ id: activeOrderId });
      if (order) {
        order.tableId = destinationId;
        await order.save();
      }

      // Update any pending bill tableId
      const pendingBill = await Bill.findOne({ orderId: activeOrderId, paymentStatus: 'Pending' });
      if (pendingBill) {
        pendingBill.tableId = destinationId;
        await pendingBill.save();
      }
    }

    // Update target table
    destTable.status = 'Occupied';
    destTable.orderId = activeOrderId;
    destTable.waiterId = sourceTable.waiterId;
    destTable.guests = sourceTable.guests;
    await destTable.save();

    // Free up source table
    sourceTable.status = 'Cleaning';
    sourceTable.orderId = undefined;
    sourceTable.waiterId = undefined;
    sourceTable.guests = 0;
    await sourceTable.save();

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));
    io.emit('orders_sync', await Order.find({}));

    res.json({ success: true, message: 'Table transferred successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/:id/waiter
// @desc    Assign waiter to table
router.put('/:id/waiter', protect, async (req, res) => {
  try {
    const table = await Table.findOne({ id: req.params.id });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    table.waiterId = req.body.waiterId;
    await table.save();

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get zones and mergedGroups
router.get('/zones', async (req, res) => {
  try {
    let settings = await Settings.findOne({ id: 'settings-main' });
    if (!settings) {
      settings = await Settings.create({
        id: 'settings-main',
        restaurantName: 'Paunikar Saoji Family Restaurant',
        address: 'Nagpur, Maharashtra',
        gstNumber: '27AAAAA1111A1Z1',
        upiId: 'restaurant@upi',
        zones: ['A', 'B', 'C'],
        mergedGroups: []
      });
    }
    res.json({ success: true, zones: settings.zones, mergedGroups: settings.mergedGroups || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add zone
router.post('/zones', protect, async (req, res) => {
  try {
    const { zone } = req.body;
    if (!zone) return res.status(400).json({ success: false, message: 'Zone name is required' });
    let settings = await Settings.findOne({ id: 'settings-main' });
    if (!settings) {
      settings = new Settings({ id: 'settings-main', restaurantName: 'Paunikar', address: 'Nagpur', gstNumber: '1', upiId: '1' });
    }
    if (!settings.zones.includes(zone)) {
      settings.zones.push(zone);
      await settings.save();
    }
    res.json({ success: true, zones: settings.zones });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete zone
router.delete('/zones/:zone', protect, async (req, res) => {
  try {
    const { zone } = req.params;
    let settings = await Settings.findOne({ id: 'settings-main' });
    if (settings) {
      settings.zones = settings.zones.filter(z => z !== zone);
      await settings.save();
    }
    // Update tables in deleted zone to a default zone or first available zone
    const defaultZone = settings && settings.zones.length > 0 ? settings.zones[0] : 'A';
    await Table.updateMany({ zone }, { zone: defaultZone });

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));

    res.json({ success: true, zones: settings ? settings.zones : [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add table
router.post('/', protect, async (req, res) => {
  try {
    const { zone } = req.body;
    // Find next available ID
    const maxTable = await Table.findOne().sort({ id: -1 });
    const nextId = maxTable ? maxTable.id + 1 : 1;

    const newTable = new Table({
      id: nextId,
      status: 'Available',
      zone: zone || 'A',
      guests: 0,
      x: 10 + Math.random() * 40,
      y: 10 + Math.random() * 40
    });

    await newTable.save();

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));

    res.status(201).json({ success: true, data: newTable });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete table
router.delete('/:id', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const table = await Table.findOne({ id: tableId });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    await Table.deleteOne({ id: tableId });

    // Also remove from mergedGroups in Settings
    let settings = await Settings.findOne({ id: 'settings-main' });
    if (settings && settings.mergedGroups) {
      settings.mergedGroups = settings.mergedGroups.map(group => group.filter(id => id !== tableId)).filter(group => group.length > 1);
      settings.markModified('mergedGroups');
      await settings.save();
    }

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));

    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update table layout (x, y, zone)
router.put('/:id/layout', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const { zone, x, y } = req.body;
    const table = await Table.findOne({ id: tableId });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    if (zone !== undefined) table.zone = zone;
    if (x !== undefined) table.x = x;
    if (y !== undefined) table.y = y;

    await table.save();

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save merge groups from backend
router.post('/merge', protect, async (req, res) => {
  try {
    const { sourceIds, destinationId } = req.body;
    let settings = await Settings.findOne({ id: 'settings-main' });
    if (!settings) {
      settings = new Settings({ id: 'settings-main', restaurantName: 'Paunikar', address: 'Nagpur', gstNumber: '1', upiId: '1' });
    }
    
    // Remove these IDs from any existing groups
    let newMergedGroups = (settings.mergedGroups || []).map(group => 
      group.filter(id => id !== destinationId && !sourceIds.includes(id))
    ).filter(group => group.length > 1);

    // Add the new group
    newMergedGroups.push([...sourceIds, destinationId]);
    settings.mergedGroups = newMergedGroups;
    settings.markModified('mergedGroups');
    await settings.save();

    res.json({ success: true, mergedGroups: settings.mergedGroups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Unmerge table group
router.post('/unmerge', protect, async (req, res) => {
  try {
    const { tableId } = req.body;
    let settings = await Settings.findOne({ id: 'settings-main' });
    if (settings && settings.mergedGroups) {
      settings.mergedGroups = settings.mergedGroups.filter(group => !group.includes(tableId));
      settings.markModified('mergedGroups');
      await settings.save();
    }
    
    // Broadcast update to sync client
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find({}).sort({ id: 1 }));

    res.json({ success: true, mergedGroups: settings ? settings.mergedGroups : [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
