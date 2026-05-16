import type { Emotion } from '../types'

const ELEVENLABS_KEY =
  (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined) ||
  (import.meta.env.ELEVENLABS_API_KEY as string | undefined)
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

function requireKey() {
  if (!ELEVENLABS_KEY) {
    throw new Error('ElevenLabs API key missing. Add VITE_ELEVENLABS_API_KEY or ELEVENLABS_API_KEY to .env.')
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

function getVoiceSettings(emotion: Emotion) {
  // v3 settings — higher style values bring out emotion and audio tag interpretation.
  switch (emotion) {
    case 'sad':
      return { stability: 0.3, similarity_boost: 0.85, style: 0.85, use_speaker_boost: true, speed: 0.92 }
    case 'anxious':
      return { stability: 0.35, similarity_boost: 0.82, style: 0.85, use_speaker_boost: true, speed: 0.94 }
    case 'hopeful':
      return { stability: 0.5, similarity_boost: 0.85, style: 0.9, use_speaker_boost: true, speed: 1.0 }
    case 'grateful':
      return { stability: 0.45, similarity_boost: 0.85, style: 0.88, use_speaker_boost: true, speed: 0.98 }
    case 'neutral':
    default:
      return { stability: 0.4, similarity_boost: 0.82, style: 0.82, use_speaker_boost: true, speed: 0.96 }
  }
}

/**
 * Strip ElevenLabs v3 audio tags (e.g. [sighs], [deep breath]) from text intended for display.
 * Keeps the tags in the version sent to ElevenLabs so the v3 model can act on them.
 */
export function stripAudioTags(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function textToSpeech(text: string, voiceId: string, emotion: Emotion = 'neutral'): Promise<Blob> {
  requireKey()

  const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_KEY!,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: getVoiceSettings(emotion),
    }),
  })

  if (!response.ok) {
    // Fall back to multilingual_v2 if v3 access is gated for this account.
    const fallback = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_KEY!,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: getVoiceSettings(emotion),
      }),
    })
    if (!fallback.ok) {
      throw new Error('Unable to synthesize speech with ElevenLabs.')
    }
    return fallback.blob()
  }
  return response.blob()
}
