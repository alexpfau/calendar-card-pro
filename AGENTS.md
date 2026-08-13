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

| Command                | Output                          | Element name            | Logging |
| ---------------------- | ------------------------------- | ----------------------- | ------- |
| `npm run dev`          | `dist/calendar-card-pro-dev.js` | `calendar-card-pro-dev` | verbose |
| `npm run build`        | `dist/calendar-card-pro.js`     | `calendar-card-pro`     | silent  |
| `npm run lint`         | — (eslint, `--fix`)             |                         |         |
| `npm run format`       | — (prettier, `--write`)         |                         |         |
| `npm test`             | — (vitest, single run)          |                         |         |
| `npm run check:i18n`   | — (translation wiring check)    |                         |         |
| `npm run check:docs`   | — (docs/config parity check)    |                         |         |
| `npm run check:bundle` | — (emitted-file check)          |                         |         |

Three further scripts build the documentation site (see _Documenting a change_):
`docs:dev` (dev server), `docs:build` (static build into `docs/.vitepress/dist/`, the
command Cloudflare runs), and `docs:preview` (serve the built output).

**The card ships as two files.** `rollup.config.mjs` exports an **array of two configs**,
so each build emits the name in the table above plus an `editor.js` (`editor-dev.js`)
beside it, and the editor is fetched only when someone opens it — which keeps it and its
translations off every dashboard load. Both files are self-contained bundles with stable,
human-readable names. `hacs.json` names the card and needs no change; HACS downloads every
asset attached to a release, and `filename` only selects which one becomes the Lovelace
resource. Three consequences worth holding on to: **neither file may import the other**,
**every emitted file must sit directly in `dist/`** because HACS fetches no
subdirectories, and **`import.meta` must survive into the output** (below). `npm run
check:bundle` enforces all three.

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
npm test
npm run check:i18n
npm run check:docs
npm run build
npm run check:bundle   # after the build — it reads dist/
```

Those seven are every npm gate CI runs, so a green local run should mean a green PR.
`check:docs` is the one that
surprises people: it is described under _Documenting a change_ below, which makes it look like a
docs-only concern, but it gates **every** PR and it validates the design docs in
`docs/development/` as well as the user-facing site. A change touching no `src/` file at all can
still fail it. Adding a config option without a reference-table row fails it too — which is the
point.

Two things to know before trusting it. `tests/list-dom.test.ts` snapshots serialized DOM, so
an intentional markup change means **reading** the snapshot diff and committing it, not
deleting the file. And the suite is built from **default config**, which means an option
defaulting to `false` renders nothing and is invisible to it unless a test sets it — four
branches were missed that way, including two the suite existed to protect. When you add a
config option, add a test that turns it on.

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
uses it at `leaves.ts:122` on the weather badge, added after `npm run format`
reintroduced the exact spaces a fix had just removed and turned five tests red. If you
find that directive and wonder whether it is still needed, it is — delete it and run
`npm test`.

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
  ls src/translations/languages/*.json | wc -l          # total languages
  ls src/rendering/editor/translations/*.json | wc -l   # editor languages
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

## Docs site deployment

<https://calendar-card-pro.alexpfau.com> is a Cloudflare **Workers Build**, configured in
the Cloudflare dashboard rather than in a workflow file. It runs `vitepress build docs`
and serves `docs/.vitepress/dist` as static assets.

- **It builds only on push to `main`.** Pushing to `dev` produces no Workers check run at
  all, so nothing on `dev` is ever live. **Merging the `dev` → `main` PR _is_ the deploy** —
  there is no separate publish step and no tag involved.
- `wrangler.jsonc` defines the Worker: no `main` script, `assets.directory` pointing at the
  VitePress output, and the custom domain declared as a route so the hostname binding stays
  in version control.
- The Node version is pinned by **both `.nvmrc` and `.node-version`** (kept in sync), and
  `ci.yml` reads `.nvmrc` via `node-version-file` so CI and the deploy run the same runtime.
  Keep it that way. When they drifted — CI on Node 24, the build image on Node 22 — npm 11
  in CI accepted a `package-lock.json` that npm 10 on the build image rejected with
  `EUSAGE … Missing: esbuild@… from lock file`. CI was green on every PR while the deploy
  failed and the site quietly served stale content.
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

   These files are reachable **only** from `src/rendering/editor/`, so they are built into
   `editor.js` rather than loaded on every dashboard load, and they may not go back into
   `languages/`. A new file also needs an `import` **and** an `EDITOR_LANGUAGE_STRINGS`
   entry in `translations/index.ts`, under a lowercase key naming a language that already
   exists — a file nothing imports is silently never registered.

   🚨 **`src/translations/editor-languages/` is not this directory.** It is an archive of
   the editor replaced in v4, kept as mining material for backlog E10. Its keys overlap
   the live ones **by name without matching in meaning** — measured, 94 keys are spelled
   the same and only 53 still carry the same English, with `language` and `language_mode`
   holding each other's meanings. It was consulted at runtime until v4, behind the English
   table that defines every key, so it resolved nothing while costing 145 KB of
   `editor.js`; that is why the editor now reads exactly one namespace and `check:i18n`
   fails if anything in `src/` imports the archive. Mine it by **English text**, never by
   key name.

3. `src/translations/localize.ts` — the `import` **and** an entry in the `TRANSLATIONS`
   map. **The map key must be lowercase** (`'en-gb'`, `'zh-cn'`), because lookups
   lowercase the configured value before matching.
4. `src/translations/dayjs.ts` — **two separate edits**, both required:
   - `import 'dayjs/locale/<code>';`
   - add the base code to the `supportedLocales` array inside `mapLocale()`
5. `docs/contributing.md` — the supported-languages list **and the three hardcoded counts**
   (see _Documenting a change_). The counts are prose, so nothing fails when they
   are wrong; they drifted for three releases before anyone noticed.

Omitting the `supportedLocales` entry (4b) is a **silent failure**: the language works
everywhere except relative times, which quietly fall back to English. Catalan and
Romanian shipped broken this way for months. If you add a locale import, add the array
entry in the same edit.

`npm run check:i18n` catches every one of these wiring mistakes mechanically, including
that one, and runs in CI. Run it before you claim a language is done — but note it
verifies **wiring**, not translation quality, and it cannot tell you whether
`pēc 2 dienām` is correct Latvian.

Regional variants usually need no `dayjs.ts` change at all, because `mapLocale()`
reduces them to their base code (`en-gb` → `en`). Only `zh-cn` / `zh-tw` are
special-cased.

Verify a language change by actually resolving it, not by reading the diff:

```ts
getEffectiveLanguage('lv', undefined); // -> 'lv'
getRelativeTimeString(futureDate, 'lv'); // -> 'pēc 2 dienām', not 'in 2 days'
```

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

`npm run check:i18n` reconciles `strings.ts` against the fields the schemas reference, in
both directions, by importing the schema modules. A new field with no string fails it.

## Style

- Strict TypeScript; keep it strict.
- JSDoc on public functions.
- Run `npm run format` (prettier) before committing; `npm run lint` uses `--fix`.
- Match the existing module layout: `config/`, `interaction/`, `rendering/`,
  `translations/`, `utils/`.

**Comment the stylesheets as freely as the TypeScript.** A `css` tagged template's contents
are a string literal, so no minifier looks inside one — comments there used to ship to every
user, and 65% of the stylesheet was comment. That is fixed at build time by the
`strip-css-comments` plugin in `rollup.config.mjs`, which removes them from both
`rendering/styles.ts` and `rendering/editor/styles.ts` and cost 29,264 raw / 10,879 gzip
bytes off the eager path when it landed.

This is worth stating because the alternative is worse than it looks: without knowing the
plugin exists, the reasonable move is to keep CSS comments terse, and the reasoning in
`styles.ts` is exactly where terse comments have already cost this project twice. Write the
explanation. It does not ship.

## Reference

- [`docs/architecture.md`](./docs/architecture.md) — module responsibilities, data flow,
  caching and performance design. Read before making structural changes.
- [`docs/development/column-view.md`](./docs/development/column-view.md) — short current-state
  specification for the column view (`view: 'column'`, targeting v4.0.0). Its companion
  archive, `docs/development/column-view-rationale.md`, holds the rejected alternatives and
  revision history.
  Read before touching the rendering pipeline, the view dispatch, or any view-dependent
  config key, so in-flight work stays compatible with it.
- [`docs/development/editor-rebuild.md`](./docs/development/editor-rebuild.md) — the design
  and staging for the schema-driven editor that replaces the hand-rolled one in v4. Read
  before touching anything under `src/rendering/editor/`. Its status banner records which
  parts the maintainer has superseded and which claims implementation has corrected — read
  that first, not the body.
- [`docs/development/v4-backlog.md`](./docs/development/v4-backlog.md) — the index of every
  open item for v4, including the ones no specification owns. **Read it before starting a
  stage and add to it when review turns something up**; it exists because findings kept
  living only in a chat thread, which is not a place work survives.

These documents lean hard on the word _verified_ — it appears over a hundred times across
them — so it is worth saying what it has to mean. **A claim that no available case could
have falsified has not been verified; it has been untested**, and "verified, not assumed" is
the label most likely to end up attached to exactly that. The worked example is the Prettier
claim above: every template in the tree at the time round-tripped through `npm run format`
unchanged, so the check passed honestly and the proposition was untestable — the only case
that breaks it did not exist until v4 work created it. The author was not careless; the
claim was unfalsifiable.

So when writing one: say **how** you checked, and prefer a claim that ships with its own
falsifier. _"Delete `leaves.ts:122` and run `npm test`"_ cannot go quietly stale the way
_"prettier does not reformat templates"_ did, because anyone who doubts it can settle it in
thirty seconds.

There is a sharper trap inside that, because a measurement can be precise, honest, and
still incapable of contradicting you. **A metric derived from the fix's own hypothesis
cannot falsify that hypothesis.** The weather-overflow fix is the worked example: the bug
was believed to be _overhang_, so overhang was what got measured, and three successive
versions each drove it down — 113.3px, then 26.6px, then −0.8px — while the row was still
visibly broken. At −0.8px nothing overflowed at all and the browser was severing every chip
mid-token (`30°` / `UV` / `7 · Sonni` / `g`), which is the _same_ defect the maintainer
originally reported. The number confirmed the belief by construction, and only an
observation from outside that frame — a screenshot taken after the number already looked
finished — broke it.

The safeguard is not "measure more carefully", it is **look at the artefact once with the
metric switched off**, and then encode the outside-the-frame observation so it cannot be
lost. `tests/stylesheet.test.ts` does that at the level it can reach — it is a unit test
over the stylesheet source, so it pins the declaration (`content: '\200B'`) rather than the
rendered line boxes, under the name _"gives the browser somewhere legal to break between
chips"_, with the measured failure it prevents written above it. Deleting that declaration
turns it red. Two independent instances landed the same day: the same review then wrote a
chip-integrity probe that reported a confident `FAIL` twice — once counting a zero-width
space's own client rect as a line break, once counting _correct_ word-boundary wrapping as
damage. A probe that cannot tell the good case from the bad one is not evidence in either
direction.

The same day produced the companion rule, from the other direction: **pick the example most
likely to break the claim, not the one most likely to represent it.** A test of the weather
language mapping caught a real error — that `toHaLanguage` is correct but unreachable for
codes outside the card's 35, because `getEffectiveLanguage` resolves them away first — only
because it used `pt-br`. The representative choice, `nl`, would have passed on the spot and
shipped the untested claim. Both of that day's genuine catches were credited by their own
authors to luck rather than method, and neither was — but they are **two disciplines, and
they want applying separately**. This one is about _which case you pick before you look_;
the paragraph above is about _whether you look again once the result already reads as
correct_. Neither substitutes for the other: input selection would not have caught the
overflow, because the number looked finished whatever the input, and a second look would not
have caught the mapping error, because the representative input passes cleanly every time.
All they share is that both feel like luck afterwards, and neither is.

There is a **third** failure mode neither discipline reaches, and it is the one that needs
another person. A probe can be correct, correctly configured, honestly reported — and
measuring the wrong thing. Two instances, both from the editor-localization work: a
term-agreement check that case-folded both sides, so a disagreement that was _purely_
capitalisation read as agreement, in the one language whose capitalisation was most wrong;
and a translation-oracle probe that read Home Assistant's core string table while the
vocabulary it needed sat in the lazily-loaded `lovelace` fragment, taking the corpus from
1,889 keys to 7,341. Neither is caught by a self-test, because both reach a known string
fine. Neither is caught by stating the configuration, because both configurations were
stated. **The only thing that caught either was somebody deriving the same number a
different way** — which is why a figure worth relying on should say which corpus and which
method produced it, and why two routes agreeing is worth more than one route being careful.

**But a second person is not always required, and assuming so is expensive.** Where two of
your own measures have a *known relationship*, check that first — it needs no oracle, no
second derivation, and no idea what the right answer is. Measuring how many labels are
Title Case under two strengths of one rule, `EVERY non-initial word capitalised` must be a
subset of `ANY non-initial word capitalised`, so `EVERY ≤ ANY` always. A run reporting
`ANY=21, EVERY=22` is therefore wrong on its face, and it was: the two predicates had
silently drifted to different character classes, `/^[A-Z0-9]/` against `/^[A-Z]/`, so the
digit token in `"ISO 8601"` counted for one measure and not the other. Each predicate reads
as correct in isolation — the defect is that they were meant to be the same rule. Falsifier,
thirty seconds: give the two strengths one shared predicate and the violation disappears;
change one to `/^[A-Z0-9]/` and `"ISO 8601"` brings it back.

That is a different instrument from the three above rather than a fourth instance of them.
Those all needed a second derivation to surface; this one announced itself from a single
run, because the numbers had a relationship to violate. **Prefer measures that can
contradict each other**, and when a run produces several, spend the ten seconds asking what
must be true between them before asking whether any of them matches the world.

**Its domain is narrow, though, and this paragraph is the wrong lesson if that goes
unsaid.** It fires only when you already hold two numbers that *must* relate. Of the day's
defects it would have caught exactly one: the character class that named two absent glyphs
produced a plausible count, the case-folded oracle produced a plausible agreement rate, the
core-only corpus produced a plausible yield, and the mutation harness produced a plausible
pass. **Nothing internal contradicts any of them**, which is precisely why they needed a
second derivation. So reach for the invariant first because it is cheap, and do not let it
displace the expensive thing — one of five is a good return on ten seconds and a poor
substitute for somebody deriving the number a different way.

And when the check reads a source file, note which question you are asking. **Regex a file
for its _shape_ — which identifier is imported, how a map key is spelled — and import it for
its _values_.** `scripts/check-i18n.mjs` already works this way and says so: the wiring in
`localize.ts` and `dayjs.ts` is matched with patterns because importing them would evaluate
the shape away, while the editor's strings are imported outright "so there is no pattern to
go stale". Counting the keys in `EDITOR_STRINGS` is a question about values, and I answered
it with a regex and reported a number that was wrong by six. The rule existed and did not
fire, because the measurement happened in a shell one-liner rather than in the script that
states it — which is the more useful half of the lesson.

The split is not the whole guard, though, because not every question is shape or values.
**A pattern that finds nothing looks exactly like a fact that is not there.** This file's
own quotations are the demonstration: the sentence quoted above really is in
`check-i18n.mjs`, and a naive search for it says otherwise, because it wraps across two
lines of a block comment with a continuation marker landing in the middle of the phrase.

```bash
grep -c "no pattern to go stale" scripts/check-i18n.mjs              # 0  — reads as absent
perl -0pe 's/\n\s*\*\s*/ /g' scripts/check-i18n.mjs \
  | grep -c "no pattern to go stale"                                  # 1  — actually present
```

Note where the silence actually comes from: `grep` **exits 1** on no match, so a chain that
checks status catches this loudly. It is reading the _count_ that throws the signal away.
That is why the rule below is about the usage rather than the tool — the warning existed and
was discarded, which is a harder habit to see than a missing one.

That matters here more than in most repos: the files worth quoting are largely block-comment
prose, and a wrapped phrase is the common case rather than the exception. `check-i18n.mjs`
carries `assertFound()` for exactly this — it would rather fail loudly than report a clean
run over an empty set — but a shell one-liner has no such thing. So the sharper form of the
rule is **not "avoid regexes" but "do not run one where a zero match cannot announce
itself"**: flatten continuations before matching prose, and when a check finds nothing,
confirm the pattern can match something before believing the absence. more than in most repos: the files worth quoting are largely block-comment
prose, and a wrapped phrase is the common case rather than the exception. `check-i18n.mjs`
carries `assertFound()` for exactly this — it would rather fail loudly than report a clean
run over an empty set — but a shell one-liner has no such thing. So the sharper form of the
rule is **not "avoid regexes" but "do not run one where a zero match cannot announce
itself"**: flatten continuations before matching prose, and when a check finds nothing,
confirm the pattern can match something before believing the absence.
