import express from 'express';
import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/menu
// @desc    Get all menu items
router.get('/', async (req, res) => {
  try {
    const menu = await MenuItem.find({});
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
    const newItem = new MenuItem({
      id: `m-${Date.now()}`,
      name,
      category,
      portionMode,
      price,
      variants,
      prepTime,
      isAvailable
    });

    await newItem.save();

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
    let item = await MenuItem.findOne({ id: req.params.id });
    if (!item && mongoose.isValidObjectId(req.params.id)) {
      item = await MenuItem.findById(req.params.id);
    }
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const { name, category, portionMode, price, variants, prepTime, isAvailable } = req.body;
    if (name) item.name = name;
    if (category) item.category = category;
    if (portionMode) item.portionMode = portionMode;
    if (price !== undefined) item.price = price;
    if (variants) item.variants = variants;
    if (prepTime !== undefined) item.prepTime = prepTime;
    if (isAvailable !== undefined) item.isAvailable = isAvailable;

    await item.save();

    const io = req.app.get('io');
    io.emit('menu_changed', item);

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
