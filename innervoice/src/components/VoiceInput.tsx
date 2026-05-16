import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
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

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
  keepListening?: boolean
}

export function VoiceInput({ onTranscript, disabled = false, keepListening = false }: Props) {
  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const shouldListenRef = useRef(false)
  const restartTimerRef = useRef<number | null>(null)

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
    if (!recognitionRef.current) {
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
          onTranscript(finalText)
        }
        setInterim(interimText)
      }
      recognition.onerror = () => {
        setIsListening(false)
        setError('Mic input had an issue. Try again.')
      }
      recognition.onend = () => {
        setIsListening(false)
        setInterim('')
        if (shouldListenRef.current && !disabled) {
          clearRestartTimer()
          restartTimerRef.current = window.setTimeout(() => {
            try {
              recognitionRef.current?.start()
              setIsListening(true)
              setError(null)
            } catch {
              setError('Mic is busy. Please speak again.')
            }
          }, 250)
        }
      }
      recognitionRef.current = recognition
    }
    return recognitionRef.current
  }, [RecognitionCtor, disabled, onTranscript])

  const startListening = () => {
    if (disabled) return
    const recognition = ensureRecognition()
    if (!recognition) return
    shouldListenRef.current = true
    try {
      recognition.start()
    } catch {
      setError('Unable to start microphone. Check browser permission.')
    }
  }

  const stopListening = () => {
    shouldListenRef.current = false
    clearRestartTimer()
    recognitionRef.current?.stop()
  }

  useEffect(() => {
    if (!keepListening || disabled) {
      shouldListenRef.current = false
      recognitionRef.current?.stop()
      return
    }
    shouldListenRef.current = true
    const recognition = ensureRecognition()
    if (!recognition) return
    try {
      recognition.start()
    } catch {
      // Recognition may already be running.
    }
  }, [disabled, ensureRecognition, keepListening])

  useEffect(
    () => () => {
      stopListening()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  if (!RecognitionCtor) {
    return null
  }

  return (
    <div className="relative">
      {interim && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-surface-card px-3 py-1 text-xs text-text-secondary shadow">
          {interim}
        </div>
      )}
      {error && <p className="absolute -top-10 left-1/2 -translate-x-1/2 text-xs text-red-400">{error}</p>}
      <button
        type="button"
        aria-label="Use voice input"
        disabled={disabled}
        onClick={isListening ? stopListening : startListening}
        className={`rounded-full p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          isListening ? 'bg-red-500 text-white' : 'bg-surface-card text-text-secondary'
        }`}
      >
        {isListening ? 'Listening' : 'Mic'}
      </button>
    </div>
  )
}
