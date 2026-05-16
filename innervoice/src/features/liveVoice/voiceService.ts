import { detectEmotion } from '../../api/openai'
import { getStableLiveReply } from './liveBrain'
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
  const rawText = await getStableLiveReply(history)
  const raw = createMessage('assistant', rawText)
  const display = createMessage('assistant', stripAudioTags(rawText))
  return { raw, display }
}
