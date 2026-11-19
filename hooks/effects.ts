import type { EffectId, Layer, LookSettings } from '../types'

// The lighting effects, as a registry: each one draws a layer's lights as SVG
// parts, and `scene` stacks the layers into the one picture the app draws
// behind the conversation. A new effect is one entry here (and its name in
// EffectId); the pane and the backdrop read this table.

/** One layer's parts of the scene. */
export type Drawn = { css: string; defs: string; body: string }

export type Effect = {
  /** What the pane's picker shows. */
  label: string
  /** How many of the layer's two colours it draws with: the pane offers that many. */
  colors: 0 | 1 | 2
  /** Whether it moves: the pane shows the speed picker only then. */
  isMoving: boolean
  /** Whether it travels a way: the pane shows the direction picker only then. */
  hasDirection: boolean
  /**
   * Draws one layer, animated by CSS alone. Every id, class and keyframe name
   * it writes starts with `p`, so two layers never share one.
   */
  draw: (layer: Layer, p: string) => Drawn
}

// The scene's own box. The root slices, so it fills any window.
const W = 1600
const H = 1000

type Spot = { cx: number; cy: number; r: number }

// Where the two corner lights sit: off the top-left and bottom-right corners,
// away from the middle, where the words are.
const TOP_LEFT: Spot = { cx: W * 0.1, cy: H * 0.02, r: W * 0.62 }
const BOTTOM_RIGHT: Spot = { cx: W * 0.92, cy: H * 1.02, r: W * 0.62 }

const round = (n: number) => Math.round(n * 100) / 100

/** Seconds for one cycle: `slowest` at speed 1, `fastest` at speed 5, evenly spaced by ratio. */
const cycle = (speed: number, slowest: number, fastest: number) =>
  round(slowest * (fastest / slowest) ** ((speed - 1) / 4))

/** A soft light: full colour at its centre, gone at its edge. */
const glowGradient = (id: string, color: string) =>
  `<radialGradient id="${id}">` +
  `<stop offset="0" stop-color="${color}" stop-opacity="0.9"/>` +
  `<stop offset="0.55" stop-color="${color}" stop-opacity="0.35"/>` +
  `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
  `</radialGradient>`

/** A soft ring: nothing at its centre, colour near its edge. */
const ringGradient = (id: string, color: string) =>
  `<radialGradient id="${id}">` +
  `<stop offset="0.5" stop-color="${color}" stop-opacity="0"/>` +
  `<stop offset="0.8" stop-color="${color}" stop-opacity="0.85"/>` +
  `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
  `</radialGradient>`

const circle = (gradient: string, at: Spot, classes = '') =>
  `<circle${classes && ` class="${classes}"`} cx="${round(at.cx)}" cy="${round(at.cy)}" r="${round(at.r)}" fill="url(#${gradient})"/>`

/** The layer's two colours as glow gradients `<p>a` and `<p>b`. */
const twoGlows = (layer: Layer, p: string) => glowGradient(`${p}a`, layer.color1) + glowGradient(`${p}b`, layer.color2)

// The six hues a spectrum cycle and a wheel run through.
const HUES = ['#ff0033', '#ffb300', '#33ff00', '#00e5ff', '#2b5bff', '#d400ff'] as const

/** A small repeatable random source, so the lights sit in the same places on every draw. */
function seeded(seed: number) {
  let state = seed

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A run of lights that share one animation and differ in length and start:
 * the CSS rules for `<p><name>0`, `<p><name>1`, ... A delay is a rule here,
 * never a style attribute: the engine scrubs attributes it does not expect.
 */
function staggered(p: string, name: string, count: number, seconds: number, random: () => number) {
  const rules: string[] = []

  for (let i = 0; i < count; i++) {
    const own = round(seconds * (0.6 + random() * 0.8))
    rules.push(`.${p}${name}${i}{animation-duration:${own}s;animation-delay:-${round(random() * own)}s}`)
  }

  return rules.join('')
}

const STAR_COUNT = 48
const FLAME_COUNT = 10
const RING_COUNT = 6
const BAND_COUNT = 4

export const EFFECTS: Record<EffectId, Effect> = {
  static: {
    label: '靜態',
    colors: 2,
    isMoving: false,
    hasDirection: false,
    draw: (layer, p) => ({
      css: '',
      defs: twoGlows(layer, p),
      body: circle(`${p}a`, TOP_LEFT) + circle(`${p}b`, BOTTOM_RIGHT),
    }),
  },

  // Colour 1 breathes in and out, then colour 2: one cycle holds both breaths.
  breathing: {
    label: '呼吸',
    colors: 2,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const seconds = cycle(layer.speed, 20, 4)

      return {
        css:
          `.${p}breath{opacity:0;animation:${p}breathe ${seconds}s ease-in-out infinite}` +
          `.${p}second{animation-delay:-${round(seconds / 2)}s}` +
          `@keyframes ${p}breathe{0%{opacity:0}25%{opacity:1}50%{opacity:0}100%{opacity:0}}`,
        defs: twoGlows(layer, p),
        body:
          `<g class="${p}breath">${circle(`${p}a`, TOP_LEFT)}${circle(`${p}a`, BOTTOM_RIGHT)}</g>` +
          `<g class="${p}breath ${p}second">${circle(`${p}b`, TOP_LEFT)}${circle(`${p}b`, BOTTOM_RIGHT)}</g>`,
      }
    },
  },

  // One group per hue, each fading in as the one before fades out. The two
  // corners run half a cycle apart, so they never show the same hue.
  spectrum: {
    label: '光譜循環',
    colors: 0,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const seconds = cycle(layer.speed, 60, 8)
      const share = 100 / HUES.length
      const delays = HUES.map((_, i) => `.${p}h${i}{animation-delay:-${round((i * seconds) / HUES.length)}s}`)
      const groups = HUES.map((_, i) => {
        const opposite = (i + HUES.length / 2) % HUES.length

        return `<g class="${p}hue ${p}h${i}">${circle(`${p}h${i}`, TOP_LEFT)}${circle(`${p}h${opposite}`, BOTTOM_RIGHT)}</g>`
      })

      return {
        css:
          `.${p}hue{opacity:0;animation:${p}hue ${seconds}s linear infinite}` +
          `@keyframes ${p}hue{0%{opacity:0}${round(share)}%{opacity:1}${round(share * 2)}%{opacity:0}100%{opacity:0}}` +
          delays.join(''),
        defs: HUES.map((hue, i) => glowGradient(`${p}h${i}`, hue)).join(''),
        body: groups.join(''),
      }
    },
  },

  // Bands of the two colours sliding one way. The gradient repeats every box
  // length along the travel, and the rectangle is two box lengths long, so
  // moving it by one lands where it started.
  wave: {
    label: '波浪',
    colors: 2,
    isMoving: true,
    hasDirection: true,
    draw: (layer, p) => {
      const seconds = cycle(layer.speed, 40, 5)
      const isSideways = layer.direction === 'left' || layer.direction === 'right'
      const isForward = layer.direction === 'right' || layer.direction === 'down'
      const span = isSideways ? W : H
      // Moving forward, the rectangle starts one box length back.
      const start = isForward ? -span : 0
      const rect = isSideways
        ? `x="${start}" y="0" width="${W * 2}" height="${H}"`
        : `x="0" y="${start}" width="${W}" height="${H * 2}"`
      const run = isSideways ? `x1="0" y1="0" x2="${W}" y2="0"` : `x1="0" y1="0" x2="0" y2="${H}"`

      return {
        css:
          `.${p}wave{animation:${p}slide ${seconds}s linear infinite}` +
          `@keyframes ${p}slide{to{transform:translate${isSideways ? 'X' : 'Y'}(${isForward ? span : -span}px)}}`,
        defs:
          `<linearGradient id="${p}bands" gradientUnits="userSpaceOnUse" ${run} spreadMethod="repeat">` +
          `<stop offset="0" stop-color="${layer.color1}"/><stop offset="0.5" stop-color="${layer.color2}"/><stop offset="1" stop-color="${layer.color1}"/>` +
          '</linearGradient>' +
          // Fades the bands out toward the middle rows, where the words are.
          `<linearGradient id="${p}edges" x1="0" y1="0" x2="0" y2="1">` +
          '<stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.25"/><stop offset="1" stop-color="#fff" stop-opacity="0.9"/>' +
          '</linearGradient>' +
          `<mask id="${p}fade"><rect width="${W}" height="${H}" fill="url(#${p}edges)"/></mask>`,
        body: `<g mask="url(#${p}fade)"><rect class="${p}wave" ${rect} fill="url(#${p}bands)"/></g>`,
      }
    },
  },

  // Lights that come up and go out one by one, in the two colours. Wide and
  // soft: a small star is lost once a panel blurs it.
  starlight: {
    label: '星光',
    colors: 2,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const random = seeded(7)
      const rules = staggered(p, 's', STAR_COUNT, cycle(layer.speed, 16, 3), random)
      const stars: string[] = []

      for (let i = 0; i < STAR_COUNT; i++) {
        const at = { cx: random() * W, cy: random() * H, r: 110 + random() * 170 }
        stars.push(circle(`${p}${i % 2 === 0 ? 'a' : 'b'}`, at, `${p}star ${p}s${i}`))
      }

      return {
        css:
          `.${p}star{opacity:0;animation:${p}twinkle linear infinite}` +
          `@keyframes ${p}twinkle{0%{opacity:0}25%{opacity:1}55%{opacity:0}100%{opacity:0}}` +
          rules,
        defs: twoGlows(layer, p),
        body: stars.join(''),
      }
    },
  },

  // Flames along the bottom edge, each rising and dimming at its own pace:
  // colour 1 the wide ones, colour 2 the ones between.
  fire: {
    label: '火焰',
    colors: 2,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const random = seeded(11)
      const rules = staggered(p, 'f', FLAME_COUNT, cycle(layer.speed, 5, 1), random)
      const flames: string[] = []

      for (let i = 0; i < FLAME_COUNT; i++) {
        const r = (i % 2 === 0 ? 300 : 210) + random() * 160
        const at = { cx: (W * (i + 0.5)) / FLAME_COUNT + (random() - 0.5) * 80, cy: H + r * 0.3, r }
        flames.push(circle(`${p}${i % 2 === 0 ? 'a' : 'b'}`, at, `${p}flame ${p}f${i}`))
      }

      return {
        css:
          `.${p}flame{transform-box:fill-box;transform-origin:50% 100%;animation:${p}flicker ease-in-out infinite alternate}` +
          `@keyframes ${p}flicker{0%{opacity:.4;transform:translateY(0) scale(1)}100%{opacity:1;transform:translateY(-80px) scale(1.2)}}` +
          rules,
        defs: twoGlows(layer, p),
        body: flames.join(''),
      }
    },
  },

  // Rings that spread from a point and fade, one after another.
  ripple: {
    label: '漣漪',
    colors: 2,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const seconds = cycle(layer.speed, 14, 3)
      const random = seeded(23)
      const delays: string[] = []
      const rings: string[] = []

      for (let i = 0; i < RING_COUNT; i++) {
        const at = { cx: random() * W, cy: random() * H, r: 420 + random() * 260 }
        delays.push(`.${p}r${i}{animation-delay:-${round((i * seconds) / RING_COUNT)}s}`)
        rings.push(circle(`${p}${i % 2 === 0 ? 'a' : 'b'}`, at, `${p}ring ${p}r${i}`))
      }

      return {
        css:
          `.${p}ring{transform-box:fill-box;transform-origin:center;opacity:0;animation:${p}spread ${seconds}s ease-out infinite}` +
          `@keyframes ${p}spread{0%{transform:scale(.05);opacity:0}15%{opacity:1}100%{transform:scale(1);opacity:0}}` +
          delays.join(''),
        defs: ringGradient(`${p}a`, layer.color1) + ringGradient(`${p}b`, layer.color2),
        body: rings.join(''),
      }
    },
  },

  // Wide soft bands across the upper half, drifting side to side and swelling.
  aurora: {
    label: '極光',
    colors: 2,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const random = seeded(31)
      const rules = staggered(p, 'n', BAND_COUNT, cycle(layer.speed, 30, 6), random)
      const bands: string[] = []

      for (let i = 0; i < BAND_COUNT; i++) {
        bands.push(
          `<ellipse class="${p}band ${p}n${i}" cx="${round(W * (0.3 + random() * 0.4))}" cy="${round(H * (0.1 + 0.2 * i))}" ` +
            `rx="${round(700 + random() * 300)}" ry="${round(150 + random() * 110)}" fill="url(#${p}${i % 2 === 0 ? 'a' : 'b'})"/>`,
        )
      }

      return {
        css:
          `.${p}band{transform-box:fill-box;transform-origin:center;animation:${p}drift ease-in-out infinite alternate}` +
          `@keyframes ${p}drift{0%{transform:translateX(-22%) scaleY(.8)}100%{transform:translateX(22%) scaleY(1.4)}}` +
          rules,
        defs: twoGlows(layer, p),
        body: bands.join(''),
      }
    },
  },

  // The six hues set around the middle, turning as one.
  wheel: {
    label: '輪轉',
    colors: 0,
    isMoving: true,
    hasDirection: false,
    draw: (layer, p) => {
      const seconds = cycle(layer.speed, 48, 6)
      const lights = HUES.map((_, i) => {
        const angle = (i / HUES.length) * Math.PI * 2

        return circle(`${p}h${i}`, {
          cx: W / 2 + Math.cos(angle) * H * 0.85,
          cy: H / 2 + Math.sin(angle) * H * 0.85,
          r: W * 0.5,
        })
      })

      return {
        css:
          `.${p}wheel{transform-origin:${W / 2}px ${H / 2}px;animation:${p}spin ${seconds}s linear infinite}` +
          `@keyframes ${p}spin{to{transform:rotate(360deg)}}`,
        defs: HUES.map((hue, i) => glowGradient(`${p}h${i}`, hue)).join(''),
        body: `<g class="${p}wheel">${lights.join('')}</g>`,
      }
    },
  },
}

/** The layers that draw something, in order. */
const lit = (s: LookSettings) => s.layers.filter((layer): layer is Layer & { effect: EffectId } => layer.effect !== 'off')

/** The effects in play, in the pane's words: "靜態＋星光", or "關閉". */
export const describe = (s: LookSettings) =>
  lit(s)
    .map(layer => EFFECTS[layer.effect].label)
    .join('＋') || '關閉'

/**
 * The whole scene: an `<svg>` under the engine's 131072-character limit. A
 * later layer is added to the ones under it as light is (screen), and
 * brightness (0 to 10) is the opacity of them all.
 */
export function scene(s: LookSettings): string {
  const drawn = s.layers.map((layer, i) => (layer.effect === 'off' ? undefined : EFFECTS[layer.effect].draw(layer, `l${i}`)))
  const parts = drawn.filter(part => part !== undefined)
  const body = drawn
    .map((part, i) => (part === undefined ? '' : `<g${i > 0 ? ' class="over"' : ''}>${part.body}</g>`))
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<style>.over{mix-blend-mode:screen}${parts.map(part => part.css).join('')}</style>` +
    `<defs>${parts.map(part => part.defs).join('')}</defs>` +
    `<g opacity="${s.brightness / 10}">${body}</g></svg>`
  )
}
