import { useCallback, useState } from 'react'

const STORAGE_KEY = 'innervoice-voiceId'

export function useVoiceId() {
  const [voiceId, setVoiceIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))

  const setVoiceId = useCallback((id: string | null) => {
    setVoiceIdState(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return { voiceId, setVoiceId }
}
