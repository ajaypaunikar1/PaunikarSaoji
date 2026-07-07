import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  Users, CheckCircle2, ShoppingBag, 
  ArrowRightLeft, GitMerge, Columns, PlusCircle, X, Check,
  Edit3, Trash2, Settings, Plus, LayoutGrid, Eye, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Table, PortionType, TableStatus } from '../types/types';
import { toast } from 'sonner';

const TableManagement: React.FC = () => {
  const { 
    tables, orders, menuItems, language, mergedGroups, zones,
    addOrder, updateOrder, mergeTables, splitTables, 
    transferTable, generateBill, setTableStatus, users, assignWaiter,
    addTable, removeTable, updateTableLayout, addZone, removeZone, unmergeTables
  } = useApp();
  const t = translations[language];

  // UI state
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeAction, setActiveAction] = useState<'details' | 'transfer' | 'merge' | 'split' | 'addItems' | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [activeZone, setActiveZone] = useState<string>(zones[0] || 'A');
  const [newZoneName, setNewZoneName] = useState<string>('');

  // Operations state
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [mergeSources, setMergeSources] = useState<number[]>([]);
  const [splitTarget, setSplitTarget] = useState<number | null>(null);
  
  // Splitting items checklist
  const [splitItemsCheck, setSplitItemsCheck] = useState<{ id: string; portion: PortionType; price: number; name: string; quantity: number }[]>([]);

  // Ordering items list
  const [orderItemsList, setOrderItemsList] = useState<{ id: string; name: string; portion: PortionType; price: number; quantity: number; specialNotes: string }[]>([]);
  const [guestCount, setGuestCount] = useState<number>(2);


  // Helper to fetch active order for a table
  const activeOrder = selectedTable?.orderId 
    ? orders.find(o => o.id === selectedTable.orderId) 
    : undefined;

  const handleTableClick = (table: Table) => {
    if (isEditMode) return; // Ignore normal clicks in edit mode
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
    const price = portion === 'Half' 
      ? menuItem.variants.find((v: any) => v.name === 'Half')?.price || 0
      : portion === 'Full'
        ? menuItem.variants.find((v: any) => v.name === 'Full')?.price || 0
        : menuItem.price;

    setOrderItemsList(prev => {
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

  const handleUpdateItemQty = (index: number, amt: number) => {
    setOrderItemsList(prev => prev.map((item, idx) => {
      if (idx === index) {
        const newQty = item.quantity + amt;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(i => i.quantity > 0));
  };

  const handleUpdateItemNotes = (index: number, notes: string) => {
    setOrderItemsList(prev => prev.map((item, idx) => idx === index ? { ...item, specialNotes: notes } : item));
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

  const executeAddOrder = () => {
    if (!selectedTable) return;
    if (orderItemsList.length === 0) {
      toast.error('Add at least one item to place order!');
      return;
    }

    // Set guest count
    tables.forEach(t => {
      if (t.id === selectedTable.id) {
        t.guests = guestCount;
      }
    });

    if (activeOrder) {
      const currentItems = [...activeOrder.items];
      
      orderItemsList.forEach(newItem => {
        const exist = currentItems.find(c => c.id === newItem.id && c.portion === newItem.portion);
        if (exist) {
          exist.quantity += newItem.quantity;
          if (newItem.specialNotes) {
            exist.specialNotes = exist.specialNotes 
              ? `${exist.specialNotes}, ${newItem.specialNotes}`
              : newItem.specialNotes;
          }
        } else {
          currentItems.push({
            id: `${activeOrder.id}-item-${Date.now()}-${Math.floor(Math.random()*100)}`,
            name: newItem.name,
            quantity: newItem.quantity,
            portion: newItem.portion,
            price: newItem.price,
            specialNotes: newItem.specialNotes
          });
        }
      });

      updateOrder(activeOrder.id, { items: currentItems });
      toast.success('Items appended to current order');
    } else {
      addOrder(selectedTable.id, orderItemsList, '');
    }

    closeDetails();
  };


  // Helper status color classes for light theme
  const getTableStatusStyle = (status: TableStatus) => {
    switch (status) {
      case 'Available':
        return 'bg-white border-slate-205 text-slate-700 hover:border-slate-350 shadow-sm';
      case 'Occupied':
        return 'bg-emerald-50 border-emerald-500/40 text-slate-800 hover:border-emerald-500 shadow-sm';
      case 'Reserved':
        return 'bg-amber-50 border-amber-500/40 text-slate-800 hover:border-amber-500/60 shadow-sm';
      case 'Cleaning':
        return 'bg-indigo-50 border-indigo-500/40 text-slate-800 border-dashed hover:border-indigo-500/60 shadow-sm';
      case 'Billing':
        return 'bg-cyan-50 border-cyan-500/40 text-slate-800 hover:border-cyan-500 shadow-sm';
    }
  };

  const getStatusBadge = (status: TableStatus) => {
    switch (status) {
      case 'Available':
        return <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-slate-100 border border-slate-200 text-slate-500 uppercase tracking-wide">{t.available}</span>;
      case 'Occupied':
        return <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 border border-emerald-250 text-emerald-700 uppercase tracking-wide">{t.occupied}</span>;
      case 'Reserved':
        return <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 border border-amber-250 text-amber-700 uppercase tracking-wide">{t.reserved}</span>;
      case 'Cleaning':
        return <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 border border-indigo-250 text-indigo-700 uppercase tracking-wide">{t.cleaning}</span>;
      case 'Billing':
        return <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-cyan-100 border border-cyan-250 text-cyan-700 uppercase tracking-wide">{t.billingStatus}</span>;
    }
  };

  const zoneTables = tables.filter(t => t.zone === activeZone);
  const renderedGroups = new Set<string>();

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight flex items-center gap-2">
            <LayoutGrid size={22} className="text-emerald-500" />
            {t.tables}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {isEditMode 
              ? 'Drag tables to arrange positions. Drag a table onto another to merge them.'
              : 'Real-time operational layout view. Tap table to open order options.'}
          </p>
        </div>

        {/* Edit Layout Mode Toggle Button */}
        <button
          onClick={() => {
            setIsEditMode(!isEditMode);
            setSelectedTable(null);
            setActiveAction(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition duration-300 cursor-pointer shadow-sm ${
            isEditMode
              ? 'bg-amber-500 border-amber-600 text-white hover:bg-amber-650'
              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-350'
          }`}
        >
          {isEditMode ? <Eye size={14} /> : <Settings size={14} />}
          <span>{isEditMode ? 'Exit Edit Mode' : 'Edit Layout Mode'}</span>
        </button>
      </div>

      {/* Zone Management Bar (Visible always to select tab, or create in Edit Mode) */}
      <div className="bg-white border border-slate-200 p-4 rounded-3xl shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          
          {/* Dynamic Zone Tabs Selection */}
          <div className="flex flex-wrap gap-2">
            {zones.map(z => (
              <button
                key={z}
                onClick={() => {
                  setActiveZone(z);
                  setSelectedTable(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  activeZone === z
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-650'
                }`}
              >
                Zone {z}
              </button>
            ))}
          </div>

          {/* Edit Mode Controls (Add/Remove Zone, Add Table) */}
          {isEditMode && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Add Zone */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New Zone (e.g. D)"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value.toUpperCase())}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-emerald-500 w-32 uppercase"
                />
                <button
                  onClick={() => {
                    if (!newZoneName) return;
                    addZone(newZoneName);
                    setActiveZone(newZoneName);
                    setNewZoneName('');
                  }}
                  className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 cursor-pointer flex items-center justify-center"
                  title="Add Zone"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Delete Active Zone */}
              {zones.length > 1 && (
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to remove Zone ${activeZone}? All tables inside will be relocated.`)) {
                      removeZone(activeZone);
                      setActiveZone(zones.filter(z => z !== activeZone)[0] || 'A');
                    }
                  }}
                  className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={13} />
                  Delete Zone {activeZone}
                </button>
              )}

              {/* Add Table */}
              <button
                onClick={() => addTable(activeZone)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-655 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition shadow-md shadow-emerald-500/10"
              >
                <PlusCircle size={14} />
                Add Table to {activeZone}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Visual Canvas Layout */}
      <div 
        className="w-full bg-slate-50 border border-slate-205/80 rounded-3xl p-6 shadow-sm min-h-[400px]"
      >
        {/* Help Tip */}
        <div className="mb-4 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 inline-flex items-center gap-1.5 shadow-xs">
          <HelpCircle size={12} className="text-slate-400" />
          <span>Tap a table to manage orders. Green represents Occupied. Use Details modal to merge/unmerge tables.</span>
        </div>

        {zoneTables.length === 0 ? (
          <div className="flex flex-col justify-center items-center text-slate-400 p-10">
            <LayoutGrid size={48} className="text-slate-300 mb-2 animate-bounce" />
            <p className="text-xs font-bold">No tables exist in Zone {activeZone}.</p>
            {isEditMode && (
              <button 
                onClick={() => addTable(activeZone)}
                className="mt-3 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Create a Table
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {zoneTables.map(table => {
              // Check if table belongs to a merged group
              const group = mergedGroups.find(g => g.includes(table.id));
              let isMaster = false;
              let isMerged = false;

              if (group) {
                isMerged = true;
                if (group[group.length - 1] === table.id) {
                  isMaster = true;
                }
              }

              const destTableId = group ? group[group.length - 1] : table.id;
              const destTable = tables.find(t => t.id === destTableId) || table;
              const groupOrder = destTable.orderId ? orders.find(o => o.id === destTable.orderId) : null;
              
              const totalGuests = group ? group.reduce((sum, tid) => {
                const tObj = tables.find(tbl => tbl.id === tid);
                return sum + (tObj?.guests || 2);
              }, 0) : table.guests;

              return (
                <motion.div
                  key={table.id}
                  whileHover={{ scale: 1.02 }}
                  className={`h-28 rounded-2xl border transition duration-150 flex flex-col justify-between p-3 select-none cursor-pointer ${
                    isMerged 
                      ? isMaster 
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-md ring-2 ring-emerald-500/20'
                        : 'border-emerald-400 bg-slate-50/70 border-dashed opacity-75 shadow-xs'
                      : getTableStatusStyle(table.status)
                  }`}
                  onClick={() => handleTableClick(isMerged ? destTable : table)}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-black text-slate-800 font-mono">
                      T-{table.id}
                    </span>
                    
                    {isEditMode ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete Table T-${table.id}?`)) {
                            removeTable(table.id);
                          }
                        }}
                        className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                        title="Delete Table"
                      >
                        <Trash2 size={11} />
                      </button>
                    ) : (
                      isMerged ? (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-emerald-600 text-white uppercase tracking-wider">
                          {isMaster ? 'Master' : 'Merged'}
                        </span>
                      ) : (
                        getStatusBadge(table.status)
                      )
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="space-y-1">
                    {isMerged ? (
                      isMaster ? (
                        <>
                          <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-800">
                            <Users size={9} />
                            <span>Seats: {totalGuests}</span>
                          </div>
                          {groupOrder ? (
                            <div className="text-[10px] font-mono font-black text-emerald-700">
                              ₹{groupOrder.grandTotal}
                            </div>
                          ) : (
                            <div className="text-[8px] text-slate-400 uppercase tracking-widest font-black">Linked</div>
                          )}
                          {!isEditMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                unmergeTables(table.id);
                              }}
                              className="text-[8px] font-bold text-rose-500 hover:text-rose-700 underline block cursor-pointer"
                            >
                              Unmerge
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-[9px] text-slate-400 font-medium italic">Consolidated</div>
                      )
                    ) : (
                      <>
                        {table.status !== 'Available' ? (
                          <>
                            <div className="flex items-center gap-1 text-[9px] font-medium text-slate-505">
                              <Users size={9} /> {table.guests} Guests
                            </div>
                            {table.orderId && orders.find(o => o.id === table.orderId) && (
                              <div className="text-[10px] font-mono font-black text-emerald-600">
                                ₹{orders.find(o => o.id === table.orderId)?.grandTotal}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Available</div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Centered Action Popup Modal */}
      <AnimatePresence>
        {selectedTable && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40" onClick={closeDetails} />

            {/* Centered Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20, x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, y: -20, x: '-50%' }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-205 z-50 p-6 rounded-3xl shadow-2xl overflow-y-auto max-h-[85vh] text-slate-800"
            >
              
              {/* Modal Header */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <ShoppingBag size={16} className="text-emerald-500" />
                    {t.tableNo.replace('{no}', selectedTable.id.toString())}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    Zone {selectedTable.zone} &bull; {selectedTable.status}
                  </p>
                </div>
                <button onClick={closeDetails} className="p-1 rounded bg-slate-50 border border-slate-200 hover:text-slate-900 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="py-4 space-y-4">
                
                {/* 1. Details view */}
                {activeAction === 'details' && (
                  <>
                    {!activeOrder && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 space-y-3">
                        <label className="block text-[10px] font-bold uppercase text-slate-505 tracking-wider">
                          Guests Count / ग्राहक संख्या
                        </label>
                        <div className="flex items-center gap-3">
                          {[1, 2, 3, 4, 6, 8].map(num => (
                            <button
                              key={num}
                              onClick={() => setGuestCount(num)}
                              className={`w-9 h-9 rounded-lg border text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                                guestCount === num 
                                  ? 'bg-emerald-500 border-emerald-500 text-white' 
                                  : 'bg-white border-slate-200 hover:border-slate-350'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeOrder ? (
                      <div className="space-y-4">
                        <div className="flex justify-between text-xs font-bold text-slate-505 uppercase">
                          <span>Items List</span>
                          <span className="font-mono">Time: {activeOrder.timestamp}</span>
                        </div>
                        
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {activeOrder.items.map((item, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-150 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-slate-800">{item.name}</span>
                                <span className="ml-2 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 capitalize">{item.portion}</span>
                                {item.specialNotes && <p className="text-[10px] text-amber-600 mt-1 italic m-0">"{item.specialNotes}"</p>}
                                <div className="font-mono text-slate-450 mt-1">₹{item.price} each</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleUpdateActiveOrderItemQty(idx, -1)}
                                    className="w-5.5 h-5.5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-bold w-4 text-center">{item.quantity}</span>
                                  <button
                                    onClick={() => handleUpdateActiveOrderItemQty(idx, 1)}
                                    className="w-5.5 h-5.5 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                                <button
                                  onClick={() => handleRemoveActiveOrderItem(idx)}
                                  className="p-1.5 rounded text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-505 uppercase tracking-wider">{t.runningTotal}</span>
                          <span className="text-sm font-black text-emerald-600 font-mono">₹{activeOrder.grandTotal}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 p-4 rounded-2xl bg-slate-50 border border-slate-150">
                        <p className="text-xs text-slate-400 font-medium m-0">No active order for this table.</p>
                      </div>
                    )}

                    {/* Manual Table Status Update Dropdown */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 space-y-2 mt-3">
                      <label className="block text-[10px] font-bold uppercase text-slate-505 tracking-wider">
                        Set Table Status / टेबलची स्थिती बदला
                      </label>
                      <select 
                        value={selectedTable.status} 
                        onChange={(e) => {
                          const newStatus = e.target.value as TableStatus;
                          setTableStatus(selectedTable.id, newStatus);
                          setSelectedTable(prev => prev ? { ...prev, status: newStatus } : null);
                          toast.success(`Table ${selectedTable.id} status updated to ${newStatus}`);
                        }}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                      >
                        <option value="Available">Available / उपलब्ध</option>
                        <option value="Occupied">Occupied / व्यस्त</option>
                        <option value="Reserved">Reserved / राखीव</option>
                        <option value="Cleaning">Cleaning / स्वच्छता सुरू</option>
                        <option value="Billing">Billing / बिलिंग</option>
                      </select>
                    </div>

                    {/* Assign Waiter Dropdown */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 space-y-2 mt-3">
                      <label className="block text-[10px] font-bold uppercase text-slate-550 tracking-wider">
                        Assign Waiter / वेटर नियुक्त करा
                      </label>
                      <select 
                        value={selectedTable.waiterId || ''} 
                        onChange={(e) => {
                          const wId = e.target.value || null;
                          assignWaiter(selectedTable.id, wId);
                          setSelectedTable(prev => prev ? { ...prev, waiterId: wId || undefined } : null);
                          const wName = users.find(u => u.id === wId)?.name || 'None';
                          toast.success(`Assigned waiter ${wName} to Table ${selectedTable.id}`);
                        }}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                      >
                        <option value="">Unassigned / नियुक्त नाही</option>
                        {users.filter(u => u.role === 'Waiter' && u.status === 'Active').map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Modal Button Actions */}
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                      <button
                        onClick={() => setActiveAction('addItems')}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-350 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                      >
                        <PlusCircle size={14} className="text-emerald-500" />
                        <span>{activeOrder ? t.addItems : t.newOrder}</span>
                      </button>

                      {activeOrder && (
                        <button
                          onClick={() => {
                            generateBill(selectedTable.id, 0);
                            closeDetails();
                            toast.success('Bill generated. Please navigate to Billing tab to process payment.');
                          }}
                          className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-450 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                        >
                          <CheckCircle2 size={14} />
                          <span>{t.checkout}</span>
                        </button>
                      )}

                      {activeOrder && (
                        <button
                          onClick={() => setActiveAction('transfer')}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-205 hover:border-slate-350 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                        >
                          <ArrowRightLeft size={14} className="text-cyan-650" />
                          <span>{t.transfer}</span>
                        </button>
                      )}

                      <button
                        onClick={() => setActiveAction('merge')}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-205 hover:border-slate-350 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                      >
                        <GitMerge size={14} className="text-amber-550" />
                        <span>{t.merge}</span>
                      </button>

                      {activeOrder && (
                        <button
                          onClick={() => {
                            setActiveAction('split');
                            setSplitItemsCheck(activeOrder.items.map(item => ({
                              id: item.id,
                              portion: item.portion,
                              price: item.price,
                              name: item.name,
                              quantity: 0
                            })));
                          }}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-205 hover:border-slate-355 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                        >
                          <Columns size={14} className="text-purple-650" />
                          <span>{t.split}</span>
                        </button>
                      )}

                      {selectedTable.status === 'Cleaning' && (
                        <button
                          onClick={() => {
                            setTableStatus(selectedTable.id, 'Available');
                            setSelectedTable(prev => prev ? { ...prev, status: 'Available' } : null);
                            toast.success(`Table ${selectedTable.id} is now Available.`);
                          }}
                          className="p-3 col-span-2 rounded-xl bg-indigo-500 hover:bg-indigo-650 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                        >
                          <Check size={14} />
                          <span>Mark Clean / Ready</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* 2. Action: Transfer */}
                {activeAction === 'transfer' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.selectDestination}</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {tables.filter(tbl => tbl.status === 'Available' && tbl.id !== selectedTable.id).map(tbl => (
                        <button
                          key={tbl.id}
                          onClick={() => setTransferTarget(tbl.id)}
                          className={`p-3 rounded-xl border text-xs font-bold transition font-mono ${
                            transferTarget === tbl.id 
                              ? 'bg-cyan-500 border-cyan-500 text-white' 
                              : 'bg-slate-50 border-slate-200 hover:border-slate-350 text-slate-800'
                          }`}
                        >
                          T-{tbl.id}
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={executeTransfer}
                      disabled={!transferTarget}
                      className="w-full mt-4 py-3 bg-cyan-500 hover:bg-cyan-455 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirm Transfer
                    </button>
                  </div>
                )}

                {/* 3. Action: Merge */}
                {activeAction === 'merge' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-505 uppercase tracking-wider">{t.selectTablesMerge}</h4>
                    <p className="text-[10px] text-slate-505 leading-normal font-sans">
                      Select tables to merge into Table {selectedTable.id}. All their orders will be consolidated here.
                    </p>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {tables.filter(tbl => tbl.id !== selectedTable.id && tbl.status !== 'Available').map(tbl => {
                        const isSelected = mergeSources.includes(tbl.id);
                        return (
                          <button
                            key={tbl.id}
                            onClick={() => {
                              setMergeSources(prev => isSelected 
                                ? prev.filter(id => id !== tbl.id) 
                                : [...prev, tbl.id]
                              );
                            }}
                            className={`p-3 rounded-xl border text-xs font-bold transition font-mono ${
                              isSelected 
                                ? 'bg-amber-500 border-amber-500 text-white' 
                                : 'bg-slate-50 border-slate-200 hover:border-slate-350 text-slate-800'
                            }`}
                          >
                            T-{tbl.id}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={executeMerge}
                      disabled={mergeSources.length === 0}
                      className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-455 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition disabled:opacity-50"
                    >
                      Confirm Merge
                    </button>
                  </div>
                )}

                {/* 4. Action: Split */}
                {activeAction === 'split' && activeOrder && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-505 uppercase tracking-wider">Select Destination Table</h4>
                    <div className="grid grid-cols-6 gap-2">
                      {tables.filter(tbl => tbl.status === 'Available').map(tbl => (
                        <button
                          key={tbl.id}
                          onClick={() => setSplitTarget(tbl.id)}
                          className={`p-2 rounded-lg border text-xs font-bold transition font-mono ${
                            splitTarget === tbl.id 
                              ? 'bg-purple-500 border-purple-500 text-white' 
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          T-{tbl.id}
                        </button>
                      ))}
                    </div>

                    <h4 className="text-xs font-bold text-slate-505 uppercase tracking-wider mt-4">Select Items & Quantities to Move</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {splitItemsCheck.map((checkItem, idx) => {
                        const originalItem = activeOrder.items.find(i => i.id === checkItem.id && i.portion === checkItem.portion);
                        const maxQty = originalItem?.quantity || 1;
                        
                        return (
                          <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-slate-850">{checkItem.name}</span>
                              <span className="ml-2 text-[9px] px-1 py-0.5 bg-slate-200 text-slate-655 rounded capitalize">{checkItem.portion}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitItemsCheck(prev => prev.map((item, i) => i === idx 
                                    ? { ...item, quantity: Math.max(0, item.quantity - 1) } 
                                    : item
                                  ));
                                }}
                                className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center font-bold text-slate-805 cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold w-4 text-center">{checkItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitItemsCheck(prev => prev.map((item, i) => i === idx 
                                    ? { ...item, quantity: Math.min(maxQty, item.quantity + 1) } 
                                    : item
                                  ));
                                }}
                                className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center font-bold text-slate-805 cursor-pointer"
                              >
                                +
                              </button>
                              <span className="text-[10px] text-slate-400 font-bold ml-1">/ {maxQty}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      onClick={executeSplit}
                      disabled={!splitTarget || splitItemsCheck.reduce((sum, i) => sum + i.quantity, 0) === 0}
                      className="w-full mt-4 py-3 bg-purple-500 hover:bg-purple-455 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition disabled:opacity-50"
                    >
                      Confirm Split Order
                    </button>
                  </div>
                )}

                {/* 5. Action: Add items */}
                {activeAction === 'addItems' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-505 uppercase tracking-wider">Select Menu Items</h4>
                    
                    <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50">
                      {menuItems.filter(m => m.isAvailable).map(item => (
                        <div key={item.id} className="p-2 border-b border-slate-100 last:border-b-0 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <p className="text-[9px] text-slate-550 m-0">{item.category}</p>
                          </div>
                          
                          <div className="flex gap-1.5">
                            {item.portionMode === 'Variant' ? (
                              item.variants.map((v, vIdx) => (
                                <button
                                  key={vIdx}
                                  onClick={() => handleAddToOrder(item, v.name as PortionType)}
                                  className="px-2 py-1 rounded bg-white border border-slate-200 hover:border-slate-350 text-[9px] font-bold text-slate-700 cursor-pointer shadow-xs"
                                >
                                  {v.name} (₹{v.price})
                                </button>
                              ))
                            ) : (
                              <button
                                onClick={() => handleAddToOrder(item, 'Single')}
                                className="px-2 py-1 rounded bg-white border border-slate-200 hover:border-slate-350 text-[9px] font-bold text-slate-700 cursor-pointer shadow-xs"
                              >
                                Add (₹{item.price})
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Order Basket */}
                    {orderItemsList.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-slate-550 uppercase tracking-wider">Order Basket</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {orderItemsList.map((item, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-150 flex flex-col gap-2">
                              <div className="flex justify-between items-center text-xs">
                                <div>
                                  <span className="font-bold text-slate-800">{item.name}</span>
                                  <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 capitalize">{item.portion}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(idx, -1)}
                                    className="w-5.5 h-5.5 rounded bg-white border border-slate-205 flex items-center justify-center font-bold text-slate-805 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-bold w-4 text-center">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(idx, 1)}
                                    className="w-5.5 h-5.5 rounded bg-white border border-slate-205 flex items-center justify-center font-bold text-slate-805 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <input 
                                type="text"
                                placeholder="Special notes... (e.g., spicy, no onions)"
                                value={item.specialNotes}
                                onChange={(e) => handleUpdateItemNotes(idx, e.target.value)}
                                className="w-full bg-white border border-slate-200 text-[10px] px-2 py-1 rounded focus:outline-none focus:border-emerald-500 text-slate-700"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={executeAddOrder}
                      disabled={orderItemsList.length === 0}
                      className="w-full mt-4 py-3 bg-emerald-500 hover:bg-emerald-455 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition shadow-lg shadow-emerald-500/10"
                    >
                      {activeOrder ? 'Append to Kitchen' : 'Send KOT to Kitchen'}
                    </button>
                  </div>
                )}
              </div>

              {/* Back to details link */}
              {activeAction !== 'details' && (
                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setActiveAction('details')}
                    className="w-full py-2.5 bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-550 hover:text-slate-800 uppercase tracking-wider rounded-xl cursor-pointer transition flex items-center justify-center gap-1.5"
                  >
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
