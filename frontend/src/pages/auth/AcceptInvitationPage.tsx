import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { LoginResponse } from '@/types'

export function AcceptInvitationPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const setAuth = useAuthStore((s) => s.setAuth)

  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/accept-invitation', {
        token,
        firstName: form.firstName,
        lastName: form.lastName,
        password: form.password,
      })
      setAuth(data.user, data.accessToken, data.refreshToken)
      navigate('/dashboard')
    } catch {
      setError('Lien invalide ou expiré.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-red-400">Lien d'invitation invalide.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            M
          </div>
          <h1 className="text-xl font-semibold text-gray-100">Rejoindre Moonscale</h1>
          <p className="mt-1 text-sm text-gray-500">Créez votre compte pour accéder à l'ERP</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/60 p-6">
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="firstName"
              label="Prénom"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              required
              autoFocus
            />
            <Input
              id="lastName"
              label="Nom"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              required
            />
          </div>
          <Input
            id="password"
            type="password"
            label="Mot de passe"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
          <Input
            id="confirm"
            type="password"
            label="Confirmer le mot de passe"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Créer mon compte
          </Button>
        </form>
      </div>
    </div>
  )
}
