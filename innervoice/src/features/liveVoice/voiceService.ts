import { detectEmotion, getLiveFutureSelfResponse } from '../../api/openai'
import { stripAudioTags } from '../../api/elevenlabs'
import type { Emotion, Message } from '../../types'
import {
  isRealtimeBrainAvailable,
  isRealtimeBrainConfigured,
  sendToRealtimeBrain,
} from './realtimeBrain'

function createMessage(role: Message['role'], text: string, emotion?: Emotion): Message {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    timestamp: Date.now(),
    emotion,
  }
}

export function createUserMessage(text: string): Message {
  const trimmed = text.trim()
  return createMessage('user', trimmed, detectEmotion(trimmed))
}

async function generateLiveReply(history: Message[]): Promise<string> {
  // Try OpenAI Realtime API first (gpt-realtime). This is the "brain" the
  // user asked for: streaming, low-latency, properly intimate. If it fails
  // even once, isRealtimeBrainAvailable() goes false for the rest of the
  // session and we go straight to chat completions — no more 7s waits per
  // turn.
  if (isRealtimeBrainConfigured() && isRealtimeBrainAvailable()) {
    try {
      const text = await sendToRealtimeBrain(history)
      if (text && text.trim()) return text
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[live-voice] realtime brain failed, falling back to chat completions:',
        err instanceof Error ? err.message : err,
      )
    }
  }
  // Fallback: same intimate "future self" prompt via chat completions.
  // This path uses gpt-4o on the same key, so as long as the regular chat
  // page works, this works.
  return getLiveFutureSelfResponse(history)
}

export async function createAssistantMessage(history: Message[]): Promise<{ raw: Message; display: Message }> {
  const rawText = await generateLiveReply(history)
  const raw = createMessage('assistant', rawText)
  const display = createMessage('assistant', stripAudioTags(rawText))
  return { raw, display }
}
