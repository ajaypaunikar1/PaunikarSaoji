import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    required: true, 
    enum: ['SuperAdmin', 'Manager', 'Cashier', 'Chef', 'Waiter'] 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['Active', 'Disabled'], 
    default: 'Active' 
  },
  zone: { 
    type: String, 
    required: true, 
    default: 'All' 
  },
  salary: { 
    type: Number, 
    required: true 
  },
  performance: { 
    type: Number, 
    default: 5 
  },
  overtimeHours: { 
    type: Number, 
    default: 0 
  },
  branchId: { 
    type: String, 
    default: 'branch-main' 
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hashing middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);
export default User;
