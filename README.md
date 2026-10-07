# Devling

A pixel pet that lives under your Claude Code prompt. It hatches from an egg, grows up as Claude works, gets hungry, sleeps, makes messes, catches a cold, and has opinions about your prompts. The work you get done with Claude earns coins, and coins buy it new looks, bigger hearts, or a way back if it ever flies off.

<!-- TODO: add docs/screenshot.png (or a short GIF) of the footer, then show it here -->

Devling is a Claude Code [mod](https://code.claude.com/docs/en/plugins/mods): a plugin of function hooks that draws in the terminal and adds a `/pet` command.

## What you see

At the bottom right, under the prompt, one line of stats with the pet walking below it:

```text
🍖 ♥♥♥♡ 😊 ♥♥♥♥ 🔋 ▰▰▰▱▱ ⭐6 🪙 95
          ▄▀▀▀▀▄
          █▀██▀█
          ▀▀▀▀▀▀
```

Food and joy in hearts, energy, level, and coins. The pet talks in a speech bubble beside it. `/pet band` moves it above the prompt, with buttons.

## How it lives

- **Egg.** A new pet starts as an egg and hatches a couple of minutes later.
- **Needs.** Food, joy and energy drop a little every minute while a Claude Code session is open. Time away counts too, but only up to a cap: come back after a weekend and it is hungry, rested and happy to see you.
- **Growing up.** Every tool call Claude runs and every finished task earns experience. It goes from baby to child, teen and adult. A pet that was neglected too often grows into a grumpy adult.
- **Mess.** It poops after meals and now and then, the younger the more often. While there is poop around it earns no experience at all, and it will ask you to clean up. Leave the mess too long and it can get sick.
- **Leaving.** Neglected for twelve hours of open sessions in a row, it flies off to the pixel stars. `/pet revive` brings it back, or `/pet new` gives you a new egg.
- **Talking.** It reacts to what Claude does (shell commands, edits, errors, long tasks finishing) in its bubble.

Every open session shows the same pet. They share one save and pick up each other's changes within about ten seconds, alerts included.

## Coins and the shop

Coins come from work, never from the pet's own commands:

| What happens | Coins |
| :- | -: |
| You type a prompt (up to 50 a day) | +1 |
| Claude finishes a task | +3 |
| ... and it ran over a minute | +5 more |
| ... or over five minutes | +10 more |
| The first session of a day | +10 |
| Every 7th day in a row | +50 |
| The pet reaches a new level | +20 |
| The pet reaches a new stage | +50 |

A typical working day brings in about 200. `/pet shop` lists what they buy:

- **Skins.** Seven species, each with its own baby, child, teen and adult drawings: devling (free), chick, cat, frog, ghost, blob and cube, from 150 to 500 coins. A skin changes the look only: the pet keeps its name, level and stage. Bought skins are yours for good; switch between them for free.
- **Hearts.** A new pet holds three hearts of food and three of joy. A fourth costs 150 and a fifth 300. Each heart holds 25 points more, so the bar lasts longer between meals or games.
- **Revive.** 200 coins bring a pet back from the pixel stars at the stage and level it left with.

## Requirements

- Claude Code v2.1.287 or later, in a terminal (`claude --version`)
- Mods turned on, which is the default

It also draws in the Code tab of the Claude Desktop app once installed from a terminal at user scope. In the VS Code chat panel and in `claude -p` the hooks run but nothing is drawn.

## Install

At the Claude Code prompt in a terminal:

```text
/plugin install devling --marketplace alexandrosang21/devling
```

Answer `y` to add the marketplace, then press Enter to install for your user. You should see `Installed devling. Plugin is now active.` and an egg appears.

From your shell instead:

```bash
claude plugin marketplace add alexandrosang21/devling
claude plugin install devling@devling
```

A mod runs with your permissions. To see what this one hooks and calls before you install it, clone the repository and run `claude plugin validate .` in it.

## Commands

| Command | What it does |
| :- | :- |
| `/pet` | Shows the pet, its stats, its skin and your coins |
| `/pet feed` | A meal |
| `/pet snack` | A treat that cheers it up |
| `/pet play` | Play together |
| `/pet game` | The left-or-right game, then `/pet left` or `/pet right` for five rounds |
| `/pet clean` | Cleans up the mess, and experience comes back |
| `/pet meds` | Medicine when it is sick |
| `/pet sleep`, `/pet wake` | Lights off: energy refills at 2.5 a minute, empty to full in 40 minutes, then it wakes up. Waking it early costs some joy |
| `/pet coins` | Your coins, what came in today, days in a row |
| `/pet shop` | Skins and hearts, what they cost, what you own |
| `/pet buy <skin>` | Buys a skin and puts it on |
| `/pet skin <skin>` | Puts on a skin you own |
| `/pet upgrade food`, `/pet upgrade joy` | One more heart, up to five |
| `/pet revive` | Brings it back from the pixel stars for 200 coins |
| `/pet name <name>` | Renames it |
| `/pet footer` | Draws it at the bottom right, under the prompt (the default) |
| `/pet band` | Draws it above the prompt, with buttons |
| `/pet hide`, `/pet show` | Hides it for this session, or brings it back |
| `/pet jokes on`, `/pet jokes off` | Turns the prompt jokes on or off (see below) |
| `/pet new <name>` | A new egg once it has flown off. `/pet new! <name>` starts over right now. Skins and hearts carry over |
| `/pet help` | Lists the commands |

In the band view the buttons have hotkeys: `f` feed, `s` snack, `p` play, `g` game, `c` clean, `m` meds, `z` sleep or wake, and `l` / `r` during the game. Press `ctrl+x` then `tab`, or click, to focus them.

## Jokes and model calls

On about one in three prompts you type (never on slash commands), Devling asks a small model (Haiku) for a short joke about it and shows the joke in its bubble. That is at most one small model call per prompt, made through your own Claude Code login, so it counts toward your plan or API usage.

The call sends the first 600 characters of your prompt, the day and time, the name of the current project folder, and the `about` option below if you set it. Nothing else leaves your machine, and the mod makes no other network requests.

To turn it off, run `/pet jokes off`. The choice is saved and applies in every session. Without jokes it still cheers with its built-in lines.

### Jokes about your own work

By default the jokes are about developer life in general. To make them about what you actually do, set the `about` option to a sentence, either in `/config` or in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "devling@devling": {
      "options": { "about": "Laravel APIs and Vue front ends, for clients who change their minds" }
    }
  }
}
```

## Your data

- The pet and your coins are saved by Claude Code's plugin store, in a JSON file under `~/.claude/plugins/store/` whose name starts with `devling_`. It holds the pet, your wallet (coins, skins owned, today's counters, the streak), the time of the last minute it lived, and your jokes setting.
- Where it is drawn (footer or band) and whether it is hidden are kept for the current session only.
- Nothing is sent anywhere except the joke call described above. There is no telemetry.

## Update

```bash
claude plugin update devling@devling
```

Then run `/reload-plugins` in an open session. Auto-update is off by default for third-party marketplaces; you can turn it on under the **Marketplaces** tab of `/plugin`.

## Uninstall

```text
/plugin uninstall devling@devling
```

or `claude plugin uninstall devling@devling` from your shell. To also forget the marketplace, run `claude plugin marketplace remove devling`. If a `devling_*.json` file is still in `~/.claude/plugins/store/` afterwards, delete it to remove your pet and coins for good.

## Development

```bash
git clone https://github.com/alexandrosang21/devling
cd devling
claude --plugin-dir .
```

Loading the folder once writes this build's typings to `.claude-plugin/types/` (ignored by git), which `tsconfig.json` extends. Saving a file hot-reloads the mod in that session.

- `claude plugin test .` runs the tests in `tests/`
- `claude plugin validate --strict .` checks the manifest, the marketplace file and the hooks module
- Prices and earnings live in `hooks/economy.ts`, the species and their drawings in `hooks/skins.ts`

Before opening a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
