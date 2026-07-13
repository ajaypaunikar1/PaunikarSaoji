"use client";
import React from 'react';
import Billing from '../../../views/Billing';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminBillingPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}>
      <Billing />
    </ProtectedRoute>
  );
}
