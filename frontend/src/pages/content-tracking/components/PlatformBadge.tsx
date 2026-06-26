import { Video, Music2, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrackedPlatform } from '../types'

const CONFIG: Record<TrackedPlatform, { label: string; icon: typeof Video; cls: string }> = {
  youtube: { label: 'YouTube', icon: Video, cls: 'bg-red-50 text-red-700 border-red-200' },
  tiktok: { label: 'TikTok', icon: Music2, cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  facebook: { label: 'Facebook', icon: Globe, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export function PlatformBadge({ platform, size = 'sm' }: { platform: TrackedPlatform; size?: 'sm' | 'md' }) {
  const { label, icon: Icon, cls } = CONFIG[platform]
  const sizeCls = size === 'md' ? 'px-2.5 py-1 text-sm gap-2' : 'px-2 py-0.5 text-xs gap-1.5'
  const iconCls = size === 'md' ? 'h-4 w-4' : 'h-3 w-3'
  return (
    <span className={cn('inline-flex items-center rounded-md border font-medium', sizeCls, cls)}>
      <Icon className={iconCls} />
      {label}
    </span>
  )
}
