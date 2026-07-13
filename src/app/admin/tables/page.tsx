"use client";
import React from 'react';
import TableManagement from '../../../views/TableManagement';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminTablesPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Cashier']}>
      <TableManagement />
    </ProtectedRoute>
  );
}
