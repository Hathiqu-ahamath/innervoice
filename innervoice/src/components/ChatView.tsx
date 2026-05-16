import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, Send, Waves } from 'lucide-react'
import type { Message } from '../types'
import { FollowUpSuggestions } from './FollowUpSuggestions'
import { VoiceInput } from './VoiceInput'
import { useAudioVisualizer } from '../hooks/useAudioVisualizer'

interface Props {
  messages: Message[]
  isProcessing: boolean
  onSend: (text: string) => void
}

function VisualBars({ levels }: { levels: number[] }) {
  return (
    <div className="ml-3 flex items-end gap-1">
      {levels.map((level, index) => (
        <span
          key={`${index}-${Math.round(level * 100)}`}
          className="w-1 rounded bg-red-500"
          style={{ height: `${Math.max(6, level * 24)}px` }}
        />
      ))}
    </div>
  )
}

export function ChatView({ messages, isProcessing, onSend }: Props) {
  const [input, setInput] = useState('')
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true)
  const [assistantSpeaking, setAssistantSpeaking] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)
  const { levels, connect } = useAudioVisualizer()
  const maxChars = 1000
  const remaining = maxChars - input.length
  const lastAssistantMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.id,
    [messages],
  )

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages, isProcessing])

  const canSend = useMemo(() => input.trim().length > 0 && !isProcessing, [input, isProcessing])

  const send = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="flex h-[64vh] min-h-[360px] max-h-[640px] flex-col gap-4">
      <header>
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Waves size={18} className="text-red-400" />
          Your Future Self is Here
        </h2>
        <p className="text-sm text-text-secondary">Voice-to-voice is on by default. You can still type anytime.</p>
      </header>

      <div className="glass-panel flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <p className="text-xs text-text-secondary">
          {voiceModeEnabled ? 'Voice mode is ON' : 'Voice mode is OFF'}
        </p>
        <button
          type="button"
          onClick={() => setVoiceModeEnabled((prev) => !prev)}
          className="whitespace-nowrap rounded-full border border-border bg-black/40 px-3 py-1 text-xs text-text-secondary transition hover:border-red-500/60 hover:text-white"
        >
          {voiceModeEnabled ? 'Disable' : 'Enable'}
        </button>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="glass-panel flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border p-3"
      >
        {messages.length === 0 && !isProcessing && (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">
            Your voice has been cloned. Ask your future self a question to begin.
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`rounded-2xl border p-3 ${
                message.role === 'user'
                  ? 'ml-auto max-w-[90%] border-red-500/30 bg-red-600/15'
                  : 'mr-auto max-w-[90%] border-white/10 bg-black/55'
              }`}
            >
              <p className="text-sm text-text-primary">{message.text}</p>
              {message.emotion && message.role === 'user' && (
                <p className="mt-1 text-xs italic text-text-tertiary">Emotion: {message.emotion}</p>
              )}
              {message.audioUrl && (
                <AudioBubble
                  audioUrl={message.audioUrl}
                  onConnect={connect}
                  levels={levels}
                  autoPlay={voiceModeEnabled && lastAssistantMessageId === message.id}
                  onSpeakingChange={setAssistantSpeaking}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {isProcessing && (
          <div className="animate-fade-in rounded-xl border border-red-500/25 bg-black/60 p-3 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Your future self is composing a reply…
            </span>
          </div>
        )}
      </div>

      <FollowUpSuggestions onSelect={onSend} />

      <div className="flex items-end gap-2">
        <VoiceInput
          disabled={isProcessing || assistantSpeaking}
          keepListening={voiceModeEnabled}
          onTranscript={(text) => {
            if (!text.trim()) return
            if (voiceModeEnabled && !isProcessing && !assistantSpeaking) {
              onSend(text)
              return
            }
            setInput((prev) => `${prev} ${text}`.trim())
          }}
        />
        <div className="flex-1">
          <textarea
            value={input}
            maxLength={maxChars}
            rows={2}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder="Say what is on your mind…"
            className="min-h-[48px] w-full resize-none rounded-xl border border-border bg-black/45 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-red-500/60"
          />
          <p className="mt-1 text-right text-xs text-text-tertiary">{remaining} characters left</p>
        </div>
        <button
          type="button"
          aria-label="Send message"
          onClick={send}
          disabled={!canSend}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_0_16px_rgba(239,68,68,0.4)] transition hover:scale-[1.03] disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}

function AudioBubble({
  audioUrl,
  onConnect,
  levels,
  autoPlay,
  onSpeakingChange,
}: {
  audioUrl: string
  onConnect: (audio: HTMLAudioElement) => void
  levels: number[]
  autoPlay?: boolean
  onSpeakingChange?: (playing: boolean) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!autoPlay) return
    const element = audioRef.current
    if (!element) return
    void element.play().catch(() => {})
  }, [autoPlay])

  return (
    <div className="mt-2 flex items-center">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={(event) => {
          setPlaying(true)
          onSpeakingChange?.(true)
          onConnect(event.currentTarget)
        }}
        onPause={() => {
          setPlaying(false)
          onSpeakingChange?.(false)
        }}
        onEnded={() => {
          setPlaying(false)
          onSpeakingChange?.(false)
        }}
      />
      <button
        type="button"
        aria-label={playing ? 'Pause response audio' : 'Play response audio'}
        onClick={() => {
          const element = audioRef.current
          if (!element) return
          if (element.paused) {
            void element.play()
          } else {
            element.pause()
          }
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-black/60 px-3 py-1 text-xs text-text-secondary transition hover:border-red-500/60 hover:text-white"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
        {playing ? 'Pause' : 'Play'}
      </button>
      <VisualBars levels={levels} />
    </div>
  )
}
