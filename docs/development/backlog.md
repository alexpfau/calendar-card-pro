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
`var(--primary-color)` input never reaches the rendered colour.

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

**The v4 test suite has not been mutation-tested.** 95 test files were added on this branch,
and nothing has systematically checked them for assertions that pass whether or not the
behaviour under test exists. The risk is demonstrated rather than theoretical: a zero-length
probe during review reported "no throw" for the month and week separators, but only because
its fixture rendered a single day, so `prevDay &&` short-circuited before `isZeroLength` ran,
and a second fixture crossed no month boundary. Two of eight crash combinations were invisible
to a probe that read as correct.

The known-risky places have already been swept by hand and came back connected: all seven
`FETCH_TIME_KEYS` fail `npm test` when dropped, the `COLUMN_OVERRIDE_KEYS` and `fitColumns`
epsilon probes were both null, and an off-default hypothesis dissolved under measurement at
109 keys with none lacking a test reference. **What remains is breadth.**

**No gate cross-checks documented CSS classes against emitted ones.** `theming.md` lists the
classes the card exposes, the renderers emit them, and nothing compares the two sets. The
drift this would catch has already happened once — the column-view and event-position classes
shipped undocumented and were caught by human review rather than by CI.

A cheap version does not exist, which is why it was not added late. It has to parse both
`classList.add` calls and template-literal class strings out of the renderers, and maintain an
allowlist for chrome classes that are emitted but deliberately undocumented — precisely the
shape that yields false positives. **Build it when a false positive costs a re-run.**

**The compact-mode event limit is not pinned.** The `totalEventsShown >= maxEvents` boundary
inside `groupEventsByDay` in `src/utils/events.ts` survives mutation — flipping the comparison
leaves the suite green. A coverage gap over correct code, not a defect.
