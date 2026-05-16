import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, PhoneOff, Radio, Volume2 } from 'lucide-react'
import { useAuth } from '../../AuthContext'
import { useLiveConversation } from './useLiveConversation'
import { useVoiceInput } from './useVoiceInput'
import { useVoiceOutput } from './useVoiceOutput'

export function LiveVoiceController() {
  const { user } = useAuth()
  const voiceId = user?.voiceId ?? null
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [latestReply, setLatestReply] = useState('')
  const liveModeRef = useRef(false)

  const { state, processUserTurn, resetConversation } = useLiveConversation()
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput()

  const { isSupported, isListening, transcript, startListening, stopListening } = useVoiceInput({
    onSpeechStart: () => {
      // Interrupt support: if user starts talking, cut AI voice immediately.
      if (isSpeaking) stopSpeaking()
    },
    onFinalTranscript: async (finalText) => {
      if (!liveModeRef.current) return
      stopListening()
      const turn = await processUserTurn(finalText)
      if (!turn) {
        if (liveModeRef.current) startListening()
        return
      }
      setLatestReply(turn.displayText)
      await speak({
        text: turn.spokenText,
        emotion: turn.emotion,
        voiceId,
      })
      if (liveModeRef.current) startListening()
    },
  })

  useEffect(() => {
    liveModeRef.current = isLiveMode
  }, [isLiveMode])

  const startLiveMode = useCallback(() => {
    setIsLiveMode(true)
    startListening()
  }, [startListening])

  const stopLiveMode = useCallback(() => {
    setIsLiveMode(false)
    stopListening()
    stopSpeaking()
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

  return (
    <>
      {isLiveMode && (
        <div className="glass-panel fixed bottom-24 right-4 z-[60] w-[min(92vw,360px)] rounded-2xl border border-border p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <Radio size={12} className="text-accent" />
              Live Voice Mode
            </span>
            <span>{status}</span>
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
        </div>
      )}

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
