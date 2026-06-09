import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { LoginResponse } from '@/types'
import { LayoutGrid } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
      setAuth(data.user, data.accessToken, data.refreshToken)
      navigate('/dashboard')
    } catch {
      setError('Email ou mot de passe incorrect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-4">
      <div className="w-full max-w-sm">

        {/* Logo + title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg">
            <LayoutGrid className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Moonscale ERP</h1>
          <p className="mt-1 text-sm text-gray-500">Connectez-vous à votre espace</p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Email"
              placeholder="vous@moonscale.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Input
              id="password"
              type="password"
              label="Mot de passe"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Se connecter
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Moonscale ERP — Plateforme de gestion
        </p>
      </div>
    </div>
  )
}
