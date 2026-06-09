import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import { Bell, Play, ChevronLeft, ChevronRight, CheckCircle2, XCircle, ShieldOff, Clock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import api from '@/services/api'
import type { ReminderCronRun, ReminderCronEntry, PaginatedResponse } from '@/types'

// ── Entry status badge ─────────────────────────────────────────────────────────

function EntryBadge({ entry }: { entry: ReminderCronEntry }) {
  if (entry.restricted) return <Badge variant="warning">Restreint</Badge>
  if (entry.status === 'sent') return <Badge variant="success">Envoyé</Badge>
  return <Badge variant="danger">Échoué</Badge>
}

// ── Run detail modal ───────────────────────────────────────────────────────────

function RunDetailModal({ run, onClose }: { run: ReminderCronRun; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Exécution — {formatDate(run.runAt)}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {run.durationMs}ms · {run.totalReminders} rappel(s)
            </p>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-emerald-600">{run.emailsSent} envoyé(s)</span>
            <span className="text-red-400">{run.emailsFailed} échoué(s)</span>
            <span className="text-amber-400">{run.accessRestricted} restreint(s)</span>
          </div>
        </div>

        {/* Fatal error */}
        {run.fatalError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Erreur fatale : {run.fatalError}
          </div>
        )}

        {/* Entries */}
        <div className="flex-1 overflow-y-auto">
          {run.entries.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Aucun rappel traité.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-6 py-3 font-medium">Étudiant</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">J avant paiement</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {run.entries.map((entry, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-800">{entry.studentName ?? '—'}</p>
                      <p className="text-xs text-gray-500">{entry.email}</p>
                      {entry.error && (
                        <p className="mt-0.5 text-xs text-red-400">{entry.error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-400">{entry.type}</td>
                    <td className="px-4 py-3 text-gray-400">J-{entry.daysBeforePayment}</td>
                    <td className="px-4 py-3">
                      <EntryBadge entry={entry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <Button variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function RemindersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedRun, setSelectedRun] = useState<ReminderCronRun | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['reminder-runs', page],
    queryFn: () =>
      api.get<PaginatedResponse<ReminderCronRun>>('/reminders/runs', {
        params: { page, limit: 20 },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const triggerMutation = useMutation({
    mutationFn: () => api.post('/reminders/trigger'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminder-runs'] })
    },
  })

  const latest = data?.data[0]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Rappels</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Historique des envois automatiques — cron quotidien à 9h (Paris)
          </p>
        </div>
        <Button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          className="flex items-center gap-2"
        >
          <Play className="h-4 w-4" />
          {triggerMutation.isPending ? 'Exécution…' : 'Déclencher maintenant'}
        </Button>
      </div>

      {/* Latest run summary cards */}
      {latest && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Rappels traités', value: latest.totalReminders, icon: Bell, color: 'text-indigo-600' },
            { label: 'Envoyés', value: latest.emailsSent, icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'Échoués', value: latest.emailsFailed, icon: XCircle, color: 'text-red-400' },
            { label: 'Accès restreint', value: latest.accessRestricted, icon: ShieldOff, color: 'text-amber-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="flex items-center gap-4 p-4">
              <div className={`rounded-lg bg-gray-100 p-2.5 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Runs table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Chargement…</div>
        ) : !data?.data.length ? (
          <div className="py-12 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm text-gray-500">Aucune exécution enregistrée.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Durée</th>
                <th className="px-4 py-3 font-medium">Rappels</th>
                <th className="px-4 py-3 font-medium">Envoyés</th>
                <th className="px-4 py-3 font-medium">Échoués</th>
                <th className="px-4 py-3 font-medium">Restreints</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {data.data.map((run) => (
                <tr
                  key={run._id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedRun(run)}
                >
                  <td className="px-6 py-3 text-gray-800">{formatDate(run.runAt)}</td>
                  <td className="px-4 py-3 text-gray-400">{run.durationMs}ms</td>
                  <td className="px-4 py-3 text-gray-400">{run.totalReminders}</td>
                  <td className="px-4 py-3 text-emerald-600">{run.emailsSent}</td>
                  <td className="px-4 py-3 text-red-400">{run.emailsFailed}</td>
                  <td className="px-4 py-3 text-amber-400">{run.accessRestricted}</td>
                  <td className="px-4 py-3">
                    {run.fatalError ? (
                      <Badge variant="danger">Erreur fatale</Badge>
                    ) : run.emailsFailed > 0 ? (
                      <Badge variant="warning">Partiel</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
            <p className="text-xs text-gray-500">
              {data.total} exécution(s) · page {data.page}/{data.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                disabled={page === data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {selectedRun && (
        <RunDetailModal run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  )
}
