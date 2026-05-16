import type { Emotion, Message } from '../types'

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_KEY =
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ||
  (import.meta.env.OPENAI_API_KEY as string | undefined)

const MOCK_RESPONSES = [
  '[soft sigh] I know this feels heavy right now. [warm] Start with one tiny action today and trust that it compounds.',
  '[gentle] You are not behind. [reassuring] You are building the emotional muscle your future self depends on.',
  '[deep breath] Take a breath with me. [softly] What you are feeling is valid, and you can still choose a kinder next step.',
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

CRITICAL — Use ElevenLabs v3 inline audio tags inside your reply to add real emotion:
- Use breath/sigh tags where natural: [sighs], [deep breath], [soft sigh], [exhales]
- Use tone tags: [warm], [softly], [gentle], [reassuring], [thoughtful], [hopeful], [tender]
- Optional pauses: [pause] or [short pause]
- Use 2-4 tags per reply, never more, and place them where a human would naturally pause or breathe.
- Tags must appear in square brackets exactly like [sighs].

Reply structure:
1. Open with a breath or soft validation (e.g. "[soft sigh] I hear you...").
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

  return data.choices?.[0]?.message?.content?.trim() ?? '[gentle] I am here with you. Tell me more.'
}

export async function getGreetingResponse(userName?: string): Promise<string> {
  const fallback = userName
    ? `[soft sigh] Hey ${userName}. [warm] I'm right here. [gentle] Whatever's on your mind, we can take it together.`
    : `[soft sigh] Hey. [warm] I'm right here. [gentle] Take your time and tell me what's on your mind.`

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
Be warm, calm, and present. Use ElevenLabs v3 inline audio tags like [soft sigh], [warm], [gentle], [deep breath], [softly] to add real emotion.
2-3 short sentences max. Tags must be in square brackets.${userName ? ` The user's name is ${userName}.` : ''}`,
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
