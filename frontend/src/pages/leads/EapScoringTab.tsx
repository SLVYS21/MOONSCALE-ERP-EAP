import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight, Settings, Lock, RotateCw, AlertCircle } from 'lucide-react'
import api from '@/services/api'
import type {
  EapScoringRule, EapRuleCategory, EapMatchType, EapMatchConfig,
  EapSourceField, ScoringConfig,
} from '@/types'
import { cn } from '@/lib/utils'

// ── Configuration des catégories ──────────────────────────────────────────────

const CATEGORY_META: Record<EapRuleCategory, { label: string; description: string; mode: 'single-pick' | 'additive' }> = {
  pack:                { label: 'Q15 — Pack choisi',                description: 'Tier le plus élevé qui matche. Pack A déclenche disqualification.', mode: 'single-pick' },
  acompte:             { label: 'Q16 — Acompte mobilisable',         description: 'Tranche selon le montant FCFA extrait.',                          mode: 'single-pick' },
  objectif_gain:       { label: 'Q14 — Objectif gain 6 mois',        description: 'Tranche selon le montant déclaré.',                                mode: 'single-pick' },
  connaissance_myril:  { label: 'Q12 — Connaissance Myril',          description: 'Ancienneté du lien avec Myril SEKOU.',                             mode: 'single-pick' },
  experience_ecom:     { label: 'Q10 — Expérience e-commerce',       description: 'Niveau d\'expérience déclaré.',                                    mode: 'single-pick' },
  invest_formation:    { label: 'Q11 — Investi en formation',         description: 'A déjà payé pour une formation ?',                                 mode: 'single-pick' },
  situation_pro:       { label: 'Q9 — Situation professionnelle',     description: 'Type d\'activité actuelle.',                                       mode: 'single-pick' },
  bonus:               { label: 'Bonus automatiques',                 description: 'Cumul de tous les bonus qui matchent.',                            mode: 'additive' },
  malus:               { label: 'Malus / Incohérences',               description: 'Cumul de toutes les pénalités qui matchent.',                      mode: 'additive' },
  disqualification:    { label: 'Disqualifications',                  description: 'Toute règle qui matche disqualifie le lead.',                       mode: 'additive' },
}

const CATEGORY_ORDER: EapRuleCategory[] = [
  'pack', 'acompte', 'objectif_gain', 'connaissance_myril',
  'experience_ecom', 'invest_formation', 'situation_pro',
  'bonus', 'malus', 'disqualification',
]

const MATCH_TYPE_LABELS: Record<EapMatchType, string> = {
  pack_tier:           'Pack tier (A-E)',
  amount_range:        'Tranche de montant FCFA',
  regex:               'Regex sur un champ texte',
  text_length:         'Longueur de texte',
  contains_any:        'Contient un mot de la liste',
  pack_acompte_combo:  'Combo pack + acompte (malus)',
  age_below:           'Âge inférieur à un seuil',
  phone_invalid:       'Numéro WhatsApp invalide',
}

const FIELD_LABELS: Record<EapSourceField, string> = {
  q9_situation_pro:        'Q9 Situation pro',
  q10_experience_ecom:     'Q10 Expérience e-commerce',
  q11_invest_formation:    'Q11 Investi en formation',
  q12_connaissance_myril:  'Q12 Connaissance Myril',
  q14_objectif_gain:       'Q14 Objectif gain',
  q15_pack_choisi:         'Q15 Pack choisi',
  q16_montant_acompte:     'Q16 Acompte',
  commentaire_libre:       'Commentaire libre',
  motivation:              'Motivation',
  pays:                    'Pays',
  age:                     'Âge',
  phone:                   'Téléphone',
}

// ── Helpers de rendu du résumé "matching" d'une règle ─────────────────────────

function formatMatchSummary(rule: EapScoringRule): string {
  const c = rule.match_config ?? {}
  switch (rule.match_type) {
    case 'pack_tier':
      return c.tier ? `Pack ${c.tier}` : '?'
    case 'amount_range': {
      const f = c.field ? FIELD_LABELS[c.field] : '?'
      const min = c.min_amount ?? null
      const max = c.max_amount ?? null
      const lo = min !== null ? min.toLocaleString('fr-FR') : '-∞'
      const hi = max !== null ? max.toLocaleString('fr-FR') : '+∞'
      return `${f} ∈ [${lo} ; ${hi}] FCFA`
    }
    case 'regex':
      return `${c.field ? FIELD_LABELS[c.field] : '?'} match /${c.pattern ?? ''}/${c.case_insensitive === false ? '' : 'i'}`
    case 'text_length':
      return `${c.field ? FIELD_LABELS[c.field] : '?'} ≥ ${c.min_length ?? 0} caractères${c.requires_punctuation ? ' (+ ponctuation)' : ''}`
    case 'contains_any': {
      const n = c.values?.length ?? 0
      return `${c.field ? FIELD_LABELS[c.field] : '?'} contient (${n} mots)`
    }
    case 'pack_acompte_combo': {
      const tiers = (c.pack_tiers ?? []).join('/')
      const th = c.acompte_threshold?.toLocaleString('fr-FR') ?? '?'
      return `Pack ${tiers} + acompte ${c.acompte_compare ?? '<'} ${th}`
    }
    case 'age_below':
      return `Âge < ${c.age_threshold ?? '?'}`
    case 'phone_invalid':
      return 'Téléphone invalide (< 8 chiffres)'
    default:
      return ''
  }
}

// ── Modale d'édition d'une règle ──────────────────────────────────────────────

interface RuleModalProps {
  rule?: EapScoringRule
  defaultCategory?: EapRuleCategory
  onClose: () => void
}

function RuleModal({ rule, defaultCategory, onClose }: RuleModalProps) {
  const qc = useQueryClient()
  const isEdit = !!rule
  const isSystem = rule?.is_system ?? false

  const [form, setForm] = useState({
    key: rule?.key ?? '',
    category: (rule?.category ?? defaultCategory ?? 'bonus') as EapRuleCategory,
    label: rule?.label ?? '',
    description: rule?.description ?? '',
    match_type: (rule?.match_type ?? 'regex') as EapMatchType,
    match_config: { ...(rule?.match_config ?? {}) } as EapMatchConfig,
    points: rule?.points ?? 10,
    priority: rule?.priority ?? 10,
    display_order: rule?.display_order ?? 0,
    is_active: rule?.is_active ?? true,
    disqualification_reason: rule?.disqualification_reason ?? '',
  })

  const setCfg = (patch: Partial<EapMatchConfig>) =>
    setForm((f) => ({ ...f, match_config: { ...f.match_config, ...patch } }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        key: form.key,
        category: form.category,
        label: form.label,
        description: form.description,
        match_type: form.match_type,
        match_config: form.match_config,
        points: form.points,
        priority: form.priority,
        display_order: form.display_order,
        is_active: form.is_active,
        disqualification_reason: form.disqualification_reason,
      }
      return isEdit
        ? api.patch(`/leads/eap-scoring-rules/${rule!._id}`, payload)
        : api.post('/leads/eap-scoring-rules', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eap-scoring-rules'] })
      onClose()
    },
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {isEdit ? 'Modifier la règle EAP' : 'Nouvelle règle EAP'}
        </h2>
        {isSystem && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 mb-4">
            <Lock size={12} /> Règle système — vous pouvez modifier points & matching, mais pas supprimer
          </p>
        )}

        <div className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Clé (slug)</label>
              <input
                disabled={isEdit}
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                placeholder="ex: bonus_xyz"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Catégorie</label>
              <select
                disabled={isEdit && isSystem}
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none disabled:opacity-50"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as EapRuleCategory }))}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Libellé</label>
            <input
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
              placeholder="ex: Pack E — Plus de 10M FCFA"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (optionnel)</label>
            <input
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Points</label>
              <input
                type="number"
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Priorité</label>
              <input
                type="number"
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Plus haute = testée en premier</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ordre</label>
              <input
                type="number"
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={form.display_order}
                onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) }))}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Tri visuel</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Type de matching</label>
            <select
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none"
              value={form.match_type}
              onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value as EapMatchType }))}
            >
              {Object.entries(MATCH_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <MatchConfigEditor matchType={form.match_type} config={form.match_config} setConfig={setCfg} />

          {form.category === 'disqualification' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Raison affichée si déclenche</label>
              <input
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={form.disqualification_reason}
                onChange={(e) => setForm((f) => ({ ...f, disqualification_reason: e.target.value }))}
              />
            </div>
          )}

          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <span className="text-xs text-gray-600">Règle active</span>
          </label>
        </div>

        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-800">
            Annuler
          </button>
          <button
            disabled={!form.label || !form.key || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Sauvegarde...' : isEdit ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Editor par type de matching ───────────────────────────────────────────────

function MatchConfigEditor({
  matchType, config, setConfig,
}: {
  matchType: EapMatchType
  config: EapMatchConfig
  setConfig: (patch: Partial<EapMatchConfig>) => void
}) {
  const FieldSelect = ({ value, onChange }: { value?: EapSourceField; onChange: (v: EapSourceField) => void }) => (
    <select
      className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as EapSourceField)}
    >
      <option value="">— champ —</option>
      {Object.entries(FIELD_LABELS).map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  )

  switch (matchType) {
    case 'pack_tier':
      return (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Tier du Pack</label>
          <select
            className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none"
            value={config.tier ?? ''}
            onChange={(e) => setConfig({ tier: (e.target.value || undefined) as 'A'|'B'|'C'|'D'|'E'|undefined })}
          >
            <option value="">— tier —</option>
            {['A','B','C','D','E'].map((t) => <option key={t} value={t}>Pack {t}</option>)}
          </select>
        </div>
      )

    case 'amount_range':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Champ source</label>
            <FieldSelect value={config.field} onChange={(v) => setConfig({ field: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Min FCFA (vide = -∞)</label>
              <input
                type="number"
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={config.min_amount ?? ''}
                onChange={(e) => setConfig({ min_amount: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max FCFA (vide = +∞)</label>
              <input
                type="number"
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={config.max_amount ?? ''}
                onChange={(e) => setConfig({ max_amount: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )

    case 'regex':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Champ source</label>
            <FieldSelect value={config.field} onChange={(v) => setConfig({ field: v })} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Pattern regex</label>
            <textarea
              rows={2}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-xs font-mono text-gray-900 focus:border-indigo-500 focus:outline-none"
              value={config.pattern ?? ''}
              onChange={(e) => setConfig({ pattern: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.case_insensitive !== false}
              onChange={(e) => setConfig({ case_insensitive: e.target.checked })}
            />
            <span className="text-xs text-gray-600">Insensible à la casse</span>
          </label>
        </div>
      )

    case 'text_length':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Champ source</label>
            <FieldSelect value={config.field} onChange={(v) => setConfig({ field: v })} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Longueur minimum</label>
            <input
              type="number"
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
              value={config.min_length ?? 0}
              onChange={(e) => setConfig({ min_length: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!config.requires_punctuation}
              onChange={(e) => setConfig({ requires_punctuation: e.target.checked })}
            />
            <span className="text-xs text-gray-600">Exige au moins une ponctuation (. ! ?)</span>
          </label>
        </div>
      )

    case 'contains_any':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Champ source</label>
            <FieldSelect value={config.field} onChange={(v) => setConfig({ field: v })} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mots / valeurs cibles (un par ligne)</label>
            <textarea
              rows={5}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-xs font-mono text-gray-900 focus:border-indigo-500 focus:outline-none"
              value={(config.values ?? []).join('\n')}
              onChange={(e) => setConfig({ values: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        </div>
      )

    case 'pack_acompte_combo':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tiers concernés</label>
            <div className="flex gap-2">
              {(['A','B','C','D','E'] as const).map((t) => {
                const selected = (config.pack_tiers ?? []).includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const cur = new Set(config.pack_tiers ?? [])
                      if (cur.has(t)) cur.delete(t); else cur.add(t)
                      setConfig({ pack_tiers: Array.from(cur) as Array<'A'|'B'|'C'|'D'|'E'> })
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border',
                      selected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-gray-100 text-gray-600 border-gray-200',
                    )}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Comparaison</label>
              <select
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none"
                value={config.acompte_compare ?? '<'}
                onChange={(e) => setConfig({ acompte_compare: e.target.value as '<' | '>' })}
              >
                <option value="<">Acompte &lt; seuil</option>
                <option value=">">Acompte &gt; seuil</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seuil acompte FCFA</label>
              <input
                type="number"
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                value={config.acompte_threshold ?? 0}
                onChange={(e) => setConfig({ acompte_threshold: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )

    case 'age_below':
      return (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Âge seuil (DQ si lead.age &lt; seuil)</label>
          <input
            type="number"
            className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
            value={config.age_threshold ?? 18}
            onChange={(e) => setConfig({ age_threshold: Number(e.target.value) })}
          />
        </div>
      )

    case 'phone_invalid':
      return (
        <p className="text-xs text-gray-500">
          Pas de configuration : déclenche dès que le téléphone fait moins de 8 chiffres.
        </p>
      )

    default:
      return null
  }
}

// ── Composant principal ───────────────────────────────────────────────────────

export function EapScoringTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; rule?: EapScoringRule; category?: EapRuleCategory } | null>(null)

  const { data: rules = [] } = useQuery({
    queryKey: ['eap-scoring-rules'],
    queryFn: () => api.get('/leads/eap-scoring-rules').then((r) => r.data as EapScoringRule[]),
  })

  const { data: config } = useQuery({
    queryKey: ['scoring-config'],
    queryFn: () => api.get('/leads/scoring-config').then((r) => r.data as ScoringConfig),
  })

  const [thresholds, setThresholds] = useState<{ hot_a: number | null; hot_b: number | null; warm: number | null; cold: number | null }>({
    hot_a: null, hot_b: null, warm: null, cold: null,
  })

  const configMutation = useMutation({
    mutationFn: (data: Record<string, number>) => api.patch('/leads/scoring-config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring-config'] }),
  })

  const recalcMutation = useMutation({
    mutationFn: () => api.post('/leads/scoring/recalculate-all'),
  })

  const resetMutation = useMutation({
    mutationFn: () => api.post('/leads/eap-scoring-rules/reset-seed'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eap-scoring-rules'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/leads/eap-scoring-rules/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eap-scoring-rules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/eap-scoring-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eap-scoring-rules'] }),
  })

  const grouped = useMemo(() => {
    const map = new Map<EapRuleCategory, EapScoringRule[]>()
    for (const r of rules) {
      const arr = map.get(r.category) ?? []
      arr.push(r)
      map.set(r.category, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.priority - a.priority || a.display_order - b.display_order)
    }
    return map
  }, [rules])

  return (
    <div>
      {modal && (
        <RuleModal
          rule={modal.rule}
          defaultCategory={modal.category}
          onClose={() => setModal(null)}
        />
      )}

      {/* Seuils de qualification EAP */}
      {config && (
        <div className="rounded-xl bg-white border border-gray-200 p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Settings size={14} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-600">Seuils de qualification EAP</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'HOT_A ≥',  key: 'eap_hot_a_threshold', val: thresholds.hot_a ?? config.eap_hot_a_threshold, color: 'text-red-600',     set: (n: number) => setThresholds((t) => ({ ...t, hot_a: n })) },
              { label: 'HOT_B ≥',  key: 'eap_hot_b_threshold', val: thresholds.hot_b ?? config.eap_hot_b_threshold, color: 'text-orange-600',  set: (n: number) => setThresholds((t) => ({ ...t, hot_b: n })) },
              { label: 'WARM ≥',   key: 'eap_warm_threshold',  val: thresholds.warm  ?? config.eap_warm_threshold,  color: 'text-yellow-600',  set: (n: number) => setThresholds((t) => ({ ...t, warm: n })) },
              { label: 'COLD ≥',   key: 'eap_cold_threshold',  val: thresholds.cold  ?? config.eap_cold_threshold,  color: 'text-emerald-600', set: (n: number) => setThresholds((t) => ({ ...t, cold: n })) },
            ].map(({ label, key, val, color, set }) => (
              <div key={key}>
                <label className={cn('block text-xs font-medium mb-1', color)}>{label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    className="w-20 rounded-lg bg-gray-100 border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                    value={val}
                    onChange={(e) => set(Number(e.target.value))}
                    onBlur={() => configMutation.mutate({ [key]: val })}
                  />
                  <span className="text-[10px] text-gray-500">pts</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              disabled={recalcMutation.isPending}
              onClick={() => recalcMutation.mutate()}
              className="text-xs text-indigo-600 hover:text-indigo-400 disabled:opacity-50 flex items-center gap-1"
            >
              <RotateCw size={12} /> {recalcMutation.isPending ? 'Recalcul...' : 'Recalculer tous les scores'}
            </button>
            {recalcMutation.isSuccess && <span className="text-xs text-green-600">Recalcul terminé.</span>}
            <button
              disabled={resetMutation.isPending}
              onClick={() => { if (confirm('Réinitialiser toutes les règles système au seed officiel ? Les règles personnalisées seront conservées.')) resetMutation.mutate() }}
              className="ml-auto text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              {resetMutation.isPending ? 'Reset...' : 'Réinitialiser le seed officiel'}
            </button>
          </div>
        </div>
      )}

      {/* Groupes de règles par catégorie */}
      <div className="space-y-5">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat]
          const list = grouped.get(cat) ?? []
          return (
            <div key={cat} className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{meta.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {meta.description}{' '}
                    <span className="text-gray-400">
                      ({meta.mode === 'single-pick' ? 'une seule règle compte' : 'cumul de toutes les règles'})
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setModal({ mode: 'create', category: cat })}
                  className="flex items-center gap-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1.5 font-medium"
                >
                  <Plus size={12} /> Ajouter
                </button>
              </div>

              <div className="space-y-2">
                {list.map((rule) => (
                  <div
                    key={rule._id}
                    className={cn(
                      'rounded-lg border px-3 py-2 flex items-center justify-between gap-3',
                      rule.is_active ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-gray-200 opacity-60',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{rule.label}</p>
                        {rule.is_system && (
                          <span title="Règle système" className="text-gray-400"><Lock size={11} /></span>
                        )}
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0',
                          rule.points > 0 ? 'bg-emerald-100 text-emerald-700' :
                          rule.points < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600',
                        )}>
                          {rule.points > 0 ? '+' : ''}{rule.points} pts
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate font-mono">
                        {formatMatchSummary(rule)}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => toggleMutation.mutate({ id: rule._id, is_active: !rule.is_active })}
                        className="p-1.5 text-gray-500 hover:text-gray-700"
                        title={rule.is_active ? 'Désactiver' : 'Activer'}
                      >
                        {rule.is_active
                          ? <ToggleRight size={16} className="text-indigo-600" />
                          : <ToggleLeft size={16} />}
                      </button>
                      <button
                        onClick={() => setModal({ mode: 'edit', rule })}
                        className="p-1.5 text-gray-500 hover:text-gray-700"
                        title="Modifier"
                      >
                        <Settings size={13} />
                      </button>
                      <button
                        disabled={rule.is_system}
                        onClick={() => { if (confirm(`Supprimer la règle "${rule.label}" ?`)) deleteMutation.mutate(rule._id) }}
                        className="p-1.5 text-gray-500 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={rule.is_system ? 'Règle système — non supprimable' : 'Supprimer'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <p className="text-xs text-gray-400 italic px-1">Aucune règle dans cette catégorie.</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
