import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const Login: React.FC = () => {
  const { login, currentUser, language, changeLanguage, systemStatus } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  // Watch currentUser state for dynamic asynchronous redirection
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'Chef') router.push('/admin/kds');
      else if (currentUser.role === 'Waiter') router.push('/waiter');
      else router.push('/admin/dashboard');
    }
  }, [currentUser, router]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    login(username, password);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 text-slate-800 font-sans p-6 relative overflow-hidden">
      {/* Subtle blur circles */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Top Header - language toggle */}
      <header className="flex justify-end z-10">
        <button 
          onClick={() => changeLanguage(language === 'en' ? 'mr' : 'en')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-650 hover:text-slate-900 cursor-pointer transition py-2 px-4 rounded-xl bg-white border border-slate-200 shadow-sm"
        >
          <span>{language === 'en' ? 'मराठी' : 'English'}</span>
        </button>
      </header>

      {/* Center Form Card */}
      <main className="flex-1 flex items-center justify-center z-10 my-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-8 shadow-xl shadow-slate-900/5 relative"
        >
          {/* Logo & Brand Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 font-black text-xl mx-auto mb-3 shadow-inner">
              <UtensilsCrossed size={20} />
            </div>
            <h3 className="font-extrabold text-slate-800 text-base tracking-tight">{language === 'en' ? 'Paunikar Saoji POS' : 'पौणीकर सावजी POS'}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Management Portal</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-extrabold text-slate-500 tracking-wider">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition duration-300"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] uppercase font-extrabold text-slate-500 tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition duration-300"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-450 hover:to-teal-450 text-white font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition duration-300 mt-2"
            >
              <span>Login</span>
              <ArrowRight size={13} />
            </button>
          </form>
        </motion.div>
      </main>

      {/* Footer & Status */}
      <footer className="flex flex-col items-center gap-3 z-10">
        <div className="flex items-center gap-3 bg-white/70 backdrop-blur-md border border-slate-200/50 px-3.5 py-1.5 rounded-2xl shadow-sm text-[9px] font-bold select-none">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${systemStatus.server === 'online' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-600">Server: {systemStatus.server === 'online' ? 'Online' : 'Offline'}</span>
          </div>
          <div className="w-px h-3 bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${systemStatus.database === 'connected' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-600">MongoDB: {systemStatus.database === 'connected' ? 'Connected' : 'Offline'}</span>
          </div>
        </div>
        <p className="text-center text-[9px] text-slate-400 font-bold tracking-wide">
          &copy; {new Date().getFullYear()} Paunikar Saoji. All rights reserved. POS Engine.
        </p>
      </footer>
    </div>
  );
};

export default Login;
