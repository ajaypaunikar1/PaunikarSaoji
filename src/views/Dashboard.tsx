import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  IndianRupee, Percent, Clock, Users, Activity, 
  TrendingUp, ChevronRight, Award, Settings as SettingsIcon
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const Dashboard: React.FC = () => {
  const { 
    orders, tables, attendance, bills, language, auditLogs, settings, updateSettings, currentUser
  } = useApp();
  const t = translations[language];

  // Settings form states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [formRestName, setFormRestName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formGst, setFormGst] = useState('');
  const [formUpi, setFormUpi] = useState('');
  const [formKitchenIp, setFormKitchenIp] = useState('127.0.0.1');
  const [formBillingIp, setFormBillingIp] = useState('127.0.0.1');

  // Calculations
  const metrics = useMemo(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // Revenue: sum of paid bills for today
    const totalRevenue = bills
      .filter(b => b.paymentStatus === 'Paid' && ((b as any).createdAt?.startsWith(todayStr) || (b as any).timestamp?.includes(new Date().toLocaleDateString())))
      .reduce((sum, b) => sum + b.grandTotal, 0);

    // Occupancy
    const activeTables = tables.filter(t => t.status !== 'Available' && t.status !== 'Cleaning').length;
    const occupancyRate = tables.length > 0 ? Math.round((activeTables / tables.length) * 100) : 0;

    // Wait time: average of active order prep times
    const activePrepTimes = orders
      .filter(o => o.status !== 'Served')
      .flatMap(o => o.items.map(i => i.price > 100 ? 15 : 8));
    const avgWaitTime = activePrepTimes.length > 0 
      ? Math.round(activePrepTimes.reduce((a, b) => a + b, 0) / activePrepTimes.length) 
      : 0;

    // Staff present
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const presentStaff = attendance.filter(a => a.date === todayStr && !a.clockOut).length;

    // Live Orders
    const liveOrdersCount = orders.filter(o => o.status !== 'Served').length;

    return { totalRevenue, occupancyRate, avgWaitTime, presentStaff, liveOrdersCount };
  }, [orders, tables, attendance, bills]);

  // Chart Data: Hourly trend from actual bills
  const chartData = useMemo(() => {
    const slots = [
      { hour: '11:00 AM', sales: 0 },
      { hour: '12:00 PM', sales: 0 },
      { hour: '01:00 PM', sales: 0 },
      { hour: '02:00 PM', sales: 0 },
      { hour: '03:00 PM', sales: 0 },
      { hour: '04:00 PM', sales: 0 },
      { hour: '05:00 PM', sales: 0 },
      { hour: '06:00 PM', sales: 0 },
      { hour: '07:00 PM', sales: 0 },
      { hour: '08:00 PM', sales: 0 },
      { hour: '09:00 PM', sales: 0 },
      { hour: '10:00 PM', sales: 0 },
    ];

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const paidToday = bills.filter(b => b.paymentStatus === 'Paid' && (b as any).createdAt?.startsWith(todayStr));
    
    paidToday.forEach(bill => {
      if (!(bill as any).createdAt) return;
      const billDate = new Date((bill as any).createdAt);
      let hourNum = billDate.getHours();
      let ampm = hourNum >= 12 ? 'PM' : 'AM';
      let displayHour = hourNum % 12;
      displayHour = displayHour === 0 ? 12 : displayHour;
      const formattedHour = `${String(displayHour).padStart(2, '0')}:00 ${ampm}`;
      
      const found = slots.find(s => s.hour === formattedHour);
      if (found) {
        found.sales += bill.grandTotal;
      }
    });

    return slots;
  }, [bills]);

  // Top Selling Items calculated from orders history
  const topItems = useMemo(() => {
    const itemCounts: { [key: string]: number } = {};
    orders.forEach(ord => {
      if (ord.items && Array.isArray(ord.items)) {
        ord.items.forEach(item => {
          itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
        });
      }
    });

    const sorted = Object.entries(itemCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.min(Math.round((count / 100) * 100), 100),
        color: '#10b981'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (sorted.length === 0) {
      return [
        { name: 'No sales recorded yet', count: 0, percentage: 0, color: '#94a3b8' }
      ];
    }

    const colors = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899'];
    return sorted.map((item, idx) => ({
      ...item,
      color: colors[idx % colors.length]
    }));
  }, [orders]);

  // Framer Motion presets
  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  return (
    <div className="space-y-6">
      
      {/* Welcome Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900 m-0">{t.dashboard}</h2>
          <p className="text-xs text-gray-400 font-medium mt-1">Real-time restaurant operational analytics and trends.</p>
        </div>
        <div className="flex items-center gap-2">
          
          {/* Settings Trigger Icon */}
          {currentUser?.role === 'SuperAdmin' && (
            <button
              onClick={() => {
                if (settings) {
                  setFormRestName(settings.restaurantName || '');
                  setFormAddress(settings.address || '');
                  setFormGst(settings.gstNumber || '');
                  setFormUpi(settings.upiId || '');
                  setFormKitchenIp(settings.kitchenPrinterIp || '127.0.0.1');
                  setFormBillingIp(settings.billingPrinterIp || '127.0.0.1');
                }
                setIsSettingsOpen(true);
              }}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-850 cursor-pointer shadow-sm hover:shadow transition duration-200 flex items-center justify-center mr-1"
              title="RMS System Settings"
            >
              <SettingsIcon size={16} />
            </button>
          )}

          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-sm h-10">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600">Live Sync Enabled</span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Revenue */}
        <motion.div 
          variants={cardVariants} initial="hidden" animate="visible"
          className="p-5 rounded-2xl bg-white border border-gray-200 flex items-center gap-4 hover:border-indigo-300 shadow-sm hover:shadow-md transition duration-300 group"
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition duration-300">
            <IndianRupee size={20} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.revenue}</span>
            <span className="text-lg font-black text-gray-900 tracking-tight">₹{metrics.totalRevenue}</span>
          </div>
        </motion.div>

        {/* Occupancy */}
        <motion.div 
          variants={cardVariants} initial="hidden" animate="visible"
          className="p-5 rounded-2xl bg-white border border-gray-200 flex items-center gap-4 hover:border-emerald-300 shadow-sm hover:shadow-md transition duration-300 group"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition duration-300">
            <Percent size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.occupancy}</span>
            <span className="text-lg font-black text-gray-900 tracking-tight">{metrics.occupancyRate}%</span>
          </div>
        </motion.div>

        {/* Avg Wait Time */}
        <motion.div 
          variants={cardVariants} initial="hidden" animate="visible"
          className="p-5 rounded-2xl bg-white border border-gray-200 flex items-center gap-4 hover:border-amber-300 shadow-sm hover:shadow-md transition duration-300 group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-110 transition duration-300">
            <Clock size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.avgWaitTime}</span>
            <span className="text-lg font-black text-gray-900 tracking-tight">{metrics.avgWaitTime} {t.mins}</span>
          </div>
        </motion.div>

        {/* Staff Present */}
        <motion.div 
          variants={cardVariants} initial="hidden" animate="visible"
          className="p-5 rounded-2xl bg-white border border-gray-200 flex items-center gap-4 hover:border-blue-300 shadow-sm hover:shadow-md transition duration-300 group"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition duration-300">
            <Users size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.staffPresent}</span>
            <span className="text-lg font-black text-gray-900 tracking-tight">{metrics.presentStaff}</span>
          </div>
        </motion.div>

        {/* Live Orders */}
        <motion.div 
          variants={cardVariants} initial="hidden" animate="visible"
          className="p-5 rounded-2xl bg-white border border-gray-200 flex items-center gap-4 hover:border-rose-300 shadow-sm hover:shadow-md transition duration-300 group"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 group-hover:scale-110 transition duration-300">
            <Activity size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.liveOrders}</span>
            <span className="text-lg font-black text-gray-900 tracking-tight">{metrics.liveOrdersCount}</span>
          </div>
        </motion.div>

      </div>

      {/* Main Charts & Analytics row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 cols: Sales Trend chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-600" />
                {t.salesTrend}
              </h3>
              <p className="text-xs text-gray-400 mt-1">Hourly sales data collected across zones.</p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip 
                  contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '11px', fontFamily: 'monospace' }}
                  formatter={(value: any) => [`₹${value}`, 'Sales']}
                />
                <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 1 col: Top Selling Menu Items */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-6">
              <Award size={16} className="text-amber-500" />
              {t.topSellingItems}
            </h3>

            <div className="space-y-4">
              {topItems.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-800">
                    <span className="truncate max-w-[200px]">{item.name}</span>
                    <span className="text-slate-500 font-mono text-[11px]">{item.count} qty</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${item.percentage}%`, backgroundColor: item.color }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Want full product reports?</span>
            <button 
              onClick={() => { window.location.href = '/admin/menu'; }}
              className="text-emerald-600 hover:text-emerald-700 font-black tracking-wide uppercase text-[10px] cursor-pointer flex items-center gap-0.5"
            >
              View Menu <ChevronRight size={12} />
            </button>
          </div>
        </div>

      </div>

      {/* Settings Modal overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
                <span className="text-xs font-black uppercase text-slate-800 tracking-wider">RMS General & Printer Settings</span>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <SettingsIcon size={16} />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                await updateSettings({
                  restaurantName: formRestName,
                  address: formAddress,
                  gstNumber: formGst,
                  upiId: formUpi,
                  kitchenPrinterIp: formKitchenIp,
                  billingPrinterIp: formBillingIp
                });
                setIsSettingsOpen(false);
              }} className="p-6 space-y-4 overflow-y-auto">
                
                {/* Section 1: Business Profile */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Business Details</h4>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-slate-500">Restaurant Name</label>
                    <input 
                      type="text" 
                      value={formRestName} 
                      onChange={e => setFormRestName(e.target.value)} 
                      className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                      required
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-slate-500">Address / Location</label>
                    <input 
                      type="text" 
                      value={formAddress} 
                      onChange={e => setFormAddress(e.target.value)} 
                      className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">GST Number</label>
                      <input 
                        type="text" 
                        value={formGst} 
                        onChange={e => setFormGst(e.target.value)} 
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">UPI Pay ID</label>
                      <input 
                        type="text" 
                        value={formUpi} 
                        onChange={e => setFormUpi(e.target.value)} 
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-100" />

                {/* Section 2: Printers Network IPs */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Printer Network Configurations</h4>
                  <p className="text-[10px] text-slate-500 leading-tight">Configure printer IP addresses. Direct raw printing on port 9100 will target these router IPs.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Kitchen KOT Printer IP</label>
                      <input 
                        type="text" 
                        value={formKitchenIp} 
                        onChange={e => setFormKitchenIp(e.target.value)} 
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                        placeholder="192.168.1.100"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">Billing Counter Printer IP</label>
                      <input 
                        type="text" 
                        value={formBillingIp} 
                        onChange={e => setFormBillingIp(e.target.value)} 
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                        placeholder="192.168.1.101"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider cursor-pointer transition text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-500/10 transition text-center"
                  >
                    Save Config
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Dashboard;
