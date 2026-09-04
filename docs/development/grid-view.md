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
- **`Uko/multiday-calendar-card`** v0.1.2, MIT.

They are near-exact complements — each solved one half of the geometry correctly.

| Concern                                     | Taken from | Because                                                      |
| ------------------------------------------- | ---------- | ------------------------------------------------------------ |
| Percentage vertical geometry                | Uko        | Fixed height compresses for free; no px math in `rendering/` |
| Wall-clock minute placement                 | lenaxia    | Uko's elapsed-ms form is an hour wrong on DST days           |
| Overlap cap with a `+N more` block          | Uko        | lenaxia has no cap; seven overlaps give seven slivers        |
| Spanning all-day banner, continuation marks | lenaxia    | Uko's per-day chips never visually join                      |
| `"HH:mm"` band bounds                       | Uko        | Minute precision at the same cost as integer hours           |
| One grid, shared column template            | both       | The structural fix for axis/header misalignment              |

Attribution goes in `NOTICE` (entries 4 and 5), the feature docs page and the release
notes. Restate design decisions in our own words — do not copy either project's prose.

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
not cramped — it is exactly the day view #325 asked for. So `grid.min_days_to_show`
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

Two halves to the fix:

1. Grid defaults `split_multiday_events: false` via `DEFAULT_OVERRIDES_BY_VIEW`, so
   `groupEventsByDay` hands over whole events.
2. `utils/grid.ts:splitTimedEventByDay` splits at local day boundaries keeping
   `dateTime` on every segment, and drops zero-length segments.

`viewForcesMultidaySplit` becomes three-way: list honours the per-entity setting, column
forces the split on, grid forces it off. It currently returns `view === 'column'`, which
would hand grid the _list_ behavior — almost right, and therefore dangerous.

---

## Config surface

Grid-specific options live in a `grid:` block, matching the v4 `column:` pattern.

| Key                            | Type                   | Default              |
| ------------------------------ | ---------------------- | -------------------- |
| `grid.start_time`              | `"HH:mm"`              | `"07:00"`            |
| `grid.end_time`                | `"HH:mm"` or `"24:00"` | `"22:00"`            |
| `grid.slot_minutes`            | `15\|20\|30\|60`       | `30`                 |
| `grid.hour_height`             | CSS length             | `"48px"`             |
| `grid.show_now_line`           | boolean                | `true`               |
| `grid.now_line_color`          | CSS color              | `var(--error-color)` |
| `grid.max_simultaneous_events` | int at least 1         | `3`                  |
| `grid.min_day_width`           | number (px)            | `100`                |
| `grid.min_days_to_show`        | int                    | `1`                  |
| `grid.show_allday_band`        | boolean                | `true`               |
| `grid.allday_band_max_rows`    | int                    | `3`                  |
| `grid.axis_width`              | CSS length             | `"3.5em"`            |
| `grid.show_axis_labels`        | boolean                | `true`               |

Four of lenaxia's eleven keys are absorbed by machinery we already have:
`time_grid_allday_bg_opacity` becomes `DEFAULT_OVERRIDES_BY_VIEW` (grid sets
`event_background_opacity: 20`), `time_grid_event_min_height_px` becomes CSS
`min-height`, both breakpoint keys collapse into one `min_day_width`, and
`time_grid_navigation_days` belongs to #185.

Inert in grid view, so `VIEW_SCOPE` must say so: `compact_*` (already list-only),
`show_empty_days` / `empty_day_text` (a time axis is never empty), `event_spacing`
(spacing is time, not margin), `show_description` (no room in a block).

---

## Phases

Integration branch `feature/grid-view-v5`, feature branches feeding it, one PR into
`dev` — the v4 shape.

| Phase | Scope                                                   | Status   |
| ----- | ------------------------------------------------------- | -------- |
| 1     | `src/utils/grid.ts` — pure geometry, DST-tested         | **done** |
| 0     | Generalize the view abstraction; register `grid`        | next     |
| 2     | `src/rendering/grid.ts` — the container                 |          |
| 3     | Host wiring — fit resolver, now line, midnight rollover |          |
| 4     | Editor schema, artwork, strings                         |          |
| 5     | Docs, `NOTICE`, release surfaces                        |          |

Phase 1 ran first because it touches no existing code path and settles the geometry
decisions concretely. Phase 0 carries the real risk and ships nothing user-visible; if
the abstraction does not generalize cleanly, that is worth learning before any renderer
exists.

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

Progressive disclosure by rendered height: title always, plus time above ~32px, plus
location above ~56px. Express as container queries where possible.

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
in it is directly testable. Phase 1 shipped 88 unit tests and 21 DST tests (63 across
three zones).

Mutation results, each restored afterwards, with an unmutated control:

| Mutation                                | unit        | dst         |
| --------------------------------------- | ----------- | ----------- |
| _control — no change_                   | 88 pass     | 63 pass     |
| wall clock to elapsed ms                | **88 pass** | **24 fail** |
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
