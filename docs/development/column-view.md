# Column view — design and implementation plan

**Status:** Phase 0 is complete and merged as PR #390 on `dev`; the column view itself is
not yet implemented. **Target release:** v4.0.0.

**Scope:** a second view (`view: 'column'`) that renders the existing agenda list rotated —
days side by side as columns rather than stacked — without changing how the list view looks
for anyone who does not opt in.

This is the current implementation specification. Historical arguments and superseded
alternatives are archived in [column-view-rationale.md](./column-view-rationale.md).

---

## A. Decisions ledger

### A1. Approved and settled decisions

| #       | Decision                                                                        | Note                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | View name is **`column`**                                                       | `view: 'list' \| 'column'`.                                                                                                                         |
| 2       | **`navigation_days` is deleted**, folded into `days_to_show`                    | Removed, not renamed.                                                                                                                               |
| 3       | Column-view MVP excludes overlap lanes, time axis, now-line                     | Those belong to time-grid.                                                                                                                          |
| 4       | **Date at the top** of each column                                              | The original 128px comparator is superseded by decision 14's provisional 160px minimum; the date header remains sound and has more room.            |
| 5       | **Header rule is fully configurable** — width, colour                           | Start visible by default.                                                                                                                           |
| 6       | Between-day chrome rotates 90°; within-day chrome stays untouched               | The organising thesis.                                                                                                                              |
| 7       | `date_vertical_alignment` is **ignored** in column view                         | Naming harmonisation with a future `date_horizontal_alignment` is out of scope.                                                                     |
| 8       | Phase 1 is **shared leaf extraction**; list keeps its `<table>`                 | The drift lives in leaves, not containers. See A3-A and Phase 1.                                                                                    |
| 9       | #339 branch is **frozen**, not rebased                                          | lenaxia's four commits are preserved as ancestors for attribution.                                                                                  |
| 10      | Feature milestone is **v4.0.0**                                                 | This is a choice, not a semver requirement.                                                                                                         |
| 11 + 12 | Below a width threshold, the **view falls back to list**                        | Do not clamp the number of columns. See A3-C.                                                                                                       |
| 13      | The list DOM equality gate is retained, tightened, shipped, and mutation-tested | Phase 0 PR #390 delivered `tests/list-dom.test.ts`; Phase 1 must keep it green.                                                                     |
| 14      | `min_day_column_width_px` starts at **160** and must be measured in Phase 4     | 128 is disproven as a shipping default; 160 is a starting point, not a final result. It drives both usable column width and the fallback threshold. |

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a-decisions-ledger)

---

## A3. Maintainer corrections and current rulings

### A3-A. "No impact on list view" = no _visible_ change, not no code change

**Verified against:** `origin/dev` @ `29b8226`, except the three grid opacity values, which are
**[frozen]** — `styles.ts` on `dev` is 703 lines and has no grid section at all.

> _"what we do in code is our thing, and we are free to do what's needed. our final
> architecture should be optimized to cover both views."_

This removes the constraint decision 8 was built on. The consequences are large enough that
the phasing was reconsidered from scratch rather than patched.

**What I found when I actually checked the markup, rather than assuming:**

The seam is already much further along than v2 assumed.

- `.content-container` (`render.ts:86` **[v6 — was `:83`]**) holds day-blocks and separators as **siblings**. The
  card-level axis flip is a _container_ change, not a restructure.
- Each day is **already one self-contained node** — `<table class="day-table">`
  (`render.ts:678-692`). The day boundary is already in the right place for a shared
  component.

So the only genuinely axis-bound part is the day's **internals**: `rowspan`
(`render.ts:930`) welds the date cell to the left edge and cannot produce a date-on-top
variant.

**Where #339's duplication actually came from.** [v4 — corrected] v3 said the rowspan table
_forced_ the duplication. That is wrong, and the distinction changes the phasing. The drift
#339 exhibits is entirely in **leaves**, not containers — three different past-event opacities
for one concept (`styles.ts:487-488` list `0.6`; `:986-987` grid `0.55` **[frozen]**;
`:1061-1062` grid all-day `0.55` **[frozen]**). The grid re-implemented the _leaf_ renderers.
It did not have to: every leaf the shared block needs is already DOM-agnostic —
`.event-content` (`render.ts:942-1003`), `renderDateColumn` (`:490-611`), colour precedence
(`:497-516`). A flex grid container could have consumed those leaves unchanged. The rowspan
blocked reuse of the **container**, and container reuse is not what prevents drift. **Sharing
the leaves is.**

**Therefore: list keeps its table.** [v4 — REVERSES v3's headline change]

v3 proposed converting list's day block from `<table>` to flex so a single flip-able
`DayBlock` served both views. That was an over-correction, and I am reversing it:

- The two goals v3 fused are separable. _Kill the drift_ → extract shared **leaf** renderers.
  _Serve both views_ → give column its **own** flex container consuming those leaves.
- List needs date-on-**left**. Only column needs date-on-**top**. So only column needs the
  non-table container; list never has to change.
- Parallel containers over shared leaves is **exactly the `ViewAdapter.render` shape** the
  adapter work wants. **[v5]** That work was phase 3 and is now **folded into phase 4** — see
  section C. By Phase 5 there are three renderers anyway (table list / flex column / grid).
  Forcing two of them to share one flip-able DOM is _less_ consistent with the adapter, not
  more.
- The risk asymmetry is the decisive part. Rewriting list's container puts **100% of existing
  users** at pixel-regression risk to serve a view they do not use, gated only by human
  screenshot comparison. Leaf extraction leaves the list container untouched, which satisfies
  the no-visible-change constraint **by construction rather than by probability** — and
  restores a hard automated gate (list DOM must be byte-identical; see Phase 0).
- The relaxed constraint (A3-A) _permits_ code change; it is not a mandate to change the list
  renderer, and should not be spent where it buys nothing.

**The concrete proof that unification was riskier than v3 priced it.** v3 claimed
`date_vertical_alignment`'s `vertical-align` maps to `align-self`, "equivalent". **It does
not,** and the failure is invisible to a template diff:

- `.date-column` is `position: relative` (`styles.ts:317`, reinforced by an inline
  `style="position: relative;"` on the `<td>` itself at `render.ts:931`);
  `.today-indicator-container` is `position: absolute; height: 100%` (`styles.ts:332-340`).
  Under `rowspan` (`render.ts:926-937`) that `100%` resolves against the **full stacked height
  of the day**, so with the default `today_indicator_position: '15% 50%'` the indicator centres
  over the whole day block.
- In flex, `align-self: center` overrides `align-items: stretch` and **shrinks the item to
  content height** — collapsing `height: 100%` to roughly one line of date text. The indicator
  would snap from the full day to the ~50px date band.
- The correct mapping is two-part: keep the date column `align-self: stretch` and move its
  _content_ with `justify-content` on an inner flex column. v3's one-line mapping was wrong.

Blast radius is bounded (`today_indicator` defaults `false`, `config.ts:61`), so this would
have hit only opted-in users on multi-event days — which is precisely the kind of defect that
survives a screenshot pass. It is retained here as the worked example of why the list
container is not worth touching. **[v5] This analysis is load-bearing and must survive any
future restructuring of this document intact:** it is the only worked proof in the plan that a
human screenshot pass does not catch this class of bug, and the `false` default is exactly why
it would go unnoticed.

**Target structure — one flip, not two:**

```
.content-container   flex-direction: column (list)  |  row (column view)
list day block       unchanged <table> + rowspan     (date on left)
column day block     new flex container              (date on top)
both                 consume the SAME leaf renderers
```

Carry-overs that still apply, to the **column** container only:

- `.date-column` fixed width → `flex: 0 0 <width>`.
- Events pane → `flex: 1` **plus `min-width: 0`**. Without it long titles won't let the pane
  shrink; `table-layout: fixed` (`styles.ts:287-296`, property at `:290`) handles this
  implicitly today. Still the classic flex trap, now confined to new code.
- The week-number separator (`<table class="week-row-table">`, `render.ts:246-312`; the
  `<table>` itself is emitted at `:289`) stays as-is for list; column defers week numbers
  entirely (D5).

### A3-B. `show_empty_days` resolves through an explicit auto sentinel

**Verified against:** `origin/dev` @ `29b8226`.

`days_to_show` bounds a **calendar-day window** (`events.ts:1287-1293`; hard post-filter
`:71-92`). `show_empty_days: false` filters empty days out of the rendered set (`:393-398`);
`show_empty_days: true` generates placeholder days (`:505-545`, `:561-598`, placeholder
`_isEmptyDay: true` at `:586`). Rendering already expects gaps (`render.ts:725-727`).

Column view must support both products:

| Stored value             | Meaning                  | List view       | Column view     |
| ------------------------ | ------------------------ | --------------- | --------------- |
| `null` **(new default)** | **Automatic — per view** | hide empty days | show empty days |
| `true`                   | Always show              | show            | show            |
| `false`                  | Never show               | hide            | hide            |

Column therefore defaults to contiguous columns, but not through a bare per-view default. The
key is flat config, and the responsive fallback means the same card is column above the
threshold and list below it. Once a user sets a flat boolean, it applies to both views; with a
switch there is no way back to unset/auto except editing YAML.

Implementation requirements:

- Widen `show_empty_days` from `boolean` to `boolean | null` (`types.ts:22`).
- Add a resolver used by render and editor paths: `null` resolves by **effective view**, not
  merely requested `this._config.view`.
- Replace `addBooleanField('show_empty_days')` (`editor.ts:896`) with a 3-option select,
  following the existing `show_week_numbers` pattern: default `null` (`config.ts:48`),
  `'null'` string option (`editor.ts:1109-1113`), round-tripped at `editor.ts:588-591` and
  `:660`.
- The `empty_day_text` gate at `editor.ts:899-900` must ask the resolved question. With
  `hide_when_empty: true` and `show_empty_days` unset, the field is visible in column view and
  hidden in list view.
- Labels: `Automatic`, `Always show`, `Never show`, with per-view help text under
  `Automatic`. Add the three editor translation keys to every language file that has an
  `editor` section, or to none. A partial `editor` section defeats `hasEditorTranslations()`
  and renders missing labels as raw key names.

`hide_when_empty` counts events as if expanded (`calendar-card-pro.ts:236-239`), so
`compact_events_to_show: 0` cannot hide a card that can never be tapped open. A placeholder is
not content (`:243-251`), and empty **columns** must not count as content either.

If a user chooses `Never show`, the column count varies as events change. Fix width jitter in
CSS with a `max-width` guard, not by changing key semantics. A skipped-day marker is optional
polish for `Never show`, not required for the MVP default.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-b-show_empty_days--my-force-it-on-was-wrong)

### A3-C. Narrow screens fall back to list view

**Verified against:** `origin/dev` @ `29b8226`. The modal-width figures still need live HA
verification.

Users can set a screen width above which column view is active; underneath, render list view.
This supersedes column-count clamping. List view is already designed for narrow screens, while
cramped columns are not useful. The fallback threshold is computed from:

```
min_day_column_width_px × days_to_show  +  card padding  +  (days_to_show − 1) × gutter
```

User-facing rule: **above the threshold you get the columns you asked for; below it you get
list.** Do not silently drop days.

Design against these risks:

1. **Oscillation.** Switching view changes card height, which can change dashboard width and
   switch the view back. Use hysteresis: separate up/down thresholds.
2. **HA masonry/sections quantise widths.** Test at real Home Assistant layout widths.
3. **Both renderers live in one bundle.** No lazy loading under the one-file Rollup constraint.
4. **Editor preview must render the selected view, not the measured fallback.** The card-edit
   modal is narrower than realistic column thresholds, so an unmitigated fallback would show
   list while users configure column-only options. Decouple preview rendering from the
   responsive switch and verify the modal width in Phase 4.
5. **Keys are viewport-live.** Below the threshold, column-only keys are inert and list-only
   behaviour is live. Accept this cost, document it, and use D5 kind-4 help text to name which
   view each key affects.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-c-narrow-screens--view-fallback-not-column-clamping)

### A3-D. Compact mode rotates the global height budget

**Verified against:** `origin/dev` @ `29b8226`. The `events.ts` budget ranges `:409-475`,
`:413-441`, and `:350-391` re-verify exact.

The user-level meaning of `compact_events_to_show` is _how tall the card is when collapsed_.
That meaning rotates through different height functions:

- **List:** height ≈ **Σ** events, so a global budget caps height.
- **Column:** height ≈ **max** over columns, so a per-column budget caps height.

Column view therefore implements compact mode as a per-column budget, reusing the global
`compact_events_to_show` key as D5 kind 4. This is new adapter code, not reuse of the current
`totalEventsShown` loop (`events.ts:409-475`). Tap/hold expansion already exists
(`calendar-card-pro.ts:660`, `:663`, `:704`, `toggleExpanded()` at `:862-866`).

Limits and related keys:

- `compact_events_complete_days` is inapplicable per-column. It is a cross-day inclusion
  filter under a shared budget (`events.ts:413-441`); a per-column budget has no shared pool
  and renders every column. Ignore and annotate.
- `compact_days_to_show` maps to fewer columns when collapsed.
- Per-entity `compact_events_to_show` must stay global in both views (`events.ts:350-391`). It
  is a temporal cap — e.g. next one birthday — not a height cap; rebasing it per column would
  multiply the cap by `days_to_show`.
- The same flat `compact_events_to_show: 3` means 3 events total in list and up to 3 per column
  in column. Keep the key, but the editor must provide per-view help text.
- `max_events_per_column` is deferred, not dismissed. Rotated compact covers the collapsed,
  expandable height job; it does not cover permanent kiosk-style truncation.
- If any cap ships, a per-column `+N more` indicator is mandatory. Lift the grid pill style,
  compute `hidden = eᵢ − cap` locally, and do not reuse the list path's silent slice.
- `max_height` inherits unchanged: `.content-container` sets `max-height` at `styles.ts:145`
  and `overflow-y: auto` at `:148` inside `:144-148`, so it scrolls rather than clips.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-d-compact-mode-in-column-view--the-rotation-is-correct)

### A3-E. Separator defaults and spacing multipliers

**Verified against:** `origin/dev` @ `29b8226`. The `SEPARATOR_SPACING` finding, including the
comment/value mismatch, re-verifies exact.

Separator widths already default to `0px` today (`config.ts:53` day, `:55` week, `:57` month).
Rotating the rules is a default-config visual no-op.

The extra horizontal space at week/month breaks is not a width default; it is the spacing
multiplier (`SEPARATOR_SPACING`: week `1×`, month `1.5×`, `constants.ts:87-92`). In list view
it becomes margin above/below the rule. A uniform CSS `column-gap` cannot vary one gutter.

Resolution:

1. List keeps its derived multipliers unchanged.
2. Column-view MVP drops the multipliers and documents the loss.
3. A later explicit opt-in gutter key, defaulting `0px`, can reproduce them with spacer tracks.

`constants.ts:90` says "2x day_spacing"; the value at `:91` is `1.5`. Fix that incidental
comment when nearby.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a3-e-separator-defaults--two-different-mechanisms)

---

## B. Header divider

**Verified against:** `origin/dev` @ `29b8226`.

### B1. Naming

Use `day_header_separator_width` and `day_header_separator_color`. The house pattern is
`{{scope}}_separator_{{width,color}}`; all existing separators hardcode `solid`, so there is no
style key.

Do not use an appearance name such as `horizontal_*`. The codebase already corrected that
pattern via `DEPRECATED_CONFIG_MAP` (`editor.ts:67-72`, consumed at `:381` and `:453`):
`horizontal_line_width` became `day_separator_width`. Appearance names break when layouts
rotate.

Do not reuse `day_separator_*`: that key means between days and rotates to the vertical rule
between columns. The header rule is inside a day, between its header and events.

### B2. Defaults

```
day_header_separator_width: '1px'
day_header_separator_color: 'var(--divider-color)'
```

The width is visible by default because this element exists only inside column view and is
structural: it marks where the header ends and the event list begins. That cannot affect list
view and does not violate A3-A.

`var(--divider-color)` is a conscious new token-family choice. It is Home Assistant's semantic
divider token, theme-aware, and less text-like than `var(--secondary-text-color)`. Do not
"fix" it back to the existing separator family as an inconsistency. A `_style` key can be
added later without breaking config.

### B3. Editor

Follow the existing separator block pattern (`editor.ts:1155-1197` for `day_separator`; week
at `:1199-1241`; month at `:1243+`): a toggle writing `1px`/`0px`, revealing width and colour
when enabled. The header separator toggle starts **on**.

Add editor translation keys to every language file with an `editor` section:
`day_header_separator`, `show_day_header_separator`, `day_header_separator_width`,
`day_header_separator_color`. Add all four keys to all editor-translated files, or to none.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#b-the-header-divider--concrete-spec)

---

## C. Phases

**Verified against:** `origin/dev` @ `29b8226`, except frozen-branch citations explicitly
marked inline.

Phases 0–2b are refactors or fixes that ship in ordinary 3.x releases. Only phases 4–5 need a
long-lived v4 branch. There is no separate Phase 3: the `ViewAdapter` is built inside Phase 4
against both list and column implementations.

### Phase 0 — safety net — complete in PR #390

Phase 0 is complete and merged as PR #390 on `dev`. Its detailed build staging is now history.
It delivered:

- `scripts/check-i18n.mjs`, `npm run check:i18n`, and a CI step.
- A Vitest + happy-dom test suite under `tests/`, now **73 tests**, wired into CI via
  `npm test`.
- `tests/list-dom.test.ts`, the list-view DOM equality gate that Phase 1 must keep green.

The gate covers `renderGroupedEvents` and everything below it. It does not cover
`renderMainCardStructure` or `renderCardContent`, because it deliberately does not construct
the custom element. All four Phase 1 extraction targets are inside the covered subtree.

The key finding that governs Phase 1: **an option that defaults to `false` renders nothing, so
a test suite built from default config never reaches it.** Four branches were initially missed
for that reason, including two of Phase 1's four extraction targets: weather and
`parseIndicatorPosition`. Enumerate default-off render options from source and pin each one;
mutation testing proves assertions are load-bearing, not that every branch is reached.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-0--safety-net--ships-3x--risk-none-v3--new)

### Phase 1 — shared leaf renderers — ships 3.x — risk: low

List keeps its `<table>` and `rowspan`. Phase 1 extracts axis-agnostic leaf renderers into
shared functions that the list's existing table consumes unchanged, and that column and
time-grid consume from their own containers.

Extract in this order:

1. Weather rendering (`render.ts:526-575`). There is no `renderWeather` function on `dev`;
   weather is inline inside `renderDateColumn` (`render.ts:490-611`). Extract weather first as
   its own leaf.
2. Date content and colour precedence (`renderDateColumn` `:490-611`, precedence `:497-516`).
   The date-content renderer takes weather as an already-rendered `TemplateResult` or
   `nothing`, rather than raw forecast data.
3. `.event-content` subtree (`render.ts:942-1003`) — title, time, location.
4. Today-indicator geometry (`parseIndicatorPosition` `:358-382`).

The Stage 2 gate pins both weather render sites: the date-column block and
`renderEventWeather` (`render.ts:1050+`), which reads the hourly forecast. Do not let the event
weather path fall through the extraction just because the date-column path is named first.

The contract is strict: list-view DOM must be byte-identical before and after. Extraction that
changes list output is a bug. Watch two traps:

- `renderEvent` interpolates locals computed before the extraction boundary; pass them rather
  than recomputing.
- Accent, background, padding, and position classes live on the wrapper `<td class="event">`
  (`render.ts:938-941`, `styles.ts:458-483`, position classes at `render.ts:916-922`). Future
  column wrappers reproduce those; leaves do not absorb them.

Deferred out of Phase 1: removing the layout table, RTL, and the duplicate
`.today-indicator-container` rule (`styles.ts:332-340` / `:364-370`).

Soak fixtures reused by later phases: longest-title wrapping, `date_vertical_alignment` at
all three values, `today_indicator: true` on a multi-event today, RTL, week numbers on,
`max_height` scrolling, narrow HA sections column.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-1--shared-leaf-renderers--ships-3x--risk-low-v4--re-scoped)

### Phase 2 — presentation models — ships 3.x — risk: low

`EventPresentation` and `DayHeaderModel` are only built if a named consumer needs them. If the
Phase 1 shared leaves and the Phase 4 column renderer can consume raw `EventsByDay` types
happily, do not build presentation models speculatively; fold them into Phase 4 if the adapter
creates the need.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-2--presentation-models--ships-3x--risk-low-v4--cache-fix-split-out)

### Phase 2b — cache-key fix — ships 3.x independently — risk: low

This is a live list-view bug and should not wait for the column epic. `processEvents` splits
multi-day events pre-cache (`events.ts:707`, definition at `:772`) and bakes `_entityLabel`
(`:671`; also assigned at `:268-270`), then caches the already-split array. `getBaseCacheKey`
(`:1389-1441`) omits `split_multiday_events` and entity-label config, so a warm-cache config
toggle returns stale data.

The scope is broader than split + label. The cached event carries `_matchedConfig`
(`events.ts:670`), and five consumers prefer it over live config: `getEntitySetting` (`:1066`),
`getEntityLabel` (`:1034`), `getEntityColor` (`:954`),
`getEntityAccentColorWithOpacity` (`:991`), and the split override (`:748-751`).

Maintainer decision required before Phase 2b starts:

- Cache raw API events and re-run config-dependent processing on every read; or
- keep caching processed events and key the complete, order-sensitive, normalised per-entity
  config.

The first removes `_matchedConfig` staleness by construction; the second is the smaller diff.
They produce different cache keys and tests.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-2b--cache-key-fix--ships-3x-now-independently--risk-low-v4--split-out)

### Adapter shape inside Phase 4

Frozen-branch provenance is load-bearing here: the time-grid files and citations describe
`alexpfau-review-339-time-grid`, not `dev`. On `dev` there is no `time-grid` view.

The adapter replaces scattered view string checks with a declarative capability descriptor and
only the facets column actually needs. The known full shape is:

```
capabilities
normalizeConfig
fetchInputsChanged(prev, cur)
buildFetchPlan
controllers()
render
afterRender(host)
getCardSize
```

The four-method v1 shape (`capabilities` / `buildFetchPlan` / `render` / `getCardSize`) only
absorbed render dispatch, fetch plan override, and card size on the frozen branch. It did not
cover config validation, refetch change detection, controller lifecycle, post-update hooks,
interaction model, or card-shell flags.

### Conformance gate — scratch branch before Phase 5

After Phase 4's adapter and column renderer are functionally complete but before `view` is
released, manually port #339's time-grid onto a scratch branch off the Phase 4 branch. Inputs:
the Phase 4 branch plus `alexpfau-review-339-time-grid` as read-only source. Output: findings
and, if it passes, adapter corrections merged back into Phase 4. The scratch branch is then
abandoned.

The gate must prove:

- All four D5 override kinds are expressible without lying to the editor.
- Time-grid fetch windows derive through `buildFetchPlan`, without new `view === 'time-grid'`
  strings outside the adapter module.
- Both compaction stages are hookable: per-entity (`events.ts:350-391`) then global
  (`:409-475`).
- Controllers can be constructed through `controllers()` with observer lifetimes intact.

It does not need to run correctly end to end; it must compile and wire without reaching around
the abstraction. If it fails, fix the abstraction inside Phase 4 and rerun. Phases 0–2b remain
safe because they have no public `view` API. The frozen branch is read and never moved; this
is a manual port, not a rebase.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#conformance-gate-scratch-branch-not-shipped-v5--priced-sequenced-and-given-a)

### Phase 4 — column view plus `ViewAdapter` — v4 branch — risk: medium

`view: 'list' | 'column'` becomes public API. Phase 4 builds the column renderer and the
`ViewAdapter` abstraction together, designed against list and column at the same time. Section D
is the implementation spec.

### Phase 5 — time-grid — v4 branch — risk: medium

Rebuild on lenaxia's four commits as ancestors so `git log` retains authorship, plus
`Co-authored-by` trailers and release-note credit. Deferred retro findings are the checklist:
blank slot-interval dropdown; all-day off-by-one in the detail overlay; frozen clock when the
now-line is disabled; dead swipe in 7-day mode; unguarded `navigator.clipboard`;
`hide_when_empty` window mismatch; now-line re-rendering the whole card every 60s; the 35-day
default fetch; about eight shipped config options silently ignored; six runtime i18n keys
present only in `en.json`; and `time_grid_interval_minutes` being a zoom control.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#c-phases-v5--phase-3-folded-into-phase-4)

---

## D. Column view specification

> **Verified against `origin/dev` @ `29b8226`.** All `src/` citations in D1, D2, D3 and D5 are
> `dev` citations. D4 uses frozen-branch citations where marked.

### D1. Element mapping

| Element                   | List today                  | Column                                       | Keys                                 |
| ------------------------- | --------------------------- | -------------------------------------------- | ------------------------------------ |
| Per-event accent          | vertical, left of event     | **unchanged**                                | `vertical_line_width`                |
| Day separator             | horizontal between days     | **vertical between columns, re-implemented** | `day_separator_*`                    |
| Week separator            | horizontal at boundary      | **vertical, re-implemented**                 | `week_separator_*`                   |
| Month separator           | horizontal at boundary      | **vertical, re-implemented**                 | `month_separator_*`                  |
| Header rule               | does not exist              | **horizontal, under header**                 | `day_header_separator_*`             |
| Week number badge         | own full-width row          | **deferred**                                 | `show_week_numbers`, `week_number_*` |
| Day spacing               | vertical gap                | **column gutter**                            | `day_spacing`                        |
| Event spacing             | vertical gap                | **unchanged**                                | `event_spacing`                      |
| Today indicator           | absolute in date cell       | **absolute in header band**                  | `today_indicator*`                   |
| Weekday / day / month     | vertical stack, left        | **horizontal, in header**                    | `weekday_*`, `day_*`, `month_*`      |
| Weather                   | in date column              | **header, single-line-or-hide**              | existing weather keys                |
| Event content             | `.event-content`            | **byte-identical**                           | all                                  |
| `date_vertical_alignment` | positions date in tall cell | **ignored**                                  | —                                    |

Separators are not axis-swappable. Existing list paths are a day separator `<div>` with
`borderTop*` (`render.ts:676`, `styles.ts:262-265`), a week separator border-top renderer when
`show_week_numbers === null` (`render.ts:222-245`), or a full
`<table class="week-row-table">` when `show_week_numbers !== null` (`render.ts:246-312`, table
at `:289`; `styles.ts:195-261`). Column re-implements these as vertical rules.

Spacing multipliers are dropped in column MVP. `createSeparatorStyle` (`render.ts:131-179`)
derives margins from `day_spacing × multiplier`; `SEPARATOR_SPACING` is week `1×`, month
`1.5×` (`constants.ts:87-92`). CSS `column-gap` is uniform, so it cannot widen only one
gutter. Default widths are all `0px` (`config.ts:53`, `:55`, `:57`), so this is a default-config
no-op and only affects users who opted into those separators.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d1-element-mapping-changed--separators-are-a-re-implementation-not-a-rotation)

### D2. Header

Build a horizontal variant of `renderDateColumn` (`render.ts:490-611`). Preserve DOM classes,
custom properties, and colour precedence: base → weekend → today (`render.ts:497-516`).

Today highlighting needs no new keys: `today_weekday_color`, `today_day_color`, and
`today_month_color` already exist with top precedence. `parseIndicatorPosition`
(`render.ts:358-382`) emits absolute positioning plus percentages and
`translate(-50%,-50%)` inside a relative container, so it transfers mechanically to the header
band. Document that positions such as `15% 50%` resolve visually differently in a short wide
band.

Weather is single-line-or-hide. At the provisional 160px minimum, "Mon 13 Nov" at the existing
font sizes consumes most of the column; weather (`render.ts:526-575`) adds icon + temperature.
If it wraps, every column pays a second header line. Choose truncate-or-drop in Phase 4 and
document the fixed header vertical budget.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d2-header)

### D3. Height and overflow

Use equal heights via CSS grid `align-items: stretch`, unless G11 rules the outer layout to
flex and rewrites this rule with an equivalent concrete mechanism.

Uncapped column view is safe by default: column height is bounded by the busiest day, while
list height is the sum over days. For constant event height, `max(eᵢ) ≤ Σ(eᵢ)`. This differs
from time-grid's configured time axis, which creates whitespace whether events fill it or not.

The regime where column can be taller is narrow-column line wrapping under skewed event
distribution: event height is not constant across layouts. This argues for the Phase 4
measurement spike and the 160px provisional minimum, not against column layout.

Compact requirements are the A3-D requirements: per-column global compact budget,
`compact_events_complete_days` ignored, per-entity compact cap global, `max_events_per_column`
deferred, `+N more` mandatory if any cap ships, and `max_height` inherited unchanged. G12 notes
that MVP compact scope is still inconsistent across this document; rule it in or out before
Phase 4 implementation and update A3-D, D3, D5, E1 and G2 together.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d3-height-and-overflow-changed--substantially-rewritten)

### D4. Editor gate audit

Every citation in this subsection marked `[frozen]` describes `alexpfau-review-339-time-grid`,
not `origin/dev`. On `dev` there is no `view === 'time-grid'` gate, no view select, and no
`view` key.

When time-grid returns in Phase 5, binary `!== 'time-grid'` gates must not silently include
column. Phase 4 must avoid introducing any binary gate that Phase 5 has to unwind.

Frozen-branch gates and their three-view outcomes:

- `editor.ts:774-777` `[frozen]`: the `view` select needs a `view_column` translation key.
- `:778` `[frozen]`: `days_to_show` is benign for column by luck; make it explicit.
- `:826` `[frozen]`: Compact Mode shows for column and that is correct. Make it explicit and
  hide `compact_events_complete_days` for column.
- `editor.ts:896` on `dev`: `show_empty_days` becomes the A3-B-3 3-option select in both
  views, not a switch. Correct `editor.ts:899-900` at the same time.
- `:908` `[frozen]`: correctly grid-only, unchanged.

Convert binary view exclusions to explicit per-view logic when those gates are written.
Round-trip the visual editor for a column config to confirm no forced-override key silently
drops user input.

The editor live preview must render the selected view rather than the width-measured one; this
is the A3-C.4 mitigation.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d4-editor-gate-audit-new-v5--entirely-frozen-branch-retitled-and-re-tensed)

### D5. Forced config, override taxonomy, and week numbers

The adapter must express four per-view behaviour kinds without leaving inert editor toggles:

| Kind                                                          | Example                                                   | Editor treatment                    |
| ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- |
| 1. **Per-view default**, user-overridable, with auto sentinel | `show_empty_days` (`null` = auto)                         | Select with reachable `Automatic`   |
| 2. **Hard force**, structurally required                      | `split_multiday_events: true` — a column is a day         | Disabled + annotated                |
| 3. **Ignored**, meaningless in this view                      | `compact_events_complete_days`, `date_vertical_alignment` | Hidden                              |
| 4. **Reinterpreted**, same control with rotated meaning       | global `compact_events_to_show`                           | Normal control + per-view help text |

Kind 1 requires an explicit auto/unset value selectable in the editor. For booleans that means
`boolean | null` and a 3-option select. Reuse the `show_week_numbers` path (`config.ts:48`,
`editor.ts:1109-1113`, `:588-591`, `:660`). If a key cannot take a sentinel, it is not kind 1.

Kind 4 exists for `compact_events_to_show`: editable, same default, but different per-view
meaning. Per-entity `compact_events_to_show` does **not** rotate.

Week numbers are deferred in the column MVP. `show_week_numbers` is tri-state
(`editor.ts:1109-1113`) and its non-null path renders the full-width `week-row-table`. In a
partial-week column layout, placement is genuinely incoherent: a 7-day window can span two ISO
weeks and need zero, one, or two badges on non-adjacent columns. Ignore and document for MVP;
revisit with real usage. Default `null` means only opted-in users are affected.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d5-forced-config-and-week-numbers-new)

---

## E. Cross-cutting acceptance criteria

> **Verified against `origin/dev` @ `29b8226`.** The `AGENTS.md` reference re-verifies at
> `AGENTS.md:119-163`.

1. **No silent config no-ops.** Every existing option either works in column view or is
   documented as not applicable. Current documented-N/A list: `date_vertical_alignment`,
   `compact_events_to_show` plus `compact_days_to_show` and `compact_events_complete_days`,
   week numbers, and week/month separator spacing multipliers. G12 records the compact-scope
   contradiction; resolve it before Phase 4 implementation.
2. **Every new user-visible string exists in all language files at ship time.** A partial
   `editor` section defeats the whole-language English fallback and renders raw key names.

HA soak list — list view must be pixel-identical after phases 1–2b and rechecked after Phase 4:
default config; compact mode (all three keys); `max_height` scrolling; multi-day spans under
both `split_multiday_events` settings; all-day events; day weather and per-event weather; entity
labels; per-entity `show_time`/`show_end_time`/text colour; `show_empty_days: true`; week and
month boundary in one window; `today_indicator` with a non-default position; non-default
`vertical_line_width`; RTL; countdown and progress-bar states.

Phase 2 adds warm-cache cases: with a populated cache, flip `split_multiday_events`, change an
entity label, and change an allow/block pattern. Confirm the view updates.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#e-cross-cutting-acceptance-criteria)

---

## F. Constraints that bind implementation

> **Verified against `origin/dev` @ `29b8226`.**

1. **Build sentinel.** `rollup.config.mjs:10` tests `NODE_ENV === 'prod'`, not `'production'`.
   `NODE_ENV=production npx rollup -c` silently produces a dev build while reporting success.
2. **Current gates.** Use `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n`,
   `npm test`, both Rollup forms, and manual HA soak where appropriate. DOM goldens are now a
   hard pass/fail gate running in CI through `npm test`. `AGENTS.md` is stale about the script
   count and test framework; amend it separately rather than silently violating it.
3. **Config migration is editor-only.** `DEPRECATED_CONFIG_MAP` (`editor.ts:67-72`) is consumed
   solely at `editor.ts:381` and `:453`. A YAML-only user's deprecated key is silently ignored,
   never migrated. Renaming any shipped key is a real YAML break.
4. **Attribution.** lenaxia's four commits stay as ancestors. Never squash him out.
5. **Communication.** A public epic issue tracks this work and links the column-view requests
   (#14, #263, #253). #339 gets an informational note that column view lands first and that its
   time-grid work is retained for Phase 5.
6. **Branch provenance.** Every `src/` citation is branch-specific. `dev` is the default source
   unless a citation is explicitly marked `[frozen]`. Frozen-branch sections describe
   `alexpfau-review-339-time-grid` and must not be mistaken for code present on `dev`.
7. **`hide_when_empty` in column view.** Specify its interaction with column rendering.
   `visibleEventCount` windows by `days_to_show`, so the count and rendered column set must not
   disagree. With `hide_when_empty: true` and `show_empty_days: null`, resolved empty-day
   semantics must be used consistently.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#f-constraints-that-bind-implementation)

---

## G. Open questions

> **Verified against `origin/dev` @ `29b8226`.** No `src/` citations in this section. **[v5]**
> Items 6 and 8 remain genuinely open and cannot be closed on paper; item 9 remains true.

> **[v6] Blockers raised by an independent review pass, recorded not decided.** Each needs a
> maintainer ruling; none can be resolved by reading the source. Items G10–G13 are **hard
> prerequisites for Phase 4 implementation** — an engineer cannot start Phase 4 without them.
> They are listed here rather than inline so they cannot be mistaken for settled design.
>
> - **G10. `requestedView` vs `effectiveView` is undefined.** The width fallback is specified
>   as render dispatch, but it changes **data** semantics upstream: `show_empty_days: null`
>   resolves per-view, global compaction switches from a shared budget to per-column, and
>   column forces `split_multiday_events: true`. The proposed helper takes `this._config`,
>   which below the breakpoint still says `column` while the card is rendering `list` — so it
>   resolves for the wrong view. Splitting also happens _before_ caching, so an effective-view
>   transition may require reprocessing rather than a re-render. Needs: both terms named
>   explicitly, every resolver and adapter hook taking `effectiveView`, and a stated rule for
>   what a transition invalidates (regroup / reprocess / refetch).
> - **G11. Phase 4's outer layout is specified two incompatible ways.** `.content-container`
>   is a row-direction **flex** container and width is described with `flex: 1`, but D1 needs
>   CSS-grid `column-gap` and spacer tracks and D3 gets equal heights from grid
>   `align-items: stretch`. Flex and grid differ materially in max-width behaviour, spacer
>   tracks, variable column counts and equal-height mechanics. One must be chosen, with the
>   concrete track/flex rule written out.
> - **G12. Compact-mode MVP scope contradicts itself three times.** A3-D maps
>   `compact_days_to_show` to fewer columns and makes the cap per-column; D3 says column
>   "implements" per-column compaction and then calls it Post-MVP; E1 lists both keys as not
>   applicable. Rule it in or out and update A3-D, D3, D5, E1 and G2 **together**.
> - **G13. Phase 4 needs a measurement spike before implementation.** Minimum column width,
>   hysteresis band, weather truncate-or-drop, header vertical budget, whether
>   `min_day_column_width_px` is public config, and — most consequentially — **which column
>   count drives the threshold**. With `show_empty_days: false` the formula still uses
>   `days_to_show`, so a 7-day config with events on 2 days demands a 7-column-wide container
>   before it will show 2 columns, which defeats dense mode outright.
>
> Two further findings are recorded in place rather than here because they affect work that
> ships **before** v4.0.0: the Phase 2b cache scope (see the note in Phase 2b) and the Phase 1
> DOM-gate test design (see Phase 0 Stage 1).

1. ~~Decisions 11, 12, 13, 14~~ **SETTLED in v3** — see A2 and A3.
2. ~~Does `compact_events_to_show` render "+N more"?~~ **SETTLED: it does not.** The key _is_
   reusable per-column though — see A3-D and D3.
3. **Separator spacing multipliers in column view** — drop and document. **SETTLED in A3-E**;
   an explicit opt-in gutter key defaulting `0px` is additive later.
4. **Does column view ship in v4.0.0 alone, with time-grid in v4.1?** Recommendation: yes.
   Column view is the more frequently requested of the two and depends on none of the
   time-axis work; shipping them together would gate it on work it does not need.
5. **v4.0.0 is a milestone choice, not a semver necessity.** Nothing in phases 0–4 is breaking
   — `view` is additive and defaults to `list`. Worth naming as a deliberate choice.
   _Opportunity:_ if a major is happening anyway, it is the natural moment to batch other
   deferred breaking changes (e.g. retiring the editor-only deprecation map). Flagged, not
   scoped.
6. **[v3] Still genuinely open:** the hysteresis band for the view-switch threshold (A3-C).
   Needs a real HA dashboard to tune; cannot be decided on paper.
7. **[v4] RULED:** `show_empty_days` defaults to showing empty days in column view — but via an
   **auto sentinel**, not a bare per-view default. `null` (Automatic) / `true` / `false`,
   rendered as a select. See **A3-B-3**. Back-compat verified free; no gap affordance owed.
   **[v5] The "back-compat verified free" half of this is now known to be wrong** — there is a
   fourth consumer and a shippable defect. The _ruling_ stands; the cost estimate does not. See
   A3-B-3.
8. **[v4] To verify in HA, not on paper:** the actual card-edit modal width, which determines
   how severe A3-C.4 is (the mitigation is mandatory regardless). **[v5]** Now also determines
   whether the provisional `min_day_column_width_px: 160` (decision 14) survives measurement.
9. **No runtime or visual HA testing has happened on any of this yet.**
10. **[v5] Un-decided and un-decidable on paper: the real rendered width of an HA masonry or
    sections column.** Every threshold in A3-C and decision 14 is arithmetic over an assumed
    container width. The arithmetic is sound; the input is a guess. First measurement task in
    Phase 4.

---

## H. Explicitly out of scope

Overlap lanes, time axis, now-line (time-grid's, Phase 5); paging and date-range navigation
(#185); per-person lanes (#203); `date_horizontal_alignment` and its naming harmonisation;
line-style keys for any separator; interactive expand on the `+N more` pill.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#h-explicitly-out-of-scope)
