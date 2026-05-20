import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  RefreshCw, Database, AlertTriangle, CheckCircle2,
  Clock, Zap, Activity, FileText, Download,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import api from '@/services/api'
import type {
  SyncStatus, AirtableSyncResult, CircleSyncResult, DebtorResult, TallyImportResult,
} from '@/types'

// ── Result display ────────────────────────────────────────────────────────────

function ResultBlock({ title, result }: { title: string; result: unknown }) {
  if (!result) return null
  const r = result as Record<string, unknown>
  return (
    <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-sm">
      <p className="mb-2 font-medium text-gray-200">{title}</p>
      <pre className="whitespace-pre-wrap text-xs text-gray-400">
        {JSON.stringify(r, null, 2)}
      </pre>
    </div>
  )
}

// ── Sync card ─────────────────────────────────────────────────────────────────

function SyncCard({
  icon: Icon,
  iconColor,
  title,
  description,
  lastRun,
  buttonLabel,
  isPending,
  result,
  onTrigger,
  warning,
}: {
  icon: React.ElementType
  iconColor: string
  title: string
  description: string
  lastRun?: string | null
  buttonLabel: string
  isPending: boolean
  result?: unknown
  onTrigger: () => void
  warning?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg bg-gray-800 p-2.5 ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">{title}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onTrigger}
          disabled={isPending}
          className="shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'En cours…' : buttonLabel}
        </Button>
      </div>

      {warning && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {warning}
        </div>
      )}

      {lastRun && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          Dernier sync : {formatDate(lastRun)}
        </p>
      )}

      <ResultBlock title="Résultat" result={result} />
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SyncPage() {
  const [airtableResult, setAirtableResult] = useState<AirtableSyncResult | null>(null)
  const [circleResult, setCircleResult] = useState<CircleSyncResult | null>(null)
  const [debtorResult, setDebtorResult] = useState<DebtorResult | null>(null)
  const [tallyResult, setTallyResult] = useState<{ created: boolean; formId: string; slug: string } | null>(null)
  const [tallyResponsesResult, setTallyResponsesResult] = useState<TallyImportResult | null>(null)

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status').then((r) => r.data),
    refetchInterval: 10_000,
  })

  const airtableMutation = useMutation({
    mutationFn: () => api.post<AirtableSyncResult>('/sync/airtable').then((r) => r.data),
    onSuccess: (data) => { setAirtableResult(data); refetchStatus() },
  })

  const circleMutation = useMutation({
    mutationFn: () => api.post<CircleSyncResult>('/sync/circle').then((r) => r.data),
    onSuccess: (data) => { setCircleResult(data); refetchStatus() },
  })

  const debtorMutation = useMutation({
    mutationFn: () => api.post<DebtorResult>('/sync/debtors').then((r) => r.data),
    onSuccess: (data) => { setDebtorResult(data); refetchStatus() },
  })

  const tallyMutation = useMutation({
    mutationFn: () => api.post<{ created: boolean; formId: string; slug: string }>('/sync/seed-tally-form').then((r) => r.data),
    onSuccess: (data) => setTallyResult(data),
  })

  const tallyResponsesMutation = useMutation({
    mutationFn: () => api.post<TallyImportResult>('/sync/tally-responses').then((r) => r.data),
    onSuccess: (data) => { setTallyResponsesResult(data); refetchStatus() },
  })

  const circleQuota = status?.circleApiCallsThisSession ?? 0
  const circleWarning = circleQuota > 3000
    ? `${circleQuota} appels Circle utilisés cette session (limite : ~4000/mois)`
    : undefined

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-100">Synchronisation</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Import Airtable, enrichissement Circle, détection des débiteurs
        </p>
      </div>

      {/* Quota bar */}
      <Card className="mb-6 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-indigo-400" />
            <div>
              <p className="text-sm font-medium text-gray-200">Quota Circle API</p>
              <p className="text-xs text-gray-500">Environ 4 000 req/mois disponibles</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-semibold ${circleQuota > 3000 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {circleQuota}
            </p>
            <p className="text-xs text-gray-500">appels cette session</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-800">
          <div
            className={`h-2 rounded-full transition-all ${circleQuota > 3000 ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${Math.min((circleQuota / 4000) * 100, 100)}%` }}
          />
        </div>
      </Card>

      {/* Sync cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SyncCard
          icon={Database}
          iconColor="text-indigo-400"
          title="Import Airtable"
          description="Importe ETUDIANTS, PAIEMENTS, DASHBOARD FORMATION & COACHING. Airtable gagne en cas de conflit."
          lastRun={status?.lastAirtableSync}
          buttonLabel="Importer"
          isPending={airtableMutation.isPending}
          result={airtableResult}
          onTrigger={() => airtableMutation.mutate()}
        />

        <SyncCard
          icon={Zap}
          iconColor="text-emerald-400"
          title="Enrichissement Circle"
          description="Parcourt tous les membres Circle par pages de 100 (~20 req) et enrichit les profils étudiants (join date, tags, statut)."
          lastRun={status?.lastCircleSync}
          buttonLabel="Synchroniser"
          isPending={circleMutation.isPending}
          result={circleResult}
          onTrigger={() => circleMutation.mutate()}
          warning={circleWarning}
        />

        <SyncCard
          icon={AlertTriangle}
          iconColor="text-amber-400"
          title="Détection des débiteurs potentiels"
          description="Identifie les étudiants ayant un paiement partiel de plus de 30 jours sans paiement complet ultérieur."
          lastRun={status?.lastDebtorDetection}
          buttonLabel="Analyser"
          isPending={debtorMutation.isPending}
          result={debtorResult}
          onTrigger={() => debtorMutation.mutate()}
        />

        <SyncCard
          icon={FileText}
          iconColor="text-violet-400"
          title="Importer formulaire Tally"
          description="Duplique le formulaire Tally woB5oM (Accès Ecom Africa Pro) dans notre Form Builder. Idempotent : ne crée pas de doublon."
          buttonLabel={tallyResult?.created === false ? 'Déjà importé' : 'Importer'}
          isPending={tallyMutation.isPending}
          result={tallyResult}
          onTrigger={() => tallyMutation.mutate()}
        />

        <SyncCard
          icon={Download}
          iconColor="text-sky-400"
          title="Importer réponses Tally"
          description="Récupère toutes les soumissions historiques du formulaire Tally woB5oM et les attribue au formulaire local. Idempotent : ne recrée pas les doublons."
          lastRun={status?.lastTallySync}
          buttonLabel="Importer les réponses"
          isPending={tallyResponsesMutation.isPending}
          result={tallyResponsesResult}
          onTrigger={() => tallyResponsesMutation.mutate()}
        />

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gray-800 p-2.5 text-violet-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Sync complète</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Airtable → Circle → Débiteurs en séquence
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
            <div className={`rounded-lg p-2 ${status?.lastAirtableSync ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800'}`}>
              {status?.lastAirtableSync ? <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5" /> : <Clock className="mx-auto mb-1 h-3.5 w-3.5" />}
              Airtable
            </div>
            <div className={`rounded-lg p-2 ${status?.lastCircleSync ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800'}`}>
              {status?.lastCircleSync ? <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5" /> : <Clock className="mx-auto mb-1 h-3.5 w-3.5" />}
              Circle
            </div>
            <div className={`rounded-lg p-2 ${status?.lastDebtorDetection ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800'}`}>
              {status?.lastDebtorDetection ? <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5" /> : <Clock className="mx-auto mb-1 h-3.5 w-3.5" />}
              Débiteurs
            </div>
          </div>
          <Button
            className="mt-4 w-full flex items-center justify-center gap-2"
            disabled={airtableMutation.isPending || circleMutation.isPending || debtorMutation.isPending}
            onClick={async () => {
              await airtableMutation.mutateAsync()
              await circleMutation.mutateAsync()
              await debtorMutation.mutateAsync()
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Tout synchroniser
          </Button>
        </Card>
      </div>

      {/* Info box */}
      <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800/30 p-4 text-xs text-gray-500">
        <p className="font-medium text-gray-400 mb-1">Stratégie quota Circle</p>
        <p>
          Le sync Circle utilise <strong className="text-gray-300">GET /community_members?per_page=100</strong> pour paginer
          l'ensemble des membres (~20 req pour 2000 membres) plutôt qu'une recherche par email
          (1 req/étudiant = 2000 req). La détection des débiteurs est 100% MongoDB, aucun appel Circle.
        </p>
      </div>
    </div>
  )
}
