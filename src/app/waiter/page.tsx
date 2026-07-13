"use client";
import React from 'react';
import WaiterPortal from '../../views/WaiterPortal';
import { ProtectedRoute } from '../../components/ProtectedRoute';

export default function WaiterPage() {
  return (
    <ProtectedRoute allowedRoles={['Waiter']}>
      <WaiterPortal />
    </ProtectedRoute>
  );
}
