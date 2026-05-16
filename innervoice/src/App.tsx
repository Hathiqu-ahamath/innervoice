import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { cloneVoice, stripAudioTags, textToSpeech } from './api/elevenlabs'
import { detectEmotion, getFutureSelfResponse, getGreetingResponse } from './api/openai'
import { useAuth } from './AuthContext'
import { AuthScreen } from './components/AuthScreen'
import { ChatView } from './components/ChatView'
import { CloningView } from './components/CloningView'
import { HistoryPanel } from './components/HistoryPanel'
import { Navbar } from './components/Navbar'
import { ProfilePanel } from './components/ProfilePanel'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { RecordingView } from './components/RecordingView'
import { useConversations } from './hooks/useConversations'
import type { AppStep, Message } from './types'

const ONBOARDED_KEY = 'innervoice-onboarded'

function pickInitialStep(isAuthenticated: boolean, voiceId: string | null): AppStep {
  if (!isAuthenticated) return 'auth'
  if (!voiceId) return 'recording'
  return 'chat'
}

export default function App() {
  const { user, isAuthenticated, setUserVoiceId } = useAuth()
  const voiceId = user?.voiceId ?? null

  const [step, setStep] = useState<AppStep>(() => pickInitialStep(isAuthenticated, voiceId))
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDED_KEY))

  const { conversations, activeId, setActiveId, saveConversation, loadConversation, deleteConversation } =
    useConversations()

  const greetedFor = useRef<string | null>(null)

  const hasElevenLabsKey = Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY || import.meta.env.ELEVENLABS_API_KEY)
  const demoMode = !(import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY)

  // Sync step with auth/voice state when those external values change.
  useEffect(() => {
    if (!isAuthenticated) {
      setStep('auth')
      setMessages([])
      return
    }
    if (!voiceId) {
      setStep((current) => (current === 'auth' || current === 'home' ? 'recording' : current))
      return
    }
    setStep((current) => (current === 'auth' ? 'chat' : current))
  }, [isAuthenticated, voiceId])

  useEffect(() => {
    if (voiceId && messages.length > 0) {
      saveConversation(voiceId, messages)
    }
  }, [messages, saveConversation, voiceId])

  const speakGreeting = useCallback(async () => {
    if (!voiceId || !user) return
    if (greetedFor.current === voiceId) return
    greetedFor.current = voiceId
    try {
      setIsProcessing(true)
      const greetingWithTags = await getGreetingResponse(user.name)
      const audioBlob = await textToSpeech(greetingWithTags, voiceId, 'hopeful')
      const greeting: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: stripAudioTags(greetingWithTags),
        timestamp: Date.now(),
        audioUrl: URL.createObjectURL(audioBlob),
      }
      setMessages((prev) => (prev.length === 0 ? [greeting] : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate greeting.')
    } finally {
      setIsProcessing(false)
    }
  }, [user, voiceId])

  // Greet the user once they reach the chat with a cloned voice and no active conversation.
  useEffect(() => {
    if (step !== 'chat') return
    if (!voiceId) return
    if (activeId) return
    if (messages.length > 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void speakGreeting()
  }, [activeId, messages.length, speakGreeting, step, voiceId])

  const resetApp = useCallback(() => {
    messages.forEach((message) => {
      if (message.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(message.audioUrl)
    })
    setMessages([])
    setError(null)
    setActiveId(null)
    greetedFor.current = null
    setStep(isAuthenticated ? (voiceId ? 'chat' : 'recording') : 'auth')
  }, [isAuthenticated, messages, setActiveId, voiceId])

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!voiceId) return
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
        emotion: detectEmotion(text),
      }
      const userEmotion = userMessage.emotion ?? 'neutral'
      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsProcessing(true)
      setError(null)
      try {
        const responseTextWithTags = await getFutureSelfResponse(updatedMessages)
        const audioBlob = await textToSpeech(responseTextWithTags, voiceId, userEmotion)
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: stripAudioTags(responseTextWithTags),
          timestamp: Date.now(),
          audioUrl: URL.createObjectURL(audioBlob),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong while sending your message.')
      } finally {
        setIsProcessing(false)
      }
    },
    [messages, voiceId],
  )

  const currentConversationTitle = useMemo(() => {
    const activeConversation = conversations.find((item) => item.id === activeId)
    return activeConversation?.title ?? 'New Conversation'
  }, [activeId, conversations])

  const visibleError =
    error ??
    (!hasElevenLabsKey
      ? 'Missing ElevenLabs API key in .env. Add VITE_ELEVENLABS_API_KEY or ELEVENLABS_API_KEY.'
      : null)

  const navigate = useCallback(
    (next: AppStep) => {
      if (next === 'chat' && !voiceId) {
        setStep('recording')
        return
      }
      if (next === 'recording') {
        greetedFor.current = null
      }
      setStep(next)
    },
    [voiceId],
  )

  return (
    <div className="orb-bg tech-grid relative min-h-screen bg-surface text-text-primary transition-colors duration-300">
      <OnboardingOverlay
        open={showOnboarding && isAuthenticated}
        step={onboardingStep}
        onNext={() => setOnboardingStep((prev) => Math.min(prev + 1, 2))}
        onBack={() => setOnboardingStep((prev) => Math.max(prev - 1, 0))}
        onSkip={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true')
          setShowOnboarding(false)
        }}
        onFinish={() => {
          localStorage.setItem(ONBOARDED_KEY, 'true')
          setShowOnboarding(false)
        }}
      />

      <ProfilePanel open={showProfile} onClose={() => setShowProfile(false)} />

      <HistoryPanel
        open={showHistory}
        conversations={conversations}
        activeId={activeId}
        onClose={() => setShowHistory(false)}
        onDelete={deleteConversation}
        onSelect={(id) => {
          const conversation = loadConversation(id)
          if (!conversation) return
          setUserVoiceId(conversation.voiceId)
          setMessages(conversation.messages)
          setStep('chat')
          setActiveId(id)
          setShowHistory(false)
          greetedFor.current = conversation.voiceId
        }}
        onNewConversation={() => {
          setActiveId(null)
          setMessages([])
          setStep('chat')
          setShowHistory(false)
          greetedFor.current = null
        }}
      />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 lg:max-w-2xl">
        <Navbar
          step={step}
          hasHistory={conversations.length > 0}
          onNavigate={navigate}
          onOpenHistory={() => setShowHistory(true)}
          onOpenProfile={() => setShowProfile(true)}
        />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
          <div className="flex items-center gap-2">
            {demoMode && <span className="rounded-full border border-red-700/60 bg-red-950/40 px-2 py-0.5 text-red-300">Demo Mode</span>}
            {step === 'chat' && <span>{currentConversationTitle}</span>}
          </div>
        </div>

        {visibleError && (
          <div className="mb-4 rounded-xl border border-red-700/60 bg-red-950/50 p-3 text-sm text-red-100">
            <div className="flex items-start justify-between gap-2">
              <p>{visibleError}</p>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                className="text-xs text-red-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <motion.section
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass-panel glow-red rounded-2xl border border-border p-4 shadow-sm"
        >
          {step === 'auth' && <AuthScreen />}
          {step === 'home' && (
            <div className="flex min-h-[300px] items-center justify-center text-text-secondary">Loading…</div>
          )}
          {step === 'recording' && (
            <RecordingView
              onUseRecording={async (blob) => {
                if (!hasElevenLabsKey) {
                  setError('Missing ElevenLabs key. Add VITE_ELEVENLABS_API_KEY or ELEVENLABS_API_KEY to .env.')
                  return
                }
                setStep('cloning')
                try {
                  const newVoiceId = await cloneVoice(blob)
                  setUserVoiceId(newVoiceId)
                  greetedFor.current = null
                  setStep('chat')
                } catch (err) {
                  setStep('recording')
                  setError(err instanceof Error ? err.message : 'Voice cloning failed.')
                }
              }}
            />
          )}
          {step === 'cloning' && <CloningView />}
          {step === 'chat' && <ChatView messages={messages} isProcessing={isProcessing} onSend={handleSendMessage} />}
        </motion.section>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
          <p className="inline-flex items-center gap-1">
            <Sparkles size={12} className="text-red-400" /> Powered by OpenAI + ElevenLabs
          </p>
          <div className="flex gap-2">
            {step === 'chat' && (
              <button
                type="button"
                className="rounded-full border border-border bg-elevated px-3 py-1 transition hover:border-red-500/60 hover:text-text-primary"
                onClick={() => {
                  setUserVoiceId(null)
                  setStep('recording')
                  setMessages([])
                  greetedFor.current = null
                }}
              >
                Re-record
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-border bg-elevated px-3 py-1 transition hover:border-red-500/60 hover:text-text-primary"
              onClick={resetApp}
            >
              Start over
            </button>
          </div>
        </footer>
      </main>
    </div>
  )
}
