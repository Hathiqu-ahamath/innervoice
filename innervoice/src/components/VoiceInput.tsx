import { useMemo, useRef, useState } from 'react'

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
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
}

export function VoiceInput({ onTranscript }: Props) {
  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const RecognitionCtor = useMemo(() => {
    const win = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionInstance
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    }
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
  }, [])

  if (!RecognitionCtor) {
    return null
  }

  const startListening = () => {
    if (!recognitionRef.current) {
      const recognition = new RecognitionCtor()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.onresult = (event) => {
        let interimText = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            onTranscript(transcript.trim())
          } else {
            interimText += transcript
          }
        }
        setInterim(interimText)
      }
      recognition.onerror = () => {
        setIsListening(false)
      }
      recognition.onend = () => {
        setIsListening(false)
        setInterim('')
      }
      recognitionRef.current = recognition
    }
    recognitionRef.current.start()
    setIsListening(true)
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  return (
    <div className="relative">
      {interim && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-surface-card px-3 py-1 text-xs text-text-secondary shadow">
          {interim}
        </div>
      )}
      <button
        type="button"
        aria-label="Use voice input"
        onClick={isListening ? stopListening : startListening}
        className={`rounded-full p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
          isListening ? 'bg-red-500 text-white' : 'bg-surface-card text-text-secondary'
        }`}
      >
        Mic
      </button>
    </div>
  )
}
