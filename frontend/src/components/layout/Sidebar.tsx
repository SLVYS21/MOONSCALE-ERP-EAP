import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  TrendingUp, FolderKanban, Users, Wallet, LayoutGrid,
  LayoutDashboard, Crosshair, BarChart2, Gift, Star, Link2,
  CheckSquare, BookOpen, MessageSquare, Settings, Zap, Sparkles,
  RefreshCw, CreditCard, ChevronDown, LogOut,
  Calendar, GraduationCap, Video, Lightbulb, Stars, Users2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { getInitials } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  end?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

interface ModuleDef {
  id: string
  label: string
  sublabel: string
  Icon: React.ElementType
  iconColor: string
  iconBg: string
  textColor: string
  activeBg: string
  borderColor: string
  paths: string[]
  defaultPath: string
  sections: NavSection[]
}

// ── Module definitions ────────────────────────────────────────────────────────

const MODULES: ModuleDef[] = [
  {
    id: 'sales',
    label: 'Sales',
    sublabel: 'Leads, Deals & Offres',
    Icon: TrendingUp,
    iconColor: '#22c55e',
    iconBg: '#dcfce7',
    textColor: '#16a34a',
    activeBg: '#f0fdf4',
    borderColor: '#22c55e',
    paths: ['/leads', '/analytics', '/students', '/payments'],
    defaultPath: '/leads',
    sections: [
      {
        label: 'PIPELINE',
        items: [
          { to: '/leads', icon: LayoutDashboard, label: 'Dashboard', end: true },
          { to: '/leads', icon: Crosshair, label: 'Leads' },
          { to: '/analytics', icon: BarChart2, label: 'Analytics' },
        ],
      },
      {
        label: 'OFFRES',
        items: [
          { to: '/leads/offers', icon: Gift, label: 'Offres' },
          { to: '/leads/scoring', icon: Star, label: 'Scoring' },
        ],
      },
      {
        label: 'TRACKING',
        items: [
          { to: '/leads/tracking', icon: Link2, label: 'Liens de suivi' },
        ],
      },
      {
        label: 'ÉTUDIANTS',
        items: [
          { to: '/students', icon: GraduationCap, label: 'Étudiants' },
          { to: '/payments', icon: CreditCard, label: 'Paiements' },
          { to: '/payments/offers', icon: Gift, label: 'Abonnements' },
        ],
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    sublabel: 'Tâches & Timesheets',
    Icon: FolderKanban,
    iconColor: '#8b5cf6',
    iconBg: '#ede9fe',
    textColor: '#7c3aed',
    activeBg: '#f5f3ff',
    borderColor: '#8b5cf6',
    paths: ['/tasks', '/wiki'],
    defaultPath: '/tasks',
    sections: [
      {
        label: 'WORK',
        items: [
          { to: '/tasks', icon: LayoutDashboard, label: 'Dashboard', end: true },
          { to: '/tasks', icon: CheckSquare, label: 'Tâches & Projets' },
        ],
      },
      {
        label: 'RESOURCES',
        items: [
          { to: '/wiki', icon: BookOpen, label: 'Base de connaissance' },
        ],
      },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    sublabel: 'Équipe & Administration',
    Icon: Users,
    iconColor: '#ef4444',
    iconBg: '#fee2e2',
    textColor: '#dc2626',
    activeBg: '#fef2f2',
    borderColor: '#ef4444',
    paths: ['/team'],
    defaultPath: '/team',
    sections: [
      {
        label: 'ÉQUIPE',
        items: [
          { to: '/team', icon: LayoutDashboard, label: 'Dashboard', end: true },
          { to: '/team', icon: Users, label: 'Membres' },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    sublabel: 'Revenus & Dépenses',
    Icon: Wallet,
    iconColor: '#f97316',
    iconBg: '#ffedd5',
    textColor: '#ea580c',
    activeBg: '#fff7ed',
    borderColor: '#f97316',
    paths: ['/finances'],
    defaultPath: '/finances',
    sections: [
      {
        label: 'REVENUS',
        items: [
          { to: '/finances', icon: LayoutDashboard, label: 'Dashboard' },
        ],
      },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    sublabel: 'Outils & Automatisations',
    Icon: LayoutGrid,
    iconColor: '#3b82f6',
    iconBg: '#dbeafe',
    textColor: '#2563eb',
    activeBg: '#eff6ff',
    borderColor: '#3b82f6',
    paths: ['/automations', '/forms', '/content', '/sync', '/messages', '/settings'],
    defaultPath: '/automations',
    sections: [
      {
        label: 'AUTOMATISATION',
        items: [
          { to: '/automations', icon: Zap, label: 'Automatisations' },
          { to: '/forms', icon: Gift, label: 'Formulaires' },
        ],
      },
      {
        label: 'CONTENU',
        items: [
          { to: '/content', icon: Sparkles, label: 'Dashboard', end: true },
          { to: '/content/projects', icon: Video, label: 'Projets' },
          { to: '/content/ideas', icon: Lightbulb, label: 'Idées' },
          { to: '/content/suggestions', icon: Stars, label: 'Suggestions IA' },
          { to: '/content/creators', icon: Users2, label: 'Créateurs' },
        ],
      },
      {
        label: 'OUTILS',
        items: [
          { to: '/messages', icon: MessageSquare, label: 'Messages' },
          { to: '/sync', icon: RefreshCw, label: 'Synchronisation' },
        ],
      },
      {
        label: 'ADMIN',
        items: [
          { to: '/settings', icon: Settings, label: 'Paramètres' },
        ],
      },
    ],
  },
]

const QUICK_ACCESS: NavItem[] = [
  { to: '/tasks', icon: Calendar, label: 'Calendrier' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/wiki', icon: BookOpen, label: 'Notice Board' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function useActiveModule(pathname: string): ModuleDef | null {
  return MODULES.find((m) => m.paths.some((p) => pathname === p || pathname.startsWith(p + '/'))) ?? null
}

// ── Sub-navigation item ───────────────────────────────────────────────────────

function SubNavItem({ item, mod }: { item: NavItem; mod: ModuleDef }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-r-md py-2 pl-3 pr-3 text-sm font-medium transition-all duration-150 cursor-pointer border-l-[3px]',
          isActive
            ? 'border-l-[3px] font-semibold'
            : 'border-l-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800',
        )
      }
      style={({ isActive }) =>
        isActive
          ? {
              borderLeftColor: mod.borderColor,
              backgroundColor: mod.activeBg,
              color: mod.textColor,
            }
          : {}
      }
    >
      <item.icon className="h-3.5 w-3.5 shrink-0" />
      {item.label}
    </NavLink>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const activeModule = useActiveModule(location.pathname)
  const isHome = !activeModule

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-gray-200 bg-white">

      {/* ── Logo ────────────────────────────────────────────────────── */}
      <div
        className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 px-4 cursor-pointer"
        onClick={() => navigate('/dashboard')}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
          <LayoutGrid className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight">Moonscale</p>
          <p className="text-[10px] font-medium text-gray-400 capitalize">{user?.role ?? 'Admin'}</p>
        </div>
      </div>

      {/* ── Navigation body ─────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3">

        {isHome ? (
          /* ─── HOME MODE: module list ─────────────────────────────── */
          <>
            <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Modules
            </p>

            <div className="space-y-0.5 px-2">
              {MODULES.map((mod) => (
                <button
                  key={mod.id}
                  onClick={() => navigate(mod.defaultPath)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-gray-50 cursor-pointer"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: mod.iconBg }}
                  >
                    <mod.Icon className="h-4.5 w-4.5" style={{ color: mod.iconColor }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{mod.label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight truncate">{mod.sublabel}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Accès rapide
            </div>
            <div className="space-y-0.5 px-2">
              {QUICK_ACCESS.map((item) => (
                <NavLink
                  key={item.to + item.label}
                  to={item.to}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 cursor-pointer"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-gray-400" />
                  {item.label}
                </NavLink>
              ))}
            </div>

            <button
              onClick={() => {}}
              className="mt-1 flex w-full items-center gap-2 px-5 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span>= Voir tout le menu</span>
            </button>
          </>
        ) : (
          /* ─── MODULE MODE: contextual sub-nav ───────────────────── */
          <>
            {/* Module selector */}
            <div className="mb-3 px-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-colors hover:bg-gray-100 cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: activeModule.iconBg }}
                  >
                    <activeModule.Icon className="h-3.5 w-3.5" style={{ color: activeModule.iconColor }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 truncate">{activeModule.label}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              </button>
            </div>

            {/* Module header item */}
            <div className="mb-3 px-2">
              <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: activeModule.iconBg }}
                >
                  <activeModule.Icon className="h-4.5 w-4.5" style={{ color: activeModule.iconColor }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{activeModule.label}</p>
                  <p className="text-[10px] text-gray-400 leading-tight truncate">{activeModule.sublabel}</p>
                </div>
              </div>
            </div>

            {/* Sections */}
            {activeModule.sections.map((section) => (
              <div key={section.label} className="mb-4">
                <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <SubNavItem key={item.to + item.label} item={item} mod={activeModule} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </nav>

      {/* ── Footer: user info ────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-gray-200 p-3">
        {user && (
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: '#4f46e5' }}
            >
              {getInitials(user.firstName, user.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-800">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-[10px] capitalize text-gray-400">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 cursor-pointer"
              title="Se déconnecter"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
