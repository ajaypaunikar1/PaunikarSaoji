"use client";
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      router.replace('/login');
    } else if (!allowedRoles.includes(currentUser.role)) {
      if (currentUser.role === 'Waiter') {
        router.replace('/waiter');
      } else if (currentUser.role === 'Chef') {
        router.replace('/admin/kds');
      } else {
        router.replace('/admin/dashboard');
      }
    }
  }, [currentUser, router, allowedRoles]);

  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
};
