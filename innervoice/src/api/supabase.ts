import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.SUPABASE_URL as string | undefined)

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined)

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export async function getSupabaseUserId() {
  if (!supabase) return null

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user.id) return session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error

  return data.user?.id ?? null
}
