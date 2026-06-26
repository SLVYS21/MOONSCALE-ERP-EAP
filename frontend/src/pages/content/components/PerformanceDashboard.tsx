import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, Eye, Plus } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import api from '@/services/api'
import type { TrackedAccount, DailyReport } from '@/pages/content-tracking/types'

interface VideoWithLatest {
  _id: string
  title: string
  thumbnail_url: string
  published_at: string | null
  account_id: string
  latest_snapshot: { views: number; likes: number; comments: number } | null
}

export function PerformanceDashboard() {
  const { data: accounts = [] } = useQuery<TrackedAccount[]>({
    queryKey: ['tracked-accounts'],
    queryFn: () => api.get('/content/tracking/accounts').then((r) => r.data),
  })

  const ownAccounts = accounts.filter((a) => a.type === 'own' && a.is_active)

  if (ownAccounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gradient-to-br from-violet-50/50 to-indigo-50/50 p-6 text-center">
        <TrendingUp className="mx-auto mb-2 h-7 w-7 text-violet-400" />
        <p className="text-sm font-medium text-gray-800">Connecte tes comptes pour voir tes performances</p>
        <p className="mt-1 text-xs text-gray-500">
          Ajoute ton YouTube ou TikTok pour suivre l'évolution quotidienne de tes vidéos.
        </p>
        <Link
          to="/content/tracking"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un compte
        </Link>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 gap-3 ${ownAccounts.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {ownAccounts.map((account) => (
        <AccountPerfCard key={account._id} account={account} />
      ))}
    </div>
  )
}

function AccountPerfCard({ account }: { account: TrackedAccount }) {
  const { data: videos = [] } = useQuery<VideoWithLatest[]>({
    queryKey: ['tracked-videos', account._id],
    queryFn: () => api.get(`/content/tracking/accounts/${account._id}/videos`).then((r) => r.data),
  })

  const { data: reports = [] } = useQuery<DailyReport[]>({
    queryKey: ['tracked-reports', account._id],
    queryFn: () => api.get(`/content/tracking/accounts/${account._id}/reports?limit=14`).then((r) => r.data),
  })

  const totalToday = reports[0]?.total_views_today ?? 0
  const totalYesterday = reports[0]?.total_views_yesterday ?? 0
  const delta = totalToday - totalYesterday
  const growthData = reports.slice().reverse().map((r) => ({ date: r.report_date.slice(5), views: r.total_views_today }))
  const latestVideos = videos.slice(0, 3)

  return (
    <Link
      to={`/content/tracking/${account._id}`}
      className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-violet-300"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${account.platform === 'youtube' ? 'text-red-600' : 'text-violet-600'}`}>
              {account.platform}
            </span>
            <span className="text-sm font-semibold text-gray-900">{account.name}</span>
          </div>
          <p className="text-xs text-gray-400">@{account.handle}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-gray-400">Vues 24h</p>
          <p className="text-lg font-bold text-gray-900">{totalToday.toLocaleString('fr-FR')}</p>
          {delta !== 0 && (
            <p className={`text-[11px] font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {delta > 0 ? '+' : ''}
              {delta.toLocaleString('fr-FR')}
            </p>
          )}
        </div>
      </div>

      {growthData.length > 0 && (
        <div className="mb-3 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growthData}>
              <defs>
                <linearGradient id={`g-${account._id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: '#374151' }}
              />
              <Area type="monotone" dataKey="views" stroke="#8b5cf6" strokeWidth={2} fill={`url(#g-${account._id})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {latestVideos.length > 0 && (
        <div className="space-y-1.5">
          {latestVideos.map((v) => (
            <div key={v._id} className="flex items-center gap-2 text-xs">
              <img src={v.thumbnail_url} alt="" className="h-8 w-12 shrink-0 rounded object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')} />
              <p className="flex-1 truncate text-gray-700">{v.title}</p>
              {v.latest_snapshot && (
                <span className="flex shrink-0 items-center gap-1 text-gray-500">
                  <Eye className="h-3 w-3" />
                  {v.latest_snapshot.views.toLocaleString('fr-FR')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}
