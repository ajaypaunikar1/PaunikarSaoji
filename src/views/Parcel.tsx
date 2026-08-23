import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { usePrinter } from '../context/PrinterContext';
import {
  ShoppingBag, Plus, Minus, Trash2, Search, Send, Printer,
  Wallet, CreditCard, Smartphone, PackageCheck, UserRound, Pencil, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem, PortionType, OrderItem, Order, PaymentMethod, SpiceLevel } from '../types/types';
import { toast } from 'sonner';

const Parcel: React.FC = () => {
  const {
    menuItems, orders, addParcelOrder, updateOrder, generateParcelBill, payBill,
    settings, currentUser, users, allCategories
  } = useApp();
  const { printBill: printBillThermal, connected } = usePrinter();

  // Menu picker state
  const [category, setCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Cart
  const [cart, setCart] = useState<OrderItem[]>([]);

  // Edit existing parcel order
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Checkout state
  const [gstPct, setGstPct] = useState<number>(settings?.gstEnabled === false ? 0 : (settings?.gstPct ?? 18));
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [containerCount, setContainerCount] = useState<number>(0);
  const [printData, setPrintData] = useState<{
    bill: any;
    orderItems: any[];
    waiterName: string;
    customerName?: string;
    phone?: string;
  } | null>(null);

  const filteredItems = useMemo(() => {
    return menuItems.filter(m => {
      const matchesCategory = category === 'All' || m.category === category;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch && m.isAvailable;
    });
  }, [menuItems, category, searchQuery]);

  // Active parcel orders (not yet served / paid) — editable
  const parcelOrders = useMemo(() => {
    return orders
      .filter(o => o.isParcel && o.status !== 'Served')
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 8);
  }, [orders]);

  const editingOrder = editingOrderId ? orders.find(o => o.id === editingOrderId) : null;

  const addToCart = (item: MenuItem, portion: PortionType) => {
    const price = portion === 'Single' ? item.price : (item.variants.find(v => v.name === portion)?.price || item.price);
    setCart(prev => {
      const exist = prev.find(c => c.name === item.name && c.portion === portion);
      if (exist) {
        return prev.map(c => c.name === item.name && c.portion === portion ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        // Keep the menuItem id so Repeat/cancel lookups and KDS printedQty
        // ticks stay linked to the original menu entry.
        id: item.id,
        name: item.name,
        category: item.category,
        quantity: 1,
        portion,
        price,
        spiceLevel: 'normal',
        status: 'Pending'
      }];
    });
  };

  const updateSpice = (idx: number, level: SpiceLevel) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, spiceLevel: level } : c));
  };

  const updateQty = (idx: number, amt: number) => {
    setCart(prev => prev
      .map((c, i) => i === idx ? { ...c, quantity: c.quantity + amt } : c)
      .filter(c => c.quantity > 0));
  };

  const removeFromCart = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setDiscountPct(0);
    setPaymentMethod(null);
    setEditingOrderId(null);
    setContainerCount(0);
  };

  const startEditing = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    setCart(order.items);
    setCustomerName(order.customerName || '');
    setCustomerPhone('');
    setNotes(order.notes || '');
    setDiscountPct(0);
    setPaymentMethod(null);
    setEditingOrderId(orderId);
    toast.info(`Editing parcel order #${orderId.substring(4, 10).toUpperCase()}`);
  };

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const gst = Math.round(subtotal * (gstPct / 100) * 100) / 100;
  const discountAmt = Math.round(subtotal * (discountPct / 100) * 100) / 100;
  const containerCharge = containerCount * 10;
  const grandTotal = Math.max(0, Math.round((subtotal + gst - discountAmt + containerCharge) * 100) / 100);

  const placeOrder = async (): Promise<Order | null> => {
    if (cart.length === 0) {
      toast.error('Add at least one item to the parcel');
      return null;
    }
    const order = await addParcelOrder(cart, notes || undefined, customerName || undefined);
    return order;
  };

  const handleSendToKitchen = async () => {
    if (editingOrderId) {
      if (cart.length === 0) {
        toast.error('Add at least one item to the parcel');
        return;
      }
      updateOrder(editingOrderId, { items: cart, notes: notes || undefined, customerName: customerName || undefined });
      toast.success(`Parcel order updated & sent to kitchen (${editingOrderId.substring(4, 10).toUpperCase()})`);
      clearCart();
      return;
    }
    const placed = await placeOrder();
    if (!placed) return;
    toast.success(`Parcel order sent to kitchen (${placed.id.substring(4, 10).toUpperCase()})`);
    clearCart();
  };

  const handleCollectPayment = async () => {
    if (!paymentMethod) {
      toast.error('Select a payment method (Cash / UPI / Card)');
      return;
    }
    try {
      if (editingOrderId) {
        const bill = await generateParcelBill(editingOrderId, discountAmt, gstPct, containerCharge);
        await payBill(bill.id, paymentMethod);
        const editingOrder = orders.find(o => o.id === editingOrderId);
        const waiterName = users.find(u => u.id === currentUser?.id)?.name || 'Staff';
        if (connected && editingOrder) {
          await printBillThermal({ ...bill, paymentMethod }, editingOrder, settings);
        }
        setPrintData({
          bill: { ...bill, paymentMethod },
          orderItems: editingOrder?.items || cart,
          waiterName,
          customerName: customerName || editingOrder?.customerName,
          phone: customerPhone
        });
        setTimeout(() => window.print(), 200);
        clearCart();
        return;
      }
      const placed = await placeOrder();
      if (!placed) return;
      const bill = await generateParcelBill(placed, discountAmt, gstPct, containerCharge);
      await payBill(bill.id, paymentMethod);
      const waiterName = users.find(u => u.id === currentUser?.id)?.name || 'Staff';
      if (connected) {
        await printBillThermal({ ...bill, paymentMethod }, placed, settings);
      }
      setPrintData({
        bill: { ...bill, paymentMethod },
        orderItems: placed.items,
        waiterName,
        customerName,
        phone: customerPhone
      });
      setTimeout(() => window.print(), 200);
      clearCart();
    } catch (err: any) {
      toast.error(err.message || 'Payment processing failed');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-amber-100 text-amber-700';
      case 'Preparing': return 'bg-blue-100 text-blue-700';
      case 'Ready': return 'bg-teal-100 text-teal-700';
      case 'Served': return 'bg-emerald-100 text-emerald-700';
      case 'Cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">Parcel / Takeaway</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Set up takeaway orders and collect payments without a table.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition ${
            connected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-600'
          }`}>
            <Printer size={13} className={connected ? 'text-emerald-600' : 'text-rose-500'} /> {connected ? 'Thermal: Connected' : 'Thermal: Offline'}
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
            <PackageCheck size={14} className="text-emerald-600" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700">Parcel Counter</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT: Menu picker */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
          <div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Select Menu Items</h3>
              <div className="relative w-full sm:w-56">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pb-1">
              {['All', ...allCategories].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    category === cat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
            {filteredItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center">No items available in this category.</p>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800 block truncate">{item.name}</span>
                    <span className="text-[10px] text-slate-400">{item.category}</span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {item.portionMode === 'Variant' ? (
                      item.variants.map((v, vi) => (
                        <button
                          key={vi}
                          onClick={() => addToCart(item, v.name as PortionType)}
                          className="px-2 py-1 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 text-[9px] font-bold text-emerald-700 cursor-pointer"
                        >
                          {v.name} ₹{v.price}
                        </button>
                      ))
                    ) : (
                      <button
                        onClick={() => addToCart(item, 'Single')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-[9px] font-bold text-white cursor-pointer flex items-center gap-1"
                      >
                        <Plus size={10} /> Add ₹{item.price}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Cart + checkout */}
        <div className="lg:col-span-2 space-y-4">
          {editingOrderId && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                <Pencil size={12} /> Editing parcel #{editingOrderId.substring(4, 10).toUpperCase()}
              </span>
              <button onClick={clearCart} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer">
                <X size={11} /> Cancel edit
              </button>
            </div>
          )}

          {/* Customer details */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-2.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <UserRound size={13} /> Customer Details
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Cart */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Parcel Basket</h3>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-[10px] font-bold text-rose-500 hover:text-rose-600 cursor-pointer flex items-center gap-1">
                  <Trash2 size={11} /> Clear
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Basket is empty — add items from the menu.</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {cart.map((c, idx) => (
                  <div key={c.id} className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs">
                    <div className="flex justify-between items-center">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 block truncate">{c.name}</span>
                        <span className="text-[9px] text-emerald-700 font-bold capitalize">{c.portion} · ₹{c.price}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateQty(idx, -1)} className="w-5 h-5 rounded bg-white border border-emerald-200 flex items-center justify-center text-slate-700 cursor-pointer"><Minus size={10} /></button>
                        <span className="font-mono font-bold w-5 text-center">{c.quantity}</span>
                        <button onClick={() => updateQty(idx, 1)} className="w-5 h-5 rounded bg-white border border-emerald-200 flex items-center justify-center text-slate-700 cursor-pointer"><Plus size={10} /></button>
                        <button onClick={() => removeFromCart(idx)} className="ml-1 text-rose-400 hover:text-rose-600 cursor-pointer"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">Spice</span>
                      {(['normal', 'medium', 'spicy'] as SpiceLevel[]).map(level => (
                        <button
                          key={level}
                          onClick={() => updateSpice(idx, level)}
                          className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide cursor-pointer transition ${
                            (c.spiceLevel || 'normal') === level
                              ? level === 'spicy'
                                ? 'bg-rose-600 text-white'
                                : level === 'medium'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-emerald-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Special notes for kitchen (optional)"
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Totals */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-2.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-mono font-bold text-slate-800">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs items-center gap-2">
              <span className="text-slate-500">GST ({gstPct}%)</span>
              <span className="font-mono font-bold text-slate-800">₹{gst.toFixed(2)}</span>
            </div>
            {cart.length > 0 && (
              <div className="flex justify-between text-xs items-center gap-2">
                <span className="text-slate-500 flex items-center gap-1.5">
                  Containers (₹10 each)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={containerCount}
                    onChange={e => setContainerCount(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                    className="w-12 px-1.5 py-0.5 text-right text-xs font-mono font-bold rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="font-mono font-bold text-slate-800 w-14 text-right">₹{containerCharge.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-between text-xs items-center gap-2">
              <span className="text-slate-500">Discount (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={discountPct}
                onChange={e => setDiscountPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                className="w-16 px-2 py-0.5 text-right text-xs font-mono font-bold rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-black text-slate-800">Total</span>
              <span className="font-mono font-black text-emerald-700">₹{grandTotal.toFixed(2)}</span>
            </div>

            {/* Payment method */}
            <div className="flex gap-2 pt-1">
              {([
                { label: 'Cash', icon: Wallet },
                { label: 'UPI', icon: Smartphone },
                { label: 'Card', icon: CreditCard }
              ] as { label: PaymentMethod; icon: any }[]).map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => setPaymentMethod(label)}
                  className={`flex-1 py-2 rounded-xl border text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    paymentMethod === label
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleSendToKitchen}
                disabled={cart.length === 0}
                className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Send size={13} /> {editingOrderId ? 'Update Order' : 'Send to Kitchen'}
              </button>
              <button
                onClick={handleCollectPayment}
                disabled={cart.length === 0}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {editingOrderId ? <><Wallet size={13} /> Checkout</> : <><Printer size={13} /> Collect & Print</>}
              </button>
            </div>
          </div>

          {/* Active parcel orders */}
          {parcelOrders.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Active Parcel Orders</h3>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {parcelOrders.map(o => (
                  <div key={o.id} className={`p-2 rounded-xl border flex justify-between items-center text-[11px] ${editingOrderId === o.id ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-slate-700">#{o.id.substring(4, 10).toUpperCase()}</span>
                      {o.customerName && <span className="ml-2 text-slate-500">· {o.customerName}</span>}
                      <span className="ml-2 text-slate-400">{o.items.length} items</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-slate-800">₹{o.grandTotal}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getStatusColor(o.status)}`}>{o.status}</span>
                      <button
                        onClick={() => startEditing(o.id)}
                        className="p-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                        title="Edit parcel order"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HIDDEN parcel receipt print area */}
      <AnimatePresence>
        {printData && (
          <div className="print-area hidden">
            <div style={{ width: '80mm', padding: '5px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif' }}>
              <div style={{ textAlign: 'center', borderBottom: '1px dashed black', paddingBottom: '10px', marginBottom: '10px' }}>
                {/* Restaurant monogram (no Vite logo) */}
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ display: 'inline-block', width: '36px', height: '36px', lineHeight: '36px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#fff', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px' }}>PS</span>
                </div>
                <h1 style={{ margin: '0', fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{settings?.restaurantName || 'Paunikar Saoji Restaurant'}</h1>
                <p style={{ margin: '3px 0 0 0', fontSize: '9px', lineHeight: '1.4', whiteSpace: 'pre-line' }}>{settings?.address || ''}</p>
                <h3 style={{ margin: '6px 0 0 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>PARCEL / TAKEWAY BILL</h3>
              </div>

              <table style={{ width: '100%', fontSize: '10px', marginBottom: '8px' }}>
                <tbody>
                  <tr>
                    <td>Bill No:</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{printData.bill.id.substring(5, 12)}</td>
                  </tr>
                  <tr>
                    <td>Order Type:</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>PARCEL</td>
                  </tr>
                  {printData.customerName && (
                    <tr>
                      <td>Customer:</td>
                      <td style={{ textAlign: 'right' }}>{printData.customerName}{printData.phone ? ` (${printData.phone})` : ''}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Waiter:</td>
                    <td style={{ textAlign: 'right' }}>{printData.waiterName}</td>
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
                      {printData.bill.paymentMethod === 'UPI' ? '💳 UPI' :
                       printData.bill.paymentMethod === 'Card' ? '💳 Card' : '💵 Cash'}
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
                  {printData.orderItems.map((item, idx) => (
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
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>{item.price}</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>{item.quantity * item.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed black', marginBottom: '6px' }} />

              <table style={{ width: '100%', fontSize: '10px', fontFamily: 'monospace', marginBottom: '10px' }}>
                <tbody>
                  <tr>
                    <td>Subtotal:</td>
                    <td style={{ textAlign: 'right' }}>₹{printData.bill.subtotal.toFixed(2)}</td>
                  </tr>
                  {printData.bill.gst > 0 && (
                    <tr>
                      <td>GST ({printData.bill.gstPct || 18}%):</td>
                      <td style={{ textAlign: 'right' }}>₹{printData.bill.gst.toFixed(2)}</td>
                    </tr>
                  )}
                  {printData.bill.discount > 0 && (
                    <tr>
                      <td>Discount:</td>
                      <td style={{ textAlign: 'right' }}>-₹{printData.bill.discount.toFixed(2)}</td>
                    </tr>
                  )}
                  {printData.bill.containerCharge > 0 && (
                    <tr>
                      <td>Container Charge:</td>
                      <td style={{ textAlign: 'right' }}>₹{printData.bill.containerCharge.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr style={{ fontWeight: 'bold', fontSize: '12px', borderTop: '1px solid black' }}>
                    <td>TOTAL:</td>
                    <td style={{ textAlign: 'right' }}>₹{printData.bill.grandTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ textAlign: 'center', fontSize: '9px', borderTop: '1px dashed black', paddingTop: '8px' }}>
                {settings?.phone && <p style={{ margin: '0', fontWeight: 'bold' }}>📞 {settings.phone}</p>}
                {settings?.upiId && <p style={{ margin: '2px 0 0 0' }}>UPI: {settings.upiId}</p>}
                <p style={{ margin: '4px 0 0 0' }}>Thank you for ordering! Visit again.</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Parcel;
