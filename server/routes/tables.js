import express from 'express';
import { Table, Order, Bill, Settings } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Helper: settings singleton (creates default doc on first access)
const getSettings = async () => {
  let settings = await Settings.findById('settings-main');
  if (!settings) {
    settings = await Settings.create({ _id: 'settings-main' });
  }
  return settings;
};

// @route   GET /api/tables
// @desc    Get all tables
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find().sort({ _id: 1 });
    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/:id/status
// @desc    Update table status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const table = await Table.findByIdAndUpdate(
      Number(req.params.id),
      { status: req.body.status },
      { new: true }
    );

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
    const sourceTable = await Table.findById(Number(sourceId));
    const destTable = await Table.findById(Number(destinationId));

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
      const order = await Order.findById(activeOrderId);
      if (order) {
        order.tableId = Number(destinationId);
        await order.save();
      }

      // Update any pending bill tableId
      const pendingBill = await Bill.findOne({
        orderId: activeOrderId,
        paymentStatus: 'Pending'
      });
      if (pendingBill) {
        pendingBill.tableId = Number(destinationId);
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
    sourceTable.orderId = null;
    sourceTable.waiterId = null;
    sourceTable.guests = 0;
    await sourceTable.save();

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));
    io.emit('orders_sync', await Order.find());

    res.json({ success: true, message: 'Table transferred successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/:id/waiter
// @desc    Assign waiter to table
router.put('/:id/waiter', protect, async (req, res) => {
  try {
    const table = await Table.findByIdAndUpdate(
      Number(req.params.id),
      { waiterId: req.body.waiterId || null },
      { new: true }
    );

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get zones and mergedGroups
router.get('/zones', async (req, res) => {
  try {
    const settings = await getSettings();
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
    const settings = await getSettings();
    const currentZones = Array.isArray(settings.zones) ? settings.zones : [];
    if (!currentZones.includes(zone)) {
      settings.zones = [...currentZones, zone];
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
    const settings = await getSettings();
    const currentZones = Array.isArray(settings.zones) ? settings.zones : [];
    settings.zones = currentZones.filter(z => z !== zone);
    await settings.save();

    // Update tables in deleted zone to a default zone or first available zone
    const defaultZone = settings.zones.length > 0 ? settings.zones[0] : 'A';
    await Table.updateMany({ zone }, { $set: { zone: defaultZone } });

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, zones: settings.zones });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add table
router.post('/', protect, async (req, res) => {
  try {
    const { zone } = req.body;
    // Find next available ID
    const maxTable = await Table.findOne().sort({ _id: -1 });
    const nextId = maxTable ? maxTable._id + 1 : 1;

    const newTable = await Table.create({
      _id: nextId,
      status: 'Available',
      zone: zone || 'A',
      guests: 0,
      x: 10 + Math.random() * 40,
      y: 10 + Math.random() * 40
    });

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.status(201).json({ success: true, data: newTable });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete table
router.delete('/:id', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    await Table.findByIdAndDelete(tableId);

    // Also remove from mergedGroups in Settings
    const settings = await Settings.findById('settings-main');
    if (settings && Array.isArray(settings.mergedGroups)) {
      settings.mergedGroups = settings.mergedGroups
        .map((group) => {
          if (Array.isArray(group)) {
            return group.filter(id => id !== tableId);
          }
          return [];
        })
        .filter(group => group.length > 1);
      settings.markModified('mergedGroups');
      await settings.save();
    }

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update table layout (x, y, zone)
router.put('/:id/layout', protect, async (req, res) => {
  try {
    const { zone, x, y } = req.body;

    const data = {};
    if (zone !== undefined) data.zone = zone;
    if (x !== undefined) data.x = x;
    if (y !== undefined) data.y = y;

    const table = await Table.findByIdAndUpdate(Number(req.params.id), data, { new: true });

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save merge groups from backend
router.post('/merge', protect, async (req, res) => {
  try {
    const { sourceIds, destinationId } = req.body;
    const settings = await getSettings();

    const currentMerged = Array.isArray(settings.mergedGroups) ? settings.mergedGroups : [];
    // Remove these IDs from any existing groups
    let newMergedGroups = currentMerged
      .map(group => {
        if (Array.isArray(group)) {
          return group.filter(id => id !== destinationId && !sourceIds.includes(id));
        }
        return [];
      })
      .filter(group => group.length > 1);

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
    const settings = await Settings.findById('settings-main');
    let updatedGroups = [];
    if (settings && Array.isArray(settings.mergedGroups)) {
      updatedGroups = settings.mergedGroups.filter(group => {
        if (Array.isArray(group)) {
          return !group.includes(tableId);
        }
        return true;
      });
      settings.mergedGroups = updatedGroups;
      settings.markModified('mergedGroups');
      await settings.save();
    }

    // Broadcast update to sync client
    const io = req.app.get('io');
    io.emit('tables_sync', await Table.find().sort({ _id: 1 }));

    res.json({ success: true, mergedGroups: updatedGroups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
