import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

const DEBUG_ENDPOINT = 'http://127.0.0.1:7557/ingest/69d83c9c-05f0-432b-b66d-2c89382c215d'
const DEBUG_SESSION_ID = '0d719b'
const DEBUG_RUN_ID = 'livechat-initial'

function debugLog(location: string, message: string, hypothesisId: string, data: Record<string, unknown>) {
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': DEBUG_SESSION_ID },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId: DEBUG_RUN_ID,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
}

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void | Promise<void>
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
  onSilentCapture?: () => void
}

const SILENCE_MS     = 300   // ms of quiet before we stop and send
const MIN_RECORD_MS  = 400   // minimum recording before silence-stop fires
const MAX_RECORD_MS  = 12000 // hard cap per utterance
const RMS_THRESHOLD  = 0.008 // audio level considered "voice"
const MIN_BLOB_BYTES = 1000  // must match transcribeAudio's own guard

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
  const [isListening,  setIsListening]  = useState(false)
  const [transcript,   setTranscript]   = useState('')
  const [inputLevel,   setInputLevel]   = useState(0)

  // ONE stream per session — never close it between recording cycles.
  const streamRef    = useRef<MediaStream | null>(null)
  const recorderRef  = useRef<MediaRecorder | null>(null)
  const runningRef   = useRef(false)
  const sessionIdRef = useRef(0) // bump to abort stale async operations

  const silenceTimerRef = useRef<number | null>(null)
  const maxTimerRef     = useRef<number | null>(null)
  const meterRafRef     = useRef<number | null>(null)
  const meterCtxRef     = useRef<AudioContext | null>(null)

  const lastAudioAtRef  = useRef(0)
  const recordStartRef  = useRef(0)
  const stoppingRef     = useRef(false)
  /** Pause for TTS without tearing down the mic stream (live fillers / replies). */
  const capturePausedRef = useRef(false)

  // Stable callback refs — never cause stale closures.
  const onFinalRef   = useRef(onFinalTranscript)
  const onStartRef   = useRef(onSpeechStart)
  const onActivityR  = useRef(onActivity)
  const onErrorRef   = useRef(onError)
  const onSilentRef  = useRef(onSilentCapture)
  useEffect(() => { onFinalRef.current  = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onStartRef.current  = onSpeechStart     }, [onSpeechStart])
  useEffect(() => { onActivityR.current = onActivity        }, [onActivity])
  useEffect(() => { onErrorRef.current  = onError           }, [onError])
  useEffect(() => { onSilentRef.current = onSilentCapture   }, [onSilentCapture])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) { window.clearInterval(silenceTimerRef.current); silenceTimerRef.current = null }
    if (maxTimerRef.current     !== null) { window.clearTimeout(maxTimerRef.current);      maxTimerRef.current     = null }
  }, [])

  const stopMeter = useCallback(() => {
    if (meterRafRef.current !== null) { cancelAnimationFrame(meterRafRef.current); meterRafRef.current = null }
    if (meterCtxRef.current) { void meterCtxRef.current.close().catch(() => {}); meterCtxRef.current = null }
    setInputLevel(0)
  }, [])

  // Hard-stop the current recorder (safe to call multiple times).
  const stopRecorder = useCallback(() => {
    if (stoppingRef.current) return
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    stoppingRef.current = true
    clearTimers()
    try { rec.requestData(); rec.stop() } catch { stoppingRef.current = false }
  }, [clearTimers])

  const stopListening = useCallback(() => {
    runningRef.current = false
    capturePausedRef.current = false
    sessionIdRef.current += 1
    clearTimers()
    stopRecorder()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    stopMeter()
    setIsListening(false)
    setTranscript('')
  }, [clearTimers, stopMeter, stopRecorder])

  /** Stop the current utterance capture but keep the mic stream alive. */
  const pauseCapture = useCallback(() => {
    if (!runningRef.current) return
    capturePausedRef.current = true
    clearTimers()
    stopRecorder()
    // #region agent log
    debugLog('src/features/liveVoice/useVoiceInput.ts:pause-capture', 'Capture paused for TTS', 'H1,H3', {
      sid: sessionIdRef.current,
      hasStream: Boolean(streamRef.current),
    })
    // #endregion
  }, [clearTimers, stopRecorder])

  // Start the AudioContext meter on the stream (called once per session).
  const startMeter = useCallback((stream: MediaStream, sid: number) => {
    stopMeter()
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      void ctx.resume().catch(() => {})
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      meterCtxRef.current = ctx
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!runningRef.current || sessionIdRef.current !== sid) return
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const n = (buf[i] - 128) / 128; sum += n * n }
        const rms = Math.sqrt(sum / buf.length)
        setInputLevel(Math.min(1, rms * 6))
        if (rms > RMS_THRESHOLD) {
          lastAudioAtRef.current = Date.now()
          onActivityR.current?.()
          onStartRef.current?.()   // idempotent on the controller side
        }
        meterRafRef.current = requestAnimationFrame(tick)
      }
      meterRafRef.current = requestAnimationFrame(tick)
    } catch { setInputLevel(0) }
  }, [stopMeter])

  // Start ONE recording cycle on the already-open stream.
  // Calls itself recursively after each transcription.
  const startCycle = useCallback((stream: MediaStream, sid: number) => {
    if (!runningRef.current || sessionIdRef.current !== sid) return

    stoppingRef.current = false
    const chunks: Blob[] = []
    recordStartRef.current = Date.now()
    lastAudioAtRef.current = Date.now() // initialise so silence timer works immediately

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream)
    } catch {
      onErrorRef.current?.('Recording not supported on this device.')
      return
    }
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    recorder.onstop = async () => {
      stoppingRef.current = false
      setIsListening(false)
      if (!runningRef.current || sessionIdRef.current !== sid) return

      if (capturePausedRef.current) {
        capturePausedRef.current = false
        // #region agent log
        debugLog('src/features/liveVoice/useVoiceInput.ts:recorder-paused-stop', 'Recorder stopped while paused (no transcribe)', 'H1,H3', { sid })
        // #endregion
        return
      }

      const blob = new Blob(chunks, { type: 'audio/webm' })
      // #region agent log
      debugLog('src/features/liveVoice/useVoiceInput.ts:recorder-stop', 'Recorder stopped with blob', 'H1,H3,H5', {
        blobSize: blob.size,
        chunkCount: chunks.length,
        durationMs: Date.now() - recordStartRef.current,
        sid,
        running: runningRef.current,
      })
      // #endregion

      if (blob.size < MIN_BLOB_BYTES) {
        onSilentRef.current?.()
        // Brief pause then start next cycle on the same stream
        window.setTimeout(() => startCycle(stream, sid), 80)
        return
      }

      try {
        const text = await transcribeAudio(blob)
        const trimmed = text.trim()
        // #region agent log
        debugLog('src/features/liveVoice/useVoiceInput.ts:transcription-result', 'Transcription returned', 'H1,H5', {
          textLength: trimmed.length,
          preview: trimmed.slice(0, 80),
        })
        // #endregion
        if (trimmed) {
          setTranscript(trimmed)
          await Promise.resolve(onFinalRef.current(trimmed))
          setTranscript('')
        } else {
          onSilentRef.current?.()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transcription failed.'
        if (!/too short|no speech detected|recording too short/i.test(msg)) {
          onErrorRef.current?.(msg)
        } else {
          onSilentRef.current?.()
        }
      } finally {
        if (runningRef.current && sessionIdRef.current === sid) {
          window.setTimeout(() => startCycle(stream, sid), 80)
        }
      }
    }

    // Use a timeslice so we get data chunks periodically — same as
    // the working chat page recorder. Without this, requestData() on
    // a fresh recorder can produce empty output on some browsers.
    try { recorder.start(100) } catch { try { recorder.start() } catch { return } }
    setIsListening(true)

    // Silence-based stop: once audio has been recording for MIN_RECORD_MS,
    // stop whenever there's been SILENCE_MS of quiet.
    silenceTimerRef.current = window.setInterval(() => {
      if (!runningRef.current || sessionIdRef.current !== sid) return
      if (Date.now() - recordStartRef.current < MIN_RECORD_MS) return
      if (Date.now() - lastAudioAtRef.current >= SILENCE_MS) stopRecorder()
    }, 80)

    maxTimerRef.current = window.setTimeout(() => stopRecorder(), MAX_RECORD_MS)
  }, [clearTimers, stopRecorder]) // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(async () => {
    if (runningRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onErrorRef.current?.('Live voice is not supported in this browser.')
      return
    }

    runningRef.current = true
    const sid = ++sessionIdRef.current
    // #region agent log
    debugLog('src/features/liveVoice/useVoiceInput.ts:start-listening', 'Mic listening started', 'H1,H3', {
      sid,
      hasExistingStream: Boolean(streamRef.current),
    })
    // #endregion

    let stream: MediaStream
    try {
      // ONE getUserMedia call for the entire session — keeps the stream alive
      // across recording cycles so we don't hit rapid re-permission issues.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      runningRef.current = false
      onErrorRef.current?.('Microphone blocked. Allow mic access in browser settings.')
      return
    }

    if (!runningRef.current || sessionIdRef.current !== sid) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    streamRef.current = stream
    startMeter(stream, sid)
    startCycle(stream, sid)
  }, [startCycle, startMeter])

  /** Resume capture on the existing stream after TTS. */
  const resumeCapture = useCallback(() => {
    const stream = streamRef.current
    const sid = sessionIdRef.current
    if (!runningRef.current || !stream) {
      // #region agent log
      debugLog('src/features/liveVoice/useVoiceInput.ts:resume-capture-fallback', 'Resume fell back to startListening', 'H1,H3', {
        running: runningRef.current,
        hasStream: Boolean(stream),
      })
      // #endregion
      void startListening()
      return
    }
    // #region agent log
    debugLog('src/features/liveVoice/useVoiceInput.ts:resume-capture', 'Capture resumed on existing stream', 'H1,H3', { sid })
    // #endregion
    startCycle(stream, sid)
  }, [startCycle, startListening])

  useEffect(() => () => stopListening(), [stopListening])

  return {
    isSupported,
    isListening,
    transcript,
    inputLevel,
    startListening,
    stopListening,
    pauseCapture,
    resumeCapture,
  }
}
