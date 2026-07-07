import mongoose from 'mongoose';

const InventorySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 0
  },
  reorderLevel: {
    type: Number,
    required: true,
    default: 10
  },
  unit: {
    type: String,
    required: true,
    default: 'kg'
  },
  branchId: {
    type: String,
    default: 'branch-main'
  }
}, { timestamps: true });

const Inventory = mongoose.model('Inventory', InventorySchema);
export default Inventory;
