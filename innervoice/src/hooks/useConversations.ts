import { useCallback, useMemo, useState } from 'react'
import type { Conversation, Message } from '../types'

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
  const [conversations, setConversations] = useState<Conversation[]>(() => readStoredConversations())
  const [activeId, setActiveId] = useState<string | null>(null)

  const saveConversation = useCallback(
    (voiceId: string, messages: Message[]) => {
      if (!messages.length) return
      setConversations((prev) => {
        const now = Date.now()
        let next: Conversation[]
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
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
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
