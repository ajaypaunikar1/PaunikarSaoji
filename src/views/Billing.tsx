import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { usePrinter } from '../context/PrinterContext';
import RolePrinterButton from '../components/RolePrinterButton';
import { translations } from '../translations/translations';
import { 
  Receipt, CreditCard, Wallet, Smartphone,
  Printer, Percent, Calculator, PackageCheck, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Bill, PaymentMethod } from '../types/types';
import { formatCurrency, formatAmount } from '../utils/currency';
import { toast } from 'sonner';

const Billing: React.FC = () => {
  const { 
    tables, orders, generateBill, generateParcelBill, payBill, bills, language,
    requestCancellation, users, settings, currentUser, updateOrder
  } = useApp();
  const { printBill: printBillThermal, connected } = usePrinter();
  const t = translations[language];

  // Billing screen state
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState<number>(0);   // Discount in %
  const [containerCount, setContainerCount] = useState<number>(1); // ₹10/plate for parcels
  const [cancelReason, setCancelReason] = useState<string>('');
  const [activeCancelItemId, setActiveCancelItemId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  // Print layout state
  const [printBillData, setPrintBillData] = useState<{
    bill: Bill;
    orderItems: any[];
    waiterName: string;
    customerName?: string;
  } | null>(null);

  // Filter occupied or billing tables
  const billingTables = tables.filter(tbl => tbl.status === 'Occupied' || tbl.status === 'Billing');

  // Active parcel / takeaway orders (not yet served / paid)
  const activeParcels = orders.filter(o => o.isParcel && o.status !== 'Served');

  const selectedTable = tables.find(tbl => tbl.id === selectedTableId);
  const selectedOrder = selectedParcelId
    ? orders.find(o => o.id === selectedParcelId) || null
    : (selectedTable?.orderId ? orders.find(o => o.id === selectedTable.orderId) : null);

  // Active bill generated for the selected table / parcel
  const activeBill = useMemo(() => {
    if (!selectedOrder) return null;

    const isParcel = !!selectedParcelId;

    // Check if there is already a pending bill for this order
    const existing = bills.find(b => b.orderId === selectedOrder.id && b.paymentStatus === 'Pending');

    const baseBill = existing || {
      id: `preview-${Date.now()}`,
      orderId: selectedOrder.id,
      tableId: isParcel ? 0 : selectedTableId,
      isParcel,
      paymentStatus: 'Pending' as const,
      timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
      date: new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
    };

    // Calculate dynamically based on inputs
    const subtotal = selectedOrder.grandTotal;
    // Discount is now a percentage
    const discountAmt = Math.round(subtotal * (discountPct / 100) * 100) / 100;
    const discount = Math.min(discountAmt, subtotal);
    const containerCharge = isParcel ? containerCount * 10 : 0;
    const grandTotal = Math.max(0, Math.round((subtotal - discount + containerCharge) * 100) / 100);

    return {
      ...baseBill,
      subtotal,
      discount,
      discountPct,
      containerCharge,
      grandTotal,
    };
  }, [selectedTableId, selectedParcelId, selectedOrder, discountPct, containerCount, bills]);

  // Submit payment
  const handleProcessPayment = async () => {
    if (!selectedOrder) {
      toast.error('Select an active order to checkout');
      return;
    }

    try {
      const discountAmt = Math.round(selectedOrder.grandTotal * (discountPct / 100) * 100) / 100;
      const containerCharge = selectedParcelId ? containerCount * 10 : 0;
      const finalBill = selectedParcelId
        ? await generateParcelBill(selectedOrder.id, discountAmt, containerCharge)
        : await generateBill(selectedTableId!, discountAmt);
      const waiterName = users.find(u => u.id === selectedOrder.waiterId)?.name || 'Staff';

      // Record the payment BEFORE triggering the printer so the receipt reflects
      // the actual payment method (Cash / UPI / Card) instead of defaulting to Cash.
      await payBill(finalBill.id, paymentMethod || 'Cash');

      const paidBill = { ...finalBill, paymentMethod: paymentMethod || 'Cash' };

      // Physical thermal printing via Web Serial (performed on this device).
      // Browser PDF copy remains available via the "Browser Print" button.
      await printBillThermal(paidBill, selectedOrder, settings);

      // Keep the print data so a PDF/browser copy can be printed if required.
      handleSetPrintData(
        paidBill,
        selectedOrder.items,
        waiterName,
        selectedParcelId ? selectedOrder.customerName : undefined
      );

      setSelectedTableId(null);
      setSelectedParcelId(null);
      setDiscountPct(0);
      setPaymentMethod(null);
      setPrintBillData(null);
    } catch (err: any) {
      toast.error(err.message || 'Payment processing failed');
    }
  };

  // Standalone Printer Trigger (Print Bill without checking out)
  // Prints the in-memory preview bill — no DB record is created, so prebill
  // prints never pollute pending-dues / reports.
  const handlePrintOnly = async () => {
    if (!selectedOrder || !activeBill) {
      toast.error('Select an active order to print bill');
      return;
    }
    try {
      const finalBill = activeBill as Bill;
      const waiterName = users.find(u => u.id === selectedOrder.waiterId)?.name || 'Staff';

      // Physical thermal printing via Web Serial (performed on this device).
      await printBillThermal(finalBill, selectedOrder, settings);

      handleSetPrintData(
        finalBill,
        selectedOrder.items,
        waiterName,
        selectedParcelId ? selectedOrder.customerName : undefined
      );
      toast.success('Bill print triggered!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to print bill');
    }
  };

  // Store the bill for the browser PDF print path
  const handleSetPrintData = (bill: Bill, orderItems: any[], waiterName: string, customerName?: string) => {
    setPrintBillData({
      bill,
      orderItems,
      waiterName,
      customerName
    });
  };

  // Browser PDF print (window.print) - independent of thermal printing
  const handleBrowserPrint = () => {
    if (!printBillData) {
      toast.error('Generate a bill first before using browser print');
      return;
    }
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Submit Cancellation Request to Manager or Cancel Directly
  const triggerCancelRequest = (itemId: string, itemName: string, portion: string, quantity: number) => {
    if (!selectedOrder || !cancelReason.trim()) {
      toast.error('Please enter a cancellation reason');
      return;
    }

    const canCancelDirectly = ['SuperAdmin', 'Admin', 'Manager', 'Cashier'].includes(currentUser?.role || '');

    if (canCancelDirectly) {
      const updatedItems = selectedOrder.items
        .map(item => item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item)
        .filter(item => item.quantity > 0);
      updateOrder(selectedOrder.id, { items: updatedItems });
      toast.success(`1 x ${itemName} removed successfully`);
    } else {
      // Encode quantity so approval can do a partial cancel: "Name (Full) x2"
      requestCancellation(selectedOrder.id, `${itemName} (${portion}) x${quantity}`, cancelReason);
    }

    setCancelReason('');
    setActiveCancelItemId(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">{t.billing}</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Generate invoices, collect payments, and manage UPI QR codes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Active Tables Selection list */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Active Guest Tables</h3>
          
          {billingTables.length === 0 ? (
            <div className="p-6 text-center rounded-3xl bg-white border border-slate-200 text-slate-400 text-xs py-10 shadow-sm">
              No active tables currently require billing.
            </div>
          ) : (
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {billingTables.map(tbl => {
                const isSelected = selectedTableId === tbl.id;
                const order = orders.find(o => o.id === tbl.orderId);
                const isWaitingPayment = tbl.status === 'Billing';
                
                return (
                  <div
                    key={tbl.id}
                    onClick={() => {
                      setSelectedTableId(tbl.id);
                      setSelectedParcelId(null);
                      setDiscountPct(0);
                    }}
                    className={`p-4 rounded-2xl border transition duration-300 flex justify-between items-center cursor-pointer ${
                      isSelected 
                        ? 'bg-emerald-500/10 border-emerald-500 text-slate-900 shadow-sm' 
                        : isWaitingPayment
                          ? 'bg-cyan-500/10 border-cyan-500/40 text-slate-900 animate-pulse'
                          : 'bg-white border-slate-200 text-slate-700 shadow-sm hover:border-slate-350'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold font-mono">T-{tbl.id}</span>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Zone {tbl.zone}</p>
                    </div>

                    <div className="text-right">
                      {order && <div className="text-xs font-bold text-slate-800 font-mono">{formatCurrency(order.grandTotal)}</div>}
                      <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border mt-1.5 inline-block ${
                        isWaitingPayment 
                          ? 'bg-cyan-100 border-cyan-200 text-cyan-700' 
                          : 'bg-emerald-100 border-emerald-200 text-emerald-700'
                      }`}>
                        {isWaitingPayment ? 'Checkout Requested' : 'Seated'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Parcel / Takeaway Orders */}
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mt-5">Parcel / Takeaway Orders</h3>
          {activeParcels.length === 0 ? (
            <div className="p-5 text-center rounded-3xl bg-white border border-slate-200 text-slate-400 text-xs shadow-sm">
              No active parcel orders currently require billing.
            </div>
          ) : (
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {activeParcels.map(o => {
                const isSelected = selectedParcelId === o.id;
                return (
                  <div
                    key={o.id}
                    onClick={() => {
                      setSelectedParcelId(o.id);
                      setSelectedTableId(null);
                      setDiscountPct(0);
                    }}
                    className={`p-4 rounded-2xl border transition duration-300 flex justify-between items-center cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500 text-slate-900 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 shadow-sm hover:border-slate-350'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold font-mono flex items-center gap-1.5">
                        <PackageCheck size={12} className="text-indigo-500" /> #{o.id.substring(4, 10).toUpperCase()}
                      </span>
                      {o.customerName && (
                        <p className="text-[10px] text-slate-500 font-bold truncate mt-1">{o.customerName}</p>
                      )}
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">{o.items.length} items</p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-800 font-mono">{formatCurrency(o.grandTotal)}</div>
                      <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border mt-1.5 inline-block bg-indigo-100 border-indigo-200 text-indigo-700">
                        {o.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Center/Right Column: Checkout Details and Invoice breakdown */}
        <div className="lg:col-span-2 space-y-4">
          
          <AnimatePresence mode="wait">
            {selectedOrder && activeBill ? (
              <motion.div
                key={selectedParcelId || `table-${selectedTableId}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="flex flex-col gap-6 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm max-w-2xl"
              >
                {/* Order Summary & Item list */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-800 uppercase font-mono">
                      {selectedParcelId ? 'Parcel Order Summary' : `Table ${selectedTableId} Summary`}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">#{selectedOrder.id.substring(4,8)}</span>
                  </div>

                  {/* KOT items with Cashier cancellation action */}
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-150 flex justify-between items-center text-xs relative group">
                        
                        <div className="pr-4">
                          {item.category && (
                            <span className="mr-1.5 text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded align-middle">{item.category}</span>
                          )}
                          <span className="font-bold text-slate-800">{item.name}</span>
                          <span className="ml-1.5 text-[9px] text-slate-550 font-bold uppercase bg-slate-200 px-1.5 py-0.2 rounded">{item.portion}</span>
                          <div className="text-[10px] text-slate-500 font-bold mt-0.5">{item.quantity} x {formatCurrency(item.price)}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 font-mono">{formatCurrency(item.quantity * item.price)}</span>
                          
                          {/* Cancellation request trigger */}
                          <button
                            onClick={() => {
                              setActiveCancelItemId(item.id === activeCancelItemId ? null : item.id);
                              setCancelReason('');
                            }}
                            className="p-1 rounded bg-white border border-slate-200 text-rose-500 hover:text-rose-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition cursor-pointer"
                            title="Request Cancellation"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Cancellation reasoning popover */}
                        {activeCancelItemId === item.id && (
                          <div className="absolute right-0 top-12 left-0 z-10 p-3 rounded-xl bg-white border border-rose-300 shadow-lg space-y-2">
                            <span className="text-[10px] font-bold text-rose-600 block uppercase">Request Item Removal</span>
                            <input 
                              type="text"
                              value={cancelReason}
                              onChange={e => setCancelReason(e.target.value)}
                              placeholder={t.reasonPlaceholder}
                              className="w-full bg-slate-50 border border-slate-200 text-[10px] p-2 rounded focus:outline-none focus:border-rose-400 text-slate-800"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button 
                                onClick={() => setActiveCancelItemId(null)}
                                className="px-2 py-1 bg-slate-100 rounded text-[9px] font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => triggerCancelRequest(item.id, item.name, item.portion, item.quantity)}
                                className="px-2 py-1 bg-rose-500 hover:bg-rose-650 text-white rounded font-bold text-[9px] cursor-pointer"
                              >
                                Submit
                              </button>
                            </div>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>

                  {/* Calculations breakdown */}
                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono text-slate-800">{formatCurrency(activeBill.subtotal)}</span>
                    </div>

                    {/* Editable Discount Input — now in % */}
                    <div className="flex justify-between items-center py-1">
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <Percent size={11} className="text-emerald-500" /> Discount (%)
                      </span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          min="0"
                          max="100"
                          value={discountPct || ''}
                          onChange={e => setDiscountPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                          className="w-16 bg-slate-50 border border-slate-200 rounded font-mono text-right text-slate-800 p-1 text-xs focus:outline-none focus:border-emerald-500"
                        />
                        <span className="font-mono text-slate-800 w-16 text-right">-{formatCurrency(activeBill.discount)}</span>
                      </div>
                    </div>

                    {selectedParcelId && (
                      <div className="flex justify-between items-center py-1">
                        <span className="flex items-center gap-1.5 font-bold text-slate-700 text-xs">
                          Containers (₹10 each)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={containerCount}
                            onChange={e => setContainerCount(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                            className="w-12 px-1.5 py-0.5 text-right text-xs font-mono font-bold rounded bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-500"
                          />
                          <span className="font-mono text-slate-800 w-14 text-right text-xs">{formatCurrency(activeBill.containerCharge)}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm font-black">
                      <span className="text-slate-850 uppercase tracking-wider">{t.grandTotal}</span>
                      <span className="text-emerald-600 font-mono">{formatCurrency(activeBill.grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Payment Method / पेमेंट पद्धत</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPaymentMethod('Cash')}
                      className={`py-3 px-4 rounded-xl border-2 font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition duration-200 ${
                        paymentMethod === 'Cash'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                          : 'border-slate-200 hover:border-slate-350 text-slate-650 bg-white'
                      }`}
                    >
                      <Wallet size={15} className="text-emerald-650" />
                      <span>Cash / रोख</span>
                    </button>

                    <button
                      onClick={() => setPaymentMethod('UPI')}
                      className={`py-3 px-4 rounded-xl border-2 font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition duration-200 ${
                        paymentMethod === 'UPI'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-xs'
                          : 'border-slate-200 hover:border-slate-350 text-slate-650 bg-white'
                      }`}
                    >
                      <Smartphone size={15} className="text-indigo-600" />
                      <span>UPI / ऑनलाईन</span>
                    </button>
                  </div>
                </div>

                {/* Payment & Checkout Buttons */}
                <div className="pt-2 grid grid-cols-2 gap-3">
                  <button
                    onClick={handlePrintOnly}
                    className="py-3.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition shadow-md flex items-center justify-center gap-1.5"
                    title={connected ? 'Thermal print via Web Serial' : 'Printer not connected - connect in Dashboard settings'}
                  >
                    <Printer size={15} /> Print Bill
                  </button>

                  <button
                    onClick={handleProcessPayment}
                    className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-1.5"
                  >
                    <Receipt size={15} /> Pay & Checkout & Print
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={handleBrowserPrint}
                    disabled={!printBillData}
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-emerald-600 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <FileText size={12} /> Browser Print (PDF)
                  </button>
                  <RolePrinterButton role="BILLING" label="Billing Printer" />
                </div>
              </motion.div>
            ) : (
              <div className="text-center py-20 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col items-center gap-2">
                <Receipt size={42} className="text-slate-450 animate-pulse" />
                <p className="text-xs text-slate-500 font-medium">Select an active table or parcel order on the left to begin invoicing.</p>
              </div>
            )}
          </AnimatePresence>

        </div>

      </div>

      {/* HIDDEN receipt print area for cashiers */}
      <AnimatePresence>
        {printBillData && (
          <div className="print-area hidden">
            {/* 1. COUNTER BILL (CUSTOMER RECEIPT) */}
            <div style={{ width: '80mm', padding: '5px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif' }}>
              <div style={{ textAlign: 'center', borderBottom: '1px dashed black', paddingBottom: '10px', marginBottom: '10px' }}>
                {/* Restaurant monogram (no Vite logo) */}
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ display: 'inline-block', width: '36px', height: '36px', lineHeight: '36px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#fff', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px' }}>PS</span>
                </div>
                <h1 style={{ margin: '0', fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{settings?.restaurantName || 'Paunikar Saoji Restaurant'}</h1>
                <p style={{ margin: '3px 0 0 0', fontSize: '9px', lineHeight: '1.4', whiteSpace: 'pre-line' }}>{settings?.address || ''}</p>
                {settings?.phone && (
                  <p style={{ margin: '2px 0 0 0', fontSize: '9px', fontWeight: 'bold' }}>📞 {settings.phone}</p>
                )}
                <h3 style={{ margin: '6px 0 0 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>BILL / INVOICE</h3>
              </div>

              <table style={{ width: '100%', fontSize: '10px', marginBottom: '8px' }}>
                <tbody>
                  <tr>
                    <td>Bill No:</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{printBillData.bill.id.substring(5, 12)}</td>
                  </tr>
                  <tr>
                    <td>{printBillData.bill.isParcel ? 'Order Type:' : 'Table:'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {printBillData.bill.isParcel ? 'PARCEL' : `Table ${printBillData.bill.tableId}`}
                    </td>
                  </tr>
                  {printBillData.bill.isParcel && printBillData.customerName && (
                    <tr>
                      <td>Customer:</td>
                      <td style={{ textAlign: 'right' }}>{printBillData.customerName}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Waiter:</td>
                    <td style={{ textAlign: 'right' }}>{printBillData.waiterName}</td>
                  </tr>
                  <tr>
                    <td>Invoice Date:</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                  </tr>
                  <tr>
                    <td>Invoice Time:</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}
                    </td>
                  </tr>
                  <tr>
                    <td>Payment:</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {printBillData.bill.paymentMethod === 'UPI' ? '💳 UPI' : 
                       printBillData.bill.paymentMethod === 'Card' ? '💳 Card' : '💵 Cash'}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed black', marginBottom: '6px' }} />

              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginBottom: '8px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid black' }}>
                    <th style={{ textAlign: 'left', padding: '3px 0' }}>Item (Portion)</th>
                    <th style={{ textAlign: 'center', padding: '3px 0' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '3px 0' }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: '3px 0' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printBillData.orderItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                      <td style={{ padding: '4px 0' }}>
                        {item.name}
                        <span style={{ fontSize: '8px', display: 'block', color: '#444' }}>({item.portion})</span>
                        {item.spiceLevel && item.spiceLevel !== 'normal' && (
                          <span style={{ fontSize: '8px', display: 'block', color: '#b91c1c', textTransform: 'uppercase' }}>
                            Spice: {item.spiceLevel}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '4px 0', fontFamily: 'monospace' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>{formatAmount(item.price)}</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>{formatAmount(item.quantity * item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed black', marginBottom: '6px' }} />

              {/* Totals */}
              <table style={{ width: '100%', fontSize: '10px', fontFamily: 'monospace', marginBottom: '10px' }}>
                <tbody>
                  <tr>
                    <td>Subtotal:</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(printBillData.bill.subtotal)}</td>
                  </tr>
                  {printBillData.bill.discount > 0 && (
                    <tr style={{ color: 'green' }}>
                      <td>Discount{printBillData.bill.discountPct ? ` (${printBillData.bill.discountPct}%)` : ''}:</td>
                      <td style={{ textAlign: 'right' }}>-{formatCurrency(printBillData.bill.discount)}</td>
                    </tr>
                  )}
                  {(printBillData.bill.containerCharge || 0) > 0 && (
                    <tr>
                      <td>Container Charge:</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(printBillData.bill.containerCharge || 0)}</td>
                    </tr>
                  )}
                  <tr style={{ fontSize: '12px', fontWeight: 'bold', borderTop: '1px solid black' }}>
                    <td style={{ paddingTop: '4px' }}>GRAND TOTAL:</td>
                    <td style={{ textAlign: 'right', paddingTop: '4px' }}>{formatCurrency(printBillData.bill.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed black', marginBottom: '8px' }} />

              <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '10px' }}>
                <p style={{ margin: '0', fontWeight: 'bold' }}>
                  Payment: {printBillData.bill.paymentMethod === 'UPI' ? 'Paid via UPI' : 
                             printBillData.bill.paymentMethod === 'Card' ? 'Paid via Card' : 'Paid in Cash'}
                </p>
                <p style={{ margin: '6px 0 0 0', fontStyle: 'italic' }}>Thank you! Visit Again. 🙏</p>
                {settings?.phone && (
                  <p style={{ margin: '2px 0 0 0', fontSize: '8px', color: '#555' }}>{settings.restaurantName || 'Paunikar Saoji Restaurant'} • {settings.phone}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Billing;
