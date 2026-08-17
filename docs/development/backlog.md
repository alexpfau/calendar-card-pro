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

**1px vertical shift in the list event-weather badge.** Measured against v3.6.0, the badge
box grows from `[754,6,34,14]` to `[754,4,34,18]` and its glyphs sit 1px lower. Colour is
unchanged and the row is unchanged, so nothing reflows and no text moves relative to its
neighbours — a taller invisible box, not a visible shift.

Cause: the `.event-weather-text` wrapper. Only its _child_ span carries `font-size: 12px`,
so the wrapper inherits the 14px event font and its line box is taller. The one-line fix is
to move the font size onto the wrapper, but that rule is unscoped and would also apply in
column view, whose weather row spacing was tuned live and signed off during v4 review.
Trading a measured-but-invisible difference in list view for an unmeasured change to a
reviewed column layout was the wrong way round on the eve of a release; it is the right way
round once the release is out. **Scope the selector to list view, or re-verify column
view's weather spacing alongside the change.**

**`setConfig` merges only the top level.** It builds the effective configuration as
`{ ...DEFAULT_CONFIG, ...config }`, so a nested block the user writes partly replaces the
default block wholesale instead of being filled in key by key. A `weather:` holding just
`entity:` therefore arrives with `position`, `date` and `event` all `undefined`, even
though `position` is published with a default of `date` in the reference and the two
sub-blocks carry defaults of their own in `DEFAULT_CONFIG`.

This produced two defects in v4 review, and both were fixed at the symptom rather than at
the cause. `isCustomized` in `src/rendering/editor/filter.ts` now returns early when the
value it reads is `undefined`, so the editor's Customized Only filter stops flagging keys
the user never wrote, and `resolveWeatherPosition` in `src/utils/weather.ts` centralises
the `position` default that the subscribe and render halves had been resolving
differently — one paying for a forecast stream the other then declined to draw. Both are
covered by tests that fail if the fix is removed.

The cause is still there, so a third reader of a nested default can repeat it. What bounds
the risk is that the exposed surface is almost entirely `weather`: `DEFAULT_CONFIG` has
four nested entries, and `tap_action` and `hold_action` each default to a single key while
`entities` defaults to `[]` and is written in full, so none of them can lose a key to a
partial write the way `weather` can.

A deep merge is the real fix and was deliberately not attempted on a release candidate.
It changes `setConfig` semantics for every consumer at once, and `hasConfigChanged`,
`isCustomized` and `toStoredConfig` are all built around the current shape —
`toStoredConfig` in particular strips defaults back out on the write path, so filling them
in on the read path has to be matched there or the card starts writing ninety defaults
into the user's YAML. **Do it early in a cycle, with the write path changed in the same
commit, not as a late fix.**

**`visible:` conditions in the editor.** Home Assistant's `ha-form` can hide a row through
a `visible:` condition rather than through the memoised schema recomputation the editor does
today. Worth adopting only with a stated minimum HA version, since a version that does not
understand the key would render the row unconditionally.

**`min_day_width` is capped at 400 in the editor and nowhere else.** The number selector in
`src/rendering/editor/schemas/layout.ts` declares `max: 400`, but `normalizeColumnValue` in
`src/config/view.ts` has no ceiling and no docs page states a range for any option, so the cap
has neither a runtime nor a documented basis. It is the only numeric selector in the editor
carrying one. What bounds the risk is the write path: the editor emits a value only on a
user-initiated `value-changed`, so opening the editor on a YAML-set `min_day_width: 500` does
not silently clamp it — the number has to be touched first. **Either give the cap a runtime
counterpart in `normalizeColumnValue` and document the range, or drop it.**

**`convertToRGBA` emits a CSS variable that nothing defines.** The `var(` branch of
`computeRGBA` in `src/utils/helpers.ts` returns `rgba(var(--calendar-color-rgb, 3, 169, 244),
…)`, and `--calendar-color-rgb` has exactly one occurrence in `src/` — that line itself. No
stylesheet or inline style ever sets it, so the fallback light blue always wins and a themed
`var(--primary-color)` input never reaches the rendered colour. Re-confirmed at the v4 tip,
and the line does ship in `dist/calendar-card-pro.js`.

**It is not reachable on default config, which is what bounds the severity.** Two opt-ins are
both required. `accent_color` defaults to `#03a9f4`, a hex, so the `var(` branch is not taken;
and `event_background_opacity` defaults to `0`, on which `getEntityAccentColorWithOpacity`
returns before calling `convertToRGBA` at all. A user has to set a `var()` colour _and_ raise
the opacity, and no page documents `var()` as a value for that option — the `var()` usages in
`theming.md` are all card-mod CSS, which is a different surface. Note also that the hard-coded
fallback `3, 169, 244` **is** `#03a9f4`, so the symptom is not a wrong-looking card but a
themed colour silently collapsing to the default accent.

Resolving the colour eagerly is the wrong fix, and was declined for that reason. The branch
returns a live CSS expression precisely so the value stays reactive to a theme switch, and
`rgbaCache` is module-level and never evicted, so computing fixed RGB at call time would pin
whichever theme was active on first render for the life of the page. **Define
`--calendar-color-rgb` on the host element instead.**

## Verification debt

Gaps in what the suite and the gates can prove, rather than defects. Each was measured and
then deferred on the same reasoning: a new harness added at release point spends its first
false positive at the worst possible moment, while the same harness added after a release
costs only a re-run.

**The v4 test suite has now been partly mutation-tested, and the results are uneven.** 95 test
files were added on this branch. The sweeps below used type-safe operator swaps only, so a
surviving mutant means the suite could not see a change that compiled — not that the source is
wrong. Where a survivor was traced, it is classified; where it was not, it is listed as
untriaged rather than as a defect.

| File                       | Sites | Killed | Survived | Reading                                      |
| -------------------------- | ----: | -----: | -------: | -------------------------------------------- |
| `src/config/view.ts`       |    52 |     49 |        3 | all three unreachable or equivalent          |
| `src/calendar-card-pro.ts` |  28\* |     17 |       10 | **weakest of the three; see the list below** |
| `src/utils/events.ts`      |   131 |     81 |       50 | largely defensive guards; partly untriaged   |

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

- **Title-template state.** `isTitlePending` returns `isTemplate(title) && renderedTitle ===
undefined`; relaxing it to `||` marks a plain string title as pending and nothing notices.
- **Interaction edge.** The tap branch's `!this._holdTriggered` guard survives, because
  `hold_action` defaults to `{ action: 'none' }` and is therefore always truthy, so the hold
  branch always wins first. It becomes reachable only when a user writes a bare `hold_action:`
  in YAML — the shallow-merge hazard recorded above — and a hold would then also fire the tap
  action.
- **Untriaged:** the refresh-interval fallback, the weather-subscription guard, the
  initial-load retry cleanup, the `isLimit` numeric test, and the empty-state branch in
  `render`.

So the running total is **one closed, two withdrawn as equivalent, seven open** — and the
lesson generalises past this file: a cluster of survivors sharing a subject is not evidence
that they share a cause. These three all touched language resolution and only one was a gap.

**What remains is breadth**, and specifically `src/rendering/` — `leaves.ts`, `render.ts`,
`column.ts`, `presentation.ts` and `styles.ts` have not been mutation-tested at all.

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
