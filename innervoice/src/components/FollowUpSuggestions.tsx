import { useState } from 'react'

const BANK = [
  'What should I focus on right now?',
  'How do I handle this anxiety?',
  'What am I avoiding that matters most?',
  'What would future me thank me for today?',
  'How do I be kinder to myself?',
  'What one habit changes everything?',
  'How can I rebuild confidence?',
  'What should I let go of this week?',
]

interface Props {
  onSelect: (text: string) => void
}

export function FollowUpSuggestions({ onSelect }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const suggestions = BANK.slice(0, 3)

  if (dismissed) return null

  return (
    <div className="glass-panel rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-text-secondary">Try asking:</p>
        <button
          type="button"
          aria-label="Dismiss suggestions"
          onClick={() => setDismissed(true)}
          className="text-xs text-text-tertiary"
        >
          Dismiss
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              onSelect(item)
              setDismissed(true)
            }}
            className="rounded-full border border-border bg-black/40 px-3 py-1 text-xs text-text-secondary transition hover:border-red-500/60 hover:text-white"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}
