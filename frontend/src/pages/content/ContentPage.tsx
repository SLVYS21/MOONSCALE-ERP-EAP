import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Sparkles, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import { PerformanceDashboard } from './components/PerformanceDashboard'
import { ProjectGrid } from './components/ProjectGrid'
import { CapturesPanel } from './components/CapturesPanel'
import { SuggestionsPanel } from './components/SuggestionsPanel'
import { OpportunitiesPanel } from './components/OpportunitiesPanel'
import { CreateProjectModal } from './components/CreateProjectModal'
import { AnalyzeCreatorModal } from './components/AnalyzeCreatorModal'
import { QuickCaptureFAB } from './components/QuickCaptureFAB'
import { STATUS_ORDER, STATUS_CONFIG, type VideoProject, type ContentStatus } from './types'

type Tab = 'all' | ContentStatus
type BottomTab = 'opportunites' | 'brouillons' | 'suggestions'

export function ContentPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showAnalyzeCreator, setShowAnalyzeCreator] = useState(false)
  const [bottomPanel, setBottomPanel] = useState<BottomTab>('opportunites')

  const { data: projects = [], isLoading } = useQuery<VideoProject[]>({
    queryKey: ['content-projects'],
    queryFn: () => api.get('/content/projects').then((r) => r.data),
  })

  const filtered = tab === 'all' ? projects : projects.filter((p) => p.status === tab)
  const counts: Record<Tab, number> = {
    all: projects.length,
    idee: projects.filter((p) => p.status === 'idee').length,
    script: projects.filter((p) => p.status === 'script').length,
    tournage: projects.filter((p) => p.status === 'tournage').length,
    montage: projects.filter((p) => p.status === 'montage').length,
    publie: projects.filter((p) => p.status === 'publie').length,
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-violet-600">
            <Sparkles className="h-3.5 w-3.5" />
            Création de contenu
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Performances de tes vidéos, projets en cours et suggestions IA — tout au même endroit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowAnalyzeCreator(true)}>
            <Search className="h-4 w-4" />
            Analyser un créateur
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle idée
          </Button>
        </div>
      </div>

      {/* Section 1: perfs nos comptes */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">Mes performances</h2>
        <PerformanceDashboard />
      </section>

      {/* Section 2: projets */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-3 text-xs font-semibold uppercase tracking-widest text-gray-500">Projets en cours</h2>
          <TabPill label="Tous" active={tab === 'all'} count={counts.all} onClick={() => setTab('all')} />
          {STATUS_ORDER.map((s) => (
            <TabPill
              key={s}
              label={STATUS_CONFIG[s].label}
              active={tab === s}
              count={counts[s]}
              onClick={() => setTab(s)}
            />
          ))}
        </div>
        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            Chargement…
          </div>
        ) : (
          <ProjectGrid projects={filtered} />
        )}
      </section>

      {/* Section 3: opportunités + brouillons + suggestions IA */}
      <section className="mb-12">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Inspiration</h2>
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <BottomTabBtn label="Opportunités" current={bottomPanel} value="opportunites" onClick={setBottomPanel} />
            <BottomTabBtn label="Brouillons" current={bottomPanel} value="brouillons" onClick={setBottomPanel} />
            <BottomTabBtn label="Suggestions IA" current={bottomPanel} value="suggestions" onClick={setBottomPanel} />
          </div>
        </div>
        {bottomPanel === 'opportunites' && <OpportunitiesPanel />}
        {bottomPanel === 'brouillons' && <CapturesPanel />}
        {bottomPanel === 'suggestions' && <SuggestionsPanel />}
      </section>

      <QuickCaptureFAB />

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {showAnalyzeCreator && <AnalyzeCreatorModal onClose={() => setShowAnalyzeCreator(false)} />}
    </div>
  )
}

function BottomTabBtn({
  label,
  current,
  value,
  onClick,
}: {
  label: string
  current: BottomTab
  value: BottomTab
  onClick: (v: BottomTab) => void
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className={cn(
        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
        current === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800',
      )}
    >
      {label}
    </button>
  )
}

function TabPill({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-violet-500 bg-violet-50 text-violet-700'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      {label}
      <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-violet-200 text-violet-800' : 'bg-gray-100 text-gray-500')}>
        {count}
      </span>
    </button>
  )
}
