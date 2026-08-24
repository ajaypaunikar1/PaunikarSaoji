import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const { Schema } = mongoose;

const uuid = () => randomUUID();

/**
 * Mongoose models - 1:1 replacement for the old Prisma schema.
 *
 * Convention: the business id (e.g. "ord-...", "bill-...", table number)
 * is stored AS the MongoDB _id field. Mongoose exposes every document's
 * _id through the built-in `id` virtual, so JSON responses keep the same
 * `id` property the frontend has always consumed.
 */

const userSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    status: { type: String, default: 'Active' },
    zone: { type: String, default: 'All' },
    salary: { type: Number, default: 0 },
    performance: { type: Number, default: 5 },
    overtimeHours: { type: Number, default: 0 },
    shiftStart: { type: String, default: '09:00:00' },
    shiftEnd: { type: String, default: '17:00:00' },
    isFirstLogin: { type: Boolean, default: true },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'User' }
);

const tableSchema = new Schema(
  {
    _id: { type: Number, required: true },
    guests: { type: Number, default: 0 },
    waiterId: { type: String, default: null },
    orderId: { type: String, default: null },
    status: { type: String, default: 'Available' },
    zone: { type: String, default: 'A' },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    branchId: { type: String, default: 'branch-main' }
  },
  {
    timestamps: true,
    collection: 'Table',
    // Table ids are numbers (T-1 .. T-N); the built-in `id` virtual would
    // serialize them as strings, breaking numeric comparisons on the client.
    toJSON: {
      transform: (doc, ret) => {
        if (typeof ret._id === 'number') ret.id = ret._id;
        return ret;
      }
    }
  }
);

const menuItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    portionMode: { type: String, default: 'Single' },
    price: { type: Number, default: 0 },
    variants: { type: Schema.Types.Mixed, default: [] },
    prepTime: { type: Number, default: 10 },
    isAvailable: { type: Boolean, default: true },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'MenuItem' }
);

const orderSchema = new Schema(
  {
    _id: { type: String, required: true },
    tableId: { type: Number, required: true },
    waiterId: { type: String, required: true },
    items: { type: Schema.Types.Mixed, default: [] },
    status: { type: String, default: 'Pending' },
    notes: { type: String, default: null },
    timestamp: { type: String, default: null },
    date: { type: String, default: null },
    isParcel: { type: Boolean, default: false },
    customerName: { type: String, default: null },
    grandTotal: { type: Number, default: 0 },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'Order' }
);

const attendanceSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    employeeId: { type: String, required: true },
    date: { type: String, required: true },
    clockIn: { type: String, default: '' },
    clockOut: { type: String, default: null },
    status: { type: String, default: 'Present' },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'Attendance' }
);

const leaveRequestSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    employeeId: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    reason: { type: String, default: '' },
    status: { type: String, default: 'Pending' },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'LeaveRequest' }
);

const payrollSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    employeeId: { type: String, required: true },
    month: { type: String, required: true },
    baseSalary: { type: Number, default: 0 },
    overtimePay: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    status: { type: String, default: 'Unpaid' },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'Payroll' }
);

const notificationSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    type: { type: String, default: 'General' },
    timestamp: { type: String, default: '' },
    read: { type: Boolean, default: false },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'Notification' }
);

const billSchema = new Schema(
  {
    _id: { type: String, required: true },
    orderId: { type: String, required: true },
    tableId: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    containerCharge: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    isParcel: { type: Boolean, default: false },
    paymentMethod: { type: String, default: null },
    paymentStatus: { type: String, default: 'Pending' },
    timestamp: { type: String, default: '' },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'Bill' }
);

const cancellationRequestSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    orderId: { type: String, required: true },
    itemText: { type: String, default: '' },
    reason: { type: String, default: '' },
    requestedBy: { type: String, default: '' },
    status: { type: String, default: 'Pending' },
    timestamp: { type: String, default: '' },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'CancellationRequest' }
);

const auditLogSchema = new Schema(
  {
    _id: { type: String, default: uuid },
    userId: { type: String, default: '' },
    userName: { type: String, default: '' },
    action: { type: String, default: '' },
    timestamp: { type: String, default: '' },
    branchId: { type: String, default: 'branch-main' }
  },
  { timestamps: true, collection: 'AuditLog' }
);

const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'settings-main' },
    restaurantName: { type: String, default: 'Paunikar Saoji Restaurant' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    upiId: { type: String, default: 'restaurant@upi' },
    zones: { type: Schema.Types.Mixed, default: ['A', 'B', 'C'] },
    mergedGroups: { type: Schema.Types.Mixed, default: [] },
    cancellationApproval: { type: Boolean, default: false },
    rbac: { type: Schema.Types.Mixed, default: {} },
    branchId: { type: String, default: 'branch-main' },
    kitchenPrinterIp: { type: String, default: '127.0.0.1' },
    billingPrinterIp: { type: String, default: '127.0.0.1' }
  },
  { timestamps: true, collection: 'Settings' }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Table = mongoose.models.Table || mongoose.model('Table', tableSchema);
export const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);
export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
export const LeaveRequest = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', leaveRequestSchema);
export const Payroll = mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema);
export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const Bill = mongoose.models.Bill || mongoose.model('Bill', billSchema);
export const CancellationRequest =
  mongoose.models.CancellationRequest || mongoose.model('CancellationRequest', cancellationRequestSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

export default {
  User,
  Table,
  MenuItem,
  Order,
  Attendance,
  LeaveRequest,
  Payroll,
  Notification,
  Bill,
  CancellationRequest,
  AuditLog,
  Settings
};
