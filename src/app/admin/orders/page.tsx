"use client";
import React from 'react';
import OrderHistory from '../../../views/OrderHistory';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminOrdersPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}>
      <OrderHistory />
    </ProtectedRoute>
  );
}
