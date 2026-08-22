# AGENTS.md

Instructions for AI coding agents working in this repository.
Human contributors should read [CONTRIBUTING.md](./CONTRIBUTING.md) — this file is the
agent-facing summary plus the things that are easy to get wrong.

## Project

Calendar Card Pro is a custom Lovelace card for Home Assistant, written in TypeScript
with Lit 3 and bundled with Rollup into two ES modules — the card and its editor. It is
distributed via HACS.

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

| Command                | Output                                                 | Element names                                           | Logging |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ------- |
| `npm run dev`          | `dist/calendar-card-pro-dev.js` + `dist/editor-dev.js` | `calendar-card-pro-dev`, `calendar-card-pro-dev-editor` | verbose |
| `npm run build`        | `dist/calendar-card-pro.js` + `dist/editor.js`         | `calendar-card-pro`, `calendar-card-pro-editor`         | silent  |
| `npm run lint`         | — (eslint, `--fix`)                                    |                                                         |         |
| `npm run format`       | — (prettier, `--write`)                                |                                                         |         |
| `npm test`             | — (vitest, single run)                                 |                                                         |         |
| `npm run check:format` | — (prettier, `--check`)                                |                                                         |         |
| `npm run check:i18n`   | — (translation wiring check)                           |                                                         |         |
| `npm run check:docs`   | — (docs/config parity check)                           |                                                         |         |
| `npm run check:bundle` | — (emitted-file check)                                 |                                                         |         |

`lint` covers **`src/`, `tests/` and `scripts/`**; `format` and `check:format` cover the
**whole repo**. `scripts/` was outside both until v4 — 220 KB of logic that gates every PR,
watched by nothing, which is how three of those files drifted out of prettier style
unnoticed and how a typo'd global shipped in a gate. It is linted under a **second, weaker
config block**, because
these are plain Node ESM rather than TypeScript: prettier plus a handful of core correctness
rules, no type-aware rules, and deliberately **no `no-undef`** — the scripts legitimately use
Node globals, and declaring them would mean depending on a package that is not a direct
devDependency. So a typo in a global reads as valid in `scripts/` where `tsc` would have
caught it in `src/`.

**`check:format` is the only step that actually gates formatting**, and it exists because
the obvious-looking enforcement was never real. `prettier/prettier` is an eslint _error_
rule, but `lint` runs with `--fix`: in CI a misformatted file is rewritten in the throwaway
checkout and the step exits 0. Meanwhile eslint never saw markdown, YAML or JSON at all.
Both holes were open until v4, by which point ten documentation files had drifted — the
README and the release notes among them. Run `npm run format` before committing; the gate
fails the PR if you forget. `wrangler.jsonc` is the one deliberate exclusion, for the reason
recorded in `.prettierignore`.

Three further scripts build the documentation site (see _Documenting a change_):
`docs:dev` (dev server), `docs:build` (static build into `docs/.vitepress/dist/`, the
command Cloudflare runs), and `docs:preview` (serve the built output).

**The card ships as two files.** `rollup.config.mjs` exports an **array of two configs**,
so each build emits the pair named in the table above, and the editor is fetched only when
someone opens it — which keeps it and its
translations off every dashboard load. Both files are self-contained bundles with stable,
human-readable names. `hacs.json` names the card and needs no change; HACS downloads every
asset attached to a release, and `filename` only selects which one becomes the Lovelace
resource. Four consequences worth holding on to: **neither file may import the other**,
**every emitted file must sit directly in `dist/`** because HACS fetches no
subdirectories, **`import.meta` must survive into the output** (below), and **both files
stamp the same version** so the card can warn when a stale editor is paired with a fresh
card. `npm run check:bundle` enforces all four.

**Why two builds and not one build with code-splitting.** Rollup, given one entry and a
dynamic `import()`, puts the modules the card and editor share into a chunk that the
editor imports _back from the card_. That is the one thing which cannot work here: the
import would read `./calendar-card-pro.js` while HACS had loaded that very file as
`./calendar-card-pro.js?hacstag=…`, and a browser treats those as two different modules.
The card evaluates twice, the second `customElements.define` throws, and the editor is
dead — possibly the card too. Two entries remove the trap at its root rather than working
around it: no emitted file imports another at all, so there is nothing for the query to
be dropped from. The card names the editor through a URL it computes at runtime
(`src/utils/editor-url.ts`), which is invisible to both module graphs.

The cost is that the shared modules are **duplicated into the editor** — measured at
+16.8 KB gzip, paid only by people who open it. Two things make that acceptable rather
than merely tolerable. The eager path got _smaller_: a split entry has to export its
shared modules, and exported symbols resist mangling and inlining, so collapsing the card
into one self-contained file saved 1.1 KB gzip on the file everyone loads. And the
duplicated module state is inert — the card never reads a string the editor registered,
the editor resolves its own; `CURRENT_LOG_LEVEL` is a build-time constant and identical in
both; and the once-per-session banner flag is only ever touched card-side. Check that
this still holds before moving anything shared and mutable across the boundary.

🚨 **Quote the compression level with any gzip figure, or the number is not comparable.**
Two sessions reported the eager chunk at 56,792 and 56,932 bytes gzip and both were right —
the file was byte-identical, `sha256:9d5724202bbb…` in both cases. The same bundle measures
three ways:

| tool                             | bytes  |
| -------------------------------- | ------ |
| `gzip -9 -c`                     | 56,792 |
| `node zlib.gzipSync` (default)   | 56,907 |
| `gzip -c` (level 6, the default) | 56,932 |

A 140-byte spread is the same order as several real optimisations recorded in this file, so
an unqualified figure can manufacture a regression or hide one. **Raw size plus a hash is the
comparison that cannot drift**; gzip is for reporting, and only against another figure taken
the same way. Note also that equal raw sizes do not prove identity — hash them.

**And the build variant is a second axis, which is easier to get wrong than the first.**
The dev bundle is what a session has to hand; the production bundle is what users load.
Same source, all nine languages, four legitimate answers for one chunk:

|                 | `gzip -6` | `gzip -9` |
| --------------- | --------: | --------: |
| `editor-dev.js` |    82,772 |    81,979 |
| `editor.js`     |    82,768 |    81,975 |

Two sessions reported 81,979 and 82,768 for the same commit, and both were right. Say
which build and which level, or the number is only comparable to itself.

**Cache-busting is by query propagation, not by content hash.** `/hacsfiles/**` is served
`max-age=2678400` — one month — and HACS appends `?hacstag=` to the _registered resource
only_, so a sibling file gets no cache-buster of its own. `getConfigElement()` therefore
copies the card's own query onto the editor's URL, making the editor bust exactly when the
card busts. It is strictly better than the content hashes it replaced, which never
responded to the dev deploy's `?v=` bump at all: a hash only changes when the editor
itself changes, so a shared-module change reloaded the card and left a stale editor.

🚨 **`import.meta` compiles to `{}` under esbuild `target: 'es2017'`.** That makes
`import.meta.url` `undefined` and the editor unloadable, and it is invisible to every
other gate — it typechecks, builds, lints and tests clean. `supported: { 'import-meta':
true }` in the `esbuild()` options is what prevents it, and `check:bundle` asserts the
result. Do not remove either.

**The two builds are not interchangeable.** `rollup.config.mjs` switches on `NODE_ENV`
and rewrites both output filenames _and_ the custom element names, so a dev build
registers as `calendar-card-pro-dev` / `calendar-card-pro-dev-editor` and emits
`-dev`-suffixed files. This is deliberate: it lets a dev build run side by side with the
HACS-installed release in the same Home Assistant instance. Never hand someone a
`npm run build` artifact for local testing — they need the `-dev` one. The editor filename
the card names follows the same `replace()` mechanism as the element names; a mismatch
there is a dead editor that builds perfectly and 404s only when someone opens it.

`npm run dev` runs `rollup -c --watch` and does not exit. For a one-shot dev build in
automation, use `npx rollup -c` (same config, no watcher). Either way the build first
removes anything in `dist/` it will not itself write — not the whole directory, because
the watcher rebuilds only the config whose inputs moved and a wipe would delete the editor
on every card-only edit. What it is guarding against is the _other_ variant's output: dev
and production files have different names, so without it a `npm run build` after a
`npm run dev` would leave the dev pair behind for `release.yml`'s `dist/*.js` glob to
publish.

There **is** a test suite — Vitest with happy-dom, in `tests/`. It does not aim at coverage;
it pins the things that have actually broken (the translation wiring, config normalization)
and the rendered list-view DOM, so a refactor that changes output fails loudly. Validate
changes with:

```bash
npx tsc --noEmit   # typecheck — not exposed as an npm script
npm run lint
npm run check:format
npm test
npm run check:i18n
npm run check:docs
npm run docs:build
npm run build
npm run check:bundle   # after the build — it reads dist/
```

Those nine are every npm gate CI runs, so a green local run should mean a green PR —
**provided you run them on the Node version in `.nvmrc`.** CI reads that file, and results
that pass through zlib or npm are not portable across majors. A gate reconciling the gzipped
transfer sizes documented in `docs/guide/installation.md` was written and proven green on
Node 25, then failed in CI on Node 22: Node 24+ ships zlib-ng and Node 22 ships classic
zlib, so identical bundle bytes compressed to 57,860 and 58,448 — a ~1% spread that happened
to straddle a kilobyte. Nothing was wrong with the bundle or the figure. `nvm use` first, or
run the gate under the pin without switching:

```bash
npx -y -p node@22 node scripts/check-bundle.mjs
```

This is the same class of failure as the `.nvmrc` / `.node-version` drift described under
_Docs site deployment_, arriving from the other direction: there the two pinned files
disagreed, here the developer disagreed with both. Byte counts are reproducible and can be
asserted exactly; anything a compressor or a package manager produces needs either the
pinned runtime or a tolerance.

**Matching the major is not always enough.** `.nvmrc` says `22`, and `setup-node` resolves
that to the newest 22.x at run time — so a gate whose oracle is data bundled _inside_ Node
can disagree between two runtimes that are both honestly "Node 22".
`tests/first-day-of-week-locale.test.ts` reads week-start data from the runtime's own CLDR
via `Intl.Locale`, and CLDR 48 moved Iceland from Monday to Sunday: Node 22.18.0 ships CLDR
47 and fails, Node 22.23.2 ships CLDR 48 and passes, on identical source. A reviewer running
22.18.0 reported the suite red on a tip where CI was green and proposed deleting the correct
`is: 0` entry — a change that would have turned CI red and shipped the wrong week start to
Icelandic users. The command above is written as `node@22`, not `node@22.18.0`, precisely
because the floating form resolves the same way CI does; pinning an exact patch reintroduces
the problem it looks like it is solving. When a local gate disagrees with a green CI run on
the same commit, suspect the runtime before the code.

`check:docs` is the one that
surprises people: it is described under _Documenting a change_ below, which makes it look like a
docs-only concern, but it gates **every** PR. A change touching no `src/` file at all can
still fail it. Adding a config option without a reference-table row fails it too — which is the
point.

`docs:build` is not redundant with it. `check:docs` reads the Markdown as text; `docs:build`
compiles it, so it is the only gate that sees a page VitePress cannot parse. A stray `{{ … }}`
in prose — easy to write in a Home Assistant card's docs, where that is Jinja rather than Vue —
passes `check:docs` and fails the build. Check 20 in `check-docs.mjs` reconciles this list
against `ci.yml`, because it silently went stale once when `docs:build` was added to CI.

Two things to know before trusting it. `tests/list-dom.test.ts` snapshots serialized DOM, so
an intentional markup change means **reading** the snapshot diff and committing it, not
deleting the file. And the suite is built from **default config**, which means an option
defaulting to `false` renders nothing and is invisible to it unless a test sets it — four
branches were missed that way, including two the suite existed to protect. When you add a
config option, add a test that turns it on.

🚨 **A test that walks a table's own keys cannot notice a key leaving it.** The idiom
`for (const key of Object.keys(TABLE)) expect(somethingAbout(key)).toBeDefined()` reads
like coverage and is not: delete an entry and the loop runs one fewer time, so the suite
stays green while the table quietly shrinks. This has been found three times — 24 of 54
`COLUMN_OVERRIDE_KEYS` entries, 2 of 6 `VIEW_SCOPE` entries and 4 of 5
`DEPRECATED_CONFIG_MAP` entries were each removable with every gate passing. The damage is
always silent, because these tables describe what the card tells the user rather than what
it renders: an editor field stops saying an option is inert in this view, or a removed
option stops being reported at all. **Pin the whole table by value** (`toEqual` on a
normalized copy) or reconcile it against a second surface, so both directions — a dropped
entry and an unexplained new one — fail. When sweeping for this, blank one line at a time,
run `npx tsc --noEmit` first as a cheap kill, and restore with `cp` from a backup, never
`git checkout --`.

### The suite runs as four projects, and the split is load-bearing

`vitest.config.mjs` defines a `projects` array, so `npm test` runs the same files under
more than one timezone:

| Project        | `TZ`               | Files                                               |
| -------------- | ------------------ | --------------------------------------------------- |
| `unit`         | `UTC`              | `tests/**/*.test.ts`, **excluding** `*.dst.test.ts` |
| `dst-berlin`   | `Europe/Berlin`    | `tests/**/*.dst.test.ts`                            |
| `dst-sydney`   | `Australia/Sydney` | `tests/**/*.dst.test.ts`                            |
| `dst-new_york` | `America/New_York` | `tests/**/*.dst.test.ts`                            |

The UTC pin on `unit` is deliberate and must stay — without it a date renders one way
locally and another in CI. But UTC is also the **only zone with no DST transitions**, so any
arithmetic that assumes every day is 24 hours long is unconditionally correct there and can
be wrong everywhere else. Both week-number functions shipped broken that way for every
release up to v4: wrong on roughly one date in seven under real zones, with a green suite
and a dedicated `tests/column-week-numbers.test.ts` that was structurally incapable of
seeing it.

Hence the three extra projects, and **each is required for a different reason**. Berlin and
Sydney cover the hemispheres: the drift is negative north of the equator and positive south
of it, so `Math.floor` and `Math.ceil` fail in _opposite_ hemispheres. Berlin alone proves
nothing about a `ceil`; Sydney alone proves nothing about a `floor`. Reverting either fix in
`src/utils/format.ts` turns exactly one of those two projects red and leaves the other, and
`unit`, green.

New York covers the **offset sign**, which the other two cannot. Berlin and Sydney are both
_ahead_ of UTC, so parsing a date-only string as UTC midnight rather than local midnight
still lands on the correct local calendar day in both — the exact one-line "simplification"
that would render every all-day event a day early for every user in the Americas. Planting
it fails `tests/all-day-parse.dst.test.ts` twice under Berlin, twice under Sydney, and
**seventeen times** under New York, while all of `unit` stays green. When you add a zone,
say which failure mode it is the only one able to see.

So: **name any timezone-sensitive test `*.dst.test.ts`** and it picks up all three zones
automatically. Give it a guard test asserting the January and July offsets differ, so it
fails loudly instead of silently proving nothing if it is ever run under UTC —
`tests/week-number-dst.dst.test.ts` has one to copy. The `exclude` on the `unit` project is
what stops those files running a fourth time under UTC; do not drop it.

🚨 **The transition is the famous exposure; the plain offset is the bigger one, and it
was uncovered until v4.1.** Everything above is about DST _transitions_, which touch two
days a year. Under `TZ=UTC` a local clock reading and a UTC one are the **same number**
on every day of the year, so any code reading `getHours()` is equally untested — and
`formatTime`, which prints the time on every timed event, had no `.dst.test.ts` at all.
Rewriting it to `getUTCHours()`/`getUTCMinutes()`, and rewriting `formatEventTime`'s
single-day-versus-multi-day test to compare UTC calendar days instead of local ones, each
left the **whole suite green** while misprinting the time for every user outside UTC.
`tests/event-time-zone.dst.test.ts` closes that; the first now fails 5 assertions in each
zone and the second 1–2.

Two things that file is worth copying. Its oracle is `Intl.DateTimeFormat`, **not**
`Date.prototype.getHours` — the code under test is built from the `Date` getters, so an
expectation derived from those same getters restates the implementation instead of
checking it. And it says plainly that **no zone is uniquely required there**: all three
catch both mutations and any non-UTC zone would, which is a weaker claim than the
week-number file's and the honest one. Do not assert a zone is the only one able to see a
failure without planting it in the other two.

**A snapshot diff you did not intend is usually a whitespace error, not a rendering
change.** The serializer normalises whitespace _between tags only_; whitespace adjacent to
a text node survives verbatim, so the literal source indentation inside an `html` template
is part of the oracle. Moving a template therefore means **preserving its original absolute
indentation**, even where that looks wrong at the new nesting depth — which is why
`leaves.ts` carries function bodies indented as though they were still nested.

**Prettier _does_ reformat inside `html` tagged templates, and it will fight you here.**
An earlier version of this file claimed the opposite, and that claim was wrong: run
`npm run format` on a single-line template and it reflows the embedded HTML, re-indenting
and breaking lines. The reason the claim survived so long is an asymmetry worth knowing —
**Prettier preserves significant whitespace it already finds, so existing templates
round-trip unchanged**, and it breaks as `</span\n><span` so no new text node appears
between inline elements. But a template deliberately written to have _none_ gets the
indentation put back. **Deliberate whitespace needs `// prettier-ignore`**; `leaves.ts`
uses it at **three** sites — the day-header weather badge, the event weather badge, and
the folded time/countdown spans — each added after `npm run format` reintroduced the
exact spaces a fix had just removed and turned five tests red. Locate them with
`grep -n "prettier-ignore" src/rendering/leaves.ts` rather than by line number; two of
the three moved the last time someone edited a comment above them. If you find one and
wonder whether it is still needed, run the experiment rather than reasoning about it —
delete it, **run `npm run format`**, then `npm test`. The format step is the whole
experiment: without it the directive's removal changes nothing and the whole suite still
passes, which reads as "safe to delete" and is not.

🚨 **Run it per site, because the three no longer answer the same way.** This paragraph
used to say "it is" — that all three are still load-bearing — and that is now true of
two. Measured one at a time on the tip, each with the format step:

| site                        | on removal + `npm run format` |
| --------------------------- | ----------------------------- |
| day-header weather badge    | 6 tests fail                  |
| event weather badge         | 4 tests fail                  |
| folded time/countdown spans | **suite stays green**         |

The third is not a dead directive, and deleting it on that result would be the trap this
section is about arriving from the other side. Prettier _does_ reformat that site — but
it reformats it as `<span class="time-text"\n  >`, breaking **inside** the tag, which is
the `</span\n><span` asymmetry two paragraphs up doing its job. No text node appears, so
the DOM is identical and no snapshot moves. What the directive buys there is the source
reading as the single line the browser sees, instead of the `>`-on-its-own-line form that
is exactly what the comment above it is warning against. Keep it; it is documentation
that happens to also be a guard, and the two other sites prove the guard is real.

**Never resolve a snapshot failure with `vitest -u`.** It launders the change past review,
and the gate's entire value is that it is the one artefact the person doing the refactor
does not get to edit. Fix the indentation, or — if the markup genuinely changed — read the
diff line by line and commit it deliberately.

**If you believe a snapshot diff is whitespace-only, prove it in one line rather than by
eye.** The serializer touches whitespace _between tags only_, which makes the claim
falsifiable:

```js
const norm = (s) => s.replace(/>\s+</g, '><');
norm(before) === norm(after); // true  =>  inter-tag whitespace and nothing else
```

Because that collapses only what the serializer already normalises, a `true` proves there
is no text change, **no text-adjacent indentation change**, and no attribute, class or
element change — across the whole file, not just the hunks you looked at. Do **not**
substitute `replace(/\s+/g, '')`: stripping _all_ whitespace also discards the significant
kind, so it will call a real text-adjacent regression clean. Check the entry count too
(`^exports\[`), since `-u` prunes as well as rewrites and a silently dropped case looks
like nothing at all.

One deliberate exception, and it is not a typo to fix: `tests/column-dom.test.ts` carries
**two independent normalisers**, one per comparison — neither calls the other.
`serialize()` uses `>\s+<`, as `list-dom` does, and backs the strict default-config
comparison where no placement fires and the stronger assertion costs nothing.
`eventContentsAtCommonPlacement()`, which folds the column's progress-bar row back to the
inline position, does its own marker-stripping and its own `>\s*<` — wider by one character
because reattaching a node leaves it flush against its new closing tag where the list view
has a newline, so zero whitespace has to compare equal to some, which `\s+` will not do.
Both are correct; the difference is the point, and the reasoning is at the helper's
docblock.

`node_modules` is absent in a fresh worktree; run `npm ci` first. `dist/` is gitignored.

### `scripts/`

Ten files, and only three are reachable through `package.json`, so the rest are easy to
mistake for leftovers. They are not. What each one is:

| Script                      | Kind           | How it runs                          |
| --------------------------- | -------------- | ------------------------------------ |
| `check-bundle.mjs`          | gate           | `npm run check:bundle`               |
| `check-docs.mjs`            | gate           | `npm run check:docs`                 |
| `check-i18n.mjs`            | gate           | `npm run check:i18n`                 |
| `extract-release-notes.mjs` | release        | `release.yml`, stdout → release body |
| `generate-en-gb.mjs`        | generator      | by hand — see below                  |
| `editor-glossary.mjs`       | data           | imported by the i18n gate            |
| `en-gb.mjs`                 | data           | imported by gate + generator         |
| `load-editor-schema.mjs`    | library        | imported by the i18n gate            |
| `l10n-oracle.mjs`           | authoring tool | by hand, needs an HA frontend wheel  |
| `l10n-handoff.mjs`          | authoring tool | by hand, needs an HA frontend wheel  |

**`generate-en-gb.mjs` is the one with a trap in it.** `src/rendering/editor/translations/en-GB.json`
is generated, not maintained — `en-gb.mjs` holds the substitution list, the generator writes
the file, and `check:i18n` recomputes the same data and fails on any difference. Nothing runs
the generator for you. So editing `strings.ts` in a way that touches a substituted spelling
fails the i18n gate, and the fix is not to hand-edit the JSON the error points at:

```bash
node scripts/generate-en-gb.mjs   # then re-run npm run check:i18n
```

The two `l10n-*` tools are deliberately outside CI. They need `HA_FRONTEND_TRANSLATIONS`
pointed at an unpacked, pinned `home-assistant-frontend` wheel, which is why they are run by
hand and why neither has an npm script. `l10n-oracle.mjs` gathers the evidence a glossary
decision cites; `l10n-handoff.mjs` writes per-language starting files for editor translation
work into a gitignored `l10n-handoff/`. Absence from `package.json` is the design, not an
oversight — do not "fix" it by wiring them into the gates.

## Branch model

- **`main`** — production. Each release is tagged `v*`. This is the GitHub default branch.
- **`dev`** — integration branch. All work lands here first.
- **Feature branches** — branch from `dev`, PR back into `dev`.

**All pull requests target `dev`, never `main`.** The only PR that targets `main` is the
periodic release PR from `dev`. `main` is protected by a ruleset requiring a PR and
passing status checks; `dev` only blocks deletion.

External contributors frequently open PRs against `main` by mistake. Retarget them to
`dev` (`gh pr edit <n> --base dev`) rather than merging into `main`.

**Never name a branch so that it ends in `tags`** — `validate-hacs` fails on it, and the
failure accuses the repository rather than the name. HACS reads `hacs.json` and the README
over the network from `raw.githubusercontent.com/{repo}/{ref}/{file}`, and
`custom_components/hacs/base.py` strips `tags/` out of that URL unconditionally, to
normalise release refs like `tags/v1.2.3`. A branch called `fix/void-element-end-tags`
therefore requests `…-tags/hacs.json`, HACS rewrites it to `…-hacs.json`, and both fetches 404. The two content checks then report _"invalid 'hacs.json' file"_ and _"does not have
images in the Readme file"_ while the six metadata checks pass, because those need no file
fetch — **that 6-pass/2-fail split is the signature**, and the generic wording is the second
tell, since a genuinely malformed `hacs.json` produces a humanized schema error instead.
Both files were byte-identical to `main` throughout. Ten hypotheses were falsified before
the branch name was suspected; the fix is to rename it and re-open the PR. Only reachable
since v4 added the `pull_request` trigger below.

**Run the workflow against `main` before you believe any of that, because a GitHub incident
wears the same costume.** Those two content checks are the only ones that need a network
fetch, so anything degrading `raw.githubusercontent.com` fails exactly what the branch name
fails. On 2026-08-17 — _"archive downloads and raw repository content downloads … approximate
50% error rate"_ — `validate-hacs` reported _"Repository structure for `<branch>` is not
compliant"_ on a pull request touching only `src/`, `tests/` and `docs/development/`, none of
which HACS reads.

```bash
gh workflow run hacs-validate.yml --ref main
```

`main` is the ref HACS ships from, so it cannot be structurally non-compliant; if it reports
the same thing, the problem is not your branch. During that incident it did — _"…for
`refs/heads/main` is not compliant"_ — and one run settled what retrying had not.

**Retrying is the obvious discriminator and it is not good enough.** This document said
"re-run once" for about ten minutes, until the job failed **three times running** on one
unchanged commit — at a 50% error rate, two consecutive failures are a one-in-four
coincidence, so "it failed twice, it must be real" is worth nothing. That matters because the
remedy above is self-confirming under an outage: rename, re-open, watch it pass, and the
rename takes credit that belonged to the weather.

**When several branches feed one integration branch, "merged" has to name which branch.**
Merging the integration branch _into_ your own, or merging your work into a peer's, leaves
a local state indistinguishable from being integrated: `git status` is clean, local equals
remote, your commit is in your own history, and the log reads correctly. Across one evening
of nine parallel branches feeding `feature/column-view-v4`, that produced **eight** reports
of work as merged while it sat unintegrated — by three different sessions, each honestly.
Only ancestry against the integration branch answers the question — and **the `git fetch` is
the load-bearing line, not boilerplate**. `origin/feature/column-view-v4` is a _local_
remote-tracking ref that moves only when you fetch, so the right command against a stale ref
returns an honest count of a reference from an hour ago, and nothing in the output says
which. That was the mechanism behind all eight reports: the command was correct every time.
**`ahead` and `pushed` are different questions**, and a report that answers only the first
reads as finished either way: a merge commit sitting unpushed gives `ahead: 0` with the work
nowhere anyone else can see it. That surfaced twice in three checks once the fetch was added,
so it belongs in the command rather than in the habit.

```bash
git fetch origin
git merge-base --is-ancestor <sha> origin/feature/column-view-v4 && echo merged
git rev-list --count origin/feature/column-view-v4..origin/<branch>   # 0 == nothing outstanding
git rev-list --count @{u}..HEAD                                      # 0 == nothing unpushed
```

And **check the content, not only the count**: the count going to zero proves the merge
happened, while a grep for the thing you actually cared about proves it survived the
conflict resolution. Those came apart twice here — once where a cell-wise union was needed
because two branches had filled different columns of the same table, and once where a
paragraph was restored that had been superseded in code.

Because `main` is the default branch, `Fixes #123` in a PR merged to `dev` will **not**
auto-close the issue — closing keywords fire only on the default branch, and GitHub
evaluates the keyword against the PR's _own_ base. The release PR does not clean up after
them either: merging `dev` → `main` closes only what the individual **commit messages**
reference, and that is not a convention here — 1 of the 574 commits in the v4 range carried
a closing keyword, and 25 of 1,277 in the project's whole history. So in practice **nothing
closes an issue automatically**, and doing it by hand is a step of the release rather than
an afterthought. See step 7 of _Release process_; v4.0.0 shipped with six resolved requests
still open, the column-view epic among them.

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

**A spec is working state, not a deliverable, and never reaches `dev`.** Design documents —
a specification, an implementation plan, the reasoning behind a large change — live under
`docs/development/` for the life of the feature branch that needs them, and are **deleted
there before the single PR into `dev` is opened**. One finished feature, one PR, no working
notes inside it. A spec is reviewed on its branch; it does not get a PR of its own.

Verify the deletion rather than remembering it:

```bash
git diff --name-only origin/dev...HEAD | grep '^docs/development/'
```

No output is the passing case. Nothing else will catch this: `docs/development/` is
`srcExclude`d from the VitePress build and exempt from the docs-coverage checks, so a spec
that slips through never appears on the site and simply ships as a repository file
describing work as though it were still pending.

The screenshots under `.github/img/` are **not** captured by anything in this repo. They
come from a Home Assistant instance only the maintainer has, so they cannot be regenerated
from a PR. Two consequences: a change that alters how the card renders by default — spacing,
alignment, what a row shows — silently invalidates them, so **say so in the PR** rather than
assuming someone will notice; and they are referenced by `main`-branch raw URLs, so a
replacement is only live once it reaches `main`.

**In a feature or fix PR** (targeting `dev`), document the change in `docs/`, not the README:

- the **config table** row in `docs/reference/configuration.md` for any new or changed
  option — name, type, default, description
- a **prose section** on the relevant `docs/features/*.md` page, or a sentence in the
  nearest existing one, with a real YAML snippet. A table row alone is not documentation:
  `show_countdown_allday` shipped in v3.4 as a table row only, and was undiscoverable.
- for a new language: the supported-languages list in `docs/contributing.md` **and all
  three hardcoded counts**. Derive them rather than incrementing by hand — they were wrong
  for four consecutive releases before `check:docs` grew a gate for them, which reconciles
  every published count against the files on disk:

  ```bash
  ls src/translations/languages/*.json | wc -l                            # card languages
  echo $(( $(ls src/rendering/editor/translations/*.json | wc -l) + 1 ))  # editor languages
  ```

  **The `+ 1` is not a rounding error, and the editor count is the one that keeps going
  wrong.** US English has no file — it lives in `src/rendering/editor/strings.ts` — so
  counting the directory undercounts by one. `en-GB.json` is a _delta_ of ~36 strings
  rather than a full translation, so it is easy to skip as well, and the nine complete
  files are easy to mistake for the whole set. All three are languages the editor renders
  in, and the total is **11**: US English in code, British English as a delta, and nine
  translated in full. Do not write "nine editor languages" — that is the count of the
  files that happen to be complete, not the count of languages a user can get.
  `docs/contributing.md` states the breakdown correctly; check against it.

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
Anything that _teaches_ (multiple calendars, per-calendar colours, compact mode) belongs
only in `docs/`, never in the README.

### The two "What's New" surfaces

There are **two** of them and they follow **different rules**. Updating only one is the
most likely way for a release to drift:

|           | `README.md` `## 4️⃣ What's New`            | `docs/guide/whats-new.md`          |
| --------- | ----------------------------------------- | ---------------------------------- |
| Purpose   | highlights reel for the HACS landing page | the card's full history            |
| Span      | current major only, capped at 8 entries   | **every** minor line, back to v1.0 |
| Selection | ruthless — relevance only                 | fuller, but still curated          |

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
see them; check 29 in `check-docs.mjs` resolves every absolute
`https://calendar-card-pro.alexpfau.com/…` link, fragment included, against the real
headings instead. It covers the README and `CONTRIBUTING.md` as well as `docs/`, because
those two _must_ use absolute URLs — they also render on GitHub and in HACS, where a
relative docs path does not resolve.

The README list is a **highlights reel, not a changelog** — the full notes are linked
directly above it, so anything left out is one click away. Select on relevance rather than
on whether something is a feature or a fix: a Home Assistant compatibility break or a bug
that made the card look empty belongs there; a narrow styling option, an editor validation
nicety, or a rare edge-case fix does not. Never write a catch-all "🐛 Key Bug Fixes" bullet.
Three honest bullets beat six padded ones, and older entries may be trimmed further as they
age. Deep-link each bullet to the relevant docs page where one exists.

## Docs style

These conventions are **enforced by `npm run check:docs`**, so this section is a
reference for _why_, not a checklist to police by hand. Run it before pushing docs
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

**A container title is not repeated inside the box.** `::: tip Visual Editor` followed by
a body starting `**Visual Editor:** …` renders the label twice. This is the residue left
behind when a bare bold blockquote is converted to a titled container and the old inline
label is not removed — it shipped on three pages that way. The title already labels the
box, so drop the lead-in and let the sentence start the body. A bold lead-in that says
something _different_ is fine and is left alone.

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

**One word for a config key: _option_.** Not parameter, setting, variable, property or
field. The same key was a "parameter" on one page and an "option" on the next, which
makes the docs look like they describe two different things. Check 15 enforces this only
where a backticked name is followed by the wrong noun (`` `start_date` parameter ``),
because that is the one construction where the meaning is unambiguous. These stay as they
are and are not flagged:

- **CSS/theme variables** — `var(--primary-color)` genuinely is a variable.
- **Action parameters** — those belong to Home Assistant's action API, not to this card.
- **"Core Settings" / "Display Settings"** — these mirror the editor's own section labels
  in `src/translations/languages/en.json`. Renaming them in the docs would make the text
  disagree with the UI the reader is looking at.
- **Event properties** — an event's all-day status and timing are properties of the
  event, not options of the card.
- **`whats-new.md` and `RELEASE_NOTES.md`** — a record of what was announced at the time;
  not rewritten.

## Release process

1. Bump `version` in `package.json` — it is the single source of truth. Rollup
   substitutes it into the bundle header and into `constants.ts` via `@version
vPLACEHOLDER` / `CURRENT: 'vPLACEHOLDER'` replacements.

   Then regenerate the lockfile so its **two** version fields follow — `.version` and
   `.packages[""].version`:

   ```bash
   npx npm@10.9.2 install --package-lock-only
   ```

   `npm ci` validates dependencies but never the root version, and exits 0 on a mismatch,
   so bumping `package.json` alone passes lint, tsc, the tests and the build. That is how
   8 of the 10 releases from v3.0.1 through v3.4.0 shipped with a stale lock version — 31
   of 37 tags overall. `ci.yml` now checks all three, so skipping this fails the release PR
   rather than shipping quietly.

   **When the bump lands.** Historically 0–48 h before the tag, because a minor release is
   prepared and cut from `dev` in one sitting. A major developed on a long-lived
   integration branch is the exception and the bump lands early by necessity — the release
   notes, the two "What's New" surfaces and the docs all name the version, so they cannot
   be written against a placeholder. `feature/column-view-v4` carried `4.0.0` for two days
   and 146 commits, which is the same lead time v3.2.0 had. Do not file this as premature:
   the version's only consumers are the event cache key (a change self-heals), the
   card↔editor mismatch warning (both halves are built from the same value) and the logger
   banner. A review pass raised it as a finding purely because this paragraph did not exist.

2. Update `docs/RELEASE_NOTES.md`, the README's `## 4️⃣ What's New` section, **and**
   `docs/guide/whats-new.md` — see _The two "What's New" surfaces_ for the differing rules.

   **A fix belongs in the notes only if the defect it fixes was ever released.** Check each
   one against the previous tag with `git show <tag>:<path>` — not against the diff, and
   never against the commit message, which was written mid-branch and describes its bug as
   live because to its author it was. Two conditions must both hold: the defective code
   existed in the released tree, _and_ a user of that release could reach it with a
   configuration that release supported. The second is what disqualifies a fix to code that
   only a new feature can reach. Two shapes fail it, and a long-lived branch produces both —
   a defect introduced and repaired inside unreleased work, and a fix that already shipped,
   which happens whenever a release is cut from `dev` while the branch is open and its tag
   becomes an ancestor (`git merge-base --is-ancestor <tag> HEAD`). The v4.0.0 draft listed
   37 fixes and **16 failed this**; six of them re-announced v3.6.0 fixes, one under a
   heading identical to the one in the section below it. No gate catches this.

   Two editorial rules the v4 draft also needed. **Open a feature on what it does for the
   reader, then earn the mechanism** — the editor section led with `<ha-form>` and schemas
   and reached the point three sentences later. Fixes are the exception and stay
   symptom-first, because there the symptom _is_ the value. And **weigh the sections against
   each other before shipping**: the v4 draft put 5,971 words into 🐛 Bug Fixes against 1,943
   into 🎉 New Features, in the release headlined by two features, with single bullets at 350
   words against a 113-word high in v3.5/v3.6. A fix needing 300 words is carrying its own
   post-mortem; that belongs in the commit message, not the notes.

   `check:docs` now reads `package.json` and requires all three to name that exact
   version: a `# Calendar Card Pro vX.Y.Z` section in the release notes, a `## vX.Y`
   entry in the archive, and `vX.Y` somewhere in the README's What's New. Before this
   existed, nothing tied the release docs to the shipped version — a bump could leave
   every surface describing the _previous_ release, and the only thing that would ever
   notice was `extract-release-notes.mjs` failing the release workflow after the tag was
   already pushed. So step 1 and step 2 are now a single commit whether you like it or
   not; bumping the version alone fails the PR.

3. Open a PR from `dev` into `main` and merge it. `main`'s ruleset requires an approving
   review that you cannot give yourself, so this needs `gh pr merge <n> --merge --admin`.

   **This merge is also the docs deploy.** The moment it lands, the site and the README
   advertise the new version and — since the two-file split — tell manual installers to
   download both files "from the latest release", while `releases/latest` still resolves
   to the _previous_ release, which carries only one of them. Steps 3–6 are therefore one
   operation rather than a merge now and a publish when convenient: the gap between them
   is a window in which the published install instructions describe a release that does
   not exist yet.

4. **Fast-forward `dev` back onto `main`** — `git push origin origin/main:dev`. The merge
   commit from step 3 exists only on `main`; without this, `dev` starts the next cycle a
   commit behind. See _`dev` must never fall behind `main`_.
5. Tag `main` with `vX.Y.Z` and push the tag. It has to be `main`: the workflow triggers
   on any `v*` tag, so it now refuses to build unless the tagged commit is an ancestor of
   `origin/main`. Tagging `dev` — which carries the same bumped version and therefore
   passes the tag/`package.json` check — would otherwise have produced a complete,
   publishable draft release built from code that never went through the release PR.
6. `.github/workflows/release.yml` builds and creates a **draft** GitHub release. It
   attaches `dist/*.js` and nothing else — since the two-file split that is **both**
   `calendar-card-pro.js` and `editor.js`. Publish it manually.
7. **Close the issues the release resolved.** Nothing does this for you — see _Branch
   model_ for why — so it is a step here or it does not happen. v4.0.0 shipped with six
   still open, including the epic it was named after.

   Start from the notes' _Related Issues_ section, but do not stop there: an issue is
   linked only if whoever wrote the feature remembered to link it, and the ones nobody
   remembered are exactly the ones that stay open. **Read the open list against what the
   release actually shipped.** #290 asked for a dashboard-path picker; v4 delivered one as
   a side effect of rebuilding the editor on HA's own selectors, and appeared in no commit
   message, no PR body and no release note — it was found by diffing the editor against
   the open issues, months late.

   ```bash
   gh issue list --state open --limit 100
   gh issue close <n> --comment "Shipped in [vX.Y.Z](https://github.com/alexpfau/calendar-card-pro/releases/tag/vX.Y.Z) …"
   ```

   Close with a comment that names the release and deep-links the docs page, so the
   author gets one notification that answers their request rather than a bare state
   change. Where a release answers only part of a request, comment and leave it open —
   #300 asked for columns _and_ a time grid, and got the first. And add anything you find
   this way to _Related Issues_ in `docs/RELEASE_NOTES.md`, so the next person auditing
   the same release does not have to rediscover it.

   **A half-served issue goes in that list too, marked so it is not closed.** The list is
   read at release time _as a close-list_, so the two mistakes it can produce are opposite
   and both silent: an issue left out is forgotten, and an issue left in is closed on a
   request the release only partly answered. Neither is visible afterwards, because a
   wrongly-closed issue looks exactly like a correctly-closed one. Write **do not close**
   in the entry and say which half shipped — #251 asked for all-day _and_ multi-day
   filtering and got the first, and would otherwise have been closed by anyone working
   the list mechanically.

`hacs.json` pins the distributed filename to `calendar-card-pro.js` — do not rename it.
HACS downloads every asset attached to a release, so it gets the editor without being told
about it; `filename` only selects which asset becomes the Lovelace resource.

**Every asset you attach is downloaded by every HACS user. Price a new one that way
before adding it.** This is the constraint that shapes the whole release, and it is
asymmetric: an asset that helps a minority is paid for by everyone.

**Manual installers must copy both files, and nothing in the tooling enforces that** —
only the documentation does. Copying only `calendar-card-pro.js` into `www/` yields a card
that renders perfectly and then reports a missing file the first time someone opens the
visual editor, a failure that appears nowhere near the omission that caused it. So
`README.md` and `docs/guide/installation.md` both say "both files, in a folder of their
own" in as many words. If the file layout ever changes again, those two pages are the fix;
there is no packaging step to lean on.

**The convenience zip was removed, deliberately, before v4 shipped.** Up to that point the
release also attached a flat `calendar-card-pro.zip` holding the same two files plus a
`.gz` beside each. It was genuinely useful — it made "extract both" the path of least
resistance, and the `.gz` siblings are why a hand-copied card could cost 57 KB and 82 KB
over the wire instead of 190 KB and 293 KB, Home Assistant serving a pre-compressed file
when it finds one and never compressing on the fly. It was dropped anyway, because HACS
downloaded it too: ~274 KB into every user's `www/community/calendar-card-pro/` that
nothing ever loads. Waste for the many against convenience for the few, and the few can be
served by prose. Do not re-add it without re-making that trade explicitly; the cost side
has not changed.

**Note which way round the gzip benefit ran, because it is easy to state backwards.** HACS
has no compression logic anywhere in its source, and Home Assistant's `http` component
serves static files through aiohttp's `FileResponse` without enabling compression. aiohttp
will serve a `.gz` sibling when one is already on disk, and nothing in either project ever
creates one. So the `.gz` files came from the zip and from nowhere else: **manual**
installers had the compressed transfer and HACS users never did. After the removal nobody
does. Any sentence claiming HACS delivers pre-compressed files is false, and one shipped in
`README.md` and `docs/guide/installation.md` before being corrected — check the direction
before repeating the claim.

**How other multi-file cards handle this, surveyed across ten popular ones.** The short
answer is that almost none of them face it, because almost none code-split:

- **One bundled file** — mushroom, button-card, apexcharts-card, plotly-graph-card,
  mini-graph-card, light-entity-card. A single asset, so the problem never arises. This is
  the overwhelming majority, and it is worth remembering that splitting the editor out put
  this card in a minority of two.
- **Attach everything and absorb the cost** — advanced-camera-card ships **53** assets: the
  card, a zip, and 51 hashed chunks (`editor-*.js`, `engine-frigate-*.js`, `lang-de-*.js`
  …). Every HACS user downloads all 53. Its `hacs.json` is minimal. It simply does not
  optimize this.
- **Deliver through the repository tree and attach nothing** — Bubble-Card commits `dist/`
  (66 files) and publishes releases with **zero** assets. `gather_files_to_download()`
  appends assets then returns `if files:` — _conditionally_ — so a release with no assets
  falls through to the tree path, which for a `plugin` walks `dist/` and downloads every
  file in it with no extension filter.

That third route is the only one that would put `.gz` files in front of HACS users, since
the tree path does not filter by extension. It costs a committed `dist/`, zero release
assets, and a clumsier manual download — GitHub offers no way to fetch one folder. It was
considered and not taken; reopen it only with those three costs in hand.

**Never add `content_in_root` to `hacs.json`.** Its absence is load-bearing, and the
failure it prevents is invisible from the manifest — which is why this warning lives here
rather than as a comment in the file, JSON having nowhere to put one. Today HACS reaches
`gather_files_to_download()` with releases in play, appends _every_ asset and returns, so
both `.js` files arrive. Setting `content_in_root: true` makes `update_filenames()` skip
the release-asset branch entirely and resolve `filename` against the repository tree, and
the download narrows to that one file. `editor.js` would stop being delivered. The card
would still render for every HACS user; it would 404 only when someone opens the visual
editor, so the break would look like an editor bug and not a packaging change.

**No manifest option can narrow what HACS downloads.** The full schema is
`content_in_root`, `country`, `filename`, `hacs`, `hide_default_branch`, `homeassistant`,
`manifest`, `name`, `persistent_directory`, `render_readme`, `zip_release` — there is no
asset filter among them, and the release branch of `gather_files_to_download()` appends
every asset and returns without consulting any of them. The only lever is the `files:`
list in `release.yml`, which is why that list is the whole story and why the comment above
it is long.

`zip_release: true` is not the escape hatch it appears to be, so do not reach for it if a
bundled download is ever wanted again. It does make HACS download a single archive and
extract it — but only when `filename` ends in `.zip`, and `filename` is the same field
`generate_dashboard_resource_url()` builds the Lovelace resource from. The registered
resource would become `…/calendar-card-pro.zip?hacstag=…`. That option is built for
categories that do not register a JS resource; for a `plugin` it is unusable. A bundled
download would have to live outside the release assets entirely.

## CI

- `ci.yml` — lint + build on every PR to `main`, `dev` or a `feature/**` branch. Also guards
  the two release-infra
  drifts nothing else can see: `package.json` disagreeing with either version field in
  `package-lock.json`, and `.nvmrc` disagreeing with `.node-version`. Both run before the
  install, so they fail in seconds. It also runs `docs:build`, so the site's own build
  command is exercised on a pull request rather than first on `main` — see _Docs site
  deployment_.
- `hacs-validate.yml` — HACS validation on the same PR branches, plus `main` and nightly.
  Everything it validates is decided before a merge, so running it only on `main` meant a
  packaging mistake could only be found once `main` already carried it.
- `release.yml` — tag-triggered draft release.

## Docs site deployment

<https://calendar-card-pro.alexpfau.com> is a Cloudflare **Workers Build**, configured in
the Cloudflare dashboard rather than in a workflow file. It runs `vitepress build docs`
and serves `docs/.vitepress/dist` as static assets.

- **It builds only on push to `main`.** Pushing to `dev` produces no Workers check run at
  all, so nothing on `dev` is ever live. **Merging the `dev` → `main` PR _is_ the deploy** —
  there is no separate publish step and no tag involved.
- **`ci.yml` runs `docs:build` so a pull request exercises the deploy's own command.** It
  did not always, and the gap was invisible: a broken `docs/.vitepress/config.mts` passes
  `check:docs`, `lint` and `tsc --noEmit` — `docs/` sits outside the tsconfig include — so
  every check went green, the PR merged, and the Cloudflare build was the first thing to
  run it. The two docs checks are complementary rather than redundant, and each catches
  what the other misses: a link to a heading that does not exist fails `check:docs` and
  builds cleanly under VitePress, while a config error fails only the build. Keep both.
- `wrangler.jsonc` defines the Worker: no `main` script, `assets.directory` pointing at the
  VitePress output, and the custom domain declared as a route so the hostname binding stays
  in version control.
- The Node version is pinned by **both `.nvmrc` and `.node-version`** (kept in sync), and
  `ci.yml` reads `.nvmrc` via `node-version-file` so CI and the deploy run the same runtime.
  Keep it that way — `ci.yml` now fails when the two files disagree, because their agreement
  is the whole reason a green CI run predicts a successful deploy. When they drifted — CI on
  Node 24, the build image on Node 22 — npm 11 in CI accepted a `package-lock.json` that npm
  10 on the build image rejected with `EUSAGE … Missing: esbuild@… from lock file`. CI was
  green on every PR while the deploy failed and the site quietly served stale content.
- **A lockfile that installs locally is not a lockfile that installs on the build image.**
  Merging branches that each touched `package-lock.json` can produce a file that is
  internally inconsistent but still satisfies a newer npm. To check against the deploy's
  npm rather than yours:

  ```bash
  mkdir /tmp/lockcheck && cp package.json package-lock.json /tmp/lockcheck/
  cd /tmp/lockcheck && npx npm@10.9.2 ci --dry-run
  ```

  A non-zero exit here means the next merge to `main` will fail to deploy. Fix it with
  `npx npm@10.9.2 install --package-lock-only` and commit the result.

- A green `validate-hacs` check does **not** mean the site deployed. The Workers build is a
  separate check run named `Workers Builds: calendar-card-pro`. Confirm a deploy by
  fetching the live page, not by reading check names:

  ```bash
  curl -s https://calendar-card-pro.alexpfau.com/reference/configuration \
    | grep -o '<title>[^<]*</title>'
  ```

  If the build fails, its log lives only in the Cloudflare dashboard — the GitHub check run
  carries a `details_url` and no log text, and the check-run/check-suite re-request
  endpoints both return 404 for a normal `gh` token. Ask for the log rather than guessing;
  two build cycles were spent inferring a cause the first log line stated outright.

## Adding or changing a translation

This is the most error-prone area of the codebase; the same mistake has shipped
repeatedly. A language is only fully wired up when **all** of these are done:

1. `src/translations/languages/<code>.json` — must contain every **top-level** key present
   in `en.json`. `en.json` is the reference. **Card strings only.** An `editor` section
   here is now a `check:i18n` error, because these files are imported statically for all
   35 languages and land on every dashboard load.

2. `src/rendering/editor/translations/<code>.json` — the editor's strings, **optional and
   may be partial**. Ten of the 35 languages translate the editor; the other 25 have no
   file here at all and the editor renders in English. Both are supported — `lookup()` in
   `src/rendering/editor/localize.ts` resolves each key on its own, falling back
   **requested language → English**, where English is `strings.ts`.

   **There is deliberately no `en.json` here.** English lives in `strings.ts` and nowhere
   else, so the two can never disagree; `check:i18n` errors on an `en.json` in this
   directory. Keys match `EDITOR_STRINGS` exactly, and a key that is not in that table is
   an error too — nothing would ever look it up.

   That per-key chain is deliberate and is the maintainer's stated preference: show the
   language, and fall back to English only for the individual strings it is missing. A
   partial file is safe to ship, so translate as much as you like and leave the rest.
   `check:i18n` reports coverage as an informational line, not as a failure.

   🚨 **`en-GB` is complete at 13% — never gate on coverage without excluding it.**
   `en-GB.json` is a _generated delta_ of ~44 spelling overrides written from `strings.ts`
   by `scripts/generate-en-gb.mjs`, and `check:i18n` recomputes it and fails on any drift.
   It is complete by construction and already held to a **stricter** standard than
   coverage. Measured against the full editor string table it reads 13%, so any "warn below
   N%" rule flags it permanently — and a permanently-red gate is the one people learn to
   ignore, which is the failure such a gate exists to prevent. The nine hand-maintained
   files are the only meaningful denominator.

   These files are reachable **only** from `src/rendering/editor/`, so they are built into
   `editor.js` rather than loaded on every dashboard load, and they may not go back into
   `languages/`. A new file also needs an `import` **and** an `EDITOR_LANGUAGE_STRINGS`
   entry in `translations/index.ts`, under a lowercase key naming a language that already
   exists — a file nothing imports is silently never registered.

3. `src/translations/localize.ts` — the `import` **and** an entry in the `TRANSLATIONS`
   map. **The map key must be lowercase** (`'en-gb'`, `'zh-cn'`), because lookups
   lowercase the configured value before matching.
4. `src/translations/dayjs.ts` — **two separate edits**, both required:
   - `import 'dayjs/locale/<code>';`
   - add the base code to the `supportedLocales` array inside `mapLocale()`
5. `docs/contributing.md` — the supported-languages list **and the three hardcoded counts**
   (see _Documenting a change_). `check:docs` reconciles these against the
   files on disk, so a wrong count now fails the build instead of shipping. Count the editor
   languages as files **+ 1**, because US English lives in `strings.ts` and not in
   `translations/`; the answer is 11, not 9 and not 10.

Omitting the `supportedLocales` entry (4b) is a **silent failure**: the language works
everywhere except relative times, which quietly fall back to English. Catalan and
Romanian shipped broken this way for months. If you add a locale import, add the array
entry in the same edit.

`npm run check:i18n` catches every one of these wiring mistakes mechanically, including
that one, and runs in CI. Run it before you claim a language is done — but note it
verifies **wiring**, not translation quality, and it cannot tell you whether
`pēc 2 dienām` is correct Latvian.

**The editor's termbase lives in [`scripts/editor-glossary.mjs`](./scripts/editor-glossary.mjs).**
It records, per language, the decided form of each UI term and the forms rejected for it,
and `check:i18n` enforces both: a rejected form anywhere in a governed key is an error, and
a key whose English _is_ a term is warned about when it does not use the decided form.
Rejected entries are the stronger statement, because they match at a word start and so
catch compounds — roughly half the terms have no key whose English matches them exactly,
and for those the decided form is documentation only. Every run prints which half is which.
Edit that file when a decision changes; it is data the checker imports, so a shape change
is a load error rather than a check that silently enforces nothing.

Regional variants usually need no `dayjs.ts` change at all, because `mapLocale()`
reduces them to their base code (`en-gb` → `en`). Only `zh-cn` / `zh-tw` are
special-cased.

Verify a language change by actually resolving it, not by reading the diff:

```ts
getEffectiveLanguage('lv', undefined); // -> 'lv'
getRelativeTimeString(futureDate, 'lv'); // -> 'pēc 2 dienām', not 'in 2 days'
```

## Event classification and cache invalidation

Two facts about `src/utils/events.ts` that no gate protects, and that have cost a defect
each.

### Render-time and processing-time options invalidate differently

An option read at **render** time needs no cache invalidation; one read at **processing**
time does. Copying an option's config shape without copying its timing is how you ship a
control that does nothing.

`split_multiday_events` is resolved in `groupEventsByDay`, per view, at render — so a
change reaches the screen on the next render with nothing re-fetched or re-processed.
`event_type` is read in `processEvents`, which runs only on the fetch path, so its value is
baked into `this.events`; a card-level edit then renders stale until the next scheduled
refresh, a reload, or an unrelated entity edit. `PROCESSING_TIME_KEYS` in `config.ts` closes
that gap and `hasEntityProcessingChanged` consults it — **register any new processing-time
option there.**

🚨 **The per-calendar half of such an option works either way**, because any entity edit
changes `serializeEntities` and triggers a reprocess. The defect therefore hides in the
card-level half, and a test table covering only `EntityConfig` is structurally blind to it.
The falsifier, which is also the shape of the fix:

| change                   | `updateEvents` calls |
| ------------------------ | -------------------- |
| card-level, broken       | 0                    |
| card-level, fixed        | 1, with `false`      |
| per-calendar             | 1 — either way       |
| control: `days_to_show`  | 1                    |
| control: `show_location` | 0                    |

Both controls are load-bearing. Without `days_to_show` the harness might be detecting
nothing at all; without `show_location` a zero is indistinguishable from a probe that never
ran.

### A new per-calendar option must be added to a hand-written whitelist

🚨 **`normalizeEntities` in `config.ts` projects each entity through a hand-written field
list, and an option missing from it is dropped before it reaches anything.** Normalization
runs in `setConfig`, so the key never lands in `_matchedConfig` and the option is inert no
matter how carefully the rest of it was wired — types, editor schema, translations,
transform and docs can all be correct and complete.

It is silent by construction. Nothing in the editor can see it, because the editor writes
the key correctly; nothing in the types can see it, because the type declares it; and
`tsc` cannot see it, because omitting an optional property from an object literal is legal.
Three per-calendar options were written this way in one PR, with every other layer correct,
and were caught only by the test below.

**The file already documents the hazard, one function below the one that has it.**
`serializeEntities` sits twenty lines further down and its docblock reads: _"Being
field-agnostic is the point. A hand-written field list would silently stop covering the
next per-calendar option somebody adds."_ That is exactly true, and it protects only
itself — the projection above it was written the other way, so the two disagree about
which fields exist and only one of them says so.

What catches it is a test that **reconciles the whitelist against `EntityConfig`** rather
than walking either one, which is the same _pin the whole table by value_ discipline as the
`Object.keys(TABLE)` trap above; `tests/entity-config-reprocess.test.ts` does this. Blanking
one line of the projection fails that test plus every behavioural test for the dropped
option, which is the falsifier to run when adding one.

### Proximity is not reach — a note about a family should be a reconciliation

🚨 **A hazard documented beside the code that has it is not a defence.** This has now been
found three times, always in the same shape: a comment describes the trap _completely_ and
_correctly_, for the neighbouring case, and the next member of the family arrived in a
different pull request weeks later and was never added to it.

- `normalizeEntities`'s hand-written projection against `serializeEntities`'s docblock
  twenty lines below, which argues for being field-agnostic precisely so this cannot happen
  — and protects only itself.
- `entityConfigKeys` handling `label_icon_source` and not `accent_color_mode`, the other
  half of the same feature. Substituting two identifiers in that comment yields the defect
  report verbatim.

Neither was carelessness. Both authors understood the hazard exactly. **A note generalizes
only if a reader happens to be looking at it while writing the next case**, and the next
case is written by someone reading a different file.

**So when you write a note about a family of things, ask what the family is enumerated by.**
If the answer is a type, an interface, or a schema the code already walks, the note can be a
**reconciliation** instead — and a reconciliation is the only form that covers members
nobody has written yet. `tests/editor-derived-field-mapping.test.ts` is the worked example:
it walks the rendered schema, reads `EntityConfig` from source, and asserts that any control
whose name is **not** a config key has been explicitly mapped, and that everything it maps
to is a real key. There is no list to keep in step, so it fails on the _next_ derived
control rather than on someone remembering.

Two caveats worth keeping. **Reconcile against the type, not against a second list** — a
second list is one more thing to forget, and the bug is forgetting. And this only works
where the family has a runtime enumeration; **prose conventions, term choices and judgment
calls have none**, which is what `scripts/editor-glossary.mjs` is for. Same lesson,
different mechanism: enforce the family where the family is enumerable, and where it is not,
name the members explicitly and gate on them.

### The card holds three disagreeing answers to "is this multi-day?"

For a **timed** event running 23:30 to 00:30:

| asked of                                              | answer                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `isMultiDayEvent` (`events.ts`, drives splitting)     | **yes** — it renders as two rows                                                   |
| `isMultiDayAllDayEvent` (`format.ts`, drives display) | **no** — `false` for any timed event, deliberately, pinned by a test               |
| `!event.start.dateTime` on a split **middle segment** | reads **all-day** — `splitMultiDayEvent` rewrites middle days as `start: { date }` |

None is wrong for its own caller. The third bites silently: anything filtering on event
class must run **before** `processMultiDayEvents`, or it sees the middle of a three-day
timed meeting as all-day.

The design consequence is larger than the bug. All-day-ness and multi-day-ness are
**independent booleans**, so there are four classes, not three. A control offering
_timed / all-day / multi-day_ is not a partition, and no selection over it can express
"every all-day event one color, every timed event another" — which is why `event_type`
names the all-day axis only, and why a span axis needs the card to **pick** one multi-day
definition before it can offer one.

## Editor (`src/rendering/editor/`)

The visual editor is **schema-driven**: each panel is an `<ha-form>` fed by an array of
plain schema objects, and a schema names a **selector** rather than an element. That is
the whole point — Home Assistant renames its input components without notice (`ha-textfield`
became `ha-input` in 2026.5 and cost us a runtime-detection shim), and a card that names
selectors is not exposed to it. The element names three Home Assistant components in total:
`ha-form`, `ha-expansion-panel` and `ha-svg-icon`.

**Never name an HA input element in a schema.** If a panel seems to need one, that is the
signal to stop, not to reach for `static-html`.

Everything except `element.ts` and `styles.ts` is free of Lit and of the DOM. That is
load-bearing, not tidiness: it is what lets both the test suite and `check:i18n` import a
schema and read it, rather than scraping the source that produces it. Keep it that way.

Three things are easy to get wrong:

- **`ha-form` hands back the whole merged data object on every keystroke.** `value.ts`
  narrows it again on the way out. Anything that bypasses `toStoredConfig` writes ninety
  defaults into the user's YAML — the bug the nearest comparable card shipped twice, the
  second time introduced by its own move to `ha-form`.
- **`ha-form` fires one event for the whole form and never says which field moved**, so
  there is no place for a per-field `event.type` guard. Values that are invalid _while
  being typed_ — `start_date_offset` passing through `-` — are held in `synthetic.ts` and
  committed only once they parse. Do not "simplify" that into a direct write.
- **Colours are `text`, not `ui_color`.** HA's colour selector emits a theme token that
  cards pass through `computeCssColor()`; this card writes colours straight into CSS
  custom properties and has no such step. See the note in `ha-form.ts`.

### The picker shows calendars; the panel list shows blocks

`SYNTHETIC_FIELDS.calendars` derives **one row per calendar**, not one per entry in
`config.entities`. A calendar listed twice — the pattern `event_type` needs, and what
**Duplicate** creates — is one picker row and two panels. That split is deliberate: the
picker decides _which calendars are on this card_, the panels decide _how many blocks each
has and what is on them_. Deriving 1:1 made the picker answer both and agree with itself on
neither, because Home Assistant's picker refuses to hold one entity twice — so a duplicate
could be **seen** there and **cleared** there, but never **added** there.

**`derive` and `apply` cannot be changed apart.** `apply` used to shift one block off a
per-id queue per row, which is correct only when rows and blocks are 1:1. Deduplicating
`derive` alone therefore loses every block after the first, silently, on the next thing the
user touches in the picker. Each row emits its calendar's **whole** queue.

**Collapsing duplicates costs no ordering, and this is provable rather than probable** —
worth knowing before anyone "restores" interleaving. Only three things read the order of
`config.entities`, and none can see block multiplicity:

- `deduplicateEvents` walks `config.entities` and matches `event._entityId === entityId`.
  A second block of the same id finds every signature already in `seen` and contributes
  nothing, **whatever its `event_type`** — so priority under `filter_duplicates` is fixed
  by where an id **first** appears, and multiplicity is structurally invisible to it.
- `fetchEvents` skips an id already in `fetchedEntityIds`.
- `getPrimaryEntityId` reads `entities[0]`.

First-occurrence order preserves all three, so `[a, b, c, b]` collapsing to `[a, b, b, c]`
changes nothing observable. Note the trap in the weaker version of this argument, which is
the one that comes to mind first: _"two blocks split by complementary `event_type` never
carry the same event"_ is true but far narrower, and it would stop holding the moment
someone duplicated a calendar without differentiating it. The id-matching argument does not
depend on the blocks differing at all.

**Removal splits along the same seam.** Clearing a picker row drops every block for that
calendar, because the row stands for the calendar; **Remove** on a panel drops one block,
and is the only control that can. Its earlier justification — that `_entityChanged`
upstream filters by value, so clearing one of two identical rows took both — described a
picker that no longer exists here, and should not be restored as the reason.

### Sub-headings are `constant` nodes, and they can lie

A section heading is a `constant` schema node **with no `value`** — that renders as a bare
bold label. Give it a `value` and it becomes a `Label: value` data row instead, which is not
a heading. The type was already declared and unused, so this needs no new mechanism, and
`check:i18n` treats it as a labelled field and requires one English string for it —
enforcement, not cost.

A heading is the one node type that can **actively lie**, because it makes a claim about
what follows it. Adding them forced three changes to the panel filter, each preventing a
distinct false statement:

1. **A heading must never be a search hit of its own.** Its text matches like any field's,
   so searching a word that appears only in a heading returned the heading alone,
   captioning an empty section.
2. **A heading whose section the filter emptied must be pruned**, or it strands above the
   next section and relabels someone else's options.
3. **`hasFields` must not count a heading**, or a panel reduced to nothing but labels is
   still offered as having content.

The rule governing placement: **a heading over a non-contiguous category is worse than no
heading**, because it silently claims whatever follows it. Introducing headings therefore
drags the reorder into the same change; they cannot be sequenced apart.

Two smaller ones. A heading named the same as its only field reads as a stutter, and a DOM
probe cannot see that — only a screenshot can. And when a schema gains headings, the test
helpers enumerating _options_ should exclude them, with heading behavior pinned separately;
sprinkling heading names through a dozen expectations makes each assertion less about what
it was for.

### Where a new option goes is a decision, not a default

**Placing a new option at the end of its section is not placement — it is the absence of
it.** Picking the right section is the first half of the question; the second half is where
in that section it belongs, and appending answers it by accident. This has been raised on
two consecutive pull requests, both times because a session chose the category carefully
and then appended.

The sections are ordered coarse-to-fine by **scope**, and the options inside them follow
the same rule: what qualifies a whole day, then what qualifies a class of event, then what
retires an event, then patterns matching one event's text, then the budget capping how many
survive. That is why `compact_events_to_show` sits last in _Which Events Appear_ — it is a
budget rather than a predicate, applied to the result set rather than to an event.

Do **not** order a section by the pipeline stage the options run in. It is a real ordering
and it is invisible to the reader, who cannot tell which options are resolved at fetch time
and which at render time, and should not have to. `days_of_week` is resolved last of the
per-calendar filters and belongs first, because it is the broadest question a reader asks.

Treat a new option's position as needing a stated reason, the same way its name and its
default do. Say in the PR body where it went and why.

`npm run check:i18n` reconciles `strings.ts` against the fields the schemas reference, in
both directions, by importing the schema modules. A new field with no string fails it.

## Style

- Strict TypeScript; keep it strict.
- JSDoc on public functions.
- Run `npm run format` (prettier, whole repo) before committing — `check:format` gates it in
  CI. `npm run lint` uses `--fix`, so it _repairs_ formatting rather than failing on it.
- Match the existing module layout: `config/`, `interaction/`, `rendering/`,
  `translations/`, `utils/`.

**Never turn a config value into a JS number inside `src/rendering/`.** Length options are
documented as CSS length _strings_, so `parseFloat(config.x) + 'px'` silently discards the
author's unit — `day_spacing: 2em` drew its separators at `2px`, and `calc()` parsed to `NaN`
and emitted the literal string `NaNpx`. Both defect sites lived in this directory and both
shipped in v3.6.0, surviving twelve review passes: every default is a px value, so the bug
and the tests agreed with each other. Scale lengths with `ViewConfig.scaleLength()`, which
keeps the unit and hands `calc()`/`var()` to the browser; coerce editor form input with
`Config.toValidNumber()`. A `no-restricted-syntax` rule scoped to `src/rendering/**` now
enforces this, so it fails at lint rather than at review. Genuine _counts_ (`min_days_to_show`)
and deliberate px-only reads (`parsePx`, which compares against a measured pixel width) are
correct and live in `config/` or `utils/`, outside the rule's scope.

**When you add a length option, test it at a non-px unit.** The suite is built from default
config, and every length default is written in px, so a px-only test agrees with a
unit-discarding implementation. `custom-property-mapping.test.ts` pinned only `20px → 35px`,
which is precisely why the bug above survived. Pair every px assertion with an `em`/`rem` one.

**Cite symbols in comments, never line numbers.** A citation into the five-hundreds of
`render.ts` was accurate when it was written and became a pointer into empty space the moment
the v4 refactor cut that file from roughly a thousand lines to five hundred. Six such citations shipped in the test suite, one of them
naming a README line four times past the end of the file, and nothing failed because no tool
reads prose. A symbol name — `renderDateWeather` in `leaves.ts` — is greppable, survives
every edit above it, and tells the reader what to look for rather than where it used to sit.
`check:docs` now flags any comment citation that points beyond the end of the file it names;
citations that quote a released tag, such as `v3.6.0 leaves.ts:324`, are exempt because a tag
is immutable.

**When a planning document is retired, grep for its vocabulary.** `docs/development/column-view.md`
was deleted once the column view shipped — late, under the older workflow that let a spec
reach `dev` at all, where the rule under _Documenting a change_ now retires one on its own
branch — and nineteen references to its phases survived in four test files, still written in
the future tense, still describing work as upcoming that had already landed. Comments that
name a document outlive the document whenever it goes, so deleting one is not finished until
`grep -rn "Phase [0-9]" src tests` comes back empty.

**A JSDoc block touches the thing it documents — no blank line between them.** This is the
one style rule in the project that nothing mechanical enforces, so it is the one that
silently rots. TypeScript still associates a doc comment and its `@param` tags across a
blank line, so hover text and signature help keep working; no ESLint rule governs the gap;
and Prettier does not close it. Every gate stays green while the comments drift away from
the code.

It rots in bulk rather than one comment at a time, because the cause is an automated edit
sweeping a whole file: v4 accumulated **80 detached blocks across 10 files**, with 8 of the
10 detached in their entirety, against zero on `dev`. Reattaching them is a pure whitespace
change — 80 deletions, no insertions.

The exception is a block that documents the file rather than a declaration. A module header
or a section banner is _followed_ by a blank line and then an `import` or another comment,
and that blank line is correct — do not close it. The distinction to apply when in doubt:
if the next non-blank line is a declaration, the comment belongs against it; if it is an
`import` or a comment, the block is a header and the gap stays.

<!-- prettier-ignore -->
```ts
/** Return the card's configured view. */    // ✅ attached to the declaration
export function getView(config: Config): View {

/** Return the card's configured view. */    // ❌ detached — nothing will flag this
                                             //    (blank line here)
export function getView(config: Config): View {
```

**Comment the stylesheets as freely as the TypeScript.** A `css` tagged template's contents
are a string literal, so no minifier looks inside one — comments there used to ship to every
user, and half the stylesheet was comment. That is fixed at build time by the
`strip-css-comments` plugin in `rollup.config.mjs`, which removes them from both
`rendering/styles.ts` and `rendering/editor/styles.ts` and takes 18,176 raw / 7,016 gzip
bytes off the eager path (51% of the stylesheet, measured at v4.0.0 by building with the
plugin and again without it).

This is worth stating because the alternative is worse than it looks: without knowing the
plugin exists, the reasonable move is to keep CSS comments terse, and the reasoning in
`styles.ts` is exactly where terse comments have already cost this project twice. Write the
explanation. It does not ship.

One syntax trap comes with that freedom: **a CSS comment lives inside a template literal, so
a backtick in one ends the literal.** Quoting a property as `` `align-self` `` — the habit
every other comment in the codebase rewards — turns the rest of the stylesheet into
TypeScript and produces parse errors pointing at whatever line the compiler gave up on,
nowhere near the backtick. Write property names bare in CSS comments.

## Reference

- [`docs/architecture.md`](./docs/architecture.md) — module responsibilities, data flow,
  caching and performance design. Read before making structural changes. Its _Two Views,
  One Agenda_ and _Two Files, One Card_ sections are the current description of the view
  split and the two-bundle build.
- [`docs/features/column-view.md`](./docs/features/column-view.md) — what column view does,
  which options it overrides per view, and which it deliberately ignores. Read before
  touching the rendering pipeline, the view dispatch, or any view-dependent config key.

## Verification

These documents lean hard on the word _verified_, so it is worth saying what it has to mean.
**A claim that no available case could have falsified has not been verified; it has been
untested** — and "verified, not assumed" is the label most likely to end up attached to
exactly that. So say **how** you checked, and prefer a claim that ships with its own
falsifier: _"delete a `prettier-ignore` in `leaves.ts`, run `npm run format`, then
`npm test`"_ cannot go quietly stale the way _"prettier does not reformat templates"_ did.

**A falsifier is itself a claim, and it can rot in two ways.** This one did both. It
cited `leaves.ts:122`, a line that has since become three lines none of which is 122 —
so write the `grep` that finds the site, not the number. And it omitted the `format`
step, so anyone who ran it exactly as written saw the whole suite pass and would
reasonably have concluded the directive was dead. Note that neither sentence quotes a
test count: an absolute total is the same rot-prone citation as a line number, and this
one had already drifted by several hundred before anyone reading it noticed.
**Re-run your own falsifiers before quoting them**; a falsifier that no longer falsifies
is worse than none, because it launders an untested claim as a verified one.

**Four ways a check passes while proving nothing.** Each was found here, twice, against
different artefacts.

| #   | Failure                                                                                                                                                                                                                                         | Falsifier                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **A metric derived from the fix's own hypothesis cannot falsify it.**                                                                                                                                                                           | Look at the artefact once with the metric switched off.                                                            |
| 2   | **The representative input passes cleanly every time.** Pick the case most likely to _break_ the claim — and note that right language, right script and right class still cleared the rule once, because the property that mattered was length. | Name the input you would least like to run.                                                                        |
| 3   | **A probe can be correct, correctly configured, honestly reported — and measuring the wrong thing.**                                                                                                                                            | Have someone derive it a second way; two independent derivations agreeing is worth more than either being careful. |
| 4   | **A probe whose own structure supplies the finding** — the nastiest, because it yields a _positive claim that looks like evidence_ rather than a null.                                                                                          | Ask what result the probe is incapable of returning.                                                               |

**Rules that follow from those.**

- **A mutation sweep is a probe, so it lies in both directions — and the same session
  produced one of each within an hour.** Row 4 above is the sweep manufacturing a
  _positive_: twelve mutations reported "caught (build error)", uniformly, because
  `execSync` throws on vitest's non-zero exit and the catch never read stdout, so a
  generic `/error/` test relabelled every genuine test failure. The answer happened to be
  right and the evidence was worthless. The **inverse** is nastier, because it reads as a
  gap in the tests rather than a gap in the probe: a mutation that "moves" a template by
  adding an attribute changes nothing observable, reports SURVIVED, and invites you to
  delete or rewrite a test that was working. Both are caught by the same two habits —
  **run an unmutated control that must report a non-zero pass count and zero failures**,
  and **read what each mutation actually did to the source**, not what it was named. A
  sweep whose rows all report the same verdict has usually measured itself; genuine
  detection gives _different_ failure counts per mutation, because different mutations
  break different tests.

- **A null must prove it can be non-zero — and so must a passing control.** Print the
  denominator _beside_ the verdict, not as a separate step: `CONTROL x -> old:true new:true`
  cannot expose a corpus defect, whereas the same line carrying the size of what it looked
  at makes a short count something you catch by reading rather than by luck. Compare
  `ls src/rendering/editor/*.ts` with `find src/rendering/editor -name '*.ts'` for a live
  flat glob that silently drops most of a nested tree. Plant a real violation and confirm
  it is caught _before_ mutating. A mutation that changes no observable behaviour is
  evidence about the corpus, not the code.
- **A denominator bounds the corpus, not the search.** "0 of 1,939 lines" is a true,
  well-formed null that still misses every defect its pattern cannot express — a truncation
  probe matching only lines that end in a comma reported zero across the whole tree while
  `resolveLabelType`'s summary ended in the stranded word "what". Enlarging the corpus makes
  such a null more confident without making it more correct, so quote the match set beside
  the count.
- **A gate's normal state is having no instance — judge its pattern against the runtime,
  not the corpus.** "Nothing in the tree violates it today" is what a working validator
  looks like, so applying _no instance ⇒ null_ to one retires the check that would have
  caught tomorrow's regression. Ask instead whether its pattern can express what it claims
  to validate: `check-i18n.mjs` matched placeholders as `/\{[a-z_]+\}/g` while
  `interpolate()` substitutes `/\{(\w+)\}/g`, exempting every `{maxCount}` from validation
  while the corpus sat clean at zero. Widening a gate to the runtime's own class cannot
  yield false positives by construction — a property of the pattern, not of the tree it
  happened to be measured against.
- **A string match is a location, not a verdict.** `grep` tells you which line to read; only
  reading tells you whether the claim holds. Four false conclusions here stopped at the
  match. A _paraphrase_ — `ReadonlyArray<...>` for the source's
  `ReadonlyArray<keyof Types.ColumnOverrides & keyof Types.Config>` — returned zero at a commit
  where the annotation demonstrably existed, and was called invented. A hit on "structurally
  incapable" was called an overstatement without reading its subject — _the parity tests_,
  not the suite — or the bound stated on the next line. And `shallow`, a word lifted from a
  commit _subject_ and never present in the file body it described, returned zero twice:
  once against the wrong file, nearly landing an unneeded commit on a release branch, and
  once against the right one, nearly reporting merged content as lost. Wrong form, wrong
  unit, wrong file, wrong token. Take the file from the commit's own `--stat` and the wording
  from the source — not from a subject line, and not from memory — then verify the sentence
  rather than the token.
- **`grep` exits 1 on no match — read the status, not the count.** `grep -c` saturates at 1
  after flattening; use `grep -o … | wc -l`.
- **Regex a file for its _shape_, import it for its _values_.** And when the machine reads a
  table, ask whether it reads that _field_, and whether that field's consumer can match
  anything at all — read, acted upon, reachable are three different things.
- **Normalise every dimension the writer does not control**, in this order: line-leading
  markup per line, then emphasis and code spans, then whitespace. Flattening first destroys
  the boundary the prefix rule needs. A markup-free fragment does _not_ survive reflow.

  ```js
  const norm = (s) =>
    s
      .replace(/^\s*>\s?/gm, ' ')
      .replace(/[`*_]/g, '')
      .replace(/\s+/g, ' ');
  ```

  Self-test both directions — a sentinel that must not match is blind to the false negative,
  which is the direction that provokes an unnecessary restore.

- **When you withdraw a finding, grep for its _consequences_, not its wording.** The
  expensive half is every place it was already turned into a rule: an imperative three
  sections away, a parsed table cell, a test that pins it, or the code a document describes.
  A document-to-document audit cannot see the last of those.
- **Independent agreement is evidence about the code both reviewers read, not about the tip.**
  Two reviewers converging is the strongest corroboration available, and it held here — on a
  defect the intervening 47 and 50 commits had already fixed. Convergence localises _when_,
  not _whether_, so measure the reviewed SHA's distance before the finding and re-measure
  before acting — `git fetch` first, then `git rev-list --count <sha>..origin/<branch>`, never
  against a SHA quoted in a brief. Two passes here did that arithmetic correctly and still
  reported 25 commits of drift where there were 38, because the tip they had been handed was
  itself 13 stale; a worktree sitting at that SHA answers `0` to `<sha>..HEAD` and reads as
  current. A remote-tracking ref goes stale just as silently: a third pass ran the
  `origin/<branch>` form without fetching first, inherited that same tip, and reported 18 where
  there were 33 — having itself noted the newer commit was missing from its fetch. The fetch is
  the load-bearing half, not the ref, and three passes agreeing on a denominator is this
  bullet's own headline one level up: they agreed because they shared a brief, not because they
  measured. Report the figure with both endpoints — `<reviewed>..<tip> = N`, never a bare `N`:
  that staleness took a separate investigation to uncover, and would have stated itself on its
  face as `db91d09..b4eb8bf = 18`. The anchor is what makes a denominator checkable, and it
  binds the corrector equally — the `33` sent in that correction was `34` before it arrived,
  because the session issuing it was itself committing. The cheapest re-measurement is often
  the comment beside the suspected line: a fix written from a real report tends to restate the
  defect in the reporter's own terms, which separates _fixed_ from _still broken_ without a
  probe. Where it does not, the regression test usually carries the reporter's scenario in its
  name.
- **Verifying the checkable half of a claim does not verify the claim.** A report that pairs
  code facts with a behavioural result invites you to check the facts, find them exact, and
  carry the result across on that credit. A sibling pass's control-design example cited two
  lines that proved correct to the character, and the asymmetry built on them did not
  reproduce: the constant it described as harmlessly absorbed killed nearly as many tests as
  the expression it described as load-bearing, where its argument required zero. The half
  cheap enough to check is rarely the half doing the work, so reproduce the result or drop
  the example — this document is the wrong place to discover which.
- **"Emitted but undocumented" is a claim about the production call site, not the producer.**
  The natural evidence — the code that emits the thing, plus a test pinning it — can both hold
  while the finding is false, because a test may call the producer directly and supply the very
  condition said to occur. Trace the path production actually takes, and check the released
  branch as well as the tip. A class reported here as a missing theming hook proved gated on a
  parameter no production caller ever set — passed explicitly as `false` on the branch under
  review, and left to its `false` default on the released one — so it had never reached a user
  in any version; the remedy inverted from documenting it to deleting it and the pair of tests
  that were its only caller. Where a remedy is to write documentation, first establish that its
  subject exists for users at all.
- **A surviving mutant means the suite cannot see the code, not that production cannot reach
  it.** The natural inference — delete what nothing pins — fails whenever a sibling branch
  absorbs the mutation, leaving the two mutually masking so that each looks individually dead.
  Disabling the exact-hour lookup in `findForecastForEvent` left the suite green; disabling the
  closest-hour fallback instead left it green; disabling both turned it red. Every fixture's
  event began on an exact hourly key, so neither branch was ever the only one able to answer,
  and deleting either on that evidence would have dropped live behaviour. Mutate surviving
  siblings _together_ before concluding anything, and where the pair proves jointly load-bearing
  the remedy is a fixture that separates them — an event whose start hour is deliberately not a
  key — rather than a deletion. With those fixtures added the once-invisible single mutation
  fails 5 of 17, so the same probe that proved the gap now proves it closed.
- **"Already fixed at the tip" does not establish that a report was stale.** A triage run
  against a tip that has already absorbed the report cannot detect the report: it reports
  _already fixed, no action needed_ whether the finding was genuine prior art or was live
  and provoked the very commit being cited back at it. Those two cases are indistinguishable
  from the triage side, and under parallel passes the second is the common one — so the
  author of a live finding is told their pass produced nothing. Date the evidence before
  trusting it:

  ```bash
  git log -1 --format=%ad --date=iso <cited-fix-sha>
  ```

  A commit offered as proof that a report predates it, yet timestamped _after_ that report,
  was caused by it. Corroborate with `git show --stat <sha>`, which should land on the files
  the report named — timing alone can coincide, timing plus overlapping files does not. Read
  its message too: a fix written from a report tends to paraphrase the finding, and that is
  the one corroborator a bundled commit cannot fake by touching a file for another reason.

  Dates only order two commits. Whether the fix was in the tree the reporter actually read
  is a question about ancestry, so ask it directly:

  ```bash
  git merge-base --is-ancestor <cited-fix-sha> <reviewed-base-sha>
  ```

  A negative answer invalidates the reasoning, not automatically the conclusion, and the two
  need separating before anything is withdrawn. Where the verdict also carries a measurement
  of its own taken at the tip — a bare linter run, a probe, a grep of the shipped text — the
  citation was decoration and the technical call still stands on the measurement. Where the
  citation _was_ the verdict, nothing was ever measured and the finding has to be retested
  from scratch. Sweeping the back-catalogue and retracting every hit alike would trade a set
  of unfounded dismissals for a set of equally unfounded reversals.

  Aim the check at what the verdict asserted, rather than at the bare fact that it names a
  commit. A note phrased as _"the sibling's finding and its fix"_ has already placed that
  fix after the report, so a positive trigger corroborates the reading instead of upsetting
  it — I flagged one of my own rows as unsound on the trigger alone and had to reverse that
  within the hour. Only a claim of staleness is falsified here; nothing wider.

  A silent commit message is likewise not evidence of prior art. Some fixes arrive from
  neither direction: work aimed at something else can sweep up the reported line as
  collateral, leaving a finding that was live when filed, resolved before triage, and never
  once addressed on purpose. Reach for that reading when ancestry puts the fix later but
  nothing in it acknowledges the report.

- **Equal sizes are not identity, and a bundle figure needs its compression level _and_ its
  build variant.** Hash instead.
