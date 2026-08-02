"use client";
import React, { useState } from 'react';
import { AppProvider, useApp } from '../context/AppContext';
import { Toaster, toast } from 'sonner';
import { Key, Eye, EyeOff, Lock } from 'lucide-react';

function ForcePasswordResetGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, setCurrentUser } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!currentUser) {
    return <>{children}</>;
  }

  // Force reset if isFirstLogin flag is true
  if (currentUser.isFirstLogin) {
    const handleResetSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPassword || newPassword.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }

      setLoading(true);
      try {
        const token = localStorage.getItem('rms_token');
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        
        if (data.success) {
          toast.success('Your secure password is set successfully!');
          // Update local session
          const updatedUser = { ...currentUser, isFirstLogin: false };
          setCurrentUser(updatedUser);
          localStorage.setItem('rms_user', JSON.stringify(updatedUser));
        } else {
          toast.error(data.message || 'Failed to update password');
        }
      } catch (err) {
        toast.error('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex flex-col justify-between bg-gradient-to-br from-[#121224] via-[#1B1B2E] to-[#121224] text-white font-sans p-6 relative overflow-hidden select-none">
        {/* Subtle blur circles */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <header className="flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-indigo-900/40">
              PS
            </div>
            <span className="text-xs font-black tracking-wider uppercase">Paunikar Saoji</span>
          </div>
          <span className="text-[10px] text-indigo-400 font-extrabold uppercase bg-indigo-950/60 border border-indigo-900 px-3 py-1 rounded-xl">
            First Login
          </span>
        </header>

        <main className="flex-1 flex items-center justify-center z-10 my-8">
          <div className="w-full max-w-sm bg-white/5 border border-white/10 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl relative">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-650/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-xl mx-auto mb-3 shadow-inner">
                <Lock size={20} />
              </div>
              <h3 className="font-extrabold text-white text-base tracking-tight">Set Secure Password</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">First-time login verification required</p>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition duration-300"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition duration-300"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-950/40 transition duration-300 mt-2 disabled:opacity-50"
              >
                <span>{loading ? 'Saving password...' : 'Unlock Account'}</span>
                <Key size={13} />
              </button>
            </form>
          </div>
        </main>

        <footer className="text-center text-[9px] text-slate-500 font-bold tracking-wide z-10">
          &copy; {new Date().getFullYear()} Paunikar Saoji. Security Enforcement.
        </footer>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <ForcePasswordResetGuard>
        {children}
      </ForcePasswordResetGuard>
      <Toaster richColors position="top-right" theme="dark" />
    </AppProvider>
  );
}
