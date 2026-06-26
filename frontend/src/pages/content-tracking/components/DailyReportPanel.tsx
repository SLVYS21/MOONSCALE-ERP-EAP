import { Sparkles, TrendingUp, TrendingDown, Lightbulb, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DailyReport } from '../types'

export function DailyReportPanel({
  report,
  loading,
  onRegenerate,
  regenerating,
}: {
  report: DailyReport | null
  loading?: boolean
  onRegenerate?: () => void
  regenerating?: boolean
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-100 p-1.5">
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Rapport IA du jour</h2>
            {report && (
              <p className="text-[10px] uppercase tracking-wider text-violet-600">
                {report.report_date} · {report.llm_provider}/{report.llm_model}
                {report.llm_cost_usd > 0 && ` · $${report.llm_cost_usd.toFixed(4)}`}
              </p>
            )}
          </div>
        </div>
        {onRegenerate && (
          <Button size="sm" variant="ghost" onClick={onRegenerate} loading={regenerating}>
            <RotateCw className="h-3.5 w-3.5" />
            Regénérer
          </Button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Chargement…</p>}

      {!loading && !report && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white/60 p-6 text-center">
          <p className="text-sm text-gray-700">Aucun rapport disponible aujourd'hui.</p>
          {onRegenerate && (
            <Button className="mt-3" size="sm" onClick={onRegenerate} loading={regenerating}>
              Générer maintenant
            </Button>
          )}
        </div>
      )}

      {!loading && report && (
        <div className="space-y-5">
          <Totals report={report} />

          {report.summary && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-line">
              {report.summary}
            </div>
          )}

          {report.top_videos.length > 0 && (
            <SectionList
              icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              title="Vidéos qui performent"
              items={report.top_videos.map((v) => ({
                title: v.title,
                detail: v.reason,
                delta: v.views_delta,
              }))}
              deltaColor="text-emerald-600"
            />
          )}

          {report.underperforming_videos.length > 0 && (
            <SectionList
              icon={<TrendingDown className="h-4 w-4 text-amber-600" />}
              title="Vidéos qui stagnent"
              items={report.underperforming_videos.map((v) => ({
                title: v.title,
                detail: v.reason,
                delta: v.views_delta,
              }))}
              deltaColor="text-amber-600"
            />
          )}

          {report.improvement_ideas.length > 0 && (
            <IdeaList icon={<Lightbulb className="h-4 w-4 text-violet-600" />} title="Pistes d'amélioration" ideas={report.improvement_ideas} />
          )}

          {report.new_content_ideas.length > 0 && (
            <IdeaList icon={<Sparkles className="h-4 w-4 text-fuchsia-600" />} title="Nouvelles idées de contenu" ideas={report.new_content_ideas} />
          )}
        </div>
      )}
    </div>
  )
}

function Totals({ report }: { report: DailyReport }) {
  const positive = report.total_views_delta >= 0
  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric label="Vues aujourd'hui" value={report.total_views_today.toLocaleString('fr-FR')} />
      <Metric label="Vues hier" value={report.total_views_yesterday.toLocaleString('fr-FR')} />
      <Metric
        label="Delta"
        value={`${positive ? '+' : ''}${report.total_views_delta.toLocaleString('fr-FR')}`}
        cls={positive ? 'text-emerald-600' : 'text-rose-600'}
      />
    </div>
  )
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${cls ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function SectionList({
  icon,
  title,
  items,
  deltaColor,
}: {
  icon: React.ReactNode
  title: string
  items: Array<{ title: string; detail: string; delta: number }>
  deltaColor: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-gray-900">{it.title}</p>
              <span className={`shrink-0 text-xs font-semibold ${deltaColor}`}>
                {it.delta >= 0 ? '+' : ''}
                {it.delta.toLocaleString('fr-FR')}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{it.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function IdeaList({ icon, title, ideas }: { icon: React.ReactNode; title: string; ideas: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {ideas.map((idea, i) => (
          <li key={i} className="flex gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            <span className="text-violet-500">›</span>
            <span>{idea}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
