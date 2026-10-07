# Devling

A Claude Code **mod**: a plugin of function hooks (TypeScript, hot-reloaded) that draws a pixel pet in the prompt footer and adds a `/pet` command. The pet hatches, eats, sleeps, poops, gets sick and grows up as Claude works. Finished work earns coins, which buy skins (species), extra hearts and a revive. User-facing docs are in `README.md`.

## Layout

| File | What it holds |
| :- | :- |
| `hooks/register.tsx` | The hooks module: events, the `/pet` command, drawing (`ui.render` on `SessionMode` for the footer, `AbovePrompt` for the band), `$.state` atoms, `$.store` reads and writes, the sync between sessions, the wallet |
| `hooks/life.ts` | The pet's life as pure functions: stages, `live()` (one minute), `perform()` (care actions), hearts, poop, `comeBack()` after time away, `bringBack()` (revive), `revive()` (reading a save) |
| `hooks/art.ts` | Drawing and text as plain data: `sceneOf()` (the sprite as half-block rows), `statsLine()`, `statusBlock()` (`/pet`), `shopBlock()`, the speech lines, the joke prompt |
| `hooks/skins.ts` | The species: palettes and drawings, the derived egg, grumpy and angel, `pixelsOf()` (blink, wave, mirror, tint), `shapeOf()` |
| `hooks/economy.ts` | Coins: what pays what, prices, wallet operations |
| `types/index.d.ts` | `Pet`, `Wallet` and the `PluginState` contract for every `$.state` key |
| `tests/pet.test.tsx` | Tests run by `claude plugin test .` against the engine, with a mocked clock and store |

## Commands

```bash
claude --plugin-dir .                 # load it in a session; edits hot-reload when the turn ends
claude plugin test .                  # the tests
claude plugin validate --strict .     # manifest, marketplace file, hooks module, state contract
npx -p typescript tsc -p . --noEmit   # type-check; needs one load first to write .claude-plugin/types/
```

Run all three checks before a commit.

## Rules that keep it working

- **Pure modules stay pure.** `life.ts`, `art.ts`, `skins.ts` and `economy.ts` never touch `$`. All engine calls live in `register.tsx`.
- **State contract.** Every `$.state` value is an atom with a literal ref, `atom({ plugin: 'devling', key: '...' })`, and is declared under `devling` in `PluginState` in `types/index.d.ts`. `validate` refuses anything else.
- **Saves are forever.** `$.store` keys are `pet`, `wallet`, `tickedAt` and `jokes`. A field added to `Pet` or `Wallet` needs a default in `revive()` or `walletOf()`, so older saves still load. Never rename a stored key or the plugin name (`devling`): the save file's name derives from the plugin name.
- **Several sessions share one pet.** Every pet change goes through `change()`, which syncs first and then saves. Every wallet change goes through `withWallet()`. Only the session that claims `tickedAt` runs `live()` each minute, so two sessions never age the pet twice. Growth rewards are paid in `change()` only, never in `sync()`, or each session would pay them again.
- **The footer must not jump.** Sprites are 6 pixel rows (3 text rows), drawn as half blocks with a text and a background color. Use only emoji that are wide by default (no variation selector), and count them in `columnsOf()`.
- **Numbers are written twice.** The help text in `register.tsx` quotes the values in `life.ts` and `economy.ts`. Change both together.
- **A new species** is four drawings (baby, child, teen, adult) and a palette in `skins.ts`. The egg, grumpy and angel are derived from them.

## Style

- TypeScript with no semicolons, single quotes and 2-space indents.
- Doc comments say why, not what.
- User-facing text is in English, short and lower-key, with no em-dashes.
- No trademarked virtual-pet brand names anywhere: code, text, docs, keywords. The pet flies off to the "pixel stars".

## Releasing

Bump `version` in `.claude-plugin/plugin.json`, then push. Users update with `claude plugin update devling@devling`. `.claude-plugin/types/` is generated, lists the local MCP servers, and stays out of git.
