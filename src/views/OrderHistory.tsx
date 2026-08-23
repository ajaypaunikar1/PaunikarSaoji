import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ClipboardList, Search, Eye, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Order } from '../types/types';

const OrderHistory: React.FC = () => {
  const { orders, users } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Filter orders based on search and status, sorted newest first
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const waiter = users.find(u => u.id === order.waiterId);
      const waiterName = waiter ? waiter.name.toLowerCase() : 'waiter';
      const orderIdMatch = order.id.toLowerCase().includes(searchTerm.toLowerCase());
      const tableMatch = order.isParcel
        ? 'parcel'.includes(searchTerm.toLowerCase())
        : `table ${order.tableId}`.toLowerCase().includes(searchTerm.toLowerCase());
      const waiterMatch = waiterName.includes(searchTerm.toLowerCase());
      
      const searchMatch = orderIdMatch || tableMatch || waiterMatch;
      const statusMatch = statusFilter === 'All' || order.status === statusFilter;

      return searchMatch && statusMatch;
    }).sort((a, b) => {
      // Sort by id (which includes timestamp) descending — newest first
      return b.id.localeCompare(a.id);
    });
  }, [orders, searchTerm, statusFilter, users]);

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Preparing': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Ready': return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'Served': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // API orders carry the date under createdAt (ISO string); fall back to the
  // order.date field used by the local fallback mode, and never render empty.
  const getOrderDate = (order: Order): string => {
    if (order.date) return order.date;
    const createdAt = (order as any).createdAt;
    if (createdAt) {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
      }
    }
    return '—';
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">Order History</h2>
          <p className="text-xs text-slate-505 font-medium mt-1">Review, track, and analyze all counter and table orders.</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search by Order ID, Table, or Waiter..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-850 rounded-2xl text-xs font-semibold focus:outline-none focus:border-emerald-500 transition duration-300"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 shrink-0">
            <Filter size={14} /> Filter Status:
          </span>
          <div className="flex bg-slate-50 border border-slate-200 p-0.5 rounded-2xl">
            {['All', 'Pending', 'Preparing', 'Ready', 'Served'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  statusFilter === status
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-505 hover:text-slate-800'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Order List Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className="p-4 pl-6">Order ID</th>
                <th className="p-4">Table</th>
                <th className="p-4">Waiter</th>
                <th className="p-4">Date</th>
                <th className="p-4">Time</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right pr-6">Total Amount</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-450 font-medium">
                    No orders matching the current filter options.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const waiterName = users.find(u => u.id === order.waiterId)?.name || 'Waiter';
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/40 transition">
                      <td className="p-4 pl-6 font-mono font-bold text-slate-600">#{order.id.substring(4, 12)}</td>
                      <td className="p-4 font-bold text-slate-800">{order.isParcel ? <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black uppercase">Parcel</span> : `Table ${order.tableId}`}</td>
                      <td className="p-4 text-slate-605 font-medium">{waiterName}</td>
                      <td className="p-4 text-slate-500 font-mono text-[10px]">{getOrderDate(order)}</td>
                      <td className="p-4 text-slate-505 font-mono">{order.timestamp}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-6 font-black text-slate-900 font-mono">₹{order.grandTotal}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-2 hover:bg-slate-100 text-slate-505 hover:text-slate-800 rounded-xl cursor-pointer transition"
                          title="View Details"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <>
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40" onClick={() => setSelectedOrder(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 z-50 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 m-0">Order Details</h3>
                  <span className="text-[10px] text-slate-400 font-mono">ID: {selectedOrder.id}</span>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-505 rounded-full cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-450 text-[10px] block">Table Number</span>
                  <span className="font-extrabold text-slate-800">{selectedOrder.isParcel ? 'Parcel' : `Table ${selectedOrder.tableId}`}</span>
                </div>
                <div>
                  <span className="text-slate-450 text-[10px] block">Waiter Name</span>
                  <span className="font-extrabold text-slate-800">
                    {users.find(u => u.id === selectedOrder.waiterId)?.name || 'Waiter'}
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-450 text-[10px] block">Date</span>
                  <span className="font-mono font-bold text-slate-700">{getOrderDate(selectedOrder)}</span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-450 text-[10px] block">Time</span>
                  <span className="font-mono font-bold text-slate-700">{selectedOrder.timestamp}</span>
                </div>
                <div className="mt-2 col-span-2">
                  <span className="text-slate-450 text-[10px] block">Order Status</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border inline-block mt-0.5 ${getStatusColor(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                {selectedOrder.isParcel && selectedOrder.customerName && (
                  <div className="mt-2 col-span-2">
                    <span className="text-slate-450 text-[10px] block">Customer</span>
                    <span className="font-bold text-slate-800">{selectedOrder.customerName}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ordered Items</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-150 flex justify-between items-center text-xs">
                      <div>
                        {item.category && (
                          <span className="mr-1.5 text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded align-middle">{item.category}</span>
                        )}
                        <span className="font-bold text-slate-855">{item.name}</span>
                        <span className="ml-2 text-[8px] font-black px-1.5 py-0.5 bg-slate-200 text-slate-655 rounded capitalize">{item.portion}</span>
                        {item.specialNotes && (
                          <p className="text-[9px] text-amber-600 mt-1 font-medium italic m-0">"{item.specialNotes}"</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-slate-505 text-[10px]">{item.quantity} x ₹{item.price}</span>
                        <p className="font-black text-slate-800 font-mono m-0 mt-0.5">₹{item.quantity * item.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grand Total</span>
                <span className="text-base font-black text-emerald-600 font-mono">₹{selectedOrder.grandTotal}</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrderHistory;
