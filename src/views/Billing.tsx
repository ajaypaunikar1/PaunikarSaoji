import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  Receipt, CreditCard, Wallet, Smartphone,
  Printer, Percent, Calculator
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Bill, PaymentMethod } from '../types/types';
import { toast } from 'sonner';

const Billing: React.FC = () => {
  const { 
    tables, orders, generateBill, payBill, bills, language,
    requestCancellation, users, settings, currentUser, updateOrder
  } = useApp();
  const t = translations[language];

  // Billing screen state
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [discountPct, setDiscountPct] = useState<number>(0);   // Discount in %
  const [customGstPct, setCustomGstPct] = useState<number>(18); // Default 18%
  const [cancelReason, setCancelReason] = useState<string>('');
  const [activeCancelItemId, setActiveCancelItemId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  // Print layout state
  const [printBillData, setPrintBillData] = useState<{
    bill: Bill;
    orderItems: any[];
    waiterName: string;
  } | null>(null);

  // Filter occupied or billing tables
  const billingTables = tables.filter(tbl => tbl.status === 'Occupied' || tbl.status === 'Billing');

  const selectedTable = tables.find(tbl => tbl.id === selectedTableId);
  const selectedOrder = selectedTable?.orderId 
    ? orders.find(o => o.id === selectedTable.orderId) 
    : null;

  // Active bill generated for the selected table
  const activeBill = useMemo(() => {
    if (!selectedTableId || !selectedOrder) return null;
    
    // Check if there is already a pending bill for this table
    const existing = bills.find(b => b.orderId === selectedOrder.id && b.paymentStatus === 'Pending');

    const baseBill = existing || {
      id: `preview-${Date.now()}`,
      orderId: selectedOrder.id,
      tableId: selectedTableId,
      paymentStatus: 'Pending' as const,
      timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
      date: new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
    };

    // Calculate dynamically based on inputs
    const subtotal = selectedOrder.grandTotal;
    const gst = Math.round(subtotal * (customGstPct / 100) * 100) / 100;
    // Discount is now a percentage
    const discountAmt = Math.round(subtotal * (discountPct / 100) * 100) / 100;
    const discount = Math.min(discountAmt, subtotal + gst);
    const grandTotal = Math.max(0, Math.round((subtotal + gst - discount) * 100) / 100);

    return {
      ...baseBill,
      subtotal,
      gst,
      gstPct: customGstPct,
      discount,
      discountPct,
      grandTotal,
    };
  }, [selectedTableId, selectedOrder, discountPct, customGstPct, bills, settings?.gstEnabled]);

  // UPI payment string generator
  const upiString = useMemo(() => {
    if (!activeBill) return '';
    const amount = activeBill.grandTotal;
    const upiId = settings?.upiId || 'restaurant@upi';
    const restName = encodeURIComponent(settings?.restaurantName || 'PaunikarSaoji');
    return `upi://pay?pa=${upiId}&pn=${restName}&am=${amount}&cu=INR&tn=Table${activeBill.tableId}Order`;
  }, [activeBill, settings]);

  // Submit payment
  const handleProcessPayment = async () => {
    if (!selectedTableId || !selectedOrder) {
      toast.error('Select an active table to checkout');
      return;
    }

    try {
      const finalBill = await generateBill(selectedTableId, Math.round(selectedOrder.grandTotal * (discountPct / 100) * 100) / 100, customGstPct);
      const waiterName = users.find(u => u.id === selectedOrder.waiterId)?.name || 'Staff';

      // Trigger ESC/POS network printer via backend if available
      try {
        const token = localStorage.getItem('rms_token');
        await fetch(`http://localhost:5000/api/billing/${finalBill.id}/print`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch {}

      await payBill(finalBill.id, paymentMethod || 'Cash');
      
      // Trigger browser print dialog automatically
      handlePrintReceipt({ ...finalBill, paymentMethod: paymentMethod || 'Cash' }, selectedOrder.items, waiterName);

      setSelectedTableId(null);
      setDiscountPct(0);
      setCustomGstPct(18);
    } catch (err: any) {
      toast.error(err.message || 'Payment processing failed');
    }
  };

  // Standalone Printer Trigger (Print Bill without checking out)
  const handlePrintOnly = async () => {
    if (!selectedTableId || !selectedOrder || !activeBill) {
      toast.error('Select an active table to print bill');
      return;
    }
    try {
      const discountAmt = Math.round(selectedOrder.grandTotal * (discountPct / 100) * 100) / 100;
      const finalBill = await generateBill(selectedTableId, discountAmt, customGstPct);
      const waiterName = users.find(u => u.id === selectedOrder.waiterId)?.name || 'Staff';

      // Trigger ESC/POS network printer via backend
      try {
        const token = localStorage.getItem('rms_token');
        await fetch(`http://localhost:5000/api/billing/${finalBill.id}/print`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch {}

      handlePrintReceipt(finalBill, selectedOrder.items, waiterName);
      toast.success('Bill print triggered!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to print bill');
    }
  };

  // Printer trigger
  const handlePrintReceipt = (bill: Bill, orderItems: any[], waiterName: string) => {
    setPrintBillData({
      bill,
      orderItems,
      waiterName
    });
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Submit Cancellation Request to Manager or Cancel Directly
  const triggerCancelRequest = (itemId: string, itemName: string, portion: string) => {
    if (!selectedOrder || !cancelReason.trim()) {
      toast.error('Please enter a cancellation reason');
      return;
    }

    const canCancelDirectly = ['SuperAdmin', 'Admin', 'Manager', 'Cashier'].includes(currentUser?.role || '');

    if (canCancelDirectly) {
      const updatedItems = selectedOrder.items.filter(item => item.id !== itemId);
      updateOrder(selectedOrder.id, { items: updatedItems });
      toast.success(`${itemName} removed successfully`);
    } else {
      requestCancellation(selectedOrder.id, `${itemName} (${portion})`, cancelReason);
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
                      setDiscountPct(0);
                      setCustomGstPct(settings?.gstEnabled ? 18 : 0);
                      setPaymentMethod('Cash');
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
                      {order && <div className="text-xs font-bold text-slate-800 font-mono">₹{order.grandTotal}</div>}
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
        </div>

        {/* Center/Right Column: Checkout Details and Invoice breakdown */}
        <div className="lg:col-span-2 space-y-4">
          
          <AnimatePresence mode="wait">
            {selectedTable && selectedOrder && activeBill ? (
              <motion.div
                key={selectedTableId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="flex flex-col gap-6 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm max-w-2xl"
              >
                {/* Order Summary & Item list */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-800 uppercase font-mono">Table {selectedTableId} Summary</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">#{selectedOrder.id.substring(4,8)}</span>
                  </div>

                  {/* KOT items with Cashier cancellation action */}
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-150 flex justify-between items-center text-xs relative group">
                        
                        <div className="pr-4">
                          <span className="font-bold text-slate-800">{item.name}</span>
                          <span className="ml-1.5 text-[9px] text-slate-550 font-bold uppercase bg-slate-200 px-1.5 py-0.2 rounded">{item.portion}</span>
                          <div className="text-[10px] text-slate-500 font-bold mt-0.5">{item.quantity} x ₹{item.price}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 font-mono">₹{item.quantity * item.price}</span>
                          
                          {/* Cancellation request trigger */}
                          <button
                            onClick={() => {
                              setActiveCancelItemId(item.id === activeCancelItemId ? null : item.id);
                              setCancelReason('');
                            }}
                            className="p-1 rounded bg-white border border-slate-200 text-rose-500 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer"
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
                                onClick={() => triggerCancelRequest(item.id, item.name, item.portion)}
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
                      <span className="font-mono text-slate-800">₹{activeBill.subtotal}</span>
                    </div>

                    {/* Editable GST Input */}
                    <div className="flex justify-between items-center py-1">
                      <span className="font-bold text-slate-700">GST (%)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          min="0"
                          max="28"
                          value={customGstPct}
                          onChange={e => setCustomGstPct(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-16 bg-slate-50 border border-slate-200 rounded font-mono text-right text-slate-800 p-1 text-xs focus:outline-none focus:border-emerald-500"
                        />
                        <span className="font-mono text-slate-800 w-16 text-right">₹{activeBill.gst.toFixed(2)}</span>
                      </div>
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
                        <span className="font-mono text-slate-800 w-16 text-right">-₹{activeBill.discount.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm font-black">
                      <span className="text-slate-850 uppercase tracking-wider">{t.grandTotal}</span>
                      <span className="text-emerald-600 font-mono">₹{activeBill.grandTotal}</span>
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

                {/* UPI scan QR code */}
                {paymentMethod === 'UPI' && upiString && (
                  <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100 flex flex-col items-center gap-2.5 transition">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">Scan QR to Pay</span>
                    <div className="bg-white p-3 rounded-2xl border border-indigo-150 shadow-inner">
                      <QRCodeSVG value={upiString} size={110} />
                    </div>
                    <span className="text-xs font-black text-slate-800 font-mono">₹{activeBill.grandTotal}</span>
                  </div>
                )}

                {/* Payment & Checkout Buttons */}
                <div className="pt-2 grid grid-cols-2 gap-3">
                  <button
                    onClick={handlePrintOnly}
                    className="py-3.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition shadow-md flex items-center justify-center gap-1.5"
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
              </motion.div>
            ) : (
              <div className="text-center py-20 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col items-center gap-2">
                <Receipt size={42} className="text-slate-450 animate-pulse" />
                <p className="text-xs text-slate-500 font-medium">Select an active table on the left to begin invoicing.</p>
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
                {/* Restaurant Logo */}
                <div style={{ marginBottom: '6px' }}>
                  <img src="/favicon.svg" alt="Logo" style={{ width: '40px', height: '40px', margin: '0 auto', display: 'block' }} />
                </div>
                <h1 style={{ margin: '0', fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{settings?.restaurantName || 'Paunikar Saoji Restaurant'}</h1>
                <p style={{ margin: '3px 0 0 0', fontSize: '9px', lineHeight: '1.4', whiteSpace: 'pre-line' }}>{settings?.address || ''}</p>
                {settings?.phone && (
                  <p style={{ margin: '2px 0 0 0', fontSize: '9px', fontWeight: 'bold' }}>📞 {settings.phone}</p>
                )}
                <h3 style={{ margin: '6px 0 0 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>TAX INVOICE (कर बीजक)</h3>
              </div>

              <table style={{ width: '100%', fontSize: '10px', marginBottom: '8px' }}>
                <tbody>
                  <tr>
                    <td>Bill No:</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{printBillData.bill.id.substring(5, 12)}</td>
                  </tr>
                  <tr>
                    <td>Table:</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>Table {printBillData.bill.tableId}</td>
                  </tr>
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
                      </td>
                      <td style={{ textAlign: 'center', padding: '4px 0', fontFamily: 'monospace' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>{item.price}</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>{item.quantity * item.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed black', marginBottom: '6px' }} />

              {/* Totals — CGST 9% + SGST 9% for 18% GST */}
              <table style={{ width: '100%', fontSize: '10px', fontFamily: 'monospace', marginBottom: '10px' }}>
                <tbody>
                  <tr>
                    <td>Subtotal:</td>
                    <td style={{ textAlign: 'right' }}>₹{printBillData.bill.subtotal.toFixed(2)}</td>
                  </tr>
                  {printBillData.bill.gst > 0 && (() => {
                    const gstPct = printBillData.bill.gstPct || 18;
                    const halfPct = gstPct / 2;
                    const halfAmt = Math.round(printBillData.bill.gst / 2 * 100) / 100;
                    return (
                      <>
                        <tr>
                          <td>CGST ({halfPct}%):</td>
                          <td style={{ textAlign: 'right' }}>₹{halfAmt.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td>SGST ({halfPct}%):</td>
                          <td style={{ textAlign: 'right' }}>₹{halfAmt.toFixed(2)}</td>
                        </tr>
                      </>
                    );
                  })()}
                  {printBillData.bill.discount > 0 && (
                    <tr style={{ color: 'green' }}>
                      <td>Discount{printBillData.bill.discountPct ? ` (${printBillData.bill.discountPct}%)` : ''}:</td>
                      <td style={{ textAlign: 'right' }}>-₹{printBillData.bill.discount.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr style={{ fontSize: '12px', fontWeight: 'bold', borderTop: '1px solid black' }}>
                    <td style={{ paddingTop: '4px' }}>GRAND TOTAL:</td>
                    <td style={{ textAlign: 'right', paddingTop: '4px' }}>₹{printBillData.bill.grandTotal.toFixed(2)}</td>
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
