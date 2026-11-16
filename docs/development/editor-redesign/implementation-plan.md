# Editor Redesign · Implementation Plan

Backlog item 307. This is the code-level plan for building the approved redesign of
the visual editor: an overview, then one page per section and per calendar entry, with Add Setting
rows, state in words, Undo and Redo, a card-built calendar list, Split This Calendar, a jump-list
search and the composed controls. The approved design is the recommended option of each of D01-D18
(★), built as designed. Two items are out of scope here and stay separate backlog items:
D14 B (a Text Scale card option; until it exists the editor ships D14 C, each size on its part's
page, gathered by searching "font size" with Edit Here) and D15 B (Pick From Preview).

**Status.** Revision 3, rebaselined on `feature/editor-redesign` at `9a1253b3`, whose tree equals
dev's `3b0a50ea`: v5.3.0 with #834 (search opens what it finds, Essentials Only keeps what the card
sets, search aliases), #835 (the v5.3 media pass) and the release preparation. It resolves every
finding of two blind reviews of the first revision and of their re-review of the second; Appendix
C maps each finding to the section that answers it. Where a revision departed from the approved
design, this one follows the design; the few wording and focus differences that remain are decided
in section 13. Sections 4 to 6 were written before the PRs that build them; where a PR departed
from them, its as-built note in section 6 and its PR body say how.

**Where the build stands.** Every layer is built, and none has reached `dev`. Three are merged
into `feature/editor-redesign`: PR 1 (#838), PR 2 (#841) and PR 9 (#846). The rest are open pull
requests into `feature/editor-redesign`, stacked, each on the layer below it: PR 3 (#842), PR 4
(#847), PR 5 (#849), PR 6 (#851), PR 7 (#850), PR 8 (#852), PR 10 (#854), PR 11 (#853), PR 12
(#856), PR 13 (#855), PR 14 (#848), PR 15 (#857), PR 16 (#860), PR 17 (#861), PR 18 (#858) and PR
19 (#859), then PR 20 (#862, translations) and PR 21 (#863, docs, accessibility and media), which
merges #862 in and is the top of the stack. Each open PR awaits the maintainer's decision on its
byte budget: several measured above the caps in section 6, and nothing here implies those figures,
or section 10's estimate, are accepted. The editor chunk at the top of the stack is 970,570 B raw
and 282,976 B gzip -9 (production build, Node 24), against 592,390 B and 182,013 B at `9a1253b3`;
the card's sha256 was unchanged through PR 21 and changes only with PR 12's tie order (its as-built
note). This file is
working state: it lives on the feature branch and is deleted, with the rest of
`docs/development/editor-redesign/`, before the one pull request into `dev` (AGENTS.md,
_Documenting a change_), which opens only on the maintainer's decision.

**How claims are marked.** Every statement about today's code names a file and a symbol, never a
line number. A claim marked **[read]** was read in source, at `9a1253b3` where it touches what #834
changed and at `c50573c5` elsewhere, the two trees being identical outside #834, #835 and the
version bump. **[probe]** means an in-memory probe ran it on Node 24.22.2, at the commit section 2
names; the probes are kept outside the repository in the design session's folder
(`files/p6-probes/`, beside the design package) and wrote nothing into the worktree. **[measured]**
means measured in Home Assistant's real edit-card dialog by the step 0 probe (`spike/ha-probe.md` in
the session folder: Home Assistant 2026.11.1, Chromium 151 at 1440 × 900, read-only, dashboard hash
unchanged); the section of that report is named. **[design]** points at the approved design package.
**[unverified]** is a claim nobody has tested yet; each one names where it gets tested.

**The design package** (the design session's folder, `files/`): `ia/ia-final.md` (the approved
structure), `decisions.md` (D01-D18), `ia/candidate-A-overview-pages.md` (the base design; ia-final
wins where they differ), `phase5-proposal.md`, the reviews, `applicability.md` (R1-R61),
`inventory/editor-inventory.json` (every field with its id), the decision mockups and their
manifests (`mockups/dNN-*/`), the clickable prototype `mockups/prototype/` (the behavioral spec
where text is silent), the step 0 probe of Home Assistant's dialog (`spike/ha-probe.md`), the two
reviews of this plan's first revision (`reviews/plan-review-design.md`,
`reviews/plan-review-engineering.md`) and their re-review of the second
(`reviews/plan-rereview.md`).

## Contents

1. [Ground Rules](#1-ground-rules)
2. [Baseline at 9a1253b3](#2-baseline-at-9a1253b3)
3. [Architecture](#3-architecture)
4. [Modules](#4-modules)
5. [Behavior](#5-behavior)
6. [Pull Requests](#6-pull-requests)
7. [Tests](#7-tests)
8. [Strings and Translations](#8-strings-and-translations)
9. [Docs and Media](#9-docs-and-media)
10. [Bytes](#10-bytes)
11. [Risks](#11-risks)
12. [Decisions This Plan Makes](#12-decisions-this-plan-makes)
13. [Findings](#13-findings)
14. [Appendix A · Page Registry Seed](#appendix-a--page-registry-seed)
15. [Appendix B · Gates](#appendix-b--gates)
16. [Appendix C · Review Findings and Where They Are Resolved](#appendix-c--review-findings-and-where-they-are-resolved)

## 1. Ground Rules

- **Branch flow.** Every PR below targets `feature/editor-redesign`. Before opening one, bring the
  feature branch level with `dev` through a sync PR whenever `dev` has moved, as #833 did for #832
  and #836 for #834, #835 and v5.3.0. After each sync, the next PR rebaselines section 2's sizes.
  When step 6 is done: delete `docs/development/editor-redesign/`, prove it gone with
  `git diff --name-only origin/dev...HEAD | grep '^docs/development/'` (no output passes), and open
  the single PR from `feature/editor-redesign` into `dev`.
- **Fetch first.** Every comparison against `origin/…` follows a `git fetch origin` (AGENTS.md:
  the fetch is the load-bearing half). The stray local ref with a space in its name that broke
  fetching here during the second revision is gone; `git fetch --dry-run --verbose origin` reports
  every branch up to date.
- **The gates.** Every PR runs the nine npm gates from AGENTS.md on the Node in `.nvmrc`
  (`npx tsc --noEmit`, `npm run lint`, `npm run check:format`, `npm test`, `npm run check:i18n`,
  `npm run check:docs`, `npm run docs:build`, `npm run build`, `npm run check:bundle`), after
  `npm ci` in a fresh worktree. Never `vitest -u`; the editor has no DOM snapshots today, and none of
  the tests below adds one.
- **What may not change.** No config key is added, renamed or removed. The card's behavior and its
  chunk do not change: every PR builds both chunks at its base and its head and shows the card's
  sha256 unchanged. A synthetic form field is not a config key (`synthetic.ts` › `isSyntheticKey`
  keeps it out of every write) and is allowed. Existing YAML keeps working at the config-object
  level; write minimization and authored-default preservation stay exactly as `value.ts` ›
  `toStoredConfig` does them; unknown keys survive.
- **Faithful to the design.** Where this plan and an approved text differ (ia-final, a ★ decision,
  candidate A, a mockup or the prototype), the approved text is built unless the difference is
  decided in section 13, _Differences From the Approved Design, Decided_, which gives each one's
  approved text, the plan's, the reason and the outcome. A later refinement of wording is decided in
  the PR that makes it and recorded in section 12; a difference beyond wording is decided in section
  13 before the PR that builds it. Choices the design left open are section 12's. Nothing approved
  is trimmed to meet a byte budget; the size is settled in section 10, and the per-PR caps guard it.
- **People and products.** Examples, fixtures and PR text use invented people only (Anna, Ben, Leo,
  Bin Day, Family). No third-party Home Assistant card is named anywhere (Check 33 scans every
  tracked file).
- **Every PR description carries** the editor chunk's byte delta (raw, sha256, gzip -9 through
  `node:zlib` on Node 24, section 10), the English string delta (keys added, changed, retired), the
  tests added or changed with the reason, and the live review script from section 6.
- **Review live.** Each PR is reviewed on a live Home Assistant with the dev build
  (`calendar-card-pro-dev` beside the HACS release; the `calendar-card-pro-deploy` skill deploys it).
  The script in each PR names the dashboard state to start from and what to tap.

## 2. Baseline at 9a1253b3

`feature/editor-redesign` at `9a1253b3`, whose tree equals dev's `3b0a50ea` (v5.3.0). Sizes and
test counts below were taken there. The probes of fields, gates, routing, lifting and identity ran
at `c50573c5` and carry over unchanged: what moved since (#834, #835 and the version bump) touches
`filter.ts`, `localize.ts`, the filter context and empty-state message in `element.ts`,
`stories.ts`, `strings.ts` and the translations, and no builder, routing, synthetic, entity or gate
input [read: `git diff c50573c5 9a1253b3`].

| Fact                                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | How known                                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distinct fields                                       | 223: 190 card fields from the nine `PANELS` builders, 29 per calendar, 4 per toolbar button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [probe] walking every built schema by data path over 23 config variants, three displays and four workspaces reproduced the inventory's 223 ids                                                                        |
| Field id                                              | `<panel id>:<data path>.<name>` (`events:show_time`, `layout:time_grid.start_time`, `weather:weather.date.color`), `calendar:<name>`, `button:<name>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [read] the inventory generator's `itemId`; [probe] the same ids come out of `panels.ts` › `walkSchema`                                                                                                                |
| Card fields applicable per workspace                  | All Layouts 152, List 159, Columns 158, Grid 157                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [probe] the gate corpus of Appendix B, applied as user edits through `routing.ts` › `applyWorkspaceChange`, then `filter.ts` › `withholdInertFields`                                                                  |
| The first revision's universe was short               | Raw top-level variants reached only Columns 157 and Grid 150: a top-level value never reaches a layout that defaults the option differently, so Grid's six location fields and `show_empty_today` (Grid, Columns) never opened                                                                                                                                                                                                                                                                                                                                                                                                                     | [probe] both corpora compared per workspace. The universe therefore comes from routed edits (section 3.1)                                                                                                             |
| Candidate A's page map                                | Places all 223 ids exactly once: essential 48, mode value ("With") 19, Add 134, family 18, button rows 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [probe] parsed from candidate A §4 and checked against the inventory                                                                                                                                                  |
| A field lifted into its own form                      | Routes exactly as inside its panel: 1,205 field, workspace and config combinations, 0 differences; the control without the data-path wrapper gives 188                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [probe] `routing.ts` › `applyWorkspaceChange` with the panel-wide frame against a one-field frame, compared after `value.ts` › `toStoredConfig`. The engineering review repeated it over 8,931                        |
| Builder node identity                                 | 88 of 101 leaves (All Layouts, toolbar on) are the same objects on identical input and after an unrelated edit; Card & Header (12) and Calendars (1) allocate fresh leaves on every call; all 101 stay structurally equal after an unrelated edit                                                                                                                                                                                                                                                                                                                                                                                                  | [probe] two builds with identical input, and a third after changing `title`                                                                                                                                           |
| Applicable fields per page, fresh List card           | Overview 3, Which Events 12, Card & Header 6, Day Header 23, Events 35, Size & Spacing 11, Weather 1, Taps & Refresh 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [probe] candidate A's map over the built ids                                                                                                                                                                          |
| Same, every feature switched on (List / Grid)         | Events 49 / 37, Day Header 27 / 29, Weather 19, Card & Header 13, Size & Spacing 11 / 16, Grid page 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [probe] features switched on through routing, so Grid's own block holds them; the first revision's 32 for Grid's Events missed the six location fields                                                                |
| Essential plus mode-value fields per page, fresh card | Events 7, Day Header 4, Which Events 3, Taps & Refresh 3, Card & Header 2, Size & Spacing 1, Weather 1, Grid 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [probe]                                                                                                                                                                                                               |
| Gates                                                 | 32 conjunctive gates and one either-or gate; 2,415 open-and-close checks across 4 workspaces × 3 displays, 0 failures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [probe] Appendix B. Three single patches of the first revision fail: the two UV thresholds everywhere, Countries To Remove in Grid                                                                                    |
| Card chunk                                            | 644,219 B raw, sha256 `fbce536bd288…`, 179,355 B gzip -9, 180,087 B gzip -6 (v5.3.0; at `c50573c5` the same size, sha256 `cda4340b6149…`: only the stamped version differs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [probe] in-memory production build at `9a1253b3`, `node:zlib` on Node 24.22.2                                                                                                                                         |
| Editor chunk                                          | 592,390 B raw, sha256 `0f099fc6f0d4…`, 182,013 B gzip -9, 182,225 B gzip -6; since `c50573c5` (584,574 B raw, 179,311 B gzip -9) +7,816 B raw and +2,702 B gzip -9: #834 +7,780 B raw at its merge commit `2ca4fc6b` (its body quotes +7,566 B at its head), #835's story edits +36 B                                                                                                                                                                                                                                                                                                                                                              | [probe] as above, at all three commits. ia-final's 177,874 B was Apple gzip on Node 25 at an earlier tree: not comparable                                                                                             |
| Lit `cache`                                           | +653 B raw, +283 B gzip -9 in the editor chunk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [probe]                                                                                                                                                                                                               |
| Anything imported from `src/utils/events.ts`          | About +30 KB raw, +9 KB gzip -9 (`getTimeWindow` alone +9,166 B; `filterEventsForEntity`, exported in memory only, +8,923 B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [probe] at `c50573c5`. Split's review mirrors what it needs on the card's small utilities instead (section 5.7)                                                                                                       |
| Split's review list, sketched                         | +4,664 B raw, +1,819 B gzip -9: a REST read with a timeout; the card's own window for the displayed layout; the per-entry eligibility the card applies; the rows a split or Grid draws; assignment to parts; day and time formatting. Its imports of `start-date.ts`, four `format.ts` helpers and `resolveEffectiveConfig` are 227 B of that                                                                                                                                                                                                                                                                                                      | [probe] a realistic sketch appended to the production editor entry at `9a1253b3`; its template and strings are extra. It agrees with the card's own pipeline on all 1,008 configurations of section 5.7 in four zones |
| One translated string                                 | 133.5 B gzip -9 for the string in every language: 30.5 B for English, 102.9 B for its translations (nine full files, Korean and en-GB at their coverage)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [probe] at `c50573c5`: a batch of 100 real strings, stratified by English length to match the new ones (mean 36.4 characters), removed in memory from a production build; the control build reproduced `ad39f0471a61` |
| Test suite                                            | 505 files, 13,016 passed, 27 skipped (13,043), 31.9 s. #834's body counts 13,013 at its head; #835 added three                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `npx vitest run` at `9a1253b3` on Node 24.22.2                                                                                                                                                                        |
| Editor tests that mount the element                   | 39 `tests/editor-*` files. 28 mount the real editor and 23 of those query its `ha-form` elements: the engineering review's 27 and 22 at `c50573c5`, plus #834's `tests/editor-search-opens-groups.test.ts`, which does both. #834's `tests/editor-search-aliases.test.ts` mounts nothing; `tests/editor-adoption.test.ts` registers stand-ins                                                                                                                                                                                                                                                                                                      | [read] by grep, the review's count carried forward by the one file that moved                                                                                                                                         |
| Literal-key scan in `check:i18n`                      | Sees `t('…')` and `lookup(lang, '…')`, not `this._string(ctx, '…')`, so a mistyped chassis key renders humanized with every gate green; #834 left it as it was                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [read] `scripts/check-i18n.mjs` › `checkEditorKeysUsedInCode` › `PATTERNS`, at `9a1253b3`. PR 1 closes it                                                                                                             |
| Documented sizes                                      | `docs/guide/installation.md` states the editor at 592 KB raw (exact) and 181 KB gzip (±1 KB) since #834; any PR crossing a kilobyte must change the sentence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [read] `scripts/check-bundle.mjs` › `DOC_SIZES`, `checkDocumentedSizes`                                                                                                                                               |
| Frozen anchors into `docs/features/editor.md`         | `#quick-setup`, `#essentials-only`, `#options-the-card-ignores`, `#view-exceptions`, `#options-for-the-selected-view`, `#per-calendar-panels-actions`, `#search-customized-only`; v5.3.0's notes link `#essentials-only` and `#search-customized-only` once more, and add none                                                                                                                                                                                                                                                                                                                                                                     | [read] linked from `README.md`, `docs/guide/whats-new.md` and `docs/RELEASE_NOTES.md` at `9a1253b3`, which a feature PR may not edit                                                                                  |
| Today's search and filters since #834                 | A field is also found by its `<label key>.aliases` string, never shown and resolved like its label (`localize.ts` › `computeAliases`): ten keys in nine families, in all nine full languages; `check:i18n` holds each to a key a searched field resolves and exempts aliases from the label rules and the glossary. Essentials Only keeps the essentials plus what the stored YAML holds (`filter.ts` › `FilterCtx.stored`, `isStored`, `isSetByCard`), and its "None of the essential settings is customized" message is retired. A search or Customized Only opens every collapsible group it keeps (`filter.ts` › `openMatches`, `filterNodes`) | [read] #834 at `9a1253b3`; `tests/editor-search-aliases.test.ts` pins the alias families by value                                                                                                                     |
| Editor strings                                        | 699 English keys (ten of them aliases); the nine full languages at 699 each, Korean at 487, en-GB's delta at 68                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [probe] at `9a1253b3`                                                                                                                                                                                                 |
| Home Assistant elements the editor names              | `ha-form`, `ha-expansion-panel`, `ha-svg-icon`, and `ha-card-conditions-editor` behind `element.ts` › `conditionsEditorDefined`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [read] `element.ts`                                                                                                                                                                                                   |
| Field kinds (selectors) among the 223                 | text 94 (incl. one date, one time), boolean 49, dropdown select 42, number 26, `ui_action` 5, icon 3, entity 3, object 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [probe] the inventory's `controls`                                                                                                                                                                                    |
| Today's editor in Home Assistant, every panel closed  | 124 `ha-form`s (121 inside closed panels) and 284 selectors mounted; about 20 ms of main thread per re-render                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [measured] `spike/ha-probe.md` §5                                                                                                                                                                                     |
| New `hass` objects while the dialog sits idle         | 22 and 36 per 10 s; a bare `requestUpdate()` costs the same as a new `hass` (21.0 ms against 20.4-21.2 ms) because every render hands the forms new objects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [measured] §5                                                                                                                                                                                                         |
| One form of 40 fields against 40 one-field forms      | No measurable difference: mount about 25-28 ms, a new `hass` about 1.4 ms, either shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [measured] §5                                                                                                                                                                                                         |
| Labels and helpers through `ha-form`                  | `computeLabel` is the accessible name for every selector but box-mode select; `computeHelper` is the description only for text and number                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [measured] §3; details in section 5.3                                                                                                                                                                                 |
| Escape and Back in the dialog                         | An editor `keydown` listener keeps the dialog open only with both `preventDefault()` and `stopPropagation()`; HA's pickers consume their own Escape; Back closes the dialog                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [measured] §1, §2, §6                                                                                                                                                                                                 |
| What the dialog probe did not cover                   | Narrow widths (pickers as bottom sheets, which scroll container scrolls), WebKit, the Companion apps, screen readers by ear, a dirty dialog                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [measured] the report's _Not Measured_; each is checked in a PR below                                                                                                                                                 |

## 3. Architecture

### 3.1 The Page Model: Pages Compose Built Fields by Id

**Decision.** Keep the nine `PANELS` builders as the field registry and the authority on presence
(their gating decides whether a field exists for a configuration and workspace). Add a page
registry, `pages.ts`, that places each field id under a page heading with an appearance (essential,
Add, mode value, family member, chip, button row). Pages are composed at render time from the
built fields, looked up by id. Nothing is re-cut.

**How a page is built.**

1. `_ctx` is computed as today (`element.ts` › `CalendarCardProEditor._ctx`), plus one input:
   `presentation`, the mode choices held in pending text (section 3.9).
2. `field-index.ts` › `buildFieldIndex(ctx)` runs every builder, applies
   `filter.ts` › `withholdInertFields(schema, workspace)`, walks the result with
   `panels.ts` › `walkSchema` and records each leaf by id with its `node`, `dataPath` and
   `labelPath`. This is the **present** set: what exists for this configuration and workspace.
3. `field-index.ts` › `universeIndex(language, workspace)` builds the same index over the **gate
   corpus** (`gate-probes.ts`, Appendix B): for every display, the fresh card and every gate opened,
   each reached by applying the gate's opening edits through `routing.ts` › `applyWorkspaceChange`
   exactly as a user would, so Grid's and Columns' own blocks hold what they default differently. A
   field in the universe but not present is **gated**; a field outside the universe for this
   workspace belongs to **another layout**. The corpus lands in PR 1 with the index that needs it
   (the first revision put it in a later PR than its first consumer).
4. Each field is **lifted**: its node re-wrapped in named grids for its data path
   (`[{ type: 'grid', name: 'time_grid', column_min_width: '100%', schema: [node] }]`), which nests
   its data exactly as `schemas/common.ts` › `blockScope` does today. Its original label path is bound
   into its own `computeLabel` and `computeHelper`, so every string key stays what it is today
   (`date.show_conditions`, `time_grid.start_time`, `entity.event_type`). [probe] lifting routes
   identically (section 2).
5. The page registry orders the lifted fields under its headings; `plan.ts` (step 3) decides which
   are live controls, which go into Add rows and which into gate lines.

**Why not re-cut the builders into page builders.** Their branches hold the gates; re-cutting them
rewrites every gate's code path, changes label paths and with them string keys in twelve languages,
and invalidates most of `tests/editor-schema.test.ts` and `tests/editor-layout-structure.test.ts`,
while the 223-field placement would still need proving. **Why not a plain second list.** A list
beside the code drifts (AGENTS.md, _Proximity is not reach_). The registry is therefore reconciled
against the builders in both directions, by a test that cannot pass on a stale list:

- **`tests/editor-page-registry.test.ts`** builds every panel under every workspace over the whole
  gate corpus, walks the leaves and asserts: every built id is placed on exactly one page (or the
  overview, or an entry group); every registry id is built under at least one workspace and corpus
  state; every mode value names a mode control on the same page; every family member sits under its
  family heading; every heading key, page title and alias key resolves in `strings.ts`; no built
  node uses `select.mode: 'box'` (section 5.3). It prints its denominators beside the verdicts (ids
  walked, corpus states, workspaces), so a short walk fails loudly. The falsifiers it must catch,
  planted once by hand when it is written: delete one registry line (fails "built but unplaced"); add
  a field to a builder (fails the same); place one id twice (fails "placed twice"); drop one gate's
  opening edits from the corpus (fails "registry id never built").

### 3.2 Builders Keep Presence, Pages Own Presentation

Once pages render their own headings (PR 5), the builders' `heading()` nodes, `group()` and
`nested()` expandables and `row()` grids render nowhere, yet `check:i18n` still walks them, so their
strings would stay "reachable" while nothing shows them. PR 6 strips presentation from the
builders: headings and rows go, flatten groups unwrap, and the three data-nesting expandables
(`schemas/weather.ts` › `nested` for `date` and `event`, `schemas/layout.ts` › `densityGroup`) become
`blockScope`-style named grids that stamp the same `titleKey` they resolve today. After that a
string is reachable only if a page, a field, an option or a declared table names it, and
`check:i18n` reports the orphans for deletion from `strings.ts` and every translation file in the
same PR. Headings must be card-owned elements in any case: a `constant` node is not exposed as a
heading to assistive technology ([measured] §3).

Comparing outer DOM before and after cannot prove PR 6 harmless, because `ha-form` is an unknown
element in happy-dom and its properties never reach the serialized DOM. The proof compares what each
form is handed (section 6, PR 6).

### 3.3 One `ha-form` per Field on the Open Page

**Decision.** Every field on the open page gets its own `<ha-form>` holding its lifted schema,
wrapped in a card-owned `<div class="field" data-field="<id>" tabindex="-1" role="group"
aria-label="<label>">` that also holds its Reset or Remove button and its state line. This is r6
option 6E. It gives what one form per page cannot: a `value-changed` per field (undo labels and
coalescing), a focus target per field, a highlight target, a reset button beside the field, and
spacing under the editor's control.

**Identity: cache on builder inputs, then intern by structure.** Every property handed to a
per-field form stays `===` across renders unless its value changed. Two mechanisms, because one is
not enough ([probe] section 2):

1. **Builder output cached on its inputs.** `field-index.ts` memoizes each panel's `build` on the
   inputs it reads: language, workspace, view, `presentation`, and the identities of the merged and
   raw configuration. A render in which none of them changed (a bare `requestUpdate()`, a `hass`
   that changes nothing the editor draws) reuses every node, schema and lifted wrapper.
2. **Lifted schemas interned by structure.** After a real write the inputs have changed, and the
   Card & Header and Calendars builders hand back fresh leaves for unchanged fields (13 per call with
   the toolbar on). So `liftField` keeps, per field id, the last lifted schema with a structural key
   of its node (a stable serialization: sorted keys, option lists in order), and returns the stored
   object while the key matches. A rebuild that produced an equal node therefore hands the form the
   same object.

The rest of a form's inputs follow the same rule: its `data` is a per-field projection (the field's
value and pending text at its data path) memoized on that value; `computeLabel` and
`computeHelper` are memoized per field id, language, workspace and state words; `hass` comes from
one of the two feeds (section 3.6), each stable while nothing it carries changes. The proof is two genuine renders (section 6, PR 3 and
PR 5): a write to one field, then a `requestUpdate()`, and every other form must receive the same
`schema`, `data`, `hass`, `computeLabel` and `computeHelper` objects both times.

**Focus.** `ha-form.focus()` and `ha-selector.focus()` do nothing; focusing the native control five
shadow roots down works, and `ha-input`, `wa-input` and `ha-switch` delegate focus while
`ha-selector` does not ([measured] §4). **One rule follows, everywhere the editor moves focus onto a
field: the field's wrapper, never anything inside its form.** That covers Undo and Redo, a search
jump, an Add promotion and Reset. The wrapper is named after the field, so a screen reader hears
which field it is, and Tab enters the control. A following Ctrl/Cmd+Z then reaches the editor's
history rather than an input's own undo, and no software keyboard opens on a phone (ia-final §9).
The first revision contradicted this in this section. Candidate A §7 sends Reset, and ia-final §9
sends Undo, to the control itself; the rule is a difference from the approved design, adopted in
section 13 (_Differences From the Approved Design, Decided_, row A). So no code path focuses inside
a form, and there is no shadow-root walker to maintain.

**Cost.** Measured, not estimated: 40 one-field forms cost what one 40-field form costs, about
25-28 ms to mount and 1.4 ms per new `hass` on a Mac [measured] §5. The cost is the number of
mounted fields, which pages cut from today's 284 to the open page's (at most 49 on Events with every
feature on in step 1, fewer once step 3 shrinks pages, [probe] section 2). By the report's own
extrapolation that is about 30-35 ms to open Events on the Mac, several times that on a phone
[unverified]: PR 5's live review opens that page on a phone. No fallback shape is planned,
since the shape is not the cost.

### 3.4 Navigation and Rendering

- **State.** `navigation.ts` holds `{ route, trail, fromResults }` as data. Routes: the overview, a
  section page, a calendar entry (by entry key), What This Card Changes, the notices page, and Quick
  Setup (which keeps its own session, as today). The trail holds at most two pages; a cross-link from
  a page reached by a cross-link replaces it, and so do Previous/Next Calendar and moving between the
  entries of one calendar.
- **Rendering.** `render()` draws `cache(route is overview ? overview : keyed(routeKey, page))`, so
  the overview's DOM, scroll, search text and open lists survive a visit to a page, and a page's
  forms exist only while it is open (R39). Lit's `cache` costs +283 B gzip -9 [probe].
- **Moving.** Opening a page saves the scroll container's `scrollTop` and the trigger's focus key,
  renders, and in the continuation of the render's `updateComplete` focuses the page's card-owned
  `h2 tabindex="-1"` with `focus({ preventScroll: true })`, then scrolls by arithmetic so the page
  header sits at the top. The swap removes the focused row, which drops focus to `<body>`, so the
  heading is focused in that same continuation, never later; the heading then takes and keeps focus
  inside Home Assistant's dialog, with no focus trap in the way [measured] §4. Back restores the
  saved `scrollTop` after the overview has rendered, then focuses the trigger by key, else the list's
  heading.
- **The scroll container.** At 1440 px both `div.element-editor.ha-scrollbar` and
  `div.body.ha-scrollbar` are ancestors of the editor [measured] §6; which of them scrolls, at that
  width and at narrow widths, was not measured (the report's _Not Measured_). So the editor never
  names either: `views/scroll.ts` › `scrollContainer(editor)` walks the flat tree up from the editor
  and takes the first ancestor whose computed `overflow-y` is `auto` or `scroll` and whose
  `scrollHeight` exceeds its `clientHeight` (r6 §3.1, 158 B), re-resolved on every navigation.
  [unverified] at narrow widths: PR 5's live review checks scroll restore at 400 px and on the phone.
- **No browser history, nothing sticky.** Back in the browser closes the dialog, and an entry pushed
  for a sub-page does not survive it: Home Assistant walks past the stale entry and the same press
  closes the dialog [measured] §2. So no History, Navigation or `CloseWatcher` API. No
  `position: sticky` anywhere in `styles.ts` (a test greps the stylesheet). Back sits at the top
  and foot of every page.
- **Revalidation.** A `setConfig` that is not the editor's own echo (`element.ts` ›
  `CalendarCardProEditor.setConfig`, `isEcho`) clears the history, resets the scope as today, and
  validates the route: an entry page whose entry no longer exists, or the Grid page outside Grid,
  falls back to the overview with the status line "That entry is no longer on the card." where an
  entry vanished.
- **Escape and keys** are handled on the editor root; section 5.5.

### 3.5 Home Assistant Elements

**Decision.** By the end of step 5 the editor names `ha-form` and the guarded
`ha-card-conditions-editor`, nothing else (R37's SHOULD).

- `ha-expansion-panel` leaves as its last two users go: per-calendar panels in PR 10, toolbar
  buttons in PR 18.
- `ha-svg-icon` is replaced in PR 5 by an inline-SVG template helper (`<svg viewBox="0 0 24 24"
aria-hidden="true"><path d=…></svg>`, `fill: currentColor`), about 100 B, which is what candidate
  A §12 itself specifies ("`ha-expansion-panel` and `ha-svg-icon` drop out; icons become inline SVG").
  Reasons: rows, chips and strips draw dozens of icons; the helper cannot be renamed under the
  editor; it renders in happy-dom, so tests see icons; and it removes one name from the set Home
  Assistant can break. Its size follows the custom property 2026.11's `ha-svg-icon` reads, with a
  24 px fallback, so a theme that sizes icons keeps sizing these ([unverified] which property: PR 5
  reads it from the frontend and uses the same one). Keeping `ha-svg-icon`, which D16's wording also
  allows, is a one-line revert.

### 3.6 Two `hass` Feeds, and Rendering Only for `hass` Changes the Editor Draws

Home Assistant hands the editor a new `hass` 2.2-3.6 times a second while the dialog sits idle, and
today each one costs about 20 ms, because the editor re-renders and re-feeds 124 forms [measured] §5.
Today's `element.ts` › `_formHass` is `hass-localize.ts` › `withCardActionLabels(hass, language)`,
which returns a **snapshot**: `{ ...hass, localize }`, cached per `hass` identity [read]. So a
wrapper cached on anything other than `hass` keeps stale `states`, and raw `hass` handed to an action
form loses the card's own action labels (the engineering review's finding 4). Hence two feeds:

1. **The live feed**: `withCardActionLabels(this.hass, language)` for each `hass` Home Assistant
   delivers, so it carries fresh `states` and the action-label shim. It goes to every form whose
   node uses an `entity`, `icon`, `ui_action` or `object` selector, and to the Add Calendar and
   entry Calendar pickers; each such form's wrapper carries `data-hass="live"`. The conditions
   editor is live too but keeps the editor's own `hass`, unwrapped, as
   `tests/editor-visibility.test.ts` pins it.
2. **The steady feed**: `hass-key.ts` › `steadyHass(hass, language)`, a shallow projection
   (`{ ...hass, localize }` with the same shim) cached on the language and the identities of
   `hass.localize`, `hass.locale` and `hass.themes`. Its `states` are stale by design. It goes to
   every other form (text, number, boolean, select), which reads labels, locale and theme, not
   states. [unverified] that no steady selector reads `states` on 2026.11: PR 3's live review renames
   and disables an entity with the editor open; a selector found reading `states` moves to the live
   feed by selector type.

**An editor `shouldUpdate`**, modeled on the card's own (`src/utils/hass-relevance.ts` ›
`hassChangeIsVisible`; AGENTS.md, _The card renders only for `hass` changes it draws_): when `hass`
is the only changed property, the editor compares `hass-key.ts` › `editorHassKey(previous, next,
entityIds)`: the language, the identities of `localize`, `locale` and `themes`, the identity of
`hass.states[id]` for every entity the editor draws (`editorEntityIds(config)`: the card's calendars,
the weather entity, the toolbar buttons' entities and the persons entry labels name; a calendar's
name is its state's `friendly_name`, `entities.ts` › `entityDisplayName` [read]). The registry colors
that Follow Home Assistant describes do not travel in `hass` at all: they arrive through
`entity-colors.ts`'s own subscription, whose `onChange` requests an update (section 5.9). Unchanged,
the key skips the render and assigns the new live `hass` straight to the mounted
`data-hass="live"` forms, which update alone at the measured 1.4 ms per 40 fields.

**An explicit update is never swallowed.** Lit batches property changes, so an irrelevant `hass`
and a bare `requestUpdate()` (a registry color arriving, a draft committing) can land in one
update, which then shows only `hass` as changed; a key check alone skips it, and the re-review's
probe rendered 0 times for the pair against 1 for the request alone. The editor carries the intent
as the card does: `element.ts` overrides `requestUpdate` to set `_bareUpdatePending` when it is
called without a property name, and `shouldUpdate` renders whenever that flag is set, then clears it
(`src/calendar-card-pro.ts` › `requestUpdate`, `shouldUpdate`, `_bareUpdatePending` [read]).

**What the read-set test measures.** It records the `hass` members the editor's render and its
forms' inputs read, and fails on one outside the key. The two feeds copy `hass` to build their
wrapper (`{ ...hass, localize }`), which touches every member, `config`, `connection`, `callApi`
and `user` included, without depending on any of them. So the recorder is armed only while the
editor renders and its forms read their inputs, and disarmed while `withCardActionLabels` and
`steadyHass` build a wrapper; a planted read of `hass.config` in a render path must fail the test,
and a planted extra member in the wrapper's spread must not. The alternative, the card's own policy
of treating every non-state key as relevant (`hass-relevance.ts`), would render on every change of
any of them; this plan keeps the narrower key and its test.

### 3.7 Owner-Aware Write Frames

Every write still ends in `element.ts` › `CalendarCardProEditor._report` or, where today's code
deliberately bypasses minimization (`_moveMisplaced`, Quick Setup, migration), in its own dispatch.
What changes is how a control says what it writes. The first revision routed every card-built
control through `_valueChanged`, which would write a calendar's color to the card's root `color`,
and `entities.ts` › `writeEntity` given only `{ color }` drops the entry's other settings, unknown
keys included, because `fromEntityFormData` rebuilds the entry from the data it is handed [read];
`buttons.ts` › `fromButtonFormData` does the same for a button [read]. So every frame names its
owner:

```ts
export type WriteOwner =
  | { readonly kind: 'card' }
  | { readonly kind: 'entry'; readonly key: number }
  | { readonly kind: 'button'; readonly key: number };
export interface OwnedFrame {
  readonly owner: WriteOwner;
  readonly workspace: EditorWorkspace; // captured at render
  readonly schema: ReadonlyArray<HaFormSchema>; // the lifted field (a panel's schema before PR 5)
  data: Record<string, unknown>; // the baseline: what this form instance last showed, as rendered, then as it emitted
}
```

- **Captured at render.** A frame is built while rendering and closed over by its form's listener,
  so a delayed `value-changed` routes to the workspace and owner the control was drawn for, never
  the current ones; `routing.ts` › `applyWorkspaceChange` already promises this for the card
  [read].
- **Owner-keyed DOM.** A closure does not protect a reused element. Today's `_renderEntities` maps
  the entries by position, so after Anna is removed the form Lit keeps in the middle slot, whose
  listener was captured for Ben, receives Leo's data and delivers Ben's frame for Leo's edits (the
  re-review's probe). From PR 4 every entry's and button's subtree is rendered with Lit's keyed
  `repeat`, keyed by the owner's key, so an element is only ever reused for the owner it was built
  for, and a frame's owner and its element cannot part.
- **A field-scoped write set.** An event writes only what the user changed in that form instance:
  the paths whose value in the event differs from `frame.data`, the instance's baseline, after which
  `frame.data` becomes the event's data; a render that hands the instance new data resets it.
  The write set is applied over the owner's projection as it stands when the event arrives. So a
  stale instance (rendered with `name: Old`, `color: red`, before another edit set `name: New`)
  that emits `color: blue` writes `color` alone and keeps `name: New`; and an instance that emitted
  `name: New` and then `name: Old` writes `Old`, because its baseline had become `New`: an
  intentional return to the originally rendered value is a write like any other. The first
  revision's rule, comparing against the last emitted data shared by every event, reverted the
  sibling in the first case (the re-review's probe). Once PR 5 gives every field its own form, the
  write set is one field at most, and the same rule still covers compound values such as an
  action object.
- **Card**: `applyWorkspaceChange(config, frame, incoming, pending, gridResetKeys,
authoredRootKeys)`, today's path, which already writes only the fields whose value differs from
  `frame.data` [read]. `write-frames.ts` › `applyOwnedChange` always answers the card's change, an
  empty one included, so a card change sets the editor's state exactly as it did before PR 4.
- **Entry (key)**: the key is resolved to an index when the event arrives (an entry that has left
  drops the event). The writer re-projects the entry at event time with
  `entities.ts` › `toEntityFormData(entry, entities)`, which is complete (it spreads the stored
  entry, unknown keys included [read]), overlays the write set, and calls `writeEntity` with that
  whole projection.
- **Button (key)**: the same with `buttons.ts` › `toButtonFormData` and `writeButton`.
- **`_writeFieldValue(owner, fieldId, value)`** builds the incoming data for a card-built control
  (radio groups, chips, swatches, Start Date shortcuts, the tapping switch) from that owner's
  projection and hands it to the same writer, so routing, synthetic fields, pending text and
  authorship stay one mechanism per owner. `_writeFieldValues(owner, values)` writes several of one
  owner's fields as one change, through one frame whose baseline is the very data the change is
  built from (`write-frames.ts` › `frameFor`, `withValue`). As built in PR 4, a card field is looked
  up among those its panel draws now, so a field the configuration gates off cannot be written yet:
  the universe lives in `field-index.ts`, which brings `gates.ts` and its corpus into the editor
  chunk, +1.6 to +1.9 KB gzip -9 and a circular import Rollup warns about [measured, PR 4], before
  PR 5 needs them there. An entry's or a button's field is looked up among those every entry or
  button declares, so a mode and the value it reveals can be written as one change. Home
  Assistant's Visibility editor writes a calendar's conditions through it.
- **`_commit(label, coalesceKey, run)`** takes the history snapshot before `run`, the one after it,
  and records an undo entry when the stored configuration changed (section 5.4).

Before PR 4 the per-calendar forms passed an index captured at render (`element.ts` ›
`_entityChanged(index, event)`), which a removal above them shifted. PR 4 moved them, the button
forms and Home Assistant's Visibility editor onto keyed frames, and the editor writes what it did
before. As built:

- **Click actions keep their index until PR 10.** Copy, Paste, Duplicate and Remove, and a button's
  Move Up, Move Down and Remove, take the index bound at render: a click cannot outlive the render
  that bound it, since a keyed panel takes a removed owner's actions with it. `_emittedConditions`
  stays keyed by index until PR 10 re-keys it (section 5.4).
- **Panels keep their own open state.** Drawn by key, a calendar's panel stays open or closed
  through a removal, a duplicate or the picker, as a toolbar button's already did. Drawn by place,
  the next calendar took over a removed one's open panel. This is the one difference a user can see.
- **Focus after Remove.** A panel drawn by key takes its focused Remove with it, where drawing by
  place left focus on the same button, by then the next calendar's. So where focus was in the
  removed calendar's panel, as on a keyboard's Remove, `_focusAfterRemove` moves it to the Remove of
  the calendar drawn in its place now, opening that calendar's panel where it is closed, since a
  closed panel draws nothing to focus; to the one before it where the removed calendar was the last;
  and to the calendar picker where none is left, its form in a group of the editor's own named
  after the field (`tabindex=-1`), as `ha-form` focuses nothing it draws. Focus held elsewhere stays
  where it is. Section 5.4's status bar replaces this with the calendar list in PR 10.

### 3.8 Templates Move Out of `element.ts`

`element.ts` is 2,312 lines today and this redesign roughly doubles what it draws. **Decision:**
add `src/rendering/editor/views/`, a folder of Lit template functions that take a plain view model
and callbacks and return a `TemplateResult` (`views/overview.ts`, `views/page.ts`,
`views/calendars.ts`, `views/controls.ts`, `views/color.ts`, `views/search.ts`, `views/audit.ts`,
`views/split.ts`, `views/reorder.ts`, `views/focus.ts`, `views/keys.ts`, `views/scroll.ts`). They
hold no state and import nothing from the element. `element.ts` keeps every piece of state, every
write and every focus decision. AGENTS.md's Editor section, which says everything except
`element.ts` and `styles.ts` is free of Lit and the DOM, is amended in PR 5 to name `views/` as the
third exception; the reason for the rule (tests and `check:i18n` import schemas without a DOM) is
untouched, because neither imports a view. The alternative, everything in `element.ts`, keeps the
rule's wording and costs a 5,000-line file.

### 3.9 Presentation Modes Held in Pending Text

A mode control and the value field it reveals must agree on the mode. Today `schemas/content.ts`
decides whether to build `start_date_fixed` or `start_date_offset` from
`synthetic.ts` › `startDateMode(ctx.config)` [read], while the form reads the mode from data where
`routing.ts` › `workspaceFormData` lets pending text override a derived synthetic value [read]. The
two can only disagree once a mode's values overlap, which Start Date's shortcuts make happen:
`today+1` is a valid offset and reads back as Tomorrow (section 5.9), so choosing Relative to Today
while `today+1` is stored writes nothing, holds `offset` in pending text, and the form says Relative
while the builder, reading the stored value, builds no Expression field.

**Decision.** `SchemaCtx` gains `presentation: Readonly<Record<string, string>>`, the held mode
choices (`_pending` under each mode field's `routing.ts` › `pendingKey`), and the builders read a
mode through `synthetic.ts` › `modeFor(ctx, 'start_date_mode', startDateMode)`, which prefers the
held choice. The card-built Start Date chips read the same value. A held mode clears when another
chip is chosen or a configuration arrives that the editor did not send, as all pending text does
today. Only `start_date_mode` needs it now; the helper is general so a later overlapping mode does
not repeat the bug. The mounted test is in section 6, PR 19.

## 4. Modules

All new modules except `views/*.ts` are free of Lit and the DOM and are unit-tested under Vitest
(R42). Signatures are the contract; implementers may add private helpers.

### 4.1 New Modules

**`gates.ts`** (PR 1, built, phrases included; the contract below is what it built). One table says
why a field is withheld and how to open it; the probe corpus, the universe index, the gate lines and
search all read it. Appendix B is its seed, validated by probe.

```ts
export interface Prereq {
  readonly field: FieldId; // the control a reader changes
  readonly opens: unknown; // the value an opening edit writes, through routing, as a user would
  readonly holds: (value: unknown) => boolean; // over every value the option's type allows
  readonly needsKey?: string; // the reason a gate line gives while this condition is unmet
}
export interface Gate {
  readonly fields: ReadonlyArray<FieldId>; // what it withholds
  readonly requires: ReadonlyArray<Prereq>; // all of them, nearest last
  readonly anyOf?: ReadonlyArray<ReadonlyArray<Prereq>>; // and: every condition of one of these
  readonly kind: 'gate' | 'mode-value'; // mode values never get gate lines
  readonly needsKey?: string; // the reason for an unmet condition without one of its own
}
export interface GateData {
  readonly card: Readonly<Record<string, unknown>>;
  readonly entry?: Readonly<Record<string, unknown>>;
}
export const GATES: Readonly<Record<string, Gate>>;
export const ENTRY_GATES: Readonly<Record<string, Gate>>;
export function openingEdits(
  gate: Gate,
  branch?: number,
): ReadonlyArray<readonly [FieldId, unknown]>;
export function corpus(): ReadonlyArray<CorpusState>; // per display and scope: fresh, then every gate opened
export function fieldValue(data: GateData, id: FieldId): unknown; // a control's value as its form holds it
export function firstUnmet(gate: Gate, data: GateData): Prereq | undefined; // what a line names
export function needsText(
  gate: Gate,
  data: GateData,
  language: string,
  labelOf: (id: FieldId) => string,
): string | undefined;
```

`corpus()` builds each state by applying `openingEdits` through `routing.ts` ›
`applyWorkspaceChange` from a one-field frame, per workspace and display, so a value Grid defaults
differently lands in `time_grid:`. A gate's opening edits are complete: they open every
prerequisite, nested ones included (Countries To Remove needs Show Location and its mode; a UV
threshold needs the weather entity, a position that draws it and its switch).

Three properties PR 1 holds by test (section 6):

- **A predicate takes every legal value**, not only the ones its control offers: `show_countdown`
  may be `true` or `once_per_day` (a valid value; #835's Now & Next and Bin Day stories store it),
  and the Countdown gate's `holds` is true for both, as the builder is.
- **The reason is per condition and read from the data.** `firstUnmet` names the first unmet
  requirement, else the first unmet condition of the `anyOf` branch closest to holding, and
  `needsText` turns it into words: its own `needsKey`, else the gate's, else its control's label. So
  one gate explains itself differently as different conditions are unmet: Weather Lines says Weather
  Entity with no entity, "the forecast beside each event" while the forecast is drawn elsewhere, and
  Show Conditions Beside Events while that switch is off.
- **The universe is checked independently of its own result.** The gate corpus builds the
  universe, so a corpus missing a state also shrinks the denominator its check divides by: leaving
  out only Grid's Countries-opening states dropped Grid from 157 fields to 156 while every
  assertion stayed green (the re-review's probe). The check therefore replays each gate's opening
  edits on its own, asserts that every field built anywhere belongs to its scope's universe, and
  pins each scope's id set by value; the planted omission of Grid's Countries state must fail it.

**`field-index.ts`** (PR 1). The present and universe indexes of section 3.1.

```ts
export type FieldId = string; // 'events:show_time', 'calendar:blocklist', 'button:icon'
export interface IndexedField {
  readonly id: FieldId;
  readonly node: SelectorSchema; // as the builder made it
  readonly dataPath: ReadonlyArray<string>; // where ha-form nests its data
  readonly labelPath: ReadonlyArray<string>; // what computeLabel qualifies it with today
  readonly lifted: ReadonlyArray<HaFormSchema>; // interned by structure (section 3.3)
  readonly configKeys: ReadonlyArray<string>; // configKeysForField, or entityConfigKeys
}
export interface FieldIndex {
  readonly fields: ReadonlyMap<FieldId, IndexedField>;
}
export function fieldId(scope: string, dataPath: ReadonlyArray<string>, name: string): FieldId;
export function liftField(
  id: FieldId,
  node: SelectorSchema,
  dataPath: ReadonlyArray<string>,
): HaFormSchema[];
export function buildFieldIndex(ctx: SchemaCtx): FieldIndex; // memoized on the builder inputs
export function universeIndex(language: string, workspace: EditorWorkspace): FieldIndex; // over corpus()
export function entityFieldIndex(entrySchema: ReadonlyArray<HaFormSchema>): FieldIndex;
```

**`pages.ts`** (PR 1, built). The registry; Appendix A is its seed. PR 5 adds the overview rows'
summaries.

```ts
export type PageId =
  | 'which_events'
  | 'card_header'
  | 'day_header'
  | 'events'
  | 'size_spacing'
  | 'grid'
  | 'weather'
  | 'taps_refresh';
export type FamilyId =
  'compact_mode' | 'past_days' | 'weekend_colors' | 'column_density' | 'grid_density' | 'replace';
export type Appearance =
  | 'essential' // always live while present
  | 'add' // live when stored, inherited and different, or added; else in the Add row
  | { readonly with: FieldId | ReadonlyArray<FieldId> } // live with its mode; Match Against has two
  | { readonly family: FamilyId } // shown, added and removed with its family
  | { readonly chips: 'parts' | 'toolbar' } // drawn as a toggle chip (PR 18)
  | 'button-rows'; // the toolbar's own buttons (PR 18)
export interface HeadingDef {
  readonly key?: string; // string key; absent for a page's unheaded top run
  readonly keyByView?: Partial<Record<Types.EffectiveView, string>>; // 'Icons' in Grid
  readonly helperKey?: string; // the line under a heading, as Countdown & Progress has today
  readonly fields: ReadonlyArray<readonly [FieldId, Appearance]>;
  readonly extras?: ReadonlyArray<HeadingExtra>; // 'own-buttons' | 'weather-calendar-links' | 'split'
  readonly crossLink?: { readonly page: PageId; readonly heading: string };
}
export interface PageDef {
  readonly id: PageId;
  readonly titleKey: string;
  readonly iconPath: string;
  readonly onlyIn?: Types.EffectiveView; // the Grid page
  readonly noteKey?: string;
  readonly headings: ReadonlyArray<HeadingDef>;
  // PR 5: summary(ctx: SummaryCtx): ReadonlyArray<SummaryPart>, the overview row's one line
}
export const OVERVIEW_FIELDS: ReadonlyArray<readonly [FieldId, Appearance]>;
export const PAGES: ReadonlyArray<PageDef>;
export const ENTRY_GROUPS: ReadonlyArray<HeadingDef>; // a calendar entry's page
export const FAMILIES: Readonly<Record<FamilyId, { titleKey: string; helperKey?: string }>>;
export function placementOf(id: FieldId): Placement | undefined; // { page: PageId | 'overview' | 'entry'; heading }
export function isWholeCard(page: { readonly headings: ReadonlyArray<HeadingDef> }): boolean; // derived
```

`isWholeCard` is derived, never declared: from `routing.ts` › `destination` and from the layouts
that offer each field (`view.ts` › `appliesToView`). Card & Header and Weather show "Applies to the
whole card." because no field there has a layout copy or is missing from a layout; Taps & Refresh
does not, because Grid has no Open Links; and a field that later gains a layout copy changes the
answer by itself [read: `pages.ts` as PR 1 built it].

Pages carry no search words of their own (PR 1's choice): a page is found by its title, its headings
and the `.aliases` strings of its title key, held by #834's check like a field's (section 8.3).

**`hass-key.ts`** (PR 3). `editorEntityIds(config)`, `editorHassKey(previous, next, ids)` and
`steadyHass(hass, language)` of section 3.6.

**`write-frames.ts`** (PR 4, as built). `WriteOwner` and `OwnedFrame` of section 3.7, and:

```ts
export const CARD_OWNER: WriteOwner;
export type WrittenField = Pick<IndexedField, 'node' | 'dataPath' | 'lifted'>;
export interface WriteState {
  readonly config: Types.Config;
  readonly pending: Readonly<Record<string, string>>;
  readonly authoredRootKeys: ReadonlySet<string>;
  readonly gridResetKeys: ReadonlySet<string>;
  readonly entryKeys: ReadonlyArray<number>;
  readonly buttonKeys: ReadonlyArray<number>;
}
export function projectionFor(
  owner: WriteOwner,
  state: WriteState,
  workspace: EditorWorkspace,
): Record<string, unknown> | undefined; // undefined: an entry or a button that has left
export function writeSet(
  frame: OwnedFrame,
  incoming: Record<string, unknown>,
): ReadonlyArray<ReadonlyArray<string>>; // changed paths
// Always answers the card's change; undefined for an entry or a button that has left, or one
// whose write set changes nothing.
export function applyOwnedChange(
  state: WriteState,
  frame: OwnedFrame, // its data, the baseline, becomes `incoming` once applied
  incoming: Record<string, unknown>,
  hass?: Types.Hass,
): { config: Types.Config; pending: Record<string, string> } | undefined;
// For card-built controls: the fields' one-field forms, the owner's data as their baseline;
// undefined for an entry or a button that has left.
export function frameFor(
  owner: WriteOwner,
  fields: ReadonlyArray<WrittenField>,
  state: WriteState,
  workspace: EditorWorkspace,
): OwnedFrame | undefined;
export function withValue(
  data: Record<string, unknown>,
  field: WrittenField,
  value: unknown,
): Record<string, unknown>; // a field's value laid over form data at its data path
export function keysByPosition(
  keys: ReadonlyArray<number>,
  length: number,
  mint: () => number,
): number[]; // a configuration the editor did not send
export function carryEntryKeys(
  before: ReadonlyArray<string | Types.EntityConfig>,
  keys: ReadonlyArray<number>,
  after: ReadonlyArray<string | Types.EntityConfig>,
  mint: () => number,
): number[]; // a list rebuilt a calendar at a time: the picker's `apply`, Quick Setup, their echoes
```

`frameFor` and `withValue` replace the first contract's `incomingFor(owner, field, value, state,
workspace)`, so `_writeFieldValues` is one frame and one change for several fields, its baseline the
data its incoming data is built from. `WrittenField` is what a write needs of an `IndexedField`, so
PR 5 hands one over as it is; until then the element finds a field in the schema its owner draws
(section 3.7), the one-field nesting shared with `field-index.ts` › `liftField` through
`routing.ts` › `nestedSchema`.

**`navigation.ts`** (PR 5).

```ts
export type Route =
  | { kind: 'overview' }
  | { kind: 'page'; page: PageId }
  | { kind: 'entry'; key: number }
  | { kind: 'audit'; group?: string }
  | { kind: 'notices' };
export interface TrailEntry {
  readonly route: Route;
  readonly scrollTop: number;
  readonly focusKey?: string; // data-focus key of the row, result or link that left
  readonly search?: { query: string; editHere: boolean };
}
export interface NavState {
  readonly route: Route;
  readonly trail: ReadonlyArray<TrailEntry>;
  readonly fromResults: boolean;
}
export function go(
  nav: NavState,
  to: Route,
  from: TrailEntry,
  how?: 'push' | 'replace' | 'cross-link',
): NavState;
export function back(nav: NavState): { nav: NavState; restore: TrailEntry | undefined };
export function validate(
  nav: NavState,
  exists: (route: Route) => boolean,
): { nav: NavState; dropped: boolean };
```

**`history.ts`** (PR 7). Exact snapshots (section 5.4).

```ts
export interface Snapshot {
  readonly raw: Readonly<Record<string, unknown>>; // the stored config as last emitted or received
  readonly authoredRootKeys: ReadonlyArray<string>;
  readonly gridResetKeys: ReadonlyArray<string>;
  readonly gridReconciliation: ReadonlyArray<string>;
  readonly pending: Readonly<Record<string, string>>;
  readonly migration: MigrationState; // moved out of element.ts into this module
  readonly entryKeys: ReadonlyArray<number>;
  readonly buttonKeys: ReadonlyArray<number>;
}
export interface Where {
  readonly route: Route;
  readonly workspace: EditorWorkspace | undefined; // the scope the edit was made in
  readonly focusKey?: string;
}
export interface HistoryEntry {
  readonly label: string; // already localized: "Change Event Font Size"
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly where: Where;
}
export class History {
  static readonly LIMIT = 75;
  static readonly COALESCE_MS = 800;
  record(entry: HistoryEntry, coalesceKey: string | undefined, now: number): void;
  undo(): HistoryEntry | undefined;
  redo(): HistoryEntry | undefined;
  clear(): void;
  get canUndo(): boolean;
  get canRedo(): boolean;
  peekUndo(): HistoryEntry | undefined; // names the Undo button: "Undo: Remove Ben"
  peekRedo(): HistoryEntry | undefined;
}
```

**`announce.ts`** (PR 5). A queue that joins messages arriving in one update into one polite
announcement (ia-final §9).

**`search.ts`** (PR 8 basic, PR 17 full). Section 5.8.

```ts
export function fold(text: string): string; // NFD, drop \p{M}, NFC, lower, ß ø æ ł đ œ, punctuation
export interface SearchEntry {
  readonly target:
    | { kind: 'field'; id: FieldId }
    | { kind: 'entry-field'; id: FieldId }
    | { kind: 'page'; page: PageId }
    | { kind: 'overview'; block: string }
    | { kind: 'ha-tab'; tab: 'layout' | 'visibility' };
  readonly label: string; // in the editor's language
  readonly yamlPath: string; // shown on every result (A §9, R56)
  readonly text: ReadonlyArray<readonly [weight: number, folded: string, source: MatchSource]>;
  readonly crumbs: ReadonlyArray<string>;
}
export type MatchSource = 'label' | 'key' | 'alias' | 'option' | 'heading' | 'helper';
export function buildSearchIndex(ctx: SearchCtx): ReadonlyArray<SearchEntry>; // memoized
export function search(index: ReadonlyArray<SearchEntry>, query: string): ReadonlyArray<SearchHit>;
export function highlight(
  label: string,
  query: string,
): ReadonlyArray<readonly [start: number, end: number]>;
```

Aliases are #834's: an entry's `alias` text is `localize.ts` ›
`computeAliases(language, node, path)` for the field, which falls back to the English words where
the language has none of its own (`localize.ts` › `lookup`), exactly what today's `filter.ts` ›
`searchableText` reads. There is no second alias table. A hit records the source of its best match,
so a result found only in a helper can be ranked last and show the phrase that matched (section
5.8).

**`calendar-list.ts`** (PR 9).

```ts
export interface EntryRow {
  readonly index: number;
  readonly key: number;
  readonly position: number;
  readonly total: number;
}
export interface CalendarGroup {
  readonly entityId: string;
  readonly rows: ReadonlyArray<EntryRow>;
}
export interface ListState {
  readonly entities: ReadonlyArray<string | Types.EntityConfig>;
  readonly keys: ReadonlyArray<number>;
}
export function groups(state: ListState): ReadonlyArray<CalendarGroup>; // first-occurrence order
export function moveCalendar(state: ListState, entityId: string, to: number): ListState; // a whole group
export function removeEntry(state: ListState, index: number): ListState; // entities.ts › removeEntity
export function removeCalendar(state: ListState, entityId: string): ListState;
export function duplicateEntry(state: ListState, index: number, newKey: number): ListState; // copy right after it
export function addCalendar(state: ListState, entityId: string, newKey: number): ListState;
export function repointEntry(
  state: ListState,
  index: number,
  entityId: string,
): { state: ListState; adopted: boolean };
export function rowParts(
  entry: string | Types.EntityConfig,
  language: string,
): ReadonlyArray<string>; // two at most
export function rowName(state: ListState, index: number, language: string): string; // name, plus its first part in a group
export function setCount(entry: string | Types.EntityConfig): number;
```

Every operation rewrites `entities` in grouped, first-occurrence order and keeps the relative order
of each calendar's entries, and moves act on a whole calendar: there is no entry-level move (A §5,
_Moves act on a whole calendar_; the prototype's `stripHTML` offers Move only at calendar level).
The order across calendars is what AGENTS.md's _Collapsing duplicates costs no ordering_ shows
invisible. The order within one calendar is not invisible: when two of its entries keep the same
event, `processEvents` stamps one copy per entry, and under `filter_duplicates` the first entry's
copy wins and draws the row, its color and label included (`events.ts` › `processEvents`,
`groupEventsByDay`'s `firstEligible`, ties on `getEntityIndex` kept in list order [read]). Hence no
operation reorders entries inside a calendar. `repointEntry` moves the entry to the end of the
target calendar's group, so the target's own entries keep their priority, and, when that calendar
already has entries, sets the entry's `name` and `show_in_legend` to the target's
(`entities.ts` › `CALENDAR_OPTIONS` belong to the calendar), reporting `adopted` so the editor can
say so (section 5.6).

**`colors.ts`** (PR 11). The composed color control's data, section 5.9. `schemas/common.ts` ›
`color(name)` marks the nodes it builds (a non-enumerable property `ha-form` never reads), so the
specs are derived from the built schema rather than listed.

```ts
export type ColorSource = 'default' | 'follow-card' | 'follow-ha' | 'calendar-accent' | 'row-text';
export interface ColorSpec {
  readonly value: FieldId; // the text field that stores the color
  readonly mode?: FieldId; // a mode field the control absorbs (accent_color_mode, allday_badge_color_mode)
  readonly sources: ReadonlyArray<{
    readonly source: ColorSource;
    readonly write: Readonly<Record<FieldId, unknown>> | 'reset'; // one undo step either way
  }>;
  readonly custom: Readonly<Record<FieldId, unknown>>; // what a swatch or Custom writes besides the value
  readonly sentinels: ReadonlyArray<string>; // 'accent', 'home-assistant': valid only where honored
}
export const SWATCH_TOKENS: ReadonlyArray<string>; // the 19 hues of D13, pinned by value
export function colorSpecs(index: FieldIndex): ReadonlyMap<FieldId, ColorSpec>; // from nodes color() marked
export function choiceOf(
  value: unknown,
  spec: ColorSpec,
): { kind: 'source'; source: ColorSource } | { kind: 'swatch'; token: string } | { kind: 'custom' };
export function validColor(
  text: string,
  spec: ColorSpec,
  supports?: (text: string) => boolean,
): boolean;
export function describeColor(value: unknown, spec: ColorSpec, language: string): string; // "Pink", "Divider, 50%", "Not Set"
export function freeSwatch(
  entries: ReadonlyArray<string | Types.EntityConfig>,
  card: Readonly<Types.Config>,
): string; // first token no calendar uses
export function draftKey(owner: WriteOwner, field: FieldId, destination: string): string; // e.g. 'card|events:event_color|time_grid'
```

A draft is keyed by where its value would be stored, not only by owner and field: the card's
`events:event_color` is one field in List and in Grid but stores to `list.event_color` and
`time_grid.event_color`, so a draft typed for Grid must not appear, or commit, while List is the
scope. The destination is `routing.ts` › `destination(key, workspace)` for the field's first config
key (the block, or the top level), the entry's key for an entry, the button's for a button.

**`split.ts`** and **`split-review.ts`** (PR 12). Section 5.7.

```ts
export type SplitHow =
  { kind: 'type' } | { kind: 'words'; terms: ReadonlyArray<string>; field: Types.FilterField };
export interface SplitPart {
  readonly label?: string;
  readonly color?: string;
}
export interface SplitRefusals {
  readonly type?: string; // an effective all-day or timed event type, the entry's own or the card's
  readonly words?: string; // its own allowlist
  readonly pattern?: string; // a blocklist or allowlist that does not compile: By Words only
  readonly budget?: string; // its own compact budget: both methods
  readonly field?: Types.FilterField; // Match Against locked to the blocklist's field
}
export function refusals(entry: Types.EntityConfig, card: Readonly<Types.Config>): SplitRefusals; // string keys
export function splitEntry(
  entry: Types.EntityConfig,
  how: SplitHow,
  parts: readonly [SplitPart, SplitPart],
): readonly [Types.EntityConfig, Types.EntityConfig]; // all-day or worded part first

// split-review.ts: the card's window and per-entry eligibility, mirrored (section 5.7)
export interface ReviewWindow {
  readonly config: Types.Config;
  readonly start: Date;
  readonly end: Date;
} // config resolved for the layout
export function reviewWindow(
  raw: Types.Config,
  view: Types.EffectiveView,
  hass: Types.Hass | undefined,
  now?: Date,
): ReviewWindow;
export function entryKeeps(
  event: Types.CalendarEventData,
  entry: Types.EntityConfig,
  card: Readonly<Types.Config>,
): boolean; // type and word lists
export function shownOn(
  event: Types.CalendarEventData,
  entry: Types.EntityConfig,
  window: ReviewWindow,
  view: Types.EffectiveView,
  hass: Types.Hass | undefined,
  now?: Date,
): Date | null; // the first day the card draws it for this entry, or null
export function readUpcoming(
  hass: Types.Hass,
  entityId: string,
  window: ReviewWindow,
): Promise<Types.CalendarEventData[] | null>;
export function reviewParts(
  events: ReadonlyArray<Types.CalendarEventData>,
  original: Types.EntityConfig,
  pair: readonly [Types.EntityConfig, Types.EntityConfig],
  window: ReviewWindow,
  view: Types.EffectiveView,
  hass: Types.Hass | undefined,
  language: string,
): readonly [ReviewPart, ReviewPart];
```

**`word-lists.ts`** (PR 12, with the unreadable-pattern flag; PR 19 adds the presentation). Terms
to and from the RegExp source that `blocklist`, `allowlist` and Countries To Remove store.

```ts
export function toPattern(terms: ReadonlyArray<string>): string; // escaped, joined with |
export function fromPattern(pattern: string): ReadonlyArray<string> | undefined; // undefined: an expression
export function orPatterns(a: string, b: string): string; // (?:a)|(?:b)
export function compiles(pattern: string): boolean; // new RegExp(pattern, 'i'), as the card builds it
```

**`preview.ts`** (PR 12). Quick Setup's preview transaction (`element.ts` › `QuickSetupSession`:
`opening`, `openingAuthoredRootKeys`, `previews`, and the echo test in `setConfig`), lifted out
unchanged so Split can use it too.

```ts
export interface PreviewSession {
  readonly opening: Readonly<Record<string, unknown>>;
  readonly openingAuthoredRootKeys: ReadonlySet<string>;
  readonly previews: ReadonlyArray<Record<string, unknown>>;
}
export function isPreviewEcho(
  session: PreviewSession | undefined,
  raw: Readonly<Record<string, unknown>>,
): boolean;
export function withPreview(
  session: PreviewSession,
  preview: Record<string, unknown>,
): PreviewSession;
```

**`reorder.ts`** (PR 13). The keyboard grab and pointer drag of D10, generic over keyed rows, so the
calendar list and the toolbar's own buttons share it.

```ts
export interface GrabState {
  readonly key: number;
  readonly from: number;
  readonly at: number;
  readonly total: number;
}
export function grab(keys: ReadonlyArray<number>, key: number): GrabState;
export function moveBy(state: GrabState, by: -1 | 1): GrabState; // clamped to the list
export function order(keys: ReadonlyArray<number>, state: GrabState): ReadonlyArray<number>; // the live preview order
export function dropTarget(rowMidpoints: ReadonlyArray<number>, pointerY: number): number; // pointer drag
```

**`plan.ts`** (PR 14). The shown set (section 5.1).

```ts
export type FieldState =
  | { kind: 'live'; why: 'essential' | 'stored' | 'inherited' | 'added' | 'every' }
  | { kind: 'add' }
  | { kind: 'gated'; gate: Gate; unmet: Prereq }
  | { kind: 'inactive'; gate: Gate; unmet: Prereq; source: 'here' | 'all-layouts' }
  | { kind: 'other-layout'; views: ReadonlyArray<Types.EffectiveView> };
export interface PlanCtx {
  readonly workspace: EditorWorkspace;
  readonly config: Readonly<Types.Config>; // merged
  readonly raw: Readonly<Record<string, unknown>>; // stored
  readonly present: FieldIndex;
  readonly universe: FieldIndex;
  readonly added: ReadonlySet<string>; // field ids, `family:<id>`, `entry:<key>:<id>`, `entry:<key>:family:<id>`
  readonly showEverySetting: boolean;
}
export function fieldState(id: FieldId, appearance: Appearance, ctx: PlanCtx): FieldState;
export function planPage(
  page: PageDef,
  ctx: PlanCtx,
): { headings: HeadingPlan[]; otherLayouts: OtherLayoutLine[] };
export function planEntry(entry: Types.EntityConfig, key: number, ctx: PlanCtx): HeadingPlan[];
export function storedAt(
  raw: Readonly<Record<string, unknown>>,
  field: IndexedField,
  workspace: EditorWorkspace,
): boolean;
export function stateOf(field: IndexedField, ctx: PlanCtx): StateWords | undefined; // section 5.3
export function resetOutcome(field: IndexedField, ctx: PlanCtx): ResetOutcome | undefined; // section 5.3
```

**`reset.ts`** (PR 14). One reset path for every destination.

```ts
export type ResetTarget =
  | { kind: 'field'; field: IndexedField; workspace: EditorWorkspace }
  | { kind: 'family'; family: FamilyId; workspace: EditorWorkspace } // every member, one step
  | { kind: 'path'; path: ReadonlyArray<string> } // an audit line, a misplaced line
  | { kind: 'entry'; key: number; keys: ReadonlyArray<string> }
  | { kind: 'entry-family'; key: number; family: FamilyId }
  | { kind: 'block'; blockKey: 'list' | 'column' | 'time_grid' }; // Reset All in Grid
export function reset(
  state: WriteState,
  target: ResetTarget,
): { state: WriteState; clearAdded: ReadonlyArray<string> };
```

It generalizes `element.ts` › `_resetViewValues` (block keys, `_gridResetKeys` for Grid's divergent
defaults, pending text) to the top level (delete the key, drop it from the authored root keys so
`value.ts` › `retainAuthoredSharedValues` cannot write it back), nested blocks (`toolbar.legend`,
`weather.date.color`), synthetic fields (every key in `configKeys`, so a mode and its values reset
together, R6), families (every member at once) and entries (calendar options on every entry of the
calendar, as `entities.ts` › `writeEntity` treats them). `clearAdded` names the session keys the
reset retires, so a removed family or field leaves the added set in the same step.

**`audit.ts`** and **`deprecated.ts`** (PR 16), **`prefs.ts`** (PR 15) follow the same shape;
their contracts are in section 5.

### 4.2 Changed Modules

| Module                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | PR                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `element.ts`                     | Owns navigation, history, entry keys, the added set, preferences, drafts, grab state and announcements. Draws through `views/`. Gains `shouldUpdate` and a `requestUpdate` override carrying explicit-update intent (PR 3), keyed frames, owner-keyed `repeat` rendering and `_writeFieldValue` (PR 4), `_commit`, `_restore`, `_onKeydown` (PR 5, PR 7). Loses `_renderPanel`, `_panelTitle`, `_panelHelper` (PR 5), `_renderEntities`, `_entitySummary` (PR 10), `_renderFilterBar`, `_renderEssentialsNote`, `_countHidden`, `_renderNoMatches`, `_renderResetControls` (PR 15). | 3-19                |
| `panels.ts`                      | `PanelDef.titleKey` and `iconPath` move to `pages.ts`; `check-i18n.mjs` reads pages for titles instead. `walkSchema` unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 6                   |
| `schemas/*.ts`                   | PR 6 strips presentation (section 3.2). `schemas/content.ts` reads Start Date's mode through `modeFor` (PR 19). PR 19 adds `event_opens_details` to `buildActionsSchema`.                                                                                                                                                                                                                                                                                                                                                                                                           | 6, 19               |
| `synthetic.ts`                   | `modeFor`; `start_date_mode` gains `tomorrow` and `start_of_week`, and holds `offset` as the presentation mode when the carried value reads as a shortcut; new `event_opens_details`.                                                                                                                                                                                                                                                                                                                                                                                               | 19                  |
| `entities.ts`                    | Keyed writers (PR 4); repointing that adopts the calendar's options (PR 10); a reset that respects `CALENDAR_OPTIONS` (PR 14); word-list form data (PR 19).                                                                                                                                                                                                                                                                                                                                                                                                                         | 4, 10, 14, 19       |
| `buttons.ts`                     | Keyed writers (PR 4); `buttonSummary(entry, localize)`, the row's "Toggle · light.kitchen" (PR 18).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 4, 18               |
| `schemas/common.ts`              | `color()` marks its nodes for `colors.ts` (PR 11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 11                  |
| `routing.ts`                     | Exports `atPath` and `writePath` for `write-frames.ts`, and `nestedSchema`, the one-field nesting `field-index.ts` › `liftField` and `_writeFieldValue` share (PR 4). Nothing else changes; a write on What This Card Changes uses a frame whose workspace is the line's own destination.                                                                                                                                                                                                                                                                                           | 4                   |
| `hass-localize.ts`               | Unchanged; both feeds wrap through `withCardActionLabels`, the steady one keyed differently (section 3.6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 3                   |
| `localize.ts`                    | Unchanged. `computeAliases` (#834) feeds the search index as it feeds today's filter (PR 8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 8                   |
| `filter.ts`                      | Keeps `withholdInertFields`, `hasFields`, `countFields`, `isHeading`. #834's group opening (`openMatches`, `openMatching`) retires with in-place filtering in PR 8, where results become rows; its `holdsValue` rule (a blank or null is not stored) moves to `plan.ts` › `storedAt` in PR 14; `isStored`, `isSetByCard` and the rest of Essentials Only and Customized Only go in PR 15. Matching moves to `search.ts` (PR 8).                                                                                                                                                     | 8, 14, 15           |
| `essentials.ts`                  | Retired; the registry's `'essential'` replaces both sets, and `prefs.ts` removes the stored key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 15                  |
| `subforms.ts`                    | `chassisSchemas` gains the Add Calendar picker, the entry's Calendar picker and the Calendars filter field; loses the two switches in PR 15. `CHASSIS_STRINGS` gains the new prefixes (section 8).                                                                                                                                                                                                                                                                                                                                                                                  | 5, 10, 15           |
| `quick-setup.ts`                 | `isFreshCard(raw)` for the banner (PR 5); its preview session moves to `preview.ts` unchanged (PR 12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 5, 12               |
| `ha-form.ts`                     | `Selector` gains `entity.exclude_entities` (Add Calendar) and `text.multiple` (word lists); `ha-form`'s `error` property is typed for the unreadable-pattern flag.                                                                                                                                                                                                                                                                                                                                                                                                                  | 10, 12, 19          |
| `styles.ts`                      | Rows, pages, strips, chips, swatches, Add rows, gate lines, the scope control, the grab state. Theme variables only (`--primary-color`, `--divider-color`, `--secondary-text-color`, `--primary-text-color`, `--card-background-color`, `--secondary-background-color`, `--error-color`, `--warning-color`). 44 px targets; reduced motion; no sticky.                                                                                                                                                                                                                              | 5-19                |
| `strings.ts`, translations       | Section 8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | all, 20             |
| `scripts/check-i18n.mjs`         | Section 8.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 1, 5, 6, 10, 11, 17 |
| `scripts/load-editor-schema.mjs` | Exports `PAGES`, `OVERVIEW_FIELDS`, `ENTRY_GROUPS`, `FAMILIES`, `GATES`, `ENTRY_GATES`, `corpus` and `schemaCtx` (PR 1, built) and `SWATCH_TOKENS` (PR 11).                                                                                                                                                                                                                                                                                                                                                                                                                         | 1, 11               |
| `AGENTS.md` (Editor section)     | A write's owner by key, focus after Remove, and the keys moving with the picker's `apply` (PR 4); `views/` (PR 5); pages own headings and placement, replacing _Sub-headings are `constant` nodes_ and _Where a new option goes_ (PR 6); the calendar list replacing _The picker shows calendars_ (PR 10); the shown-set rule and one reset path (PR 15).                                                                                                                                                                                                                           | 5, 6, 10, 15        |

### 4.3 What Retires

`ha-expansion-panel` (PRs 10 and 18), `ha-svg-icon` (PR 5), in-place panel filtering (PR 8),
Customized Only and Essentials Only with `essentials.ts`, `filter.ts` › `filterSchema`,
`filterEntitySchema`, `filterButtonSchema` and the `calendar-card-pro-editor-essentials-only`
browser key (PR 15), the calendar picker `schemas/calendars.ts` › `buildCalendarsSchema` with
`synthetic.ts` › `SYNTHETIC_FIELDS.calendars` (PR 10; its `derive` and `apply` go together, as
AGENTS.md demands, and the overview list takes over both jobs), the separate accent-mode and color
fields as two controls (PR 11; both stay in the schemas, drawn as one control), and the
`value_source.inherited`, `.default` and `.own` notes (PR 15, replaced by state words;
`value_source.card` and `value_source.reset` stay).

## 5. Behavior

Where a rule below quotes ia-final, ia-final is the authority; candidate A applies where ia-final is
silent, and the decision mockups and the prototype settle what both texts leave open. Each rule names
its source.

### 5.1 The Shown Set

For a field `f` at workspace `w` (ia-final §5, rules 1-3), `plan.ts` › `fieldState` computes:

```text
live(f) = applicable(f) and (essential(f) or stored(f) or inheritedDifferent(f) or added(f) or every)
```

| Term                    | How it is computed from today's code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applicable(f)`         | `f` is in the present index: its builder built it for this configuration and `w`, and `filter.ts` › `withholdInertFields` kept it. The builders' gating stays the one authority on presence [read].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `essential(f)`          | The registry places it as `'essential'`, as a mode value (`{ with }`, present only when its builder's mode needs it), as a chip, or as a button row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `stored(f)`             | `storedAt(raw, f, w)`: one of `f.configKeys` holds a value at `routing.ts` › `destination(key, w)` inside `_rawConfig`, following `f.dataPath` (`toolbar.legend` reads `raw.toolbar.legend`), where holding a value means present and neither `null` nor empty, #834's `filter.ts` › `holdsValue`; or `_pending` holds text under `routing.ts` › `pendingKey(name, w, dataPath)`. Read from the YAML as stored, never from `_config` (it carries every default), from the view blocks the editor re-serializes for labeling (they drop a line equal to its default, such as `column: { event_font_size: 14 }`, which #834 found hiding a stored line), or from `_authoredRootKeys` (a superset of what is stored) [read]. |
| `inheritedDifferent(f)` | Only in a layout scope: `routing.ts` › `valueSource(config, w, name)` is `'inherited'` and the top level of `_rawConfig` stores one of its keys with a value different from the card's default, as the prototype's `isShown` decides. A top-level value a layout ignores because the layout defaults differently (`'default'`) does not apply, so it does not make the field live; its state words say so when the field is shown.                                                                                                                                                                                                                                                                                        |
| `added(f)`              | `f.id`, or `family:<id>` for its family, is in the element's `_added` set. On an entry page the key is `entry:<entry key>:<id>` or `entry:<entry key>:family:<id>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `every`                 | The Show Every Setting preference (section 5.10). It only ever adds; it never hides.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

The other states, also from `fieldState`:

- **Add**: applicable, not live. Listed in its heading's Add row (section 5.2).
- **Gated**: in the universe for `w`, not present, nothing stored. Named in its heading's gate line,
  by the first prerequisite of its gate that is not met (`gates.ts` › `firstUnmet`).
- **Inactive** (stored but not in use): in the universe for `w`, not present, and `stored(f)` holds
  here, or in a layout scope at the top level. Listed in the gate line with its value and Reset. A
  feature is never switched on to show it (rule 2).
- **Other layout**: outside the universe for `w`, inside another workspace's, and none of its config
  keys is written by a field in `w`'s universe. The key test matters: one option can be two ids,
  `layout:day_spacing` (All Layouts, List, Columns) and `separators:day_spacing` (Grid only)
  [probe], and Grid must not read "List adds here: Day Spacing". Named in the page's foot line.

**On an entry page**, `stored(f)` reads the entry's own object; for the two
`entities.ts` › `CALENDAR_OPTIONS` (`name`, `show_in_legend`) it reads every entry of the calendar,
as `entities.ts` › `toEntityFormData` does. `inheritedDifferent(f)` holds for every
`schemas/entity.ts` › `ENTITY_TRISTATE_VALUES` option that overrides a card setting, all eight of
them: `show_time`, `show_location`, `show_description`, `split_multiday_events`,
`multiday_banners`, `event_type`, `days_of_week` and `show_weather`, while the entry follows the
card and the card's effective value differs from the card's default. For `show_weather` the card's
counterpart is whether events get weather (`weather.position` of `event` or `both`), which differs
from the default `date`. The first revision left `show_weather` out as noise; ia-final grants no
such exception, so it is in.

**Today's Essentials Only already reads this way.** Since #834 it keeps the essentials plus every
setting the stored YAML holds, at the root, at a nested path, in the selected layout's block, in
each calendar and on each toolbar button (`filter.ts` › `isSetByCard` [read]): the essential and
stored halves of rule 1. The pages generalize it, with Add rows for the rest, and PR 15 carries its
test cases over (section 6). One case reads differently, by ia-final's rule rather than by choice:
in a layout's scope, a top-level line equal to the card's default keeps its field under Essentials
Only, while on the layout's page it is not live, because it neither is stored at the layout's
destination nor differs from the default; it is live in All Layouts, where it is stored.

**The added set** lives on the element (`_added: Set<string>`), outside the undo snapshot and
outside any storage: a session's choice of what to look at. Adding writes nothing (rule 3). The set
survives scope changes (keys are scope-free) and outside configuration changes; entry-scoped keys
are dropped when entry keys are reassigned (section 5.6), and a reset clears the keys it retires
(`reset.ts` › `reset`, `clearAdded`).

### 5.2 Headings, Add Rows, Gate Lines

Each heading of a page renders, in registry order, even when nothing under it is live (candidate A
§7): the card-owned `h3` (a `constant` node is not a heading to assistive technology [measured] §3),
its helper line where it has one (`HeadingDef.helperKey`, as Countdown & Progress shows in the D08
mockup), its live fields, its Add row, its gate line, and its stored-but-not-in-use lines. A heading
with no live field draws its Add row directly under the `h3`; where its title and the Add row would
stack with nothing between, the row carries the heading's name ("Event State · Add Setting", D04
mockup).

**The Add row** is a card-built disclosure (`button aria-expanded`), following the prototype's
`addRowHTML` and D02 A:

- **Closed**: "Add Setting", then as many of the hidden settings' names as fit in two lines (D02 A),
  joined with " · ", then, when some did not fit, the localized template `add.names_more`,
  "{names}, +{count}", which a translator can reorder and which inflects nothing (adopted over the
  D02 mockup's "· and 4 more", section 13, row B); and "Settings: 8".
  The names are fitted by measurement after render (`views/add-row.ts` measures each name's line
  with a `ResizeObserver` on the row and re-fits on resize); before the first measurement, and where
  layout is absent (happy-dom), the first four names show. Accessible name: "Add Setting under Time,
  Settings: 8".
- **Open**: a group named "Settings to Add under Time" holding **Show All** with "Settings: 8"
  (when there are two or more), a native filter box past seven items (never focused automatically),
  then one button per item: its label, the first sentence of its helper, its current value.
- **Families** (`compact_mode`, `past_days`, `weekend_colors`, `column_density`, `grid_density`,
  `replace`) are one item each, named by the family, adding every applicable member under the
  `family:<id>` key.
- **Picking one** adds its key to `_added`; the field appears under its heading in registry order;
  the list stays open with the rest; focus moves to the new field's wrapper (ia-final §9: never into a
  text input); "Added Time Font Size." is announced. Show All adds every item and announces "Showing
  every setting under Time."
- With Show Every Setting on, Add rows are not drawn.

**The gate line** groups a heading's gated fields by the condition they wait on, in the approved
design's words (candidate A §7; the D01, D02, D05, D08 and D12 mockups; section 13, row F):
`gate.line`, "Appears once {when}: {names}.", as in "Appears once Show Description is on: Show
Description For All-Day Events, Description Color." and "Appears once the forecast shows beside
events: Event Weather." When every field the gate holds back under the heading is stored, no name is
left to list, and the line reads `gate.line_bare`, "Appears once Show Description is on.", with the
stored lines after it. A heading whose every field waits on one gate shows only its line. Mode
values (`kind: 'mode-value'`) never get a gate line: their mode control says it.

`{when}` is a clause for the first unmet condition, the one `firstUnmet` picks, read by `gates.ts` ›
`whenText(gate, data, language, labelOf)` (PR 15): the condition's own clause (`Prereq.whenKey`),
else its gate's (`Gate.whenKey`), else, for a switch, `gate.when.on`, "{label} is on" ("Show
Description is on"), or, for a switch drawn as a chip from PR 18, `gate.when.pressed`, "{part} is
pressed" (the D08 mockup's "Appears once Progress Bar is pressed: …"). A condition on any other
control has a clause, its own or its gate's, and a test enforces it. Every clause is written to
follow "Appears once", so a language whose subordinate clauses end on the verb, German among them,
translates it in that order; the glossary records it.

PR 1's noun phrases stay as built: search names a withheld setting by them, "Needs Show Description"
and "Needs the Forecast Beside Events" in the D05 mockup's tags, through `needsText`. Every
`needsKey` gains a `whenKey` at the same level, and the five places where PR 1 names a condition
by the label of a control that is not a switch gain one too: four conditions and the
`location_icon` gate. The eight switch conditions (Show Time, Show Location,
Show Description, Show Countdown, Show Progress Bar, Show Month, Show Toolbar and Show Conditions
Beside Events) read through `gate.when.on`; Show Countdown is on for `true` and `once_per_day`
alike.

| Gate or condition (`gates.ts`)                      | Noun, kept for search tags                 | Clause for gate lines, new in PR 15            |
| --------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `indicator_color`                                   | a Style other than None                    | a Style other than None is chosen              |
| `indicator_size`                                    | a dot, icon or emoji Style                 | the Style is a dot, an icon or an emoji        |
| `today_when_empty`                                  | Show Empty Days off                        | Show Empty Days is off                         |
| `empty_days`                                        | Show Empty Days or Show Today When Empty   | Show Empty Days or Show Today When Empty is on |
| `BY_DAY`, the forecast in the day header            | the forecast in the day header             | the forecast shows in the day header           |
| `BY_EVENT`, the forecast beside events              | the forecast beside each event             | the forecast shows beside events               |
| `event_details`                                     | Show Event Details as a tap or hold action | tapping or holding an event shows its details  |
| `open_links`                                        | both event actions set to Nothing          | both event actions are set to Nothing          |
| `compact_days`                                      | an Events limit under Compact Mode         | Compact Mode limits the events                 |
| `show_in_legend` (entry)                            | a calendar filter in the toolbar           | the toolbar shows a calendar filter            |
| `week_numbers`                                      | Numbering, its label                       | week numbers are shown                         |
| `duplicates`                                        | Filter Duplicates, its label               | duplicates are filtered                        |
| `HAS_WEATHER`, every weather gate's first condition | Weather Entity, its label                  | a Weather Entity is chosen                     |
| `label_icon_color` (entry)                          | Label Type, its label                      | the label is an icon                           |
| `location_icon` (entry), on the gate                | Show Location or Event Locations, by label | this calendar shows locations                  |

**A stored-but-not-in-use line** follows its gate line, as candidate A §7 and the D05 mockup draw
it: "Appears once Show Description is on: Show Description For All-Day Events. Stored but not in
use: Description Font Size (20px)", with **Reset** (named "Reset Description Font Size"); each
stored value gets its own line and Reset. In a layout scope, when the value lives at the top level,
the line reads "Stored but not in use: Description Font Size (20px), from All Layouts" and carries
**Edit All Layouts** instead, because a reset here could not reach it. Two complete templates,
`inactive.line` and `inactive.line_top`, neither assembled from a fragment; neither says what the
value waits for, because the gate line above it does. A mode value's stored line sits under its mode
control, which says it.

**The other-layouts line** at a page's foot, one per group of layouts that offer the same settings
here: "List and Columns add here: Now, Time Position, All-Day Badge, +7. Settings: 10." with **Edit
List**, which switches the scope (announced: "Now editing settings for List."). Two whole templates,
`other_layouts.one` ("{layout} adds here: {names}.") and `other_layouts.many` ("{layouts} add here:
{names}."), because the verb agrees with one layout or several; `{layouts}` joins with the
language's `Intl.ListFormat`, which the editor already loads (`element.ts` › `willUpdate`).

### 5.3 State Words, Reset and Remove

**Which words.** `plan.ts` › `stateOf` returns the prototype's `stateOf`, exactly:

| Field                        | Scope and storage                                              | Words                                                                                                                           | Beside the field                       |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| No per-layout copy           | On a whole-card page (Card & Header, Weather), stored          | "Set"                                                                                                                           | Reset or Remove                        |
| No per-layout copy           | All Layouts scope, stored                                      | "Set for All Layouts"                                                                                                           | Reset or Remove                        |
| No per-layout copy           | A layout scope                                                 | "Whole Card", or "Whole Card · Set" when stored                                                                                 | Reset or Remove when stored            |
| Per-layout copy              | All Layouts scope, stored at the top level                     | "Set for All Layouts"                                                                                                           | Reset or Remove                        |
| Per-layout copy              | All Layouts scope, a layout stores its own                     | the line "Grid Sets Its Own: 20" per such layout                                                                                | **Edit Grid**                          |
| Per-layout copy              | A layout scope, stored in its block                            | "Set for Grid", plus ", Same as the Default" when equal to Grid's default or the card's                                         | Reset or Remove, and the Reset outcome |
| Per-layout copy              | A layout scope that defaults differently, nothing in its block | "Grid's Default"; plus the note "The All Layouts value, 5, does not apply in Grid." when the top level stores a different value | none                                   |
| Per-layout copy              | A layout scope, inherited from a top-level value               | "From All Layouts"                                                                                                              | **Edit All Layouts**                   |
| Entry option                 | Stored on the entry                                            | "Set on This Calendar", plus " · Shared by Its Entries" for a calendar option with siblings                                     | Reset or Remove                        |
| Entry option                 | Following the card while the card's value differs              | "Follows the Card: Hide"                                                                                                        | none                                   |
| Card option entries override | Any scope, one or more entries store their own                 | the line "Set on Calendars: Ben, Bin Day", one link per entry                                                                   | the links                              |
| Anything else                |                                                                | nothing: a field says nothing until something is stored (candidate A §6)                                                        | none                                   |

"Grid's Default" therefore shows on every field Grid defaults differently when Grid stores nothing,
whether or not the top level stores a value; the first revision showed it only in the second case,
which was quieter than approved.

**The Reset outcome** (D04 A: "Reset gives Grid's Default, 12px, not the All Layouts value, 14px").
For a field stored in the current scope, `plan.ts` › `resetOutcome` computes what applies once the
line is gone, as the prototype's `without` does: the layout's default, else the top-level value,
else the card's default. It is shown in the line beside Reset, and is the Reset button's
`aria-describedby` target (same shadow root, so the reference is legal):

| What returns                                       | Text                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| The layout's default, a different top value stored | "Reset gives Grid's Default, 12px, not the All Layouts value, 14px" |
| The layout's default                               | "Reset gives Grid's Default, 12px"                                  |
| The top-level value                                | "Reset gives the All Layouts value, 14px"                           |
| The card's default                                 | "Reset gives the default, 12px"                                     |
| On an entry, the card's value                      | "Reset follows the card: 12px"                                      |

**Where the words go** is decided by selector, from the measured accessibility tree [measured] §3,
which the design review accepted:

- `text` and `number` in box mode (120 fields): prefixed to `computeHelper` ("Set for Grid. " plus
  the helper). The helper is the field's accessible description and renders under the field, where
  the D04 mockup draws the words.
- `boolean`, dropdown `select`, `icon`, `entity`, `ui_action`, and anything not measured (number in
  slider mode, `object`): appended to `computeLabel` ("Show Location · Set for Grid"). The label is
  the control's accessible name; for a dropdown, icon and entity it is followed by the value. On a
  boolean the helper already folds into the name, and on `ui_action` the helper is not exposed at
  all.
- Box-mode `select` exposes neither label nor helper, so no built schema may use it. Its one user
  today, Card Displays (`schemas/layout.ts`, `view`), becomes a card-built radio group in PR 5, which
  also gives it the accessible name it lacks today. `tests/editor-page-registry.test.ts` asserts no
  built node has `select.mode: 'box'`.
- The words appear once on screen, inside the form. The card-built line under the form carries the
  decorative mark (filled dot, ring or card glyph, `aria-hidden`), the extras ("Grid Sets Its Own:
  20", "Set on Calendars: …"), the Reset outcome and the action buttons.
- A dropdown's floating label may truncate once words are appended [unverified: PR 15's live review
  checks the longest German words at 362 px]. The fallback keeps the control-level association the
  design review called for: the words stay in the label, where the control's name needs them, and
  are repeated visibly in the line under the form with `aria-hidden`, so a truncated label hides
  them neither from sight nor from a screen reader.

**Reset and Remove** (candidate A §7, table):

- An essential field stored here gets ↺ **Reset** ("Reset Day Spacing", "Reset Day Spacing for
  Grid"); it deletes the line at this scope and the control stays.
- A non-essential field stored here or added this session gets ✕ **Remove** ("Remove Day Spacing for
  Grid and Reset It"); it deletes the line, removes the field from `_added`, and the field goes back
  to its Add row. `plan.ts` decides between the two by evaluating `fieldState` on the state
  `reset.ts` › `reset` would produce: when the field would still be live (it still inherits a value
  that differs), it gets Reset, never Remove, so a value that applies is never hidden (rule 1).
- A mode control's Reset or Remove resets the mode and every field it governs, through every key in
  the synthetic's `configKeys` (R6).
- **A family** shown on a page carries one ✕ on its heading, "Remove Compact Mode and Reset It" (the
  prototype's `remove-family`): `reset.ts` › `reset({ kind: 'family' })` deletes every member's line
  at this scope and clears `family:compact_mode` from `_added` in the same step, one undo entry,
  announced "Removed Compact Mode and reset it." On an entry page the same with `entry-family`.
- Every reset is one undo step and goes through `reset.ts`, which updates the raw configuration, the
  authored root keys, `_gridResetKeys` and pending text together, as `_resetViewValues` does today;
  the result is written through `_report`, so minimization applies, and the next unrelated edit
  cannot write an authored default back (`tests/editor-keeps-authored-defaults.test.ts` keeps
  passing unchanged).
- **Focus after Reset**: the field's wrapper (section 3.3). After Remove, or a Reset that removes
  the control: the heading's Add row, which now names the setting; else the heading (ia-final §9).

### 5.4 Undo and Redo

**Recorded.** `_commit(label, coalesceKey, run)` wraps every write: form edits (`_report`), card-built
controls (`_writeFieldValue`), resets, Remove, list actions (add, duplicate, move, remove, re-point,
paste), Split's Apply, Quick Setup's Apply (one entry from the session's opening snapshot),
`_moveMisplaced`, a deprecated option's Move, Reset All, a Card Displays switch together with its
Grid reconciliation, and **the migration choice for pre-v5 cards**. An entry is recorded only when
the stored configuration changed (`value.ts` › `equalConfigs` on `before.raw` and `after.raw`).

**The migration choice is an undo step.** Its `before` snapshot holds the un-migrated raw
configuration and `_migration: { kind: 'choice', keys }`; undoing it restores both, so the choice
screen shows again and the YAML is back as it was. `setConfig` recomputes the migration state from
the raw configuration on every call, echoes included (`element.ts` › `_migrationState` [read]), so
Home Assistant's echo of the restored configuration lands on the same choice screen. An automatic
migration, which happens inside the first write (`element.ts` › `_prepareForWrite`), is part of that
write's `before` snapshot, so undoing the first write restores the un-migrated YAML exactly.

**Not recorded.** Previews (Quick Setup's and Split's), Add (it writes nothing), scope changes and
navigation (they are restored with the entry they belong to).

**The snapshot** is `history.ts` › `Snapshot`: `structuredClone(_rawConfig)` (the editor's local
truth, which `_report` updates before dispatching [read]), the authored root keys, `_gridResetKeys`,
`_gridReconciliation`, `_pending`, `_migration` (the type moves out of `element.ts`), entry keys and
button keys. `Where` holds the route, the scope and the focus key of the control that made the
change.

**A state-policy test** (`tests/editor-undo-state-policy.test.ts`, R29) enumerates the element's
fields at runtime, so a field added later cannot hide: `Object.keys` on a mounted editor for plain
fields, plus the class's `elementProperties` for Lit's reactive state, which lives behind prototype
accessors and is invisible to `Object.keys`. It fails on any field not classified as snapshotted (the
eight above), restored through `Where` (`_selectedWorkspace`, `_nav`), session UI state (`_added`,
`_addedButtons`, `_prefs`, `_quickSetup`, `_split`, `_drafts`, `_wordModes`, `_grab`, `_filter`
until PR 15, `_openPanels` from PR 3 until PR 18, `_firstRunBanner`), a key counter that never goes back (`_nextButtonKey`,
`_nextEntryKey`), a cache (`_emittedConditions`, re-keyed by entry key in PR 10; `_intlLanguage`) or
derived (`_config`, `_lastDispatched`, `_essentialsHidden` until PR 15).

**Restore** (`_restore(snapshot)`, used by Undo and Redo): set every snapshotted field, rebuild
`_config` as `setConfig` does, set `_lastDispatched` to the snapshot's raw configuration, and
dispatch `config-changed` with a clone of it, bypassing `toStoredConfig`, so a pruned deprecated key
or an authored default comes back byte for byte. Home Assistant's echo is then recognized by the
existing `isEcho` test in `setConfig` and changes nothing.

**Coalescing.** Typing in one text or number field coalesces: same field id and scope, under 800 ms
since the last record, no other write between. The newer entry keeps the older one's `before`.

**Controls and keys.** Undo and Redo icon buttons (48 px) on the overview's search row and in every
page header, named "Undo: Remove Ben" and "Redo: Change Event Font Size" while enabled, "Undo" and
"Redo" when not (Home Assistant's own `ui.common.undo` and `ui.common.redo` first [unverified: key
names on 2026.11, PR 7], the card's strings as fallback). Keys, only when the composed path holds no
editable element (`input`, `textarea`, `[contenteditable]`, roles `textbox`, `combobox`,
`spinbutton`, `searchbox`): Ctrl/Cmd+Z undoes; Ctrl+Y and Ctrl/Cmd+Shift+Z redo; Home Assistant's
Ctrl+Shift+Y is left alone (ia-final §9). A handled key gets `preventDefault()` and
`stopPropagation()`. At most 75 entries; cleared by any configuration the editor did not send.

**After Undo or Redo.** The entry's route and scope are restored first when they differ (an undo
that removes the open entry's page returns to the overview; an undone migration returns to the
choice screen). Then focus goes to the restored field's **wrapper**, never into its control, so a
second Ctrl/Cmd+Z still reaches the editor; for a restored calendar or button, its row's Edit
button. When the field or row is gone, or Undo became disabled with focus on it, focus goes to the
page's heading (ia-final §9; the prototype's `afterHistory`). Announced: "Undid: Remove Ben." and
"Redid: Remove Ben."

**The status bar.** Removing a calendar entry or a toolbar button, splitting, and applying a story
show a persistent line, "Removed Ben · Undo", "Applied Family Hub · Undo", that stays until the next
change (Split's is its completion panel, section 5.7). Focus moves to its Undo button. When it
closes, focus goes to the next row, else the list's heading.

### 5.5 Focus, Escape and Keys

Focus follows ia-final §9's table, with these mechanics:

| Transition                       | Mechanics                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a page                      | Section 3.4: focus the card-owned `h2` in the render's `updateComplete` continuation [measured] §4                                                 |
| Back                             | Restore `scrollTop`, then focus the trigger by `data-focus` key; when gone, the list's heading, and announce why ("Ben is no longer on the card.") |
| Promote from an Add row          | Focus the field's wrapper (`tabindex=-1`, named after the field)                                                                                   |
| Reset, Remove                    | Section 5.3                                                                                                                                        |
| Remove an entry or a button      | Section 5.4, the status bar                                                                                                                        |
| Undo, Redo                       | Section 5.4: the wrapper, never an input                                                                                                           |
| Apply a story                    | The "Applied Family Hub · Undo" bar; else the Calendars heading                                                                                    |
| Move Up, Down, to Top; Alt+Arrow | The moved row's handle; announce "Moved Ben to position 2 of 5." (the prototype's words); when Move Up becomes disabled at the top, the row itself |
| Keyboard grab                    | Focus stays on the handle throughout (section 5.11)                                                                                                |
| Add Calendar                     | Choosing in Home Assistant's picker does nothing; **Add** adds the calendar and opens its page (WCAG 3.2.2); its helper says so beforehand         |
| Duplicate                        | The copy's page opens with its heading focused and the same-events warning above its groups (section 5.6)                                          |
| Split's Apply                    | The completion panel (`tabindex=-1`), its message also announced through the queue, section 5.7                                                    |
| Search result chosen             | The field's wrapper, highlighted for 2 s, with Return to Results above it                                                                          |

**Escape.** One `keydown` listener on the editor's render root (`views/keys.ts` › `escapeAction`,
DOM-free except for reading the path), built on what the probe measured:

1. **Is an HA overlay on the path?** Take `event.composedPath()`, cut it at the editor's host
   element, and look for an element whose `getRootNode()` is not the editor's own shadow root and
   that has `role` `menu`, `listbox`, `dialog` or `alertdialog`, is an open `<dialog>`, or matches
   `:popover-open`. If so, call `preventDefault()` and `stopPropagation()` and do nothing else. In
   practice Home Assistant's dropdowns, entity, icon and calendar pickers close themselves on the
   first Escape and stop it, so the listener never sees it, and `defaultPrevented` cannot tell the
   two kinds apart [measured] §1. Ancestors above the editor always carry an open `<dialog>` and
   `[open]` hosts, so nothing above the host is looked at [measured] §6. `:popover-open` throws in
   browsers without the Popover API (Safari 15.4 is a target), so it is tested inside `try`.
2. **Close the innermost editor disclosure**, read from editor state, never from `aria-expanded` in
   the DOM (a disclosure's button is not on the path while focus is inside its content [measured]
   §6). Innermost first: a keyboard grab (Escape puts the row back, section 5.11), an open color
   panel, a row's action strip or the ⋮ menu, an open Add row, the Add Calendar flow, an own button
   expanded in place, the Split task (Escape is Cancel, which restores the opening configuration).
   Focus returns to the disclosure's trigger.
3. **On a page, go Back.** In Quick Setup, its own Back (on the first step, Cancel).
4. **On the overview with a query, clear it** and focus the search field.
5. **Otherwise let Escape through**, untouched, and Home Assistant closes the dialog [measured] §1.

Every case that acts calls **both** `preventDefault()` and `stopPropagation()`: either alone lets the
dialog close [measured] §1. The probe ran this rule as `guards.v1` and the dialog stayed open through
a disclosure close and a Back. Not measured, and checked in PR 5's live review: Escape while a picker
opens as a bottom sheet at narrow widths, and WebKit's handling of a canceled Escape inside a modal
`<dialog>`.

**Other keys.** On a row's drag handle, Space picks the row up and drops it, the arrow keys move it
while it is held (section 5.11). Alt+ArrowUp and Alt+ArrowDown move a focused calendar row or
own-button row without picking it up (never from inside a text field). Enter and Space activate
rows, chips and swatches as native buttons do; arrow keys move within a radio group and the swatch
grid. No other key is bound.

**Announcements.** One polite live region, owned by `announce.ts`: messages queued in one update are
joined, so a removal, a result count and a scope change in one update are all spoken (ia-final §9).
It is the only live region the editor draws. Text that is also shown, the keyboard grab's status
line under the list (the D10 mockup draws it with `role=status`), search's result count and Split's
completion panel, is plain visible text, and its words reach a screen reader through the same queue,
so two regions never speak over each other.

### 5.6 Calendars

The calendar list and entry pages follow the D03 and D10 mockups and the prototype's
`calendarsHTML`, `stripHTML` and `entryHTML`. Quoted names below are the mockups' accessible names.

**Entry keys.** `_entryKeys: number[]` parallels `config.entities` as `_buttonKeys` parallels the
toolbar's buttons today (`element.ts` › `_buttonKeysFor`). PR 4 introduces it for the owner-aware
frames (section 3.7); every list operation in `calendar-list.ts` moves keys with their entries, a new
entry takes `_nextEntryKey++`, and a configuration the editor did not send reassigns keys by
position. An entry page's route holds the key, so moves, removals elsewhere and undo never open the
wrong entry. As built in PR 4 on today's panels: Duplicate gives the copy a new key and Remove
takes the removed entry's away; the calendar picker, Quick Setup's previews, Apply and Cancel, and
the echo of the editor's own write carry keys by calendar and order (`write-frames.ts` ›
`carryEntryKeys`, which mirrors the picker's `apply`); a configuration the editor did not send
keeps each place's key; and `_entryKeysFor` follows by place a list whose length moved some other
way.

**A calendar with one entry** is one row: the drag handle (section 5.11), a color dot
(`aria-hidden`), the label, the calendar's name (`name`, else `entities.ts` › `entityDisplayName`),
and a summary of at most two parts from `calendar-list.ts` › `rowParts`, in this order of
preference: "All-day events" or "Events with a time"; "Only: School, PTA"; "Without: Private";
"Weekdays" or "Weekend days"; "Expires at 18:00"; "Shown under conditions"; "All events" when none
applies. "Set: N" follows (`setCount`: the entry's stored options other than `entity`). The row's
body is a button named "Edit Anna, Without: Homework, Set: 4"; a second button, ⋮ "Actions for
Anna", opens the row's action strip in place.

**A calendar with several entries** gets a calendar row of its own: the one drag handle for the
whole calendar ("Move Family"), the name, "Entries: 2" and ⋮ "Actions for Family". Its entries sit
under it, indented, without handles, each titled by its parts ("All-day events", "Events with a time
· Without: Private") with "Set: N", and each named with that distinguishing summary and its
position: "Edit Family, All-day events, Set: 3, entry 1 of 2" and "Actions for Family, All-day
events". Moves act on a whole calendar (candidate A §5; the D10 mockup's one handle per calendar),
and nothing reorders the entries inside one. That order is not invisible, as the second revision
claimed: when two entries of a calendar keep the same event, the card draws a copy per entry, and
with Filter Duplicates on the first entry's copy wins, so its color and label draw the row
(`events.ts` › `processEvents`, `groupEventsByDay`'s `firstEligible` [read]; the re-review
reproduced red winning before a reversal and blue after; `docs/guide/one-calendar-many-purposes.md`
already tells readers overlapping blocks are "styled by the first of them"). Grouping keeps each
calendar's entries in their relative order, and PR 9 tests the winning `_matchedConfig` and the
drawn color. The first revision's independently movable entries are gone.

**The strip** opens in flow under its row, stays open after a move and travels with the row:

| Row                         | Actions, with their accessible names                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A calendar with one entry   | Move Up, Move Down, Move to Top ("Move Anna up", "… down", "… to the top"), Duplicate ("Duplicate Anna"), Copy Settings ("Copy settings from Anna"), Paste Settings ("Paste settings into Anna"), Remove ("Remove Anna") |
| A calendar's row in a group | Move Up, Move Down, Move to Top ("Move Family up", …), Remove ("Remove Family, Entries: 2")                                                                                                                              |
| An entry in a group         | Duplicate ("Duplicate Family, All-day events"), Copy Settings, Paste Settings ("Paste settings into Family, All-day events"), Remove This Entry ("Remove Family, All-day events")                                        |

Move Up and Move to Top are disabled at the top, Move Down at the bottom. Copy Settings is disabled
when `entities.ts` › `hasTransferableSettings` is false. Paste Settings reads "Copy settings first"
beneath it while `copiedSettings()` holds nothing and "From Ben" once something is copied; Copy keeps
today's cross-dialog store (`copySettings`, `pasteSettings`). Every operation writes `entities`
grouped, in first-occurrence order, as one undo step.

**A calendar Home Assistant no longer has** (no `hass.states[entityId]`) shows a warning icon and
"Not found in Home Assistant" as its first summary part, on its row and under its page's header
(candidate A §5). The editor's `hass` key covers the calendars' states (section 3.6), so the warning
appears and clears live.

**"Filter Calendars"**, a native input above eight or more rows, matches names, labels and summaries,
folded as search folds them (section 5.8).

**Add Calendar** (the prototype's `addCalHTML`; ia-final §9's row) opens Home Assistant's `entity`
selector in place, domain `calendar`, with `exclude_entities` listing the calendars already on the
card [unverified: that 2026.11's selector honors it; PR 10 checks, and the fallback is the line
"Anna is already on the card." with **Open Anna**]. Its helper says what will happen before anything
does: "Choose a calendar, then press Add: it joins the card and its page opens." **Cancel** and
**Add** follow, Add disabled until a calendar is chosen. Choosing announces "Chose Anna. Add puts it
on the card and opens its page." and moves focus to Add; Add adds the entry, records one undo step
and opens its page (WCAG 3.2.2). With no calendars at all: "No Calendars Yet" and "Add the calendars
this card shows." above Add Calendar (D06 mockup).

**An entry's page** (`views/page.ts` with `ENTRY_GROUPS`; the D12 and D13 mockups):

- **Header**: Back ("Back to the overview"), the calendar's name, a subtitle with the entity id
  and, inside a group, "Entry 1 of 2" (today's `entity.occurrence`, kept), Previous Calendar and Next
  Calendar ("Next calendar: Ben", in list order across every entry, disabled at the ends; they
  replace the trail's top, so Back still returns to the overview; "Showing Ben." is announced), Undo,
  Redo and ⋮ "Actions for Ben". The ⋮ holds Split This Calendar first, then the strip's actions for
  this entry, with the keys beside the moves ("Move Up Alt ↑") as the D12 mockup draws them; the
  calendar-level moves appear when the entry is its calendar's only one.
- **Under the header**: Return to Results when reached from search, the missing-calendar warning,
  the Duplicate warning, Split's completion panel, the repoint notice, and Settings For (section
  5.10).
- **Calendar**: Home Assistant's entity picker, helper "The calendar this entry reads. Picking
  another keeps this entry's settings."
- **Groups**: **Name & Look** (name, label type, label, the composed Accent Color of section 5.9; in
  its Add row Event Color, Show in Calendar Filter, Text Scale), **Who Sees It** (the guarded
  `ha-card-conditions-editor`, with today's YAML fallback), **Which Events** (first the row "Split
  This Calendar · All-day and timed apart, or by words", then days of the week, event type, expiry,
  the word lists with Match Against after them, and the compact budget), **Text Replacement**
  (family `replace`), **Multi-Day Events**, **Event Details** (per-calendar time, location, location
  icon, description, weather). Each group follows sections 5.1-5.3.
- **Foot**: a danger button, "Remove Anna", or "Remove This Entry" inside a group, then Back.

**Duplicate** (candidate A §5's worked example; the prototype's `duplicate`): the copy lands right
after the original, inside its group, with a new key; its page opens, replacing the trail's top when
Duplicate was used on an entry page, with focus on its heading and the warning "Both entries show the
same events until one sets Event Type or a word list, so each event shows twice for now." above its
groups; "Duplicated Anna." is announced. Back returns to the overview at the original's row.

**Remove**, from a strip or the page's foot: the overview opens, the status bar "Removed Anna ·
Undo" (or "Removed Family · Entries: 2 · Undo") stands where the row was, and focus moves to its Undo
(candidate A §5; no confirmation dialog).

**Re-pointing an entry** with its Calendar picker (`calendar-list.ts` › `repointEntry`, one undo
step): the entry keeps its own settings and moves to the end of the target calendar's group, so the
target's own entries keep their priority under Filter Duplicates. When that calendar already has
entries, the entry takes the calendar's shared name and Show in Calendar Filter
(`entities.ts` › `CALENDAR_OPTIONS` belong to the calendar, and the card reads them from its first
entry), and a one-line notice on the page says so: "Anna now reads Family, so it uses that calendar's
name and calendar filter setting." Otherwise the notice reads "Anna now reads Family." Both are
announced, and Undo restores the entry's own name and setting with its old calendar. Section 12
lists this policy and its alternatives.

**What retires.** The calendar picker (`schemas/calendars.ts` › `buildCalendarsSchema` and
`synthetic.ts` › `SYNTHETIC_FIELDS.calendars`, whose `derive` and `apply` leave together, as AGENTS.md
demands), the per-calendar `ha-expansion-panel`s, `entity.customised`, `entity.unconfigured`, and
`calendars.helper`'s sentence about dragging.

### 5.7 Split This Calendar

Reached from the entry page's ⋮ (first item) and from its row under Which Events (D12 A). A
card-built task inside the page (`role="group"`, named "Split This Calendar") with a stepper, "1 How ·
2 Colors · 3 Review", that says "Step 1 of 3" to assistive technology. The texts below are the D12
mockups'. Escape or **Cancel** restores the opening configuration.

**Step 1, How.** "Split Ben" and "Two entries take this one's place, each with its own color. Both
keep Ben's other settings and read calendar.ben; nothing changes in Home Assistant." Two radio cards:

- **All-Day vs. With a Time**: "One entry for all-day events, one for events with a time."
- **By Words**: "Events whose title, location or description contains certain words get one entry;
  every other event gets the other." Choosing it reveals **Match Against** (Event title, Location,
  Description; "Where to look for the words: Event title, Location or Description.") and **Word**
  fields, one word or phrase each, with **Add Word** and the helper "Events whose event title
  contains any of these words or phrases go to the first part; every other event goes to the second.
  One word or phrase per field."

**When it refuses** (`split.ts` › `refusals`; candidate A §5's table and the prototype's
`splitRefusals`). A refused method's card stays visible and disabled; its reason and a way out sit
inside it, in the shape of the D12 refusal mockup (adopted over the prototype's wording of the type
and budget refusals; section 13, row G):

| The entry has                                                                                            | All-Day vs. With a Time                                                                                                                                                                                                         | By Words                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An effective event type of all-day or timed, its own or the card's (`events.ts` › `resolveEventType`)    | **Refused**: "Can't split Bin Day into all-day and timed events: it already shows only all-day events, following the card's Event Type. Duplicate it to add an entry for events with a time." **Duplicate**                     | Allowed; both parts keep the type                                                                                                                                                                                                                                                       |
| Its own allowlist                                                                                        | Allowed; both keep it                                                                                                                                                                                                           | **Refused**: "Can't split Family by words: it already shows only events containing “School”. One entry keeps one set of words, so the two parts could not show exactly what Family shows now. Split All-Day vs. With a Time instead, or change the Allowlist first." **Edit Allowlist** |
| Its own blocklist that compiles                                                                          | Allowed; both keep it                                                                                                                                                                                                           | Allowed: part 1 keeps it and adds the allowlist; part 2's blocklist becomes `orPatterns(old, new)`. Match Against is locked to the entry's own field, with the note "Locked to Location, where this entry's Blocklist looks."                                                           |
| A blocklist or allowlist that does not compile the way the card compiles it (`new RegExp(pattern, 'i')`) | Allowed: both parts keep the same unreadable pattern, which the card ignores in both, so the partition by type still holds                                                                                                      | **Refused**: "Can't split Family by words: its Blocklist cannot be read, so the card ignores it, and the two parts would show some events twice. Fix the Blocklist first, or split All-Day vs. With a Time." **Edit Blocklist**                                                         |
| Its own Compact Events to Show                                                                           | **Refused for both methods**, as a warning above the cards that keeps Next disabled: "Can't split Ben: it has its own Compact Events to Show, which two entries would double. Clear it first." **Go to Compact Events to Show** | as left                                                                                                                                                                                                                                                                                 |

The unreadable-pattern row is the one the first revision missed: with `blocklist: "["`, a split by
the word "School" puts School events in both parts, because the card skips an unreadable pattern and
`orPatterns` keeps it unreadable (both reviews reproduced it against the card's
`filterEventsForEntity`). `word-lists.ts` › `compiles` decides it, building the pattern exactly as
the card does. The way-out buttons go to the field with the field highlighted, and the field itself
shows "This pattern cannot be read, so the card ignores it." (section 5.9). `filter_duplicates`
needs no refusal: `deduplicateEvents` matches by entity id on the id's first occurrence (AGENTS.md).

**Step 2, Colors and Labels** (D12: "a color and a label for each part"). "Both parts keep the name
Ben, which every entry of a calendar shares. The calendar list and the card tell them apart by what
they show and by these." Then one card per part, **All-Day first** (by words, the worded part
first): "Ben · All-day events" (or "Ben · Only: Training", "Ben · Without: Training"), "Part 1 of 2",
the composed Accent Color control of section 5.9, and a **Label** field prefilled with the original's
label. Part 1's color is the original's ("Ben's color now."); part 2's is `colors.ts` › `freeSwatch`,
the first swatch no calendar on the card uses ("Not used by another calendar on this card."). **Back**
and **Next**.

**Step 3, Review** (D12: "a review naming where the upcoming events land"). "Where Ben's upcoming
events land. Splitting writes both entries in one step, and Undo takes it back." One card per part:

- its dot and label, its title ("Ben · All-day events"), its rule and color ("Only all-day events ·
  Blue", "Event title contains Training · Blue", "Every other event · Teal");
- "Days Ahead: 7 · Events: 1", the plural-free form of the mockup's "Next 7 days · Events: 1"
  (adopted, section 13, row C);
- up to four events, "Sat 31 · Soccer Tournament" for an all-day event and "Tue 27 · 16:00 · Dentist"
  for a timed one, then "+3" when there are more (section 13, row B), or "No events in the days
  this card shows." (row G);
- by words, what the part writes: "Writes Allowlist: Training, matching the event title" and
  "Writes Blocklist: Training, matching the event title".

The note "Every event Ben shows now lands in exactly one part: none shows twice, none goes missing."
closes the step, with **Back** and **Split**.

- **Exactly the events the card shows for this entry in the displayed layout**, so the list never
  names an event the card would not draw. The second revision started at today and skipped the
  entry's own eligibility; with that window alone the mirror below disagrees with the card in 752
  of its 1,008 configurations.
- **The window** is the card's own (`split-review.ts` › `reviewWindow`): the displayed layout's
  configuration (`config/view.ts` › `resolveEffectiveConfig`), its first day of the week resolved as
  the card resolves it (`utils/format.ts` › `getFirstDayOfWeek(first_day_of_week, hass.locale)`),
  the start from `start_date` in every form the card accepts, mirrored from `events.ts` ›
  `getTimeWindow`: none (today), a relative expression such as `today+1`, `start_of_week` or
  `monday` (`utils/start-date.ts` › `parseStartDateExpression`), an ISO date-time, or a fixed
  `YYYY-MM-DD`, an impossible or unreadable one falling back to today; and the end that layout's
  `days_to_show` later (`groupEventsByDay`'s `windowEnd`) [read].
- **The events** come from `split-review.ts` › `readUpcoming`, through the REST path the card itself
  uses, `calendars/<entity_id>?start=…&end=…` with `hass.callApi('GET', …)` (`events.ts` ›
  `fetchEvents` [read]), for that window, with a 15 s timeout.
- **The eligibility** is the card's per-entry pipeline before the split (`split-review.ts` ›
  `shownOn`), mirrored from `events.ts`: the events `keepWellFormedEvents` keeps; the entry's event
  type and word lists (`entryKeeps`, mirroring `resolveEventType`, `filterEventsByType`,
  `filterSubject` and the allowlist and blocklist passes of `filterEventsForEntity`, an unreadable
  pattern skipped); then, row by row as the layout draws them (one row per event, one per day where
  the entry's or the card's `split_multiday_events` splits it, one per day in Grid), the window's
  bounds, the past rule while `show_past_events` is off (a timed row past its end, an all-day row
  past its expiry, the entry's `allday_expires_at` or midnight after its last day, a timed event's
  middle days at midnight), and the entry's `days_of_week` over the row's display day with the
  weekend Home Assistant's country or language defines (`utils/format.ts` › `isWeekendDate`) [read].
  An event is listed once, on its first day that passes. Filters that act on the card's whole list,
  Filter Duplicates against other calendars, a card-wide compact budget and Skip First Events, act
  alike before and after a split and are not applied; an entry with its own compact budget is
  refused anyway. Events sharing a start are included, since the card draws a calendar listed
  more than once in the order it sent its events, whichever entry kept them (PR 12's as-built
  note).
- **The assignment**: an event the original shows goes to the first part that keeps it
  (`entryKeeps`). Both parts keep every other option of the original, so a shown event lands in
  exactly one of them.
- **Visibility conditions**: the list is drawn as if the entry were visible, under the line "Both
  parts keep Ben's visibility conditions." Who sees the card is not something the editor can know.
- **Why a mirror.** Importing the card's own filter costs about 9 KB gzip -9 ([probe] section 2).
  The mirror reuses the card's small utilities (`start-date.ts`, four `format.ts` helpers,
  `resolveEffectiveConfig`, 227 B of its cost) and mirrors the rest; a test keeps it honest (below).
- **States**: "Reading Ben's upcoming events…" while the read runs; on failure or timeout, "Ben's
  upcoming events could not be read. The preview shows where they land." with each part's rule.
- **The preview supplements it.** From step 2 on, the split runs as a preview transaction
  (`preview.ts`, Quick Setup's mechanism), so the card beside the editor draws both parts in their
  colors and labels. Cancel and Escape dispatch the opening configuration.
- **Bytes.** The read, the window, the eligibility, the rows, the assignment and the day and time
  formatting measured +4,664 B raw and +1,819 B gzip -9 as a sketch at `9a1253b3`, before its
  template and strings ([probe] `split-review-mirror.js`). The second revision's window-less sketch
  was +671 B.
- **Agreement, measured.** Run beside the card's own `processEvents` and `groupEventsByDay` at a
  fixed Wednesday 11:30, the sketch named the same events on the same first day in all 1,008
  configurations (three layouts; no start date, `today+1`, `start_of_week`, `today-2`, `monday`, a
  fixed date and an ISO date-time; Monday and Sunday weeks; past events shown and hidden; no weekday
  filter, weekdays and weekends; splitting off and on; an expiry time or none), with 0 disagreements
  in each of the four DST zones. Planted defects disagree: the start fixed to today in 752
  configurations, no weekday filter in 556, no past rule in 136, a fixed first weekday in 64, the
  layout's block ignored in 568 ([probe] `split-mirror-check.mjs`).

**What it writes** (`split.ts` › `splitEntry`). Part 1 replaces the original in place and keeps its
entry key, so the page now edits it; part 2 is inserted right after it with a new key. Both copy every
option of the original. By type: part 1 `event_type: all_day`, part 2 `event_type: timed`. By words:
part 1 `allowlist: P` (keeping an existing blocklist), part 2 `blocklist: P`, or `orPatterns(B, P)`
over an existing blocklist `B`, where `P` is `word-lists.ts` › `toPattern(terms)`, with
`filter_field` on both when it is not the title. Then each part's label, and its accent color through
the accent mode as the color control writes it. One undo step, "Split Ben".

**After Split** (the prototype's `splitDoneHTML`; the D12 result mockup): a completion panel at the
top of the page, focused (`tabindex=-1`; its first line is announced through the queue): "Split Ben
into 2 entries. This page now edits the first." Under it both entries as rows (dot, label, "Ben ·
All-day events", the tag "New", "Set: 3"), each opening its entry's page (the first one only closes
the panel, since the page already edits it), then **Undo** and **Done**. The overview lists both
under Ben, tagged "New" for the rest of the session.

**Proof.** `tests/split-membership.dst.test.ts` runs the card's own `processEvents` and then
`groupEventsByDay`, the display copy every row is drawn from, for the original entry and for both
parts, over fixtures with timed, all-day and multi-day events, terms in each field, case variants,
RegExp metacharacters, an existing blocklist, and the unreadable `blocklist: "["` and
`allowlist: "("`. Each day's rows must be the original's events, attributed to the two parts, none
twice and none missing, in all four DST zones. A control case applies a by-words split to the `[`
entry anyway and must fail the assertion (School twice), proving the test can see the defect the
refusal prevents. `tests/editor-split-review.dst.test.ts` (named for the four zones it must run in)
runs the card's pipeline beside the mirror, as the probe did, and asserts that both name the same
events on the same first day. Its cases include at least: no start date (today), `today+1`,
`start_of_week` with Monday and Sunday weeks (Home Assistant's `first_weekday` and the card's own
`first_day_of_week` both), a fixed date, `days_of_week` weekdays and weekends with a Friday and
Saturday weekend country, an expiry time with past events hidden, a multi-day event split and not,
and a card whose `list:` and `time_grid:` blocks give different `days_to_show`, reviewed once with
List displayed and once with Grid. A planted mirror defect for each must fail it. The case table
lives in one helper (`tests/helpers/split-review-cases.ts`) that `tests/editor-split-review.test.ts`
also runs, card pipeline beside mirror, under the unit project's UTC, so that file carries every
case and the `.dst` file adds the four zones AGENTS.md asks a timezone test to run in.

### 5.8 Search

**PR 8, the jump list.** Typing in the overview's search field replaces everything below the search
row with a status line, "Results for “color”: 42" (the prototype's, adopted over the D05 mockup's
"“color” · Settings: 42", section 13, row E), its count announced through the
queue, "Values for Grid" when the scope is a layout (the D05 mockup), and the results. A result row
(the prototype's `resultHTML`; the D05 mockups):

- the label, with the match marked;
- a breadcrumb ("Events › Time", "Anna › Which Events");
- the current value, described the way the field shows it (option labels, On and Off, a color's
  name or "Not Set");
- the YAML path, always ("YAML: list.day_spacing", "YAML: entities[2].label"): "Search results and
  What This Card Changes always show paths" (candidate A §9, R56), whether or not Show YAML Option
  Names is on;
- from PR 15, its source words, the state words of section 5.3 ("Whole Card", "Grid's Default",
  "Set for Grid", "From All Layouts", "Set on Calendars: 6");
- from PR 17, the matched phrase of a helper-only match ("Help: “…the one kept, along with its
  color.”"), a status tag, and an explicit **Add** for a setting not shown yet (below).

Choosing a result opens its page at the field: scroll by arithmetic, highlight for 2 s, focus the
field's wrapper, announce "Showing Time Format.", and draw Return to Results above the field, which
restores the query, the list's scroll and the focused result (ia-final §6). Back does the same.
PR 8 indexes the present fields of every page and every entry with today's matching (`filter.ts` ›
`searchableText`: label, helper, #834's aliases, key and option text); in-place panel filtering
retires, and with it #834's opening of the groups a search keeps, whose promise (no match left
behind a closed heading) a list of rows keeps by construction.

**PR 17, the full search** (candidate A §8, ia-final §6):

- **Indexed text**, each weighted: the label in the editor's language and in English; the YAML key,
  current, qualified (`list.day_spacing`) and legacy (`src/config/config.ts` ›
  `DEPRECATED_CONFIG_MAP`: `max_events_to_show`, `vertical_line_color`, `horizontal_line_width`,
  `horizontal_line_color`, `row_spacing`); option labels and values; helper text; heading and page
  names; and #834's `<label key>.aliases` strings through `computeAliases`, in the editor's language
  or else in English, a page's on its title key. #834 shipped ten keys in nine families (`12h` and
  `AM/PM` for Time Format, `hide past`, `newest first`, `tomorrow`, `max events`, `exclude`,
  `include only`, `who sees`, `text size`, among others) with their words in all nine full
  languages, so six of the second revision's eleven example intents already work. PR 17 adds aliases
  under AGENTS.md's rule only, a word users have used that the search misses: the remaining
  examples, `separator`, `full width`, `colour` (the British spelling on purpose, for the color
  settings) and ia-final §6's `Ganztagsereignisse` and `Wochennummern` in German, each with its
  source cited in the PR, about ten keys in all. The four panel titles that retire (Layout, Time
  Range & Content, Separators, Actions & Refresh) become the words of the pages that took their
  settings, as `page.*.aliases` or `panel.*.aliases` on the page's title key, about four more; PR 1
  chose this over a list of old titles in the registry.
- **Folding** (`search.ts` › `fold`), both sides: NFD, drop `\p{M}`, NFC, lowercase, then a table for
  what NFD leaves alone (ß → ss, ø → o, æ → ae, ł → l, đ → d, œ → oe), and `_`, `-` and punctuation
  to spaces. Korean is not folded, and filtering waits for `compositionend`. Tokens match in any
  order (AND), with a subsequence fallback; highlights map back to positions in the original text.
- **What it reaches**, each with its tag: live fields (no tag); fields not added yet (no tag, value
  "Not Set" or the default, and **Add**, named "Add Time Font Size, Events, Time", which adds the
  field and jumps to it, writing nothing); gated fields ("Needs Show Description"; choosing opens the
  page at the gating control, highlighted); other layouts ("Only in List and Columns"; choosing
  switches the scope, announced, then opens the page); stored-but-inactive values ("Not in Use ·
  Needs Show Description"; choosing opens the gate line with its Reset); every entry's fields; and
  the two jobs in Home Assistant's own tabs ("In Home Assistant's Layout Tab, Above This Editor",
  likewise Visibility; nothing opens).
- **Ranking** (the prototype's `search`): card settings, then per-calendar ones, then Home
  Assistant's tabs; within a tier, an exact label match before a prefix, a word start, a substring,
  all terms in the label, then key and alias matches, and helper-only matches last. Helper-only
  matches are kept, as the D05 manifest specifies ("6 of them match only in their help text and
  rank last"), not dropped as the prototype's `search` does once a label matches; each shows the
  phrase it matched. One field across several entries collapses into one result, "Calendar Color ·
  Calendars › Name & Look · Set on Calendars: 6" (or "Not Set on Any Calendar"), which expands into
  one row per entry with its value, its source words and **Go to Setting**. There is no result cap.
- **Edit Here**, on request, at any number of results (ia-final §6: "Edit Here turns a result set
  into live controls on request (not by a size cutoff)"; the prototype offers it whenever there are
  results). A toggle beside the status line, `aria-pressed`, reading "Show as a List" while on.
  Results that are fields, shown or not shown yet, become live per-field forms with their state
  words and Reset, each under its breadcrumb; the rest stay rows. Its cost is the number of mounted
  fields: "color" mounts about 42, about 30 ms on the Mac by the probe's per-field figure
  [unverified on a phone; PR 17's live review times it]. With D14 C, a search for "font size" with
  Edit Here gathers every size on one list. The first revision's 12-result cutoff and its test are
  gone.
- **No results**: "Nothing matches “xyz”." (today's `filter.no_matches`), the hint "Try fewer words,
  or an option name from YAML such as show_location.", and **Clear Search**, all announced.

### 5.9 Composed Controls

Card-built controls write through `_writeFieldValue(owner, fieldId, value)` (section 3.7), so
routing, synthetic fields, pending text, minimization and undo stay the forms' own, and an entry's or
a button's control writes to its owner, never to the card's root. Being card-built, each control
carries its state words in its own accessible name ("Countdown, Set for List"), as ha-form fields
carry them in `computeLabel`.

**Event-part chips** (D08 A, PR 18; the D08 mockup). At the top of Events, a group named "Event
Details" holds eight `button aria-pressed` chips, each bound to its field: Time
(`events:show_time`), End Time (`events:show_end_time`), Location (`events:show_location`),
Description (`events:show_description`), Countdown (`events:show_countdown`), Progress Bar
(`events:show_progress_bar`), Duration (`events:show_duration`) and Now
(`events:show_now_indicator`).

- **Which chips show** comes from layout availability: a chip is drawn when its field is in the
  universe for the scope (`field-index.ts` › `universeIndex`), so Now is absent in Grid and the line
  "Not in Grid: Now." says so.
- **Whether a chip can be pressed** comes from its gate (`gates.ts`): a chip whose field is in the
  universe but not present is drawn with `aria-disabled="true"` (still focusable, so its reason is
  read) and the caption "Needs Time" as its description. End Time and Duration therefore stay
  visible while Time is off, as approved, rather than vanishing with their fields.
- **Pressed** is the field's effective value in the scope (`routing.ts` › `workspaceFormData`), for
  a chip that is not disabled. Pressing writes the opposite value, one undo step.
- **Under the chips**: the source summary, the stored parts grouped by their state words ("Set for
  List · Countdown: On · End Time: Off · Now: Off"); the other-layout line; and the hint "Each event
  shows the parts that are pressed. A pressed part's settings follow below." There is no Reset per
  chip, as in the mockup: a part set back in the session leaves the YAML (minimization drops a line a
  write returns to its default), and What This Card Changes resets any stored one. Gate lines for a
  part's settings read "Appears once Progress Bar is pressed: …" (section 5.2).
- In PR 18 the eight fields' registry appearance becomes `{ chips: 'parts' }`; until then they sit
  under their headings as Appendix A places them.

**The toolbar** (D09 A, PR 18; the D09 mockup), on Card & Header under Toolbar: Show Toolbar, then
while it is on:

- **Controls**: a chip group of the six built-ins, Add Event, View Switcher, Reset, Refresh, Search
  and Date Navigation (four shortened labels are new strings), with the helper "Pressed controls show
  in the toolbar. Search needs Date Navigation."
- **Calendar Filter**: a card-built segmented radio group, Off · Menu · Chips, from `toolbar.legend`'s
  options and today's option labels, with today's helper under it, its state words in its name and
  its Reset beside it. Card-built rather than Home Assistant's `button_toggle` selector, which the
  D09 manifest names: the step 0 probe measured no accessible name for that selector, and box-mode
  select, its nearest measured relative, exposes none [measured] §3. Section 12 lists it.
- **Your Own Buttons**: a list (`role="list"`) of rows: the drag handle ("Move Kitchen Light"), the
  icon, the name or `buttons.ts` › `buttonTitle`, and the summary `buttons.ts` › `buttonSummary`,
  "Toggle · light.kitchen", "Navigate · /lovelace/shopping": the action's name through Home
  Assistant's own action labels with the card's shim (`hass-localize.ts` › `HA_ACTION_LABEL_PREFIX`,
  no new strings), then the entity, navigation path or URL. A row expands in place (`aria-expanded`)
  to Move Up, Move Down and Remove (today's `toolbar.buttons.*` strings) and the four fields Icon,
  Name, Entity and Tap Action, each a per-field form with owner `button(key)` on the live `hass`.
  **Add Button** adds a row already open and focuses its Icon field's wrapper (R15); Remove shows the
  status bar "Removed Kitchen Light · Undo". Reordering is section 5.11's, the same as calendars'.

**Colors** (D13 A, PR 11; the D13 mockups). One composed control replaces both the text field and
any mode field that chooses a color source, for every color field. `colors.ts` › `COLOR_SPECS` is
derived, never listed: `schemas/common.ts` › `color(name)` marks the nodes it builds, and a spec is
made for each marked field, absorbing its mode field where one exists:

| Field                                                                   | Rows above the swatches                | Writes                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| An entry's Accent Color (`calendar:accent_color_mode` + `accent_color`) | Follow the Card, Follow Home Assistant | mode `inherit` or `home_assistant`; a swatch or Custom writes mode `custom` and the value |
| The card's Accent Color (`events:accent_color_mode` + `accent_color`)   | Default, Follow Home Assistant         | Default resets both keys; Follow Home Assistant is today's `home_assistant` mode          |
| All-Day Badge Color (`allday_badge_color_mode` + `allday_badge_color`)  | Calendar Accent Color, Row Text Color  | the modes `accent` and `text`; a swatch or Custom writes `custom` and the value           |
| The five `ACCENT_TEXT_KEYS` and `weather.event.color`                   | Default, Calendar Color                | Default resets the key; Calendar Color writes `accent` (`ACCENT_TEXT_SENTINEL`)           |
| Every other color field                                                 | Default                                | Default resets the key                                                                    |

- **Closed**, the field shows a swatch of the effective color, its label and the choice's name
  ("Accent Color · Pink"), and a button `aria-expanded` opens it in place, named with its state words
  ("Accent Color, Pink, Set on This Calendar"). An entry's stored color gets ✕ "Remove Anna's Accent
  Color" beside it.
- **Open**, a radio group named after the field: the rows above, each with its description ("The
  card's Accent Color, Home Assistant's primary color"; "None set for Anna there, so it falls back to
  the card" or "Home Assistant's color for Anna: Teal"); then a group "Home Assistant colors" of 19
  round swatches (`colors.ts` › `SWATCH_TOKENS`: `red` through `blue-grey`, without `light-grey`
  and `dark-grey`), each a radio named by Home Assistant's own color name [unverified: key names on
  2026.11; PR 11 reads them from the frontend, and English fallbacks in `strings.ts` keep the names
  readable], showing its name on hover or a long press and a check when chosen, each writing
  `var(--red-color)` and so on; then **Custom…**, "Any color the card can draw: #e91e63, a CSS name,
  or a theme variable".
- **Custom** shows a text field, "Custom Accent Color", with a live swatch beside it (`aria-hidden`).
  It is drawn only while Custom is chosen or the stored value matches no other row.
- **A draft, not a write.** Text the card cannot draw stays in the editor's UI state (`_drafts`,
  keyed by owner, field and the destination the value would be stored at, `colors.ts` › `draftKey`,
  so a draft typed for Grid neither shows nor commits while List is the scope, though both edit the
  card's `events:event_color`), the swatch shows crossed out, the line "Not a color the card can
  draw" appears, and the last committed value stays in the configuration ("Kept until the text above
  is a color"). Text becomes a write the moment it is valid, coalesced like any typing. A draft
  survives closing the control and moving between pages, and clears when another row or swatch is
  chosen or a configuration arrives that the editor did not send. A value already stored that the
  card cannot draw (written in YAML) is shown as Custom with the same flag and is never rewritten by
  an unrelated edit.
- **Valid** (`colors.ts` › `validColor`) is `CSS.supports('color', text)` (a `var(--…)` reference
  included), or one of the card's own values where the card honors it: `accent` for the five
  `ACCENT_TEXT_KEYS` and `weather.event.color`, `home-assistant` for the two Accent Colors. In a
  test environment without `CSS.supports` it accepts, so typing is never blocked.
- **The YAML line**, always inside the open control: "YAML accent_color: var(--pink-color)", the
  configuration as written.
- **"Follow Home Assistant"** reads the calendar's registry color through the card's own module
  (`src/utils/entity-colors.ts` › `ensureEntityColors`, `entityColors`, `releaseEntityColors`), +124
  B gzip -9 [probe]. The editor's copy of that module keeps its own state, so it reads the registry
  once per page and subscribes while an editor is open, releasing on disconnect; AGENTS.md asks for
  exactly this check before shared mutable state crosses the bundle boundary, and the module's own
  generation counters already handle a late answer. Section 12 lists the static-text alternative.
- **Described values**: `colors.ts` › `describeColor` names a value for the closed control, search
  results and the audit: a swatch by its color name, a sentinel by its row ("Calendar Color"), a
  theme variable by name ("Primary Text", "Divider"), `color-mix(…, var(--divider-color) 50%, …)` as
  "Divider, 50%", anything else as written; an unset field with no default reads "Not Set" (the D05
  mockup's values).
- **Reconciled**: a test fails when a key of `Types.Config` or `Types.EntityConfig` ending in
  `color` has a field not built by `color()`, and `SWATCH_TOKENS` is pinned by value as a subset of
  `entity-colors.ts` › `THEME_COLOR_TOKENS`.

**Start Date** (PR 19). On the overview, card-built radio chips in the D07 mockup's order: Today,
Tomorrow, Start of Week, A Fixed Date, Relative to Today. `start_date_mode` gains `tomorrow` (writes
`today+1`) and `start_of_week` (writes `start_of_week`, which the card's grammar resolves through
`src/utils/start-date.ts` › `ANCHOR_START_OF_WEEK` [read]). `synthetic.ts` › `startDateMode` reads
`today+1` and `+1` as Tomorrow and `start_of_week` as Start of Week; A Fixed Date reveals Date and
Relative to Today reveals Expression, as mode values. Choosing Relative to Today while a shortcut is
stored writes nothing and holds `offset` as the presentation mode (section 3.9), so Expression shows
`today+1` for editing and the chips do not snap back. `INITIAL_OFFSET` stays `+0` [read].

**Tapping an Event Opens It** (PR 19; ia-final §2, D18 mockup). A new synthetic boolean,
`event_opens_details`, with `configKeys: ['event_tap_action']`, declared in
`schemas/actions.ts` › `buildActionsSchema` and placed on the overview. It reads on for exactly
`{ action: details }`, off for none or absent; on writes `{ action: details }`, off deletes the line
(the default is `{ action: none }`). While any other action is stored, the switch gives way to the
line "Tapping an Event: Navigate" with **Change**, which opens Taps & Refresh at Event Tap Action, so
an untouched action object is never normalized. Label "Tapping an Event Opens It" (the English of
`quick_setup.event_details`; PR 20 seeds its translations from that key), helper, as the approved
D17 overview draws it: "Shows the event's details, where it can be changed or deleted. The preview
does not open events, so try it on the dashboard. Other tap actions are on Taps & Refresh." Its
middle sentence is one of the two places the design states ia-final §5 rule 10's warning that taps
are not tried in the preview (section 5.10 has the other).

**Word lists** (candidate A §5, "Word Lists, One Term at a Time"). Blocklist, Allowlist and
Countries To Remove:

- **PR 12, the flag.** A pattern that `word-lists.ts` › `compiles` rejects is flagged at the field:
  "This pattern cannot be read, so the card ignores it.", through `ha-form`'s `error` map
  [unverified: rendering on 2026.11; PR 12 checks it live, and the fallback is the same line drawn by
  the card inside the field's wrapper]. Split's refusal links here.
- **PR 19, two presentations.** While the stored value is empty or `fromPattern` reads it as plain
  terms, the field is a list of one-term inputs (the `text` selector with `multiple: true`
  [unverified: rendering on 2026.11; the fallback is the prototype's card-built term list, each term a
  chip with "Remove School" and an "Add a Word" input]); terms are written with `toPattern`, and an
  empty list deletes the line. **Use a Pattern** switches to the raw field. **Use Words** is offered
  only when the pattern reads as terms. The choice is session UI state (`_wordModes`, keyed by owner
  and field). Any other stored value stays the raw field, kept exactly.

**Values the editor does not offer** (candidate A §9, PR 16): a dropdown whose stored value is not
among its options gets one extra option at lift time, "650 (From YAML)", kept until another is
picked; Day Tap Action's reads "Other Action (From YAML)". Both are listed in What This Card Changes.

**Names unique on a page** (ia-final §5 rule 5; PR 5). Six Weather settings exist twice, once for
the day header and once beside events, with the same label: Show Conditions, Show UV Index, UV Index
Threshold, Icon Size, Font Size and Color ([probe] `dupnames.mjs`). Their English labels gain the
place, "Show Conditions Beside Days" and "Show Conditions Beside Events", and so on (`date.*` and
`event.*` keys keep their names; twelve changed English strings, retranslated in PR 20). The Accent
Color value fields, labeled like their mode fields, become "Custom Accent Color" (`accent_color`,
`entity.accent_color`), the name the D07 and D13 mockups give them, and their mode dropdowns become
"Accent Color Source" (`accent_color_mode`, `entity.accent_color_mode`), ia-final §5 rule 5's pair.
PR 11 folds each mode into the composed control, which the D13 mockup names "Accent Color", and
returns those two labels to "Accent Color", so their translations end where they started.
`tests/editor-unique-names.test.ts` asserts unique accessible names per page over the corpus in
every scope. The Weather labels differ from the mockups' wording and are adopted (section 13, row
D); the Custom Accent Color name is the mockups' own.

### 5.10 Overview, Quick Setup, Notices, the Audit and Preferences

**The overview, top to bottom** (ia-final §2; the D06, D07 and D18 mockups): notices (one row per
kind, only when needed); the Quick Setup banner (fresh cards only); the search row (Search Settings,
Undo, Redo); Settings For; Calendars; Card Displays; Days to Show; Start Date; Tapping an Event Opens
It; Settings (the section rows); More.

- **Settings For** (D04 A, D18 A; ia-final §2), a card-built radio group over the existing scopes
  (`workspace.ts` › `buildWorkspaceSchema` still builds the option list, so `check:i18n` sees its
  strings). **Compact**, "Settings for List · Change" (Change named "Change: settings for List"),
  unless one of these holds, as the prototype's `isCompact` decides: the scope was changed, or Change
  pressed, this session; the toolbar is shown with its View Switcher; or a layout other than the one
  the card displays stores values in its block. Values in the displayed layout's own block keep it
  compact, so a List card's first edits, which land in `list:`, do not expand it (the D18 mockup);
  top-level values do not either. **Full**: "Settings For" with All Layouts, List, Columns and Grid,
  each with "Set: N" when it stores values ("Grid, Set: 4"); the help line "Shared starting values. A
  layout's own settings or built-in defaults can take precedence." for All Layouts, else "Edits here
  are written for Grid and apply when the card shows it."; and, when the scope is not the displayed
  layout, "Editing Grid · Preview Shows List". Changing it writes nothing, keeps focus on the chosen
  option and announces "Now editing settings for Grid." Pages whose fields depend on the scope show
  the same control under their header; Card & Header and Weather show "Applies to the whole card."
  instead (`pages.ts` › `isWholeCard`).
- **Card Displays**, a card-built radio group of the three illustrated layouts with today's labels
  and descriptions (`schemas/layout.ts` › `buildDisplayViewSchema`), labels that wrap, and today's
  helper. Switching writes `view` and any Grid reconciliation as one undo step; the notice shows under it
  in today's words (`grid_reconciliation.*`: "Existing Values Kept for Grid · Grid kept your existing
  values for: Show Location, Event Font Size. Use Reset in Grid to use its default for an option."),
  with **See What Grid Keeps** (the audit at Grid, PR 16) and today's **Dismiss**.
- **Days to Show**, **Start Date** (section 5.9) and **Tapping an Event Opens It** (section 5.9).
- **Section rows**: one button per page with its icon, title and summary (`PageDef.summary`):
  label-and-value pairs of the page's main settings and "Set: N" when it stores values in this scope
  ("Show Past Events: On · Show Empty Days: Off · Set: 1"), never an assembled plural. The Grid row
  shows only while Grid is the scope.
- **Taps in the preview** (ia-final §5 rule 10: "the editor states that taps in the preview are not
  tested there"), in the two places the design puts it: the Tapping an Event Opens It helper on the
  overview (section 5.9, the D17 mockup) and the note that opens the Taps & Refresh page, "The
  preview does not run taps while you edit the card. Try them on the dashboard." (the prototype's
  page note; `pages.ts` › `PageDef.noteKey`, `page.taps_refresh.note`, which PR 1 adds).
- **More**: What This Card Changes ("Set: 24 · Not in Use: 1"), Start From an Example ("Quick Setup:
  an example card and a few questions"), and the two preferences.

**Quick Setup** (D06 A). `quick-setup.ts` › `isFreshCard(raw)`: at most one entry, no layout block,
and nothing stored beyond `type`, `entities`, `days_to_show`, `config_version` and Home Assistant's
stub keys. The banner, "Quick Setup · Start from an example card and answer a few questions." with ✕
"Dismiss Quick Setup", shows when the session's first configuration is fresh and stays until applied
or dismissed, even after calendars are added (ia-final §2); Dismiss lasts the session. Start From an
Example always sits under More. The wizard is unchanged inside, the House Log story included; Apply
is one undo step, and what it wrote shows as set afterward.

**Notices** (PR 16). One overview row, "Options the Card Ignores: 2 · Old Options: 1", opens the
notices page: today's misplaced lines with their Move buttons (`misplaced.ts`, `_moveMisplaced`, now
one undo step each), then each deprecated option (`deprecated.ts`, from `DEPRECATED_CONFIG_MAP`) with
its replacement and **Move to Day Spacing** where the value maps, and the warning "The next change
removes these." (`toStoredConfig` prunes them [read]). The migration choice and version errors stay
as they are, blocking, before the overview.

**What This Card Changes** (D07 A; the D07 audit mockup; `audit.ts`, PR 16). "Every value this card
stores, grouped by where it lives. Anything not listed uses its default." and "Set: 24 · Not in Use:
1". Groups: **Card** ("Stored for the whole card. Every layout uses these unless it sets its own."),
List, Columns and Grid (each with "Set: N" and **Reset All in Grid**, one undo step, announced), then
**Calendars**, one sub-group per entry titled as its row with **Go to Anna**, then **Kept as
Written** ("Lines this editor does not own. It keeps them exactly as written.", read-only, Home
Assistant's own keys tagged "Home Assistant's own, from the Layout tab"). Each line is a compact row:

- the label and the value (`describeColor` for colors);
- the YAML path and the state words, always: "days_to_show · Set for All Layouts",
  "entities[3].event_type · Set on This Calendar";
- tags: "Same as the Default", "Same as Grid's Default", "Not in Use: Show Description is off",
  "From YAML";
- the row body is **Edit** ("Edit Days to Show, 7"), which mounts that one field's real control in
  place and writes to the line's own destination whatever the current scope; then **Reset** ("Reset
  Days to Show") and **Go to Setting** ("Go to Days to Show"), which opens its page in that group's
  scope. Controls mount only while edited.

**Preferences** (`prefs.ts`, PR 15). `localStorage['calendar-card-pro-editor-ui']` holds
`{ "v": 1, "every": false, "yaml": false }`, read and written inside `try` (private browsing throws).
**Show Every Setting**, "Pages open with every setting that applies as a control, instead of naming
the rest in Add Setting rows. Remembered in this browser." **Show YAML Option Names**, "Shows each
setting's option name beside its label. Remembered in this browser.", prefixes each field's helper
with its path (candidate A §9), and draws it in the line of a card-built control. The first read also
removes `calendar-card-pro-editor-essentials-only`, the key Essentials Only remembered
(`essentials.ts` › `rememberedEssentialsOnly`).

### 5.11 Reordering

D10 A, for calendars (PR 13) and the toolbar's own buttons (PR 18), on `reorder.ts`. Every row that
moves has one handle; a calendar with several entries has one, on its calendar row, which moves all
its entries (`calendar-list.ts` › `moveCalendar`).

- **The handle** is a button: "Move Anna", with the tooltip "Drag to move Anna, or press Space",
  `aria-pressed` (true while held) and `aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"`.
- **The keyboard grab.** Space on the handle picks the row up (`reorder.ts` › `grab`; the row is
  marked; nothing is written), and the visible status line under the list reads "Anna, position 2 of 5. ↑ ↓ move it, Space drops it, Esc puts it back." (the D10 mockup), the same words announced
  through the editor's one queue (ia-final §9) rather than by a live region of the line's own.
  The arrow keys move the held row one place (`moveBy`), the list redraws in the preview order
  (`order`), focus stays on the handle, and the line and the queue say the new position. Space
  drops it: one write, one undo step ("Move Anna"), announced "Moved Anna to position 1 of 5."
  (the prototype's words). Escape, or focus leaving the handle, puts it back: the original order,
  nothing written, "Put Anna back at position 2 of 5." Escape reaches the grab before any other
  disclosure (section 5.5). The grab is session UI state (`_grab`), outside undo.
- **Alt+ArrowUp and Alt+ArrowDown** move a focused row one place at once, outside text fields: one
  write and one undo step each, focus on the moved row's handle, the new position announced.
- **Move Up, Move Down and Move to Top** in the strip, as in section 5.6.
- **The pointer drag.** `pointerdown` on the handle (the handle alone has `touch-action: none`, so
  the rest of the row still scrolls the dialog) picks the row up after 4 px of movement. The row
  follows the pointer by `transform`, the others shift into the preview order from their measured
  midpoints (`dropTarget`), and the scroll container (section 3.4) auto-scrolls while the pointer is
  within 40 px of its edge. `pointerup` drops (one write, one undo step); `pointercancel`, Escape or
  a lost capture puts it back. With `prefers-reduced-motion` the rows jump rather than slide.
- **Cost.** At least 866 B gzip -9 for the pointer drag and 451 B for the keyboard grab with its
  announcements (r6 §3.3 sketches, lower bounds; the D10 manifest). Touch drag inside Home
  Assistant's scrolling dialog is [unverified] on the Companion apps until PR 13's live review on a
  phone.

## 6. Pull Requests

Twenty-one pull requests into `feature/editor-redesign` after step 0, in phase 5 §7's six steps. The
second revision split the first revision's page-shell PR so that render cost and identity (PR 3) and
write owners (PR 4) land first as behavior-preserving PRs, split Undo (PR 7) from the jump list (PR
8), and moved the color control (PR 11) ahead of Split (PR 12), which uses it. Line counts are
estimates of changed lines, tests included; PR 1's built size shows they run low where a PR is
mostly reconciliation tests (4,084 against 1,600, half of it tests). "Cap" is the most the PR may
add to the editor chunk, code, CSS and English strings, gzip -9 through `node:zlib` on Node 24
(section 10); a PR that would exceed it stops and reports instead of merging. The card chunk's
sha256 never changes.

| PR  | Title                                    | Step | Lines (est.)                               | New English strings                | Cap (gzip -9)                                                                                 |
| --- | ---------------------------------------- | ---- | ------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Field Index, Page Registry & Gate Corpus | 1    | 1,600; built at 4,084, 2,098 of them tests | 19, ten gate phrases among them    | +0.43 KB, measured                                                                            |
| 2   | Test Harness by Field Id                 | 1    | 1,700                                      | 0                                  | 0                                                                                             |
| 3   | Render Cost & Identity                   | 1    | 1,100                                      | 0                                  | +2.3 KB proposed; was 0.8 KB; measured +2.28 KB                                               |
| 4   | Write Owners & Frames                    | 1    | 1,200; built at 2,018, 1,011 of them tests | 0                                  | +1.2 KB, raised from +0.5 KB; measured +1.43 KB; a proposed cap of +1.4 KB, awaiting approval |
| 5   | Overview, Pages & Navigation             | 1    | 2,000                                      | about 32; 16 changed               | +4.0 KB                                                                                       |
| 6   | Builders Hand Presentation to Pages      | 1    | 900                                        | minus 25 to 43                     | below 0                                                                                       |
| 7   | Undo & Redo                              | 1    | 1,200                                      | about 22                           | +1.7 KB                                                                                       |
| 8   | Jump List                                | 1    | 900                                        | about 8                            | +1.1 KB                                                                                       |
| 9   | Calendar List Algebra                    | 2    | 800                                        | about 10                           | +0.8 KB                                                                                       |
| 10  | Calendar List & Entry Pages              | 2    | 2,000                                      | about 42                           | +2.6 KB                                                                                       |
| 11  | Color Control                            | 2    | 1,300                                      | about 20, plus 19 English-only     | +2.6 KB                                                                                       |
| 12  | Split This Calendar                      | 2    | 2,300                                      | about 40                           | +4.8 KB                                                                                       |
| 13  | Reordering: Drag & Keyboard Grab         | 2    | 900                                        | about 5                            | +1.8 KB                                                                                       |
| 14  | Shown-Set Plan & One Reset Path          | 3    | 1,400                                      | about 1                            | +0.6 KB                                                                                       |
| 15  | Show What Applies                        | 3    | 2,200                                      | about 63                           | +3.2 KB                                                                                       |
| 16  | What This Card Changes & Notices         | 3    | 1,400                                      | about 24                           | +1.8 KB                                                                                       |
| 17  | Search, Full                             | 4    | 1,500                                      | about 11, plus about 14 alias keys | +2.0 KB                                                                                       |
| 18  | Event-Part Chips & Toolbar               | 5    | 1,500                                      | about 19                           | +1.5 KB                                                                                       |
| 19  | Start Date, Tapping & Word Lists         | 5    | 1,000                                      | about 9                            | +1.0 KB                                                                                       |
| 20  | Translations                             | 6    | 4,000 (data)                               | 0                                  | measured rate × count                                                                         |
| 21  | Docs, Accessibility Pass & Media         | 6    | 1,500                                      | fixes only                         | +0.3 KB                                                                                       |

Every PR also updates `docs/guide/installation.md`'s editor size sentence when its change crosses a
kilobyte (`scripts/check-bundle.mjs` › `DOC_SIZES`), and states in its body the before and after
figures of section 10. PRs 1-4 and 6 change nothing a user sees; each says so and proves it.

**How a PR is reviewed live** (every PR with a visible change): deploy the dev build with the
`calendar-card-pro-deploy` skill, open the dev test dashboard in edit mode, and edit the dev cards
the script names: a fresh card (added for the review), a one-calendar List card, and the wall card
with six calendars, a calendar listed twice, and Grid. Desktop at full width, desktop at 400 px wide,
and the phone.

### Step 0 · Spike

**Done on the desktop** [measured] (`spike/ha-probe.md`): Escape with and without an editor
listener, with six of Home Assistant's pickers open, and with the editor's own disclosures (§1, §6);
browser Back (§2); accessible names and descriptions through `ha-form` per selector (§3); focus (§4);
form mount and update cost and today's editor's cost (§5). The byte baseline, the cost of `cache`, of
the card's event code, of Split's review list and of one translated string are measured by in-memory
builds ([probe] section 2). Every finding is built into sections 3 and 5.

**Still open, as a live-review item** (a phone with the Companion app, about ten minutes): open a
card's editor on Android and press the system Back with no edit made, then again after one edit;
the same with the iOS app's swipe back. It does not block PR 5. The editor is built to the expected
behavior, which the desktop probe showed for the browser's Back (§2) and ia-final §5 rule 9 states:
Back closes the dialog, behind Home Assistant's unsaved-changes prompt after an edit, and the editor
adds no Back of its own to the browser's history. The check runs in the first live review on a
phone, PR 5's, and in every one after it until done. If Back does anything else there (navigates
the dashboard, drops the edit without a prompt), the review stops and the "no browser history" rule
is revisited before the next PR.

**Checked inside the PRs that need them**, each marked [unverified] where it is used: an entity
renamed, added or made unavailable with the editor open, whether any steady-feed selector reads
`states`, and the panel event to mount on before Home Assistant measures, with first-open geometry
(PR 3); Escape with pickers as bottom sheets at narrow width and in desktop Safari, scroll
restore at 400 px, the icon size property, Escape in date, time and color pickers (PR 5); Home
Assistant's `ui.common.undo` and `ui.common.redo` (PR 7); `exclude_entities` on the entity selector
and Escape in the conditions editor's dialogs (PR 10); Home Assistant's color names (PR 11);
`ha-form`'s `error` map (PR 12); touch drag in the Companion apps (PR 13); label truncation with
state words at 362 px, and the accessible names of number sliders and the `object` selector (PR 15);
Edit Here's mount time on a phone (PR 17); `text` with `multiple: true` (PR 19); and the
screen-reader pass (PR 21).

### PR 1 · Field Index, Page Registry & Gate Corpus

Built on the feature branch, with its test follow-ups, not yet opened as a pull request. This
section describes what it built; its three test files pass, 46 tests [probe: run at the branch tip
carrying PR 1], and the figures below are the ones they print.

- **Scope.** `field-index.ts`, `pages.ts` with Appendix A's placement of all 223 ids (summaries come
  in PR 5), and `gates.ts` with 33 card gates (Appendix B's 32 conjunctive gates and the either-or
  gate, Event Details and Open Links reading the hold action as well), 8 `ENTRY_GATES` on a calendar
  entry's fields, `openingEdits`, `corpus()`, `firstUnmet` and `needsText`, because `universeIndex`
  needs the corpus from its first day. The gates carry their reasons: a `needsKey` per condition
  where its control's label does not read, a gate-wide one as the fallback, and the ten
  `gate.needs.*` phrases they name. `check:i18n` reads page titles, notes, heading keys, family
  titles and gate phrases through `load-editor-schema.mjs` (`readRegistryKeys`), counts them as
  used, and holds every `page.`, `heading.`, `family.` and `gate.needs.` key to the table that names
  it; its
  `probeConfigs` gain the corpus states, so a gated field's label, helper and options are
  reconciled like any other; its literal-key scan gains the `_string(ctx, '…')` pattern, closing the
  gap in section 2. Pages carry no search words of their own: they will be `.aliases` strings on
  their title keys, under #834's mechanism, once PR 17 lets the check accept a page title key (today
  such a string fails it). Nothing imports the new modules yet, so the bundle changes only by the
  strings.
- **Files.** `src/rendering/editor/field-index.ts`, `pages.ts`, `gates.ts`, `strings.ts`;
  `scripts/check-i18n.mjs`, `scripts/load-editor-schema.mjs`; tests below.
- **Tests.**
  - `tests/editor-page-registry.test.ts` (section 3.1), with its planted falsifiers, and the
    approved page map typed out in the test and pinned by value: every id's page, heading, family,
    order, marker and the workspaces that offer it (43 headings, 223 fields), so two fields trading
    pages fails.
  - `tests/editor-field-index.test.ts`: ids unique and stable; every drawn form's own `computeLabel`
    and `computeHelper` compared with the index's, field by field (751 fields in 187 configurations,
    none different); the lift equivalence probe made permanent (every field, workspace and corpus
    state routes the same from its one-field frame as from its panel frame, each comparison a real
    change, every card field of every workspace changed at least once, with a control that must
    differ).
  - The gate tests, the corpus validated the way `gates4.mjs` did it: for every gate, workspace and
    display, the opening edits applied through `applyWorkspaceChange` make every gated field of the
    workspace's universe present; from that opened state, each prerequisite broken by each of its
    closing values makes them absent again (the closed configurations, so nested gates such as a UV
    threshold under entity, position and switch are each proven); the either-or gate opens either
    way and closes with neither; a raw top-level patch kept as a control must fail to open Grid's
    location fields, proving the routed edits matter. They print their denominators (gates,
    workspaces, displays, checks: 2,415 and 18 at `c50573c5`). As built, the registry test walks 549
    corpus states in 4 workspaces and places 223 ids; the offered-value sweep closes 2,268 values
    and keeps 1,998 open, field by field.
  - **Every legal value.** Each condition's `holds` is tested against every value its option's type
    allows, not only those its control offers, and must agree with the builder on each: Show
    Countdown's `true`, `false` and `once_per_day`, a select's options and a value from YAML outside
    them, an action object of each kind. A predicate narrowed back to `value === true` must fail on
    `once_per_day`. As built: 5,274 legal values, written as YAML would hold them.
  - **Reasons from the data.** `needsText` given different form data names different unmet
    conditions of one gate: Weather Lines reads Weather Entity with no entity, "the forecast beside
    each event" while the forecast is drawn in the day header, and Show Conditions Beside Events
    while that switch is off; an `anyOf` gate names the closest branch.
  - **The universe, checked independently.** The universe is the corpus's own output, so a check
    dividing by it cannot see a state the corpus lost: dropping only Grid's Countries-opening states
    took Grid from 157 to 156 fields with every assertion green (the re-review's probe). The check
    replays each gate's opening edits on its own, from a fresh card in every scope and display, and
    asserts that every field any of them builds belongs to that scope's universe; each scope's id
    set is pinned by value (152, 159, 158 and 157 card ids with the picker, section 2, and 27 or 28
    calendar ids). The planted omission of Grid's Countries state must fail it. As built: 537 of 552
    replayed openings opened (41 gates, 4 workspaces × 3 displays, branches included), 66,864 built
    fields checked against the universe.
  - **The table-walk trap.** `GATES` is pinned by value (`toEqual` on a normalized copy), and a
    reconciliation walks the universe rather than the table: every id present under some corpus state
    but absent from a fresh card in some workspace must be gated by some gate, and every gate's fields
    must be absent somewhere. A fresh-card test cannot notice a gate leaving when its fields exist on
    fresh cards: `events:time_font_size` is present on every fresh card in every workspace because
    Show Time defaults on, so deleting the Time gate leaves every fresh-card check green; the pinned
    table and the closed configuration both fail.
- **Strings.** 19, as built: three page titles (Which Events, Size & Spacing, Taps & Refresh; Grid
  is the scope's own option label, and Card & Header, Day Header, Events and Weather keep their
  panel titles, so no translation is lost), two page notes (Which Events' "Hide events by words, or
  split one calendar, on that calendar's own page.", the prototype's, and Taps & Refresh's preview
  warning of section 5.10), four headings (Past Events, Weeks, Name & Look, Who Sees It) and the ten
  gate phrases. Existing keys are reused wherever the English is identical.
- **Bytes, as built.** Editor +2,126 B raw, +430 B gzip -9 (182,443 B), the card's sha256
  `fbce536bd288…` unchanged [probe]; `docs/guide/installation.md` moves from 592 KB to 594 KB.
- **Done when.** Every reconciliation passes with its denominators printed; each planted falsifier
  fails and is reverted (delete a placement; add a builder field; place an id twice; drop one gate's
  opening edit; delete the Time gate; drop Grid's Countries state; narrow the Countdown predicate);
  a planted `this._string(ctx, 'no.such_key')` fails `check:i18n`.
- **Live review.** None; Appendices A and B are read against the registry and the gate table.
- **Must not regress.** Every gate; the editor chunk changes by the English strings only.

### PR 2 · Test Harness by Field Id

- **Scope.** `tests/helpers/editor-host.ts`: `mountEditor(config, options)`, `fakeHass(options)`
  (refusing `calendar/event/subscribe` with `{ code: 'unknown_command' }`, AGENTS.md), `formOf`,
  `labelOf`, `helperOf`, `valueOf`, `changeField(editor, fieldId, value, owner)` (dispatches
  `value-changed` from the form holding the field, with complete form data, as `ha-form` does),
  `openPageOf(editor, fieldId, owner)` (expands the panel holding the field today, opens its page
  from PR 5) and `lastConfig(editor)`. No `src/` change.
- **Owners.** A field id names a field, not the form that holds it: two calendars, two entries of
  one calendar and two buttons repeat the same ids, and `tests/editor-calendar-name.test.ts` today
  picks "the second form". Every helper takes an owner, the card by default:
  `{ kind: 'entry', index }` or `{ kind: 'button', index }` until PR 4 gives entries and buttons
  stable keys, then `{ kind: 'entry', key }` and `{ kind: 'button', key }`, the index forms kept as
  thin lookups for tests about positions. A helper given an id that two forms of one owner hold
  fails, naming both.
- **The migration manifest**, in the PR body and checked against the diff: each of the 23 test files
  that query the editor's `ha-form` elements (section 2), and every consumer that reaches a form
  other than through its schema: one reading `form.data`, `form.schema` by position,
  `form.computeLabel` or `form.hass`, one dispatching `value-changed` on a form found by index, one
  reading a form inside a collapsed panel. Each row names the helper call that replaces it and the
  owner it passes. It lands before PR 3, whose lazy mounting removes the forms of closed panels: the
  manifest's last column says which tests must open a panel first.
- **Done when.** The suite passes on today's code with the same number of tests (counts quoted in
  the PR body); a mistyped field id fails with the id in the message, and an ambiguous one with both
  owners; every manifest row is a changed call site.
- **Must not regress.** Not one assertion weakened; every changed file's diff reads as a call-site
  change only.

### PR 3 · Render Cost & Identity

Behavior-preserving, on today's panels.

- **Scope.** Section 3.6 and the identity half of section 3.3, applied to today's panel forms:
  - a never-opened `ha-expansion-panel` mounts no form. An opening one mounts its forms on
    `expanded-will-change`, before Home Assistant measures it: frontend `20261028.5`, which 2026.11
    ships, fires that event, renders, awaits a frame and a timeout, measures the content and only
    then fires `expanded-changed` [read]. A panel keeps its forms when it closes, so the groups
    inside it keep their state. Search still opens the panels it matches, which then mount;
  - a hidden warm-up, drawn as the editor opens: a form (`ha-form.ts` › `warmSchema`) holding a
    node for each form and selector element the editor's schemas need, and a node for each value
    its forms hold in a field of a type in `hass-key.ts` › `VALUE_SELECTORS`, holding that value
    (today `ui_action`, whose element draws a `navigate` or `assist` action's form, or a service's
    controls); and Home Assistant's Visibility editor holding every calendar's conditions, behind
    the visible one's guard. It is drawn away once a search of everything below it, through every
    shadow root, finds no element still undefined, or after ten searches or 10 s regardless, so a
    panel opened before then can still open short. It takes the live `hass`, fresh while it is
    drawn, since a service's controls draw a field only for a target that supports it, and holds a
    value again once the services, or the attributes of an entity the value names, move. Each
    warm-up is a run of its own, so an earlier one's search cannot end a later one holding the
    same. Without it, 12 of 18 panels of a seven-calendar Grid card opened short on their first
    click, at full width and at 400 px [measured, PR 3]. Warming the element types alone left what
    a configured action or a `state` condition draws loading until its panel opened, 3 of 12 panels
    of a card holding both short at each width; the full warm-up opens 0 of 12 short at full width
    and 1 at 400 px [measured, PR 3]. That one is what no warm-up reaches: what a control loads for
    itself once drawn. The assist pipeline picker asks for its pipeline list per instance and draws
    nothing until it has it, about 50 ms after its panel is measured; at 400 px its 56 px are a row
    of their own [measured, PR 3];
  - each panel's `build` memoized on its inputs, and each panel schema interned by structural key;
  - each form's `data`, `computeLabel` and `computeHelper` memoized on what they read;
  - `hass-key.ts`: the live feed for forms with `entity`, `icon`, `ui_action` or `object` selectors
    (the conditions editor keeps the editor's own `hass`), the steady feed for the rest, the
    editor's `shouldUpdate`, and the
    `requestUpdate` override that carries an explicit update through it (section 3.6).
- **Tests.**
  - `tests/editor-render-identity.test.ts`, two genuine renders: write one field through a real
    `value-changed`, await the update, call `requestUpdate()`, await again; every other form must
    receive the same `schema`, `data`, `hass`, `computeLabel` and `computeHelper` objects both times,
    and the written form's `data` must differ (the control).
  - `tests/editor-hass-feeds.test.ts`: a `hass` whose key is unchanged renders nothing (a spy on
    `render`) and reaches only `data-hass="live"` forms; after a later unrelated render, a live form's
    `hass.states['calendar.anna']` is the newest state object (freshness) and its
    `hass.localize('ui.panel.lovelace.editor.action-editor.actions.expand')` still answers with the
    card's own label (the shim); a steady form's `hass` stays identical across new `hass` objects with
    the same key; a language change refreshes the steady feed.
  - **The combined batch.** An irrelevant `hass` and a bare `requestUpdate()` in one microtask
    render exactly once; the irrelevant `hass` alone renders nothing (the control); without the
    override, the pair renders nothing, the failure the re-review's probe found.
  - **The read set**, as section 3.6 describes it: renders across a matrix of panels and
    configurations, recorded only while rendering and while forms read their inputs; a planted read
    of `hass.config` in a render path fails it, and a member added to the wrapper's spread does not.
  - Lazy mounting: a closed panel holds no form; opening it mounts its forms in the same update that
    opens it, before the panel's `expanded-changed`.
  - **The warm-up**, `tests/editor-warm-up.test.ts`: the element types it holds are those the forms
    draw with every panel open, across the corpus, and those the builders use, a planted selector
    type included; the values it holds are those the open forms hold in fields of
    `VALUE_SELECTORS`; it writes nothing, and takes the live `hass`, fresh while it is drawn. With
    stand-ins that draw as Home Assistant's do, it stays until what an event's action, a button's
    action and a `state` condition pick is defined; it warms a service against its target as it
    is when the action is configured, and again once that target's attributes or the services
    move, not for a state alone, and forgets one no drawn form holds any more; its search and time
    bounds draw it away regardless, and an earlier warm-up's search does not end a later one holding
    the same.
- **Done when.** The tests pass; the step 0 probe's idle measurement, re-run on this PR's dev build
  in Home Assistant, shows the editor rendering only for changes it draws (renders and milliseconds
  per idle 10 s, before and after, in the PR body); first-open geometry is checked in Home Assistant
  (each panel opens to its full height on the first click, at full width and at 400 px); the card's
  sha256 is unchanged.
- **Live review.** Open the wall card's editor; open each panel once and watch it open to its full
  height, a calendar with a `state` condition and a button with a `navigate` action among them; rename a calendar entity in another tab: the name updates in the editor. Open Taps &
  Refresh: the action dropdown still names the card's own actions. Disable an entity used by a
  toolbar button: its picker shows it as unavailable. Search still opens matching panels.
- **Must not regress.** Everything: the harness suite passes unchanged.

### PR 4 · Write Owners & Frames

Behavior-preserving in what the editor writes; built as below, on the feature branch, with the
differences section 3.7 records as built.

- **Scope.** Section 3.7: `write-frames.ts`; `_entryKeys` and `_nextEntryKey`; today's per-calendar
  and button forms rendered with Lit's keyed `repeat`, keyed by their owner's key, and capturing
  that owner and the workspace at render; entries and buttons re-projected at event time and only
  the event's write set overlaid; `_writeFieldValue(owner, fieldId, value)` and
  `_writeFieldValues(owner, values)` for the card-built controls of later PRs, which Home
  Assistant's Visibility editor already writes through; `routing.ts` exports `atPath`, `writePath`
  and `nestedSchema`; focus after Remove (`_focusAfterRemove`) and the calendar picker's focus
  group.
- **Keys through today's picker.** Until PR 10 the calendar picker adds, removes and reorders
  entries (`synthetic.ts` › `SYNTHETIC_FIELDS.calendars`' `apply`), so its writes move keys with
  their entries: an added calendar takes a new key, a removed one takes its key with it, a
  reordered one keeps its own.
- **Tests.** `tests/editor-write-owners.test.ts`:
  - a card form's listener captured at All Layouts, the scope switched to Grid and rendered, then the
    old form's delayed `value-changed`: the value lands at the top level, never in `time_grid:`;
  - **the middle entry**: Anna, Ben and Leo; Anna removed and rendered; Ben's form is the element
    that was Ben's, Leo's the element that was Leo's, and an edit in each lands on its own calendar.
    The second revision's test of the third entry could not see the positional reuse this catches;
  - the picker's three paths, each followed by edits in every remaining entry's form: a calendar
    added, one removed, two reordered;
  - **stale sibling preserved**: a form instance rendered with `name: Old` and `color: red`;
    another write sets `name: New`; the stale instance then emits `color: blue`; the entry ends with
    `name: New` and `color: blue`;
  - **an intentional return**: an instance emits `name: New`, then `name: Old`; `Old` is written;
  - `_writeFieldValue(entry(key), 'calendar:color', '#f00')` keeps the entry's name, filters,
    visibility and an unknown key (the engineering review's counterexample, where `writeEntity` given
    `{ color }` alone dropped them);
  - the same for a button; a late event from a removed entry or button is dropped;
  - as built besides: the entries and the buttons after a removed one sending changes before the
    removal is drawn, each written to its own; a calendar listed twice moved by the picker with
    both its entries; a field returned to its first value after another form's write and a render;
    a stale button form's next change keeping an action another write changed, sent as `ha-form`
    sends it, keeping the data it sends; an action compared whole (an equal one in another object
    is no change) and written whole; `_writeFieldValue` for the card through its workspace, for two
    fields at once (an accent mode and the color it reveals), and refusing a field or an owner it
    has none of; keys through Quick Setup and from outside; focus after a keyboard Remove to the
    next calendar's Remove (its closed panel opening), to the one before it after the last, and to
    the calendar picker when none is left, and left alone when it was elsewhere. 30 tests, each run
    with the defect it exists for planted against an unmutated control: panels drawn by place, an
    owner resolved by the index it had at render (entries and buttons), even one that still drops a
    change from an owner that has left, one baseline shared by every event, a baseline frozen at
    first render, one no render resets, an action compared as the same object rather than an equal
    one, a changed action merged into the one it replaces, the write set written alone through
    `writeEntity`, a reordered calendar taking a new key, a key leaking into the configuration, no
    focus target after Remove, focus moved where it was not, a closed panel left closed;
  - the harness places a calendar's panel by its key and still holds the panels drawn to the blocks
    the editor's filter keeps, as many, one each and in list order; three tests in
    `tests/editor-host.test.ts` pin that it fails on a panel missing, two keyed alike and panels out
    of order, which reading panels by key alone lets through.
- **Done when.** Those pass and the harness suite passes unchanged.
- **Bytes, as built.** Editor +4,732 B raw, +1,426 B gzip -9 (186,298 B) over PR 3's head
  `4585197d`, the card's sha256 `fbce536bd288…` unchanged; `docs/guide/installation.md` moves
  from 602 KB to 606 KB. Over PR 3 before its warm-up fix the same change measured +1,370 B, and removed from that
  build each piece saved gzip -9: the field-write API 277 B, which later PRs call, so the cap is
  raised from +0.5 KB to +1.2 KB; restoring focus after Remove 209 B, which takes it past that;
  keys moved by Duplicate and Remove 29 B; keys carried through echoes and Quick Setup 22 B; keyed
  drawing 4 B; the owner frames and write sets the remaining 829 B. The +1,426 B is 226 B over the
  +1.2 KB cap and 26 B over a proposed cap of +1.4 KB, both awaiting a decision.
- **Live review.** On the wall card: remove a calendar with the keyboard (focus lands on the next
  calendar's Remove, its panel open), then the last (the one before it), then every calendar of a
  one-calendar card (the calendar picker); remove one with the mouse in desktop Safari, which
  focuses no button, so focus moves only where it was inside that calendar's panel; each calendar's
  panel keeps its own open state through Remove, Duplicate and the picker; edit two calendars'
  panels in quick succession, and remove the first calendar, then edit the next.
- **Must not regress.** Copy and Paste, calendar options shared across entries, the conditions
  editor's open condition across a write.

### PR 5 · Overview, Pages & Navigation

- **Scope.** Sections 3.3-3.5, 3.8, 5.5 and the overview of section 5.10 as far as it exists without
  later PRs: `navigation.ts`, `announce.ts`, `views/overview.ts`, `views/page.ts`, `views/focus.ts`,
  `views/keys.ts`, `views/scroll.ts` and the inline-SVG icon helper; the element renders through
  `cache`, one form per field with PR 3's identity rules carried to lifted fields, and card-owned
  `h2` and `h3` headings; Card Displays and Settings For as card-built radio groups, with Settings
  For's compact predicate (section 5.10); the Quick Setup banner on fresh cards only, with Dismiss,
  and Start From an Example under More; section rows with summaries; the Escape guard; the unique
  names of section 5.9 (Weather's six pairs, Custom Accent Color, Accent Color Source). Calendars
  still render today's
  picker and panels inside the Calendars block until PR 10. The filter bar stays on the overview:
  Essentials Only and Customized Only filter the open page's fields with today's predicates, #834's
  included (the filter context keeps `stored: _rawConfig`, so Essentials Only still keeps what the
  card sets), and a query shows the matching fields of every page as live controls grouped by page,
  aliases included (today's in-place filtering re-hosted until PR 8). Pages have no collapsible
  groups, since their headings are card-owned, so #834's group opening has nothing left to open on
  them; the per-calendar panels keep it until PR 10. AGENTS.md names `views/` as the third exception
  to the Lit-free rule.
- **Files.** The modules above, `element.ts`, `styles.ts`, `strings.ts`, `quick-setup.ts`
  (`isFreshCard`), `tests/helpers/editor-host.ts`, `AGENTS.md`, `docs/guide/installation.md`.
- **Tests.**
  - `tests/editor-navigation.test.ts`: routes, a trail of two, cross-link replace, validation after
    an outside change.
  - `tests/editor-overview.test.ts`: block order; the scope control stays compact after a List
    card's edit lands in `list:`, turns full when `column:` stores a value, when the toolbar shows its
    View Switcher, and after Change, for the rest of the session; radio groups named; the banner only
    when fresh, kept after adding a calendar.
  - Focus: the `h2` is the active element after opening, the trigger after Back.
  - Escape (`escapeAction` over synthetic paths): an element with `role="listbox"` in a nested shadow
    root is contained and nothing else happens; an open editor disclosure (here the expanded Settings
    For) closes first, then Back; nothing open on the overview is let through untouched; both
    `preventDefault` and `stopPropagation` are called whenever the editor acts.
  - **Reachability through rendered navigation**, which replaces "the harness suite still passes" as
    the proof: for every corpus state and every scope, every present field id is reached by clicking
    its page's rendered row and finding `[data-field="<id>"]` holding a form whose schema contains
    the node.
  - `tests/editor-unique-names.test.ts`: no two fields on one page share an accessible name, over the
    corpus in every scope, entry pages included.
  - Identity for per-field forms, two genuine renders as in PR 3; `styles.ts` holds no `sticky`.
  - #834's tests keep their promises on pages: `tests/editor-essentials.test.ts` passes through the
    harness unchanged (the stored YAML still reaches the filter);
    `tests/editor-search-opens-groups.test.ts` is rewritten so each of its queries finds its fields
    drawn on the pages the query shows, none behind a closed heading, its per-calendar cases
    unchanged until PR 10, each change named in the PR body.
- **Strings.** About 32 new (overview labels, Change, More, Back, the scope help and preview lines,
  summaries, announcements, banner); 16 changed English values (section 5.9), two of which PR 11
  returns.
- **Done when.** The tests pass; the card's sha256 is unchanged.
- **Live review.** Fresh card: the banner shows and Dismiss hides it; open Events, Back returns to
  the same row with focus on it. List card: change Day Spacing; Settings For stays compact. On a
  page, Escape goes Back; on the overview it closes the dialog; on a page with a dropdown open, only
  the dropdown closes. Repeat at 400 px (pickers as bottom sheets; scroll restore after Back) and in
  desktop Safari. On the phone, open Events on the wall card with every part on and judge the delay,
  and run the open step 0 check: the Companion app's Back, and the iOS swipe, with no edit and after
  one. Weather reads "Show Conditions Beside Days" and "… Beside Events".
- **Must not regress.** YAML round trips and authored defaults, the migration choice, Quick Setup,
  the misplaced notice, Grid reconciliation, the conditions editor, Copy and Paste across dialogs.

### PR 6 · Builders Hand Presentation to Pages

Behavior-preserving.

- **Scope.** Section 3.2: builders lose `heading()`, `row()` and flatten groups; the data-nesting
  expandables become named grids with their `titleKey`; `PanelDef.titleKey` and `iconPath` move to
  `pages.ts`; strings `check:i18n` then reports as orphans are deleted from `strings.ts` and every
  translation file, and `en-GB.json` is regenerated (`node scripts/generate-en-gb.mjs`). AGENTS.md:
  _Sub-headings are `constant` nodes_ and _Where a new option goes_ are rewritten for the registry
  (headings are card-owned elements; placement is a registry decision with a stated reason).
- **Tests.** The proof compares what every control is handed, because outer DOM cannot show it
  (`ha-form` is an unknown element in happy-dom), and compares it in a canonical form, because the
  stripping changes the lifted schema on purpose: Weather's `date` and `event` expandables become
  `blockScope`-style grids that stamp the same `titleKey`, so an exact schema comparison would fail
  on the intended change (the re-review's finding). A one-off test, committed first with a JSON
  fixture generated at the base commit, records for every page, corpus state and scope each field's
  effective control inputs: its id, its selector with options, its data path and value, the label
  and helper `computeLabel` and `computeHelper` resolve for it, and its `hass` feed; grid names,
  `titleKey`, `flatten` and other label metadata are resolved into those strings rather than
  compared. It must be green at the stripping commit, and must fail when a planted change alters one
  field's resolved label; the PR body links both runs, and the last commit deletes the test and its
  fixture, so no frozen oracle outlives the PR. `tests/editor-schema.test.ts` and
  `tests/editor-layout-structure.test.ts` keep their presence and gating assertions; their heading
  and row assertions move to the registry test, each change named in the PR body.
- **Done when.** No builder emits a heading or row; the form-input comparison is equal; `check:i18n`
  reports no orphan after the deletions.
- **Must not regress.** Gating for all 223 ids, by the registry and gate tests' universe walks.
- **As built.** On PR 5's head `b52713bd`. Departures, each decided here:
  - **A calendar's panel keeps its headings and rows.** It is still one `ha-form` per entry until
    PR 10, so stripping `schemas/entity.ts` would change what it draws; `heading()` and `row()`
    move into that module and go with the panel. "No builder" reads as the nine `PANELS` builders
    of section 3.1. The toolbar button sub-form's heading goes: nothing drew it.
  - **Search.** `filter.ts` › `matchesPanel` goes with the panel titles, so a query no longer
    finds a builder's fields by the retired titles or panel helpers; a page's title still does
    (PR 5). The group titles were searchable, and those fields keep being found the same way: a
    query naming a registry heading's title or helper line lets that heading's fields through, as
    a page title lets its page through (`element.ts` › `_filtered`); a family's heading reads the
    family's helper line too, which the blind review found missing. Layout's width table follows
    the Size & Spacing page's title (`filterExtras` takes the place's words). PR 8 replaces both.
  - **`localize.ts`**, unchanged in section 4.2, loses `lookupForView`, which only the per-layout
    panel title (`panel.separators.grid`) and `matchesPanel` read, and the compact-mode group's
    scope note (`GROUP_SCOPE`), which no node carries once the group is gone; the comparison is
    equal without it, the three compact fields being List-only.
  - **Strings: 32 retired**, all reported by `check:i18n` but one: the ten panel helper lines,
    four panel titles and Grid's Rules title, `heading_time_range`, `locale` and `week_numbers`,
    `scope.list_only.compact_mode` (reachable by prefix, so read off the removed note by hand), and
    13 `column.*` and `time_grid.*` labels of an earlier exceptions surface that only the density
    group's prefix kept reachable. Removed from `strings.ts` and the ten translation files, en-GB
    regenerated (67 overrides).
  - **Proof.** The one-off comparison (`tests/editor-form-inputs.test.ts`, fixture at
    `b52713bd`, the clock pinned because the fixed-date gate opens with today's date) walks 372
    corpus states over 3,066 places and 37,713 controls (410 distinct records) and is equal at the
    stripping commit and in CI; a planted change to `date.show_conditions`'s English value makes
    24 places differ. A planted `titleKey` drop on the same field is caught earlier, by
    `check:i18n` as an orphan. Heading assertions moved to the registry test, named in the PR
    body; a property test fails on any heading, row or collapsible a builder emits over 549
    corpus states. Suite 13,317 at `b52713bd` → 13,288.
  - **Bytes.** Editor 646,945 → 628,525 B raw (−18,420), 197,152 → 191,600 B gzip -9 (−5,552)
    over `b52713bd`, the card's sha256 `fbce536bd288…` unchanged; the family-helper fix is 107 B of
    that. `docs/guide/installation.md` moves from 646 KB and 197 KB to 628 KB and 191 KB.

### PR 7 · Undo & Redo

- **Scope.** Section 5.4: `history.ts`, `_commit`, `_restore`, the keys, the status bar, the
  migration choice as an undo step, focus after Undo and Redo on the restored field's wrapper.
- **Tests.** `tests/editor-history.test.ts`:
  - undoing the first write on a card holding a deprecated key restores it byte for byte; likewise
    an authored default, `_gridResetKeys`, the reconciliation notice, pending text and an automatic
    migration;
  - the migration choice: choose, then Undo: the un-migrated YAML is dispatched and the choice screen
    shows again, also after Home Assistant echoes the configuration back; Redo applies the choice;
  - coalescing with fake timers (one field under 800 ms merges; another field or a pause does not);
    75 deep; cleared by a configuration the editor did not send; Ctrl/Cmd+Z ignored inside a text
    field; a handled key calls `preventDefault` and `stopPropagation`;
  - focus after Undo and Redo is the restored field's wrapper and never an element inside a form; a
    second Ctrl/Cmd+Z right after it undoes again.
  - `tests/editor-undo-state-policy.test.ts` (section 5.4).
- **Strings.** About 22 (history labels, Undo and Redo fallbacks, status bar, announcements).
- **Live review.** On an old card holding `row_spacing`, change any field, then Undo: the code
  editor shows `row_spacing` back. Undo and Redo by button and by key. Open a pre-v5 card, choose in
  the migration screen, then Undo: the choice screen returns.
- **Must not regress.** Minimal writes after Undo: the next real edit writes what it would have.

### PR 8 · Jump List

- **Scope.** Section 5.8's first stage: `search.ts` (basic matching over label, helper, #834's
  aliases, key and option text), `views/search.ts`, result rows with breadcrumb, value and YAML
  path, Return to Results. In-place filtering retires with #834's group opening (`filter.ts` ›
  `openMatches`); the two switches stay until PR 15. Ends step 1.
- **Tests.** `tests/editor-search-jump.test.ts`: results, breadcrumbs, YAML paths on every row,
  a jump focuses the field's wrapper, Return to Results restores query, scroll and focus.
  `tests/editor-panel-search.test.ts`, `tests/editor-search-ha-name.test.ts` and the matching cases
  of `tests/editor-filter.test.ts`, `tests/editor-filter-paths.test.ts` and
  `tests/editor-search-config-keys.test.ts` become jump-list assertions: the same queries reach the
  same fields. #834's `tests/editor-search-aliases.test.ts` keeps its alias table pinned by value
  and its queries now reach their fields as results; `tests/editor-search-opens-groups.test.ts`
  becomes the same kind of assertion, each of its queries listing every field it once opened a
  group for.
- **Strings.** About 8.
- **Live review.** Search "time", choose a result, Return to Results; search `day_spacing`,
  `show_location`, and #834's `12h` and `exclude`.

### PR 9 · Calendar List Algebra

- **Scope.** `calendar-list.ts` (section 4.1), DOM-free, with the row-summary strings: grouping,
  calendar-level moves, duplicate, remove, add, re-point with `adopted`, `rowParts`, `rowName`,
  `setCount`.
- **Tests.** `tests/editor-calendar-list.test.ts`: grouping in first-occurrence order; each move and
  Move to Top move whole calendars; duplicate lands after the original; remove an entry and a
  calendar; add; re-point joins the end of the target's group and adopts the target's `name` and
  `show_in_legend` only when the target has entries; keys travel with entries; every operation keeps
  each calendar's entries in their relative order; and an invariance test running the card's
  `processEvents` and `groupEventsByDay`, with Filter Duplicates on, over fixtures where two entries
  of one calendar keep the same event (red first, blue second), before and after regrouping, a
  calendar move and a re-point: the winning row's `_matchedConfig` is red's each time and its drawn
  color is red's. A planted reversal of one calendar's entries must turn it blue and fail. The fetch
  request list is compared as well.
- **Done when.** The algebra and the invariance pass, the planted reversal failing.

### PR 10 · Calendar List & Entry Pages

- **Scope.** Section 5.6 without dragging and grabbing: `views/calendars.ts`, entry pages from
  `ENTRY_GROUPS`, the strip, accessible names with summaries, Alt+Arrow, Add Calendar with its
  explicit Add, Previous and Next Calendar, the filter field, Duplicate with its warning, Remove with
  the status bar and the page's foot, the missing-calendar warning, re-pointing with its notice,
  `_emittedConditions` keyed by entry key. The picker and the per-calendar panels retire;
  `ha-form.ts`'s `Selector` gains `exclude_entities`. AGENTS.md's _The picker shows calendars; the
  panel list shows blocks_ is rewritten for the list. The entry schema stays declared where
  `check:i18n` counts it as searched (`readEditorSchemaKeys` › `collect`, whose chassis subforms are
  not searched, #834): moving it into the chassis would make #834's four `entity.*.aliases` strings
  fail as unsearchable, so either it stays a panel subform or `check:i18n` reads `ENTRY_GROUPS` as
  searched, and those four keys must keep passing.
- **Tests.** `tests/editor-entity-panel-actions.test.ts` moves to the strip; new
  `tests/editor-calendar-rows.test.ts`: row parts and "Set: N"; grouped entries' names carry their
  summary and position; disabled actions at the ends; focus and announcement after each action;
  Duplicate opens the copy's page with the warning; Remove opens the overview with Undo focused; the
  missing-calendar warning appears and clears with a new `hass` alone; re-pointing shows its notice
  and Undo restores the entry's own name; Paste in a second editor instance; the conditions editor
  keeps a condition open across a write.
- **Strings.** About 42.
- **Live review.** Wall card: Duplicate Anna and read the warning; Move Ben to the top; Alt+ArrowDown
  on a row; Add Calendar (calendars already on the card are not offered); open an entry, Previous and
  Next; Who Sees It; re-point an entry onto Family; copy in one card's dialog and paste in another's;
  disable a calendar entity in another tab and watch its row.
- **Must not regress.** First-occurrence semantics, calendar options shared by entries, Copy and
  Paste.

### PR 11 · Color Control

- **Scope.** Section 5.9's colors: `colors.ts`, `views/color.ts`, the `color()` marker, drafts, the
  YAML line, described values, the registry color read for Follow Home Assistant. Every color field
  on every page and entry page gets the control. Lands before Split, which uses it. The two Accent
  Color mode labels return from "Accent Color Source" to "Accent Color", the composed control's name
  (the D13 mockup; section 5.9).
- **Tests.** `tests/editor-colors.test.ts`:
  - `SWATCH_TOKENS` pinned by value and a subset of `THEME_COLOR_TOKENS`; every key of `Types.Config`
    and `Types.EntityConfig` ending in `color` that has a field is built by `color()`;
  - `choiceOf` and `describeColor` round trips; `validColor` accepts `accent` only where the card
    honors it and `home-assistant` only for the Accent Colors, with an injected `supports`;
  - drafts: invalid text writes nothing, shows the flag, the YAML line keeps the committed value and
    says so; valid text writes, coalesced; an outside configuration clears the draft; a stored
    invalid value survives an unrelated edit;
  - **a draft is keyed by its destination**: an invalid Event Color typed with Grid as the scope,
    then the scope switched to List and Event Color edited there: List shows List's value, not the
    Grid draft; nothing commits to `time_grid.event_color` or `list.event_color` from the draft;
    back in Grid, the draft is still there;
  - owners: a swatch on Anna's page writes `accent_color_mode` and `accent_color` to Anna's entry in
    one undo step and keeps her other settings; Default resets both keys of the card's Accent Color;
    the badge's modes;
  - Follow Home Assistant's description comes from a fake registry read; disconnecting the editor
    releases the subscription.
- **Strings.** About 20, plus 19 English-only fallbacks for the color names.
- **Live review.** Anna's Accent Color: pick Pink; type "hot pink" (a draft; the YAML keeps Pink);
  type `#e91e63` (written). Follow Home Assistant on a calendar with and without a registry color.
  Title Color: Default. All-Day Badge Color: Row Text Color, then a swatch.
- **Must not regress.** `accent_color: home-assistant` and `accent` values written in YAML; unique
  names.

### PR 12 · Split This Calendar

- **Scope.** Section 5.7: `split.ts`, `split-review.ts`, `word-lists.ts` with the unreadable-pattern
  flag, `preview.ts` (Quick Setup moves onto it with no behavior change), `views/split.ts`.
- **Tests.**
  - `tests/editor-split.test.ts`: every refusal, including an event type inherited from the card,
    an own compact budget, an own allowlist, and an unreadable `blocklist: "["` or `allowlist: "("`
    (refused by words, allowed by type); the blocklist merge; the Match Against lock; the two parts
    replace the original in place, All-Day first, with their labels and colors; one undo step.
  - `tests/split-membership.dst.test.ts` through `processEvents` and `groupEventsByDay`, with its
    control case (section 5.7).
  - `tests/editor-split-review.test.ts`: `readUpcoming` builds the card's REST path for the review
    window and times out into the fallback text, with a fake `callApi`; `reviewParts` assigns each
    shown event to the first part that keeps it; and the shared case table below, the card's
    pipeline beside the mirror, under UTC.
  - `tests/editor-split-review.dst.test.ts`, the four zones: the card's `processEvents` and
    `groupEventsByDay` beside the mirror, naming the same events on the same first day, for today,
    `today+1`, `start_of_week` with Monday and Sunday weeks, a fixed date, `days_of_week` weekdays
    and weekends, past events hidden with an expiry time, a multi-day event split and not, and a
    Grid review against a List review of a card whose blocks give different `days_to_show`; a
    planted defect for each must fail (section 5.7).
  - `tests/editor-word-lists.test.ts`: escaping, round trips, an expression stays one, `compiles`
    agrees with the card's own skip.
  - Every Quick Setup test passes unchanged through `preview.ts`.
- **Strings.** About 40.
- **Live review.** Split Ben All-Day vs. With a Time: the review names Ben's upcoming events under
  each part, exactly the ones the card shows for Ben (compare with the preview, then repeat with
  `start_date: today+1` and with Ben on weekdays only); Split; the completion panel opens both
  entries; Undo. Split by "Training"; Cancel
  restores. Family with an allowlist: the refusal and Edit Allowlist. An entry given `blocklist: "["`
  in YAML: By Words is refused and the field is flagged. An entry with its own compact budget: the
  warning.
- **Must not regress.** Quick Setup's preview and echo handling.
- **As built, tie order under a card-wide limit.** #856 left one case open: the card drew events
  sharing a start in the order `processEvents` lists them, one entry after the other, so a split
  by words drew the worded part's events ahead of the rest's, and a card-wide
  `compact_events_to_show` or `skip_first_events` could keep the other of two tied events. No
  refusal was added. `processEvents` now stamps each event with where it came in the list Home
  Assistant sent (`_arrival`), and before `groupEventsByDay` sorts a day, it puts the events of a
  calendar listed more than once back in that order, in the places they hold. The sort itself is
  unchanged, so a split draws tied events as the calendar listed once does and either limit keeps
  the same ones, while a calendar listed once reaches the sort exactly as before, whatever order a
  caller passes. `latest_first` still reverses the result, and which copy of a duplicate wins is
  untouched; where a split keeps a later copy than the calendar listed once would, Filter
  Duplicates draws it where its calendar's earliest copy arrived (`deduplicateEvents`), so it
  does not change which events a limit keeps. Blind reviews caught four earlier attempts: reordering `processEvents` moved
  duplicate winners (now pinned in `tests/editor-calendar-list.test.ts`), and two that changed
  the sort's tie-break reordered once-listed cards for callers such as search, which hands
  grouping held events ahead of newly answered ones (pinned in `tests/event-sort-order.test.ts`),
  and one that drew such a later copy where it arrived (pinned in the membership suite).
  Measured by a probe outside the repository under UTC, over 5,000 generated configurations (one
  to three calendars, own filters, field and budgets, the card's limits, Filter Duplicates with
  and without location, latest first, splitting and banners, all three layouts): of 2,500 that
  list each calendar once, none changed at all; of 1,234 that list a calendar twice with no
  limit, none draws another event, only the order of tied events moves; of 1,266 with a limit,
  14 keep other events. Tests: `tests/split-membership.dst.test.ts` adds pairs sharing a start,
  one in reverse alphabetical arrival, and asserts the parts' rows in the entry's order with and
  without each limit; `tests/editor-split-review.test.ts` and `.dst.test.ts` run List's 674
  review cases under both limits and both methods, with tied pairs, and check each drawn event
  lands in the part `entryKeeps` names, the rule `reviewParts` assigns by (the review itself
  applies no limit). At the base commit, 150 of the tests in those files,
  `tests/event-sort-order.test.ts` and `tests/editor-calendar-list.test.ts` fail across the five
  projects. Card +532 B raw, +190 B gzip -9 (644,751 B, 179,545 B); the editor's sha256 is
  unchanged.
  - **Still open:** with Filter Duplicates on, two events of one calendar alike in title, start,
    end and location but told apart by the field a split by words reads keep different copies:
    the calendar listed once keeps the first to arrive, the split keeps the worded part's, drawn
    in the same place. That follows the documented rule that the first entry's copy wins and
    predates this change.

### PR 13 · Reordering: Drag & Keyboard Grab

- **Scope.** Section 5.11 for calendars: `reorder.ts`, `views/reorder.ts`, the handle, the keyboard
  grab with its status line, the pointer drag with auto-scroll. Ends step 2.
- **Tests.** `tests/editor-reorder.test.ts`: Space, ArrowDown twice, Space writes once, records one
  undo step and announces the position through `announce.ts`'s queue; the status line, which is not
  a live region, and `aria-pressed` follow the grab; Escape
  and blur put the row back with nothing written; Escape reaches the grab before any other
  disclosure; Alt+Arrow moves at once; a pointer sequence over mocked row rectangles drops into the
  right place; `pointercancel` restores; a grouped calendar moves with all its entries.
- **Strings.** About 5.
- **Live review.** Drag with a mouse and with a finger on the phone, past the list's visible edge to
  auto-scroll; the keyboard grab with VoiceOver on the Mac.

### PR 14 · Shown-Set Plan & One Reset Path

- **Scope.** `plan.ts` and `reset.ts`, DOM-free, on PR 1's gates and their reasons (`firstUnmet`,
  `needsText`); `plan.ts` › `storedAt` follows #834's `holdsValue` rule (section 5.1).
- **Tests.**
  - `tests/editor-plan.test.ts`: each state of section 5.1 on fixtures, closed configurations
    included; inherited-and-different in a layout scope; all eight entry tri-states, `show_weather`
    included; every row of the `stateOf` and Reset outcome tables of section 5.3, "Grid's Default"
    with nothing stored anywhere among them; Reset or Remove decided by the post-reset state; the
    other-layout key test with the two `day_spacing` ids.
  - `tests/editor-reset.test.ts`: top level, block, nested (`toolbar.legend`), a synthetic mode with
    its values (R6), a family in one step with its added key cleared, an entry family, a calendar
    option across entries; authored keys and `_gridResetKeys` updated together.
  - `storedAt` against #834's cases: a value at the root, at a nested path, in the selected layout's
    block including a unitless line equal to its default (`column: { event_font_size: 14 }`), on an
    entry and on a button counts as stored; a blank or `null` does not.
- **Strings.** About 1, the Needs tag of search. The gate line's templates and clauses arrive with
  the PR that first draws them, PR 15.
- **As built.** Where PR 14 departs from section 4.1's contracts and sections 5.1 and 5.3:
  - **`PlanCtx` gains three optional members.** `pending`, the held text, so a field being typed
    counts as stored (section 5.1 reads `_pending`; the contract had no way in); `entryKeys`, so the
    "Set on Calendars" line names entries by key; and `entry`, the key of the entry whose
    `calendar:` ids a state is asked for. `planEntry` sets `entry` and swaps in the entry's own
    present index, so `fieldState`, `stateOf` and `resetOutcome` read one entry the same way they
    read the card. `planEntry` takes an entry as stored, a bare id included.
  - **`FieldState` gains `{ kind: 'none' }`**: drawn and named nowhere on the page. A mode value
    whose mode is not live, an option this workspace offers under another id (`layout:day_spacing`
    in Grid, `separators:day_spacing` elsewhere), and a field no gate explains here.
  - **The plan's results are data, not words.** `HeadingPlan` (live fields with their reason, Add
    items with a family as one item, gated fields of `kind: 'gate'` gates only, stored-but-not-in-use
    fields), `OtherLayoutLine` (layouts and ids), `StateWords` (one of the table's eight words, plus
    the layouts and the calendars storing their own) and `ResetOutcome` (the five rows, the beaten
    All Layouts value as `ignored`). PR 15 words them with its templates.
  - **Two more exports.** `plan.ts` › `resetAction(id, appearance, ctx, state)` decides Reset or
    Remove by running `reset.ts` › `reset` on the editor's `WriteState`, storing the result through
    `toStoredConfig` and asking `fieldState` again; it needs the state, so it is not `stateOf`'s
    job. A field still live afterwards gets Reset, which with Show Every Setting on is every stored
    field, where the prototype gave Remove: the plan's rule is built. `needsTag` wraps `needsText`
    in `search.needs`, "Needs {needs}", the one string, held to its reader under PR 8's `search`
    prefix (`subforms.ts` › `REFERENCED_STRINGS`).
  - **`days_of_week` has no card setting**, so seven of the eight entry tri-states can follow a card
    value that differs; the test pins the eighth as never inheriting one.
  - **Families.** A family is live by its members that apply here; a stored member a gate withholds
    is listed as not in use and does not open the family. A member added alone, as search will add
    one, brings its family, since its members are shown together.
  - **"Same as the Default"** compares against what the field shows once its line is gone here and
    at the top level, the prototype's base, worked out from this card: Columns' minimum days follow
    the card's own day count, so a blank card's default would be wrong.
  - **Other layouts** are read from each layout's universe built in English; ids do not depend on the
    language.
  - **`reset.ts`.** A reset deletes lines and never writes a default, which `toStoredConfig` would
    keep where the YAML held it. On the stack through PR 10, each of the editor's per-field Reset
    buttons leaves the same stored YAML, Grid reset keys and held text as `reset.ts` does, and
    PR 7's undo snapshot holds all four, so a reset through `_commit` undoes whole. Each line's reset forgets the text held for it, a synthetic field's
    included (a cleared Card Height is held as `card_height`). A Grid reset of a key Grid defaults
    differently is remembered whether or not the block stored it yet, as `_resetViewValues`
    remembers it; a path naming a whole block resets it as Reset All does; a root reset forgets a
    Grid reset it outlives, as a Shared write does; a block or root key that leaves the
    configuration leaves the authored root keys. `entities.ts` gains `resetEntry` and exports
    `isCalendarOption`; an entry reduced to its id stays an object. `reset.ts` also exports
    `cardFamilyMembers` and `entryFamilyMembers`, which `plan.ts` reads. `planEntry` builds an
    entry's fields as PR 10's entry page withholds them, in every scope; its added-set keys extend
    `write-frames.ts` › `ownerKey`, `entry:<key>:<id>`.
  - **Tests and bytes.** 57 cases in the two files; 45 planted defects in `plan.ts`, `reset.ts` and
    `entities.ts` each fail a named case against a green control. Neither module is imported by the
    editor yet, so both are tree-shaken until PR 15: the editor chunk moves by the string alone,
    +86 B raw and +11 B gzip -9 over PR 10's head `7b3fe6bd` (+57 B over PR 4's at first), and the
    card's sha256 is unchanged.

### PR 15 · Show What Applies

- **Scope.** Sections 5.1-5.3 drawn: Add rows, gate lines and stored-but-not-in-use lines, the
  other-layouts line, state words by selector, the Reset outcome, Reset and Remove per field and per
  family, `prefs.ts` with Show Every Setting and Show YAML Option Names. Retires Essentials Only,
  Customized Only, `essentials.ts`, the filter bar's switches, `filter.ts`'s filtering, the
  `value_source` notes and the stored browser key. AGENTS.md gains the shown-set rule and the one
  reset path.
- **Tests.** The switch tests retire. #834's `tests/editor-essentials.test.ts` does not retire
  wholesale: its cases are what Essentials Only must keep (the root, a nested path, the selected
  layout's block with a unitless line at its default, each calendar, each toolbar button), which is
  rule 1's stored half, so each becomes a render case asserting the page shows that field live; only
  its "beside Customized Only" property and the hidden-count line leave with the switches. New
  render tests: a fresh card's Events page shows exactly its essentials; an Add row names its
  settings with `add.names_more` past four; adding writes nothing; changing then removing restores
  the YAML; inherited different values are live with "From All Layouts"; in Grid, every field Grid
  defaults differently reads "Grid's Default" while Grid stores nothing; the Reset outcome line; a
  boolean's and a dropdown's accessible names carry their words and a text field's description
  carries them; names stay unique; reachability with Show Every Setting on, and through Add rows
  with it off, over the corpus; a family's ✕ resets every member in one step; focus after Reset is
  the wrapper; preferences stored in `try`; the old key removed.
  - **Gate lines in the approved wording** (section 5.2, section 13 row F): `gates.ts` gains
    `Prereq.whenKey`, `Gate.whenKey` and `whenText`, PR 1's noun phrases and `needsText` staying as
    built for search. The clause table of section 5.2 is pinned by value; every condition of every
    `kind: 'gate'` gate resolves to a clause, its own, its gate's, or `gate.when.on` where its
    control is a boolean selector in the built schema, and a non-switch condition without one fails,
    reconciled against the schema rather than a list; one gate explains itself three ways in clauses
    (Weather Lines: "a Weather Entity is chosen", "the forecast shows beside events", "Show
    Conditions Beside Events is on"); a heading whose gated fields are all stored draws
    `gate.line_bare` with the stored lines after it; a planted `whenKey` removal fails.
- **Strings.** About 63: about 45 for the rest of sections 5.1-5.3, and 18 for the gate lines
  (`gate.line`, `gate.line_bare`, `gate.when.on` and the 15 clauses of section 5.2).
- **Live review.** Fresh card: Events is short and its Add rows name what they hold; add Time Font
  Size, change it, Remove it. Grid card: a field reads "Set for Grid"; its Reset line says what Reset
  gives; Reset it. Switch Home Assistant to German and check the longest labels with words at 362 px.
  Turn on Show Every Setting.

### PR 16 · What This Card Changes & Notices

- **Scope.** Section 5.10's audit and notices: `audit.ts`, `deprecated.ts`, values from YAML, See
  What Grid Keeps. Ends step 3.
- **Tests.** The audit groups every stored line, calendars and Kept as Written included; every row
  shows its YAML path and state words; Edit writes to the line's own destination in any scope; Reset
  All in Grid is one undo step; a deprecated option moves to its replacement; a value outside a
  dropdown's options shows "(From YAML)" and survives an unrelated edit; unknown keys are read-only.
- **Strings.** About 24.
- **Live review.** Wall card: open What This Card Changes, edit Last Hour in place, Reset All in
  Grid, Undo. An old card: the notices page moves `row_spacing` to Day Spacing.

### PR 17 · Search, Full

- **Scope.** Section 5.8's second stage. Ends step 4.
- **Tests.** `fold` on its table and on every editor language's labels; every alias, #834's ten
  and PR 17's own, reaches its field as a result (`tests/editor-search-aliases.test.ts`, its table
  pinned by value and extended); `check:i18n`'s exact-key rule accepts each new `.aliases` key and
  rejects one planted on a page name; every status and its tag; Add on a result writes nothing and
  jumps; **Edit Here is offered at 1 result and at 60**, and toggles both ways; **helper-only
  matches are kept and ranked last**: "color" on the wall card lists its helper-only matches after
  every label, key and alias match, each with its matched phrase, and a planted drop of helper-only
  matches must fail; a field across entries collapses and expands; Korean composition waits; ranking
  tiers.
- **Strings.** About 11, plus about 14 `.aliases` keys: about ten from words users have used
  (AGENTS.md), and about four carrying the retired panel titles on the pages that took their
  settings.
- **Live review.** Search `12h`, `colour` (the British spelling, an alias), `Wochennummern` in German, "font size" with Edit Here on
  the phone (time it).

### PR 18 · Event-Part Chips & Toolbar

- **Scope.** Section 5.9's chips and toolbar, own-button rows with section 5.11's reordering; the last
  `ha-expansion-panel` goes.
- **Tests.** Chips: membership from the universe (Now absent in Grid, with its line); End Time and
  Duration drawn with `aria-disabled` while Time is off; pressed is the effective value in each
  scope; the source summary by state words. Calendar Filter's radio group writes `toolbar.legend`
  and resets. Own buttons: the summary from Home Assistant's action labels (a fake `localize`); Add
  opens a row with focus on its Icon wrapper; grab, drag and Alt+Arrow as for calendars; the status
  bar on Remove. `tests/editor-toolbar-buttons.test.ts` moves to the rows (keys, moves and Add focus
  kept). A gate line under an unpressed chip reads `gate.when.pressed` ("Appears once Progress Bar
  is pressed: …", the D08 mockup).
- **Strings.** About 19, `gate.when.pressed` among them.
- **Live review.** Events: press and release chips, turn Time off and watch End Time; Card & Header:
  the six controls, Calendar Filter, add a button, grab it to the top.

### PR 19 · Start Date, Tapping & Word Lists

- **Scope.** Section 5.9's Start Date, Tapping an Event Opens It and the word lists' two
  presentations; `SchemaCtx.presentation` and `synthetic.ts` › `modeFor` (section 3.9). Ends step 5.
- **Tests.**
  - Derive and apply round trips: `today+1`, `+1`, `start_of_week`, a fixed date, an offset.
  - **Mounted Tomorrow → Relative**: mount with `start_date: today+1`; Tomorrow is pressed; press
    Relative to Today: nothing is dispatched, the Expression field is present showing `today+1`, and
    Relative is pressed; edit Title: Relative stays pressed, Expression stays present, `start_date`
    is unchanged; type `today+2`: it is written.
  - The tapping switch's three readings; an untouched navigate action survives an unrelated edit.
  - Word lists: the words presentation for empty and plain values; Use a Pattern and Use Words; an
    empty list deletes the line; an expression stays the raw field.
- **Strings.** About 9.
- **Live review.** Start Date: Tomorrow, then Relative to Today, then edit the expression. Tapping:
  on, off, and a card with a navigate action. An entry's Blocklist as words, then as a pattern.

### PR 20 · Translations

- **Scope.** Every new and changed string in the nine full languages (de, et, it, lt, lv, nb, pl, sk,
  sv) and as much Korean as is ready; `.aliases` strings per language only where its users' words
  differ, as `docs/contributing.md` asks since #834 (leaving one out searches by the English words);
  glossary decisions in `scripts/editor-glossary.mjs`; `node scripts/generate-en-gb.mjs`. Starting
  files from `scripts/l10n-handoff.mjs`, Home Assistant's own terms from `scripts/l10n-oracle.mjs`
  (both need `HA_FRONTEND_TRANSLATIONS`, AGENTS.md); `event_opens_details` seeded from
  `quick_setup.event_details`.
- **The required set, stated before translating.** The PR body lists, by key, the strings each of
  the nine files must carry: every key PRs 1-19 added or changed in `EDITOR_STRINGS`, less a
  reconciled list of exclusions, each with its reason: the English-only fallbacks for strings Home
  Assistant translates (the 19 color names, Undo, Redo and the like, section 8.1), every `.aliases`
  key (optional per language by design), and keys a full file already carries unchanged. The
  exclusions are reconciled in both directions against `strings.ts`: a fallback key must have a Home
  Assistant key it stands in for, and every key not excluded is required.
- **Done when.** `check:i18n` passes, and a one-off audit, quoted in the PR body, shows each of the
  nine full files carrying every key of the required set, changed keys retranslated rather than
  merely present (each value differs from the one the file held at `9a1253b3`). It is one-off on
  purpose: `check:i18n` accepts partial files by design, and a permanent gate would block every
  later English addition. The PR states the exact bytes the translations added.

### PR 21 · Docs, Accessibility Pass & Media

- **Scope.** Section 9; a pass with VoiceOver on macOS and iOS and NVDA on Windows over the jobs in
  `applicability.md` (R1-R61), fixing what it finds; the list of screenshots and clips to recapture.
  Ends step 6. Then `docs/development/editor-redesign/` is deleted and the one PR into `dev` opens.
- **As built.** The pass ran in Playwright's Chromium and WebKit on the live dev build: keyboard
  walks of the overview, every page, an entry page, Split, search and the calendar list,
  accessible names, roles and states from each engine's accessibility tree, targets, reflow at 320
  px and reduced motion. It fixed five things, each with a test that fails without it
  (`tests/editor-accessible-names.test.ts`): the settings rows and Quick Setup's banner are named
  by their title and described by their summary; the strip's moves, Remove This Entry and Edit All
  Layouts are named by the words they show, then whose they are (WCAG 2.5.3); and Escape on a
  search result leaves focus on the overview rather than on the page body. VoiceOver on macOS and
  iOS and NVDA on Windows did not run: no screen reader could be driven here, so those passes stay
  with a person. The screenshots stay on the maintainer's list (section 9); the capture tool's
  editor card reads a test calendar rather than the demo ones.

## 7. Tests

### 7.1 Rules

- **Never `vitest -u`.** The editor tests hold no DOM snapshots and this plan adds none: render tests
  assert roles, names, order and values, so a markup change fails on a sentence a reviewer can read.
  If a later PR does add a snapshot, its diff is read and committed deliberately (AGENTS.md).
- **No assertion weakened to pass.** A test that changes says in the PR body what it protected and
  how the new form still protects it.
- **Fake `hass`** comes from `tests/helpers/editor-host.ts` › `fakeHass`, whose
  `connection.subscribeMessage` refuses `calendar/event/subscribe` with
  `{ code: 'unknown_command' }` unless a test is about live updates (AGENTS.md). From PR 3 a test that
  forces a render calls `requestUpdate()`: assigning a copied `hass` whose key is unchanged renders
  nothing, by design. Split's review fakes `callApi`; Follow Home Assistant fakes the registry read.
- **Families are reconciled against their enumeration**, never against a second hand-written list
  (AGENTS.md, _Proximity is not reach_): the registry against the built schema, gates against the
  universe, colors against the `color()` marker and the configuration's color keys, aliases against
  the field index, the undo state policy against the element's own fields. Each prints its
  denominators beside its verdict and is shown once to fail with a planted defect. A table the code
  walks is also pinned by value, so an entry leaving it fails (the table-walk trap, PR 1).
- **Two genuine renders** for every identity claim: a real write, then a `requestUpdate()`, never one
  render compared with itself (the engineering review's finding 6).
- **Proof at the level that can fail**: forms' inputs rather than outer DOM (PR 6), rendered
  navigation rather than the harness suite (PR 5), the card's own `processEvents` and
  `groupEventsByDay` rather than the keys written (PR 12).
- **Timezone-sensitive tests are `*.dst.test.ts`**, so they run under Berlin, Sydney, New York and the
  Azores with January fixtures (AGENTS.md); Split's membership test is one, and so is any test of the
  review list's day and time formatting.

### 7.2 Today's Editor Tests

All 39 files at `9a1253b3`, by fate (#834 added the search-aliases and opens-groups files):

| File                                                                                                                             | Fate                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor-schema.test.ts`                                                                                                          | Presence, gating and stripping assertions unchanged (through the harness, PR 2); heading and row assertions move to the registry test in PR 6                                                                                                                                                                                                                        |
| `editor-layout-structure.test.ts`                                                                                                | As above: the old Layout panel's structure becomes registry placement under Size & Spacing, Which Events and the overview (PR 6)                                                                                                                                                                                                                                     |
| `editor-form-wiring.test.ts`                                                                                                     | Its filter-bar half retires with the switches in PR 15, replaced by the render tests of section 5.1; its form-wiring half moves to the harness                                                                                                                                                                                                                       |
| `editor-filter.test.ts`                                                                                                          | What a query matches moves to `search.ts`'s tests in PR 8 (same queries, same fields); the Essentials Only cases retire in PR 15                                                                                                                                                                                                                                     |
| `editor-filter-paths.test.ts`, `editor-search-config-keys.test.ts`                                                               | Kept as search tests in PR 8: a query by YAML path still reaches the field that writes it                                                                                                                                                                                                                                                                            |
| `editor-panel-search.test.ts`, `editor-search-ha-name.test.ts`                                                                   | Jump-list assertions in PR 8; calendar names stay searchable                                                                                                                                                                                                                                                                                                         |
| `editor-search-aliases.test.ts` (#834)                                                                                           | Its alias table stays pinned by value and grows in PR 17; its queries reach their fields as jump-list results from PR 8                                                                                                                                                                                                                                              |
| `editor-search-opens-groups.test.ts` (#834)                                                                                      | Rewritten in PR 5 so each query finds its fields drawn on the pages it shows, none behind a closed heading, its per-calendar cases unchanged until PR 10; jump-list assertions from PR 8                                                                                                                                                                             |
| `editor-essentials.test.ts`                                                                                                      | #834's version passes through the harness unchanged until PR 15, where its cases (the root, a nested path, the layout's block with a unitless line at its default, each calendar, each toolbar button) become shown-set render cases and only its "beside Customized Only" property and hidden-count line retire                                                     |
| `editor-entity-panel-actions.test.ts`                                                                                            | Moves to the strip and calendar rows in PR 10                                                                                                                                                                                                                                                                                                                        |
| `editor-toolbar-buttons.test.ts`                                                                                                 | Moves to own-button rows in PR 18; keys, moves and Add focus kept                                                                                                                                                                                                                                                                                                    |
| `editor-workspace.test.ts`                                                                                                       | Its reconciliation of drawn forms against `subforms.ts` counts the card-built radio groups drawn from declared schemas (PR 5)                                                                                                                                                                                                                                        |
| `editor-quick-setup.test.ts`                                                                                                     | Banner cases change in PR 5 (fresh only, Dismiss, More row); the wizard's cases, House Log included, unchanged, and unchanged again through PR 12's `preview.ts`                                                                                                                                                                                                     |
| `editor-misplaced-notice.test.ts`                                                                                                | Moves to the notices page in PR 16; Move keeps its behavior and becomes one undo step                                                                                                                                                                                                                                                                                |
| `editor-grid-reconciliation.test.ts`                                                                                             | Unchanged in behavior; the notice moves under Card Displays (PR 5) and gains its link (PR 16)                                                                                                                                                                                                                                                                        |
| `editor-card-actions.test.ts`                                                                                                    | Through the harness; its action labels are re-checked through the live feed in PR 3                                                                                                                                                                                                                                                                                  |
| `editor-derived-field-mapping.test.ts`                                                                                           | Through the harness; its walk of the rendered schema reads entry pages from PR 10, and the color control's absorbed mode fields stay mapped (PR 11)                                                                                                                                                                                                                  |
| `editor-calendar-name.test.ts`, `editor-show-in-legend.test.ts`, `editor-visibility.test.ts`, `editor-copy-paste-wiring.test.ts` | Through the harness; then onto entry pages in PR 10, same assertions                                                                                                                                                                                                                                                                                                 |
| The other 16 files                                                                                                               | Unchanged, or through the harness only (PR 2): adoption, config migration, events view scope, Grid badge scope, keeps authored defaults (which must pass unchanged through every PR), malformed entities, past-event opacity, routing, selector minima, serialization state, translations, URL, value equality, value round trip, view block strip, view withholding |

### 7.3 New Tests

- **DOM-free units**: `field-index`, `pages` (the registry), `gates` (the corpus), `hass-key`,
  `write-frames`, `navigation`, `announce`, `history`, `calendar-list`, `colors`, `split`,
  `split-review`, `word-lists`, `preview`, `reorder`, `plan`, `reset`, `search` and `fold`, `audit`,
  `deprecated`, `prefs`.
- **happy-dom render tests**, through the harness: overview order and the scope's two presentations;
  page open, Back and focus; Escape cases; identity and both `hass` feeds; delayed events after a
  rendered scope change; calendar rows, names and the strip; the color control and its drafts;
  Split's steps, review and completion; the keyboard grab and the pointer drag; Add rows, gate lines,
  state words and the Reset outcome; the audit and notices; the jump list and Edit Here; chips, the
  toolbar, Start Date (the mounted Tomorrow → Relative test) and word lists.
- **Reconciliations**, each with its PR: registry against built schema and no box-mode select (PR 1);
  gates against the universe, closed configurations, every legal prerequisite value, `GATES` pinned
  by value, and the universe replayed independently with each scope's id set pinned (PR 1); identity
  across two genuine renders, the combined update batch and the `hass` read set (PR 3); owner-keyed
  elements and write sets (PR 4); reachability of every field through rendered navigation and
  unique accessible names per page (PR 5); canonical control inputs before and after stripping (PR
  6, one-off); undo state policy against the element's fields (PR 7); within-calendar order under
  Filter Duplicates (PR 9); color specs against the `color()` marker and the configuration's color
  keys, `SWATCH_TOKENS` by value (PR 11); #834's alias table by value and its exact-key rule in
  `check:i18n` (PR 17); strings against fields through the extended `check:i18n` (section 8).
- **Card-code oracles**: `tests/split-membership.dst.test.ts` uses the card's `processEvents` and
  `groupEventsByDay`, `tests/editor-split-review.dst.test.ts` reconciles the review's mirror against
  the same two in four zones, and the list invariance test runs the card's deduplication, so the
  editor's claims are checked by the code that draws the card, not by a restatement of it.

## 8. Strings and Translations

### 8.1 New English Keys

About 332 new translatable keys (the accepted 315, and 17 for the gate lines' clauses that keep the
approved wording, section 5.2), about 25 English-only fallbacks for strings borrowed from Home
Assistant, about 14 new `.aliases` keys, 14 changed English values, and 25 to 43 retired keys.
#834's ten alias keys and its retired empty-state message are already in the baseline (section 2)
and are not counted here. Phase 5 and
candidate A §12 estimated 70-90 keys for the same design. The difference is not new scope: A §12
already budgeted announcements, reset names and Split's strings, at a coarser count. Counting every
string the approved screens and candidate A's §§5-10 show, one accessible name per action and one
announcement per kind of change included, gives these, by prefix and PR (each prefix a new
`subforms.ts` › `CHASSIS_STRINGS` entry):

| PR  | Prefixes                                                                                                                                                     | New                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1   | `page.*` (titles, notes), `heading.*`, `gate.needs.*` (ten noun phrases)                                                                                     | 19, as built                                      |
| 5   | `overview.*`, `scope.*`, `nav.*`, `summary.*`, `announce.*`, `quick_setup.banner*`, `more.*`                                                                 | about 32; 16 changed, 2 of them returned in PR 11 |
| 6   | (retired headings, group titles, panel helpers, filter-bar strings)                                                                                          | minus 25 to 43                                    |
| 7   | `history.*`, `status.*`                                                                                                                                      | about 22                                          |
| 8   | `search.results`, `search.values_for`, `search.return`, `search.showing`                                                                                     | about 8                                           |
| 9   | `row.*`                                                                                                                                                      | about 10                                          |
| 10  | `calendars.*`, `entry.*`, `strip.*`                                                                                                                          | about 42                                          |
| 11  | `color.*`                                                                                                                                                    | about 20; 19 English-only                         |
| 12  | `split.*`, `word_list.invalid`                                                                                                                               | about 40                                          |
| 13  | `reorder.*`                                                                                                                                                  | about 5                                           |
| 14  | `search.needs`                                                                                                                                               | about 1                                           |
| 15  | `add.*`, `state.*`, `reset.*`, `inactive.*`, `other_layouts.*`, `prefs.*`; `gate.line`, `gate.line_bare`, `gate.when.*` (the switch template and 15 clauses) | about 63                                          |
| 16  | `audit.*`, `notices.*`, `value.from_yaml`                                                                                                                    | about 24                                          |
| 17  | `search.*` (tags, Edit Here, the helper snippet, the hint); `<label key>.aliases` (#834's mechanism)                                                         | about 11; about 14 aliases                        |
| 18  | `chip.*`, `toolbar.controls*`, `button.summary`, `gate.when.pressed`                                                                                         | about 19                                          |
| 19  | `start_date_mode.option.tomorrow.label`, `….start_of_week.label`, `event_opens_details`, `tap.*`, `word_list.*`                                              | about 9                                           |
| 21  | fixes from the accessibility pass                                                                                                                            | about 5                                           |

**Reused or borrowed, where it costs nothing.** A key is reused wherever the English is identical
(four page titles are today's panel titles; Move Up and Move Down are `toolbar.buttons.move_up` and
`.move_down`; Copy Settings, Paste Settings, Duplicate and Remove are `entity.*`; Follow the Card and
Follow Home Assistant are `entity.accent_color_mode.option.*`). Home Assistant's own strings are read
through `hass.localize` where it has them (Undo, Redo, the 19 color names, action names), with the
card's English as fallback; those fallbacks are not sent for translation. `event_opens_details` is
seeded with `quick_setup.event_details`'s translations. Summaries are composed from existing labels
and values rather than written as a sentence per page.

**Changed** (PR 5): the twelve Weather labels that gain "Beside Days" or "Beside Events", the two
"Custom Accent Color" labels, and the two Accent Color mode dropdowns, "Accent Color Source" until
PR 11 returns them to "Accent Color" (section 5.9). Their keys stay; the fourteen that stay changed
are retranslated in PR 20, and the two that return keep their translations.

**Retired** (PRs 6, 10 and 15): 15 named strings (the filter bar's, Essentials Only's and Customized
Only's, `filter.gated_note`, the three `value_source` notes, `entity.customised`,
`entity.unconfigured`, `calendars.helper`, and `editing_workspace` with its helper) and the ten
`panel.*.helper` lines are certain; PR 6's orphan report adds every heading and group title no page
uses, for 25 to 43 keys, removed from every translation file. #834 already retired
`filter.nothing_customized_essential`; `entity.occurrence` stays, for "Entry 1 of 2" [probe]
(`keys.mjs` at `9a1253b3`: 16 of the second revision's 17 candidates present).

### 8.2 Wording Rules

- Title Case for labels, headings, buttons and state words; summary parts and option labels keep
  today's sentence case ("All-day events", "Events with a time"), as the mockups draw them; sentences
  for helpers, notes and announcements; American English (the en-GB file is generated).
- **Counts are a label and a number**: "Set: 3", "Entries: 2", "Settings: 8", "Days Ahead: 7 ·
  Events: 1" (section 13, row C). Never an assembled plural. A position reads as
  the prototype writes it, "Moved Ben to position 2 of 5.", a whole template with three
  placeholders.
- **Templates are whole sentences** with named placeholders a translator can reorder ("Stored but
  not in use: {label} ({value})"; "{names}, +{count}"), never a sentence built from fragments. Where
  a verb agrees with a count of layouts, two whole templates (`other_layouts.one`,
  `other_layouts.many`). The gate line's `{when}` is the one placeholder that takes a clause: each
  `gate.when.*` string is a whole clause written for the one position it fills, after "Appears
  once", so a translator writes it in that position's word order (section 5.2).
- In the editor's own chrome the word is _setting_ (the user is looking for a thing on screen, as
  `strings.ts` already argues for the filter bar); in docs it stays _option_ (AGENTS.md).

### 8.3 `check:i18n` Extensions

- **PR 1.** Read `PAGES`, `ENTRY_GROUPS`, `FAMILIES`, `OVERVIEW_FIELDS` and `GATES` through
  `load-editor-schema.mjs`: titles, heading keys (`key` and `keyByView`), helper keys, notes and alias
  keys count as used and must exist, and so do the gate phrases each condition names (`needsKey`).
  `probeConfigs` gain the corpus states (`gates.ts` › `corpus`), so gated fields' labels, helpers,
  options and #834's aliases are reconciled like any other. Add `_string(ctx, '…')`
  and `this._string(…)` to `checkEditorKeysUsedInCode` › `PATTERNS`, so a mistyped chassis key fails
  rather than rendering humanized.
- **PR 5 onward.** Every key under a new prefix must be referenced by a literal in code or by a
  declared table (pages, gates, aliases); an unreferenced one is an error, as an orphan field string
  is today.
- **PR 6.** Orphan reporting after the builders lose their headings; the PR deletes what it reports.
- **PR 11.** `SWATCH_TOKENS` names: the English fallbacks are read as used, exempt from the coverage
  line (English-only by design).
- **PR 10.** The entry schema stays counted as searched (`readEditorSchemaKeys` › `collect`), or
  `ENTRY_GROUPS` is read as searched, so #834's four `entity.*.aliases` keys keep passing once the
  picker panel retires.
- **PR 17.** #834 already holds every `.aliases` string to the exact key a searched field resolves
  it under, and exempts aliases from the label rules and the glossary's rejected forms. PR 17 adds
  the registry's page title keys to the keys an alias may sit on (`readEditorSchemaKeys` ›
  `aliasKeys`), as PR 1's `readRegistryKeys` already says pages are searched; an alias on any other
  key still fails.

### 8.4 Glossary, en-GB and Translation

- **Glossary.** PR 20 decides each new term per language in `scripts/editor-glossary.mjs`, taking Home
  Assistant's own form where it has one (`scripts/l10n-oracle.mjs`): Add Setting, All Layouts, Whole
  Card, Settings For, Show Every Setting, What This Card Changes, Split, Custom, entry. `.aliases`
  strings stay outside it, and outside the label rules, as #834 made them: they are users' words,
  not the editor's terms.
- **en-GB.** Any PR whose new or changed English contains a substituted spelling (color, gray,
  recognize) regenerates `en-GB.json` with `node scripts/generate-en-gb.mjs`; `check:i18n` fails until
  it does. PR 5's "Custom Accent Color", "Accent Color Source" and "Color Beside Days" are the
  first.
- **Translation.** PRs 1-19 add English only; the editor falls back to English per key
  (`localize.ts` › `lookup`), so on the feature branch other languages show new strings in English
  until PR 20. PR 20 translates every new and changed key into the nine full languages (de, et, it,
  lt, lv, nb, pl, sk, sv, each at 699 keys at `9a1253b3`, #834's ten aliases included) and extends
  Korean (487 of 699) as far as is ready. New aliases follow #834's guidance in
  `docs/contributing.md`: a language writes its users' own words, or leaves the key out to search by
  the English ones.

### 8.5 What a String Costs, Measured

A batch of 100 real strings from `strings.ts`, stratified by English length to match the new ones
(55 of up to 25 characters, 35 of 26-80, 10 of 81-160; mean 36.4 characters), removed in memory from
a production build, shrank the editor chunk by 13,347 B gzip -9: **133.5 B per string**, 30.5 B for
the English and 102.9 B for its translations at today's coverage (nine full files; Korean held 68 of
the 100, en-GB 10) [probe] (`bytes-batch.mjs`; the control build reproduced `ad39f0471a61`). The
first revision extrapolated from `de.json` alone; this replaces it. Section 10 applies the rate.

Aliases cost more per key, because each is a list of words in every language: from `c50573c5` to
`9a1253b3` the editor chunk grew 2,702 B gzip -9, nearly all of it #834, whose ten alias keys in ten
languages are the bulk of that change (#834's code and its rewritten Essentials Only helper are the
rest) [probe]. Section 10 prices PR 17's aliases at that rate, about 0.27 KB a key in every
language.

## 9. Docs and Media

Feature PRs leave the docs alone except where a gate requires it: `docs/guide/installation.md`'s
editor size, and AGENTS.md's Editor section as the architecture changes (PRs 5, 6, 10, 15). PR 21
writes the user documentation in one pass, when the editor has stopped moving.

**`docs/features/editor.md`, rewritten in PR 21**, in the docs style (AGENTS.md, _Docs style_): what
each part does first, its picture, then use. Sections: the overview, pages and Back; Settings For and
the state words; Calendars, entry pages, the strip, reordering and Split This Calendar; colors; Add
Setting rows and Show Every Setting; search, keeping #834's paragraph on the words it knows (`12h`,
`AM/PM`, `hide past`, `newest first`, `tomorrow`, `exclude`); Undo and Redo; What This Card Changes;
notices; Quick Setup.

**Checked against what moved since `c50573c5`.** #834 rewrote `editor.md`'s Essentials Only section
(it keeps what the card sets) and added the alias paragraph under search; #835 changed one example
there; v5.3.0's release notes and both What's New surfaces link `#essentials-only` and
`#search-customized-only` again and add no new editor anchor. The seven frozen anchors and the
section headings are unchanged at `9a1253b3` [read]. `docs/contributing.md` gained #834's paragraph
on translating `.aliases`, which PR 20 follows.

**Seven anchors cannot move.** `README.md`, `docs/guide/whats-new.md` and `docs/RELEASE_NOTES.md`
link `#quick-setup`, `#essentials-only`, `#options-the-card-ignores`, `#view-exceptions`,
`#options-for-the-selected-view`, `#per-calendar-panels-actions` and `#search-customized-only`, and
Check 29 resolves every one against a real heading; the archive files are never rewritten and the
README's What's New is edited only in the release PR. `check-docs.mjs` slugs from heading text, so
each anchor needs a heading of the same text. Quick Setup, Options the Card Ignores, View Exceptions
and Options for the Selected View still describe their sections and keep their titles. The other
three become short `h3`s under a closing section, "🗃️ Where Earlier Controls Went": Essentials Only
and Search & Customized Only (now pages that open on what applies, What This Card Changes, search and
Show Every Setting) and Per-Calendar Panels & Actions (now entry pages and the strip). Links from
other docs pages (`core-settings.md`, `layout-appearance.md`, `column-view.md`, `grid-view.md`,
`reference/configuration.md`, `architecture.md`, the story pages, `guide/usage.md`,
`reference/examples.md`, `docs/index.md`) are retargeted where the new section is the better place.

**Gates that read `editor.md`.** `check-docs.mjs` › `checkDeprecatedTable` reads its deprecated
options table, and the language-count sentences are reconciled against the files on disk; both stay
in the same shape. Check 34 (a section's first picture within its first 80 prose words) shapes every
rewritten section.

**Other pages in PR 21.** `docs/guide/one-calendar-many-purposes.md` replaces its Duplicate recipe
with Split This Calendar, keeping its rule that overlapping blocks under Filter Duplicates draw an
event styled by the first (section 5.6); `docs/features/core-settings.md`,
`docs/features/actions.md` and `docs/architecture.md`, the pages that name Essentials Only,
Customized Only, the calendar picker or the panels at `9a1253b3` [read: by grep], lose those
mentions, and the fourteen pages that link into `editor.md` are checked for a better target;
`docs/architecture.md` describes the page model, the registry, the write owners and the two `hass`
feeds.

**Media that goes stale**, recaptured from the live Home Assistant instance (no PR can):
`.github/img/example_editor_v5.png` (the editor, `editor.md`; #835 retook it for #834's Essentials
Only helper, and the redesign replaces what it shows) and `example_quick_setup.png` (the banner,
`README.md` and `editor.md`), plus new pictures for the overview, a page with an open Add row, the
calendar list with its strip, the color control and Split's review. #835 checked every clip and
journey against v5.2.0; PR 21 checked `journey_family_agenda.mp4` and the two `journey_family_hub_*`
videos against the deploy skill's table of published videos: all three record a kiosk dashboard
and none opens the card editor, and no clip does either, so none goes stale [read]. Screenshots
are referenced by `main`-branch URLs, so new ones go live only at release.

**Before the PR into `dev`**: delete `docs/development/editor-redesign/`, confirm with
`git diff --name-only origin/dev...HEAD | grep '^docs/development/'` (no output), and grep for this
plan's vocabulary in `src`, `tests` and `docs` (`PR 12`, `step 3`, `phase 6`, `Revision 3`), so no
comment cites a document that is gone (AGENTS.md, _When a planning document is retired_).

## 10. Bytes

**How to measure.** On the Node in `.nvmrc` (zlib results differ across majors, AGENTS.md), build
production at the PR's base and head with `npm run build`, then report for both files, both commits:

```bash
node -e 'const f=require("fs"),z=require("zlib"),c=require("crypto");
for(const n of ["dist/calendar-card-pro.js","dist/editor.js"]){const b=f.readFileSync(n);
console.log(n,b.length,c.createHash("sha256").update(b).digest("hex"),
z.gzipSync(b,{level:9}).length,z.gzipSync(b,{level:6}).length)}'
```

Raw size and sha256 are the comparison that cannot drift; gzip is quoted with its level and the
build variant (production) every time. The card's sha256 must be identical at base and head; a PR
that moves it has changed the card and stops (a version bump synced in from `dev` moves both chunks'
sha256 and nothing else, as v5.3.0 did). Figures in this plan were taken this way in memory ([probe]
section 2): at `9a1253b3` the card is 644,219 B raw, sha256 `fbce536bd288…`, and the editor 592,390
B raw, 182,013 B gzip -9, 182,225 B gzip -6.

**The comparison**, corrected in the second revision: the approved estimate was 10-12 KB of code,
CSS and English plus 6-10 KB of translations, not "10-12 KB in all". #834's ten alias keys and its
other changes are in the baseline above, not in this plan's cost.

| Item            | Approved (candidate A §12, phase 5 §§5-6)      | This plan                                                                                                     | How known                                                       |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Code and CSS    | about 10.3 KB, plus at least 0.87 for the drag | 13-16 KB (section 6's per-PR estimates; the grab adds at least 0.45)                                          | estimates; Split's review list measured at 1.82                 |
| English strings | about 1.2 KB (about 70 keys)                   | 10.5-12.5 KB: about 332 keys (10.1 KB), 25 English-only fallbacks (0.8), about 14 new alias keys (about 0.55) | measured rate, 30.5 B a string (section 8.5)                    |
| Translations    | 6-10 KB                                        | 35-40 KB: about 332 keys (34.2 KB), the new aliases in the languages that carry their own (about 3.2)         | measured rates: 102.9 B a string; #834's aliases, 0.27 KB a key |
| Retired keys    | not priced                                     | minus 3.3 to 5.7 KB (25-43 keys)                                                                              | measured rate, 133.5 B a string                                 |
| **Combined**    | **16-22 KB**                                   | **about 53-65 KB; about 59 KB at the middle**                                                                 |                                                                 |
| Card chunk      | none                                           | none                                                                                                          | sha256 checked in every PR                                      |

The gap is the string count, not the rate: candidate A's 6-10 KB of translations for about 70 keys
implies 86-143 B a key, and the measured rate is 102.9 B. Against the second revision's 50-59 KB,
the faithful Split review adds about 1.15 KB, aliases priced at #834's measured rate (about 14 keys,
3.8 KB, against 2-4 KB guessed for 50) about 0.8 KB, two fewer retired keys about 0.3 KB, and the
gate lines' clauses that keep the approved wording (section 5.2) about 2.3 KB, while five fewer new
keys take off about 0.7 KB, so the middle moves from 54 to about 59 KB.

**The size is accepted**: about 315 strings in every language and the editor at about 238 KB gzip
-9, the cost of the approved design. The editor loads only when someone opens it, the card's eager
path is untouched, and nothing approved is trimmed to meet a budget. Keeping the approved gate-line
wording then added 17 keys and about 2.3 KB (section 5.2), so the plan stands at about 332 strings
and the editor at about 241 KB gzip -9 (about +32%). The per-PR caps below stay the guard.

**Caps.** Section 6 gives each PR a cap for code, CSS and English; PR 20's is the measured rate times
the final count of new keys, stated in its body before it merges. A PR that would pass its cap stops
and reports with the ledger rather than merging.

**The ledger** lives in each PR body: the PR's delta, the running total since `9a1253b3`, and the
updated `docs/guide/installation.md` sentence. Nothing reaches the card chunk; D15's pick mode, the
only card-side item, is a separate later item.

## 11. Risks

In the order to retire them.

| #   | Risk                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                                                                                  | Retired by                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | The gate corpus misses a way a field opens, so the universe is short and a setting becomes unreachable or wrongly "another layout's"                                               | Corpus validated open and closed in every scope (2,415 checks); predicates tested against every legal prerequisite value; an independent universe check with pinned per-scope id sets, which a planted omission of Grid's Countries state must fail; `GATES` pinned by value; routed edits, not raw patches | PR 1                           |
| 2   | Test migration quietly weakens assertions                                                                                                                                          | PR 2 changes call sites only, from a migration manifest naming every consumer of a built form, schema reads or not; keeps the test count; lands before any behavior changes                                                                                                                                 | PR 2                           |
| 3   | Forms re-render on every `hass`, or a steady form shows stale states or loses the action-label shim                                                                                | Two feeds; two-genuine-render identity test; freshness and shim tests; the read-set test, its recorder disarmed while the wrapper copies; the idle probe re-run; a selector found reading `states` moves to the live feed                                                                                   | PR 3                           |
| 4   | The `hass` batching swallows an explicit update (a page change, an undo, a notice), so the screen lags the state                                                                   | `requestUpdate` records the intent beside the batch, as the card's `_bareUpdatePending` does; the combined-batch test and its control                                                                                                                                                                       | PR 3                           |
| 5   | A lazily mounted form is measured before it exists, so a panel opens clipped or jumps                                                                                              | Mount on `expanded-will-change`, or a capture-phase click where the event is missing, before HA measures; first-open geometry checked in HA in step 0 and in PR 3's live review                                                                                                                             | PR 3                           |
| 6   | A card-built control writes to the wrong owner, a reused row writes to another entry, a stale sibling is written back, or a delayed event reverts a newer write                    | Owner-aware frames captured at render; keyed `repeat` by owner; field-scoped write sets against each form's baseline; re-projection at event time; the delayed-event, middle-entry, stale-sibling and intentional-return tests                                                                              | PR 4                           |
| 7   | Android Companion Back or the iOS swipe does something other than close the dialog behind its prompt                                                                               | Built to the expected behavior: Back closes the dialog, behind Home Assistant's unsaved-changes prompt after an edit, and the editor adds no Back of its own to the browser; the phone check stays open as a live-review item, from PR 5's review on, and does not block a PR                               | Live review, open              |
| 8   | The bytes outgrow the accepted size                                                                                                                                                | Accepted at about 315 strings in every language and the editor at about 238 KB gzip -9; the approved gate-line wording adds about 2.3 KB (section 10); per-PR caps, and a PR over its cap stops                                                                                                             | Ongoing, by the caps           |
| 9   | A wording or focus difference from the approved design ships undecided                                                                                                             | Section 13 decides A-G; a later refinement of wording is decided in the PR that makes it and recorded in section 12; a difference beyond wording is decided in section 13 before its PR                                                                                                                     | Decided for A-G; each later PR |
| 10  | Escape closes the dialog in WebKit or with bottom-sheet pickers                                                                                                                    | The guard's containment branch for any overlay on the path; Safari and 400 px checks                                                                                                                                                                                                                        | PR 5                           |
| 11  | A page is slow to open on a phone (49 fields on Events in step 1)                                                                                                                  | Measured on the phone in PR 5; step 3 shrinks pages to essentials and what is set                                                                                                                                                                                                                           | PR 15                          |
| 12  | Undo is not exact (a pruned key, a migration, a Grid reset key comes back wrong)                                                                                                   | Exactness tests on each; the state-policy test against the element's fields                                                                                                                                                                                                                                 | PR 7                           |
| 13  | Retiring in-place filtering or the calendar panels drops #834's alias checks or the words search knows                                                                             | The jump list indexes `computeAliases`; `check:i18n` keeps the entry schema counted as searched; #834's tests get stated fates (section 7.2)                                                                                                                                                                | PRs 8, 10                      |
| 14  | Following Home Assistant's color opens a second registry read and subscription that outlives the editor                                                                            | `releaseEntityColors` on disconnect, tested; the module's generation counters                                                                                                                                                                                                                               | PR 11                          |
| 15  | Split changes what the card shows                                                                                                                                                  | Refusals, unreadable patterns included; membership through `processEvents` and `groupEventsByDay` in four zones, with a control case that must fail                                                                                                                                                         | PR 12                          |
| 16  | Split's review list drifts from what the card shows                                                                                                                                | `tests/editor-split-review.test.ts` and `editor-split-review.dst.test.ts` run the card's own pipeline beside the mirror on every CI run, for today, `today+1`, `start_of_week`, a fixed date, `days_of_week` and Grid against List `days_to_show`; planted divergences must fail                            | PR 12, ongoing                 |
| 17  | Touch drag misbehaves in the Companion apps                                                                                                                                        | `touch-action` on the handle only; live review on the phone; the grab and the Move actions remain                                                                                                                                                                                                           | PR 13                          |
| 18  | State words truncate dropdown labels                                                                                                                                               | German at 362 px; fallback in section 5.3                                                                                                                                                                                                                                                                   | PR 15                          |
| 19  | An HA selector option or string key this plan relies on is missing on 2026.11 (`exclude_entities`, `text.multiple`, `ha-form`'s `error`, `ui.common.undo`, color and action names) | Each has a stated fallback; checked in the PR that uses it                                                                                                                                                                                                                                                  | PRs 7, 10, 11, 12, 19          |
| 20  | `element.ts` grows past maintainability                                                                                                                                            | `views/` templates and DOM-free modules; the element keeps state, writes and focus only                                                                                                                                                                                                                     | PRs 5-19                       |
| 21  | The feature branch drifts from `dev`                                                                                                                                               | A sync PR whenever `dev` moves (section 1), the plan rebaselined after each; every PR rebuilt on the synced branch                                                                                                                                                                                          | Ongoing                        |
| 22  | The docs anchors frozen in archive files break                                                                                                                                     | Section 9's heading rule; Check 29                                                                                                                                                                                                                                                                          | PR 21                          |

## 12. Decisions This Plan Makes

Choices the design left open, each with the alternative not taken. A later refinement of wording is
decided in the PR that makes it and recorded here, with the words it replaces. A difference from an
approved text beyond wording is decided in section 13, _Differences From the Approved Design,
Decided_, and a row moved there keeps its number here. The first
revision's decisions that changed approved behavior (its quieter state words, the Weather exemption,
the Add-row ellipsis, independently movable entries, Split without its event list and label inputs,
and invalid colors written) are reversed above and gone from this list.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                | Alternative                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pages compose built fields by id through a registry reconciled against the builders (3.1)                                                                                                                                                                                                                                                               | Re-cut the nine builders into page builders; or a plain list beside them                                                                                                                                                                                               |
| 2   | The gate corpus is applied as user edits through routing, and lands with the index in PR 1 (3.1, 4.1)                                                                                                                                                                                                                                                   | Raw config patches (they miss Grid's divergent defaults, and three failed outright); the corpus in a later PR than its first consumer                                                                                                                                  |
| 3   | Builders keep presence only; pages own headings (PR 6)                                                                                                                                                                                                                                                                                                  | Keep builder headings and render them; a `constant` is not a heading to assistive technology ([measured] §3)                                                                                                                                                           |
| 4   | One `ha-form` per field (3.3), on the measured equal cost                                                                                                                                                                                                                                                                                               | One form per heading or per page                                                                                                                                                                                                                                       |
| 5   | Identity by caching builder output on its inputs, plus structural interning (3.3)                                                                                                                                                                                                                                                                       | A per-node memo, which cannot stabilize the 13 leaves two builders allocate fresh ([probe] section 2)                                                                                                                                                                  |
| 6   | Two `hass` feeds and an editor `shouldUpdate` (3.6)                                                                                                                                                                                                                                                                                                     | Raw `hass` everywhere (loses the action-label shim), or one wrapper cached by language (stale states)                                                                                                                                                                  |
| 7   | Owner-aware write frames that re-project an entry or button at event time (3.7)                                                                                                                                                                                                                                                                         | One write path through the card's frame (writes a calendar's color to the card's root); frames captured by index                                                                                                                                                       |
| 8   | Presentation modes held in pending text and handed to the builders (3.9)                                                                                                                                                                                                                                                                                | Rewrite the stored value when the mode changes, which Tomorrow → Relative cannot do without writing                                                                                                                                                                    |
| 9   | Inline SVG instead of `ha-svg-icon` (3.5), as candidate A §12 specifies                                                                                                                                                                                                                                                                                 | Keep `ha-svg-icon`, which D16's wording also allows; a one-line revert                                                                                                                                                                                                 |
| 10  | `views/` as a third exception to the Lit-free rule (3.8)                                                                                                                                                                                                                                                                                                | Everything in `element.ts`                                                                                                                                                                                                                                             |
| 11  | A harness by field id, then render cost and write owners as behavior-preserving PRs, before any visible change (PRs 2-4)                                                                                                                                                                                                                                | Fold them into the page-shell PR                                                                                                                                                                                                                                       |
| 12  | Essentials Only, Customized Only and in-place search live until their replacements land (PRs 8, 15)                                                                                                                                                                                                                                                     | Remove them in PR 5 and leave a gap on the branch                                                                                                                                                                                                                      |
| 13  | Moved to section 13, _Differences From the Approved Design, Decided_, row A: focus on the field's wrapper after Reset, Undo and a search jump, adopted                                                                                                                                                                                                  |                                                                                                                                                                                                                                                                        |
| 14  | **The migration choice is an undo step**: Undo restores the pre-migration YAML and the choice screen (5.4)                                                                                                                                                                                                                                              | History starts after the choice, as the first revision had it                                                                                                                                                                                                          |
| 15  | The added set is session UI state outside undo (5.1)                                                                                                                                                                                                                                                                                                    | Make adding an undo step                                                                                                                                                                                                                                               |
| 16  | Remove or Reset decided by evaluating the state after the reset (5.3)                                                                                                                                                                                                                                                                                   | Fixed by appearance kind                                                                                                                                                                                                                                               |
| 17  | State words by selector: the helper for text and number, the label for the rest, a card-built control's own name for card-built controls (5.3)                                                                                                                                                                                                          | Words in the helper everywhere, unannounced for 102 fields ([measured] §3)                                                                                                                                                                                             |
| 18  | **Re-pointing onto a calendar that already has entries adopts its shared name and Show in Calendar Filter**, with a one-line notice, undoable, and joins the end of that calendar's group, so the calendar's first entry stays first (5.6)                                                                                                              | Refuse such a re-point; keep the entry's own values, which the card would not read (it reads them from the calendar's first entry); or drop them silently (the first revision)                                                                                         |
| 19  | Split's review reads upcoming events over the card's REST path and mirrors the card's window and per-entry eligibility with small util imports (+1,819 B gzip -9), reconciled against the card's own pipeline by test in four zones; the live preview supplements it (5.7)                                                                              | Import the card's `events.ts` (about 9 KB gzip -9); or the preview and rule sentences alone (the first revision)                                                                                                                                                       |
| 20  | The review lists exactly what the card would show for the entry in the displayed layout: the card's window (Start Date in every form, the card's first day of the week, that layout's Days to Show) and the per-entry eligibility applied before the split; visibility conditions are listed as if met, with one line saying both parts keep them (5.7) | Days to Show from today with event type and word lists only (the second revision), which disagreed with the card in 752 of 1,008 configurations [probe]; or the conditions judged for the person editing, which would hide events from a review meant for every viewer |
| 21  | Moved to section 13, _Differences From the Approved Design, Decided_, row C: Split's "Days Ahead: 7", adopted                                                                                                                                                                                                                                           |                                                                                                                                                                                                                                                                        |
| 22  | Moved to section 13, _Differences From the Approved Design, Decided_, row B: the overflow template "{names}, +{count}", adopted                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                        |
| 23  | Calendar Filter as a card-built segmented radio group (5.9)                                                                                                                                                                                                                                                                                             | Home Assistant's `button_toggle` selector, named in the D09 manifest; its accessible name was not measured                                                                                                                                                             |
| 24  | Follow Home Assistant describes the calendar's registry color, read through the card's own module (+124 B, one registry read and subscription per page while an editor is open) (5.9)                                                                                                                                                                   | A static description: "Home Assistant's color for this calendar, else the card's"                                                                                                                                                                                      |
| 25  | Swatch names from Home Assistant's translations first, English fallbacks in `strings.ts` (5.9)                                                                                                                                                                                                                                                          | 19 translated card strings, about 2.5 KB more                                                                                                                                                                                                                          |
| 26  | Moved to section 13, _Differences From the Approved Design, Decided_, row D: Weather's "Beside Days" and "Beside Events" labels, adopted                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                        |
| 27  | A color draft survives closing the control and moving between pages; it clears on another choice or an outside configuration (5.9)                                                                                                                                                                                                                      | Discard the draft when the control closes                                                                                                                                                                                                                              |
| 28  | The unreadable-pattern flag through `ha-form`'s `error` map, with a card-built fallback (5.9)                                                                                                                                                                                                                                                           | Card-built always                                                                                                                                                                                                                                                      |
| 29  | A dropdown value outside its options gets a "(From YAML)" option at lift time (candidate A §9)                                                                                                                                                                                                                                                          | A note beside the field                                                                                                                                                                                                                                                |
| 30  | Preferences under `calendar-card-pro-editor-ui`, version 1; the old key removed on first read (5.10)                                                                                                                                                                                                                                                    | Keep the old key                                                                                                                                                                                                                                                       |
| 31  | The banner's freshness is read once per session; Dismiss lasts the session (5.10)                                                                                                                                                                                                                                                                       | Remember Dismiss in the browser                                                                                                                                                                                                                                        |
| 32  | Search words reuse #834's `<label key>.aliases` strings and checks, and a page's words sit on its title key (PR 1's choice); PR 17 adds about 14 aliases, four of them for the retired panel titles, and lets an alias sit on a page title key (5.8, 8.3)                                                                                               | A second alias table in `search.ts` (the second revision's `SEARCH_ALIASES`); or a `PageDef.aliasKeys` list of old panel titles, a second list beside the aliases                                                                                                      |
| 33  | Quick Setup's preview transaction becomes `preview.ts`, shared with Split (4.1)                                                                                                                                                                                                                                                                         | A second transaction type                                                                                                                                                                                                                                              |
| 34  | Escape order: grab, color control, strip, Add row, Add Calendar, own button, Split; then Back; then clearing the query (5.5)                                                                                                                                                                                                                            | Escape only closes disclosures and never navigates                                                                                                                                                                                                                     |
| 35  | Moved to section 13, _Differences From the Approved Design, Decided_, row E: the results line "Results for “color”: 42", adopted                                                                                                                                                                                                                        |                                                                                                                                                                                                                                                                        |
| 36  | Show YAML Option Names prefixes the helper with the path (candidate A §9)                                                                                                                                                                                                                                                                               | A separate line under each field                                                                                                                                                                                                                                       |
| 37  | Explicit updates (a page change, an undo, a notice) are recorded by a `requestUpdate` override beside the `hass` batch, as the card's `_bareUpdatePending` records them (3.6)                                                                                                                                                                           | Judge every batch by `hass` relevance alone, which drops a page change that lands in the same batch as an irrelevant `hass`                                                                                                                                            |
| 38  | Each form instance keeps the data it last showed as its baseline, and a write carries only the paths that differ from it (3.7)                                                                                                                                                                                                                          | Write the whole projection, which writes a stale sibling back; or diff against the current configuration, which cannot tell a return to the shown value from no change                                                                                                 |
| 39  | Entry and button rows keyed by owner with Lit's `repeat`, from PR 4 (3.7)                                                                                                                                                                                                                                                                               | Today's positional mapping, under which removing a middle entry hands its form to the next entry                                                                                                                                                                       |
| 40  | Color drafts keyed by owner, field and storage destination (5.9)                                                                                                                                                                                                                                                                                        | Owner and field only, which carries a draft typed for Grid into List                                                                                                                                                                                                   |
| 41  | Lazy forms mount on `expanded-will-change`, or a capture-phase click where the event is missing, before Home Assistant measures the panel (PR 3)                                                                                                                                                                                                        | Mount on `expanded-changed`, after the panel was measured empty                                                                                                                                                                                                        |
| 42  | The read-set recorder is armed only during render and form-input reads, never while the steady wrapper copies (3.6)                                                                                                                                                                                                                                     | Record every `hass` read, which counts the wrapper's own copying as render dependencies                                                                                                                                                                                |
| 43  | PR 6 proves pages unchanged by comparing canonical effective control inputs, not the lifted schemas (PR 6)                                                                                                                                                                                                                                              | Exact schema equality, which fails on every intended presentation change                                                                                                                                                                                               |
| 44  | Moves keep a calendar's entries in their order (5.6)                                                                                                                                                                                                                                                                                                    | Re-sort a group on each move, which changes whose copy wins under Filter Duplicates                                                                                                                                                                                    |
| 45  | Gate lines and search tags each keep their approved form: PR 1's nouns stay for search's "Needs …" tags (the D05 mockup), and a clause beside each, `whenKey` next to `needsKey`, with "{label} is on" for a switch, gives the gate line's "Appears once …" (5.2; section 13, row F)                                                                    | Rewrite PR 1's nouns as clauses, which leaves search without the D05 mockup's "Needs Show Description"; or one noun form for both, the "Appears with …" that row F declines                                                                                            |
| 46  | A chip's gate line is the clause `gate.when.pressed`, "{part} is pressed", inside the one `gate.line` template (5.2)                                                                                                                                                                                                                                    | `gate.line_pressed` and a bare twin of it, two more templates for the same sentence                                                                                                                                                                                    |
| 47  | A panel keeps its forms after it closes (PR 3)                                                                                                                                                                                                                                                                                                          | Unmount on close, which discards the open state of the groups inside it                                                                                                                                                                                                |
| 48  | A hidden warm-up on the live hass loads the elements Home Assistant imports on first use, and what each configured action and each calendar's conditions draw; it is drawn away once a search finds nothing below it left undefined, or after ten searches or ten seconds, and holds a value again once the services or entities it names move (PR 3)   | Mount every panel's forms as the editor opens, the cost PR 3 removes; accept panels opening short on their first click; or warm element types alone, which leaves what a configured action or condition draws loading on first open                                    |
| 49  | A calendar's panel keeps its own open or closed state through a removal, a duplicate or the picker, as a toolbar button's does (PR 4)                                                                                                                                                                                                                   | Draw by place, which hands a removed calendar's panel, and its listeners, to the next calendar                                                                                                                                                                         |
| 50  | After Remove takes the focused button with its panel, focus goes to the Remove of the calendar drawn in its place, its panel opening, else to the one before it, else to the calendar picker in a focus group of the editor's own; focus held elsewhere stays (PR 4, until PR 10)                                                                       | Let focus fall where the browser drops it; or keep drawing by place, which kept focus on the next calendar's Remove only by handing it the removed one's panel                                                                                                         |
| 51  | `_writeFieldValue` finds a card field among those its panel draws now, an entry's or a button's among those every entry or button declares (PR 4)                                                                                                                                                                                                       | Import `field-index.ts` for the universe, which brings `gates.ts` and its corpus into the editor chunk, +1.6 to +1.9 KB gzip -9 and a circular import, before PR 5 needs them                                                                                          |
| 52  | Click actions (Copy, Paste, Duplicate, Remove, a button's moves) keep the index bound at render until PR 10; forms and the Visibility editor resolve their key when a change arrives (PR 4)                                                                                                                                                             | Resolve every click by key, which a keyed panel makes moot: a click cannot outlive the render that bound it                                                                                                                                                            |
| 53  | The editor derives the color specs from the fields built for its context and the same fields built with every mode that offers `custom` set to it, cached by which modes are drawn (PR 11)                                                                                                                                                              | The gate corpus's universe: 72 ms for the corpus and about 15 ms a scope in the test runner, and the corpus in the editor chunk                                                                                                                                        |
| 54  | A color control writes through the scope it was drawn for, and Custom's text field is keyed by its draft's destination (PR 11)                                                                                                                                                                                                                          | Write through the scope chosen now, which hands a late change from Grid's field to List                                                                                                                                                                                |
| 55  | A word the card honors in a field (`accent`, `home-assistant`, the badge's `text`), typed in Custom, is written as its row writes it, trimmed (PR 11)                                                                                                                                                                                                   | Write it as a custom color, which forces an entry's mode to `custom` and stores the card's color in its place                                                                                                                                                          |
| 56  | Default describes the value it falls back to, and the card's primary color reads "Home Assistant's primary color", so Follow the card reads "The card's Accent Color, Home Assistant's primary color" as the D13 mockup draws it (PR 11)                                                                                                                | A fixed sentence per row                                                                                                                                                                                                                                               |
| 57  | The swatches' English fallbacks follow Home Assistant's sentence case in American spelling ("Gray", "Blue gray"); Home Assistant's own names, which its English spells "Grey", are read first and verified on 2026.11.1 (PR 11)                                                                                                                         | Title Case fallbacks                                                                                                                                                                                                                                                   |
| 58  | Entry pages draw an entry's color controls (Event Color, Label Icon Color, Accent Color) through the entry's owner, a mode's value inside its control; the registry subscription's one read of `connection` and `callWS` is left out of the `hass` read-set test, counted, since nothing drawn comes from it through `hass` (PR 11)                     | Put `connection` and `callWS` in the editor's `hass` key, which would render for a change nothing draws                                                                                                                                                                |
| 59  | PR 11 adds about 7.6 KB gzip -9 to the editor against its 2.6 KB cap; the approved scope is kept and the overrun recorded rather than trimmed (PR 11)                                                                                                                                                                                                   | Cut rows, descriptions, the registry read or the YAML line to meet the cap                                                                                                                                                                                             |

## 13. Findings

What the design turned out to cost, what proved feasible or harder than estimated, and how each open
point was settled.

1. **The size is accepted**: about 315 strings in every language, the editor growing by about 56 KB
   gzip -9 to about 238 KB, where the approved estimate was 16-22 KB of growth (section 10). The
   first revision understated that estimate as 10-12 KB "in all"; it was 10-12 KB of code, CSS and
   English plus 6-10 KB of translations. The difference is the count of strings, about 315 against
   70-90, at a measured 133.5 B a string in every language (section 8.5), not a higher rate. Every
   string traces to an approved screen or to candidate A's §§5-10 (section 8.1), and none is
   trimmed: the editor loads only when someone opens it, and the card's eager path is untouched.
   Keeping the approved gate-line wording (row F below) adds 17 keys and about 2.3 KB, so the plan
   stands at about 332 strings and about 241 KB. The per-PR caps stay the guard. PR 1, built, came
   in at +0.43 KB against its +0.8 KB estimate.
2. **Split's event list is feasible, and showing exactly what the card shows costs +1,819 B gzip
   -9** (+4,664 B raw) as a sketch: the REST read, a mirror of the card's window and per-entry
   eligibility (its util imports are 227 B of that) and the assignment. It agreed with the card's
   own pipeline in all 1,008 configurations, in four zones [probe]; the second revision's +671 B
   sketch started at today and disagreed in 752. The first revision called the list infeasible
   without pricing it.
3. **State words go in the label for 102 of 223 fields** (booleans, dropdowns, icon, entity,
   actions), because Home Assistant exposes the helper as a description only for text and number
   ([measured] §3). Those labels get longer on screen; truncation at 362 px is unverified until PR 15.
4. **Today's Card Displays control has no accessible name** (box-mode select, [measured] §3). The
   card-built radio group fixes it in PR 5.
5. **Fourteen English labels change for good**: six Weather pairs gain "Beside Days" or "Beside
   Events" (adopted, row D below), and the Accent Color value fields become "Custom Accent Color",
   so no page repeats a name; the mode dropdowns read "Accent Color Source" from PR 5 until PR 11
   folds them into the color control. Translations of the fourteen are stale until PR 20.
6. **Following Home Assistant's color reads the entity registry from the editor too** (+124 B), a
   second read and subscription per page while an editor is open (decision 24).
7. **Step 1 exceeds R39's first-paint budget** on Events (49 fields with every feature on) until step
   3 shrinks pages; the branch is not released in between.
8. **Seven docs anchors are frozen** by the release archive, so `editor.md` keeps three headings for
   retired controls under "Where Earlier Controls Went" (section 9).
9. **Two gaps in today's gates**: `check:i18n` does not see `this._string(ctx, '…')` keys (closed in
   PR 1), and almost every PR must edit `installation.md`'s size sentence because `check:bundle` holds
   it to the kilobyte.
10. **The design names `ha-svg-icon` as allowed** (D16); candidate A §12 and this plan use inline
    SVG (decision 9). Keeping `ha-svg-icon` would be a one-line revert.
11. **The phone check stays open as a live-review item**: the Companion app's Back and the iOS swipe
    with the editor open (step 0). It does not block PR 5. The editor is built to the expected
    behavior, Back closing the dialog behind Home Assistant's unsaved-changes prompt after an edit,
    and the first live review on a phone, PR 5's, runs the check.
12. **The stray branch that broke `git fetch` here is gone**; fetching works again in this worktree.
13. **Two first opens stay short after PR 3, recorded with no code.** At 400 px a panel holding an
    `assist` action opens 56 px short, 1,109 px against 1,165: the assist pipeline picker asks for
    its pipeline list once per instance and draws nothing until it has it, about 20 ms after Home
    Assistant has measured the panel, and the warm-up's own picker cannot lend it the list
    [measured, PR 3]. Beside it, the warm-up watches only the entities a value names: one a
    `perform-action` target reaches only through an area, a device or a label is not watched, so a
    field such an entity comes to support, a color once its light reports `rgb`, loads on the
    panel's first open [probe]. Same symptom, rarer still. PR 5 turns Actions & Refresh, where both
    show, into a page with no measured open; a toolbar button's action keeps its panel until PR 18.

### Differences From the Approved Design, Decided

Where this plan's words or focus differ from an approved text, with the outcome of each. A, B, C, D,
E and G are adopted as the plan has them, for the reasons given; F keeps the approved design's
wording. A later refinement of wording is decided in the PR that makes it and recorded in section 12.

| #   | Where                                 | Approved text                                                                                                                                                                                                                                                            | This plan                                                                                                                                                                                                                                    | Why                                                                                                                                              | Outcome                                                                                                                                                                                                                                                |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | Focus (3.3, 5.3-5.5); PRs 7, 8, 15    | Reset focuses "the field's control" (candidate A §7); Undo "the restored control or row", a search result "the field" (ia-final §9)                                                                                                                                      | The field's wrapper (`tabindex=-1`, named after the field), never an element inside a form                                                                                                                                                   | Focusing an input opens a phone's keyboard and sends the next Ctrl/Cmd+Z to the input's own undo; `ha-form.focus()` does nothing ([measured] §4) | Adopted                                                                                                                                                                                                                                                |
| B   | Overflow lists (5.2, 5.7); PRs 12, 15 | "· and 4 more" (D02 mockup); "Now, Time Position, … (Settings: 10)" (D05 mockup); "and 3 more" in Split's review (prototype)                                                                                                                                             | One template, "{names}, +{count}", in Add rows and the other-layouts line, and "+3" in Split's review                                                                                                                                        | "and N more" has to agree with N in some of the nine languages; the template inflects nothing and a translator can reorder it                    | Adopted                                                                                                                                                                                                                                                |
| C   | Split's review (5.7); PR 12           | "Next 7 days · Events: 1" (D12 mockup)                                                                                                                                                                                                                                   | "Days Ahead: 7 · Events: 1"                                                                                                                                                                                                                  | "7 days" needs a plural form, and Days to Show can be 1                                                                                          | Adopted                                                                                                                                                                                                                                                |
| D   | Weather labels (5.9); PR 5            | ia-final §5 rule 5 names "Show Conditions Beside Events"; the decision mockups draw today's labels, "Show Conditions"                                                                                                                                                    | All six pairs gain the place: "Show Conditions Beside Days" and "… Beside Events", twelve labels                                                                                                                                             | Each name occurs twice on the Weather page, and again in Add rows, search, undo labels and screen-reader field lists                             | Adopted                                                                                                                                                                                                                                                |
| E   | Search (5.8); PR 8                    | "“color” · Settings: 42" (D05 mockup); "Results for “color”: 42" (prototype)                                                                                                                                                                                             | The prototype's line, with the D05 mockup's "Values for Grid" beside it                                                                                                                                                                      | Announced alone, it says what the number counts                                                                                                  | Adopted                                                                                                                                                                                                                                                |
| F   | Gate lines (5.2); PRs 15, 18          | "Appears once Show Description is on: …" and "Appears once the forecast shows beside events: Event Weather." (candidate A §7; the D01, D02, D05, D08 and D12 mockups), with "Stored but not in use: Description Font Size (20px)" after its gate line                    | The second revision proposed the prototype's "Appears with Show Description: …" and a stored line that named what it waited for                                                                                                              | One noun phrase would have read after "with" for a switch, a dropdown or a phrase alike                                                          | The approved wording kept, reworked in section 5.2: a clause per condition beside PR 1's nouns, which stay for search's tags; the stored line after its gate line; built in PR 15, the chip form in PR 18; 17 more keys, about 2.3 KB in all languages |
| G   | Split's refusals (5.7); PR 12         | The D12 mockup draws only the words refusal; the prototype writes "This entry already shows only all-day events, following the card's Event Type. Duplicate it to add an entry for events with a time.", "… Clear it before splitting." and "No events in the next days" | The type and budget refusals in the D12 refusal's shape, "Can't split Bin Day into all-day and timed events: it already shows only all-day events, …" and "Can't split Ben: … Clear it first.", and "No events in the days this card shows." | One shape for every refusal, naming the entry; the list covers the card's window, which may start on a later or a fixed date                     | Adopted                                                                                                                                                                                                                                                |

Where two approved texts differ only in letter case, the plan follows the prototype ("Editing Grid ·
Preview Shows List"). Two differences of the second revision were restored rather than adopted: the
mode dropdowns read "Accent Color Source" until PR 11, as ia-final §5 rule 5 has it, and a move is
announced "Moved Ben to position 2 of 5.", as the prototype has it.

## Appendix A · Page Registry Seed

`pages.ts` starts from this table. Placement is candidate A's page map exactly; the headings are
this plan's, reusing today's heading strings wherever the words match (Time, Location, Description,
Gap & Rule, Between Days, Across the Grid, Hour Labels, On the Grid). A script built the table from
data and checked it against candidate A's map: 223 of 223 ids placed once, each on candidate A's
page, none unknown [probe] (`appendix-a.mjs`). Markers: **E** essential, **A** Add, **W** a mode
value (shown with its mode), **F** a family member, **B** a toolbar button's row; the scope tags are
candidate A's (S All Layouts, L List, C Columns, G Grid; untagged means all four). Until PR 15 every
applicable field is live, so the markers start to matter in step 3. Placement does not change when
the presentation does: from PR 11 every color field, with any mode field that picks its source, is
drawn as one color control; from PR 18 the eight event parts (Time, End Time, Location, Description,
Countdown, Progress Bar, Duration, Now) and the six toolbar controls are drawn as chips, and Calendar
Filter as a segmented control. Outside the 223: the synthetic `actions:event_opens_details` (PR 19)
on the overview, and the chassis controls (Settings For, Card Displays, the Add Calendar picker, an
entry's Calendar picker).

**Overview**

| Heading                  | Fields                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Calendars block          | `calendars:calendars` (E)                                                                                                  |
| Days to Show, Start Date | `content:days_to_show` (E), `content:start_date_mode` (E), `content:start_date_fixed` (W), `content:start_date_offset` (W) |

**Which Events**

| Heading                                          | Fields                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (unheaded top run)                               | `content:event_type` (A), `content:filter_duplicates_mode` (A), `content:duplicate_accent_color` (A), `content:event_order` (A L), `content:skip_first_events` (A L) |
| Past Events (cross-link: Day Header › Past Days) | `content:show_past_events` (E), `events:past_event_opacity` (A)                                                                                                      |
| Multi-Day Events                                 | `content:split_multiday_events` (A SLC), `content:multiday_banners` (A G)                                                                                            |
| Empty Days                                       | `content:show_empty_days` (E), `content:show_empty_today` (E), `content:empty_day_text` (E SLC), `content:empty_day_color` (A SLC), `content:hide_when_empty` (A)    |
| Compact Mode (family `compact_mode`)             | `content:compact_days_to_show` (F L), `content:compact_events_to_show` (F L), `content:compact_events_complete_days` (F L)                                           |

**Card & Header**

| Heading                                 | Fields                                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (unheaded top run)                      | `card:title` (E), `card:title_font_size` (A), `card:title_color` (A), `card:background_color` (A), `content:language_mode` (A), `content:language` (W)                                                                             |
| Toolbar (built-ins as chips from PR 18) | `card:toolbar.show` (E), `card:toolbar.legend` (E), `card:toolbar.add_event` (E), `card:toolbar.view_switcher` (E), `card:toolbar.reset` (E), `card:toolbar.refresh` (E), `card:toolbar.search` (E), `card:toolbar.navigation` (E) |
| Your Own Buttons (rows)                 | `button:icon` (B), `button:name` (B), `button:entity` (B), `button:tap_action` (B)                                                                                                                                                 |

**Day Header**

| Heading                                                                | Fields                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (unheaded top run)                                                     | `day_header:date_vertical_alignment` (A L), `day_header:weekday_font_size` (A), `day_header:weekday_color` (A), `day_header:day_font_size` (A), `day_header:day_color` (A), `day_header:show_month` (E), `day_header:month_font_size` (A), `day_header:month_color` (A)                                             |
| Gap & Rule                                                             | `day_header:column.day_header_gap` (A C), `day_header:column.day_header_separator_width` (A C), `day_header:column.day_header_separator_color` (A C), `day_header:time_grid.day_header_gap` (A G), `day_header:time_grid.day_header_separator_width` (A G), `day_header:time_grid.day_header_separator_color` (A G) |
| Weeks                                                                  | `content:first_day_of_week` (E), `day_header:week_number_mode` (E), `day_header:show_current_week_number` (E), `day_header:week_number_font_size` (A), `day_header:week_number_color` (A), `day_header:week_number_background_color` (A)                                                                            |
| Today                                                                  | `day_header:today_date_scale` (A), `day_header:today_date_font_weight` (A), `day_header:today_weekday_color` (A), `day_header:today_day_color` (A), `day_header:today_month_color` (A)                                                                                                                              |
| Today Indicator                                                        | `day_header:today_indicator_style` (E), `day_header:today_indicator_icon` (W), `day_header:today_indicator_custom` (W), `day_header:today_indicator_color` (A), `day_header:today_indicator_size` (A), `day_header:today_indicator_position` (A L)                                                                  |
| Past Days (family `past_days`; cross-link: Which Events › Past Events) | `day_header:past_date_opacity` (F), `day_header:past_date_scale` (F), `day_header:past_date_font_weight` (F)                                                                                                                                                                                                        |
| Weekend Colors (family `weekend_colors`)                               | `day_header:weekend_weekday_color` (F), `day_header:weekend_day_color` (F), `day_header:weekend_month_color` (F)                                                                                                                                                                                                    |

**Events**

| Heading                               | Fields                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event Details (part chips from PR 18) | `events:show_time` (E), `events:show_location` (E), `events:show_description` (E), `events:show_countdown` (E), `events:show_progress_bar` (A), `content:time_format` (E), `events:time_position` (A SLC)                                                                                           |
| Event State                           | `events:show_now_indicator` (A SLC), `events:now_color` (A)                                                                                                                                                                                                                                         |
| Accent                                | `events:accent_event_text` (A), `events:accent_color_mode` (A), `events:accent_color` (W), `events:vertical_line_width` (A), `events:event_background_opacity` (A)                                                                                                                                  |
| Title                                 | `events:event_font_size` (A), `events:event_color` (A), `events:title_max_lines` (A), `events:scroll_long_titles` (A)                                                                                                                                                                               |
| Icon & Badge                          | `events:event_icon_vertical_alignment` (A), `events:allday_badge_position` (A SLC), `events:allday_badge_style` (W SLC), `events:allday_badge_color_mode` (W SLC), `events:allday_badge_color` (W SLC)                                                                                              |
| Time                                  | `events:show_end_time` (E), `events:show_duration` (A), `events:show_single_allday_time` (A SLC), `events:show_multiday_allday_time` (A SLC), `events:time_two_digit_hours` (A), `events:time_font_size` (A), `events:time_color` (A), `events:time_icon_size` (A), `events:time_max_lines` (A SLC) |
| Location                              | `events:show_location_allday` (A SLC), `events:location_country_mode` (A), `events:location_country_pattern` (W), `events:location_font_size` (A), `events:location_color` (A), `events:location_icon_size` (A), `events:location_max_lines` (A)                                                    |
| Description                           | `events:show_description_allday` (A SLC), `events:description_font_size` (A), `events:description_color` (A), `events:description_icon_size` (A), `events:description_max_lines` (A)                                                                                                                |
| Countdown & Progress                  | `events:countdown_max_days` (A), `events:show_countdown_allday` (A SLC), `events:countdown_once_per_day` (A SLC), `events:countdown_exact_days` (A), `events:progress_bar_color` (A), `events:progress_bar_height` (A), `events:progress_bar_width` (A)                                             |

**Size & Spacing**

| Heading                                  | Fields                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card Size & Spacing                      | `layout:height_mode` (E), `layout:card_height` (W), `layout:card_max_height` (W), `layout:additional_card_spacing` (A), `layout:event_gap` (A SLC), `layout:event_spacing` (A SLC)                                                                                                                     |
| Column Density (family `column_density`) | `layout:column.min_day_width` (F C), `layout:column.min_days_to_show` (F C), `layout:column.min_days_fallback` (F C)                                                                                                                                                                                   |
| Grid Density (family `grid_density`)     | `layout:time_grid.min_day_width` (F G), `layout:time_grid.min_days_to_show` (F G), `layout:time_grid.min_days_fallback` (F G)                                                                                                                                                                          |
| Between Days                             | `layout:day_spacing` (A SLC), `separators:day_spacing` (A G), `separators:day_separator_width` (A), `separators:day_separator_color` (A), `separators:week_separator_width` (A), `separators:week_separator_color` (A), `separators:month_separator_width` (A), `separators:month_separator_color` (A) |
| Across the Grid                          | `separators:time_grid.hour_line_width` (A G), `separators:time_grid.hour_line_color` (A G), `separators:time_grid.allday_band_line_width` (A G), `separators:time_grid.allday_band_line_color` (A G)                                                                                                   |

**Grid (only while Grid is the scope)**

| Heading     | Fields                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time Axis   | `layout:time_grid.start_time` (E G), `layout:time_grid.end_time` (E G), `layout:time_grid.slot_minutes` (A G), `layout:time_grid.hour_height` (A G)                                                                                                                                  |
| Hour Labels | `layout:time_grid.axis_width` (A G), `layout:time_grid.show_axis_labels` (A G), `layout:time_grid.axis_label_minutes` (A G)                                                                                                                                                          |
| On the Grid | `layout:time_grid.weekend_background_color` (A G), `layout:time_grid.today_background_color` (A G), `layout:time_grid.show_now_line` (A G), `layout:time_grid.allday_band_max_rows` (A G), `layout:time_grid.overlap_layout` (A G), `layout:time_grid.max_simultaneous_events` (A G) |

**Weather**

| Heading                                | Fields                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (unheaded top run)                     | `weather:weather.entity` (E), `weather:weather.position` (E)                                                                                                                                                                                                                                                                                                                               |
| In the Day Header                      | `weather:weather.date.show_conditions` (E), `weather:weather.date.show_high_temp` (E), `weather:weather.date.show_low_temp` (E), `weather:weather.date.show_uv_index` (E), `weather:weather.date.uv_index_threshold` (W), `weather:weather.date.icon_size` (A), `weather:weather.date.font_size` (A), `weather:weather.date.color` (A)                                                     |
| Beside Each Event (per-calendar links) | `weather:weather.event.show_conditions` (E), `weather:weather.event.show_temp` (E), `weather:weather.event.show_uv_index` (E), `weather:weather.event.uv_index_threshold` (W), `weather:weather.event.daily_forecast_fallback` (E), `weather:weather.event.icon_size` (A), `weather:weather.event.font_size` (A), `weather:weather.event.color` (A), `weather:weather.event.max_lines` (A) |

**Taps & Refresh**

| Heading   | Fields                                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (one run) | `actions:tap_action` (E), `actions:hold_action` (A), `actions:day_tap_action_mode` (E), `actions:event_tap_action` (E), `actions:event_hold_action` (A), `actions:open_links` (A SLC), `actions:allow_event_edit` (E), `actions:allow_event_delete` (E), `actions:refresh_interval` (A), `actions:refresh_on_navigate` (A) |

**A calendar entry's page (`ENTRY_GROUPS`)**

| Heading                                         | Fields                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name & Look                                     | `calendar:name` (E), `calendar:show_in_legend` (A), `calendar:label_type` (E), `calendar:label_icon_source` (W), `calendar:label_image_source` (W), `calendar:label` (W), `calendar:label_icon_color` (A), `calendar:color` (A), `calendar:accent_color_mode` (E), `calendar:accent_color` (W), `calendar:text_scale` (A) |
| Who Sees It                                     | `calendar:visibility` (A)                                                                                                                                                                                                                                                                                                 |
| Which Events (plus the Split This Calendar row) | `calendar:days_of_week` (A), `calendar:event_type` (A), `calendar:allday_expires_at` (A), `calendar:filter_field` (W), `calendar:blocklist` (A), `calendar:allowlist` (A), `calendar:compact_events_to_show` (A L)                                                                                                        |
| Text Replacement (family `replace`)             | `calendar:replace_field` (F), `calendar:replace_pattern` (F), `calendar:replace_with` (F)                                                                                                                                                                                                                                 |
| Multi-Day Events                                | `calendar:split_multiday_events` (A SLC), `calendar:multiday_banners` (A G)                                                                                                                                                                                                                                               |
| Event Details                                   | `calendar:show_time` (A), `calendar:show_location` (A), `calendar:location_icon` (A), `calendar:show_description` (A), `calendar:show_weather` (A)                                                                                                                                                                        |

## Appendix B · Gates

`gates.ts` starts from this table, and PR 1's test validates it the way the probe did. A gate's
prerequisites are listed in opening order and must all hold. Each opening edit is applied through
`routing.ts` › `applyWorkspaceChange` from a one-field frame, as a user's edit would be, so a value
Grid or Columns defaults differently lands in that layout's own block. "Closed by" lists the values
that break each prerequisite; each was applied from the opened state, and the gated fields had to
disappear. [probe] `gates4.mjs`: 32 gates, 2,415 open-and-close checks across 4 scopes and 3
displays, 0 failures. PR 1 built `gates.ts` from this table: 33 card gates and 8 on a calendar
entry's fields (`ENTRY_GATES`), with Event Details opening by either event action and Open Links
waiting on both, as rows 22 and 32 now read. A condition holds for every value its option allows,
not only those its control offers: Countdown holds for `true` and for `once_per_day`. **Kind**: a
gate gets a gate line naming its first unmet condition, so one gate explains itself differently as
different conditions are unmet; a mode value never does, because its mode control already says what
it waits for, though search still says what it needs. `{needs}` is the noun search's tags use
("Needs Show Description"): the condition's own phrase, else the gate's, else the control's label
(after PR 5's renames); a phrase in quotation marks is one of PR 1's ten `gate.needs.*` strings. A
gate line reads the clause beside it instead, from PR 15 ("Appears once Show Description is on: …";
section 5.2's table).

| #   | Gate              | Opening edits, in order                                                                                                                                            | Closed by, each checked                                                                                    | Gated fields                                                                                                                                                                                                                                                            | Kind       | `{needs}`, by unmet prerequisite                                                  |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| 1   | Time              | `events:show_time` = `true`                                                                                                                                        | `show_time` = `false`                                                                                      | `events:show_end_time`, `events:show_duration`, `events:show_single_allday_time`, `events:show_multiday_allday_time`, `events:time_two_digit_hours`, `events:time_font_size`, `events:time_color`, `events:time_icon_size`, `events:time_max_lines`                     | gate       | Show Time                                                                         |
| 2   | Location          | `events:show_location` = `true`                                                                                                                                    | `show_location` = `false`                                                                                  | `events:show_location_allday`, `events:location_country_mode`, `events:location_font_size`, `events:location_color`, `events:location_icon_size`, `events:location_max_lines`                                                                                           | gate       | Show Location                                                                     |
| 3   | Countries         | `events:show_location` = `true`, then `events:location_country_mode` = `custom`                                                                                    | `show_location` = `false`; `location_country_mode` = `keep` or `builtin`                                   | `events:location_country_pattern`                                                                                                                                                                                                                                       | mode value | (none: a mode value)                                                              |
| 4   | Description       | `events:show_description` = `true`                                                                                                                                 | `show_description` = `false`                                                                               | `events:show_description_allday`, `events:description_font_size`, `events:description_color`, `events:description_icon_size`, `events:description_max_lines`                                                                                                            | gate       | Show Description                                                                  |
| 5   | Countdown         | `events:show_countdown` = `true` (`once_per_day` holds as well)                                                                                                    | `show_countdown` = `false`                                                                                 | `events:countdown_max_days`, `events:show_countdown_allday`, `events:countdown_once_per_day`, `events:countdown_exact_days`                                                                                                                                             | gate       | Show Countdown                                                                    |
| 6   | Progress Bar      | `events:show_progress_bar` = `true`                                                                                                                                | `show_progress_bar` = `false`                                                                              | `events:progress_bar_color`, `events:progress_bar_height`, `events:progress_bar_width`                                                                                                                                                                                  | gate       | Show Progress Bar                                                                 |
| 7   | Month             | `day_header:show_month` = `true`                                                                                                                                   | `show_month` = `false`                                                                                     | `day_header:month_font_size`, `day_header:month_color`, `day_header:today_month_color`, `day_header:weekend_month_color`                                                                                                                                                | gate       | Show Month                                                                        |
| 8   | Week Numbers      | `day_header:week_number_mode` = `iso`                                                                                                                              | `week_number_mode` = `none`                                                                                | `day_header:show_current_week_number`, `day_header:week_number_font_size`, `day_header:week_number_color`, `day_header:week_number_background_color`                                                                                                                    | gate       | Numbering                                                                         |
| 9   | Indicator Color   | `day_header:today_indicator_style` = `dot`                                                                                                                         | `today_indicator_style` = `none`                                                                           | `day_header:today_indicator_color`                                                                                                                                                                                                                                      | gate       | "a Style other than None"                                                         |
| 10  | Indicator Size    | `day_header:today_indicator_style` = `dot`                                                                                                                         | `today_indicator_style` = `none` or `tile`                                                                 | `day_header:today_indicator_size`, `day_header:today_indicator_position`                                                                                                                                                                                                | gate       | "a dot, icon or emoji Style"                                                      |
| 11  | All-Day Badge     | `events:allday_badge_position` = `time`                                                                                                                            | `allday_badge_position` = `off`                                                                            | `events:allday_badge_style`, `events:allday_badge_color_mode`                                                                                                                                                                                                           | mode value | (none: a mode value)                                                              |
| 12  | Badge Color       | `events:allday_badge_position` = `time`, then `events:allday_badge_color_mode` = `custom`                                                                          | `allday_badge_position` = `off`; `allday_badge_color_mode` = `accent` or `text`                            | `events:allday_badge_color`                                                                                                                                                                                                                                             | mode value | (none: a mode value)                                                              |
| 13  | Today When Empty  | `content:show_empty_days` = `false`                                                                                                                                | `show_empty_days` = `true`                                                                                 | `content:show_empty_today`                                                                                                                                                                                                                                              | gate       | "Show Empty Days off"                                                             |
| 14  | Duplicates        | `content:filter_duplicates_mode` = `exact`                                                                                                                         | `filter_duplicates_mode` = `off`                                                                           | `content:duplicate_accent_color`                                                                                                                                                                                                                                        | gate       | Filter Duplicates                                                                 |
| 15  | Toolbar           | `card:toolbar.show` = `true`                                                                                                                                       | `toolbar.show` = `false`                                                                                   | `card:toolbar.legend`, `card:toolbar.add_event`, `card:toolbar.view_switcher`, `card:toolbar.reset`, `card:toolbar.refresh`, `card:toolbar.search`, `card:toolbar.navigation`                                                                                           | gate       | Show Toolbar                                                                      |
| 16  | Forecast          | `weather:weather.entity` = `weather.home`                                                                                                                          | `weather.entity` = empty                                                                                   | `weather:weather.position`                                                                                                                                                                                                                                              | gate       | Weather Entity                                                                    |
| 17  | Forecast by Day   | `weather:weather.entity` = `weather.home`, then `weather:weather.position` = `date`                                                                                | `weather.entity` = empty; `weather.position` = `event` or `none`                                           | `weather:weather.date.show_conditions`, `weather:weather.date.show_high_temp`, `weather:weather.date.show_low_temp`, `weather:weather.date.show_uv_index`, `weather:weather.date.icon_size`, `weather:weather.date.font_size`, `weather:weather.date.color`             | gate       | Weather Entity / "the forecast in the day header"                                 |
| 18  | UV by Day         | `weather:weather.entity` = `weather.home`, then `weather:weather.position` = `date`, then `weather:weather.date.show_uv_index` = `true`                            | `weather.entity` = empty; `weather.position` = `event` or `none`; `weather.date.show_uv_index` = `false`   | `weather:weather.date.uv_index_threshold`                                                                                                                                                                                                                               | mode value | (none: a mode value)                                                              |
| 19  | Forecast by Event | `weather:weather.entity` = `weather.home`, then `weather:weather.position` = `event`                                                                               | `weather.entity` = empty; `weather.position` = `date` or `none`                                            | `weather:weather.event.show_conditions`, `weather:weather.event.show_temp`, `weather:weather.event.show_uv_index`, `weather:weather.event.daily_forecast_fallback`, `weather:weather.event.icon_size`, `weather:weather.event.font_size`, `weather:weather.event.color` | gate       | Weather Entity / "the forecast beside each event"                                 |
| 20  | Weather Lines     | `weather:weather.entity` = `weather.home`, then `weather:weather.position` = `event`, then `weather:weather.event.show_conditions` = `true`                        | `weather.entity` = empty; `weather.position` = `date` or `none`; `weather.event.show_conditions` = `false` | `weather:weather.event.max_lines`                                                                                                                                                                                                                                       | gate       | Weather Entity / "the forecast beside each event" / Show Conditions Beside Events |
| 21  | UV by Event       | `weather:weather.entity` = `weather.home`, then `weather:weather.position` = `event`, then `weather:weather.event.show_uv_index` = `true`                          | `weather.entity` = empty; `weather.position` = `date` or `none`; `weather.event.show_uv_index` = `false`   | `weather:weather.event.uv_index_threshold`                                                                                                                                                                                                                              | mode value | (none: a mode value)                                                              |
| 22  | Event Details     | `actions:event_tap_action` = `{ action: details }`, or the same on `actions:event_hold_action` (either branch, as `synthetic.ts` › `eventOpensDetails` reads them) | neither action `details`                                                                                   | `actions:allow_event_edit`, `actions:allow_event_delete`                                                                                                                                                                                                                | gate       | "Show Event Details as a tap or hold action"                                      |
| 23  | Fixed Date        | `content:start_date_mode` = `fixed`                                                                                                                                | `start_date_mode` = `default` or `offset`                                                                  | `content:start_date_fixed`                                                                                                                                                                                                                                              | mode value | (none: a mode value)                                                              |
| 24  | Relative Date     | `content:start_date_mode` = `offset`                                                                                                                               | `start_date_mode` = `default` or `fixed`                                                                   | `content:start_date_offset`                                                                                                                                                                                                                                             | mode value | (none: a mode value)                                                              |
| 25  | Fixed Height      | `layout:height_mode` = `fixed`                                                                                                                                     | `height_mode` = `auto` or `maximum`                                                                        | `layout:card_height`                                                                                                                                                                                                                                                    | mode value | (none: a mode value)                                                              |
| 26  | Maximum Height    | `layout:height_mode` = `maximum`                                                                                                                                   | `height_mode` = `auto` or `fixed`                                                                          | `layout:card_max_height`                                                                                                                                                                                                                                                | mode value | (none: a mode value)                                                              |
| 27  | Language          | `content:language_mode` = `custom`                                                                                                                                 | `language_mode` = `system`                                                                                 | `content:language`                                                                                                                                                                                                                                                      | mode value | (none: a mode value)                                                              |
| 28  | Accent            | `events:accent_color_mode` = `custom`                                                                                                                              | `accent_color_mode` = `home_assistant`                                                                     | `events:accent_color`                                                                                                                                                                                                                                                   | mode value | (none: a mode value)                                                              |
| 29  | Indicator Icon    | `day_header:today_indicator_style` = `icon`                                                                                                                        | `today_indicator_style` = `dot` or `none`                                                                  | `day_header:today_indicator_icon`                                                                                                                                                                                                                                       | mode value | (none: a mode value)                                                              |
| 30  | Indicator Text    | `day_header:today_indicator_style` = `custom`                                                                                                                      | `today_indicator_style` = `dot` or `none`                                                                  | `day_header:today_indicator_custom`                                                                                                                                                                                                                                     | mode value | (none: a mode value)                                                              |
| 31  | Compact Days      | `content:compact_events_to_show` = `3`                                                                                                                             | `compact_events_to_show` = unset                                                                           | `content:compact_events_complete_days`                                                                                                                                                                                                                                  | gate       | "an Events limit under Compact Mode"                                              |
| 32  | Open Links        | `actions:event_tap_action` = `{ action: none }`, then `actions:event_hold_action` = `{ action: none }` (as `synthetic.ts` › `eventHasOwnAction` reads them)        | either action set to `details` or another action                                                           | `actions:open_links`                                                                                                                                                                                                                                                    | gate       | "both event actions set to Nothing"                                               |

**The either-or gate.** `content:empty_day_text` and `content:empty_day_color` need Show Empty Days
on, or Show Empty Days off and Show Today When Empty on (`anyOf`). The probe opened them each way and
closed them with neither, in every scope and display: 18 checks, 0 failures. `{needs}`: "Show Empty
Days or Show Today When Empty".

**Second branches read, not probed.** Event Details also opens with Event Hold Action set to Show
Event Details (`anyOf`), and Open Links needs both actions set to Nothing: `schemas/actions.ts` ›
`actionsSchema` takes `opensDetails` and `eventActs` for a tap or a hold [read]. The probe exercised
the tap.

**Entry gates** (`ENTRY_GATES`), [read] from `schemas/entity.ts` › `entitySchemaFor` and its caller
`element.ts` › `_renderEntities`:

| Gated fields                                                                  | Prerequisites                                                                                                                            | Kind                                              | `{needs}`                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `calendar:accent_color`                                                       | `calendar:accent_color_mode` = `custom`                                                                                                  | mode value, absorbed by the color control (PR 11) | —                                                                        |
| `calendar:label`, `calendar:label_icon_source`, `calendar:label_image_source` | `calendar:label_type`, by type, and the icon or image source                                                                             | mode value                                        | —                                                                        |
| `calendar:label_icon_color`                                                   | `calendar:label_type` = `icon`                                                                                                           | gate (as PR 1 built it)                           | Label Type; clause "the label is an icon"                                |
| `calendar:location_icon`                                                      | The entry shows locations: its own Show Location, or the card's in the scope while it follows the card (`entities.ts` › `showsLocation`) | gate                                              | Show Location or Event Locations; clause "this calendar shows locations" |
| `calendar:show_in_legend`                                                     | `card:toolbar.show` on and `card:toolbar.legend` not off (`hasLegend`)                                                                   | gate                                              | "a calendar filter in the toolbar"                                       |
| `calendar:show_weather`                                                       | `weather:weather.entity` set and `weather:weather.position` `event` or `both` (`showsEventWeather`)                                      | gate                                              | "the forecast beside each event"                                         |

Two of the prototype's gates, "Now" and "Countdown or Progress Bar", are not gates in today's
builders: their fields are present regardless. The builders stay the authority on presence (no
behavior change), so they are not in this table; PR 1's universe reconciliation would fail if a
builder gated them.

## Appendix C · Review Findings and Where They Are Resolved

Both reviews of the first revision (`reviews/plan-review-design.md`, `reviews/plan-review-engineering.md`
in the session folder) and their re-review of the second (`reviews/plan-rereview.md`), each finding
with the decision taken where one was needed and where this revision answers it. Design deviations
were resolved toward the approved design.

**Design review: blocking**

| #   | Finding                                                            | Resolution                                                                                                                                                                                                                      | Where                         |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | Split can show events twice when an existing pattern is unreadable | The invalid-pattern refusal restored (By Words refused, By Type allowed); membership tested through `processEvents` and `groupEventsByDay` with `[` and `(`, plus a control case that must fail                                 | 5.7; `split.ts`; PR 12        |
| 2   | Split's named-event review replaced by the preview                 | The approved list, read over the card's REST path with a mirrored filter, measured +671 B; the preview supplements it; the mirror reconciled against the card's filter by test. The re-review found its window wrong; see below | 5.7; `split-review.ts`; PR 12 |
| 3   | Edit Here limited to 12 results                                    | On request at any count; the cutoff and its test removed; tested at 1 and 60 results                                                                                                                                            | 5.8; PR 17                    |
| 4   | The compact scope rule was the superseded one                      | The prototype's `isCompact`: values for the displayed layout keep it compact; another layout's values, the View Switcher or a session choice make it full                                                                       | 5.10; PR 5                    |
| 5   | Invalid custom colors written                                      | Drafts in UI state; the last committed value stays; written once valid                                                                                                                                                          | 5.9; PR 11                    |
| 6   | The color control was not the composed one                         | The approved control: source rows, 19 named swatches with a check, Custom only when needed, a live swatch and the YAML line, over today's routing and synthetic fields; before Split                                            | 5.9; `colors.ts`; PR 11       |
| 7   | Keyboard grab missing; entries moved independently                 | Space, arrows, Space, Escape, with a status line, on calendars and own buttons, plus Alt+Arrow and Move actions; one handle per calendar; entry-level moves dropped                                                             | 5.6, 5.11; PRs 13, 18         |
| 8   | Chip visibility contradicted the gating                            | Membership from layout availability; gates set the enabled state (End Time and Duration disabled while Time is off); the source summary and the hint kept                                                                       | 5.9; PR 18                    |

**Design review: non-blocking**

| Finding                                     | Resolution                                                                                                                              | Where                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| State words quieter than approved           | The prototype's `stateOf` exactly, "Grid's Default" with nothing stored included                                                        | 5.3; PRs 14, 15             |
| Reset did not say what it gives             | The Reset outcome line, "Reset gives Grid's Default, 12px, not the All Layouts value, 14px", as the Reset button's description          | 5.3; PRs 14, 15             |
| Weather exempted from inherited differences | All eight entry tri-states, `show_weather` included                                                                                     | 5.1; PR 14                  |
| Search rows lacked provenance and Add       | Source words, the YAML path always, the helper snippet, and an explicit Add                                                             | 5.8; PRs 8, 15, 17          |
| Audit rows lacked YAML paths                | Path and state words on every row, always                                                                                               | 5.10; PR 16                 |
| Toolbar details weakened                    | Calendar Filter as a segmented Off · Menu · Chips control; own-button rows with their action and target; the helper under the built-ins | 5.9; PR 18                  |
| Split's labels, order and result            | A Label per part, All-Day first, and the completion panel linking both entries                                                          | 5.7; PR 12                  |
| Entry transitions underspecified            | Duplicate opens the copy with its warning; the Remove foot; the missing-calendar warning; grouped entries named with their summary      | 5.6; PR 10                  |
| Word-list switching and validation          | Use a Pattern, Use Words, and the unreadable-pattern flag                                                                               | 5.9; PRs 12, 19             |
| Family removal underspecified               | One ✕ per family, one undo step, its added key cleared                                                                                  | 5.3; `reset.ts`; PRs 14, 15 |
| Add-row wording changed                     | Names fitted to two lines, then the template "{names}, +{count}", and "Settings: N"; the template is adopted (section 13, row B)        | 5.2; PR 15                  |
| §12 #10, the migration choice outside undo  | The choice is an undo step, decision 14                                                                                                 | 5.4; PR 7                   |
| §12 #18, re-pointing dropped shared options | The entry adopts the target calendar's name and filter setting, with a notice, undoable, decision 18                                    | 5.6; PRs 9, 10              |
| §12 #19, #20, #21, #25 and #14-16           | Reversed with the blocking and non-blocking rows above; gone from section 12                                                            | 12                          |
| Cost comparison                             | Corrected (16-22 KB approved); the revised figure measured per string, reconciled for additions, retirements, aliases and translations  | 8.5, 10, 13                 |

**Engineering review**

| #      | Finding                                              | Resolution                                                                                                                                                                                                                                         | Where                        |
| ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1      | No calendar or button ownership in writes            | Owner-aware frames (`card`, `entry(key)`, `button(key)`), complete projections at event time, identity captured at render, delayed-event tests after a rendered scope change                                                                       | 3.7; `write-frames.ts`; PR 4 |
| 2      | Gate metadata missed prerequisites                   | Compound prerequisites with complete opening edits, validated open and closed in every scope, nested gates and Grid's defaults included                                                                                                            | 4.1, Appendix B; PR 1        |
| 3      | Start Date's held mode invisible to the builder      | A presentation input to the builders; the mounted Tomorrow → Relative test                                                                                                                                                                         | 3.9; PR 19                   |
| 4      | Live and steady `hass` contract                      | Two feeds, both through the action-label shim; freshness and label tests after an unrelated render                                                                                                                                                 | 3.6; PR 3                    |
| 5      | Prerequisites landed after their consumers           | The corpus lands with the index in PR 1; the color control (PR 11) before Split (PR 12)                                                                                                                                                            | 6                            |
| 6      | Per-node memoization cannot stabilize lifted schemas | Builder output cached on its inputs, plus structural interning; the two-genuine-render identity test                                                                                                                                               | 3.3; PRs 3, 5                |
| 7      | Split with an unreadable blocklist                   | As design finding 1                                                                                                                                                                                                                                | 5.7; PR 12                   |
| 8      | Tests that did not establish their claims            | Reachability through rendered navigation (PR 5); form inputs, not outer DOM (PR 6); closed configurations and `GATES` pinned by value (PR 1); unique names with Weather's contextual labels (PR 5); a completeness audit of the nine files (PR 20) | 6, 7                         |
| 9      | Undo focus contradicted itself                       | One rule: programmatic focus onto a field lands on its wrapper, never in an input, Reset included; a difference from candidate A §7 and ia-final §9, adopted (section 13, row A)                                                                   | 3.3, 5.3, 5.4; PR 7          |
| Claims | 28 and 23 test files; narrow widths "measured"       | Corrected to 27 and 22 at `c50573c5`, 28 and 23 at `9a1253b3` with #834's opens-groups test; narrow widths marked unmeasured, checked in PR 5                                                                                                      | 2, 3.4                       |
| Size   | PRs too large                                        | The page-shell PR split into PRs 3, 4 and 5 (render cost and write owners first, behavior-preserving); Undo (PR 7) split from the jump list (PR 8)                                                                                                 | 6                            |

**Re-review of the second revision: design**

| #   | Finding                                                                 | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Blocking: Split reviewed a different event set from the card's          | The card's window (Start Date in every form, its first day of the week, the displayed layout's Days to Show) and the per-entry eligibility before the split; visibility conditions listed as if met, with one line saying both parts keep them. The mirror measured +1,819 B gzip -9 and agreed with the card's pipeline in all 1,008 configurations in four zones; `tests/editor-split-review.test.ts` and `editor-split-review.dst.test.ts` run that pipeline beside it | 5.7; §12 #19, #20; PR 12 |
| 2   | Blocking: search dropped helper-only matches                            | Kept and ranked last, as the D05 manifest specifies                                                                                                                                                                                                                                                                                                                                                                                                                       | 5.8; PR 17               |
| 3   | Reset focus moved to the wrapper, a difference from the approved design | Recorded as a difference with its reason, and adopted (section 13, row A)                                                                                                                                                                                                                                                                                                                                                                                                 | 3.3; section 13, row A   |
| 4   | The preview-tap warning lost its home                                   | The Tapping helper in D17's words, and Taps & Refresh's page note in the prototype's, a PR 1 string                                                                                                                                                                                                                                                                                                                                                                       | 5.9, 5.10; PRs 1, 19     |
| 5   | The grab's live region contradicted the single announcement queue       | The grab, search's count and Split's completion speak through the one queue; their visible lines are plain text                                                                                                                                                                                                                                                                                                                                                           | 5.5, 5.11; PRs 7, 13     |
| §1  | A difference from the approved design could ship without being decided  | Each is decided in section 13 with the approved text, the plan's, the reason and the outcome; the approved text is built otherwise                                                                                                                                                                                                                                                                                                                                        | 1, 13                    |
| —   | Wording and focus differences sat among section 12's decisions          | Moved to section 13 with the approved text, the plan's, the reason and the outcome (rows A-G: A-E and G adopted, F keeping the approved wording); two restored instead: Accent Color Source until PR 11, and the prototype's move announcement                                                                                                                                                                                                                            | 12, 13                   |

**Re-review of the second revision: engineering**

| #    | Finding                                                                       | Resolution                                                                                                                                                                                                         | Where                 |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 1    | Blocking: the universe check took its denominator from its own result         | Openings replayed independently, every built field asserted in its scope's universe, per-scope id sets pinned by value, the planted Grid Countries omission failing; built and passing in PR 1                     | 4.1; PR 1             |
| 2    | Blocking: the harness had no owner identity                                   | Owner selection, the card by default, an entry or button by index until PR 4 and by stable key after; a migration manifest naming every consumer of a built form, schema reads or not, before PR 3's lazy mounting | PR 2                  |
| 3    | Blocking: `shouldUpdate` could swallow an explicit update batched with `hass` | A `requestUpdate` override carries the intent, as the card's `_bareUpdatePending` does; the combined-batch test with an irrelevant `hass` alone as its control                                                     | 3.6; PR 3             |
| 4    | Blocking: closures did not protect reused DOM                                 | Entry and button DOM keyed by owner with `repeat`; the middle-entry test; the old picker's reorder, add and remove paths covered                                                                                   | 3.7; PR 4             |
| 5    | Blocking: the rebasing failed its stale-payload test                          | A field-scoped write set against each form instance's baseline; tests for stale-sibling preservation and an intentional return to the rendered value                                                               | 3.7; PR 4             |
| 1/14 | The Countdown predicate missed `once_per_day`                                 | Predicates tested against every legal value; built in PR 1 (5,274 values)                                                                                                                                          | 4.1, Appendix B; PR 1 |
| 1/14 | One phrase per gate could not explain different unmet conditions              | A phrase per condition, `needsText` given the data, one gate tested explaining itself three ways; built in PR 1                                                                                                    | 4.1; PR 1             |
| 3    | Lazy mounting after Home Assistant measured the panel                         | Mount on `expanded-will-change`, or a capture-phase click, with first-open geometry checked in HA                                                                                                                  | PR 3                  |
| 3    | The read-set oracle counted the wrapper's own copying                         | The recorder armed only during render and form-input reads, with planted-read tests                                                                                                                                | 3.6; PR 3             |
| 6    | Exact lifted-schema equality rejected intended changes                        | Canonical effective control inputs compared, with a planted label change that must fail                                                                                                                            | PR 6                  |
| 9    | §5.6 claimed entry order within a calendar changed nothing                    | Corrected: the first entry's copy wins under Filter Duplicates; moves keep entry order; the winning `_matchedConfig` and appearance tested, with a planted reversal                                                | 5.6; PR 9             |
| 11   | Drafts keyed without their destination                                        | Keyed by owner, field and destination; the Grid-draft-then-List test                                                                                                                                               | 5.9; PR 11            |
| 20   | The completeness audit required every key in nine files                       | An explicit required-translatable set, its exclusions reconciled                                                                                                                                                   | 6; PR 20              |

**Rebaseline.** #834, #835 and the v5.3.0 preparation reached the feature branch through #836, at
`9a1253b3`. Section 2 is measured there; #834's aliases and their checks are reused rather than
replaced (5.8, 8.3), its Essentials Only semantics and group-opening search are carried by PRs 5, 8
and 15, and its strings are baseline, not this plan's cost (8.5, 10).

**Settled since the re-review.** The size is accepted, with the per-PR caps as its guard (section
10). Differences A-E and G are adopted, and F keeps the approved gate-line wording, reworked in
section 5.2 (section 13). A later refinement of wording is decided in the PR that makes it and
recorded in section 12. The phone check is a live-review item and does not block PR 5 (step 0).
