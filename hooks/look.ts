import type { ThemeSetArgs } from 'claude-code'

import type { LookSettings } from '../types'
import { makeColors } from './make-colors.js'
import { GLASS_LEVELS, IMAGE_FOLDER, lift, MENU_LIFTS, TONES } from './settings'

// The theme the app paints: the interface's colours from the settings, and
// what is behind the conversation: the scene the Backdrop hook draws the
// lights for, or a still picture.

/** The one scene this mod names; the Backdrop hook draws the layers into it. */
export const SCENE = 'lights'

// How far the app blurs the lights behind a panel, in points. How opaque the
// panel is over them is the person's setting (GLASS_LEVELS).
const GLASS_BLUR = 24

export type Built = {
  look: ThemeSetArgs
  /** Why the desktop app would ignore these colours, when it would: its own lines. */
  blocking: string[]
}

/** The settings that reach the theme, as one string: a change in any other redraws the lights alone. */
export const themeKey = (s: LookSettings) =>
  [s.accent, s.menu, s.glass, s.tone, s.isHighContrast, s.codeTheme, s.background, s.image].join(' ')

let last: { key: string; built: Built } | undefined

/**
 * Dark panels in the chosen tone with the chosen accent. The text colours and
 * the blue-violet `pro` are sampled from the owner's reference screenshot; the
 * light half is the same idea by day. danger / success / warning keep their
 * usual hues.
 */
export function buildLook(s: LookSettings): Built {
  // The pane asks on every draw.
  const key = themeKey(s)

  if (last?.key === key) {
    return last.built
  }
  const [page, cards, panels] = TONES[s.tone].surfaces
  const { theme, problems } = makeColors({
    label: '夜紫',
    roles: { accent: s.accent, danger: '#ed4245', success: '#3ba55d', warning: '#f0b232', pro: '#5865f2' },
    dark: {
      gray: {
        anchors: {
          'surface-0': page,
          'surface-1': cards,
          'surface-2': panels,
          // Menus. text-muted has to stay this light with them: a dimmer one
          // drops under the contrast Desktop needs, and it then ignores the theme.
          'surface-3': lift(page, MENU_LIFTS[s.menu]!),
          'text-primary': '#eeeff4',
          'text-secondary': '#b4b5be',
          'text-muted': '#a4a5ae',
        },
      },
    },
    light: {
      gray: {
        anchors: {
          'surface-0': '#eef0f7',
          'surface-1': '#f4f5fb',
          'surface-2': '#fbfbfe',
          'text-primary': '#12162a',
          'text-secondary': '#40465f',
          'text-muted': '#5a5f77',
        },
      },
    },
    ...(s.isHighContrast ? { contrast: 'more' as const } : {}),
    ...(s.codeTheme === '' ? {} : { codeTheme: { dark: s.codeTheme } }),
  })
  const built: Built = {
    look: {
      colors: theme,
      // A picture is a still ground: the app draws it with no hook, and no
      // lights. Until one is chosen, the lights stay.
      backdrop:
        s.background === 'image' && s.image !== ''
          ? { image: { source: `${IMAGE_FOLDER}/${s.image}` } }
          : { scene: SCENE, glass: { blur: GLASS_BLUR, opacity: GLASS_LEVELS[s.glass]! } },
    },
    blocking: problems.filter(line => line.startsWith("Desktop won't paint")),
  }
  last = { key, built }

  return built
}
