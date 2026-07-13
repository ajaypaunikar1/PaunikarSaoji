"use client";
import React from 'react';
import Attendance from '../../../views/Attendance';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminAttendancePage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Manager']}>
      <Attendance />
    </ProtectedRoute>
  );
}
