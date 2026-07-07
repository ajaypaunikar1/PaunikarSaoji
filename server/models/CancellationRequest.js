import mongoose from 'mongoose';

const CancellationRequestSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  orderId: { 
    type: String, 
    required: true 
  },
  itemText: { 
    type: String, 
    required: true 
  },
  reason: { 
    type: String, 
    required: true 
  },
  requestedBy: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['Pending', 'Approved', 'Rejected'], 
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

const CancellationRequest = mongoose.model('CancellationRequest', CancellationRequestSchema);
export default CancellationRequest;
