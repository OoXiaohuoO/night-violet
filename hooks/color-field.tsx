import type { ClientModule, ClientPointerEvent } from 'claude-code'

// The colour picker: a field of coloured cells drawn by the surface itself,
// picked by pointing, with no buttons. A press or a drag shows the colour
// under the pointer in the strip on top; letting go sends it to the hooks
// module (`ui.message`), which sets it. On a desktop a button paints its own
// label colour over a coloured glyph, so colour lives in cell backgrounds here.

export type FieldSwatch = { name: string; hex: string }

export type FieldProps = {
  /** The spectrum's rows, top to bottom, each a run of `#rrggbb`. */
  rows: string[][]
  /** The named colours, drawn under the spectrum. */
  swatches: FieldSwatch[]
  /** The colour the picker is setting now. */
  current: string
  /** What the strip on top calls it ("重點色", "第 1 層顏色 1"). */
  slotName: string
}

/**
 * What a press or a drag is showing, until the pointer is let go; then the
 * colour sent, shown while the props still carry the colour it replaces (the
 * hooks module's answer is on its way), so the strip does not blink back.
 */
type FieldState = { preview?: string; sent?: { hex: string; over: string } }

/** Each swatch's room across: its name (two cells a character) and a margin. */
const SWATCH_CELLS = 6

/** Cells across before the region has been laid out. */
const UNMEASURED = 24

/** Black or white, whichever reads on `hex`. */
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255

  return lum > 0.6 ? '#000000' : '#ffffff'
}

/** `text` padded with spaces to `cells`, counting a CJK character as two. */
function pad(text: string, cells: number, center = false) {
  const width = [...text].reduce((sum, ch) => sum + (/[⺀-￯]/.test(ch) ? 2 : 1), 0)
  const room = Math.max(0, cells - width)
  const left = center ? Math.floor(room / 2) : 1

  return ' '.repeat(Math.min(left, room)) + text + ' '.repeat(Math.max(0, room - left))
}

/** Where things sit in the region, in cells: the same sums draw it and read a pointer. */
function layout(props: FieldProps, columns: number) {
  const across = columns > 0 ? columns : UNMEASURED
  const hues = props.rows[0]?.length ?? 1
  const cell = Math.max(1, Math.min(4, Math.floor(across / hues)))
  const perRow = Math.max(1, Math.floor(across / SWATCH_CELLS))

  return { across, cell, perRow, swatchTop: 1 + props.rows.length }
}

/** The colour at a cell of the region, or undefined off the colours (the strip, a margin). */
function colorAt(props: FieldProps, columns: number, x: number, y: number): string | undefined {
  const { cell, perRow, swatchTop } = layout(props, columns)

  if (x < 0 || y < 1) {
    return undefined
  }

  if (y < swatchTop) {
    return props.rows[y - 1]?.[Math.floor(x / cell)]
  }
  const column = Math.floor(x / SWATCH_CELLS)

  return column < perRow ? props.swatches[(y - swatchTop) * perRow + column]?.hex : undefined
}

const ColorField: ClientModule<FieldProps, FieldState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { across, cell, perRow } = layout(props, surface.columns)
  const { preview, sent } = surface.state ?? {}
  const shown = preview ?? (sent !== undefined && sent.over === props.current ? sent.hex : props.current)
  const isHeld = preview !== undefined

  // A later call replaces the listener, so it always reads these props.
  surface.onPointer((event: ClientPointerEvent) => {
    const isPressing = event.type === 'down' || (event.type === 'move' && event.button !== undefined)

    if (isPressing && (event.type === 'move' || event.button === 'left')) {
      const hex = colorAt(props, surface.columns, event.x, event.y)

      if (hex !== undefined && hex !== surface.state?.preview) {
        surface.setState({ preview: hex })
      }

      return
    }
    const held = surface.state?.preview

    if (event.type === 'up' && held !== undefined) {
      surface.post({ hex: held })
      surface.setState(held === props.current ? {} : { sent: { hex: held, over: props.current } })
    }
  })

  const mark = (hex: string, cells: number) =>
    hex === shown ? '◆'.padEnd(cells, ' ') : ' '.repeat(cells)

  const swatchRows: FieldSwatch[][] = []

  for (let i = 0; i < props.swatches.length; i += perRow) {
    swatchRows.push(props.swatches.slice(i, i + perRow))
  }

  return (
    <Box flexDirection="column">
      <Text backgroundColor={shown} color={inkOn(shown)}>
        {pad(`${props.slotName}${isHeld ? '（放開就套用）' : ''}：${shown}`, across)}
      </Text>
      {props.rows.map(row => (
        <Box flexDirection="row">
          {row.map(hex => (
            <Text backgroundColor={hex} color={inkOn(hex)}>
              {mark(hex, cell)}
            </Text>
          ))}
        </Box>
      ))}
      {swatchRows.map(row => (
        <Box flexDirection="row">
          {row.map(swatch => (
            <Text backgroundColor={swatch.hex} color={inkOn(swatch.hex)} bold={swatch.hex === shown}>
              {pad(swatch.hex === shown ? `◆${swatch.name}` : swatch.name, SWATCH_CELLS, true)}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default ColorField
