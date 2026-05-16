import { isSupabaseConfigured } from '../../lib/supabase'
import { blobToBase64, invokeGateway } from '../../api/backendGateway'

/** Live-only STT — same Whisper path, skips slow fallback when possible. */
export async function transcribeLiveAudio(audioBlob: Blob): Promise<string> {
  if (audioBlob.size < 900) {
    throw new Error('Recording too short. Speak a little longer.')
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase backend is not configured.')
  }

  const data = await invokeGateway<{ text: string }>('transcribeAudio', {
    audioBase64: await blobToBase64(audioBlob),
    mimeType: audioBlob.type || 'audio/webm',
    whisperOnly: true,
  })
  return data.text?.trim() ?? ''
}
