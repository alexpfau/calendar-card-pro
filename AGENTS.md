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

There are only four npm scripts for the card itself. Do not invent others.

| Command          | Output                          | Element name            | Logging |
| ---------------- | ------------------------------- | ----------------------- | ------- |
| `npm run dev`    | `dist/calendar-card-pro-dev.js` | `calendar-card-pro-dev` | verbose |
| `npm run build`  | `dist/calendar-card-pro.js`     | `calendar-card-pro`     | silent  |
| `npm run lint`   | — (eslint, `--fix`)             |                         |         |
| `npm run format` | — (prettier, `--write`)         |                         |         |

Three further scripts build the documentation site (see _Documenting a change_):
`docs:dev` (dev server), `docs:build` (static build into `docs/.vitepress/dist/`, the
command Cloudflare runs), and `docs:preview` (serve the built output).

**The two builds are not interchangeable.** `rollup.config.mjs` switches on `NODE_ENV`
and rewrites both the output filename _and_ the custom element name, so a dev build
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

### `dev` must never fall behind `main`

**Invariant: `dev` may be ahead of `main`, never behind it.** `dev` is the branch every
feature branches from, so the moment it drifts behind, each new feature branch silently
starts from stale history.

The `dev` → `main` release PR is merged with a **merge commit** (`gh pr merge --merge
--admin` — see _Release process_), and that merge commit is created **on `main` only**.
`dev` never receives it, so every release leaves `dev` exactly one commit behind even
though the file trees are byte-identical. This is why GitHub can show a branch as "merged
into main" and "N commits behind main" at the same time — the gap is the merge commits
themselves, not missing content.

So **immediately after merging the release PR, fast-forward `dev` back onto `main`**:

```bash
git fetch origin
git merge-base --is-ancestor origin/dev origin/main   # must pass — proves it is lossless
git push origin origin/main:dev                       # fast-forward, no force, no rewrite
git rev-list --count origin/dev..origin/main          # expect 0
```

Skipping this is what produced a four-commit gap across releases v3.5. Never "fix" the
gap with a force-push; if `--is-ancestor` fails, `dev` has real unique commits and needs
a normal `main` → `dev` PR instead.

To check the true state of a branch, compare **tree** SHAs rather than trusting the
GitHub branches page, which caches aggressively and keeps showing deleted branches:

```bash
git rev-parse origin/dev^{tree} origin/main^{tree}    # identical = no content missing
```

## Documenting a change

User-facing documentation lives on the **documentation site**,
<https://calendar-card-pro.alexpfau.com> — VitePress, built from the Markdown in `docs/`,
deployed by Cloudflare on every push to `main`. `README.md` is now only a landing page:
badges, overview, installation, a quick-start example, What's New, and contributing.
Everything else moved to `docs/`.

**In a feature or fix PR** (targeting `dev`), document the change in `docs/`, not the README:

- the **config table** row in `docs/reference/configuration.md` for any new or changed
  option — name, type, default, description
- a **prose section** on the relevant `docs/features/*.md` page, or a sentence in the
  nearest existing one, with a real YAML snippet. A table row alone is not documentation:
  `show_countdown_allday` shipped in v3.4 as a table row only, and was undiscoverable.
- for a new language: the supported-languages list in `docs/contributing.md` **and all
  three hardcoded counts**. Derive them rather than incrementing by hand — they are prose,
  so nothing fails when they drift, and they were wrong for three consecutive releases:
  ```bash
  ls src/translations/languages/*.json | wc -l                 # total languages
  grep -l '"editor"' src/translations/languages/*.json | wc -l # editor languages
  ```

Run `npm run docs:build` before pushing. `ignoreDeadLinks` is deliberately **off**, so an
internal link to a heading you renamed fails the build instead of shipping broken.

**Leave `README.md` alone in a feature PR** unless the change affects installation or the
quick-start example. Links from the README into the docs site must be **absolute URLs**
(`https://calendar-card-pro.alexpfau.com/...`) — the README also renders on GitHub and in
HACS, where relative docs paths do not resolve.

**Do not touch the `## 4️⃣ What's New` section** in a feature PR. It is organised by
release, so a feature branch cannot know which version it will land in, and concurrent
branches conflict in it.

**In the release PR** (`dev` → `main`), update `## 4️⃣ What's New` alongside
`docs/RELEASE_NOTES.md`: rename the previous `### Latest Release: vX.Y` to plain `### vX.Y`,
add a new one with 3–6 one-line bullets condensed from the release notes, and apply the
retention rule — keep the current major version's minor releases, newest first, capped at
8, topping up from the previous major only if that leaves fewer than 4.

That list is a **highlights reel, not a changelog** — the full notes are linked directly
above it, so anything left out is one click away. Select on relevance rather than on
whether something is a feature or a fix: a Home Assistant compatibility break or a bug that
made the card look empty belongs there; a narrow styling option, an editor validation
nicety, or a rare edge-case fix does not. Never write a catch-all "🐛 Key Bug Fixes" bullet.
Three honest bullets beat six padded ones, and older entries may be trimmed further as they
age. Deep-link each bullet to the relevant docs page where one exists.

## Release process

1. Bump `version` in `package.json` — it is the single source of truth. Rollup
   substitutes it into the bundle header and into `constants.ts` via `@version
vPLACEHOLDER` / `CURRENT: 'vPLACEHOLDER'` replacements.
2. Update `docs/RELEASE_NOTES.md` and the README's `## 4️⃣ What's New` section.
3. Open a PR from `dev` into `main` and merge it. `main`'s ruleset requires an approving
   review that you cannot give yourself, so this needs `gh pr merge <n> --merge --admin`.
4. **Fast-forward `dev` back onto `main`** — `git push origin origin/main:dev`. The merge
   commit from step 3 exists only on `main`; without this, `dev` starts the next cycle a
   commit behind. See _`dev` must never fall behind `main`_.
5. Tag `main` with `vX.Y.Z` and push the tag.
6. `.github/workflows/release.yml` builds and creates a **draft** GitHub release with
   `dist/calendar-card-pro.js` attached. Publish it manually.

`hacs.json` pins the distributed filename to `calendar-card-pro.js` — do not rename it.

## CI

- `ci.yml` — lint + build on every PR to `main` or `dev`.
- `hacs-validate.yml` — HACS validation on `main` and nightly.
- `release.yml` — tag-triggered draft release.

## Adding or changing a translation

This is the most error-prone area of the codebase; the same mistake has shipped
repeatedly. A language is only fully wired up when **all** of these are done:

1. `src/translations/languages/<code>.json` — must contain every **top-level** key present
   in `en.json`. `en.json` is the reference.

   The `editor` section is the exception, and it is **all-or-nothing**. Only 11 of the 35
   language files translate it; the other 24 omit it entirely and the editor renders in
   English. That is supported and correct — `_getTranslation()` in `editor.ts` calls
   `hasEditorTranslations()` and swaps the whole language to `en` for editor keys when the
   section is absent.

   But `hasEditorTranslations()` returns true when the section has **one or more** keys, so
   a _partially_ translated `editor` section defeats that fallback: the keys you did
   translate render fine, and every key you missed renders as the **raw key name**
   (`show_end_time`) in the UI, not as English. So either omit `editor` completely, or
   copy every key from `en.json`. Never leave it half-done.

2. `src/translations/localize.ts` — the `import` **and** an entry in the `TRANSLATIONS`
   map. **The map key must be lowercase** (`'en-gb'`, `'zh-cn'`), because lookups
   lowercase the configured value before matching.
3. `src/translations/dayjs.ts` — **two separate edits**, both required:
   - `import 'dayjs/locale/<code>';`
   - add the base code to the `supportedLocales` array inside `mapLocale()`
4. `docs/contributing.md` — the supported-languages list **and the three hardcoded counts**
   (see _Documenting a change_). The counts are prose, so nothing fails when they
   are wrong; they drifted for three releases before anyone noticed.

Omitting the `supportedLocales` entry (3b) is a **silent failure**: the language works
everywhere except relative times, which quietly fall back to English. Catalan and
Romanian shipped broken this way for months. If you add a locale import, add the array
entry in the same edit.

Regional variants usually need no `dayjs.ts` change at all, because `mapLocale()`
reduces them to their base code (`en-gb` → `en`). Only `zh-cn` / `zh-tw` are
special-cased.

Verify a language change by actually resolving it, not by reading the diff:

```ts
getEffectiveLanguage('lv', undefined); // -> 'lv'
getRelativeTimeString(futureDate, 'lv'); // -> 'pēc 2 dienām', not 'in 2 days'
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
- [`docs/development/column-view.md`](./docs/development/column-view.md) — in-progress design
  and phased implementation plan for the column view (`view: 'column'`, targeting v4.0.0).
  Read before touching the rendering pipeline, the view dispatch, or any view-dependent
  config key, so in-flight work stays compatible with it.
