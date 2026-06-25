import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/authStore'

type SocketHandlers = {
  onNewMessage?: (e: { conversationId: string; message: any }) => void
  onConversationCreated?: (conv: any) => void
  onConversationUpdated?: (conv: any) => void
  onConversationLocked?: (e: { conversationId: string; lockedBy: string | null; lockedAt: string | null }) => void
  onConversationDeleted?: (e: { conversationId: string }) => void
  onSimulatorOutbound?: (e: { phone: string; message: any }) => void
}

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? ''

export function useWhatsAppSocket(handlers: SocketHandlers) {
  const ref = useRef<Socket | null>(null)
  const token = useAuthStore((s) => s.accessToken)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!token) return

    const socket = io(`${WS_URL}/ws/whatsapp`, {
      transports: ['websocket'],
      auth: { token },
      withCredentials: true,
    })
    ref.current = socket

    socket.on('message.new', (e) => handlersRef.current.onNewMessage?.(e))
    socket.on('conversation.created', (e) => handlersRef.current.onConversationCreated?.(e))
    socket.on('conversation.updated', (e) => handlersRef.current.onConversationUpdated?.(e))
    socket.on('conversation.locked', (e) => handlersRef.current.onConversationLocked?.(e))
    socket.on('conversation.deleted', (e) => handlersRef.current.onConversationDeleted?.(e))
    socket.on('simulator.outbound', (e) => handlersRef.current.onSimulatorOutbound?.(e))

    return () => {
      socket.disconnect()
      ref.current = null
    }
  }, [token])

  return ref
}
