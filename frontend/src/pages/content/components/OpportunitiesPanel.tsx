import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Target, Sparkles, AlertCircle, ArrowRight } from 'lucide-react'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import { CreateProjectModal } from './CreateProjectModal'
import type { CreatorAnalysis } from '../types'

type OpportunityKind = 'idea' | 'gap'

interface Opportunity {
  kind: OpportunityKind
  text: string
  origin: { handle: string; platform: string; analysisId: string }
}

export function OpportunitiesPanel() {
  const [seed, setSeed] = useState<string | null>(null)

  const { data: analyses = [] } = useQuery<CreatorAnalysis[]>({
    queryKey: ['creator-analyses'],
    queryFn: () => api.get('/content/tracking/creator-analyses?limit=5').then((r) => r.data),
  })

  const opportunities = useMemo<Opportunity[]>(() => {
    const list: Opportunity[] = []
    for (const a of analyses) {
      const origin = { handle: a.handle, platform: a.platform, analysisId: a._id }
      a.idea_seeds.slice(0, 2).forEach((text) => list.push({ kind: 'idea', text, origin }))
      a.gaps_to_exploit.slice(0, 2).forEach((text) => list.push({ kind: 'gap', text, origin }))
    }
    return list.slice(0, 6)
  }, [analyses])

  if (analyses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gradient-to-br from-amber-50/40 to-rose-50/40 p-6 text-center">
        <Target className="mx-auto mb-2 h-5 w-5 text-amber-500" />
        <p className="text-xs text-gray-600">
          Analyse un créateur (bouton en haut) pour voir apparaître ici des opportunités à exploiter.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {opportunities.map((opp, i) => (
          <button
            key={i}
            onClick={() => setSeed(opp.text)}
            className={cn(
              'group flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
              opp.kind === 'idea'
                ? 'border-violet-200 bg-violet-50/40 hover:border-violet-400 hover:bg-violet-50'
                : 'border-amber-200 bg-amber-50/40 hover:border-amber-400 hover:bg-amber-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                opp.kind === 'idea' ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-700',
              )}
            >
              {opp.kind === 'idea' ? <Sparkles className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-sm text-gray-800">{opp.text}</p>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                {opp.kind === 'idea' ? 'idée inspirée' : 'gap repéré'} ·{' '}
                <span className={opp.origin.platform === 'youtube' ? 'text-red-600' : 'text-violet-600'}>
                  @{opp.origin.handle}
                </span>
              </p>
            </div>
            <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>

      {seed && <CreateProjectModal onClose={() => setSeed(null)} initialBrainDump={seed} />}
    </>
  )
}
