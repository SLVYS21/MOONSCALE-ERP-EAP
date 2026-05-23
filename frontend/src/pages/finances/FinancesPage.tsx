import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight,
  Plus, Trash2, Settings, RefreshCw,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDateTime, formatAmount, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type {
  FinanceStats, Transaction, FinanceCategory,
  PaginatedResponse, TransactionType, TransactionGateway,
} from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = ['EUR', 'USD', 'XOF', 'MAD', 'CAD']
const GATEWAYS: TransactionGateway[] = ['stripe', 'chariow', 'pawapay', 'fedapay', 'wave', 'orange_money', 'virement', 'manual', 'bank_import']
const GATEWAY_LABELS: Record<string, string> = {
  stripe: 'Stripe', chariow: 'Chariow', pawapay: 'PawaPay', fedapay: 'FedaPay',
  wave: 'Wave', orange_money: 'Orange Money', virement: 'Virement', manual: 'Manuel', bank_import: 'Import PDF',
}

const selectCls = 'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

// ── Mini bar chart (CSS only) ─────────────────────────────────────────────────

function BarChart({ data }: { data: Array<{ label: string; income: number; expense: number }> }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1)
  return (
    <div className="flex h-40 items-end gap-1 overflow-x-auto pb-4 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex shrink-0 flex-col items-center gap-0.5" style={{ minWidth: '28px' }}>
          <div className="flex w-full items-end gap-0.5" style={{ height: '120px' }}>
            <div
              className="flex-1 rounded-t bg-emerald-500/70 transition-all"
              style={{ height: `${(d.income / maxVal) * 100}%`, minHeight: d.income > 0 ? '2px' : '0' }}
              title={`Revenus: ${d.income}`}
            />
            <div
              className="flex-1 rounded-t bg-red-500/70 transition-all"
              style={{ height: `${(d.expense / maxVal) * 100}%`, minHeight: d.expense > 0 ? '2px' : '0' }}
              title={`Dépenses: ${d.expense}`}
            />
          </div>
          <span className="text-center text-xs text-gray-600 leading-none">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Create transaction modal ──────────────────────────────────────────────────

function CreateTransactionModal({
  categories,
  onClose,
}: {
  categories: FinanceCategory[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [type, setType] = useState<TransactionType>('income')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [gateway, setGateway] = useState<TransactionGateway>('manual')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (body: object) => api.post('/finances/transactions', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['finance-stats'] })
      onClose()
    },
    onError: () => setError('Erreur lors de la création.'),
  })

  const filteredCats = categories.filter((c) => c.type === type || c.type === 'both')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-100">Nouvelle transaction</h2>

        {/* Type toggle */}
        <div className="mb-4 flex rounded-lg border border-gray-700 p-1">
          {(['income', 'expense'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                type === t
                  ? t === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {t === 'income' ? '↑ Revenu' : '↓ Dépense'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Montant</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={selectCls}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Devise</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description de la transaction"
              className={selectCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Catégorie</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls}>
              <option value="">— Sans catégorie</option>
              {filteredCats.map((c) => (
                <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Gateway</label>
            <select value={gateway} onChange={(e) => setGateway(e.target.value as TransactionGateway)} className={selectCls}>
              {GATEWAYS.map((g) => <option key={g} value={g}>{GATEWAY_LABELS[g]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optionnel" className={selectCls} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            loading={isPending}
            disabled={!amount || !description || !date}
            onClick={() => mutate({ type, amount: Number(amount), currency, description, categoryId: categoryId || null, date, gateway, notes })}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Category manager modal ────────────────────────────────────────────────────

function CategoryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState('both')
  const [icon, setIcon] = useState('💰')
  const color = '#6366f1'

  const { data: cats = [] } = useQuery<FinanceCategory[]>({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<FinanceCategory[]>('/finances/categories').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/finances/categories', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance-categories'] }); setName('') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/finances/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance-categories'] }),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-100">Catégories</h2>

        {/* Create */}
        <div className="mb-4 flex gap-2">
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} className="w-12 rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-2 text-center text-lg focus:outline-none" />
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie" className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-2 text-sm text-gray-100 focus:outline-none">
            <option value="income">Revenu</option>
            <option value="expense">Dépense</option>
            <option value="both">Les deux</option>
          </select>
          <button
            onClick={() => name.trim() && createMutation.mutate({ name, type, icon, color })}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {cats.map((c) => (
            <div key={c._id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-800/40">
              <span className="text-lg">{c.icon}</span>
              <span className="flex-1 text-sm text-gray-200">{c.name}</span>
              <Badge variant={c.type === 'income' ? 'success' : c.type === 'expense' ? 'danger' : 'default'}>
                {c.type === 'income' ? 'Revenu' : c.type === 'expense' ? 'Dépense' : 'Les deux'}
              </Badge>
              <button onClick={() => deleteMutation.mutate(c._id)} className="text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {cats.length === 0 && <p className="py-4 text-center text-sm text-gray-600">Aucune catégorie.</p>}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

function DashboardTab({ currency }: { currency: string }) {
  const { data: stats, isLoading } = useQuery<FinanceStats>({
    queryKey: ['finance-stats', currency],
    queryFn: () => api.get<FinanceStats>('/finances/stats', { params: { currency } }).then((r) => r.data),
  })

  if (isLoading) return <div className="py-8 text-center text-sm text-gray-500">Chargement…</div>
  if (!stats) return null

  const topCategories = [...stats.byCategory]
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
    .slice(0, 6)

  const topGateways = [...stats.byGateway]
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Revenus (mois)', value: formatAmount(stats.month.income, currency), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Dépenses (mois)', value: formatAmount(stats.month.expense, currency), icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Net (mois)', value: formatAmount(stats.month.net, currency), icon: DollarSign, color: stats.month.net >= 0 ? 'text-emerald-400' : 'text-red-400', bg: stats.month.net >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10' },
          { label: 'Net (année)', value: formatAmount(stats.year.net, currency), icon: DollarSign, color: stats.year.net >= 0 ? 'text-indigo-400' : 'text-red-400', bg: 'bg-indigo-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={cn('mt-1 text-xl font-semibold', color)}>{value}</p>
              </div>
              <div className={cn('rounded-lg p-2.5', bg, color)}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Monthly chart */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">Évolution (12 mois)</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Revenus</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Dépenses</span>
            </div>
          </div>
          <BarChart data={stats.byMonth} />
        </Card>

        {/* By category */}
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Par catégorie</h3>
          {topCategories.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-600">Aucune donnée.</p>
          ) : (
            <div className="space-y-2">
              {topCategories.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-base">{c.icon}</span>
                  <div className="flex-1">
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="text-gray-300">{c.name}</span>
                      <span className="text-gray-500">{formatAmount(c.income - c.expense, currency)}</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-gray-800">
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${Math.min(100, ((c.income + c.expense) / Math.max(...stats.byCategory.map((x) => x.income + x.expense), 1)) * 100)}%`,
                          backgroundColor: c.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* By gateway */}
      {topGateways.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Par gateway</h3>
          <div className="divide-y divide-gray-800">
            {topGateways.map((g, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-gray-300">{GATEWAY_LABELS[g.gateway] ?? g.gateway}</span>
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-400">{formatAmount(g.income, currency)}</span>
                  <span className="text-red-400">−{formatAmount(g.expense, currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Transactions tab ──────────────────────────────────────────────────────────

function TransactionsTab({
  categories,
  currency,
  onNew,
}: {
  categories: FinanceCategory[]
  currency: string
  onNew: () => void
}) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [type, setType] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [gateway, setGateway] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  const { data, isLoading } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', { type, categoryId, gateway, currency, page }],
    queryFn: () =>
      api.get<PaginatedResponse<Transaction>>('/finances/transactions', {
        params: { type: type || undefined, categoryId: categoryId || undefined, gateway: gateway || undefined, currency, page, limit },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/finances/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['finance-stats'] })
    },
  })

  const txs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none">
          <option value="">Tous les types</option>
          <option value="income">Revenus</option>
          <option value="expense">Dépenses</option>
        </select>
        <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }} className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none">
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
        </select>
        <select value={gateway} onChange={(e) => { setGateway(e.target.value); setPage(1) }} className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none">
          <option value="">Tous les gateways</option>
          {GATEWAYS.map((g) => <option key={g} value={g}>{GATEWAY_LABELS[g]}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          {total} transaction{total !== 1 ? 's' : ''}
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Chargement…</div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-gray-500">Aucune transaction.</p>
            <Button onClick={onNew}><Plus className="h-4 w-4" />Ajouter</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Statut</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Catégorie</th>
                  <th className="pb-3 font-medium">Gateway</th>
                  <th className="pb-3 font-medium text-right">Montant</th>
                  {isAdmin && <th className="pb-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {txs.map((tx) => (
                  <tr key={tx._id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="py-3 pr-4 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(tx.date)}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={
                        tx.status === 'completed' ? 'success'
                        : tx.status === 'pending' ? 'warning'
                        : tx.status === 'failed' ? 'danger'
                        : 'default'
                      }>
                        {tx.status === 'completed' ? 'Complété'
                          : tx.status === 'pending' ? 'En attente'
                          : tx.status === 'failed' ? 'Échoué'
                          : 'Remboursé'}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={tx.type === 'income' ? 'success' : 'danger'}>
                        {tx.type === 'income' ? '↑ Revenu' : '↓ Dépense'}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-200">{tx.description}</p>
                      {tx.notes && <p className="text-xs text-gray-500">{tx.notes}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      {tx.categoryId ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <span>{(tx.categoryId as FinanceCategory).icon}</span>
                          {(tx.categoryId as FinanceCategory).name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="default">{GATEWAY_LABELS[tx.gateway] ?? tx.gateway}</Badge>
                    </td>
                    <td className={cn('py-3 pr-4 text-right font-semibold tabular-nums', tx.type === 'income' ? 'text-emerald-400' : 'text-red-400')}>
                      {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount, tx.currency)}
                    </td>
                    {isAdmin && (
                      <td className="py-3">
                        <button
                          onClick={() => window.confirm('Supprimer ?') && deleteMutation.mutate(tx._id)}
                          className="rounded p-1 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500">Page {page} / {totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-gray-700 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-gray-800 hover:text-gray-100 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-gray-700 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-gray-800 hover:text-gray-100 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'transactions'

export function FinancesPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [currency, setCurrency] = useState('EUR')
  const [showCreate, setShowCreate] = useState(false)
  const [showCategories, setShowCategories] = useState(false)

  const { data: categories = [] } = useQuery<FinanceCategory[]>({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<FinanceCategory[]>('/finances/categories').then((r) => r.data),
  })

  const syncMutation = useMutation({
    mutationFn: (gateway: string) => api.post(`/finances/sync/${gateway}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'transactions', label: 'Transactions' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Finances</h1>
          <p className="mt-0.5 text-sm text-gray-500">Suivi multi-devises des revenus et dépenses</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Currency selector */}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowCategories(true)}
                className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                title="Catégories"
              >
                <Settings className="h-4 w-4" />
              </button>
              <Button variant="secondary" onClick={() => syncMutation.mutate('stripe')} loading={syncMutation.isPending}>
                <RefreshCw className="h-4 w-4" />
                Sync
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Transaction
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === t.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab currency={currency} />}
      {activeTab === 'transactions' && (
        <TransactionsTab categories={categories} currency={currency} onNew={() => setShowCreate(true)} />
      )}

      {showCreate && (
        <CreateTransactionModal categories={categories} onClose={() => setShowCreate(false)} />
      )}
      {showCategories && <CategoryModal onClose={() => setShowCategories(false)} />}
    </div>
  )
}
