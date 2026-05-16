import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AvatarThemePalette } from './lib/avatarPalette'

interface StoredUser {
  email: string
  name: string
  passwordHash: string
  voiceId: string | null
  bio: string
  avatarUrl: string | null
  themeFromAvatar: boolean
  avatarTheme: AvatarThemePalette | null
  createdAt: number
}

export interface PublicUser {
  email: string
  name: string
  voiceId: string | null
  bio: string
  avatarUrl: string | null
  themeFromAvatar: boolean
  avatarTheme: AvatarThemePalette | null
  createdAt: number
}

interface AuthContextValue {
  user: PublicUser | null
  isAuthenticated: boolean
  register: (input: { name: string; email: string; password: string; bio?: string }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => void
  setUserVoiceId: (voiceId: string | null) => void
  updateProfile: (input: {
    name: string
    bio?: string
    avatarUrl?: string | null
    themeFromAvatar?: boolean
    avatarTheme?: AvatarThemePalette | null
  }) => Promise<void>
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
    const raw = JSON.parse(localStorage.getItem(USERS_KEY) || '{}') as Record<string, StoredUser>
    for (const email of Object.keys(raw)) {
      const u = raw[email]
      if (u.bio === undefined) u.bio = ''
      if (u.createdAt === undefined) u.createdAt = Date.now()
      if (u.avatarUrl === undefined) u.avatarUrl = null
      if (u.themeFromAvatar === undefined) u.themeFromAvatar = false
      if (u.avatarTheme === undefined) u.avatarTheme = null
    }
    return raw
  } catch {
    return {}
  }
}

function writeUsers(users: Record<string, StoredUser>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function toPublicUser(stored: StoredUser): PublicUser {
  return {
    email: stored.email,
    name: stored.name,
    voiceId: stored.voiceId,
    bio: stored.bio ?? '',
    avatarUrl: stored.avatarUrl ?? null,
    themeFromAvatar: stored.themeFromAvatar ?? false,
    avatarTheme: stored.avatarTheme ?? null,
    createdAt: stored.createdAt,
  }
}

function readSession(): PublicUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PublicUser
    return {
      ...parsed,
      bio: parsed.bio ?? '',
      avatarUrl: parsed.avatarUrl ?? null,
      themeFromAvatar: parsed.themeFromAvatar ?? false,
      avatarTheme: parsed.avatarTheme ?? null,
      createdAt: parsed.createdAt ?? Date.now(),
    }
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

  const register = useCallback(
    async ({ name, email, password, bio }: { name: string; email: string; password: string; bio?: string }) => {
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
        bio: bio?.trim() ?? '',
        avatarUrl: null,
        themeFromAvatar: false,
        avatarTheme: null,
        createdAt: Date.now(),
      }
      users[normalizedEmail] = stored
      writeUsers(users)
      const publicUser = toPublicUser(stored)
      writeSession(publicUser)
      setUser(publicUser)
    },
    [],
  )

  const login = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const normalizedEmail = email.trim().toLowerCase()
    const users = readUsers()
    const stored = users[normalizedEmail]
    if (!stored || stored.passwordHash !== hashPassword(password)) {
      throw new Error('Invalid email or password.')
    }
    const publicUser = toPublicUser(stored)
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

  const updateProfile = useCallback(
    async ({
      name,
      bio,
      avatarUrl,
      themeFromAvatar,
      avatarTheme,
    }: {
      name: string
      bio?: string
      avatarUrl?: string | null
      themeFromAvatar?: boolean
      avatarTheme?: AvatarThemePalette | null
    }) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('Name cannot be empty.')
      }
      const current = readSession()
      if (!current) return
      const users = readUsers()
      const stored = users[current.email]
      if (!stored) return
      stored.name = trimmedName
      if (bio !== undefined) stored.bio = bio.trim()
      if (avatarUrl !== undefined) {
        stored.avatarUrl = avatarUrl
        if (!avatarUrl) {
          stored.themeFromAvatar = false
          stored.avatarTheme = null
        }
      }
      if (themeFromAvatar !== undefined) stored.themeFromAvatar = themeFromAvatar
      if (avatarTheme !== undefined) stored.avatarTheme = avatarTheme
      if (!stored.avatarUrl) {
        stored.themeFromAvatar = false
        stored.avatarTheme = null
      }
      users[current.email] = stored
      writeUsers(users)
      const next: PublicUser = {
        ...current,
        name: trimmedName,
        bio: stored.bio,
        avatarUrl: stored.avatarUrl ?? null,
        themeFromAvatar: stored.themeFromAvatar ?? false,
        avatarTheme: stored.avatarTheme ?? null,
      }
      writeSession(next)
      setUser(next)
    },
    [],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      register,
      login,
      logout,
      setUserVoiceId,
      updateProfile,
    }),
    [login, logout, register, setUserVoiceId, updateProfile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
