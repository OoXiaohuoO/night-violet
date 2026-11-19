import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register, RenderElement } from 'claude-code'

import type { ColorSlot, Direction, Layer, LookSettings, ToneId } from '../types'
import { describe, EFFECTS, scene } from './effects'
import { buildLook, themeKey } from './look'
import {
  BACKGROUNDS,
  BRIGHTNESS_MAX,
  DEFAULTS,
  DIRECTIONS,
  GLASS_LEVELS,
  IMAGE_FOLDER,
  IMAGE_MAX_BYTES,
  isCodeThemeName,
  isImageName,
  LAYER_COUNT,
  MENU_LIFTS,
  parseHex,
  parseStored,
  SPECTRUM,
  SPEEDS,
  SWATCHES,
  TONES,
} from './settings'

// A look with lighting effects, set from a pane (`/look`), as a keyboard's
// lighting is set from its own app: layers of effects with their colours,
// speed and direction, a spectrum chart to pick colours from, and the
// interface's own colours.

const PLUGIN = 'night-violet'
const PANE = { id: 'night-violet', title: '造型設定' } as const
const STORE_KEY = 'settings'

// Bump the tag when LookSettings changes shape: it declines what an earlier
// version kept in the session, which outlives a reload. The plugin and key
// are spelled out here: the engine reads them off the source and refuses a
// reference held in a constant.
const settings = atom({ plugin: 'night-violet', key: 'settings' } as const, DEFAULTS, { shape: 'settings-2' })
const notice = atom({ plugin: 'night-violet', key: 'notice' } as const, '')
const editing = atom({ plugin: 'night-violet', key: 'editing' } as const, { layer: 0, slot: 'color1' as ColorSlot })

/** Sends the theme. Answers why nothing shows it, when nothing does. */
async function paint($: EngineInterface, s: LookSettings): Promise<string | undefined> {
  try {
    const set = await $.theme.set(buildLook(s).look)

    return set.isDrawn ? undefined : set.reason
  } catch (error) {
    // The engine refuses a picture it can't take (not a JPEG or PNG, too
    // large on a side): its reason is the one to show.
    return error instanceof Error ? error.message : String(error)
  }
}

/** Applies a change from the pane: the lights and the pane redraw from the atom, and the next session reads the store. */
async function change($: EngineInterface, patch: Partial<LookSettings>) {
  const before = await read($, settings)
  const next = { ...before, ...patch }
  await update($, settings, () => next)
  await $.store.set(STORE_KEY, next)

  // Only some settings go through the theme; the rest redraw the lights alone.
  const problem = themeKey(next) === themeKey(before) ? undefined : await paint($, next)
  await update($, notice, () => (problem === undefined ? '' : `造型沒有套用：${problem}`))
}

async function changeLayer($: EngineInterface, index: number, patch: Partial<Layer>) {
  const s = await read($, settings)
  await change($, { layers: s.layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)) })
}

/** The colours the picker can set for a layer: the ones its effect draws with, and the accent. */
function slotsOf(s: LookSettings, layer: number): ColorSlot[] {
  const effect = s.layers[layer]!.effect
  const colors = s.background === 'lights' && effect !== 'off' ? EFFECTS[effect].colors : 0

  return [...(colors >= 1 ? (['color1'] as const) : []), ...(colors >= 2 ? (['color2'] as const) : []), 'accent']
}

/** The colour the picker is setting: the chosen one, or the accent where the layer's effect no longer has it. */
const slotIn = (s: LookSettings, edit: { layer: number; slot: ColorSlot }): ColorSlot =>
  slotsOf(s, edit.layer).includes(edit.slot) ? edit.slot : 'accent'

/** Sets the colour the picker is on. */
async function setColor($: EngineInterface, hex: string) {
  const edit = await read($, editing)
  const slot = slotIn(await read($, settings), edit)

  if (slot === 'accent') {
    await change($, { accent: hex })
  } else {
    await changeLayer($, edit.layer, slot === 'color1' ? { color1: hex } : { color2: hex })
  }
}

/** A colour typed as a hex code. What isn't one changes nothing and is named in the pane. */
async function typeColor($: EngineInterface, text: string) {
  const hex = parseHex(text)

  if (hex === undefined) {
    await update($, notice, () => `「${text}」不是色碼，沒有套用。色碼要像 #8547c6：# 加六個 0～9、a～f 的字。`)

    return
  }
  await setColor($, hex)
}

/** A code theme's name as typed; empty goes back to colouring code from the look. */
async function typeCodeTheme($: EngineInterface, text: string) {
  const name = text.trim()

  if (name !== '' && !isCodeThemeName(name)) {
    await update(
      $,
      notice,
      () => `「${text}」不能當程式碼配色的名稱，沒有套用。名稱只能用英文字母、數字、點、連字號、底線，例如 nord。`,
    )

    return
  }
  await change($, { codeTheme: name })
}

/** The pictures a person put in the mod's backgrounds folder. */
async function listImages($: EngineInterface): Promise<FsEntry[]> {
  const folder = `${$.plugin.root}/${IMAGE_FOLDER}`

  if (!(await $.fs.exists(folder))) {
    return []
  }

  return (await $.fs.list(folder)).filter(entry => entry.kind === 'file' && isImageName(entry.name))
}

/** A picture chosen as the background. One over the engine's size limit changes nothing and is named in the pane. */
async function pickImage($: EngineInterface, picked: FsEntry) {
  if (picked.size > IMAGE_MAX_BYTES) {
    const megabytes = (picked.size / (1024 * 1024)).toFixed(1)
    await update(
      $,
      notice,
      () => `「${picked.name}」有 ${megabytes} MB，超過 1 MB 的上限，沒有套用。請把圖縮小（寬 2560 左右、存成 JPEG）再選。`,
    )

    return
  }
  await change($, { image: picked.name })
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const bar = (value: number, max: number) => '█'.repeat(value) + '░'.repeat(max - value)

/** A table's keys and labels as a Select's options. */
const optionsOf = <K extends string>(table: Record<K, string | { label: string }>) =>
  (Object.entries(table) as [K, string | { label: string }][]).map(([value, entry]) => ({
    value,
    label: typeof entry === 'string' ? entry : entry.label,
  }))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'look', description: '開啟造型設定：燈效、顏色、介面外觀' })

    const stored = await $.store.get(STORE_KEY)
    const isFirstRun = stored === undefined
    const loaded = isFirstRun ? { settings: DEFAULTS, problems: [] } : parseStored(stored)

    if (loaded.problems.length > 0) {
      $.ui.toast(`之前存的造型設定有不能用的值，那幾項先用預設：${loaded.problems.join('；')}`)
    }
    await update($, settings, () => loaded.settings)

    // The terminal and editors draw no look: say why instead of staying silent.
    const problem = await paint($, loaded.settings)

    if (problem !== undefined) {
      $.ui.toast(`造型沒有畫出來：${problem}`)
    }

    // The first time, open the pane so the settings are found. Storing the
    // defaults is what makes it the first time only.
    if (isFirstRun) {
      await $.store.set(STORE_KEY, DEFAULTS)
      void $.ui.open(PANE)
    }

    return next(e)
  })

  on('command.run', { command: 'look' }, async $ => {
    const opened = await $.ui.open({ ...PANE, focus: true })

    // An open isn't always drawn (no surface that places panes, a narrow
    // terminal): say which it was, with the engine's own reason.
    return {
      text: opened.isPlaced
        ? '造型設定面板已開啟，在對話旁邊的側邊面板區；如果被別的面板擋住，切到這個面板的分頁。'
        : `造型設定面板開了但畫不出來：${opened.reason}`,
    }
  })

  // The lights. Every plugin's hook hears every backdrop, so leave another's alone.
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== PLUGIN) {
      return next(e)
    }

    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    const s = await read($, settings)

    return <Svg source={scene(s)} alt={`燈效：${describe(s)}`} isInteractive />
  })

  // The id is spelled out, as PANE's: the engine reads a matcher off the source.
  on('ui.render', { component: 'Pane', requestId: 'night-violet' }, async ($, e) => {
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
    const s = await read($, settings)
    const isLights = s.background === 'lights'

    // Minimized on the desktop app: one line to read at a glance.
    if (e.props.placement === 'widget') {
      return <Text>背景：{isLights ? describe(s) : `圖片 ${s.image}`}</Text>
    }
    const edit = await read($, editing)
    const note = await read($, notice)
    const { blocking } = buildLook(s)
    const layer = s.layers[edit.layer]!
    const effect = layer.effect === 'off' ? undefined : EFFECTS[layer.effect]
    const slots = slotsOf(s, edit.layer)
    const slot = slotIn(s, edit)
    const colorOf = (one: ColorSlot) => (one === 'accent' ? s.accent : layer[one])
    const slotName = (one: ColorSlot) =>
      one === 'accent' ? '重點色' : `第 ${edit.layer + 1} 層顏色 ${one === 'color1' ? 1 : 2}`
    const current = colorOf(slot)
    const images = isLights ? [] : await listImages($)

    // The lights as they are, with no panel frosted over them. The terminal has no Svg.
    let preview: RenderElement | null = null

    if (isLights && (e.surface === 'desktop' || e.surface === 'mobile')) {
      const { Svg } = $.ui.resolve(e)
      preview = <Svg source={scene(s)} alt={`預覽：${describe(s)}`} width={320} height={120} isInteractive />
    }

    const stepper = (key: 'brightness' | 'menu' | 'glass', title: string, max: number, shown: string) => (
      <Box flexDirection="column">
        <Text>{title}</Text>
        <Box flexDirection="row" gap={1}>
          <Button key={`${key}-down`} onPress={() => void change($, { [key]: clamp(s[key] - 1, 0, max) })}>
            －
          </Button>
          <Text>
            {bar(s[key], max)} {shown}
          </Text>
          <Button key={`${key}-up`} onPress={() => void change($, { [key]: clamp(s[key] + 1, 0, max) })}>
            ＋
          </Button>
        </Box>
      </Box>
    )

    const lights = (
      <Box flexDirection="column" gap={1}>
        <Select
          key="layer"
          label="圖層"
          options={Array.from({ length: LAYER_COUNT }, (_, i) => ({
            value: String(i),
            label: i === 0 ? '第 1 層' : `第 ${i + 1} 層（疊在上面）`,
          }))}
          value={String(edit.layer)}
          onSelect={value => void update($, editing, was => ({ ...was, layer: Number(value) }))}
        />
        <Select
          key="effect"
          label="效果"
          options={[{ value: 'off', label: '關閉' }, ...optionsOf(EFFECTS)]}
          value={layer.effect}
          onSelect={value => void changeLayer($, edit.layer, { effect: value as Layer['effect'] })}
        />
        {effect?.isMoving && (
          <Select
            key="speed"
            label="速度"
            options={SPEEDS.map((label, i) => ({ value: String(i + 1), label }))}
            value={String(layer.speed)}
            onSelect={value => void changeLayer($, edit.layer, { speed: Number(value) })}
          />
        )}
        {effect?.hasDirection && (
          <Select
            key="direction"
            label="方向"
            options={optionsOf(DIRECTIONS)}
            value={layer.direction}
            onSelect={value => void changeLayer($, edit.layer, { direction: value as Direction })}
          />
        )}
        {stepper('brightness', '亮度（所有圖層）', BRIGHTNESS_MAX, `${s.brightness * 10}%`)}
        {preview}
      </Box>
    )

    const picture = (
      <Box flexDirection="column" gap={1}>
        {images.length === 0 ? (
          <Text>
            還沒有圖片。把 JPEG 或 PNG（1 MB 以內、邊長 4096 以內）放進這個資料夾，再回來選：{$.plugin.root}/{IMAGE_FOLDER}
          </Text>
        ) : (
          <Select
            key="image"
            label="圖片"
            options={images.map(image => ({
              value: image.name,
              label: `${image.name}（${Math.ceil(image.size / 1024)} KB）`,
            }))}
            {...(images.some(image => image.name === s.image) ? { value: s.image } : {})}
            onSelect={name => void pickImage($, images.find(image => image.name === name)!)}
          />
        )}
        <Text dimColor>
          用圖片當背景時沒有燈效。{s.image === '' ? '還沒選圖片，先維持燈效。' : `現在用的是 ${s.image}。`}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text bold>背景</Text>
        <Select
          key="background"
          label="背景"
          options={optionsOf(BACKGROUNDS)}
          value={s.background}
          onSelect={value => void change($, { background: value as LookSettings['background'] })}
        />
        {isLights ? lights : picture}

        <Text bold>顏色</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {slots.map(one => (
            <Button
              key={`slot-${one}`}
              variant={one === slot ? 'primary' : 'secondary'}
              onPress={() => void update($, editing, was => ({ ...was, slot: one }))}
            >
              <Text color={colorOf(one)}>●</Text> {slotName(one)}
            </Button>
          ))}
        </Box>
        <Text dimColor>
          點色譜或色票，改的是上面選中的「{slotName(slot)}」（現在 {current}）。
        </Text>
        <Box flexDirection="column">
          {SPECTRUM.map(row => (
            <Box flexDirection="row">
              {row.map(hex => (
                <Button key={`pick-${hex}`} plain onPress={() => void setColor($, hex)}>
                  <Text color={hex}>{hex === current ? '◆' : '■'}</Text>
                </Button>
              ))}
            </Box>
          ))}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {SWATCHES.map(swatch => (
            <Button
              key={`swatch-${swatch.hex}`}
              variant={swatch.hex === current ? 'primary' : 'secondary'}
              onPress={() => void setColor($, swatch.hex)}
            >
              <Text color={swatch.hex}>●</Text> {swatch.name}
            </Button>
          ))}
        </Box>
        <Input
          key="hex"
          label="色碼"
          placeholder="#rrggbb"
          value={current}
          submitLabel="套用"
          onSubmit={text => void typeColor($, text)}
        />

        <Text bold>介面</Text>
        <Select
          key="tone"
          label="面板色調（深色模式）"
          options={optionsOf(TONES)}
          value={s.tone}
          onSelect={value => void change($, { tone: value as ToneId })}
        />
        {stepper('menu', '選單亮度（深色模式）', MENU_LIFTS.length - 1, `${s.menu + 1}／${MENU_LIFTS.length}`)}
        {isLights &&
          stepper(
            'glass',
            '面板透光（越高燈效越明顯，字越不清楚）',
            GLASS_LEVELS.length - 1,
            `${s.glass + 1}／${GLASS_LEVELS.length}`,
          )}
        <Button
          key="contrast"
          variant={s.isHighContrast ? 'primary' : 'secondary'}
          onPress={() => void change($, { isHighContrast: !s.isHighContrast })}
        >
          邊框加強：{s.isHighContrast ? '開' : '關'}
        </Button>
        <Input
          key="code-theme"
          label="程式碼配色（深色模式）"
          placeholder="例如 nord；留空＝跟著造型"
          value={s.codeTheme}
          submitLabel="套用"
          onSubmit={text => void typeCodeTheme($, text)}
        />
        <Text dimColor>程式碼配色要輸入桌面版認得的名稱；不認得的名稱不會有變化。</Text>

        {blocking.length > 0 && (
          <Text color="error">這組顏色對比不夠，桌面版不會套用介面配色（燈效不受影響）：{blocking[0]}</Text>
        )}
        {note !== '' && <Text color="warning">{note}</Text>}

        <Button key="reset" onPress={() => void change($, DEFAULTS)}>
          還原預設
        </Button>
      </Box>
    )
  })
}
