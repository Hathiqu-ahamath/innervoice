import { useCallback, useMemo, useState } from 'react'
import type { Emotion, Message } from '../../types'
import { createAssistantMessage, createUserMessage } from './voiceService'

export interface LiveConversationState {
  isProcessing: boolean
  lastError: string | null
  conversationHistory: Message[]
}

export interface LiveAssistantTurn {
  spokenText: string
  displayText: string
  emotion: Emotion
}

export function useLiveConversation() {
  const [conversationHistory, setConversationHistory] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const processUserTurn = useCallback(
    async (text: string): Promise<LiveAssistantTurn | null> => {
      const trimmed = text.trim()
      if (!trimmed) return null
      setIsProcessing(true)
      setLastError(null)
      try {
        const userMessage = createUserMessage(trimmed)
        const baseHistory = [...conversationHistory, userMessage]
        // Keep a compact context window in live mode for faster response.
        const fastContext = baseHistory.slice(-8)
        const assistant = await createAssistantMessage(fastContext)
        const nextHistory = [...baseHistory, assistant.raw]
        setConversationHistory(nextHistory)
        return {
          spokenText: assistant.raw.text,
          displayText: assistant.display.text,
          emotion: userMessage.emotion ?? 'neutral',
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'Live voice failed to process your input.')
        return null
      } finally {
        setIsProcessing(false)
      }
    },
    [conversationHistory],
  )

  const resetConversation = useCallback(() => {
    setConversationHistory([])
    setLastError(null)
    setIsProcessing(false)
  }, [])

  const state: LiveConversationState = useMemo(
    () => ({
      isProcessing,
      lastError,
      conversationHistory,
    }),
    [conversationHistory, isProcessing, lastError],
  )

  return {
    state,
    processUserTurn,
    resetConversation,
  }
}
