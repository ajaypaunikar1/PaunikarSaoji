import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { usePrinter } from '../context/PrinterContext';
import { translations } from '../translations/translations';
import { 
  ChefHat, Play, CheckCheck, Check, Printer, Clock, Sparkles, X, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Order, OrderStatus, OrderItem } from '../types/types';

// Component: Kitchen Order Card Timer
const OrderTimer: React.FC<{ timestamp: string }> = ({ timestamp }) => {
  const [elapsed, setElapsed] = useState('0m');

  useEffect(() => {
    const calculateElapsed = () => {
      try {
        const now = new Date();
        const parts = timestamp.split(' ');
        const timeParts = parts[0].split(':');
        let hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);
        const isPM = parts[1]?.toLowerCase() === 'pm';
        
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;

        const orderDate = new Date();
        orderDate.setHours(hours, minutes, 0, 0);

        let diffMs = now.getTime() - orderDate.getTime();
        if (diffMs < 0) {
          diffMs += 24 * 60 * 60 * 1000;
        }

        const diffMins = Math.floor(diffMs / 60000);
        setElapsed(`${diffMins}m`);
      } catch (err) {
        setElapsed('5m');
      }
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 30000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-250">
      <Clock size={11} /> {elapsed}
    </span>
  );
};

const KDS: React.FC = () => {
  const { orders, bills, users, updateOrderStatus, updateOrder, language, settings } = useApp();
  const { printKOT: printKOTThermal, connected } = usePrinter();
  const t = translations[language];

  const [printKOTData, setPrintKOTData] = useState<Order | null>(null);

  // Orders with a paid bill are already checked out — never show them on KDS
  const paidOrderIds = useMemo(
    () => new Set(bills.filter(b => b.paymentStatus === 'Paid').map(b => b.orderId)),
    [bills]
  );

  const activeOrders = orders.filter(o => o.status !== 'Served' && !paidOrderIds.has(o.id));

  // Auto-print KOT for brand new / appended items via Web Serial.
  // Every item carries `printedQty` — the persistent "tick" marking what was
  // already printed on a previous KOT. Only unprinted (non-ticked) quantity
  // is printed, then it gets ticked so it never reprints.
  const initializedRef = useRef<boolean>(false);
  const mountedAtRef = useRef<number>(Date.now());
  const printingKeysRef = useRef<Set<string>>(new Set());

  const itemKey = (orderId: string, item: OrderItem) => `${orderId}::${item.name}::${item.portion}`;

  const collectUnprinted = (order: Order, ignoreGuard = false) => {
    const originals = order.items.filter(item =>
      (item.printedQty ?? 0) < item.quantity &&
      (ignoreGuard || !printingKeysRef.current.has(itemKey(order.id, item)))
    );
    const printCopies = originals.map(item => ({
      ...item,
      quantity: item.quantity - (item.printedQty ?? 0)
    }));
    return { originals, printCopies };
  };

  const printAndMarkPrinted = (order: Order, ignoreGuard = false): OrderItem[] => {
    const { originals, printCopies } = collectUnprinted(order, ignoreGuard);
    if (printCopies.length === 0) return [];

    // Guard immediately so socket/polling re-renders don't double-print
    originals.forEach(item => printingKeysRef.current.add(itemKey(order.id, item)));
    printKOTThermal({ ...order, items: printCopies }, settings);

    // Tick the printed items and persist so they are never printed again
    const updatedItems = order.items.map(item =>
      originals.includes(item) ? { ...item, printedQty: item.quantity } : item
    );
    updateOrder(order.id, { items: updatedItems });
    return printCopies;
  };

  useEffect(() => {
    if (!initializedRef.current) {
      // Seed guard with everything present during initial bulk load so a page
      // mount never triggers a reprint storm for existing orders. Fresh appends
      // after mount still print because their items stay un-ticked.
      orders.forEach(o => o.items.forEach(i => printingKeysRef.current.add(itemKey(o.id, i))));
      initializedRef.current = true;
      return;
    }

    // Grace period: suppress prints while initial data loads on mount.
    if (Date.now() - mountedAtRef.current < 3000) return;

    activeOrders.forEach(order => printAndMarkPrinted(order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const handlePrintKOT = (order: Order) => {
    // Manual print bypasses the in-memory guard but still respects the
    // persisted tick — only non-ticked (never printed) items go out.
    const printCopies = printAndMarkPrinted(order, true);
    if (printCopies.length > 0) {
      setPrintKOTData({ ...order, items: printCopies });
    }
  };

  const getStatusActionLabel = (status: OrderStatus) => {
    switch (status) {
      case 'Pending':
        return t.markPreparing;
      case 'Preparing':
        return t.markReady;
      case 'Ready':
        return t.markServed;
      default:
        return 'Serve';
    }
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'Pending':
        return <Play size={14} className="text-white" />;
      case 'Preparing':
        return <CheckCheck size={14} className="text-slate-950" />;
      case 'Ready':
        return <Sparkles size={14} className="text-white" />;
      default:
        return null;
    }
  };

  const executeStatusAdvance = (order: Order) => {
    let nextStatus: OrderStatus = 'Served';
    if (order.status === 'Pending') nextStatus = 'Preparing';
    else if (order.status === 'Preparing') nextStatus = 'Ready';
    else if (order.status === 'Ready') nextStatus = 'Served';

    const updatedItems = order.items.map(item => ({
      ...item,
      status: (item.status === 'Pending' || item.status === order.status) ? nextStatus : item.status
    }));

    updateOrder(order.id, { items: updatedItems });
    updateOrderStatus(order.id, nextStatus);
  };

  const getCardHeaderColor = (status: OrderStatus) => {
    switch (status) {
      case 'Pending':
        return 'border-t-4 border-t-red-500 bg-red-50/30';
      case 'Preparing':
        return 'border-t-4 border-t-amber-550 bg-amber-50/30';
      case 'Ready':
        return 'border-t-4 border-t-cyan-500 bg-cyan-50/30';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">{t.kitchen}</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Live active preparation queue and order ticket router.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Thermal Printer Status */}
          <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs shadow-sm border ${
            connected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-600'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="font-bold">{connected ? 'Printer' : 'Printer Off'}</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs shadow-sm">
            <ChefHat size={16} className="text-emerald-500" />
            <span className="font-bold text-slate-850">{activeOrders.length} {t.liveOrders}</span>
          </div>
        </div>
      </div>

      {/* KDS Active Card Queue */}
      {activeOrders.length === 0 ? (
        <div className="text-center py-16 p-8 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col items-center gap-2">
          <ChefHat size={42} className="text-slate-400" />
          <p className="text-xs text-slate-500 font-medium">All orders cleared! Waiting for new orders from waiters...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {activeOrders.map((order, orderIndex) => {
              const waiter = users.find(u => u.id === order.waiterId);
              
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                  className={`rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm flex flex-col ${getCardHeaderColor(order.status)}`}
                >
                  
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-100 flex justify-between items-start">
                    <div>
                      <span className="text-xs font-black text-slate-800 font-mono uppercase tracking-wider">{order.isParcel ? 'PARCEL ORDER' : `Table ${order.tableId}`}</span>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-semibold">
                        Waiter: {waiter?.name || order.waiterId}
                      </p>
                      {order.isParcel && order.customerName && (
                        <p className="text-[10px] text-emerald-600 mt-0.5 uppercase tracking-widest font-bold">
                          For: {order.customerName}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2.5 py-1 rounded-full text-xs font-black font-mono bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-xs">
                        Queue #{orderIndex + 1}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">#{order.id.substring(4, 8)}</span>
                    </div>
                  </div>

                  {/* KOT Items List */}
                  <div className="flex-1 p-4 space-y-2">
                    {order.items.filter(item => item.status !== 'Served').map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="text-emerald-600 font-mono font-extrabold">{item.quantity}x</span>
                            <span>{item.name}</span>
                            {(item.printedQty ?? 0) < item.quantity ? (
                              <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wide">
                                (New Added)
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-wide flex items-center gap-0.5">
                                <Check size={9} strokeWidth={3} /> Printed
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-bold bg-slate-100 text-slate-650 px-1.5 py-0.2 rounded border border-slate-150 uppercase tracking-wide">
                              {item.portion}
                            </span>
                            {item.isParcel && (
                              <span className="text-[9px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200 uppercase tracking-wide">
                                PARCEL
                              </span>
                            )}
                            {item.specialNotes && (
                              <span className="text-[9px] text-amber-600 font-semibold italic">
                                "{item.specialNotes}"
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2">
                    
                    {/* Print ticket */}
                    <button
                      onClick={() => handlePrintKOT(order)}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-800 cursor-pointer transition"
                      title="Print KOT"
                    >
                      <Printer size={14} />
                    </button>

                    {/* Progress order */}
                    <button
                      onClick={() => executeStatusAdvance(order)}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        order.status === 'Pending' 
                          ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm' 
                          : order.status === 'Preparing' 
                            ? 'bg-amber-500 hover:bg-amber-650 text-slate-950 shadow-sm' 
                            : 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm'
                      }`}
                    >
                      {getStatusIcon(order.status)}
                      <span>{getStatusActionLabel(order.status)}</span>
                    </button>

                  </div>

                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* HIDDEN receipt print area for KOT */}
      <AnimatePresence>
        {printKOTData && (
          <div className="print-area hidden">
            <div style={{ textAlign: 'center', borderBottom: '1px dashed black', paddingBottom: '10px', marginBottom: '10px' }}>
              <h2 style={{ margin: '0', fontSize: '16px', fontWeight: 'bold' }}>PAUNIKAR SAOJI RESTAURANT</h2>
              <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>KOT TICKET (किचन ऑर्डर तिकीट)</span>
            </div>

            <table style={{ width: '100%', fontSize: '11px', marginBottom: '10px' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>KOT Number:</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>#{printKOTData.id.substring(4, 9)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Table Number:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{printKOTData.isParcel ? 'PARCEL' : `Table ${printKOTData.tableId}`}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Waiter:</td>
                  <td style={{ textAlign: 'right' }}>
                    {users.find(u => u.id === printKOTData.waiterId)?.name || printKOTData.waiterId}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Time Generated:</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{printKOTData.timestamp}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ borderBottom: '1px dashed black', marginBottom: '5px' }} />

            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid black' }}>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Qty</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Item Name (Portion)</th>
                </tr>
              </thead>
              <tbody>
                {printKOTData.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                    <td style={{ verticalAlign: 'top', padding: '4px 0', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {item.quantity}x
                    </td>
                    <td style={{ padding: '4px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>{item.name} {item.isParcel && <span style={{color: '#d946ef'}}>(PARCEL)</span>}</span>
                      <span style={{ fontSize: '9px', display: 'block', textTransform: 'uppercase' }}>
                        Portion: {item.portion}
                      </span>
                      {item.spiceLevel && item.spiceLevel !== 'normal' && (
                        <span style={{ fontSize: '9px', display: 'block', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 'bold' }}>
                          Spice: {item.spiceLevel}
                        </span>
                      )}
                      {item.specialNotes && (
                        <span style={{ fontSize: '9px', fontStyle: 'italic', color: '#333', display: 'block' }}>
                          * Note: "{item.specialNotes}"
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1px dashed black', marginTop: '10px', paddingTop: '5px', textAlign: 'center', fontSize: '9px' }}>
              Printed on: {new Date().toLocaleString()} &bull; Order Synced
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Visual KOT Receipt Preview Modal */}
      <AnimatePresence>
        {printKOTData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-205 flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
                <span className="text-xs font-black uppercase text-slate-800 tracking-wider">{language === 'en' ? 'KOT Receipt Preview' : 'KOT पावती पूर्वदृश्य'}</span>
                <button 
                  onClick={() => setPrintKOTData(null)}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Receipt Body (Paper style) */}
              <div className="p-6 bg-slate-50/50 flex-1 overflow-y-auto flex justify-center">
                <div className="w-full bg-white border border-slate-250 p-5 rounded-2xl shadow-sm font-mono text-xs text-slate-850 space-y-4 max-w-[280px]">
                  <div className="text-center border-b border-dashed border-slate-300 pb-3">
                    <h4 className="font-black text-sm text-slate-900 tracking-tight">PAUNIKAR SAOJI</h4>
                    <span className="text-[9px] text-slate-550 uppercase tracking-widest block mt-0.5">{language === 'en' ? 'KOT Ticket Preview' : 'KOT तिकीट'}</span>
                  </div>

                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="font-bold">KOT ID:</span>
                      <span>#{printKOTData.id.substring(4, 9).toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Table No:</span>
                      <span className="font-extrabold text-emerald-600">{printKOTData.isParcel ? 'PARCEL' : `Table ${printKOTData.tableId}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Waiter:</span>
                      <span>{users.find(u => u.id === printKOTData.waiterId)?.name || printKOTData.waiterId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Time:</span>
                      <span>{printKOTData.timestamp}</span>
                    </div>
                  </div>

                  <div className="border-b border-dashed border-slate-300" />

                  <div className="space-y-3">
                    {printKOTData.items.map((item, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex justify-between items-start text-[11px]">
                          <span className="font-bold">{item.name} {item.isParcel && <span className="text-[9px] text-fuchsia-600">(PARCEL)</span>}</span>
                          <span className="font-bold text-slate-600 font-mono">x{item.quantity}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[8px] text-slate-450 uppercase font-bold">
                          <span>{item.portion}</span>
                          {item.specialNotes && (
                            <span className="text-amber-600 italic">"{item.specialNotes}"</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[8px] text-slate-400">
                    Generated via POS &bull; {new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-150 flex gap-3">
                <button
                  onClick={() => setPrintKOTData(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider cursor-pointer transition text-center"
                >
                  {language === 'en' ? 'Close' : 'बंद करा'}
                </button>
                <button
                  onClick={() => {
                    if (printKOTData) {
                      printKOTThermal(printKOTData, settings);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-md transition text-center flex items-center justify-center gap-1.5"
                >
                  <Zap size={13} /> {language === 'en' ? 'Thermal Print' : 'थर्मल प्रिंट'}
                </button>
                <button
                  onClick={() => {
                    setTimeout(() => {
                      window.print();
                    }, 50);
                    setPrintKOTData(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-500/10 transition text-center"
                >
                  {language === 'en' ? 'Print (PDF)' : 'प्रिंट (PDF)'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default KDS;
