import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb, Pause, Play, Send, Sparkles, Waves } from 'lucide-react'
import type { Message } from '../types'
import { FollowUpSuggestions } from './FollowUpSuggestions'
import { VoiceInput } from './VoiceInput'
import { useAudioVisualizer } from '../hooks/useAudioVisualizer'
import { BreathingVoiceOrb } from './BreathingVoiceOrb'

interface Props {
  messages: Message[]
  isProcessing: boolean
  showThinking: boolean
  thinkingLabel: string
  onSend: (text: string) => void
  onOpenLive?: () => void
}

function VisualBars({ levels }: { levels: number[] }) {
  return (
    <div className="ml-3 hidden items-end gap-1 min-[380px]:flex">
      {levels.map((level, index) => (
        <span
          key={`${index}-${Math.round(level * 100)}`}
          className="w-1 rounded bg-accent"
          style={{ height: `${Math.max(6, level * 24)}px` }}
        />
      ))}
    </div>
  )
}

export function ChatView({ messages, isProcessing, showThinking, thinkingLabel, onSend, onOpenLive }: Props) {
  const [input, setInput] = useState('')
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true)
  const [assistantSpeaking, setAssistantSpeaking] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
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
  }, [messages, isProcessing, thinkingLabel])

  const canSend = useMemo(() => input.trim().length > 0 && !isProcessing, [input, isProcessing])
  const isLanding = messages.length === 0 && !isProcessing && !showThinking

  const send = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="glass-panel min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border p-2.5 sm:p-3"
      >
        {isLanding && (
          <div className="flex h-full min-h-[220px] flex-col justify-center gap-4 px-1 py-2 sm:px-2">
            <div className="text-center">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-text-primary sm:text-xl">
                <Waves size={18} className="text-accent" />
                Your Future Self is Here
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary sm:text-sm">
                Tap the mic to record, then tap again to send. Open the lightbulb for ideas.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
              <div className="space-y-2">
                {onOpenLive && (
                  <button
                    type="button"
                    onClick={onOpenLive}
                    className="glass-panel flex w-full items-center justify-between gap-3 rounded-2xl border border-accent/45 bg-gradient-to-r from-accent-soft/60 to-elevated px-3 py-3 text-left transition hover:border-accent/70"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">Open Live Chat</p>
                      <p className="text-xs text-text-secondary">Talk to your 3D future-self model</p>
                    </div>
                    <div className="shrink-0">
                      <BreathingVoiceOrb state="listening" emotion="hopeful" level={0.32} size={72} />
                    </div>
                  </button>
                )}

                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-elevated px-2.5 py-1.5">
                  <Sparkles size={12} className="text-accent" />
                  <span className="text-[11px] text-text-secondary">
                    {voiceModeEnabled ? 'Voice mode ON' : 'Voice mode OFF'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVoiceModeEnabled((prev) => !prev)}
                    className="rounded-full border border-border bg-surface-card px-2 py-0.5 text-[10px] text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                  >
                    {voiceModeEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              <div className="hidden rounded-2xl border border-border/70 bg-elevated/60 p-3 text-xs text-text-secondary lg:block">
                <p className="font-medium text-text-primary">Try starting with:</p>
                <p className="mt-1">“What am I not seeing clearly right now?”</p>
                <p className="mt-1">“Why do I keep overthinking this?”</p>
                <p className="mt-1">“Can you help me calm down first?”</p>
              </div>
            </div>
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
                  ? 'ml-auto max-w-[92%] border-accent/30 bg-accent-soft sm:max-w-[86%]'
                  : 'mr-auto max-w-[92%] border-border bg-assistant-bubble sm:max-w-[86%]'
              }`}
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">{message.text}</p>
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
        {showThinking && (
          <div className="animate-fade-in rounded-xl border border-accent/25 bg-elevated p-3 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {thinkingLabel}
            </span>
          </div>
        )}
      </div>

      <FollowUpSuggestions
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onSelect={onSend}
      />

      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-2">
        <button
          type="button"
          aria-label="Open question suggestions"
          onClick={() => setSuggestionsOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition hover:border-accent/60 hover:text-text-primary sm:h-12 sm:w-12"
        >
          <Lightbulb size={18} />
        </button>
        <VoiceInput
          disabled={isProcessing || assistantSpeaking}
          onTranscript={(text) => {
            if (!text.trim()) return
            if (voiceModeEnabled && !isProcessing && !assistantSpeaking) {
              onSend(text)
              return
            }
            setInput((prev) => (prev ? `${prev} ${text}` : text).trim())
          }}
        />
        <div className="min-w-0 flex-1">
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
            className="min-h-[46px] w-full resize-none rounded-xl border border-border bg-input-bg px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/60 sm:min-h-[48px]"
          />
          <p className="mt-1 hidden text-right text-xs text-text-tertiary sm:block">{remaining} characters left</p>
        </div>
        <button
          type="button"
          aria-label="Send message"
          onClick={send}
          disabled={!canSend}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_16px_rgba(239,68,68,0.4)] transition hover:scale-[1.03] disabled:opacity-50 sm:h-12 sm:w-12"
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
    <div className="mt-2 flex max-w-full items-center overflow-hidden">
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
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
        {playing ? 'Pause' : 'Play'}
      </button>
      <VisualBars levels={levels} />
    </div>
  )
}
