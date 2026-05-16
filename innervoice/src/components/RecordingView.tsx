import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Radio, Square } from 'lucide-react'

interface Props {
  onUseRecording: (blob: Blob) => void
}

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000)
  const min = String(Math.floor(total / 60)).padStart(2, '0')
  const sec = String(total % 60).padStart(2, '0')
  return `${min}:${sec}`
}

export function RecordingView({ onUseRecording }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )

  const recordingStateLabel = useMemo(() => {
    if (audioUrl) return 'Done'
    if (isRecording) return 'Recording'
    return 'Ready'
  }, [audioUrl, isRecording])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setAudioUrl(URL.createObjectURL(blob))
      }
      recorder.start()
      startedAtRef.current = Date.now()
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200)
      setIsRecording(true)
    } catch {
      setPermissionDenied(true)
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) window.clearInterval(timerRef.current)
    setIsRecording(false)
  }

  const rerecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setElapsedMs(0)
  }

  const useRecording = async () => {
    if (!audioUrl) return
    const blob = await fetch(audioUrl).then((res) => res.blob())
    onUseRecording(blob)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex min-h-[280px] flex-col items-center justify-center gap-5"
    >
      <button
        type="button"
        aria-label="Start or stop recording"
        onClick={isRecording ? stopRecording : startRecording}
        className={`h-28 w-28 rounded-full border text-sm font-semibold text-white shadow-[0_0_30px_rgba(239,68,68,0.2)] transition active:scale-95 ${
          audioUrl
            ? 'border-white/20 bg-white/20'
            : isRecording
              ? 'border-red-400 bg-red-600'
              : 'border-red-400/60 bg-black/60'
        }`}
      >
        <span className="flex flex-col items-center gap-1">
          {isRecording ? <Square size={16} /> : audioUrl ? <Radio size={16} /> : <Mic size={16} />}
          {recordingStateLabel}
        </span>
      </button>

      <p className="font-mono text-lg text-text-secondary">{formatDuration(elapsedMs)}</p>

      {permissionDenied && <p className="text-sm text-red-500">Microphone access is blocked. Enable it in browser settings.</p>}

      {audioUrl && (
        <div className="glass-panel flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border p-3">
          <audio controls src={audioUrl} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={rerecord}
              className="flex-1 rounded-full border border-border bg-black/40 px-6 py-3 transition hover:border-red-500/60 hover:text-white"
            >
              Re-record
            </button>
            <button
              type="button"
              onClick={useRecording}
              className="flex-1 rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_16px_rgba(239,68,68,0.35)] transition hover:scale-[1.02]"
            >
              Use This Voice
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
