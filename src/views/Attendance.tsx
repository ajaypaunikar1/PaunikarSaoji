import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { Calendar, UserCheck, Clock, UserX, AlertCircle, Save, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';

const Attendance: React.FC = () => {
  const { users, attendance, saveAttendance, language } = useApp();
  const t = translations[language];

  // Tab: 'daily' | 'monthly'
  const [activeView, setActiveView] = useState<'daily' | 'monthly'>('daily');

  // Selected date defaults to today (YYYY-MM-DD)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Month selector (YYYY-MM) defaults to current month
  const currentMonthStr = todayStr.substring(0, 7); // e.g. "2026-07"
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  // Editing state for custom times
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [customClockIn, setCustomClockIn] = useState('09:00:00');
  const [customClockOut, setCustomClockOut] = useState('17:00:00');

  // Filter out inactive users (only active employees are tracked)
  const activeEmployees = users.filter(u => u.status === 'Active');

  const getAttendanceRecord = (employeeId: string, date: string) => {
    return attendance.find(a => a.employeeId === employeeId && a.date === date);
  };

  const handleMarkPresent = (empId: string, date: string = selectedDate) => {
    const emp = users.find(u => u.id === empId);
    saveAttendance(empId, date, 'Present', emp?.shiftStart || '09:00:00', emp?.shiftEnd || '17:00:00');
  };

  const handleMarkLate = (empId: string, date: string = selectedDate) => {
    const emp = users.find(u => u.id === empId);
    saveAttendance(empId, date, 'Late', emp?.shiftStart || '09:00:00', emp?.shiftEnd || '17:00:00');
  };

  const handleMarkAbsent = (empId: string, date: string = selectedDate) => {
    saveAttendance(empId, date, 'Absent', '', '');
  };

  const handleSaveCustomTime = (empId: string, date: string, currentStatus: 'Present' | 'Late' | 'Absent') => {
    saveAttendance(empId, date, currentStatus, customClockIn, customClockOut);
    setEditingEmpId(null);
  };

  // Monthly grid helper computations
  const monthDays = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dayStr = String(dayNum).padStart(2, '0');
      return {
        day: dayNum,
        dateStr: `${yearStr}-${monthStr}-${dayStr}`
      };
    });
  }, [selectedMonth]);

  // Monthly stats computations
  const monthlyStats = useMemo(() => {
    const monthPrefix = selectedMonth; // e.g. "2026-07"
    const monthlyAtt = attendance.filter(a => a.date.startsWith(monthPrefix));
    
    const presentCount = monthlyAtt.filter(a => a.status === 'Present').length;
    const lateCount = monthlyAtt.filter(a => a.status === 'Late').length;
    const absentCount = monthlyAtt.filter(a => a.status === 'Absent').length;

    const totalLogs = monthlyAtt.length;
    const activeStaff = activeEmployees.length;
    const daysCount = monthDays.length;
    const expectedCapacity = activeStaff * daysCount;

    const complianceRate = expectedCapacity > 0
      ? Math.round(((presentCount + lateCount) / expectedCapacity) * 100)
      : 0;

    return { presentCount, lateCount, absentCount, totalLogs, complianceRate };
  }, [attendance, selectedMonth, activeEmployees, monthDays]);

  return (
    <div className="space-y-6 text-slate-800 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <UserCheck className="text-emerald-500" size={22} />
            {language === 'en' ? 'Staff Attendance Management' : 'कर्मचारी उपस्थिती व्यवस्थापन'}
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">
            {language === 'en' ? 'Monitor, record, and verify employee daily presence and timecards' : 'कर्मचार्‍यांच्या दैनिक उपस्थितीची आणि टाइमकार्डची देखरेख, नोंदणी आणि पडताळणी करा'}
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-2xl">
          <button
            onClick={() => setActiveView('daily')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeView === 'daily'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-505 hover:text-slate-800'
            }`}
          >
            <Clock size={14} /> {t.dailyTracker}
          </button>
          <button
            onClick={() => setActiveView('monthly')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeView === 'monthly'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-505 hover:text-slate-800'
            }`}
          >
            <CalendarRange size={14} /> {t.monthlyGrid}
          </button>
        </div>
      </div>

      {activeView === 'daily' ? (
        <div className="space-y-6">
          
          {/* Daily Configurations Bar */}
          <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'en' ? 'Select Tracking Date:' : 'ट्रॅकिंग तारीख निवडा:'}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setEditingEmpId(null);
                }}
                className="text-xs font-bold bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-800 focus:outline-none"
              />
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
              {(() => {
                const records = activeEmployees.map(u => getAttendanceRecord(u.id, selectedDate));
                const present = records.filter(r => r?.status === 'Present').length;
                const late = records.filter(r => r?.status === 'Late').length;
                const absent = records.filter(r => r?.status === 'Absent').length;
                return (
                  <>
                    <span className="flex items-center gap-1 text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {language === 'en' ? 'Present' : 'हजर'}: {present}</span>
                    <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-500" /> {language === 'en' ? 'Late' : 'उशीर'}: {late}</span>
                    <span className="flex items-center gap-1 text-rose-600"><span className="w-2 h-2 rounded-full bg-rose-500" /> {language === 'en' ? 'Absent' : 'गैरहजर'}: {absent}</span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Daily Tracker Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 bg-slate-50/40">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                {language === 'en' ? 'Daily Attendance Matrix' : 'दैनिक उपस्थिती सारणी'} - {new Date(selectedDate).toLocaleDateString(language === 'en' ? 'en-US' : 'mr-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-550 tracking-wider">
                    <th className="p-4 pl-6">{language === 'en' ? 'Employee' : 'कर्मचारी'}</th>
                    <th className="p-4">{t.role}</th>
                    <th className="p-4">{t.zone}</th>
                    <th className="p-4">{t.status}</th>
                    <th className="p-4">{t.clockLogs}</th>
                    <th className="p-4 pr-6 text-right">{t.actionsOverwrites}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEmployees.map(emp => {
                    const record = getAttendanceRecord(emp.id, selectedDate);
                    const isEditing = editingEmpId === emp.id;

                    return (
                      <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/30 transition text-xs font-medium text-slate-850">
                        <td className="p-4 pl-6">
                          <div>
                            <span className="font-bold text-slate-900 block">{emp.name}</span>
                            <span className="text-[10px] text-slate-400">@{emp.username}</span>
                          </div>
                        </td>
                        <td className="p-4 capitalize">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-slate-100 border border-slate-200/80 text-slate-600 uppercase tracking-wide">
                            {emp.role}
                          </span>
                        </td>
                        <td className="p-4 font-bold">{emp.zone}</td>
                        <td className="p-4">
                          {record ? (
                            <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                              record.status === 'Present' ? 'bg-emerald-100 border-emerald-250 text-emerald-700' :
                              record.status === 'Late' ? 'bg-amber-100 border-amber-250 text-amber-700' :
                              'bg-rose-100 border-rose-250 text-rose-700'
                            }`}>
                              {record.status === 'Present' ? (language === 'en' ? 'Present' : 'हजर') : (record.status === 'Late' ? (language === 'en' ? 'Late' : 'उशीर') : (language === 'en' ? 'Absent' : 'गैरहजर'))}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded text-[9px] font-black bg-slate-100 border border-slate-200 text-slate-400 uppercase tracking-wider">{language === 'en' ? 'Unmarked' : 'नोंद नाही'}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input 
                                type="text" 
                                value={customClockIn} 
                                onChange={e => setCustomClockIn(e.target.value)} 
                                className="w-16 p-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono focus:outline-none"
                                placeholder="In"
                              />
                              <span className="text-slate-400">-</span>
                              <input 
                                type="text" 
                                value={customClockOut} 
                                onChange={e => setCustomClockOut(e.target.value)} 
                                className="w-16 p-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono focus:outline-none"
                                placeholder="Out"
                              />
                              <button
                                onClick={() => handleSaveCustomTime(emp.id, selectedDate, record?.status || 'Present')}
                                className="p-1 rounded bg-emerald-500 hover:bg-emerald-450 text-white cursor-pointer"
                                title="Save"
                              >
                                <Save size={11} />
                              </button>
                            </div>
                          ) : (
                            record && (record.clockIn || record.clockOut) ? (
                              <div className="flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                                <Clock size={11} className="text-slate-400" />
                                <span>{record.clockIn || '--'} - {record.clockOut || 'Active'}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">--</span>
                            )
                          )}
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleMarkPresent(emp.id)}
                              className="px-2 py-1 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-250 font-bold text-[10px] uppercase cursor-pointer transition shadow-xs"
                            >
                              {language === 'en' ? 'Present' : 'हजर'}
                            </button>
                            <button
                              onClick={() => handleMarkLate(emp.id)}
                              className="px-2 py-1 rounded bg-white hover:bg-amber-50 text-amber-700 border border-slate-200 hover:border-amber-250 font-bold text-[10px] uppercase cursor-pointer transition shadow-xs"
                            >
                              {language === 'en' ? 'Late' : 'उशीर'}
                            </button>
                            <button
                              onClick={() => handleMarkAbsent(emp.id)}
                              className="px-2 py-1 rounded bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 hover:border-rose-250 font-bold text-[10px] uppercase cursor-pointer transition shadow-xs"
                            >
                              {language === 'en' ? 'Absent' : 'गैरहजर'}
                            </button>
                            {record && record.status !== 'Absent' && (
                              <button
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingEmpId(null);
                                  } else {
                                    setEditingEmpId(emp.id);
                                    setCustomClockIn(record.clockIn || emp.shiftStart || '09:00:00');
                                    setCustomClockOut(record.clockOut || emp.shiftEnd || '17:00:00');
                                  }
                                }}
                                className="px-2 py-1 rounded bg-slate-50 border border-slate-250 hover:bg-slate-100 text-slate-600 font-bold text-[10px] uppercase cursor-pointer transition"
                              >
                                {isEditing ? t.cancel : (language === 'en' ? 'Adjust' : 'बदला')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Monthly Configurations Bar */}
          <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.selectMonth}:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs font-bold bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-800 focus:outline-none"
              />
            </div>

            {/* Monthly Summary Cards */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
              <span className="px-3 py-1.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-100">{t.complianceRate}: {monthlyStats.complianceRate}%</span>
              <span className="px-3 py-1.5 rounded bg-slate-50 text-slate-700 border border-slate-150">{language === 'en' ? 'Presents' : 'एकूण हजेरी'}: {monthlyStats.presentCount}</span>
              <span className="px-3 py-1.5 rounded bg-amber-50 text-amber-800 border border-amber-100">{language === 'en' ? 'Lates' : 'उशीरा'}: {monthlyStats.lateCount}</span>
              <span className="px-3 py-1.5 rounded bg-rose-50 text-rose-800 border border-rose-100">{language === 'en' ? 'Absences' : 'गैरहजर'}: {monthlyStats.absentCount}</span>
            </div>
          </div>

          {/* Visual Matrix Grid */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 bg-slate-50/40">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                {t.monthlyHeatmap} - {new Date(selectedMonth + '-02').toLocaleDateString(language === 'en' ? 'en-US' : 'mr-IN', { month: 'long', year: 'numeric' })}
              </h3>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">
                {language === 'en' ? 'Click any cell to mark or adjust attendance for that specific day' : 'त्या विशिष्ट दिवसाची उपस्थिती नोंदवण्यासाठी किंवा बदलण्यासाठी कोणत्याही सेलवर क्लिक करा'}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-550 tracking-wider">
                    <th className="p-4 pl-6 sticky left-0 bg-slate-50 z-10 w-48">{language === 'en' ? 'Employee' : 'कर्मचारी'}</th>
                    {monthDays.map(d => (
                      <th key={d.day} className="p-2 text-center font-mono text-[9px] min-w-8">{d.day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeEmployees.map(emp => (
                    <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/20 text-xs">
                      {/* Name sticky column */}
                      <td className="p-4 pl-6 sticky left-0 bg-white hover:bg-slate-50/50 font-bold text-slate-900 border-r border-slate-100 z-10">
                        {emp.name}
                      </td>

                      {/* Days columns */}
                      {monthDays.map(d => {
                        const rec = getAttendanceRecord(emp.id, d.dateStr);
                        
                        return (
                          <td 
                            key={d.day} 
                            onClick={() => {
                              setSelectedDate(d.dateStr);
                              setActiveView('daily');
                              toast.info(language === 'en' ? `Selected ${emp.name} for date ${d.dateStr}. Use actions below to adjust.` : `तारीख ${d.dateStr} साठी ${emp.name} निवडले. बदल करण्यासाठी खालील बटणे वापरा.`);
                            }}
                            className="p-1.5 text-center cursor-pointer hover:bg-slate-100 transition duration-150"
                          >
                            {rec ? (
                              rec.status === 'Present' ? (
                                <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 items-center justify-center font-bold text-[8px] mx-auto shadow-xs" title="Present">P</span>
                              ) : rec.status === 'Late' ? (
                                <span className="inline-flex w-5 h-5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 items-center justify-center font-bold text-[8px] mx-auto shadow-xs" title="Late">L</span>
                              ) : (
                                <span className="inline-flex w-5 h-5 rounded-full bg-rose-100 border border-rose-300 text-rose-700 items-center justify-center font-bold text-[8px] mx-auto shadow-xs" title="Absent">A</span>
                              )
                            ) : (
                              <span className="text-slate-300 text-[11px] font-bold">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Attendance;
