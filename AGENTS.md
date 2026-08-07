# AGENTS.md

Instructions for AI coding agents working in this repository.
Human contributors should read [CONTRIBUTING.md](./CONTRIBUTING.md) — this file is the
agent-facing summary plus the things that are easy to get wrong.

## Project

Calendar Card Pro is a custom Lovelace card for Home Assistant, written in TypeScript
with Lit 3 and bundled with Rollup into a single ES module. It is distributed via HACS.

There is **no runtime and no framework beyond Lit** — no React, no test framework, no
state library. Keep it that way; bundle size is a design constraint.

## Build commands

There are only four npm scripts. Do not invent others.

| Command | Output | Element name | Logging |
| --- | --- | --- | --- |
| `npm run dev` | `dist/calendar-card-pro-dev.js` | `calendar-card-pro-dev` | verbose |
| `npm run build` | `dist/calendar-card-pro.js` | `calendar-card-pro` | silent |
| `npm run lint` | — (eslint, `--fix`) | | |
| `npm run format` | — (prettier, `--write`) | | |

**The two builds are not interchangeable.** `rollup.config.mjs` switches on `NODE_ENV`
and rewrites both the output filename *and* the custom element name, so a dev build
registers as `calendar-card-pro-dev` / `calendar-card-pro-dev-editor`. This is
deliberate: it lets a dev build run side by side with the HACS-installed release in the
same Home Assistant instance. Never hand someone a `npm run build` artifact for local
testing — they need the `-dev` one.

`npm run dev` runs `rollup -c --watch` and does not exit. For a one-shot dev build in
automation, use `npx rollup -c` (same config, no watcher).

There is **no test suite**. Validate changes with:

```bash
npx tsc --noEmit   # typecheck — not exposed as an npm script
npm run lint
npm run build
```

`node_modules` is absent in a fresh worktree; run `npm ci` first. `dist/` is gitignored.

## Branch model

- **`main`** — production. Each release is tagged `v*`. This is the GitHub default branch.
- **`dev`** — integration branch. All work lands here first.
- **Feature branches** — branch from `dev`, PR back into `dev`.

**All pull requests target `dev`, never `main`.** The only PR that targets `main` is the
periodic release PR from `dev`. `main` is protected by a ruleset requiring a PR and
passing status checks; `dev` only blocks deletion.

External contributors frequently open PRs against `main` by mistake. Retarget them to
`dev` (`gh pr edit <n> --base dev`) rather than merging into `main`.

Because `main` is the default branch, `Fixes #123` in a PR merged to `dev` will **not**
auto-close the issue — closing keywords only fire on the default branch. Issues close
when the release PR merges, or close them manually.

## Release process

1. Bump `version` in `package.json` — it is the single source of truth. Rollup
   substitutes it into the bundle header and into `constants.ts` via `@version
   vPLACEHOLDER` / `CURRENT: 'vPLACEHOLDER'` replacements.
2. Update `docs/RELEASE_NOTES.md`.
3. Open a PR from `dev` into `main` and merge it.
4. Tag `main` with `vX.Y.Z` and push the tag.
5. `.github/workflows/release.yml` builds and creates a **draft** GitHub release with
   `dist/calendar-card-pro.js` attached. Publish it manually.

`hacs.json` pins the distributed filename to `calendar-card-pro.js` — do not rename it.

## CI

- `ci.yml` — lint + build on every PR to `main` or `dev`.
- `hacs-validate.yml` — HACS validation on `main` and nightly.
- `release.yml` — tag-triggered draft release.

## Adding or changing a translation

This is the most error-prone area of the codebase; the same mistake has shipped
repeatedly. A language is only fully wired up when **all** of these are done:

1. `src/translations/languages/<code>.json` — must contain **every** key present in
   `en.json`, including the large `editor` section. `en.json` is the reference.
2. `src/translations/localize.ts` — the `import` **and** an entry in the `TRANSLATIONS`
   map. **The map key must be lowercase** (`'en-gb'`, `'zh-cn'`), because lookups
   lowercase the configured value before matching.
3. `src/translations/dayjs.ts` — **two separate edits**, both required:
   - `import 'dayjs/locale/<code>';`
   - add the base code to the `supportedLocales` array inside `mapLocale()`
4. `README.md` — the supported-languages list.

Omitting the `supportedLocales` entry (3b) is a **silent failure**: the language works
everywhere except relative times, which quietly fall back to English. Catalan and
Romanian shipped broken this way for months. If you add a locale import, add the array
entry in the same edit.

Regional variants usually need no `dayjs.ts` change at all, because `mapLocale()`
reduces them to their base code (`en-gb` → `en`). Only `zh-cn` / `zh-tw` are
special-cased.

Verify a language change by actually resolving it, not by reading the diff:

```ts
getEffectiveLanguage('lv', undefined)      // -> 'lv'
getRelativeTimeString(futureDate, 'lv')    // -> 'pēc 2 dienām', not 'in 2 days'
```

## Editor (`src/rendering/editor.ts`)

The visual editor renders Home Assistant's own components (`ha-select`, `ha-formfield`,
`ha-entity-picker`, `ha-icon-picker`, `ha-switch`, …). These are **not our components**
and Home Assistant removes and renames them without notice — this has broken the editor
before.

- Text inputs go through `getInputTag()`, which resolves `ha-input` (HA 2026.5+) or
  `ha-textfield` (older) at render time via `customElements.get()` and emits it with
  lit's `static-html`. Do not hardcode either tag. The detection deliberately does not
  cache a result when neither element is registered yet, because the bundle can evaluate
  before HA registers its components.
- `_valueChanged` contains **field-specific guards keyed on `event.type`**. Changing a
  listener (`@input` / `@change` / `@keyup`) can silently disable one. The
  `start_date_offset` guard exists so the field does not vanish mid-edit while the value
  is an intermediate string like `-`. Re-check these guards whenever you touch event
  wiring.

## Style

- Strict TypeScript; keep it strict.
- JSDoc on public functions.
- Run `npm run format` (prettier) before committing; `npm run lint` uses `--fix`.
- Match the existing module layout: `config/`, `interaction/`, `rendering/`,
  `translations/`, `utils/`.

## Reference

- [`docs/architecture.md`](./docs/architecture.md) — module responsibilities, data flow,
  caching and performance design. Read before making structural changes.
