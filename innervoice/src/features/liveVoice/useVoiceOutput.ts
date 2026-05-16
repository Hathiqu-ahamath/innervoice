import { useCallback, useRef, useState } from 'react'
import { stripAudioTags, textToSpeech } from '../../api/elevenlabs'
import type { Emotion } from '../../types'

interface SpeakInput {
  text: string
  emotion: Emotion
  voiceId: string | null
  realtime?: boolean
}

export function useVoiceOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [outputLevel, setOutputLevel] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const meterRafRef = useRef<number | null>(null)
  const synthMeterRef = useRef<number | null>(null)

  const stopMeters = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current)
      meterRafRef.current = null
    }
    if (synthMeterRef.current !== null) {
      window.clearInterval(synthMeterRef.current)
      synthMeterRef.current = null
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect()
      } catch {
        // noop
      }
      sourceRef.current = null
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect()
      } catch {
        // noop
      }
      analyserRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setOutputLevel(0)
  }, [])

  const startAudioElementMeter = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    stopMeters()
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 128
    const source = context.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(context.destination)

    audioContextRef.current = context
    analyserRef.current = analyser
    sourceRef.current = source

    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!analyserRef.current) return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i += 1) {
        const n = (data[i] - 128) / 128
        sum += n * n
      }
      const rms = Math.sqrt(sum / data.length)
      setOutputLevel(Math.min(1, rms * 4))
      meterRafRef.current = requestAnimationFrame(tick)
    }
    meterRafRef.current = requestAnimationFrame(tick)
  }, [stopMeters])

  const startSyntheticMeter = useCallback(() => {
    stopMeters()
    let phase = 0
    synthMeterRef.current = window.setInterval(() => {
      phase += 0.28
      const wave = (Math.sin(phase) + 1) / 2
      setOutputLevel(0.25 + wave * 0.55)
    }, 70)
  }, [stopMeters])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (utteranceRef.current) {
      window.speechSynthesis.cancel()
      utteranceRef.current = null
    }
    stopMeters()
    setIsSpeaking(false)
  }, [stopMeters])

  const speak = useCallback(
    async ({ text, emotion, voiceId, realtime = false }: SpeakInput) => {
      stopSpeaking()
      setIsSpeaking(true)

      if (voiceId) {
        const audioBlob = await textToSpeech(text, voiceId, emotion, { realtime })
        await new Promise<void>((resolve) => {
          const audio = new Audio(URL.createObjectURL(audioBlob))
          audioRef.current = audio
          startAudioElementMeter()
          audio.onended = () => {
            URL.revokeObjectURL(audio.src)
            audioRef.current = null
            stopMeters()
            setIsSpeaking(false)
            resolve()
          }
          audio.onerror = () => {
            audioRef.current = null
            stopMeters()
            setIsSpeaking(false)
            resolve()
          }
          void audio.play().catch(() => {
            audioRef.current = null
            stopMeters()
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
        startSyntheticMeter()
        utterance.rate = 0.96
        utterance.pitch = 1
        utterance.onend = () => {
          utteranceRef.current = null
          stopMeters()
          setIsSpeaking(false)
          resolve()
        }
        utterance.onerror = () => {
          utteranceRef.current = null
          stopMeters()
          setIsSpeaking(false)
          resolve()
        }
        window.speechSynthesis.speak(utterance)
      })
    },
    [startAudioElementMeter, startSyntheticMeter, stopMeters, stopSpeaking],
  )

  return {
    isSpeaking,
    outputLevel,
    speak,
    stopSpeaking,
  }
}
