import express from 'express';
import { MenuItem } from '../models/index.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/menu
// @desc    Get all menu items
router.get('/', async (req, res) => {
  try {
    const menu = await MenuItem.find();
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
    const newItem = await MenuItem.create({
      _id: `m-${Date.now()}`,
      name,
      category,
      portionMode,
      price: Number(price) || 0,
      variants: variants || [],
      prepTime: Number(prepTime) || 10,
      isAvailable: isAvailable !== undefined ? isAvailable : true
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
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const { name, category, portionMode, price, variants, prepTime, isAvailable } = req.body;

    if (name) item.name = name;
    if (category) item.category = category;
    if (portionMode) item.portionMode = portionMode;
    if (price !== undefined) item.price = Number(price);
    if (variants) item.variants = variants;
    if (prepTime !== undefined) item.prepTime = Number(prepTime);
    if (isAvailable !== undefined) item.isAvailable = isAvailable;
    await item.save();

    const io = req.app.get('io');
    io.emit('menu_changed', item);

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/menu/:id
// @desc    Delete menu item (Admin/Manager)
router.delete('/:id', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    await item.deleteOne();

    const io = req.app.get('io');
    // Dedicated event: clients remove the item. Do NOT emit menu_changed here
    // (its handler upserts, which would resurrect the deleted item).
    io.emit('menu_deleted', { id: item.id });

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
