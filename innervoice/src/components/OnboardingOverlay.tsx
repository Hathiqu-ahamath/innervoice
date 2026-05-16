interface Props {
  open: boolean
  step: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onFinish: () => void
}

const STEPS = [
  {
    title: 'Record Your Voice',
    text: 'Speak into your microphone so we can create your InnerVoice profile.',
  },
  {
    title: 'AI Clones It',
    text: 'ElevenLabs creates a digital voice twin to speak your responses back.',
  },
  {
    title: 'Ask Anything',
    text: 'Chat with your future self for calm guidance, clarity, and support.',
  },
]

export function OnboardingOverlay({ open, step, onNext, onBack, onSkip, onFinish }: Props) {
  if (!open) return null

  const last = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border p-6">
        <h2 className="text-xl font-semibold text-text-primary">{current.title}</h2>
        <p className="mt-2 text-sm text-text-secondary">{current.text}</p>
        <div className="mt-4 flex gap-2">
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-2 rounded-full ${index === step ? 'w-8 bg-red-500' : 'w-2 bg-gray-500'}`}
            />
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={onSkip} className="text-sm text-text-tertiary">
            Skip tutorial
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onBack} disabled={step === 0} className="rounded-full border px-4 py-2">
              Back
            </button>
            {last ? (
              <button type="button" onClick={onFinish} className="rounded-full bg-red-600 px-4 py-2 text-white">
                Get Started
              </button>
            ) : (
              <button type="button" onClick={onNext} className="rounded-full bg-red-600 px-4 py-2 text-white">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
