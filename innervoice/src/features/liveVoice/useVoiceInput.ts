import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../../api/speechToText'

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
  const fallbackStreamRef = useRef<MediaStream | null>(null)
  const fallbackRecorderRef = useRef<MediaRecorder | null>(null)
  const fallbackRunningRef = useRef(false)
  const useFallbackRef = useRef(false)

  useEffect(() => {
    const ctor = (window.SpeechRecognition ?? window.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined
    useFallbackRef.current = !ctor
    setIsSupported(Boolean(ctor) || Boolean(navigator.mediaDevices?.getUserMedia))
    if (!ctor) return

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
        onError?.('Speech recognition network issue. Trying recorder fallback...')
        useFallbackRef.current = true
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

  const stopFallback = useCallback(() => {
    fallbackRunningRef.current = false
    if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
      fallbackRecorderRef.current.stop()
    }
    fallbackRecorderRef.current = null
    if (fallbackStreamRef.current) {
      fallbackStreamRef.current.getTracks().forEach((track) => track.stop())
      fallbackStreamRef.current = null
    }
    setIsListening(false)
    setTranscript('')
  }, [])

  const startFallback = useCallback(async () => {
    if (fallbackRunningRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Live voice is not supported in this browser.')
      return
    }
    try {
      fallbackRunningRef.current = true
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      fallbackStreamRef.current = stream
      setIsListening(true)

      const runCycle = () => {
        if (!fallbackRunningRef.current || !fallbackStreamRef.current) return
        const recorder = new MediaRecorder(fallbackStreamRef.current)
        fallbackRecorderRef.current = recorder
        const chunks: BlobPart[] = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = async () => {
          if (!fallbackRunningRef.current) return
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size > 1200) {
            try {
              const text = await transcribeAudio(blob)
              const trimmed = text.trim()
              if (trimmed) {
                onSpeechStart?.()
                onActivity?.()
                setTranscript(trimmed)
                onFinalTranscript(trimmed)
                setTranscript('')
              }
            } catch {
              // keep loop alive even if one transcription fails
            }
          }
          if (fallbackRunningRef.current) {
            runCycle()
          }
        }
        recorder.start()
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop()
        }, 1800)
      }

      runCycle()
    } catch {
      fallbackRunningRef.current = false
      setIsListening(false)
      onError?.('Unable to access microphone for live mode.')
    }
  }, [onActivity, onError, onFinalTranscript, onSpeechStart])

  const startListening = useCallback(() => {
    if (useFallbackRef.current) {
      void startFallback()
      return
    }
    const recognition = recognitionRef.current
    if (!recognition || isListening) return
    manualStopRef.current = false
    try {
      recognition.start()
    } catch {
      useFallbackRef.current = true
      void startFallback()
    }
  }, [isListening, startFallback])

  const stopListening = useCallback(() => {
    stopFallback()
    const recognition = recognitionRef.current
    if (!recognition) return
    manualStopRef.current = true
    recognition.stop()
    setTranscript('')
  }, [stopFallback])

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
  }
}
