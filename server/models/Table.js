import mongoose from 'mongoose';

const TableSchema = new mongoose.Schema({
  id: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  guests: { 
    type: Number, 
    default: 0 
  },
  waiterId: { 
    type: String 
  },
  orderId: { 
    type: String 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['Available', 'Occupied', 'Reserved', 'Cleaning', 'Billing'], 
    default: 'Available' 
  },
  zone: { 
    type: String, 
    required: true 
  },
  x: {
    type: Number,
    default: 0
  },
  y: {
    type: Number,
    default: 0
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const Table = mongoose.model('Table', TableSchema);
export default Table;
