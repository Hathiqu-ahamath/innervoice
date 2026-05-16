import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface StoredUser {
  email: string
  name: string
  passwordHash: string
  voiceId: string | null
  createdAt: number
}

interface PublicUser {
  email: string
  name: string
  voiceId: string | null
}

interface AuthContextValue {
  user: PublicUser | null
  isAuthenticated: boolean
  register: (input: { name: string; email: string; password: string }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => void
  setUserVoiceId: (voiceId: string | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USERS_KEY = 'innervoice-users'
const SESSION_KEY = 'innervoice-session'

function hashPassword(password: string): string {
  let hash = 0
  for (let i = 0; i < password.length; i += 1) {
    hash = (hash << 5) - hash + password.charCodeAt(i)
    hash |= 0
  }
  return `iv-${hash}`
}

function readUsers(): Record<string, StoredUser> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}') as Record<string, StoredUser>
  } catch {
    return {}
  }
}

function writeUsers(users: Record<string, StoredUser>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function readSession(): PublicUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PublicUser
  } catch {
    return null
  }
}

function writeSession(user: PublicUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => readSession())

  const register = useCallback(async ({ name, email, password }: { name: string; email: string; password: string }) => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password || !name.trim()) {
      throw new Error('Please fill in your name, email and password.')
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.')
    }
    const users = readUsers()
    if (users[normalizedEmail]) {
      throw new Error('An account with that email already exists. Try logging in.')
    }
    const stored: StoredUser = {
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: hashPassword(password),
      voiceId: null,
      createdAt: Date.now(),
    }
    users[normalizedEmail] = stored
    writeUsers(users)
    const publicUser: PublicUser = { email: stored.email, name: stored.name, voiceId: null }
    writeSession(publicUser)
    setUser(publicUser)
  }, [])

  const login = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const normalizedEmail = email.trim().toLowerCase()
    const users = readUsers()
    const stored = users[normalizedEmail]
    if (!stored || stored.passwordHash !== hashPassword(password)) {
      throw new Error('Invalid email or password.')
    }
    const publicUser: PublicUser = { email: stored.email, name: stored.name, voiceId: stored.voiceId }
    writeSession(publicUser)
    setUser(publicUser)
  }, [])

  const logout = useCallback(() => {
    writeSession(null)
    setUser(null)
  }, [])

  const setUserVoiceId = useCallback((voiceId: string | null) => {
    setUser((current) => {
      if (!current) return current
      const users = readUsers()
      const stored = users[current.email]
      if (stored) {
        stored.voiceId = voiceId
        users[current.email] = stored
        writeUsers(users)
      }
      const next: PublicUser = { ...current, voiceId }
      writeSession(next)
      return next
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      register,
      login,
      logout,
      setUserVoiceId,
    }),
    [login, logout, register, setUserVoiceId, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
