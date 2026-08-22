"use client";
import React from 'react';
import PrinterSettings from '../../../views/PrinterSettings';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminPrinterPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'Manager', 'Cashier']}>
      <PrinterSettings />
    </ProtectedRoute>
  );
}
