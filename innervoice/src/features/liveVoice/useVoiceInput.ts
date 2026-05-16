import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
  onSilentCapture?: () => void
}

const SILENCE_AFTER_SPEECH_MS = 300
const MAX_RECORDING_MS = 12000
const SPEECH_RMS_THRESHOLD = 0.012

function nowMs() {
  return Date.now()
}

export function useVoiceInput({
  onFinalTranscript,
  onSpeechStart,
  onActivity,
  onError,
  onSilentCapture,
}: UseVoiceInputOptions) {
  const [isSupported] = useState(
    Boolean(navigator.mediaDevices && typeof MediaRecorder !== 'undefined'),
  )
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [inputLevel, setInputLevel] = useState(0)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const runningRef = useRef(false)
  const stoppingRef = useRef(false)
  const transcribingRef = useRef(false)
  const cycleIdRef = useRef(0)
  const silenceTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const meterContextRef = useRef<AudioContext | null>(null)
  const meterRafRef = useRef<number | null>(null)
  const lastSpeechAtRef = useRef(0)
  const speechStartedRef = useRef(false)

  const onFinalTranscriptRef = useRef(onFinalTranscript)
  const onSpeechStartRef = useRef(onSpeechStart)
  const onActivityRef = useRef(onActivity)
  const onErrorRef = useRef(onError)
  const onSilentCaptureRef = useRef(onSilentCapture)

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript
  }, [onFinalTranscript])
  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart
  }, [onSpeechStart])
  useEffect(() => {
    onActivityRef.current = onActivity
  }, [onActivity])
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])
  useEffect(() => {
    onSilentCaptureRef.current = onSilentCapture
  }, [onSilentCapture])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const stopMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current)
      meterRafRef.current = null
    }
    if (meterContextRef.current) {
      void meterContextRef.current.close().catch(() => {})
      meterContextRef.current = null
    }
    setInputLevel(0)
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    stopMeter()
  }, [stopMeter])

  const stopCurrentRecording = useCallback(() => {
    const recorder = mediaRef.current
    if (!recorder || recorder.state === 'inactive' || stoppingRef.current) return
    stoppingRef.current = true
    try {
      if (recorder.state === 'recording') recorder.requestData()
      recorder.stop()
    } catch {
      stoppingRef.current = false
    }
  }, [])

  const stopListening = useCallback(() => {
    runningRef.current = false
    cycleIdRef.current += 1
    clearTimers()
    stopCurrentRecording()
    mediaRef.current = null
    stopStream()
    transcribingRef.current = false
    speechStartedRef.current = false
    setIsListening(false)
    setTranscript('')
  }, [clearTimers, stopCurrentRecording, stopStream])

  const startMeter = useCallback(
    async (stream: MediaStream, cycleId: number) => {
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const context = new Ctx()
        if (context.state === 'suspended') {
          try {
            await context.resume()
          } catch {
            // ignore; meter is non-critical
          }
        }
        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        context.createMediaStreamSource(stream).connect(analyser)
        meterContextRef.current = context
        const data = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          if (!runningRef.current || cycleId !== cycleIdRef.current) return
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i += 1) {
            const n = (data[i] - 128) / 128
            sum += n * n
          }
          const rms = Math.sqrt(sum / data.length)
          setInputLevel(Math.min(1, rms * 5))
          if (rms > SPEECH_RMS_THRESHOLD) {
            lastSpeechAtRef.current = nowMs()
            onActivityRef.current?.()
            if (!speechStartedRef.current) {
              speechStartedRef.current = true
              onSpeechStartRef.current?.()
            }
          }
          meterRafRef.current = requestAnimationFrame(tick)
        }
        meterRafRef.current = requestAnimationFrame(tick)
      } catch {
        setInputLevel(0)
      }
    },
    [],
  )

  const startListening = useCallback(async () => {
    if (runningRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onErrorRef.current?.('Live voice is not supported in this browser.')
      return
    }

    runningRef.current = true
    const startCycle = async () => {
      if (!runningRef.current) return
      const cycleId = ++cycleIdRef.current
      clearTimers()
      stopStream()
      chunksRef.current = []
      stoppingRef.current = false
      transcribingRef.current = false
      speechStartedRef.current = false
      lastSpeechAtRef.current = 0

      try {
        // Intentionally match the chat page's proven recorder path.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!runningRef.current || cycleId !== cycleIdRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const recorder = new MediaRecorder(stream)
        mediaRef.current = recorder

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data)
        }

        recorder.onstop = async () => {
          clearTimers()
          stopStream()
          mediaRef.current = null
          stoppingRef.current = false

          if (!runningRef.current || cycleId !== cycleIdRef.current) return

          const hadSpeech = speechStartedRef.current
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          chunksRef.current = []

          if (!hadSpeech || blob.size === 0) {
            onSilentCaptureRef.current?.()
            window.setTimeout(() => { void startCycle() }, 80)
            return
          }

          transcribingRef.current = true
          setIsListening(false)
          try {
            const text = await transcribeAudio(blob)
            const trimmed = text.trim()
            if (trimmed) {
              setTranscript(trimmed)
              await Promise.resolve(onFinalTranscriptRef.current(trimmed))
              setTranscript('')
            } else {
              onSilentCaptureRef.current?.()
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Live transcription failed.'
            if (!/too short|no speech detected|recording too short/i.test(message)) {
              onErrorRef.current?.(message)
            } else {
              onSilentCaptureRef.current?.()
            }
          } finally {
            transcribingRef.current = false
            if (runningRef.current && cycleId === cycleIdRef.current) {
              window.setTimeout(() => { void startCycle() }, 80)
            }
          }
        }

        recorder.start()
        setIsListening(true)
        lastSpeechAtRef.current = 0
        void startMeter(stream, cycleId)

        silenceTimerRef.current = window.setInterval(() => {
          if (!runningRef.current || cycleId !== cycleIdRef.current || transcribingRef.current) return
          if (!speechStartedRef.current) return
          const silentFor = nowMs() - lastSpeechAtRef.current
          if (silentFor >= SILENCE_AFTER_SPEECH_MS) {
            stopCurrentRecording()
          }
        }, 80)

        maxTimerRef.current = window.setTimeout(() => {
          stopCurrentRecording()
        }, MAX_RECORDING_MS)
      } catch {
        runningRef.current = false
        setIsListening(false)
        stopStream()
        onErrorRef.current?.('Microphone blocked. Allow mic access in browser settings.')
      }
    }

    await startCycle()
  }, [clearTimers, startMeter, stopCurrentRecording, stopStream])

  useEffect(() => () => stopListening(), [stopListening])

  return {
    isSupported,
    isListening,
    transcript,
    inputLevel,
    startListening,
    stopListening,
  }
}
