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

| #       | Decision                                                                               | Note                                                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | View name is **`column`**                                                              | `view: 'list' \| 'column'`.                                                                                                                                                                                            |
| 2       | **`navigation_days` is deleted**, folded into `days_to_show`                           | Removed, not renamed.                                                                                                                                                                                                  |
| 3       | Column-view MVP excludes overlap lanes, time axis, now-line                            | Those belong to time-grid.                                                                                                                                                                                             |
| 4       | **Date at the top** of each column                                                     | The original 128px comparator is superseded by decision 14's provisional 160px minimum; the date header remains sound and has more room.                                                                               |
| 5       | **Header rule is fully configurable** — width, colour                                  | Start visible by default.                                                                                                                                                                                              |
| 6       | Between-day chrome rotates 90°; within-day chrome stays untouched                      | The organising thesis.                                                                                                                                                                                                 |
| 7       | `date_vertical_alignment` is **ignored** in column view                                | Naming harmonisation with a future `date_horizontal_alignment` is out of scope.                                                                                                                                        |
| 8       | Phase 1 is **shared leaf extraction**; list keeps its `<table>`                        | The drift lives in leaves, not containers. See A3-A and Phase 1.                                                                                                                                                       |
| 9       | #339 branch is **frozen**, not rebased                                                 | lenaxia's four commits are preserved as ancestors for attribution.                                                                                                                                                     |
| 10      | Feature milestone is **v4.0.0**                                                        | This is a choice, not a semver requirement.                                                                                                                                                                            |
| 11 + 12 | Below a width threshold, the **view falls back to list**                               | Do not clamp the number of columns. See A3-C.                                                                                                                                                                          |
| 13      | The list DOM equality gate is retained, tightened, shipped, and mutation-tested        | Phase 0 PR #390 delivered `tests/list-dom.test.ts`; Phase 1 must keep it green.                                                                                                                                        |
| 14      | `min_day_column_width_px` starts at **160**, is **measured**, and is **public config** | Measured in the G13 spike: 160 survives, 128 is disproven. G14 makes it a user-facing key — it is the escape hatch that keeps decision 11+12 ("do not clamp the number of columns") viable in a 500px default section. |

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
  section C. By Phase 5 there are three renderers anyway (table list / grid column / grid
  time-axis). Forcing two of them to share one flip-able DOM is _less_ consistent with the
  adapter, not more.
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
.content-container   flex-direction: column (list)  |  CSS grid, N tracks (column view)
list day block       unchanged <table> + rowspan     (date on left)
column day block     new grid cell content           (date on top)
both                 consume the SAME leaf renderers
```

> **[v8, G11] The column container is CSS grid, not row-direction flex.** The `min-width: 0`
> carry-over below was written for a flex container and is superseded: `minmax(0, 1fr)` on the
> grid tracks solves the same shrink-to-content problem once, on the container, rather than
> requiring an explicit escape on every child. The `align-self` analysis above is unaffected —
> `align-items: stretch` is the default in grid too, and `align-self: center` shrinks the item
> to content height in grid exactly as it does in flex.

Carry-overs that still apply, to the **column** container only:

- `.date-column` fixed width → the date is a header band above the events, not a side column,
  so this becomes a block-level header rather than a sized flex item (D2).
- ~~Events pane → `flex: 1` **plus `min-width: 0`**~~ **[v8]** superseded by G11's
  `minmax(0, 1fr)`. The underlying trap is real and unchanged — a bare `1fr` is
  `minmax(auto, 1fr)` and refuses to shrink below content width, so a long title overflows the
  card. `table-layout: fixed` (`styles.ts:287-296`, property at `:290`) handles this implicitly
  in list view today. G11 fixes it once on the grid container instead of per child.
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

> **[v8] G12 ruling — the two compact keys are split.** `compact_days_to_show` is **in MVP**;
> `compact_events_to_show` is **out**. The analysis below is why the rotation is correct, and
> stands as the design for when it ships — but it is **not MVP scope**, and D6 (not a shared
> key with per-view help text) is now the mechanism it will use.

The user-level meaning of `compact_events_to_show` is _how tall the card is when collapsed_.
That meaning rotates through different height functions:

- **List:** height ≈ **Σ** events, so a global budget caps height.
- **Column:** height ≈ **max** over columns, so a per-column budget caps height.

Column view would therefore implement compact mode as a per-column budget. That is new adapter
code, not reuse of the current `totalEventsShown` loop (`events.ts:409-475`). Tap/hold
expansion already exists (`calendar-card-pro.ts:660`, `:663`, `:704`, `toggleExpanded()` at
`:862-866`). **Deferred past MVP per G12**, because a per-column budget is a genuinely
different algorithm and it is the half that entangles with G10's transition rule.

Limits and related keys:

- `compact_events_complete_days` is inapplicable per-column. It is a cross-day inclusion
  filter under a shared budget (`events.ts:413-441`); a per-column budget has no shared pool
  and renders every column. Ignore and annotate.
- **`compact_days_to_show` maps to fewer columns when collapsed — in MVP.** The unit is "days"
  in both views, so it needs neither an override nor a new key; it is simply N.
- Per-entity `compact_events_to_show` must stay global in both views (`events.ts:350-391`). It
  is a temporal cap — e.g. next one birthday — not a height cap; rebasing it per column would
  multiply the cap by `days_to_show`.
- **[v8]** When per-column compaction does ship, it is configured as `column.compact_events_to_show`
  under D6's override block, **not** as the same flat key carrying two meanings. `view: column`
  falls back to list below a width breakpoint, so one card instance renders both views and a
  single value cannot serve both.
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

That prediction was then tested. An adversarial mutation audit of the 18-test gate ran 59
mutations; **22 survived**. The gate reliably catches structural DOM changes — element names,
class names, ordering, `rowspan`, both weather render sites — but passes three whole classes of
refactoring bug:

1. **Default-off branches are unreached**, as predicted: `show_description`, `filter_duplicates`,
   `remove_location_country`, `compact_events_complete_days`, and the one-token
   `today_indicator_position` fallback all survived a flipped default.
2. **Default-true options are never exercised in their `false` branch.** Twelve of them,
   including `show_month`, `show_time`, `show_location`, `show_end_time` and five weather
   toggles. Emitting bogus DOM from the `false` branch passes.
3. **Whole-logic deletion in code that no-ops under default config.** The colour-precedence
   chain is the severe case — see the Phase 1 traps below.

The audit also found the gate cannot distinguish `''` from `nothing`, and that its assertions
are Vitest external snapshots, i.e. an approval oracle regenerable with `vitest -u` — which
during a refactor means a genuine regression can be "fixed" by regenerating it. **Tests added to
close these holes use explicit inline assertions, not snapshots**, and each is proven to fail
under the mutation it exists to catch.

Phase 1 does not begin until the holes intersecting its four extraction targets are closed.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-0--safety-net--ships-3x--risk-none-v3--new)

### Phase 1 — shared leaf renderers — ships 3.x — risk: low — ✅ **complete**

List keeps its `<table>` and `rowspan`. Phase 1 extracts axis-agnostic leaf renderers into
shared functions that the list's existing table consumes unchanged, and that column and
time-grid consume from their own containers.

**Outcome:** all four targets extracted into a new module, `src/rendering/leaves.ts`.
`render.ts` fell from 1120 to 680 lines; the gate stayed green at 86/86 after every step and
the snapshot file was **never regenerated**. Exports: `renderDateWeather`,
`renderDateContent`, `renderLabel`, `renderEventTitle`, `renderEventWeather`,
`renderEventContent`, `renderTodayIndicator`, and the `EventContentParts` interface.

**Verified live**, not only against the offline snapshot: the `ccp-current-testing` HA tab
renders five A/B pairs (baseline, weather at both sites, colour precedence + today
indicator, the `show_time: false` time-block shapes 4/5, and labels/location/description),
each pairing the HACS production card against the dev build under the identical config. A
browser probe reads both cards' `shadowRoot.innerHTML`, normalises away lit's per-instance
comment markers, and diffs. **All five pairs came out byte-identical against real calendar
data.** The probe carries a negative control asserting that the five different configs
produce five different markups, so an over-eager normaliser cannot pass by flattening
everything to a constant. Probe lives beside the deploy skill as `ab-dom-diff.mjs`; it is
worth re-running at the end of Phases 2, 3 and 4, which make the same "nothing visible
changes" claim.

Extract in this order:

1. Weather rendering (`render.ts:526-575`). There is no `renderWeather` function on `dev`;
   weather is inline inside `renderDateColumn` (`render.ts:490-611`). Extract weather first as
   its own leaf.
2. Date content and colour precedence (`renderDateColumn` `:490-611`, precedence `:497-516`).
   The date-content renderer takes weather as an already-rendered `TemplateResult` or
   `nothing`, rather than raw forecast data.
3. `.event-content` subtree (`render.ts:942-1003`) — time, location, description. **Not** the
   title: `renderEventTitle` is already a standalone exported function (`render.ts:1012`),
   called at `:943`. Nothing to extract there.
4. Today-indicator geometry (`parseIndicatorPosition` `:358-382`).

Target 3 is the branchiest of the four and the spec previously understated it. The time block
(`:944-985`) is a triple-nested ternary with **six** distinct output shapes, not one:

| #   | Condition                     | `.time-actual`          | Sibling           |
| --- | ----------------------------- | ----------------------- | ----------------- |
| 1   | `shouldShowTime` + countdown  | icon + `<span>`         | `.time-countdown` |
| 2   | `shouldShowTime` + progress   | icon + `<span>`         | `.progress-bar`   |
| 3   | `shouldShowTime` alone        | icon + `<span>`         | —                 |
| 4   | `!shouldShowTime` + countdown | **empty**               | `.time-countdown` |
| 5   | `!shouldShowTime` + progress  | **empty**               | `.progress-bar`   |
| 6   | none of the above             | not emitted (`nothing`) | —                 |

Shapes 4 and 5 differ from 1 and 2 _only_ by the emptiness of `.time-actual`, which makes
"reuse the populated one" the single most likely extraction bug in Phase 1.

The Stage 2 gate pins both weather render sites: the date-column block and
`renderEventWeather` (`render.ts:1050+`), which reads the hourly forecast. Do not let the event
weather path fall through the extraction just because the date-column path is named first.

The contract is strict: list-view DOM must be byte-identical before and after. Extraction that
changes list output is a bug. Watch four traps:

- `renderEvent` interpolates locals computed before the extraction boundary; pass them rather
  than recomputing. Six of them: `eventTime`, `eventLocation`, `eventDescription`,
  `shouldShowTime`, `countdownStr`, `progressPercentage`. They are now a named
  `EventContentParts` object so the column container has one documented thing to satisfy.
- Accent, background, padding, and position classes live on the wrapper `<td class="event">`
  (`render.ts:938-941`, `styles.ts:458-483`, position classes at `render.ts:916-922`). Future
  column wrappers reproduce those; leaves do not absorb them.
- **The colour-precedence chain is invisible to default-config tests.** `:497-516` resolves
  base → weekend → today, today winning. But all six weekend/today colour keys default to
  `undefined` (`config.ts:75-80`), so every `||` falls through to base and **both `if` blocks
  are complete no-ops** under default config. Deleting the entire chain produces identical
  output for every default fixture. Any test protecting target 2 must set the weekend and
  today colour keys explicitly, and must include a **today that falls on a weekend** to pin
  the precedence order.
- **Three "render nothing" idioms coexist in the extracted region** and are not
  interchangeable in the DOM: `nothing`, the empty string `''`, and an empty `html` tagged
  template. **Phase 1 preserves each exactly as-is.** Normalising them is behaviourally safe
  but violates the byte-identical contract, and folding a cosmetic cleanup into a structural
  extraction is how refactors go wrong. Normalise later as its own change, if at all. The
  `preserves no-output idioms at extraction seams` test in `tests/list-dom.test.ts` is the
  forcing function: it fails at each extraction seam by design, and is repointed only after
  each idiom has been confirmed byte-for-byte.

#### 🚨 The whitespace trap — governs every later extraction

Discovered during Phase 1 and **not** obvious from reading the gate. The gate's serializer
normalises whitespace **between tags only** (`/>\s+</g` → `>\n<`). Whitespace **adjacent to a
text node survives verbatim into the snapshot** — the literal source indentation of, say, an
event title becomes part of the oracle.

The rule that follows: **preserve the original absolute indentation verbatim inside every
moved template, even when it looks wrong at the new nesting depth.** `renderEventContent`'s
body is indented to column 8 in a top-level function because that is where it sat inside
`renderEvent`. `leaves.ts` carries a header comment saying so, so nobody "tidies" it.

Verified, not assumed: **prettier does not reformat the inside of `html` tagged templates**,
so `npm run format` cannot silently break this.

If a snapshot diff appears during a later extraction, it is a whitespace error. Fix the
indentation. **Do not run `vitest -u`** — that launders the change past review, and the
whole point of the gate is that it is the one artefact the refactorer does not get to edit.
Making the serializer whitespace-insensitive is defensible (interior whitespace has no
user-visible effect) but must be a separate, separately reviewed commit — never bundled with
an extraction.

#### Deviations from the plan as written

Both are internal, reversible, and touch no config key or public surface.

1. **Leaves live in a new `src/rendering/leaves.ts`, not in `render.ts`.** The plan says
   column and time-grid consume the leaves "from their own containers"; leaving the leaves in
   the list module would make those containers import from the list. Reversible with `git mv`.
2. **Targets 3 and 4 each moved as a cluster, not as the single named function.** Target 4
   names only `parseIndicatorPosition`, but its sole caller is `renderTodayIndicator` and both
   it and `renderIndicatorByType` are axis-agnostic — moving only the geometry would have
   `render.ts` importing a private helper back for one call. Likewise target 3 forced
   `renderLabel`, `renderEventTitle` and `renderEventWeather` to move: `.event-content` calls
   the title, which calls the other two, so leaving them behind creates a backwards
   `leaves.ts → render.ts` import.

   Target 3 as written says of the title "Nothing to extract there." That was wrong — it is
   not extra work, but it is not a no-op either. `renderEventTitle` was exported from
   `render.ts` with **no external consumers**, so moving it changed no call site outside the
   two rendering modules.

Deferred out of Phase 1: removing the layout table, RTL, and the duplicate
`.today-indicator-container` rule (`styles.ts:332-340` / `:364-370`).

Soak fixtures reused by later phases: longest-title wrapping, `date_vertical_alignment` at
all three values, `today_indicator: true` on a multi-event today, RTL, week numbers on,
`max_height` scrolling, narrow HA sections column.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-1--shared-leaf-renderers--ships-3x--risk-low-v4--re-scoped)

### Phase 2 — presentation models — ships 3.x — risk: low — ✅ **complete**

`EventPresentation` and `DayHeaderModel` are only built if a named consumer needs them. If the
Phase 1 shared leaves and the Phase 4 column renderer can consume raw `EventsByDay` types
happily, do not build presentation models speculatively; fold them into Phase 4 if the adapter
creates the need.

**Ruling: one of the two is justified, the other is not.**

`EventPresentation` — **built**, in a new module `src/rendering/presentation.ts`. The named
consumer is the Phase 4 column renderer. §D1 requires the column view's `.event-content` to be
**byte-identical** to the list's, and that content is driven entirely by `EventContentParts`,
which roughly 120 lines of dense branching inside `renderEvent` produce — the all-day vs. timed
past-event split with its iCal exclusive-end adjustment, the entity `show_time` override, the
multi-day all-day detection that matches translated strings, the three-clause `shouldShowTime`
and the four-clause countdown gate. The only two ways to get a byte-identical
`EventContentParts` in a second view are to duplicate that branching (which would drift) or to
share the builder. That is a real consumer, so the YAGNI clause is satisfied rather than
violated.

`buildEventPresentation` takes neither the day, the event index, nor the weather forecasts.
Needing none of them is what demonstrates the result is genuinely axis-agnostic.

`DayHeaderModel` — **not built.** Phase 1 already removed the need: `renderDateContent` takes
only primitives that any container has to hand and performs its own weekend→today colour
precedence internally, which left `renderDateColumn` a four-line composition. There is no
derived data such a model would carry. §D2's column header differs from the list header in
**markup axis only**, which is a renderer concern, not a model concern. Fold it into Phase 4 if
that phase ever creates the need.

**Outcome:** `renderEvent` fell from 172 lines to 55, of which the markup block is untouched and
still at its original indentation. `render.ts` fell 680 → 562. Left behind as list-specific or
too trivial to be a drift risk: `dayDate` / `isWeekendDay` (they feed the date **cell**, not the
event) and the first/middle/last positional classes (one-line derivations from `index`).

**Verification.** The extracted block was diffed line-by-line against the original and is
byte-identical, so the move is proven rather than believed. The gate passes 86/86 with the
snapshot **never regenerated**, which is the actual DOM-neutrality proof. Two independent
corroborations: removing the now-unused `FormatUtils` and `EventUtils` imports from `render.ts`
confirms the extraction was complete, and all five idiom-guard assertions still hold —
including #5 on the `${index === 0 …}` seam, which is the **Phase 4** cut point and was
deliberately untouched here. Unlike Phase 1 this phase moves no markup, so the whitespace trap
does not apply.

Two deviations from strict move-discipline, both deliberate and both comment- or dead-code
only: a dead `tomorrow` local was dropped (assigned, mutated, never read — invisible to `tsc`
because `noUnusedLocals` is off, and to eslint because the `setDate` call counts as a use), and
one comment that was already factually wrong was corrected (`isEmptyDay` adds no CSS class; it
gates time, countdown and progress).

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#phase-2--presentation-models--ships-3x--risk-low-v4--cache-fix-split-out)

### Phase 2b — cache correctness — SHIPPED — ships 3.x independently — risk: low

**Status: complete.** Commit `a463a94` on `feature/column-view`.

This was a live list-view bug and did not wait for the column epic. `fetchEventData` cached
the _output_ of `processEvents`, while `getBaseCacheKey` covered only fetch inputs — entity
ids, window, `show_past_events`, `filter_duplicates`. Every other config key `processEvents`
reads was therefore invisible to the cache, so editing one had no visible effect until the
entry expired.

Two defects followed, with different mechanisms:

1. **Value staleness.** `_matchedConfig` and `_entityLabel` were frozen into the cached event,
   so an edited per-entity label, colour or toggle was ignored on a hit.
2. **Reference staleness.** `applyPerEntityCompaction` (`events.ts:398`) identifies an entity's
   config block by `config.entities.findIndex((e) => e === matchedConfig)` — a reference check.
   Two independent mechanisms broke that reference, so the lookup returned `-1` and the
   compaction bucket key silently degraded from `entityId__configIdx` to bare `entityId`,
   merging two config blocks into one shared budget:
   - the cache round-trips through `JSON.stringify`/`JSON.parse`, so a cache-hit
     `_matchedConfig` is a freshly-parsed object; and
   - `normalizeEntities` runs on **every** `setConfig` (`calendar-card-pro.ts:726`) and
     `config.ts:227` maps to fresh object literals.

   The second mechanism is the load-bearing one, and is stronger than an earlier draft of this
   section recorded: the identity breaks on every `setConfig`, not only on a cache hit, so the
   defect was **permanent rather than warm-cache-only**. Live A/B measurement confirmed it —
   see below.

Defect 2 settled the maintainer decision: **cache raw API events and reprocess on every read.**
Widening the key was not a viable alternative — no cache key repairs a broken object reference.

The scope was wider than the earlier draft of this section recorded. It named five
`_matchedConfig` consumers; there are **eight**, and the three it missed are the two that
matter most:

| Site                    | Role                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `events.ts:302`         | copies `_matchedConfig` through into the per-day event ⟵ _missed_           |
| `events.ts:398`         | compaction bucket key — **reference-identity compare** ⟵ _missed, defect 2_ |
| `events.ts:797-800`     | per-entity `split_multiday_events` override                                 |
| `events.ts:1003`        | `getEntityColor`                                                            |
| `events.ts:1040`        | `getEntityAccentColorWithOpacity`                                           |
| `events.ts:1083`        | `getEntityLabel`                                                            |
| `events.ts:1115`        | `getEntitySetting`                                                          |
| `leaves.ts:248`, `:253` | event colour and label-icon colour ⟵ _missed_                               |

All read only _derived_ config state, which is exactly why reprocessing on read is sufficient.

Both paths now route through one `processRawEvents` helper, so a hit and a refetch provably
agree. The key drops `filter_duplicates` and the allow/blocklist patterns, which are
processing concerns applied on read. `showPastEvents` stays for now: it is redundant (it never
reaches `getTimeWindow`, and is applied at render time in `groupEventsByDay`) but is also baked
into `generateDeterministicId`, so removing it here alone would widen the diff without changing
behaviour. Tracked in §D7.

**Not user-breaking, so it ships in 3.x safely:** the key already carries the version string,
so every release invalidates all caches; and a _narrower_ key causes more hits, never a config
that stops taking effect.

`processEvents` now copies each event rather than decorating it in place, since its input may
be the cached payload. That incidentally fixed an aliasing bug — two config blocks naming the
same entity selected the same objects, so the second overwrote the first and both copies
rendered with the last block's config.

Six tests in `tests/event-cache.test.ts` pin this, all confirmed load-bearing by mutation
testing. The list-view DOM snapshot is unchanged.

**Live A/B verification** (dev `?v=252` against the HACS release, `ccp-current-testing`), read
out of the rendered shadow DOM rather than eyeballed:

| Test              | Config                                              | prod (before)             | dev (after)              |
| ----------------- | --------------------------------------------------- | ------------------------- | ------------------------ |
| aliasing          | same entity twice, labels `AAA`/`BBB`               | `BBB`, `BBB`, `BBB`       | `AAA`, `BBB`, `AAA`      |
| compaction bucket | same entity twice, both `compact_events_to_show: 1` | **1 row** (budget shared) | **2 rows** (own budgets) |
| regression        | plain 3-calendar card, no per-entity config         | identical                 | identical                |

The compaction row is the useful one: prod renders 1 row on a **cold** load as well as a warm
one, which is the direct observation that defect 2 was never cache-specific. It also only
reproduces when _both_ blocks set the same small budget — with budgets `1` and `3` the larger
budget absorbs the second event and the merge is invisible, which is why an earlier draft of
this test showed nothing.

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

**[v8, G11]** Equal heights come from CSS grid `align-items: stretch`, which is the default —
so this is free once the container is a grid. See G11 for the ruled track definition
(`repeat(N, minmax(0, 1fr))`) and why `minmax(0, 1fr)` rather than a bare `1fr` is the
load-bearing detail.

Uncapped column view is safe by default: column height is bounded by the busiest day, while
list height is the sum over days. For constant event height, `max(eᵢ) ≤ Σ(eᵢ)`. This differs
from time-grid's configured time axis, which creates whitespace whether events fill it or not.

The regime where column can be taller is narrow-column line wrapping under skewed event
distribution: event height is not constant across layouts. This argues for the Phase 4
measurement spike and the 160px provisional minimum, not against column layout.

**[v8, G12] Compact scope is settled:** `compact_days_to_show` is in MVP (it simply sets N);
`compact_events_to_show` is **out**. The A3-D requirements — per-column budget,
`compact_events_complete_days` ignored, per-entity cap kept global, `max_events_per_column`
deferred, `+N more` mandatory if any cap ships — describe the design for when per-column
compaction ships, not MVP. `max_height` is inherited unchanged in both cases.

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

The adapter must express three per-view behaviour kinds without leaving inert editor toggles:

| Kind                                                          | Example                                                   | Editor treatment                  |
| ------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| 1. **Per-view default**, user-overridable, with auto sentinel | `show_empty_days` (`null` = auto)                         | Select with reachable `Automatic` |
| 2. **Hard force**, structurally required                      | `split_multiday_events: true` — a column is a day         | Disabled + annotated              |
| 3. **Ignored**, meaningless in this view                      | `compact_events_complete_days`, `date_vertical_alignment` | Hidden                            |

Kind 1 requires an explicit auto/unset value selectable in the editor. For booleans that means
`boolean | null` and a 3-option select. Reuse the `show_week_numbers` path (`config.ts:48`,
`editor.ts:1109-1113`, `:588-591`, `:660`). If a key cannot take a sentinel, it is not kind 1.

> **[v8] A fourth kind was removed.** Earlier revisions carried a kind 4,
> _"Reinterpreted — same control with rotated meaning"_, whose only example was
> `compact_events_to_show`. It is deleted: **D6's override block is the general solution to
> the problem kind 4 was a special case of.** A control whose meaning silently rotates
> between views is precisely the double-meaning trap D6 exists to prevent. Anything that
> would have been kind 4 is now either an override-eligible key (category B) or a distinct
> new key (category C). See the rationale for the full argument.

Week numbers are deferred in the column MVP. `show_week_numbers` is tri-state
(`editor.ts:1109-1113`) and its non-null path renders the full-width `week-row-table`. In a
partial-week column layout, placement is genuinely incoherent: a 7-day window can span two ISO
weeks and need zero, one, or two badges on non-adjacent columns. Ignore and document for MVP;
revisit with real usage. Default `null` means only opted-in users are affected.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#d5-forced-config-and-week-numbers-new)

### D6. Per-view config overrides — the `column:` block (new v8)

**Ruled, with maintainer sign-off.** A nested `column:` block carries per-view values. Any key
absent from it inherits the top-level value; an absent block reproduces today's behaviour
exactly.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
days_to_show: 7
show_location: true # list view: plenty of room
day_spacing: 16px
column:
  show_location: false # column view: ~166px per column is not enough
  day_gap: 4px # a new key (Category C), not an override of day_spacing
```

> Note the asymmetry in that block: `show_location` is an **override** of the top-level key,
> whereas `day_gap` is a **new key** that has no top-level counterpart. Both live inside
> `column:`, but only the first participates in inheritance. See the Category C table below.

#### Why a shared key is not enough

The plan previously asked, per key, _"what does this mean in column view?"_. That is the wrong
test. `view: column` falls back to list below a width breakpoint, so **one card instance renders
column on a desktop and list on a phone**. The real test is stronger:

> Is there a single value the user would want in **both views at once**?

Where the answer is no, a shared key is not a simplification — it is a guarantee that tuning
one view breaks the other.

#### The sizing intuition is backwards

Column view is triggered by a **wide card** but produces **narrow content boxes**. Using the
**measured** placement widths from the G13 spike rather than a hypothetical card width, and the
largest column count that clears the 160px floor at each:

| Context                              | Columns | Horizontal budget per event |
| ------------------------------------ | ------- | --------------------------- |
| Default HA section, 500px (measured) | 3       | **~161px**                  |
| `column_span: 2`, 1032px (measured)  | 6       | ~165px                      |
| `column_span: 3`, ~1564px (derived)  | 7       | ~217px                      |
| List view on a ~390px phone          | 1       | **~300px**                  |

Per-item width in column view is **smaller than mobile list view at every reachable placement** —
the original estimate of ~164px for a hypothetical 1200px card turns out to describe the typical
case almost exactly, for the wrong reason. Any text-density setting tuned on a phone is too
generous in a column.

Note that the first row is the _default_ placement and it caps at three columns, which is why
G14 rules that the card falls back to list rather than clamping, and why
`min_day_column_width_px` is public.

#### Eligibility — the boundary follows from G10

G10 rules that a view transition must **never** refetch. Therefore the block may contain only
**render-time and grouping-time** keys. A fetch-time key inside it would fire a Home Assistant
API call on every resize across the breakpoint.

| Cat.  | Meaning                         | In `column:`?             |
| ----- | ------------------------------- | ------------------------- |
| **A** | Shared — semantic, not layout   | No — pointless            |
| **B** | Override-eligible               | **Yes**                   |
| **C** | Axis-rotated                    | No — **new key** instead  |
| **D** | Structurally forced/meaningless | No — see D5 kinds 2 and 3 |
| **E** | Fetch-time                      | **Never** — G10           |

Category E, exhaustively: `entities` (and `entities[].entity`, `.blocklist`, `.allowlist`),
`start_date`, `days_to_show`, `first_day_of_week`, `show_past_events`, `filter_duplicates`,
`weather` / `weather.entity` / `weather.position`, `refresh_interval`, `refresh_on_navigate`.

Two of these are easy to get wrong. **`first_day_of_week`** feeds week-relative `start_date`
resolution, so it can move the fetch window. **`weather.position`** determines which forecast
subscriptions are started, so "show weather in the column header only" cannot be expressed as
an override of it — it needs a render-only key.

#### Category C keys get new names, not overrides

Where the same value means a rotated thing, reusing the name inside `column:` still forces the
user to hold two meanings for one word. These get distinct keys:

| List-view key              | Column-view meaning                | Resolution                          |
| -------------------------- | ---------------------------------- | ----------------------------------- |
| `day_spacing`              | vertical gap → horizontal gutter   | new `column.day_gap`                |
| `day_separator_*`          | horizontal rule → vertical rule    | new `column.day_header_separator_*` |
| `week_separator_*`         | horizontal rule → vertical rule    | deferred with week numbers          |
| `month_separator_*`        | horizontal rule → vertical rule    | deferred with week numbers          |
| `compact_days_to_show`     | day rows → columns                 | reuse — the unit is "days" in both  |
| `compact_events_to_show`   | total budget → per-column budget   | **out of MVP** (G12)                |
| `today_indicator_position` | tall date cell → short header band | needs a real dashboard (G13)        |

`day_spacing` is the concrete case that motivated this: at `day_spacing: 24px`, seven columns
lose **144px** to gutters before any content is laid out.

#### Precedent in this codebase

`WeatherConfig` already does exactly this: `date?: WeatherPositionConfig` and
`event?: WeatherPositionConfig` — one option shape, two rendering contexts, configured
separately (`types.ts:147-168`).

> **Copy its shape, not its merge.** The disjoint field sets under `date` and `event` are
> deliberate — the two positions render different things, and `config.ts:118-136` gives them
> disjoint _defaults_ to match. What does not carry over is the resolution idiom. `setConfig`
> merges shallowly (`calendar-card-pro.ts:719`), and the weather renderers compensate with
> `config.weather?.date || {}` plus `!== false` / `=== true` reads, so an absent key falls back
> to its default. **That idiom cannot be used here**, because it conflates "not set" with "set
> to `false`" — and `column.show_location: false` against a top-level `true` is precisely the
> case the block exists to express. Resolution is therefore **presence-based** (`'key' in
block`), inheriting from the merged top-level value, never from `DEFAULT_CONFIG`.
> `ColumnOverrides` is its own narrowed type, not a re-use of `Config`.

#### Constraints this satisfies

- **F3** — additive. No shipped key is renamed, so no YAML-only user breaks.
  (`DEPRECATED_CONFIG_MAP` is editor-only, `editor.ts:381` and `:453`.)
- **G10** — no fetch-time key present, so a breakpoint crossing never refetches.
- **E1** — every excluded key is documented as excluded, not silently inert.

#### Scope — ruled

> **[v8] Both open questions ruled by the maintainer.** Neither is a permanent exclusion: both
> are **MVP-scope deferrals**, and both are listed in [D7](#d7-deferred-past-mvp--required-before-the-first-production-release)
> as release blockers for v4.0.0.

- **Per-entity precedence — deferred past MVP.** `entities` is category E, so the array cannot
  be overridden. Per-entity _render_ flags (`entities[].show_location`) are category B and so
  are eligible in principle, but addressing them needs a scheme — patch by array index, or by
  entity id — and neither is obviously right. Array index is brittle against reordering; entity
  id breaks when the same calendar appears twice with different display settings, which is a
  supported pattern. **MVP has no `column.entities`.** The card-level override applies to every
  entity, exactly as the top-level key does today.
- **Editor exposure — deferred past MVP, YAML-only first.** The block is YAML-only for
  development and internal testing. This is not a shipping position: the editor is ~2,000 lines
  and the most fragile file in the repo, and every control needs a string in all 11
  editor-translated languages — a _partial_ `editor` section renders raw key names rather than
  falling back to English. Building those controls against a spec that is still moving would
  mean building them twice, so they follow the block rather than accompany it.

> Full audit, per-key classification and rejected alternatives:
> [column-view-rationale.md](./column-view-rationale.md#d6-per-view-config-overrides-new-v8)

### D7. Deferred past MVP — required before the first production release

**[v8]** MVP here means "the column view renders correctly and is testable", not "shippable".
Several deliberate deferrals make the MVP tractable; every one of them is a **release blocker
for v4.0.0** and none may be dropped silently. This section exists so that the distinction
survives — a deferral recorded only in the section that deferred it is a deferral that gets
forgotten.

| Deferred                               | Deferred in | Why deferred                               | Release requirement                                |
| -------------------------------------- | ----------- | ------------------------------------------ | -------------------------------------------------- |
| **Editor controls for `column:`**      | D6          | Spec still moving; would be built twice    | Full editor support, strings in all 11 languages   |
| **`column.entities[]` overrides**      | D6          | Addressing scheme unresolved (index vs id) | Ruled and implemented, or documented as N/A        |
| **`compact_events_to_show` overrides** | G12         | Per-column budget is a different algorithm | Ruled in or documented as N/A (E1 forbids silence) |
| **Week / month separator overrides**   | D6          | Axis-rotated; needs its own visual design  | Ruled in or documented as N/A                      |
| **`today_indicator_position`**         | D6          | Depends on the G13 header-budget spike     | Ruled once G13 measures                            |
| **Editor too-narrow warning**          | G14         | Editor support as a whole is post-MVP      | Must ship — it is what makes G14's ruling honest   |

The E1 acceptance criterion is what enforces this: _no silent config no-ops_. Anything still
deferred at release must appear in the documented not-applicable list, so a user who sets it
learns that it does nothing. Silence is the failure mode, not the deferral itself.

**Non-blocking follow-up (not a release blocker).** Phase 2b left `show_past_events` in
`getBaseCacheKey`. It is redundant there — it never reaches `getTimeWindow`, so it cannot
affect the API response, and it is applied at render time in `groupEventsByDay` — but it is
also baked into `generateDeterministicId` (`helpers.ts`), which feeds `_instanceId` and hence
the key anyway. Removing it from one place alone changes no behaviour, so it was left out of
the Phase 2b diff. Drop it from both, together, whenever that file is next touched.

---

## E. Cross-cutting acceptance criteria

> **Verified against `origin/dev` @ `29b8226`.** The `AGENTS.md` reference re-verifies at
> `AGENTS.md:119-163`.

1. **No silent config no-ops.** Every existing option either works in column view, is
   overridable per view via the `column:` block (D6), or is documented as not applicable.
   Current documented-N/A list: `date_vertical_alignment`, `compact_events_to_show`,
   `compact_events_complete_days`, `split_multiday_events` (structurally forced true), week
   numbers, and week/month separator spacing multipliers. `compact_days_to_show` is **not**
   N/A — the unit is "days" in both views (D6, category C). G12's compact-scope contradiction
   is resolved by D6: `compact_events_to_show` is out of MVP, and the override block is the
   mechanism for it later, so no key needs two meanings.
2. **Every new user-visible string exists in all language files at ship time.** A partial
   `editor` section defeats the whole-language English fallback and renders raw key names.
3. **No fetch on a view transition.** Crossing the `view: column` width-fallback breakpoint must
   not issue a
   Home Assistant API call (G10). This is the invariant that bounds D6's override block to
   render-time and grouping-time keys, and it is testable: cross the breakpoint with a warm
   cache and assert zero `callApi` invocations.
4. **An override of `false` beats an inherited `true`.** **[v8]** The `column:` block resolves
   by _presence_, not truthiness, so `column: {show_location: false}` against a top-level
   `show_location: true` must render locations in list view and omit them in column view. The
   codebase's existing `!== false` idiom (`render.ts:540`) cannot express this, so the test
   guards against reaching for it out of habit. The mirror case — `false` at top level,
   `true` in the block — must hold too.

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
   semantics must be used consistently. **[v6] Largely resolved by G14:** because the column
   count is never reduced by width, the only source of divergence left is an explicit
   `show_empty_days: false`, which is the _same_ suppression the list view already applies — so
   the existing window is correct and no reconciliation is needed. What remains is narrow: prove
   the resolved (not raw) `show_empty_days` value feeds both the count and the grouping.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#f-constraints-that-bind-implementation)

---

## G. Open questions

> **Verified against `origin/dev` @ `29b8226`.** No `src/` citations in this section. **[v5]**
> Items 6 and 8 remain genuinely open and cannot be closed on paper; item 9 remains true.

> **[v6→v8] G10–G13 are now RULED.** Raised by an independent review pass as hard Phase 4
> prerequisites, then delegated to the implementation lead ("you decide what's best"). Three
> were decidable on paper; only G13 needs measurement, and it shrank because one of its
> sub-questions was a defect rather than an open parameter. **All four are reversible** — the
> maintainer may override any of them before Phase 4 starts.
>
> - **G10. `requestedView` vs `effectiveView` — RULED: name both, thread `effectiveView`.**
>   The width fallback is not render dispatch; it changes **data** semantics upstream
>   (`show_empty_days: null` resolves per-view, compaction switches from a shared budget to
>   per-column, column forces `split_multiday_events: true`). Below the breakpoint
>   `this._config.view` still reads `column` while the card renders `list`, so every one of
>   those resolves for the wrong view.
>   - **`requestedView`** = the config value. **`effectiveView`** = what is actually rendered
>     after the width fallback. Both names appear in code; neither is implicit.
>   - Every resolver and `ViewAdapter` hook takes **`effectiveView` as an explicit parameter**
>     and none reads `this._config.view`. This is the enforceable half: a resolver that takes
>     no view argument is a bug, catchable by inspection.
>   - **Transition rule** — cheapest sufficient action, keyed on which resolved value changed:
>
>     | Resolved value that changed | Action        | Why                                    |
>     | --------------------------- | ------------- | -------------------------------------- |
>     | `split_multiday_events`     | **reprocess** | splitting happens upstream of grouping |
>     | `show_empty_days`           | **regroup**   | affects grouping only                  |
>     | compaction only             | **re-render** | presentation only                      |
>     | —                           | re-render     | default                                |
>
>   - **Never refetch.** Raw event data is identical across a view transition; only its
>     processing differs. This is the invariant that bounds D6's override block, and it is
>     testable (E3).
>
> - **G11. Outer layout — RULED: CSS Grid.**
>   ```css
>   grid-template-columns: repeat(N, minmax(0, 1fr));
>   column-gap: <gutter>;
>   /* align-items: stretch is the default — equal heights come free */
>   ```
>   where **N is the number of columns actually rendered**, not `days_to_show` (G13).
>   Equal heights are free in flex too, so that was never the discriminator. The real reason:
>   **`minmax(0, 1fr)` is the only formulation that survives a long event title.** A bare `1fr`
>   means `minmax(auto, 1fr)`, which refuses to shrink below content width and overflows the
>   card. Flex `flex: 1` carries the identical `min-width: auto` trap and needs an explicit
>   `min-width: 0` on **every** child — one omission and a single long title blows out the
>   layout. Grid fixes it once, on the container.
> - **G12. Compact-mode scope — RULED: split the two keys.** A3-D, D3 and E1 contradicted each
>   other because they were answering about **two different keys** as though it were one
>   question.
>
>   | Key                      | MVP     | Rationale                                                                                 |
>   | ------------------------ | ------- | ----------------------------------------------------------------------------------------- |
>   | `compact_days_to_show`   | **IN**  | In column view it means "render this many columns". It is N.                              |
>   | `compact_events_to_show` | **OUT** | A per-column budget is a different algorithm, and it is the half that entangles with G10. |
>
>   D6 removes the residue: with `compact_events_to_show` out of MVP and the override block
>   available for it later, no key needs to carry two meanings.
>
> - **G13. Measurement spike — RUN. See "G13 spike results" at the end of this section.**
>   One sub-question was a **defect**, not an open parameter: with `show_empty_days: false` the
>   threshold formula still used `days_to_show`, so a 7-day config with events on 2 days
>   demanded a 7-column-wide container before showing 2 columns — defeating dense mode
>   outright. **Ruled: the threshold uses the rendered column count**, which is already known
>   at render time because grouping precedes it. Same N as G11. **The spike has now run:**
>   `min_day_column_width_px: 160` survived measurement, 128 is confirmed disproven, and the
>   card-edit modal measured 480px. **`min_day_column_width_px` is now ruled public config**
>   (G14). Still open after the spike: the hysteresis band, weather truncate-or-drop (which
>   _sets_ the minimum), and the header vertical budget. The default-width finding it surfaced
>   is ruled in **G14** below.
>
> Two further findings are recorded in place rather than here because they affect work that
> ships **before** v4.0.0: the Phase 2b cache scope (see the note in Phase 2b) and the Phase 1
> DOM-gate test design (see Phase 0 Stage 1).

1. ~~Decisions 11, 12, 13, 14~~ **SETTLED in v3** — see A2 and A3.
2. ~~Does `compact_events_to_show` render "+N more"?~~ **SETTLED: it does not.** **[v8, G12]**
   The key is **out of MVP**; when per-column compaction ships it is configured through D6's
   `column:` override block rather than by reusing the flat key — see A3-D and D3.
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
   **[v6] MEASURED: 480px, i.e. two columns. A3-C.4 is severe. 160px survives.** See G13
   results.
9. **No runtime or visual HA testing has happened on any of this yet.**
10. **[v5] Un-decided and un-decidable on paper: the real rendered width of an HA masonry or
    sections column.** Every threshold in A3-C and decision 14 is arithmetic over an assumed
    container width. The arithmetic is sound; the input is a guess. First measurement task in
    Phase 4. **[v6] MEASURED — see G13 results below. The input was wrong.**

---

### G13 spike results — measured 2026-08-10 on a live HA instance

Chromium against `dashboard-admin`, **reloading at each viewport width**. Live resizing does
not settle and produces non-monotonic garbage (a 900px viewport reported a wider content box
than a 1024px one); every number below is steady-state after reload.

**The mechanism.** HA's sections view lays out **fixed-width** columns, not fluid ones:

```
--ha-view-sections-column-max-width: 500px
--ha-view-sections-column-min-width: 320px
column-gap: 32px
grid-template-columns: 500px 500px        /* at a 1920px viewport */
```

Both custom properties are themeable and `column_span` is exposed in the section editor, so
**500px is a default, not a cap**.

**Measured — card content box:**

| Placement                   | viewport | content box |
| --------------------------- | -------- | ----------- |
| sections, `column_span: 1`  | ≥ 1440   | **500px**   |
| sections, `column_span: 1`  | 1280     | 464px       |
| sections, `column_span: 1`  | 768–1024 | 336px       |
| sections, `column_span: 1`  | 430      | 414px       |
| sections, `column_span: 2`  | ≥ 1440   | **1032px**  |
| **card-edit modal preview** | 1920     | **480px**   |

_Derived_ (arithmetic over the measured 500 + 32): span-3 ≈ 1564px, span-4 ≈ 2096px. Not
measured — creating those sections would have required writing to the dashboard.

Every view on the instance is `hui-sections-view`; **no masonry or panel sample was obtained**,
so their behaviour remains unmeasured.

**Measured — text widths at the card's real fonts** (Roboto; weekday and title 14px, day
number 26px, time 12px):

| String               | width |
| -------------------- | ----- |
| `Mon 13 Nov`         | 76px  |
| `Wed 24 Sept`        | 79px  |
| `Mittwoch 24. Sept.` | 117px |
| `12° 22°/14°`        | 73px  |
| `10:00 - 11:30`      | 69px  |
| `Team Standup`       | 91px  |

**`min_day_column_width_px: 160` survives measurement.** A single-line D2 header carrying date
plus weather needs 76 + 73 + gap ≈ **157px**, and the longest common localised date form
(`Mittwoch 24. Sept.`, 117px) still needs padding around it. 128px cannot fit date and weather
on one line — **confirming it is disproven, not merely superseded**. If weather is _dropped_
from the header rather than truncated, the floor falls to roughly 130px, so **the D2
truncate-or-drop decision sets the minimum** and must be made before the constant is frozen.

**Resulting column counts** at 160px + 8px gutter:

| Card width                | columns |
| ------------------------- | ------- |
| 480px (editor preview)    | 2       |
| 500px (default section)   | **3**   |
| 1032px (`column_span: 2`) | 6       |
| 1564px (span 3, derived)  | 9       |

**A3-C.4 is confirmed real and severe.** The editor preview is 480px — two columns — which is
below the threshold for any multi-day config. A user configuring a 7-day column view would
watch the preview fall back to list while editing. The mandated mitigation (**the preview
renders the _selected_ view, not the width-measured one**) is load-bearing, not defensive.

#### G14. The default-width finding — RULED

A 7-day column view needs ~1184px of content box. That is **not reachable in a default HA
section at any viewport width** — it requires `column_span: 3`, a panel view, or a raised
theme variable. §D6's "7 columns in a 1200px card" describes a placement the user must
deliberately construct, not the default one.

**[v6 correction]** An earlier draft of this section argued from "the default `days_to_show:
7`" and concluded the out-of-the-box experience was a _permanent silent fallback to list_.
Both halves were wrong. `DEFAULT_CONFIG.days_to_show` is **3** (`config.ts:20`), and with the
real gutter — `day_spacing: '10px'` (`config.ts:40`) — the default config computes to:

```
3 × 160px + 2 × 10px = 500px
```

against the G13-measured default section content box of **500px**. So at a ≥1440px viewport
the default configuration does not fall back at all; it fits exactly, with zero margin. At
1280px, where the section measures 464px, it _does_ fall back. The honest characterisation is
**knife-edge and viewport-dependent**, not permanently failing.

Treat "fits exactly" as _at the boundary_ rather than as confirmed-fitting: the 500px figure
is the measured content box of `div.content`, and the card's own padding is drawn from inside
it, which is within the error bar of this arithmetic. The point stands either way — the
default lands on the threshold rather than far below it.

The ruling below is unaffected. It never depended on the column count; only this motivating
example did.

**Ruled: the rendered column count is determined by grouping, never by available width. The
card never silently drops columns because they do not fit.**

Precisely: N is `days_to_show`, minus any days suppressed by an explicit `show_empty_days:
false` (the content-driven reduction already ruled in G13). Width never enters the calculation.
This is the same N as G11's `repeat(N, minmax(0, 1fr))` and the same N as G13's threshold input,
so all three remain consistent.

The rejected alternative was to render `⌊width / min_day_column_width_px⌋` columns, capped at
days available — a 500px card would then show a tidy 3-day column view out of the box. It was
rejected because it makes the card **quietly disagree with its own configuration**: a user who
asks for 7 days and sees 3 has no signal explaining the difference, and the same config renders
a different number of days on desktop and tablet. Silent divergence between config and render is
worse than an honest fallback.

Three mechanisms carry the decision instead:

1. **`min_day_column_width_px` becomes public config** (upgrading decision 14, and closing the
   G13 sub-question of whether it should be). It is the user's escape hatch: the threshold is
   theirs to lower. A user who genuinely wants 7 columns in a 500px card can set it to `70` and
   get them. The card's opinion about legibility becomes a default, not a rule.
2. **The width fallback to list view stays exactly as designed.** When the configured column
   count does not fit, the card falls back to list _wholesale_ — it never renders a degraded
   column view. This is the already-ruled behaviour; the finding does not change it.
3. **The editor warns at configuration time.** When
   `days_to_show × min_day_column_width_px + gutters` exceeds a reference width, the editor
   surfaces a warning naming the arithmetic and the remedies: raise `column_span`, use a panel
   view, reduce `days_to_show`, or lower `min_day_column_width_px`. The decision stays with the
   user; the card's job is to make the consequence visible _before_ they hit it.

The warning is **computed statically, never measured**. The editor cannot know the card's
deployed width — its own preview is 480px (A3-C.4) while the real placement may be 500px or
1032px — so any measurement it took would be of the wrong element. It compares the configured
arithmetic against the documented 500px default-section reference instead, which is truthful
regardless of where the card ends up.

**Consequences to carry into implementation:**

- **`days_to_show` stays a single global value and stays in Category E.** A per-view default
  (column defaults to 3, list to 7) was considered and is **architecturally forbidden**: it
  would change the fetch window at the width breakpoint, violating E3's requirement that
  crossing the breakpoint with a warm cache performs zero `callApi` invocations. The same rule
  that puts `days_to_show` in Category E rules out a per-view default for it.
- **The F7 `hide_when_empty` interaction dissolves.** Under the rejected alternative, rendered
  columns would have been fewer than `days_to_show` by construction, so `visibleEventCount`
  (windowed by `days_to_show`) and the rendering would have diverged and needed reconciling.
  With the column count pinned to `days_to_show`, the existing window is already correct. **No
  change required** — recorded here so the reconciliation is not re-derived later.
- **New key cost.** `min_day_column_width_px` becoming public means: a `DEFAULT_CONFIG` entry, a
  documentation row (`check:docs` enforces defaults ↔ reference-table parity), an editor
  control, and editor strings in all 11 editor-translated languages.
- **The editor warning is a v4.0.0 release blocker, not an MVP blocker** — consistent with the
  standing ruling that editor support for `column:` may follow YAML-only internal testing. It is
  registered in §D7.
- The default-config experience — `view: column` with the real default `days_to_show: 3`,
  which lands exactly on the 500px section threshold and so falls back to list on narrower
  viewports — is now a **documented, warned-about consequence** rather than an unhandled one.
  It must be stated plainly in the user docs, not only in the editor.

---

## H. Explicitly out of scope

Overlap lanes, time axis, now-line (time-grid's, Phase 5); paging and date-range navigation
(#185); per-person lanes (#203); `date_horizontal_alignment` and its naming harmonisation;
line-style keys for any separator; interactive expand on the `+N more` pill.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#h-explicitly-out-of-scope)
