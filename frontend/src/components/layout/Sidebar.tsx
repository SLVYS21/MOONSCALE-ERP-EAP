import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CreditCard,
  BookOpen,
  CheckSquare,
  DollarSign,
  Zap,
  FileText,
  Settings,
  MessageSquare,
  Bell,
  RefreshCw,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { getInitials } from '@/lib/utils'

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
    ],
  },
  {
    label: 'Étudiants & Revenus',
    items: [
      { to: '/students', icon: GraduationCap, label: 'Étudiants' },
      { to: '/payments', icon: CreditCard, label: 'Paiements' },
      { to: '/reminders', icon: Bell, label: 'Rappels' },
      { to: '/finances', icon: DollarSign, label: 'Finances' },
    ],
  },
  {
    label: 'Outils',
    items: [
      { to: '/automations', icon: Zap, label: 'Automatisations' },
      { to: '/forms', icon: FileText, label: 'Formulaires' },
      { to: '/wiki', icon: BookOpen, label: 'Wiki' },
    ],
  },
  {
    label: 'Collaboration',
    items: [
      { to: '/tasks', icon: CheckSquare, label: 'Tâches' },
      { to: '/messages', icon: MessageSquare, label: 'Messages' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/team', icon: Users, label: 'Équipe' },
      { to: '/sync', icon: RefreshCw, label: 'Synchronisation' },
    ],
  },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-600/15 dark:text-indigo-400'
      : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-100',
  )

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-800 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          M
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100">Moonscale</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500">ERP</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={linkCls}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-gray-800 p-3 space-y-0.5">
        <NavLink to="/settings" className={linkCls}>
          <Settings className="h-4 w-4 shrink-0" />
          Paramètres
        </NavLink>

        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-800/50 hover:text-gray-100"
        >
          {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {isDark ? 'Mode clair' : 'Mode sombre'}
        </button>

        {user && (
          <div className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-semibold text-indigo-400">
              {getInitials(user.firstName, user.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-100">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-[10px] capitalize text-gray-500">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="shrink-0 text-gray-500 transition-colors hover:text-gray-300"
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
