import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    required: true, 
    enum: ['Order', 'Kitchen', 'Billing', 'Leave', 'Cancellation'] 
  },
  timestamp: { 
    type: String, 
    required: true 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const Notification = mongoose.model('Notification', NotificationSchema);
export default Notification;
