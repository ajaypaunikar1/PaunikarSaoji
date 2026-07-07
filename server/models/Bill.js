import mongoose from 'mongoose';

const BillSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  orderId: { 
    type: String, 
    required: true 
  },
  tableId: { 
    type: Number, 
    required: true 
  },
  subtotal: { 
    type: Number, 
    required: true 
  },
  gst: { 
    type: Number, 
    required: true 
  },
  discount: { 
    type: Number, 
    default: 0 
  },
  grandTotal: { 
    type: Number, 
    required: true 
  },
  paymentMethod: { 
    type: String, 
    enum: ['Cash', 'Card', 'UPI'] 
  },
  paymentStatus: { 
    type: String, 
    required: true, 
    enum: ['Pending', 'Paid'], 
    default: 'Pending' 
  },
  timestamp: { 
    type: String, 
    required: true 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const Bill = mongoose.model('Bill', BillSchema);
export default Bill;
