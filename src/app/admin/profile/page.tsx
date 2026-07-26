"use client";
import React from 'react';
import Profile from '../../../views/Profile';
import { ProtectedRoute } from '../../../components/ProtectedRoute';

export default function AdminProfilePage() {
  return (
    <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'Manager']}>
      <Profile />
    </ProtectedRoute>
  );
}
