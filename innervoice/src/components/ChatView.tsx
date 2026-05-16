import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb, Pause, Play, Radio, Send, Volume2 } from 'lucide-react'
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
  userName?: string
}

const STARTER_CHIPS = [
  'What am I not seeing clearly?',
  'Why do I keep overthinking?',
  'Help me calm down first',
  'What should I stop worrying about?',
]

function VisualBars({ levels }: { levels: number[] }) {
  return (
    <div className="ml-2 hidden items-end gap-[2px] min-[380px]:flex">
      {levels.map((level, i) => (
        <span
          key={`${i}-${Math.round(level * 100)}`}
          className="w-1 rounded bg-accent"
          style={{ height: `${Math.max(4, level * 20)}px` }}
        />
      ))}
    </div>
  )
}

export function ChatView({
  messages,
  isProcessing,
  showThinking,
  thinkingLabel,
  onSend,
  onOpenLive,
  userName,
}: Props) {
  const [input, setInput] = useState('')
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true)
  const [assistantSpeaking, setAssistantSpeaking] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const { levels, connect } = useAudioVisualizer()

  const isLanding = messages.length === 0 && !isProcessing && !showThinking

  const lastAssistantMessageId = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant')?.id,
    [messages],
  )

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages, isProcessing, thinkingLabel])

  const canSend = input.trim().length > 0 && !isProcessing

  const send = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    onSend(text)
    setInput('')
  }

  // Shared bottom input bar used in both landing and active states
  const InputBar = (
    <div className="relative">
      <div className="flex items-end gap-0 rounded-2xl border border-border bg-input-bg ring-0 transition focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30">
        <textarea
          ref={inputRef}
          value={input}
          maxLength={1000}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Say what is on your mind…"
          className="min-h-[48px] flex-1 resize-none bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary sm:text-base"
          style={{ maxHeight: 140, overflowY: 'auto' }}
        />
        {/* Voice mode toggle — subtle pill inside the input bar */}
        <button
          type="button"
          onClick={() => setVoiceModeEnabled((v) => !v)}
          title={voiceModeEnabled ? 'Voice auto-send ON — click to disable' : 'Voice auto-send OFF — click to enable'}
          className={`mx-1 my-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition ${
            voiceModeEnabled
              ? 'border-accent/50 bg-accent-soft text-accent'
              : 'border-border bg-elevated text-text-tertiary'
          }`}
        >
          <Volume2 size={12} />
          {voiceModeEnabled ? 'Voice' : 'Voice'}
        </button>

        {/* Mic button */}
        <div className="my-2 mr-1">
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
        </div>

        {/* Send button */}
        <button
          type="button"
          aria-label="Send"
          onClick={send}
          disabled={!canSend}
          className="my-2 mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_0_12px_var(--color-accent-soft)] transition hover:scale-[1.05] disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )

  // ── LANDING STATE ──────────────────────────────────────────────────────────
  if (isLanding) {
    return (
      <motion.div
        key="landing"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
        className="flex h-full min-h-0 flex-col"
      >
        {/* Greeting — vertically centered in remaining space */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-2 pb-2 pt-4">
          <div className="text-center">
            {userName && (
              <p className="text-sm font-medium text-text-secondary sm:text-base">
                Hi {userName},
              </p>
            )}
            <h1 className="mt-1 text-2xl font-bold leading-tight text-text-primary sm:text-3xl lg:text-4xl">
              Your future self is here.
            </h1>
          </div>

          {/* Live Chat card — prominent, orb animated */}
          {onOpenLive && (
            <motion.button
              type="button"
              onClick={onOpenLive}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="glass-panel flex w-full max-w-md items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent-soft/80 to-elevated px-4 py-3 shadow-[0_0_24px_var(--color-accent-soft)] transition"
            >
              <div className="text-left">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Radio size={11} />
                  Live Voice
                </p>
                <p className="mt-0.5 text-sm font-semibold text-text-primary">
                  Talk to your 3D future self
                </p>
                <p className="text-xs text-text-secondary">
                  Real-time voice · instant replies · your cloned voice
                </p>
              </div>
              <div className="shrink-0">
                <BreathingVoiceOrb state="listening" emotion="hopeful" level={0.35} size={78} />
              </div>
            </motion.button>
          )}

          {/* Input area */}
          <div className="w-full max-w-2xl space-y-3">
            {InputBar}

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onSend(chip)}
                  className="rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                >
                  {chip}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSuggestionsOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
              >
                <Lightbulb size={11} />
                More ideas
              </button>
            </div>
          </div>
        </div>

        <FollowUpSuggestions
          open={suggestionsOpen}
          onClose={() => setSuggestionsOpen(false)}
          onSelect={onSend}
        />
      </motion.div>
    )
  }

  // ── ACTIVE CHAT STATE ──────────────────────────────────────────────────────
  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex h-full min-h-0 flex-col gap-2"
    >
      {/* Message log */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-0.5 py-1"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl border px-3 py-2.5 sm:max-w-[78%] lg:max-w-[66%] ${
                  message.role === 'user'
                    ? 'border-accent/30 bg-accent-soft'
                    : 'border-border bg-assistant-bubble'
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                  {message.text}
                </p>
                {message.emotion && message.role === 'user' && (
                  <p className="mt-1 text-[10px] italic text-text-tertiary">{message.emotion}</p>
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
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {showThinking && (
          <div className="flex justify-start">
            <div className="animate-fade-in rounded-2xl border border-accent/25 bg-elevated px-3 py-2.5 text-sm text-text-secondary">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                {thinkingLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {InputBar}

      <FollowUpSuggestions
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onSelect={onSend}
      />
    </motion.div>
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
    void audioRef.current?.play().catch(() => {})
  }, [autoPlay])

  return (
    <div className="mt-2 flex items-center">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={(e) => { setPlaying(true); onSpeakingChange?.(true); onConnect(e.currentTarget) }}
        onPause={() => { setPlaying(false); onSpeakingChange?.(false) }}
        onEnded={() => { setPlaying(false); onSpeakingChange?.(false) }}
      />
      <button
        type="button"
        onClick={() => {
          const el = audioRef.current
          if (!el) return
          if (el.paused) void el.play()
          else el.pause()
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
        {playing ? 'Pause' : 'Play'}
      </button>
      <VisualBars levels={levels} />
    </div>
  )
}
