import { useState, type ElementType } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  RefreshCw, Database, AlertTriangle, CheckCircle2, Clock, Zap,
  Activity, FileText, Download, FlaskConical, CheckCheck,
  Users, CreditCard, ChevronDown, ChevronUp, Check,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn, formatDate, formatAmount } from '@/lib/utils'
import api from '@/services/api'
import type {
  SyncStatus, AirtableSyncResult, CircleSyncResult, DebtorResult, TallyImportResult,
  PendingRespondent, PendingRespondentsPreview, RegularizeResult,
} from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SamplesWriteResult {
  written: boolean
  path: string
  summary: {
    airtable: { students: number; payments: number; formation: number; coaching: number }
    circle:   { members: number; fields: number }
    tally:    { submissions: number; questions: number }
    errors:   Record<string, string>
  }
}

// ── Result display ─────────────────────────────────────────────────────────────

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
  icon: Icon, iconColor, title, description, lastRun,
  buttonLabel, isPending, result, onTrigger, warning,
}: {
  icon: ElementType
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
        <Button size="sm" onClick={onTrigger} disabled={isPending} className="shrink-0 flex items-center gap-1.5">
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

// ── Samples summary ────────────────────────────────────────────────────────────

function SamplesSummary({ data }: { data: SamplesWriteResult }) {
  const { summary } = data
  const hasErrors = Object.keys(summary.errors).length > 0

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <CheckCheck className="h-4 w-4 text-emerald-400" />
        <p className="text-sm font-semibold text-emerald-300">
          Samples écrits dans <code className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-300">samples-result.json</code>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-gray-500">AT Étudiants</p>
          <p className="font-semibold text-gray-100">{summary.airtable.students} records</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-gray-500">AT Paiements</p>
          <p className="font-semibold text-gray-100">{summary.airtable.payments} records</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-gray-500">AT Formation</p>
          <p className="font-semibold text-gray-100">{summary.airtable.formation} records</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-gray-500">AT Coaching</p>
          <p className="font-semibold text-gray-100">{summary.airtable.coaching} records</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-gray-500">Circle membres</p>
          <p className="font-semibold text-gray-100">{summary.circle.members} · {summary.circle.fields} champs</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <p className="text-gray-500">Tally</p>
          <p className="font-semibold text-gray-100">{summary.tally.submissions} soumissions · {summary.tally.questions} questions</p>
        </div>
      </div>
      {hasErrors && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(summary.errors).map(([src, msg]) => (
            <span key={src} className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {src}: {msg.slice(0, 60)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pending respondents panel ──────────────────────────────────────────────────

function PendingRespondentsPanel() {
  const [preview, setPreview] = useState<PendingRespondentsPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<RegularizeResult | null>(null)
  const [expanded, setExpanded] = useState(true)

  const detectMutation = useMutation({
    mutationFn: () => api.get<PendingRespondentsPreview>('/sync/pending-respondents').then((r) => r.data),
    onSuccess: (data) => {
      setPreview(data)
      setSelected(new Set(data.respondents.map((r) => r.email)))
      setResult(null)
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (emails: string[]) =>
      api.post<RegularizeResult>('/sync/regularize-pending', { emails }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data)
      setPreview(null)
      setSelected(new Set())
    },
  })

  const allSelected = preview ? selected.size === preview.respondents.length : false
  const toggle = (email: string) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }
  const toggleAll = () => {
    if (!preview) return
    setSelected(allSelected ? new Set() : new Set(preview.respondents.map((r) => r.email)))
  }

  return (
    <Card className="p-0 overflow-hidden border-indigo-500/30">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
          <Users className="h-4.5 w-4.5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100">Nouveaux inscrits sans invitation Circle</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Détecte les réponses formulaire récentes dont l'étudiant n'a pas encore été invité sur Circle
          </p>
        </div>
        {preview && (
          <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-300 shrink-0">
            {preview.found} détecté{preview.found > 1 ? 's' : ''}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-600 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-600 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-800 px-5 pb-5 pt-4">

          {/* Step 1 — Detect */}
          {!preview && !result && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="rounded-full bg-indigo-500/10 p-3">
                <Users className="h-6 w-6 text-indigo-400" />
              </div>
              <p className="text-sm text-gray-400">
                Lancez la détection pour voir les personnes qui ont rempli le formulaire mais n'ont pas encore reçu leur invitation Circle.
              </p>
              <Button
                onClick={() => detectMutation.mutate()}
                loading={detectMutation.isPending}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {detectMutation.isPending ? 'Détection en cours…' : 'Détecter les nouveaux inscrits'}
              </Button>
              {detectMutation.isError && (
                <p className="text-xs text-red-400">
                  Erreur : {String(detectMutation.error)}
                </p>
              )}
            </div>
          )}

          {/* Step 2 — Review table */}
          {preview && (
            <>
              {preview.respondents.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                  <p className="text-sm font-medium text-emerald-300">Tout le monde est déjà régularisé</p>
                  <p className="text-xs text-gray-500">Aucun nouvel inscrit sans paiement trouvé.</p>
                  <button
                    onClick={() => { setPreview(null); setSelected(new Set()) }}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-300 underline"
                  >
                    Relancer la détection
                  </button>
                </div>
              ) : (
                <>
                  {/* Controls */}
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={toggleAll}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                          allSelected
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-gray-600 bg-transparent text-transparent hover:border-gray-400',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <span className="text-xs text-gray-400">
                        {selected.size} / {preview.respondents.length} sélectionné{selected.size > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setPreview(null); setSelected(new Set()); detectMutation.mutate() }}
                        disabled={detectMutation.isPending}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Rafraîchir
                      </button>
                      <Button
                        size="sm"
                        disabled={selected.size === 0 || confirmMutation.isPending}
                        loading={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate(Array.from(selected))}
                        className="flex items-center gap-1.5"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Créer {selected.size} paiement{selected.size > 1 ? 's' : ''}
                      </Button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-xl border border-gray-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 bg-gray-900/40">
                          <th className="w-10 py-2.5 pl-4 pr-2 text-left"></th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Personne</th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Montant</th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Produit</th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Modalité</th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Plateforme</th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Preuves</th>
                          <th className="py-2.5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Soumis le</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.respondents.map((r: PendingRespondent) => (
                          <tr
                            key={r.responseId}
                            onClick={() => toggle(r.email)}
                            className={cn(
                              'cursor-pointer border-b border-gray-800/50 transition-colors last:border-0',
                              selected.has(r.email)
                                ? 'bg-indigo-500/5 hover:bg-indigo-500/10'
                                : 'hover:bg-gray-800/30 opacity-60',
                            )}
                          >
                            <td className="py-3 pl-4 pr-2">
                              <div className={cn(
                                'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                                selected.has(r.email)
                                  ? 'border-indigo-500 bg-indigo-600 text-white'
                                  : 'border-gray-600 bg-transparent',
                              )}>
                                {selected.has(r.email) && <Check className="h-3 w-3" />}
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="font-medium text-gray-100">{r.name}</p>
                              <p className="text-xs text-gray-500">{r.email}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="font-semibold tabular-nums text-gray-100">
                                {r.amount > 0 ? formatAmount(r.amount, r.currency) : '—'}
                              </p>
                            </td>
                            <td className="py-3 pr-4">
                              <span className="text-xs text-gray-400">{r.product}</span>
                            </td>
                            <td className="py-3 pr-4">
                              <Badge variant={r.modality === 'Complet' ? 'success' : 'warning'}>
                                {r.modality}
                              </Badge>
                            </td>
                            <td className="py-3 pr-4">
                              {r.gateway ? (
                                <span className="rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-0.5 text-xs text-gray-300">
                                  {r.gateway}
                                </span>
                              ) : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="py-3 pr-4">
                              {r.proofCount > 0 ? (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                                  {r.proofCount} fichier{r.proofCount > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-600">Aucune</span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <p className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                                {r.submittedAt ? formatDate(r.submittedAt) : '—'}
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 3 — Result */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300">
                  {result.created} paiement{result.created > 1 ? 's' : ''} créé{result.created > 1 ? 's' : ''} avec succès
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5">
                  <p className="text-gray-500">Scannés</p>
                  <p className="mt-0.5 text-lg font-bold text-gray-100">{result.scanned}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5">
                  <p className="text-gray-500">Déjà sur Circle</p>
                  <p className="mt-0.5 text-lg font-bold text-gray-400">{result.alreadyInvited}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5">
                  <p className="text-gray-500">Déjà un paiement</p>
                  <p className="mt-0.5 text-lg font-bold text-gray-400">{result.alreadyHavePayment}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setResult(null); detectMutation.mutate() }}
                  loading={detectMutation.isPending}
                  className="flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Relancer la détection
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SyncPage() {
  const [airtableResult, setAirtableResult]           = useState<AirtableSyncResult | null>(null)
  const [circleResult, setCircleResult]               = useState<CircleSyncResult | null>(null)
  const [debtorResult, setDebtorResult]               = useState<DebtorResult | null>(null)
  const [tallyResult, setTallyResult]                 = useState<{ created: boolean; formId: string; slug: string } | null>(null)
  const [tallyResponsesResult, setTallyResponsesResult] = useState<TallyImportResult | null>(null)
  const [samplesResult, setSamplesResult]             = useState<SamplesWriteResult | null>(null)

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

  const samplesMutation = useMutation({
    mutationFn: () => api.get<SamplesWriteResult>('/sync/samples').then((r) => r.data),
    onSuccess: (data) => setSamplesResult(data),
  })

  const circleQuota   = status?.circleApiCallsThisSession ?? 0
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

      {/* Pending respondents — two-step flow */}
      <div className="mb-6">
        <PendingRespondentsPanel />
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
          description="Importe ETUDIANTS, PAIEMENTS, DASHBOARD FORMATION & COACHING."
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
          description="Parcourt tous les membres Circle par pages de 100 et enrichit les profils étudiants (join date, tags, statut)."
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
          description="Duplique le formulaire Tally woB5oM dans notre Form Builder. Idempotent."
          buttonLabel={tallyResult?.created === false ? 'Déjà importé' : 'Importer'}
          isPending={tallyMutation.isPending}
          result={tallyResult}
          onTrigger={() => tallyMutation.mutate()}
        />

        <SyncCard
          icon={Download}
          iconColor="text-sky-400"
          title="Importer réponses Tally"
          description="Récupère toutes les soumissions historiques du formulaire Tally et les importe. Idempotent."
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
              <p className="mt-0.5 text-xs text-gray-500">Airtable → Circle → Débiteurs en séquence</p>
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

      {/* ── Exploration des données sources ─────────────────────────── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-violet-400" />
              Exploration des données sources
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Fetch 5 enregistrements depuis chaque source et les écrit dans{' '}
              <code className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300">samples-result.json</code>.
              <strong className="text-amber-400 ml-1">1 appel Circle seulement.</strong>
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => samplesMutation.mutate()}
            disabled={samplesMutation.isPending}
            className="flex items-center gap-2"
          >
            <FlaskConical className={`h-4 w-4 ${samplesMutation.isPending ? 'animate-pulse' : ''}`} />
            {samplesMutation.isPending ? 'Récupération…' : samplesResult ? 'Rafraîchir' : 'Fetcher les samples'}
          </Button>
        </div>

        {samplesMutation.isError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Erreur : {String(samplesMutation.error)}
          </div>
        )}

        {samplesResult && <SamplesSummary data={samplesResult} />}
      </div>

      {/* Info box */}
      <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800/30 p-4 text-xs text-gray-500">
        <p className="font-medium text-gray-400 mb-1">Stratégie quota Circle</p>
        <p>
          Le sync Circle utilise <strong className="text-gray-300">GET /community_members?per_page=100</strong> pour paginer
          l'ensemble des membres (~20 req pour 2000 membres). La détection des débiteurs est 100% MongoDB.
          L'exploration samples n'utilise <strong className="text-gray-300">qu'1 appel Circle</strong>.
        </p>
      </div>
    </div>
  )
}
