import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Eye, ThumbsUp, MessageCircle, Share2 } from 'lucide-react'
import api from '@/services/api'
import { GrowthChart, type GrowthPoint } from './components/GrowthChart'
import { PlatformBadge } from './components/PlatformBadge'
import type { VideoWithHistory } from './types'

export function VideoInsightsPage() {
  const { id, vid } = useParams<{ id: string; vid: string }>()

  const { data, isLoading } = useQuery<VideoWithHistory>({
    queryKey: ['tracked-video', vid],
    queryFn: () => api.get(`/content/tracking/videos/${vid}`).then((r) => r.data),
    enabled: !!vid,
  })

  if (isLoading || !data) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-gray-400">Chargement…</div>
  }

  const { video, account, snapshots } = data
  const growth: GrowthPoint[] = snapshots.map((s) => ({
    date: s.captured_date,
    views: s.views,
    likes: s.likes,
  }))

  const latest = snapshots[snapshots.length - 1]
  const first = snapshots[0]
  const viewsDelta = latest && first ? latest.views - first.views : 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        to={`/content/tracking/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au compte {account.name}
      </Link>

      <div className="mb-6 flex gap-5">
        <img
          src={video.thumbnail_url}
          alt=""
          className="h-40 w-72 shrink-0 rounded-lg object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <PlatformBadge platform={account.platform} />
            <a
              href={video.video_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600"
            >
              Ouvrir la vidéo <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{video.title}</h1>
          <p className="mt-1 text-xs text-gray-400">
            Publié{' '}
            {video.published_at ? new Date(video.published_at).toLocaleDateString('fr-FR') : 'date inconnue'}
            {video.duration_seconds ? ` · ${Math.round(video.duration_seconds / 60)} min` : ''}
          </p>
          {video.description && <p className="mt-3 line-clamp-3 text-sm text-gray-600">{video.description}</p>}
        </div>
      </div>

      {latest && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={<Eye className="h-4 w-4" />} label="Vues" value={latest.views} />
          <Stat icon={<ThumbsUp className="h-4 w-4" />} label="Likes" value={latest.likes} />
          <Stat icon={<MessageCircle className="h-4 w-4" />} label="Commentaires" value={latest.comments} />
          <Stat icon={<Share2 className="h-4 w-4" />} label="Partages" value={latest.shares} />
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
            Évolution ({snapshots.length} snapshots)
          </h2>
          {viewsDelta > 0 && (
            <span className="text-xs font-medium text-emerald-600">
              +{viewsDelta.toLocaleString('fr-FR')} vues depuis le 1er snapshot
            </span>
          )}
        </div>
        <GrowthChart data={growth} type="line" height={280} />
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold text-gray-900">{value.toLocaleString('fr-FR')}</p>
    </div>
  )
}
