import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AudioLines, Sparkles } from 'lucide-react'
import { cloneVoice, textToSpeech } from './api/elevenlabs'
import { detectEmotion, getFutureSelfResponse } from './api/openai'
import { ChatView } from './components/ChatView'
import { CloningView } from './components/CloningView'
import { HistoryPanel } from './components/HistoryPanel'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { RecordingView } from './components/RecordingView'
import { ThemeToggle } from './components/ThemeToggle'
import { useConversations } from './hooks/useConversations'
import { useVoiceId } from './hooks/useVoiceId'
import type { AppStep, Message } from './types'

const ONBOARDED_KEY = 'innervoice-onboarded'

function HomeScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 flex min-h-[360px] flex-col items-center justify-center gap-4 text-center"
    >
      <div className="glow-red flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-white/70 text-2xl text-black">
        <AudioLines />
      </div>
      <h1 className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-5xl font-bold text-transparent">InnerVoice</h1>
      <p className="text-text-secondary">Have a real conversation with your future self.</p>
      <button
        type="button"
        onClick={onBegin}
        className="rounded-full border border-red-500/40 bg-red-600 px-8 py-3 font-semibold text-white shadow-[0_0_24px_rgba(239,68,68,0.35)] transition hover:scale-[1.02]"
      >
        Begin Your Journey
      </button>
    </motion.div>
  )
}

function StepIndicator({ step }: { step: AppStep }) {
  const steps: AppStep[] = ['recording', 'cloning', 'chat']
  return (
    <div className="flex items-center gap-3">
      {steps.map((value, index) => {
        const active = steps.indexOf(step) >= index
        return (
          <span
            key={value}
            aria-current={step === value ? 'step' : undefined}
            className={`h-2 rounded-full transition-all ${active ? 'bg-red-500' : 'bg-zinc-700'} ${step === value ? 'w-10' : 'w-6'}`}
          />
        )
      })}
    </div>
  )
}

export default function App() {
  const { voiceId, setVoiceId } = useVoiceId()
  const [step, setStep] = useState<AppStep>(() => (voiceId ? 'chat' : 'home'))
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDED_KEY))

  const { conversations, activeId, setActiveId, saveConversation, loadConversation, deleteConversation } =
    useConversations()

  const hasElevenLabsKey = Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY || import.meta.env.ELEVENLABS_API_KEY)
  const demoMode = !(import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY)

  useEffect(() => {
    if (voiceId && messages.length > 0) {
      saveConversation(voiceId, messages)
    }
  }, [messages, saveConversation, voiceId])

  const resetApp = useCallback(() => {
    messages.forEach((message) => {
      if (message.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(message.audioUrl)
    })
    setMessages([])
    setStep('home')
    setError(null)
    setActiveId(null)
  }, [messages, setActiveId])

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
        const responseText = await getFutureSelfResponse(updatedMessages)
        const audioBlob = await textToSpeech(responseText, voiceId, userEmotion)
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: responseText,
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

  return (
    <div className="orb-bg tech-grid relative min-h-screen bg-surface text-text-primary transition-colors duration-300">
      <OnboardingOverlay
        open={showOnboarding}
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

      <HistoryPanel
        open={showHistory}
        conversations={conversations}
        activeId={activeId}
        onClose={() => setShowHistory(false)}
        onDelete={deleteConversation}
        onSelect={(id) => {
          const conversation = loadConversation(id)
          if (!conversation) return
          setVoiceId(conversation.voiceId)
          setMessages(conversation.messages)
          setStep('chat')
          setActiveId(id)
          setShowHistory(false)
        }}
        onNewConversation={() => {
          setActiveId(null)
          setMessages([])
          setStep('chat')
          setShowHistory(false)
        }}
      />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 lg:max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">InnerVoice</p>
            {demoMode && <p className="text-xs text-red-400">Demo Mode</p>}
            {step === 'chat' && <p className="text-xs text-text-tertiary">{currentConversationTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {conversations.length > 0 && (
              <button
                type="button"
                aria-label="Open history"
                onClick={() => setShowHistory(true)}
                className="rounded-full border border-border bg-black/40 px-3 py-2 text-xs text-text-secondary transition hover:border-red-500/60 hover:text-white"
              >
                History
              </button>
            )}
            {step !== 'home' && <StepIndicator step={step} />}
            <ThemeToggle />
          </div>
        </header>

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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-panel glow-red rounded-2xl border border-border p-4 shadow-sm"
        >
          {step === 'home' && <HomeScreen onBegin={() => setStep('recording')} />}
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
                  setVoiceId(newVoiceId)
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
                className="rounded-full border border-border bg-black/40 px-3 py-1 transition hover:border-red-500/60 hover:text-white"
                onClick={() => {
                  setVoiceId(null)
                  setStep('recording')
                  setMessages([])
                }}
              >
                Re-record
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-border bg-black/40 px-3 py-1 transition hover:border-red-500/60 hover:text-white"
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
