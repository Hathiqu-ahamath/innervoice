import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
}

const SPEECH_RMS_THRESHOLD = 0.018
const MIN_UTTERANCE_MS = 900
const SILENCE_AFTER_SPEECH_MS = 850
const MAX_UTTERANCE_MS = 10000
const NO_SPEECH_RESTART_MS = 6000

function nowMs() {
  return Date.now()
}

export function useVoiceInput({
  onFinalTranscript,
  onSpeechStart,
  onActivity,
  onError,
}: UseVoiceInputOptions) {
  const [isSupported] = useState(Boolean(navigator.mediaDevices?.getUserMedia))
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [inputLevel, setInputLevel] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunkStopTimerRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const inputLevelRef = useRef(0)
  const meterContextRef = useRef<AudioContext | null>(null)
  const meterAnalyserRef = useRef<AnalyserNode | null>(null)
  const meterRafRef = useRef<number | null>(null)

  const stopMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current)
      meterRafRef.current = null
    }
    if (meterAnalyserRef.current) {
      try {
        meterAnalyserRef.current.disconnect()
      } catch {
        // noop
      }
      meterAnalyserRef.current = null
    }
    if (meterContextRef.current) {
      void meterContextRef.current.close().catch(() => {})
      meterContextRef.current = null
    }
    setInputLevel(0)
  }, [])

  const stopListening = useCallback(() => {
    runningRef.current = false
    if (chunkStopTimerRef.current !== null) {
      window.clearTimeout(chunkStopTimerRef.current)
      chunkStopTimerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    stopMeter()
    setIsListening(false)
    setTranscript('')
  }, [stopMeter])

  useEffect(() => () => stopListening(), [stopListening])

  const startListening = useCallback(async () => {
    if (runningRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Live voice is not supported in this browser.')
      return
    }
    try {
      runningRef.current = true
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setIsListening(true)

      // Real mic meter from same stream used for capture.
      try {
        const context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 128
        const source = context.createMediaStreamSource(stream)
        source.connect(analyser)
        meterContextRef.current = context
        meterAnalyserRef.current = analyser
        const data = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          if (!meterAnalyserRef.current) return
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i += 1) {
            const n = (data[i] - 128) / 128
            sum += n * n
          }
          const rms = Math.sqrt(sum / data.length)
          inputLevelRef.current = rms
          setInputLevel(Math.min(1, rms * 5))
          if (rms > SPEECH_RMS_THRESHOLD) {
            onActivity?.()
          }
          meterRafRef.current = requestAnimationFrame(tick)
        }
        meterRafRef.current = requestAnimationFrame(tick)
      } catch {
        setInputLevel(0)
      }

      const runCycle = () => {
        if (!runningRef.current || !streamRef.current) return
        const recorder = new MediaRecorder(streamRef.current)
        recorderRef.current = recorder
        const chunks: BlobPart[] = []
        const startedAt = nowMs()
        let speechDetected = false
        let lastSpeechAt = startedAt
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = async () => {
          if (chunkStopTimerRef.current !== null) {
            window.clearTimeout(chunkStopTimerRef.current)
            chunkStopTimerRef.current = null
          }
          if (!runningRef.current) return
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          if (speechDetected && blob.size > 1800) {
            try {
              const text = await transcribeAudio(blob)
              const trimmed = text.trim()
              if (trimmed) {
                onActivity?.()
                setTranscript(trimmed)
                await onFinalTranscript(trimmed)
                setTranscript('')
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Live transcription failed.'
              if (!/too short|no speech detected/i.test(message)) {
                onError?.(message)
              }
            }
          }
          if (runningRef.current) window.setTimeout(runCycle, 120)
        }
        recorder.start(250)

        const watchForSilence = () => {
          if (!runningRef.current || recorder.state === 'inactive') return
          const rms = inputLevelRef.current
          const elapsed = nowMs() - startedAt

          if (rms > SPEECH_RMS_THRESHOLD) {
            if (!speechDetected) {
              speechDetected = true
              onSpeechStart?.()
            }
            lastSpeechAt = nowMs()
            onActivity?.()
          }

          const shouldStopForSpeech =
            speechDetected && elapsed >= MIN_UTTERANCE_MS && nowMs() - lastSpeechAt >= SILENCE_AFTER_SPEECH_MS
          const shouldStopForMaxLength = elapsed >= MAX_UTTERANCE_MS

          if (shouldStopForSpeech || shouldStopForMaxLength) {
            recorder.stop()
            return
          }

          chunkStopTimerRef.current = window.setTimeout(watchForSilence, 120)
        }

        chunkStopTimerRef.current = window.setTimeout(() => {
          if (!speechDetected && recorder.state !== 'inactive') recorder.stop()
        }, NO_SPEECH_RESTART_MS)
        window.setTimeout(watchForSilence, 120)
      }

      runCycle()
    } catch {
      runningRef.current = false
      setIsListening(false)
      onError?.('Unable to access microphone for live mode.')
    }
  }, [onActivity, onError, onFinalTranscript, onSpeechStart])

  return {
    isSupported,
    isListening,
    transcript,
    inputLevel,
    startListening,
    stopListening,
  }
}
