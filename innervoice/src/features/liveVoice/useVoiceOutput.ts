import { useCallback, useRef, useState } from 'react'
import { stripAudioTags, textToSpeech } from '../../api/elevenlabs'
import type { Emotion } from '../../types'

interface SpeakInput {
  text: string
  emotion: Emotion
  voiceId: string | null
  realtime?: boolean
}

async function fetchVoiceBlob(
  text: string,
  voiceId: string,
  emotion: Emotion,
  realtime: boolean,
): Promise<Blob> {
  try {
    const blob = await textToSpeech(text, voiceId, emotion, { realtime })
    if (blob.size > 200) return blob
  } catch {
    // fall through to non-realtime retry
  }
  const blob = await textToSpeech(text, voiceId, emotion, { realtime: false })
  if (blob.size < 200) {
    throw new Error('Voice service returned empty audio. Check ElevenLabs in Supabase secrets.')
  }
  return blob
}

export function useVoiceOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [outputLevel, setOutputLevel] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const meterRafRef = useRef<number | null>(null)
  const meterCtxRef = useRef<AudioContext | null>(null)
  const meterSourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const stopMeters = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current)
      meterRafRef.current = null
    }
    if (meterSourceRef.current) {
      try {
        meterSourceRef.current.disconnect()
      } catch {
        // noop
      }
      meterSourceRef.current = null
    }
    if (meterCtxRef.current) {
      void meterCtxRef.current.close().catch(() => {})
      meterCtxRef.current = null
    }
    setOutputLevel(0)
  }, [])

  const attachMeter = useCallback((audio: HTMLAudioElement) => {
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      void ctx.resume().catch(() => {})
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      const source = ctx.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(ctx.destination)
      meterCtxRef.current = ctx
      meterSourceRef.current = source
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!meterCtxRef.current) return
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) {
          const n = (data[i] - 128) / 128
          sum += n * n
        }
        setOutputLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
        meterRafRef.current = requestAnimationFrame(tick)
      }
      meterRafRef.current = requestAnimationFrame(tick)
    } catch {
      setOutputLevel(0.4)
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    if (audioRef.current?.src.startsWith('blob:')) {
      URL.revokeObjectURL(audioRef.current.src)
    }
    audioRef.current = null
    if (utteranceRef.current) {
      window.speechSynthesis.cancel()
      utteranceRef.current = null
    }
    stopMeters()
    setIsSpeaking(false)
  }, [stopMeters])

  const playBlob = useCallback(
    async (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          stopMeters()
          setIsSpeaking(false)
          resolve()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          stopMeters()
          setIsSpeaking(false)
          reject(new Error('Audio playback failed in the browser.'))
        }
        void audio
          .play()
          .then(() => {
            attachMeter(audio)
          })
          .catch((err) => {
            URL.revokeObjectURL(url)
            audioRef.current = null
            stopMeters()
            setIsSpeaking(false)
            reject(err instanceof Error ? err : new Error('Could not play voice audio.'))
          })
      })
    },
    [attachMeter, stopMeters],
  )

  const speak = useCallback(
    async ({ text, emotion, voiceId, realtime = false }: SpeakInput) => {
      stopSpeaking()
      setIsSpeaking(true)

      if (voiceId) {
        const blob = await fetchVoiceBlob(text, voiceId, emotion, realtime)
        await playBlob(blob)
        return
      }

      const fallback = stripAudioTags(text)
      if (!fallback.trim()) {
        setIsSpeaking(false)
        throw new Error('Nothing to speak.')
      }

      await new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(fallback)
        utteranceRef.current = utterance
        utterance.rate = 0.96
        utterance.onend = () => {
          utteranceRef.current = null
          setIsSpeaking(false)
          resolve()
        }
        utterance.onerror = () => {
          utteranceRef.current = null
          setIsSpeaking(false)
          reject(new Error('Browser speech failed.'))
        }
        window.speechSynthesis.speak(utterance)
      })
    },
    [playBlob, stopSpeaking],
  )

  return {
    isSpeaking,
    outputLevel,
    speak,
    stopSpeaking,
  }
}
