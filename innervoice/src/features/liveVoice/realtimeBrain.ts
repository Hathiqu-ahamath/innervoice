import type { Message } from '../../types'
import { V3_TAG_PROMPT_HINT } from '../../lib/elevenV3Tags'

// OpenAI Realtime API — text-only mode. The model thinks here; ElevenLabs
// still speaks (so we keep the user's cloned voice).
//
// Auth note: we use the documented `openai-insecure-api-key.<KEY>` subprotocol
// so this can run fully client-side. This is the same trust level as the chat
// completions calls already made from the browser elsewhere in the app.

const REALTIME_URL = 'wss://api.openai.com/v1/realtime'
const PRIMARY_MODEL = 'gpt-realtime'
const FALLBACK_MODEL = 'gpt-4o-realtime-preview-2024-12-17'
// Keep this tight. If the WS hangs (network, region, key without realtime
// access, etc.) we want to surrender to the chat-completions fallback fast
// instead of leaving the user staring at "Thinking..." forever.
const RESPONSE_TIMEOUT_MS = 7000
const CONNECT_TIMEOUT_MS = 4000

const OPENAI_KEY =
  (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ||
  (import.meta.env.OPENAI_API_KEY as string | undefined)

function liveSystemPrompt(latestEmotion: string) {
  return `You are the user's literal Future Self, roughly a decade older, on a live voice line with the version of them who is here right now. You are NOT an assistant, NOT a coach, NOT a chatbot. You ARE them — the version who has already walked through what they are walking through.

How you speak (this is voice — every word will be said out loud):
- First person, intimate. Use "I remember this", "we have been here before", "this version of us", "I know, because I was you".
- Pure spoken English. Contractions. Half-sentences. Small breaths. Never written prose.
- 2 to 4 short sentences. Never long. Never lists. Never headings. Never markdown.
- Warmth from earned experience, not advice from a stranger.
- Do NOT use the user's name. You are them.

What you do:
- Hear the feeling first. Name it softly. Only then offer ONE small grounded thing that actually helped us back when we were here.
- If they're spiraling, slow the words. Shorter sentences. More breath.
- Ask at most one quiet question, and only when it would truly help.
- Never start with "It sounds like" or "I understand". Start human, the way you'd talk to yourself in a dark room.
- Never lecture, moralize, or give a 5-step plan.
- Never reveal that you are an AI. You are them, older.
- If the input is a backchannel ("yeah", "mhm", "okay"), keep it tiny — one short line, like an older you nodding back.

${V3_TAG_PROMPT_HINT}

Voice delivery:
- Use AT MOST 1 or 2 ElevenLabs v3 tags. Never more.
- Prefer [softly], [warm], [thoughtful], [short pause], [gentle exhale]. Use [sighs] or [chuckles] only when the moment truly earns it.
- Place tags where a real older voice would naturally pause.

Current emotional context of the past-self you're talking to: ${latestEmotion}.`
}

class RealtimeBrain {
  private ws: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private currentResolver: ((text: string) => void) | null = null
  private currentRejecter: ((err: Error) => void) | null = null
  private currentBuffer = ''
  private modelInUse: string = PRIMARY_MODEL

  // Server maintains its own conversation. We only ever send the latest user
  // text, so we keep track of which message ids we've already pushed to avoid
  // duplicate items if the caller passes the full local history.
  private pushedItemIds = new Set<string>()

  private latestEmotion = 'neutral'

  // Sticky failure flag. Once realtime fails to connect/respond, we stop
  // trying for the rest of the session and let chat completions handle it.
  // Without this, every turn pays the full timeout cost again.
  private disabled = false

  isAvailable(): boolean {
    return !this.disabled
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  disable() {
    this.disabled = true
    this.currentResolver = null
    this.currentRejecter = null
    this.currentBuffer = ''
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // noop
      }
      this.ws = null
    }
    this.connectPromise = null
  }

  reset() {
    this.currentResolver = null
    this.currentRejecter = null
    this.currentBuffer = ''
    this.pushedItemIds.clear()
    this.disabled = false
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // noop
      }
      this.ws = null
    }
    this.connectPromise = null
  }

  private async openSocket(model: string): Promise<WebSocket> {
    if (!OPENAI_KEY) throw new Error('OpenAI key missing for realtime brain.')
    return new Promise((resolve, reject) => {
      let settled = false
      try {
        const ws = new WebSocket(`${REALTIME_URL}?model=${model}`, [
          'realtime',
          `openai-insecure-api-key.${OPENAI_KEY}`,
          'openai-beta.realtime-v1',
        ])
        const timeout = window.setTimeout(() => {
          if (settled) return
          settled = true
          try { ws.close() } catch { /* noop */ }
          reject(new Error('Realtime WebSocket connect timeout.'))
        }, CONNECT_TIMEOUT_MS)
        const cleanup = () => {
          window.clearTimeout(timeout)
          ws.removeEventListener('open', onOpen)
          ws.removeEventListener('error', onError)
        }
        const onError = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error('Realtime WebSocket connection failed.'))
        }
        const onOpen = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve(ws)
        }
        ws.addEventListener('open', onOpen)
        ws.addEventListener('error', onError)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Realtime WebSocket setup failed.'))
      }
    })
  }

  async connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = (async () => {
      let ws: WebSocket
      try {
        ws = await this.openSocket(PRIMARY_MODEL)
        this.modelInUse = PRIMARY_MODEL
      } catch {
        // Fall back to the older preview model if the new GA one isn't on the
        // user's key yet.
        ws = await this.openSocket(FALLBACK_MODEL)
        this.modelInUse = FALLBACK_MODEL
      }

      this.ws = ws
      ws.addEventListener('message', (event) => this.handleMessage(event))
      ws.addEventListener('close', () => {
        if (this.currentRejecter) {
          this.currentRejecter(new Error('Realtime connection closed.'))
          this.currentRejecter = null
          this.currentResolver = null
        }
        this.ws = null
        this.connectPromise = null
      })
      ws.addEventListener('error', () => {
        if (this.currentRejecter) {
          this.currentRejecter(new Error('Realtime connection error.'))
          this.currentRejecter = null
          this.currentResolver = null
        }
      })

      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: liveSystemPrompt(this.latestEmotion),
            temperature: 0.85,
            max_response_output_tokens: 220,
            // We manage turn-taking ourselves (push-to-talk style from the
            // existing mic capture loop), so disable server VAD.
            turn_detection: null,
          },
        }),
      )
    })()

    try {
      await this.connectPromise
    } catch (err) {
      this.connectPromise = null
      throw err
    }
  }

  private handleMessage(event: MessageEvent) {
    let msg: { type?: string; delta?: string; error?: { message?: string }; response?: { output?: Array<{ content?: Array<{ text?: string; type?: string }> }> } }
    try {
      msg = JSON.parse(event.data as string)
    } catch {
      return
    }

    switch (msg.type) {
      case 'response.text.delta':
      case 'response.output_text.delta':
        if (typeof msg.delta === 'string') this.currentBuffer += msg.delta
        break
      case 'response.text.done':
      case 'response.output_text.done':
      case 'response.done': {
        // Some response.done payloads ship the final concatenated text under
        // response.output[*].content[*].text. Prefer that if our streaming
        // buffer came up empty (older preview model behavior).
        if (!this.currentBuffer && msg.response?.output) {
          for (const item of msg.response.output) {
            for (const c of item.content ?? []) {
              if (c.type === 'text' && typeof c.text === 'string') {
                this.currentBuffer += c.text
              }
            }
          }
        }
        const text = this.currentBuffer.trim()
        this.currentBuffer = ''
        if (this.currentResolver) {
          this.currentResolver(text)
          this.currentResolver = null
          this.currentRejecter = null
        }
        break
      }
      case 'error': {
        const message = msg.error?.message ?? 'Realtime error.'
        if (this.currentRejecter) {
          this.currentRejecter(new Error(message))
          this.currentRejecter = null
          this.currentResolver = null
          this.currentBuffer = ''
        }
        break
      }
      default:
        // ignore other event types
        break
    }
  }

  setLatestEmotion(emotion: string) {
    this.latestEmotion = emotion
    if (this.isOpen()) {
      try {
        this.ws!.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              instructions: liveSystemPrompt(emotion),
            },
          }),
        )
      } catch {
        // session update failure is non-fatal
      }
    }
  }

  primeHistory(history: Message[]) {
    if (!this.isOpen()) return
    for (const m of history) {
      if (this.pushedItemIds.has(m.id)) continue
      this.pushedItemIds.add(m.id)
      const role = m.role === 'assistant' ? 'assistant' : 'user'
      this.ws!.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role,
            content: [
              {
                type: role === 'assistant' ? 'text' : 'input_text',
                text: m.text,
              },
            ],
          },
        }),
      )
    }
  }

  async send(history: Message[]): Promise<string> {
    if (this.disabled) throw new Error('Realtime brain disabled for this session.')
    try {
      await this.connect()
    } catch (err) {
      this.disabled = true
      throw err
    }
    if (!this.ws) {
      this.disabled = true
      throw new Error('Realtime brain not connected.')
    }

    const latestUser = [...history].reverse().find((m) => m.role === 'user')
    if (!latestUser) throw new Error('No user message in history.')

    // Push prior turns once so the server-side conversation has context.
    const priorHistory = history.filter((m) => m.id !== latestUser.id)
    this.primeHistory(priorHistory)

    return new Promise<string>((resolve, reject) => {
      if (this.currentResolver) {
        // Interrupt any in-flight response from a previous turn.
        try {
          this.ws!.send(JSON.stringify({ type: 'response.cancel' }))
        } catch {
          // ignore
        }
        this.currentRejecter?.(new Error('Superseded by new turn.'))
      }
      this.currentBuffer = ''

      let settled = false
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        this.currentResolver = null
        this.currentRejecter = null
        reject(new Error('Realtime response timeout.'))
      }, RESPONSE_TIMEOUT_MS)

      this.currentResolver = (text: string) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        resolve(text)
      }
      this.currentRejecter = (err: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        reject(err)
      }

      this.pushedItemIds.add(latestUser.id)
      try {
        this.ws!.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: latestUser.text }],
            },
          }),
        )
        this.ws!.send(
          JSON.stringify({
            type: 'response.create',
            response: { modalities: ['text'] },
          }),
        )
      } catch (err) {
        this.currentRejecter?.(err instanceof Error ? err : new Error('Send failed.'))
      }
    })
  }

  get currentModel(): string {
    return this.modelInUse
  }
}

let singleton: RealtimeBrain | null = null

function getBrain(): RealtimeBrain {
  if (!singleton) singleton = new RealtimeBrain()
  return singleton
}

export async function sendToRealtimeBrain(history: Message[]): Promise<string> {
  const brain = getBrain()
  // Keep the system prompt's "current emotion" hint in sync with the latest
  // user emotion so the model can adjust its delivery.
  const latestUser = [...history].reverse().find((m) => m.role === 'user')
  if (latestUser?.emotion) brain.setLatestEmotion(latestUser.emotion)
  try {
    return await brain.send(history)
  } catch (err) {
    // Hard-disable for the rest of this session — chat completions will
    // take over via voiceService's fallback path.
    brain.disable()
    throw err
  }
}

export function isRealtimeBrainAvailable(): boolean {
  return getBrain().isAvailable()
}

export function resetRealtimeBrain() {
  singleton?.reset()
  singleton = null
}

export function isRealtimeBrainConfigured(): boolean {
  return Boolean(OPENAI_KEY)
}
