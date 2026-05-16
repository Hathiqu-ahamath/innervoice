import { useCallback, useEffect, useMemo, useState } from 'react'
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
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-purple-500 text-2xl text-white">
        Mic
      </div>
      <h1 className="text-5xl font-bold text-text-primary">InnerVoice</h1>
      <p className="text-text-secondary">Have a real conversation with your future self.</p>
      <button
        type="button"
        onClick={onBegin}
        className="rounded-full bg-amber-500 px-8 py-3 font-semibold text-white"
      >
        Begin Your Journey
      </button>
    </div>
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
            className={`h-2 rounded-full ${active ? 'bg-amber-400' : 'bg-gray-700'} ${step === value ? 'w-10' : 'w-6'}`}
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

  const hasElevenLabsKey = Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY)
  const demoMode = !import.meta.env.VITE_OPENAI_API_KEY

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
      const updatedMessages = [...messages, userMessage]
      setMessages(updatedMessages)
      setIsProcessing(true)
      setError(null)
      try {
        const responseText = await getFutureSelfResponse(updatedMessages)
        const audioBlob = await textToSpeech(responseText, voiceId)
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

  const visibleError = error ?? (!hasElevenLabsKey ? 'Missing VITE_ELEVENLABS_API_KEY in .env. Add it to continue.' : null)

  return (
    <div className="min-h-screen bg-surface text-text-primary transition-colors duration-300">
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

      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 lg:max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">InnerVoice</p>
            {demoMode && <p className="text-xs text-amber-500">Demo Mode</p>}
            {step === 'chat' && <p className="text-xs text-text-tertiary">{currentConversationTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {conversations.length > 0 && (
              <button
                type="button"
                aria-label="Open history"
                onClick={() => setShowHistory(true)}
                className="rounded-full border border-border px-3 py-2 text-xs text-text-secondary"
              >
                History
              </button>
            )}
            {step !== 'home' && <StepIndicator step={step} />}
            <ThemeToggle />
          </div>
        </header>

        {visibleError && (
          <div className="mb-4 rounded-xl border border-red-800/50 bg-red-900/40 p-3 text-sm text-red-100">
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

        <section className="rounded-2xl border border-border bg-surface-card p-4 shadow-sm">
          {step === 'home' && <HomeScreen onBegin={() => setStep('recording')} />}
          {step === 'recording' && (
            <RecordingView
              onUseRecording={async (blob) => {
                if (!hasElevenLabsKey) {
                  setError('Missing ElevenLabs key. Add VITE_ELEVENLABS_API_KEY to .env.')
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
        </section>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
          <p>Powered by OpenAI + ElevenLabs</p>
          <div className="flex gap-2">
            {step === 'chat' && (
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1"
                onClick={() => {
                  setVoiceId(null)
                  setStep('recording')
                  setMessages([])
                }}
              >
                Re-record
              </button>
            )}
            <button type="button" className="rounded-full border border-border px-3 py-1" onClick={resetApp}>
              Start over
            </button>
          </div>
        </footer>
      </main>
    </div>
  )
}
