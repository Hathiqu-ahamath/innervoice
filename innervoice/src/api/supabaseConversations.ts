import { supabase } from './supabase'
import type { Conversation, Message } from '../types'

interface ConversationRow {
  id: string
  owner_id: string
  title: string
  voice_id: string
  messages: Message[]
  created_at: string
  updated_at: string
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    voiceId: row.voice_id,
    messages: row.messages,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function toRow(conversation: Conversation, userId: string): ConversationRow {
  return {
    id: conversation.id,
    owner_id: userId,
    title: conversation.title,
    voice_id: conversation.voiceId,
    messages: conversation.messages,
    created_at: new Date(conversation.createdAt).toISOString(),
    updated_at: new Date(conversation.updatedAt).toISOString(),
  }
}

export async function fetchCloudConversations(userId: string) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('conversations')
    .select('id, owner_id, title, voice_id, messages, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as ConversationRow[]).map(toConversation)
}

export async function upsertCloudConversation(conversation: Conversation, userId: string) {
  if (!supabase) return

  const { error } = await supabase.from('conversations').upsert(toRow(conversation, userId))
  if (error) throw error
}

export async function deleteCloudConversation(id: string, userId: string) {
  if (!supabase) return

  const { error } = await supabase.from('conversations').delete().eq('id', id).eq('owner_id', userId)
  if (error) throw error
}
