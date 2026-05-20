import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function AuthGuard() {
  const { accessToken } = useAuthStore()
  if (!accessToken) return <Navigate to="/login" replace />
  return <Outlet />
}

export function GuestGuard() {
  const { accessToken } = useAuthStore()
  if (accessToken) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
