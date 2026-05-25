import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight,
  Plus, Trash2, Settings, RefreshCw, Upload, CheckCircle2, AlertCircle, X, Pencil,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDateTime, formatAmount, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type {
  FinanceStats, Transaction, FinanceCategory,
  PaginatedResponse, TransactionType, TransactionGateway, Offer, AppSettings,
} from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = ['EUR', 'USD', 'XOF', 'MAD', 'CAD']
const SYSTEM_GATEWAYS: TransactionGateway[] = ['stripe', 'chariow', 'pawapay', 'fedapay', 'wave', 'orange_money', 'virement', 'manual', 'bank_import']
const GATEWAY_LABELS: Record<string, string> = {
  stripe: 'Stripe', chariow: 'Chariow', pawapay: 'PawaPay', fedapay: 'FedaPay',
  wave: 'Wave', orange_money: 'Orange Money', virement: 'Virement', manual: 'Manuel', bank_import: 'Import PDF',
}

function useAllGateways() {
  const { data: settings } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.get<AppSettings>('/app-settings').then((r) => r.data),
    staleTime: 60_000,
  })
  const custom = settings?.custom_gateways ?? []
  return [...SYSTEM_GATEWAYS, ...custom]
}

const selectCls = 'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

// ── Edit transaction modal ────────────────────────────────────────────────────

function EditTransactionModal({
  tx,
  categories,
  offers,
  onClose,
}: {
  tx: Transaction
  categories: FinanceCategory[]
  offers: Offer[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [categoryId, setCategoryId] = useState<string>(
    tx.categoryId ? (typeof tx.categoryId === 'string' ? tx.categoryId : (tx.categoryId as unknown as { _id: string })._id) : '',
  )
  const [offerId, setOfferId] = useState<string>(tx.offerId ?? '')
  const [productName, setProductName] = useState<string>(tx.productName ?? '')
  const [error, setError] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (body: object) => api.patch(`/finances/transactions/${tx._id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      onClose()
    },
    onError: () => setError('Erreur lors de la mise à jour.'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-xs text-gray-500">Modifier la transaction</p>
            <h2 className="truncate text-sm font-semibold text-gray-100">{tx.description}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Catégorie</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls}>
              <option value="">— Sans catégorie</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Offre liée</label>
            <select value={offerId} onChange={(e) => { setOfferId(e.target.value); if (e.target.value) setProductName('') }} className={selectCls}>
              <option value="">— Sans offre</option>
              {offers.map((o) => (
                <option key={o._id} value={o._id}>{o.name}</option>
              ))}
            </select>
          </div>

          {!offerId && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Nom du produit (libre)</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="ex: ECOM AFRICA PRO"
                className={selectCls}
              />
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            loading={isPending}
            onClick={() => mutate({
              categoryId: categoryId || null,
              offerId: offerId || null,
              productName: productName || null,
            })}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}

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
  const allGateways = useAllGateways()
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
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Gateway / Compte</label>
            <select value={gateway} onChange={(e) => setGateway(e.target.value as TransactionGateway)} className={selectCls}>
              {allGateways.map((g) => <option key={g} value={g}>{GATEWAY_LABELS[g] ?? g}</option>)}
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
  offers,
  currency,
  onNew,
}: {
  categories: FinanceCategory[]
  offers: Offer[]
  currency: string
  onNew: () => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'
  const allGateways = useAllGateways()
  const [editTx, setEditTx] = useState<Transaction | null>(null)

  const [type, setType] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [gateway, setGateway] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  const { data, isLoading } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', { type, categoryId, gateway, currency, dateFrom, dateTo, search, page }],
    queryFn: () =>
      api.get<PaginatedResponse<Transaction>>('/finances/transactions', {
        params: {
          type: type || undefined,
          categoryId: categoryId || undefined,
          gateway: gateway || undefined,
          currency,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: search || undefined,
          page,
          limit,
        },
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

  const { data: debtorData } = useQuery<{ data: { email: string }[] }>({
    queryKey: ['debtors-emails'],
    queryFn: () => api.get('/students', { params: { debtStatus: 'confirmed', limit: 500 } }).then((r) => r.data),
    staleTime: 60_000,
  })
  const debtorEmails = new Set((debtorData?.data ?? []).map((s) => s.email))

  const txs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 space-y-3">
      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setSearch(searchInput); setPage(1) }
            if (e.key === 'Escape') { setSearchInput(''); setSearch(''); setPage(1) }
          }}
          placeholder="Rechercher par email, nom, téléphone, produit, description…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 py-2 pl-9 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
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
          {allGateways.map((g) => <option key={g} value={g}>{GATEWAY_LABELS[g] ?? g}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            placeholder="Du"
          />
          <span className="text-xs text-gray-600">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            placeholder="Au"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
              className="rounded p-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Effacer les dates"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          {search && <span className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-indigo-400">"{search}"</span>}
          {total} transaction{total !== 1 ? 's' : ''}
        </div>
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
                  <th className="pb-3 font-medium">Client / Produit</th>
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
                    <td className="py-3 pr-4 max-w-xs">
                      <div className="flex flex-wrap items-center gap-1 mb-0.5">
                        {tx.studentId && (
                          <button
                            onClick={() => navigate(`/students/${tx.studentId}`)}
                            className="rounded-full bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400 hover:bg-indigo-600/30 transition-colors"
                          >
                            Étudiant
                          </button>
                        )}
                        {tx.leadId && !tx.studentId && (
                          <button
                            onClick={() => navigate(`/leads`)}
                            className="rounded-full bg-teal-600/20 px-1.5 py-0.5 text-[10px] font-medium text-teal-400 hover:bg-teal-600/30 transition-colors"
                          >
                            Lead
                          </button>
                        )}
                        {tx.customerEmail && debtorEmails.has(tx.customerEmail.toLowerCase()) && tx.type === 'income' && (
                          <span className="rounded-full bg-orange-600/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">
                            ⚠ En retard
                          </span>
                        )}
                      </div>
                      {tx.customerName && <p className="font-medium text-gray-200 truncate">{tx.customerName}</p>}
                      {tx.customerEmail && <p className="text-xs text-gray-400 truncate">{tx.customerEmail}</p>}
                      {tx.customerPhone && <p className="text-xs text-gray-500">{tx.customerPhone}</p>}
                      {tx.productName
                        ? <p className="mt-0.5 text-xs text-indigo-400 truncate">{tx.productName}</p>
                        : !tx.customerName && !tx.customerEmail && (
                          <p className="text-sm text-gray-400 truncate">{tx.description}</p>
                        )
                      }
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
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Badge variant="default">{GATEWAY_LABELS[tx.gateway] ?? tx.gateway}</Badge>
                    </td>
                    <td className={cn('py-3 pr-4 text-right font-semibold tabular-nums', tx.type === 'income' ? 'text-emerald-400' : 'text-red-400')}>
                      {tx.type === 'income' ? '+' : '−'}{formatAmount(tx.amount, tx.currency)}
                    </td>
                    {isAdmin && (
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditTx(tx)}
                            className="rounded p-1 text-gray-600 hover:text-indigo-400 transition-colors"
                            title="Modifier catégorie / offre"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => window.confirm('Supprimer ?') && deleteMutation.mutate(tx._id)}
                            className="rounded p-1 text-gray-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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

      {editTx && (
        <EditTransactionModal
          tx={editTx}
          categories={categories}
          offers={offers}
          onClose={() => setEditTx(null)}
        />
      )}
    </div>
  )
}

// ── Sync modal ────────────────────────────────────────────────────────────────

type SyncResult = { imported: number; skipped: number; errors?: number }

function SyncModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fedaFile, setFedaFile] = useState<File | null>(null)
  const [results, setResults] = useState<Record<string, SyncResult>>({})

  const btnCls = (disabled: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
      disabled
        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
        : 'bg-indigo-600 text-white hover:bg-indigo-700'
    }`

  const chariowMut = useMutation({
    mutationFn: () => api.post<SyncResult>('/finances/sync/chariow').then((r) => r.data),
    onSuccess: (data) => { setResults((p) => ({ ...p, chariow: data })); qc.invalidateQueries({ queryKey: ['transactions'] }) },
  })

  const stripeMut = useMutation({
    mutationFn: () => api.post<SyncResult>('/finances/sync/stripe').then((r) => r.data),
    onSuccess: (data) => { setResults((p) => ({ ...p, stripe: data })); qc.invalidateQueries({ queryKey: ['transactions'] }) },
  })

  const fedaMut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const isXlsx = file.name.toLowerCase().endsWith('.xlsx')
      const endpoint = isXlsx ? '/finances/sync/fedapay-xlsx' : '/finances/sync/fedapay-csv'
      return api.post<SyncResult>(endpoint, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: (data) => { setResults((p) => ({ ...p, fedapay: data })); qc.invalidateQueries({ queryKey: ['transactions'] }) },
  })

  const ResultBadge = ({ result, error }: { result?: SyncResult; error?: boolean }) => {
    if (error) return <p className="mt-2 flex items-center gap-1 text-xs text-red-400"><AlertCircle className="h-3 w-3" /> Erreur — vérifier la clé API</p>
    if (!result) return null
    return (
      <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {result.imported} importées · {result.skipped} ignorées
        {result.errors !== undefined && result.errors > 0 && <span className="text-amber-400"> · {result.errors} erreurs</span>}
      </p>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Synchronisation historique</h2>
            <p className="mt-0.5 text-xs text-gray-500">Importe les données depuis juin 2025</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:text-gray-300 transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          {/* Chariow */}
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">Chariow</p>
                <p className="text-xs text-gray-500">Ventes complètes via API</p>
              </div>
              <button
                className={btnCls(chariowMut.isPending)}
                disabled={chariowMut.isPending}
                onClick={() => chariowMut.mutate()}
              >
                {chariowMut.isPending ? (
                  <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Sync…</span>
                ) : 'Synchroniser'}
              </button>
            </div>
            <ResultBadge result={results.chariow} error={chariowMut.isError} />
          </div>

          {/* Stripe */}
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">Stripe</p>
                <p className="text-xs text-gray-500">Charges + virements sortants</p>
              </div>
              <button
                className={btnCls(stripeMut.isPending)}
                disabled={stripeMut.isPending}
                onClick={() => stripeMut.mutate()}
              >
                {stripeMut.isPending ? (
                  <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Sync…</span>
                ) : 'Synchroniser'}
              </button>
            </div>
            <ResultBadge result={results.stripe} error={stripeMut.isError} />
            {stripeMut.isError && (
              <p className="mt-1 text-[10px] text-gray-600">Ajouter <code className="text-gray-400">STRIPE_SECRET_KEY</code> dans le fichier .env</p>
            )}
          </div>

          {/* FedaPay CSV / XLSX */}
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <p className="mb-1 text-sm font-medium text-gray-200">FedaPay — Import fichier</p>
            <p className="mb-3 text-xs text-gray-500">Export CSV ou XLSX depuis le dashboard FedaPay (exports_transactions-…)</p>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => setFedaFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                {fedaFile ? fedaFile.name : 'Choisir un fichier…'}
              </button>
              {fedaFile && (
                <button
                  className={btnCls(fedaMut.isPending)}
                  disabled={fedaMut.isPending}
                  onClick={() => fedaMut.mutate(fedaFile)}
                >
                  {fedaMut.isPending ? (
                    <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Import…</span>
                  ) : 'Importer'}
                </button>
              )}
            </div>
            <ResultBadge result={results.fedapay} error={fedaMut.isError} />
          </div>

          {/* PawaPay */}
          <div className="rounded-lg border border-gray-700/40 bg-gray-950/40 p-4">
            <p className="mb-1 text-sm font-medium text-gray-500">PawaPay</p>
            <p className="text-xs text-gray-600">Pas d'API historique — les transactions arrivent uniquement via webhook en temps réel.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Match modal ───────────────────────────────────────────────────────────────

function MatchModal({
  mapping,
  offers,
  onConfirm,
  onCreate,
  onClose,
  isConfirming,
  isCreating,
}: {
  mapping: ProductMapping
  offers: Offer[]
  onConfirm: (offerId: string) => void
  onCreate: (offerName: string) => void
  onClose: () => void
  isConfirming: boolean
  isCreating: boolean
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedOfferId, setSelectedOfferId] = useState(mapping.suggestedOfferId ?? '')
  const [newOfferName, setNewOfferName] = useState(mapping.productName)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs text-gray-500">Matcher le produit</p>
            <h2 className="truncate text-base font-semibold text-gray-100">{mapping.productName}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant="default">{GATEWAY_LABELS[mapping.gateway] ?? mapping.gateway}</Badge>
              <span className="text-xs text-gray-500">{mapping.seenCount}× vu</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Groq suggestion */}
        {mapping.suggestedOfferName && (
          <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="text-xs font-medium text-blue-400">Suggestion Groq AI : {mapping.suggestedOfferName}</p>
            {mapping.groqReasoning && (
              <p className="mt-1 text-xs text-gray-500">{mapping.groqReasoning}</p>
            )}
          </div>
        )}

        {/* Mode tabs */}
        <div className="mb-4 flex rounded-lg border border-gray-700 p-1">
          {(['existing', 'new'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMode(tab)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                mode === tab ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {tab === 'existing' ? 'Offre existante' : 'Créer une offre'}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Sélectionner une offre</label>
            <select
              value={selectedOfferId}
              onChange={(e) => setSelectedOfferId(e.target.value)}
              className={selectCls}
            >
              <option value="">— Choisir une offre</option>
              {mapping.suggestedOfferId && (
                <option value={mapping.suggestedOfferId}>★ {mapping.suggestedOfferName} (recommandée)</option>
              )}
              {offers
                .filter((o) => o._id !== mapping.suggestedOfferId)
                .map((o) => (
                  <option key={o._id} value={o._id}>{o.name}</option>
                ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Nom de la nouvelle offre</label>
            <input
              autoFocus
              type="text"
              value={newOfferName}
              onChange={(e) => setNewOfferName(e.target.value)}
              placeholder="Nom de la nouvelle offre"
              className={selectCls}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newOfferName.trim()) onCreate(newOfferName.trim())
              }}
            />
            <p className="mt-1.5 text-xs text-gray-500">Une nouvelle offre sera créée et associée à ce produit.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          {mode === 'existing' ? (
            <Button
              loading={isConfirming}
              disabled={!selectedOfferId || isConfirming}
              onClick={() => onConfirm(selectedOfferId)}
            >
              Matcher
            </Button>
          ) : (
            <Button
              loading={isCreating}
              disabled={!newOfferName.trim() || isCreating}
              onClick={() => onCreate(newOfferName.trim())}
            >
              Créer &amp; Matcher
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Product mappings tab ──────────────────────────────────────────────────────

interface ProductMapping {
  _id: string
  productName: string
  gateway: string
  status: 'pending' | 'confirmed' | 'ignored'
  offerId: string | null
  offerName: string | null
  suggestedOfferId: string | null
  suggestedOfferName: string | null
  groqReasoning: string | null
  seenCount: number
  firstSeenAt: string
  lastSeenAt: string
}

function ProductMappingsTab() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'ignored'>('pending')
  const [matchingId, setMatchingId] = useState<string | null>(null)

  const { data: mappings = [], isLoading } = useQuery<ProductMapping[]>({
    queryKey: ['product-mappings', filter],
    queryFn: () =>
      api.get<ProductMapping[]>('/finances/product-mappings', {
        params: { status: filter === 'all' ? undefined : filter },
      }).then((r) => r.data),
    refetchOnWindowFocus: false,
  })

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ['subscription-offers'],
    queryFn: () => api.get<Offer[]>('/subscription-offers').then((r) => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['product-mappings'] })
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['finance-stats'] })
  }

  const confirmMut = useMutation({
    mutationFn: ({ id, offerId }: { id: string; offerId: string }) =>
      api.post(`/finances/product-mappings/${id}/confirm`, { offerId }).then((r) => r.data),
    onSuccess: () => { invalidate(); setMatchingId(null) },
  })

  // Create a new offer then immediately confirm the mapping with it
  const createAndMatchMut = useMutation({
    mutationFn: async ({ mappingId, offerName }: { mappingId: string; offerName: string }) => {
      const created = await api.post<Offer>('/subscription-offers', { name: offerName }).then((r) => r.data)
      await api.post(`/finances/product-mappings/${mappingId}/confirm`, { offerId: created._id })
      return created
    },
    onSuccess: () => { invalidate(); setMatchingId(null) },
  })

  const ignoreMut = useMutation({
    mutationFn: (id: string) => api.post(`/finances/product-mappings/${id}/ignore`).then((r) => r.data),
    onSuccess: invalidate,
  })

  const resetMut = useMutation({
    mutationFn: (id: string) => api.post(`/finances/product-mappings/${id}/reset`).then((r) => r.data),
    onSuccess: invalidate,
  })

  const pending = mappings.filter((m) => m.status === 'pending').length
  const matchingMapping = matchingId ? (mappings.find((m) => m._id === matchingId) ?? null) : null

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {(['pending', 'confirmed', 'ignored', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200',
            )}
          >
            {s === 'pending' ? `En attente${pending > 0 && filter !== 'pending' ? ` (${pending})` : ''}`
              : s === 'confirmed' ? 'Confirmés'
              : s === 'ignored' ? 'Ignorés'
              : 'Tous'}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{mappings.length} produit{mappings.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-gray-500">Chargement…</div>
      ) : mappings.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          {filter === 'pending' ? 'Aucun produit en attente de validation.' : 'Aucun produit.'}
        </div>
      ) : (
        <div className="space-y-3">
          {mappings.map((m) => (
            <Card key={m._id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-100 truncate">{m.productName}</p>
                    <Badge variant="default">{GATEWAY_LABELS[m.gateway] ?? m.gateway}</Badge>
                    <Badge variant={m.status === 'confirmed' ? 'success' : m.status === 'ignored' ? 'danger' : 'warning'}>
                      {m.status === 'confirmed' ? 'Confirmé' : m.status === 'ignored' ? 'Ignoré' : 'En attente'}
                    </Badge>
                    <span className="text-xs text-gray-500">{m.seenCount}× vu</span>
                  </div>

                  {/* Confirmed offer */}
                  {m.status === 'confirmed' && m.offerName && (
                    <p className="mt-1 text-sm text-emerald-400">→ {m.offerName}</p>
                  )}

                  {/* Groq suggestion */}
                  {m.suggestedOfferName && m.status === 'pending' && (
                    <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
                      <p className="text-xs font-medium text-blue-400">Suggestion Groq AI : {m.suggestedOfferName}</p>
                      {m.groqReasoning && (
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{m.groqReasoning}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-2">
                  {m.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setMatchingId(m._id)}
                        className="rounded-lg bg-indigo-600/20 px-2.5 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30"
                      >
                        Matcher
                      </button>
                      <button
                        onClick={() => ignoreMut.mutate(m._id)}
                        disabled={ignoreMut.isPending}
                        className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:text-gray-200"
                      >
                        Ignorer
                      </button>
                    </>
                  )}
                  {(m.status === 'confirmed' || m.status === 'ignored') && (
                    <button
                      onClick={() => resetMut.mutate(m._id)}
                      disabled={resetMut.isPending}
                      className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {matchingMapping && (
        <MatchModal
          mapping={matchingMapping}
          offers={offers}
          onConfirm={(offerId) => confirmMut.mutate({ id: matchingMapping._id, offerId })}
          onCreate={(offerName) => createAndMatchMut.mutate({ mappingId: matchingMapping._id, offerName })}
          onClose={() => setMatchingId(null)}
          isConfirming={confirmMut.isPending}
          isCreating={createAndMatchMut.isPending}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'transactions' | 'products'

export function FinancesPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [currency, setCurrency] = useState('EUR')
  const [showCreate, setShowCreate] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showSync, setShowSync] = useState(false)

  const { data: categories = [] } = useQuery<FinanceCategory[]>({
    queryKey: ['finance-categories'],
    queryFn: () => api.get<FinanceCategory[]>('/finances/categories').then((r) => r.data),
  })

  const { data: allOffers = [] } = useQuery<Offer[]>({
    queryKey: ['subscription-offers'],
    queryFn: () => api.get<Offer[]>('/subscription-offers').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: pendingMappings = [] } = useQuery<ProductMapping[]>({
    queryKey: ['product-mappings', 'pending'],
    queryFn: () =>
      api.get<ProductMapping[]>('/finances/product-mappings', { params: { status: 'pending' } }).then((r) => r.data),
    refetchInterval: 60_000,
  })

  const pendingCount = pendingMappings.length

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'products', label: 'Produits', badge: pendingCount },
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
              <Button variant="secondary" onClick={() => setShowSync(true)}>
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
              'relative px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === t.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300',
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab currency={currency} />}
      {activeTab === 'transactions' && (
        <TransactionsTab categories={categories} offers={allOffers} currency={currency} onNew={() => setShowCreate(true)} />
      )}
      {activeTab === 'products' && <ProductMappingsTab />}

      {showCreate && (
        <CreateTransactionModal categories={categories} onClose={() => setShowCreate(false)} />
      )}
      {showCategories && <CategoryModal onClose={() => setShowCategories(false)} />}
      {showSync && <SyncModal onClose={() => setShowSync(false)} />}
    </div>
  )
}
