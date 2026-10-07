import type { ActKind, Pet } from '../types'
import { DEFAULT_SKIN, isSkin } from './skins'

// The pet's life, as pure functions of its state and the time: no `$` in here.

export const MINUTE = 60_000
export const MAX_POOPS = 4
const HATCH_MS = 2 * MINUTE
const MISTAKE_AFTER_MIN = 15
// Twelve hours of neglect while sessions are open, never time away.
const LEAVE_AFTER_MIN = 12 * 60
// While no session is open it decays at the waking rate, never by more than this, never below the floor.
const AWAY_LOSS_CAP = 40
const AWAY_FLOOR = 10
// An hour with no prompt typed and no /pet in any session is time away too, as if every session had
// closed: a terminal left open overnight neither starves it nor sends it off.
export const IDLE_MS = 60 * MINUTE

export const isIdle = (p: Pet, now: number): boolean => now - p.lastActiveAt >= IDLE_MS

export type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'adult' | 'grumpy' | 'angel'
export type LifeEvent = 'hatched' | 'pooped' | 'sick' | 'fell-asleep' | 'woke' | 'hungry' | 'sad' | 'left'
export type Action = 'feed' | 'snack' | 'play' | 'clean' | 'meds' | 'sleep' | 'wake'
export type Roll = () => number

// Food and joy are counted in hearts of 25 points. A pet starts with three of each and is bought up to five,
// so a bigger belly or heart lasts longer between meals and games; energy stays a plain 0 to 100.
export const HEART = 25
export const START_HEARTS = 3
export const MAX_HEARTS = 5

export const clamp = (n: number): number => Math.max(0, Math.min(100, n))
/** Food or joy kept between empty and the most five hearts hold; `fit` then holds it to the pet's own hearts. */
export const fill = (n: number): number => Math.max(0, Math.min(MAX_HEARTS * HEART, n))
export const foodMax = (p: Pet): number => HEART * p.foodHearts
export const joyMax = (p: Pet): number => HEART * p.joyHearts
/** Food and joy held to what the pet's hearts hold. */
export const fit = (p: Pet): Pet => ({ ...p, hunger: Math.min(p.hunger, foodMax(p)), happiness: Math.min(p.happiness, joyMax(p)) })
const heartsOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) ? Math.max(START_HEARTS, Math.min(MAX_HEARTS, value)) : fallback

export const levelOf = (xp: number): number => Math.floor(Math.sqrt(xp / 10)) + 1
export const xpForLevel = (level: number): number => 10 * (level - 1) ** 2

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function stageOf(p: Pet): Stage {
  if (p.leftAt !== null) return 'angel'
  if (p.hatchedAt === null) return 'egg'
  const level = levelOf(p.xp)
  if (level < 3) return 'baby'
  if (level < 5) return 'child'
  if (level < 8) return 'teen'

  return p.careMistakes <= 5 ? 'adult' : 'grumpy'
}

// The smaller it is, the more often it goes: a baby about three times as often as an adult, and it
// digests a meal in half the time.
const POOP_CHANCE: Record<Stage, number> = { egg: 0, baby: 1 / 45, child: 1 / 70, teen: 1 / 100, adult: 1 / 140, grumpy: 1 / 140, angel: 0 }
const DIGEST_MIN: Record<Stage, number> = { egg: 20, baby: 10, child: 15, teen: 20, adult: 25, grumpy: 25, angel: 20 }

export function needsAttention(p: Pet): boolean {
  return p.hunger < 25 || p.happiness < 25 || p.isSick || p.poops > 0
}

/** XP earned, unless there is poop to clean: nothing grows in a mess. */
export const gainXp = (p: Pet, xp: number): Pet => (p.poops > 0 ? p : { ...p, xp: p.xp + xp })

/** Back from the pixel stars at the stage and level it left with, half fed and half happy, sickness and mess gone. */
export function bringBack(p: Pet, now: number): Pet {
  return {
    ...p,
    leftAt: null,
    neglect: 0,
    hunger: 50,
    happiness: 50,
    energy: 100,
    isSick: false,
    isAsleep: false,
    poops: 0,
    poopDueAt: null,
    lastSeenAt: now,
  }
}

export function egg(name: string, now: number, skin = DEFAULT_SKIN, foodHearts = START_HEARTS, joyHearts = START_HEARTS): Pet {
  return {
    name,
    hunger: Math.min(80, HEART * foodHearts),
    happiness: Math.min(80, HEART * joyHearts),
    energy: 100,
    xp: 0,
    poops: 0,
    isSick: false,
    isAsleep: false,
    careMistakes: 0,
    neglect: 0,
    bornAt: now,
    hatchedAt: null,
    lastSeenAt: now,
    lastActiveAt: now,
    poopDueAt: null,
    leftAt: null,
    skin,
    foodHearts,
    joyHearts,
  }
}

/** Reads a saved pet, filling what an older version of the mod did not save; null when it is no pet. */
export function revive(value: unknown, now: number): Pet | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const saved = value as Partial<Pet>
  if (typeof saved.name !== 'string' || typeof saved.hunger !== 'number') {
    return null
  }
  const bornAt = num(saved.bornAt, now)

  return fit({
    name: saved.name,
    hunger: fill(saved.hunger),
    happiness: fill(num(saved.happiness, 80)),
    energy: clamp(num(saved.energy, 100)),
    xp: num(saved.xp, 0),
    poops: num(saved.poops, 0),
    isSick: saved.isSick === true,
    isAsleep: saved.isAsleep === true,
    careMistakes: num(saved.careMistakes, 0),
    neglect: num(saved.neglect, 0),
    bornAt,
    // A pet from before eggs existed has long hatched.
    hatchedAt: saved.hatchedAt === undefined ? bornAt : saved.hatchedAt,
    lastSeenAt: num(saved.lastSeenAt, now),
    // A pet from before idle spells was last about when it was last seen.
    lastActiveAt: num(saved.lastActiveAt, num(saved.lastSeenAt, now)),
    poopDueAt: saved.poopDueAt ?? null,
    leftAt: saved.leftAt ?? null,
    // A pet from before skins is the original species.
    skin: typeof saved.skin === 'string' && isSkin(saved.skin) ? saved.skin : DEFAULT_SKIN,
    // A pet from before hearts were bought has always held four.
    foodHearts: heartsOf(saved.foodHearts, 4),
    joyHearts: heartsOf(saved.joyHearts, 4),
  })
}

/** The fresher of two copies of the pet (a session's and the saved one), by when each last changed. */
export function newer(a: Pet | null, b: Pet | null): Pet | null {
  if (a === null) return b
  if (b === null) return a

  return b.lastSeenAt > a.lastSeenAt ? b : a
}

/** What happened to the pet between two copies of it, as another open session's minute or button left it. */
export function eventsBetween(before: Pet, after: Pet): LifeEvent[] {
  if (before.leftAt === null && after.leftAt !== null) {
    return ['left']
  }
  const events: LifeEvent[] = []
  if (after.poops > before.poops) events.push('pooped')
  if (!before.isSick && after.isSick) events.push('sick')
  if (!before.isAsleep && after.isAsleep) events.push('fell-asleep')
  if (before.isAsleep && !after.isAsleep) events.push('woke')
  if (before.hunger >= 25 && after.hunger < 25) events.push('hungry')
  if (before.happiness >= 25 && after.happiness < 25) events.push('sad')

  return events
}

/** The pet as you find it after time away: hungrier, rested, awake to greet you. */
export function comeBack(p: Pet, now: number): Pet {
  if (p.leftAt !== null) {
    return { ...p, lastSeenAt: now, lastActiveAt: now }
  }
  const minutes = Math.max(0, (now - p.lastSeenAt) / MINUTE)
  const lose = (value: number, perMinute: number): number =>
    Math.max(Math.min(value, AWAY_FLOOR), value - Math.min(perMinute * minutes, AWAY_LOSS_CAP))

  return {
    ...p,
    hunger: lose(p.hunger, 0.5),
    happiness: lose(p.happiness, 0.4),
    energy: minutes >= 60 ? 100 : p.energy,
    isAsleep: false,
    poops: minutes >= 120 ? Math.min(MAX_POOPS, p.poops + 1) : p.poops,
    poopDueAt: null,
    hatchedAt: p.hatchedAt ?? (now - p.bornAt >= HATCH_MS ? now : null),
    lastSeenAt: now,
    lastActiveAt: now,
  }
}

/**
 * Someone is about: a typed prompt or a /pet. An idle spell before it comes back as time away, counted
 * from the hour it went idle, the way comeBack() counts a closed session.
 */
export function active(p: Pet, now: number): Pet {
  const pet = isIdle(p, now) ? comeBack({ ...p, lastSeenAt: p.lastActiveAt + IDLE_MS }, now) : p

  return { ...pet, lastActiveAt: now }
}

/** One minute of life while a session is open. */
export function live(p: Pet, now: number, roll: Roll): { pet: Pet; events: LifeEvent[] } {
  const events: LifeEvent[] = []
  if (p.leftAt !== null) {
    return { pet: p, events }
  }
  // Nobody about for an hour: its minutes wait, and come back as time away when someone is (active()).
  if (isIdle(p, now)) {
    return { pet: p, events }
  }
  if (p.hatchedAt === null) {
    if (now - p.bornAt < HATCH_MS) {
      return { pet: p, events }
    }
    events.push('hatched')

    return { pet: { ...p, hatchedAt: now }, events }
  }

  const next: Pet = { ...p }
  if (p.isAsleep) {
    next.energy = clamp(p.energy + 2.5)
    next.hunger = fill(p.hunger - 0.2)
    if (next.energy >= 100) {
      next.isAsleep = false
      events.push('woke')
    }
  } else {
    next.hunger = fill(p.hunger - 0.5)
    next.happiness = fill(p.happiness - 0.4 - (p.isSick ? 0.5 : 0) - 0.2 * p.poops)
    next.energy = clamp(p.energy - 0.4)
    if (next.energy < 15) {
      next.isAsleep = true
      events.push('fell-asleep')
    }
  }

  if (next.poopDueAt !== null && now >= next.poopDueAt) {
    next.poops = Math.min(MAX_POOPS, next.poops + 1)
    next.poopDueAt = null
    events.push('pooped')
  } else if (!p.isAsleep && next.poops < MAX_POOPS && roll() < POOP_CHANCE[stageOf(p)]) {
    next.poops += 1
    events.push('pooped')
  }

  if (!next.isSick && roll() < 0.004 * next.poops + (next.hunger === 0 ? 0.03 : 0)) {
    next.isSick = true
    events.push('sick')
  }

  if (p.hunger >= 25 && next.hunger < 25) events.push('hungry')
  if (p.happiness >= 25 && next.happiness < 25) events.push('sad')

  const isNeglected = next.hunger === 0 || next.happiness === 0 || next.isSick || next.poops >= 3
  next.neglect = isNeglected ? p.neglect + 1 : 0
  if (next.neglect === MISTAKE_AFTER_MIN) {
    next.careMistakes += 1
  }
  if (next.neglect >= LEAVE_AFTER_MIN) {
    next.leftAt = now
    events.push('left')
  }

  return { pet: next, events }
}

/** What a care action does: the pet after it, what it says, and the animation it plays. */
export function perform(p: Pet, action: Action, now: number, roll: Roll): { pet: Pet; line: string; act: ActKind | null } {
  const stay = (line: string) => ({ pet: p, line, act: null })
  const stage = stageOf(p)
  if (stage === 'angel') return stay(`${p.name} lives among the pixel stars now. /pet revive or /pet new`)
  if (stage === 'egg') return stay('*the egg wiggles*')
  if (p.isAsleep && action !== 'sleep' && action !== 'wake') return stay('zZz... (/pet wake)')

  switch (action) {
    case 'feed':
      if (p.hunger >= foodMax(p) - 5) {
        return { pet: { ...p, happiness: fill(p.happiness - 2) }, line: "I'm full!", act: null }
      }

      return {
        pet: gainXp(
          {
            ...p,
            hunger: fill(p.hunger + 30),
            poopDueAt: p.poopDueAt ?? now + DIGEST_MIN[stage] * (1 + roll()) * MINUTE,
          },
          1,
        ),
        line: 'nom nom nom!',
        act: 'eat',
      }
    case 'snack':
      return {
        pet: gainXp({ ...p, happiness: fill(p.happiness + 15), hunger: fill(p.hunger + 5) }, 1),
        line: 'yummy, sugar!',
        act: 'snack',
      }
    case 'play':
      if (p.hunger < 25) return stay('too hungry to play...')
      if (p.energy < 20) return stay('too sleepy to play...')

      return {
        pet: gainXp({ ...p, happiness: fill(p.happiness + 20), hunger: fill(p.hunger - 5), energy: clamp(p.energy - 10) }, 1),
        line: 'wheee!',
        act: 'play',
      }
    case 'clean':
      if (p.poops === 0) return stay('already squeaky clean!')

      return { pet: gainXp({ ...p, poops: 0, happiness: fill(p.happiness + 5) }, 1), line: 'fresh and clean! xp is back', act: 'clean' }
    case 'meds':
      if (!p.isSick) {
        return { pet: { ...p, happiness: fill(p.happiness - 5) }, line: "yuck! I'm not even sick", act: null }
      }

      return {
        pet: gainXp({ ...p, isSick: false, happiness: fill(p.happiness - 5) }, 1),
        line: 'yuck! ...but I feel better',
        act: 'heal',
      }
    case 'sleep':
      if (p.isAsleep) return stay('zZz...')

      return { pet: { ...p, isAsleep: true }, line: 'good night... zZ', act: null }
    case 'wake':
      if (!p.isAsleep) return stay("I'm awake!")

      return { pet: { ...p, isAsleep: false, happiness: fill(p.happiness - 10) }, line: 'five more minutes...', act: null }
  }
}
