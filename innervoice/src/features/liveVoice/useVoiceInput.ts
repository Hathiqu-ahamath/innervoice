import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
  onSilentCapture?: () => void
}

// How long (ms) of quiet after audio before we stop and upload.
const SILENCE_AFTER_AUDIO_MS = 300
// Minimum recording length before silence-stop is allowed.
const MIN_RECORD_MS = 400
// Hard cap — always upload after this even if still noisy.
const MAX_RECORD_MS = 12000
// RMS level above which we consider the mic "live".
const SPEECH_RMS_THRESHOLD = 0.008
// Smallest blob we'll bother sending to Whisper.
const MIN_BLOB_BYTES = 800

function nowMs() { return Date.now() }

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

  const mediaRef     = useRef<MediaRecorder | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const runningRef   = useRef(false)
  const stoppingRef  = useRef(false)
  const cycleIdRef   = useRef(0)

  const silenceTimerRef = useRef<number | null>(null)
  const maxTimerRef     = useRef<number | null>(null)
  const meterContextRef = useRef<AudioContext | null>(null)
  const meterRafRef     = useRef<number | null>(null)

  // Last time we measured audio above threshold (used for silence detection).
  const lastAudioAtRef = useRef(0)
  // Whether we've seen audio above threshold at least once in this cycle.
  const audioSeenRef   = useRef(false)
  // When the current recording started.
  const recordStartRef = useRef(0)

  const onFinalTranscriptRef = useRef(onFinalTranscript)
  const onSpeechStartRef     = useRef(onSpeechStart)
  const onActivityRef        = useRef(onActivity)
  const onErrorRef           = useRef(onError)
  const onSilentCaptureRef   = useRef(onSilentCapture)

  useEffect(() => { onFinalTranscriptRef.current = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onSpeechStartRef.current = onSpeechStart },         [onSpeechStart])
  useEffect(() => { onActivityRef.current = onActivity },               [onActivity])
  useEffect(() => { onErrorRef.current = onError },                     [onError])
  useEffect(() => { onSilentCaptureRef.current = onSilentCapture },     [onSilentCapture])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) { window.clearInterval(silenceTimerRef.current); silenceTimerRef.current = null }
    if (maxTimerRef.current     !== null) { window.clearTimeout(maxTimerRef.current);      maxTimerRef.current     = null }
  }, [])

  const stopMeter = useCallback(() => {
    if (meterRafRef.current !== null) { cancelAnimationFrame(meterRafRef.current); meterRafRef.current = null }
    if (meterContextRef.current) { void meterContextRef.current.close().catch(() => {}); meterContextRef.current = null }
    setInputLevel(0)
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    stopMeter()
  }, [stopMeter])

  const stopCurrentRecording = useCallback(() => {
    const rec = mediaRef.current
    if (!rec || rec.state === 'inactive' || stoppingRef.current) return
    stoppingRef.current = true
    try {
      if (rec.state === 'recording') rec.requestData()
      rec.stop()
    } catch { stoppingRef.current = false }
  }, [])

  const stopListening = useCallback(() => {
    runningRef.current = false
    cycleIdRef.current += 1
    clearTimers()
    stopCurrentRecording()
    mediaRef.current = null
    stopStream()
    audioSeenRef.current = false
    setIsListening(false)
    setTranscript('')
  }, [clearTimers, stopCurrentRecording, stopStream])

  const startMeter = useCallback((stream: MediaStream, cycleId: number) => {
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      meterContextRef.current = ctx
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!runningRef.current || cycleId !== cycleIdRef.current) return
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const n = (buf[i] - 128) / 128; sum += n * n }
        const rms = Math.sqrt(sum / buf.length)
        setInputLevel(Math.min(1, rms * 6))
        if (rms > SPEECH_RMS_THRESHOLD) {
          lastAudioAtRef.current = nowMs()
          onActivityRef.current?.()
          if (!audioSeenRef.current) {
            audioSeenRef.current = true
            onSpeechStartRef.current?.()
          }
        }
        meterRafRef.current = requestAnimationFrame(tick)
      }
      meterRafRef.current = requestAnimationFrame(tick)
    } catch { setInputLevel(0) }
  }, [])

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
      audioSeenRef.current = false
      lastAudioAtRef.current = 0

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        runningRef.current = false
        setIsListening(false)
        onErrorRef.current?.('Microphone blocked. Allow mic access in browser settings.')
        return
      }

      if (!runningRef.current || cycleId !== cycleIdRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRef.current = recorder
      recordStartRef.current = nowMs()

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        clearTimers()
        stopStream()
        mediaRef.current = null
        stoppingRef.current = false

        if (!runningRef.current || cycleId !== cycleIdRef.current) return

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []
        setIsListening(false)

        // Always attempt transcription if blob has real data — don't gate on
        // RMS detection, because that gate is what silently killed input.
        if (blob.size < MIN_BLOB_BYTES) {
          onSilentCaptureRef.current?.()
          window.setTimeout(() => { void startCycle() }, 80)
          return
        }

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
          const msg = err instanceof Error ? err.message : 'Transcription failed.'
          if (!/too short|no speech detected|recording too short/i.test(msg)) {
            onErrorRef.current?.(msg)
          } else {
            onSilentCaptureRef.current?.()
          }
        } finally {
          if (runningRef.current && cycleId === cycleIdRef.current) {
            window.setTimeout(() => { void startCycle() }, 80)
          }
        }
      }

      recorder.start()
      setIsListening(true)
      lastAudioAtRef.current = nowMs() // initialise so silence timer works from start
      startMeter(stream, cycleId)

      // Silence-based stop: fire after SILENCE_AFTER_AUDIO_MS of quiet,
      // but only after MIN_RECORD_MS so we don't cut off immediately.
      silenceTimerRef.current = window.setInterval(() => {
        if (!runningRef.current || cycleId !== cycleIdRef.current) return
        const elapsed = nowMs() - recordStartRef.current
        if (elapsed < MIN_RECORD_MS) return
        const quiet = nowMs() - lastAudioAtRef.current
        if (quiet >= SILENCE_AFTER_AUDIO_MS) stopCurrentRecording()
      }, 80)

      // Hard cap
      maxTimerRef.current = window.setTimeout(() => stopCurrentRecording(), MAX_RECORD_MS)
    }

    await startCycle()
  }, [clearTimers, startMeter, stopCurrentRecording, stopStream])

  useEffect(() => () => stopListening(), [stopListening])

  return { isSupported, isListening, transcript, inputLevel, startListening, stopListening }
}
