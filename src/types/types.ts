export type UserRole = 'SuperAdmin' | 'Manager' | 'Cashier' | 'Chef' | 'Waiter';
export type TableStatus = 'Available' | 'Occupied' | 'Reserved' | 'Cleaning' | 'Billing';
export type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Served';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';
export type PaymentMethod = 'Cash' | 'Card' | 'UPI';
export type PayrollStatus = 'Paid' | 'Unpaid';
export type Zone = string;
/**
 * Portion / variant label carried on order lines.
 * Legacy values are 'Half' | 'Full' | 'Single', but MenuManagement lets
 * admins define ARBITRARY variant names (e.g. 'Quarter', 'Jumbo'), so this is
 * intentionally a plain string. 'Single' means the item has no variants and
 * uses MenuItem.price directly.
 */
export type PortionType = string;
export type SpiceLevel = 'normal' | 'medium' | 'spicy';

export interface MenuItemVariant {
  name: string;
  price: number;
  prepTime: number; // in minutes
}

export interface MenuItem {
  id: string;
  name: string;
  category: string; // defaults + admin-created categories (see utils/categories.ts)
  portionMode: 'Single' | 'Variant';
  price: number; // For single portion
  variants: MenuItemVariant[]; // For variant mode
  prepTime: number; // For single portion
  isAvailable: boolean;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  status: 'Active' | 'Disabled';
  zone: string;
  salary: number;
  performance: number; // rating 1 to 5
  overtimeHours: number;
  shiftStart?: string; // HH:MM:SS assigned shift start time
  shiftEnd?: string;   // HH:MM:SS assigned shift end time
  password?: string;
  isFirstLogin?: boolean;
}

export interface Table {
  id: number;
  guests: number;
  waiterId?: string;
  orderId?: string;
  status: TableStatus;
  zone: string;
  x?: number;
  y?: number;
}

export interface OrderItem {
  id: string; // matches menuItem.id
  name: string;
  category?: string; // menu category, shown on billing/KDS/order views
  quantity: number;
  portion: PortionType;
  price: number;
  specialNotes?: string;
  status?: OrderStatus;
  isParcel?: boolean;
  spiceLevel?: SpiceLevel;
  printedQty?: number; // qty already printed on KOT ("ticked"); only the delta gets printed
}

export interface Order {
  id: string;
  tableId: number; // 0 for parcel/takeaway orders
  waiterId: string;
  items: OrderItem[];
  status: OrderStatus;
  notes?: string;
  timestamp: string;
  date?: string; // DD/MM/YYYY
  isParcel?: boolean; // takeaway/parcel order (no table)
  customerName?: string;
  grandTotal: number;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:MM:SS
  clockOut?: string; // HH:MM:SS
  status: 'Present' | 'Absent' | 'Late';
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
}

export interface Payroll {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM (e.g. "2026-06")
  baseSalary: number;
  overtimePay: number;
  deductions: number;
  netSalary: number;
  status: PayrollStatus;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'Order' | 'Kitchen' | 'Billing' | 'Leave' | 'Cancellation';
  timestamp: string;
  read: boolean;
}

export interface Bill {
  id: string;
  orderId: string;
  tableId: number;
  subtotal: number;
  gst: number;
  gstPct?: number; // GST percentage used
  discount: number;
  discountPct?: number; // discount percentage used
  containerCharge?: number; // parcel container charge (flat ₹10 per order)
  grandTotal: number;
  isParcel?: boolean;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'Pending' | 'Paid';
  timestamp: string;
  date?: string;
  phone?: string;
}

export interface CancellationRequest {
  id: string;
  orderId: string;
  itemText: string; // description of item
  reason: string;
  requestedBy: string; // user name/id
  status: 'Pending' | 'Approved' | 'Rejected';
  timestamp: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}
