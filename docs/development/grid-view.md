# Grid View — Working Spec (v5.0.0)

**This file is working state and is deleted before the PR into `dev`.** It is excluded
from the site build (`srcExclude: ['development/**']`), so nothing here is published.

Written against `dev` @ `0ed12d69` (v4.2.0).

---

## What this is

A third view — days side by side with a **time axis**, events positioned and sized by
clock time. It closes `epic:time-grid`: #206 (size by duration), #300 (hour grid, real
start times, seven columns), #325 (a now line on a day view), and answers #339.

### Not in scope

Two features in the #339 proposal belong to other epics and must not arrive inside the
grid renderer, because both are view-independent and the list view wants them too:

| Feature                                    | Epic                 | Issue |
| ------------------------------------------ | -------------------- | ----- |
| Day and window paging, Today button, swipe | `epic:navigation`    | #185  |
| Tap an event for a detail popup            | `epic:event-details` | #241  |

A third is deliberately inherited rather than solved: **cross-timezone display**, where
an event authored in Home Assistant's timezone is read in the browser's. Neither
surveyed card solves it. It is not a regression and not a v5 goal.

---

## Prior art, and why neither branch is merged

- **`lenaxia/feature/time-grid-week-view`** (proposed as #339). Forked at `b69a30b0`;
  `dev` is **805 commits** ahead, predating the whole v4 view abstraction the grid must
  now sit inside. The branch it was previously adopted onto no longer exists on `origin`
  or in any reflog, so the renames and fixes recorded in the #339 thread are re-derived
  here rather than recovered.
- **`Uko/multiday-calendar-card`** v0.1.2, MIT. Surveyed for comparison only.

They are near-exact complements — each solved one half of the geometry correctly, which
is why the design below reads as a merge of the two rather than a port of either.

| Concern                                     | Better answer | Because                                                      |
| ------------------------------------------- | ------------- | ------------------------------------------------------------ |
| Percentage vertical geometry                | Uko           | Fixed height compresses for free; no px math in `rendering/` |
| Wall-clock minute placement                 | lenaxia       | Uko's elapsed-ms form is an hour wrong on DST days           |
| An overlap cap rather than unbounded lanes  | Uko           | lenaxia has no cap; seven overlaps give seven slivers        |
| Spanning all-day banner, continuation marks | lenaxia       | Uko's per-day chips never visually join                      |
| `"HH:mm"` band bounds                       | Uko           | Minute precision at the same cost as integer hours           |
| One grid, shared column template            | both          | The structural fix for axis/header misalignment              |

### Attribution

**`NOTICE` gets one new entry, for @lenaxia.** Their work was written against this
codebase and offered upstream as a contribution in #339, which is a different
relationship from a card we read for comparison. Credit them there, on the feature docs
page, and in the release notes.

**Nothing is owed to `Uko/multiday-calendar-card`, and no entry is added for it.** MIT
obliges attribution when substantial portions of the _code_ are copied; none are. Every
function here is written from scratch against our own types and conventions, and what
was taken is the shape of an answer — percentages rather than pixels, a cap rather than
unbounded lanes — which is not copyrightable subject matter in any practical sense.

Do not copy either project's prose. Design-doc text is protected far more strongly than
code structure; restate every decision in our own words.

---

## Decisions

Recorded here because each was a genuine fork in the road.

**1. `view: grid`.** Reads consistently beside `list` and `column`; a month view (#239)
would be `view: month`, so there is no collision. Editor label: "Time Grid".

**2. Percentage geometry, not pixels-per-minute.** Nothing in `utils/grid.ts` knows the
band's height on screen. Three consequences: `height_mode: fixed` compresses the grid
with no arithmetic; there is no pixel scale for renderer, host and now-line to disagree
about once card-mod overrides it; and configured lengths stay CSS strings, which
`src/rendering/` is lint-forbidden from turning into numbers.

A minimum block height therefore belongs in CSS, where `min-height` beats a percentage
`height` at layout and composes with the real pixel height. This removes lenaxia's
`time_grid_event_min_height_px` and the re-clamp it needed.

**3. Wall-clock time math.** `getHours() * 60 + getMinutes()`, never an elapsed-ms
delta. The two agree 363 days a year; a spring-forward day has 23 hours of elapsed time,
so the delta form draws a 14:00 meeting at 13:00. Pinned by
`tests/grid-geometry.dst.test.ts`, which discovers transition days at run time so it is
meaningful in every zone. `FormatUtils.getCalendarDayDiff` is already DST-safe and is
reused rather than reimplemented.

**4. Narrow cards become a one-column day view, not a list.** Column view defaults
`min_days_fallback: list` because a cramped column is unreadable. A one-column grid is
not cramped — it is exactly the day view issue 325 asked for. So `time_grid.min_days_to_show`
defaults to `1` and grid joins `VIEWS_WITH_WIDTH_FALLBACK`, inheriting the existing
hysteresis-backed fit resolver unchanged.

**5. Generalize the override-block machinery rather than duplicating it.** #239 makes a
fourth view likely. The compile-time partition assertions in `view.ts` must be
parallelized per view — they are the only thing covering a key that is accepted,
validated, stored and then silently ignored.

**6. Land the renderer behind an undocumented `view: grid`** before the editor exists,
so it can be dogfooded through the `-dev` build.

---

## The hazard

**`events.ts:splitMultiDayEvent` rewrites the middle days of a timed event as
`start: { date }`.** That is right for a list and wrong for a grid: the middle day of a
three-day conference then reads as all-day to everything downstream and lands in the
**all-day band** instead of drawing as a full-height block in its own column. The event
silently changes class.

AGENTS.md § _The card holds three disagreeing answers to "is this multi-day?"_ documents
this; lenaxia hit it independently and wrote a separate splitter to escape it.

The grid never runs the upstream splitter. `utils/grid.ts:splitTimedEventByDay` splits
at local day boundaries keeping `dateTime` on every segment, and drops zero-length
segments.

### `split_multiday_events` is inert in grid view

The option asks a question the grid has already answered, in both directions:

- An **all-day** multi-day event sits in the all-day band and spans its days by width.
  It is one banner either way; there is no per-day row for splitting to produce.
- A **timed** multi-day event is drawn by the time body as one block per day column,
  because that is what placing an event by clock time means. It is already per-day
  without anyone asking for it.

So the key changes nothing a user can see. It belongs in `VIEW_SCOPE` as affecting
`list` and `column` only — the editor then annotates it as inert and `check:docs` keeps
the claim honest. The per-entity half already scopes to `list` in `ENTITY_VIEW_SCOPE`
and needs no change.

🚨 **Inert, not defaulted.** An earlier draft had grid set `split_multiday_events: false`
through `DEFAULT_OVERRIDES_BY_VIEW`. That is worse in a way that is easy to miss: a
default in that map is overridable from the `time_grid:` block, so
`time_grid: { split_multiday_events: true }` would switch the upstream splitter back on and
reintroduce the hazard above — a config the editor would offer without complaint.
Scoping the key out of the view instead makes the editor and docs label it inert. It does
not enforce runtime behavior; the runtime safety comes from `multidaySplitPolicy('grid')`
returning `never`, so the shared list splitter is not called.

`multidaySplitPolicy` is therefore three-way — `inherit` for list, `force` for column,
`never` for grid — rather than a boolean. The previous `view === 'column'` answer handed
grid the _list_ behavior. Almost right, and therefore dangerous.

---

## Config surface

Grid-specific options live in a `time_grid:` block, matching the v4 `column:` pattern.

| Key                                 | Type                   | Default              |
| ----------------------------------- | ---------------------- | -------------------- |
| `time_grid.start_time`              | `"HH:mm"`              | `"07:00"`            |
| `time_grid.end_time`                | `"HH:mm"` or `"24:00"` | `"22:00"`            |
| `time_grid.slot_minutes`            | `15\|20\|30\|60`       | `30`                 |
| `time_grid.hour_height`             | CSS length             | `"48px"`             |
| `time_grid.show_now_line`           | boolean                | `true`               |
| `time_grid.now_line_color`          | CSS color              | `var(--error-color)` |
| `time_grid.max_simultaneous_events` | int at least 1         | `3`                  |
| `time_grid.min_day_width`           | number (px)            | `100`                |
| `time_grid.min_days_to_show`        | int                    | `1`                  |
| `time_grid.min_days_fallback`       | `list\|cramp`          | `list`               |
| `time_grid.allday_band_max_rows`    | int                    | `3`                  |
| `time_grid.axis_width`              | CSS length             | `"3.5em"`            |
| `time_grid.show_axis_labels`        | boolean                | `true`               |

Four of lenaxia's eleven keys are absorbed by machinery we already have:
`time_grid_allday_bg_opacity` becomes `DEFAULT_OVERRIDES_BY_VIEW` (grid sets
`event_background_opacity: 20`), `time_grid_event_min_height_px` becomes CSS
`min-height`, both breakpoint keys collapse into one `min_day_width`, and
`time_grid_navigation_days` belongs to #185.

Inert in grid view, so `VIEW_SCOPE` must say so: `compact_*` (already list-only),
`show_empty_days` / `empty_day_text` (a time axis is never empty), `event_spacing`
(spacing is time, not margin), `show_description` (no room in a block), and
`split_multiday_events` (the grid answers that question by construction — see above).

---

## Phases

Integration branch `feature/grid-view-v5`, feature branches feeding it, one PR into
`dev` — the v4 shape.

| Phase | Scope                                                    | Status   |
| ----- | -------------------------------------------------------- | -------- |
| 1     | `src/utils/grid.ts` — pure geometry, DST-tested          | **done** |
| 0     | Generalize the view abstraction                          | **done** |
| 2     | Register `grid`; `src/rendering/grid.ts` — the container | **done** |
| 4a    | Editor panel for the `time_grid:` block's own options    | **done** |
| 3     | Width fallback, now-line ticking, midnight rollover      | **done** |
| 5     | `NOTICE`, release surfaces                               |          |

Phase 1 ran first because it touches no existing code path and settles the geometry
decisions concretely. Phase 0 carries the real risk and ships nothing user-visible; if
the abstraction does not generalize cleanly, that is worth learning before any renderer
exists.

### What Phase 0 did

`VIEW_BLOCKS` — a registry keyed by view, holding each view's block key, its two key
arrays, its view-only defaults and its divergent defaults. Five functions used to
hardcode `'column'` and `config.column`: `resolveViewOption`, `resolveEffectiveConfig`,
`resolveColumnOption`, `validateView` and the override validator with its
top-level-key warning. Registering a second view meant editing all five and remembering
all five. Now it is one registry entry.

Alongside it: `OVERRIDE_BLOCK_BY_VIEW` is derived from the registry rather than written
out again; `validateView` builds its "expected" list from `VIEWS`; and the three
compile-time partition assertions became reusable helpers so a second view instantiates
them instead of copying them.

A fourth change was written and then removed: a diagnostic distinguishing "not a
recognized option" from "recognized, but it belongs to a different view's block". It is
a genuine usability win and it is **unreachable today** — with one registered block the
union of all block keys is that block's own keys, so the branch above it always fires
first. Warning strings are gated at runtime rather than compiled out, so it was ~220
bytes of dead weight on every dashboard load. It belongs with the second block, in
Phase 2.

Cost of the registry on the shipped bundles, measured against `dev` at `0ed12d69`:

| bundle                 | before  | after   | delta  |
| ---------------------- | ------- | ------- | ------ |
| `calendar-card-pro.js` | 206,064 | 206,554 | +490 B |
| `editor.js`            | 384,693 | 385,099 | +406 B |

Raw bytes rather than gzip, because raw is the figure that cannot drift with a
compression level or a Node major. The editor crossing 385 KB moved a figure documented
in `docs/guide/installation.md`, which `check:bundle` caught.

### What Phase 0 deliberately did **not** do — and why

The first attempt widened `Types.EffectiveView` to include `grid` while leaving it out
of `VIEWS`, the idea being to register the type ahead of the renderer so the machinery
had a second consumer to be tested against. Four existing gates rejected it, and they
were right:

- `tests/editor-schema.test.ts` parses `src/config/types.ts` for union literals and
  reconciles every enumerated option against the dropdown the editor builds. Widening
  the union therefore _demands_ the picker offer `grid`. **The type union is the public
  vocabulary** — that is a deliberate design property, not an oversight.
- The `VIEW_SCOPE` gates require every scoped key to be inert in at least one member of
  `VIEWS`. Scoping `split_multiday_events` out of a view that is not in `VIEWS` is a
  no-op, and the gate says so.

So there is no half-registered state for a view, by design, and the revert was the
right answer rather than a workaround. `grid` joins `Types.EffectiveView`, `VIEWS`, the
picker, the strings and the renderer **together**, in Phase 2. That also moves three
small changes out of Phase 0, which are written up above and landed with the view:
`viewCssClass` gained `grid-view`; `VIEW_SCOPE` gained its `split_multiday_events`
entry; and `multidaySplitPolicy` widened the old boolean answer into
`inherit | force | never`, because `false` collapses "inherit" and "never" into one
answer.

The registry's own artwork for the editor picker is drafted and parked here rather than
lost, since Phase 4 would otherwise redo it. Same 48×32 frame and palette as its two
siblings; reads as hour axis, three day headers, an all-day banner spanning two of
them, then blocks whose differing heights are the point of the view:

```
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
'<rect x="9" y="3" width="11" height="4" rx="1.5"/>' +
'<rect x="22" y="3" width="11" height="4" rx="1.5"/>' +
'<rect x="35" y="3" width="11" height="4" rx="1.5"/>' +
'<rect x="9" y="9" width="24" height="3" rx="1.5" opacity=".55"/>' +
'<rect x="2" y="15.5" width="5" height="1.5" rx=".75" opacity=".5"/>' +
'<rect x="2" y="21" width="5" height="1.5" rx=".75" opacity=".5"/>' +
'<rect x="2" y="26.5" width="5" height="1.5" rx=".75" opacity=".5"/>' +
'<rect x="9" y="14.5" width="11" height="6" rx="1.5" opacity=".4"/>' +
'<rect x="9" y="23" width="11" height="5" rx="1.5" opacity=".4"/>' +
'<rect x="22" y="14.5" width="11" height="13.5" rx="1.5" opacity=".4"/>' +
'<rect x="35" y="19" width="11" height="7" rx="1.5" opacity=".4"/></g></svg>'
```

### Phase 2 layout

Four rows sharing one column template, every child placed explicitly by
`gridColumn`/`gridRow` — auto-placement moves things when overlays claim a cell, which
`column.ts` already had to work around.

```
grid-template-columns: <axis_width> repeat(N, minmax(0, 1fr));

row 1  week-number band   (the week-number gutter cell)
row 2  date headers       (Leaves.renderDateContent — same call column.ts makes)
row 3  all-day band       (spanning banners, capped rows)
row 4  time body          (axis labels + absolutely positioned events)
```

Progressive disclosure by rendered height is implemented with CSS height container queries:
title once a full line can fit, a second title line above 36px, time above 40px,
location/description above 72px, and a third title line only above 96px. Once time appears
the title clamps back to one line until the 72px tier, because that is the smallest tier
where a two-line title plus full detail rows has room. The renderer keeps emitting
percentage geometry and does not learn the body's pixel height; each block is the container,
so the browser makes the pixel threshold decision inside the shadow root.
That only answers the short-block axis. Narrow columns expose a different failure: a tall
event can have enough height for time, but a wrapped title can consume the whole block and
leave the time row sliced by `overflow: hidden`. Grid therefore wraps the shared
`event-content` leaf in a grid-only flex column. The wrapper and leaf take the event box's
height, the title row is the only shrinkable part and clips/ellipsizes, and time/location
rows are fixed-height flex items so a detail row is either fully visible or absent. The
40px time threshold is deliberately higher than the original 32px sketch: a one-hour block
at `hour_height: 40px` has less than 40px of content box after padding, so showing time
there made wrapped titles and time compete for space they did not have. The 19px title
threshold is the same rule at the bottom end: a 14px minimum-height sliver cannot display
one full text row, so it stays a color block instead of slicing glyphs.

### Phase 3 notes

- Grid gets **no** `overflow-y`; `.content-container` already scrolls. Two nested scroll
  containers was a real defect on the reference branch.
- The now-line controller attaches its `visibilitychange` listener and
  `IntersectionObserver` **lazily, only in grid view** — attaching in `hostConnected`
  made list-view users pay for observers they could never use. Visibility alone is not
  enough: Home Assistant dashboard tabs stay `visible` while unrendered.
- Grid view must disable the card-level tap/hold and the ripple, or the whole card is
  one touch target and individual events cannot be reached.
- Auto-scroll to now on first render, with a latch that **resets on view change**.

---

## Verification standard

`utils/grid.ts` is pure — no Lit, no DOM, no clock reads, `now` injected — so everything
in it is directly testable. Phase 1 shipped 90 unit tests and 21 DST tests (63 across
three zones).

Mutation results, each restored afterwards, with an unmutated control:

| Mutation                                | unit        | dst         |
| --------------------------------------- | ----------- | ----------- |
| _control — no change_                   | 90 pass     | 63 pass     |
| wall clock to elapsed ms                | **90 pass** | **24 fail** |
| `segmentMinutes` midnight guard removed | 3 fail      | 6 fail      |
| lane cap 1 drops events silently        | 5 fail      | 63 pass     |
| banner zero-span guard removed          | 1 fail      | 63 pass     |
| `resolveBand` half-honours a bad bound  | 4 fail      | 63 pass     |
| placement band clamp removed            | 3 fail      | 63 pass     |
| `axisHours` labels the closing hour     | 4 fail      | 63 pass     |

The first row is the point of the `.dst.test.ts` split: the DST mutation leaves the
`unit` project **completely green**, because `TZ=UTC` has no transitions and is
structurally incapable of seeing it. Differing failure counts per mutation are what
distinguish genuine detection from a probe measuring itself.

### Phase 0: the registry

The whole existing suite — 3,456 tests — passes whether the resolvers read the registry
or the hardcoded `'column'` literal, because column is the only registered view and both
answers agree for it. The existing suite is therefore worth nothing as evidence here, and
`tests/view-block-registry.test.ts` carries all of it. Against a green 25/25 control:

| Mutation                                           | registry test | existing suite |
| -------------------------------------------------- | ------------- | -------------- |
| `resolveEffectiveConfig` reads `config.column`     | 2 fail        | **202 pass**   |
| `resolveViewOption` reads `config.column`          | 2 fail        | **202 pass**   |
| `resolveColumnOption` reads `config.column`        | 1 fail        | **202 pass**   |
| `resolveEffectiveConfig` tests `view !== 'column'` | 1 fail        | **202 pass**   |
| `resolveViewOption` tests `view !== 'column'`      | 1 fail        | **202 pass**   |

The last two only became detectable once the test **registers a second view of its own**.
With one view in the registry, "look the view up" and "compare it to `'column'`" are the
same function — no assertion can separate them, and the first version of that file could
not. That is the honest limit of testing a generalization before its second consumer
exists, and it is why the real grid view is what will finally exercise this machinery.

Two findings came out of writing it. `min_days_to_show` is a view-only key with **no**
entry in `COLUMN_DEFAULTS` — correctly, since its default derives from `days_to_show`
rather than being constant — so the consistency check reconciles that exception in both
directions rather than skipping it. And `resolveColumnOption` was a sixth hardcoded
`config.column` site the original survey missed; it now goes through the registry too.

## What Phase 2 shipped, and what it did not

`view: grid` renders. The picker offers it, the `time_grid:` block is registered, the four-row
container is built, the stylesheet is written, and `docs/features/grid-view.md` documents
the grid-only options.

**In the editor as of Phase 4a.** A **Time Axis** group in the Layout panel carries the
axis options, ordered by what each decides rather than by declaration order: the slice of the day, then
how it is ruled and how tall, then the label gutter, then the overlay and the all-day row
budget, and last the overlap budget. `start_time` and `end_time` share a row because they
are a pair — a bad half resets both, so reading them apart misleads.

**After the live Home Assistant pass.** `show_allday_band` was removed before release. It
only hid all-day events, which `event_type: timed` already expresses at either card or
per-calendar scope, so keeping both would make the API larger without adding a new state.
The band now renders whenever all-day events survive filtering and costs no height when
none do.

Grid separators now use the same existing day/week/month separator options as list and
column view. Grid diverges from their defaults with `day_separator_width: 1px`, because a
time grid with no vertical day rules makes the shared axis read detached from the columns.
The renderer duplicates column's boundary resolution locally on purpose: month/week/day
precedence is shared, but the row-span decision belongs beside grid's four-row template.
All separator families are confined to row 4, the time body. A rule through row 3 visibly
cuts a multi-day all-day banner into pieces; a rule through rows 1 or 2 rules labels rather
than the clock surface. Week and month rules do not get a wider span, because they would cut
the same banners at a larger boundary.

`tests/editor-schema.test.ts` reconciles `TIME_GRID_ONLY_KEYS` against the built schema, the
same way it already did for column's. Without that the grid block would sit in exactly the
position that test was written to fix: a container whose members nothing checks, where
deleting a node leaves every gate green.

**Responsive as of Phase 3.** Grid is now in `VIEWS_WITH_WIDTH_FALLBACK`, and the width
machinery is view-aware instead of reading `config.column` directly. The same hysteresis
resolver that column view uses now sheds grid day columns before falling back to list or
cramping, but the defaults differ deliberately: `time_grid.min_day_width` is `100`, lower than
column's `140`, because a time-grid column carries positioned blocks rather than a text
list. At default spacing, three grid days need 352px before hysteresis, or 368px when
entering grid view from the list fallback.

`time_grid.min_days_to_show` defaults to `1`, not to `days_to_show`. A one-column grid is a
useful day view with a now line — exactly the shape issue 325 asked for — so shedding down
to one column is the correct narrow-card behavior. Column view keeps its dynamic default
because a single cramped text column is not what a multi-day column card requested.

The editor reuses the same density group for grid, with `time_grid.*` labels and helper text.
The day-header separator controls stay column-only; adding grid to the width-fallback set
would otherwise have leaked controls that grid does not read.

### Keeping the editor honest with three views

One exceptions row per panel still scales. A card is edited in one requested view at a
time, and `SchemaCtx.view` is already known when the panel is built, so the row should mean
"exceptions for this view" rather than "every override block on the card." The editor had
one leak from the two-view era: `declaredKeys` unioned `column:` and `time_grid:`, so a stored
column exception appeared while editing a grid card. That is now scoped to `ctx.view`;
`tests/editor-schema.test.ts` covers both directions. A fourth `month:` block should join
`VIEW_BLOCKS`, not add another editor branch.

Do not multiply strings by view unless the words actually differ. `check:i18n` reconciles
every schema key against `strings.ts`, so `column.height`, `time_grid.height`, and a future
`month.height` are real cost: at four views, every shared override label would have four
copies in English and every editor translation. The cheap rule is view-neutral chassis
copy — **View Exceptions**, "this view" — plus per-view strings only for view-only groups
whose helper text teaches different behavior, like grid's time axis or column's density.
`check:i18n` catches missing keys, but it cannot catch copy that is true for column and
false for grid; that stays a review responsibility.

View-only groups can stay in the shared Layout panel while they answer layout questions for
the current view and are gated by `ctx.view`. Column density and grid time axis both meet
that test: they appear where the user already picked the layout, and disappear outside the
view that reads them. A future month-only navigation or calendar-shape group should start
there too. Move a group only if it stops being a layout concern, not because another view
exists. The schema reconciliation covers whether the controls exist; no gate judges whether
the panel is visually too crowded, so that remains a browser-review item.

Resolved defaults must be display data, not stored YAML. `columnFormBlock` and
`timeGridFormBlock` seed the form from the view resolvers, and `toStoredConfig` strips those
values if the user opens the editor and changes nothing. The round-trip tests cover that
opposite failure mode; the exception-form tests cover divergent defaults like
`time_grid.show_empty_days`.

**The now line ticks as of Phase 3a.** A one-minute interval repaints it, reconciled from
`updated()` rather than acquired in `connectedCallback` — the view can change after
connection, so a timer taken once would either never start or never stop. It runs only
where there is a line to move: not in list or column view, and not when `show_now_line` is
off, so a card that cannot display one pays nothing.

Midnight is handled there too, and is the reason the tick is not simply `requestUpdate()`.
At a day rollover every header is a day stale, "today" has moved to a different column, and
a repaint would draw the line at the top of a column that is no longer today. Only
refetching fixes that, so the tick compares the local day key and refetches when it moves.

`IntersectionObserver` was **not** added. `visibilitychange` covers the hidden-tab case,
and the observer exists in the reference implementation to catch Home Assistant dashboard
tabs that stay `visible` while unrendered — a real problem for that branch's per-second
work, and a repaint a minute is a much smaller thing to be wrong about. Worth adding if it
ever shows up in a profile; not worth the lifecycle surface on spec.

### Four things registering the view found

Each was invisible before a second view existed, which is the argument for building Phase
0 before Phase 2 rather than after.

1. **`TIME_GRID_OVERRIDE_KEYS` must alias, not filter.** A `.filter()` types as
   `ReadonlyArray<union>` rather than a literal tuple, which made the partition assertion
   tautological — every key read as classified while the filtered-out ones were dropped at
   runtime. That is exactly the accepted-then-silently-ignored override the assertion
   exists to prevent, reintroduced by the thing meant to check for it.
2. **The editor emitted column's groups for any view with a block.** A grid card was
   offered `min_day_width`, `min_days_to_show`, `min_days_fallback`, `day_header_gap` and
   both day-header separator keys — six controls its block does not accept, each of which
   would have been stored and ignored. Both groups are now gated on the view owning the
   keys rather than on it merely having a block.
3. **The editor-schema union scan could not see an `extends` clause.** It matched
   `export interface X {` with nothing between, so splitting `ColumnOverrides` onto a
   shared base silently stopped discovering its enumerated options — and a silent
   non-match reads as "that interface declares none", not as a failure.
4. **`check-i18n` merged the two scope tables.** It spread `ENTITY_VIEW_SCOPE` over
   `VIEW_SCOPE`, so a key in both lost its card-level scope and orphaned that string.
   `entityScopeFor` is `??`, not a merge: the two are allowed to differ, and
   `split_multiday_events` now does. The gate reconciles both separately; deleting the
   card-level note was invisible before and errors now.

### Two harness findings, written into `tests/grid-dom.test.ts`

The test must resolve the effective config as the host does. Skipping
`resolveEffectiveConfig` renders grid DOM without the view's divergent defaults, so every
block comes out untinted while the real card shows them tinted — a silent disagreement
between the test and the product.

And the background assertion must **not** expect `rgba(`. `convertToRGBA` resolves a hex
by reading `getComputedStyle().color` off a temporary element, which happy-dom does not
implement, so the hex returns unchanged under test where a browser gives
`rgba(3, 169, 244, 0.2)`. Tightening that assertion fails for a reason with nothing to do
with this view.

### Cost

Raw bytes against `dev` at `0ed12d69`:

| bundle                 | before  | after   | delta    |
| ---------------------- | ------- | ------- | -------- |
| `calendar-card-pro.js` | 206,064 | 220,979 | +14.9 KB |
| `editor.js`            | 384,693 | 390,567 | +5.9 KB  |

The eager path pays for the whole feature, which is the trade a third view makes. The
reference implementation in #339 reported roughly the same figure against a larger bundle.
