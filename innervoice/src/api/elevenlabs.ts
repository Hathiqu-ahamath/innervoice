const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

function requireKey() {
  if (!ELEVENLABS_KEY) {
    throw new Error('ElevenLabs API key missing. Add VITE_ELEVENLABS_API_KEY to .env.')
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

export async function textToSpeech(text: string, voiceId: string): Promise<Blob> {
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
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Unable to synthesize speech with ElevenLabs.')
  }
  return response.blob()
}
