import type { Direction, EffectId, Layer, LookSettings, ToneId } from '../types'
import { EFFECTS } from './effects'

// What a person can choose in the pane, the defaults, and reading back what
// an earlier session stored.

/** How many light layers there are: the first, and the ones drawn over it. */
export const LAYER_COUNT = 2

/** The speed picker's words, for speed 1 to 5. */
export const SPEEDS = ['很慢', '慢', '中', '快', '很快'] as const

export const DIRECTIONS: Record<Direction, string> = { left: '向左', right: '向右', up: '向上', down: '向下' }

export const BRIGHTNESS_MAX = 10

// How much lighter than the page a dark-mode menu is, per channel, darkest
// first. Every one, on every tone and with every swatch as the accent, keeps
// the contrast the desktop app needs to paint the theme.
export const MENU_LIFTS = [10, 16, 22, 28, 34] as const

// How opaque the app's panels are over the lights, most opaque first: a more
// see-through panel shows more of the effect and makes its words harder to read.
export const GLASS_LEVELS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46] as const

/** The dark-mode panel colours: the page, cards and panels, darkest first. Navy is sampled from the owner's reference. */
export const TONES: Record<ToneId, { label: string; surfaces: readonly [string, string, string] }> = {
  navy: { label: '深藍', surfaces: ['#0a0f1d', '#0d1321', '#0f1523'] },
  black: { label: '純黑', surfaces: ['#050506', '#0a0a0c', '#0e0e11'] },
  graphite: { label: '石墨灰', surfaces: ['#111214', '#15171a', '#191b1f'] },
  violet: { label: '深紫', surfaces: ['#0f0a1c', '#130d22', '#170f28'] },
  green: { label: '深綠', surfaces: ['#08120e', '#0b1612', '#0e1a15'] },
}

export const BACKGROUNDS: Record<LookSettings['background'], string> = { lights: '燈效', image: '圖片' }

/** Where a person puts their own pictures, under the mod's folder. */
export const IMAGE_FOLDER = 'backgrounds'

/** The engine takes a picture of at most 1 MiB. */
export const IMAGE_MAX_BYTES = 1024 * 1024

export const isImageName = (name: string) => /\.(jpe?g|png)$/i.test(name)

export type Swatch = { name: string; hex: string }

/** The named colours offered as buttons beside the spectrum. */
export const SWATCHES: readonly Swatch[] = [
  { name: '紫', hex: '#8547c6' },
  { name: '藍紫', hex: '#5865f2' },
  { name: '藍', hex: '#2d7ff9' },
  { name: '青', hex: '#00b8d9' },
  { name: '綠', hex: '#44d62c' },
  { name: '黃', hex: '#f0b232' },
  { name: '橘', hex: '#ff8a00' },
  { name: '紅', hex: '#ed4245' },
  { name: '粉', hex: '#eb459e' },
]

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`

/** `#rrggbb` of a hue (degrees), saturation and lightness (both 0 to 100). */
function hslToHex(h: number, s: number, l: number) {
  const chroma = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100)
  const base = l / 100 - chroma / 2
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6

    return (base + chroma * (1 - Math.max(0, Math.min(1, k, 4 - k)))) * 255
  }

  return toHex(channel(5), channel(3), channel(1))
}

// The spectrum chart's rows, top to bottom: each a saturation and a lightness.
const SPECTRUM_TONES = [
  [100, 82],
  [100, 68],
  [100, 55],
  [95, 43],
  [90, 32],
  [85, 22],
] as const
const SPECTRUM_COLUMNS = 12

/**
 * The spectrum chart: a row per tone, light to dark, each running round the
 * hues, then a row of greys from white to black. Every colour appears once.
 */
export const SPECTRUM: readonly (readonly string[])[] = [
  ...SPECTRUM_TONES.map(([s, l]) =>
    Array.from({ length: SPECTRUM_COLUMNS }, (_, column) => hslToHex((column * 360) / SPECTRUM_COLUMNS, s, l)),
  ),
  Array.from({ length: SPECTRUM_COLUMNS }, (_, column) => {
    const grey = 255 * (1 - column / (SPECTRUM_COLUMNS - 1))

    return toHex(grey, grey, grey)
  }),
]

/** `hex` with each channel raised by `amount` (0 to 255). */
export function lift(hex: string, amount: number) {
  const channel = (at: number) => Math.min(255, parseInt(hex.slice(at, at + 2), 16) + amount)

  return toHex(channel(1), channel(3), channel(5))
}

export const DEFAULT_LAYER: Layer = { effect: 'off', color1: '#8547c6', color2: '#5865f2', speed: 3, direction: 'left' }

export const DEFAULTS: LookSettings = {
  layers: [{ ...DEFAULT_LAYER, effect: 'static' }, DEFAULT_LAYER],
  brightness: 6,
  accent: '#8547c6',
  menu: 2,
  glass: 2,
  tone: 'navy',
  isHighContrast: false,
  codeTheme: '',
  background: 'lights',
  image: '',
}

/** `#rrggbb` in lower case from what a person typed (`#rgb` and a missing `#` are taken), or undefined. */
export function parseHex(text: string): string | undefined {
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())?.[1]?.toLowerCase()

  if (digits === undefined) {
    return undefined
  }

  return `#${digits.length === 3 ? [...digits].map(d => d + d).join('') : digits}`
}

/** A code theme's name as the engine takes one: 1 to 64 letters, digits, dots, hyphens or underscores, starting with a letter or digit. */
export const isCodeThemeName = (text: string) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(text)

// Reading stored settings. Each field has its name in the pane's words and a
// reader that answers undefined for a value that can't be used.

type Fields<T> = { [K in keyof T]: { name: string; read: (v: unknown) => T[K] | undefined } }

const readHex = (v: unknown) => (typeof v === 'string' ? parseHex(v) : undefined)

const readStep = (min: number, max: number) => (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined

/** Reads one of a table's own keys. */
const readKey =
  <K extends string>(table: Record<K, unknown>) =>
  (v: unknown) =>
    typeof v === 'string' && Object.hasOwn(table, v) ? (v as K) : undefined

const LAYER_FIELDS: Fields<Layer> = {
  effect: { name: '效果', read: v => (v === 'off' ? 'off' : readKey<EffectId>(EFFECTS)(v)) },
  color1: { name: '顏色 1', read: readHex },
  color2: { name: '顏色 2', read: readHex },
  speed: { name: '速度', read: readStep(1, SPEEDS.length) },
  direction: { name: '方向', read: readKey(DIRECTIONS) },
}

const FIELDS: Fields<Omit<LookSettings, 'layers'>> = {
  brightness: { name: '亮度', read: readStep(0, BRIGHTNESS_MAX) },
  accent: { name: '重點色', read: readHex },
  menu: { name: '選單亮度', read: readStep(0, MENU_LIFTS.length - 1) },
  glass: { name: '面板透光', read: readStep(0, GLASS_LEVELS.length - 1) },
  tone: { name: '面板色調', read: readKey(TONES) },
  isHighContrast: { name: '邊框加強', read: v => (typeof v === 'boolean' ? v : undefined) },
  codeTheme: { name: '程式碼配色', read: v => (v === '' || (typeof v === 'string' && isCodeThemeName(v)) ? v : undefined) },
  background: { name: '背景', read: readKey(BACKGROUNDS) },
  image: { name: '背景圖片', read: v => (v === '' || (typeof v === 'string' && isImageName(v)) ? v : undefined) },
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Fills `into` from `stored`, field by field: a value that can't be used is named in `problems` and its field left as it was. */
function readInto<T>(fields: Fields<T>, stored: Record<string, unknown>, into: T, problems: string[], where: string) {
  for (const key of Object.keys(fields) as (keyof T & string)[]) {
    const raw = stored[key]

    // A setting added after this was stored isn't an error: it keeps its default.
    if (raw === undefined) {
      continue
    }
    const value = fields[key].read(raw)

    if (value === undefined) {
      problems.push(`${where}${fields[key].name}的值 ${JSON.stringify(raw)} 不能用`)
    } else {
      into[key] = value
    }
  }
}

/**
 * The settings a stored value holds. A value that can't be used is named in
 * `problems` and that one setting stays at its default; the rest are kept.
 */
export function parseStored(value: unknown): { settings: LookSettings; problems: string[] } {
  if (!isRecord(value)) {
    return { settings: DEFAULTS, problems: [`存的內容 ${JSON.stringify(value)} 不是一組設定`] }
  }
  const settings: LookSettings = { ...DEFAULTS, layers: DEFAULTS.layers.map(layer => ({ ...layer })) }
  const problems: string[] = []
  readInto(FIELDS, value, settings, problems, '')

  // The first version had one effect, its settings at the top level: what it
  // stored is the first layer.
  const isFirstVersion = value.layers === undefined
  const storedLayers = isFirstVersion ? [value] : value.layers

  if (!Array.isArray(storedLayers)) {
    problems.push(`圖層的內容 ${JSON.stringify(storedLayers)} 不是一列圖層`)

    return { settings, problems }
  }
  settings.layers.forEach((layer, i) => {
    const stored: unknown = storedLayers[i]

    if (stored === undefined) {
      return
    }

    if (!isRecord(stored)) {
      problems.push(`第 ${i + 1} 層的內容 ${JSON.stringify(stored)} 不是一組設定`)

      return
    }
    readInto(LAYER_FIELDS, stored, layer, problems, `第 ${i + 1} 層的`)
  })

  return { settings, problems }
}
