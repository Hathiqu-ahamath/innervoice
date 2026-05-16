import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { User, X } from 'lucide-react'
import { useAuth } from '../AuthContext'

interface Props {
  open: boolean
  onClose: () => void
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function ProfilePanel({ open, onClose }: Props) {
  const { user, updateProfile } = useAuth()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setName(user.name)
    setBio(user.bio ?? '')
    setError(null)
    setSaved(false)
  }, [open, user])

  if (!user) return null

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(false)
    setSubmitting(true)
    try {
      await updateProfile({ name, bio })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            className="glass-panel glow-red w-full max-w-md rounded-2xl border border-border p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-400 text-lg font-bold text-white">
                  {getInitials(name || user.name)}
                </div>
                <div>
                  <h2 id="profile-title" className="text-lg font-semibold text-text-primary">
                    Your profile
                  </h2>
                  <p className="text-xs text-text-secondary">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close profile"
                onClick={onClose}
                className="rounded-full border border-border bg-elevated p-1.5 text-text-tertiary transition hover:border-red-500/60 hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Display name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-red-500/60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">About you (optional)</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={280}
                  placeholder="A few words about what brings you here…"
                  className="resize-none rounded-xl border border-border bg-input-bg px-4 py-3 text-sm text-text-primary outline-none transition focus:border-red-500/60"
                />
              </label>

              <div className="rounded-xl border border-border bg-elevated px-4 py-3 text-xs text-text-secondary">
                <p>
                  <span className="font-medium text-text-primary">Member since:</span> {memberSince}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-text-primary">Voice:</span>{' '}
                  {user.voiceId ? 'Trained and ready' : 'Not trained yet — go to Voice Train'}
                </p>
              </div>

              {error && (
                <p className="rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-xs text-red-200">{error}</p>
              )}
              {saved && (
                <p className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
                  Profile saved.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_18px_rgba(239,68,68,0.35)] transition hover:scale-[1.02] disabled:opacity-50"
              >
                <User size={16} />
                {submitting ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
