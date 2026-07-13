import express from 'express';
import prisma from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/tables
// @desc    Get all tables
router.get('/', async (req, res) => {
  try {
    const tables = await prisma.table.findMany({
      orderBy: { id: 'asc' }
    });
    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/:id/status
// @desc    Update table status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const table = await prisma.table.update({
      where: { id: tableId },
      data: { status: req.body.status }
    });

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
    const sourceTable = await prisma.table.findUnique({ where: { id: Number(sourceId) } });
    const destTable = await prisma.table.findUnique({ where: { id: Number(destinationId) } });

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
      const order = await prisma.order.findUnique({ where: { id: activeOrderId } });
      if (order) {
        await prisma.order.update({
          where: { id: activeOrderId },
          data: { tableId: Number(destinationId) }
        });
      }

      // Update any pending bill tableId
      const pendingBill = await prisma.bill.findFirst({
        where: { orderId: activeOrderId, paymentStatus: 'Pending' }
      });
      if (pendingBill) {
        await prisma.bill.update({
          where: { id: pendingBill.id },
          data: { tableId: Number(destinationId) }
        });
      }
    }

    // Update target table
    await prisma.table.update({
      where: { id: Number(destinationId) },
      data: {
        status: 'Occupied',
        orderId: activeOrderId,
        waiterId: sourceTable.waiterId,
        guests: sourceTable.guests
      }
    });

    // Free up source table
    await prisma.table.update({
      where: { id: Number(sourceId) },
      data: {
        status: 'Cleaning',
        orderId: null,
        waiterId: null,
        guests: 0
      }
    });

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));
    io.emit('orders_sync', await prisma.order.findMany({}));

    res.json({ success: true, message: 'Table transferred successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/:id/waiter
// @desc    Assign waiter to table
router.put('/:id/waiter', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    const table = await prisma.table.update({
      where: { id: tableId },
      data: { waiterId: req.body.waiterId || null }
    });

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get zones and mergedGroups
router.get('/zones', async (req, res) => {
  try {
    let settings = await prisma.settings.findUnique({ where: { id: 'settings-main' } });
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          id: 'settings-main',
          restaurantName: 'Paunikar Saoji Family Restaurant',
          address: 'Nagpur, Maharashtra',
          gstNumber: '27AAAAA1111A1Z1',
          upiId: 'restaurant@upi',
          zones: ['A', 'B', 'C'],
          mergedGroups: []
        }
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
    let settings = await prisma.settings.findUnique({ where: { id: 'settings-main' } });
    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: 'settings-main', restaurantName: 'Paunikar', address: 'Nagpur', gstNumber: '1', upiId: '1', zones: [zone] }
      });
    } else {
      const currentZones = Array.isArray(settings.zones) ? settings.zones : [];
      if (!currentZones.includes(zone)) {
        settings = await prisma.settings.update({
          where: { id: 'settings-main' },
          data: { zones: [...currentZones, zone] }
        });
      }
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
    let settings = await prisma.settings.findUnique({ where: { id: 'settings-main' } });
    if (settings) {
      const currentZones = Array.isArray(settings.zones) ? settings.zones : [];
      const updatedZones = currentZones.filter(z => z !== zone);
      settings = await prisma.settings.update({
        where: { id: 'settings-main' },
        data: { zones: updatedZones }
      });
    }
    // Update tables in deleted zone to a default zone or first available zone
    const defaultZone = settings && settings.zones.length > 0 ? settings.zones[0] : 'A';
    await prisma.table.updateMany({
      where: { zone },
      data: { zone: defaultZone }
    });

    // Broadcast table updates
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

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
    const maxTable = await prisma.table.findFirst({
      orderBy: { id: 'desc' }
    });
    const nextId = maxTable ? maxTable.id + 1 : 1;

    const newTable = await prisma.table.create({
      data: {
        id: nextId,
        status: 'Available',
        zone: zone || 'A',
        guests: 0,
        x: 10 + Math.random() * 40,
        y: 10 + Math.random() * 40
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

    res.status(201).json({ success: true, data: newTable });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete table
router.delete('/:id', protect, async (req, res) => {
  try {
    const tableId = Number(req.params.id);
    await prisma.table.delete({ where: { id: tableId } });

    // Also remove from mergedGroups in Settings
    let settings = await prisma.settings.findUnique({ where: { id: 'settings-main' } });
    if (settings && Array.isArray(settings.mergedGroups)) {
      const updatedGroups = settings.mergedGroups.map((group) => {
        if (Array.isArray(group)) {
          return group.filter(id => id !== tableId);
        }
        return [];
      }).filter(group => group.length > 1);

      await prisma.settings.update({
        where: { id: 'settings-main' },
        data: { mergedGroups: updatedGroups }
      });
    }

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

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
    
    const data = {};
    if (zone !== undefined) data.zone = zone;
    if (x !== undefined) data.x = x;
    if (y !== undefined) data.y = y;

    const table = await prisma.table.update({
      where: { id: tableId },
      data
    });

    // Broadcast update
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save merge groups from backend
router.post('/merge', protect, async (req, res) => {
  try {
    const { sourceIds, destinationId } = req.body;
    let settings = await prisma.settings.findUnique({ where: { id: 'settings-main' } });
    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: 'settings-main', restaurantName: 'Paunikar', address: 'Nagpur', gstNumber: '1', upiId: '1', zones: ['A', 'B', 'C'], mergedGroups: [] }
      });
    }
    
    const currentMerged = Array.isArray(settings.mergedGroups) ? settings.mergedGroups : [];
    // Remove these IDs from any existing groups
    let newMergedGroups = currentMerged.map(group => {
      if (Array.isArray(group)) {
        return group.filter(id => id !== destinationId && !sourceIds.includes(id));
      }
      return [];
    }).filter(group => group.length > 1);

    // Add the new group
    newMergedGroups.push([...sourceIds, destinationId]);
    
    const updated = await prisma.settings.update({
      where: { id: 'settings-main' },
      data: { mergedGroups: newMergedGroups }
    });

    res.json({ success: true, mergedGroups: updated.mergedGroups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Unmerge table group
router.post('/unmerge', protect, async (req, res) => {
  try {
    const { tableId } = req.body;
    let settings = await prisma.settings.findUnique({ where: { id: 'settings-main' } });
    let updatedGroups = [];
    if (settings && Array.isArray(settings.mergedGroups)) {
      updatedGroups = settings.mergedGroups.filter(group => {
        if (Array.isArray(group)) {
          return !group.includes(tableId);
        }
        return true;
      });
      settings = await prisma.settings.update({
        where: { id: 'settings-main' },
        data: { mergedGroups: updatedGroups }
      });
    }
    
    // Broadcast update to sync client
    const io = req.app.get('io');
    io.emit('tables_sync', await prisma.table.findMany({ orderBy: { id: 'asc' } }));

    res.json({ success: true, mergedGroups: updatedGroups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
