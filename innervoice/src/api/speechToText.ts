const OPENAI_KEY =
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ||
  (import.meta.env.OPENAI_API_KEY as string | undefined)

const ELEVENLABS_KEY =
  (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined) ||
  (import.meta.env.ELEVENLABS_API_KEY as string | undefined)

async function transcribeWithOpenAI(audioBlob: Blob): Promise<string> {
  if (!OPENAI_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const formData = new FormData()
  formData.append('file', audioBlob, 'speech.webm')
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error('OpenAI transcription failed')
  }

  const data = (await response.json()) as { text?: string }
  return data.text?.trim() ?? ''
}

async function transcribeWithElevenLabs(audioBlob: Blob): Promise<string> {
  if (!ELEVENLABS_KEY) {
    throw new Error('ElevenLabs API key not configured')
  }

  const formData = new FormData()
  formData.append('file', audioBlob, 'speech.webm')
  formData.append('model_id', 'scribe_v1')

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error('ElevenLabs transcription failed')
  }

  const data = (await response.json()) as { text?: string }
  return data.text?.trim() ?? ''
}

/**
 * Transcribe recorded audio to text using OpenAI Whisper, with ElevenLabs STT fallback.
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (audioBlob.size < 1000) {
    throw new Error('Recording too short. Hold the mic and speak for at least a second.')
  }

  if (OPENAI_KEY) {
    try {
      const text = await transcribeWithOpenAI(audioBlob)
      if (text) return text
    } catch {
      // fall through to ElevenLabs
    }
  }

  if (ELEVENLABS_KEY) {
    const text = await transcribeWithElevenLabs(audioBlob)
    if (text) return text
  }

  throw new Error('No speech API key found. Add OPENAI_API_KEY or ELEVENLABS_API_KEY to .env.')
}
