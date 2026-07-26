"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { translations } from '../../translations/translations';
import { 
  LayoutDashboard, UtensilsCrossed, ChefHat, Receipt, 
  MenuSquare, Users, Bell, ClipboardList, 
  UserCheck, TrendingUp, Settings, LogOut, Search, Menu
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Notification Center
const NotificationCenter: React.FC = () => {
  const { notifications, clearNotification, clearAllNotifications } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition cursor-pointer"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              className="absolute right-0 mt-2 w-80 z-50 rounded-2xl bg-white border border-gray-100 shadow-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-800">Notifications</span>
                {notifications.length > 0 && (
                  <button onClick={clearAllNotifications} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer">
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">No notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="px-4 py-3 hover:bg-gray-50 transition group relative">
                      <button onClick={() => clearNotification(n.id)} className="absolute right-3 top-3 text-[10px] text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 cursor-pointer">✕</button>
                      <div className="text-xs font-semibold text-gray-800">{n.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{n.message}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{n.timestamp}</div>
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, logout, language, changeLanguage, systemStatus, settings } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const t = translations[language];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const defaultRbac: Record<string, string[]> = {
    SuperAdmin: ['dashboard', 'tables', 'billing', 'menu', 'employees', 'attendance', 'orders', 'reports', 'kds', 'profile'],
    Admin: ['dashboard', 'tables', 'billing', 'menu', 'employees', 'attendance', 'orders', 'reports', 'kds', 'profile'],
    Manager: ['dashboard', 'tables', 'billing', 'menu', 'employees', 'attendance', 'orders', 'reports', 'kds'],
    Cashier: ['dashboard', 'tables', 'billing', 'orders'],
    Waiter: ['tables', 'attendance'],
    Chef: ['kds', 'attendance']
  };

  if (!currentUser) return null;

  const userFeatures = (settings?.rbac || defaultRbac)[currentUser.role] || [];

  const navLinks = [
    { path: '/admin/dashboard', id: 'dashboard', icon: LayoutDashboard, label: t.dashboard },
    { path: '/admin/tables', id: 'tables', icon: UtensilsCrossed, label: t.tables },
    { path: '/admin/billing', id: 'billing', icon: Receipt, label: t.billing },
    { path: '/admin/menu', id: 'menu', icon: MenuSquare, label: t.menu },
    { path: '/admin/employees', id: 'employees', icon: Users, label: t.employees },
    { path: '/admin/attendance', id: 'attendance', icon: UserCheck, label: 'Attendance' },
    { path: '/admin/orders', id: 'orders', icon: ClipboardList, label: 'Orders' },
    { path: '/admin/reports', id: 'reports', icon: TrendingUp, label: 'Reports' },
    { path: '/admin/kds', id: 'kds', icon: ChefHat, label: 'Kitchen' },
    { path: '/admin/profile', id: 'profile', icon: Settings, label: 'Profile' },
  ].filter(l => userFeatures.includes(l.id));

  return (
    <div className="flex h-screen bg-[#F7F7F8] overflow-hidden font-sans pb-16 lg:pb-0">

      {/* ====== DESKTOP SIDEBAR ====== */}
      <aside className="hidden lg:flex w-16 bg-[#1B1B2E] flex-col items-center py-5 gap-1 z-50 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm mb-4 shrink-0">
          PS
        </div>
        <nav className="flex flex-col items-center gap-1 flex-1">
          {navLinks.map(link => {
            const Icon = link.icon;
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.path}
                href={link.path}
                title={link.label}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} />
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-2">
          <div
            title={`Server: ${systemStatus.server} | DB: ${systemStatus.database}`}
            className="w-2 h-2 rounded-full mb-1"
            style={{ backgroundColor: systemStatus.server === 'online' && systemStatus.database === 'connected' ? '#22c55e' : '#ef4444' }}
          />
          <button
            onClick={() => changeLanguage(language === 'en' ? 'mr' : 'en')}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer text-xs font-bold"
          >
            {language === 'en' ? 'म' : 'EN'}
          </button>
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition cursor-pointer"
          >
            <LogOut size={17} />
          </button>
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs mt-1">
            {currentUser.name.charAt(0)}
          </div>
        </div>
      </aside>

      {/* ====== MOBILE FLOATING HOVER NAV BAR ====== */}
      <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-[#1B1B2E]/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 px-4 py-2 flex items-center justify-between">
        {navLinks.slice(0, 4).map(link => {
          const Icon = link.icon;
          const isActive = pathname === link.path;
          return (
            <Link
              key={link.path}
              href={link.path}
              className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 transition-all ${
                isActive ? 'text-indigo-400 scale-105' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span className="text-[9px] font-semibold">{link.label}</span>
            </Link>
          );
        })}
        
        {/* Toggle Menu Button for rest of items */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
            mobileMenuOpen ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Menu size={18} />
          <span className="text-[9px] font-semibold">Menu</span>
        </button>
      </div>

      {/* Mobile Menu Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileMenuOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="lg:hidden fixed bottom-20 left-0 right-0 z-50 bg-[#1B1B2E] border-t border-white/10 rounded-t-3xl p-6 space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Navigation Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕ Close</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {navLinks.map(link => {
                  const Icon = link.icon;
                  const isActive = pathname === link.path;
                  return (
                    <Link
                      key={link.path}
                      href={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`p-3 rounded-xl flex flex-col items-center gap-1 border transition ${
                        isActive 
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' 
                          : 'bg-white/5 border-transparent text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="text-[10px] font-bold text-center leading-tight">{link.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="border-t border-white/5 pt-4 flex items-center justify-between text-xs text-slate-400">
                <button
                  onClick={() => { changeLanguage(language === 'en' ? 'mr' : 'en'); setMobileMenuOpen(false); }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold cursor-pointer"
                >
                  Language: {language === 'en' ? 'मराठी' : 'English'}
                </button>
                <button
                  onClick={() => { logout(); router.push('/login'); }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white font-bold cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ====== MAIN COLUMN ====== */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-gray-100 px-4 lg:px-6 flex items-center gap-4 shrink-0 z-30">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full h-9 pl-9 pr-4 rounded-xl bg-gray-100 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition"
            />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${systemStatus.server === 'online' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
              <span>{systemStatus.server === 'online' ? 'Online' : 'Offline'}</span>
              <span className="w-px h-3 bg-gray-300 mx-0.5" />
              <span className={`w-1.5 h-1.5 rounded-full ${systemStatus.database === 'connected' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
              <span>{systemStatus.database === 'connected' ? 'DB' : 'DB Offline'}</span>
            </div>
            <NotificationCenter />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
                {currentUser.name.charAt(0)}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-bold text-gray-800 leading-tight">{currentUser.name}</p>
                <p className="text-[10px] text-gray-400 leading-tight capitalize">{currentUser.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
