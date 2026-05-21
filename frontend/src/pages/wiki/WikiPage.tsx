import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Trash2, ChevronRight, FileText, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { WikiPage as WikiPageType } from '@/types'

// ── Create page modal ─────────────────────────────────────────────────────────

function CreatePageModal({
  tree,
  defaultParentId,
  onClose,
}: {
  tree: WikiPageType[]
  defaultParentId?: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('📄')
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '')
  const [error, setError] = useState('')

  const flatPages = flattenTree(tree)

  const { mutate, isPending } = useMutation({
    mutationFn: (body: object) => api.post<WikiPageType>('/wiki', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['wiki-tree'] })
      onClose()
      navigate(`/wiki/${res.data.slug}`)
    },
    onError: () => setError('Erreur lors de la création de la page.'),
  })

  const selectCls =
    'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-100">Nouvelle page</h2>
        <div className="space-y-4">
          <Input
            id="wiki-title"
            label="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la page"
            autoFocus
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Icône</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={2}
              className={selectCls + ' w-20'}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Parent</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={selectCls}
            >
              <option value="">— Racine</option>
              {flatPages.map((p) => (
                <option key={p._id} value={p._id}>
                  {'  '.repeat(p.depth)}{p.icon} {p.title}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            loading={isPending}
            disabled={!title.trim()}
            onClick={() =>
              mutate({ title: title.trim(), icon, parentId: parentId || null, content: '' })
            }
          >
            Créer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

function flattenTree(
  pages: WikiPageType[],
  depth = 0,
): Array<WikiPageType & { depth: number }> {
  return pages.flatMap((p) => [
    { ...p, depth },
    ...(p.children ? flattenTree(p.children, depth + 1) : []),
  ])
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function TreeNode({
  page,
  activeSlug,
  depth,
  onAddChild,
  onDelete,
}: {
  page: WikiPageType
  activeSlug?: string
  depth: number
  onAddChild: (parentId: string) => void
  onDelete: (slug: string) => void
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(true)
  const hasChildren = page.children && page.children.length > 0
  const isActive = page.slug === activeSlug

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors cursor-pointer',
          isActive
            ? 'bg-indigo-600/15 text-indigo-400'
            : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-100',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="shrink-0 text-gray-500 hover:text-gray-300"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}

        <button
          onClick={() => navigate(`/wiki/${page.slug}`)}
          className="flex flex-1 items-center gap-1.5 overflow-hidden text-left"
        >
          <span className="shrink-0 text-base leading-none">{page.icon}</span>
          <span className="truncate">{page.title}</span>
        </button>

        <div className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild(page._id) }}
            className="rounded p-0.5 hover:bg-gray-700 hover:text-gray-200 text-gray-500"
            title="Ajouter une sous-page"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(page.slug) }}
            className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-400 text-gray-500"
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {page.children!.map((child) => (
            <TreeNode
              key={child._id}
              page={child}
              activeSlug={activeSlug}
              depth={depth + 1}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WikiPage() {
  const { slug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'idle'>('idle')
  const [showCreate, setShowCreate] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstLoad = useRef(true)

  // Wiki tree
  const { data: tree = [] } = useQuery<WikiPageType[]>({
    queryKey: ['wiki-tree'],
    queryFn: () => api.get<WikiPageType[]>('/wiki/tree').then((r) => r.data),
  })

  // Current page
  const { data: page, isLoading: pageLoading } = useQuery<WikiPageType>({
    queryKey: ['wiki-page', slug],
    queryFn: () => api.get<WikiPageType>(`/wiki/${slug}`).then((r) => r.data),
    enabled: !!slug,
  })

  // Sync local state when page loads
  useEffect(() => {
    if (page) {
      isFirstLoad.current = true
      setContent(page.content ?? '')
      setTitle(page.title)
      setSaveStatus('idle')
    }
  }, [page?._id])

  // Auto-save mutation
  const saveMutation = useMutation({
    mutationFn: (body: { content: string; title: string }) =>
      api.patch(`/wiki/${slug}`, body),
    onSuccess: () => {
      setSaveStatus('saved')
      qc.invalidateQueries({ queryKey: ['wiki-tree'] })
    },
  })

  // Debounced auto-save
  const scheduleSave = useCallback(
    (newContent: string, newTitle: string) => {
      setSaveStatus('pending')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate({ content: newContent, title: newTitle })
      }, 1500)
    },
    [slug],
  )

  const handleContentChange = (val: string) => {
    setContent(val)
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    scheduleSave(val, title)
  }

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    scheduleSave(content, val)
  }

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (pageSlug: string) => api.delete(`/wiki/${pageSlug}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki-tree'] })
      navigate('/wiki')
    },
  })

  const handleDelete = (pageSlug: string) => {
    if (window.confirm('Supprimer cette page et ses sous-pages ?')) {
      deleteMutation.mutate(pageSlug)
    }
  }

  const handleAddChild = (parentId: string) => {
    setCreateParentId(parentId)
    setShowCreate(true)
  }

  return (
    <div className="flex h-full">
      {/* Sidebar tree */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <BookOpen className="h-4 w-4 text-indigo-400" />
            Wiki
          </div>
          <button
            onClick={() => { setCreateParentId(null); setShowCreate(true) }}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            title="Nouvelle page"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-600">Aucune page. Créez-en une.</p>
          ) : (
            tree.map((p) => (
              <TreeNode
                key={p._id}
                page={p}
                activeSlug={slug}
                depth={0}
                onAddChild={handleAddChild}
                onDelete={handleDelete}
              />
            ))
          )}
        </nav>
      </aside>

      {/* Editor area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!slug ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-600">
            <FileText className="h-12 w-12 opacity-30" />
            <p className="text-sm">Sélectionnez une page ou créez-en une nouvelle.</p>
            <Button onClick={() => { setCreateParentId(null); setShowCreate(true) }}>
              <Plus className="h-4 w-4" />
              Nouvelle page
            </Button>
          </div>
        ) : pageLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-500">Chargement…</p>
          </div>
        ) : !page ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-500">Page introuvable.</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-2.5">
              <div className="flex gap-1">
                {(['edit', 'preview'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setEditorTab(t)}
                    className={cn(
                      'rounded-lg px-3 py-1 text-sm transition-colors',
                      editorTab === t
                        ? 'bg-gray-800 text-gray-100'
                        : 'text-gray-500 hover:text-gray-300',
                    )}
                  >
                    {t === 'edit' ? 'Éditer' : 'Aperçu'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-600">
                {saveStatus === 'pending' && 'Modification en cours…'}
                {saveStatus === 'saved' && '✓ Enregistré'}
              </span>
            </div>

            {/* Title */}
            <div className="border-b border-gray-800 px-5 py-3">
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full bg-transparent text-xl font-semibold text-gray-100 placeholder-gray-600 focus:outline-none"
                placeholder="Titre de la page…"
              />
            </div>

            {/* Editor / Preview */}
            <div className="flex-1 overflow-hidden">
              {editorTab === 'edit' ? (
                <textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Écrivez en Markdown…"
                  className="h-full w-full resize-none bg-transparent p-5 font-mono text-sm text-gray-300 placeholder-gray-600 focus:outline-none"
                />
              ) : (
                <div className="h-full overflow-y-auto p-5">
                  {content ? (
                    <div className="wiki-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">Aucun contenu à afficher.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreatePageModal
          tree={tree}
          defaultParentId={createParentId}
          onClose={() => { setShowCreate(false); setCreateParentId(null) }}
        />
      )}
    </div>
  )
}
