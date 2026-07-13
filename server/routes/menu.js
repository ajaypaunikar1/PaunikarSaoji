import express from 'express';
import prisma from '../config/db.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/menu
// @desc    Get all menu items
router.get('/', async (req, res) => {
  try {
    const menu = await prisma.menuItem.findMany({});
    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/menu
// @desc    Add new menu item (Admin/Manager)
router.post('/', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  const { name, category, portionMode, price, variants, prepTime, isAvailable } = req.body;

  try {
    const newItem = await prisma.menuItem.create({
      data: {
        id: `m-${Date.now()}`,
        name,
        category,
        portionMode,
        price: Number(price) || 0,
        variants: variants || [],
        prepTime: Number(prepTime) || 10,
        isAvailable: isAvailable !== undefined ? isAvailable : true
      }
    });

    const io = req.app.get('io');
    io.emit('menu_changed', newItem);

    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/menu/:id
// @desc    Update menu item (Admin/Manager)
router.put('/:id', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  try {
    const item = await prisma.menuItem.findUnique({
      where: { id: req.params.id }
    });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const { name, category, portionMode, price, variants, prepTime, isAvailable } = req.body;

    const data = {};
    if (name) data.name = name;
    if (category) data.category = category;
    if (portionMode) data.portionMode = portionMode;
    if (price !== undefined) data.price = Number(price);
    if (variants) data.variants = variants;
    if (prepTime !== undefined) data.prepTime = Number(prepTime);
    if (isAvailable !== undefined) data.isAvailable = isAvailable;

    const updated = await prisma.menuItem.update({
      where: { id: req.params.id },
      data
    });

    const io = req.app.get('io');
    io.emit('menu_changed', updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
