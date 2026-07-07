import mongoose from 'mongoose';

const LeaveRequestSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  employeeId: { 
    type: String, 
    required: true 
  },
  startDate: { 
    type: String, 
    required: true 
  },
  endDate: { 
    type: String, 
    required: true 
  },
  reason: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['Pending', 'Approved', 'Rejected'], 
    default: 'Pending' 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const LeaveRequest = mongoose.model('LeaveRequest', LeaveRequestSchema);
export default LeaveRequest;
