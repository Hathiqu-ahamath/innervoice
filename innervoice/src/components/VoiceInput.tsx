import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { transcribeAudio } from '../api/speechToText'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onTranscript, disabled = false }: Props) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startRecording = async () => {
    if (disabled || status !== 'idle') return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        stopStream()
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setStatus('transcribing')
        try {
          const text = await transcribeAudio(blob)
          if (text) {
            onTranscriptRef.current(text)
          } else {
            setError('No speech detected. Try again.')
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transcription failed.')
        } finally {
          setStatus('idle')
          setElapsedSec(0)
        }
      }

      recorder.start()
      setStatus('recording')
      setElapsedSec(0)
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000)
    } catch {
      setError('Microphone blocked. Allow mic access in browser settings.')
      stopStream()
    }
  }

  const stopRecording = () => {
    const recorder = mediaRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (recorder.state === 'recording') {
      recorder.requestData()
    }
    recorder.stop()
    mediaRef.current = null
  }

  const handleClick = () => {
    if (disabled || status === 'transcribing') return
    if (status === 'recording') {
      stopRecording()
    } else {
      void startRecording()
    }
  }

  const isRecording = status === 'recording'
  const isTranscribing = status === 'transcribing'

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {error && (
        <p className="pointer-events-none absolute -top-14 left-1/2 z-20 w-max max-w-[280px] -translate-x-1/2 rounded-lg border border-red-700/60 bg-red-950/95 px-3 py-1.5 text-center text-xs text-red-200">
          {error}
        </p>
      )}
      {isRecording && (
        <p className="pointer-events-none absolute -top-10 left-1/2 z-20 -translate-x-1/2 text-xs text-red-400">
          {elapsedSec}s — tap to send
        </p>
      )}
      <button
        type="button"
        aria-label={isRecording ? 'Stop and transcribe' : isTranscribing ? 'Transcribing' : 'Record voice message'}
        disabled={disabled || isTranscribing}
        onClick={handleClick}
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          isRecording
            ? 'border-red-400 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.45)]'
            : isTranscribing
              ? 'border-border bg-black/70 text-text-secondary'
              : 'border-border bg-black/70 text-text-secondary hover:border-red-500/60 hover:text-white'
        }`}
      >
        {isTranscribing ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isRecording ? (
          <Square size={16} />
        ) : (
          <Mic size={18} />
        )}
        {isRecording && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-red-400/60" />
        )}
      </button>
    </div>
  )
}
