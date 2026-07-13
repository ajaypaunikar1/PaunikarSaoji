import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  UserPlus, Check, X, ShieldAlert,
  Key, ToggleLeft, ToggleRight, CalendarClock, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { User, UserRole, Zone } from '../types/types';
import { toast } from 'sonner';

const EmployeeManagement: React.FC = () => {
  const { 
    users, addEmployee, updateEmployee, leaves, approveLeave, rejectLeave,
    cancellationRequests, approveCancellation, rejectCancellation,
    attendance, payroll, language, deleteEmployee, zones
  } = useApp();
  const t = translations[language];

  // UI state
  const [selectedUserId, setSelectedUserId] = useState<string>('u5');
  const [activeRightTab, setActiveRightTab] = useState<'details' | 'approvals'>('details');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Add Employee Form State
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Waiter');
  const [zone, setZone] = useState<Zone>('A');
  const [salary, setSalary] = useState<number>(18000);

  // Reset Password State
  const [newPassword, setNewPassword] = useState('');

  const selectedUser = users.find(u => u.id === selectedUserId);

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) {
      toast.error('Please fill all fields');
      return;
    }
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      toast.error('Username already taken');
      return;
    }

    addEmployee({
      name,
      username,
      password,
      role,
      status: 'Active',
      zone,
      salary
    });

    setIsAddModalOpen(false);
    setName('');
    setUsername('');
    setPassword('');
    setRole('Waiter');
    setZone('A');
    setSalary(18000);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    toast.success(`Password for ${selectedUser?.name} reset successfully!`);
    setIsResetModalOpen(false);
    setNewPassword('');
  };

  const toggleAccountStatus = (user: User) => {
    const nextStatus = user.status === 'Active' ? 'Disabled' : 'Active';
    updateEmployee(user.id, { status: nextStatus });
    toast.success(`Account for ${user.name} set to ${nextStatus === 'Active' ? 'Enabled' : 'Disabled'}`);
  };

  const updateZoneAssignment = (user: User, z: Zone) => {
    updateEmployee(user.id, { zone: z });
    toast.success(`Assigned ${user.name} to Zone ${z}`);
  };

  const pendingLeaves = leaves.filter(l => l.status === 'Pending');
  const pendingCancels = cancellationRequests.filter(c => c.status === 'Pending');

  const selectedUserAttendance = attendance.filter(a => a.employeeId === selectedUserId);
  const selectedUserPayroll = payroll.filter(p => p.employeeId === selectedUserId);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">{t.employees}</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Manage personnel, review zones, clock logs, and handle request approvals.</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-450 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 transition"
        >
          <UserPlus size={14} />
          <span>{t.addEmployee}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Personnel List */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Accounts Registry</h3>
          
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {users.map(u => {
              const isSelected = u.id === selectedUserId;
              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`p-4 rounded-2xl border transition duration-300 flex justify-between items-center cursor-pointer ${
                    isSelected 
                      ? 'bg-emerald-500/10 border-emerald-500 text-slate-900 shadow-sm' 
                      : u.status === 'Disabled' 
                        ? 'bg-slate-50 border-slate-100 opacity-60 text-slate-400'
                        : 'bg-white border-slate-200 text-slate-700 shadow-sm hover:border-slate-350'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold block truncate">{u.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">{u.role}</span>
                  </div>
                  
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                      u.status === 'Active' 
                        ? 'bg-emerald-100 border-emerald-250 text-emerald-700' 
                        : 'bg-rose-100 border-rose-255 text-rose-700'
                    }`}>
                      {u.status === 'Active' ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-[9px] text-slate-450 font-mono">Zone {u.zone}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Dynamic Operations Panel & Approvals */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Tab Navigation header */}
          <div className="flex border-b border-slate-205">
            <button
              onClick={() => setActiveRightTab('details')}
              className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 transition ${
                activeRightTab === 'details' 
                  ? 'border-emerald-500 text-emerald-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Personnel Profile
            </button>
            <button
              onClick={() => setActiveRightTab('approvals')}
              className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 transition relative ${
                activeRightTab === 'approvals' 
                  ? 'border-emerald-500 text-emerald-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Approvals Center
              {(pendingLeaves.length + pendingCancels.length) > 0 && (
                <span className="absolute top-2 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                  {pendingLeaves.length + pendingCancels.length}
                </span>
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">
            
            {/* TAB CONTENT: PROFILE DETAILS */}
            {activeRightTab === 'details' && selectedUser && (
              <motion.div
                key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-6 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm"
              >
                {/* Profile Header */}
                <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-800 text-lg">
                      {selectedUser.name.charAt(0)}
                    </div>
                     <div className="flex flex-col gap-1">
                       <input
                         type="text"
                         value={selectedUser.name}
                         onChange={e => {
                           updateEmployee(selectedUser.id, { name: e.target.value });
                         }}
                         className="text-sm font-extrabold text-slate-850 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48 font-sans"
                         title="Click to edit name"
                       />
                       <p className="text-[10px] text-emerald-600 uppercase tracking-widest font-bold mt-0.5">Role: {selectedUser.role} &bull; @{selectedUser.username}</p>
                     </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsResetModalOpen(true)}
                      className="p-2 rounded bg-white border border-slate-200 hover:border-slate-350 text-slate-500 hover:text-slate-800 cursor-pointer transition shadow-xs"
                      title="Reset Password"
                    >
                      <Key size={13} />
                    </button>
                    <button
                      onClick={() => toggleAccountStatus(selectedUser)}
                      className="p-2 rounded bg-white border border-slate-200 hover:border-slate-350 text-slate-505 hover:text-slate-800 cursor-pointer transition shadow-xs"
                      title="Toggle Active Status"
                    >
                      {selectedUser.status === 'Active' ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-rose-500" />}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to permanently remove employee ${selectedUser.name}?`)) {
                          deleteEmployee(selectedUser.id);
                          setSelectedUserId('');
                        }
                      }}
                      className="p-2 rounded bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 cursor-pointer transition shadow-xs"
                      title="Delete Employee"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Details Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Stats & Assignment */}
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-450 uppercase block tracking-wider mb-2">Zone Assignment</span>
                      <div className="flex items-center gap-2">
                        {[...zones, 'All'].map(z => (
                          <button
                            key={z}
                            onClick={() => updateZoneAssignment(selectedUser, z)}
                            className={`w-10 h-8 rounded-lg border text-[11px] font-bold transition flex items-center justify-center cursor-pointer ${
                              selectedUser.zone === z 
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs' 
                                : 'bg-white border-slate-200 hover:border-slate-350 text-slate-700'
                            }`}
                          >
                            {z}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 text-[10px] block mb-1">Base Salary (₹)</span>
                        <input
                          type="number"
                          value={selectedUser.salary}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            updateEmployee(selectedUser.id, { salary: val });
                          }}
                          className="font-bold text-slate-800 font-mono bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-500 px-1 py-0.5 rounded w-full border border-slate-200"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 text-[10px] block mb-1">Overtime Hours</span>
                        <span className="font-bold text-slate-800 font-mono">{selectedUser.overtimeHours} hrs</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Performance Rating</span>
                      <div className="flex gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`text-xs ${i < selectedUser.performance ? 'text-amber-500' : 'text-slate-300'}`}>★</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Clock-ins history */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-450 uppercase block tracking-wider">Recent Clock Logs</span>
                    
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {selectedUserAttendance.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No logs registered</p>
                      ) : (
                        selectedUserAttendance.map(a => (
                          <div key={a.id} className="flex justify-between items-center text-xs py-1.5 px-2.5 rounded bg-slate-50 border border-slate-200">
                            <span className="font-bold text-slate-800">{a.date}</span>
                            <span className="font-mono text-slate-500 text-[10px]">{a.clockIn} - {a.clockOut || 'Active'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </motion.div>
            )}

            {/* TAB CONTENT: APPROVALS HUB */}
            {activeRightTab === 'approvals' && (
              <motion.div
                key="approvals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Section A: Leaves Requests */}
                <div className="space-y-3 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                    <CalendarClock size={14} className="text-amber-550" /> Staff Leave Requests
                  </h4>
                  
                  {pendingLeaves.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No pending leave applications</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {pendingLeaves.map(leave => {
                        const applicant = users.find(u => u.id === leave.employeeId);
                        return (
                          <div key={leave.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-slate-800">{applicant?.name || leave.employeeId}</span>
                              <p className="text-[10px] text-slate-500 mt-1 m-0">
                                Dates: {leave.startDate} to {leave.endDate} &bull; "{leave.reason}"
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => rejectLeave(leave.id)}
                                className="p-2 rounded bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer transition shadow-xs"
                              >
                                <X size={12} />
                              </button>
                              <button
                                onClick={() => approveLeave(leave.id)}
                                className="p-2 rounded bg-emerald-500 hover:bg-emerald-450 text-white cursor-pointer transition font-bold shadow-xs"
                              >
                                <Check size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section B: Order Cancellations */}
                <div className="space-y-3 bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                    <ShieldAlert size={14} className="text-rose-500" /> Order Item Removal Requests
                  </h4>

                  {pendingCancels.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No pending removal requests</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {pendingCancels.map(req => (
                        <div key={req.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-800">{req.itemText}</span>
                            <p className="text-[10px] text-slate-500 mt-1 m-0">
                              Order: #{req.orderId.substring(4,8)} &bull; Waiter: {req.requestedBy} &bull; Reason: "{req.reason}"
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => rejectCancellation(req.id)}
                              className="p-2 rounded bg-white border border-rose-200 text-rose-650 hover:bg-rose-50 cursor-pointer transition shadow-xs"
                            >
                              <X size={12} />
                            </button>
                            <button
                              onClick={() => approveCancellation(req.id)}
                              className="p-2 rounded bg-emerald-500 hover:bg-emerald-455 text-white cursor-pointer transition font-bold shadow-xs"
                            >
                              <Check size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </motion.div>
            )}

          </AnimatePresence>

        </div>

      </div>

      {/* MODAL A: ADD EMPLOYEE ACCOUNT */}
      <AnimatePresence>
        {isAddModalOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-45" onClick={() => setIsAddModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 px-6 pt-6 pb-0 rounded-3xl bg-white border border-slate-200 shadow-2xl text-slate-800"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
                <span className="text-sm font-extrabold uppercase text-slate-900 flex items-center gap-1.5">
                  <UserPlus size={16} className="text-emerald-500" /> Add New Account
                </span>
                <button onClick={() => setIsAddModalOpen(false)} className="p-1 rounded bg-slate-50 border border-slate-200 hover:text-slate-800 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateEmployee} className="space-y-4 pb-6">
                
                {/* Full name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Ramesh Patil"
                    className="w-full p-2 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800"
                    required
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Username (Login)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="e.g. waiter5"
                    className="w-full p-2 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800"
                    required
                  />
                </div>

                {/* Role / Zone */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Role</label>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as UserRole)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800"
                    >
                      <option value="SuperAdmin">SuperAdmin</option>
                      <option value="Manager">Manager</option>
                      <option value="Cashier">Cashier</option>
                      <option value="Chef">Chef</option>
                      <option value="Waiter">Waiter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Zone Assigned</label>
                     <select
                      value={zone}
                      onChange={e => setZone(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800"
                    >
                      {zones.map(z => (
                        <option key={z} value={z}>Zone {z}</option>
                      ))}
                      <option value="All">All Zones</option>
                    </select>
                  </div>
                </div>

                {/* Salary */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Base Salary (₹)</label>
                  <input
                    type="number"
                    value={salary}
                    onChange={e => setSalary(Math.max(1, parseInt(salary.toString()) || 0))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800 font-mono"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-450 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition shadow-lg shadow-emerald-500/10"
                >
                  Create Employee Account
                </button>
              </form>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MODAL B: RESET PASSWORD */}
      <AnimatePresence>
        {isResetModalOpen && selectedUser && (
          <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-45" onClick={() => setIsResetModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 px-6 pt-6 pb-0 rounded-3xl bg-white border border-slate-200 shadow-2xl text-slate-800"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
                <span className="text-xs font-bold uppercase text-slate-900">Reset Account Password</span>
                <button onClick={() => setIsResetModalOpen(false)} className="p-1 rounded bg-slate-50 border border-slate-200 hover:text-slate-850 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4 pb-6">
                <p className="text-xs text-slate-500">Resetting credentials for <span className="text-emerald-605 font-bold">{selectedUser.name}</span>.</p>
                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-450 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password..."
                    className="w-full p-2 bg-slate-55 border border-slate-200 text-xs rounded-xl focus:outline-none text-slate-800"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Set Password
                </button>
              </form>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};

export default EmployeeManagement;
