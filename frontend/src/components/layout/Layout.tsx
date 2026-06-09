import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { Search, Bell, Settings, Plus, Clock } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { cn } from '@/lib/utils'

// ── Page metadata map ─────────────────────────────────────────────────────────

const PAGE_META: Record<string, { title: string; breadcrumb: string[] }> = {
  '/dashboard':        { title: 'Dashboard',            breadcrumb: ['Home', 'Dashboard'] },
  '/leads':            { title: 'Sales Dashboard',       breadcrumb: ['Home', 'Sales Dashboard'] },
  '/leads/offers':     { title: 'Offres',                breadcrumb: ['Home', 'Sales', 'Offres'] },
  '/leads/scoring':    { title: 'Scoring',               breadcrumb: ['Home', 'Sales', 'Scoring'] },
  '/leads/tracking':   { title: 'Tracking Links',        breadcrumb: ['Home', 'Sales', 'Tracking'] },
  '/analytics':        { title: 'Analytics',             breadcrumb: ['Home', 'Sales', 'Analytics'] },
  '/tasks':            { title: 'Project Dashboard',     breadcrumb: ['Home', 'Project Dashboard'] },
  '/wiki':             { title: 'Base de connaissance',  breadcrumb: ['Home', 'Projects', 'Wiki'] },
  '/team':             { title: 'HR Dashboard',          breadcrumb: ['Home', 'HR Dashboard'] },
  '/students':         { title: 'Étudiants',             breadcrumb: ['Home', 'Sales', 'Étudiants'] },
  '/payments':         { title: 'Paiements',             breadcrumb: ['Home', 'Sales', 'Paiements'] },
  '/payments/offers':  { title: 'Abonnements',           breadcrumb: ['Home', 'Sales', 'Abonnements'] },
  '/finances':         { title: 'Finance Dashboard',     breadcrumb: ['Home', 'Finance Dashboard'] },
  '/automations':      { title: 'Automatisations',       breadcrumb: ['Home', 'Workspace', 'Automatisations'] },
  '/forms':            { title: 'Formulaires',           breadcrumb: ['Home', 'Workspace', 'Formulaires'] },
  '/content':          { title: 'Création de contenu',  breadcrumb: ['Home', 'Workspace', 'Contenu'] },
  '/sync':             { title: 'Synchronisation',       breadcrumb: ['Home', 'Workspace', 'Sync'] },
  '/messages':         { title: 'Messages',              breadcrumb: ['Home', 'Workspace', 'Messages'] },
  '/settings':         { title: 'Paramètres',            breadcrumb: ['Home', 'Workspace', 'Paramètres'] },
}

function getPageMeta(pathname: string) {
  // Exact match first
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  // Prefix match (longest wins)
  const key = Object.keys(PAGE_META)
    .filter((k) => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return PAGE_META[key] ?? { title: 'Moonscale ERP', breadcrumb: ['Home'] }
}

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar() {
  const location = useLocation()
  const { title, breadcrumb } = getPageMeta(location.pathname)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Left: Title + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-bold text-gray-900 whitespace-nowrap">{title}</h1>
        <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-600">•</span>}
              <span className={cn(i === breadcrumb.length - 1 ? 'text-gray-500' : 'text-gray-400')}>
                {crumb}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Right: Utility icons */}
      <div className="flex items-center gap-1">
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer">
          <Search className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer">
          <Clock className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer">
          <Plus className="h-4 w-4" />
        </button>
        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-indigo-500 text-[8px] font-bold text-white" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f5f6fa' }}>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
