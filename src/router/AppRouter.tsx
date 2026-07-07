import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  LayoutDashboard, UtensilsCrossed, ChefHat, Receipt, 
  MenuSquare, Users, Globe, LogOut, Bell, ClipboardList, 
  CalendarDays, UserCheck, CreditCard, TrendingUp, MoreHorizontal
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Lazy-loaded or standard imports of pages (we will write these next)
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import TableManagement from '../pages/TableManagement';
import Billing from '../pages/Billing';
import MenuManagement from '../pages/MenuManagement';
import EmployeeManagement from '../pages/EmployeeManagement';
import WaiterPortal from '../pages/WaiterPortal';
import Attendance from '../pages/Attendance';
import OrderHistory from '../pages/OrderHistory';
import Reports from '../pages/Reports';
import KDS from '../pages/KDS';

// Component: Role Guard
interface ProtectedRouteProps {
  children: React.ReactElement;
  allowedRoles: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser } = useApp();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    // Redirect unauthorized roles to their default home pages
    if (currentUser.role === 'Waiter') return <Navigate to="/waiter" replace />;
    if (currentUser.role === 'Chef') return <Navigate to="/admin/kds" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Component: Notification Center popover
const NotificationCenter: React.FC = () => {
  const { notifications, clearNotification, clearAllNotifications, language } = useApp();
  const [isOpen, setIsOpen] = React.useState(false);
  const t = translations[language];

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-white/40 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50 hover:bg-white/60 dark:hover:bg-slate-800/60 transition cursor-pointer text-slate-700 dark:text-slate-200"
      >
        <Bell size={18} className={unreadCount > 0 ? 'animate-bounce' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute right-0 mt-2 w-80 z-50 rounded-xl glass-card border border-slate-200/40 shadow-xl overflow-hidden text-slate-800"
            >
              <div className="p-3 bg-slate-900 text-white flex justify-between items-center">
                <span className="text-sm font-semibold flex items-center gap-1">
                  <Bell size={14} /> Alerts ({notifications.length})
                </span>
                {notifications.length > 0 && (
                  <button 
                    onClick={clearAllNotifications}
                    className="text-[10px] px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded cursor-pointer transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No active notifications
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      className="p-3 border-b border-slate-100 hover:bg-slate-50/50 transition relative group"
                    >
                      <button 
                        onClick={() => clearNotification(n.id)}
                        className="absolute right-2 top-2 text-[10px] text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                      >
                        ✕
                      </button>
                      <div className="font-medium text-xs text-slate-900">{n.title}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5 leading-tight">{n.message}</div>
                      <div className="text-[9px] text-slate-400 mt-1">{n.timestamp}</div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// Layout Component: Main Desktop Dashboard (Admin/Manager/Cashier)
const DashboardLayout: React.FC = () => {
  const { currentUser, logout, language, changeLanguage } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const t = translations[language];
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!currentUser) return <Navigate to="/login" replace />;

  const isRole = (roles: string[]) => roles.includes(currentUser.role);

  const menuLinks = [
    { path: '/admin/dashboard', label: t.dashboard, icon: LayoutDashboard, roles: ['SuperAdmin', 'Manager', 'Cashier'] },
    { path: '/admin/tables', label: t.tables, icon: UtensilsCrossed, roles: ['SuperAdmin', 'Manager', 'Cashier'] },
    { path: '/admin/billing', label: t.billing, icon: Receipt, roles: ['SuperAdmin', 'Manager', 'Cashier'] },
    { path: '/admin/menu', label: t.menu, icon: MenuSquare, roles: ['SuperAdmin', 'Manager'] },
    { path: '/admin/employees', label: t.employees, icon: Users, roles: ['SuperAdmin', 'Manager'] },
    { path: '/admin/attendance', label: 'Attendance', icon: UserCheck, roles: ['SuperAdmin', 'Manager'] },
    { path: '/admin/orders', label: 'Order History', icon: ClipboardList, roles: ['SuperAdmin', 'Manager', 'Cashier'] },
    { path: '/admin/reports', label: 'Reports', icon: TrendingUp, roles: ['SuperAdmin', 'Manager'] },
    { path: '/admin/kds', label: 'KDS (Kitchen)', icon: ChefHat, roles: ['SuperAdmin', 'Manager', 'Chef'] },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans pb-16 lg:pb-0">
      
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex w-64 border-r border-slate-200/65 bg-white flex-col justify-between select-none">
        <div>
          {/* Logo / Header */}
          <div className="p-6 border-b border-slate-200/60 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 font-black text-lg tracking-wider pulse-live">
              PS
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight text-slate-900 m-0">Paunikar Saoji Restaurant</h1>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">RMS v4.3</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {menuLinks.map(link => {
              if (!link.roles.includes(currentUser.role)) return null;
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 ${
                    isActive 
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 shadow-sm shadow-emerald-500/5' 
                      : 'text-slate-500 border border-transparent hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info / Language / Logout Footer */}
        <div className="p-4 border-t border-slate-200/65 space-y-4">
          {/* User profile capsule */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700">
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate m-0">{currentUser.name}</p>
              <span className="text-[10px] text-slate-550 font-semibold capitalize">{currentUser.role}</span>
            </div>
          </div>

          {/* Settings Actions */}
          <div className="flex items-center justify-between gap-2 px-1">
            {/* Lang switcher */}
            <button 
              onClick={() => changeLanguage(language === 'en' ? 'mr' : 'en')}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-850 cursor-pointer transition py-1 px-2.5 rounded bg-slate-50 border border-slate-200"
            >
              <Globe size={12} />
              <span>{language === 'en' ? 'मराठी' : 'EN'}</span>
            </button>

            {/* Logout */}
            <button 
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer transition py-1 px-2.5 rounded bg-rose-50 border border-rose-200"
            >
              <LogOut size={12} />
              <span>{t.logout}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Floating Bottom Nav Dock (Tablet & Mobile viewport) */}
      {showMoreMenu && (
        <div className="lg:hidden fixed bottom-16 left-3.5 right-3.5 z-50 bg-white/95 backdrop-blur-2xl border border-slate-200/70 rounded-2xl p-3 shadow-xl shadow-slate-950/15 grid grid-cols-3 gap-2 select-none">
          {menuLinks.filter(l => l.roles.includes(currentUser.role)).slice(3).map(link => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setShowMoreMenu(false)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-600 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-550 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                <span className="text-[8px] uppercase tracking-wide font-black truncate max-w-full">{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="lg:hidden fixed bottom-3.5 left-3.5 right-3.5 z-50 bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-1.5 flex gap-1.5 items-center justify-around shadow-lg shadow-slate-900/5 select-none">
        {(() => {
          const allowed = menuLinks.filter(link => link.roles.includes(currentUser.role));
          const hasMore = allowed.length > 4;
          const visibleLinks = hasMore ? allowed.slice(0, 3) : allowed;

          return (
            <>
              {visibleLinks.map(link => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setShowMoreMenu(false)}
                    className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all duration-300 min-w-[62px] flex-shrink-0 ${
                      isActive 
                        ? 'bg-emerald-500/10 text-emerald-600 font-black scale-105' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="text-[8px] uppercase tracking-wider font-extrabold truncate max-w-[68px]">{link.label}</span>
                  </Link>
                );
              })}

              {hasMore && (
                <button
                  onClick={() => setShowMoreMenu(prev => !prev)}
                  className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-all duration-300 min-w-[62px] flex-shrink-0 cursor-pointer ${
                    showMoreMenu 
                      ? 'bg-emerald-500/10 text-emerald-605 font-black scale-105' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MoreHorizontal size={14} />
                  <span className="text-[8px] uppercase tracking-wider font-extrabold">{language === 'en' ? 'More' : 'अधिक'}</span>
                </button>
              )}
            </>
          );
        })()}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200 bg-white/70 backdrop-blur-md px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t.role}:</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 tracking-wide uppercase">
              {currentUser.role}
            </span>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-3">
            {/* Lang switcher (Responsive helper) */}
            <button 
              onClick={() => changeLanguage(language === 'en' ? 'mr' : 'en')}
              className="lg:hidden flex items-center gap-1.5 text-[10px] font-extrabold text-slate-500 hover:text-slate-800 cursor-pointer transition py-1 px-2.5 rounded bg-slate-50 border border-slate-200"
            >
              <Globe size={11} />
              <span>{language === 'en' ? 'मराठी' : 'EN'}</span>
            </button>

            {/* Logout (Responsive helper) */}
            <button 
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="lg:hidden flex items-center gap-1.5 text-[10px] font-bold text-rose-650 hover:text-rose-700 cursor-pointer transition py-1 px-2.5 rounded bg-rose-50 border border-rose-200"
            >
              <LogOut size={11} />
            </button>

            <NotificationCenter />
            <div className="text-xs text-slate-550 font-mono">
              {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'mr-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Content Wrapper */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 pb-16 lg:pb-8">
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}><Dashboard /></ProtectedRoute>} />
            <Route path="/tables" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}><TableManagement /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}><Billing /></ProtectedRoute>} />
            <Route path="/menu" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}><MenuManagement /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}><EmployeeManagement /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}><Attendance /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}><OrderHistory /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}><Reports /></ProtectedRoute>} />
            <Route path="/kds" element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Chef']}><KDS /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// Route Controller
export const AppRouter: React.FC = () => {
  const { currentUser } = useApp();

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Route */}
        <Route path="/login" element={<Login />} />

        {/* Waiter specific mobile layout */}
        <Route 
          path="/waiter/*" 
          element={
            <ProtectedRoute allowedRoles={['Waiter']}>
              <WaiterPortal />
            </ProtectedRoute>
          } 
        />

        {/* Desktop Admin/Manager layouts */}
        <Route path="/admin/*" element={<DashboardLayout />} />

        {/* Root Route Redirect */}
        <Route 
          path="/" 
          element={
            currentUser ? (
              currentUser.role === 'Waiter' ? (
                <Navigate to="/waiter" replace />
              ) : currentUser.role === 'Chef' ? (
                <Navigate to="/admin/kds" replace />
              ) : (
                <Navigate to="/admin/dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />

        {/* Fallback Catch-All */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
