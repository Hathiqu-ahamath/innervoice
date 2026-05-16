import type { Emotion } from '../types'
import { normalizeV3AudioTags } from '../lib/elevenV3Tags'
import { isSupabaseConfigured } from '../lib/supabase'
import { base64ToBlob, blobToBase64, invokeGateway } from './backendGateway'

const OUTPUT_FORMAT_DEFAULT = 'mp3_44100_128'
const OUTPUT_FORMAT_REALTIME = 'mp3_22050_32'

export type TtsBackend = 'dialogue_v3' | 'speech_v3' | 'speech_v2_fallback'

let lastTtsBackend: TtsBackend | null = null

export function getLastTtsBackend(): TtsBackend | null {
  return lastTtsBackend
}

function requireKey() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase backend is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
}

/** Lower stability = more expressive (Creative). Higher = flatter (Robust). */
function getV3Stability(emotion: Emotion): number {
  switch (emotion) {
    case 'fearful':
      return 0.26
    case 'stressed':
      return 0.29
    case 'grieving':
      return 0.26
    case 'hurt':
      return 0.27
    case 'sad':
      return 0.28
    case 'anxious':
      return 0.3
    case 'angry':
      return 0.31
    case 'confused':
      return 0.33
    case 'ashamed':
      return 0.3
    case 'guilty':
      return 0.31
    case 'lonely':
      return 0.29
    case 'tired':
      return 0.36
    case 'excited':
      return 0.34
    case 'hopeful':
      return 0.38
    case 'grateful':
      return 0.35
    case 'neutral':
    default:
      return 0.32
  }
}

export async function cloneVoice(audioBlob: Blob, name = `InnerVoice-${Date.now()}`): Promise<string> {
  requireKey()
  const data = await invokeGateway<{ voiceId: string }>('cloneVoice', {
    name,
    audioBase64: await blobToBase64(audioBlob),
    mimeType: audioBlob.type || 'audio/webm',
  })
  if (!data.voiceId) {
    throw new Error('ElevenLabs response did not include a voice ID.')
  }
  return data.voiceId
}

/**
 * Strip ElevenLabs v3 audio tags from text shown in the chat UI.
 */
export function stripAudioTags(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

interface TextToSpeechOptions {
  realtime?: boolean
}

export async function textToSpeech(
  text: string,
  voiceId: string,
  emotion: Emotion = 'neutral',
  options: TextToSpeechOptions = {},
): Promise<Blob> {
  requireKey()

  const taggedText = normalizeV3AudioTags(text)
  if (!taggedText.trim()) {
    throw new Error('No speech text after preparing audio tags.')
  }

  const stability = getV3Stability(emotion)
  const outputFormat = options.realtime ? OUTPUT_FORMAT_REALTIME : OUTPUT_FORMAT_DEFAULT

  const data = await invokeGateway<{
    audioBase64: string
    mimeType: string
    backend: TtsBackend
  }>('textToSpeech', {
    text: taggedText,
    plainText: stripAudioTags(taggedText),
    voiceId,
    stability,
    outputFormat,
    realtime: Boolean(options.realtime),
    emotion,
  })

  lastTtsBackend = data.backend
  return base64ToBlob(data.audioBase64, data.mimeType || 'audio/mpeg')
}
