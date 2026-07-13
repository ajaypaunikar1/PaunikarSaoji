"use client";
import React from 'react';
import Reports from '../../../views/Reports';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminReportsPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}>
      <Reports />
    </ProtectedRoute>
  );
}
