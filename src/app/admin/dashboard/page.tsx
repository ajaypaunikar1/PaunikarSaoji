"use client";
import React from 'react';
import Dashboard from '../../../views/Dashboard';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}>
      <Dashboard />
    </ProtectedRoute>
  );
}
