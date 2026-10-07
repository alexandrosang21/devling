// Draws the README's pictures with the mod's own drawing code, so they show what the terminal shows:
// docs/footer.svg (the pet walking under the prompt) and docs/species.svg (every species at every stage).
// Run `npx -y tsx@4 scripts/pictures.ts` after changing a drawing or a palette; CI fails while they are stale.

import { mkdirSync, writeFileSync } from 'node:fs'
import type { Pet } from '../types'
import { IDLE_LINES, LANE, bubbleLines, columnsOf, sceneOf, statsLine } from '../hooks/art'
import type { Row, Segment } from '../hooks/art'
import { egg } from '../hooks/life'
import type { Stage } from '../hooks/life'
import { SKIN_IDS, pixelsOf, skinOf } from '../hooks/skins'
import type { Pixels } from '../hooks/skins'

// A terminal cell 9 by 18 pixels, so a half block is a square pixel, as in most terminal fonts.
const CELL = 9
const LINE = 18
const FONT = 15
const BASELINE = 13
const PAD = 16
const FONTS = "ui-monospace, SFMono-Regular, 'Cascadia Mono', Menlo, Consolas, monospace"

// A dark terminal, and the theme colors the mod names, as Claude Code's dark theme draws them.
const BACKGROUND = '#161b22'
const BORDER = '#30363d'
const TEXT = '#e6edf3'
const DIM = '#7d8590'
const COIN = '#e9bd4c'
const THEME: Readonly<Record<string, string>> = {
  claude: '#d77757',
  success: '#4eba65',
  warning: '#ffc107',
  error: '#ff6b80',
  subtle: '#808080',
  suggestion: '#b1b9f9',
}

// Three times the mod's 1.5 s a frame: a column every second and a half reads as standing still on a page.
const FRAME_S = 0.5
const NOW = Date.UTC(2026, 0, 1)
const SAID = 'it is not a bug, it is a pet'
const PROMPT = 'fix the category filter'

const STAGES: readonly Stage[] = ['egg', 'baby', 'child', 'teen', 'adult', 'grumpy', 'angel']

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const colorOf = (segment: Segment): string =>
  segment.isDim === true ? DIM : segment.color === undefined ? TEXT : (THEME[segment.color] ?? segment.color)

/** A run of same-colored pixels in a row as one rect, so a sprite is a handful of elements. */
function rects(pixels: Pixels, x0: number, y0: number, width: number, height: number): string {
  const out: string[] = []
  pixels.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = row[x] ?? null
      let end = x + 1
      while (end < row.length && (row[end] ?? null) === color) end++
      if (color !== null) {
        out.push(`<rect x="${x0 + x * width}" y="${y0 + y * height}" width="${(end - x) * width}" height="${height}" fill="${color}"/>`)
      }
      x = end
    }
  })

  return out.join('')
}

/** The pixels back out of the half blocks a scene is drawn in: the upper one in the text color, the lower in the background. */
function pixelsOfRows(rows: readonly Row[]): Pixels {
  const pixels: Pixels = []
  for (const row of rows) {
    const top: (string | null)[] = []
    const bottom: (string | null)[] = []
    for (const segment of row) {
      for (const char of segment.text) {
        const color = segment.color ?? null
        top.push(char === '▀' || char === '█' ? color : null)
        bottom.push(char === '▄' || char === '█' ? color : char === '▀' ? (segment.backgroundColor ?? null) : null)
      }
    }
    pixels.push(top, bottom)
  }

  return pixels
}

/** A row of text at a terminal column and line, each segment placed by its columns so wide emoji keep the grid. */
function textRow(row: Row, column: number, line: number): string {
  let at = column

  return row
    .map(segment => {
      const x = PAD + at * CELL
      at += columnsOf([segment])
      if (segment.text.trim() === '') return ''
      const weight = segment.isBold === true ? ' font-weight="700"' : ''

      return `<text x="${x}" y="${PAD + line * LINE + BASELINE}" fill="${colorOf(segment)}"${weight}>${escape(segment.text)}</text>`
    })
    .join('')
}

const svg = (width: number, height: number, label: string, body: string): string =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}">`,
    `<style>text{font-family:${FONTS};font-size:${FONT}px;white-space:pre}</style>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${BACKGROUND}" stroke="${BORDER}"/>`,
    body,
    '</svg>',
    '',
  ].join('\n')

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * The footer as the mod lays it out: the stats line, the pet walking its lane under it, and the speech bubble
 * on its left, bottom-aligned with the pet. Every frame is the mod's own scene; each look (eyes open or shut)
 * is drawn once and moved per frame, so the loop costs a few elements however long it is.
 */
function footer(): string {
  if (!IDLE_LINES.includes(SAID)) throw new Error(`"${SAID}" is no longer one of the pet's lines`)
  const pet: Pet = { ...egg('Devling', NOW, 'devling', 4, 4), hatchedAt: NOW, xp: 500, hunger: 70, happiness: 95, energy: 60 }
  const line = statsLine(pet, 95)
  const lane = Math.max(LANE, columnsOf(line))
  const said = bubbleLines(SAID)
  const bubble = Math.max(...said.map(text => text.length)) + 4
  const columns = 2 + bubble + 1 + 1 + lane + 1
  const screenAt = columns - 1 - lane
  const bubbleAt = screenAt - 2 - bubble
  const width = PAD * 2 + columns * CELL
  const height = PAD * 2 + 6 * LINE

  // A loop long enough for both the walk there and back and the blink every seventh frame to come round.
  const width0 = pixelsOfRows(sceneOf(pet, 1, null, lane).sprite)[0]?.length ?? 0
  const walk = Math.max(1, 2 * (lane - width0 - 3))
  const frames = (walk * 7) / gcd(walk, 7)
  const scenes = Array.from({ length: frames }, (_, tick) => sceneOf(pet, tick, null, lane))
  const looks = new Map<string, { pixels: Pixels; frames: Set<number> }>()
  scenes.forEach((scene, tick) => {
    const pixels = pixelsOfRows(scene.sprite)
    const key = JSON.stringify(pixels)
    const look = looks.get(key) ?? { pixels, frames: new Set<number>() }
    look.frames.add(tick)
    looks.set(key, look)
  })

  const dur = `${frames * FRAME_S}s`
  const petTop = PAD + 3 * LINE
  const xs = scenes.map(scene => PAD + (screenAt + scene.x) * CELL)
  const uses = [...looks.values()]
    .map((look, i) => {
      const shown = scenes.map((_, tick) => (look.frames.has(tick) ? 1 : 0))

      return [
        `<defs><g id="look${i}">${rects(look.pixels, 0, 0, CELL, LINE / 2)}</g></defs>`,
        `<use xlink:href="#look${i}" href="#look${i}" x="${xs[0]}" y="${petTop}" opacity="${shown[0]}">`,
        `<animate attributeName="x" values="${xs.join(';')}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`,
        `<animate attributeName="opacity" values="${shown.join(';')}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`,
        '</use>',
      ].join('')
    })
    .join('\n')

  // The bubble stands on the pet's bottom row, its pointer on the pet's middle row, as screen() lays it out.
  const bubbleTop = 6 - (said.length + 2)
  const claude = THEME.claude ?? TEXT
  const body = [
    textRow([{ text: '>', isDim: true }, { text: ` ${PROMPT}` }], 2, 0),
    `<line x1="${PAD}" y1="${PAD + 1.5 * LINE}" x2="${width - PAD}" y2="${PAD + 1.5 * LINE}" stroke="${BORDER}"/>`,
    textRow(line, screenAt, 2),
    `<rect x="${PAD + bubbleAt * CELL + CELL / 2}" y="${PAD + bubbleTop * LINE + LINE / 2}" width="${(bubble - 1) * CELL}" height="${(said.length + 1) * LINE}" rx="7" fill="none" stroke="${claude}"/>`,
    ...said.map((text, i) => textRow([{ text }], bubbleAt + 2, bubbleTop + 1 + i)),
    textRow([{ text: '▸', color: 'claude' }], bubbleAt + bubble, 4),
    uses,
  ].join('\n')

  return svg(width, height, `Devling under the Claude Code prompt, saying: ${SAID}`, body)
}

/** Every species in shop order, a row each, at every stage the mod draws it. */
function species(): string {
  const size = 7
  const cell = 84
  const nameWidth = 150
  const head = 34
  const rowHeight = 58
  const width = PAD * 2 + nameWidth + STAGES.length * cell
  const height = PAD + head + SKIN_IDS.length * rowHeight + PAD / 2
  const labels = STAGES.map(
    (stage, i) =>
      `<text x="${PAD + nameWidth + i * cell + cell / 2}" y="${PAD + 16}" fill="${DIM}" font-size="12" text-anchor="middle">${stage}</text>`,
  )
  const rows = SKIN_IDS.map((id, row) => {
    const top = PAD + head + row * rowHeight
    const { price } = skinOf(id)
    const sprites = STAGES.map((stage, i) => {
      const pixels = pixelsOf(id, stage, { isEyesOpen: true, tick: 0, isFacingLeft: false, tint: null })
      const wide = (pixels[0]?.length ?? 0) * size
      const x0 = PAD + nameWidth + i * cell + Math.floor((cell - wide) / 2)

      return rects(pixels, x0, top + Math.floor((rowHeight - 6 * size) / 2) - 4, size, size)
    })

    return [
      `<text x="${PAD + 4}" y="${top + 22}" fill="${TEXT}" font-weight="700">${id}</text>`,
      `<text x="${PAD + 4}" y="${top + 40}" fill="${price === 0 ? DIM : COIN}" font-size="13">${price === 0 ? 'free' : `${price} 🪙`}</text>`,
      ...sprites,
    ].join('')
  })

  return svg(width, height, 'Every Devling species at every stage, from egg to angel', [...labels, ...rows].join('\n'))
}

mkdirSync('docs', { recursive: true })
writeFileSync('docs/footer.svg', footer())
writeFileSync('docs/species.svg', species())
