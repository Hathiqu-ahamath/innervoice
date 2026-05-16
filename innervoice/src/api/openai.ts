import type { Emotion, Message } from '../types'
import { V3_TAG_PROMPT_HINT } from '../lib/elevenV3Tags'

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_KEY =
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ||
  (import.meta.env.OPENAI_API_KEY as string | undefined)

const MOCK_RESPONSES = [
  '[sighs] I know this feels heavy right now. [thoughtful] Start with one tiny action today and trust that it compounds.',
  '[exhales] You are not behind. [thoughtful] You are building the emotional muscle your future self depends on.',
  '[sighs] Take a breath with me. [whispers] What you are feeling is valid, and you can still choose a kinder next step.',
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
  return `You are the user's Future Self. You are wise, calm, emotionally supportive, and human.
You speak with warmth, emotional nuance, and natural pacing.

${V3_TAG_PROMPT_HINT}

Reply structure:
1. Open with a breath or soft validation (e.g. "[sighs] I hear you...").
2. Validate the user's feeling in one sentence.
3. Offer one grounded insight.
4. End with one gentle next step.

Keep replies 2-5 sentences. Never sound clinical or robotic. Never shame the user.
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
      temperature: 0.85,
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

  return data.choices?.[0]?.message?.content?.trim() ?? '[thoughtful] I am here with you. Tell me more.'
}

export async function getGreetingResponse(userName?: string): Promise<string> {
  const fallback = userName
    ? `[sighs] Hey ${userName}. [thoughtful] I'm right here. [whispers] Whatever's on your mind, we can take it together.`
    : `[sighs] Hey. [thoughtful] I'm right here. [whispers] Take your time and tell me what's on your mind.`

  if (!OPENAI_KEY) {
    return fallback
  }

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.9,
        messages: [
          {
            role: 'system',
            content: `You are the user's Future Self greeting them for the first time in this session.
Be warm, calm, and present.
${V3_TAG_PROMPT_HINT}
2-3 short sentences max.${userName ? ` The user's name is ${userName}.` : ''}`,
          },
          { role: 'user', content: 'Greet me now.' },
        ],
      }),
    })

    if (!response.ok) return fallback
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content?.trim() ?? fallback
  } catch {
    return fallback
  }
}
