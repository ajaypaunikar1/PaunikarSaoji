import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  restaurantName: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  gstNumber: {
    type: String,
    required: true
  },
  upiId: {
    type: String,
    required: true,
    default: 'restaurant@upi'
  },
  zones: {
    type: [String],
    default: ['A', 'B', 'C']
  },
  mergedGroups: {
    type: mongoose.Schema.Types.Mixed,
    default: []
  },
  branchId: {
    type: String,
    default: 'branch-main'
  },
  kitchenPrinterIp: {
    type: String,
    default: '127.0.0.1'
  },
  billingPrinterIp: {
    type: String,
    default: '127.0.0.1'
  }
}, { timestamps: true });

const Settings = mongoose.model('Settings', SettingsSchema);
export default Settings;
