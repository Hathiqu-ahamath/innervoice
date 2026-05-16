import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, PhoneOff, Radio, Volume2, X } from 'lucide-react'
import { useAuth } from '../../AuthContext'
import { useLiveConversation } from './useLiveConversation'
import { useVoiceInput } from './useVoiceInput'
import { useVoiceOutput } from './useVoiceOutput'

const SILENCE_AUTO_CLOSE_MS = 18000

function LiveOrb({ level, active }: { level: number; active: boolean }) {
  const scale = 0.96 + Math.min(0.28, level * 0.3)
  const glow = 0.16 + Math.min(0.52, level * 0.58)
  return (
    <div className="relative mx-auto flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          className="absolute inset-0 rounded-full border border-accent/35"
          animate={
            active
              ? { scale: [1, 1.12 + ring * 0.06, 1], opacity: [0.48, 0.15, 0.48] }
              : { scale: 1, opacity: 0.2 }
          }
          transition={{
            duration: 1.8 + ring * 0.24,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: ring * 0.18,
          }}
        />
      ))}
      <motion.div
        className="relative flex h-28 w-28 items-center justify-center rounded-full border border-accent/40 bg-accent-soft sm:h-32 sm:w-32"
        animate={{ scale, boxShadow: `0 0 ${20 + level * 42}px rgb(95 143 139 / ${glow.toFixed(2)})` }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
      >
        <div className="h-6 w-6 rounded-full bg-accent" />
      </motion.div>
    </div>
  )
}

export function LiveVoiceController() {
  const { user } = useAuth()
  const voiceId = user?.voiceId ?? null
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [latestReply, setLatestReply] = useState('')
  const [lastUserCaption, setLastUserCaption] = useState('')
  const [statusDetail, setStatusDetail] = useState('Tap the mic to start live mode.')
  const [inputLevel, setInputLevel] = useState(0)
  const liveModeRef = useRef(false)
  const lastActivityAtRef = useRef(Date.now())
  const micStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const micMeterRafRef = useRef<number | null>(null)

  const { state, processUserTurn, resetConversation } = useLiveConversation()
  const { isSpeaking, outputLevel, speak, stopSpeaking } = useVoiceOutput()

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
      setLastUserCaption(finalText)
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
    const stopInputMeter = () => {
      if (micMeterRafRef.current !== null) {
        cancelAnimationFrame(micMeterRafRef.current)
        micMeterRafRef.current = null
      }
      if (micAnalyserRef.current) {
        try {
          micAnalyserRef.current.disconnect()
        } catch {
          // noop
        }
        micAnalyserRef.current = null
      }
      if (micContextRef.current) {
        void micContextRef.current.close().catch(() => {})
        micContextRef.current = null
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop())
        micStreamRef.current = null
      }
      setInputLevel(0)
    }

    if (!isLiveMode || !navigator.mediaDevices?.getUserMedia) {
      stopInputMeter()
      return
    }

    let cancelled = false
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        micStreamRef.current = stream
        const context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 128
        const source = context.createMediaStreamSource(stream)
        source.connect(analyser)
        micContextRef.current = context
        micAnalyserRef.current = analyser
        const data = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          if (!micAnalyserRef.current) return
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i += 1) {
            const n = (data[i] - 128) / 128
            sum += n * n
          }
          const rms = Math.sqrt(sum / data.length)
          setInputLevel(Math.min(1, rms * 5))
          micMeterRafRef.current = requestAnimationFrame(tick)
        }
        micMeterRafRef.current = requestAnimationFrame(tick)
      })
      .catch(() => {
        setInputLevel(0)
      })

    return () => {
      cancelled = true
      stopInputMeter()
    }
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
          setLastUserCaption('')
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
    setLastUserCaption('')
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
            <div className="glass-panel relative flex min-h-full w-full flex-col border-border">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
                  <Radio size={14} className="text-accent" />
                  Live Voice Mode
                </span>
                <button
                  type="button"
                  aria-label="Close live voice mode"
                  onClick={endAndReset}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-5 py-6">
                <div className="rounded-2xl border border-border bg-elevated p-4">
                  <LiveOrb level={combinedLevel} active={isListening || state.isProcessing || isSpeaking} />
                  <p className="mt-3 text-center text-sm text-text-secondary">{statusDetail}</p>
                  <p className="mt-1 text-center text-xs text-text-tertiary">{status}</p>
                </div>

                {!voiceId && (
                  <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger">
                    No cloned voice found. Live mode will use browser speech output.
                  </p>
                )}

                <div className="rounded-2xl border border-border bg-surface-card p-3">
                  <p className="text-xs font-medium text-text-tertiary">Captions</p>
                  <p className="mt-2 rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text-primary">
                    <span className="mr-2 text-xs text-text-tertiary">Me:</span>
                    {transcript || lastUserCaption || '...'}
                  </p>
                  <p className="mt-2 rounded-lg border border-border bg-assistant-bubble px-3 py-2 text-sm text-text-primary">
                    <span className="mr-2 text-xs text-text-tertiary">You:</span>
                    {latestReply || '...'}
                  </p>
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
                    onClick={endAndReset}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/60 hover:text-text-primary"
                  >
                    <PhoneOff size={12} />
                    End Session
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
        onClick={isLiveMode ? stopLiveMode : startLiveMode}
        className="fixed bottom-6 right-4 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-accent text-white shadow-[0_0_20px_var(--color-accent-soft)] transition hover:scale-[1.03]"
      >
        {isLiveMode ? (isListening ? <Mic size={20} /> : <Volume2 size={20} />) : <MicOff size={20} />}
      </button>
    </>
  )
}
