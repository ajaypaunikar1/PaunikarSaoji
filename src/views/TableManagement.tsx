import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrinter } from '../context/PrinterContext';
import { translations } from '../translations/translations';
import { 
  Users, CheckCircle2, ShoppingBag, Plus, Trash2,
  ArrowRightLeft, GitMerge, Columns, PlusCircle, X, Check,
  Settings, Eye, HelpCircle, LayoutGrid, ChevronDown, Printer,
  Receipt, Wallet, Smartphone, CreditCard, Percent
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Table, PortionType, TableStatus, Bill, PaymentMethod } from '../types/types';
import QtyStepper from '../components/QtyStepper';
import { resolvePortionPrice } from '../utils/variants';
import { formatCurrency } from '../utils/currency';
import { toast } from 'sonner';

const STATUS_STYLES: Record<TableStatus, { card: string; badge: string; badgeText: string }> = {
  'Available':  { card: 'bg-white border-gray-200',               badge: 'bg-gray-100 text-gray-500',        badgeText: 'Available'  },
  'Occupied':   { card: 'bg-amber-50 border-amber-200',            badge: 'bg-amber-100 text-amber-700',      badgeText: 'Dine In'    },
  'Reserved':   { card: 'bg-blue-50 border-blue-200',              badge: 'bg-blue-100 text-blue-700',        badgeText: 'Reserved'   },
  'Cleaning':   { card: 'bg-purple-50 border-purple-200',          badge: 'bg-purple-100 text-purple-700',    badgeText: 'Cleaning'   },
  'Billing':    { card: 'bg-emerald-50 border-emerald-200',        badge: 'bg-emerald-100 text-emerald-700',  badgeText: 'Billing'    },
};

const TableManagement: React.FC = () => {
  const { 
    tables, orders, menuItems, language, mergedGroups, zones,
    addOrder, updateOrder, mergeTables, splitTables, 
    transferTable, generateBill, payBill, setTableStatus, users, assignWaiter,
    addTable, removeTable, addZone, removeZone, unmergeTables, settings
  } = useApp();
  const { printBill: printBillThermal } = usePrinter();
  const t = translations[language];

  // UI state
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeAction, setActiveAction] = useState<'details' | 'transfer' | 'merge' | 'split' | 'addItems' | 'billing' | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [activeZone, setActiveZone] = useState<string>(zones[0] || 'A');
  const [newZoneName, setNewZoneName] = useState<string>('');
  const [filterPill, setFilterPill] = useState<'All' | 'Dine In' | 'Available' | 'Billing' | 'Cleaning'>('All');

  // Operations state
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [mergeSources, setMergeSources] = useState<number[]>([]);
  const [splitTarget, setSplitTarget] = useState<number | null>(null);
  const [splitItemsCheck, setSplitItemsCheck] = useState<{ id: string; portion: PortionType; price: number; name: string; quantity: number }[]>([]);

  // Billing panel state
  const [billDiscountPct, setBillDiscountPct] = useState<number>(0);
  const [billPaymentMethod, setBillPaymentMethod] = useState<PaymentMethod>('Cash');
  const [billProcessing, setBillProcessing] = useState<boolean>(false);
  const [orderItemsList, setOrderItemsList] = useState<{ id: string; name: string; portion: PortionType; price: number; quantity: number; specialNotes: string; isParcel?: boolean }[]>([]);
  const [addCategory, setAddCategory] = useState<string>('All');
  const [guestCount, setGuestCount] = useState<number>(2);

  // Active order for selected table
  const activeOrder = selectedTable?.orderId ? orders.find(o => o.id === selectedTable.orderId) : undefined;

  // Auto-sync selected table whenever tables/orders update (from socket or fast poll)
  useEffect(() => {
    if (!selectedTable) return;
    const freshTable = tables.find(t => t.id === selectedTable.id);
    if (!freshTable) return;
    // Only update if something actually changed
    const changed = 
      freshTable.status !== selectedTable.status ||
      freshTable.orderId !== selectedTable.orderId ||
      freshTable.guests !== selectedTable.guests ||
      freshTable.waiterId !== selectedTable.waiterId;
    if (changed) setSelectedTable(freshTable);
  }, [tables, orders]);

  // Zone tables
  const zoneTables = tables.filter(t => t.zone === activeZone);

  // Filter pills
  const filteredTables = useMemo(() => {
    if (filterPill === 'All') return zoneTables;
    if (filterPill === 'Dine In') return zoneTables.filter(t => t.status === 'Occupied');
    if (filterPill === 'Available') return zoneTables.filter(t => t.status === 'Available');
    if (filterPill === 'Billing') return zoneTables.filter(t => t.status === 'Billing');
    if (filterPill === 'Cleaning') return zoneTables.filter(t => t.status === 'Cleaning');
    return zoneTables;
  }, [zoneTables, filterPill]);

  const pillCounts = useMemo(() => ({
    all: zoneTables.length,
    dineIn: zoneTables.filter(t => t.status === 'Occupied').length,
    available: zoneTables.filter(t => t.status === 'Available').length,
    billing: zoneTables.filter(t => t.status === 'Billing').length,
    cleaning: zoneTables.filter(t => t.status === 'Cleaning').length,
  }), [zoneTables]);

  const handleTableClick = (table: Table) => {
    if (isEditMode) return;
    setSelectedTable(table);
    setActiveAction('details');
    setGuestCount(table.guests || 2);
    setOrderItemsList([]);
    setMergeSources([]);
    setTransferTarget(null);
    setSplitTarget(null);
    setSplitItemsCheck([]);
  };

  const closeDetails = () => {
    setSelectedTable(null);
    setActiveAction(null);
  };

  const executeTransfer = () => {
    if (!selectedTable || !transferTarget) return;
    transferTable(selectedTable.id, transferTarget);
    closeDetails();
  };

  const executeMerge = () => {
    if (!selectedTable || mergeSources.length === 0) return;
    mergeTables(mergeSources, selectedTable.id);
    closeDetails();
  };

  const executeSplit = () => {
    if (!selectedTable || !splitTarget || splitItemsCheck.length === 0) return;
    const targetTable = tables.find(tbl => tbl.id === splitTarget);
    if (!targetTable || targetTable.status !== 'Available') {
      toast.error('Split destination table must be Available');
      return;
    }
    splitTables(selectedTable.id, splitTarget, splitItemsCheck);
    closeDetails();
  };

  const handleAddToOrder = (menuItem: any, portion: PortionType) => {
    const price = resolvePortionPrice(menuItem, portion);

    setOrderItemsList(prev => {
      const exist = prev.find(i => i.id === menuItem.id && i.portion === portion);
      if (exist) {
        return prev.map(i => i.id === menuItem.id && i.portion === portion 
          ? { ...i, quantity: i.quantity + 1 } 
          : i
        );
      }
      return [...prev, { id: menuItem.id, name: menuItem.name, portion, price, quantity: 1, specialNotes: '' }];
    });
  };

  const handleToggleParcel = (index: number) => {
    setOrderItemsList(prev => prev.map((item, idx) => {
      if (idx === index) {
        return { ...item, isParcel: !item.isParcel };
      }
      return item;
    }));
  };

  /** Absolute quantity setter for direct numeric entry in the basket. */
  const handleSetItemQty = (index: number, qty: number) => {
    const clamped = Math.min(999, Math.max(1, Math.floor(qty)));
    setOrderItemsList(prev => prev.map((item, idx) =>
      idx === index ? { ...item, quantity: clamped } : item
    ));
  };

  const handleUpdateActiveOrderItemQty = (itemIndex: number, amt: number) => {
    if (!activeOrder) return;
    const updatedItems = activeOrder.items.map((item, idx) => {
      if (idx === itemIndex) {
        const newQty = item.quantity + amt;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(i => i.quantity > 0);
    updateOrder(activeOrder.id, { items: updatedItems });
    toast.success('Order quantity updated');
  };

  const handleRemoveActiveOrderItem = (itemIndex: number) => {
    if (!activeOrder) return;
    const updatedItems = activeOrder.items.filter((_, idx) => idx !== itemIndex);
    updateOrder(activeOrder.id, { items: updatedItems });
    toast.success('Item removed from order');
  };

  // Full payment & checkout straight from the Tables screen
  const handleTablePayment = async () => {
    if (!selectedTable || !activeOrder) {
      toast.error('No active order to bill');
      return;
    }
    if (billProcessing) return;
    setBillProcessing(true);
    try {
      const discountAmt = Math.round(activeOrder.grandTotal * (billDiscountPct / 100) * 100) / 100;
      const finalBill: Bill = await generateBill(selectedTable.id, discountAmt);
      await payBill(finalBill.id, billPaymentMethod);

      // Thermal print (non-blocking so a printer failure never blocks checkout)
      try {
        const waiterName = users.find(u => u.id === activeOrder.waiterId)?.name || 'Staff';
        await printBillThermal({ ...finalBill, paymentMethod: billPaymentMethod }, activeOrder, settings, waiterName);
      } catch {
        // Printer unavailable — payment already succeeded
      }

      toast.success(`Table ${selectedTable.id} paid via ${billPaymentMethod}. Table cleared.`);
      setBillDiscountPct(0);
      closeDetails();
    } catch (err: any) {
      toast.error(err.message || 'Payment failed');
    } finally {
      setBillProcessing(false);
    }
  };

  const executeAddOrder = () => {
    if (!selectedTable) return;
    if (orderItemsList.length === 0) {
      toast.error('Add at least one item to place order!');
      return;
    }
    if (activeOrder) {
      const currentItems = [...activeOrder.items];
      orderItemsList.forEach(newItem => {
        const exist = currentItems.find(c => c.id === newItem.id && c.portion === newItem.portion && c.isParcel === newItem.isParcel);
        if (exist) {
          exist.quantity += newItem.quantity;
          exist.status = 'Pending';
        } else {
          currentItems.push({
            id: `${activeOrder.id}-item-${Date.now()}-${Math.floor(Math.random()*100)}`,
            name: newItem.name, quantity: newItem.quantity,
            portion: newItem.portion, price: newItem.price, specialNotes: newItem.specialNotes,
            status: 'Pending', isParcel: newItem.isParcel
          });
        }
      });
      updateOrder(activeOrder.id, { items: currentItems, status: 'Pending' });
      toast.success('Items appended to current order');
    } else {
      addOrder(selectedTable.id, orderItemsList, '');
    }
    setOrderItemsList([]);
    closeDetails();
  };

  return (
    <div className="flex h-full flex-col min-w-0 overflow-hidden -m-6" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ====== HEADER: FILTER + ZONE ====== */}
      <div className="px-6 pt-5 pb-3 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Order Line</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEditMode ? 'Edit layout: add/remove tables and zones.' : 'Click a table card to open details modal'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Zone selector */}
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5">
              {zones.map(z => (
                <button key={z} onClick={() => { setActiveZone(z); setSelectedTable(null); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${activeZone === z ? 'bg-[#1B1B2E] text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  Zone {z}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setIsEditMode(!isEditMode); setSelectedTable(null); setActiveAction(null); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${isEditMode ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {isEditMode ? <Eye size={13} /> : <Settings size={13} />}
              {isEditMode ? 'Exit Edit' : 'Edit Layout'}
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {([
            { label: 'All', count: pillCounts.all },
            { label: 'Dine In', count: pillCounts.dineIn },
            { label: 'Available', count: pillCounts.available },
            { label: 'Billing', count: pillCounts.billing },
            { label: 'Cleaning', count: pillCounts.cleaning },
          ] as const).map(pill => (
            <button
              key={pill.label}
              onClick={() => setFilterPill(pill.label)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                filterPill === pill.label
                  ? 'bg-[#1B1B2E] text-white border-[#1B1B2E] shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {pill.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filterPill === pill.label ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {pill.count}
              </span>
            </button>
          ))}

          {isEditMode && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
              <input type="text" placeholder="New Zone" value={newZoneName}
                onChange={e => setNewZoneName(e.target.value.toUpperCase())}
                className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none w-24 uppercase" />
              <button onClick={() => { if (!newZoneName) return; addZone(newZoneName); setActiveZone(newZoneName); setNewZoneName(''); }}
                className="p-1.5 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700">
                <Plus size={13} />
              </button>
              <button onClick={() => addTable(activeZone)}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-indigo-700 flex items-center gap-1">
                <PlusCircle size={13} /> Add Table
              </button>
              {zones.length > 1 && (
                <button onClick={() => { if (window.confirm(`Remove Zone ${activeZone}?`)) { removeZone(activeZone); setActiveZone(zones.filter(z => z !== activeZone)[0] || 'A'); } }}
                  className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold cursor-pointer hover:bg-red-100 flex items-center gap-1">
                  <Trash2 size={13} /> Del Zone
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ====== TABLE GRID SECTION ====== */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredTables.length === 0 ? (
            <div className="col-span-full flex flex-col items-center py-12 text-gray-400">
              <LayoutGrid size={40} className="mb-2 opacity-30" />
              <p className="text-sm font-medium">No tables in this filter</p>
            </div>
          ) : filteredTables.map(table => {
            const group = mergedGroups.find(g => g.includes(table.id));
            const isMerged = !!group;
            const isMaster = isMerged && group![group!.length - 1] === table.id;
            const destTable = isMerged ? (tables.find(t => t.id === group![group!.length - 1]) || table) : table;
            const tableOrder = destTable.orderId ? orders.find(o => o.id === destTable.orderId) : null;
            const style = STATUS_STYLES[table.status] || STATUS_STYLES['Available'];
            const isSelected = selectedTable?.id === (isMerged ? destTable.id : table.id);

            return (
              <motion.div
                key={table.id}
                whileHover={{ scale: 1.02 }}
                onClick={() => handleTableClick(isMerged ? destTable : table)}
                className={`rounded-2xl border-2 p-4 cursor-pointer transition-all duration-150 select-none ${style.card} ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
              >
                {/* Card Top */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] text-gray-400 font-semibold mb-0.5">Table</div>
                    <div className="text-base font-black text-gray-800 leading-none">T-{table.id}</div>
                  </div>
                  {isEditMode ? (
                    <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete Table T-${table.id}?`)) removeTable(table.id); }}
                      className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                      {isMerged ? (isMaster ? 'Master' : 'Merged') : style.badgeText}
                    </span>
                  )}
                </div>

                {/* Food plate icon area */}
                <div className="flex items-center justify-center w-full h-12 mb-3 rounded-xl bg-white/60">
                  <span className="text-2xl">{table.status === 'Available' ? '🪑' : table.status === 'Cleaning' ? '🧹' : table.status === 'Billing' ? '💳' : '🍽️'}</span>
                </div>

                {/* Card Bottom */}
                <div className="space-y-1">
                  {table.status !== 'Available' && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                      <Users size={9} /> {table.guests} Guests
                    </div>
                  )}
                  {tableOrder && (
                    <div className="text-xs font-black text-gray-800">{formatCurrency(tableOrder.grandTotal)}</div>
                  )}
                  {isMerged && isMaster && !isEditMode && (
                    <button onClick={e => { e.stopPropagation(); unmergeTables(table.id); }}
                      className="text-[9px] text-red-500 hover:text-red-700 font-bold underline cursor-pointer">
                      Unmerge
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ====== DETAIL / ACTION MODAL ====== */}
      <AnimatePresence>
        {selectedTable && (
          <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40" onClick={closeDetails} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-gray-100 z-50 p-6 rounded-3xl shadow-2xl overflow-y-auto max-h-[85vh] text-gray-850"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                    <ShoppingBag size={16} className="text-indigo-600" />
                    {t.tableNo.replace('{no}', selectedTable.id.toString())}
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                    Zone {selectedTable.zone} &bull; {selectedTable.status}
                  </p>
                </div>
                <button onClick={closeDetails} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4">
                {activeAction === 'details' && (
                  <>
                    {!activeOrder && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <label className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block mb-2">Guests Count</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {[1,2,3,4,6,8].map(n => (
                            <button key={n} onClick={() => setGuestCount(n)}
                              className={`w-8 h-8 rounded-lg text-xs font-bold border transition cursor-pointer ${guestCount === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeOrder ? (
                      <div className="space-y-3">
                        <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          <span>Running Items</span>
                          <span>{activeOrder.timestamp}</span>
                        </div>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {activeOrder.items.map((item, idx) => (
                            <div key={idx} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-gray-800">{item.name}</span>
                                <span className="ml-1.5 text-[9px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded capitalize">{item.portion}</span>
                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">{formatCurrency(item.price)} each</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleUpdateActiveOrderItemQty(idx, -1)} className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 cursor-pointer">-</button>
                                <span className="text-xs font-bold w-4 text-center font-mono">{item.quantity}</span>
                                <button onClick={() => handleUpdateActiveOrderItemQty(idx, 1)} className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 cursor-pointer">+</button>
                                <button onClick={() => handleRemoveActiveOrderItem(idx)} className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer"><X size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs font-bold">
                          <span>Total</span>
                          <span className="text-indigo-600 text-sm font-mono">{formatCurrency(activeOrder.grandTotal)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400">
                        <p className="text-xs font-medium">No active order for this table.</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button onClick={() => setActiveAction('addItems')}
                        className="p-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                        <PlusCircle size={14} /> Add Items
                      </button>
                      {activeOrder && (
                        <button onClick={async () => {
                          const bill = await generateBill(selectedTable.id, 0);
                          const order = orders.find(o => o.id === bill.orderId);
                          if (order) {
                            const waiterName = users.find(u => u.id === order.waiterId)?.name || 'Staff';
                            await printBillThermal(bill, order, settings, waiterName);
                          }
                          toast.success('Bill sent to printer! You can also manage payment on Billing tab.');
                        }}
                          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                          <Printer size={14} /> Print Bill
                        </button>
                      )}
                      {activeOrder && (
                        <button onClick={async () => {
                          try {
                            if (selectedTable.status === 'Billing') {
                              toast.info('This table is already in Billing. Navigate to the Billing tab to complete checkout.');
                              closeDetails();
                              return;
                            }
                            await generateBill(selectedTable.id, 0);
                            closeDetails();
                            toast.success('Bill generated. Please navigate to Billing tab.');
                          } catch (err: any) {
                            toast.error(err.message || 'Failed to generate bill');
                          }
                        }}
                          className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                          <CheckCircle2 size={14} /> Checkout
                        </button>
                      )}
                      {activeOrder && (
                        <button onClick={() => { setBillDiscountPct(0); setBillPaymentMethod('Cash'); setActiveAction('billing'); }}
                          className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                          <Receipt size={14} /> Bill & Pay
                        </button>
                      )}
                      {activeOrder && (
                        <button onClick={() => setActiveAction('transfer')}
                          className="p-2.5 rounded-xl bg-gray-50 border border-gray-205 hover:bg-gray-100 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                          <ArrowRightLeft size={14} className="text-cyan-600" /> Transfer
                        </button>
                      )}
                      <button onClick={() => setActiveAction('merge')}
                        className="p-2.5 rounded-xl bg-gray-50 border border-gray-205 hover:bg-gray-100 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                        <GitMerge size={14} className="text-amber-600" /> Merge
                      </button>
                      {activeOrder && (
                        <button onClick={() => { setActiveAction('split'); setSplitItemsCheck(activeOrder.items.map(item => ({ id: item.id, portion: item.portion, price: item.price, name: item.name, quantity: 0 }))); }}
                          className="p-2.5 rounded-xl bg-gray-50 border border-gray-205 hover:bg-gray-100 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                          <Columns size={14} className="text-purple-650" /> Split
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Transfer UI */}
                {activeAction === 'transfer' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select destination table</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {tables.filter(tbl => tbl.status === 'Available' && tbl.id !== selectedTable.id).map(tbl => (
                        <button key={tbl.id} onClick={() => setTransferTarget(tbl.id)}
                          className={`p-3 rounded-xl border text-xs font-bold transition font-mono ${transferTarget === tbl.id ? 'bg-cyan-555 text-white border-cyan-500 bg-cyan-600' : 'bg-gray-50 border-gray-200'}`}>
                          T-{tbl.id}
                        </button>
                      ))}
                    </div>
                    <button onClick={executeTransfer} disabled={!transferTarget}
                      className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl disabled:opacity-50">
                      Confirm Transfer
                    </button>
                  </div>
                )}

                {/* Merge UI */}
                {activeAction === 'merge' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-550 uppercase tracking-wider">Select tables to merge with T-{selectedTable.id}</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {tables.filter(tbl => tbl.id !== selectedTable.id).map(tbl => (
                        <button key={tbl.id} onClick={() => setMergeSources(prev => prev.includes(tbl.id) ? prev.filter(id => id !== tbl.id) : [...prev, tbl.id])}
                          className={`p-3 rounded-xl border text-xs font-bold transition font-mono flex flex-col items-center gap-0.5 ${
                            mergeSources.includes(tbl.id) ? 'bg-amber-500 text-white border-amber-500' : 'bg-gray-50 border-gray-200'
                          }`}>
                          T-{tbl.id}
                          <span className={`text-[8px] font-semibold ${mergeSources.includes(tbl.id) ? 'text-amber-100' : 'text-gray-400'}`}>
                            {tbl.status === 'Occupied' ? '●' : tbl.status === 'Available' ? '○' : '◐'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button onClick={executeMerge} disabled={mergeSources.length === 0}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl disabled:opacity-50">
                      Confirm Merge
                    </button>
                  </div>
                )}

                {/* Split UI */}
                {activeAction === 'split' && activeOrder && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-550 uppercase tracking-wider">Select Destination Table</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {tables.filter(tbl => tbl.status === 'Available').map(tbl => (
                        <button key={tbl.id} onClick={() => setSplitTarget(tbl.id)}
                          className={`p-2.5 rounded-lg border text-xs font-bold transition font-mono ${splitTarget === tbl.id ? 'bg-purple-500 text-white border-purple-500' : 'bg-gray-50 border-gray-200'}`}>
                          T-{tbl.id}
                        </button>
                      ))}
                    </div>
                    <h4 className="text-xs font-bold text-gray-550 uppercase tracking-wider mt-4">Select Items to Move</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {splitItemsCheck.map((checkItem, idx) => {
                        const originalItem = activeOrder.items.find(i => i.id === checkItem.id && i.portion === checkItem.portion);
                        const maxQty = originalItem?.quantity || 1;
                        return (
                          <div key={idx} className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-700">{checkItem.name} ({checkItem.portion})</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setSplitItemsCheck(prev => prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item))} className="w-5 h-5 rounded bg-gray-250 flex items-center justify-center font-bold text-gray-800 bg-gray-200">-</button>
                              <span className="font-mono font-bold w-4 text-center">{checkItem.quantity}</span>
                              <button onClick={() => setSplitItemsCheck(prev => prev.map((item, i) => i === idx ? { ...item, quantity: Math.min(maxQty, item.quantity + 1) } : item))} className="w-5 h-5 rounded bg-gray-250 flex items-center justify-center font-bold text-gray-800 bg-gray-200">+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={executeSplit} disabled={!splitTarget || splitItemsCheck.reduce((sum, i) => sum + i.quantity, 0) === 0}
                      className="w-full py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs rounded-xl disabled:opacity-50">
                      Confirm Split Order
                    </button>
                  </div>
                )}

                {/* Add Items UI */}
                {activeAction === 'addItems' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Menu Items</h4>

                    {/* Category tabs */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
                      {(['All', ...Array.from(new Set(menuItems.filter(m => m.isAvailable).map(i => i.category)))] as string[]).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setAddCategory(cat)}
                          className={`px-2.5 py-1 text-[10px] rounded-lg font-bold border transition whitespace-nowrap cursor-pointer ${
                            addCategory === cat
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-slate-200 text-slate-500'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Item cards */}
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
                      {menuItems.filter(m => m.isAvailable && (addCategory === 'All' || m.category === addCategory)).map(item => (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:border-indigo-400 transition shadow-xs gap-2 min-h-24">
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
                                    onClick={() => handleAddToOrder(item, v.name)}
                                    className="w-full py-1 px-1 bg-slate-50 border border-slate-200 rounded text-[9px] font-bold text-indigo-600 cursor-pointer text-center hover:bg-indigo-50 hover:border-indigo-200 transition"
                                  >
                                    {v.name} ({formatCurrency(v.price)})
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddToOrder(item, 'Single')}
                                className="w-full py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-indigo-600 cursor-pointer text-center hover:bg-indigo-50 hover:border-indigo-200 transition"
                              >
                                Add ({formatCurrency(item.price)})
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {orderItemsList.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-gray-100">
                        <h4 className="text-xs font-bold text-gray-550 uppercase tracking-wider">Order Basket</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {orderItemsList.map((item, idx) => (
                            <div key={idx} className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-gray-800">{item.name}</span>
                                <span className="ml-1.5 text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded capitalize">{item.portion}</span>
                                {item.isParcel && <span className="ml-1.5 text-[9px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded capitalize">Parcel</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 cursor-pointer mr-2">
                                  <input type="checkbox" checked={!!item.isParcel} onChange={() => handleToggleParcel(idx)} className="w-3 h-3 accent-indigo-600" />
                                  <span className="text-[10px] text-gray-500 font-bold">Parcel</span>
                                </label>
                                <QtyStepper value={item.quantity} onChange={next => handleSetItemQty(idx, next)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={executeAddOrder} disabled={orderItemsList.length === 0}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl disabled:opacity-50">
                      {activeOrder ? 'Append to Kitchen' : 'Send KOT to Kitchen'}
                    </button>
                  </div>
                )}

                {/* Billing / Payment UI */}
                {activeAction === 'billing' && activeOrder && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Checkout & Payment</h4>

                    {/* Bill breakdown */}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-xs">
                      <div className="flex justify-between text-gray-500">
                        <span>Subtotal</span>
                        <span className="font-mono font-bold text-gray-800">{formatCurrency(activeOrder.grandTotal)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1 font-bold text-gray-700">
                          <Percent size={11} className="text-emerald-500" /> Discount (%)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={billDiscountPct || ''}
                          onChange={e => setBillDiscountPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                          className="w-16 bg-white border border-gray-200 rounded font-mono text-right text-gray-800 p-1 text-xs focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-sm font-black">
                        <span className="text-gray-700 uppercase tracking-wider">Grand Total</span>
                        <span className="text-emerald-600 font-mono">{formatCurrency(Math.max(0, Math.round((activeOrder.grandTotal - (activeOrder.grandTotal * billDiscountPct / 100)) * 100) / 100))}</span>
                      </div>
                    </div>

                    {/* Payment method */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block">Payment Method</span>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setBillPaymentMethod('Cash')}
                          className={`py-2.5 px-2 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition ${
                            billPaymentMethod === 'Cash'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                              : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                          }`}
                        >
                          <Wallet size={14} /> Cash
                        </button>
                        <button
                          onClick={() => setBillPaymentMethod('UPI')}
                          className={`py-2.5 px-2 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition ${
                            billPaymentMethod === 'UPI'
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                              : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                          }`}
                        >
                          <Smartphone size={14} /> UPI
                        </button>
                        <button
                          onClick={() => setBillPaymentMethod('Card')}
                          className={`py-2.5 px-2 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition ${
                            billPaymentMethod === 'Card'
                              ? 'border-amber-600 bg-amber-50 text-amber-900'
                              : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                          }`}
                        >
                          <CreditCard size={14} /> Card
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleTablePayment}
                      disabled={billProcessing}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <Receipt size={15} /> {billProcessing ? 'Processing...' : 'Pay & Checkout'}
                    </button>
                  </div>
                )}
              </div>

              {/* Footer back button */}
              {activeAction !== 'details' && (
                <div className="pt-4 border-t border-gray-100 mt-4">
                  <button onClick={() => setActiveAction('details')}
                    className="w-full py-2.5 bg-gray-50 border border-gray-200 text-xs font-bold text-gray-500 rounded-xl hover:text-gray-700 cursor-pointer transition flex items-center justify-center">
                    Back to Details
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TableManagement;
