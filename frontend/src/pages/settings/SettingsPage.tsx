import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Link2, CheckCircle, AlertCircle,
  RefreshCw, ExternalLink, BookOpen, PlayCircle, Bot, Copy, Webhook, X, Plus, Magnet, Share2,
  CreditCard, Tag, Trash2,
} from 'lucide-react'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import type { AppSettings, FinanceCategory } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TypebotBot {
  id: string
  name: string
  webhook_registered: boolean
}

interface BackfillResult {
  created: number
  skipped: number
  errors: number
}

interface YouTubeConfig {
  channel_id: string
  has_refresh_token: boolean
  last_synced: string | null
  last_meta_synced: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Jamais'

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      ok ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500',
    )}>
      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
      {label}
    </span>
  )
}

// ── StringListEditor ─────────────────────────────────────────────────────────

function StringListEditor({
  label,
  icon: Icon,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string
  icon: React.ElementType
  items: string[]
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  function add() {
    const trimmed = input.trim()
    if (!trimmed || items.includes(trimmed)) return
    onAdd(trimmed)
    setInput('')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <p className="text-sm font-medium text-gray-300">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[28px]">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-gray-800 border border-gray-700 px-3 py-1 text-xs text-gray-300"
          >
            {item}
            <button
              onClick={() => onRemove(item)}
              className="text-gray-600 hover:text-red-400 transition-colors ml-0.5"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-gray-600 py-1">Aucun élément</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-xs text-white disabled:opacity-40 transition-colors"
        >
          <Plus size={12} /> Ajouter
        </button>
      </div>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Intégrations', 'Sources', 'Finances', 'Documentation'] as const
type Tab = typeof TABS[number]

// ── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Intégrations')
  const qc = useQueryClient()

  // ── Queries ────────────────────────────────────────────────────────────────

  const ytConfig = useQuery<YouTubeConfig>({
    queryKey: ['yt-config-settings'],
    queryFn: () => api.get('/analytics/youtube/config').then(r => r.data),
  })

  const ytAuthUrl = useQuery<{ url: string }>({
    queryKey: ['yt-auth-url-settings'],
    queryFn: () => api.get('/analytics/youtube/auth-url').then(r => r.data),
    retry: false,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const pullMeta = useMutation({
    mutationFn: () => api.post('/analytics/meta/pull'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yt-config-settings'] }),
  })

  const pullYt = useMutation({
    mutationFn: () => api.post('/analytics/youtube/pull'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yt-config-settings'] }),
  })

  const seedDocs = useMutation({
    mutationFn: () => api.post('/wiki/seed-docs').then(r => r.data as { created: number }),
  })

  const typebotBots = useQuery<TypebotBot[]>({
    queryKey: ['typebot-bots'],
    queryFn: () => api.get('/leads/typebot-bots').then(r => r.data),
    retry: false,
  })

  const registerWebhook = useMutation({
    mutationFn: (botId: string) =>
      api.post<{ registered: boolean; message: string }>(`/leads/typebot-bots/${botId}/register-webhook`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['typebot-bots'] }),
  })

  const backfill = useMutation({
    mutationFn: (botId: string) =>
      api.post<BackfillResult>(`/leads/typebot-bots/${botId}/backfill`).then(r => r.data),
  })

  const appSettings = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/app-settings').then(r => r.data),
    enabled: tab === 'Sources' || tab === 'Finances',
  })

  const updateSettings = useMutation({
    mutationFn: (data: Partial<AppSettings>) => api.patch('/app-settings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  })

  function addMagnet(v: string) {
    const current = appSettings.data?.lead_magnets ?? []
    updateSettings.mutate({ lead_magnets: [...current, v] })
  }
  function removeMagnet(v: string) {
    const current = appSettings.data?.lead_magnets ?? []
    updateSettings.mutate({ lead_magnets: current.filter(x => x !== v) })
  }
  function addSource(v: string) {
    const current = appSettings.data?.lead_sources ?? []
    updateSettings.mutate({ lead_sources: [...current, v] })
  }
  function removeSource(v: string) {
    const current = appSettings.data?.lead_sources ?? []
    updateSettings.mutate({ lead_sources: current.filter(x => x !== v) })
  }
  function addGateway(v: string) {
    const current = appSettings.data?.custom_gateways ?? []
    updateSettings.mutate({ custom_gateways: [...current, v] })
  }
  function removeGateway(v: string) {
    const current = appSettings.data?.custom_gateways ?? []
    updateSettings.mutate({ custom_gateways: current.filter(x => x !== v) })
  }

  // Finance categories
  const financeCategories = useQuery<FinanceCategory[]>({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<FinanceCategory[]>('/finances/categories').then(r => r.data),
    enabled: tab === 'Finances',
  })

  const seedCategoriesMut = useMutation({
    mutationFn: () => api.post<{ created: number }>('/finances/categories/seed-defaults').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-categories'] }),
  })

  const deleteCategoryMut = useMutation({
    mutationFn: (id: string) => api.delete(`/finances/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-categories'] }),
  })

  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState('both')
  const [newCatIcon, setNewCatIcon] = useState('💰')

  const createCategoryMut = useMutation({
    mutationFn: (body: object) => api.post('/finances/categories', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance-categories'] }); setNewCatName('') },
  })

  const webhookUrl = `${window.location.origin.replace(':5173', ':3001')}/api/webhooks/typebot`

  const ytLastSync = ytConfig.data?.last_synced
  const metaLastSync = ytConfig.data?.last_meta_synced

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-gray-400" />
        <h1 className="text-xl font-bold text-gray-100">Paramètres</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Intégrations ─────────────────────────────────────────────────── */}
      {tab === 'Intégrations' && (
        <div className="space-y-4">

          {/* YouTube */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/15">
                  <PlayCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-100">YouTube Analytics</p>
                  <p className="text-xs text-gray-500">Vues, watch time, abonnés par vidéo</p>
                </div>
              </div>
              <StatusBadge
                ok={ytConfig.data?.has_refresh_token ?? false}
                label={ytConfig.data?.has_refresh_token ? 'Connecté' : 'Non connecté'}
              />
            </div>

            {ytConfig.data?.channel_id && (
              <p className="mb-3 text-xs text-gray-500">
                Chaîne : <span className="font-mono text-gray-400">{ytConfig.data.channel_id}</span>
              </p>
            )}

            <p className="mb-4 text-xs text-gray-600">
              Dernière sync : {fmtDate(ytLastSync ?? null)}
            </p>

            <div className="flex flex-wrap gap-2">
              {ytAuthUrl.data && (
                <a
                  href={ytAuthUrl.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                >
                  <Link2 size={14} />
                  {ytConfig.data?.has_refresh_token ? 'Reconnecter YouTube' : 'Connecter YouTube'}
                </a>
              )}
              {ytConfig.data?.has_refresh_token && (
                <button
                  onClick={() => pullYt.mutate()}
                  disabled={pullYt.isPending}
                  className="flex items-center gap-2 rounded-lg bg-red-700 hover:bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={cn('h-4 w-4', pullYt.isPending && 'animate-spin')} />
                  Synchroniser maintenant
                </button>
              )}
              {pullYt.isSuccess && <span className="flex items-center gap-1 text-sm text-green-400"><CheckCircle size={14} /> Synchronisé</span>}
            </div>

            <div className="mt-4 rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-400">Variables .env requises</p>
              <code className="block text-[11px] text-indigo-300">GOOGLE_CLIENT_ID=</code>
              <code className="block text-[11px] text-indigo-300">GOOGLE_CLIENT_SECRET=</code>
              <code className="block text-[11px] text-indigo-300">GOOGLE_REDIRECT_URI=https://…/api/analytics/youtube/callback</code>
            </div>
          </div>

          {/* Meta Ads */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/15">
                  <ExternalLink className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-100">Meta Ads</p>
                  <p className="text-xs text-gray-500">Dépenses, impressions, conversations WhatsApp</p>
                </div>
              </div>
              <StatusBadge
                ok={!!metaLastSync}
                label={metaLastSync ? 'Actif' : 'Non synchronisé'}
              />
            </div>

            <p className="mb-4 text-xs text-gray-600">
              Dernière sync : {fmtDate(metaLastSync ?? null)}
            </p>

            <button
              onClick={() => pullMeta.mutate()}
              disabled={pullMeta.isPending}
              className="flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('h-4 w-4', pullMeta.isPending && 'animate-spin')} />
              Synchroniser hier
            </button>
            {pullMeta.isSuccess && <p className="mt-2 text-sm text-green-400 flex items-center gap-1"><CheckCircle size={14} /> Synchronisé</p>}
            {pullMeta.isError && <p className="mt-2 text-sm text-red-400">Token ou Account ID non configuré dans .env</p>}

            <div className="mt-4 rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-400">Variables .env requises</p>
              <code className="block text-[11px] text-indigo-300">META_ACCESS_TOKEN=</code>
              <code className="block text-[11px] text-indigo-300">META_AD_ACCOUNT_ID=act_...</code>
            </div>
          </div>

          {/* Typebot */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/15">
                  <Bot className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-100">Typebot</p>
                  <p className="text-xs text-gray-500">Les nouveaux leads arrivent automatiquement via webhook</p>
                </div>
              </div>
              <StatusBadge
                ok={(typebotBots.data?.length ?? 0) > 0}
                label={(typebotBots.data?.length ?? 0) > 0 ? `${typebotBots.data!.length} bot(s)` : 'Non configuré'}
              />
            </div>

            {/* How it works */}
            <div className="mb-4 rounded-lg bg-violet-900/10 border border-violet-800/30 p-3 text-xs text-violet-300 space-y-1">
              <p className="font-medium text-violet-200 flex items-center gap-1.5"><Webhook size={12} /> Comment ça marche</p>
              <p>Chaque soumission Typebot est reçue en temps réel via webhook — aucune synchro manuelle nécessaire.</p>
              <p>Pour un <strong>nouveau bot</strong> : cliquez <em>Enregistrer webhook + Importer</em> pour configurer le webhook et importer l'historique.</p>
            </div>

            {/* Webhook URL */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 mb-1.5">URL webhook à configurer dans Typebot</p>
              <div className="flex items-center gap-2 rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
                <code className="flex-1 text-[11px] text-indigo-300 truncate">{webhookUrl}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                  title="Copier l'URL"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>

            {/* Bot list */}
            {typebotBots.isLoading && (
              <p className="text-xs text-gray-600 mb-3">Chargement des bots…</p>
            )}
            {typebotBots.data && typebotBots.data.length > 0 ? (
              <div className="space-y-2 mb-4">
                {typebotBots.data.map(bot => (
                  <div key={bot.id} className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200">{bot.name}</span>
                        {bot.webhook_registered ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-900/30 px-2 py-0.5 text-[10px] text-green-400">
                            <CheckCircle size={9} /> Webhook actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-500">
                            <AlertCircle size={9} /> Webhook à configurer
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => registerWebhook.mutate(bot.id)}
                        disabled={registerWebhook.isPending}
                        className="flex items-center gap-1.5 rounded-md bg-violet-700 hover:bg-violet-600 px-2.5 py-1 text-xs text-white disabled:opacity-50 transition-colors"
                      >
                        <Webhook size={11} />
                        Enregistrer webhook + Importer
                      </button>
                      <button
                        onClick={() => backfill.mutate(bot.id)}
                        disabled={backfill.isPending}
                        className="flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw className={cn('h-3 w-3', backfill.isPending && 'animate-spin')} />
                        Importer historique
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !typebotBots.isLoading && (
              <p className="mb-4 text-xs text-gray-600">Aucun bot trouvé — vérifiez vos variables d'environnement.</p>
            )}

            {registerWebhook.isSuccess && (
              <div className={cn(
                'mb-3 rounded-lg px-3 py-2 text-xs',
                registerWebhook.data?.registered
                  ? 'bg-green-900/20 border border-green-800/30 text-green-400'
                  : 'bg-amber-900/20 border border-amber-800/30 text-amber-400',
              )}>
                {registerWebhook.data?.message}
              </div>
            )}
            {backfill.isSuccess && (
              <div className="mb-3 rounded-lg bg-green-900/20 border border-green-800/30 px-3 py-2 text-xs text-green-400">
                Import terminé — {backfill.data?.created} lead(s) créé(s), {backfill.data?.skipped} ignoré(s)
                {(backfill.data?.errors ?? 0) > 0 && <span className="text-red-400">, {backfill.data?.errors} erreur(s)</span>}
              </div>
            )}

            <div className="mt-2 rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-400">Variables .env requises</p>
              <code className="block text-[11px] text-indigo-300">TYPEBOT_TOKEN=</code>
              <code className="block text-[11px] text-indigo-300">TYPEBOT_WORKSPACE_ID=</code>
              <code className="block text-[11px] text-indigo-300">TYPEBOT_SELF_URL=https://type.votredomaine.com</code>
              <code className="block text-[11px] text-indigo-300">BACKEND_URL=https://api.votredomaine.com</code>
            </div>
          </div>

          {/* TikTok */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-600/15">
                <PlayCircle className="h-5 w-5 text-pink-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-100">TikTok</p>
                <p className="text-xs text-gray-500">Import CSV manuel depuis Creator Studio</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              TikTok ne fournit pas d'API publique pour les stats. Exporter depuis :<br />
              <strong className="text-gray-400">TikTok Creator Studio → Analyse → Exporter en CSV</strong>
            </p>
            <a
              href="/analytics"
              className="inline-flex items-center gap-1.5 text-xs text-pink-400 hover:text-pink-300"
            >
              <ExternalLink size={12} /> Aller à la page Analytics pour importer
            </a>
          </div>

          {/* Claude AI */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/15">
                <Settings className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-100">Claude AI (résumé d'appels)</p>
                <p className="text-xs text-gray-500">Génération automatique de résumés de transcription</p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-500">
              <p className="font-medium text-gray-400 mb-1">Variable .env requise</p>
              <code className="text-[11px] text-indigo-300">ANTHROPIC_API_KEY=sk-ant-...</code>
            </div>
          </div>
        </div>
      )}

      {/* ── Sources ──────────────────────────────────────────────────────── */}
      {tab === 'Sources' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/15">
                <Magnet className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-100">Leads Magnets</p>
                <p className="text-xs text-gray-500">Formations gratuites, ressources, webinaires, challenges...</p>
              </div>
            </div>
            <p className="mb-4 text-xs text-gray-600">
              Ces valeurs apparaissent dans le formulaire de création de lead (champ "Lead Magnet").
            </p>

            {appSettings.isLoading ? (
              <p className="text-xs text-gray-600">Chargement...</p>
            ) : (
              <StringListEditor
                label="Magnets disponibles"
                icon={Magnet}
                items={appSettings.data?.lead_magnets ?? []}
                onAdd={addMagnet}
                onRemove={removeMagnet}
                placeholder="Formation Gratuite, Webinaire..."
              />
            )}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-600/15">
                <Share2 className="h-5 w-5 text-pink-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-100">Réseaux Sociaux</p>
                <p className="text-xs text-gray-500">YouTube, TikTok, Facebook, Instagram...</p>
              </div>
            </div>
            <p className="mb-4 text-xs text-gray-600">
              Ces valeurs apparaissent dans le formulaire de création de lead (champ "Réseau source").
            </p>

            {appSettings.isLoading ? (
              <p className="text-xs text-gray-600">Chargement...</p>
            ) : (
              <StringListEditor
                label="Réseaux disponibles"
                icon={Share2}
                items={appSettings.data?.lead_sources ?? []}
                onAdd={addSource}
                onRemove={removeSource}
                placeholder="YouTube, TikTok, Facebook..."
              />
            )}
          </div>

          {updateSettings.isError && (
            <p className="text-sm text-red-400">Erreur lors de la mise à jour.</p>
          )}
          {updateSettings.isSuccess && (
            <p className="text-sm text-green-400 flex items-center gap-1.5">
              <CheckCircle size={14} /> Paramètres enregistrés
            </p>
          )}
        </div>
      )}

      {/* ── Finances ─────────────────────────────────────────────────────── */}
      {tab === 'Finances' && (
        <div className="space-y-4">

          {/* Gateways / Comptes */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/15">
                <CreditCard className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-100">Comptes & Gateways</p>
                <p className="text-xs text-gray-500">Cartes de crédit, comptes bancaires, wallets à suivre</p>
              </div>
            </div>
            <p className="mb-4 text-xs text-gray-600">
              Ces comptes s'ajoutent aux gateways système (Stripe, Chariow, etc.) dans le formulaire de transaction.
            </p>
            {appSettings.isLoading ? (
              <p className="text-xs text-gray-600">Chargement...</p>
            ) : (
              <StringListEditor
                label="Comptes personnalisés"
                icon={CreditCard}
                items={appSettings.data?.custom_gateways ?? []}
                onAdd={addGateway}
                onRemove={removeGateway}
                placeholder="Carte BNP, Compte CIH, PayPal..."
              />
            )}
          </div>

          {/* Categories */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/15">
                  <Tag className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-100">Catégories</p>
                  <p className="text-xs text-gray-500">Salaire, Loyer, Marketing, Logiciels…</p>
                </div>
              </div>
              <button
                onClick={() => seedCategoriesMut.mutate()}
                disabled={seedCategoriesMut.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', seedCategoriesMut.isPending && 'animate-spin')} />
                Seed par défaut
              </button>
            </div>

            {seedCategoriesMut.isSuccess && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle size={12} />
                {seedCategoriesMut.data?.created === 0 ? 'Toutes les catégories par défaut existent déjà' : `${seedCategoriesMut.data?.created} catégorie(s) créée(s)`}
              </p>
            )}

            {/* New category form */}
            <div className="mb-4 flex items-center gap-2">
              <input
                type="text"
                value={newCatIcon}
                onChange={(e) => setNewCatIcon(e.target.value)}
                maxLength={2}
                className="w-11 rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-center text-base focus:outline-none"
              />
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nom de la catégorie"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && newCatName.trim()) createCategoryMut.mutate({ name: newCatName, type: newCatType, icon: newCatIcon }) }}
              />
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-xs text-gray-100 focus:outline-none"
              >
                <option value="income">Revenu</option>
                <option value="expense">Dépense</option>
                <option value="both">Les deux</option>
              </select>
              <button
                disabled={!newCatName.trim() || createCategoryMut.isPending}
                onClick={() => createCategoryMut.mutate({ name: newCatName, type: newCatType, icon: newCatIcon })}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                <Plus size={12} /> Ajouter
              </button>
            </div>

            {/* Category list */}
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {financeCategories.isLoading ? (
                <p className="py-3 text-xs text-gray-600">Chargement…</p>
              ) : (financeCategories.data ?? []).length === 0 ? (
                <p className="py-3 text-xs text-gray-600">Aucune catégorie. Cliquez sur "Seed par défaut" pour commencer.</p>
              ) : (
                (financeCategories.data ?? []).map((c) => (
                  <div key={c._id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-800/40">
                    <span className="text-base w-6 text-center">{c.icon}</span>
                    <span className="flex-1 text-sm text-gray-200">{c.name}</span>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      c.type === 'income' ? 'bg-emerald-900/30 text-emerald-400'
                      : c.type === 'expense' ? 'bg-red-900/30 text-red-400'
                      : 'bg-gray-800 text-gray-400',
                    )}>
                      {c.type === 'income' ? 'Revenu' : c.type === 'expense' ? 'Dépense' : 'Les deux'}
                    </span>
                    <button
                      onClick={() => deleteCategoryMut.mutate(c._id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Documentation ────────────────────────────────────────────────── */}
      {tab === 'Documentation' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-3 mb-3">
              <BookOpen className="h-5 w-5 text-indigo-400" />
              <div>
                <p className="font-semibold text-gray-100">Documentation système</p>
                <p className="text-xs text-gray-500">Crée 4 articles Wiki expliquant le système complet</p>
              </div>
            </div>
            <p className="mb-4 text-sm text-gray-400">
              Génère dans le Wiki les articles : Vue d'ensemble, Leads & Acquisition, Analytics, Automatisations.
            </p>
            <button
              onClick={() => seedDocs.mutate()}
              disabled={seedDocs.isPending}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
            >
              <BookOpen size={14} />
              {seedDocs.isPending ? 'Création...' : 'Créer la documentation Wiki'}
            </button>
            {seedDocs.isSuccess && (
              <p className="mt-3 text-sm text-green-400 flex items-center gap-1.5">
                <CheckCircle size={14} />
                {seedDocs.data?.created === 0
                  ? 'Articles déjà existants'
                  : `${seedDocs.data?.created} articles créés dans le Wiki`}
              </p>
            )}
            {seedDocs.isError && (
              <p className="mt-3 text-sm text-red-400">Erreur lors de la création</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
