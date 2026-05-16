import { useCallback, useMemo, useRef, useState } from 'react'
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
  const historyRef = useRef<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const processUserTurn = useCallback(async (text: string): Promise<LiveAssistantTurn | null> => {
    const trimmed = text.trim()
    if (!trimmed) return null
    setIsProcessing(true)
    setLastError(null)
    try {
      const userMessage = createUserMessage(trimmed)
      const baseHistory = [...historyRef.current, userMessage]
      const liveContext = baseHistory.slice(-6)
      const assistant = await createAssistantMessage(liveContext)
      const nextHistory = [...baseHistory, assistant.raw]
      historyRef.current = nextHistory
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
  }, [])

  const resetConversation = useCallback(() => {
    historyRef.current = []
    setConversationHistory([])
    setLastError(null)
    setIsProcessing(false)
  }, [])

  const state: LiveConversationState = useMemo(
    () => ({ isProcessing, lastError, conversationHistory }),
    [conversationHistory, isProcessing, lastError],
  )

  return { state, processUserTurn, resetConversation }
}
