import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DONE_LINES, NEW_TASK_LINES, bubbleLines, cleanQuip, sceneOf, xpBar } from '../hooks/art'
import { dayOf } from '../hooks/economy'
import { active, egg, live, revive } from '../hooks/life'
import type { Pet, Wallet } from '../types'

const MINUTE = 60_000
const NOW = 100 * MINUTE

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

// The engine beneath the plugin: what a session would answer for these events.
// `entries` null: the test answers the store itself, with sharedStore.
async function start($: Engine, on: On, entries: Record<string, unknown> | null = {}) {
  const clock = mock.clock(on, { now: NOW })
  if (entries !== null) {
    mock.store(on, entries)
  }
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  return clock
}

// `/pet <args>` as the person would type it at the terminal.
async function pet($: Engine, args = ''): Promise<string> {
  const { text } = await $.command.run({
    command: 'pet',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })

  return text ?? ''
}

// The store every open session saves the pet to, which the test writes as another session would.
function sharedStore(on: On, entries: Record<string, unknown>): Map<string, unknown> {
  const store = new Map(Object.entries(entries))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))

  return store
}

// A pet as version 0.1 of the mod saved it, before eggs, sleep and poop.
const oldPet = (overrides: Record<string, unknown>) => ({
  name: 'Biscuit',
  hunger: 30,
  happiness: 60,
  xp: 0,
  bornAt: NOW,
  lastSeenAt: NOW,
  ...overrides,
})

describe('life', () => {
  test('an egg appears on the first session and hatches a couple of minutes later', async ($, on) => {
    const clock = await start($, on)
    expect(await pet($)).toContain('An egg')

    await clock.advance(3 * MINUTE)

    expect(await pet($)).toContain('Devling · baby')
  })

  test('a pet saved by v0.1 comes back, hungrier for the time away', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 50, lastSeenAt: NOW - 10 * MINUTE }) })
    const status = await pet($)

    expect(status).toContain('Biscuit · baby')
    expect(status).toMatch(/🍖 \S+ 45%/)
  })

  test('it gets hungry as time passes', async ($, on) => {
    const clock = await start($, on, { pet: oldPet({ hunger: 50 }) })
    await clock.advance(20 * MINUTE)

    expect(await pet($)).toMatch(/🍖 \S+ 40%/)
  })

  test('it falls asleep when tired and wakes up rested', async ($, on) => {
    const clock = await start($, on, { pet: oldPet({ hunger: 90, energy: 15.2 }) })
    await clock.advance(MINUTE)
    expect(await pet($)).toContain('asleep')
    expect(await pet($, 'feed')).toContain('zZz')

    await clock.advance(40 * MINUTE)

    expect(await pet($)).not.toContain('asleep')
  })

  test('a neglected pet flies off to the pixel stars after twelve hours', () => {
    let p: Pet = { ...egg('Mochi', 0), hatchedAt: 0, hunger: 0, happiness: 0 }
    for (let minute = 1; minute <= 12 * 60; minute++) {
      // Someone is about all along, typing away, and never once looks after it.
      p = live({ ...p, lastActiveAt: minute * MINUTE }, minute * MINUTE, () => 0.99).pet
    }

    expect(p.leftAt).not.toBeNull()
    expect(p.careMistakes).toBe(1)
  })

  test('an hour with nobody about is time away: it never starves or leaves, and loses forty at most', () => {
    let p: Pet = { ...egg('Mochi', 0), hatchedAt: 0, hunger: 100, foodHearts: 4 }
    for (let minute = 1; minute <= 24 * 60; minute++) {
      p = live(p, minute * MINUTE, () => 0.99).pet
    }

    // 59 minutes lived as usual, at half a point of food a minute, then nothing.
    expect(p.hunger).toBe(70.5)
    expect(p.neglect).toBe(0)
    expect(p.leftAt).toBeNull()

    const back = active(p, 24 * 60 * MINUTE)
    expect(back.hunger).toBe(30.5)
    expect(back.lastActiveAt).toBe(24 * 60 * MINUTE)
  })

  test('a session left open with nobody about stops living its minutes after an hour', async ($, on) => {
    const clock = await start($, on, { pet: oldPet({ hunger: 90 }) })
    await clock.advance(65 * MINUTE)

    // 59 minutes lived at 0.4 energy a minute, then none: the five idle minutes come back as time away,
    // which leaves energy be. Lived through, they would have left 74%.
    expect(await pet($)).toMatch(/🔋 \S+ 76%/)
  })

  test('revive refuses what is no pet', () => {
    expect(revive({ hello: 'world' }, 0)).toBeNull()
    expect(revive(null, 0)).toBeNull()
  })

  test('the level bar fills through a level and empties on the next', async ($, on) => {
    expect(xpBar(40, 10)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(xpBar(89, 4)).toBe('▰▰▰▱')
    expect(xpBar(90, 4)).toBe('▱▱▱▱')

    await start($, on, { pet: oldPet({ hunger: 90, xp: 55 }) })

    expect(await pet($)).toContain('⭐3 ▰▰▰▱▱▱▱▱▱▱ ⭐4 · 35 xp to go')
  })
})

describe('care', () => {
  test('feeding fills the food bar and the speech bubble says so', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 30 }) })
    expect(await pet($, 'feed')).toContain('nom nom')
    expect(await pet($)).toMatch(/🍖 \S+ 60%/)

    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ type: 'Text', text: 'nom nom nom!' })).toBeDefined()
    // It talks beside its stats, not over them.
    expect(await ui.find({ type: 'Text', text: /♥/ })).toBeDefined()
    await ui.unmount()
  })

  test('clean takes the poop away and meds cure it', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 80, poops: 2, isSick: true }) })
    expect(await pet($)).toContain('2 poop')

    await pet($, 'clean')
    await pet($, 'meds')
    const status = await pet($)

    expect(status).not.toContain('poop')
    expect(status).not.toContain('sick')
  })

  test('the left-or-right game ends after five guesses', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 80 }) })
    expect(await pet($, 'game')).toContain('/pet left')

    let last = ''
    for (let round = 0; round < 5; round++) {
      last = await pet($, 'left')
    }

    expect(last).toMatch(/you won|I win/)
    expect(await pet($, 'left')).toContain('No game running')
  })

  test('a rename in another open session shows here and is never written over', async ($, on) => {
    const store = sharedStore(on, { pet: oldPet({ hunger: 90 }) })
    const clock = await start($, on, null)
    await clock.advance(10_000)
    store.set('pet', { ...(store.get('pet') as Pet), name: 'Mochi', lastSeenAt: NOW + 10_000 })

    await clock.advance(MINUTE)

    expect(await pet($)).toContain('Mochi')
    expect((store.get('pet') as Pet).name).toBe('Mochi')
  })

  test('what another open session does shows here within ten seconds', async ($, on) => {
    const store = sharedStore(on, { pet: oldPet({ hunger: 30 }) })
    const clock = await start($, on, null)
    // Watched in the footer: a /pet would sync at once, as someone being about.
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await clock.advance(1_000)
    store.set('pet', { ...(store.get('pet') as Pet), hunger: 60, lastSeenAt: NOW + 1_000 })
    // Food at 30 fills two of its four hearts, at 60 three, as joy at 60 does.
    expect(await ui.find({ type: 'Text', text: /^♥♥$/ })).toBeDefined()

    await clock.advance(9_000)

    expect(await ui.find({ type: 'Text', text: /^♥♥$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('an alert raised in another open session shows here too', async ($, on) => {
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)

      return { value: undefined }
    })
    const store = sharedStore(on, { pet: oldPet({ hunger: 90 }) })
    const clock = await start($, on, null)
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    store.set('pet', { ...(store.get('pet') as Pet), isSick: true, lastSeenAt: NOW + 1_000 })

    await clock.advance(10_000)

    expect(toasts).toContain('Biscuit is sick! /pet meds')
    expect(await ui.find({ type: 'Text', text: "I don't feel well... /pet meds" })).toBeDefined()
    await ui.unmount()
  })

  test('a minute another open session already lived does not age the pet twice', async ($, on) => {
    const store = sharedStore(on, { pet: oldPet({ hunger: 50 }) })
    const clock = await start($, on, null)
    for (let minute = 1; minute <= 10; minute++) {
      // The other session ticks a second before this one and saves the pet it aged.
      await clock.advance(MINUTE - 1_000)
      const other = store.get('pet') as Pet
      const at = NOW + minute * MINUTE - 1_000
      store.set('pet', { ...other, hunger: other.hunger - 0.5, lastSeenAt: at })
      store.set('tickedAt', at)
      await clock.advance(1_000)
    }

    expect(await pet($)).toMatch(/🍖 \S+ 45%/)
  })

  test('/pet new keeps a living pet unless forced', async ($, on) => {
    await start($, on, { pet: oldPet({}) })
    expect(await pet($, 'new Mochi')).toContain('would miss you')

    await pet($, 'new! Mochi')

    expect(await pet($)).toContain('An egg')
  })

  test('a session a /resume starts in the same process, with no session.start, still shows the pet', async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.store(on, { pet: oldPet({ hunger: 90 }) })
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('classic.SessionStart', () => ({}))
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)

      return <Box />
    })
    await $.classic.SessionStart({ source: 'resume' })

    expect(await pet($)).toContain('Biscuit · baby')
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ type: 'Text', text: /♥/ })).toBeDefined()
    await ui.unmount()
  })
})

const anyOf = (lines: readonly string[]) => new RegExp(lines.map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))

// Types prompts until the plugin's dice send one to the model (Math.random is not ours to fix here);
// forty misses in a row at two in three is under one in a million.
async function typeUntilJoke($: Engine, clock: MockClock, calls: () => number): Promise<void> {
  const before = calls()
  for (let tries = 0; tries < 40 && calls() === before; tries++) {
    await $.prompt.submit({ text: 'fix the cart bug', wait: false, origin: { kind: 'composer' } })
    await clock.advance(0)
  }
}

describe('jokes', () => {
  const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  test('what it says wraps to two bubble lines at most, and what does not fit ends in an ellipsis', () => {
    expect(bubbleLines('nom nom nom!')).toEqual(['nom nom nom!'])
    expect(bubbleLines("I don't feel well... /pet meds")).toEqual(["I don't feel well... /pet meds"])
    expect(bubbleLines('the client wants the button bigger, and bluer, and yesterday')).toEqual([
      'the client wants the button',
      'bigger, and bluer, and…',
    ])
  })

  test('a joke is cut to one bubble line', () => {
    expect(cleanQuip('  "a bug? I ate it already"\nand more')).toBe('a bug? I ate it already')
    expect(cleanQuip('x'.repeat(60))).toHaveLength(48)
  })

  test('a typed prompt gets a joke from the small model, or the stock cheer without one', async ($, on) => {
    const replies = ['«a bug? I ate it already»', '']
    let calls = 0
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('model.complete', () => {
      calls += 1
      const text = replies.shift() ?? ''

      return { value: text === '' ? { isAnswered: false, reason: 'empty-reply', usage: USAGE } : { isAnswered: true, text, usage: USAGE } }
    })
    const clock = await start($, on, { pet: oldPet({ hunger: 90 }) })
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })

    await typeUntilJoke($, clock, () => calls)
    expect(calls).toBe(1)
    expect(await ui.find({ type: 'Text', text: 'a bug? I ate it already' })).toBeDefined()

    await typeUntilJoke($, clock, () => calls)
    expect(calls).toBe(2)
    // A stock line longer than the bubble wraps, and its first line is what shows on top.
    expect(await ui.find({ type: 'Text', text: anyOf(NEW_TASK_LINES.map(line => bubbleLines(line)[0] ?? line)) })).toBeDefined()
    await ui.unmount()
  })

  test('only a long job gets a cheer when Claude is done', async ($, on) => {
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await start($, on, { pet: oldPet({ hunger: 90 }) })
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    const finish = (durationMs: number) => $.turn.complete({ answer: 'ok', durationMs, isAborted: false, turnId: 't', reason: 'answer' })

    await finish(5_000)
    expect(await ui.find({ type: 'Text', text: anyOf(DONE_LINES) })).toBeUndefined()

    await finish(2 * MINUTE)
    expect(await ui.find({ type: 'Text', text: anyOf(DONE_LINES) })).toBeDefined()
    await ui.unmount()
  })

  test('/pet jokes off stops the model calls until /pet jokes on', async ($, on) => {
    let calls = 0
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('model.complete', () => {
      calls += 1

      return { value: { isAnswered: true, text: 'ha', usage: USAGE } }
    })
    const clock = await start($, on, { pet: oldPet({ hunger: 90 }) })

    expect(await pet($, 'jokes off')).toContain('Jokes off')
    await typeUntilJoke($, clock, () => calls)
    expect(calls).toBe(0)
    expect(await pet($, 'jokes')).toContain('are off')

    await pet($, 'jokes on')
    await typeUntilJoke($, clock, () => calls)
    expect(calls).toBe(1)
  })
})

describe('drawing', () => {
  test('the footer shows the pet and its stats at the bottom right, keeping the mode labels', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 30 }) })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'devling', surface, component: 'SessionMode', props: { modes: ['focus'] } })
      expect(await ui.find({ type: 'Text', text: 'focus' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /♥/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('the footer keeps the name, stage, mood and turn to itself: one line of stats under the pet', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    await start($, on, { pet: oldPet({ hunger: 90, happiness: 90 }) })
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await $.turn.start({ text: 'fix the cart bug', turnId: 't' })

    for (const hidden of [/Biscuit/, /baby/, /happy/, /•/]) {
      expect(await ui.find({ type: 'Text', text: hidden })).toBeUndefined()
    }
    expect(await ui.find({ type: 'Text', text: /🪙 10/ })).toBeDefined()
    await ui.unmount()
  })

  test('the coins show beside the name and go up as they come in, with no xp count', async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await start($, on, { pet: oldPet({ hunger: 90, happiness: 90 }) })
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ type: 'Text', text: /🪙 10/ })).toBeDefined()

    await $.turn.start({ text: 'fix the cart bug', turnId: 't1' })
    expect(await ui.find({ type: 'Text', text: /\d\/\d/ })).toBeUndefined()

    await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, turnId: 't1', reason: 'answer' })
    expect(await ui.find({ type: 'Text', text: /🪙 13/ })).toBeDefined()
    await ui.unmount()
  })

  test('the band shows the pet after /pet band and its Feed button works', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 30 }) })
    await pet($, 'band')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'devling', surface, ...BAND })
      await ui.press({ key: 'feed' })
      expect(await ui.find({ type: 'Text', text: 'nom nom nom!' })).toBeDefined()
      await ui.unmount()
    }

    expect(await pet($)).toMatch(/🍖 \S+ 90%/)
  })

  test('playing, it dashes along its lane from where it stood, faster than it walks', async ($, on) => {
    const adult: Pet = { ...egg('Mochi', 0), hatchedAt: 0, xp: 500 }
    const playing = { kind: 'play' as const, startFrame: 3 }
    // A lane of 34 leaves an adult 21 columns to run: it sets off at its walking place and turns at the edge.
    expect(sceneOf(adult, 3, null, 34).x).toBe(3)
    expect(sceneOf(adult, 3, playing, 34, 0).x).toBe(3)
    expect(sceneOf(adult, 3, playing, 34, 10).x).toBe(13)
    expect(sceneOf(adult, 3, playing, 34, 25).x).toBe(14)
    const frog: Pet = { ...adult, skin: 'frog' }
    expect(sceneOf(frog, 3, playing, 34, 25).sprite).not.toEqual(sceneOf(frog, 3, playing, 34, 10).sprite)

    const clock = await start($, on, { pet: oldPet({ hunger: 80 }) })
    expect(await pet($, 'play')).toContain('wheee')
    await clock.advance(7_000)

    expect(await pet($)).toContain('Biscuit')
  })
})

// A wallet already open for the test's day, so no first-of-day bonus muddles the sums.
const walletToday = (overrides: Partial<Wallet>): Wallet => ({
  coins: 0,
  owned: ['devling'],
  day: dayOf(NOW),
  prompts: 0,
  today: 0,
  streak: 1,
  ...overrides,
})

const finish = ($: Engine, durationMs: number) =>
  $.turn.complete({ answer: 'ok', durationMs, isAborted: false, turnId: 't', reason: 'answer' })

// The same rolls every run, so chances can be compared.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296

  return seed / 4294967296
}

describe('poop', () => {
  test('the smaller it is, the more often it poops', () => {
    const poopsOver = (xp: number): number => {
      const roll = seeded(7)
      let p: Pet = { ...egg('Mochi', 0), hatchedAt: 0, xp }
      let count = 0
      for (let minute = 1; minute <= 2000; minute++) {
        const at = minute * MINUTE
        const lived = live({ ...p, energy: 100, hunger: 90, happiness: 90, poops: 0, lastActiveAt: at }, at, roll)
        count += lived.events.filter(event => event === 'pooped').length
        p = lived.pet
      }

      return count
    }

    expect(poopsOver(0)).toBeGreaterThan(2 * poopsOver(500))
  })

  test('no xp while there is poop to clean, and it says so', async ($, on) => {
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await start($, on, { pet: oldPet({ hunger: 90, poops: 1 }) })

    await finish($, 5_000)

    const status = await pet($)
    expect(status).toContain('10 xp to go')
    expect(status).toContain('No xp until the poop is gone')
    await pet($, 'clean')
    expect(await pet($)).toContain('9 xp to go')
  })
})

describe('coins', () => {
  test('finished work pays coins, a long task more, and the day starts with a bonus', async ($, on) => {
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await start($, on, { pet: oldPet({ hunger: 90 }) })
    expect(await pet($, 'coins')).toContain('🪙 10 coins')

    await finish($, 5_000)
    expect(await pet($, 'coins')).toContain('🪙 13 coins')

    await finish($, 2 * MINUTE)
    expect(await pet($, 'coins')).toContain('🪙 21 coins')
  })

  test('typed prompts pay a coin each, up to the daily cap', async ($, on) => {
    on('prompt.submit', ($, e) => ({ text: e.text }))
    const clock = await start($, on, { pet: oldPet({ hunger: 90 }), jokes: false, wallet: walletToday({ coins: 100, prompts: 49 }) })
    for (let i = 0; i < 3; i++) {
      await $.prompt.submit({ text: 'fix the cart bug', wait: false, origin: { kind: 'composer' } })
    }
    await clock.advance(0)

    const coins = await pet($, 'coins')
    expect(coins).toContain('🪙 101 coins')
    expect(coins).toContain('50/50 prompts paid')
  })

  test('a new level and a new stage pay coins', async ($, on) => {
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await start($, on, { pet: oldPet({ hunger: 90, xp: 39 }) })

    await finish($, 5_000)

    expect(await pet($)).toContain('Biscuit · child')
    expect(await pet($, 'coins')).toContain('🪙 83 coins')
  })
})

describe('shop', () => {
  test('coins buy a skin, which it wears at once; a skin not bought cannot be worn', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 90 }), wallet: walletToday({ coins: 300 }) })
    expect(await pet($, 'skin cat')).toContain('Not yours yet')

    expect(await pet($, 'buy frog')).toContain('Bought the frog for 250 🪙, 50 left')
    expect(await pet($)).toContain('frog skin · 🪙 50 coins')
    expect(await pet($, 'buy cube')).toContain('costs 500 🪙 and you have 50')
    expect(await pet($, 'shop')).toMatch(/frog .* · wearing/)

    expect(await pet($, 'skin devling')).toContain('is a devling now')
    expect(await pet($, 'shop')).toMatch(/frog .* · yours · \/pet skin frog/)
    expect(await pet($, 'buy dragon')).toContain('No skin called "dragon"')
  })

  test('coins bring a pet back from the stars at the stage it left', async ($, on) => {
    const store = sharedStore(on, { pet: oldPet({ hunger: 0, xp: 55, leftAt: NOW - MINUTE }), wallet: walletToday({ coins: 150 }) })
    await start($, on, null)
    expect(await pet($, 'revive')).toContain('costs 200 🪙 and you have 150')

    store.set('wallet', walletToday({ coins: 250 }))
    expect(await pet($, 'revive')).toContain('is back, 50 🪙 left')
    expect(await pet($)).toContain('Biscuit · child')
  })

  test('a skin draws in its own colors, a pixel per half character', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 90, xp: 200, skin: 'frog' }) })
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect((await ui.find({ type: 'Text', text: /█/ }))?.props.color).toBe('#6cc070')
    await ui.unmount()

    const teen = revive(oldPet({ xp: 200 }), NOW) as Pet
    expect(sceneOf(teen, 1, null).sprite.flat().some(segment => segment.backgroundColor !== undefined)).toBe(true)
  })
})

describe('hearts', () => {
  test('a new egg holds three hearts of food and joy, a pet from before them keeps its four', () => {
    const laid = egg('Mochi', 0)
    expect([laid.foodHearts, laid.joyHearts, laid.hunger]).toEqual([3, 3, 75])
    expect(revive(oldPet({}), NOW)?.foodHearts).toBe(4)
  })

  test('food stops at what its hearts hold', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 60, foodHearts: 3, joyHearts: 3 }) })
    await pet($, 'feed')

    expect(await pet($)).toMatch(/🍖 ♥♥♥ 100%/)
  })

  test('coins buy a fifth heart, which comes full, and no sixth', async ($, on) => {
    const store = sharedStore(on, { pet: oldPet({ hunger: 90 }), wallet: walletToday({ coins: 200 }) })
    await start($, on, null)
    expect(await pet($, 'upgrade food')).toContain('costs 300 🪙 and you have 200')

    store.set('wallet', walletToday({ coins: 400 }))
    expect(await pet($, 'upgrade food')).toContain('5 food hearts now, 100 🪙 left')
    expect(await pet($)).toMatch(/🍖 ♥♥♥♥♥ 92%/)
    expect(await pet($, 'upgrade food')).toContain('the most there are')
    expect(await pet($, 'shop')).toMatch(/joy +♥♥♥♥ +next heart 300 🪙/)
  })

  test('the empty hearts are drawn dim', async ($, on) => {
    await start($, on, { pet: oldPet({ hunger: 30 }) })
    const ui = await $.ui.mount({ plugin: 'devling', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })

    expect((await ui.find({ type: 'Text', text: /♡/ }))?.props.dimColor).toBe(true)
    await ui.unmount()
  })
})
