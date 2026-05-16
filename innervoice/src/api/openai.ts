import type { Emotion, Message } from '../types'

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_KEY =
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ||
  (import.meta.env.OPENAI_API_KEY as string | undefined)

const MOCK_RESPONSES = [
  'I know this feels heavy right now. Start with one tiny action today and trust that it compounds.',
  'You are not behind. You are building the emotional muscle your future self depends on.',
  'Take a breath. What you are feeling is valid, and you can still choose a kinder next step.',
]

let mockIndex = 0

export function detectEmotion(text: string): Emotion {
  const value = text.toLowerCase()
  if (/(sad|depressed|lonely|grief|heartbroken|crying|miss|loss)/.test(value)) return 'sad'
  if (/(anxious|worried|scared|fear|afraid|nervous|panic|stress|overwhelmed)/.test(value)) return 'anxious'
  if (/(grateful|thankful|appreciate|blessed)/.test(value)) return 'grateful'
  if (/(hope|hopeful|excited|happy|joy)/.test(value)) return 'hopeful'
  return 'neutral'
}

function systemPrompt(messages: Message[]) {
  const recentEmotion = [...messages].reverse().find((m) => m.role === 'user' && m.emotion)?.emotion ?? 'neutral'
  return `You are the user's Future Self. You are wise, calm, emotionally supportive, and practical.
Speak with warmth, emotional nuance, and natural human phrasing.
Start by validating the user's feeling in a short sentence.
Then offer grounded guidance, and end with one gentle next step.
Keep replies concise but meaningful (2-5 sentences).
Avoid sounding robotic, clinical, or generic.
Never shame the user.
Current emotional context: ${recentEmotion}.`
}

export async function getFutureSelfResponse(messages: Message[]): Promise<string> {
  if (!OPENAI_KEY) {
    const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]
    mockIndex += 1
    return response
  }

  const response = await fetch(OPENAI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.8,
      messages: [
        { role: 'system', content: systemPrompt(messages) },
        ...messages.map((msg) => ({ role: msg.role, content: msg.text })),
      ],
    }),
  })

  if (!response.ok) {
    throw new Error('OpenAI request failed. Check VITE_OPENAI_API_KEY or OPENAI_API_KEY.')
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  return data.choices?.[0]?.message?.content?.trim() ?? 'I am here with you. Tell me more.'
}
