# AGENTS.md

Instructions for AI coding agents working in this repository.
Human contributors should read [CONTRIBUTING.md](./CONTRIBUTING.md) — this file is the
agent-facing summary plus the things that are easy to get wrong.

## Project

Calendar Card Pro is a custom Lovelace card for Home Assistant, written in TypeScript
with Lit 3 and bundled with Rollup into a single ES module. It is distributed via HACS.

There is **no runtime framework beyond Lit** — no React, no state library. Keep it that
way; bundle size is a design constraint.

That constraint is about **shipped bytes**, so it governs `dependencies`, not
`devDependencies`. Build, docs and test tooling that never reaches `dist/` is not covered
by it. Adding one still needs a reason, but "bundle size" is not the argument against it —
measure the bundle instead. The Vitest suite below was added this way and moved the
production bundle by 3 bytes, all of which were a bug fix.

## Build commands

These are the npm scripts. Do not invent others — add one only when a command is run often
enough that people will otherwise get it wrong.

| Command              | Output                          | Element name            | Logging |
| -------------------- | ------------------------------- | ----------------------- | ------- |
| `npm run dev`        | `dist/calendar-card-pro-dev.js` | `calendar-card-pro-dev` | verbose |
| `npm run build`      | `dist/calendar-card-pro.js`     | `calendar-card-pro`     | silent  |
| `npm run lint`       | — (eslint, `--fix`)             |                         |         |
| `npm run format`     | — (prettier, `--write`)         |                         |         |
| `npm test`           | — (vitest, single run)          |                         |         |
| `npm run check:i18n` | — (translation wiring check)    |                         |         |

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

There **is** a test suite — Vitest with happy-dom, in `tests/`. It does not aim at coverage;
it pins the things that have actually broken (the translation wiring, config normalization)
and the rendered list-view DOM, so a refactor that changes output fails loudly. Validate
changes with:

```bash
npx tsc --noEmit   # typecheck — not exposed as an npm script
npm run lint
npm test
npm run check:i18n
npm run build
```

Two things to know before trusting it. `tests/list-dom.test.ts` snapshots serialized DOM, so
an intentional markup change means **reading** the snapshot diff and committing it, not
deleting the file. And the suite is built from **default config**, which means an option
defaulting to `false` renders nothing and is invisible to it unless a test sets it — four
branches were missed that way, including two the suite existed to protect. When you add a
config option, add a test that turns it on.

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

The README's quick-start YAML block is the one **deliberate** duplicate in the project: it
is the HACS landing page, so it has to show a working config without sending the reader
elsewhere first. `check:docs` pins it byte-for-byte to the first example in
`docs/guide/usage.md`. Do not resolve that failure by deleting either copy — edit both.
Anything that *teaches* (multiple calendars, per-calendar colours, compact mode) belongs
only in `docs/`, never in the README.

### The two "What's New" surfaces

There are **two** of them and they follow **different rules**. Updating only one is the
most likely way for a release to drift:

| | `README.md` `## 4️⃣ What's New` | `docs/guide/whats-new.md` |
| --- | --- | --- |
| Purpose | highlights reel for the HACS landing page | the card's full history |
| Span | current major only, capped at 8 entries | **every** minor line, back to v1.0 |
| Selection | ruthless — relevance only | fuller, but still curated |

**Do not touch either in a feature PR.** They are organised by release, so a feature
branch cannot know which version it will land in, and concurrent branches conflict in them.

**In the release PR** (`dev` → `main`), update **both** alongside `docs/RELEASE_NOTES.md`.
In each, rename the previous `Latest Release: vX.Y` heading to plain `vX.Y` and add a new
one condensed from the release notes. Then:

- **README** — apply the retention rule: keep the current major version's minor releases,
  newest first, capped at 8, topping up from the previous major only if that leaves fewer
  than 4.
- **docs page** — never drop an entry; it is the archive. `check:docs` fails if a minor
  line present in `RELEASE_NOTES.md` has no `## vX.Y` heading here, and vice versa.

A **patch** release folds into the existing `vX.Y` entry on both surfaces rather than
adding a new heading — each entry covers its whole minor line.

When linking **into** the docs page, mind the anchor: the site's `slugify` strips dots, so
`## v2.1` anchors as `#v21`, not `#v2-1`. These links are written as absolute URLs to the
live site, so VitePress's dead-link check — which only resolves relative links — cannot
see them; `check:docs` validates them instead.

The README list is a **highlights reel, not a changelog** — the full notes are linked
directly above it, so anything left out is one click away. Select on relevance rather than
on whether something is a feature or a fix: a Home Assistant compatibility break or a bug
that made the card look empty belongs there; a narrow styling option, an editor validation
nicety, or a rare edge-case fix does not. Never write a catch-all "🐛 Key Bug Fixes" bullet.
Three honest bullets beat six padded ones, and older entries may be trimmed further as they
age. Deep-link each bullet to the relevant docs page where one exists.

## Docs style

These conventions are **enforced by `npm run check:docs`**, so this section is a
reference for *why*, not a checklist to police by hand. Run it before pushing docs
changes; CI runs it too.

**Headings — plain h1, emoji h2, plain h3.** The h1 becomes the page `<title>`, so an
emoji there ends up in the browser tab, bookmarks, share previews and search results.
Two pages shipped `<title>⚙️ Visual Configuration Editor | Calendar Card Pro` before
this rule existed. h2 emoji never leave the page body and are a large part of why these
docs scan well, so they are required, not merely allowed. Reuse the feature page's emoji
for the matching section in `reference/configuration.md`, so the reference reads as a
visual key back to the features. Emoji never affect anchors — the site's `slugify`
strips them — so an emoji change can never break a link.

`guide/whats-new.md` is exempt: its h2s are version identifiers (`## v3.4`), not topics,
and an emoji per release would be arbitrary noise.

**Also in headings:** use `&`, not "and"; no trailing colons. Title Case too, though that
one is on you — it is too ambiguous to check without false positives.

**Every page opens with prose.** An h1 followed straight by an h2 puts a configuration
table in front of the reader before they know what the page is for. One or two sentences.

**Callouts are titled VitePress containers** (`::: tip Title`), never GitHub alerts
(`> [!TIP]`) and never a bare bold blockquote. GitHub alert syntax renders as a plain
blockquote on the docs site — it only works in files GitHub itself renders, i.e.
`README.md` and `CONTRIBUTING.md`. Title Case the titles; that part is not checked,
because `Pair This With show_past_events` would trip any rule strict enough to be useful.

**Option tables** are `Option | Type | Default | Description`. Include the Default column
even when every value is `-`; a missing column reads as an oversight. `core-settings.md`
documented no defaults at all for its ten per-entity options, and because the harness
reconciles defaults against the code for `reference/configuration.md` only, nothing
caught it — check 13 now catches the shape even where it cannot check the values.

**Cross-link both ways.** Every section of `reference/configuration.md` ends with a
`**→ [Feature page](/features/…)**` footer, and every feature page closes by naming the
reference section its options live in. One-directional linking is how
`show_countdown_allday` once ended up documented in one place and undiscoverable from
the other.

**Links are markdown, root-absolute** (`/features/weather#…`) — no raw `<a href>`, no
inline `style=`. VitePress's own dead-link check resolves markdown links only, so a raw
anchor tag is unvalidated; `check:docs` resolves both, including the fragment, against
the real headings.

**US spelling** (`color`, `customize`, `behavior`) — the config options themselves are
US-spelled, so British spelling in the prose around them reads as inconsistent.

## Release process

1. Bump `version` in `package.json` — it is the single source of truth. Rollup
   substitutes it into the bundle header and into `constants.ts` via `@version
vPLACEHOLDER` / `CURRENT: 'vPLACEHOLDER'` replacements.
2. Update `docs/RELEASE_NOTES.md`, the README's `## 4️⃣ What's New` section, **and**
   `docs/guide/whats-new.md` — see _The two "What's New" surfaces_ for the differing rules.
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

`npm run check:i18n` now catches all four wiring mistakes mechanically, including that one,
and runs in CI. Run it before you claim a language is done — but note it verifies **wiring**,
not translation quality, and it cannot tell you whether `pēc 2 dienām` is correct Latvian.

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
