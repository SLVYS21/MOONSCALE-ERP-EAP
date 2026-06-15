import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, ToggleLeft, ToggleRight, Settings } from 'lucide-react'
import api from '@/services/api'
import type { ScoringRule, ScoringConfig } from '@/types'
import { cn } from '@/lib/utils'
import { EapScoringTab } from './EapScoringTab'

type TabKey = 'generic' | 'eap'

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'est égal à',
  contains: 'contient',
  not_null: 'est renseigné',
  is_empty: 'est vide',
}

const COMMON_FIELDS = [
  'source_type', 'utm_source', 'reseau_source', 'motivation', 'email', 'phone', 'age',
]

function RuleModal({ rule, onClose }: { rule?: ScoringRule; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    condition_field: rule?.condition_field ?? 'source_type',
    condition_operator: rule?.condition_operator ?? 'equals',
    condition_value: rule?.condition_value ?? '',
    points: String(rule?.points ?? '10'),
    is_active: rule?.is_active ?? true,
  })

  const needsValue = form.condition_operator === 'equals' || form.condition_operator === 'contains'

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      rule
        ? api.patch(`/leads/scoring-rules/${rule._id}`, { ...data, points: Number(data.points) })
        : api.post('/leads/scoring-rules', { ...data, points: Number(data.points) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scoring-rules'] }); onClose() },
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">
          {rule ? 'Modifier la règle' : 'Nouvelle règle de scoring'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nom *</label>
            <input
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
              placeholder="Ex: Lead venant de Meta Ads"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Champ</label>
              <select
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none"
                value={form.condition_field}
                onChange={(e) => set('condition_field', e.target.value)}
              >
                {COMMON_FIELDS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
                <option value="custom">Autre...</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Opérateur</label>
              <select
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:outline-none"
                value={form.condition_operator}
                onChange={(e) => set('condition_operator', e.target.value)}
              >
                {Object.entries(OPERATOR_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {needsValue && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valeur</label>
              <input
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
                placeholder="Ex: meta_ads, tiktok..."
                value={form.condition_value}
                onChange={(e) => set('condition_value', e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Points accordés</label>
            <input
              type="number"
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
              value={form.points}
              onChange={(e) => set('points', e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-800">
            Annuler
          </button>
          <button
            disabled={!form.name || mutation.isPending}
            onClick={() => mutation.mutate(form)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Sauvegarde...' : rule ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ScoringPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('eap')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<ScoringRule | undefined>()

  const { data: rules = [] } = useQuery({
    queryKey: ['scoring-rules'],
    queryFn: () => api.get('/leads/scoring-rules').then((r) => r.data as ScoringRule[]),
  })

  const { data: config } = useQuery({
    queryKey: ['scoring-config'],
    queryFn: () => api.get('/leads/scoring-config').then((r) => r.data as ScoringConfig),
  })

  const [mqlThreshold, setMqlThreshold] = useState<number | null>(null)
  const [sqlThreshold, setSqlThreshold] = useState<number | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/scoring-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring-rules'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/leads/scoring-rules/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring-rules'] }),
  })

  const configMutation = useMutation({
    mutationFn: (data: { mql_threshold?: number; sql_threshold?: number }) =>
      api.patch('/leads/scoring-config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring-config'] }),
  })

  const recalcMutation = useMutation({
    mutationFn: () => api.post('/leads/scoring/recalculate-all'),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {(modal === 'create' || modal === 'edit') && (
        <RuleModal
          rule={editing}
          onClose={() => { setModal(null); setEditing(undefined) }}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/leads" className="text-gray-500 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Scoring automatique</h1>
            <p className="text-sm text-gray-500 mt-0.5">Règles de qualification des leads</p>
          </div>
        </div>
        {tab === 'generic' && (
          <button
            onClick={() => { setEditing(undefined); setModal('create') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium"
          >
            <Plus size={16} /> Nouvelle règle
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[
          { key: 'eap',     label: 'Règles EAP (Typebot)' },
          { key: 'generic', label: 'Règles génériques' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as TabKey)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'eap' && <EapScoringTab />}

      {tab === 'generic' && <>
      {/* Config thresholds */}
      {config && (
        <div className="rounded-xl bg-white border border-gray-200 p-4 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={14} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-600">Seuils de qualification</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Seuil MQL', key: 'mql_threshold', val: mqlThreshold ?? config.mql_threshold, setter: setMqlThreshold, color: 'text-blue-600' },
              { label: 'Seuil SQL', key: 'sql_threshold', val: sqlThreshold ?? config.sql_threshold, setter: setSqlThreshold, color: 'text-indigo-600' },
            ].map(({ label, key, val, setter, color }) => (
              <div key={key}>
                <label className={cn('block text-xs font-medium mb-1', color)}>{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    className="w-24 rounded-lg bg-gray-100 border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                    value={val}
                    onChange={(e) => setter(Number(e.target.value))}
                    onBlur={() => configMutation.mutate({ [key]: val })}
                  />
                  <span className="text-xs text-gray-500">pts</span>
                </div>
              </div>
            ))}
          </div>
          <button
            disabled={recalcMutation.isPending}
            onClick={() => recalcMutation.mutate()}
            className="mt-3 text-xs text-indigo-600 hover:text-indigo-300 disabled:opacity-50"
          >
            {recalcMutation.isPending ? 'Recalcul...' : 'Recalculer tous les scores'}
          </button>
          {recalcMutation.isSuccess && (
            <span className="ml-2 text-xs text-green-600">Recalcul terminé.</span>
          )}
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule._id}
            className={cn(
              'rounded-xl border p-4 flex items-center justify-between gap-4',
              rule.is_active ? 'bg-white border-gray-200' : 'bg-[#f5f6fa] border-gray-200/50 opacity-50',
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800">{rule.name}</p>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', rule.points >= 0 ? 'bg-green-900/30 text-green-600' : 'bg-red-900/30 text-red-400')}>
                  {rule.points >= 0 ? '+' : ''}{rule.points} pts
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {rule.condition_field} {OPERATOR_LABELS[rule.condition_operator]}
                {rule.condition_value ? ` "${rule.condition_value}"` : ''}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleMutation.mutate({ id: rule._id, is_active: !rule.is_active })}
                className="p-1.5 text-gray-500 hover:text-gray-600"
                title={rule.is_active ? 'Désactiver' : 'Activer'}
              >
                {rule.is_active ? <ToggleRight size={16} className="text-indigo-600" /> : <ToggleLeft size={16} />}
              </button>
              <button
                onClick={() => { setEditing(rule); setModal('edit') }}
                className="p-1.5 text-gray-500 hover:text-gray-600"
              >
                <Settings size={14} />
              </button>
              <button
                onClick={() => { if (confirm('Supprimer cette règle ?')) deleteMutation.mutate(rule._id) }}
                className="p-1.5 text-gray-500 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="rounded-xl bg-white border border-gray-200 py-16 text-center">
            <Settings size={32} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 mb-1">Aucune règle de scoring.</p>
            <p className="text-xs text-gray-600">Les scores des leads resteront à 0 jusqu'à la création de règles.</p>
          </div>
        )}
      </div>
      </>}
    </div>
  )
}
