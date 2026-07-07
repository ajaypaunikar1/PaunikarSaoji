import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  quantity: { 
    type: Number, 
    required: true, 
    default: 1 
  },
  portion: { 
    type: String, 
    required: true, 
    enum: ['Half', 'Full', 'Single'], 
    default: 'Single' 
  },
  price: { 
    type: Number, 
    required: true 
  },
  specialNotes: { 
    type: String 
  }
});

const OrderSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  tableId: { 
    type: Number, 
    required: true 
  },
  waiterId: { 
    type: String, 
    required: true 
  },
  items: [OrderItemSchema],
  status: { 
    type: String, 
    required: true, 
    enum: ['Pending', 'Preparing', 'Ready', 'Served'], 
    default: 'Pending' 
  },
  notes: { 
    type: String 
  },
  timestamp: { 
    type: String 
  },
  grandTotal: { 
    type: Number, 
    required: true 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const Order = mongoose.model('Order', OrderSchema);
export default Order;
