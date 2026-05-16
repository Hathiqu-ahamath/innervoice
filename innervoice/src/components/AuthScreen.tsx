import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { AudioLines, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../AuthContext'

type Mode = 'login' | 'register'

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'register') {
        await register({ name, email, password })
      } else {
        await login({ email, password })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex min-h-[420px] flex-col items-center justify-center gap-5"
    >
      <div className="glow-red flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-white/70 text-black">
        <AudioLines />
      </div>
      <div className="text-center">
        <h1 className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-3xl font-bold text-transparent">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {mode === 'login'
            ? 'Log in to talk to your future self.'
            : 'Sign up to train your voice and begin.'}
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        {mode === 'register' && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            className="rounded-xl border border-border bg-black/55 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-red-500/60"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="rounded-xl border border-border bg-black/55 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-red-500/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 chars)"
          required
          minLength={6}
          className="rounded-xl border border-border bg-black/55 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-red-500/60"
        />

        {error && (
          <p className="rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-xs text-red-200">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_18px_rgba(239,68,68,0.4)] transition hover:scale-[1.02] disabled:opacity-50"
        >
          {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null)
          setMode(mode === 'login' ? 'register' : 'login')
        }}
        className="text-xs text-text-secondary underline-offset-4 transition hover:text-white hover:underline"
      >
        {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
      </button>
    </motion.div>
  )
}
