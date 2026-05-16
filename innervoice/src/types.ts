export type AppStep = 'auth' | 'home' | 'recording' | 'cloning' | 'chat'

export type Emotion = 'neutral' | 'anxious' | 'sad' | 'hopeful' | 'grateful'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  audioUrl?: string
  timestamp: number
  emotion?: Emotion
}

export interface Conversation {
  id: string
  title: string
  voiceId: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}
