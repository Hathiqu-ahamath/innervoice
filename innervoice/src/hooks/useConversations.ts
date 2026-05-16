import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Conversation, Message } from '../types'
import { useAuth } from '../AuthContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const STORAGE_KEY = 'innervoice-conversations'

function makeTitle(messages: Message[]) {
  const firstUser = messages.find((m) => m.role === 'user')?.text ?? 'New Conversation'
  return firstUser.length > 60 ? `${firstUser.slice(0, 57)}...` : firstUser
}

function readStoredConversations(): Conversation[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Conversation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useConversations() {
  const { isAuthenticated } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>(() => readStoredConversations())
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured || !supabase) return
    const client = supabase

    let cancelled = false

    const loadConversations = async () => {
      const { data: authData } = await client.auth.getUser()
      const authUser = authData.user
      if (!authUser) {
        if (!cancelled) setConversations([])
        return
      }

      const { data: conversationRows, error: conversationError } = await client
        .from('conversations')
        .select('id,title,voice_id,created_at,updated_at')
        .eq('user_id', authUser.id)
        .order('updated_at', { ascending: false })

      if (conversationError) {
        if (!cancelled) setConversations(readStoredConversations())
        return
      }

      const conversationIds = (conversationRows ?? []).map((row) => row.id)
      const messageMap = new Map<string, Message[]>()

      if (conversationIds.length > 0) {
        const { data: messageRows } = await client
          .from('messages')
          .select('id,conversation_id,role,text,audio_url,emotion,ts,created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: true })

        for (const row of messageRows ?? []) {
          const list = messageMap.get(row.conversation_id) ?? []
          list.push({
            id: row.id,
            role: row.role as 'user' | 'assistant',
            text: row.text,
            audioUrl: row.audio_url ?? undefined,
            emotion: row.emotion ?? undefined,
            timestamp: row.ts ?? Date.parse(row.created_at),
          })
          messageMap.set(row.conversation_id, list)
        }
      }

      const next = (conversationRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        voiceId: row.voice_id,
        createdAt: Date.parse(row.created_at),
        updatedAt: Date.parse(row.updated_at),
        messages: messageMap.get(row.id) ?? [],
      }))

      if (!cancelled) {
        setConversations(next)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
    }

    void loadConversations()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const saveConversation = useCallback(
    (voiceId: string, messages: Message[]) => {
      if (!messages.length) return
      setConversations((prev) => {
        const now = Date.now()
        let next: Conversation[]
        let targetConversationId = activeId
        if (activeId) {
          next = prev.map((item) =>
            item.id === activeId ? { ...item, messages, updatedAt: now, title: makeTitle(messages) } : item,
          )
        } else {
          const created: Conversation = {
            id: crypto.randomUUID(),
            title: makeTitle(messages),
            voiceId,
            messages,
            createdAt: now,
            updatedAt: now,
          }
          next = [created, ...prev]
          setActiveId(created.id)
          targetConversationId = created.id
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))

        if (isSupabaseConfigured && supabase) {
          const client = supabase
          const conversationIdForSave = targetConversationId
          void (async () => {
            if (!conversationIdForSave) return
            const { data: authData } = await client.auth.getUser()
            const authUser = authData.user
            if (!authUser) return

            const { error: conversationError } = await client.from('conversations').upsert(
              {
                id: conversationIdForSave,
                user_id: authUser.id,
                title: makeTitle(messages),
                voice_id: voiceId,
                created_at: new Date(
                  next.find((item) => item.id === conversationIdForSave)?.createdAt ?? now,
                ).toISOString(),
                updated_at: new Date(now).toISOString(),
              },
              { onConflict: 'id' },
            )

            if (conversationError) return

            const rows = messages.map((message) => ({
              id: message.id,
              conversation_id: conversationIdForSave,
              role: message.role,
              text: message.text,
              audio_url: message.audioUrl ?? null,
              emotion: message.emotion ?? null,
              ts: message.timestamp,
              created_at: new Date(message.timestamp).toISOString(),
            }))
            if (rows.length > 0) {
              await client.from('messages').upsert(rows, { onConflict: 'id' })
            }
          })()
        }

        return next
      })
    },
    [activeId],
  )

  const loadConversation = useCallback(
    (id: string) => conversations.find((item) => item.id === id) ?? null,
    [conversations],
  )

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((item) => item.id !== id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
      setActiveId((prev) => (prev === id ? null : prev))

      if (isSupabaseConfigured && supabase) {
        const client = supabase
        void client.from('conversations').delete().eq('id', id)
      }
    },
    [],
  )

  const clearConversations = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setConversations([])
    setActiveId(null)
  }, [])

  return useMemo(
    () => ({
      conversations,
      activeId,
      setActiveId,
      saveConversation,
      loadConversation,
      deleteConversation,
      clearConversations,
    }),
    [activeId, clearConversations, conversations, deleteConversation, loadConversation, saveConversation],
  )
}
