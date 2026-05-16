import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, PhoneOff, Radio, Sparkles, Volume2, X } from 'lucide-react'
import type { Emotion } from '../../types'
import { useAuth } from '../../AuthContext'
import { BreathingVoiceOrb, type OrbEmotion, type OrbState } from '../../components/BreathingVoiceOrb'
import { useLiveConversation } from './useLiveConversation'
import { useVoiceInput } from './useVoiceInput'
import { useVoiceOutput } from './useVoiceOutput'

const SILENCE_AUTO_CLOSE_MS = 18000
const FILLER_DELAY_MS = 700
// After this many empty transcripts in a row, we tell the user their mic
// might be muted instead of just silently looping.
const SILENT_CAPTURE_LIMIT = 3
// How long a "sticky" status message survives before the auto-status effect
// can overwrite it. Lets errors/diagnostics stay visible.
const STICKY_STATUS_MS = 3500

const GREETING_TEXT = "[warm] Hey. [short pause] I am right here. Whenever you are ready, talk to me."
const GREETING_DISPLAY = "Hey. I'm right here. Whenever you're ready, talk to me."

const THINKING_FILLERS = [
  { display: 'Mm, let me sit with that for a sec.', spoken: '[thoughtful] Mm, [short pause] let me sit with that for a sec.' },
  { display: 'Okay, I hear you.', spoken: '[softly] Okay, [short pause] I hear you.' },
  { display: 'Yeah, give me a moment.', spoken: '[gentle exhale] Yeah, [short pause] give me a moment.' },
  { display: 'Hmm, thinking...', spoken: '[thoughtful] Hmm, [short pause] thinking.' },
  { display: 'Right, with you.', spoken: '[warm] Right, [short pause] with you.' },
  { display: 'Mhm, just a sec.', spoken: '[softly] Mhm, [short pause] just a sec.' },
]

function pickFiller() {
  return THINKING_FILLERS[Math.floor(Math.random() * THINKING_FILLERS.length)]
}

// Tiny acknowledgments that should NOT trigger a brand new AI turn. These let
// the user nod along ("yeah", "mhm") without derailing the previous reply.
const BACKCHANNELS = new Set([
  'yeah', 'yes', 'yep', 'yup', 'ok', 'okay', 'k',
  'mhm', 'mmhm', 'mm', 'mmm', 'hm', 'hmm', 'huh',
  'uh huh', 'uhhuh', 'uh-huh', 'mm-hmm',
  'right', 'sure', 'cool', 'nice', 'wow', 'aha',
  'go on', 'continue', 'i see', 'gotcha', 'got it',
  'thanks', 'thank you',
])

function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBackchannel(text: string): boolean {
  const cleaned = normalizeUtterance(text)
  if (!cleaned) return true
  if (BACKCHANNELS.has(cleaned)) return true
  const words = cleaned.split(/\s+/)
  if (words.length <= 2 && words.every((w) => BACKCHANNELS.has(w))) return true
  return false
}

function currentTimestamp() {
  return Date.now()
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

export function LiveVoiceController() {
  const { user } = useAuth()
  const voiceId = user?.voiceId ?? null
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [latestReply, setLatestReply] = useState('')
  const [lastUserCaption, setLastUserCaption] = useState('')
  const [statusDetail, setStatusDetail] = useState('Tap the mic to start live mode.')
  const liveModeRef = useRef(false)
  const sessionActiveRef = useRef(false)
  const lastActivityAtRef = useRef(0)
  const sessionIdRef = useRef(0)
  const lastHandledTranscriptRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const silentCaptureCountRef = useRef(0)
  // Holds a status message we want to keep visible (e.g. "Mic seems muted")
  // even when the auto-status effect would otherwise overwrite it.
  const stickyStatusUntilRef = useRef(0)

  // Re-entrancy + interrupt tracking.
  const isProcessingRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const wasInterruptedRef = useRef(false)
  const pendingFollowupRef = useRef<string>('')
  const lastReplyRef = useRef<{ text: string; emotion: Emotion; display: string } | null>(null)

  const { state, processUserTurn, resetConversation } = useLiveConversation()
  const { isSpeaking, outputLevel, speak, stopSpeaking } = useVoiceOutput()

  const setStickyStatus = useCallback((text: string, ms: number = STICKY_STATUS_MS) => {
    stickyStatusUntilRef.current = Date.now() + ms
    setStatusDetail(text)
  }, [])

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  // Defined below `useVoiceInput`. Forward-declared via a ref so the hook can
  // call it without depending on the not-yet-defined handler.
  const handleTranscriptRef = useRef<(text: string) => void>(() => {})

  const { isSupported, isListening, transcript, inputLevel, startListening, stopListening } = useVoiceInput({
    onSpeechStart: () => {
      // Interrupt support: if AI is mid-sentence, stop it the moment the user
      // starts talking. The transcript that follows will decide whether this
      // was a real interruption or just a "mhm" backchannel.
      if (isSpeakingRef.current) {
        wasInterruptedRef.current = true
        stopSpeaking()
        setStatusDetail("I'm listening...")
      } else {
        setStatusDetail("I'm listening...")
      }
      lastActivityAtRef.current = currentTimestamp()
    },
    onActivity: () => {
      lastActivityAtRef.current = currentTimestamp()
    },
    onError: (message) => setStickyStatus(message),
    onFinalTranscript: (finalText) => {
      silentCaptureCountRef.current = 0
      handleTranscriptRef.current(finalText)
    },
    onSilentCapture: () => {
      silentCaptureCountRef.current += 1
      if (silentCaptureCountRef.current >= SILENT_CAPTURE_LIMIT) {
        setStickyStatus("I can't hear you. Check that your mic isn't muted.")
        silentCaptureCountRef.current = 0
      }
    },
  })

  const speakReply = useCallback(
    async (replyText: string, replyEmotion: Emotion) => {
      setStatusDetail('Speaking...')
      await speak({
        text: replyText,
        emotion: replyEmotion,
        voiceId,
        realtime: false,
      })
    },
    [speak, voiceId],
  )

  const handleTranscript = useCallback(
    async (finalText: string) => {
      if (!liveModeRef.current || !sessionActiveRef.current) return
      const sessionId = sessionIdRef.current
      const normalized = finalText.trim().toLowerCase()
      if (!normalized) return

      // Dedupe the exact same transcript that fires twice within a few seconds
      // (can happen with overlapping recorder chunks).
      const now = currentTimestamp()
      if (
        normalized === lastHandledTranscriptRef.current.text &&
        now - lastHandledTranscriptRef.current.at < 3200
      ) {
        return
      }
      lastHandledTranscriptRef.current = { text: normalized, at: now }
      lastActivityAtRef.current = now

      // Backchannel after we just interrupted the AI: don't start a whole new
      // turn — the user only nodded along. Just keep listening and let the AI
      // settle back into "I'm here" mode.
      if (wasInterruptedRef.current && isBackchannel(finalText)) {
        wasInterruptedRef.current = false
        setStatusDetail("I'm listening...")
        return
      }

      // If we're already mid-turn, append the new utterance to a pending
      // follow-up so we don't drop what the user just added. It will be
      // processed as the next turn.
      if (isProcessingRef.current || isSpeakingRef.current) {
        if (isSpeakingRef.current) {
          wasInterruptedRef.current = true
          stopSpeaking()
        }
        pendingFollowupRef.current = pendingFollowupRef.current
          ? `${pendingFollowupRef.current} ${finalText}`.trim()
          : finalText
        return
      }

      isProcessingRef.current = true
      try {
        // Pull in any queued follow-up so the AI sees the full thought.
        let combined = finalText
        if (pendingFollowupRef.current) {
          combined = `${pendingFollowupRef.current} ${finalText}`.trim()
          pendingFollowupRef.current = ''
        }
        wasInterruptedRef.current = false

        setStatusDetail('Thinking...')
        setLastUserCaption(combined)

        const turnPromise = processUserTurn(combined)

        // Race the LLM against a short human-like filler so silence > 700ms
        // never feels dead.
        const filler = pickFiller()
        let fillerPromise: Promise<void> | null = null
        const fillerTimer = window.setTimeout(() => {
          if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
          if (wasInterruptedRef.current) return
          setStatusDetail(filler.display)
          setLatestReply(filler.display)
          fillerPromise = speak({
            text: filler.spoken,
            emotion: 'neutral',
            voiceId,
            realtime: true,
          })
        }, FILLER_DELAY_MS)

        const turn = await turnPromise
        window.clearTimeout(fillerTimer)
        if (fillerPromise) {
          try { await fillerPromise } catch { /* ignore */ }
        }
        if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
        if (!turn) {
          setStatusDetail("I'm listening...")
          return
        }

        // If user has already interrupted again while we were generating, skip
        // speaking this stale reply and let the new follow-up take priority.
        if (wasInterruptedRef.current || pendingFollowupRef.current) {
          lastReplyRef.current = {
            text: turn.spokenText,
            emotion: turn.emotion,
            display: turn.displayText,
          }
          setLatestReply(turn.displayText)
          return
        }

        lastReplyRef.current = {
          text: turn.spokenText,
          emotion: turn.emotion,
          display: turn.displayText,
        }
        setLatestReply(turn.displayText)
        await speakReply(turn.spokenText, turn.emotion)

        if (liveModeRef.current && sessionIdRef.current === sessionId) {
          setStatusDetail("I'm listening...")
          lastActivityAtRef.current = currentTimestamp()
        }
      } finally {
        isProcessingRef.current = false
        // If anything queued up while we were busy, process it next.
        if (
          liveModeRef.current &&
          sessionActiveRef.current &&
          pendingFollowupRef.current
        ) {
          const next = pendingFollowupRef.current
          pendingFollowupRef.current = ''
          // Defer one tick to let state settle.
          window.setTimeout(() => handleTranscriptRef.current(next), 60)
        }
      }
    },
    [processUserTurn, speak, speakReply, stopSpeaking, voiceId],
  )

  useEffect(() => {
    handleTranscriptRef.current = handleTranscript
  }, [handleTranscript])

  useEffect(() => {
    liveModeRef.current = isLiveMode
  }, [isLiveMode])

  useEffect(() => {
    sessionActiveRef.current = isSessionActive
  }, [isSessionActive])

  useEffect(() => {
    if (!isLiveMode) return
    const timer = window.setInterval(() => {
      if (!liveModeRef.current) return
      if (!isSessionActive) return
      if (state.isProcessing || isSpeaking) return
      const inactiveFor = currentTimestamp() - lastActivityAtRef.current
      if (inactiveFor >= SILENCE_AUTO_CLOSE_MS) {
        setStatusDetail('No voice detected. Session ended.')
        setTimeout(() => {
          if (!liveModeRef.current) return
          sessionIdRef.current += 1
          sessionActiveRef.current = false
          stopListening()
          stopSpeaking()
          setIsSessionActive(false)
          setLatestReply('')
          setLastUserCaption('')
          setStatusDetail('Session ended. Tap Start Session.')
        }, 450)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isLiveMode, isSessionActive, isSpeaking, state.isProcessing, stopListening, stopSpeaking])

  const startSession = useCallback(() => {
    if (sessionActiveRef.current) return
    sessionActiveRef.current = true
    setIsSessionActive(true)
    sessionIdRef.current += 1
    lastActivityAtRef.current = currentTimestamp()
    lastHandledTranscriptRef.current = { text: '', at: 0 }
    silentCaptureCountRef.current = 0
    setStatusDetail('Opening microphone...')
    setLatestReply(GREETING_DISPLAY)
    const sessionId = sessionIdRef.current

    // Speak the greeting through ElevenLabs (v3 audio tags inside GREETING_TEXT
    // give it warmth). This is what makes the popup feel "alive" the moment
    // it opens — without it the user just sees text and assumes nothing works.
    void speak({
      text: GREETING_TEXT,
      emotion: 'neutral',
      voiceId,
      realtime: false,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[live-voice] greeting speak failed', err)
      // ElevenLabs failed -- surface it so the user knows audio output is
      // broken (most common cause: key/quota issue).
      setStickyStatus('Voice output unavailable. Check ElevenLabs key.')
    })

    void startListening().then(() => {
      if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
      // Don't fight the greeting — only flip to "listening" once it has had
      // a moment to start playing.
      window.setTimeout(() => {
        if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
        if (Date.now() < stickyStatusUntilRef.current) return
        setStatusDetail("I'm listening...")
      }, 600)
    })
  }, [setStickyStatus, speak, startListening, voiceId])

  const endSession = useCallback(() => {
    sessionIdRef.current += 1
    sessionActiveRef.current = false
    setIsSessionActive(false)
    stopListening()
    stopSpeaking()
    setLatestReply('')
    setLastUserCaption('')
    setStatusDetail('Session ended. Tap Start Session.')
  }, [stopListening, stopSpeaking])

  const closePopup = useCallback(() => {
    liveModeRef.current = false
    sessionIdRef.current += 1
    sessionActiveRef.current = false
    setIsSessionActive(false)
    setIsLiveMode(false)
    stopListening()
    stopSpeaking()
    setLatestReply('')
    setLastUserCaption('')
    resetConversation()
    setStatusDetail('Tap the mic to start live mode.')
  }, [resetConversation, stopListening, stopSpeaking])

  const openPopupAndStart = useCallback(() => {
    setIsLiveMode(true)
    liveModeRef.current = true
    startSession()
  }, [startSession])

  useEffect(() => {
    if (!isLiveMode) return
    // If we just pushed a sticky message (error, silent-mic warning, etc.)
    // give it a few seconds before the canonical status takes back over.
    if (Date.now() < stickyStatusUntilRef.current) return
    if (!isSessionActive) {
      setStatusDetail('Session ended. Tap Start Session.')
      return
    }
    if (state.isProcessing) setStatusDetail('Thinking...')
    else if (isSpeaking) setStatusDetail('Speaking...')
    else if (isListening) setStatusDetail("I'm listening...")
    else setStatusDetail('Here whenever you are.')
  }, [isLiveMode, isListening, isSessionActive, isSpeaking, state.isProcessing])

  const combinedLevel = useMemo(() => Math.max(inputLevel * 0.9, outputLevel), [inputLevel, outputLevel])

  const orbState: OrbState = useMemo(() => {
    if (isSpeaking) return 'speaking'
    if (state.isProcessing) return 'processing'
    if (isListening) return 'listening'
    return 'idle'
  }, [isListening, isSpeaking, state.isProcessing])

  const orbEmotion: OrbEmotion = useMemo(() => {
    const supported: OrbEmotion[] = ['neutral', 'anxious', 'sad', 'hopeful', 'grateful', 'angry']
    // Look at the most recent user message that carried an emotion; fall back
    // to neutral so the orb stays calm by default.
    for (let i = state.conversationHistory.length - 1; i >= 0; i -= 1) {
      const msg = state.conversationHistory[i]
      if (msg.role !== 'user' || !msg.emotion) continue
      if ((supported as string[]).includes(msg.emotion)) return msg.emotion as OrbEmotion
    }
    return 'neutral'
  }, [state.conversationHistory])

  const [orbSize, setOrbSize] = useState(240)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      // Pick the smaller of width-based and height-based sizing so the orb
      // never pushes the captions + controls off-screen.
      const byWidth = w < 480 ? 180 : w < 768 ? 220 : 260
      const byHeight = Math.max(140, Math.min(280, Math.floor(h * 0.32)))
      setOrbSize(Math.min(byWidth, byHeight))
    }
    handler()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <>
      <AnimatePresence>
        {isLiveMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] flex bg-overlay/95"
          >
            <div className="glass-panel relative flex min-h-dvh w-full flex-col overflow-hidden border-border">
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
                animate={{ scale: [1, 1.15, 1], opacity: [0.22, 0.38, 0.22] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 bottom-8 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl dark:bg-amber-200/10"
                animate={{ scale: [1.08, 0.95, 1.08], opacity: [0.2, 0.36, 0.2] }}
                transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5 sm:py-4">
                <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
                  <Radio size={14} className="text-accent" />
                  Live Voice Mode
                </span>
                <button
                  type="button"
                  aria-label="Close live voice mode"
                  onClick={closePopup}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-start gap-3 overflow-y-auto px-3 py-4 sm:gap-4 sm:px-5 sm:py-6">
                <div className="rounded-2xl border border-border bg-gradient-to-b from-surface-card to-elevated p-3 shadow-[0_10px_40px_rgba(0,0,0,0.08)] sm:p-4">
                  <div className="flex items-center justify-center">
                    <BreathingVoiceOrb
                      state={orbState}
                      emotion={orbEmotion}
                      level={combinedLevel}
                      size={orbSize}
                    />
                  </div>
                  <WaveStrip level={combinedLevel} active={isListening || state.isProcessing || isSpeaking} />
                  <p className="mt-3 text-center text-sm text-text-secondary">{statusDetail}</p>
                  {!isSupported && (
                    <p className="mt-1 text-center text-xs text-danger">Live voice unavailable in this browser</p>
                  )}
                </div>

                {!voiceId && (
                  <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
                    No cloned voice found. Live mode will use browser speech output.
                  </p>
                )}

                <div className="min-h-0 rounded-2xl border border-border bg-surface-card p-3">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
                    <Sparkles size={12} className="text-accent" /> Captions
                  </p>
                  {(transcript || lastUserCaption || latestReply) ? (
                    <div className="mt-2 max-h-[28dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-none">
                      {(transcript || lastUserCaption) && (
                        <p
                          className={`ml-auto max-w-[92%] break-words rounded-2xl border px-3 py-2 text-sm text-text-primary transition sm:max-w-[88%] ${
                            isListening
                              ? 'border-accent/60 bg-accent-soft'
                              : 'border-border bg-elevated'
                          }`}
                        >
                          {transcript || lastUserCaption}
                        </p>
                      )}
                      {latestReply && (
                        <p
                          className={`mr-auto max-w-[92%] break-words rounded-2xl border px-3 py-2 text-sm text-text-primary transition sm:max-w-[88%] ${
                            isSpeaking
                              ? 'border-accent/60 bg-accent-soft'
                              : 'border-border bg-assistant-bubble'
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
                </div>

                {state.lastError && (
                  <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
                    {state.lastError}
                  </p>
                )}
              </div>

              <div className="shrink-0 border-t border-border bg-surface-card/60 px-4 py-2 backdrop-blur-sm sm:px-5 sm:py-3">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-text-tertiary">
                    {state.conversationHistory.length} turns in memory
                  </span>
                  <button
                    type="button"
                    onClick={isSessionActive ? endSession : startSession}
                    className="inline-flex min-h-10 items-center justify-center gap-1 self-end rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary sm:self-auto"
                  >
                    <PhoneOff size={12} />
                    {isSessionActive ? 'End Session' : 'Start Session'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label={isLiveMode ? 'Stop live voice mode' : 'Start live voice mode'}
        onClick={isLiveMode ? closePopup : openPopupAndStart}
        className="fixed bottom-4 right-4 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-accent text-white shadow-[0_0_20px_var(--color-accent-soft)] transition hover:scale-[1.03] sm:bottom-6"
      >
        {isLiveMode ? (isSessionActive ? (isListening ? <Mic size={20} /> : <Volume2 size={20} />) : <MicOff size={20} />) : <MicOff size={20} />}
      </button>
    </>
  )
}
