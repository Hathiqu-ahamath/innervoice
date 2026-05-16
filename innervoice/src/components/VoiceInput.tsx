import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: {
      transcript: string
    }
  }>
}

interface SpeechRecognitionErrorEvent {
  error: string
}

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
  keepListening?: boolean
}

const IGNORED_ERRORS = new Set(['no-speech', 'aborted', 'audio-capture'])

export function VoiceInput({ onTranscript, disabled = false, keepListening = false }: Props) {
  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const shouldListenRef = useRef(false)
  const restartTimerRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const disabledRef = useRef(disabled)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  const RecognitionCtor = useMemo(() => {
    const win = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionInstance
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    }
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
  }, [])

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  const ensureRecognition = useCallback(() => {
    if (!RecognitionCtor) return null
    if (recognitionRef.current) return recognitionRef.current

    const recognition = new RecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText = `${finalText} ${transcript}`.trim()
        } else {
          interimText += transcript
        }
      }
      if (finalText) {
        onTranscriptRef.current(finalText)
      }
      setInterim(interimText)
    }

    recognition.onerror = (event) => {
      const code = event?.error ?? 'unknown'
      if (IGNORED_ERRORS.has(code)) {
        return
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        shouldListenRef.current = false
        setError('Microphone access blocked. Allow it in browser settings.')
        setIsListening(false)
        return
      }
      // For anything else, stay silent and let onend handle restart.
    }

    recognition.onend = () => {
      setInterim('')
      if (!shouldListenRef.current || disabledRef.current) {
        setIsListening(false)
        return
      }
      clearRestartTimer()
      restartTimerRef.current = window.setTimeout(() => {
        try {
          recognitionRef.current?.start()
        } catch {
          // Already running — ignore.
        }
      }, 250)
    }

    recognitionRef.current = recognition
    return recognition
  }, [RecognitionCtor])

  const startListening = () => {
    if (disabled) return
    const recognition = ensureRecognition()
    if (!recognition) return
    shouldListenRef.current = true
    try {
      recognition.start()
    } catch {
      // Already running.
    }
  }

  const stopListening = () => {
    shouldListenRef.current = false
    clearRestartTimer()
    try {
      recognitionRef.current?.abort()
    } catch {
      // ignore
    }
    setIsListening(false)
    setInterim('')
  }

  useEffect(() => {
    if (!keepListening || disabled) {
      shouldListenRef.current = false
      clearRestartTimer()
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignore — onend will clear listening state
      }
      return
    }
    shouldListenRef.current = true
    const recognition = ensureRecognition()
    if (!recognition) return
    try {
      recognition.start()
    } catch {
      // Already running.
    }
  }, [disabled, ensureRecognition, keepListening])

  useEffect(
    () => () => {
      shouldListenRef.current = false
      clearRestartTimer()
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignore
      }
    },
    [],
  )

  if (!RecognitionCtor) {
    return null
  }

  return (
    <div className="relative flex items-center justify-center">
      {interim && (
        <div className="pointer-events-none absolute -top-12 left-1/2 z-10 w-max max-w-[260px] -translate-x-1/2 rounded-full border border-border bg-black/90 px-3 py-1 text-xs text-text-secondary shadow">
          {interim}
        </div>
      )}
      {error && (
        <p className="pointer-events-none absolute -top-12 left-1/2 z-10 w-max max-w-[260px] -translate-x-1/2 whitespace-nowrap rounded-full bg-red-950/90 px-3 py-1 text-xs text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        aria-label={isListening ? 'Stop listening' : 'Start voice input'}
        disabled={disabled}
        onClick={isListening ? stopListening : startListening}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          isListening
            ? 'border-red-400 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.45)]'
            : 'border-border bg-black/70 text-text-secondary hover:border-red-500/60 hover:text-white'
        }`}
      >
        {isListening ? <Mic size={18} /> : <MicOff size={18} />}
        {isListening && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-red-400/60" />
        )}
      </button>
    </div>
  )
}
