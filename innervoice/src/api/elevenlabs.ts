import type { Emotion } from '../types'
import { normalizeV3AudioTags } from '../lib/elevenV3Tags'

const ELEVENLABS_KEY =
  (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined) ||
  (import.meta.env.ELEVENLABS_API_KEY as string | undefined)
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'
const OUTPUT_FORMAT_DEFAULT = 'mp3_44100_128'
const OUTPUT_FORMAT_REALTIME = 'mp3_22050_32'

export type TtsBackend = 'dialogue_v3' | 'speech_v3' | 'speech_v2_fallback'

let lastTtsBackend: TtsBackend | null = null

export function getLastTtsBackend(): TtsBackend | null {
  return lastTtsBackend
}

function requireKey() {
  if (!ELEVENLABS_KEY) {
    throw new Error('ElevenLabs API key missing. Add VITE_ELEVENLABS_API_KEY or ELEVENLABS_API_KEY to .env.')
  }
}

function apiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'xi-api-key': ELEVENLABS_KEY!,
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
  const formData = new FormData()
  formData.append('name', name)
  formData.append('files', audioBlob, 'voice-sample.webm')

  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY!,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Unable to clone voice. Please verify your ElevenLabs API key and try again.')
  }

  const data = (await response.json()) as { voice_id?: string }
  if (!data.voice_id) {
    throw new Error('ElevenLabs response did not include a voice ID.')
  }
  return data.voice_id
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

async function readErrorSnippet(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    return JSON.stringify(body.detail ?? body).slice(0, 200)
  } catch {
    return response.statusText
  }
}

/** Primary path: text-to-dialogue with eleven_v3 (best for audio tags). */
async function synthesizeDialogue(
  text: string,
  voiceId: string,
  stability: number,
  outputFormat: string,
): Promise<Response> {
  return fetch(`${ELEVENLABS_BASE_URL}/text-to-dialogue?output_format=${outputFormat}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      inputs: [{ text, voice_id: voiceId }],
      model_id: 'eleven_v3',
      settings: { stability },
      apply_text_normalization: 'off',
    }),
  })
}

/** Fallback: classic TTS with eleven_v3. */
async function synthesizeSpeechV3(
  text: string,
  voiceId: string,
  stability: number,
  outputFormat: string,
  optimizeForRealtime: boolean,
): Promise<Response> {
  const latencyParam = optimizeForRealtime ? '&optimize_streaming_latency=3' : ''
  return fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}${latencyParam}`,
    {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      apply_text_normalization: 'off',
      voice_settings: {
        stability,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
        speed: 1,
      },
    }),
    },
  )
}

async function synthesizeSpeechV2(text: string, voiceId: string, outputFormat: string): Promise<Response> {
  return fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      text: stripAudioTags(text),
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.5,
        use_speaker_boost: true,
      },
    }),
  })
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

  const dialogue = await synthesizeDialogue(taggedText, voiceId, stability, outputFormat)
  if (dialogue.ok) {
    lastTtsBackend = 'dialogue_v3'
    return dialogue.blob()
  }

  if (import.meta.env.DEV) {
    console.warn('[InnerVoice] text-to-dialogue failed:', dialogue.status, await readErrorSnippet(dialogue))
  }

  const speechV3 = await synthesizeSpeechV3(taggedText, voiceId, stability, outputFormat, Boolean(options.realtime))
  if (speechV3.ok) {
    lastTtsBackend = 'speech_v3'
    return speechV3.blob()
  }

  if (import.meta.env.DEV) {
    console.warn('[InnerVoice] eleven_v3 TTS failed:', speechV3.status, await readErrorSnippet(speechV3))
  }

  const speechV2 = await synthesizeSpeechV2(taggedText, voiceId, outputFormat)
  if (!speechV2.ok) {
    const detail = await readErrorSnippet(speechV2)
    throw new Error(
      `Unable to synthesize speech. v3 may be unavailable on your plan. (${speechV2.status}: ${detail})`,
    )
  }

  lastTtsBackend = 'speech_v2_fallback'
  if (import.meta.env.DEV) {
    console.warn('[InnerVoice] Using eleven_multilingual_v2 — audio tags are stripped in this fallback.')
  }
  return speechV2.blob()
}
