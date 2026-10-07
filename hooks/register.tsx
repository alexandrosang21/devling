import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'

import type { Act, ActKind, Pet, Place, Speech, Wallet } from '../types'
import {
  DONE_LINES,
  IDLE_LINES,
  LANE,
  NEW_TASK_LINES,
  POOP,
  POOP_COLOR,
  cleanQuip,
  columnsOf,
  pick,
  quipRequest,
  sceneOf,
  shopBlock,
  statsLine,
  statusBlock,
  toolLine,
} from './art'
import type { Row, Segment } from './art'
import { EARN, REVIVE_PRICE, heartPrice, openDay, pay, payPrompt, spend, taskPay, walletOf } from './economy'
import {
  HEART,
  MAX_HEARTS,
  MINUTE,
  bringBack,
  clamp,
  comeBack,
  egg,
  eventsBetween,
  fill,
  fit,
  gainXp,
  levelOf,
  live,
  newer,
  perform,
  revive,
  stageOf,
} from './life'
import type { Action, LifeEvent } from './life'
import { DEFAULT_SKIN, SKIN_IDS, isSkin, skinOf } from './skins'

const STORE_KEY = 'pet'
// The coins and the skins bought, shared like the pet by every open session.
const WALLET_KEY = 'wallet'
const DEFAULT_NAME = 'Devling'
const TICK_MS = MINUTE
// Every open session ticks, but only the first each minute ages the pet, or two sessions would starve it twice as fast.
const TICKED_KEY = 'tickedAt'
const TICK_SLACK_MS = 5_000
// How often a session looks for what another one saved: switching sessions shows the same pet within this.
const SYNC_MS = 10_000
const FRAME_MS = 1_500
const SPEECH_FRAMES = 5
// Chatter about Claude's work waits this long after the pet last spoke.
const CHATTER_GAP_MS = 20_000
const GAME_ROUNDS = 5
const NO_PET = 'No pet yet. /pet new hatches one.'
const QUIP_MODEL = 'haiku'
const QUIP_TIMEOUT_MS = 8_000
// A joke on every prompt wears thin fast, and each one is a model call.
const QUIP_CHANCE = 1 / 3
// Only a job this long earns a cheer when Claude is done; a quick answer speaks for itself.
const LONG_TURN_MS = MINUTE
// Saved, unlike hide or band: turning jokes off is about the model calls, so it holds in every session.
const JOKES_KEY = 'jokes'

const pet = atom({ plugin: 'devling', key: 'pet' } as const, null)
const isHidden = atom({ plugin: 'devling', key: 'isHidden' } as const, false)
const frame = atom({ plugin: 'devling', key: 'frame' } as const, 0)
const place = atom({ plugin: 'devling', key: 'place' } as const, 'footer' as Place)
const speech = atom({ plugin: 'devling', key: 'speech' } as const, null)
const act = atom({ plugin: 'devling', key: 'act' } as const, null)
const game = atom({ plugin: 'devling', key: 'game' } as const, null)
const wallet = atom({ plugin: 'devling', key: 'wallet' } as const, null)

let lastSpokeAt = 0
// Set while the small model thinks of a joke about the person's prompt, so the stock cheer stays quiet.
let isQuipping = false
// The session's folder name, for jokes about the project at hand.
let project = ''
// The `about` option: what the person works on, in their words, so the jokes fit it. Set once per load.
let about = ''

const EVENT_LINES: Record<LifeEvent, string> = {
  hatched: '',
  pooped: 'oops... clean me please! /pet clean',
  sick: "I don't feel well... /pet meds",
  'fell-asleep': 'yawn... good night zZ',
  woke: 'good morning!',
  hungry: "I'm hungry... /pet feed",
  sad: 'play with me? /pet play',
  left: 'bye bye...',
}

const EVENT_TOASTS: Partial<Record<LifeEvent, string>> = {
  sick: '{name} is sick! /pet meds',
  hungry: '{name} is hungry. /pet feed',
  sad: '{name} feels lonely. /pet play',
  left: '{name} flew off to the pixel stars. /pet revive or /pet new',
}

// What it says while Claude works and the xp it would have earned is lost to the mess.
const POOPY_LINES = [
  'clean me please! no xp till then',
  'it smells... /pet clean?',
  'all this work and no xp... /pet clean',
  "I can't grow in this mess!",
]

// What each command does, with its numbers: they mirror perform() and live() in life.ts and economy.ts.
const HELP = [
  'Care',
  '  /pet                 how it is doing',
  '  /pet feed            +30 food; it poops 10 to 50 minutes later, sooner the younger it is',
  '  /pet snack           +15 joy, +5 food',
  '  /pet play            +20 joy, -5 food, -10 energy (not when hungry or tired)',
  '  /pet game            left or right, 5 rounds: win 3 for +30 joy and 5 xp, else +10 joy',
  '  /pet clean           clears the poop: no xp comes in while there is any',
  '  /pet meds            cures it when sick, -5 joy',
  '  /pet sleep           +2.5 energy a minute, empty to full in 40 minutes, then it wakes up;',
  '                       asleep, food drops slower and joy holds. Below 15 energy it dozes off itself',
  '  /pet wake            wakes it early, -10 joy',
  'Coins',
  '  /pet coins           your coins, what came in today, days in a row',
  '  /pet shop            skins and hearts, what they cost, what you own',
  '  /pet buy <skin>      buy a skin and wear it',
  '  /pet skin <skin>     wear a skin you own, free',
  '  /pet upgrade food    one more food heart, up to 5: longer between meals',
  '  /pet upgrade joy     one more joy heart, up to 5: longer between games',
  `  /pet revive          bring it back from the pixel stars (${REVIVE_PRICE} coins)`,
  'Settings',
  '  /pet name <name>     rename it',
  '  /pet footer | band   bottom right, or above the prompt with buttons',
  '  /pet hide | show     hide it for this session, or bring it back',
  '  /pet jokes on|off    jokes about what you type, one small model call each',
  '  /pet new <name>      a new egg once it has flown off (/pet new! starts over now)',
].join('\n')

async function say($: EngineInterface, text: string): Promise<void> {
  const tick = await read($, frame)
  lastSpokeAt = await $.clock.now()
  await update($, speech, () => ({ text, untilFrame: tick + SPEECH_FRAMES }))
}

async function startAct($: EngineInterface, kind: ActKind): Promise<void> {
  const tick = await read($, frame)
  await update($, act, () => ({ kind, startFrame: tick }))
}

const canTalk = (p: Pet | null): p is Pet => p !== null && !p.isAsleep && stageOf(p) !== 'egg' && stageOf(p) !== 'angel'

/** Talks about what is going on, unless it is asleep, still an egg, or spoke a moment ago. */
async function chatter($: EngineInterface, line: string, chance: number): Promise<void> {
  const current = await read($, pet)
  if (!canTalk(current)) {
    return
  }
  const now = await $.clock.now()
  if (now - lastSpokeAt < CHATTER_GAP_MS || Math.random() >= chance) {
    return
  }
  await say($, line)
}

/** A joke about what the person just typed, from the small model; the stock cheer when it has none. */
async function quip($: EngineInterface, text: string): Promise<void> {
  isQuipping = true
  try {
    const current = await read($, pet)
    if (!canTalk(current)) {
      return
    }
    const when = new Date(await $.clock.now()).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    const reply = await $.model
      .complete({ model: QUIP_MODEL, ...quipRequest(current, text, when, project, about), maxTokens: 60, effort: 'low', timeoutMs: QUIP_TIMEOUT_MS })
      .catch(() => null)
    const line = reply !== null && reply.isAnswered ? cleanQuip(reply.text) : ''
    await say($, line === '' ? pick(NEW_TASK_LINES, Math.random) : line)
  } finally {
    isQuipping = false
  }
}

/** Celebrates a new stage (hatching, evolving) or level; true when a new stage took the bubble. */
async function celebrate($: EngineInterface, before: Pet, after: Pet): Promise<boolean> {
  const stage = stageOf(after)
  if (stage !== stageOf(before) && stage !== 'angel') {
    await startAct($, 'sparkle')
    if (stageOf(before) === 'egg') {
      await say($, 'hello world!')
      $.ui.toast(`Your egg hatched! Say hi to ${after.name} with /pet`)
    } else {
      await say($, `I'm a ${stage} now!`)
      $.ui.toast(`${after.name} evolved into a ${stage}!`)
    }

    return true
  }
  if (levelOf(after.xp) > levelOf(before.xp)) {
    await say($, `level ${levelOf(after.xp)}!`)
  }

  return false
}

/** Says and toasts what happened to the pet: hungry, sick, a poop; a new stage keeps the bubble. */
async function tell($: EngineInterface, events: readonly LifeEvent[], after: Pet, hasGrown: boolean): Promise<void> {
  for (const event of events) {
    if (EVENT_LINES[event] !== '' && !hasGrown) {
      await say($, EVENT_LINES[event])
    }
    const toast =
      event === 'pooped'
        ? after.poops >= 2
          ? '{name} made a mess. No xp until /pet clean'
          : '{name} pooped! No xp until you clean it: /pet clean'
        : EVENT_TOASTS[event]
    if (toast !== undefined) {
      $.ui.toast(toast.replace('{name}', after.name))
    }
  }
}

/**
 * Picks up the pet another open session saved since this one last looked, and tells what happened to
 * it there, so every session shows the same pet and raises the same alerts. Reads only, never saves.
 */
async function sync($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const savedWallet = walletOf(await $.store.get(WALLET_KEY))
  const ownWallet = await read($, wallet)
  if (ownWallet === null || JSON.stringify(ownWallet) !== JSON.stringify(savedWallet)) {
    await update($, wallet, () => savedWallet)
  }
  const saved = revive(await $.store.get(STORE_KEY), now)
  const own = await read($, pet)
  if (saved === null || own === null || saved.lastSeenAt <= own.lastSeenAt) {
    return
  }
  await update($, pet, p => newer(p, saved))
  await tell($, eventsBetween(own, saved), saved, await celebrate($, own, saved))
}

/**
 * Applies `fn` to the wallet every open session shares, after opening the day: whichever session meets a
 * new day first pays its bonus, once. Null, and nothing spent, when `fn` refuses (a purchase short of coins).
 */
async function withWallet($: EngineInterface, fn: (w: Wallet) => Wallet | null): Promise<Wallet | null> {
  const now = await $.clock.now()
  const opened = openDay(walletOf(await $.store.get(WALLET_KEY)), now)
  const after = fn(opened.wallet)
  const saved = after ?? opened.wallet
  await $.store.set(WALLET_KEY, saved)
  await update($, wallet, () => saved)
  if (opened.bonus > 0) {
    const streak = saved.streak > 1 ? `, ${saved.streak} days in a row` : ''
    $.ui.toast(`A new day with Claude: +${opened.bonus} 🪙${streak}`)
  }

  return after
}

const earn = ($: EngineInterface, coins: number): Promise<Wallet | null> => withWallet($, w => pay(w, coins))

/**
 * Applies `fn` to the live pet and saves it across sessions. A new stage (hatching,
 * evolving) is celebrated here, and `hasGrown` tells the caller to leave the bubble to it.
 * Other open sessions save the same pet, so it first picks up a newer saved one: a rename
 * or a meal elsewhere is never written over with a stale copy. Growing pays coins here, in
 * the session where it happened, and never again where sync only sees it.
 */
async function change($: EngineInterface, fn: (p: Pet) => Pet): Promise<{ pet: Pet; hasGrown: boolean } | null> {
  await sync($)
  const now = await $.clock.now()
  const seen = { before: null as Pet | null }
  const after = await update($, pet, p => {
    seen.before = p

    return p === null ? null : { ...fit(fn(p)), lastSeenAt: now }
  })
  if (after === null || seen.before === null) {
    return null
  }
  await $.store.set(STORE_KEY, after)
  const before = seen.before
  const stage = stageOf(after)
  const isNewStage = stage !== stageOf(before) && stage !== 'angel' && stageOf(before) !== 'angel'
  const levels = Math.max(0, levelOf(after.xp) - levelOf(before.xp))
  const bonus = (isNewStage ? EARN.stage : 0) + levels * EARN.level
  if (bonus > 0) {
    await earn($, bonus)
  }

  return { pet: after, hasGrown: await celebrate($, before, after) }
}

async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const tickedAt = await $.store.get(TICKED_KEY)
  const isOurMinute = typeof tickedAt !== 'number' || now - tickedAt >= TICK_MS - TICK_SLACK_MS
  const out = { events: [] as LifeEvent[] }
  // A minute another session already lived reaches this one through sync, with its alerts.
  if (isOurMinute) {
    await $.store.set(TICKED_KEY, now)
    const changed = await change($, p => {
      const lived = live(p, now, Math.random)
      out.events = lived.events

      return lived.pet
    })
    if (changed === null) {
      return
    }
    await tell($, out.events, changed.pet, changed.hasGrown)
  }
  if (out.events.length === 0) {
    await chatter($, pick(IDLE_LINES, Math.random), 0.12)
  }
}

async function doAction($: EngineInterface, action: Action): Promise<string> {
  const now = await $.clock.now()
  const out = { line: '', act: null as ActKind | null }
  const changed = await change($, p => {
    const done = perform(p, action, now, Math.random)
    out.line = done.line
    out.act = done.act

    return done.pet
  })
  if (changed === null) {
    return NO_PET
  }
  if (!changed.hasGrown) {
    await say($, out.line)
    if (out.act !== null) {
      await startAct($, out.act)
    }
  }

  return `${changed.pet.name}: ${out.line}`
}

async function startGame($: EngineInterface): Promise<string> {
  const current = await read($, pet)
  if (current === null) {
    return NO_PET
  }
  const check = perform(current, 'play', await $.clock.now(), () => 0)
  if (check.act === null) {
    return `${current.name}: ${check.line}`
  }
  await update($, game, () => ({ round: 1, wins: 0 }))
  await say($, 'left or right? guess!')

  return `${current.name} will look left or right. Guess with /pet left or /pet right (round 1/${GAME_ROUNDS}).`
}

async function guess($: EngineInterface, side: 'left' | 'right'): Promise<string> {
  const current = await read($, game)
  if (current === null) {
    return 'No game running. /pet game starts one.'
  }
  const look = Math.random() < 0.5 ? 'left' : 'right'
  const wins = current.wins + (look === side ? 1 : 0)
  await startAct($, 'play')

  if (current.round < GAME_ROUNDS) {
    await update($, game, () => ({ round: current.round + 1, wins }))
    const line = `I looked ${look}! ${look === side ? 'you got me!' : 'nope!'}`
    await say($, line)

    return `${line} (${wins}/${current.round} so far, round ${current.round + 1}/${GAME_ROUNDS} next)`
  }

  await update($, game, () => null)
  const isWon = wins >= 3
  await change($, p =>
    gainXp({ ...p, happiness: fill(p.happiness + (isWon ? 30 : 10)), energy: clamp(p.energy - 5) }, isWon ? 5 : 2),
  )
  const line = isWon ? `you won ${wins}/${GAME_ROUNDS}! ♥` : `I win! you got ${wins}/${GAME_ROUNDS} hehe`
  await say($, line)

  return `I looked ${look}! ${line}`
}

async function moveTo($: EngineInterface, where: Place): Promise<string> {
  await update($, place, () => where)
  await update($, isHidden, () => false)

  return where === 'band'
    ? 'Pet moved above the prompt, with buttons (ctrl+x tab or a click focuses them).'
    : 'Pet moved to the bottom right, under the prompt.'
}

async function adopt($: EngineInterface, name: string, isForced: boolean): Promise<string> {
  const previous = await read($, pet)
  if (previous !== null && stageOf(previous) !== 'angel' && !isForced) {
    return `${previous.name} would miss you! To start over anyway: /pet new! <name>`
  }
  // What was bought stays bought: the new egg wears the same skin and holds the same hearts.
  const laid = egg(name === '' ? DEFAULT_NAME : name, await $.clock.now(), previous?.skin, previous?.foodHearts, previous?.joyHearts)
  await update($, pet, () => laid)
  await update($, game, () => null)
  await $.store.set(STORE_KEY, laid)
  await startAct($, 'sparkle')

  return `${previous === null ? '' : `${previous.name} waves goodbye. `}A new egg appeared! It hatches in a couple of minutes.`
}

async function coinsLine($: EngineInterface): Promise<string> {
  const w = (await withWallet($, current => current)) ?? walletOf(undefined)
  const streak = w.streak === 1 ? 'first day in a row' : `${w.streak} days in a row`

  return `🪙 ${w.coins} coins · +${w.today} today (${w.prompts}/${EARN.promptsPerDay} prompts paid) · ${streak} · /pet shop`
}

/** Puts on a skin the wallet already holds. */
async function wear($: EngineInterface, id: string): Promise<string> {
  const owned = (await withWallet($, w => w))?.owned ?? [DEFAULT_SKIN]
  if (!owned.includes(id)) {
    return `Not yours yet: /pet buy ${id} (${skinOf(id).price} 🪙)`
  }
  const changed = await change($, p => ({ ...p, skin: id }))
  if (changed === null) {
    return NO_PET
  }
  await startAct($, 'sparkle')
  await say($, 'new look!')

  return `${changed.pet.name} is a ${id} now.`
}

/** Pays for a skin and puts it on; one already owned is just put on. */
async function buy($: EngineInterface, id: string): Promise<string> {
  const skin = skinOf(id)
  const out = { refusal: '', isOwned: false }
  const after = await withWallet($, w => {
    if (w.owned.includes(id)) {
      out.isOwned = true

      return null
    }
    const paid = spend(w, skin.price)
    if (paid === null) {
      out.refusal = `A ${id} costs ${skin.price} 🪙 and you have ${w.coins}: ${skin.price - w.coins} to go. Work with Claude to earn more.`

      return null
    }

    return { ...paid, owned: [...paid.owned, id] }
  })
  if (out.isOwned) {
    return wear($, id)
  }
  if (after === null) {
    return out.refusal
  }
  const worn = await wear($, id)

  return `Bought the ${id} for ${skin.price} 🪙, ${after.coins} left. ${worn}`
}

/** Pays for one more food or joy heart, which comes full: the bar holds more and lasts longer. */
async function upgrade($: EngineInterface, bar: 'food' | 'joy'): Promise<string> {
  const current = await read($, pet)
  if (current === null) {
    return NO_PET
  }
  if (stageOf(current) === 'angel') {
    return `${current.name} is among the pixel stars. /pet revive first.`
  }
  const hearts = bar === 'food' ? current.foodHearts : current.joyHearts
  if (hearts >= MAX_HEARTS) {
    return `${current.name} already has ${MAX_HEARTS} ${bar} hearts, the most there are.`
  }
  const price = heartPrice(hearts + 1)
  const out = { coins: 0 }
  const after = await withWallet($, w => {
    out.coins = w.coins

    return spend(w, price)
  })
  if (after === null) {
    return `A ${bar} heart costs ${price} 🪙 and you have ${out.coins}: ${price - out.coins} to go.`
  }
  await change($, p =>
    bar === 'food'
      ? { ...p, foodHearts: p.foodHearts + 1, hunger: fill(p.hunger + HEART) }
      : { ...p, joyHearts: p.joyHearts + 1, happiness: fill(p.happiness + HEART) },
  )
  await startAct($, 'sparkle')
  await say($, bar === 'food' ? 'a bigger belly!' : 'a bigger heart!')

  return `${current.name} has ${hearts + 1} ${bar} hearts now, ${after.coins} 🪙 left.`
}

/** Pays to bring a pet back from the stars at the stage and level it left with. */
async function bringBackPet($: EngineInterface): Promise<string> {
  const current = await read($, pet)
  if (current === null) {
    return NO_PET
  }
  if (stageOf(current) !== 'angel') {
    return `${current.name} is right here, nothing to bring back.`
  }
  const out = { coins: 0 }
  const after = await withWallet($, w => {
    out.coins = w.coins

    return spend(w, REVIVE_PRICE)
  })
  if (after === null) {
    return `Bringing ${current.name} back costs ${REVIVE_PRICE} 🪙 and you have ${out.coins}. /pet new hatches a new egg for free.`
  }
  const now = await $.clock.now()
  const changed = await change($, p => bringBack(p, now))
  await startAct($, 'sparkle')
  await say($, "I'm back! I missed you")
  $.ui.toast(`${current.name} is back from the stars!`)

  return `${changed?.pet.name ?? current.name} is back, ${after.coins} 🪙 left.`
}

type View = { pet: Pet; tick: number; act: Act | null; speech: Speech | null; coins: number | null }

async function viewOf($: EngineInterface, current: Pet): Promise<View> {
  return {
    pet: current,
    tick: await read($, frame),
    act: await read($, act),
    speech: await read($, speech),
    coins: (await read($, wallet))?.coins ?? null,
  }
}

const textProps = (segment: Segment) => ({
  ...(segment.color === undefined ? {} : { color: segment.color }),
  ...(segment.backgroundColor === undefined ? {} : { backgroundColor: segment.backgroundColor }),
  ...(segment.isBold === true ? { bold: true as const } : {}),
  ...(segment.isDim === true ? { dimColor: true as const } : {}),
})

/**
 * The pet's little screen: its line of stats on top, read like a game's HUD just under the prompt, and the
 * pet walking below it as wide as the line (its poop at the end), the window's bottom edge for a floor. It
 * talks on `side`, the side with room to spare (left of the right-aligned footer, right of the band), the
 * bubble level with the pet, so nothing moves when it speaks.
 */
function screen(ui: ElementTable, view: View, side: 'left' | 'right') {
  const { Box, Text } = ui
  const line = statsLine(view.pet, view.coins)
  // Each poop is three columns and a space, the gap before them included.
  const poopColumns = stageOf(view.pet) === 'angel' ? 0 : view.pet.poops * 4
  const lane = Math.max(LANE, columnsOf(line) - poopColumns)
  const scene = sceneOf(view.pet, view.tick, view.act, lane)
  const said = view.speech !== null && view.tick < view.speech.untilFrame ? view.speech.text : null
  const drawRow = (row: Row) => (
    <Box flexDirection="row">{row.length === 0 ? <Text> </Text> : row.map(segment => <Text {...textProps(segment)}>{segment.text}</Text>)}</Box>
  )
  const pointer = (mark: string) => (
    <Box flexDirection="column">
      <Text> </Text>
      <Text color="claude">{mark}</Text>
      <Text> </Text>
    </Box>
  )
  const bubble = said !== null && (
    <Box flexDirection="row">
      {side === 'right' && pointer('◂')}
      <Box borderStyle="round" borderColor="claude" paddingX={1}>
        <Text>{said}</Text>
      </Box>
      {side === 'left' && pointer('▸')}
    </Box>
  )

  return (
    <Box flexDirection="row" gap={1} alignItems="flex-end">
      {side === 'left' && bubble}
      <Box flexDirection="column">
        {drawRow(line)}
        <Box flexDirection="row" gap={1}>
          <Box width={lane} flexDirection="row">
            <Box marginLeft={scene.x} flexDirection="column">
              {scene.sprite.map(drawRow)}
            </Box>
            <Box flexDirection="column">{scene.fx.map(segment => <Text {...textProps(segment)}>{segment.text}</Text>)}</Box>
          </Box>
          {scene.poops > 0 && (
            <Box flexDirection="column">
              <Text> </Text>
              <Text> </Text>
              <Text color={POOP_COLOR}>{Array.from({ length: scene.poops }, () => POOP).join(' ')}</Text>
            </Box>
          )}
        </Box>
      </Box>
      {side === 'right' && bubble}
    </Box>
  )
}

export const register: Register = (on, options) => {
  about = typeof options.about === 'string' ? options.about.trim().slice(0, 300) : ''

  on('session.start', async ($, e, next) => {
    project = e.cwd.split(/[\\/]/).filter(part => part !== '').pop() ?? ''
    // A hot reload keeps the session's pet unless another session saved a newer one; a fresh session
    // finds the saved one, hungrier for the time away.
    const now = await $.clock.now()
    // Both go through revive: a pet the previous version left in the session lacks the newer fields too.
    const kept = revive(await read($, pet), now)
    const saved = revive(await $.store.get(STORE_KEY), now)
    const loaded = (kept === null ? null : newer(kept, saved)) ?? (saved === null ? egg(DEFAULT_NAME, now) : comeBack(saved, now))
    await update($, pet, () => loaded)
    await $.store.set(STORE_KEY, loaded)
    if (kept === null && saved === null) {
      $.ui.toast('An egg appeared! It hatches in a couple of minutes. /pet')
    } else if (kept === null && saved !== null && now - saved.lastSeenAt > 30 * MINUTE && stageOf(loaded) !== 'angel') {
      await say($, "you're back! I missed you")
    }
    // Opens the day: the first session of one is paid.
    await withWallet($, w => w)

    $.clock.every(TICK_MS, () => {
      void tick($)
    })
    $.clock.every(SYNC_MS, () => {
      void sync($)
    })
    $.clock.every(FRAME_MS, () => {
      void update($, frame, n => n + 1)
    })

    await $.command.register({
      name: 'pet',
      description: 'Your pixel pet: feed, play, clean, put to bed, shop for skins (/pet help)',
      argumentHint: '[feed | snack | play | game | clean | meds | sleep | wake | coins | shop | buy | skin | upgrade | revive | help]',
    })

    return next(e)
  })

  // Every tool Claude runs is a little show: successes teach it, errors upset it; a mess keeps the xp away.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      const hasFailed = ran.isError === true
      const changed = await change($, p => (hasFailed ? { ...p, happiness: fill(p.happiness - 1) } : gainXp(p, 1)))
      const isPoopy = changed !== null && changed.pet.poops > 0
      const line = isPoopy && !hasFailed ? pick(POOPY_LINES, Math.random) : toolLine(String(e.tool), hasFailed, Math.random)
      await chatter($, line, hasFailed ? 0.8 : 0.3)
    }

    return ran
  }).catch(($, e, next) => next(e))

  // What the person types pays a coin (up to the day's cap) and sometimes gets a joke while Claude starts
  // on it; the prompt never waits for the model.
  on('prompt.submit', async ($, e, next) => {
    const isTyped = (e.origin.kind === 'composer' || e.origin.kind === 'bridge') && !e.text.trimStart().startsWith('/')
    if (isTyped) {
      await withWallet($, payPrompt)
    }
    const isJokeTime = isTyped && Math.random() < QUIP_CHANCE
    if (isJokeTime && (await $.store.get(JOKES_KEY)) !== false) {
      void quip($, e.text)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (!isQuipping) {
      await chatter($, pick(NEW_TASK_LINES, Math.random), 0.25)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      if (e.reason === 'answer') {
        await change($, p => gainXp({ ...p, happiness: fill(p.happiness + 2) }, 2))
        const coins = taskPay(e.durationMs)
        await earn($, coins)
        if (e.durationMs >= LONG_TURN_MS) {
          lastSpokeAt = 0
          await chatter($, `${pick(DONE_LINES, Math.random)} +${coins} 🪙`, 1)
        }
      } else if (e.reason === 'error') {
        await change($, p => ({ ...p, happiness: fill(p.happiness - 3) }))
      }
    }

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [first = '', ...rest] = e.args.trim().split(/\s+/)
    const verb = first.toLowerCase()
    const name = rest.join(' ').slice(0, 20)

    switch (verb) {
      case '': {
        const current = await read($, pet)
        const coins = (await withWallet($, w => w))?.coins ?? 0

        return { text: current === null ? NO_PET : statusBlock(current, await $.clock.now(), coins) }
      }
      case 'coins':
        return { text: await coinsLine($) }
      case 'shop': {
        const w = (await withWallet($, current => current)) ?? walletOf(undefined)

        return { text: shopBlock(w.coins, w.owned, await read($, pet), SKIN_IDS) }
      }
      case 'buy':
      case 'skin': {
        const id = (rest[0] ?? '').toLowerCase()
        if (!isSkin(id)) {
          return { text: `${id === '' ? 'Which skin?' : `No skin called "${id}".`} One of: ${SKIN_IDS.join(', ')}. /pet shop shows them.` }
        }

        return { text: verb === 'buy' ? await buy($, id) : await wear($, id) }
      }
      case 'revive':
        return { text: await bringBackPet($) }
      case 'upgrade': {
        const bar = (rest[0] ?? '').toLowerCase()
        if (bar !== 'food' && bar !== 'joy') {
          return { text: 'Upgrade which bar? /pet upgrade food | joy' }
        }

        return { text: await upgrade($, bar) }
      }
      case 'help':
        return { text: HELP }
      case 'feed':
      case 'snack':
      case 'play':
      case 'clean':
      case 'meds':
      case 'sleep':
      case 'wake':
        return { text: await doAction($, verb) }
      case 'game':
        return { text: await startGame($) }
      case 'left':
      case 'right':
        return { text: await guess($, verb) }
      case 'name': {
        if (name === '') {
          return { text: 'Give it a name: /pet name Biscuit' }
        }
        const renamed = await change($, p => ({ ...p, name }))

        return { text: renamed === null ? NO_PET : `Your pet is now called ${name}.` }
      }
      case 'footer':
      case 'band':
        return { text: await moveTo($, verb) }
      case 'hide':
        await update($, isHidden, () => true)

        return { text: 'Pet hidden. /pet show brings it back.' }
      case 'show':
        await update($, isHidden, () => false)

        return { text: 'Pet is back.' }
      case 'jokes': {
        const choice = (rest[0] ?? '').toLowerCase()
        if (choice !== 'on' && choice !== 'off') {
          const isOn = (await $.store.get(JOKES_KEY)) !== false

          return { text: `Jokes about your prompts are ${isOn ? 'on' : 'off'}. /pet jokes on | off` }
        }
        await $.store.set(JOKES_KEY, choice === 'on')

        return {
          text:
            choice === 'on'
              ? 'Jokes on: it reacts to what you type, one small model call per prompt.'
              : 'Jokes off: no more model calls, just its usual cheers.',
        }
      }
      case 'new':
      case 'new!':
        return { text: await adopt($, name, verb === 'new!') }
      default:
        return { text: `Unknown action "${first}".\n${HELP}` }
    }
  })

  // Bottom right of the prompt footer, the engine's own mode labels kept beside it.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await read($, pet)
    if (current === null || (await read($, isHidden)) || (await read($, place)) !== 'footer') {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    return (
      <Box flexDirection="row" gap={1}>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')}</Text>}
        {screen(ui, await viewOf($, current), 'left')}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, pet)
    const isQuiet = e.props.hasSurvey || current === null || (await read($, isHidden)) || (await read($, place)) !== 'band'
    if (isQuiet) {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Box, Button } = ui
    const isPlaying = (await read($, game)) !== null
    const stage = stageOf(current)
    const canAct = stage !== 'egg' && stage !== 'angel'
    const run = (action: Action) => async () => {
      await doAction($, action)
    }

    return (
      <Box flexDirection="column">
        {screen(ui, await viewOf($, current), 'right')}
        {canAct && isPlaying && (
          <Box flexDirection="row" gap={1}>
            <Button key="left" label="← Left" hotkey="l" onPress={async () => void (await guess($, 'left'))} />
            <Button key="right" label="Right →" hotkey="r" onPress={async () => void (await guess($, 'right'))} />
          </Box>
        )}
        {canAct && !isPlaying && (
          <Box flexDirection="row" gap={1}>
            <Button key="feed" label="Feed" hotkey="f" onPress={run('feed')} />
            <Button key="snack" label="Snack" hotkey="s" onPress={run('snack')} />
            <Button key="play" label="Play" hotkey="p" onPress={run('play')} />
            <Button key="game" label="Game" hotkey="g" onPress={async () => void (await startGame($))} />
            <Button key="clean" label="Clean" hotkey="c" onPress={run('clean')} />
            <Button key="meds" label="Meds" hotkey="m" onPress={run('meds')} />
            <Button
              key="lights"
              label={current.isAsleep ? 'Wake' : 'Sleep'}
              hotkey="z"
              onPress={run(current.isAsleep ? 'wake' : 'sleep')}
            />
          </Box>
        )}
      </Box>
    )
  })
}
