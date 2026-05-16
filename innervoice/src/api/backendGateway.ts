import { isSupabaseConfigured, supabase } from '../lib/supabase'

interface GatewaySuccess<T> {
  ok: true
  data: T
}

interface GatewayFailure {
  ok: false
  error: string
}

type GatewayResponse<T> = GatewaySuccess<T> | GatewayFailure

export async function invokeGateway<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
  }

  const { data, error } = await supabase.functions.invoke<GatewayResponse<T>>('ai-gateway', {
    body: { action, ...payload },
  })

  if (error) {
    throw new Error(error.message || 'Unable to reach backend gateway.')
  }
  if (!data) {
    throw new Error('Backend gateway returned an empty response.')
  }
  if (!data.ok) {
    throw new Error(data.error || 'Backend gateway failed.')
  }
  return data.data
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

