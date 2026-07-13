"use client";
import React from 'react';
import MenuManagement from '../../../views/MenuManagement';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminMenuPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}>
      <MenuManagement />
    </ProtectedRoute>
  );
}
