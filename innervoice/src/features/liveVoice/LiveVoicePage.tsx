import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Hand, PhoneOff, Radio, Sparkles } from 'lucide-react'
import type { Emotion } from '../../types'
import { useAuth } from '../../AuthContext'
import { BreathingVoiceOrb, type OrbEmotion, type OrbState } from '../../components/BreathingVoiceOrb'
import { useLiveConversation } from './useLiveConversation'
import { useVoiceInput } from './useVoiceInput'
import { useVoiceOutput } from './useVoiceOutput'

interface Props {
  onLeave: () => void
}

const SILENCE_AUTO_CLOSE_MS = 20000
const FILLER_DELAY_MS = 700
const SILENT_CAPTURE_LIMIT = 3
const STICKY_STATUS_MS = 3500

const GREETING_TEXT = '[warm] Hey. [short pause] I am right here. Whenever you are ready, talk to me.'
const GREETING_DISPLAY = "Hey. I'm right here. Whenever you're ready, talk to me."

const THINKING_FILLERS = [
  { display: '…', spoken: '[thoughtful] Mmmm.' },
  { display: '…', spoken: '[hesitant] Uhhhh.' },
  { display: '…', spoken: '[thinking] Yhhhh.' },
  { display: '…', spoken: '[hesitant] Errrr.' },
  { display: '…', spoken: '[thoughtful] Emmm.' },
  { display: '…', spoken: '[thinking] Hmmmm.' },
]

function pickFiller() {
  return THINKING_FILLERS[Math.floor(Math.random() * THINKING_FILLERS.length)]
}

const BACKCHANNELS = new Set([
  'yeah', 'yes', 'yep', 'yup', 'ok', 'okay', 'k',
  'mhm', 'mmhm', 'mm', 'mmm', 'hm', 'hmm', 'huh',
  'uh huh', 'uhhuh', 'uh-huh', 'mm-hmm',
  'right', 'sure', 'cool', 'nice', 'wow', 'aha',
  'go on', 'continue', 'i see', 'gotcha', 'got it',
  'thanks', 'thank you',
])

function normalizeUtterance(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim()
}

function isBackchannel(text: string): boolean {
  const cleaned = normalizeUtterance(text)
  if (!cleaned) return true
  if (BACKCHANNELS.has(cleaned)) return true
  const words = cleaned.split(/\s+/)
  if (words.length <= 2 && words.every((w) => BACKCHANNELS.has(w))) return true
  return false
}

function WaveStrip({ level, active }: { level: number; active: boolean }) {
  const points = 48
  return (
    <div className="mt-3 flex h-8 items-center justify-center gap-1 sm:mt-4 sm:h-10">
      {Array.from({ length: points }).map((_, i) => {
        const wave = Math.sin(i / 4) * 0.5 + 0.5
        const height = active ? 4 + Math.max(2, level * 30 * wave) : 4
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-accent/80"
            animate={{ height, opacity: active ? 0.55 + wave * 0.35 : 0.35 }}
            transition={{ duration: active ? 0.08 : 0.2, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}

export function LiveVoicePage({ onLeave }: Props) {
  const { user } = useAuth()
  const voiceId = user?.voiceId ?? null

  const [isSessionActive, setIsSessionActive] = useState(false)
  const [latestReply, setLatestReply] = useState('')
  const [lastUserCaption, setLastUserCaption] = useState('')
  const [statusDetail, setStatusDetail] = useState('Starting session…')

  const sessionActiveRef = useRef(false)
  const lastActivityAtRef = useRef(0)
  const sessionIdRef = useRef(0)
  const lastHandledTranscriptRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const silentCaptureCountRef = useRef(0)
  const stickyStatusUntilRef = useRef(0)
  const isProcessingRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const wasInterruptedRef = useRef(false)
  const pendingFollowupRef = useRef<string>('')

  const { state, processUserTurn, resetConversation } = useLiveConversation()
  const { isSpeaking, outputLevel, speak, stopSpeaking } = useVoiceOutput()

  const setStickyStatus = useCallback((text: string, ms = STICKY_STATUS_MS) => {
    stickyStatusUntilRef.current = Date.now() + ms
    setStatusDetail(text)
  }, [])

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  const handleTranscriptRef = useRef<(text: string) => void>(() => {})

  const { isSupported, isListening, transcript, inputLevel, startListening, stopListening } =
    useVoiceInput({
      onSpeechStart: () => {
        lastActivityAtRef.current = Date.now()
        setStatusDetail("I'm listening...")
      },
      onActivity: () => {
        lastActivityAtRef.current = Date.now()
      },
      onError: (message) => setStickyStatus(message),
      onFinalTranscript: (finalText) => {
        silentCaptureCountRef.current = 0
        handleTranscriptRef.current(finalText)
      },
      onSilentCapture: () => {
        silentCaptureCountRef.current += 1
        if (silentCaptureCountRef.current >= SILENT_CAPTURE_LIMIT) {
          setStickyStatus("I can't hear you — check that your mic isn't muted.")
          silentCaptureCountRef.current = 0
        }
      },
    })

  // Speak a reply, pausing the mic around it so the AI voice isn't
  // accidentally transcribed as user input.
  const speakReply = useCallback(
    async (replyText: string, replyEmotion: Emotion, sessionId: number) => {
      // Stop recording first — prevents echo pickup.
      stopListening()
      setStatusDetail('Speaking...')
      await speak({ text: replyText, emotion: replyEmotion, voiceId, realtime: false })

      // Restart mic after speaking, only if the session is still active.
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return
      if (Date.now() < stickyStatusUntilRef.current) return
      await startListening()
      if (sessionActiveRef.current && sessionIdRef.current === sessionId) {
        setStatusDetail("I'm listening...")
        lastActivityAtRef.current = Date.now()
      }
    },
    [speak, startListening, stopListening, voiceId],
  )

  // Interrupt: tap the orb while the AI is speaking.
  const interruptAndListen = useCallback(() => {
    if (!isSpeakingRef.current) return
    wasInterruptedRef.current = true
    stopSpeaking()
    setStatusDetail("I'm listening...")
    void startListening()
  }, [startListening, stopSpeaking])

  const handleTranscript = useCallback(
    async (finalText: string) => {
      if (!sessionActiveRef.current) return
      const sessionId = sessionIdRef.current
      const normalized = finalText.trim().toLowerCase()
      if (!normalized) return

      const now = Date.now()
      if (
        normalized === lastHandledTranscriptRef.current.text &&
        now - lastHandledTranscriptRef.current.at < 3200
      ) {
        return
      }
      lastHandledTranscriptRef.current = { text: normalized, at: now }
      lastActivityAtRef.current = now

      if (wasInterruptedRef.current && isBackchannel(finalText)) {
        wasInterruptedRef.current = false
        setStatusDetail("I'm listening...")
        return
      }

      if (isProcessingRef.current) {
        pendingFollowupRef.current = pendingFollowupRef.current
          ? `${pendingFollowupRef.current} ${finalText}`.trim()
          : finalText
        return
      }

      isProcessingRef.current = true
      try {
        let combined = finalText
        if (pendingFollowupRef.current) {
          combined = `${pendingFollowupRef.current} ${finalText}`.trim()
          pendingFollowupRef.current = ''
        }
        wasInterruptedRef.current = false
        setStatusDetail('Thinking...')
        setLastUserCaption(combined)

        const turnPromise = processUserTurn(combined)

        const filler = pickFiller()
        let fillerSpeaking = false
        const fillerTimer = window.setTimeout(async () => {
          if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return
          if (wasInterruptedRef.current) return
          setStatusDetail(filler.display)
          setLatestReply(filler.display)
          fillerSpeaking = true
          stopListening()
          await speak({ text: filler.spoken, emotion: 'neutral', voiceId, realtime: true }).catch(() => {})
          fillerSpeaking = false
        }, FILLER_DELAY_MS)

        const turn = await turnPromise
        window.clearTimeout(fillerTimer)
        if (fillerSpeaking) {
          stopSpeaking()
          fillerSpeaking = false
        }

        if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return
        if (!turn) {
          await startListening()
          setStatusDetail("I'm listening...")
          return
        }

        if (wasInterruptedRef.current || pendingFollowupRef.current) {
          setLatestReply(turn.displayText)
          await startListening()
          return
        }

        setLatestReply(turn.displayText)
        await speakReply(turn.spokenText, turn.emotion, sessionId)

        if (sessionActiveRef.current && sessionIdRef.current === sessionId) {
          setStatusDetail("I'm listening...")
          lastActivityAtRef.current = Date.now()
        }
      } finally {
        isProcessingRef.current = false
        if (sessionActiveRef.current && pendingFollowupRef.current) {
          const next = pendingFollowupRef.current
          pendingFollowupRef.current = ''
          window.setTimeout(() => handleTranscriptRef.current(next), 60)
        }
      }
    },
    [processUserTurn, speak, speakReply, startListening, stopListening, stopSpeaking, voiceId],
  )

  useEffect(() => {
    handleTranscriptRef.current = handleTranscript
  }, [handleTranscript])

  // Auto-close after long silence
  useEffect(() => {
    if (!isSessionActive) return
    const timer = window.setInterval(() => {
      if (!isSessionActive || state.isProcessing || isSpeaking) return
      if (Date.now() - lastActivityAtRef.current >= SILENCE_AUTO_CLOSE_MS) {
        sessionIdRef.current += 1
        sessionActiveRef.current = false
        stopListening()
        stopSpeaking()
        setIsSessionActive(false)
        setLatestReply('')
        setLastUserCaption('')
        setStickyStatus('No voice detected. Session ended.', 8000)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isSessionActive, isSpeaking, setStickyStatus, state.isProcessing, stopListening, stopSpeaking])

  // Start session on mount
  useEffect(() => {
    let cancelled = false
    sessionActiveRef.current = true
    setIsSessionActive(true)
    sessionIdRef.current += 1
    const sessionId = sessionIdRef.current
    lastActivityAtRef.current = Date.now()
    lastHandledTranscriptRef.current = { text: '', at: 0 }
    silentCaptureCountRef.current = 0
    setLatestReply(GREETING_DISPLAY)
    setStatusDetail('Speaking...')

    void (async () => {
      try {
        await speak({ text: GREETING_TEXT, emotion: 'neutral', voiceId, realtime: false })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[live-voice] greeting failed', err)
        setStickyStatus('Voice output unavailable. Check ElevenLabs key.')
      }
      if (cancelled || !sessionActiveRef.current || sessionIdRef.current !== sessionId) return
      setStatusDetail('Opening microphone...')
      await startListening()
      if (cancelled || !sessionActiveRef.current || sessionIdRef.current !== sessionId) return
      if (Date.now() < stickyStatusUntilRef.current) return
      setStatusDetail("I'm listening...")
    })()

    return () => {
      cancelled = true
      sessionActiveRef.current = false
      sessionIdRef.current += 1
      stopListening()
      stopSpeaking()
      resetConversation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endSession = useCallback(() => {
    sessionIdRef.current += 1
    sessionActiveRef.current = false
    setIsSessionActive(false)
    stopListening()
    stopSpeaking()
    setLatestReply('')
    setLastUserCaption('')
    setStatusDetail('Session ended.')
  }, [stopListening, stopSpeaking])

  const restartSession = useCallback(() => {
    sessionIdRef.current += 1
    sessionActiveRef.current = true
    setIsSessionActive(true)
    lastActivityAtRef.current = Date.now()
    lastHandledTranscriptRef.current = { text: '', at: 0 }
    silentCaptureCountRef.current = 0
    setLatestReply(GREETING_DISPLAY)
    const sessionId = sessionIdRef.current
    void (async () => {
      setStatusDetail('Speaking...')
      try {
        await speak({ text: GREETING_TEXT, emotion: 'neutral', voiceId, realtime: false })
      } catch { /* already warned on mount */ }
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return
      setStatusDetail('Opening microphone...')
      await startListening()
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return
      setStatusDetail("I'm listening...")
    })()
  }, [speak, startListening, voiceId])

  // Status auto-update (respects sticky messages)
  useEffect(() => {
    if (Date.now() < stickyStatusUntilRef.current) return
    if (!isSessionActive) return
    if (state.isProcessing) setStatusDetail('Thinking...')
    else if (isSpeaking) setStatusDetail('Speaking...')
    else if (isListening) setStatusDetail("I'm listening...")
    else if (!isListening && !isSpeaking && !state.isProcessing) setStatusDetail('Here with you.')
  }, [isListening, isSessionActive, isSpeaking, state.isProcessing])

  const combinedLevel = useMemo(() => Math.max(inputLevel * 0.9, outputLevel), [inputLevel, outputLevel])

  const orbState: OrbState = useMemo(() => {
    if (isSpeaking) return 'speaking'
    if (state.isProcessing) return 'processing'
    if (isListening) return 'listening'
    return 'idle'
  }, [isListening, isSpeaking, state.isProcessing])

  const orbEmotion: OrbEmotion = useMemo(() => {
    const supported: OrbEmotion[] = ['neutral', 'anxious', 'sad', 'hopeful', 'grateful', 'angry']
    for (let i = state.conversationHistory.length - 1; i >= 0; i -= 1) {
      const msg = state.conversationHistory[i]
      if (msg.role !== 'user' || !msg.emotion) continue
      if ((supported as string[]).includes(msg.emotion)) return msg.emotion as OrbEmotion
    }
    return 'neutral'
  }, [state.conversationHistory])

  const [orbSize, setOrbSize] = useState(240)
  useEffect(() => {
    const handler = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const byWidth = w < 480 ? 180 : w < 768 ? 220 : 260
      const byHeight = Math.max(140, Math.min(280, Math.floor(h * 0.32)))
      setOrbSize(Math.min(byWidth, byHeight))
    }
    handler()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Ambient glow blobs */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed -left-24 top-32 h-64 w-64 rounded-full bg-accent/15 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed -right-24 bottom-20 h-72 w-72 rounded-full bg-amber-300/10 blur-3xl dark:bg-amber-200/8"
        animate={{ scale: [1.08, 0.95, 1.08], opacity: [0.15, 0.28, 0.15] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Header strip */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Radio size={14} className="text-accent" />
          Live Voice
        </span>
        <span className="text-xs text-text-tertiary">{state.conversationHistory.length} turns</span>
      </div>

      {/* Orb card */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-surface-card to-elevated p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
        {/* Orb — tap to interrupt while AI is speaking */}
        <div className="flex items-center justify-center">
          <motion.button
            type="button"
            aria-label={isSpeaking ? 'Tap to interrupt' : orbState}
            onClick={isSpeaking ? interruptAndListen : undefined}
            className={isSpeaking ? 'cursor-pointer rounded-full outline-none' : 'cursor-default rounded-full'}
            whileTap={isSpeaking ? { scale: 0.94 } : {}}
          >
            <BreathingVoiceOrb state={orbState} emotion={orbEmotion} level={combinedLevel} size={orbSize} />
          </motion.button>
        </div>

        {/* Interrupt hint */}
        {isSpeaking && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-center text-xs text-accent"
          >
            <Hand size={11} className="mr-1 inline" />
            Tap orb to interrupt
          </motion.p>
        )}

        <WaveStrip level={combinedLevel} active={isListening || state.isProcessing || isSpeaking} />
        <p className="mt-3 text-center text-sm text-text-secondary">{statusDetail}</p>
        {!isSupported && (
          <p className="mt-1 text-center text-xs text-danger">Live voice unavailable in this browser</p>
        )}
        {!voiceId && (
          <p className="mt-1 text-center text-xs text-danger">No cloned voice — using browser speech</p>
        )}
      </div>

      {/* Captions */}
      <div className="min-h-0 flex-1 rounded-2xl border border-border bg-surface-card p-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
          <Sparkles size={12} className="text-accent" /> Captions
        </p>
        {transcript || lastUserCaption || latestReply ? (
          <div className="mt-2 max-h-[35dvh] space-y-2 overflow-y-auto pr-1">
            {(transcript || lastUserCaption) && (
              <p
                className={`ml-auto max-w-[92%] break-words rounded-2xl border px-3 py-2 text-sm text-text-primary transition sm:max-w-[88%] ${
                  isListening ? 'border-accent/60 bg-accent-soft' : 'border-border bg-elevated'
                }`}
              >
                {transcript || lastUserCaption}
              </p>
            )}
            {latestReply && (
              <p
                className={`mr-auto max-w-[92%] break-words rounded-2xl border px-3 py-2 text-sm text-text-primary transition sm:max-w-[88%] ${
                  isSpeaking ? 'border-accent/60 bg-accent-soft' : 'border-border bg-assistant-bubble'
                }`}
              >
                {latestReply}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text-tertiary">
            Start speaking and captions will appear here.
          </p>
        )}
        {state.lastError && (
          <p className="mt-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
            {state.lastError}
          </p>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-4 py-2 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
        >
          ← Back to Chat
        </button>
        <button
          type="button"
          onClick={isSessionActive ? endSession : restartSession}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-4 py-2 text-xs text-text-secondary transition hover:border-danger/60 hover:text-danger"
        >
          <PhoneOff size={12} />
          {isSessionActive ? 'End Session' : 'Restart'}
        </button>
      </div>
    </div>
  )
}
