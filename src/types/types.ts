export type UserRole = 'SuperAdmin' | 'Manager' | 'Cashier' | 'Chef' | 'Waiter';
export type TableStatus = 'Available' | 'Occupied' | 'Reserved' | 'Cleaning' | 'Billing';
export type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Served';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';
export type PaymentMethod = 'Cash' | 'Card' | 'UPI';
export type PayrollStatus = 'Paid' | 'Unpaid';
export type Zone = string;
export type PortionType = 'Half' | 'Full' | 'Single';

export interface MenuItemVariant {
  name: string;
  price: number;
  prepTime: number; // in minutes
}

export interface MenuItem {
  id: string;
  name: string;
  category: 'Vegetarian' | 'Egg Curry' | 'Breads' | 'Rice' | 'Papad' | 'Starters' | 'Curries' | 'Handi Dishes';
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
  quantity: number;
  portion: PortionType;
  price: number;
  specialNotes?: string;
}

export interface Order {
  id: string;
  tableId: number;
  waiterId: string;
  items: OrderItem[];
  status: OrderStatus;
  notes?: string;
  timestamp: string;
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
  gst: number; // 5%
  discount: number;
  grandTotal: number;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'Pending' | 'Paid';
  timestamp: string;
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
