import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  UtensilsCrossed, CalendarRange, UserCheck, 
  MapPin, Clock, LogOut, CheckCircle2, User, Trash
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Table, PortionType } from '../types/types';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const WaiterPortal: React.FC = () => {
  const { 
    currentUser, logout, language, changeLanguage, tables, menuItems, 
    addOrder, attendance, markAttendance, clockOut, leaves, submitLeave,
    payroll, orders, generateBill, updateOrder, systemStatus
  } = useApp();
  const router = useRouter();
  const t = translations[language];

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'tables' | 'attendance' | 'leaves' | 'profile'>('tables');

  // Ordering workflow
  const [orderingTable, setOrderingTable] = useState<Table | null>(null);
  const [basket, setBasket] = useState<{ id: string; name: string; portion: PortionType; price: number; quantity: number; specialNotes: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Vegetarian' | 'Egg Curry' | 'Breads' | 'Rice' | 'Papad' | 'Starters' | 'Curries' | 'Handi Dishes'>('All');

  // Draft persistence key
  const DRAFT_KEY = `rms_draft_waiter_${currentUser?.id || 'u5'}`;

  // Load draft order on startup
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.basket && parsed.tableId) {
          setBasket(parsed.basket);
          const tbl = tables.find(t => t.id === parsed.tableId);
          if (tbl) setOrderingTable(tbl);
          toast.success(t.draftLoaded);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [tables]);

  // Save draft order to localStorage
  const saveDraft = () => {
    if (!orderingTable) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      tableId: orderingTable.id,
      basket
    }));
    toast.success(t.draftSaved);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setBasket([]);
    setOrderingTable(null);
  };

  // Leave Form State
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');

  // Attendance Clock-in State
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const attendanceToday = attendance.find(a => a.employeeId === currentUser?.id && a.date === todayStr);

  // Filter tables assigned to waiter zone or show all
  const filteredTables = tables.filter(tbl => currentUser?.zone === 'All' || tbl.zone === currentUser?.zone);

  // Add Item to Order Basket
  const handleAddToBasket = (menuItem: any, portion: PortionType) => {
    if (currentUser?.status === 'Disabled') {
      toast.error('Your account is turned off. You cannot place orders.');
      return;
    }
    const price = portion === 'Half' 
      ? menuItem.variants.find((v: any) => v.name === 'Half')?.price || 0
      : portion === 'Full'
        ? menuItem.variants.find((v: any) => v.name === 'Full')?.price || 0
        : menuItem.price;

    setBasket(prev => {
      const exist = prev.find(i => i.id === menuItem.id && i.portion === portion);
      if (exist) {
        return prev.map(i => i.id === menuItem.id && i.portion === portion 
          ? { ...i, quantity: i.quantity + 1 } 
          : i
        );
      }
      return [...prev, {
        id: menuItem.id,
        name: menuItem.name,
        portion,
        price,
        quantity: 1,
        specialNotes: ''
      }];
    });
  };

  const updateBasketQty = (index: number, amt: number) => {
    if (currentUser?.status === 'Disabled') {
      toast.error('Your account is turned off. You cannot modify orders.');
      return;
    }
    setBasket(prev => prev.map((item, idx) => {
      if (idx === index) {
        const newQty = item.quantity + amt;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(i => i.quantity > 0));
  };

  const updateBasketNotes = (index: number, note: string) => {
    setBasket(prev => prev.map((item, idx) => idx === index ? { ...item, specialNotes: note } : item));
  };

  // Submit Order
  const submitOrderToKitchen = () => {
    if (!orderingTable || basket.length === 0) return;
    if (currentUser?.status === 'Disabled') {
      toast.error('Your account is turned off. You cannot place orders.');
      return;
    }

    const activeOrder = orders.find(o => o.id === orderingTable.orderId);
    if (orderingTable.status === 'Occupied' && activeOrder) {
      // Merge basket items into activeOrder
      const mergedItems = [...activeOrder.items];
      basket.forEach(newItem => {
        const match = mergedItems.find(i => i.name === newItem.name && i.portion === newItem.portion);
        if (match) {
          match.quantity += newItem.quantity;
          if (newItem.specialNotes) {
            match.specialNotes = match.specialNotes ? `${match.specialNotes} | ${newItem.specialNotes}` : newItem.specialNotes;
          }
        } else {
          mergedItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            name: newItem.name,
            quantity: newItem.quantity,
            portion: newItem.portion,
            price: newItem.price,
            specialNotes: newItem.specialNotes
          });
        }
      });

      updateOrder(activeOrder.id, { items: mergedItems });
      toast.success(`KOT sent & order updated for Table ${orderingTable.id}!`);
    } else {
      // Create new order
      addOrder(orderingTable.id, basket, '');
    }
    clearDraft();
  };

  // Handle Leave Submission
  const handleLeaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim() || !leaveStart || !leaveEnd) {
      toast.error('Please fill all fields');
      return;
    }
    submitLeave(leaveStart, leaveEnd, leaveReason);
    setLeaveReason('');
    setLeaveStart('');
    setLeaveEnd('');
  };

  const waiterPayroll = payroll.filter(p => p.employeeId === currentUser?.id);
  const waiterStats = useMemo(() => {
    const waiterOrders = orders.filter(o => o.waiterId === currentUser?.id || (o as any).waiterId === (currentUser as any)?._id);
    const totalOrdersCount = waiterOrders.length;
    const totalRevenueGenerated = waiterOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    return { totalOrdersCount, totalRevenueGenerated };
  }, [orders, currentUser]);

  return (
    <div className="min-h-screen bg-[#F7F7F8] text-slate-800 flex flex-col justify-between select-none">
      
      {/* Mobile Top App Bar */}
      <header className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
            PS
          </div>
          <div>
            <h1 className="text-xs font-black text-slate-800 m-0 tracking-tight">{currentUser?.name}</h1>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <MapPin size={9} /> Zone {currentUser?.zone} &bull; 
              <span className={attendanceToday ? "text-emerald-600 font-extrabold" : "text-rose-600 font-extrabold"}>
                {attendanceToday ? "Clocked In" : "Not Clocked In"}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* System Status Indicators */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-2 py-1 rounded-lg text-[8px] font-bold select-none h-7">
            <span className={`w-1.5 h-1.5 rounded-full ${systemStatus.server === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className={`w-1.5 h-1.5 rounded-full ${systemStatus.database === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-450 uppercase tracking-wider">POS Status</span>
          </div>

          {/* Lang Toggle */}
          <button 
            onClick={() => changeLanguage(language === 'en' ? 'mr' : 'en')}
            className="text-[10px] font-bold px-2 py-1 bg-slate-50 border border-slate-200 rounded cursor-pointer"
          >
            {language === 'en' ? 'मराठी' : 'EN'}
          </button>
          {/* Logout */}
          <button 
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="p-1 rounded bg-rose-50 border border-rose-200 text-rose-600 cursor-pointer hover:bg-rose-100"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 overflow-y-auto p-4 pb-20">
        {currentUser?.status === 'Disabled' && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-black rounded-2xl flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
            <span>Account Turned Off: Ordering is disabled. You can view all information but cannot place or modify orders.</span>
          </div>
        )}
        <AnimatePresence mode="wait">
          
          {/* TAB: TABLES */}
          {activeTab === 'tables' && (
            <motion.div 
              key="tables" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {!orderingTable ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">Assigned Tables</span>
                    <span className="text-[10px] text-slate-400 font-bold">{filteredTables.length} Tables</span>
                  </div>

                  {/* Table Selection Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {filteredTables.map(tbl => {
                      const ord = orders.find(o => o.id === tbl.orderId);
                      
                      return (
                        <div
                          key={tbl.id}
                          onClick={() => {
                            if (currentUser?.status === 'Disabled') {
                              toast.error('Account is disabled. Cannot take orders.');
                              return;
                            }
                            if (tbl.status === 'Available' || tbl.status === 'Occupied' || tbl.status === 'Billing') {
                              setOrderingTable(tbl);
                              setBasket([]);
                            } else {
                              toast.info(`Table status: ${tbl.status}`);
                            }
                          }}
                          className={`p-4 rounded-2xl border flex flex-col justify-between h-28 cursor-pointer shadow-sm transition duration-200 hover:scale-[1.01] ${
                            currentUser?.status === 'Disabled'
                              ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                              : tbl.status === 'Occupied' 
                                ? 'bg-amber-50 border-amber-200 text-amber-900' 
                                : tbl.status === 'Billing'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-350'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold font-mono">T-{tbl.id}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              currentUser?.status === 'Disabled'
                                ? 'bg-rose-500'
                                : tbl.status === 'Available' 
                                  ? 'bg-slate-300' 
                                  : tbl.status === 'Occupied' 
                                    ? 'bg-amber-500' 
                                    : tbl.status === 'Billing' 
                                      ? 'bg-emerald-500 animate-pulse'
                                      : 'bg-slate-300'
                            }`} />
                          </div>
                          
                          <div>
                            <span className="text-[10px] font-bold block capitalize text-slate-500">
                              {currentUser?.status === 'Disabled' ? 'Unavailable' : tbl.status}
                            </span>
                            {ord && currentUser?.status !== 'Disabled' && (
                              <span className="text-xs font-bold text-emerald-600 font-mono">₹{ord.grandTotal}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* ORDER PLACEMENT SCREEN */
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={clearDraft}
                      className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded font-bold cursor-pointer hover:bg-slate-50"
                    >
                      ← {t.back}
                    </button>
                    <span className="text-xs font-bold text-slate-800 font-mono">Table {orderingTable?.id} Order</span>
                    <button 
                      onClick={saveDraft}
                      className="px-2.5 py-1 text-[11px] bg-white border border-indigo-300 text-indigo-600 rounded font-bold cursor-pointer hover:bg-indigo-50/50"
                    >
                      Save Draft
                    </button>
                  </div>

                  {/* Menu Item Quick Selector */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-slate-550 uppercase tracking-wider">Categories / श्रेण्या</h4>
                    
                    {/* Category tabs */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
                      {(['All', 'Vegetarian', 'Egg Curry', 'Breads', 'Rice', 'Papad', 'Starters', 'Curries', 'Handi Dishes'] as const).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2.5 py-1 text-[10px] rounded-lg font-bold border transition whitespace-nowrap cursor-pointer ${
                            selectedCategory === cat
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-slate-200 text-slate-500'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto p-1">
                      {menuItems.filter(m => m.isAvailable && (selectedCategory === 'All' || m.category === selectedCategory)).map(item => (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:border-slate-350 transition shadow-xs gap-2 min-h-24">
                          <div>
                            <span className="text-[8px] font-bold uppercase text-slate-400 block">{item.category}</span>
                            <span className="font-bold text-slate-800 text-xs line-clamp-2 leading-tight">{item.name}</span>
                          </div>
                          
                          <div className="flex flex-col gap-1 mt-1">
                            {item.portionMode === 'Variant' ? (
                              <div className="flex flex-col gap-1">
                                {item.variants.map((v, vIdx) => (
                                  <button
                                    key={vIdx}
                                    onClick={() => handleAddToBasket(item, v.name as PortionType)}
                                    className="w-full py-1 px-1 bg-slate-50 border border-slate-200 rounded text-[9px] font-bold text-indigo-600 cursor-pointer text-center hover:bg-indigo-50 hover:border-indigo-200 transition"
                                  >
                                    {v.name} (₹{v.price})
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddToBasket(item, 'Single')}
                                className="w-full py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-indigo-600 cursor-pointer text-center hover:bg-indigo-50 hover:border-indigo-200 transition"
                              >
                                Add (₹{item.price})
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {orderingTable.status === 'Occupied' && (() => {
                    const activeOrder = orders.find(o => o.id === orderingTable.orderId);
                    if (!activeOrder) return null;
                    return (
                      <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-500/20 space-y-2">
                        <div className="flex justify-between items-center border-b border-indigo-500/10 pb-1.5">
                          <h4 className="text-[11px] font-black uppercase text-indigo-800 tracking-wider">{t.activeTableOrder}</h4>
                          <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100/60 px-1.5 py-0.5 rounded">{language === 'en' ? 'Ordered' : 'नोंदवलेले'}</span>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {activeOrder.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <div>
                                <span className="font-semibold text-slate-800">{item.name}</span>
                                <span className="text-[9px] text-slate-400 ml-1.5 uppercase font-bold">{item.portion}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-600">x{item.quantity}</span>
                                <button
                                  onClick={() => {
                                    const originalItem = menuItems.find(m => m.id === item.id) || { id: item.id, name: item.name, price: item.price, variants: [], portionMode: 'Single' };
                                    handleAddToBasket(originalItem, item.portion);
                                    toast.success(language === 'en' ? `Added another ${item.name} to KOT basket` : `KOT टोपलीत आणखी एक ${item.name} जोडले`);
                                  }}
                                  className="px-1.5 py-0.5 bg-white border border-indigo-200 text-indigo-700 text-[9px] font-extrabold rounded shadow-2xs hover:bg-indigo-50 cursor-pointer"
                                >
                                  + {language === 'en' ? 'Repeat' : 'पुन्हा घ्या'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Order Basket */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[11px] font-bold text-slate-550 uppercase tracking-wider">{t.newKotAdditions}</h4>
                      {basket.length > 0 && (
                        <button 
                          onClick={() => setBasket([])}
                          className="text-[10px] text-rose-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Trash size={10} /> {language === 'en' ? 'Clear' : 'साफ करा'}
                        </button>
                      )}
                    </div>
                    
                    {basket.length === 0 ? (
                      <div className="text-center p-6 bg-white border border-slate-205 rounded-2xl text-xs text-slate-400">
                        {language === 'en' ? 'Basket is empty. Select items above.' : 'टोपली रिकामी आहे. वरून पदार्थ निवडा.'}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {basket.map((item, idx) => (
                          <div key={idx} className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col gap-2 shadow-xs">
                            <div className="flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-slate-805">{item.name}</span>
                                <span className="ml-1 text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100">{item.portion}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => updateBasketQty(idx, -1)}
                                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="font-bold w-4 text-center font-mono">{item.quantity}</span>
                                <button 
                                  onClick={() => updateBasketQty(idx, 1)}
                                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <input 
                              type="text" 
                              placeholder="Kitchen instructions (e.g. spicy, no onions)" 
                              value={item.specialNotes}
                              onChange={(e) => updateBasketNotes(idx, e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-[10px] px-2 py-1 rounded focus:outline-none focus:border-emerald-500 text-slate-700"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Send KOT action */}
                  {basket.length > 0 && (
                    <button
                      onClick={submitOrderToKitchen}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-indigo-600/20 transition"
                    >
                      {t.newOrder} &bull; Send KOT
                    </button>
                  )}

                  {orderingTable.status === 'Occupied' && (
                    <button
                      onClick={() => {
                        toast.warning(language === 'en' ? `Request checkout/generate bill for Table ${orderingTable.id}?` : `टेबल क्र. ${orderingTable.id} साठी चेकआउटची विनंती करायची?`, {
                          action: {
                            label: language === 'en' ? "Yes, Request" : "होय, विनंती करा",
                            onClick: async () => {
                              await generateBill(orderingTable.id, 0);
                              clearDraft();
                            }
                          },
                          duration: 8000,
                        });
                      }}
                      className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-cyan-500/10 transition mt-2"
                    >
                      {t.requestCheckout}
                    </button>
                  )}

                  {orderingTable.status === 'Billing' && (
                    <div className="space-y-2 mt-2">
                      <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-center">
                        <span className="text-xs font-bold text-cyan-800 uppercase tracking-wider block">
                          Checkout Requested
                        </span>
                        <span className="text-[10px] text-cyan-600">Bill has been generated & sent to counter.</span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('rms_token');
                            await fetch(`http://localhost:5000/api/billing/reset-checkout/${orderingTable.id}`, {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            toast.success(`Table ${orderingTable.id} checkout request cancelled.`);
                            clearDraft();
                          } catch {
                            setTableStatus(orderingTable.id, 'Occupied');
                            clearDraft();
                          }
                        }}
                        className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition"
                      >
                        Cancel Checkout Request
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: ATTENDANCE */}
          {activeTab === 'attendance' && (
            <motion.div 
              key="attendance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Shift Logging</h3>
              
              {/* Status Indicator */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-505 font-medium">Shift Status (Today)</span>
                  {attendanceToday ? (
                    <span className="px-2 py-0.5 rounded font-extrabold text-[9px] bg-emerald-100 border border-emerald-200 text-emerald-700 uppercase">
                      {attendanceToday.status}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded font-extrabold text-[9px] bg-rose-100 border border-rose-200 text-rose-700 uppercase">
                      Absent / Unregistered
                    </span>
                  )}
                </div>

                {attendanceToday && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-150">
                      <span className="text-slate-500 text-[10px] block">Clock In</span>
                      <span className="font-bold text-slate-800 font-mono">{attendanceToday.clockIn}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-150">
                      <span className="text-slate-500 text-[10px] block">Clock Out</span>
                      <span className="font-bold text-slate-800 font-mono">{attendanceToday.clockOut || '-- : -- : --'}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => markAttendance('Present')}
                    disabled={!!attendanceToday}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    <span>{t.clockIn}</span>
                  </button>
                  
                  <button
                    onClick={clockOut}
                    disabled={!attendanceToday || !!attendanceToday.clockOut}
                    className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Clock size={14} />
                    <span>{t.clockOut}</span>
                  </button>
                </div>
              </div>

              {/* Attendance History */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.attendanceHistory}</h4>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {attendance.filter(a => a.employeeId === currentUser?.id).map(a => (
                    <div key={a.id} className="p-3 rounded-xl bg-white border border-slate-200 flex justify-between items-center text-xs shadow-sm">
                      <div>
                        <span className="font-bold text-slate-850">{a.date}</span>
                        <p className="text-[9px] text-slate-500 mt-0.5 m-0">In: {a.clockIn} &bull; Out: {a.clockOut || 'Active'}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase ${a.status === 'Present' ? 'text-emerald-600' : 'text-amber-550'}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB: LEAVES */}
          {activeTab === 'leaves' && (
            <motion.div 
              key="leaves" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{t.applyLeave}</h3>
              
              {/* Leave request form */}
              <form onSubmit={handleLeaveRequest} className="p-4 rounded-2xl bg-white border border-slate-205 space-y-3 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">{t.startDate}</label>
                    <input 
                      type="date" 
                      value={leaveStart}
                      onChange={e => setLeaveStart(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs p-2 rounded focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">{t.endDate}</label>
                    <input 
                      type="date" 
                      value={leaveEnd}
                      onChange={e => setLeaveEnd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs p-2 rounded focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-505 mb-1">{t.reason}</label>
                  <textarea 
                    value={leaveReason}
                    onChange={e => setLeaveReason(e.target.value)}
                    placeholder="Enter reason for leave..."
                    className="w-full bg-slate-50 border border-slate-200 text-xs p-2 rounded focus:outline-none h-16 resize-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Submit Application
                </button>
              </form>

              {/* Leave Logs */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.leaveHistory}</h4>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {leaves.filter(l => l.employeeId === currentUser?.id).map(l => (
                    <div key={l.id} className="p-3 rounded-xl bg-white border border-slate-200 flex justify-between items-center text-xs shadow-sm">
                      <div>
                        <span className="font-bold text-slate-800">{l.startDate} to {l.endDate}</span>
                        <p className="text-[10px] text-slate-505 mt-0.5 truncate max-w-[200px] m-0">"{l.reason}"</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                        l.status === 'Approved' 
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-700' 
                          : l.status === 'Rejected'
                            ? 'bg-rose-105 border-rose-200 text-rose-700'
                            : 'bg-amber-100 border-amber-200 text-amber-600'
                      }`}>
                        {l.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB: PROFILE */}
          {activeTab === 'profile' && (
            <motion.div 
              key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Employee Summary</h3>
              
              {/* Profile Card */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200 flex flex-col items-center text-center shadow-sm">
                <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-2xl mb-3">
                  {currentUser?.name.charAt(0)}
                </div>
                <h4 className="text-sm font-extrabold text-slate-800 m-0">{currentUser?.name}</h4>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">{currentUser?.role}</p>

                {/* Rating / Performance */}
                <div className="flex gap-1.5 mt-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span 
                      key={i} 
                      className={`text-xs ${i < (currentUser?.performance || 5) ? 'text-amber-500' : 'text-slate-300'}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>

              {/* Waiter Statistics Cards */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.mySalesPerformance}</h4>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 text-[10px] block mb-0.5">{t.ordersTaken}</span>
                    <span className="font-bold text-slate-800 font-mono">{waiterStats.totalOrdersCount} {language === 'en' ? 'Orders' : 'ऑर्डर्स'}</span>
                  </div>
                  
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 text-[10px] block mb-0.5">{t.salesGenerated}</span>
                    <span className="font-bold text-indigo-600 font-mono">₹{waiterStats.totalRevenueGenerated}</span>
                  </div>
                </div>
              </div>

              {/* Payroll stats */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salary & Payroll Status</h4>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 text-[10px] block mb-0.5">Base Pay</span>
                    <span className="font-bold text-slate-800 font-mono">₹{currentUser?.salary}</span>
                  </div>
                  
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 text-[10px] block mb-0.5">Overtime</span>
                    <span className="font-bold text-emerald-600 font-mono">{currentUser?.overtimeHours} hrs</span>
                  </div>
                </div>

                <div className="space-y-2 mt-3 pt-3 border-t border-slate-150">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block tracking-wider">Recent Payslips</span>
                  {waiterPayroll.map(p => (
                    <div key={p.id} className="flex justify-between items-center text-xs py-1.5">
                      <span className="font-bold text-slate-600">{p.month}</span>
                      <span className="font-bold text-slate-800 font-mono">₹{p.netSalary}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-200 text-emerald-700 text-[8px] font-bold uppercase">{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Bottom Mobile Tab Bar */}
      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 z-35 w-[92%] max-w-md bg-[#1B1B2E]/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 flex items-center justify-around px-2 py-2">
        
        {/* Tab 1: Tables */}
        <button 
          onClick={() => {
            setActiveTab('tables');
            setOrderingTable(null);
          }}
          className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
            activeTab === 'tables' ? 'text-indigo-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <UtensilsCrossed size={18} />
          <span className="text-[9px] font-bold uppercase tracking-wider">{t.tables}</span>
        </button>

        {/* Tab 2: Attendance */}
        <button 
          onClick={() => setActiveTab('attendance')}
          className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
            activeTab === 'attendance' ? 'text-indigo-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <UserCheck size={18} />
          <span className="text-[9px] font-bold uppercase tracking-wider">Hours</span>
        </button>

        {/* Tab 3: Leaves */}
        <button 
          onClick={() => setActiveTab('leaves')}
          className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
            activeTab === 'leaves' ? 'text-indigo-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <CalendarRange size={18} />
          <span className="text-[9px] font-bold uppercase tracking-wider font-sans">Leaves</span>
        </button>

        {/* Tab 4: Profile */}
        <button 
          onClick={() => setActiveTab('profile')}
          className={`p-2.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
            activeTab === 'profile' ? 'text-indigo-400 scale-105' : 'text-slate-400 hover:text-white'
          }`}
        >
          <User size={18} />
          <span className="text-[9px] font-bold uppercase tracking-wider">Payroll</span>
        </button>

      </footer>

    </div>
  );
};

export default WaiterPortal;
