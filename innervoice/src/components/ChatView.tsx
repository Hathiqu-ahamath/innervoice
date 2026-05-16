import { useEffect, useMemo, useRef, useState } from 'react'
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
          className="w-1 rounded bg-amber-400"
          style={{ height: `${Math.max(6, level * 24)}px` }}
        />
      ))}
    </div>
  )
}

export function ChatView({ messages, isProcessing, onSend }: Props) {
  const [input, setInput] = useState('')
  const logRef = useRef<HTMLDivElement | null>(null)
  const { levels, connect } = useAudioVisualizer()
  const maxChars = 1000
  const remaining = maxChars - input.length

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
    <div className="flex h-[60vh] min-h-[300px] max-h-[600px] flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold text-text-primary">Your Future Self is Here</h2>
        <p className="text-sm text-text-secondary">Speak your mind - hear their voice.</p>
      </header>

      <div ref={logRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border p-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">
            Your voice has been cloned. Ask your future self a question to begin.
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-slide-up rounded-2xl p-3 ${
              message.role === 'user' ? 'ml-auto max-w-[90%] bg-amber-500/20' : 'mr-auto max-w-[90%] bg-surface-card'
            }`}
          >
            <p className="text-sm text-text-primary">{message.text}</p>
            {message.emotion && message.role === 'user' && (
              <p className="mt-1 text-xs italic text-text-tertiary">Emotion: {message.emotion}</p>
            )}
            {message.audioUrl && (
              <AudioBubble audioUrl={message.audioUrl} onConnect={connect} levels={levels} />
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="animate-fade-in rounded-xl bg-surface-card p-3 text-sm text-text-secondary">Thinking...</div>
        )}
      </div>

      <FollowUpSuggestions onSelect={onSend} />

      <div className="flex items-end gap-2">
        <VoiceInput
          onTranscript={(text) => {
            setInput((prev) => `${prev} ${text}`.trim())
          }}
        />
        <div className="flex-1">
          <textarea
            value={input}
            maxLength={maxChars}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder="Say what is on your mind..."
            className="w-full rounded-xl border border-border bg-surface-card p-3 text-sm text-text-primary outline-none"
          />
          <p className="mt-1 text-right text-xs text-text-tertiary">{remaining} characters left</p>
        </div>
        <button
          type="button"
          aria-label="Send message"
          onClick={send}
          disabled={!canSend}
          className="rounded-full bg-amber-500 p-3.5 font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function AudioBubble({
  audioUrl,
  onConnect,
  levels,
}: {
  audioUrl: string
  onConnect: (audio: HTMLAudioElement) => void
  levels: number[]
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  return (
    <div className="mt-2 flex items-center">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={(event) => {
          setPlaying(true)
          onConnect(event.currentTarget)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        aria-label="Play response audio"
        onClick={() => {
          const element = audioRef.current
          if (!element) return
          if (element.paused) {
            void element.play()
          } else {
            element.pause()
          }
        }}
        className="rounded-full bg-surface px-3 py-1 text-xs text-text-secondary"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <VisualBars levels={levels} />
    </div>
  )
}
