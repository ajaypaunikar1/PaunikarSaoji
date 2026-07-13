"use client";
import React from 'react';
import EmployeeManagement from '../../../views/EmployeeManagement';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminEmployeesPage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}>
      <EmployeeManagement />
    </ProtectedRoute>
  );
}
