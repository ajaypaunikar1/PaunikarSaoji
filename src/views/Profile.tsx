import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Shield, Settings as SettingsIcon, Save, Key, User, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const Profile: React.FC = () => {
  const { currentUser, updateSettings, settings, users } = useApp();
  
  // Settings States
  const [cancellationApproval, setCancellationApproval] = useState(settings?.cancellationApproval || false);
  const [gstEnabled, setGstEnabled] = useState(settings?.gstEnabled || false);
  
  // Change Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // RBAC Defaults
  const defaultRbac = {
    SuperAdmin: ['dashboard', 'tables', 'billing', 'menu', 'employees', 'attendance', 'orders', 'reports', 'kds', 'profile'],
    Admin: ['dashboard', 'tables', 'billing', 'menu', 'employees', 'attendance', 'orders', 'reports', 'kds', 'profile'],
    Manager: ['dashboard', 'tables', 'billing', 'menu', 'employees', 'attendance', 'orders', 'reports', 'kds'],
    Cashier: ['dashboard', 'tables', 'billing', 'orders'],
    Waiter: ['tables', 'attendance'],
    Chef: ['kds', 'attendance']
  };
  
  const [rbacConfig, setRbacConfig] = useState<Record<string, string[]>>(settings?.rbac && Object.keys(settings.rbac).length > 0 ? settings.rbac : defaultRbac);
  
  useEffect(() => {
    if (settings?.rbac && Object.keys(settings.rbac).length > 0) {
      setRbacConfig(settings.rbac);
    }
  }, [settings?.rbac]);

  const roles = ['SuperAdmin', 'Admin', 'Manager', 'Cashier', 'Waiter', 'Chef'];
  const allFeatures = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'tables', label: 'Table Management' },
    { id: 'billing', label: 'Billing & Invoicing' },
    { id: 'menu', label: 'Menu Management' },
    { id: 'employees', label: 'Employees' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'orders', label: 'Order History' },
    { id: 'reports', label: 'Reports' },
    { id: 'kds', label: 'Kitchen KDS' },
    { id: 'profile', label: 'Admin Profile' }
  ];

  const handleToggleFeature = (role: string, feature: string) => {
    setRbacConfig(prev => {
      const current = prev[role] || [];
      if (current.includes(feature)) {
        return { ...prev, [role]: current.filter(f => f !== feature) };
      }
      return { ...prev, [role]: [...current, feature] };
    });
  };

  const handleSaveSettings = async () => {
    try {
      await updateSettings({
        cancellationApproval,
        gstEnabled,
        rbac: rbacConfig
      });
      toast.success('Admin settings saved successfully');
    } catch (e) {
      toast.error('Failed to save settings');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    setPwLoading(true);
    try {
      const token = localStorage.getItem('rms_token');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.message || 'Failed to change password');
      }
    } catch (err) {
      toast.error('Server error. Please try again.');
    } finally {
      setPwLoading(false);
    }
  };

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'SuperAdmin' || currentUser.role === 'Admin';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">Admin Profile</h2>
        <p className="text-xs text-slate-500 font-medium mt-1">Manage your account and system access control.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* User Info Card */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 mb-4 shadow-inner">
              <User size={36} strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-black text-slate-800">{currentUser.name}</h3>
            <p className="text-sm text-slate-500 font-mono mt-1">@{currentUser.username}</p>
            <span className="mt-3 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wide border border-indigo-100">
              {currentUser.role}
            </span>
          </div>

          {/* Change Password Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Key size={16} className="text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Change Password</h3>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-slate-50 border border-slate-200 text-xs p-2 pr-8 rounded-lg focus:outline-none focus:border-amber-400 text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrentPw ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full bg-slate-50 border border-slate-200 text-xs p-2 pr-8 rounded-lg focus:outline-none focus:border-amber-400 text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPw ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full bg-slate-50 border border-slate-200 text-xs p-2 rounded-lg focus:outline-none focus:border-amber-400 text-slate-800"
                />
              </div>
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold uppercase rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Key size={12} />
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* System Settings & Access Control */}
        <div className="lg:col-span-2 space-y-6">
          
          {isAdmin && (
            <>
              {/* General App Toggles */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <SettingsIcon size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">System Preferences</h3>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:border-indigo-200 transition">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Manager Approval for Cancellations</span>
                      <span className="text-[10px] text-slate-500">Waiters require manager approval to cancel items.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={cancellationApproval} 
                      onChange={e => setCancellationApproval(e.target.checked)} 
                      className="w-4 h-4 accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:border-indigo-200 transition">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Enable 18% GST on Billing</span>
                      <span className="text-[10px] text-slate-500">Automatically calculate and append 18% GST (CGST 9% + SGST 9%) to invoices.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={gstEnabled} 
                      onChange={e => setGstEnabled(e.target.checked)} 
                      className="w-4 h-4 accent-indigo-600"
                    />
                  </label>
                </div>
              </div>

              {/* RBAC Matrix */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Shield size={18} className="text-rose-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Role-Based Access Control</h3>
                  </div>
                  <button onClick={handleSaveSettings} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-sm cursor-pointer">
                    <Save size={14} /> Save Configuration
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-3 font-bold text-slate-700 uppercase">Feature \ Role</th>
                        {roles.map(role => (
                          <th key={role} className="p-3 font-bold text-slate-700 uppercase text-center border-l border-slate-200">{role}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allFeatures.map(feature => (
                        <tr key={feature.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-700">{feature.label}</td>
                          {roles.map(role => {
                            const isChecked = (rbacConfig[role] || []).includes(feature.id);
                            const disabled = role === 'SuperAdmin'; // SuperAdmin has all rights
                            return (
                              <td key={`${feature.id}-${role}`} className="p-3 text-center border-l border-slate-100">
                                <input 
                                  type="checkbox" 
                                  checked={isChecked}
                                  disabled={disabled}
                                  onChange={() => handleToggleFeature(role, feature.id)}
                                  className="w-3.5 h-3.5 accent-indigo-600 disabled:opacity-50 cursor-pointer"
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default Profile;
