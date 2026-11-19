import type { FsEntry, On, ThemeSetArgs, UiOpenResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { EFFECTS, scene } from '../hooks/effects'
import { buildLook } from '../hooks/look'
import { checkColors } from '../hooks/make-colors.js'
import { DEFAULTS, MENU_LIFTS, SWATCHES, TONES } from '../hooks/settings'
import type { EffectId, Layer, LookSettings, ToneId } from '../types'

const PLUGIN = 'night-violet'
const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: PLUGIN,
  surface: 'desktop',
  props: {
    title: '造型設定',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 80 },
    view: {},
  },
} as const
const BACKDROP = {
  plugin: PLUGIN,
  component: 'Backdrop',
  requestId: 'backdrop',
  surface: 'desktop',
  props: { scene: 'lights', plugin: PLUGIN, glass: { blur: 24, opacity: 0.7 } },
} as const

/** A cell of the spectrum chart: the vivid green of its third row. */
const GREEN = '#1aff1a'

const picture = (name: string, size: number): FsEntry => ({ name, kind: 'file', size, mtimeMs: 0, isLink: false })

/** DEFAULTS with one layer changed. */
const withLayer = (index: number, patch: Partial<Layer>, base: LookSettings = DEFAULTS): LookSettings => ({
  ...base,
  layers: base.layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)),
})

/**
 * Stands for the engine beneath the mod: keeps the store, records each theme
 * and toast, answers an open as `opened` (drawn, when not given), and holds
 * `images` in the mod's backgrounds folder.
 */
function engine(
  on: On,
  stored?: unknown,
  { opened = { isPlaced: true }, images = [] }: { opened?: UiOpenResult; images?: FsEntry[] } = {},
) {
  const store = new Map<string, unknown>(stored === undefined ? [] : [['settings', stored]])
  const themes: ThemeSetArgs[] = []
  const toasts: string[] = []

  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    themes.push(e)

    return { value: { isDrawn: true, requestId: 'theme' } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('fs.exists', () => ({ value: images.length > 0 }))
  on('fs.list', () => ({ value: images }))
  on('command.register', () => ({ value: { command: 'look' } }))
  on('ui.open', () => ({ value: opened }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return { store, themes, toasts }
}

/** The SVG the mod draws behind the conversation on the desktop app. */
async function lights($: Engine) {
  const ui = await $.ui.mount(BACKDROP)
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return svg?.props.source
}

/**
 * Why the desktop app would not paint these colours: a wrong token name or a
 * "Desktop won't paint" line. The other contrast lines are notes: it still paints.
 */
function refusals(colors: unknown) {
  const isContrastNote = (line: string) =>
    / is [\d.]+:1 in (light|dark) mode/.test(line) && !line.startsWith("Desktop won't paint")

  return checkColors(colors).filter(line => !isContrastNote(line))
}

test('a session start paints the stored look: colours the desktop app takes, the stored effect behind', async ($, on) => {
  const stored = withLayer(0, { effect: 'wave', color1: '#44d62c', direction: 'up' })
  const { themes } = engine(on, stored)

  await $.session.start(START)

  expect(themes).toHaveLength(1)
  expect(refusals(themes[0]?.colors)).toEqual([])
  expect(await lights($)).toBe(scene(stored))
})

test('an effect picked in the pane and a colour picked on the spectrum change the lights and are kept for the next session', async ($, on) => {
  const { store } = engine(on, DEFAULTS)
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.select({ key: 'effect', value: 'breathing' })
  await pane.press({ key: `pick-${GREEN}` })
  await pane.unmount()

  const picked = withLayer(0, { effect: 'breathing', color1: GREEN })
  expect(await lights($)).toBe(scene(picked))
  expect(store.get('settings')).toEqual(picked)
})

test('an effect picked for the second layer is drawn over the first', async ($, on) => {
  engine(on, DEFAULTS)
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.select({ key: 'layer', value: '1' })
  await pane.select({ key: 'effect', value: 'starlight' })
  await pane.select({ key: 'speed', value: '5' })
  await pane.unmount()

  const stacked = withLayer(1, { effect: 'starlight', speed: 5 })
  const drawn = await lights($)
  expect(drawn).toBe(scene(stacked))
  // Both layers are in the one picture: the first layer's lights and the second's stars.
  expect(drawn).toContain('url(#l0a)')
  expect(drawn).toContain('l1star')
})

test('the accent picked on the spectrum repaints the interface in it', async ($, on) => {
  const { themes } = engine(on, DEFAULTS)
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'slot-accent' })
  await pane.press({ key: `pick-${GREEN}` })
  await pane.unmount()

  expect(themes).toHaveLength(2)
  expect(themes[1]).toEqual(buildLook({ ...DEFAULTS, accent: GREEN }).look)
  expect(themes[1]).not.toEqual(themes[0])
})

test('a panel tone, stronger borders and a code theme set in the pane repaint the interface with them', async ($, on) => {
  const { themes } = engine(on, DEFAULTS)
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.select({ key: 'tone', value: 'black' })
  await pane.press({ key: 'contrast' })
  await pane.input({ key: 'code-theme', text: 'nord' })
  await pane.unmount()

  const painted = themes.at(-1)
  expect(painted).toEqual(buildLook({ ...DEFAULTS, tone: 'black', isHighContrast: true, codeTheme: 'nord' }).look)
  expect(painted?.colors?.contrast).toBe('more')
  expect(painted?.colors?.codeTheme).toEqual({ dark: 'nord' })
  expect(refusals(painted?.colors)).toEqual([])
})

test('a picture picked as the background replaces the lights', async ($, on) => {
  const { themes, store } = engine(on, DEFAULTS, { images: [picture('sea.jpg', 300_000)] })
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.select({ key: 'background', value: 'image' })
  await pane.select({ key: 'image', value: 'sea.jpg' })
  await pane.unmount()

  expect(themes.at(-1)?.backdrop).toEqual({ image: { source: 'backgrounds/sea.jpg' } })
  expect(store.get('settings')).toEqual({ ...DEFAULTS, background: 'image', image: 'sea.jpg' })
})

test('a picture over the 1 MiB limit is not set, and the pane says how large it is', async ($, on) => {
  const { themes, store } = engine(on, DEFAULTS, { images: [picture('huge.png', 3 * 1024 * 1024)] })
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.select({ key: 'background', value: 'image' })
  await pane.select({ key: 'image', value: 'huge.png' })
  const said = await pane.find({ type: 'Text', text: /「huge\.png」有 3\.0 MB，超過 1 MB 的上限/ })
  await pane.unmount()

  expect(said).toBeDefined()
  expect(store.get('settings')).toEqual({ ...DEFAULTS, background: 'image' })
  expect(themes.at(-1)?.backdrop).toEqual(buildLook(DEFAULTS).look.backdrop)
})

test('stored settings holding a value that cannot be used: no crash, the toast names it, the rest are kept', async ($, on) => {
  const { toasts } = engine(on, withLayer(0, { effect: 'disco' as EffectId, color2: '#00b8d9' }))

  await $.session.start(START)

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('第 1 層的效果的值 "disco" 不能用')
  expect(await lights($)).toBe(scene(withLayer(0, { color2: '#00b8d9' })))
})

test('settings stored by the first version, one effect at the top level, are carried over as the first layer', async ($, on) => {
  const { themes, toasts } = engine(on, {
    effect: 'wave',
    color1: '#44d62c',
    color2: '#5865f2',
    speed: 5,
    brightness: 8,
    accent: '#eb459e',
    menu: 1,
    glass: 4,
  })

  await $.session.start(START)

  const carried: LookSettings = {
    ...withLayer(0, { effect: 'wave', color1: '#44d62c', speed: 5 }),
    brightness: 8,
    accent: '#eb459e',
    menu: 1,
    glass: 4,
  }
  expect(toasts).toEqual([])
  expect(await lights($)).toBe(scene(carried))
  expect(themes[0]).toEqual(buildLook(carried).look)
})

test('a typed colour that is not a hex code changes nothing, and the pane says so', async ($, on) => {
  const { store } = engine(on, DEFAULTS)
  await $.session.start(START)

  const pane = await $.ui.mount(PANE)
  await pane.input({ key: 'hex', text: 'purple' })
  const said = await pane.find({ type: 'Text', text: /「purple」不是色碼/ })
  await pane.unmount()

  expect(said).toBeDefined()
  expect(store.get('settings')).toEqual(DEFAULTS)
})

// Bug repro: /look used to say the pane was open whatever the engine answered.
test('/look where no surface draws the pane says so, with the reason, and does not say it opened', async ($, on) => {
  engine(on, DEFAULTS, { opened: { isPlaced: false, reason: 'no attached surface places panes' } })
  await $.session.start(START)

  const ran = await $.command.run({
    command: 'look',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  expect(ran.text).toContain('畫不出來')
  expect(ran.text).toContain('no attached surface places panes')
})

test('every effect, alone and under another, draws a whole scene under the engine limit at both ends of its settings', () => {
  const broken: string[] = []

  for (const id of Object.keys(EFFECTS) as EffectId[]) {
    for (const speed of [1, 5]) {
      for (const direction of ['left', 'right', 'up', 'down'] as const) {
        for (const brightness of [0, 10]) {
          const alone: LookSettings = { ...withLayer(0, { effect: id, speed, direction }), brightness }

          for (const settings of [alone, withLayer(1, { effect: 'starlight', speed }, alone)]) {
            const source = scene(settings)
            const isWhole =
              source.startsWith('<svg ') && source.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(source)

            if (!isWhole || source.length > 131072) {
              broken.push(`${id}, speed ${speed}, ${direction}, brightness ${brightness}: ${source.length} characters`)
            }
          }
        }
      }
    }
  }

  expect(broken).toEqual([])
})

test('every panel tone and menu level, with every swatch as the accent, is a theme the desktop app paints', () => {
  const refused: string[] = []

  for (const tone of Object.keys(TONES) as ToneId[]) {
    for (const menu of MENU_LIFTS.keys()) {
      for (const swatch of SWATCHES) {
        const lines = refusals(buildLook({ ...DEFAULTS, tone, menu, accent: swatch.hex }).look.colors)

        if (lines.length > 0) {
          refused.push(`${tone}, menu ${menu}, accent ${swatch.hex}: ${lines[0]}`)
        }
      }
    }
  }

  expect(refused).toEqual([])
})
