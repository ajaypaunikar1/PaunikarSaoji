"use client";
import React from 'react';
import Parcel from '../../../views/Parcel';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminParcelPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'Manager', 'Cashier']}>
      <Parcel />
    </ProtectedRoute>
  );
}
