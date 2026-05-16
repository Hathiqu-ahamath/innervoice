import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AvatarThemePalette } from './lib/avatarPalette'
import { isSupabaseConfigured, supabase } from './lib/supabase'

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
const CONVERSATIONS_KEY = 'innervoice-conversations'
const MIGRATION_PREFIX = 'innervoice-supabase-migrated'

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

function readStoredConversations() {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<{
      id: string
      title: string
      voiceId: string
      createdAt: number
      updatedAt: number
      messages: Array<{
        id: string
        role: 'user' | 'assistant'
        text: string
        audioUrl?: string
        timestamp: number
        emotion?: string
      }>
    }>
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function ensureProfileForUser(
  authUser: User,
  fallback?: Partial<StoredUser>,
): Promise<PublicUser> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: existing, error: profileError } = await supabase
    .from('profiles')
    .select('email,name,bio,avatar_url,theme_from_avatar,avatar_theme,voice_id,created_at')
    .eq('id', authUser.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (!existing) {
    const createdAtIso = new Date(fallback?.createdAt ?? Date.now()).toISOString()
    const initialProfile = {
      id: authUser.id,
      email: authUser.email ?? fallback?.email ?? '',
      name: fallback?.name ?? authUser.user_metadata?.name ?? 'InnerVoice User',
      bio: fallback?.bio ?? authUser.user_metadata?.bio ?? '',
      avatar_url: fallback?.avatarUrl ?? null,
      theme_from_avatar: fallback?.themeFromAvatar ?? false,
      avatar_theme: fallback?.avatarTheme ?? null,
      voice_id: fallback?.voiceId ?? null,
      created_at: createdAtIso,
    }
    const { error: insertError } = await supabase.from('profiles').upsert(initialProfile, { onConflict: 'id' })
    if (insertError) throw insertError
    return {
      email: initialProfile.email,
      name: initialProfile.name,
      bio: initialProfile.bio,
      avatarUrl: initialProfile.avatar_url,
      themeFromAvatar: initialProfile.theme_from_avatar,
      avatarTheme: initialProfile.avatar_theme as AvatarThemePalette | null,
      voiceId: initialProfile.voice_id,
      createdAt: Date.parse(initialProfile.created_at),
    }
  }

  return {
    email: existing.email ?? authUser.email ?? '',
    name: existing.name ?? authUser.user_metadata?.name ?? 'InnerVoice User',
    bio: existing.bio ?? '',
    avatarUrl: existing.avatar_url ?? null,
    themeFromAvatar: existing.theme_from_avatar ?? false,
    avatarTheme: (existing.avatar_theme as AvatarThemePalette | null) ?? null,
    voiceId: existing.voice_id ?? null,
    createdAt: existing.created_at ? Date.parse(existing.created_at) : Date.now(),
  }
}

async function migrateLocalDataIfNeeded(authUser: User) {
  if (!supabase) return
  const migrationKey = `${MIGRATION_PREFIX}:${authUser.id}`
  if (localStorage.getItem(migrationKey) === 'done') return

  const users = readUsers()
  const localUser = users[authUser.email?.toLowerCase() ?? '']
  if (!localUser) {
    localStorage.setItem(migrationKey, 'done')
    return
  }

  await ensureProfileForUser(authUser, localUser)

  const localConversations = readStoredConversations()
  const relevantConversations = localUser.voiceId
    ? localConversations.filter((conversation) => conversation.voiceId === localUser.voiceId)
    : localConversations

  for (const conversation of relevantConversations) {
    const { error: conversationError } = await supabase.from('conversations').upsert(
      {
        id: conversation.id,
        user_id: authUser.id,
        title: conversation.title,
        voice_id: conversation.voiceId,
        created_at: new Date(conversation.createdAt).toISOString(),
        updated_at: new Date(conversation.updatedAt).toISOString(),
      },
      { onConflict: 'id' },
    )
    if (conversationError) throw conversationError

    if (!conversation.messages.length) continue
    const rows = conversation.messages.map((message) => ({
      id: message.id,
      conversation_id: conversation.id,
      role: message.role,
      text: message.text,
      audio_url: message.audioUrl ?? null,
      emotion: message.emotion ?? null,
      ts: message.timestamp,
      created_at: new Date(message.timestamp).toISOString(),
    }))
    const { error: messageError } = await supabase.from('messages').upsert(rows, { onConflict: 'id' })
    if (messageError) throw messageError
  }

  localStorage.setItem(migrationKey, 'done')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => readSession())

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return

    let cancelled = false

    const syncUser = async (authUser: User | null) => {
      if (!authUser) {
        writeSession(null)
        if (!cancelled) setUser(null)
        return
      }

      try {
        await migrateLocalDataIfNeeded(authUser)
        const profile = await ensureProfileForUser(authUser)
        writeSession(profile)
        if (!cancelled) setUser(profile)
      } catch (error) {
        const fallback = readSession()
        if (!cancelled) setUser(fallback)
      }
    }

    void supabase.auth.getUser().then(({ data }) => syncUser(data.user ?? null))
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const register = useCallback(
    async ({ name, email, password, bio }: { name: string; email: string; password: string; bio?: string }) => {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail || !password || !name.trim()) {
        throw new Error('Please fill in your name, email and password.')
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name.trim(),
            bio: bio?.trim() ?? '',
          },
        },
      })

      if (error) throw error
      const authUser = data.user
      if (!authUser) throw new Error('Registration failed. Please try again.')

      const profile = await ensureProfileForUser(authUser, {
        email: normalizedEmail,
        name: name.trim(),
        bio: bio?.trim() ?? '',
        createdAt: Date.now(),
      })

      writeSession(profile)
      setUser(profile)
    },
    [],
  )

  const login = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) throw error
    const authUser = data.user
    if (!authUser) throw new Error('Invalid email or password.')

    await migrateLocalDataIfNeeded(authUser)
    const profile = await ensureProfileForUser(authUser)
    writeSession(profile)
    setUser(profile)
  }, [])

  const logout = useCallback(() => {
    if (supabase) {
      void supabase.auth.signOut()
    }
    writeSession(null)
    setUser(null)
  }, [])

  const setUserVoiceId = useCallback((voiceId: string | null) => {
    setUser((current) => {
      if (!current) return current
      const client = supabase
      if (client) {
        void client.auth.getUser().then(({ data }) => {
          if (!data.user) return
          void client.from('profiles').update({ voice_id: voiceId }).eq('id', data.user.id)
        })
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
      const current = readSession() ?? user
      if (!current) return

      if (!supabase) throw new Error('Supabase is not configured.')
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) return

      const nextAvatarUrl = avatarUrl !== undefined ? avatarUrl : current.avatarUrl
      const nextThemeFromAvatar =
        nextAvatarUrl && themeFromAvatar !== undefined ? themeFromAvatar : nextAvatarUrl ? current.themeFromAvatar : false
      const nextAvatarTheme = nextAvatarUrl ? (avatarTheme !== undefined ? avatarTheme : current.avatarTheme) : null

      const { error } = await supabase
        .from('profiles')
        .update({
          name: trimmedName,
          bio: bio !== undefined ? bio.trim() : current.bio,
          avatar_url: nextAvatarUrl,
          theme_from_avatar: nextThemeFromAvatar,
          avatar_theme: nextAvatarTheme,
        })
        .eq('id', authData.user.id)

      if (error) throw error

      const next: PublicUser = {
        ...current,
        name: trimmedName,
        bio: bio !== undefined ? bio.trim() : current.bio,
        avatarUrl: nextAvatarUrl ?? null,
        themeFromAvatar: nextThemeFromAvatar ?? false,
        avatarTheme: nextAvatarTheme ?? null,
      }
      writeSession(next)
      setUser(next)
    },
    [user],
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
