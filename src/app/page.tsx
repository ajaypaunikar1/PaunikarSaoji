"use client";
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';

export default function RootPage() {
  const { currentUser } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'Waiter') {
        router.replace('/waiter');
      } else if (currentUser.role === 'Chef') {
        router.replace('/admin/kds');
      } else {
        router.replace('/admin/dashboard');
      }
    } else {
      router.replace('/login');
    }
  }, [currentUser, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
    </div>
  );
}
