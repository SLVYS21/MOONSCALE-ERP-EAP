import { useQueries } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Users, GraduationCap, CreditCard, Clock } from 'lucide-react'
import api from '@/services/api'
import type { PaginatedResponse, Student, Payment } from '@/types'

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const [studentsQ, pendingQ, teamQ] = useQueries({
    queries: [
      {
        queryKey: ['dashboard-students'],
        queryFn: () =>
          api.get<PaginatedResponse<Student>>('/students', { params: { limit: 1 } }).then((r) => r.data),
      },
      {
        queryKey: ['dashboard-pending'],
        queryFn: () =>
          api.get<PaginatedResponse<Payment>>('/payments', {
            params: { status: 'NON TRAITÉ', limit: 1 },
          }).then((r) => r.data),
      },
      {
        queryKey: ['dashboard-team'],
        queryFn: () => api.get<unknown[]>('/users').then((r) => r.data),
      },
    ],
  })

  const stats = [
    {
      label: 'Membres équipe',
      value: teamQ.isLoading ? '…' : String(teamQ.data?.length ?? '—'),
      icon: Users,
      color: 'text-indigo-400',
    },
    {
      label: 'Étudiants',
      value: studentsQ.isLoading ? '…' : String(studentsQ.data?.total ?? '—'),
      icon: GraduationCap,
      color: 'text-emerald-400',
    },
    {
      label: 'Paiements en attente',
      value: pendingQ.isLoading ? '…' : String(pendingQ.data?.total ?? '—'),
      icon: CreditCard,
      color: 'text-amber-400',
    },
    {
      label: 'Automatisations',
      value: '—',
      icon: Clock,
      color: 'text-violet-400',
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-100">
          Bonjour, {user?.firstName}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">Vue d'ensemble de Moonscale</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-100">{value}</p>
              </div>
              <div className={`rounded-lg bg-gray-800/80 p-2.5 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {(pendingQ.data?.total ?? 0) > 0 && (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {pendingQ.data!.total} paiement{pendingQ.data!.total > 1 ? 's' : ''} en attente de traitement.
        </div>
      )}
    </div>
  )
}
