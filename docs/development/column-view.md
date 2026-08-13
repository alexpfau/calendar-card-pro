# Column View

Column view is the v4 agenda layout for showing days side by side as columns instead of as a
vertical list. This file is the current-state implementation specification; rationale,
rejected alternatives, stale plan text and source-verification history live in
[column-view-rationale.md](./column-view-rationale.md).

**Target release:** v4.0.0. **Current branch:** `feature/column-view-v4`.

| Phase | What it covers                         | State                                    |
| ----- | -------------------------------------- | ---------------------------------------- |
| 0     | DOM golden gate, i18n integrity script | Shipped in 3.x (PR #390)                 |
| 1     | Shared leaf renderers (`leaves.ts`)    | Shipped in 3.x                           |
| 2     | Presentation models                    | Shipped in 3.x                           |
| 2b    | Cache correctness                      | Shipped in 3.x                           |
| 4     | Column view + `ViewAdapter`            | In progress on `feature/column-view-v4`  |
| 5     | Grid view / time grid                  | Not started; the name `grid` is reserved |

Open work that is not owned by a section here is indexed in
[v4-backlog.md](./v4-backlog.md). Read that before starting a stage.

::: warning Before Editing A Template
The DOM gate is whitespace-sensitive in a way that is not obvious and has a destructive
failure mode. See [§F.8](#f-constraints-that-bind-implementation).
:::

---

## A. Decisions Ledger

| #   | Decision                  | Current rule                                                                                                                                      |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | View names                | `view: 'list' \| 'column'`; `grid` is reserved for Phase 5 and not accepted until built.                                                          |
| 2   | `navigation_days`         | Deleted and folded into `days_to_show`; not renamed.                                                                                              |
| 3   | MVP scope                 | Column view excludes overlap lanes, time axis and now-line. Those belong to `grid`.                                                               |
| 4   | Column header             | Date content appears at the top of each column, not as a left cell.                                                                               |
| 5   | Header rule               | `column.day_header_separator_width` / `_color` are configurable and default off.                                                                  |
| 6   | Between-day chrome        | Day/week/month separators rotate into vertical gutter rules; within-event chrome is unchanged.                                                    |
| 7   | `date_vertical_alignment` | List-only; ignored in column view. The `align-self` proof is in A3-A.                                                                             |
| 8   | List safety               | List keeps its `<table>` and `rowspan`; column uses its own grid container over shared leaves.                                                    |
| 9   | Attribution               | lenaxia's frozen #339 commits stay as ancestors; never squash them out.                                                                           |
| 10  | Release                   | Column view targets v4.0.0.                                                                                                                       |
| 11  | Responsive behavior       | Width reduces columns only within the explicit density framework; below the floor the card falls back to list or cramps, per `min_days_fallback`. |
| 12  | List DOM gate             | Phase 1 and later shared-template work must keep the list DOM golden gate green.                                                                  |
| 13  | Column floor              | `column.min_day_width` defaults to `140` px and is public configuration.                                                                          |
| 14  | Divergent defaults        | In column view, `show_empty_days` and `split_multiday_events` default to `true` unless overridden inside `column:`.                               |

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#a-decisions-ledger)

---

## A3. Current Rulings

### A3-A. "No Impact On List View" Means No Visible Change, Not No Code Change

List view may share extracted leaves, but its container stays the existing table. Column view
uses a separate grid day container that consumes the same leaf renderers. This keeps list users
behind the hard DOM gate and prevents grid/list leaf drift.

**The concrete proof that unification was riskier than v3 priced it.** v3 claimed
`date_vertical_alignment`'s `vertical-align` maps to `align-self`, "equivalent". **It does
not,** and the failure is invisible to a template diff:

- The `.date-column` rule in `styles.ts` sets `position: relative`, reinforced by an inline
  `style="position: relative;"` on the `<td>` itself — the same `<td>` that carries the
  `rowspan` attribute in `render.ts`. `.today-indicator-container:not(.inline)` is
  `position: absolute; height: 100%`. Under that `rowspan` the `100%` resolves against the
  **full stacked height of the day**, so with the default `today_indicator_position: '15% 50%'`
  the indicator centres over the whole day block.
- In flex, `align-self: center` overrides `align-items: stretch` and **shrinks the item to
  content height** — collapsing `height: 100%` to roughly one line of date text. The indicator
  would snap from the full day to the ~50px date band.
- The correct mapping is two-part: keep the date column `align-self: stretch` and move its
  _content_ with `justify-content` on an inner flex column. v3's one-line mapping was wrong.

Blast radius is bounded (`today_indicator` defaults `false` in `config.ts`), so this would
have hit only opted-in users on multi-event days — which is precisely the kind of defect that
survives a screenshot pass. It is retained here as the worked example of why the list
container is not worth touching. **[v5] This analysis is load-bearing and must survive any
future restructuring of this document intact:** it is the only worked proof in the plan that a
human screenshot pass does not catch this class of bug, and the `false` default is exactly why
it would go unnoticed.

The same `align-self` failure applies to CSS grid: `align-items: stretch` is the default there
too, and `align-self: center` shrinks the item to content height exactly as it does in flex.
Column headers therefore move date content inside their own header wrapper instead of reusing
or remapping the list date cell.

### A3-B. Divergent Defaults Replace The `show_empty_days` Sentinel

`show_empty_days` remains `boolean`. Column view does not use a `null` / automatic sentinel.
Instead, the general per-view mechanism applies:

- `COLUMN_DEFAULT_OVERRIDES` gives column view `show_empty_days: true` and
  `split_multiday_events: true`.
- `COLUMN_OVERRIDE_KEYS` makes both values reachable through `column:`.
- Absent `column:` values do **not** inherit the top-level value for those two keys; the column
  default stands until the block overrides it.

```yaml
view: column
show_empty_days: false # list view value
column:
  show_empty_days: true # column view value
```

The design reason is unchanged: a list reads fine with blank days omitted, but a column grid
with blank columns omitted stops corresponding to consecutive days. Likewise, a column is a
claim about one day, so multi-day events default to split segments in column view.

### A3-C. Narrow Widths, Density & Fallback

Column view resolves a `{ view, columns }` fit rather than a view alone. The card renders as
many columns as fit, never more than `days_to_show` and never fewer than
`column.min_days_to_show`. Below that floor, `column.min_days_fallback` chooses between list
fallback and holding the floor with narrower columns.

Column-only density keys:

| Key                 | Type                | Default                                | Role                                               |
| ------------------- | ------------------- | -------------------------------------- | -------------------------------------------------- |
| `min_day_width`     | number, pixels      | `140`                                  | Width one column needs before another is added     |
| `min_days_to_show`  | number              | `days_to_show`                         | Floor below which the card must not reduce columns |
| `min_days_fallback` | `'list' \| 'cramp'` | What to do when the floor will not fit |

The defaults collapse to the old all-or-list behavior: because `min_days_to_show` defaults to
`days_to_show`, the staircase has one step unless the user lowers the floor deliberately.

Every threshold uses:

```text
min_day_width × columns + card padding + (columns − 1) × gutter
```

The gutter is `column.day_spacing` when present, otherwise the top-level `day_spacing`. The
fit is solved in closed form, then protected by hysteresis; the half-band is clamped so adjacent
column-count boundaries cannot overlap.

### A3-D. Compact Mode Is List-Only In Column View

The compact family is inert in column view: `compact_events_to_show`, per-entity
`compact_events_to_show`, `compact_days_to_show`, `compact_events_complete_days`, and the
`action: 'expand'` gesture that drives them. Column density is controlled by
`min_days_to_show` / `min_days_fallback`, not by compact caps.

### A3-E. Header & Separator Defaults

Column headers use:

```yaml
column:
  day_header_gap: 8px
  day_header_separator_width: 0px
  day_header_separator_color: var(--divider-color)
```

The header rule defaults off after live review. `day_header_gap` owns the space between the
header and events, so turning the rule on or off does not collapse spacing.

Day, week and month separators keep their existing keys but rotate into full-height vertical
rules in the gutter. Precedence is `month > week > day`, gated only by each separator's own
width. `show_week_numbers` never suppresses column day separators.

### A3-F. Density Key Names

The public density keys are `min_day_width`, `min_days_to_show`, and `min_days_fallback`.
Earlier names (`min_column_width_px`, `min_width_fallback`) never shipped and have no migration.

### A3-H. The View Vocabulary Is `list` / `column` / `grid`

`list` and `column` ship first. `grid` is the reserved Phase 5 name, replacing the frozen branch's
`time-grid` wording. The code should reject `grid` until that view exists; the ruling reserves
the public vocabulary before user YAML makes later renames expensive.

---

## B. Config Surface

### B1. `column:` Block Semantics

A nested `column:` block carries per-view values. Keys absent from it inherit the top-level
value, except keys in `COLUMN_DEFAULT_OVERRIDES`, whose column default stands until the block
overrides it.

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
days_to_show: 7
show_location: true
column:
  show_location: false
  day_header_gap: 4px
```

Only render-time and grouping-time keys may appear in `column:`. Fetch-time keys are forbidden
because crossing a responsive width boundary must never call Home Assistant again.

### B2. Override-Eligible Keys

`COLUMN_OVERRIDE_KEYS` contains top-level options whose value may genuinely differ in column
view. It includes display density, spacing, date/header colors, event content display, progress
bar sizing, week-number styling, and day/week/month separator width and color.

`COLUMN_ONLY_KEYS` contains options with no list-view counterpart: `day_header_gap`,
`day_header_separator_width`, `day_header_separator_color`, `min_day_width`,
`min_days_to_show`, and `min_days_fallback`.

### B3. Fetch-Time Keys

These keys must not become view overrides: `entities`, `start_date`, `days_to_show`,
`first_day_of_week`, `show_past_events`, `filter_duplicates`, `weather`, `refresh_interval`,
and `refresh_on_navigate`.

Two edge cases are load-bearing. `first_day_of_week` can move the fetch window, and
`weather.position` determines which forecast subscriptions are started.

### B4. View-Scoped Options

The editor must annotate, not hide, options that apply only to list layout. A column card can
render as list below its threshold, so hiding a list-only control would remove the control for
the layout that same card may use on a phone.

| Option                             | Scope     |
| ---------------------------------- | --------- |
| `date_vertical_alignment`          | list only |
| `today_indicator_position`         | list only |
| `compact_events_to_show`           | list only |
| `compact_days_to_show`             | list only |
| `compact_events_complete_days`     | list only |
| Per-entity `split_multiday_events` | list only |

Card-level `split_multiday_events` is not list-only: `column.split_multiday_events: false` is
the explicit escape hatch from the divergent column default.

> Rationale and full audit: [column-view-rationale.md](./column-view-rationale.md#d6-per-view-config-overrides-new-v8)

---

## D. Column View Specification

### D1. Element Mapping

| Element                   | List                        | Column                              | Keys                                 |
| ------------------------- | --------------------------- | ----------------------------------- | ------------------------------------ |
| Per-event accent          | vertical, left of event     | unchanged                           | `vertical_line_width`                |
| Day separator             | horizontal between days     | vertical gutter rule                | `day_separator_*`                    |
| Week separator            | horizontal at boundary      | vertical gutter rule                | `week_separator_*`                   |
| Month separator           | horizontal at boundary      | vertical gutter rule                | `month_separator_*`                  |
| Header rule               | none                        | horizontal rule under header        | `day_header_separator_*`             |
| Week number badge         | full-width row              | per-column header row               | `show_week_numbers`, `week_number_*` |
| Day spacing               | vertical gap                | column gutter                       | `day_spacing`                        |
| Event spacing             | vertical gap                | unchanged                           | `event_spacing`                      |
| Today indicator           | absolute in date cell       | leading inline item on weekday row  | `today_indicator*`, not `_position`  |
| Weekday/day/month         | stack in date cell          | header grid                         | `weekday_*`, `day_*`, `month_*`      |
| Weather                   | date column                 | header badge, truncated not dropped | existing weather keys                |
| Event content             | shared leaves               | shared leaves                       | all event-content keys               |
| `date_vertical_alignment` | positions date in tall cell | ignored                             | —                                    |

### D2. Header

The header calls `Leaves.renderDateContent` from a column-specific wrapper. The weekday, day and
month nodes, color precedence and translations stay shared. The column wrapper, not `.date-column`
or dead `.date-content` CSS, owns the axis.

Weather is rendered by the shared weather leaf and positioned by the header. It truncates when
space is tight; it is not silently dropped. The default `min_day_width: 140` depends on that
truncate-not-drop rule.

When week numbers are enabled, every column reserves the week-number row. Columns that do not
start a week render the pill with `visibility: hidden`, reserving exact height without assistive
technology noise.

The today indicator is an inline leading item on the weekday row. `today_indicator`,
`today_indicator_size`, and `today_indicator_color` apply; `today_indicator_position` is list-only.

### D3. Height & Overflow

The column container is CSS grid with tracks `repeat(N, minmax(0, 1fr))`. `minmax(0, 1fr)` is
load-bearing: a bare `1fr` refuses to shrink below long content and can overflow the card.

Uncapped column view is usually no taller than list view because height is bounded by the busiest
day rather than by the sum of all days. `max_height` inherits unchanged and scrolls the content
container rather than clipping it.

### D4. Multi-Day Events

Column view defaults `split_multiday_events` to `true` because each column represents one day.
Splitting happens at render/grouping time against the already-fetched event array, so width
transitions never refetch. Per-entity `split_multiday_events: false` is ignored in column view;
`column.split_multiday_events: false` is the explicit card-level override.

### D5. Separators

Column separators are overlaid grid items in the cell after the boundary they mark, offset into
the gutter. They stretch to the tallest column and do not alter track sizing. All three kinds are
full-height, and only one rule is emitted per boundary.

The list view's `SEPARATOR_SPACING` multipliers do not carry over. Column gutters are uniform;
variable-width boundary gutters would require explicit spacer tracks and are out of MVP.

### D6. Density Framework

The width one column costs is `min_day_width + gutter`, plus the fixed card padding term in the
threshold formula. `resolveColumnFit` returns both effective view and column count. A column-count
change without a view change still requires a render.

Before first measurement, column view renders optimistically as column with `days_to_show` columns.
A measured width then settles it; the optimistic pre-measurement answer must not seed hysteresis.

### D7. Release Blockers & Follow-Ups

| Item                                 | Requirement                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `column.entities[]` overrides        | Rule and implement, or document as unsupported.                                   |
| Per-column compact budget            | Rule in and implement, or document as not applicable.                             |
| Week/month separator override design | Rule in, or document as not applicable.                                           |
| View-scoped editor notes             | Ship annotations from the same scope table the docs use.                          |
| Too-narrow affordance                | Keep the layout-band warning/table honest before changing A3-G defaults.          |
| Progress bar coverage                | Add a test that enables it; default-config tests cannot see it.                   |
| Bad `column:` key feedback           | Editor should prevent invalid keys; YAML-only warnings stay silent in production. |

### D8. Editor Requirements

The schema-driven editor owns the user-facing `column:` surface. It must:

1. Preserve dormant keys when switching views, except keys removed in v3.0.0.
2. Present per-view exceptions without seeding unused rows for divergent defaults.
3. Annotate options whose scope excludes the selected view instead of hiding them.
4. Drive any scope notes from exported classification tables rather than duplicating prose.
5. Render the user's selected view in preview where possible, and explain width-driven outcomes
   with the same band arithmetic the runtime uses.

### D9. Progress Bar & Weather

The progress bar uses shared leaves. In column view it occupies its own row; `progress_bar_width`
may be overridden in `column:` because the useful width differs from list view.

Per-event weather remains event content, not header chrome. Any column-specific weather behavior
must stay inside the column render branch or shared leaves without changing list output.

---

## E. Cross-Cutting Acceptance Criteria

1. Existing list-view defaults render byte-identically across Phase 1-style shared-template work.
2. `view: column` is additive; default configuration remains `view: list`.
3. Crossing any width boundary with a warm cache performs zero Home Assistant `callApi` calls.
4. Every key that is forced, divergent, inert, not implemented, or view-scoped is documented and
   surfaced in the editor when the editor can show it.
5. Column width decisions are honest: defaults do not silently drop columns, and user-enabled
   density reduction is explainable before it surprises them.
6. Rationale links remain valid enough for citation; section identifiers such as A3-A, D6 and F.8
   are preserved.

---

## F. Constraints That Bind Implementation

1. **Build sentinel.** `rollup.config.mjs` tests `NODE_ENV === 'prod'`, not `'production'`.
2. **Validation gates.** For documentation changes run `npm run check:docs` and
   `npm run docs:build`. Code changes also run the relevant type, lint, test, i18n, build and
   bundle gates described in `AGENTS.md`.
3. **Config migration is editor-only.** Console deprecation notices do not migrate YAML-only users;
   renaming shipped keys is a real break.
4. **Attribution.** lenaxia's frozen commits remain ancestors.
5. **Branch provenance.** Treat historical `src/` line citations as intent, not location. Re-derive
   from current code before using them.
6. **No fetch on responsive transitions.** Width changes may regroup or re-render but must not
   fetch new event data.
7. **`hide_when_empty` and grouping.** Counts and rendered columns must use the same resolved
   `show_empty_days` semantics, including `column.show_empty_days: false`.
8. **🚨 The whitespace trap — binds every template edit, not just extractions. [v19]**
   The DOM gate's serializer normalises whitespace **between tags only** (`/>\s+</g` → `>\n<`).
   Whitespace **adjacent to a text node survives verbatim into the snapshot**, so the literal
   source indentation of an event title is part of the oracle. The rule: **preserve the original
   absolute indentation verbatim inside every moved template, even when it looks wrong at the new
   nesting depth.** If a snapshot diff appears, it is a whitespace error — fix the indentation.
   **Never run `vitest -u`** to make it go away; that launders the change past review, and the
   gate's whole value is that it is the one artefact the refactorer does not get to edit.
   Verified by running it: **prettier _does_ reformat inside `html` tagged templates** and will
   put deliberate whitespace straight back. Deliberate whitespace needs `// prettier-ignore`.
   To prove a snapshot diff is whitespace-only, collapse only what the serializer already
   normalises: `norm = (s) => s.replace(/>\s+</g, '><')`.

> Rationale and superseded alternatives: [column-view-rationale.md](./column-view-rationale.md#f-constraints-that-bind-implementation)

---

## H. Explicitly Out Of Scope

Overlap lanes, time axis, now-line, paging and date-range navigation, per-person lanes,
`date_horizontal_alignment`, line-style keys for separators, and interactive expand on a `+N more`
pill are out of column-view MVP.
