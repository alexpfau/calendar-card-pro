# v4.0.0 Backlog

Every open item for the v4 release, in one place. This file exists because the work is
spread across several sessions and three specifications, and things found in review kept
living only in a chat thread — which is not a place work survives.

**This is an index, not a specification.** Each item says what it is, where it came from,
and which document owns the detail. Where an item has no owning document, the detail is
here.

Not published: `docs/development/**` is excluded from the docs site by `srcExclude` in
`docs/.vitepress/config.mts`, and from the style and coverage checks in
`scripts/check-docs.mjs`. It is committed, versioned and readable in the repo.

## Owning documents

| Document | Owns |
| -------- | ---- |
| [`column-view.md`](./column-view.md) | The column view: config model, density framework, decisions ledger, release blockers (D7) |
| [`column-view-rationale.md`](./column-view-rationale.md) | Archived reasoning for superseded column-view decisions |
| [`editor-rebuild.md`](./editor-rebuild.md) | The schema-driven editor rebuild: design, panel taxonomy, mechanics, staging |
| **this file** | Everything owned by neither, plus the index of what is open |

## Status legend

- **Open** — not started
- **In progress** — a session is on it
- **Blocked** — waits on a decision or another item
- **Ruled** — decided, awaiting implementation

---

## Editor

Detail in [`editor-rebuild.md`](./editor-rebuild.md). Stages 1 and 2 have landed; the rest
is open.

| # | Item | Status | Note |
| - | ---- | ------ | ---- |
| E1 | **Per-calendar settings widget** | **Done** (stage 3) | An inline `ha-expansion-panel` per configured calendar under the picker, each holding an ordinary `<ha-form>` fed the static schema in `schemas/entity.ts`, plus a copy/paste settings clipboard. The *list* is hand-written; the fields are not. **Found while building it:** four of the eleven per-entity options are tri-state — the card reads them presence-first, so absent means *follow the card* — and the editor this replaces bound them to checkboxes, which cannot express that and wrote a `false` no control could take back. They are three-way dropdowns now. |
| E2 | **Exceptions widget** (`column:` overrides) | **Done** (stage 3) | Hand-written, one collapsed group at the end of each panel that owns an overridable option. A `select multiple` names the options with an exception — adding and removing are the same edit in two directions — and the rows below are the panel's *own* schema nodes, so an exception has the same control as the option it overrides. Removal deletes the key and drops an emptied block. `ha-form-optional_actions` stays rejected and the reading was confirmed against `home-assistant/frontend`. Reaches 49 of 52 override keys; see E11. |
| E3 | **Search & "Customised only" filter** | Open | The payoff of being schema-driven: the schema is the field registry, so search is a filter rather than a rewrite. Stage 4. |
| E4 | **Drag-to-reorder calendars** | **Done** (stage 3) | One flag, as hoped. `EntitySelector` carries `reorder?: boolean` (`frontend:src/data/selector.ts`), forwarded as `.reorder` to `ha-entities-picker`, which without it instantiates `ha-sortable` with `disabled=true` **and renders no drag handle** — so the list genuinely could not be reordered before. Added in PR #26217, merged 2025-07-18, so **HA 2025.8+**; an older instance ignores an unknown selector option and renders the list exactly as it does today. No drag implementation of ours. |
| E5 | **Compact mode group: order & gating** | **Done** (stage 5) | **The request's premise was inverted, and reading the code is what showed it.** There is no compact-mode toggle: `compact_days_to_show` and `compact_events_to_show` *are* compact mode — either one on its own switches it on — and `compact_events_complete_days` ("Finish The Last Day") is not a third limit but a **modifier of the event limit**, read only inside the branch guarded by a finite `compact_events_to_show` (`events.ts:519-530`). So the two inputs are **not** inert when the switch is off; they are the only live controls in the group, and gating them behind it would have hidden them. The dependency runs the other way, and was implemented that way: the modifier is held back until there is an event limit for it to modify, which is the `uv_index_threshold` pattern. The requested reorder is moot for the same reason — leading the group with the modifier would place a control above its own dependency, and the existing order already reads root-first. **Applicability is now stated once on the group** via `GROUP_SCOPE` in `localize.ts`: a group names one config key whose scope it speaks for, the scope itself still comes from `VIEW_SCOPE`, and a child is silenced only when its own scope is *identical*, so a differently-scoped field added to a scoped group keeps its own note. The two per-field notes the group replaces were deleted rather than left dead. |
| E6 | **Helper-text copy pass** | Open | Several helpers restate their label and add nothing (`show_past_events`, `show_empty_days`, the weekend/today colour groups, the today-indicator group). The week-number helper lost the ISO-8601-versus-simple explanation the old editor carried. `split_multiday_events` does not mention that column view defaults it to `true`. Needs one deliberate pass, not field-by-field patching. **The compact group's repeated *"applies to the list layout"* is no longer part of this** — stage 5 moved it onto the group (E5). What is left there for this pass is that `compact_mode.helper` opens with "Limits that apply…" directly after a group note that also says "limits", which reads as a stutter; the two want writing as one paragraph. |
| E7 | **UV index and low temperature are mutually exclusive** | **Done** (stage 5) | Stated on `date.show_low_temp` as a path-qualified helper — *"The UV index takes this place on days it is shown."* — and in the reference and feature tables. Not hidden, and hiding would have been actively wrong: `showUvIndex` also requires `uv_index >= threshold`, so with a threshold set the low temperature legitimately appears on low-UV days. It is per-day runtime precedence, not a static rule. |
| E7b | **Column-view meaning of `show_conditions`** | **Done** (stage 5) | Path-qualified helper on `event.show_conditions`, no `VIEW_SCOPE` entry, exactly as ruled — the option is not inert in column view, and `applicabilityNote` keys on the bare `schema.name`, which both weather groups share. A third string documents the new `weather.event.max_lines` (C2b), also path-qualified for the same reason: a bare `max_lines` entry in `VIEW_SCOPE` would sit in a table of top-level config keys and could collide with a future one. |
| E8 | **Two placement questions** | Open | `first_day_of_week` sits in Time Range & Content while `show_week_numbers` sits in Day Header — arguably one concept, and the docs group them. `day_header_separator_*` moved to Separators (grouped by what it is) while `day_header_gap` stayed in Layout (which owns spacing). Both cheap now, awkward once documented. |
| E9 | **Fate of the synthetic calendars multi-picker** | **Kept** (stage 3) | **Ruled — kept, unchanged.** The picker and the per-calendar list are one control split by responsibility: membership and order above, settings below. Unwinding it would leave no way to *add* a calendar at all, and its identity-preserving merge is exactly what keeps a deselected calendar's settings alive — the property the per-calendar list depends on. It is also what HA's own calendar card does (`<ha-entities-picker>` above hand-written fields), and it is where `reorder` lands for E4. Reversible if the maintainer disagrees: the list below does not depend on the picker being synthetic, only on `entities` keeping its order. |
| E10 | **Translations for the new namespace** | Open — unblocked by X1 | English only today. The plan: mine the dormant sections in `src/translations/editor-languages/` for anything reusable, translate, then delete them. X1 moved them off the eager path, so the ~+18,000 B gzip this was budgeted at is now downloaded by HACS and parsed only by browsers that open the editor — translate to whatever depth is worth doing, and a partial translation is safe because each key falls back to English on its own. |
| E11 | **Exceptions for the three union-typed override keys** | Open | `show_week_numbers` (`null \| 'iso' \| 'simple'`), `remove_location_country` (`boolean \| string`) and `today_indicator` (`string \| boolean`) are override-eligible but have no exception control, because the panel edits each through a mode dropdown that chooses *which shape* is written — an exception needs that derivation again, per exception, which is a mechanism rather than a field. A hand-written `column:` block carrying any of the three still works and is still preserved on write; `value.ts` already documents `column: { show_week_numbers: null }` as meaningful. The set is asserted in `editor-schema.test.ts`, so it cannot grow quietly. |
| E12 | **Per-calendar label has no type picker** | Open | The old editor spent 209 lines (`_renderTypeSelector` and friends) giving the label a type — none / text / icon / image — which is not a config key: `renderLabel` derives it from the value's shape. Stage 3 offers one text field and says so in the helper, which is correct for all four cases and loses only the icon picker. Restoring one needs a *per-item* synthetic field, and `SYNTHETIC_FIELDS` is keyed per card. Worth doing only if users ask. |

### Editor: closed in review, recorded so it is not re-litigated

- **The editor does not normalize the configuration; the card does.** `element.ts`'s
  `setConfig` is a plain `{ ...DEFAULT_CONFIG, ...config }`, while the card runs
  `normalizeNumericOptions` on every `setConfig`. So any editor code that asks a
  numeric question about the configuration is asking it of the **raw YAML**, and a
  predicate copied from the card answers a different question in both directions —
  found on the compact-limit gate, where a bare `Number.isFinite` hid the modifier for
  a quoted `'3'` the card was actively honouring, and offered it for a `-1` the card
  discards. Fixed by asking `toValidNumber` with the same minimum the card normalizes
  with. **The rule for anything similar: coerce through `config.ts`, do not re-derive.**
- **`check:i18n`'s probe matrix sweeps booleans only.** `probeConfigs` builds every
  panel against an all-on and an all-off sweep of the *boolean* defaults, plus a
  handful of hand-listed shape variants. A field gated on a **number with no default**
  is therefore never built, and its label and helper are reported as strings nothing
  references — which is what happened the moment `compact_events_complete_days` was
  gated on `compact_events_to_show`. The fix is a probe variant, not a weaker check,
  and the same one was added to `editor-schema.test.ts`, whose "covers every option the
  card has" test has the identical blind spot. Worth knowing before the next numeric
  gate: the failure names the *string* as unreachable, which points at the string table
  rather than at the probe that never opened the branch.
- **Divergent column defaults are annotated, not pre-seeded as exceptions.** The design
  asked for `show_empty_days` and `split_multiday_events` to be seeded into the
  exceptions node "with helper text naming them as column defaults". The intent is right
  and the placement was not: seeded, every column card opens with two exception rows it
  never asked for, which is the opposite of *zero chrome when unused*. The statement now
  sits beside the shared control as one sentence, driven from `DEFAULT_OVERRIDES_BY_VIEW`
  — a lookup, not a view comparison — and `check:i18n` requires a note for every key with
  a divergent default.
- **Per-entity booleans were never two-state.** `getEntitySetting(…) ?? config.show_time`
  and `typeof … !== 'undefined'` are presence tests, so *absent* is a third state meaning
  *follow the card*. The old editor's `addBooleanField` could not express it and its first
  touch wrote a `false` that nothing could undo.

- **Group-qualified labels collapsed to their group.** `translate()` split a dotted key
  into exactly two segments, so `editor.time.show_end_time` matched `editor.time` — the
  string `"Time"` — and returned it. Every field in a group inherited its group's label
  *and* helper. Fixed in `51c11c7`, with a test asserting what resolution returns rather
  than what the tables contain.
- **Three fields a keystroke could destroy** — card height, today indicator, start-date
  offset. Each derived its own presence from its own value, so an incomplete keystroke
  removed the field and discarded the value. Fixed in `223edb9`.
- **`ui_color` is the wrong selector for our colours.** It emits a theme token that cards
  resolve through `computeCssColor()`; we write colours straight into CSS custom
  properties, and it cannot express alpha or our `var(--…)` defaults. Colours stay `text`.
- **A `null` entry in `entities` crashed the editor.** A blank YAML list item parses as
  `null`, not absent. `fa67dba` hardened the *card's* read path (`normalizeEntities`,
  issue #389), but the editor never calls it — Home Assistant hands the editor the raw
  config. Same bug, second surface. It matters more here than on the card: the editor is
  the one surface that must survive reading a config it did not write, because throwing
  there removes the only means of fixing the list that caused it. Hardened in
  `asEntityConfig`, with a test.
- **Per-entity and card-level `split_multiday_events` have different scopes.** Card-level
  is a genuine column override — `column: { split_multiday_events: false }` skips the split
  (`events.ts:225`) — while the per-entity key is ignored in column view entirely. One key
  name, two scopes, so `VIEW_SCOPE` could not describe both; hence `ENTITY_VIEW_SCOPE` and
  `entityScopeFor`. Merging them would have made one of the two statements false wherever
  it was shown.

---

## Column view

Detail in [`column-view.md`](./column-view.md).

| # | Item | Status | Note |
| - | ---- | ------ | ---- |
| C1 | **Progress bar in column view** | **Confirmed working** — geometry follow-up is C5 | Not missing code: `column.ts:244` calls the shared `Leaves.renderEventContent`, which renders the bar at `leaves.ts:543`, and `show_progress_bar` / `progress_bar_height` / `progress_bar_width` are all column-override keys (`view.ts:55-57`). It had simply never been *seen* there, because it defaults to `false` and the suite is built from default config — the blind spot `AGENTS.md` warns about. **Maintainer verified it live in a dev build: it renders, and at adequate column width it sits exactly where the countdown sits, as designed.** The D7 blocker is therefore discharged for *existence*; what remains is how it lays out once the column is too narrow for the time and the bar to share a line, which is C5. A test that turns the option on is still owed, so the suite stops being blind to it. |
| C2 | **Per-event weather row** | **Done** (stage 5) | In list view, `show_conditions` gates the icon and still does. In column view the weather has its own row, so switching conditions off left a row holding only a temperature, breaking the leading icon edge that time, location and description share. **Built as ruled: in the own-row placement the icon is unconditional and `show_conditions` states the condition in words instead.** Keyed on the *placement* rather than on the view, so it is not a fourteenth `=== 'column'` gate (C3) and a future layout that asks for a row inherits the fix. Reuses the existing key, no migration. The three things it depends on all held: HA ships the condition vocabulary translated (`formatEntityState` with its state override), `WeatherData.condition` was already stored, and the declaration already existed. Both traps were real — `Hass.states` and `HassEntity.entity_id` are widened, with `entity_id` **required** so the silent-fallback trap is a compile error, and an untranslated token is reported once per condition through `Logger.debug` so it is diagnosable rather than merely cosmetic. Spec: [`weather-column-view.md`](./weather-column-view.md), whose §4.3 was superseded — see the note at the top of that file. |
| C2b | **`weather.event.max_lines`** | **Done** (stage 5) | New key in `weather.event.*`, default `0`, `> 0` sets `--calendar-card-weather-event-max-lines` and clamps with `-webkit-box`, exactly as the four top-level `*_max_lines` do. One value for both views, as ruled. **Read with a fallback rather than off the merged default, and that is not optional:** `setConfig` merges shallowly (`{ ...DEFAULT_CONFIG, ...config }`), so a user's `weather:` block replaces the default sub-tree whole and every card that configures weather at all has no `max_lines` in its merged config. Reading `DEFAULT_CONFIG.weather.event.max_lines` would have emitted `none` for every user who set one. Every other weather property already reads this way; the reason was not written down anywhere, and now is. Order within the row is temperature / UV / words, so truncation reaches the generated text before it reaches either number. |
| C3 | **Named view predicates** | Open | 13 binary `=== 'column'` / `!== 'list'` gates remain outside the editor. `events.ts` in particular gates compact limits with reasoning its own comment applies to *any* grid layout, yet excludes only column. The editor has zero such gates and a test enforcing it; `src/` does not. Raised by the grid-view feasibility review; `column-view.md` forbids the pattern. Cheap now, structural debt once a third view exists. |
| C4 | **Column view as its own docs page** | Open | It is 175 lines and seven subsections inside `core-settings.md` — the largest section there, and a view mode rather than a core setting. Every other major feature has its own page and a nav entry. Needs every inbound link updated, since `ignoreDeadLinks` is off. |
| C5 | **Countdown & progress bar on their own row in column view** | Specified — ready to build | Maintainer-observed in a live dev build. Detail below. |

#### C5 — the countdown and progress bar row

**Observed in a live dev build.** At generous column width both look right, matching list
view by design. As the column narrows and the time and the sibling no longer share a line,
the sibling wraps and lands **right-aligned in dead space** — see the maintainer's
screenshots. It reads as broken for the progress bar and questionable for the countdown.

**A dedicated left-aligned row was proposed and then rejected**, on four grounds worth
recording because they rule out the obvious fix:

1. Every other row (time, location, description) leads with an icon; a bare text row reads
   as one with a *missing* icon.
2. The countdown belongs to the time and reads that way, but a two-row time means the time
   icon can no longer be vertically centred against what it labels — including when the
   user has explicitly configured icon alignment.
3. Countdown strings are lowercase (`in 2 days`) because they were written to trail other
   text. Left-aligned at the start of a row, that reads as a typo.
4. If the time text itself wraps to two lines, the countdown lands on a third line beneath
   a nearly empty second one.

**Ruled instead: treat the two differently, because they are never both present.**
`getCountdownString` returns `null` once `startDate <= now` (`format.ts`), and
`progressPercentage` is non-null only while the event is running
(`presentation.ts:162-165`). Countdown means *not yet started*; the bar means *running now*.
They are **strictly mutually exclusive**, so an asymmetric treatment can never produce a
visually inconsistent event — a reader only ever sees one of the two.

- **Countdown: always inline with the time**, separated by a middot, never on its own line.
  Lowercase then reads correctly because it is trailing text again, which dissolves
  objection 3, and there is no second row, which dissolves 1, 2 and 4.
- **Progress bar: its own row**, between the event title and the time, spanning a width to
  be settled. A bar is a *graphic*, not text — a graphic with no icon reads as intentional
  where a bare text row reads as broken. That is precisely why the asymmetry works.

**Feasibility: both are buildable. They differ in cost.**

*Countdown inline* is close to CSS-only. `.time` is a wrapping flex row; inside
`.column-view` it becomes an inline text flow so the time and countdown wrap as one string
rather than as two atomic boxes, with the separator supplied by a `::before`. **The
complication to plan for:** `--calendar-card-event-icon-vertical-alignment` is applied
through `align-items` on a flex container (`styles.ts:664-670`). Inline flow governs icon
position with `vertical-align` instead, so the configured alignment must be mapped across
or it silently stops working — which is objection 2 arriving through the back door.

*Progress bar in its own row* needs a DOM change: it is currently a child of `.time`
(`leaves.ts:541-552`) and must become a sibling within `.time-location`, which is already
`flex-direction: column` (`styles.ts:658-661`), so ordering it above `.time` is then
trivial. CSS alone cannot lift an element out of its parent.

**This follows an existing precedent rather than inventing one.** `renderEventContent`
already takes `weatherPlacement: 'title' | 'row'` for exactly this shape of per-view
difference. Add `progressPlacement: 'inline' | 'row'`, defaulted so list view is unchanged.

**The one thing that must be done deliberately:** `tests/column-dom.test.ts:725` asserts the
two views render event content byte-identically, and `:750` turns `show_progress_bar` on
explicitly. That contract has to widen to *"identical except for documented per-view
placements"*. It is already true in spirit — the weather row is a per-view difference and
survives only because the test configs leave weather off — so this makes an existing
exception explicit rather than creating a new one. Widen it by asserting equality with the
placement parameter held constant, so the test still proves both views share the leaf, which
is what it exists for.

**Still open: how wide is the bar on its own row?** Today it is a fixed `progress_bar_width`,
default `60px` (`config.ts:91`). On a dedicated row the natural answer is to fill the
available width, with `progress_bar_width` reinterpreted as a maximum so anyone who set it
is not overridden. A percentage of column width would need a new key and a default nobody
can guess well.

**Ruled: fill the row, with `progress_bar_width` as a maximum** *(maintainer, 2026-08-12)*.

---

#### C5 — implementation specification

**Files:** `src/rendering/leaves.ts`, `src/rendering/column.ts`, `src/rendering/styles.ts`,
`src/config/config.ts`, `tests/column-dom.test.ts`, plus a docs row.

##### 1. The countdown — CSS only, no template change

Inside `.column-view`, turn the time row into an inline text flow so the time and the
countdown wrap as one string instead of two atomic boxes:

- `.time` stops being a flex container, so `.time-actual` and `.time-countdown` participate
  in normal inline flow;
- `.time-countdown` loses `margin-inline-start: auto`, `text-align: right` and
  `margin-inline-end: 12px` — all three exist to right-align a block that no longer exists
  here — and gains a separator via `::before`;
- `white-space: nowrap` stays, so the countdown itself never breaks mid-phrase.

**The trap.** `--calendar-card-event-icon-vertical-alignment` reaches the icon through
`align-items` on the flex container (`styles.ts:664-670`). Inline flow ignores `align-items`
and positions the icon with `vertical-align` instead, so the configured alignment must be
mapped across or it silently stops working — which is objection 2 returning through the back
door. Cover it with a test that asserts a non-default alignment still has an effect in
column view.

Because nothing moves in the DOM, the byte-identity gate is untouched by this half.

##### 2. The progress bar — a placement parameter

`renderEventContent` already takes `weatherPlacement: 'title' | 'row'` (`leaves.ts:501`) and
column view already passes `'row'` positionally (`column.ts:244-250`). Add
`progressPlacement: 'inline' | 'row'`, defaulted to `'inline'` so list view is unchanged, and
have column view pass `'row'`.

- **`'inline'`** — exactly today's markup: the bar is a child of `.time`, right-aligned.
- **`'row'`** — the bar renders as the **first child of `.time-location`**, before `.time`,
  which places it between the event title and the time. `.time-location` is already
  `flex-direction: column` (`styles.ts:658-661`), so no ordering work is needed. Give it its
  own class so the two placements can be styled independently.

Six positional parameters is past the point where they read well. Converting the tail to an
options object is reasonable, but it touches both call sites and the existing precedent is
positional — decide once, do not do half.

##### 3. Width — the part that does not work as first stated

"Reinterpret `progress_bar_width` as a maximum" cannot be implemented directly, because
`DEFAULT_CONFIG.progress_bar_width` is `'60px'` and is merged in before render. By the time
CSS sees it, a value the user set and a value they never touched are indistinguishable — so
`max-width: 60px` would cap every unconfigured bar at 60px and the row would gain nothing.

Fix it at the source: make the default **absent** and let each placement supply its own
fallback.

- `DEFAULT_CONFIG.progress_bar_width` becomes `undefined`, and the custom property is
  emitted only when the user actually set it.
- Inline placement: `width: var(--calendar-card-progress-bar-width, 60px)` — byte-identical
  behaviour to today for every existing card.
- Row placement: `width: 100%` with
  `max-width: var(--calendar-card-progress-bar-width, none)`.

`check:docs` reconciles `DEFAULT_CONFIG` against the reference table, so the row for
`progress_bar_width` has to change with it. It joins the small set of options whose code
default is `undefined` with a prose default in the docs — that pattern already exists and
already emits an advisory warning, so match how those are written.

##### 4. Alignment of the bar row — confirm by eye

The bar sits between the title and the time. Flush left, aligned with the **title**, reads as
an indicator for the whole event and suits a bar that spans the row. Indenting it to the time
*text* would align it with a row that sits below it, which is the weaker reading. Recommend
flush left; it is a one-line difference and worth checking against a real card.

##### 5. The test contract

`tests/column-dom.test.ts:725` and `:750` compare event content across the two views.
Widen the contract to *"identical except for documented per-view placements"* by comparing
with the placement parameters held equal, so the test still proves what it exists to prove —
that both views share the rendering leaf — and add a separate assertion for the row
placement itself. Do not delete the comparison.

##### 6. Acceptance

- List view renders byte-identically to today, with and without a countdown, and with and
  without a progress bar, at both default and explicit `progress_bar_width`.
- In column view, an event that has not started shows the countdown inline behind a
  separator, wrapping as one string, and never on its own line.
- In column view, a running event shows the bar on its own row between title and time,
  spanning the row, capped only if the user set a width.
- No event ever shows both, which is guaranteed upstream rather than by layout.
- A non-default `event_icon_vertical_alignment` still visibly applies in column view.
- `show_progress_bar` is turned on in at least one test, closing the default-config blind
  spot recorded above.


---

## Distribution & bundle

Neither is owned by a spec; the detail is here.

### X1 — Multi-file distribution — **DONE** *(stage 4; ruled by maintainer, 2026-08-12)*

Built and merged into the v4 branch. The seven live checks below are **still open** and
are the only thing between this and shipping. The evidence that led to the ruling follows
the work list.

#### The work, in order — all done except the live checks

1. **Rollup** — `preserveEntrySignatures: 'strict'`, content-hashed
   `chunkFileNames`. **Done.**
2. **`getConfigElement()`** — `async`, dynamic `import()`, the define guarded on both
   sides of the await. **Done.**
3. **Editor strings** — the eleven `editor` sections moved from
   `src/translations/languages/` to `src/translations/editor-languages/`, imported only
   from `src/rendering/editor/index.ts` and merged into `TRANSLATIONS` at chunk-load
   time. Not deleted: E10 still mines them. **Done.**
4. **`release.yml`** — `files: dist/*.js` plus `calendar-card-pro.zip` for manual
   installers, and `check:bundle` now runs there too, since that workflow is what
   actually publishes. **Done.**
5. **CI assertion** — `scripts/check-bundle.mjs`, `npm run check:bundle`. **Done**, and
   proven by deliberately removing `preserveEntrySignatures` and watching it fail.
6. **The seven live checks** — **still open**, listed below.

**Measured on this branch**, production build, before and after:

| | raw | gzip |
| --- | ---: | ---: |
| eager path before | 390,155 | 114,341 |
| eager path after | 206,655 | 64,945 |
| **change per dashboard load** | **−183,522 (−47.0%)** | **−49,396 (−43.2%)** |

Three files now: a 41 B facade, `calendar-card-pro-<hash>.js` (206,614 B) and
`editor-<hash>.js` (185,475 B). Total shipped is 392,130 B, **1,953 B (+0.5%) more** than
the single file was — bytes on disk up slightly, bytes per dashboard load nearly halved.

#### Found while building it

- **`addTranslations()` could not be used, and using it would have been silent and
  severe.** The specification named it as the registration hook — it exists, and it is
  the obvious candidate — but it *assigns* rather than merges: `TRANSLATIONS[lang] =
  translations`. Registering an editor-only object through it replaces the language's
  whole entry, so `months`, `daysOfWeek` and every card string for that language are
  gone. The card would then render `undefined` for month names in German, triggered by
  nothing worse than opening the editor once, and only for the eleven languages that
  have editor strings. `addEditorTranslations()` merges instead; a test asserts the card
  strings survive registration.
- **Registration mutates the imported JSON module objects.** `TRANSLATIONS[lang]` holds
  the very object `localize.ts` imported, so merging into it means `en.json`'s module
  object *acquires* an `editor` property once the editor chunk loads. Correct — that is
  the mechanism — but it means the imported module stops being evidence about the file on
  disk, so "no `editor` key in `languages/*.json`" cannot honestly be a runtime
  assertion. It is a `check:i18n` check instead, across all 35 files rather than one.
- **Nothing cleaned `dist/`.** Harmless when the output was one fixed filename; not
  harmless once names carry a content hash and `release.yml` globs `dist/*.js` — every
  local rebuild left the previous build's chunks in place to be published as garbage
  assets. The build now wipes `dist/` first (in `rollup.config.mjs`, so `npx rollup -c`
  and the watcher get it too), and `check:bundle` asserts every emitted file is
  reachable from the entry rather than trusting that.
- **Manual-installation instructions were about to become wrong**, in the README and in
  `docs/guide/installation.md`. Both said to download `calendar-card-pro.js` and copy
  that one file, which now yields a 41-byte facade importing a chunk the user does not
  have — a card that silently cannot load. Both now point at the zip. The specification
  listed the zip as an optional nicety for manual installers; it is not optional.
- **The dev build's chunks were indistinguishable from production ones.** Rollup names
  the main chunk after the input module, so a dev build emitted
  `calendar-card-pro-<hash>.js` — the same shape as the production chunk, in a directory
  where both can sit side by side, which is the entire point of the `-dev` suffix.
  Chunk names now carry it too.
- **§3.2's `try`/`catch` sketch was adopted but not as written.** Swallowing the error
  and continuing would hand Home Assistant a broken element; logging alone is invisible
  to the dialog. `getConfigElement()` logs *and* rethrows a message written for the
  person reading the editor dialog, naming the cause (a missing file) and the fix
  (reinstall via HACS) rather than the platform's bare *failed to fetch dynamically
  imported module*.
- **The missing-chunk path cannot be tested under Vitest.** Vite's import-analysis
  resolves `import()` specifiers at transform time, so deleting the editor chunk fails
  at *load* of the parent module rather than at the call — the opposite of browser
  behaviour. Live check 6 stays genuinely live-only. What *was* provable offline, against
  the real built bundle in happy-dom: the facade registers `calendar-card-pro`, the
  editor element is **not** registered until `getConfigElement()` is called, and two
  concurrent calls both resolve without a duplicate-`define()` throw.

#### The evidence behind the ruling

Home Assistant ships translations as separate hashed JSON files fetched at runtime
(`src/util/common-translation.ts`), so a user downloads only their own language. We inline
all 35 languages into one bundle.

This was previously recorded as impossible because HACS distributes a single file.
**That premise is wrong, and the investigation proved it four ways:**

- **HACS code.** `release_contents` returns *every* asset attached to a release
  (`hacs/integration base.py:1236-1253` @ `3249355`). The narrowing filter at `:645-649`
  applies only under `content_in_root`, which defaults to `false` and we do not set.
  `hacs.json`'s `filename` selects which file becomes the Lovelace resource — it does not
  restrict what is downloaded.
- **HACS's own test** asserts a `.png` is downloaded alongside the `.js`
  (`tests/helpers/download/test_gather_files_to_download.py:92-101`).
- **Production existence proof.** `dermotduffy/advanced-camera-card` @ `v7.27.4` ships
  **53 release assets** (52 `.js`, including `editor-*.js` and seven `lang-*.js`) with a
  plain `filename` and no `zip_release`. Verified directly.
- **Download parity.** Its `lang-fr` chunk shows 85,904 downloads against the entry file's
  87,412 — 98.3%. HACS fetches the chunks for essentially every install.

**The distribution change is one line:** `release.yml` goes from `files:
dist/calendar-card-pro.js` to `files: dist/*.js`. `hacs.json` needs no change.

**Measured on our own bundle** (baseline verified locally at 375,155 raw / 110,635 gzip):

| | raw | gzip | Δ gzip per dashboard load |
| --- | ---: | ---: | ---: |
| today | 375,155 | 110,635 | — |
| lazy editor only | 334,855 | 98,101 | −11.2% |
| **+ editor translations in that chunk** | **205,570** | **64,477** | **−41.6%** |

Three files, 0.4% more bytes shipped in total, **42% less on every dashboard load**. Note
what moves where: HACS puts every file on disk, and the *browser* then loads only the entry
plus what it dynamically imports. The saving is bytes-per-load, which is the number that
matters.

**The reframe that makes this simple.** Our card's own strings are 19,468 B across *all 35
languages*. The editor namespace is **87.3% of the translation payload**. So copying HA's
per-language architecture for card strings would save ~4 KB gzip for all of the risk — a
trap. Splitting the *editor* is the whole win, and it takes the projected ~+18 KB gzip for
translating the new namespace off the eager path entirely.

**This is what dissolves X2.** Full language support and the helper prose both become free
for everyone who never opens the editor, so trimming prose or translating labels only are
rejected — they degrade the product to fix a budget problem that has a structural fix.

**The one serious risk, hit in our own build.** HACS registers the resource with a
`?hacstag=` cache-buster, and relative specifiers resolve with the query dropped. If any
chunk imports back from the *entry*, the browser fetches it as a different module and
re-evaluates the whole card — `NotSupportedError: … already been used with this registry`,
editor dead. The first experimental split produced exactly that and would have shipped
broken. The fix is `preserveEntrySignatures: 'strict'`, which emits a 41-byte facade.
**This must be a CI assertion, not a comment** — the reference card carries a warning
comment about it in its own Rollup config, which is evidence that a comment is not enough.

Secondary constraints, all verified: the plugin namespace is **flat**, so no
`dist/translations/de.json` — subdirectories are never fetched (`base.py:1205-1222`);
`/hacsfiles/**` is served `max-age=2678400`, so **content-hashed chunk names are
mandatory**; and `zip_release` must not be used, because for a plugin it would register the
`.zip` itself as the resource.

**Upgrade path is safe and needs no user action.** The resource filename is unchanged (it
becomes the facade), HACS rewrites the `hacstag`, and in release-asset mode HACS never
wipes the directory (`base.py:951`), so upgrades are additive and downgrades safe. Cost is
stale-file clutter. A `dist` zip should be attached for manual installers.

**A missing editor chunk degrades gracefully** — the dialog fails to open and the card keeps
rendering, because HA awaits `getConfigElement()` (`frontend hui-element-editor.ts:370`).

Full detail and source citations: [`multifile-distribution.md`](./multifile-distribution.md).

#### The seven live checks — **open**, and the gate on shipping

None of this can be proven from source, and the offline work above deliberately does not
claim to have. On a real Home Assistant, before release:

1. **Upgrade in place** — install the current release via HACS, upgrade to a multi-file
   pre-release, confirm the card renders **without clearing the browser cache**.
2. **Every chunk arrives** in `www/community/calendar-card-pro/` after the download.
   Three files: `calendar-card-pro.js`, `calendar-card-pro-<hash>.js`,
   `editor-<hash>.js` — plus `calendar-card-pro.zip`, which HACS downloads like any
   other asset and never registers.
3. **The editor opens**, and the Network tab shows its chunk fetched *on open*, not on
   dashboard load — otherwise the split achieved nothing. (The module-graph half of this
   is proven offline: the editor element is not registered until `getConfigElement()`
   runs. What needs a browser is that the *fetch* is deferred too.)
4. **No duplicate registration.** Watch specifically for `NotSupportedError: … has
   already been used with this registry` after opening the editor. That is the
   `?hacstag=` trap recurring, and the one thing `check:bundle` cannot observe: it
   asserts the module graph, not what a browser does with a query string.
5. **YAML-mode dashboards**, where cache headers are off and resources are hand-managed.
6. **A deliberate 404** — delete the editor chunk from disk and confirm the card still
   renders and the failure is readable. Vitest cannot stand in for this: Vite resolves
   `import()` at transform time, so the failure lands in the wrong place entirely.
7. **A downgrade** back to a single-file version.

Full detail and the source citations behind each finding:
[`multifile-distribution.md`](./multifile-distribution.md).

#### Side-finding — the sourcemap comment stopped being true — **corrected**

`rollup.config.mjs` disabled sourcemaps with the reasoning that the release attaches only
`dist/calendar-card-pro.js`, so a `.map` would 404 in every browser (#315, #358). The
workflow now globs, so that specific reason is gone. The comment states the real current
reason instead: nothing publishes a `.map` at all, because `files: dist/*.js` does **not**
match `*.js.map`. Sourcemaps remain off; turning them on means shipping the maps too, and
is its own decision rather than a drive-by. The assertion moved from an inline `grep` in
`ci.yml` into `check:bundle`, which also means it runs locally and in `release.yml`.

### X2 — Editor translation budget — **Dissolved by X1**

Measured, not estimated. The new English string table is **19,154 B across 138 keys**
against the old section's 11,818 B across 239 keys — 62% larger with 42% fewer keys,
because **67% of it is helper prose**. Projected across 11 languages, roughly **+18,000 B
gzip net** even after deleting the dormant sections.

X1 has landed, so this cost is off the eager path and no longer needs solving: the whole
editor namespace, translated to whatever depth E10 reaches, is downloaded by HACS and
parsed only by the browsers that open the editor. The maintainer's ruling that **language
support is not to be reduced** and that clear prose is worth having costs nothing to
honour. Nothing has to be cut.

---

## Cross-cutting

| # | Item | Status | Note |
| - | ---- | ------ | ---- |
| Y1 | **Production log level policy** | Open | `rollup.config.mjs` pins `CURRENT_LOG_LEVEL` to `0` in production, so **all 17 `Logger.warn` call sites are invisible to real users** — including user-actionable ones such as *"Invalid start_date … falling back to today"* and *"Could not load calendar(s)"*. Roughly half look user-facing and half internal, so raising the level is a judgement call rather than a flag flip. The deprecation notice added in #408 sidesteps this with an ungated `Logger.deprecation`. |
| Y2 | **Split `column-view.md`** | Open | ~2,400 lines. Long-standing plan: a short current-state specification plus an archived rationale log. A3-A's `date_vertical_alignment` → `align-self` analysis must survive any split. |
| Y3 | **Dead key in the frozen capture view** | Open | The `ccp-release-header` view on the admin dashboard uses `max_events_to_show`, removed in v3.0.0, so its release screenshots have been ignoring that limit since. The view is deliberately frozen for visual comparability, so changing it needs an explicit decision. |

---

## After v4

| # | Item | Note |
| - | ---- | ---- |
| Z1 | **Day-navigation controls** | `«` `‹` Today `›` `»`. Would apply to all three views and must be optional so it does not bloat the UI for people who do not want it. The prototype re-slices an oversized fetch; ours is sized to exactly `days_to_show`, so the fetch-window question has to be settled first — G10 and E-crit 3 forbid a refetch on navigation. |
| Z2 | **Grid view** (Phase 5) | The `grid` name is reserved by A3-H; nothing is built. Feasibility assessed: the architecture generalises, with named changes. Must be rebuilt on the seven commits on the frozen `alexpfau-review-339-time-grid` branch so attribution survives. |
