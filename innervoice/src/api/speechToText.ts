import { isSupabaseConfigured } from '../lib/supabase'
import { blobToBase64, invokeGateway } from './backendGateway'

/**
 * Transcribe recorded audio to text using OpenAI Whisper, with ElevenLabs STT fallback.
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (audioBlob.size < 1000) {
    throw new Error('Recording too short. Hold the mic and speak for at least a second.')
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase backend is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }

  const data = await invokeGateway<{ text: string }>('transcribeAudio', {
    audioBase64: await blobToBase64(audioBlob),
    mimeType: audioBlob.type || 'audio/webm',
  })
  return data.text?.trim() ?? ''
}
