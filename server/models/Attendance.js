import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  employeeId: { 
    type: String, 
    required: true 
  },
  date: { 
    type: String, 
    required: true 
  },
  clockIn: { 
    type: String, 
    required: true 
  },
  clockOut: { 
    type: String 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['Present', 'Absent', 'Late'], 
    default: 'Present' 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const Attendance = mongoose.model('Attendance', AttendanceSchema);
export default Attendance;
