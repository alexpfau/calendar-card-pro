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

**Grid view.** The `grid` name is reserved in the view vocabulary; nothing is built.
Feasibility was assessed and the architecture generalises, with named changes. Attribution
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

**`visible:` conditions in the editor.** Home Assistant's `ha-form` can hide a row through
a `visible:` condition rather than through the memoised schema recomputation the editor does
today. Worth adopting only with a stated minimum HA version, since a version that does not
understand the key would render the row unconditionally.
