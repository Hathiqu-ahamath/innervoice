import { detectEmotion, getLiveFutureSelfResponse } from '../../api/openai'
import { stripAudioTags } from '../../api/elevenlabs'
import type { Emotion, Message } from '../../types'

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

export async function createAssistantMessage(history: Message[]): Promise<{ raw: Message; display: Message }> {
  // Live mode uses a dedicated "future self" prompt + gpt-4o so the reply is
  // a complete spoken thought, not a chopped fragment.
  const rawText = await getLiveFutureSelfResponse(history)
  const raw = createMessage('assistant', rawText)
  const display = createMessage('assistant', stripAudioTags(rawText))
  return { raw, display }
}
