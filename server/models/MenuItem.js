import mongoose from 'mongoose';

const MenuItemVariantSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  prepTime: { 
    type: Number, 
    required: true 
  }
});

const MenuItemSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true, 
    enum: ['Vegetarian', 'Egg Curry', 'Breads', 'Rice', 'Papad', 'Starters', 'Curries', 'Handi Dishes'] 
  },
  portionMode: { 
    type: String, 
    required: true, 
    enum: ['Single', 'Variant'], 
    default: 'Single' 
  },
  price: { 
    type: Number, 
    default: 0 
  },
  variants: [MenuItemVariantSchema],
  prepTime: { 
    type: Number, 
    default: 10 
  },
  isAvailable: { 
    type: Boolean, 
    default: true 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const MenuItem = mongoose.model('MenuItem', MenuItemSchema);
export default MenuItem;
