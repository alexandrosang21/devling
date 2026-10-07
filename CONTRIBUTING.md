# Contributing to Devling

Thanks for wanting to help the pet. Bug fixes, new species, new things for it to say and docs fixes are all welcome.

For anything bigger than a small fix, open an issue first and say what you have in mind, so we can agree on it before you put the time in.

## Running it

You need Claude Code v2.1.287 or later. Fork the repository, then:

```bash
git clone https://github.com/<you>/devling
cd devling
claude --plugin-dir .
```

The pet shows up in that session, and your edits hot-reload when the turn ends. Loading the folder once also writes this build's typings to `.claude-plugin/types/` (ignored by git), which the type-check needs.

If you also have Devling installed from the marketplace, disable that copy while you work (`claude plugin disable devling@devling`), so only one pet runs.

## Checks

All three pass before a pull request:

```bash
claude plugin validate --strict .
claude plugin test .
npx -p typescript tsc -p . --noEmit
```

CI runs the first two on every pull request. The type-check needs the typings from a loaded session, so it runs on your machine only.

New behavior comes with a test in `tests/pet.test.tsx`. The tests run against the engine with a mocked clock and store, so they need no login.

## Rules that keep it working

The full list is in `.claude/CLAUDE.md`, which Claude Code reads on its own when you work in the repository. These are the ones that break things for players:

- **Saves are forever.** Never rename a `$.store` key (`pet`, `wallet`, `tickedAt`, `jokes`) or the plugin name. A new field on `Pet` or `Wallet` needs a default in `revive()` or `walletOf()`, so older saves still load.
- **Several sessions share one pet.** Pet changes go through `change()` and wallet changes through `withWallet()`, so two open sessions never count anything twice.
- **The footer must not jump.** Sprites are 6 pixel rows. Use only emoji that are wide by default, and count them in `columnsOf()`.
- **Numbers are written twice.** The help text in `register.tsx` and the README quote the values in `life.ts` and `economy.ts`. Change them together.
- **Pure modules stay pure.** `life.ts`, `art.ts`, `skins.ts` and `economy.ts` never touch `$`. Engine calls live in `register.tsx`.
- **No trademarked virtual-pet brand names**, in code, text, docs or keywords.

## Adding a species

A species is four drawings (baby, child, teen, adult), a palette, a price and a one-line blurb in `hooks/skins.ts`. The egg, the grumpy adult and the angel are derived from the drawings. Keep to flat colors, one per pixel, and add the species to the list in the README.

The README's pictures are drawn by the mod's own code. After changing a drawing, a palette or the footer, redraw them with `npx -y tsx@4 scripts/pictures.ts` and commit `docs/`; CI fails while they are stale.

## Style

- TypeScript with no semicolons, single quotes and 2-space indents.
- Doc comments say why, not what.
- Text the player sees is in English, short and low-key, with no em-dashes.

## Pull requests

- One change per pull request.
- Leave `version` in `.claude-plugin/plugin.json` alone; it goes up at release time.
- Say what you changed and how you tried it. For anything drawn, a screenshot helps.

By contributing, you agree that your work is released under the [MIT license](LICENSE).
