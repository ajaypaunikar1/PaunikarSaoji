import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  TrendingUp, Calendar, Download, 
  IndianRupee, ClipboardList, Clock, Users, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';

const Reports: React.FC = () => {
  const { 
    orders, bills, users, attendance, language, 
    payBill, generateBill, resetAllOrders, currentUser 
  } = useApp();
  const t = translations[language];

  const [activeTab, setActiveTab] = useState<'orders' | 'attendance'>('orders');
  
  // Date filter: 'daily' | 'weekly' | 'monthly' | 'custom'
  const [dateFilter, setDateFilter] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Helper: Get user zone or name
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId || (u as any)._id === userId);
    return user ? user.name : 'Unknown Waiter';
  };

  // Helper: Calculate duration between clockIn and clockOut
  const calculateDuration = (inTime: string, outTime?: string) => {
    if (!inTime || !outTime) return '-';
    try {
      const parseTime = (tStr: string) => {
        const parts = tStr.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)?/i);
        if (!parts) return null;
        let hours = parseInt(parts[1], 10);
        const minutes = parseInt(parts[2], 10);
        const ampm = parts[4];
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        return hours * 60 + minutes;
      };
      const inMins = parseTime(inTime);
      const outMins = parseTime(outTime);
      if (inMins === null || outMins === null) return '-';
      let diff = outMins - inMins;
      if (diff < 0) diff += 24 * 60; // overnight
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      return `${hrs}h ${mins}m`;
    } catch (e) {
      return '-';
    }
  };

  // Helper: check if a date string falls in filter
  const isDateInFilter = (dateStr: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    
    // Reset times
    const dTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const tTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    if (dateFilter === 'daily') {
      return dTime === tTime;
    } else if (dateFilter === 'weekly') {
      const sevenDaysAgo = tTime - 7 * 24 * 60 * 60 * 1000;
      return dTime >= sevenDaysAgo && dTime <= tTime;
    } else if (dateFilter === 'monthly') {
      const thirtyDaysAgo = tTime - 30 * 24 * 60 * 60 * 1000;
      return dTime >= thirtyDaysAgo && dTime <= tTime;
    } else if (dateFilter === 'custom') {
      if (!customStartDate || !customEndDate) return true;
      const start = new Date(customStartDate).getTime();
      const end = new Date(customEndDate).getTime();
      return dTime >= start && dTime <= end;
    }
    return false;
  };

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(ord => {
      const orderDateStr = (ord as any).createdAt ? (ord as any).createdAt.split('T')[0] : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      return isDateInFilter(orderDateStr);
    });
  }, [orders, dateFilter, customStartDate, customEndDate]);

  // Order Metrics
  const orderMetrics = useMemo(() => {
    let totalRevenue = 0;
    let totalGST = 0;
    let totalDiscount = 0;
    let totalOrders = filteredOrders.length;

    filteredOrders.forEach(ord => {
      const bill = bills.find(b => b.orderId === ord.id);
      if (bill) {
        if (bill.paymentStatus === 'Paid') {
          totalRevenue += bill.grandTotal;
          totalGST += bill.gst;
          totalDiscount += bill.discount;
        }
      } else {
        if (ord.status === 'Served') {
          totalRevenue += ord.grandTotal;
          totalGST += ord.grandTotal * 0.05;
        }
      }
    });

    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    return { totalRevenue, totalGST, totalDiscount, totalOrders, avgOrderValue };
  }, [filteredOrders, bills]);

  // Filtered Attendance
  const filteredAttendance = useMemo(() => {
    return attendance.filter(att => isDateInFilter(att.date));
  }, [attendance, dateFilter, customStartDate, customEndDate]);

  // Attendance Metrics
  const attendanceMetrics = useMemo(() => {
    const totalRecords = filteredAttendance.length;
    const present = filteredAttendance.filter(a => a.status === 'Present').length;
    const late = filteredAttendance.filter(a => a.status === 'Late').length;
    const absent = filteredAttendance.filter(a => a.status === 'Absent').length;
    
    const activeStaff = users.filter(u => u.status === 'Active').length;
    const uniqueDays = Array.from(new Set(filteredAttendance.map(a => a.date))).length || 1;
    
    const expectedPresence = activeStaff * uniqueDays;
    const presenceRate = expectedPresence > 0 
      ? Math.round(((present + late) / expectedPresence) * 100)
      : 0;

    return { totalRecords, present, late, absent, presenceRate };
  }, [filteredAttendance, users]);

  // CSV Export handlers
  const handleExportOrdersCSV = () => {
    let csv = 'Order ID,Table ID,Waiter,Date/Time,Items,Subtotal,GST,Discount,Grand Total,Status,Payment Method,Payment Status\n';
    
    filteredOrders.forEach(ord => {
      const bill = bills.find(b => b.orderId === ord.id);
      const waiterName = getUserName(ord.waiterId).replace(/,/g, '');
      const dateStr = (ord as any).createdAt ? new Date((ord as any).createdAt).toLocaleString() : ord.timestamp;
      const itemsList = ord.items.map(i => `${i.name} (${i.portion} x${i.quantity})`).join(' | ').replace(/,/g, '');
      
      const subtotal = bill ? bill.subtotal : ord.grandTotal;
      const gst = bill ? bill.gst : Math.round(ord.grandTotal * 0.05 * 100) / 100;
      const discount = bill ? bill.discount : 0;
      const grandTotal = bill ? bill.grandTotal : ord.grandTotal + gst;
      const paymentMethod = bill && bill.paymentMethod ? bill.paymentMethod : '-';
      const paymentStatus = bill ? bill.paymentStatus : 'Unbilled';

      csv += `"${ord.id}","${ord.tableId}","${waiterName}","${dateStr}","${itemsList}",${subtotal},${gst},${discount},${grandTotal},"${ord.status}","${paymentMethod}","${paymentStatus}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Order_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAttendanceCSV = () => {
    let csv = 'Employee Name,Username,Role,Date,Status,Clock In,Clock Out,Duration\n';

    filteredAttendance.forEach(att => {
      const emp = users.find(u => u.id === att.employeeId || (u as any)._id === att.employeeId);
      const empName = emp ? emp.name.replace(/,/g, '') : 'Unknown';
      const username = emp ? emp.username : 'unknown';
      const role = emp ? emp.role : 'Staff';
      const duration = calculateDuration(att.clockIn, att.clockOut);

      csv += `"${empName}","${username}","${role}","${att.date}","${att.status}","${att.clockIn}","${att.clockOut || '-'}","${duration}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Attendance_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-slate-800 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="text-emerald-500" size={22} />
            {t.restaurantAnalytics}
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">
            {language === 'en' ? 'Monitor restaurant performance, sales, and employee logs' : 'रेस्टॉरंटची कामगिरी, विक्री आणि कर्मचारी नोंदींचे निरीक्षण करा'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role === 'SuperAdmin' && (
            <button
              onClick={() => {
                if (window.confirm(language === 'en' ? '⚠️ WARNING: This will permanently delete ALL orders, bills, and reset table statuses. Proceed?' : '⚠️ चेतावणी: हे कायमचे सर्व ऑर्डर्स, बिले हटवेल आणि टेबल्स रीसेट करेल. पुढे जायचे?')) {
                  resetAllOrders();
                }
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition shadow-md shadow-rose-500/10 mr-2"
            >
              {language === 'en' ? 'Reset Orders DB' : 'डेटाबेस रीसेट करा'}
            </button>
          )}

          {/* Date Filters */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          {(['daily', 'weekly', 'monthly', 'custom'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                dateFilter === filter
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {filter === 'daily' ? (language === 'en' ? 'Today' : 'आज') : (filter === 'weekly' ? (language === 'en' ? 'Weekly' : 'साप्ताहिक') : (filter === 'monthly' ? (language === 'en' ? 'Monthly' : 'मासिक') : (language === 'en' ? 'Custom' : 'कस्टम')))}
            </button>
          ))}

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-2">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="text-[10px] font-bold bg-slate-50 border border-slate-200 px-2 py-1 rounded focus:outline-none"
              />
              <span className="text-slate-400 text-xs">{language === 'en' ? 'to' : 'ते'}</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="text-[10px] font-bold bg-slate-50 border border-slate-200 px-2 py-1 rounded focus:outline-none"
              />
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 text-sm font-extrabold uppercase tracking-wide cursor-pointer transition ${
            activeTab === 'orders' 
              ? 'text-emerald-600 border-b-2 border-emerald-500' 
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {t.orderRevenueReports}
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 text-sm font-extrabold uppercase tracking-wide cursor-pointer transition ${
            activeTab === 'attendance' 
              ? 'text-emerald-600 border-b-2 border-emerald-500' 
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {t.attendanceReports}
        </button>
      </div>

      {activeTab === 'orders' ? (
        <div className="space-y-6">
          {/* Order Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-450 block mb-1">{language === 'en' ? 'Total Orders' : 'एकूण ऑर्डर्स'}</span>
                <span className="text-xl font-black text-slate-800">{orderMetrics.totalOrders}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><ClipboardList size={18} /></div>
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-200/60 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">{language === 'en' ? 'Revenue (Paid)' : 'एकूण महसूल'}</span>
                <span className="text-xl font-black text-slate-800">₹{orderMetrics.totalRevenue}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100/50 flex items-center justify-center text-emerald-700"><IndianRupee size={18} /></div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">{language === 'en' ? 'Avg Order Value' : 'सरासरी ऑर्डर मूल्य'}</span>
                <span className="text-xl font-black text-slate-800">₹{orderMetrics.avgOrderValue}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-200/50 flex items-center justify-center text-slate-600"><ArrowUpRight size={18} /></div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-45 block mb-1">{language === 'en' ? 'Total GST' : 'एकूण जीएसटी'}</span>
                <span className="text-xl font-black text-slate-800">₹{Math.round(orderMetrics.totalGST)}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><IndianRupee size={18} /></div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-45 block mb-1">{language === 'en' ? 'Discounts Given' : 'दिलेली सवलत'}</span>
                <span className="text-xl font-black text-slate-800">₹{orderMetrics.totalDiscount}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><IndianRupee size={18} /></div>
            </div>
          </div>

          {/* Orders Table Container */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/40">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">{language === 'en' ? 'Filtered Orders List' : 'फिल्टर केलेली ऑर्डर्स यादी'} ({filteredOrders.length})</h3>
              
              <button
                onClick={handleExportOrdersCSV}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center gap-1.5 transition"
              >
                <Download size={14} /> {t.exportCSV}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-550 tracking-wider">
                    <th className="p-4 pl-6">{language === 'en' ? 'Order ID' : 'ऑर्डर क्र.'}</th>
                    <th className="p-4">{t.tables}</th>
                    <th className="p-4">{t.waiter}</th>
                    <th className="p-4">{language === 'en' ? 'Date/Time' : 'तारीख/वेळ'}</th>
                    <th className="p-4">{language === 'en' ? 'Items' : 'पदार्थ'}</th>
                    <th className="p-4 text-right">{t.subtotal}</th>
                    <th className="p-4 text-right">{t.gstAmount}</th>
                    <th className="p-4 text-right">{t.discount}</th>
                    <th className="p-4 text-right pr-6">{t.grandTotal}</th>
                    <th className="p-4 text-center">{t.orderStatus}</th>
                    <th className="p-4 text-center">{t.payment}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400 font-medium text-xs">{language === 'en' ? 'No orders recorded in this date range.' : 'या कालावधीत कोणतीही ऑर्डर नोंदवली गेली नाही.'}</td>
                    </tr>
                  ) : (
                    filteredOrders.map(ord => {
                      const bill = bills.find(b => b.orderId === ord.id);
                      const subtotal = bill ? bill.subtotal : ord.grandTotal;
                      const gst = bill ? bill.gst : Math.round(ord.grandTotal * 0.05 * 100) / 100;
                      const discount = bill ? bill.discount : 0;
                      const grandTotal = bill ? bill.grandTotal : ord.grandTotal + gst;
                      const dateStr = (ord as any).createdAt ? new Date((ord as any).createdAt).toLocaleString() : ord.timestamp;

                      return (
                        <tr key={ord.id} className="border-b border-slate-100 hover:bg-slate-50/20 text-xs text-slate-700">
                          <td className="p-4 pl-6 font-bold text-slate-900 font-mono">{ord.id.substring(0, 12)}</td>
                          <td className="p-4 font-bold text-slate-900 font-mono">T-{ord.tableId}</td>
                          <td className="p-4 font-bold">{getUserName(ord.waiterId)}</td>
                          <td className="p-4 text-slate-500 font-mono">{dateStr}</td>
                          <td className="p-4 max-w-xs truncate" title={ord.items.map(i => `${i.name} (${i.portion} x${i.quantity})`).join(', ')}>
                            {ord.items.map(i => `${i.name} (${i.portion} x${i.quantity})`).join(', ')}
                          </td>
                          <td className="p-4 text-right font-mono">₹{subtotal}</td>
                          <td className="p-4 text-right text-slate-500 font-mono">₹{gst}</td>
                          <td className="p-4 text-right text-rose-600 font-mono">₹{discount}</td>
                          <td className="p-4 text-right font-black text-slate-900 font-mono pr-6">₹{grandTotal}</td>
                          <td className="p-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                              ord.status === 'Served' ? 'bg-emerald-100 border-emerald-250 text-emerald-700' :
                              ord.status === 'Ready' ? 'bg-teal-100 border-teal-250 text-teal-700' :
                              ord.status === 'Preparing' ? 'bg-blue-100 border-blue-250 text-blue-700' :
                              'bg-amber-100 border-amber-250 text-amber-700'
                            }`}>
                              {ord.status === 'Served' ? t.served : (ord.status === 'Ready' ? t.ready : (ord.status === 'Preparing' ? t.preparing : t.pending))}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            {bill ? (
                              bill.paymentStatus === 'Paid' ? (
                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase border bg-emerald-100 border-emerald-250 text-emerald-700">
                                  {language === 'en' ? 'Paid' : 'भरले'} ({bill.paymentMethod})
                                </span>
                              ) : (
                                <select
                                  value="Pending"
                                  onChange={async (e) => {
                                    const method = e.target.value as PaymentMethod;
                                    if (method !== 'Pending') {
                                      try {
                                        await payBill(bill.id || (bill as any)._id, method);
                                        toast.success(`Payment updated for Order #${ord.id.substring(0, 8)}`);
                                      } catch (err: any) {
                                        toast.error(err.message || "Failed to update payment");
                                      }
                                    }
                                  }}
                                  className="text-[9px] font-black uppercase bg-amber-100 border border-amber-250 text-amber-700 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none"
                                >
                                  <option value="Pending">{language === 'en' ? 'Pending' : 'प्रलंबित'}</option>
                                  <option value="Cash">{language === 'en' ? 'Cash' : 'रोख'}</option>
                                  <option value="UPI">{language === 'en' ? 'UPI' : 'यूपीआय'}</option>
                                  <option value="Card">{language === 'en' ? 'Card' : 'कार्ड'}</option>
                                </select>
                              )
                            ) : (
                              <button
                                onClick={async () => {
                                  try {
                                    // Generate and pay immediately via Cash
                                    const generated = await generateBill(ord.tableId, 0);
                                    await payBill(generated.id || (generated as any)._id, 'Cash');
                                    toast.success(`Order #${ord.id.substring(0, 8)} marked as Paid`);
                                  } catch (err: any) {
                                    toast.error(err.message || "Failed to generate and pay bill");
                                  }
                                }}
                                className="px-2 py-0.5 rounded text-[9px] font-black uppercase border bg-slate-100 border-slate-250 text-slate-650 hover:bg-slate-200 cursor-pointer transition"
                              >
                                {language === 'en' ? 'Mark Paid (Cash)' : 'भरले (रोख)'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Attendance Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-450 block mb-1">{t.totalLogs}</span>
                <span className="text-xl font-black text-slate-800">{attendanceMetrics.totalRecords}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><ClipboardList size={18} /></div>
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-200/60 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">{t.attendanceRate}</span>
                <span className="text-xl font-black text-slate-800">{attendanceMetrics.presenceRate}%</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100/50 flex items-center justify-center text-emerald-700"><Users size={18} /></div>
            </div>

            <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-700 block mb-1">{t.lateArrivals}</span>
                <span className="text-xl font-black text-slate-800">{attendanceMetrics.late} {language === 'en' ? 'Logged' : 'नोंद'}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100/50 flex items-center justify-center text-amber-700"><Clock size={18} /></div>
            </div>

            <div className="p-4 bg-rose-50/50 border border-rose-200/60 rounded-3xl shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-700 block mb-1">{t.absences}</span>
                <span className="text-xl font-black text-slate-800">{attendanceMetrics.absent} {language === 'en' ? 'Logs' : 'नोंदी'}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-100/50 flex items-center justify-center text-rose-700"><Users size={18} /></div>
            </div>
          </div>

          {/* Attendance Table Container */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/40">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">{language === 'en' ? 'Filtered Attendance List' : 'फिल्टर केलेली उपस्थिती यादी'} ({filteredAttendance.length})</h3>
              
              <button
                onClick={handleExportAttendanceCSV}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center gap-1.5 transition"
              >
                <Download size={14} /> {t.exportCSV}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-550 tracking-wider">
                    <th className="p-4 pl-6">{language === 'en' ? 'Employee' : 'कर्मचारी'}</th>
                    <th className="p-4">{t.role}</th>
                    <th className="p-4">{language === 'en' ? 'Date' : 'तारीख'}</th>
                    <th className="p-4">{t.status}</th>
                    <th className="p-4">{t.clockIn}</th>
                    <th className="p-4">{t.clockOut}</th>
                    <th className="p-4 pr-6">{language === 'en' ? 'Duration' : 'कालावधी'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-medium text-xs">{language === 'en' ? 'No attendance logs in this date range.' : 'या कालावधीत कोणतीही उपस्थिती नोंदवली गेली नाही.'}</td>
                    </tr>
                  ) : (
                    filteredAttendance.map(att => {
                      const emp = users.find(u => u.id === att.employeeId || (u as any)._id === att.employeeId);
                      const name = emp ? emp.name : 'Unknown';
                      const role = emp ? emp.role : 'Staff';
                      const duration = calculateDuration(att.clockIn, att.clockOut);

                      return (
                        <tr key={att.id} className="border-b border-slate-100 hover:bg-slate-50/20 text-xs text-slate-700">
                          <td className="p-4 pl-6 font-bold text-slate-900">{name}</td>
                          <td className="p-4 capitalize">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-slate-100 border border-slate-200/80 text-slate-600 uppercase tracking-wide">
                              {role}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-slate-500">{att.date}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                              att.status === 'Present'
                                ? 'bg-emerald-100 border-emerald-250 text-emerald-700'
                                : att.status === 'Late'
                                  ? 'bg-amber-100 border-amber-250 text-amber-700'
                                  : 'bg-rose-100 border-rose-250 text-rose-700'
                            }`}>
                              {att.status === 'Present' ? t.available : (att.status === 'Late' ? (language === 'en' ? 'Late' : 'उशीर') : (language === 'en' ? 'Absent' : 'गैरहजर'))}
                            </span>
                          </td>
                          <td className="p-4 font-mono">{att.clockIn}</td>
                          <td className="p-4 font-mono">{att.clockOut || '-'}</td>
                          <td className="p-4 font-bold text-slate-800 pr-6">{duration}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Reports;
