export interface ThemeColorSet {
  accent: string
  accentHover: string
  accentSoft: string
  accentMuted: string
  orbPrimary: string
  orbSecondary: string
  surface: string
  surfaceCard: string
  assistantBubble: string
  border: string
}

export interface AvatarThemePalette {
  light: ThemeColorSet
  dark: ThemeColorSet
}

const THEME_KEYS = [
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-soft',
  '--color-accent-muted',
  '--color-orb-primary',
  '--color-orb-secondary',
  '--color-surface',
  '--color-surface-card',
  '--color-assistant-bubble',
  '--color-border',
] as const

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read image for theme colors.'))
    img.src = dataUrl
  })
}

function rgbToHsl(r: number, g: number, b: number): [h: number, s: number, l: number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      default:
        h = ((r - g) / d + 4) / 6
    }
  }

  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function mixHex(base: string, tint: string, amount: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const [br, bg, bb] = parse(base)
  const [tr, tg, tb] = parse(tint)
  const r = Math.round(br + (tr - br) * amount)
  const g = Math.round(bg + (tg - bg) * amount)
  const b = Math.round(bb + (tb - bb) * amount)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function extractDominantHsl(img: HTMLImageElement): [h: number, s: number, l: number] {
  const size = 56
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return [200, 0.35, 0.45]

  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  let sumH = 0
  let sumS = 0
  let sumL = 0
  let weight = 0

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 120) continue

    const [h, s, l] = rgbToHsl(r, g, b)
    if (l < 0.1 || l > 0.9 || s < 0.12) continue

    const w = s * (1 - Math.abs(l - 0.45))
    sumH += h * w
    sumS += s * w
    sumL += l * w
    weight += w
  }

  if (weight < 0.01) {
    return [200, 0.32, 0.45]
  }

  const h = sumH / weight
  const s = Math.min(0.58, Math.max(0.28, sumS / weight))
  const l = Math.min(0.55, Math.max(0.32, sumL / weight))
  return [h, s, l]
}

function buildColorSet(h: number, s: number, mode: 'light' | 'dark'): ThemeColorSet {
  const accent =
    mode === 'light' ? hslToHex(h, s * 0.92, 0.4) : hslToHex(h, s * 0.75, 0.62)
  const accentHover =
    mode === 'light' ? hslToHex(h, s, 0.34) : hslToHex(h, s * 0.8, 0.7)
  const accentRgb =
    mode === 'light' ? hslToHex(h, s * 0.9, 0.4) : hslToHex(h, s * 0.75, 0.62)

  const baseSurface = mode === 'light' ? '#f3efe6' : '#1a2229'
  const baseCard = mode === 'light' ? '#faf7f1' : '#222b34'
  const baseBubble = mode === 'light' ? '#ebe6dc' : '#252f38'
  const baseBorder = mode === 'light' ? '#ddd6c8' : '#35404c'

  const surface = mixHex(baseSurface, accentRgb, mode === 'light' ? 0.12 : 0.08)
  const surfaceCard = mixHex(baseCard, accentRgb, mode === 'light' ? 0.08 : 0.06)
  const assistantBubble = mixHex(baseBubble, accentRgb, 0.1)
  const border = mixHex(baseBorder, accentRgb, 0.15)

  const orbPrimary =
    mode === 'light'
      ? `rgb(${parseInt(accentRgb.slice(1, 3), 16)} ${parseInt(accentRgb.slice(3, 5), 16)} ${parseInt(accentRgb.slice(5, 7), 16)} / 0.22)`
      : `rgb(${parseInt(accentRgb.slice(1, 3), 16)} ${parseInt(accentRgb.slice(3, 5), 16)} ${parseInt(accentRgb.slice(5, 7), 16)} / 0.2)`

  const orbSecondary =
    mode === 'light'
      ? `rgb(${parseInt(accentRgb.slice(1, 3), 16)} ${parseInt(accentRgb.slice(3, 5), 16)} ${parseInt(accentRgb.slice(5, 7), 16)} / 0.1)`
      : `rgb(${parseInt(accentRgb.slice(1, 3), 16)} ${parseInt(accentRgb.slice(3, 5), 16)} ${parseInt(accentRgb.slice(5, 7), 16)} / 0.12)`

  const [ar, ag, ab] = [
    parseInt(accentRgb.slice(1, 3), 16),
    parseInt(accentRgb.slice(3, 5), 16),
    parseInt(accentRgb.slice(5, 7), 16),
  ]

  return {
    accent,
    accentHover,
    accentSoft: `rgb(${ar} ${ag} ${ab} / ${mode === 'light' ? 0.14 : 0.16})`,
    accentMuted: `rgb(${ar} ${ag} ${ab} / ${mode === 'light' ? 0.35 : 0.4})`,
    orbPrimary,
    orbSecondary,
    surface,
    surfaceCard,
    assistantBubble,
    border,
  }
}

export function buildPaletteFromHue(h: number, s: number): AvatarThemePalette {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.min(0.58, Math.max(0.28, s))
  return {
    light: buildColorSet(hue, sat, 'light'),
    dark: buildColorSet(hue, sat, 'dark'),
  }
}

export async function extractPaletteFromDataUrl(dataUrl: string): Promise<AvatarThemePalette> {
  const img = await loadImage(dataUrl)
  const [h, s] = extractDominantHsl(img)
  return buildPaletteFromHue(h, s)
}

export function applyAvatarTheme(palette: AvatarThemePalette, mode: 'light' | 'dark') {
  const colors = palette[mode]
  const root = document.documentElement
  root.dataset.avatarTheme = 'true'
  root.style.setProperty('--color-accent', colors.accent)
  root.style.setProperty('--color-accent-hover', colors.accentHover)
  root.style.setProperty('--color-accent-soft', colors.accentSoft)
  root.style.setProperty('--color-accent-muted', colors.accentMuted)
  root.style.setProperty('--color-orb-primary', colors.orbPrimary)
  root.style.setProperty('--color-orb-secondary', colors.orbSecondary)
  root.style.setProperty('--color-surface', colors.surface)
  root.style.setProperty('--color-surface-card', colors.surfaceCard)
  root.style.setProperty('--color-assistant-bubble', colors.assistantBubble)
  root.style.setProperty('--color-border', colors.border)
}

export function clearAvatarTheme() {
  const root = document.documentElement
  delete root.dataset.avatarTheme
  for (const key of THEME_KEYS) {
    root.style.removeProperty(key)
  }
}
