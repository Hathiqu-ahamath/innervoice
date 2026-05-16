/** Tags documented for Eleven v3 — https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices */
const CANONICAL_TAGS = new Set([
  'laughs',
  'laughs harder',
  'starts laughing',
  'wheezing',
  'laughing',
  'chuckles',
  'whispers',
  'whisper',
  'sighs',
  'exhales',
  'exhales sharply',
  'inhales deeply',
  'clears throat',
  'sarcastic',
  'curious',
  'excited',
  'crying',
  'snorts',
  'mischievously',
  'giggling',
  'happy',
  'sad',
  'angry',
  'annoyed',
  'appalled',
  'thoughtful',
  'surprised',
  'short pause',
  'long pause',
  'pause',
  'muttering',
  'swallows',
  'gulps',
])

/** Map GPT-friendly phrases to v3 tags Eleven actually interprets. */
const TAG_ALIASES: Record<string, string | null> = {
  'soft sigh': 'sighs',
  sigh: 'sighs',
  'deep breath': 'exhales',
  breath: 'exhales',
  softly: 'whispers',
  soft: 'whispers',
  gentle: 'whispers',
  warm: 'thoughtful',
  reassuring: 'thoughtful',
  tender: 'thoughtful',
  hopeful: 'thoughtful',
  calm: 'thoughtful',
  'warm tone': 'thoughtful',
}

function canonicalizeTag(inner: string): string | null {
  const key = inner.trim().toLowerCase()
  if (TAG_ALIASES[key] === null) return null
  if (TAG_ALIASES[key]) return TAG_ALIASES[key]!
  if (CANONICAL_TAGS.has(key)) return key
  return null
}

/**
 * Normalize bracket tags for Eleven v3 / text-to-dialogue.
 * Unknown tags are removed so the model does not read "[warm]" as words.
 */
export function normalizeV3AudioTags(text: string): string {
  const normalized = text.replace(/\[([^\]]+)\]/g, (_match, inner: string) => {
    const tag = canonicalizeTag(inner)
    if (!tag) return ''
    return `[${tag}]`
  })

  return normalized.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim()
}

export const V3_TAG_PROMPT_HINT = `Use ONLY these Eleven v3 audio tags (square brackets, exact spelling):
Voice: [sighs] [exhales] [whispers] [laughs] [chuckles] [clears throat]
Emotion: [curious] [thoughtful] [excited] [sad] [crying] [mischievously] [sarcastic]
Pauses: [short pause] [long pause]
Place 2-4 tags before the phrase they modify, e.g. "[sighs] I hear you." or "Stay with me. [exhales]"
Do NOT use [warm], [gentle], [soft sigh], or [deep breath] — they will not work.`
