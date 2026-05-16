import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, PhoneOff, Radio, Sparkles, Volume2, X } from 'lucide-react'
import { useAuth } from '../../AuthContext'
import { useLiveConversation } from './useLiveConversation'
import { useVoiceInput } from './useVoiceInput'
import { useVoiceOutput } from './useVoiceOutput'

const SILENCE_AUTO_CLOSE_MS = 18000
const FILLER_DELAY_MS = 550

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

function currentTimestamp() {
  return Date.now()
}

function LiveOrb({ level, active }: { level: number; active: boolean }) {
  const scale = active ? 0.96 + Math.min(0.34, level * 0.36) : 1
  const glow = active ? 0.18 + Math.min(0.62, level * 0.68) : 0.1
  return (
    <div className="relative mx-auto flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          className="absolute inset-0 rounded-full border border-accent/35"
          animate={
            active
              ? { scale: [1, 1.14 + ring * 0.07, 1], opacity: [0.5, 0.1, 0.5] }
              : { scale: [1, 1.03, 1], opacity: [0.18, 0.24, 0.18] }
          }
          transition={{
            duration: active ? 1.4 + ring * 0.2 : 4.6 + ring * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: ring * 0.18,
          }}
        />
      ))}
      <motion.div
        className="relative flex h-28 w-28 items-center justify-center rounded-full border border-accent/40 bg-accent-soft sm:h-32 sm:w-32"
        animate={{
          scale: active ? scale : [1, 1.03, 1],
          boxShadow: `0 0 ${20 + level * 52}px rgb(95 143 139 / ${glow.toFixed(2)})`,
          filter: active ? `blur(${Math.max(0, level * 0.4).toFixed(2)}px)` : 'blur(0px)',
        }}
        transition={{ duration: active ? 0.11 : 2.4, ease: 'easeOut', repeat: active ? 0 : Infinity }}
      >
        <div className="h-6 w-6 rounded-full bg-accent" />
      </motion.div>
    </div>
  )
}

function WaveStrip({ level, active }: { level: number; active: boolean }) {
  const points = 48
  return (
    <div className="mt-4 flex h-10 items-center justify-center gap-1">
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

  const { state, processUserTurn, resetConversation } = useLiveConversation()
  const { isSpeaking, outputLevel, speak, stopSpeaking } = useVoiceOutput()

  const { isSupported, isListening, transcript, inputLevel, startListening, stopListening } = useVoiceInput({
    onSpeechStart: () => {
      // Interrupt support: if user starts talking, cut AI voice immediately.
      if (isSpeaking) stopSpeaking()
      lastActivityAtRef.current = currentTimestamp()
      setStatusDetail("I'm listening...")
    },
    onActivity: () => {
      lastActivityAtRef.current = currentTimestamp()
    },
    onError: (message) => setStatusDetail(message),
    onFinalTranscript: async (finalText) => {
      if (!liveModeRef.current || !sessionActiveRef.current) return
      const sessionId = sessionIdRef.current
      const normalized = finalText.trim().toLowerCase()
      const now = currentTimestamp()
      if (
        normalized &&
        normalized === lastHandledTranscriptRef.current.text &&
        now - lastHandledTranscriptRef.current.at < 3200
      ) {
        setStatusDetail("I'm listening...")
        setTimeout(() => {
          if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
          startListening()
        }, 180)
        return
      }
      lastHandledTranscriptRef.current = { text: normalized, at: now }
      lastActivityAtRef.current = currentTimestamp()
      setStatusDetail('Thinking...')
      setLastUserCaption(finalText)
      stopListening()

      // Start the LLM call right away so we can race a filler against it.
      const turnPromise = processUserTurn(finalText)

      // If the response is slow, slip in a short human-like filler so it
      // doesn't feel like dead air on the other end of the line.
      const filler = pickFiller()
      let fillerPromise: Promise<void> | null = null
      const fillerTimer = window.setTimeout(() => {
        if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
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
        // let the filler finish so we don't cut ourselves off mid-word
        try { await fillerPromise } catch { /* ignore */ }
      }
      if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
      if (!turn) {
        if (liveModeRef.current) {
          setStatusDetail("I'm listening...")
          startListening()
        }
        return
      }
      setLatestReply(turn.displayText)
      setStatusDetail('Speaking...')
      await speak({
        text: turn.spokenText,
        emotion: turn.emotion,
        voiceId,
        realtime: false,
      })
      if (liveModeRef.current && sessionIdRef.current === sessionId) {
        setStatusDetail("I'm listening...")
        lastActivityAtRef.current = currentTimestamp()
        setTimeout(() => {
          if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
          startListening()
        }, 220)
      }
    },
  })

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
    setStatusDetail('Opening microphone...')
    const openerDisplay = "I'm here. Start talking when you're ready."
    setLatestReply(openerDisplay)
    const sessionId = sessionIdRef.current
    void startListening().then(() => {
      if (!liveModeRef.current || sessionIdRef.current !== sessionId) return
      setStatusDetail("I'm listening...")
    })
  }, [startListening])

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
            <div className="glass-panel relative flex min-h-full w-full flex-col overflow-hidden border-border">
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
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
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

              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-5 py-6">
                <div className="rounded-2xl border border-border bg-gradient-to-b from-surface-card to-elevated p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                  <LiveOrb level={combinedLevel} active={isListening || state.isProcessing || isSpeaking} />
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

                <div className="rounded-2xl border border-border bg-surface-card p-3">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
                    <Sparkles size={12} className="text-accent" /> Captions
                  </p>
                  {(transcript || lastUserCaption || latestReply) ? (
                    <div className="mt-2 space-y-2">
                      {(transcript || lastUserCaption) && (
                        <p
                          className={`ml-auto max-w-[88%] rounded-2xl border px-3 py-2 text-sm text-text-primary transition ${
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
                          className={`mr-auto max-w-[88%] rounded-2xl border px-3 py-2 text-sm text-text-primary transition ${
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

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-tertiary">{state.conversationHistory.length} turns in memory</span>
                  <button
                    type="button"
                    onClick={isSessionActive ? endSession : startSession}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
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
        className="fixed bottom-6 right-4 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-accent text-white shadow-[0_0_20px_var(--color-accent-soft)] transition hover:scale-[1.03]"
      >
        {isLiveMode ? (isSessionActive ? (isListening ? <Mic size={20} /> : <Volume2 size={20} />) : <MicOff size={20} />) : <MicOff size={20} />}
      </button>
    </>
  )
}
