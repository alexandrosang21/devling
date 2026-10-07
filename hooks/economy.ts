import type { Wallet } from '../types'
import { DEFAULT_SKIN, isSkin } from './skins'

// Coins: earned by work that gets done with Claude, spent on skins and on bringing a pet back. XP is
// separate and never spent. Pure functions of the wallet and the time; the hooks module saves it.

export const EARN = {
  prompt: 1,
  /** Typed prompts paid a day, so a burst of one-word prompts is no way to farm coins. */
  promptsPerDay: 50,
  task: 3,
  longTask: 5,
  veryLongTask: 10,
  firstOfDay: 10,
  streak: 50,
  streakDays: 7,
  level: 20,
  stage: 50,
} as const

export const REVIVE_PRICE = 200

/** What one more food or joy heart costs, by the heart it would be: the fourth, then the fifth. */
export const heartPrice = (heart: number): number => (heart <= 4 ? 150 : 300)
const LONG_TASK_MS = 60_000
const VERY_LONG_TASK_MS = 5 * 60_000
const DAY_MS = 86_400_000

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)

/** Reads a saved wallet, an empty one when there is none; the free skin is always owned. */
export function walletOf(value: unknown): Wallet {
  const saved = (typeof value === 'object' && value !== null ? value : {}) as Partial<Wallet>
  const owned = Array.isArray(saved.owned) ? saved.owned.filter((id): id is string => typeof id === 'string' && isSkin(id)) : []

  return {
    coins: count(saved.coins),
    owned: owned.includes(DEFAULT_SKIN) ? owned : [DEFAULT_SKIN, ...owned],
    day: typeof saved.day === 'string' ? saved.day : '',
    prompts: count(saved.prompts),
    today: count(saved.today),
    streak: count(saved.streak),
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** The local calendar day of `now`, as YYYY-MM-DD. */
export function dayOf(now: number): string {
  const date = new Date(now)

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** On a new day: the counters start over, the day's first session is paid, and so is every seventh day in a row. */
export function openDay(wallet: Wallet, now: number): { wallet: Wallet; bonus: number } {
  const today = dayOf(now)
  if (wallet.day === today) {
    return { wallet, bonus: 0 }
  }
  const streak = wallet.day === dayOf(now - DAY_MS) ? wallet.streak + 1 : 1
  const bonus = EARN.firstOfDay + (streak % EARN.streakDays === 0 ? EARN.streak : 0)

  return { wallet: { ...wallet, coins: wallet.coins + bonus, day: today, prompts: 0, today: bonus, streak }, bonus }
}

export const pay = (wallet: Wallet, coins: number): Wallet => ({ ...wallet, coins: wallet.coins + coins, today: wallet.today + coins })

/** A typed prompt's coin, until the day's cap. */
export const payPrompt = (wallet: Wallet): Wallet =>
  wallet.prompts >= EARN.promptsPerDay ? wallet : { ...pay(wallet, EARN.prompt), prompts: wallet.prompts + 1 }

/** What a finished task pays: more for one that kept Claude busy a while. */
export const taskPay = (durationMs: number): number =>
  EARN.task + (durationMs >= VERY_LONG_TASK_MS ? EARN.veryLongTask : durationMs >= LONG_TASK_MS ? EARN.longTask : 0)

/** The wallet after paying `price`, or null when it holds too little. */
export const spend = (wallet: Wallet, price: number): Wallet | null =>
  wallet.coins < price ? null : { ...wallet, coins: wallet.coins - price }
