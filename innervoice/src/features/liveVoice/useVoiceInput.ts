import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionAlt {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionAlt

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor
    SpeechRecognition?: SpeechRecognitionCtor
  }
}

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void
  onSpeechStart?: () => void
  onActivity?: () => void
  onError?: (message: string) => void
  autoRestart?: boolean
}

export function useVoiceInput({
  onFinalTranscript,
  onSpeechStart,
  onActivity,
  onError,
  autoRestart = false,
}: UseVoiceInputOptions) {
  const recognitionRef = useRef<SpeechRecognitionAlt | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const manualStopRef = useRef(false)

  useEffect(() => {
    const ctor = (window.SpeechRecognition ?? window.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined
    if (!ctor) return
    setIsSupported(true)
    const recognition: SpeechRecognitionAlt = new ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => {
      setIsListening(false)
      if (autoRestart && !manualStopRef.current) {
        setTimeout(() => {
          try {
            recognition.start()
          } catch {
            // noop
          }
        }, 180)
      }
    }
    recognition.onspeechstart = () => {
      onSpeechStart?.()
      onActivity?.()
    }
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const finalText = text.trim()
          if (finalText) {
            onActivity?.()
            onFinalTranscript(finalText)
          }
          setTranscript('')
        } else {
          interim += text
        }
      }
      if (interim) {
        onActivity?.()
        setTranscript(interim.trim())
      }
    }

    recognition.onerror = (event: { error?: string }) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        manualStopRef.current = true
        onError?.('Microphone permission is blocked for live mode.')
      } else if (event.error === 'network') {
        onError?.('Speech recognition network issue. Trying again...')
      } else if (event.error === 'no-speech') {
        onError?.('No speech detected. Keep speaking naturally...')
      }
      if (!manualStopRef.current) {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    return () => {
      manualStopRef.current = true
      recognition.stop()
      recognitionRef.current = null
    }
  }, [autoRestart, onActivity, onError, onFinalTranscript, onSpeechStart])

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition || isListening) return
    manualStopRef.current = false
    try {
      recognition.start()
    } catch {
      // Browser may throw if already started; ignore.
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    manualStopRef.current = true
    recognition.stop()
    setTranscript('')
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
  }
}
