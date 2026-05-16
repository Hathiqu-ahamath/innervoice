import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, PhoneOff, Radio, Volume2 } from 'lucide-react'
import { useAuth } from '../../AuthContext'
import { useLiveConversation } from './useLiveConversation'
import { useVoiceInput } from './useVoiceInput'
import { useVoiceOutput } from './useVoiceOutput'

const SILENCE_AUTO_CLOSE_MS = 18000

function AudioPulse({ active }: { active: boolean }) {
  return (
    <div className="flex h-8 items-end justify-center gap-1">
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.span
          key={index}
          className="w-1.5 rounded-full bg-accent"
          animate={
            active
              ? { height: [6, 20 + (index % 2) * 6, 10, 22 - (index % 2) * 5, 6], opacity: [0.5, 1, 0.65, 1, 0.5] }
              : { height: 6, opacity: 0.4 }
          }
          transition={{ duration: 0.8, repeat: Infinity, delay: index * 0.08, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export function LiveVoiceController() {
  const { user } = useAuth()
  const voiceId = user?.voiceId ?? null
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [latestReply, setLatestReply] = useState('')
  const [statusDetail, setStatusDetail] = useState('Tap the mic to start live mode.')
  const liveModeRef = useRef(false)
  const lastActivityAtRef = useRef(Date.now())

  const { state, processUserTurn, resetConversation } = useLiveConversation()
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput()

  const { isSupported, isListening, transcript, startListening, stopListening } = useVoiceInput({
    onSpeechStart: () => {
      // Interrupt support: if user starts talking, cut AI voice immediately.
      if (isSpeaking) stopSpeaking()
      lastActivityAtRef.current = Date.now()
      setStatusDetail('Listening...')
    },
    onActivity: () => {
      lastActivityAtRef.current = Date.now()
    },
    onFinalTranscript: async (finalText) => {
      if (!liveModeRef.current) return
      lastActivityAtRef.current = Date.now()
      setStatusDetail('Processing...')
      stopListening()
      const turn = await processUserTurn(finalText)
      if (!turn) {
        if (liveModeRef.current) {
          setStatusDetail('Listening...')
          startListening()
        }
        return
      }
      setLatestReply(turn.displayText)
      await speak({
        text: turn.spokenText,
        emotion: turn.emotion,
        voiceId,
        realtime: true,
      })
      if (liveModeRef.current) {
        setStatusDetail('Listening...')
        lastActivityAtRef.current = Date.now()
        startListening()
      }
    },
  })

  useEffect(() => {
    liveModeRef.current = isLiveMode
  }, [isLiveMode])

  useEffect(() => {
    if (!isLiveMode) return
    const timer = window.setInterval(() => {
      if (!liveModeRef.current) return
      if (state.isProcessing || isSpeaking) return
      const inactiveFor = Date.now() - lastActivityAtRef.current
      if (inactiveFor >= SILENCE_AUTO_CLOSE_MS) {
        setStatusDetail('No voice detected. Closing live mode...')
        setTimeout(() => {
          if (!liveModeRef.current) return
          stopListening()
          stopSpeaking()
          setIsLiveMode(false)
          setLatestReply('')
          resetConversation()
          setStatusDetail('Tap the mic to start live mode.')
        }, 450)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isLiveMode, isSpeaking, resetConversation, state.isProcessing, stopListening, stopSpeaking])

  const startLiveMode = useCallback(() => {
    setIsLiveMode(true)
    lastActivityAtRef.current = Date.now()
    setStatusDetail('Listening...')
    startListening()
  }, [startListening])

  const stopLiveMode = useCallback(() => {
    setIsLiveMode(false)
    stopListening()
    stopSpeaking()
    setStatusDetail('Tap the mic to start live mode.')
  }, [stopListening, stopSpeaking])

  const endAndReset = useCallback(() => {
    stopLiveMode()
    setLatestReply('')
    resetConversation()
  }, [resetConversation, stopLiveMode])

  const status = useMemo(() => {
    if (!isSupported) return 'Live voice unavailable in this browser'
    if (state.isProcessing) return 'Thinking...'
    if (isSpeaking) return 'Speaking...'
    if (isListening) return 'Listening...'
    return 'Ready'
  }, [isListening, isSpeaking, isSupported, state.isProcessing])

  useEffect(() => {
    if (!isLiveMode) return
    if (state.isProcessing) setStatusDetail('Processing...')
    else if (isSpeaking) setStatusDetail('Speaking...')
    else if (isListening) setStatusDetail('Listening...')
    else setStatusDetail('Ready')
  }, [isLiveMode, isListening, isSpeaking, state.isProcessing])

  return (
    <>
      <AnimatePresence>
        {isLiveMode && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="glass-panel fixed bottom-24 right-4 z-[60] w-[min(92vw,360px)] rounded-2xl border border-border p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Radio size={12} className="text-accent" />
                Live Voice Mode
              </span>
              <span>{status}</span>
            </div>

            <div className="mb-2 rounded-xl border border-border bg-elevated p-2">
              <AudioPulse active={isListening || state.isProcessing || isSpeaking} />
              <p className="mt-1 text-center text-[11px] text-text-secondary">{statusDetail}</p>
            </div>

            {!voiceId && (
              <p className="mb-2 rounded-lg border border-danger/40 bg-danger-soft px-2 py-1 text-xs text-danger">
                No cloned voice found. Live mode will use browser speech output.
              </p>
            )}

            {transcript && (
              <p className="mb-2 rounded-lg border border-border bg-elevated px-2 py-1 text-xs text-text-primary">
                You: {transcript}
              </p>
            )}

            {latestReply && (
              <p className="mb-2 rounded-lg border border-border bg-assistant-bubble px-2 py-1 text-xs text-text-primary">
                Future self: {latestReply}
              </p>
            )}

            {state.lastError && (
              <p className="mb-2 rounded-lg border border-danger/40 bg-danger-soft px-2 py-1 text-xs text-danger">
                {state.lastError}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-text-tertiary">{state.conversationHistory.length} turns in memory</span>
              <button
                type="button"
                onClick={endAndReset}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2 py-1 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
              >
                <PhoneOff size={12} />
                End
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label={isLiveMode ? 'Stop live voice mode' : 'Start live voice mode'}
        onClick={isLiveMode ? stopLiveMode : startLiveMode}
        className="fixed bottom-6 right-4 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-accent text-white shadow-[0_0_20px_var(--color-accent-soft)] transition hover:scale-[1.03]"
      >
        {isLiveMode ? (isListening ? <Mic size={20} /> : <Volume2 size={20} />) : <MicOff size={20} />}
      </button>
    </>
  )
}
