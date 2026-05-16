import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
}

const SPEECH_RMS_THRESHOLD = 0.014
const MIN_UTTERANCE_MS = 850
const SILENCE_AFTER_SPEECH_MS = 850
const MAX_UTTERANCE_MS = 11000
const NO_SPEECH_RESTART_MS = 6500
// On mobile, the audio meter can stay suspended even after permission is
// granted. In that case `speechDetected` never flips true. As a safety net we
// still transcribe a recorded chunk if the blob is reasonably large.
const MOBILE_FALLBACK_BYTES = 9000

function nowMs() {
  return Date.now()
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate
    } catch {
      // ignore
    }
  }
  return undefined
}

function extensionFor(mime?: string): string {
  if (!mime) return 'webm'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export function useVoiceInput({
  onFinalTranscript,
  onSpeechStart,
  onActivity,
  onError,
}: UseVoiceInputOptions) {
  const [isSupported] = useState(
    Boolean(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'),
  )
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
  const meterAliveRef = useRef(false)

  const stopMeter = useCallback(() => {
    meterAliveRef.current = false
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
      try {
        recorderRef.current.stop()
      } catch {
        // noop
      }
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
    if (typeof MediaRecorder === 'undefined') {
      onError?.('Recording is not supported in this browser.')
      return
    }
    try {
      runningRef.current = true
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      setIsListening(true)

      // Real mic meter from same stream used for capture.
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const context = new Ctx()
        // iOS Safari opens AudioContext suspended; resuming is required.
        if (context.state === 'suspended') {
          try {
            await context.resume()
          } catch {
            // ignore – we still try to use it
          }
        }
        const analyser = context.createAnalyser()
        analyser.fftSize = 128
        const source = context.createMediaStreamSource(stream)
        source.connect(analyser)
        meterContextRef.current = context
        meterAnalyserRef.current = analyser
        meterAliveRef.current = true
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
        meterAliveRef.current = false
        setInputLevel(0)
      }

      const runCycle = () => {
        if (!runningRef.current || !streamRef.current) return
        const mimeType = pickMimeType()
        let recorder: MediaRecorder
        try {
          recorder = mimeType
            ? new MediaRecorder(streamRef.current, { mimeType })
            : new MediaRecorder(streamRef.current)
        } catch {
          // mimeType not supported – try the default
          try {
            recorder = new MediaRecorder(streamRef.current)
          } catch {
            onError?.('Recording is not supported on this device.')
            runningRef.current = false
            setIsListening(false)
            return
          }
        }
        recorderRef.current = recorder
        const chunks: BlobPart[] = []
        const startedAt = nowMs()
        let speechDetected = false
        let lastSpeechAt = startedAt

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => {
          if (chunkStopTimerRef.current !== null) {
            window.clearTimeout(chunkStopTimerRef.current)
            chunkStopTimerRef.current = null
          }
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })

          // Restart the next recording cycle immediately so we keep capturing
          // audio while the current chunk is being transcribed. This is what
          // gives us mid-response interrupt support and avoids dropping the
          // start of the user's next sentence.
          if (runningRef.current) window.setTimeout(runCycle, 80)

          const meterFailed = !meterAliveRef.current
          const meaningfulSize = blob.size > 1800
          const passedSizeFallback = blob.size > MOBILE_FALLBACK_BYTES
          const shouldTranscribe =
            meaningfulSize && (speechDetected || meterFailed || passedSizeFallback)

          if (!shouldTranscribe) return

          // Some browsers report blob.size = 0 if the recorder was stopped
          // before any data was flushed.
          if (blob.size < 1000) return

          // Use a stable filename + extension so Whisper auto-detects the
          // container correctly on iOS (mp4) vs desktop (webm).
          const file = new File([blob], `speech.${extensionFor(recorder.mimeType || mimeType)}`, {
            type: recorder.mimeType || mimeType || 'audio/webm',
          })

          transcribeAudio(file)
            .then((text) => {
              const trimmed = text.trim()
              if (!trimmed) return
              onActivity?.()
              setTranscript(trimmed)
              // Fire-and-forget so the recording loop is never blocked by the
              // controller's LLM/TTS pipeline.
              Promise.resolve(onFinalTranscript(trimmed))
                .catch(() => {})
                .finally(() => setTranscript(''))
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : 'Live transcription failed.'
              if (!/too short|no speech detected/i.test(message)) {
                onError?.(message)
              }
            })
        }

        try {
          recorder.start(250)
        } catch {
          // Some Safari versions throw if the timeslice is too small.
          try {
            recorder.start()
          } catch {
            return
          }
        }

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
            speechDetected &&
            elapsed >= MIN_UTTERANCE_MS &&
            nowMs() - lastSpeechAt >= SILENCE_AFTER_SPEECH_MS
          const shouldStopForMaxLength = elapsed >= MAX_UTTERANCE_MS

          if (shouldStopForSpeech || shouldStopForMaxLength) {
            try {
              recorder.stop()
            } catch {
              // noop
            }
            return
          }

          chunkStopTimerRef.current = window.setTimeout(watchForSilence, 120)
        }

        // Safety net: if no speech is detected, stop after a fixed window so
        // we can still transcribe (mobile fallback) or simply restart fresh.
        chunkStopTimerRef.current = window.setTimeout(() => {
          if (recorder.state !== 'inactive') {
            try {
              recorder.stop()
            } catch {
              // noop
            }
          }
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
