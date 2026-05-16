import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
}

// We use silence detection to stop early when it works, but otherwise fall
// back to a fixed cap so capture never gets stuck.
const SPEECH_RMS_THRESHOLD = 0.012
const MIN_UTTERANCE_MS = 700
const SILENCE_AFTER_SPEECH_MS = 800
const MAX_UTTERANCE_MS = 5800
// Even without speech detection, we transcribe if the chunk has reasonable
// audio data. Whisper is fine with silence – it just returns empty text – but
// keeping a floor avoids hammering the API with 0-byte blobs.
const MIN_BLOB_BYTES = 1500

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
  const silenceTimerRef = useRef<number | null>(null)
  const hardStopTimerRef = useRef<number | null>(null)
  const watchdogTimerRef = useRef<number | null>(null)
  const lastCycleStartRef = useRef(0)
  const runningRef = useRef(false)
  const cycleIdRef = useRef(0)
  const inputLevelRef = useRef(0)
  const meterContextRef = useRef<AudioContext | null>(null)
  const meterAnalyserRef = useRef<AnalyserNode | null>(null)
  const meterRafRef = useRef<number | null>(null)

  // Keep latest callbacks in refs so the recording cycle never closes over
  // stale closures. This is the key reason the live mic was flaky after
  // re-renders.
  const onFinalTranscriptRef = useRef(onFinalTranscript)
  const onSpeechStartRef = useRef(onSpeechStart)
  const onActivityRef = useRef(onActivity)
  const onErrorRef = useRef(onError)

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

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (hardStopTimerRef.current !== null) {
      window.clearTimeout(hardStopTimerRef.current)
      hardStopTimerRef.current = null
    }
  }, [])

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current !== null) {
      window.clearInterval(watchdogTimerRef.current)
      watchdogTimerRef.current = null
    }
  }, [])

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
    inputLevelRef.current = 0
  }, [])

  const stopListening = useCallback(() => {
    runningRef.current = false
    cycleIdRef.current += 1
    clearTimers()
    clearWatchdog()
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
  }, [clearTimers, clearWatchdog, stopMeter])

  useEffect(() => () => stopListening(), [stopListening])

  const startListening = useCallback(async () => {
    if (runningRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onErrorRef.current?.('Live voice is not supported in this browser.')
      return
    }
    try {
      runningRef.current = true

      // Important: use plain `audio: true` first. Some Windows mic drivers
      // mute the captured stream when noiseSuppression is forced on, which
      // produced silent blobs that Whisper transcribed as empty -- that's
      // what made the live mic look "broken" while the chat mic kept working.
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (initialErr) {
        // Some browsers require an explicit constraints object; fall back to
        // a permissive one before giving up.
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: false },
              autoGainControl: { ideal: true },
            },
          })
        } catch {
          throw initialErr
        }
      }
      streamRef.current = stream
      setIsListening(true)

      // Mic level meter (best-effort — never blocks recording).
      try {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const context = new Ctx()
        if (context.state === 'suspended') {
          try {
            await context.resume()
          } catch {
            // ignore
          }
        }
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
            onActivityRef.current?.()
          }
          meterRafRef.current = requestAnimationFrame(tick)
        }
        meterRafRef.current = requestAnimationFrame(tick)
      } catch {
        // meter is just for UI – capture works without it
        setInputLevel(0)
      }

      const mimeType = pickMimeType()
      const myCycleId = ++cycleIdRef.current

      const runCycle = (cycleId: number) => {
        if (!runningRef.current || cycleId !== cycleIdRef.current || !streamRef.current) return

        let recorder: MediaRecorder
        try {
          recorder = mimeType
            ? new MediaRecorder(streamRef.current, { mimeType })
            : new MediaRecorder(streamRef.current)
        } catch {
          try {
            recorder = new MediaRecorder(streamRef.current)
          } catch {
            onErrorRef.current?.('Recording is not supported on this device.')
            runningRef.current = false
            setIsListening(false)
            return
          }
        }
        recorderRef.current = recorder
        const chunks: BlobPart[] = []
        const startedAt = nowMs()
        lastCycleStartRef.current = startedAt
        let speechDetected = false
        let lastSpeechAt = startedAt
        let stopped = false

        const safeStop = () => {
          if (stopped) return
          stopped = true
          try {
            recorder.stop()
          } catch {
            // noop
          }
        }

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }

        recorder.onstop = () => {
          clearTimers()
          const blob = new Blob(chunks, {
            type: recorder.mimeType || mimeType || 'audio/webm',
          })

          // Immediately fire the next cycle so capture never has a gap.
          if (runningRef.current && cycleId === cycleIdRef.current) {
            window.setTimeout(() => runCycle(cycleId), 40)
          }

          if (blob.size < MIN_BLOB_BYTES) {
            // Dev hint – mic produced no real audio. This is what we want to
            // see in the console if the mic constraints silenced the stream.
            // eslint-disable-next-line no-console
            console.debug('[live-voice] empty chunk', { size: blob.size, mime: blob.type })
            return
          }

          transcribeAudio(blob)
            .then((text) => {
              const trimmed = text.trim()
              if (!trimmed) {
                // eslint-disable-next-line no-console
                console.debug('[live-voice] empty transcript', { size: blob.size })
                return
              }
              onActivityRef.current?.()
              setTranscript(trimmed)
              Promise.resolve(onFinalTranscriptRef.current(trimmed))
                .catch(() => {})
                .finally(() => setTranscript(''))
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : 'Live transcription failed.'
              // eslint-disable-next-line no-console
              console.warn('[live-voice] transcribe failed', message)
              if (!/too short|no speech detected|recording too short/i.test(message)) {
                onErrorRef.current?.(message)
              }
            })
        }

        try {
          recorder.start(250)
        } catch {
          try {
            recorder.start()
          } catch {
            return
          }
        }

        // Silence-based early stop (best-effort). Independent timer; the hard
        // cap below is what guarantees we always stop and transcribe.
        const silenceTick = () => {
          if (stopped || !runningRef.current || cycleId !== cycleIdRef.current) return
          const rms = inputLevelRef.current
          const elapsed = nowMs() - startedAt

          if (rms > SPEECH_RMS_THRESHOLD) {
            if (!speechDetected) {
              speechDetected = true
              onSpeechStartRef.current?.()
            }
            lastSpeechAt = nowMs()
            onActivityRef.current?.()
          }

          const sinceLastSpeech = nowMs() - lastSpeechAt
          if (
            speechDetected &&
            elapsed >= MIN_UTTERANCE_MS &&
            sinceLastSpeech >= SILENCE_AFTER_SPEECH_MS
          ) {
            safeStop()
            return
          }
          silenceTimerRef.current = window.setTimeout(silenceTick, 110)
        }
        silenceTimerRef.current = window.setTimeout(silenceTick, 120)

        // Hard cap — ALWAYS stops the recorder so we keep cycling and always
        // get a transcribe attempt. This is the safety net that prevents the
        // mic from getting stuck.
        hardStopTimerRef.current = window.setTimeout(safeStop, MAX_UTTERANCE_MS)
      }

      runCycle(myCycleId)

      // Watchdog: if a cycle ever gets wedged (recorder never fires onstop,
      // chunks never accumulate, etc.) we restart the whole mic from scratch.
      // This is the safety net that makes "voice input not working again"
      // self-heal instead of needing a page reload.
      clearWatchdog()
      watchdogTimerRef.current = window.setInterval(() => {
        if (!runningRef.current) return
        const since = nowMs() - lastCycleStartRef.current
        if (since > 14000) {
          // eslint-disable-next-line no-console
          console.warn('[live-voice] watchdog: capture stalled, restarting mic')
          stopListening()
          // Re-arm after a tick so React state settles.
          window.setTimeout(() => {
            if (!streamRef.current) void startListening()
          }, 150)
        }
      }, 4000)
    } catch (err) {
      runningRef.current = false
      setIsListening(false)
      const message = err instanceof Error ? err.message : 'Unable to access microphone.'
      onErrorRef.current?.(message)
    }
  }, [clearTimers])

  return {
    isSupported,
    isListening,
    transcript,
    inputLevel,
    startListening,
    stopListening,
  }
}
