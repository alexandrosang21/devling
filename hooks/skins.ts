import type { Stage } from './life'

// The species a pet can be drawn as. Each draws its own baby, child, teen and adult in six pixel rows
// (three terminal rows, two pixels per character): a color per letter, '.' empty. The egg, the grumpy
// adult and the angel are derived from those four, so a new species is four drawings and a palette.

/** A frame's pixels, top to bottom: a color, or null where the lane shows through. */
export type Pixels = (string | null)[][]

type Drawn = 'baby' | 'child' | 'teen' | 'adult'

export type Skin = {
  price: number
  blurb: string
  colors: Readonly<Record<string, string>>
  /** The letters that close on a blink, each taking the color most common around it. */
  eyes: string
  /** Drawn looking right; turned round while it walks left. */
  isMirrored: boolean
  /** The bottom row sways a pixel every other frame, as a ghost's hem. */
  isWavy: boolean
  /** The egg's spots, when the palette's first color would not show on the shell. */
  spot?: string
  drawings: Readonly<Record<Drawn, readonly string[]>>
}

export const DEFAULT_SKIN = 'devling'
const EYE = '#24120b'
const SHELL = '#f3e3c3'
const HALO = '#f5d76e'

const SKINS: Readonly<Record<string, Skin>> = {
  devling: {
    price: 0,
    blurb: 'the original',
    colors: { B: '#d77757', A: '#ffd2bf', L: '#eba083', p: '#f28c8c', e: EYE },
    eyes: 'e',
    isMirrored: false,
    isWavy: false,
    drawings: {
      baby: ['........', '........', '..BBBB..', '.BeBBeB.', '.pBBBBp.', '..BBBB..'],
      child: ['..BBBB..', '.BBBBBB.', 'BBeBBeBB', 'BpBBBBpB', '.BLLLLB.', '.B....B.'],
      teen: ['A......A', '.B.BB.B.', '.BBBBBB.', 'BBeBBeBB', 'BpBLLBpB', '.B.BB.B.'],
      adult: ['A........A', '.BBBBBBBB.', '.BeBBBBeB.', 'BBpBBBBpBB', 'BBBLLLLBBB', '.B.B..B.B.'],
    },
  },
  chick: {
    price: 150,
    blurb: 'grows a comb and becomes a hen',
    colors: { Y: '#f5cf4a', y: '#d6a52c', o: '#f08a2c', r: '#e04848', W: '#f4f1ea', w: '#d9d2c3', e: EYE },
    eyes: 'e',
    isMirrored: false,
    isWavy: false,
    drawings: {
      baby: ['......', '......', '.YYYY.', 'YeYYeY', 'YYooYY', '.o..o.'],
      child: ['...YY...', '..YYYY..', '.YeYYeY.', '.YYooYY.', '.yYYYYy.', '..o..o..'],
      teen: ['...r....', '..YYYY..', '.YeYYeY.', 'yYYooYYy', '.YYYYYY.', '..o..o..'],
      adult: ['...rrrr...', '..WWWWWW..', '.WWeWWeWW.', 'wWWWooWWWw', '.WWWrrWWW.', '...o..o...'],
    },
  },
  cat: {
    price: 200,
    blurb: 'grows a tail, then holds it up',
    colors: { G: '#b9c6d2', D: '#8695a8', W: '#eef2f6', n: '#f29bb0', e: '#1d2430' },
    eyes: 'e',
    isMirrored: false,
    isWavy: false,
    drawings: {
      baby: ['.......', '.......', 'G.....G', 'GGGGGGG', 'GeGnGeG', '.GGGGG.'],
      child: ['G......G', 'GG....GG', 'GGGGGGGG', 'GeGGGGeG', 'GGWnnWGG', '.G.GG.G.'],
      teen: ['G......G..', 'GG....GG..', 'GeGGGGeG..', 'GGWnnWGG.D', '.GDGGDGGGD', '.G.G..G.G.'],
      adult: ['G......G.D', 'GG....GG.D', 'GeGGGGeG.D', 'GGWnnWGGGD', 'GDGGDGGDG.', '.GG.GG.GG.'],
    },
  },
  frog: {
    price: 250,
    blurb: 'starts as a tadpole, looks where it goes',
    colors: { G: '#6cc070', g: '#3f8a46', L: '#cde9a6', w: '#ffffff', k: '#15200f', m: '#a8423a' },
    eyes: 'wk',
    isMirrored: true,
    isWavy: false,
    drawings: {
      baby: ['........', '........', '....GGG.', 'gg.GGGwk', '.gGGGGGG', '....GG..'],
      child: ['.GG..GG.', 'GwkGGwkG', 'GGGGGGGG', 'GGmmmmGG', '.GLLLLG.', '.g....g.'],
      teen: ['.GGG..GGG.', '.GwkGGwkG.', 'GGGGGGGGGG', 'GGmmmmmmGG', '.GLLLLLLG.', '.gg....gg.'],
      adult: ['.GGG..GGG.', 'GGwkGGwkGG', 'GgGGGGGGgG', 'GGmmmmmmGG', 'gGLLLLLLGg', 'gg......gg'],
    },
  },
  ghost: {
    price: 300,
    blurb: 'floats, its hem waves',
    colors: { W: '#e6e4ff', S: '#b9b4ec', p: '#ffb3c7', o: '#3b2f6b', e: '#3b2f6b' },
    eyes: 'e',
    isMirrored: false,
    isWavy: true,
    spot: '#b9b4ec',
    drawings: {
      baby: ['......', '......', '.WWWW.', 'WeWWeW', 'WWWWWW', 'W.WW.W'],
      child: ['..WWWW..', '.WWWWWW.', 'WWeWWeWW', 'WpWooWpW', 'WWWWWWWW', 'W.WW.WW.'],
      teen: ['...WWWW...', '..WWWWWW..', '..WeWWeW..', 'SWWpWWpWWS', '..WWooWW..', '..W.WW.W..'],
      adult: ['..WWWWWW..', '.WWWWWWWW.', 'SWWeWWeWWS', 'SWWpWWpWWS', '.WWWooWWW.', '.W.WW.WW.W'],
    },
  },
  blob: {
    price: 400,
    blurb: 'shiny and round, sprouts a leaf',
    colors: { P: '#ff8fb1', l: '#ffc2d4', w: '#ffffff', d: '#d65f86', f: '#a8496b', v: '#6cc070', e: EYE },
    eyes: 'e',
    isMirrored: false,
    isWavy: false,
    drawings: {
      baby: ['......', '......', '.lPPP.', 'lePPeP', 'PPPPPd', '.dddd.'],
      child: ['..lPPP..', '.lwPPPP.', 'lPePPePd', 'PPPPPPPd', '.dPPPPd.', '..f..f..'],
      teen: ['..lPPPP..', '.lwPPPPP.', 'lPePPPePd', 'PPPPPPPPd', '.dPPPPPd.', '..f...f..'],
      adult: ['....vv....', '..lPPPPP..', '.lwePPePd.', 'lPPPPPPPPd', '.dPPPPPPd.', '..ff..ff..'],
    },
  },
  cube: {
    price: 500,
    blurb: 'an isometric cube, bigger every stage',
    colors: { T: '#a8e6ff', L: '#5bb8e8', R: '#2f7fb0', e: '#0d2233', f: '#0d2233' },
    eyes: 'ef',
    isMirrored: false,
    isWavy: false,
    drawings: {
      baby: ['......', '......', '..TT..', 'TTTTTT', 'LeLRfR', '.LLRR.'],
      child: ['..TT..', '.TTTT.', 'TTTTTT', 'LLLRRR', 'LeLRfR', '.LLRR.'],
      teen: ['..TTTT..', 'TTTTTTTT', 'LLLLRRRR', 'LLeLRfRR', 'LLLLRRRR', '..LLRR..'],
      adult: ['..TTTTTT..', 'TTTTTTTTTT', 'LLLLLRRRRR', 'LLeLLRRfRR', 'LLLLLRRRRR', '..LLLRRR..'],
    },
  },
}

/** Every skin id, in shop order (cheapest first). */
export const SKIN_IDS: readonly string[] = Object.keys(SKINS)

export const isSkin = (id: string): boolean => Object.hasOwn(SKINS, id)

export const skinOf = (id: string): Skin => SKINS[id] ?? (SKINS[DEFAULT_SKIN] as Skin)

const rgb = (color: string): number[] => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
const toHex = (parts: number[]): string =>
  `#${parts.map(n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')}`
const recolor = (colors: Readonly<Record<string, string>>, fn: (color: string) => string): Record<string, string> =>
  Object.fromEntries(Object.entries(colors).map(([letter, color]) => [letter, fn(color)]))

/** `color` moved `amount` of the way to `target`. */
export const mix = (color: string, target: string, amount: number): string => {
  const to = rgb(target)

  return toHex(rgb(color).map((n, i) => n + ((to[i] ?? n) - n) * amount))
}

/** Washed out and darker: the grumpy adult. */
const grey = (color: string): string => {
  const [r = 0, g = 0, b = 0] = rgb(color)
  const light = 0.3 * r + 0.59 * g + 0.11 * b

  return toHex([r, g, b].map(n => (n + (light - n) * 0.55) * 0.78))
}

type Look = { grid: readonly string[]; colors: Readonly<Record<string, string>> }

const looks = new Map<string, Look>()

/** What a species looks like at a stage: its own drawing, or the egg, grumpy and angel made from them. */
function lookOf(id: string, stage: Stage): Look {
  const key = `${id}:${stage}`
  const cached = looks.get(key)
  if (cached !== undefined) {
    return cached
  }
  const skin = skinOf(id)
  const { drawings, colors } = skin
  let look: Look
  if (stage === 'egg') {
    look = {
      grid: ['..cc..', '.cccc.', 'cScccc', 'cccccc', 'ccccSc', '.cccc.'],
      colors: { c: SHELL, S: skin.spot ?? Object.values(colors)[0] ?? SHELL },
    }
  } else if (stage === 'grumpy') {
    look = { grid: drawings.adult, colors: recolor(colors, grey) }
  } else if (stage === 'angel') {
    const width = drawings.child[0]?.length ?? 8
    const halo = '.'.repeat(Math.floor((width - 4) / 2)) + 'hhhh' + '.'.repeat(Math.ceil((width - 4) / 2))
    look = { grid: [halo, ...drawings.child.slice(1)], colors: { ...recolor(colors, c => mix(c, '#ffffff', 0.6)), h: HALO } }
  } else {
    look = { grid: drawings[stage], colors }
  }
  looks.set(key, look)

  return look
}

export const widthOf = (id: string, stage: Stage): number => lookOf(id, stage).grid[0]?.length ?? 0

/** Each eye letter takes the letter most common among its neighbours that are no eye: a closed lid. */
function closeEyes(grid: string[][], eyes: string): string[][] {
  return grid.map((row, y) =>
    row.map((letter, x) => {
      if (!eyes.includes(letter)) {
        return letter
      }
      const counts = new Map<string, number>()
      for (const near of [row[x - 1], row[x + 1], grid[y - 1]?.[x], grid[y + 1]?.[x]]) {
        if (near !== undefined && near !== '.' && !eyes.includes(near)) {
          counts.set(near, (counts.get(near) ?? 0) + 1)
        }
      }

      return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? letter
    }),
  )
}

export type Frame = {
  isEyesOpen: boolean
  tick: number
  isFacingLeft: boolean
  /** A color every pixel leans toward, as a sick pet's green; null for none. */
  tint: string | null
}

/** One frame of a species at a stage: a blink, a waving hem, turned round, tinted. */
export function pixelsOf(id: string, stage: Stage, frame: Frame): Pixels {
  const skin = skinOf(id)
  const look = lookOf(id, stage)
  let grid = look.grid.map(row => [...row])
  const last = grid[grid.length - 1]
  if (skin.isWavy && stage !== 'egg' && frame.tick % 2 === 1 && last !== undefined) {
    grid[grid.length - 1] = [last[last.length - 1] ?? '.', ...last.slice(0, -1)]
  }
  if (!frame.isEyesOpen) {
    grid = closeEyes(grid, skin.eyes)
  }
  if (frame.isFacingLeft && skin.isMirrored) {
    grid = grid.map(row => [...row].reverse())
  }

  return grid.map(row =>
    row.map(letter => {
      const color = letter === '.' ? undefined : look.colors[letter]
      if (color === undefined) {
        return null
      }

      return frame.tint === null ? color : mix(color, frame.tint, 0.55)
    }),
  )
}

/** The shape alone in half blocks, eyes left as holes, for text with no colors (the /pet status). */
export function shapeOf(id: string, stage: Stage): string[] {
  const { grid } = lookOf(id, stage)
  const eyes = skinOf(id).eyes
  const isOn = (letter: string | undefined): boolean => letter !== undefined && letter !== '.' && !eyes.includes(letter)
  const lines: string[] = []
  for (let y = 0; y < grid.length; y += 2) {
    const top = grid[y] ?? ''
    const bottom = grid[y + 1] ?? ''
    let line = ''
    for (let x = 0; x < top.length; x++) {
      const isTop = isOn(top[x])
      const isBottom = isOn(bottom[x])
      line += isTop && isBottom ? '█' : isTop ? '▀' : isBottom ? '▄' : ' '
    }
    lines.push(line)
  }

  return lines
}
