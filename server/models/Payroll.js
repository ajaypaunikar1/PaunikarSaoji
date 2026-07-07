import mongoose from 'mongoose';

const PayrollSchema = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  employeeId: { 
    type: String, 
    required: true 
  },
  month: { 
    type: String, 
    required: true 
  },
  baseSalary: { 
    type: Number, 
    required: true 
  },
  overtimePay: { 
    type: Number, 
    required: true, 
    default: 0 
  },
  deductions: { 
    type: Number, 
    default: 0 
  },
  netSalary: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['Paid', 'Unpaid'], 
    default: 'Unpaid' 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { timestamps: true });

const Payroll = mongoose.model('Payroll', PayrollSchema);
export default Payroll;
