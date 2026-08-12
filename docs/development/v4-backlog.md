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
| E2 | **Exceptions widget** (`column:` overrides) | **Done** (stage 3) | Hand-written, one collapsed group at the end of each panel that owns an overridable option. A `select multiple` names the options with an exception — adding and removing are the same edit in two directions — and the rows below are the panel's *own* schema nodes, so an exception has the same control as the option it overrides. Removal deletes the key and drops an emptied block. `ha-form-optional_actions` stays rejected and the reading was confirmed against `home-assistant/frontend`. Reached 49 of 52 override keys; E11 took it to 52. |
| E3 | **Search & "Customized only" filter** | **Done** (stage 6) | The payoff arrived as promised — the schema *is* the field registry, so both filters are a `.filter()` over the arrays a panel already builds, in one DOM-free module (`filter.ts`) that is unit-tested without rendering anything. Search matches the **resolved** label, helper and option labels as well as the config key, because *Minimum Day Width* is what the user is reading and `min_day_width` is what the reference gave them. A panel or group whose own heading matches is kept whole; one the filter empties is not rendered at all, and what survives renders **expanded** — nine collapsed headings would answer *which section* when the question was *where*. **Three things the design got wrong.** (1) Its predicate — `!deepEqual(value, defaultFor(key))` "reusing the comparison `filterDefaultValues` already performs on save" — is wrong three times over: `filterDefaultValues` compares with `===` and passes `weather` through unconditionally (the unsoundness already recorded as correction 4), a bare comparison against raw YAML reports a quoted `'3'` and a rejected `-1` as customized when the card renders the default in both cases, and it cannot express the `column:` block at all, whose `min_days_to_show` defaults to `days_to_show` and whose overrides are redundant against `COLUMN_DEFAULT_OVERRIDES` rather than against the top level. The predicate asks `toStoredConfig` for anything in an override block and `normalizeNumericOptions` for everything else — the same *coerce through `config.ts`, do not re-derive* rule stage 5 arrived at. (2) Its filter sketch carries no paths, so it could not have resolved a label to match against and could not have told a flattened group's child (stored at the top level) from a nested one; the real filter tracks the label path and the data path separately, as Home Assistant does. (3) It assumed a search box needs a text input, which would have been the editor's **fourth** HA component and its first input element — the one class HA renames. The bar is a two-field schema fed to the `ha-form` that is already there. **Found while building it:** `check:i18n` had an accidental root — `entity.copy` and its three neighbours were reachable only because the *Weather* panel happens to hold a field named `entity`, so renaming that field would have reported four live chassis strings as dead. The chassis now declares its own schema and prefixes (`chassisSubforms`, `CHASSIS_STRINGS`) and the check reads them. **Verified live at `?v=289`:** typing *width* narrowed the editor from **28 panels / 99 selectors to 5 / 9**, and it still reports **0 `ha-textfield`** — the bar really did go in as an `ha-form` schema. The eager bundle is **unchanged at 208,502 B**; the whole feature (+6,456 B) landed on the lazy editor chunk, which is what the split was for. |
| E4 | **Drag-to-reorder calendars** | **Done** (stage 3) | One flag, as hoped. `EntitySelector` carries `reorder?: boolean` (`frontend:src/data/selector.ts`), forwarded as `.reorder` to `ha-entities-picker`, which without it instantiates `ha-sortable` with `disabled=true` **and renders no drag handle** — so the list genuinely could not be reordered before. Added in PR #26217, merged 2025-07-18, so **HA 2025.8+**; an older instance ignores an unknown selector option and renders the list exactly as it does today. No drag implementation of ours. |
| E5 | **Compact mode group: order & gating** | **Done** (stage 5) | **The request's premise was inverted, and reading the code is what showed it.** There is no compact-mode toggle: `compact_days_to_show` and `compact_events_to_show` *are* compact mode — either one on its own switches it on — and `compact_events_complete_days` ("Finish The Last Day") is not a third limit but a **modifier of the event limit**, read only inside the branch guarded by a finite `compact_events_to_show` (`events.ts:519-530`). So the two inputs are **not** inert when the switch is off; they are the only live controls in the group, and gating them behind it would have hidden them. The dependency runs the other way, and was implemented that way: the modifier is held back until there is an event limit for it to modify, which is the `uv_index_threshold` pattern. The requested reorder is moot for the same reason — leading the group with the modifier would place a control above its own dependency, and the existing order already reads root-first. **Applicability is now stated once on the group** via `GROUP_SCOPE` in `localize.ts`: a group names one config key whose scope it speaks for, the scope itself still comes from `VIEW_SCOPE`, and a child is silenced only when its own scope is *identical*, so a differently-scoped field added to a scoped group keeps its own note. The two per-field notes the group replaces were deleted rather than left dead. |
| E6 | **Helper-text copy pass** | **Done** | **Six of this entry's eight claims described the editor that was replaced, not the table that exists.** Verified by `git log -S` against `strings.ts`: `show_past_events.helper`, `show_empty_days.helper` and `show_countdown.helper` have **never existed** in the new namespace — those fields carry no helper at all, which is already the answer this item asks for. The weekend and today colour groups do not restate anything: each states its fallback chain, which is the one thing about them that is not obvious. The week-number helper did **not** lose the ISO-versus-simple explanation; it carries a fuller one than the old editor's, and has since the panels landed (`a575b69`). `split_multiday_events` *does* say that column view defaults it to `true` — through `view_default.column.split_multiday_events`, which is where E5 decided that sentence belongs. What was left after that was the two real ones. **Deleted, not rewritten:** `height_mode.helper` (a prose reading of its own three option labels — *Fit content*, *Fixed height*, *Maximum height*) and `today_indicator.helper` ("a mark on the current day" under the heading *Today Indicator*). **`panel.calendars.helper` was deleted and then put back**, rewritten: every panel having a one-line orientation is a rule with a test behind it, so the answer there was to say the half the title does not — that per-calendar labels, colours and filters live in this panel too. **The compact stutter needed a code change, not only copy.** Both halves said "apply", and the note arrived *first* — "These apply to the list layout…" above the sentence that said what "these" were. `computeHelper` now appends a **group's** scope note instead of prefixing it, while a **field's** note still comes first: a field's note qualifies a control the reader can already see and name, a group's would land before the reader knows what the group is. Pinned by a test that reads the composed paragraph, and by a second one that fails any helper whose every non-filler word is already in its label. |
| E7 | **UV index and low temperature are mutually exclusive** | **Done** (stage 5) | Stated on `date.show_low_temp` as a path-qualified helper — *"The UV index takes this place on days it is shown."* — and in the reference and feature tables. Not hidden, and hiding would have been actively wrong: `showUvIndex` also requires `uv_index >= threshold`, so with a threshold set the low temperature legitimately appears on low-UV days. It is per-day runtime precedence, not a static rule. |
| E7b | **Column-view meaning of `show_conditions`** | **Done** (stage 5) | Path-qualified helper on `event.show_conditions`, no `VIEW_SCOPE` entry, exactly as ruled — the option is not inert in column view, and `applicabilityNote` keys on the bare `schema.name`, which both weather groups share. A third string documents the new `weather.event.max_lines` (C2b), also path-qualified for the same reason: a bare `max_lines` entry in `VIEW_SCOPE` would sit in a table of top-level config keys and could collide with a future one. |
| E8 | **Two placement questions** | **Ruled — both stay put**, and neither was a coin-flip | **`first_day_of_week` stays in Time Range & Content.** It reads as a week-numbering concern, but it has three effects in `events.ts`: the cache key, the week/month metadata *and* `getStartDateReference()` — so it decides what `start_date: 'week'` anchors to. Moving it beside `show_week_numbers` would hide a control that governs the visible date range behind a *display* toggle the user may have switched off. That is the same failure Stage 5 caught in compact mode: gating a live control behind a switch that does not own it. **`day_header_gap` stays in Layout.** The Separators panel groups by what a thing *is*, which is why the pull felt right, but this key exists precisely to break that association — `styles.ts` records that the gap used to be 4px of padding plus 4px of margin under the rule, so *turning the separator off silently halved it*. The key was introduced to make the gap constant whether or not a rule is drawn. Filing it under Separators would reinstate, in the UI, the exact misconception the code was changed to remove. No code change; both panels are already correct. |
| E9 | **Fate of the synthetic calendars multi-picker** | **Kept** (stage 3) | **Ruled — kept, unchanged.** The picker and the per-calendar list are one control split by responsibility: membership and order above, settings below. Unwinding it would leave no way to *add* a calendar at all, and its identity-preserving merge is exactly what keeps a deselected calendar's settings alive — the property the per-calendar list depends on. It is also what HA's own calendar card does (`<ha-entities-picker>` above hand-written fields), and it is where `reorder` lands for E4. Reversible if the maintainer disagrees: the list below does not depend on the picker being synthetic, only on `entities` keeping its order. |
| E10 | **Translations for the new namespace** | Open — unblocked by X1 | English only today. The plan: mine the dormant sections in `src/translations/editor-languages/` for anything reusable, translate, then delete them. X1 moved them off the eager path, so the ~+18,000 B gzip this was budgeted at is now downloaded by HACS and parsed only by browsers that open the editor — translate to whatever depth is worth doing, and a partial translation is safe because each key falls back to English on its own. |
| E11 | **Exceptions for the three union-typed override keys** | **Done** | **The mechanism this entry was waiting for turned out to be one the editor already had.** The synthetic fields read and write a `Types.Config`, but nothing in them is *about* the card — `week_number_mode` reads `show_week_numbers` and writes it back, and neither half cares whether the object handed to it is the configuration or a `column:` block with the same key in it. So the exception needs no second derivation, it needs the same one pointed at the block, and `overrides.ts` is the plumbing that points it there: the mode dropdowns come from the panels that own them (`todayIndicatorFields`, `weekNumberFields`, `locationCountryFields`, now exported and used in both places), and `applyFormChange` folds the block exactly as it folds the card. **One thing genuinely differs, and it is the whole item:** absent means the opposite in the two scopes. At card level a missing key takes its default, so *None* is written by removing it; inside a block a missing key **inherits**, so the same write would delete the exception the user just asked for. Each key therefore names its explicit "off" — `null` for `show_week_numbers`, `false` for the other two — written only when a change would otherwise have removed the key, so declaring an exception still stores nothing until its value moves. `value.ts` already documented `column: { show_week_numbers: null }` as meaningful and `stripColumnDefaults` already declined to treat `null` as absent, so the block half was in place before there was a control that could produce it. **Coverage is now 52 of 52** and the test that asserted the set of three missing keys asserts an empty set. Also found: the exceptions form was writing `event.detail.value` **whole**, so every projected default rode back into the block on every keystroke and was only saved by `stripColumnDefaults` on the way out; it is a diff now, like every other write path. |
| E12 | **Per-calendar label has no type picker** | **Done** | **The blocker this entry names does not apply.** It says a per-item synthetic field is needed and `SYNTHETIC_FIELDS` is keyed per card — but the per-calendar list already has its own per-item derive/apply layer (`toEntityFormData` / `fromEntityFormData`, built for the tri-state switches), and that is where this belongs. `SYNTHETIC_FIELDS` is not involved at all. **~120 lines against the old 209**, and the difference is almost entirely rendering: no `_renderTypeSelector`, no `_renderTypeField`, no `staticHtml`/`getInputTag` shim, because the selector *is* the schema — plus the old pair was shared with the today indicator, which the rebuild already pays for separately in `synthetic.ts`. The type is derived from the value's shape by `getLabelType`, written beside `getTodayIndicatorType` in `utils/helpers.ts` and pinned against what `renderLabel` actually draws by `label-glyph.test.ts`, because `leaves.ts` is owned by other work in flight and could not be made to call it in the same change — **it should, once that lands**. **No held-text mechanism, deliberately, and this is where the today-indicator precedent stops applying:** there, an unrecognised string silently reclassifies to *dot* and the typed text becomes a lie, so it must be held; here the classification tracks the text truthfully at every keystroke, and holding `mdi:calendar` typed into the text box would mean it could never be committed at all. It is stored verbatim and the picker takes over on the next render. **Two things came free:** `label_icon_color` is now shown only where the label is an icon (it does nothing otherwise, and used to sit under every calendar with a helper explaining that), and the picker gives the icon shape a real icon browser rather than a box you have to know `mdi:` to use. The declared schema stays one static array — the superset, so `check:i18n` reconciles every shape — and `entitySchemaFor` narrows it per calendar, which is the same act `filterEntitySchema` already performed per calendar. |
| E13 | **`features/editor.md` still describes the editor that was replaced** | **Done** except the screenshot | Panel list rewritten from `strings.ts` rather than from memory — nine panels with their real labels and one-line purposes. *Smart Validation* dropped (it described input widgets the schema-driven editor does not have) and replaced with *Search*, *Customized Only* and *Per-View Exceptions*, which it does. *Configuration Upgrader* rewritten as *Deprecated Options*: verified against `value.ts` that there is no button any more — `pruneDeprecatedKeys` removes the five dead names when the editor saves, and deliberately does **not** fill in replacements, since the card has been running on defaults for those settings and adopting them is a change the user should make knowingly. **Still open: the screenshot**, which shows the old element and a label text field that is now a type dropdown. It lives at a `main`-branch raw URL, so replacing it is a release-time task, not a docs edit. |

### Editor: closed in review, recorded so it is not re-litigated

- **"Customized" is a question about the effective value, not about the YAML.** The editor is
  handed raw configuration and the card normalizes on every `setConfig`, so a comparison against
  `DEFAULT_CONFIG` answers wrongly in both directions — `days_to_show: '3'` renders an identical
  card and `days_to_show: -1` is discarded in favour of the default, and a naive predicate calls
  both customized. Everything numeric goes through `normalizeNumericOptions` first, and anything
  inside a view's override block is asked of the write path, which already owns the composed
  default. The general rule is the one from stage 5: **coerce through `config.ts`, do not
  re-derive** — and where the write path can answer, ask it rather than reimplementing it.
- **The label path is not the data path, and a filter needs both.** `ha-form-expandable`
  qualifies its children's label keys whether or not it is flattened, while their data only nests
  when it is not. `walkSchema` yields the label path, which is right for strings and wrong for
  values: used as a data path it would look for `compact_mode.compact_events_to_show` and report
  every field in every flattened group as untouched.

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

| C3 | **Named view predicates** | **Done** — the count was misleading | Re-counted before acting, and the "13 gates" does not mean 13 policy decisions. **Eleven are inside `src/config/view.ts` itself**, which is where view semantics are *defined* — a comparison there is the vocabulary, not a leak of it. The one genuine policy gate the entry names, `events.ts` compact limits, **was already fixed**: it calls `viewAppliesCompactLimits()` and `viewForcesMultidaySplit()`. That left two, both **dispatch rather than policy**. `calendar-card-pro.ts:1232` chooses which renderer to call; a third view needs a third branch there whatever the spelling, so a predicate would be noise — left alone deliberately. `render.ts:64` mapped view to a root CSS class through a ternary, and that one was worth changing: it is a *mapping*, not a yes/no, and the ternary would have silently handed a time grid the **list** class — a broken layout rather than a visible error. Replaced with an exhaustive `viewCssClass()` switch, and the improvement was proven rather than asserted: adding `'grid'` to `EffectiveView` now fails `tsc` with `TS2366`, where the ternary compiled clean. Zero snapshot drift; the rendered attribute is byte-identical. |
| C4 | **Column view as its own docs page** | **Done** | Extracted to `docs/features/column-view.md` (200 lines) with a nav entry; `core-settings.md` drops from 402 to 211 lines and keeps a short signpost so an existing bookmark is not a dead end. The eight `###` subsections became `##` and took emoji per the style rules — anchors are unchanged, since slugify strips emoji, so only the *page* part of each inbound link needed repointing. `check:docs` caught three things a manual pass would have shipped: two `configuration.md` links to `#options-that-start-from-a-different-default` that still named the old page, and a British *colour* in the intro I had just written. |
| C5 | **Countdown & progress bar on their own row in column view** | **Done** — verified live at `?v=290` | Built as ruled: the countdown stays inline with the time and gains a middot separator, the bar takes its own row above the time. `renderEventContent`'s optional tail became an options object with `progressPlacement: 'inline' \| 'row'`; positional would have put two independent `'row'` literals either side of `hass`. `progress_bar_width` now defaults to `undefined` and the custom property is emitted only when set, so each placement carries its own fallback and the maintainer's three cases fall out with no new mechanism. **Two spec errors, both in §1.** Dropping `display: flex` from `.time` would *not* have made the time and countdown "wrap as one string": `.time-actual` is a flex container wrapping a `-webkit-box` clamp, so the time is an atomic inline-level box either way — and being block-level it would have stacked *above* the countdown rather than beside it, which is worse than the defect. And the trap it warned about cannot fire as described: `--calendar-card-event-icon-vertical-alignment` never reaches `.time` at all, because `.time`'s own later rule hardcodes `align-items: center` over the shared one, and the time icon is nested inside `.time-actual` (also hardcoded `center`) rather than being a child of `.time`. Built as a flex row instead — `justify-content: flex-start` plus dropping the countdown's auto margin — which dissolves the trap rather than mitigating it. **Open for the maintainer's eye:** the row width, shipped at `75%`; see the marked token in `styles.ts`. **Verified live.** The progress bar renders on its own row directly under the title and above the time, left-aligned with the text; the countdowns read `All day · in a day` and `7:00 - 23:59 · in 13 hours` inline after a middot. The narrow-column stranding the maintainer reported is gone. **The 75% default reads correctly to my eye** — clearly a progress indicator rather than a full-width block — but it is his call and it is a one-line change; a 40% `column:` exception is on the test tab beside it for comparison. |
| C6 | **Weather row: colour, composition, spacing** | **Done** — verified live at `?v=288` | All three fixed and confirmed by eye in column view: the row now matches the grey of its time and location siblings, reads `29° · UV2 · Sunny`, and the day-header gap is closed. The middot ruling **proved itself in the wild** — a live event rendered `20° · UV0 · Clear, night`, where a comma separator would have produced `20°, UV0, Clear, night` with our separator indistinguishable from the one inside HA's own translated string. List view is untouched per the maintainer's ruling; the separator rule is scoped under `.time-location`. **My acceptance criterion was self-contradictory** — I required the day-header template whitespace fix *and* untouched snapshots, which cannot both hold. The snapshots are byte-identical once whitespace is stripped and every hunk sits inside a `.weather` div; list rendering is unaffected because that container is `display:flex` and was discarding the whitespace anyway. **The mechanism was not the one I specified, and the correction matters.** I diagnosed it as the `progress_bar_width` shape — a default merged in before render that CSS cannot distinguish from a user value. It is not: `setConfig` merges *shallowly*, so a hand-written `weather:` block replaces the sub-tree whole and `weather.event.color` was already absent on that path. The real cause is the **editor**: `weather` is an `ATOMIC_KEY`, so a touched block is written entire and picking a weather entity baked `color: "var(--primary-text-color)"` into the YAML. Same fix, different bug class. **Follow-up checked and closed:** this does *not* need a migration. The shipped 3.x editor mutates its config in place and never wrote the weather defaults (`value.ts` says so explicitly), so no released card can carry a baked colour — only cards configured with an unreleased v4 dev build, which is the maintainer's own test tab. |

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

**How wide is the bar on its own row?** Today it is a fixed `progress_bar_width`, default
`60px` (`config.ts:91`), which is right for a bar sharing a line with the time and too narrow
for one that owns a row.

**Ruled** *(maintainer, 2026-08-12)*: the row gets its own default width, and
`progress_bar_width` **overrides it** — a plain width, not a maximum. The three cases the
maintainer named are then exactly what falls out: unset, each placement uses its own
fallback; set at the top level, both views use that value; set inside `column:`, the two
views differ. **The row's default value is deliberately not fixed here** — `100%` was the
first proposal and something narrower may read better, so it is settled by eye rather than by
argument.

Note this supersedes the maximum semantics proposed earlier in this section: a max cannot
express "wider in the row than inline", which is the whole point, and it reads worse — a user
who types a width expects a width.

---

#### C5 — implementation specification

::: warning Superseded in Part — Read This First
**§1 is wrong and was not built as written**; the rest was built as specified. Both errors
are recorded in the C5 row above and corrected in place below. In short: `.time` stays a
flex container, and the trap §1 warns about cannot fire, because the property it protects
never reached that row in the first place. Everything below §1 held.
:::

**Files:** `src/rendering/leaves.ts`, `src/rendering/column.ts`, `src/rendering/styles.ts`,
`src/config/config.ts`, `tests/column-dom.test.ts`, plus a docs row.

##### 1. The countdown — CSS only, no template change

**As specified, and not built.** Inside `.column-view`, turn the time row into an inline
text flow so the time and the countdown wrap as one string instead of two atomic boxes:

- `.time` stops being a flex container, so `.time-actual` and `.time-countdown` participate
  in normal inline flow;
- `.time-countdown` loses `margin-inline-start: auto`, `text-align: right` and
  `margin-inline-end: 12px` — all three exist to right-align a block that no longer exists
  here — and gains a separator via `::before`;
- `white-space: nowrap` stays, so the countdown itself never breaks mid-phrase.

**The trap, as specified.** `--calendar-card-event-icon-vertical-alignment` reaches the icon
through `align-items` on the flex container (`styles.ts:664-670`). Inline flow ignores
`align-items` and positions the icon with `vertical-align` instead, so the configured
alignment must be mapped across or it silently stops working.

**🚨 Both paragraphs above are wrong, and were corrected during implementation.**

*The mechanism does not do what it claims.* The time and countdown cannot "wrap as one
string" under either model: `.time-actual` is itself a flex container wrapping a
`-webkit-box` clamp, so the time is an **atomic inline-level box** either way and the
wrapping behaviour is identical. What inline flow would actually have changed is worse than
the defect being fixed — `.time-actual` is *block-level*, so it and the countdown would have
stacked vertically instead of sharing a line.

*The trap cannot fire as described.* `--calendar-card-event-icon-vertical-alignment` does
not reach `.time` today: the shared rule sets it, and `.time`'s own **later** rule — same
specificity, so source order wins — hardcodes `align-items: center` over the top. Nor is the
icon a child of `.time`; it sits inside `.time-actual`, which hardcodes `center` of its own.
The property is inert on this row in **both** views, and has been. Filed as **Y4/Y5** in
Cross-cutting; not fixed here, because the correction lands in a shared rule and would move
list-view rendering.

**Built instead:** `.time` stays a flex row. `justify-content: flex-start` replaces
`space-between` and the countdown loses `margin-inline-start: auto`, which lands it under
the time rather than at the right edge of an empty second line — the same visible outcome
the inline-flow proposal was reaching for, with `align-items` still working untouched. The
separator is a `::before` middot as specified. `stylesheet.test.ts` pins the flex row, the
`.time-actual` display, and the alignment declaration, so the proposal cannot be
reintroduced silently.

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

**Built: the tail became an options object**, all of it, in one move. Positional would have
put two independent string unions both containing `'row'` either side of `hass` —
`(…, 'row', hass, 'row')` at the call site, with nothing but argument order distinguishing
them. Two call sites, no test callers, so the conversion was contained. The bar carries
`class="progress-bar progress-bar-row"`: a modifier on the sized box rather than a wrapper,
since `.time-location` is already the column flex container.

##### 3. Width — why the default has to move

Whatever the row's width ends up being, it cannot be expressed while
`DEFAULT_CONFIG.progress_bar_width` is `'60px'`, because that default is merged in before
render. By the time CSS sees the value, one the user set and one they never touched are
indistinguishable — so the row would be pinned to 60px for everybody, and a per-placement
default would be unreachable.

Fix it at the source: make the default **absent** and let each placement supply its own
fallback.

- `DEFAULT_CONFIG.progress_bar_width` becomes `undefined`, and the custom property is
  emitted only when the user actually set it.
- Inline placement: `width: var(--calendar-card-progress-bar-width, 60px)` — byte-identical
  behaviour to today for every existing card.
- Row placement: `width: var(--calendar-card-progress-bar-width, <row default>)`.

**The row default is not settled and should not be guessed** *(maintainer, 2026-08-12)*.
`100%` was the first proposal; a narrower value may read better. Pick a starting value, then
settle it by eye in a dev build at 3, 5 and 7 columns — it is a one-token change and there is
no argument that decides it from a desk.

**Shipped at `75%`**, marked in `styles.ts` as the token to change. A percentage rather than
a length, because the row is as wide as the column and that is exactly what the inline
`60px` cannot track. Smaller than `100%` as asked: a full-width rounded bar in a 20% tint,
flush to both edges of the event, reads as a rule *between* rows — which is the reading that
took the day-header separator off by default (B2). Leaving a visible gap at the trailing edge
keeps it reading as a graphic belonging to the event above it. **Still to be settled by eye.**

**Also unspecified and decided during build:** `margin-top: 2px`, matching the 2px every
other content row carries, so the bar sits in the same vertical rhythm as time / location /
description rather than hugging the title. Same status — one token, worth a look.

**Per-view values come for free.** `progress_bar_width` is already in `COLUMN_OVERRIDE_KEYS`
(`view.ts:25`), so the three cases the maintainer asked for all work with no extra
mechanism once the default is absent: unset gives each placement its own fallback; a
top-level value applies to both views; and a `column:` exception gives the two views
different values. The editor already offers it in the exceptions widget, since eligibility is
derived from `COLUMN_OVERRIDE_KEYS` rather than listed by hand.

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

**Built, with one refinement.** The placements cannot be "held equal" at the container level
— each renderer hardcodes its own — so the comparison **folds** rather than deletes: the
column's `.progress-bar-row` is moved back to the inline position and stripped of its
modifier before comparing, so its presence, classes, fill percentage and inline style are all
still compared and only its parent is normalized. Moving a node moves the text nodes around
it, so between-tag whitespace is normalized too (`>\s*<`, one character wider than
`list-dom.test.ts`'s `>\s+<`, because the fold can leave two tags flush); whitespace adjacent
to text still survives verbatim.

Two further guards, because a normalizing comparison is easy to make vacuous:

- The **default-config** comparison keeps the strict byte-identical `eventContents`. No
  placement fires there, so the stronger assertion is kept where it can be.
- A new test asserts the **strict** comparison genuinely *fails* on the same input the folded
  one passes, so the fold is provably neutralizing a real difference rather than decorating a
  pass.

Plus explicit placement tests: the bar is a child of `.time-location` and first among its
children in column view, a child of `.time` with no modifier in list view; and the countdown
stays a child of `.time` in **both**, which is what stops a future change reaching for markup
where C5 chose CSS. The stylesheet half is pinned in `stylesheet.test.ts` (11 assertions),
and `progress-bar-width.test.ts` covers the three resolution cases plus the
does-not-reach-YAML round trip.

##### 6. Acceptance

- List view renders byte-identically to today, with and without a countdown, and with and
  without a progress bar, at both default and explicit `progress_bar_width`.
  — ✅ `tests/__snapshots__/` is untouched by the whole change; verified with
  `git diff --stat tests/__snapshots__/` returning empty.
- In column view, an event that has not started shows the countdown inline behind a
  separator, wrapping as one string, and never on its own line.
  — ⚠️ **Partly unachievable as written, and it was never achievable.** The countdown is
  inline behind a separator, and stays a child of `.time` under every config. But it cannot
  "wrap as one string": `.time-actual` is atomic (see §1), so on a column too narrow for both
  the countdown *does* move to a second line — left-aligned under the time, carrying the
  separator with it. That is the fix for the reported defect, which was that it landed
  **right-aligned in dead space**; "never on its own line" was a property of the mechanism §1
  proposed, and that mechanism does not exist.
- In column view, a running event shows the bar on its own row between title and time,
  spanning the row, capped only if the user set a width. — ✅ (a *width*, not a cap; §3.)
- No event ever shows both, which is guaranteed upstream rather than by layout. — ✅
- A non-default `event_icon_vertical_alignment` still visibly applies in column view.
  — ⚠️ **Cannot be asserted for the time row, and could not have been before C5 either.**
  The property is overridden to `center` on `.time` and hardcoded `center` on `.time-actual`
  (Y5). Asserted instead where it genuinely applies — `.location` and `.description` — plus
  that column view adds no `display` or `align-items` override, so the row resolves
  identically in both views.
- `show_progress_bar` is turned on in at least one test, closing the default-config blind
  spot recorded above. — ✅ In five, across three files.

**Live checks owed** (maintainer deploys, per the working split): the `75%` row width and the
`2px` row margin at 3, 5 and 7 columns; the middot separator's 8px spacing either side; and
the countdown's wrapped second line at the narrowest track.


---

#### C6 — weather presentation
Found by the maintainer against `?v=286`. Three separate defects, all in the same area.
##### 1. The row renders in the title's colour, not its neighbours'
`weather.event.color` defaults to `var(--primary-text-color)` (`config.ts`), while `time_color`
and `location_color` both default to `var(--secondary-text-color)`. That default was right for
the placement it was written for — the title-row badge sits beside the black summary — and is
wrong in the row placement, where the badge is one of four siblings and the other three are
grey. The icon is worse: it is given no colour at all, so it simply inherits.
**Same shape as `progress_bar_width`, and the same fix.** The default is merged in before
render, so CSS cannot tell a value the user set from one they never touched. Make
`weather.event.color` **absent by default** and let each placement supply its own fallback:
title keeps `var(--primary-text-color)`, row uses `var(--secondary-text-color)`. Apply the
resolved colour to the **icon** as well as the text.
Check `weather.date.color` at the same time — the day header has its own placement and may
have inherited the same assumption.
##### 2. The composed string is not a string
It renders as `30°Sunny`, and with UV on as `30° UV4Sunny`. Three causes, one of them
structural:
- **No separators exist.** The pieces are sibling `<span>`s in a flex container with no `gap`,
  so the whitespace in the template collapses away entirely — flex containers drop
  inter-item whitespace, and a flex item's own leading and trailing whitespace is stripped.
  The `2px` margin on `.weather-uv-index` is why a gap appears there and nowhere else.
- **The condition can itself contain a comma.** HA's own vocabulary includes
  *"Clear, night"* — visible in the maintainer's screenshot as `20° UV0Clear, night`. So a
  comma separator would produce `20°, UV 0, clear, night`, where nothing distinguishes our
  separator from the one inside the translated string. **Use a middot.**
- **Capitalisation should be left alone.** The obvious reading of `30° · Sunny` is to
  lowercase the condition, but the string is HA's translation and we do not know the grammar
  of 35 languages — in some, downcasing a weather term is simply wrong. A middot separator
  makes each piece a standalone chip, where HA's own capitalisation reads correctly. So this
  is not a compromise: choosing the separator dissolves the capitalisation question.
Target: **`[icon] 30° · UV 4 · Sunny`**, with separators only between text pieces and never
after the icon. Implement with `span + span::before` so the separator follows from which
pieces are present, rather than being emitted by the template for every combination.
Two things to settle while building: whether `UV4` becomes `UV 4` (it reads better and costs
one character; the day header spells it the same way, so change both or neither), and whether
the title-row badge gets the separators too. Recommend yes to both — the badge currently shows
`30° UV4` for the same reason, and consistency between the two placements is worth more than
the two characters.
##### 3. The day header adds a phantom space, only in column view
The temperature sits too far from the icon in the column day header. `.weather ha-icon` sets
`margin-right: 1px`, so the CSS is not the cause. The template is: `renderDateWeather` emits
`` html` <span class="weather-temp-high">…` `` — with a **leading space inside the template
literal**. In list view `.date-column .weather` is `display: flex`, which discards it. In
column view `.column-date-content .weather` is a grid item with no `display: flex`, so the
same markup renders that space for real, on top of the margin.
**Fix the template, not the container.** Removing the stray whitespace corrects both
placements and cannot regress either. Do **not** make the column container flex to absorb it:
it carries `text-overflow: ellipsis` and `white-space: nowrap`, which need a block container
to work, so flexing it would trade a spacing bug for a truncation bug.
##### Acceptance
- In column view the weather row's icon and text match the time and location rows, and no
  card that sets `weather.event.color` changes appearance.
- List view renders byte-identically to today — the DOM snapshots must pass untouched.
- The composed string shows separators between every adjacent pair of text pieces and none
  after the icon, at every combination of temperature, UV and condition.
- A condition containing a comma is still unambiguous.
- The day-header icon-to-temperature gap is identical in both views.

---

## Distribution & bundle

Neither is owned by a spec; the detail is here.

### X1 — Multi-file distribution — **DONE** *(stage 4; ruled by maintainer, 2026-08-12; reshaped to two files the same day)*

Built and merged into the v4 branch. The live checks below are **still open** and are the
only thing between this and shipping. The evidence that led to the ruling follows the work
list.

**The shape changed once after the first implementation.** It shipped as three files — a
41 B facade, a hashed card chunk and a hashed editor chunk — and is now **two**, with
stable names: `calendar-card-pro.js` and `editor.js` (`-dev` on both for a dev build).
The facade and the hashes were not wrong; they were the correct answer to a problem the
single-build shape created for itself, and giving the editor its own Rollup entry removes
the problem instead of managing it. Details under *The second pass* below.

#### The work, in order — all done except the live checks

1. **Rollup** — an **array of two configs**, one per entry, stable `entryFileNames`, no
   `preserveEntrySignatures` and no `chunkFileNames` (neither build emits a chunk), plus
   `esbuild`'s `supported: { 'import-meta': true }`. **Done.**
2. **`getConfigElement()`** — `async`, dynamic `import()` of a URL built at runtime from
   `import.meta.url`, the define guarded on both sides of the await. **Done.**
3. **Editor strings** — the eleven `editor` sections moved from
   `src/translations/languages/` to `src/translations/editor-languages/`, imported only
   from `src/rendering/editor/index.ts` and merged into `TRANSLATIONS` at editor-load
   time. Not deleted: E10 still mines them. **Done.**
4. **`release.yml`** — `files: dist/*.js` plus `calendar-card-pro.zip` for manual
   installers, and `check:bundle` now runs there too, since that workflow is what
   actually publishes. The glob matches exactly the two files. **Done.**
5. **CI assertion** — `scripts/check-bundle.mjs`, `npm run check:bundle`. **Done**, and
   every assertion proven by deliberately breaking it — including twice against the real
   `rollup.config.mjs` rather than against edited output.
6. **The live checks** — **still open**, listed below.

**Measured on this branch**, production build:

| | raw | gzip |
| --- | ---: | ---: |
| eager path, single file (before any of this) | 390,155 | 114,341 |
| eager path, three files (facade + card chunk) | 209,313 | 65,711 |
| **eager path, two files (as shipped)** | **206,251** | **64,715** |
| **change per dashboard load vs. single file** | **−183,904 (−47.1%)** | **−49,626 (−43.4%)** |

Two files now: `calendar-card-pro.js` (206,251 B / 64,715 gzip) and `editor.js`
(233,213 B / 67,346 gzip).

#### The second pass — three files to two

The three-file shape existed for one reason: with a single Rollup entry, the modules the
card and editor share are emitted as a chunk that **the editor imports back from the
card**. Under HACS that is fatal — the card is registered as
`…/calendar-card-pro.js?hacstag=N`, a relative specifier resolves with the query dropped,
so the browser fetches the card a second time and evaluates it twice.
`preserveEntrySignatures: 'strict'` avoids it by reducing the entry to a facade, so the
real code is only ever addressed by one URL.

Correct, and treating a self-inflicted problem. **Two Rollup entries** mean no emitted file
imports another at all, so the trap has nothing to act on. What made it possible: the card
names the editor through a URL it computes at runtime, so the editor is invisible to the
card's module graph.

- **The eager path got *smaller*, which was not the expectation.** The cost of duplicating
  the shared modules into the editor is +46,541 B raw / +16,756 B gzip, and it is real —
  but it is paid only by people who open the editor. On the file every dashboard loads the
  two-file shape is **3,062 B raw / 996 B gzip smaller**, because a split entry has to
  *export* its shared modules and exported symbols resist mangling and inlining. The
  maintainer accepted the editor-side trade explicitly; the eager-side gain was a bonus.
- **Stable names needed a different cache-buster, and got a better one.** `/hacsfiles/**`
  is served `max-age=2678400` and only the registered resource carries `?hacstag=`, which
  is what made content hashes mandatory before. `getConfigElement()` now copies the card's
  own query onto the editor's URL, so the editor busts exactly when the card busts — and
  unlike a hash it also responds to the dev deploy's `?v=` bump, which previously reloaded
  the card and left the editor cached.
- **`import.meta` compiles to `{}` under esbuild `target: 'es2017'`**, silently. No build
  error, no type error, no failing test — just `new URL("./editor.js", Ir.url)` where
  `Ir = {}`, and an editor that can never load. `supported: { 'import-meta': true }` fixes
  it. This is now the single most important assertion in `check:bundle`, because it is the
  only failure mode in the design that every other gate is blind to. Verified by removing
  the option, rebuilding, and watching both the broken output and the check that caught it.
- **Duplicated module state is inert, and that was checked rather than assumed.** The
  earlier note that two copies would mean "two translation registries, two logger levels"
  is literally true and practically harmless: the card never reads a string the editor
  registered (it renders events, not editor labels) and the editor resolves its own;
  `CURRENT_LOG_LEVEL` is a build-time constant, identical in both; and `BANNER_SHOWN` is
  only ever touched card-side. Re-check this before moving anything shared *and mutable*
  across the boundary.
- **`clean-dist` had to become targeted.** Wiping `dist/` was right when names carried
  hashes. With two configs it is wrong twice over: under `--watch` the watcher rebuilds
  only the config whose inputs moved, so a card-only edit would delete the editor and
  leave it deleted. It now removes only what the current build will not itself write,
  which still catches the case that actually matters — a dev pair left behind for
  `release.yml`'s `dist/*.js` glob to publish.

#### Found while building it *(first pass; all still current)*

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
  object *acquires* an `editor` property once the editor loads. Correct — that is the
  mechanism — but it means the imported module stops being evidence about the file on
  disk, so "no `editor` key in `languages/*.json`" cannot honestly be a runtime
  assertion. It is a `check:i18n` check instead, across all 35 files rather than one.
- **Nothing cleaned `dist/`.** Harmless when the output was one fixed filename; not
  harmless once `release.yml` globs `dist/*.js` — every local rebuild left the previous
  build's output in place to be published as garbage assets. The build now removes it
  (in `rollup.config.mjs`, so `npx rollup -c` and the watcher get it too), and
  `check:bundle` asserts `dist/` holds exactly the two files of one build variant rather
  than trusting that.
- **Manual-installation instructions were about to become wrong**, in the README and in
  `docs/guide/installation.md`. Both said to download `calendar-card-pro.js` and copy
  that one file. Under the three-file shape that yielded a 41-byte facade importing a
  chunk the user did not have — a card that silently could not load. Under the two-file
  shape the failure is milder but still real: the card renders and only the editor is
  missing. Both now point at the zip, which stays required either way. The specification
  listed it as an optional nicety; it is not optional.
- **The dev build's output was indistinguishable from production output.** Rollup names a
  chunk after its input module, so a dev build emitted `calendar-card-pro-<hash>.js` — the
  same shape as the production chunk, in a directory where both can sit side by side,
  which is the entire point of the `-dev` suffix. Both filenames now carry it, and the
  editor filename the card *names* follows the same `replace()` mechanism as the element
  names — a mismatch there is a dead editor that builds perfectly.
- **§3.2's `try`/`catch` sketch was adopted but not as written.** Swallowing the error
  and continuing would hand Home Assistant a broken element; logging alone is invisible
  to the dialog. `getConfigElement()` logs *and* rethrows a message written for the
  person reading the editor dialog, naming the cause (a missing file) and the fix
  (reinstall via HACS) rather than the platform's bare *failed to fetch dynamically
  imported module*.
- **The missing-file path cannot be tested under Vitest.** Vite's import-analysis
  resolves `import()` specifiers at transform time, so deleting the editor fails at
  *load* of the parent module rather than at the call — the opposite of browser
  behaviour. That live check stays genuinely live-only. What *was* provable offline,
  against the real built bundle in happy-dom: the card registers `calendar-card-pro`, the
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
matters. *(Two files as shipped, and the eager path is smaller still — the measured table
under "The work" is the current one.)*

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

> *Superseded by the second pass.* The trap is real and the reproduction stands; the fix
> is not what shipped. Two Rollup entries mean nothing imports the entry at all, so no
> facade is needed — see *The second pass* above. The CI-assertion conclusion survives and
> got stronger.

Secondary constraints, all verified: the plugin namespace is **flat**, so no
`dist/translations/de.json` — subdirectories are never fetched (`base.py:1205-1222`);
`/hacsfiles/**` is served `max-age=2678400`, so **content-hashed chunk names are
mandatory**; and `zip_release` must not be used, because for a plugin it would register the
`.zip` itself as the resource.

> *Superseded by the second pass, in one clause.* The cache header is right and the
> conclusion followed from it, but a hash is not the only way to answer it: the card copies
> its own query onto the editor's URL instead, which busts on the dev deploy's `?v=` too.
> Flat namespace and no `zip_release` are unchanged.

**Upgrade path is safe and needs no user action.** The resource filename is unchanged (it
becomes the facade), HACS rewrites the `hacstag`, and in release-asset mode HACS never
wipes the directory (`base.py:951`), so upgrades are additive and downgrades safe. Cost is
stale-file clutter. A `dist` zip should be attached for manual installers.

**A missing editor file degrades gracefully** — the dialog fails to open and the card keeps
rendering, because HA awaits `getConfigElement()` (`frontend hui-element-editor.ts:370`).

Full detail and source citations: [`multifile-distribution.md`](./multifile-distribution.md).

#### The live checks — **4 of 8 passed** on 2026-08-12 at `?v=288`

> **Passed: 3, 4, 6 and 8.** Still open: 1, 2, 5 and 7 — all four need a real HACS
> install/upgrade cycle or a YAML-mode dashboard, so none can be run from the dev deploy.
>
> - **3 — deferred fetch, with the query. PASS.** On dashboard load the browser fetched
>   `calendar-card-pro-dev.js?v=288` and nothing else; `calendar-card-pro-dev-editor` was
>   not registered; `getConfigElement()` then fetched **`editor-dev.js?v=288`** and
>   registered it. The `?v=` propagated, which is the mechanism that replaced content
>   hashes — a bare `editor-dev.js` here would have gone unnoticed until the next release
>   served a stale editor.
> - **3b — the editor opens through HA's real dialog. PASS.** Stronger than the probe
>   above: the harness drove the actual edit-mode dialog on the two-file build and got a
>   working editor — **130 fields, 23 expansion panels, schema-driven**, 63 `ha-input`,
>   21 `ha-select`, 19 `ha-selector-boolean`. An earlier run of this reported the editor
>   as failing to open; that was an out-of-range `--card` index, which produces output
>   identical to a genuinely dead editor. Noted in the deploy skill so it does not
>   mislead again.
> - **4 — no duplicate registration. PASS.** No `NotSupportedError`, no page errors, no
>   failed requests.
> - **6 — deliberate 404. PASS.** With `editor-dev.js` deleted from the share, all five
>   cards continued rendering and `getConfigElement()` rejected with the written message
>   naming cause and fix, wrapping the platform error. **Zero unhandled rejections.** File
>   restored and verified byte-identical afterwards.
> - **8 — two Lit copies. PASS.** No `Multiple versions of Lit loaded` warning. The editor
>   mounted fully: 4,680 nodes, 65 `ha-form`, 28 panels, 194 selectors, 57 inputs.
>
> **One thing found and cleared, worth recording.** The mounted editor emitted six
> `Cannot read properties of undefined (reading 'localize')` errors. A/B against the
> HACS-installed **single-file** production card produced the same class of error, so the
> split did not introduce it; the higher count tracks the editor rewrite, which mounts
> roughly three times as many HA selector components. Probably an artefact of mounting
> outside HA's dialog, where `hass` is re-set on every state change. Not chased further,
> but noted rather than dismissed.
>
> Both probes initially reported a false failure by using `document.querySelectorAll`,
> which does **not** pierce shadow DOM — it reported zero cards on a page that had five.
> Use a Playwright locator, which does.

#### The live checks — **the four that remain**

None of this can be proven from source, and the offline work above deliberately does not
claim to have. Rewritten for the two-file shape: checks 2 and 3 named artefacts that no
longer exist, and check 8 is new — it only became a question once Lit was bundled twice.

On a real Home Assistant, before release:

1. **Upgrade in place** — install the current release via HACS, upgrade to a multi-file
   pre-release, confirm the card renders **without clearing the browser cache**.
2. **Both files arrive** in `www/community/calendar-card-pro/` after the download:
   `calendar-card-pro.js` and `editor.js`, plus `calendar-card-pro.zip`, which HACS
   downloads like any other asset and never registers.
3. **The editor opens**, and the Network tab shows `editor.js` fetched *on open*, not on
   dashboard load — otherwise the split achieved nothing. Confirm the request carries the
   card's own `?hacstag=`; a bare `editor.js` means the query propagation was lost, and it
   would not show up as a failure until the *next* release served a stale editor. (The
   module-graph half of this is proven offline: the editor element is not registered until
   `getConfigElement()` runs. What needs a browser is that the fetch is deferred too.)
4. **No duplicate registration.** Watch specifically for `NotSupportedError: … has
   already been used with this registry` after opening the editor. That is the
   `?hacstag=` trap recurring, and the one thing `check:bundle` cannot observe: it
   asserts the module graph, not what a browser does with a query string.
5. **YAML-mode dashboards**, where cache headers are off and resources are hand-managed.
6. **A deliberate 404** — delete `editor.js` from disk and confirm the card still renders
   and the failure is readable. Vitest cannot stand in for this: Vite resolves `import()`
   at transform time, so the failure lands in the wrong place entirely.
7. **A downgrade** back to a single-file version.
8. **Two Lit copies on one page.** The card and the editor each bundle Lit now, so two
   `LitElement` base classes coexist. Home Assistant hosts many cards that each bundle
   their own, so this is expected to be fine — but it is expected, not verified. Open the
   editor and watch for a `Multiple versions of Lit loaded` warning, and confirm the
   editor's own controls render and respond.

**Moot under the two-file shape**, and previously passed or open: anything asserting the
facade's existence or size, and anything about content-hashed chunk names — including the
old check 2's expectation of three files. `check:bundle` now asserts the inverse of the
first (no file may be small enough to be a facade) and the cache concern behind the second
moved to query propagation, folded into check 3 above.

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
| Y1 | **Production log level policy** | **Done** | Resolved by removing the judgement call rather than making it. Deciding per call site which of the 17 `Logger.warn` sites deserve to ship is a decision that must be re-made every time a site is added, and that fails silently when it is skipped. Instead the compiled default stays at `ERROR` — production is still quiet — and `window.calendarCardProDebug = true` (or `calendarCardProLogLevel = 0..3`) raises it at runtime. Read per call rather than cached, so it works on an already-loaded card with no rebuild, which is the entire point for someone holding only the released bundle. Documented under *Reporting a Bug*. Nine tests, both halves mutation-proven. **Verified on the built production artifact**, not just in unit tests: the compiled default is `0` (ERROR), the resolver survives minification with its exact-`true` and integer-range checks intact, and both log gates call it. A live browser check was inconclusive by construction and is not worth repeating — a dev build already logs at DEBUG, so the override has nothing to add there. |
| Y2 | **Split `column-view.md`** | Partly done — bulk move still open | The split itself already happened: `column-view-rationale.md` exists and holds the revision history and superseded alternatives. What was left was a spec that still reads as a *plan*. Two things fixed without moving anything, because both were actively misleading. **The status line said the column view "is not yet implemented"** — the first thing any reader or subsession saw, and wrong by four phases; replaced with a per-phase state table. **The whitespace trap was promoted to §F.8**, having lived under a heading marked ✅ complete while its own text says it governs every later extraction. What remains is the bulk move of shipped-phase narrative into the archive, and it is **deliberately not done unsupervised**: §C mixes completed history with live constraints, so a mechanical "delete the done phases" would have destroyed §F.8 — which is precisely how it came to be buried. Needs a human pass. |
| Y3 | **Dead key in the frozen capture view** | **Done** | The `ccp-release-header` view carried `max_events_to_show`, removed in v3.0.0. Verified genuinely inert before touching it: `DEPRECATED_CONFIG_MAP` feeds `findDeprecatedKeys()`, which only *warns* — it never migrates the value — so the key changed nothing and its removal changes nothing. **Removed rather than replaced with `compact_events_to_show`.** Restoring the original intent would apply a limit these screenshots have never had, breaking visual comparability with every prior release capture, which is the sole reason the view is frozen. A cross-dashboard search confirmed no other card carried the key. |
| Y4 | **Every CSS comment ships to every user** | **Done** | `cardStyles` is a `css` tagged template, so its contents are a *string literal*: esbuild minifies the JS around it and leaves the string untouched. JSDoc and `//` comments in `leaves.ts` cost nothing; `/* */` comments inside the stylesheet cost their full length, on the eagerly-loaded card, for every dashboard. **Measured on the shipped bundle: 105 comment blocks, 30,227 raw bytes — 65% of the stylesheet — worth ~11 KB gzip, about 17% of the gzipped card.** This is not an argument for writing worse comments; the reasoning in `styles.ts` is load-bearing and several of the traps it records have shipped twice. It is an argument for stripping them *at build time*, which is a rollup plugin operating on the template contents and is invisible to `stylesheet.test.ts`, since that reads `cardStyles.cssText` from source. Would need care around `content: '·'` and `url()` strings, so a real CSS-aware pass rather than a regex. **Quantified while measuring C5's own delta:** with comments stripped from both sides, C5 moved the bundle by 1 byte gzip; with them, by 749. **Fixed with a `strip-css-comments` Rollup plugin.** Measured A/B on the production build by disabling the plugin and rebuilding: **212,364 → 183,100 raw (−29,264) and 66,773 → 55,871 gzip (−10,879, −16.3%)**, on the bundle every dashboard loads. The stylesheet itself drops 44,924 → 15,665 bytes. **Proven to be comments and nothing else**: with comments and whitespace normalized away from both builds, the shipped stylesheets are byte-identical at 12,404 characters. Scanned rather than regexed, as the entry required — quoting is tracked, so `content: '/*'` and `url()` payloads survive, and `//` is left alone. Ten tests cover exactly those cases, because `stylesheet.test.ts` reads `cssText` from source and is structurally blind to this. |
| Y6 | **Six weather custom properties are emitted, read by nothing, and promised nowhere** | Open — needs a ruling | `--calendar-card-weather-{date,event}-{icon-size,font-size,color}` are computed and written onto the host on every render; **no CSS rule reads any of them**, because every weather style is applied inline by the leaf renderers. Raised by the C6 implementation, which left them and said so. The comment justifying that has since been corrected: it claimed they were part of the card's *documented* custom-property surface, and **no page under `docs/` names a single one** — so nothing outside `styles.ts` promises they work. **My recommendation is to remove them**, on the grounds that emitting them is worse than omitting them: someone inspecting the host finds `--calendar-card-weather-event-color` sitting there and reasonably concludes an override will take effect, which it cannot. Nobody can be depending on the behaviour, since there is none. Left for the maintainer because it is a visible surface. **Do not sweep up `--calendar-card-weather-event-max-lines`** — that one is read, by the clamp on `.weather-condition`. |
| Y5 | **`event_icon_vertical_alignment` does nothing to the time row** | **Done** — fixed, and snapshot-safe | The shared `.time, .location, .description` rule sets `align-items: var(--calendar-card-event-icon-vertical-alignment)`, and `.time`'s own later rule — same specificity, so source order wins — hardcodes `align-items: center` straight over it. So the option works on the location and description rows and is inert on the time row, in **both** views. Worse, even without the override it could not have positioned the *time icon*, which is nested inside `.time-actual` rather than being a child of `.time`; `.time-actual` hardcodes `center` too. A user setting `top` or `bottom` gets two rows out of three. **Deliberately not fixed in C5**: the correction lands in the shared rule and would move list-view rendering for anyone who set the option, which C5 was forbidden to do. Needs its own change with its own snapshot review — and a decision on whether "event icon alignment" is meant to reach the icon inside `.time-actual` (a second declaration) or only the row's own children. **Fixed by honouring the variable on `.time-actual` rather than on `.time`.** That answers the open question the entry raised: the option means *align the icon against its own text*, and `.time-actual` is the container whose children are (icon, text) — the same shape `.location` and `.description` have. `.time` keeps `align-items: center`, because its children are the wrapper plus a countdown or progress bar, and restoring the variable there would tilt those while leaving the icon centred. **The feared list-view churn does not happen:** the option defaults to `middle`, which resolves to `center`, so a card that never set it is byte-identical and the DOM goldens did not move — only a user who set `top`/`bottom` changes, which is the repair. Three tests assert the property (containers whose children are icon+text) rather than a list of selectors; reintroducing the hardcode fails two of them. **Verified live at `?v=291` against the HACS production build as a control**, by reading computed styles rather than eyeballing pixels. With the option set to `top` — production: `.time-actual` `center` (the bug), `.location` `flex-start`; dev: `.time-actual` `flex-start`, `.location` `flex-start`. `.time` reads `center` in both, which is the intended difference. |

---

## After v4

| # | Item | Note |
| - | ---- | ---- |
| Z1 | **Day-navigation controls** | `«` `‹` Today `›` `»`. Would apply to all three views and must be optional so it does not bloat the UI for people who do not want it. The prototype re-slices an oversized fetch; ours is sized to exactly `days_to_show`, so the fetch-window question has to be settled first — G10 and E-crit 3 forbid a refetch on navigation. |
| Z2 | **Grid view** (Phase 5) | The `grid` name is reserved by A3-H; nothing is built. Feasibility assessed: the architecture generalises, with named changes. Must be rebuilt on the seven commits on the frozen `alexpfau-review-339-time-grid` branch so attribution survives. |
