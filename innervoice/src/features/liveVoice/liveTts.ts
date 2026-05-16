import { textToSpeech } from '../../api/elevenlabs'
import type { Emotion } from '../../types'

/**
 * Live-only TTS: fast streaming path first, full-quality path on failure.
 */
export async function fetchLiveSpeechBlob(
  text: string,
  voiceId: string,
  emotion: Emotion,
): Promise<Blob> {
  try {
    const fast = await textToSpeech(text, voiceId, emotion, { realtime: true })
    if (fast.size >= 200) return fast
  } catch {
    // fall through to stable path
  }

  const stable = await textToSpeech(text, voiceId, emotion, { realtime: false })
  if (stable.size < 200) {
    throw new Error('Voice service returned empty audio.')
  }
  return stable
}
