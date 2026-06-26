import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, Eye, ThumbsUp, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import api from '@/services/api'
import { PlatformBadge } from './components/PlatformBadge'
import { GrowthChart, type GrowthPoint } from './components/GrowthChart'
import { DailyReportPanel } from './components/DailyReportPanel'
import type { TrackedAccount, TrackedVideoWithLatest, DailyReport } from './types'

export function AccountDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const { data: account } = useQuery<TrackedAccount>({
    queryKey: ['tracked-account', id],
    queryFn: () => api.get(`/content/tracking/accounts/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: videos = [] } = useQuery<TrackedVideoWithLatest[]>({
    queryKey: ['tracked-videos', id],
    queryFn: () => api.get(`/content/tracking/accounts/${id}/videos`).then((r) => r.data),
    enabled: !!id,
  })

  const { data: reports = [] } = useQuery<DailyReport[]>({
    queryKey: ['tracked-reports', id],
    queryFn: () => api.get(`/content/tracking/accounts/${id}/reports?limit=10`).then((r) => r.data),
    enabled: !!id,
  })

  const scrapeMut = useMutation({
    mutationFn: () => api.post(`/content/tracking/accounts/${id}/scrape-now`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracked-account', id] })
      qc.invalidateQueries({ queryKey: ['tracked-videos', id] })
    },
  })

  const reportMut = useMutation({
    mutationFn: () => api.post(`/content/tracking/accounts/${id}/report-now`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracked-reports', id] }),
  })

  const todayReport = reports[0] ?? null

  const accountGrowth: GrowthPoint[] = reports
    .slice()
    .reverse()
    .map((r) => ({ date: r.report_date, views: r.total_views_today }))

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link to="/content/tracking" className="mb-4 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600">
        <ArrowLeft className="h-3.5 w-3.5" />
        Tous les comptes
      </Link>

      {account && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <PlatformBadge platform={account.platform} size="md" />
              {account.type === 'competitor' && (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                  Concurrent
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            <a href={account.channel_url} target="_blank" rel="noreferrer" className="text-sm text-gray-500 hover:text-violet-600">
              @{account.handle}
            </a>
          </div>
          <Button onClick={() => scrapeMut.mutate()} loading={scrapeMut.isPending}>
            <RefreshCw className="h-4 w-4" />
            Scraper maintenant
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {accountGrowth.length > 0 && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-700">
                Vues totales sur les derniers jours
              </h2>
              <GrowthChart data={accountGrowth} type="area" height={220} />
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                Vidéos trackées ({videos.length})
              </h2>
            </div>

            {videos.length === 0 && (
              <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                Aucune vidéo encore — lance un scrape pour démarrer.
              </p>
            )}

            <div className="space-y-2">
              {videos.map((v) => (
                <Link
                  key={v._id}
                  to={`/content/tracking/${id}/videos/${v._id}`}
                  className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-violet-300 hover:bg-gray-50"
                >
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-gray-900">{v.title}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {v.published_at ? new Date(v.published_at).toLocaleDateString('fr-FR') : 'Date inconnue'}
                    </p>
                  </div>
                  {v.latest_snapshot && (
                    <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {v.latest_snapshot.views.toLocaleString('fr-FR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3.5 w-3.5" />
                        {v.latest_snapshot.likes.toLocaleString('fr-FR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {v.latest_snapshot.comments.toLocaleString('fr-FR')}
                      </span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div>
          <DailyReportPanel
            report={todayReport}
            onRegenerate={() => reportMut.mutate()}
            regenerating={reportMut.isPending}
          />
        </div>
      </div>
    </div>
  )
}
