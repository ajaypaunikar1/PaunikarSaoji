import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { 
  User, Table, Order, MenuItem, Attendance, LeaveRequest, 
  Payroll, Notification, Bill, CancellationRequest, AuditLog, 
  UserRole, PortionType, PaymentMethod, TableStatus, Zone, OrderItem
} from '../types/types';
import { toast } from 'sonner';
import { io } from 'socket.io-client';

let notificationAudio: HTMLAudioElement | null = null;
if (typeof window !== 'undefined') {
  notificationAudio = new Audio('/notification.mpeg');
}

const playNotificationSound = (userRole?: string) => {
  try {
    // Sound should ONLY play in Admin (SuperAdmin / Admin role), NOT Waiter devices
    if (userRole === 'Waiter') return;

    if (!userRole && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('rms_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.role === 'Waiter') return;
        } catch {}
      }
    }

    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      const playPromise = notificationAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn("Audio play failed:", e);
        });
      }
    }
  } catch (e) {
    console.warn("Audio initialization failed:", e);
  }
};

interface AppContextType {
  currentUser: User | null;
  users: User[];
  tables: Table[];
  orders: Order[];
  menuItems: MenuItem[];
  attendance: Attendance[];
  leaves: LeaveRequest[];
  payroll: Payroll[];
  notifications: Notification[];
  bills: Bill[];
  cancellationRequests: CancellationRequest[];
  auditLogs: AuditLog[];
  language: 'en' | 'mr';
  mergedGroups: number[][];
  zones: string[];
  login: (username: string, password?: string, role?: UserRole) => boolean;
  logout: () => void;
  addOrder: (tableId: number, items: Omit<Order['items'][0], 'id'>[], notes?: string) => Order;
  updateOrder: (orderId: string, updates: Partial<Order>) => void;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  mergeTables: (sourceIds: number[], destinationId: number) => void;
  splitTables: (sourceId: number, targetId: number, itemsToMove: { id: string; name: string; portion: PortionType; price: number; quantity: number }[]) => void;
  unmergeTables: (tableId: number) => void;
  transferTable: (sourceId: number, destinationId: number) => void;
  generateBill: (tableId: number, discount: number, gstPct?: number) => Promise<Bill>;
  payBill: (billId: string, method: PaymentMethod) => Promise<void>;
  submitLeave: (startDate: string, endDate: string, reason: string) => void;
  approveLeave: (leaveId: string) => void;
  rejectLeave: (leaveId: string) => void;
  markAttendance: (status: 'Present' | 'Late') => void;
  clockOut: () => void;
  requestCancellation: (orderId: string, itemText: string, reason: string) => void;
  approveCancellation: (reqId: string) => void;
  rejectCancellation: (reqId: string) => void;
  addEmployee: (employee: Omit<User, 'id' | 'performance' | 'overtimeHours'>) => void;
  updateEmployee: (empId: string, updates: Partial<User>) => void;
  changeLanguage: (lang: 'en' | 'mr') => void;
  addMenuItem: (item: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (itemId: string, updates: Partial<MenuItem>) => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
  addAuditLog: (action: string) => void;
  setTableStatus: (tableId: number, status: TableStatus) => void;
  assignWaiter: (tableId: number, waiterId: string | null) => void;
  deleteEmployee: (empId: string) => void;
  saveAttendance: (employeeId: string, date: string, status: 'Present' | 'Late' | 'Absent', clockIn?: string, clockOut?: string) => void;
  addTable: (zone: string) => void;
  removeTable: (id: number) => void;
  updateTableLayout: (id: number, zone: string, x: number, y: number) => void;
  addZone: (zoneName: string) => void;
  removeZone: (zoneName: string) => void;
  resetAllOrders: () => Promise<void>;
  settings: any;
  updateSettings: (updates: any) => Promise<void>;
  systemStatus: { server: 'online' | 'offline'; database: 'connected' | 'disconnected' };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Initial Static Mock Data (Fallback Mode)
const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Aditya Patil', username: 'admin', role: 'SuperAdmin', status: 'Active', zone: 'All', salary: 75000, performance: 5, overtimeHours: 8 }
];

const INITIAL_MENU: MenuItem[] = [
  // 1. वेज (Vegetarian Curries)
  { id: 'm_veg_1', name: 'पाटवडी (Patvadi)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_veg_2', name: 'डाळकांदा (Dal Kanda)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_veg_3', name: 'शेवभाजी (Shev Bhaji)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 12, isAvailable: true },
  { id: 'm_veg_4', name: 'पनीर बटर मसाला (Paneer Butter Masala)', category: 'Vegetarian', portionMode: 'Single', price: 280, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_veg_5', name: 'कोल्हापूरी पनीर (Kolhapuri Paneer)', category: 'Vegetarian', portionMode: 'Single', price: 280, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_veg_6', name: 'पनीर मसाला (Paneer Masala)', category: 'Vegetarian', portionMode: 'Single', price: 280, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_veg_7', name: 'पालक पनीर (Palak Paneer)', category: 'Vegetarian', portionMode: 'Single', price: 300, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_veg_8', name: 'पनीर खसखस (Paneer Khas Khas)', category: 'Vegetarian', portionMode: 'Single', price: 350, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_veg_9', name: 'दाल फ्राय (Dal Fry)', category: 'Vegetarian', portionMode: 'Single', price: 200, variants: [], prepTime: 10, isAvailable: true },
  { id: 'm_veg_10', name: 'दाल तडका (Dal Tadka)', category: 'Vegetarian', portionMode: 'Single', price: 230, variants: [], prepTime: 12, isAvailable: true },
  { id: 'm_veg_11', name: 'टमाटर चटणी (Tamatar Chutney)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 12, isAvailable: true },
  { id: 'm_veg_12', name: 'पनीर भुर्जी (Paneer Bhurji)', category: 'Vegetarian', portionMode: 'Single', price: 320, variants: [], prepTime: 15, isAvailable: true },

  // 2. अंडा करी (Egg Curry)
  { id: 'm_egg_1', name: 'वेज अंडाकरी (Veg Egg Curry)', category: 'Egg Curry', portionMode: 'Single', price: 180, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_egg_2', name: 'वेज फ्राय अंडाकरी (Veg Fry Egg Curry)', category: 'Egg Curry', portionMode: 'Single', price: 200, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_egg_3', name: 'फ्राय अंडाकरी नॉनव्हेज (Fry Egg Curry Non-Veg)', category: 'Egg Curry', portionMode: 'Single', price: 220, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_egg_4', name: 'अंडाकरी नॉनव्हेज (Egg Curry Non-Veg)', category: 'Egg Curry', portionMode: 'Single', price: 200, variants: [], prepTime: 15, isAvailable: true },

  // 3. चपाती (Breads)
  { id: 'm_bread_1', name: 'रोटी (Roti)', category: 'Breads', portionMode: 'Single', price: 15, variants: [], prepTime: 3, isAvailable: true },
  { id: 'm_bread_2', name: 'कडक रोटी (Kadak Roti)', category: 'Breads', portionMode: 'Single', price: 20, variants: [], prepTime: 4, isAvailable: true },
  { id: 'm_bread_3', name: 'बटर रोटी (Butter Roti)', category: 'Breads', portionMode: 'Single', price: 25, variants: [], prepTime: 3, isAvailable: true },
  { id: 'm_bread_4', name: 'घी रोटी (Ghee Roti)', category: 'Breads', portionMode: 'Single', price: 25, variants: [], prepTime: 3, isAvailable: true },
  { id: 'm_bread_5', name: 'बटर पराठा (Butter Paratha)', category: 'Breads', portionMode: 'Single', price: 30, variants: [], prepTime: 5, isAvailable: true },
  { id: 'm_bread_6', name: 'घी पराठा (Ghee Paratha)', category: 'Breads', portionMode: 'Single', price: 30, variants: [], prepTime: 5, isAvailable: true },
  { id: 'm_bread_7', name: 'तेल पराठा (Oil Paratha)', category: 'Breads', portionMode: 'Single', price: 30, variants: [], prepTime: 5, isAvailable: true },
  { id: 'm_bread_8', name: 'भाकर (Bhakar)', category: 'Breads', portionMode: 'Single', price: 35, variants: [], prepTime: 6, isAvailable: true },

  // 4. राईस (Rice)
  { id: 'm_rice_1', name: 'स्टीम राईस (Steam Rice)', category: 'Rice', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 50, prepTime: 8 }, { name: 'Full', price: 80, prepTime: 12 }], prepTime: 10, isAvailable: true },
  { id: 'm_rice_2', name: 'जिरा राईस (Jeera Rice)', category: 'Rice', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 60, prepTime: 8 }, { name: 'Full', price: 100, prepTime: 12 }], prepTime: 10, isAvailable: true },
  { id: 'm_rice_3', name: 'गार्लिक राईस (Garlic Rice)', category: 'Rice', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 80, prepTime: 10 }, { name: 'Full', price: 120, prepTime: 15 }], prepTime: 12, isAvailable: true },

  // 5. पापड (Papad)
  { id: 'm_papad_1', name: 'पापड (Plain Papad)', category: 'Papad', portionMode: 'Single', price: 25, variants: [], prepTime: 2, isAvailable: true },
  { id: 'm_papad_2', name: 'फ्राय पापड (Fried Papad)', category: 'Papad', portionMode: 'Single', price: 30, variants: [], prepTime: 2, isAvailable: true },
  { id: 'm_papad_3', name: 'मसाला पापड (Masala Papad)', category: 'Papad', portionMode: 'Single', price: 50, variants: [], prepTime: 4, isAvailable: true },

  // 6. नॉनवेज स्टार्टर (Starters)
  { id: 'm_nst_1', name: 'फिश फ्राय (Fish Fry)', category: 'Starters', portionMode: 'Single', price: 350, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_2', name: 'सुखा झिंगा (Sukha Zinga / Dry Prawns)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_3', name: 'खिमा कलेजी (Kheema Kaleji Starter)', category: 'Starters', portionMode: 'Single', price: 390, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_4', name: 'गारलिक खिमा (Garlic Kheema)', category: 'Starters', portionMode: 'Single', price: 410, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_5', name: 'मुंडरी स्टार्टर (Mundari Starter)', category: 'Starters', portionMode: 'Single', price: 320, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_6', name: 'ग्रिन मटन (Green Mutton)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_nst_7', name: 'गारलिक ग्रिन मटन (Garlic Green Mutton)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_nst_8', name: 'सुखा मटन (Sukha Mutton / Dry Mutton)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_nst_9', name: 'गारलिक मटन (Garlic Mutton)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_nst_10', name: 'सुखा खुर (Sukha Khur / Dry Trotters)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 20, isAvailable: true },
  { id: 'm_nst_11', name: 'चिकन सुखा (Chicken Sukha / Dry Chicken)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_12', name: 'गारलिक सुखा चिकन (Garlic Sukha Chicken)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_nst_13', name: 'गास्लीक कत्तीचा चिकन (Gaslik Katticha Chicken)', category: 'Starters', portionMode: 'Single', price: 470, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_nst_14', name: 'सुखा चिकन कत्तीचा (Sukha Chicken Katticha)', category: 'Starters', portionMode: 'Single', price: 450, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_nst_15', name: 'मसाला सावजी चिकन (Masala Saoji Chicken)', category: 'Starters', portionMode: 'Single', price: 350, variants: [], prepTime: 15, isAvailable: true },

  // 7. करी (Curries)
  { id: 'm_cur_1', name: 'झिंगा करी (Zinga Curry / Prawns Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 280, prepTime: 12 }, { name: 'Full', price: 380, prepTime: 18 }], prepTime: 15, isAvailable: true },
  { id: 'm_cur_2', name: 'मुंडरी करी (Mundari Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 220, prepTime: 12 }, { name: 'Full', price: 320, prepTime: 18 }], prepTime: 15, isAvailable: true },
  { id: 'm_cur_3', name: 'खिमा कलेजी करी (Kheema Kaleji Curry)', category: 'Curries', portionMode: 'Single', price: 390, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_cur_4', name: 'गास्लीक खिमा कलेजी (Gaslik Kheema Kaleji)', category: 'Curries', portionMode: 'Single', price: 410, variants: [], prepTime: 15, isAvailable: true },
  { id: 'm_cur_5', name: 'खिमा मटन (Kheema Mutton)', category: 'Curries', portionMode: 'Single', price: 390, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_cur_6', name: 'मटन करी (Mutton Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 280, prepTime: 15 }, { name: 'Full', price: 380, prepTime: 20 }], prepTime: 18, isAvailable: true },
  { id: 'm_cur_7', name: 'गास्लीक मटन करी (Gaslik Mutton Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 300, prepTime: 15 }, { name: 'Full', price: 400, prepTime: 20 }], prepTime: 18, isAvailable: true },
  { id: 'm_cur_8', name: 'चिकन करी (Chicken Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 280, prepTime: 12 }, { name: 'Full', price: 380, prepTime: 18 }], prepTime: 15, isAvailable: true },
  { id: 'm_cur_9', name: 'गास्लीक चिकन करी (Gaslik Chicken Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 300, prepTime: 12 }, { name: 'Full', price: 400, prepTime: 18 }], prepTime: 15, isAvailable: true },
  { id: 'm_cur_10', name: 'खुर करी (Khur Curry / Trotters Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 290, prepTime: 18 }, { name: 'Full', price: 400, prepTime: 25 }], prepTime: 20, isAvailable: true },
  { id: 'm_cur_11', name: 'गास्लीक खुर करी (Gaslik Khur Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 300, prepTime: 18 }, { name: 'Full', price: 420, prepTime: 25 }], prepTime: 20, isAvailable: true },
  { id: 'm_cur_12', name: 'कातीचा कोंबडा (Katicha Kombda)', category: 'Curries', portionMode: 'Single', price: 450, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_cur_13', name: 'गास्लीक कातीचा कोंबडा (Gaslik Katicha Kombda)', category: 'Curries', portionMode: 'Single', price: 470, variants: [], prepTime: 18, isAvailable: true },
  { id: 'm_cur_14', name: 'मसाला सावजी चिकन करी (Masala Saoji Chicken Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 220, prepTime: 12 }, { name: 'Full', price: 350, prepTime: 18 }], prepTime: 15, isAvailable: true },

  // 8. हांडी (Handi Dishes)
  { id: 'm_handi_1', name: 'मटन हांडी (Mutton Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 20 }, { name: 'Full', price: 1200, prepTime: 30 }], prepTime: 25, isAvailable: true },
  { id: 'm_handi_2', name: 'मटन हांडी सुखा (Mutton Handi Sukha)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 20 }, { name: 'Full', price: 1200, prepTime: 30 }], prepTime: 25, isAvailable: true },
  { id: 'm_handi_3', name: 'चिकन हांडी (Chicken Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 18 }, { name: 'Full', price: 1200, prepTime: 28 }], prepTime: 22, isAvailable: true },
  { id: 'm_handi_4', name: 'सुखा चिकन हांडी (Sukha Chicken Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 18 }, { name: 'Full', price: 1200, prepTime: 28 }], prepTime: 22, isAvailable: true },
  { id: 'm_handi_5', name: 'खुर हांडी (Khur Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 700, prepTime: 22 }, { name: 'Full', price: 1300, prepTime: 35 }], prepTime: 30, isAvailable: true },
  { id: 'm_handi_6', name: 'सुखा खुर हांडी (Sukha Khur Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 700, prepTime: 22 }, { name: 'Full', price: 1300, prepTime: 35 }], prepTime: 30, isAvailable: true },
  { id: 'm_handi_7', name: 'कातीचा कोंबडा हांडी (Katicha Kombda Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 850, prepTime: 25 }, { name: 'Full', price: 1600, prepTime: 40 }], prepTime: 35, isAvailable: true },
  { id: 'm_handi_8', name: 'सुखा कातीचा कोंबडा हांडी (Sukha Katicha Kombda Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 850, prepTime: 25 }, { name: 'Full', price: 1600, prepTime: 40 }], prepTime: 35, isAvailable: true }
];

const INITIAL_TABLES: Table[] = Array.from({ length: 24 }, (_, i) => {
  const id = i + 1;
  let zone = 'A';
  if (id > 8 && id <= 16) zone = 'B';
  if (id > 16) zone = 'C';

  const indexInZone = (id - 1) % 8;
  const row = Math.floor(indexInZone / 4);
  const col = indexInZone % 4;
  const x = 10 + col * 25;
  const y = 15 + row * 40;

  return { id, guests: 0, status: 'Available', zone, x, y };
});

const API_BASE = '/api';

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Mode flag
  const [isBackendMode, setIsBackendMode] = useState<boolean>(true);

  // States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const currentUserRef = useRef<User | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    const saved = localStorage.getItem('rms_user');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  const [users, setUsers] = useState<User[]>(INITIAL_USERS);

  // Keep currentUser synced if their underlying user object is modified
  useEffect(() => {
    if (currentUser && users && users.length > 0) {
      const freshMe = users.find(u => u.id === currentUser.id);
      if (freshMe && JSON.stringify(freshMe) !== JSON.stringify(currentUser)) {
        setCurrentUser(freshMe);
        localStorage.setItem('rms_user', JSON.stringify(freshMe));
      }
    }
  }, [users, currentUser]);

  const [tables, setTables] = useState<Table[]>(INITIAL_TABLES);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(INITIAL_MENU);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<Payroll[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [language, setLanguage] = useState<'en' | 'mr'>('en');
  const [mergedGroups, setMergedGroups] = useState<number[][]>([]);
  const [zones, setZones] = useState<string[]>(['A', 'B', 'C']);
  const [settings, setSettings] = useState<any>(null);
  const [systemStatus, setSystemStatus] = useState<{ server: 'online' | 'offline'; database: 'connected' | 'disconnected' }>({
    server: 'offline',
    database: 'disconnected'
  });

  const socketRef = useRef<any>(null);

  // Helper headers builder
  const getHeaders = () => {
    const token = localStorage.getItem('rms_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  };

  // Safe API fetch wrapper to clear expired JWT sessions
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        localStorage.removeItem('rms_token');
        localStorage.removeItem('rms_user');
        setCurrentUser(null);
        toast.error('Session expired, please login again.');
        return { success: false, unauthorized: true };
      }
      return await res.json();
    } catch (err) {
      return { success: false, error: err };
    }
  };

  // Load language from localStorage
  useEffect(() => {
    const savedLanguage = localStorage.getItem('rms_lang') as 'en' | 'mr';
    if (savedLanguage) {
      setLanguage(savedLanguage);
    }
  }, []);

  // Fetch Database Data helper
  const loadDatabaseData = async () => {
    try {
      const hdrs = getHeaders();
      const token = localStorage.getItem('rms_token');
      
      const resTables = await apiFetch(`${API_BASE}/tables`, { headers: hdrs });
      if (resTables.unauthorized) return;
      if (resTables.success) {
        setTables(resTables.data.map((t: any) => ({ ...t, id: t.id || t._id })));
      }

      const resZones = await apiFetch(`${API_BASE}/tables/zones`, { headers: hdrs });
      if (resZones.success) {
        setZones(resZones.zones);
        setMergedGroups(resZones.mergedGroups || []);
      }

      const resMenu = await apiFetch(`${API_BASE}/menu`, { headers: hdrs });
      if (resMenu.success) {
        setMenuItems(resMenu.data.map((m: any) => ({ ...m, id: m.id || m._id })));
      }

      const resSettings = await apiFetch(`${API_BASE}/settings`, { headers: hdrs });
      if (resSettings.success) {
        setSettings(resSettings.data);
      }

      if (!token) {
        return; // Don't call protected routes if there's no auth token
      }

      const resOrders = await apiFetch(`${API_BASE}/orders`, { headers: hdrs });
      if (resOrders.success) {
        setOrders(resOrders.data.map((o: any) => ({ ...o, id: o.id || o._id })));
      }

      const resStaff = await apiFetch(`${API_BASE}/staff`, { headers: hdrs });
      if (resStaff.success) {
        setUsers(resStaff.data.map((u: any) => ({ ...u, id: u.id || u._id })));
      }

      const resAtt = await apiFetch(`${API_BASE}/staff/attendance`, { headers: hdrs });
      if (resAtt.success) {
        setAttendance(resAtt.data.map((a: any) => ({ ...a, id: a.id || a._id })));
      }

      const resLeaves = await apiFetch(`${API_BASE}/staff/leaves`, { headers: hdrs });
      if (resLeaves.success) {
        setLeaves(resLeaves.data.map((l: any) => ({ ...l, id: l.id || l._id })));
      }

      const resPayroll = await apiFetch(`${API_BASE}/staff/payroll`, { headers: hdrs });
      if (resPayroll.success) {
        setPayroll(resPayroll.data.map((p: any) => ({ ...p, id: p.id || p._id })));
      }

      const resAudit = await apiFetch(`${API_BASE}/staff/audit-logs`, { headers: hdrs });
      if (resAudit.success) {
        setAuditLogs(resAudit.data.map((g: any) => ({ ...g, id: g.id || g._id })));
      }

      const resCancels = await apiFetch(`${API_BASE}/billing/cancel-requests`, { headers: hdrs });
      if (resCancels.success) {
        setCancellationRequests(resCancels.data.map((c: any) => ({ ...c, id: c.id || c._id })));
      }

      const resBills = await apiFetch(`${API_BASE}/billing`, { headers: hdrs });
      if (resBills.success) {
        setBills(resBills.data.map((b: any) => ({ ...b, id: b.id || b._id })));
      }

    } catch (e) {
      console.error('Error fetching database collections:', e);
    }
  };

  // Periodically check server and database status
  useEffect(() => {
    const checkStatus = () => {
      fetch(`${API_BASE}/status`)
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            setSystemStatus({
              server: 'online',
              database: res.database
            });
          } else {
            setSystemStatus({ server: 'online', database: 'disconnected' });
          }
        })
        .catch(() => {
          setSystemStatus({ server: 'offline', database: 'disconnected' });
        });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 8000); // Check every 8s
    return () => clearInterval(interval);
  }, []);

  // Fast poll: refresh tables + orders every 2 seconds for real-time table management
  useEffect(() => {
    const fastRefresh = async () => {
      const token = localStorage.getItem('rms_token');
      if (!token || !isBackendMode) return; // Do not fetch if not authenticated
      
      try {
        const hdrs = getHeaders();
        const resTables = await apiFetch(`${API_BASE}/tables`, { headers: hdrs });
        if (resTables && resTables.success) {
          setTables(resTables.data.map((t: any) => ({ ...t, id: t.id || t._id })));
        }
        const resOrders = await apiFetch(`${API_BASE}/orders`, { headers: hdrs });
        if (resOrders && resOrders.success) {
          setOrders(prev => {
            const fetchedOrders = resOrders.data.map((o: any) => ({ ...o, id: o.id || o._id }));
            
            // On Vercel sockets are disabled, simulate notifications via polling diff
            if (prev.length > 0) {
              const prevIds = new Set(prev.map(p => p.id));
              const newOrders = fetchedOrders.filter((o: any) => !prevIds.has(o.id));
              
              if (newOrders.length > 0) {
                playNotificationSound();
                
                newOrders.forEach((no: any) => {
                  const notif = {
                    id: `n_${Date.now()}_${Math.random()}`,
                    title: `New Order (T-${no.tableId})`,
                    message: `Order #${no.id.substring(4,8)} received for Table ${no.tableId}`,
                    timestamp: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date()),
                    read: false,
                    type: 'order' as const
                  };
                  toast.success(notif.message);
                  setNotifications(pn => [notif, ...pn]);
                });
              }
            }
            return fetchedOrders;
          });
        }
      } catch {
        // silent — socket will handle it anyway
      }
    };
    const fastInterval = setInterval(fastRefresh, 2000);
    return () => clearInterval(fastInterval);
  }, [isBackendMode]);


  // Attempt backend connection on startup
  useEffect(() => {
    let isAborted = false;
    let localSocket: any = null;

    const testBackend = async () => {
      try {
        const response = await fetch(`${API_BASE}/tables`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          if (isAborted) return;
          console.log('Connected to Paunikar Saoji Restaurant backend server!');
          setIsBackendMode(true);

          // Restore local session
          const savedUser = localStorage.getItem('rms_user');
          const savedToken = localStorage.getItem('rms_token');
          if (savedUser && savedToken) {
            setCurrentUser(JSON.parse(savedUser));
          }

          // Initial load
          await loadDatabaseData();

          if (isAborted) return;

          // Connect Socket.IO (only on localhost to avoid Vercel 404 polling spam)
          const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
          let socket: any;
          
          if (isLocal) {
            socket = io('http://localhost:5000');
          } else {
            socket = { on: () => {}, emit: () => {}, disconnect: () => {} };
          }
          
          localSocket = socket;
          socketRef.current = socket;

          // Socket Listeners
          socket.on('table_status_changed', (data: { id: number; status: TableStatus }) => {
            if (isAborted) return;
            setTables(prev => prev.map(t => t.id === data.id ? { ...t, status: data.status } : t));
          });
          socket.on('tables_sync', (data: Table[]) => {
            if (isAborted) return;
            setTables(data);
          });
          socket.on('orders_sync', (data: Order[]) => {
            if (isAborted) return;
            setOrders(data);
          });
          socket.on('order_created', (data: Order) => {
            if (isAborted) return;
            playNotificationSound();
            setOrders(prev => [...prev.filter(o => o.id !== data.id), data]);
          });
          socket.on('order_updated', (data: Order) => {
            if (isAborted) return;
            playNotificationSound();
            setOrders(prev => prev.map(o => o.id === data.id ? data : o));
          });
          socket.on('order_status_updated', (data: { id: string; status: Order['status'] }) => {
            if (isAborted) return;
            setOrders(prev => prev.map(o => o.id === data.id ? { ...o, status: data.status } : o));
            
            // Show toasts locally
            const matched = orders.find(o => o.id === data.id);
            if (matched) {
              if (data.status === 'Ready') {
                toast.success(`Table ${matched.tableId} order is Ready Pick-up! 🛎️`, { duration: 6000 });
              } else if (data.status === 'Preparing') {
                toast.info(`Table ${matched.tableId} order is now Preparing.`);
              }
            }
          });
          socket.on('bill_generated', (data: Bill) => {
            if (isAborted) return;
            setBills(prev => [...prev.filter(b => b.id !== data.id), data]);
          });
          socket.on('bill_paid', (data: { billId: string; method: PaymentMethod; tableId: number }) => {
            if (isAborted) return;
            setBills(prev => prev.map(b => b.id === data.billId ? { ...b, paymentStatus: 'Paid', paymentMethod: data.method } : b));
            // Immediately set table to Available so UI refreshes instantly
            setTables(prev => prev.map(t => t.id === data.tableId ? { ...t, status: 'Available', orderId: null, waiterId: null, guests: 0 } : t));
            toast.success(`Table ${data.tableId} checkout complete! Table is now available.`);
          });
          socket.on('notification_received', (data: Notification) => {
            if (isAborted) return;
            setNotifications(prev => {
              if (prev.some(n => n.id === data.id)) return prev;
              return [data, ...prev];
            });
          });
          socket.on('menu_changed', (data: MenuItem) => {
            if (isAborted) return;
            setMenuItems(prev => prev.map(m => m.id === data.id ? data : m));
          });
          socket.on('leave_requested', (data: LeaveRequest) => {
            if (isAborted) return;
            setLeaves(prev => [data, ...prev]);
          });
          socket.on('leave_status_updated', (data: LeaveRequest) => {
            if (isAborted) return;
            setLeaves(prev => prev.map(l => l.id === data.id ? data : l));
          });
          socket.on('cancel_requested', (data: CancellationRequest) => {
            if (isAborted) return;
            setCancellationRequests(prev => [data, ...prev]);
          });
          socket.on('cancel_status_updated', (data: CancellationRequest) => {
            if (isAborted) return;
            setCancellationRequests(prev => prev.map(c => c.id === data.id ? data : c));
          });

          socket.on('staff_updated', (data: { id: string; status: 'Active' | 'Disabled'; user: User }) => {
            if (isAborted) return;
            console.log('staff_updated socket event received:', data);
            setUsers(prev => prev.map(u => u.id === data.id || (u as any)._id === data.id ? { ...u, ...data.user, id: data.id } : u));
            const currUser = currentUserRef.current;
            console.log('Current user:', currUser);
            if (currUser && (
              currUser.id === data.id || 
              (currUser as any)._id === data.id ||
              (data.user && currUser.username.toLowerCase() === data.user.username.toLowerCase())
            )) {
              if (data.user) {
                const updatedUser = { ...currUser, ...data.user, id: data.id } as User;
                setCurrentUser(updatedUser);
                localStorage.setItem('rms_user', JSON.stringify(updatedUser));
              }
              if (data.status === 'Disabled') {
                toast.warning('Your account has been turned off by administrator.');
              } else {
                toast.success('Your account has been enabled.');
              }
            }
          });

          socket.on('staff_deleted', (data: { id: string; username?: string }) => {
            if (isAborted) return;
            console.log('staff_deleted socket event received:', data);
            setUsers(prev => prev.filter(u => u.id !== data.id && (u as any)._id !== data.id));
            const currUser = currentUserRef.current;
            console.log('Current user:', currUser);
            if (currUser && (
              currUser.id === data.id || 
              (currUser as any)._id === data.id || 
              (data.username && currUser.username.toLowerCase() === data.username.toLowerCase())
            )) {
              localStorage.removeItem('rms_token');
              localStorage.removeItem('rms_user');
              setCurrentUser(null);
              toast.error('Your account has been deleted by administrator.');
            }
          });

        } else {
          throw new Error('Endpoint offline');
        }
      } catch (err) {
        if (isAborted) return;
        console.warn('Backend connection issue, keeping backend mode active:', err);
        setIsBackendMode(true);
      }
    };

    testBackend();

    return () => {
      isAborted = true;
      if (localSocket) {
        localSocket.disconnect();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Sync Seeding for mock/historic data
  useEffect(() => {
    if (!isBackendMode) {
      setAttendance([]);
      setLeaves([]);
      setPayroll([]);
      setOrders([]);
      setTables(prev => prev.map(t => ({ ...t, status: 'Available', orderId: undefined, waiterId: undefined, guests: 0 })));
      setAuditLogs([
        { id: 'la1', userId: 'system', userName: 'System', action: 'System booted and initialized database', timestamp: '09:00 AM' }
      ]);
    }
  }, [isBackendMode]);

  // Fallback simulator loop for offline mode
  useEffect(() => {
    if (!isBackendMode) {
      const timer = setInterval(() => {
        setOrders(prev => {
          const pendingOrPrep = prev.filter(o => o.status === 'Pending' || o.status === 'Preparing');
          if (pendingOrPrep.length === 0) return prev;
          const randIndex = Math.floor(Math.random() * pendingOrPrep.length);
          const oProgress = pendingOrPrep[randIndex];
          return prev.map(o => {
            if (o.id === oProgress.id) {
              const nextStatus: Order['status'] = o.status === 'Pending' ? 'Preparing' : 'Ready';
              setTimeout(() => {
                if (nextStatus === 'Preparing') toast.info(`Table ${o.tableId}: Chef started preparing order.`);
                else if (nextStatus === 'Ready') toast.success(`Table ${o.tableId}: Order is Ready! 🛎️`, { duration: 6000 });
              }, 100);
              return { ...o, status: nextStatus };
            }
            return o;
          });
        });
      }, 25000);
      return () => clearInterval(timer);
    }
  }, [isBackendMode]);

  // Operations
  const getISTTime = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  const getISTDate = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

  const addAuditLog = async (action: string) => {
    const timestamp = getISTTime();
    if (isBackendMode && currentUser) {
      try {
        await fetch(`${API_BASE}/staff/audit-logs`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ action })
        });
        loadDatabaseData(); // refresh logs
      } catch (err) {
        console.error(err);
      }
    } else {
      const newLog: AuditLog = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        userId: currentUser?.id || 'system',
        userName: currentUser?.name || 'System',
        action,
        timestamp
      };
      setAuditLogs(prev => [newLog, ...prev].slice(0, 100));
    }
  };

  const login = (username: string, password?: string, role?: UserRole): boolean => {
    if (isBackendMode) {
      const tryLogin = async () => {
        try {
          const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          }).then(r => r.json());

          if (response.success) {
            localStorage.setItem('rms_token', response.token);
            localStorage.setItem('rms_user', JSON.stringify(response.user));
            setCurrentUser(response.user);
            toast.success(`Welcome back, ${response.user.name}!`);
            
            // Load fresh collections
            await loadDatabaseData();

            addAuditLog(`Logged in as ${response.user.role}`);
          } else {
            toast.error(response.message || 'Login failed');
          }
        } catch (e) {
          toast.error('Auth request failed');
        }
      };
      tryLogin();
      return true; // Return true initially, navigate on context update
    } else {
      let foundUser = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.status === 'Active');
      if (!foundUser && role) {
        foundUser = users.find(u => u.role === role && u.status === 'Active');
      }
      if (foundUser) {
        setCurrentUser(foundUser);
        toast.success(`Welcome back, ${foundUser.name}! (${foundUser.role})`);
        addAuditLog(`Logged in as ${foundUser.role}`);
        return true;
      }
      toast.error('Invalid username or account disabled');
      return false;
    }
  };

  const logout = () => {
    if (currentUser) {
      addAuditLog('Logged out');
      toast.info(`Goodbye, ${currentUser.name}`);
      setCurrentUser(null);
      localStorage.removeItem('rms_token');
      localStorage.removeItem('rms_user');
    }
  };

  const changeLanguage = (lang: 'en' | 'mr') => {
    setLanguage(lang);
    localStorage.setItem('rms_lang', lang);
    toast.success(lang === 'en' ? 'Language changed to English' : 'भाषा मराठीत बदलली आहे');
  };

  const setTableStatus = async (tableId: number, status: TableStatus) => {
    // Optimistically update the local state immediately
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status } : t));

    if (isBackendMode) {
      try {
        await fetch(`${API_BASE}/tables/${tableId}/status`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ status })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const assignWaiter = async (tableId: number, waiterId: string | null) => {
    // Optimistically update local state immediately
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, waiterId: waiterId || undefined } : t));

    if (isBackendMode) {
      try {
        await fetch(`${API_BASE}/tables/${tableId}/waiter`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ waiterId })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const addOrder = (tableId: number, items: Omit<Order['items'][0], 'id'>[], notes?: string): Order => {
    const waiterId = currentUser?.id || 'u5';
    const orderId = `ord-${Date.now()}`;
    const timestamp = getISTTime();
    const date = getISTDate();

    const orderItems = items.map((item, idx) => ({
      ...item,
      id: `${orderId}-item-${idx}`,
      status: 'Pending' as const
    }));

    const grandTotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    const newOrder: Order = {
      id: orderId,
      tableId,
      waiterId,
      items: orderItems,
      status: 'Pending',
      notes,
      timestamp,
      date,
      grandTotal
    };

    if (isBackendMode) {
      fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tableId, items, notes })
      }).then(() => {
        toast.success(`Order sent to kitchen for Table ${tableId}`);
        loadDatabaseData();
      });
    } else {
      setOrders(prev => [...prev, newOrder]);
      setTables(prev => prev.map(t => t.id === tableId ? {
        ...t,
        status: 'Occupied',
        orderId,
        waiterId,
        guests: t.guests || 2
      } : t));

      const newNotif: Notification = {
        id: `notif-${Date.now()}`,
        title: `New Order - Table ${tableId}`,
        message: `${orderItems.length} items ordered by ${currentUser?.name || 'Waiter'}`,
        type: 'Order',
        timestamp,
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
      addAuditLog(`Created Order ${orderId} for Table ${tableId}`);
      toast.success(`Order sent to kitchen for Table ${tableId}`);
    }

    return newOrder;
  };

  const updateOrder = (orderId: string, updates: Partial<Order>) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/orders/${orderId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      });
    } else {
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, ...updates };
          if (updates.items) {
            updated.grandTotal = updates.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
          }
          return updated;
        }
        return o;
      }));
      addAuditLog(`Updated Order ${orderId}`);
    }
  };

  const updateOrderStatus = (orderId: string, status: Order['status']) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status })
      });
    } else {
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          if (status === 'Preparing') {
            toast.info(`Table ${o.tableId} order is now being Prepared.`);
          } else if (status === 'Ready') {
            toast.success(`Table ${o.tableId} order is Ready!`, {
              duration: 5000,
              description: 'Please pick up and serve.'
            });
          }
          const updatedItems = o.items.map(i => i.status === 'Served' ? i : { ...i, status });
          return { ...o, status, items: updatedItems };
        }
        return o;
      }));

      const ord = orders.find(o => o.id === orderId);
      if (ord) {
        const newNotif: Notification = {
          id: `notif-${Date.now()}`,
          title: `Order ${status} - Table ${ord.tableId}`,
          message: `Order #${ord.id.substring(4, 8)} status changed to ${status}`,
          type: 'Kitchen',
          timestamp: new Date().toLocaleTimeString(),
          read: false
        };
        setNotifications(prev => [newNotif, ...prev]);
        addAuditLog(`Order ${orderId} status changed to ${status}`);
      }
    }
  };

  const transferTable = (sourceId: number, destinationId: number) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/tables/transfer`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ sourceId, destinationId })
      }).then(r => r.json()).then(res => {
        if (res.success) {
          toast.success(`Transferred Table ${sourceId} to Table ${destinationId}`);
        } else {
          toast.error(res.message);
        }
      });
    } else {
      const sourceTable = tables.find(t => t.id === sourceId);
      const destTable = tables.find(t => t.id === destinationId);

      if (!sourceTable || !destTable) return;
      if (sourceTable.status === 'Available') {
        toast.error('Source table is empty');
        return;
      }
      if (destTable.status !== 'Available') {
        toast.error('Destination table is not available');
        return;
      }

      setTables(prev => prev.map(t => {
        if (t.id === sourceId) return { ...t, status: 'Cleaning', orderId: undefined, waiterId: undefined, guests: 0 };
        if (t.id === destinationId) {
          return { 
            ...t, 
            status: 'Occupied', 
            orderId: sourceTable.orderId, 
            waiterId: sourceTable.waiterId, 
            guests: sourceTable.guests 
          };
        }
        return t;
      }));

      if (sourceTable.orderId) {
        setOrders(prev => prev.map(o => o.id === sourceTable.orderId ? { ...o, tableId: destinationId } : o));
      }

      addAuditLog(`Transferred Table ${sourceId} to Table ${destinationId}`);
      toast.success(`Transferred Table ${sourceId} orders to Table ${destinationId}`);
    }
  };

  const mergeTables = (sourceIds: number[], destinationId: number) => {
    // Front-end UI manages merged groups lists, backend consolidates orders
    const destTable = tables.find(t => t.id === destinationId);
    if (!destTable) return;

    let mergedItems: OrderItem[] = [];
    let mergedNotes: string[] = [];
    let totalGuests = destTable.guests || 0;

    const sourceTables = tables.filter(t => sourceIds.includes(t.id));
    
    sourceTables.forEach(sTable => {
      totalGuests += sTable.guests || 0;
      if (sTable.orderId) {
        const order = orders.find(o => o.id === sTable.orderId);
        if (order) {
          mergedItems = [...mergedItems, ...order.items];
          if (order.notes) mergedNotes.push(order.notes);
        }
      }
    });

    if (destTable.orderId) {
      const destOrder = orders.find(o => o.id === destTable.orderId);
      if (destOrder) {
        mergedItems = [...destOrder.items, ...mergedItems];
        if (destOrder.notes) mergedNotes.push(destOrder.notes);
      }
    }

    const consolidatedItems: OrderItem[] = [];
    mergedItems.forEach(item => {
      const existing = consolidatedItems.find(c => c.id === item.id && c.portion === item.portion);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        consolidatedItems.push({ ...item });
      }
    });

    const masterOrderId = `ord-merge-${Date.now()}`;
    const grandTotal = consolidatedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    const masterOrder: Order = {
      id: masterOrderId,
      tableId: destinationId,
      waiterId: currentUser?.id || destTable.waiterId || 'u5',
      items: consolidatedItems,
      status: 'Pending',
      notes: mergedNotes.join(' | '),
      timestamp: getISTTime(),
      grandTotal
    };

    const oldOrderIds = sourceTables.map(s => s.orderId).filter(Boolean) as string[];
    if (destTable.orderId) oldOrderIds.push(destTable.orderId);

    if (isBackendMode) {
      // Clear source tables, create main order on destination
      fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tableId: destinationId, items: consolidatedItems, notes: mergedNotes.join(' | ') })
      }).then(() => {
        // Put source tables to cleaning status
        sourceIds.forEach(sid => {
          fetch(`${API_BASE}/tables/${sid}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ status: 'Cleaning' })
          });
        });

        // Save merge group in settings
        fetch(`${API_BASE}/tables/merge`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ sourceIds, destinationId })
        }).then(() => {
          toast.success(`Merged tables successfully into Table ${destinationId}`);
          loadDatabaseData();
        });
      });
    } else {
      setOrders(prev => [...prev.filter(o => !oldOrderIds.includes(o.id)), masterOrder]);
      setTables(prev => prev.map(t => {
        if (sourceIds.includes(t.id)) return { ...t, status: 'Cleaning', orderId: undefined, waiterId: undefined, guests: 0 };
        if (t.id === destinationId) {
          return { 
            ...t, 
            status: 'Occupied', 
            orderId: masterOrderId, 
            waiterId: masterOrder.waiterId, 
            guests: totalGuests || 2 
          };
        }
        return t;
      }));
    }

    setMergedGroups(prev => [...prev, [...sourceIds, destinationId]]);
    addAuditLog(`Merged tables [${sourceIds.join(', ')}] into Table ${destinationId}`);
  };

  const splitTables = (
    sourceId: number, 
    targetId: number, 
    itemsToMove: { id: string; name: string; portion: PortionType; price: number; quantity: number }[]
  ) => {
    const sourceTable = tables.find(t => t.id === sourceId);
    const targetTable = tables.find(t => t.id === targetId);

    if (!sourceTable || !targetTable || !sourceTable.orderId) return;

    const sourceOrder = orders.find(o => o.id === sourceTable.orderId);
    if (!sourceOrder) return;

    const targetOrderItems: OrderItem[] = [];
    const sourceOrderItems: OrderItem[] = [];

    sourceOrder.items.forEach(item => {
      const splitInfo = itemsToMove.find(m => m.id === item.id && m.portion === item.portion);
      if (splitInfo) {
        const moveQty = Math.min(splitInfo.quantity, item.quantity);
        const stayQty = item.quantity - moveQty;

        if (moveQty > 0) {
          targetOrderItems.push({
            id: `item-${Date.now()}-${item.id.substring(0, 4)}`,
            name: item.name,
            quantity: moveQty,
            portion: item.portion,
            price: item.price,
            specialNotes: item.specialNotes
          });
        }
        if (stayQty > 0) {
          sourceOrderItems.push({ ...item, quantity: stayQty });
        }
      } else {
        sourceOrderItems.push({ ...item });
      }
    });

    if (isBackendMode) {
      // API call to create order for target and update source order
      fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tableId: targetId, items: targetOrderItems, notes: '' })
      }).then(() => {
        if (sourceOrderItems.length > 0) {
          fetch(`${API_BASE}/orders/${sourceOrder.id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ items: sourceOrderItems })
          });
        } else {
          fetch(`${API_BASE}/orders/${sourceOrder.id}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ status: 'Served' })
          });
        }
        toast.success(`Split items to Table ${targetId}`);
        loadDatabaseData();
      });
    } else {
      const targetOrderId = `ord-split-${Date.now()}`;
      const targetTotal = targetOrderItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
      const newTargetOrder: Order = {
        id: targetOrderId,
        tableId: targetId,
        waiterId: sourceOrder.waiterId,
        items: targetOrderItems,
        status: 'Pending',
        timestamp: getISTTime(),
        grandTotal: targetTotal
      };
      const sourceTotal = sourceOrderItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);

      setOrders(prev => {
        const filtered = prev.filter(o => o.id !== sourceOrder.id);
        if (sourceOrderItems.length > 0) {
          return [...filtered, { ...sourceOrder, items: sourceOrderItems, grandTotal: sourceTotal }, newTargetOrder];
        }
        return [...filtered, newTargetOrder];
      });

      setTables(prev => prev.map(t => {
        if (t.id === sourceId) {
          return sourceOrderItems.length > 0 ? t : { ...t, status: 'Cleaning', orderId: undefined, waiterId: undefined, guests: 0 };
        }
        if (t.id === targetId) {
          return {
            ...t,
            status: 'Occupied',
            orderId: targetOrderId,
            waiterId: sourceOrder.waiterId,
            guests: Math.max(1, (sourceTable.guests || 2) - 1)
          };
        }
        return t;
      }));
    }

    setMergedGroups(prev => prev.filter(group => !group.includes(sourceId) && !group.includes(targetId)));
    addAuditLog(`Split Table ${sourceId} to Table ${targetId}`);
  };

  const generateBill = async (tableId: number, discount: number, gstPct: number = 18): Promise<Bill> => {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.orderId) throw new Error("Table has no active order");
    
    const order = orders.find(o => o.id === table.orderId);
    if (!order) throw new Error("Order not found");

    const subtotal = order.grandTotal;
    const gst = settings?.gstEnabled ? Math.round(subtotal * (gstPct / 100) * 100) / 100 : 0;
    const grandTotal = Math.round((subtotal + gst - discount) * 100) / 100;
    const discountPct = subtotal > 0 ? Math.round((discount / subtotal) * 100 * 100) / 100 : 0;

    const newBill: Bill = {
      id: `bill-${Date.now()}`,
      orderId: order.id,
      tableId,
      subtotal,
      gst,
      gstPct,
      discount,
      discountPct,
      grandTotal,
      paymentStatus: 'Pending',
      timestamp: getISTTime(),
      date: getISTDate()
    };

    if (isBackendMode) {
      const res = await fetch(`${API_BASE}/billing/generate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tableId, discount, gstPct })
      }).then(r => r.json());
      if (res.success) {
        loadDatabaseData();
        return { ...res.data, id: res.data.id || res.data._id };
      } else {
        throw new Error(res.message || "Failed to generate bill");
      }
    } else {
      setBills(prev => [...prev, newBill]);
      setTableStatus(tableId, 'Billing');

      const newNotif: Notification = {
        id: `notif-${Date.now()}`,
        title: `Bill Generated - Table ${tableId}`,
        message: `Total: ₹${grandTotal} (Subtotal: ₹${subtotal}, GST: ₹${gst})`,
        type: 'Billing',
        timestamp: getISTTime(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
      addAuditLog(`Generated bill ${newBill.id} for Table ${tableId}`);
      return newBill;
    }
  };

  const payBill = async (billId: string, method: PaymentMethod): Promise<void> => {
    if (isBackendMode) {
      const res = await fetch(`${API_BASE}/billing/${billId}/pay`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ paymentMethod: method })
      }).then(r => r.json());
      if (res.success) {
        // Optimistically update the UI to avoid lag
        const bill = bills.find(b => b.id === billId) || res.data;
        if (bill && bill.tableId) {
          setTables(prev => prev.map(t => t.id === bill.tableId ? {
            ...t, status: 'Available', orderId: undefined, waiterId: undefined, guests: 0
          } : t));
          toast.success(`Table ${bill.tableId} checkout complete! Table is now available.`);
        }
        loadDatabaseData();
      } else {
        throw new Error(res.message || "Failed to process payment");
      }
    } else {
      let targetTableId = 0;
      setBills(prev => prev.map(b => {
        if (b.id === billId) {
          targetTableId = b.tableId;
          return { ...b, paymentStatus: 'Paid', paymentMethod: method };
        }
        return b;
      }));

      if (targetTableId > 0) {
        setTables(prev => prev.map(t => t.id === targetTableId ? {
          ...t, status: 'Available', orderId: undefined, waiterId: undefined, guests: 0
        } : t));

        const bill = bills.find(b => b.id === billId);
        if (bill) {
          setOrders(prev => prev.map(o => o.id === bill.orderId ? { ...o, status: 'Served' } : o));
        }

        setMergedGroups(prev => prev.filter(group => !group.includes(targetTableId)));
        toast.success(`Table ${targetTableId} checkout complete! Paid via ${method}.`);
      }
      addAuditLog(`Processed Payment for Bill ${billId} via ${method}`);
    }
  };

  const submitLeave = (startDate: string, endDate: string, reason: string) => {
    if (!currentUser) return;

    if (isBackendMode) {
      fetch(`${API_BASE}/staff/leaves`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ startDate, endDate, reason })
      }).then(() => {
        toast.success('Leave application submitted to Manager');
        loadDatabaseData();
      });
    } else {
      const newLeave: LeaveRequest = {
        id: `leave-${Date.now()}`,
        employeeId: currentUser.id,
        startDate,
        endDate,
        reason,
        status: 'Pending'
      };
      setLeaves(prev => [...prev, newLeave]);
      toast.success('Leave application submitted to Manager');

      const newNotif: Notification = {
        id: `notif-${Date.now()}`,
        title: `Leave Request - ${currentUser.name}`,
        message: `Requested leave: ${startDate} to ${endDate}. Reason: ${reason}`,
        type: 'Leave',
        timestamp: new Date().toLocaleTimeString(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
      addAuditLog(`Submitted leave request for ${startDate} to ${endDate}`);
    }
  };

  const approveLeave = (leaveId: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/staff/leaves/${leaveId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: 'Approved' })
      }).then(() => {
        toast.success('Leave request approved');
        loadDatabaseData();
      });
    } else {
      setLeaves(prev => prev.map(l => l.id === leaveId ? { ...l, status: 'Approved' } : l));
      toast.success('Leave request approved');
      addAuditLog(`Approved leave request ${leaveId}`);
    }
  };

  const rejectLeave = (leaveId: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/staff/leaves/${leaveId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: 'Rejected' })
      }).then(() => {
        toast.info('Leave request rejected');
        loadDatabaseData();
      });
    } else {
      setLeaves(prev => prev.map(l => l.id === leaveId ? { ...l, status: 'Rejected' } : l));
      toast.info('Leave request rejected');
      addAuditLog(`Rejected leave request ${leaveId}`);
    }
  };

  const markAttendance = (status: 'Present' | 'Late') => {
    if (!currentUser) return;

    if (isBackendMode) {
      fetch(`${API_BASE}/staff/attendance/clock-in`, {
        method: 'POST',
        headers: getHeaders()
      }).then(r => r.json()).then(res => {
        if (res.success) {
          toast.success(`Clocked in at ${res.data.clockIn}`);
          loadDatabaseData();
        } else {
          toast.error(res.message);
        }
      });
    } else {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const exist = attendance.find(a => a.employeeId === currentUser.id && a.date === todayStr);
      if (exist) {
        toast.error('Already clocked in today!');
        return;
      }
      const newAtt: Attendance = {
        id: `att-${Date.now()}`,
        employeeId: currentUser.id,
        date: todayStr,
        clockIn: getISTTime(),
        status
      };
      setAttendance(prev => [newAtt, ...prev]);
      addAuditLog(`Clocked in (${status})`);
      toast.success(`Clocked in at ${newAtt.clockIn}`);
    }
  };

  const clockOut = () => {
    if (!currentUser) return;

    if (isBackendMode) {
      fetch(`${API_BASE}/staff/attendance/clock-out`, {
        method: 'POST',
        headers: getHeaders()
      }).then(r => r.json()).then(res => {
        if (res.success) {
          toast.success(`Clocked out at ${res.data.clockOut}`);
          loadDatabaseData();
        } else {
          toast.error(res.message);
        }
      });
    } else {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      setAttendance(prev => {
        const idx = prev.findIndex(a => a.employeeId === currentUser.id && a.date === todayStr);
        if (idx === -1) {
          toast.error('You need to Clock In first!');
          return prev;
        }
        const updated = [...prev];
        if (updated[idx].clockOut) {
          toast.error('Already clocked out today!');
          return prev;
        }
        updated[idx] = { ...updated[idx], clockOut: getISTTime() };
        toast.success(`Clocked out at ${updated[idx].clockOut}`);
        addAuditLog(`Clocked out`);
        return updated;
      });
    }
  };

  const requestCancellation = (orderId: string, itemText: string, reason: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/billing/cancel-request`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ orderId, itemText, reason })
      }).then(() => {
        toast.info('Cancellation request submitted to manager');
        loadDatabaseData();
      });
    } else {
      const newReq: CancellationRequest = {
        id: `cancel-${Date.now()}`,
        orderId, itemText, reason, requestedBy: currentUser?.name || 'Waiter', status: 'Pending', timestamp: getISTTime()
      };
      setCancellationRequests(prev => [...prev, newReq]);
      const newNotif: Notification = {
        id: `notif-${Date.now()}`, title: `Cancellation Request`, message: `Refund/removal request for "${itemText}" in Order ${orderId.substring(4,8)}. Reason: ${reason}`,
        type: 'Cancellation', timestamp: getISTTime(), read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
      addAuditLog(`Requested cancellation of ${itemText} for Order ${orderId}`);
      toast.info('Cancellation request submitted to manager');
    }
  };

  const approveCancellation = (reqId: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/billing/cancel-requests/${reqId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: 'Approved' })
      }).then(() => {
        toast.success('Cancellation request approved');
        loadDatabaseData();
      });
    } else {
      const req = cancellationRequests.find(c => c.id === reqId);
      if (!req) return;

      setCancellationRequests(prev => prev.map(c => c.id === reqId ? { ...c, status: 'Approved' } : c));
      setOrders(prev => prev.map(o => {
        if (o.id === req.orderId) {
          const cleanedItems = o.items.filter(item => {
            const detail = `${item.name} (${item.portion})`;
            return detail.toLowerCase() !== req.itemText.toLowerCase() && item.name.toLowerCase() !== req.itemText.toLowerCase();
          });
          const grandTotal = cleanedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
          return { ...o, items: cleanedItems, grandTotal };
        }
        return o;
      }));
      addAuditLog(`Approved cancellation ${reqId}`);
      toast.success('Cancellation request approved. Item removed from order.');
    }
  };

  const rejectCancellation = (reqId: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/billing/cancel-requests/${reqId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: 'Rejected' })
      }).then(() => {
        toast.info('Cancellation request rejected');
        loadDatabaseData();
      });
    } else {
      setCancellationRequests(prev => prev.map(c => c.id === reqId ? { ...c, status: 'Rejected' } : c));
      addAuditLog(`Rejected cancellation ${reqId}`);
      toast.info('Cancellation request rejected');
    }
  };

  const addEmployee = (employee: Omit<User, 'id' | 'performance' | 'overtimeHours'> & { password?: string }) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/staff`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(employee)
      }).then(() => {
        toast.success(`Account for ${employee.name} created!`);
        loadDatabaseData();
      });
    } else {
      const newEmp: User = { ...employee, id: `u-${Date.now()}`, performance: 5, overtimeHours: 0 };
      setUsers(prev => [...prev, newEmp]);
      addAuditLog(`Created employee account for ${newEmp.name}`);
      toast.success(`Account for ${newEmp.name} created!`);
    }
  };

  const updateEmployee = (empId: string, updates: Partial<User>) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/staff/${empId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      }).then(() => {
        toast.success('Employee details updated');
        loadDatabaseData();
      });
    } else {
      setUsers(prev => prev.map(u => u.id === empId ? { ...u, ...updates } : u));
      addAuditLog(`Updated employee profile ${empId}`);
      toast.success('Employee details updated');
    }
  };

  const deleteEmployee = (empId: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/staff/${empId}`, {
        method: 'DELETE',
        headers: getHeaders()
      }).then(() => {
        toast.success('Employee removed successfully');
        loadDatabaseData();
      });
    } else {
      setUsers(prev => prev.filter(u => u.id !== empId));
      addAuditLog(`Removed employee ${empId}`);
      toast.success('Employee removed successfully');
    }
  };

  const saveAttendance = (employeeId: string, date: string, status: 'Present' | 'Late' | 'Absent', clockIn?: string, clockOut?: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/staff/attendance/manual`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ employeeId, date, status, clockIn, clockOut })
      }).then(() => {
        toast.success('Attendance record saved');
        loadDatabaseData();
      });
    } else {
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.employeeId === employeeId && a.date === date));
        const newRecord = {
          id: `att-${Date.now()}`,
          employeeId,
          date,
          clockIn: clockIn || (status === 'Absent' ? '' : '09:00:00'),
          clockOut: clockOut || '',
          status
        };
        return [...filtered, newRecord];
      });
      addAuditLog(`Updated attendance for employee ${employeeId} on ${date}`);
      toast.success('Attendance record saved');
    }
  };

  const addMenuItem = (item: Omit<MenuItem, 'id'>) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/menu`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(item)
      }).then(() => {
        toast.success(`${item.name} added to menu`);
        loadDatabaseData();
      });
    } else {
      const newItem: MenuItem = { ...item, id: `m-${Date.now()}` };
      setMenuItems(prev => [...prev, newItem]);
      addAuditLog(`Added menu item ${newItem.name}`);
      toast.success(`${newItem.name} added to menu`);
    }
  };

  const updateMenuItem = (itemId: string, updates: Partial<MenuItem>) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/menu/${itemId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
      }).then(() => {
        toast.success('Menu item updated');
        loadDatabaseData();
      });
    } else {
      setMenuItems(prev => prev.map(m => m.id === itemId ? { ...m, ...updates } : m));
      addAuditLog(`Updated menu item ${itemId}`);
      toast.success('Menu item updated');
    }
  };

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    toast.info('All notifications cleared');
  };

  const addTable = (zone: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/tables`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ zone })
      }).then(res => res.json()).then(resData => {
        if (resData.success) {
          toast.success(`Table T-${resData.data.id} added in Zone ${zone}`);
          loadDatabaseData();
        } else {
          toast.error(resData.message || 'Failed to add table');
        }
      });
    } else {
      const nextId = tables.length > 0 ? Math.max(...tables.map(t => t.id)) + 1 : 1;
      const newTable: Table = {
        id: nextId,
        guests: 0,
        status: 'Available',
        zone,
        x: 10 + Math.random() * 40,
        y: 10 + Math.random() * 40
      };
      setTables(prev => [...prev, newTable]);
      addAuditLog(`Added Table T-${nextId} in Zone ${zone}`);
      toast.success(`Table T-${nextId} added in Zone ${zone}`);
    }
  };

  const removeTable = (id: number) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/tables/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      }).then(res => res.json()).then(resData => {
        if (resData.success) {
          toast.success(`Table T-${id} removed`);
          loadDatabaseData();
        } else {
          toast.error(resData.message || 'Failed to remove table');
        }
      });
    } else {
      setTables(prev => prev.filter(t => t.id !== id));
      setMergedGroups(prev => prev.map(group => group.filter(gid => gid !== id)).filter(group => group.length > 1));
      addAuditLog(`Removed Table T-${id}`);
      toast.success(`Table T-${id} removed`);
    }
  };

  const updateTableLayout = (id: number, zone: string, x: number, y: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (isBackendMode) {
      fetch(`${API_BASE}/tables/${id}/layout`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ zone, x: rx, y: ry })
      }).then(res => res.json()).then(resData => {
        if (resData.success) {
          setTables(prev => prev.map(t => t.id === id ? { ...t, zone, x: rx, y: ry } : t));
        }
      });
    } else {
      setTables(prev => prev.map(t => t.id === id ? { ...t, zone, x: rx, y: ry } : t));
    }
  };

  const addZone = (zoneName: string) => {
    const trimmed = zoneName.trim();
    if (!trimmed) return;
    if (zones.includes(trimmed)) {
      toast.error('Zone already exists');
      return;
    }
    if (isBackendMode) {
      fetch(`${API_BASE}/tables/zones`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ zone: trimmed })
      }).then(res => res.json()).then(resData => {
        if (resData.success) {
          setZones(resData.zones);
          toast.success(`Zone ${trimmed} added`);
        }
      });
    } else {
      setZones(prev => [...prev, trimmed]);
      toast.success(`Zone ${trimmed} added`);
    }
  };

  const removeZone = (zoneName: string) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/tables/zones/${zoneName}`, {
        method: 'DELETE',
        headers: getHeaders()
      }).then(res => res.json()).then(resData => {
        if (resData.success) {
          setZones(resData.zones);
          toast.success(`Zone ${zoneName} removed`);
          loadDatabaseData();
        }
      });
    } else {
      setZones(prev => prev.filter(z => z !== zoneName));
      const fallbackZone = zones.filter(z => z !== zoneName)[0] || 'A';
      setTables(prev => prev.map(t => t.zone === zoneName ? { ...t, zone: fallbackZone } : t));
      toast.success(`Zone ${zoneName} removed`);
    }
  };

  const resetAllOrders = async (): Promise<void> => {
    if (isBackendMode) {
      try {
        const res = await fetch(`${API_BASE}/orders/reset`, {
          method: 'DELETE',
          headers: getHeaders()
        }).then(r => r.json());
        if (res.success) {
          toast.success(language === 'en' ? 'All orders reset successfully!' : 'सर्व ऑर्डर्स यशस्वीरित्या रीसेट केल्या!');
          loadDatabaseData();
        } else {
          toast.error(res.message || 'Failed to reset orders');
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || 'Failed to reset orders');
      }
    } else {
      setOrders([]);
      setBills([]);
      setTables(prev => prev.map(t => ({ ...t, status: 'Available', orderId: undefined, waiterId: undefined, guests: 0 })));
      toast.success(language === 'en' ? 'All orders reset successfully!' : 'सर्व ऑर्डर्स यशस्वीरित्या रीसेट केल्या!');
    }
  };

  const updateSettings = async (updates: any) => {
    if (isBackendMode) {
      try {
        const res = await fetch(`${API_BASE}/settings`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(updates)
        }).then(r => r.json());
        if (res.success) {
          setSettings(res.data);
          toast.success(language === 'en' ? 'Settings updated successfully!' : 'सेटिंग्ज यशस्वीरित्या जतन केल्या!');
        } else {
          toast.error(res.message || 'Failed to update settings');
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to update settings');
      }
    } else {
      setSettings((prev: any) => ({ ...prev, ...updates }));
      toast.success(language === 'en' ? 'Settings updated successfully!' : 'सेटिंग्ज यशस्वीरित्या जतन केल्या!');
    }
  };

  const unmergeTables = (tableId: number) => {
    if (isBackendMode) {
      fetch(`${API_BASE}/tables/unmerge`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tableId })
      }).then(res => res.json()).then(resData => {
        if (resData.success) {
          setMergedGroups(resData.mergedGroups);
          toast.success('Table unmerged successfully');
          loadDatabaseData();
        }
      });
    } else {
      setMergedGroups(prev => prev.filter(group => !group.includes(tableId)));
      addAuditLog(`Unmerged table group containing Table ${tableId}`);
      toast.success('Table unmerged successfully');
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser, users, tables, orders, menuItems, attendance, leaves, payroll,
      notifications, bills, cancellationRequests, auditLogs, language, mergedGroups,
      zones, login, logout, addOrder, updateOrder, updateOrderStatus, mergeTables,
      splitTables, transferTable, generateBill, payBill, submitLeave, approveLeave,
      rejectLeave, markAttendance, clockOut, requestCancellation, approveCancellation,
      rejectCancellation, addEmployee, updateEmployee, changeLanguage, addMenuItem,
      updateMenuItem, clearNotification, clearAllNotifications, addAuditLog, setTableStatus,
      assignWaiter, deleteEmployee, saveAttendance, addTable, removeTable, updateTableLayout,
      addZone, removeZone, unmergeTables, resetAllOrders, settings, updateSettings, systemStatus
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
