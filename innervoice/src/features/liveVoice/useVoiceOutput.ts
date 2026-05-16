import { useCallback, useRef, useState } from 'react'
import { stripAudioTags, textToSpeech } from '../../api/elevenlabs'
import type { Emotion } from '../../types'

interface SpeakInput {
  text: string
  emotion: Emotion
  voiceId: string | null
}

export function useVoiceOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (utteranceRef.current) {
      window.speechSynthesis.cancel()
      utteranceRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const speak = useCallback(
    async ({ text, emotion, voiceId }: SpeakInput) => {
      stopSpeaking()
      setIsSpeaking(true)

      if (voiceId) {
        const audioBlob = await textToSpeech(text, voiceId, emotion)
        await new Promise<void>((resolve) => {
          const audio = new Audio(URL.createObjectURL(audioBlob))
          audioRef.current = audio
          audio.onended = () => {
            URL.revokeObjectURL(audio.src)
            audioRef.current = null
            setIsSpeaking(false)
            resolve()
          }
          audio.onerror = () => {
            audioRef.current = null
            setIsSpeaking(false)
            resolve()
          }
          void audio.play().catch(() => {
            audioRef.current = null
            setIsSpeaking(false)
            resolve()
          })
        })
        return
      }

      const fallback = stripAudioTags(text)
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(fallback)
        utteranceRef.current = utterance
        utterance.rate = 0.96
        utterance.pitch = 1
        utterance.onend = () => {
          utteranceRef.current = null
          setIsSpeaking(false)
          resolve()
        }
        utterance.onerror = () => {
          utteranceRef.current = null
          setIsSpeaking(false)
          resolve()
        }
        window.speechSynthesis.speak(utterance)
      })
    },
    [stopSpeaking],
  )

  return {
    isSpeaking,
    speak,
    stopSpeaking,
  }
}
