import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  userId: { 
    type: String, 
    required: true 
  },
  userName: { 
    type: String, 
    required: true 
  },
  action: { 
    type: String, 
    required: true 
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

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
