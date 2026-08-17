# Backlog

Work that is known about and not done. Everything v4 closed has been removed rather than
marked `Done`, so what remains here is only what someone might still act on. The closed
record is recoverable from git history — `git log --diff-filter=D -- docs/development/`
names the commit, and `git show <sha>^:docs/development/<file>` prints any of it back.

Not published: `docs/development/**` is excluded from the docs site by `srcExclude` in
`docs/.vitepress/config.mts`, and from the style and coverage checks in
`scripts/check-docs.mjs`.

## Deferred out of v4

**Seven languages still capitalise `fullDaysOfWeek`.** The array has one runtime consumer,
in `format.ts`, and every path reaching it prefixes `translations.multiDay` — so it is
always running text, where a language that lowercases weekdays wants `till måndag, 5 jan`
rather than `till Måndag`. Ten of the seventeen affected languages were fixed for v4.

The seven left are deliberate, and each is a native-speaker question rather than an edit:

- `cs hr lt lv sk` — lower-casing these leaves the nominative, but `multiDay` governs case
  (`do`, `iki`, `lidz`), so they want an inflected form. Polish wants `do poniedziałku`,
  not `do poniedziałek`. Czech alone needs `středy` / `čtvrtka` / `pátku` while `pondělí`
  is unchanged, so a mechanical lower-case pass is a half-fix that looks finished.
- `fi hu` — postpositional. Finnish wants `maanantaihin asti` where the template emits
  `asti Maanantai`, and Hungarian's `eddig: Hétfő` reads as a contributor working around
  the same constraint. No edit to the array can reach this; the template has to change.

`check:i18n` warns on exactly these seven, and that warning is currently the only signal
they are unfinished — lower-casing them without inflecting would silence it while leaving
the strings wrong. **The `months[]` array is not the same defect and must not be "fixed"
alongside**: it has five consumers spanning two casing contexts, including the standalone
day header where a capital is correct, so it needs a separate `fullMonths` array rather
than a casing pass. These strings are native-contributed and on the eager path;
`git log -S'"fullDaysOfWeek"' -- src/translations/languages/<lang>.json` names the
contributor to ask.

## After v4

**Grid view.** Nothing is built, and the `grid` name is not reserved anywhere either —
`EffectiveView` in `src/config/types.ts` is `'list' | 'column'`, so adding it starts with
widening that union. (The `'grid'` occurrences in `src/rendering/editor/` are Home
Assistant form-layout node types and have nothing to do with views.) Feasibility was
assessed and the architecture generalises, with named changes. Attribution
runs through [issue #339](https://github.com/alexpfau/calendar-card-pro/issues/339), from
@lenaxia — that issue is the durable record and the thing to credit. Do not expect to
recover code from a branch: both the contributor branch and the adapted review branch have
since been deleted from `origin`, and no remaining ref resolves either, so a clean clone
has nothing to rebuild on. Anyone picking this up should plan to build from the issue, and
should republish an immutable tag first if a history worth keeping is ever recovered.

Day-navigation controls fold in here (maintainer, 2026-08-14) — `«` `‹` Today `›` `»` — as
a candidate to consider _with_ the grid view rather than ahead of it. Two constraints are
why it was never a v4 item: it must be optional, so it does not bloat the UI for people who
do not want it, and navigation must not trigger a refetch. The prototype re-slices an
oversized fetch, so the fetch-window question has to be settled first.

Ours is oversized too, which is the useful half of that answer. `getTimeWindow` advances
the end to `start + days_to_show` — already the exclusive boundary — and then pushes it to
`23:59:59.999`, so a `days_to_show: 3` window asks Home Assistant for four whole days. The
extra day is filtered out downstream, so nothing renders wrong; it is only waste, and it is
proportionally largest on the small windows most people run. Narrowing the end to local
midnight on the boundary date is a one-line change, but it moves the actual API request, so
it wants a real Home Assistant round-trip against several calendar integrations rather than
a late change on a release candidate.

**~~1px vertical shift in the list event-weather badge.~~ Fixed.** Measured against v3.6.0, the
badge box grew from `[754,6,34,14]` to `[754,4,34,18]` and its glyphs sat 1px lower. Colour was
unchanged and the row was unchanged, so nothing reflowed and no text moved relative to its
neighbours — a taller invisible box, not a visible shift.

Cause: the `.event-weather-text` wrapper. Only its _child_ span carried `font-size: 12px`, so the
wrapper inherited the 14px event font and built a line box 4px taller than its contents. The
font size now sits on the wrapper; the chips render at the same size either way, since they
inherit it.

The hazard recorded here — that the rule is unscoped and would also reach column view, whose
weather row spacing was tuned live and signed off during v4 review — turned out to be **inert,
twice over**. Column view always passes `weatherPlacement: 'row'`, which leaves the title
forecasts `undefined`, so it never emits this badge at all; and the row placement declares the
same `--calendar-card-weather-event-font-size` on its own container, so the wrapper already
computed that value by inheritance. Nothing in column view moves.

`tests/weather-badge-styling.test.ts` already asserted that a font size **reaches** the badge
without a `.time-location` ancestor, and that assertion could not see this: the selector it
matched, `… .event-weather-text > span`, contains the wrapper's class and _is_ the defect. It
now also pins which element is the rule's subject, with a control proving the new filter
discriminates by selector shape rather than by declaration.

**~~`setConfig` merges only the top level.~~ Fixed.** It built the effective configuration as
`{ ...DEFAULT_CONFIG, ...config }`, so a nested block the user wrote partly replaced the default
block wholesale instead of being filled in key by key. A `weather:` holding just `entity:`
therefore arrived with `position`, `date` and `event` all `undefined`, even though `position` is
published with a default of `date` and the two sub-blocks carry defaults of their own.

`Config.mergeConfig` now recurses into plain objects and replaces arrays wholesale, so
`entities:` still overwrites rather than merging into the default list, and a non-object value
such as `weather: null` still clears the block.

**The write path needed no change, which is why this was safe to do here rather than early in a
cycle.** The concern was that `toStoredConfig` strips defaults on save, so filling them in on
read would make the editor write ninety keys the user never typed. It already handles nesting:
`weather` is routed through `stripWeatherDefaults`, which compares each nested option against
the same defaults and drops the ones that agree, and `filterDefaultValues` recurses for
everything else. `tests/editor-value-round-trip.test.ts` asserts the whole loop by exact object
rather than by key count — break the strip and six of its cases fail.

The two symptom fixes are left in place deliberately. `resolveWeatherPosition` and
`isCustomized`'s `undefined` guard both still answer correctly, and both are still reached with
configs that never went through `setConfig` — the editor builds preview objects of its own, and
much of the suite calls the renderers directly. They are no longer load-bearing for the ordinary
path; they are load-bearing for those.

One thing the fix does **not** change: a block the user never mentioned is still
`DEFAULT_CONFIG`'s own sub-object by reference, since only blocks the user also wrote are
rebuilt. `normalizeLengthOptions` already rebuilds rather than writing through, which covers it.
The frozen-config hazard is narrower than it was — a user's `weather:` is now a fresh object —
but `column` has no default block, so a frozen `column:` still arrives by reference.

**The lesson worth keeping is about the fixture, not the merge.** `buildConfig` in
`tests/fixtures.ts` claimed to build configs "the same way `setConfig` does" and did its own
shallow spread, so every fixture in the suite would have kept the old shape while production
moved. It now calls `mergeConfig`. Two test files had also hand-rolled the merge to simulate
`setConfig`; one of them existed specifically to catch a defect the shallow merge caused.

**`visible:` conditions in the editor.** Home Assistant's `ha-form` can hide a row through
a `visible:` condition rather than through the memoised schema recomputation the editor does
today. Worth adopting only with a stated minimum HA version, since a version that does not
understand the key would render the row unconditionally.

**~~`min_day_width` is capped at 400 in the editor and nowhere else.~~ Fixed by dropping the cap.**
The number selector in `src/rendering/editor/schemas/layout.ts` declared `max: 400`, while
`normalizeColumnValue` in `src/config/view.ts` had no ceiling and no docs page states a range for
any option, so the cap had neither a runtime nor a documented basis. It was the only arbitrary
ceiling among the editor's numeric selectors — `min_days_to_show` derives its own from
`days_to_show`, which is the one basis that makes a ceiling legitimate.

Dropped rather than given a runtime counterpart, because adding one would clamp a working
config. `computeColumnThresholdPxFor` has no upper bound and a large floor is meaningful: it says
"give me columns only if each can be this wide", which is a real thing to want on a wide dashboard
card. The editor must not be less capable than YAML. The floor moved to the runtime's own `> 0`
for the same reason, and `mode: 'box'` now states the control type rather than leaving it to be
inferred from whether both bounds are present.

`tests/editor-selector-minima.test.ts` existed to catch exactly this class — an editor bound the
runtime does not share — and missed it twice over: it walked only the content and entity schemas,
never the layout one, and it collected only `min`. Both are fixed, and the denominator assertion
that would have caught the first is now in place.

**~~`convertToRGBA` emits a CSS variable that nothing defines.~~ Fixed.** The `var(` branch of
`computeRGBA` in `src/utils/helpers.ts` returned `rgba(var(--calendar-color-rgb, 3, 169, 244),
…)` against a variable with exactly one occurrence in `src/` — that line itself. No stylesheet
or inline style ever set it, so the fallback won every time and a themed `var(--primary-color)`
never reached the rendered colour.

The proposed remedy — defining `--calendar-color-rgb` on the host — was not taken, because it
cannot work: `rgba()` needs three channel values, and a `var()` reference cannot be taken apart
into them without resolving it, which is exactly what must not happen here. `rgbaCache` is
module-level and never evicted, so resolving at call time would pin whichever theme was active
on first render for the life of the page.

The branch now emits `color-mix(in srgb, <colour> <opacity>%, transparent)`, which stays a live
CSS expression and therefore still follows a theme switch, while actually carrying the
configured colour. This is the idiom the stylesheet already uses in three places, including the
progress-bar track, so it adds no new dependency.

Worth keeping for the shape of it: the hard-coded fallback `3, 169, 244` **is** `#03a9f4`, the
default `accent_color`. The bug was therefore invisible on any default config and on any theme
whose primary colour happened to be close — the card did not look broken, it looked like the
default. It also needed two opt-ins to reach at all (a `var()` colour _and_ a non-zero
`event_background_opacity`, which defaults to `0` on a path that returns first), which is why it
survived to v4. `tests/helpers-color-and-icon.test.ts` now pins both the unit output and the
rendered background, each with a control asserting that two different variables give two
different results — the one thing a hardcoded fallback can never do.

## Verification debt

Gaps in what the suite and the gates can prove, rather than defects. Each was measured and
then deferred on the same reasoning: a new harness added at release point spends its first
false positive at the worst possible moment, while the same harness added after a release
costs only a re-run.

**The v4 test suite has now been mutation-tested across eight files, and the results are
uneven.** 95 test files were added on this branch. The sweeps below used type-safe operator
swaps only, so a surviving mutant means the suite could not see a change that compiled — not
that the source is wrong. Where a survivor was traced, it is classified; where it was not, it is
listed as untriaged rather than as a defect. **Across the fully-triaged files, real gaps and
equivalent mutants came out at roughly one to one.** That ratio is the point: most survivors are
defensive duplication, so a sweep that stops at the survivor count and calls each one a gap will
be wrong about about half of them.

| File                            | Sites | Killed | Survived | Reading                                   |
| ------------------------------- | ----: | -----: | -------: | ----------------------------------------- |
| `src/config/view.ts`            |    52 |     49 |        3 | all three unreachable or equivalent       |
| `src/calendar-card-pro.ts`      |  28\* |     17 |       10 | **2 real gaps closed, 8 equivalent**      |
| `src/utils/events.ts`           |   131 |     84 |       47 | **4 real gaps closed**; rest classified   |
| `src/rendering/column.ts`       |    17 |     16 |        1 | survivor provably equivalent              |
| `src/rendering/leaves.ts`       |  24\* |     24 |        0 | no gap found                              |
| `src/rendering/render.ts`       |    10 |      6 |        4 | **3 real gaps, now closed**; 1 equivalent |
| `src/rendering/presentation.ts` |     9 |      7 |        2 | **1 real gap closed**; 1 equivalent       |
| `src/rendering/styles.ts`       | 9\*\* |      4 |        5 | **5 real gaps, all closed**               |

\*\* Only the nine sites in TypeScript. The rest of that file is a `css` tagged template,
where an operator swap is not executable code.

\* A curated subset of the host element's operator sites, not all of them. Two more — the
`updated()` guard at the `hass`-just-arrived test, and the weather-config comparison beside it
— **cannot be swept at all**: relaxing either makes `updated()` call `updateEvents()`, which
sets reactive properties and re-enters `updated()`, so the mutant loops forever and hangs the
runner rather than failing it. Any harness aimed at this file needs a per-mutant timeout.

The three `view.ts` survivors resolve cleanly and need nothing: `unit <= 0` in `fitColumns` is
unreachable because `normalizeColumnValue` floors numeric column options at `> 0`, the
`measuredWidthPx <= 0` guard is the same shape, and the hysteresis half-band's `- 1` is
absorbed by the clamp. The `fitColumns` epsilon is documented in place as unkillable.

The host element's ten survivors cluster, and the first cluster turned out to be smaller than
it looked:

- **~~The suite is English-only end to end.~~ Closed, and the original claim was wrong.**
  `tests/host-language.test.ts` now covers `effectiveLanguage` — which no test read, while
  `host-updated-wiring.test.ts` covered only the private `_language` field that every consumer
  reaches _through_ that getter. So the `|| 'en'` arm was free: relaxing it to `&&` returns
  `'en'` for every configured language and `''` when none is set, and the suite stayed green.
  That one is real and is now killed by 7 of the new file's 9 tests.

  The claim that this "closes three of the ten" was **over-stated and is withdrawn**. Both
  halves of the language-recompute condition in `updated()` are **equivalent mutants**, not
  coverage gaps: relaxing either `&&` to `||` only makes the condition true more often, and
  recomputing the language is idempotent, so the resolved value never differs. Measured across
  a 74-row lifecycle differential — 5 Home Assistant locales × 5 configured languages × 3
  follow-up config edits, capturing `_language` and `effectiveLanguage` after each of three
  lifecycle steps — at **0 differing rows each**, against 68 for the `effectiveLanguage`
  mutant and 63 for a control. No test can close them; do not write one.

- **~~Title-template state.~~ Closed.** `isTitlePending` returns `isTemplate(title) &&
renderedTitle === undefined`, and **all three** of its mutants survived the full suite —
  because `card-wrapper-dom` pins `renderMainCardStructure` directly and supplies
  `titlePending` itself, so the argument was covered and the getter computing it was not.
  Three tests in `host-guards.test.ts` now kill them separately. The third only differs when
  a template resolves to an **empty string**, and finding it corrected `render.ts`'s own
  comment: the heading is held open during the pending window, not for the life of the card,
  and an empty result correctly collapses to the zero-height placeholder rather than
  reserving a 16px margin for a title that renders nothing.
- **~~Interaction edge.~~ Closed, and the earlier reading of it was wrong.** The note here
  said the tap branch's `!this._holdTriggered` guard was reachable only through the shallow
  merge in `setConfig`. It is not: `mergeConfig` replaces a non-object wholesale exactly as
  the spread did, so `hold_action: null` still arrives as `null` and the deep merge changed
  nothing — measured by printing what `null`, `undefined` and `{action:'none'}` each survive
  `setConfig` as.

  The real cause was a disagreement between the two pointer handlers.
  `_handlePointerDown` armed the hold timer on `hold_action?.action !== 'none'`, and optional
  chaining makes that **true for null**, since `null?.action` is `undefined` and `undefined`
  is not `'none'`. So a bare `hold_action:` — which the user wrote to mean "nothing on hold"
  — armed a timer, set `_holdTriggered` and drew a hold indicator, and then
  `_handlePointerUp` refused it at both branches: its hold branch needs `hold_action` truthy,
  its tap branch needs `!_holdTriggered`. A long press produced a ripple and no action, and
  the tap never ran either. Requiring the block to exist makes the two agree, and makes a
  bare key behave as the documented `hold_action: none` does. With that, `_holdTriggered`
  can no longer be true while `hold_action` is falsy, which turns the tap branch's guard
  into defensive duplication rather than a coverage gap.

- **Untriaged:** ~~the refresh-interval fallback, the weather-subscription guard, the
  initial-load retry cleanup, the `isLimit` numeric test, and the empty-state branch in
  `render`.~~ **All five triaged. Two were real and are closed by
  `tests/host-guards.test.ts`:**
  - **The refresh timer ignored its configured interval.** `config.refresh_interval ||
DEFAULT` — the fallback never fires, because `toValidNumber` has already guaranteed a
    number, so nothing noticed when the configured value stopped being read at all. A card
    set to refresh every 5 minutes would have quietly refreshed every 30.
  - **A card with no calendars rendered an empty agenda instead of the error state.**
    Reachable from the editor, which holds an empty list mid-edit.

  The other three are **equivalent mutants**, each masked by a duplicate of its own check
  further down:
  - the retry cleanup is followed by a branch that clears and re-arms the timer either way;
  - `isLimit`'s `Number.isFinite` sits behind `toValidNumber`, which reduces every limit —
    card-level _and_ per-entity — to `number | undefined` before it is read;
  - the weather-setup early return is masked **three** times: `getRequiredForecastTypes`
    returns an empty list without an entity, `subscribeToWeatherForecast` guards
    `!hass?.connection`, and that function's `try`/`catch` absorbs whatever is left. Relaxing
    the first two _together_ still changes nothing observable, so this one is unkillable by
    construction rather than merely untested.

So the running total is **five closed, five withdrawn as equivalent, none open** — and the lesson
generalises past this file: a cluster of survivors sharing a subject is not evidence that they
share a cause. The language three all touched language resolution and only one was a gap; the
five here shared nothing but the file. The last two to close add a second lesson, about the
notes rather than the code: both had a stated cause recorded here, and **both causes were
wrong**. The title one was filed as a single mutant and was three; the interaction one was
filed as a consequence of the shallow merge and survived the merge being fixed. A survivor's
recorded explanation is a hypothesis until something re-measures it.

**`src/rendering/` has now been swept in full, and the shape is informative.** `leaves.ts` (24
sites) and `column.ts` (17) came back with **no gap at all** — 40 of 41 killed, the single
survivor provably equivalent, because `days[index - 1]` at `index === 0` is `undefined`, which
is exactly what the `else` branch returns. The v4 column view is the best-pinned rendering code
in the project, and it stayed that way after the week-number band landed: all four mutants on
that new grid-row logic died.

`render.ts` was the opposite: **4 of 10 survived, and 3 were real**, now closed by
`tests/list-separator-branches.test.ts`. All three are separator branches, and they share one
cause — every separator width defaults to `'0px'` and `show_week_numbers` to `null`, so a suite
built from `DEFAULT_CONFIG` draws no separator of any kind and cannot reach them.
`zero-length.test.ts` turns the _month_ width on and covers that path, which is why these three
looked covered:

- `renderHorizontalSeparator`'s zero-width early return — the **day** separator's own
  suppression, a different call path from the month rule.
- `renderWeekRow` choosing month styling over week styling, invisible unless the two widths are
  configured _differently_.
- `hasWeekSeparator`, which does not gate the week row at all — it stops a day rule being
  stacked on top of one, so the observable is a separator **count** (4 → 3), not a presence.

The generalisable part: a fixture that turns one option on does not cover the options beside
it, and a shared width hides which branch chose it. Configure the neighbours differently.

`presentation.ts` gave up one real gap — `isPastEvent` used `now > endDateTime` with nothing
pinning the boundary, while the all-day branch beside it was pinned by the shared fixtures.
`tests/event-state-classes.test.ts` now carries the millisecond case so the two paths cannot
drift apart. Its other survivor is equivalent: `isRunning && show_progress_bar` is re-checked by
`hasProgressBar` in `leaves.ts`, and `calculateEventProgress` re-checks `isEventCurrentlyRunning`
internally, so the presentation-side test is defensive duplication. Mutating the `leaves.ts`
half alone **is** caught, which is how the pair was told apart.

**`styles.ts` was the worst of the eight files: 5 of its 9 executable sites survived, and all
five were real.** They are the `--calendar-card-weather-*` fallbacks — a surface v4 turned from
inline styles into published theming hooks, all six documented with defaults in `theming.md`.
The defaults are the common case rather than the edge case, because `setConfig` merges `weather`
shallowly: a block naming only `entity` arrives with `date` and `event` absent, so every badge
reads its fallback. Dropping one emits `undefined` into the property, and **both `npm test` and
`check:docs` stayed green** — the docs gate counts the documented defaults but never reconciles
them against the code. `tests/custom-property-mapping.test.ts` now pins each fallback beside a
distinct override, which also catches two properties crossed.

**`src/utils/events.ts` has now been swept, and four of its survivors were real.** 131 sites,
84 killed, 47 survived, 0 timed out. The four are closed by `tests/events-sweep-gaps.test.ts`,
and each was a case the existing fixtures could not reach rather than an assertion that was
too weak:

- **The all-day exclusive-end adjustment, at both sites.** An all-day `end.date` is
  exclusive, so the card subtracts a day to get the inclusive last day. Every all-day
  fixture in the suite starts on or after the window start, and such an event is admitted
  by its _start_ before its end is ever consulted — so the subtraction was never
  load-bearing. Only an event that began before today reaches it. Getting the filter-pass
  copy wrong drops a holiday from the card on its final day; getting the grouping-pass copy
  wrong files it under the day it started instead, which is **outside the window**.
- **The per-calendar event counter's increment.** Every existing per-entity
  `compact_events_to_show` fixture uses a limit of `1`, which cannot tell a counter that
  steps by one from one that steps by two — either way the second event is refused. A limit
  of `2` with three events is the smallest case that separates them.
- **The identity match behind the counter key.** The key is `${entityId}__${configIdx}`, so
  for two _different_ calendars the entity id already separates the budgets and the index is
  inert. Only two entries naming the **same** calendar collide on the id, leaving the index
  as the only thing keeping them apart. That is what the index is for, and it had no test.

Two lessons worth more than the fixes. First, **`toContain` over a flattened day list cannot
see an event grouped under the wrong day** — the grouping-pass mutant survived the first
version of its own test, and only asserting the day key caught it. Second, **a fixture that
hand-builds an entity object is not the object the lookup searches**: `buildConfig`
normalizes `entities` into fresh objects, so a literal `_matchedConfig` is never
identity-equal to anything in `config.entities` and every event falls through to a different
code path that happens to pass. Take the matched config out of the built config.

The remaining 43 survivors are classified rather than closed, and the classification is by
reading except where noted:

- **Documented in place already (2).** The comment above `isEventOnOrAfterReference` states
  that both it and `isFutureEvent` are subsumed by `isOngoingEvent` for any event whose end
  is not before its start, and that removing them leaves the suite green. Kept deliberately
  so a malformed feed still renders.
- **Compact-budget arms (4).** Measured equivalent over the 1,279-row differential recorded
  further down, at 0 differing rows against 281 and 42 for two controls.
- **Redundant paired-null guards (9), and all-day detection (4).** `!a || !b` relaxed to
  `!a && !b`, and `start.date && end.date` relaxed to `||`. `keepWellFormedEvents` runs
  first on the production path and guarantees `start` and `end` are both present, which
  makes the first group unreachable there. It does **not** check which of `date` /
  `dateTime` each carries, so the second group stays reachable from a feed mixing them —
  an event that is already broken, where either operator gives an arbitrary answer.
- **Empty-collection guards (5).** `length > 0` relaxed to `>= 0`, where the body is a loop
  or a log over nothing.
- **Masked by upstream normalization (2).** The `Number.isFinite` pair sits behind
  `toValidNumber`, the same masking already recorded for `isLimit` in the host.
- **Arithmetic that cannot change an answer (4).** `+1ms` versus `+2ms` into the next day;
  the cache's exact-millisecond expiry boundary; `window.performance` being defined in every
  runtime this ships to; and the ISO-week Sunday correction, where advancing one day or two
  both land on a weekday in the same ISO week.
- **Counter-key fallback and entity-id disjuncts (6).** Reached only when `configIdx` is
  `-1`, which happens when `matchedConfig` is absent — and the branch above then returns
  before the key is used. Confirmed by mutation for the fallback itself.
- **Not individually re-derived (7).** The display-date branches, the all-day sort keys, and
  the empty-day range end. These are recorded as unexplained rather than as equivalent.

**No gate cross-checks documented CSS classes against emitted ones.** `theming.md` lists the
classes the card exposes, the renderers emit them, and nothing compares the two sets. The
drift this would catch has already happened once — the column-view and event-position classes
shipped undocumented and were caught by human review rather than by CI.

A cheap version does not exist, which is why it was not added late. It has to parse both
`classList.add` calls and template-literal class strings out of the renderers, and maintain an
allowlist for chrome classes that are emitted but deliberately undocumented — precisely the
shape that yields false positives. **Build it when a false positive costs a re-run.**

**The compact-mode event limit cannot be pinned, and does not need to be.** The
`totalEventsShown >= maxEvents` boundary inside `groupEventsByDay` in `src/utils/events.ts`
survives mutation, and this was previously filed here as a coverage gap. It is not one: it is
an **equivalent mutant**. `totalEventsShown` is incremented by `slice(0, remainingEvents)`, so
it can reach `maxEvents` and never exceed it — which makes `>` false exactly where `>=` is
true. Flipping it only stops the loop breaking early; the remaining days then compute
`remainingEvents === 0`, push nothing, and the output is byte-identical. The `>=` is a real
early exit, worth keeping, with no observable consequence. Measured over a 1,279-row
differential (5 event layouts × 8 budgets × `show_empty_days` × `compact_events_complete_days`
× 4 `compact_days_to_show` × `isExpanded`): **0 differing rows**, against 281 and 42 for two
controls in the same block. `totalEventsShown < maxEvents`, `eventsToShow > 0`,
`remainingEvents > 0` and the break condition's empty-day exemption are equivalent for the
same reason. No test can close these; do not write one.

The same differential did find two mutants that were real, and they are now closed by
`tests/compact-single-event-days.test.ts`. The block tests
`day.events.length === 1 && day.events[0]._isEmptyDay` at three sites, and **the second
operand is dead today** — placeholders are created after this block, so `_isEmptyDay` is never
true here, and replacing either operand with `false` at any site changes nothing. That leaves
the first operand exposed: relaxing either `&&` to `||` makes every _single-event_ day take the
placeholder path, which stops the budget applying at all in the default branch and drops those
days entirely in the complete-days branch. Both survived the full suite. The new file pins the
property that outlives the ordering — a day with one real event counts against
`compact_events_to_show` like any other — which is precisely the assertion that would fail if
placeholder creation were ever moved ahead of this block, the change the comment there
contemplates.
