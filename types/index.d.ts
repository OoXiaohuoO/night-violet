// The mod's type contract: what it keeps in `$.state`, and the shape of a
// person's settings (also what `$.store` holds under "settings").

/** An effect in the registry (hooks/effects.ts). Adding one: name it here, then add its entry there. */
export type EffectId =
  | 'static'
  | 'breathing'
  | 'spectrum'
  | 'wave'
  | 'starlight'
  | 'fire'
  | 'ripple'
  | 'aurora'
  | 'wheel'

export type Direction = 'left' | 'right' | 'up' | 'down'

/** A set of dark-mode panel colours (hooks/settings.ts, TONES). */
export type ToneId = 'navy' | 'black' | 'graphite' | 'violet' | 'green'

/** One light effect and its own settings. Layers are drawn in order, a later one over an earlier one. */
export type Layer = {
  effect: EffectId | 'off'
  /** The effect's colours, `#rrggbb`. An effect draws with none, one or both. */
  color1: string
  color2: string
  /** 1 (slowest) to 5. */
  speed: number
  /** Which way a moving effect travels, for the effects that have a direction. */
  direction: Direction
}

// Not named `Settings`: inside `declare module 'claude-code'` below, that name
// is the engine's own type and would win over this one.
export type LookSettings = {
  /** LAYER_COUNT layers. */
  layers: Layer[]
  /** 0 (lights off) to 10. */
  brightness: number
  /** The interface's accent colour, `#rrggbb`. */
  accent: string
  /** How light a menu is in dark mode: an index into MENU_LIFTS. */
  menu: number
  /** How much of the lights a panel lets through: an index into GLASS_LEVELS. */
  glass: number
  /** The dark-mode panel colours. */
  tone: ToneId
  /** Stronger borders and focus rings. */
  isHighContrast: boolean
  /** The code highlighting theme's name in dark mode, or '' to colour code from the look. */
  codeTheme: string
  /** What is behind the conversation: the light effects, or a still picture. */
  background: 'lights' | 'image'
  /** The picture's file name in the mod's backgrounds folder, or '' while none is chosen. */
  image: string
}

/** Which colour the pane's picker is setting. */
export type ColorSlot = 'color1' | 'color2' | 'accent'

declare module 'claude-code' {
  interface PluginState {
    'night-violet': {
      settings: Shaped<LookSettings>
      /** One line the pane shows about the last thing done, or ''. */
      notice: string
      /** What the pane is editing: which layer, and which colour the picker sets. */
      editing: { layer: number; slot: ColorSlot }
    }
  }
}
