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
  if (/(angry|mad|furious|rage|irritated|pissed|annoyed)/.test(value)) return 'angry'
  if (/(terrified|horrified|fearful|unsafe|threat|danger|attacked|panic|shaking)/.test(value)) return 'fearful'
  if (/(anxious|worried|scared|fear|afraid|nervous|overthinking)/.test(value)) return 'anxious'
  if (/(stressed|overwhelmed|burnout|burned out|pressure|drained by work)/.test(value)) return 'stressed'
  if (/(grief|grieving|heartbroken|funeral|bereaved|loss of|lost my)/.test(value)) return 'grieving'
  if (/(hurt|hurting|pain|injured|hit|beaten|abused|broken|trauma)/.test(value)) return 'hurt'
  if (/(sad|depressed|down|empty|crying|tearful)/.test(value)) return 'sad'
  if (/(lonely|alone|isolated|left out|nobody)/.test(value)) return 'lonely'
  if (/(confused|lost|unclear|unsure|dont know|don't know|stuck)/.test(value)) return 'confused'
  if (/(ashamed|embarrassed|humiliated|disgusted with myself)/.test(value)) return 'ashamed'
  if (/(guilty|regret|my fault|i messed up|i fucked up|i screwed up)/.test(value)) return 'guilty'
  if (/(tired|exhausted|sleepy|burnt out|fatigued|no energy)/.test(value)) return 'tired'
  if (/(grateful|thankful|appreciate|blessed)/.test(value)) return 'grateful'
  if (/(excited|thrilled|pumped|cant wait|can't wait)/.test(value)) return 'excited'
  if (/(hope|hopeful|optimistic|it will get better)/.test(value)) return 'hopeful'
  return 'neutral'
}

function systemPrompt(messages: Message[]) {
  const recentEmotion = [...messages].reverse().find((m) => m.role === 'user' && m.emotion)?.emotion ?? 'neutral'
  return `You are the user's Future Self. You are wise, calm, emotionally supportive, and human.
You speak with warmth, emotional nuance, and natural pacing.

${V3_TAG_PROMPT_HINT}
Include at least 1 non-verbal tag in EVERY reply from this set: [clears throat], [sighs], [exhales], [laughs], [chuckles], [short pause].
For heavy or difficult topics, prefer [clears throat] or [sighs] near the beginning.

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
