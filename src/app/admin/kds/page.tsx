"use client";
import React from 'react';
import KDS from '../../../views/KDS';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminKdsPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager', 'Chef']}>
      <KDS />
    </ProtectedRoute>
  );
}
