import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const Login: React.FC = () => {
  const { login, currentUser, language, changeLanguage } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  // Watch currentUser state for dynamic asynchronous redirection
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'Chef') navigate('/admin/kds');
      else if (currentUser.role === 'Waiter') navigate('/waiter');
      else navigate('/admin/dashboard');
    }
  }, [currentUser, navigate]);

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
          className="w-full max-w-sm p-8 rounded-3xl bg-white border border-slate-200 shadow-xl relative overflow-hidden"
        >
          {/* Logo & Brand Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 mb-4">
              <UtensilsCrossed size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 m-0">Paunikar Saoji</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider mt-1 uppercase">Restaurant Management System</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                Username / वापरकर्ता नाव
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition duration-300"
                required
              />
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                Password / पासवर्ड
              </label>
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

      {/* Footer */}
      <footer className="text-center text-[9px] text-slate-400 font-bold tracking-wide z-10">
        &copy; {new Date().getFullYear()} Paunikar Saoji. All rights reserved. POS Engine.
      </footer>
    </div>
  );
};

export default Login;
