import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { whatsapp } from '@/services/whatsapp'
import { useWhatsAppSocket } from './useWhatsAppSocket'
import { useAuthStore } from '@/store/authStore'

const TITLE_BASE = document.title || 'Moonscale ERP'

function setAppBadge(count: number) {
  const anyNav = navigator as any
  if (typeof anyNav.setAppBadge === 'function') {
    if (count > 0) anyNav.setAppBadge(count).catch(() => {})
    else anyNav.clearAppBadge?.().catch(() => {})
  }
}

function setTitleBadge(count: number) {
  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${TITLE_BASE}` : TITLE_BASE
}

function setFaviconBadge(count: number) {
  const link = (document.querySelector("link[rel*='icon']") as HTMLLinkElement | null)
  if (!link) return
  if (count === 0) {
    link.href = link.dataset.originalHref ?? link.href
    return
  }
  if (!link.dataset.originalHref) link.dataset.originalHref = link.href

  const canvas = document.createElement('canvas')
  canvas.width = 32; canvas.height = 32
  const ctx = canvas.getContext('2d')!
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 32, 32)
    ctx.fillStyle = '#10b981'
    ctx.beginPath()
    ctx.arc(24, 24, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.font = 'bold 10px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(count > 9 ? '9+' : String(count), 24, 24)
    link.href = canvas.toDataURL('image/png')
  }
  img.onerror = () => { /* leave as-is */ }
  img.src = link.dataset.originalHref!
}

function notify(title: string, body: string) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    new Notification(title, { body, tag: 'whatsapp', renotify: true } as any)
  } catch {
    /* ignore */
  }
}

export function useWhatsAppNotifications() {
  const token = useAuthStore((s) => s.accessToken)
  const askedOnce = useRef(false)

  useEffect(() => {
    if (askedOnce.current) return
    if ('Notification' in window && Notification.permission === 'default') {
      askedOnce.current = true
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const convsQ = useQuery({
    queryKey: ['wa.notifications.conversations'],
    queryFn: () => whatsapp.listConversations(),
    enabled: !!token,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  })

  const total = (convsQ.data ?? []).reduce((sum, c) => sum + (c.unreadCount || 0), 0)

  useEffect(() => {
    setTitleBadge(total)
    setAppBadge(total)
    setFaviconBadge(total)
  }, [total])

  useWhatsAppSocket({
    onNewMessage: ({ message }) => {
      if (message?.direction === 'in') {
        notify('Nouveau message WhatsApp', message.content?.slice(0, 120) ?? 'Nouveau message')
      }
      convsQ.refetch()
    },
    onConversationCreated: () => convsQ.refetch(),
    onConversationUpdated: () => convsQ.refetch(),
  })
}
