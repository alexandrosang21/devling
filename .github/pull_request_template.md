## What and why

<!-- What this changes and why. Link the issue if there is one. -->

## How you tried it

<!-- What you did in a session to see it work. A screenshot for anything drawn. -->

## Checklist

- [ ] `claude plugin validate --strict .` passes
- [ ] `claude plugin test .` passes
- [ ] `npx -p typescript tsc -p . --noEmit` passes
- [ ] `version` in `.claude-plugin/plugin.json` is unchanged
- [ ] Older saves still load: new `Pet` or `Wallet` fields have a default
- [ ] Numbers changed in code are changed in the help text and README too
