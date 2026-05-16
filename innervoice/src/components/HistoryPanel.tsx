import type { Conversation } from '../types'

interface Props {
  open: boolean
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewConversation: () => void
  onClose: () => void
}

function formatDate(time: number) {
  const date = new Date(time)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function HistoryPanel({
  open,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNewConversation,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" aria-label="Close history" className="flex-1 bg-overlay" onClick={onClose} />
      <aside className="glass-panel w-72 border-l border-border p-4 shadow-xl">
        <h2 className="mb-4 text-sm font-semibold text-text-secondary">Conversations</h2>
        <div className="space-y-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-text-tertiary">No saved conversations yet.</p>
          ) : (
            conversations.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${item.id === activeId ? 'border-accent/60' : 'border-border'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="w-full text-left"
                  tabIndex={0}
                >
                  <p className="line-clamp-2 text-sm text-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {item.messages.length} msgs • {formatDate(item.updatedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => onDelete(item.id)}
                  className="mt-2 text-xs text-danger"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          className="mt-4 w-full rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_0_16px_var(--color-accent-soft)]"
        >
          New Conversation
        </button>
      </aside>
    </div>
  )
}
