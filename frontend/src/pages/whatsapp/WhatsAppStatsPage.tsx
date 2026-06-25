import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import {
  MessageCircle, ArrowDown, ArrowUp, Bot, ArrowRightFromLine, FileText, ClipboardList, DollarSign, TrendingUp,
} from 'lucide-react'
import { whatsapp, COMPLAINT_LABELS } from '@/services/whatsapp'
import { cn } from '@/lib/utils'

const RANGES = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: 'all', label: 'Tout' },
] as const

function KpiCard({
  icon: Icon, label, value, sublabel, accent, alert,
}: {
  icon: any
  label: string
  value: string | number
  sublabel?: string
  accent?: string
  alert?: boolean
}) {
  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-sm', alert ? 'border-red-200' : 'border-gray-200')}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', accent ?? 'bg-indigo-50 text-indigo-600')}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {sublabel && <p className="mt-0.5 text-[11px] text-gray-500">{sublabel}</p>}
    </div>
  )
}

export function WhatsAppStatsPage() {
  const [range, setRange] = useState<typeof RANGES[number]['key']>('7d')
  const { data, isLoading } = useQuery({
    queryKey: ['wa.stats', range],
    queryFn: () => whatsapp.getStats(range),
    refetchInterval: 60_000,
  })

  if (isLoading) return <div className="p-8 text-sm text-gray-500">Chargement…</div>
  if (!data) return null

  const formattedCost = `$${data.llmCostTotalUsd.toFixed(4)}`
  const costAlert = data.llmCostTotalUsd > 15
  const completionPct = (data.formCompletionRate * 100).toFixed(0)
  const escalationRate = data.newConversations > 0
    ? ((data.escalations / data.newConversations) * 100).toFixed(0)
    : '—'

  return (
    <div className="space-y-4 p-6">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                range === r.key ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={MessageCircle} label="Nouvelles convs"  value={data.newConversations}
          sublabel={`${data.totalConversations} au total`}
          accent="bg-emerald-50 text-emerald-600" />
        <KpiCard icon={ArrowDown} label="Messages reçus" value={data.messagesIn} accent="bg-blue-50 text-blue-600" />
        <KpiCard icon={ArrowUp} label="Messages envoyés" value={data.messagesOut} accent="bg-indigo-50 text-indigo-600" />
        <KpiCard icon={Bot} label="Réponses IA" value={data.aiReplies}
          sublabel={data.messagesOut > 0 ? `${Math.round(data.aiReplies / data.messagesOut * 100)}% des envois` : undefined}
          accent="bg-violet-50 text-violet-600" />

        <KpiCard icon={ArrowRightFromLine} label="Escalades humain" value={data.escalations}
          sublabel={`${escalationRate}% des nouvelles convs`}
          accent="bg-amber-50 text-amber-700" />
        <KpiCard icon={ClipboardList} label="Plaintes" value={data.complaintsTotal} accent="bg-red-50 text-red-600" />
        <KpiCard icon={FileText} label="Formulaires" value={`${data.formsCompleted}/${data.formsStarted}`}
          sublabel={`${completionPct}% complétion`}
          accent="bg-green-50 text-green-700" />
        <KpiCard icon={DollarSign} label="Coût LLM" value={formattedCost}
          sublabel={costAlert ? '⚠ Proche du plafond $20/mois' : 'Cumul de la période'}
          accent={costAlert ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}
          alert={costAlert} />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Volume — nouvelles convs / réponses IA</h3>
          </header>
          {data.dailySeries.length === 0 ? (
            <p className="py-10 text-center text-xs text-gray-400">Pas encore de données</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.dailySeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="newConvs" stroke="#22c55e" strokeWidth={2} name="Nouvelles convs" dot={false} />
                <Line type="monotone" dataKey="aiReplies" stroke="#8b5cf6" strokeWidth={2} name="Réponses IA" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Coût LLM journalier (USD)</h3>
          </header>
          {data.dailySeries.length === 0 ? (
            <p className="py-10 text-center text-xs text-gray-400">Pas encore de données</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.dailySeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                <YAxis fontSize={10} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip formatter={(v: any) => `$${Number(v).toFixed(4)}`} />
                <Bar dataKey="costUsd" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* Complaints + providers breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Plaintes par catégorie</h3>
          <ul className="space-y-2">
            {Object.entries(data.complaintsByCategory).map(([cat, count]) => (
              <li key={cat} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{(COMPLAINT_LABELS as any)[cat] ?? cat}</span>
                <span className="rounded-md bg-gray-100 px-2 py-0.5 font-semibold text-gray-700">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par provider</h3>
          {Object.keys(data.llmCostByProvider).length === 0 ? (
            <p className="text-xs text-gray-400">Aucun appel LLM sur la période</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(data.llmCostByProvider).map(([p, c]) => (
                <li key={p} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-gray-700">{p}</span>
                  <span className="font-mono font-semibold text-emerald-600">${c.toFixed(4)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
