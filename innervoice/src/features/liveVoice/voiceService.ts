import { detectEmotion, getLiveFutureSelfResponse } from '../../api/openai'
import { stripAudioTags } from '../../api/elevenlabs'
import type { Emotion, Message } from '../../types'
import { isRealtimeBrainConfigured, sendToRealtimeBrain } from './realtimeBrain'

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
  // user asked for: streaming, low-latency, properly intimate.
  if (isRealtimeBrainConfigured()) {
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
  return getLiveFutureSelfResponse(history)
}

export async function createAssistantMessage(history: Message[]): Promise<{ raw: Message; display: Message }> {
  const rawText = await generateLiveReply(history)
  const raw = createMessage('assistant', rawText)
  const display = createMessage('assistant', stripAudioTags(rawText))
  return { raw, display }
}
