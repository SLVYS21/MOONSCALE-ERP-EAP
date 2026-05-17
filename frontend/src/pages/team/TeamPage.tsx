import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, MoreHorizontal, Mail, Activity } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { getInitials, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { User, UserRole } from '@/types'

const roleBadge: Record<UserRole, { variant: 'info' | 'warning' | 'default'; label: string }> = {
  superadmin: { variant: 'info', label: 'Super Admin' },
  admin: { variant: 'warning', label: 'Admin' },
  member: { variant: 'default', label: 'Membre' },
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [error, setError] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (data: { email: string; role: UserRole }) =>
      api.post('/users/invite', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      onClose()
    },
    onError: () => setError("Impossible d'envoyer l'invitation."),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-100">Inviter un membre</h2>
        <div className="space-y-4">
          <Input
            id="inv-email"
            type="email"
            label="Email"
            placeholder="prenom@moonscale.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="member">Membre</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={isPending}
            disabled={!email}
            onClick={() => mutate({ email, role })}
          >
            Envoyer l'invitation
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TeamPage() {
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'
  const [showInvite, setShowInvite] = useState(false)

  const { data: members = [], isLoading } = useQuery<User[]>({
    queryKey: ['team'],
    queryFn: () => api.get<User[]>('/users').then((r) => r.data),
  })

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Équipe</h1>
          <p className="mt-0.5 text-sm text-gray-500">{members.length} membre{members.length !== 1 ? 's' : ''}</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4" />
            Inviter
          </Button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Chargement...</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {members.map((member) => {
              const badge = roleBadge[member.role]
              return (
                <div key={member._id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-sm font-medium text-indigo-400">
                    {getInitials(member.firstName, member.lastName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-100">
                        {member.firstName} {member.lastName}
                      </p>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {!member.isActive && (
                        <Badge variant="warning">Invitation en attente</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </span>
                      {member.lastActivity && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Activity className="h-3 w-3" />
                          {formatDate(member.lastActivity)}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSuperAdmin && member._id !== currentUser?._id && (
                    <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
