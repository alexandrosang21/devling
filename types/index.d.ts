export type Pet = {
  name: string
  /** 0 starving .. 100 full */
  hunger: number
  /** 0 miserable .. 100 overjoyed */
  happiness: number
  /** 0 exhausted .. 100 rested; it falls asleep when this runs low */
  energy: number
  xp: number
  poops: number
  isSick: boolean
  isAsleep: boolean
  /** Spells of neglect that lasted long enough to count; many of them make a grumpy adult. */
  careMistakes: number
  /** Minutes of the current spell of neglect (a need at zero, sick, or a pile of poop). */
  neglect: number
  bornAt: number
  /** null while it is still an egg */
  hatchedAt: number | null
  lastSeenAt: number
  /** When the last meal comes out the other end. */
  poopDueAt: number | null
  /** When it flew off to the pixel stars; null while it lives here. */
  leftAt: number | null
  /** The species it is drawn as, one of the skins: a look only, its life and level stay. */
  skin: string
  /** Hearts its food bar holds, 3 to 5, bought up with coins; each heart holds 25 points. */
  foodHearts: number
  /** Hearts its joy bar holds, 3 to 5, bought up with coins; each heart holds 25 points. */
  joyHearts: number
}

/** Coins earned by working with Claude, shared by every open session, and the skins they bought. */
export type Wallet = {
  coins: number
  /** Skin ids bought, the free one included. */
  owned: string[]
  /** The local day (YYYY-MM-DD) the counters below belong to. */
  day: string
  /** Typed prompts paid today, up to the daily cap. */
  prompts: number
  /** Coins earned today. */
  today: number
  /** Days in a row with a session open. */
  streak: number
}

/** Where the pet is drawn: the prompt footer's right side, or the band above the prompt. */
export type Place = 'footer' | 'band'

/** What the speech bubble says, until the frame counter reaches `untilFrame`. */
export type Speech = { text: string; untilFrame: number }

/** A short animation (eating, playing, ...), counted in frames from `startFrame`. */
export type ActKind = 'eat' | 'snack' | 'play' | 'clean' | 'heal' | 'sparkle'
export type Act = { kind: ActKind; startFrame: number }

/** The left-or-right guessing game, the classic virtual-pet guessing game. */
export type Game = { round: number; wins: number }

declare module 'claude-code' {
  interface PluginState {
    devling: {
      pet: Pet | null
      isHidden: boolean
      frame: number
      place: Place
      speech: Speech | null
      act: Act | null
      game: Game | null
      wallet: Wallet | null
    }
  }
}
