"use client";
import React, { useEffect } from 'react';
import { AppProvider, useApp } from '../context/AppContext';
import { Toaster, toast } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      {children}
      <Toaster richColors position="top-right" theme="dark" />
    </AppProvider>
  );
}
