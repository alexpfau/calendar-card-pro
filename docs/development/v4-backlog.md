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
| E5 | **Compact mode group: order & gating** | Open | The toggle sits at the *bottom* of its own group and should lead it. The two inputs should not be offered until the toggle is on — confirm first that they are genuinely inert when it is off. |
| E6 | **Helper-text copy pass** | Open | Several helpers restate their label and add nothing (`show_past_events`, `show_empty_days`, the weekend/today colour groups, the today-indicator group). The week-number helper lost the ISO-8601-versus-simple explanation the old editor carried. `split_multiday_events` does not mention that column view defaults it to `true`. In the compact group, *"applies to the list layout"* is repeated on every child instead of being stated once on the group. Needs one deliberate pass, not field-by-field patching. |
| E7 | **UV index and low temperature are mutually exclusive** | Ruled — ready to build | The card applies this in the day header (`leaves.ts:82-83`); the editor does not express it. **Annotate, do not hide** — and here hiding would be actively wrong, not merely against house rule: `showUvIndex` also requires `uv_index >= threshold`, so with a threshold set the low temperature legitimately appears on low-UV days. It is per-day runtime precedence, not a static rule. One helper string on `date.show_low_temp`. |
| E7b | **Column-view meaning of `show_conditions`** | Ruled — ready to build | Needs a path-qualified helper (`event.show_conditions.helper`), **not** `VIEW_SCOPE`: the option is not inert in column view so an applicability note would be false, and `applicabilityNote` keys on the bare `schema.name` (`localize.ts:135`), which collides because both weather groups name the field `show_conditions`. Helper keys are path-aware; applicability notes are not. Two English strings total, no schema change. |
| E8 | **Two placement questions** | Open | `first_day_of_week` sits in Time Range & Content while `show_week_numbers` sits in Day Header — arguably one concept, and the docs group them. `day_header_separator_*` moved to Separators (grouped by what it is) while `day_header_gap` stayed in Layout (which owns spacing). Both cheap now, awkward once documented. |
| E9 | **Fate of the synthetic calendars multi-picker** | **Kept** (stage 3) | **Ruled — kept, unchanged.** The picker and the per-calendar list are one control split by responsibility: membership and order above, settings below. Unwinding it would leave no way to *add* a calendar at all, and its identity-preserving merge is exactly what keeps a deselected calendar's settings alive — the property the per-calendar list depends on. It is also what HA's own calendar card does (`<ha-entities-picker>` above hand-written fields), and it is where `reorder` lands for E4. Reversible if the maintainer disagrees: the list below does not depend on the picker being synthetic, only on `entities` keeping its order. |
| E10 | **Translations for the new namespace** | Blocked by X1/X2 | English only today. The plan: mine the dormant `editor` sections in the 35 language files for anything reusable, translate, then delete those sections. They currently cost **129,437 B raw / 33,746 B gzip — 30.5% of the shipped bundle** while labelling nothing. |
| E11 | **Exceptions for the three union-typed override keys** | Open | `show_week_numbers` (`null \| 'iso' \| 'simple'`), `remove_location_country` (`boolean \| string`) and `today_indicator` (`string \| boolean`) are override-eligible but have no exception control, because the panel edits each through a mode dropdown that chooses *which shape* is written — an exception needs that derivation again, per exception, which is a mechanism rather than a field. A hand-written `column:` block carrying any of the three still works and is still preserved on write; `value.ts` already documents `column: { show_week_numbers: null }` as meaningful. The set is asserted in `editor-schema.test.ts`, so it cannot grow quietly. |
| E12 | **Per-calendar label has no type picker** | Open | The old editor spent 209 lines (`_renderTypeSelector` and friends) giving the label a type — none / text / icon / image — which is not a config key: `renderLabel` derives it from the value's shape. Stage 3 offers one text field and says so in the helper, which is correct for all four cases and loses only the icon picker. Restoring one needs a *per-item* synthetic field, and `SYNTHETIC_FIELDS` is keyed per card. Worth doing only if users ask. |

### Editor: closed in review, recorded so it is not re-litigated

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

---

## Column view

Detail in [`column-view.md`](./column-view.md).

| # | Item | Status | Note |
| - | ---- | ------ | ---- |
| C1 | **Progress bar in column view** | Open | Not missing code: `column.ts:244` calls the shared `Leaves.renderEventContent`, which renders the bar at `leaves.ts:543`, and `show_progress_bar` / `progress_bar_height` / `progress_bar_width` are all column-override keys (`view.ts:55-57`). It has simply never been *seen* there — it defaults to `false`, so the suite, built from default config, cannot exercise it, which is the blind spot `AGENTS.md` warns about. A bar sized for a full-width row inside a 140px column is unproven. Needs a test that turns it on, and eyes on it. Added to the D7 blocker table. |
| C2 | **Per-event weather row** | Ruled — ready to build | In list view, `show_conditions` gates the icon. In column view the weather has its own row, so switching conditions off leaves a row holding only a temperature, breaking the leading icon edge that time, location and description share — `styles.ts:786-788` says outright that the alignment resets exist for that gutter and "neither is optional". **Design: in column view the row and its icon are always shown once per-event weather is on, and `show_conditions` instead controls rendering the condition verbally.** Reuses the existing key, no new config, no migration, ~20–30 lines. Spec: [`weather-column-view.md`](./weather-column-view.md). Three things it depends on, all verified: HA already ships the condition vocabulary translated for every language (`component.weather.entity_component._.state.*`, spot-checked live in `de`); `WeatherData.condition` is already stored (`weather.ts:93`) and read by nothing; and `formatEntityState` is already declared on our `Hass` interface (`types.ts:477`) and never called. **Two traps before writing code** — (a) our `HassEntity` has no `entity_id` (`types.ts:530-540`) and `Hass.states` is narrowed to `{ state: string }` (`:463`), so the lookup would miss and fall back to the raw token, showing `sunny` to a German user **with no error**; (b) width — verbal conditions land in a 152px track and German will overflow it, so only the words take `flex: 0 1 auto` with ellipsis while temperature and UV stay `flex: none`. **Open call for the maintainer:** `show_conditions` defaults `true`, so words become the default in column view — settle by eye in a dev build. |
| C2b | **`weather.event.max_lines`** | Ruled — ready to build | New key, needed because writing conditions out can wrap the row. **Lives in `weather.event.*`, not as a fifth top-level `*_max_lines`**: its neighbours `icon_size` / `font_size` / `color` are already there, and nesting disambiguates the per-event row from the day-header row, which are different widths. The four existing `*_max_lines` are top-level only because their subjects have no nested block. Implementation follows them exactly — `> 0` sets a CSS custom property consumed with `-webkit-box` clamping, `0` means unlimited (`styles.ts:45-51`). **Constraint:** `COLUMN_DEFAULT_OVERRIDES` is typed to top-level keys, and weather sub-keys are not override-eligible, so this is **one value for both views**. That is acceptable because `show_conditions` renders words in column view only — list view has nothing multi-line to clamp. **Default `0`, matching the other four.** An earlier draft proposed `1` on the grounds that this clamps generated text in a fixed-width row rather than text the user wrote. Overruled for consistency, and the consistency argument is the better one: five keys that all mean "lines before truncation" should not disagree about what an unconfigured card does, and silent truncation is a worse default than visible wrapping — a wrapped row explains itself, a truncated one looks like missing data. Users who want one line set one line. Also ruled: **order within the row is temperature / UV first, condition words last**, so the numbers survive truncation when a limit *is* set. |
| C3 | **Named view predicates** | Open | 13 binary `=== 'column'` / `!== 'list'` gates remain outside the editor. `events.ts` in particular gates compact limits with reasoning its own comment applies to *any* grid layout, yet excludes only column. The editor has zero such gates and a test enforcing it; `src/` does not. Raised by the grid-view feasibility review; `column-view.md` forbids the pattern. Cheap now, structural debt once a third view exists. |
| C4 | **Column view as its own docs page** | Open | It is 175 lines and seven subsections inside `core-settings.md` — the largest section there, and a view mode rather than a core setting. Every other major feature has its own page and a nav entry. Needs every inbound link updated, since `ignoreDeadLinks` is off. |

---

## Distribution & bundle

Neither is owned by a spec; the detail is here.

### X1 — Multi-file distribution — **RULED: adopt in v4** *(maintainer, 2026-08-12)*

Approved with the CI assertion. Lazy-load the editor and move its translations into that
chunk. The evidence below is why; the work is listed at the end of this section.

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

#### The work, in order

Sequenced **after Stage 3 merges** — it touches `getConfigElement()`, the Rollup config and
the editor's string loading, and Stage 3 is adding editor code and strings on the same
branch.

1. **Rollup** — code-splitting with content-hashed chunk names, and
   `preserveEntrySignatures: 'strict'` so the entry stays a facade.
2. **`getConfigElement()`** — dynamic `import()` of the editor.
3. **Editor strings** — moved into the editor chunk rather than the eager bundle.
4. **`release.yml`** — `files: dist/*.js`, plus a `dist` zip for manual installers.
5. **CI assertion** — fail the build if any emitted chunk imports back from the entry.
   This is the `?hacstag=` trap and a comment is demonstrably not enough to hold it.
6. **The seven live checks**, on a real HA, before release. None of this can be proven from
   source. Reproduced here so the gate is visible where the work is listed:
   1. **Upgrade in place** — install the current release via HACS, upgrade to a multi-file
      pre-release, confirm the card renders **without clearing the browser cache**.
   2. **Every chunk arrives** in `www/community/calendar-card-pro/` after the download.
   3. **The editor opens**, and the Network tab shows its chunk fetched *on open*, not on
      dashboard load — otherwise the split achieved nothing.
   4. **No duplicate registration.** Watch specifically for `NotSupportedError: … has
      already been used with this registry` after opening the editor. That is the
      `?hacstag=` trap recurring.
   5. **YAML-mode dashboards**, where cache headers are off and resources are hand-managed.
   6. **A deliberate 404** — delete the editor chunk from disk and confirm the card still
      renders and the failure is readable rather than an unhandled rejection.
   7. **A downgrade** back to a single-file version.

Full detail and the source citations behind each finding:
[`multifile-distribution.md`](./multifile-distribution.md).

#### Side-finding — the sourcemap comment stops being true

`rollup.config.mjs` disables sourcemaps with the reasoning that the release attaches only
`dist/calendar-card-pro.js`, so a `.map` would 404 in every browser (#315, #358). Once the
workflow globs, that reason no longer holds — though note `files: dist/*.js` does **not**
match `*.js.map`, so nothing changes by accident. Whether to ship sourcemaps is a separate
decision; the comment must not be left stating a defunct reason either way.

### X2 — Editor translation budget — **Dissolved by X1, pending that go/no-go**

Measured, not estimated. The new English string table is **19,154 B across 138 keys**
against the old section's 11,818 B across 239 keys — 62% larger with 42% fewer keys,
because **67% of it is helper prose**. Projected across 11 languages, roughly **+18,000 B
gzip net** even after deleting the dormant sections.

If X1 proceeds this cost lands off the eager path and no longer needs solving. If X1 is
rejected, the options return: accept it, translate labels only, or trim the prose. The
maintainer has ruled that **language support is not to be reduced** and that clear prose is
worth having, so the first is the fallback.

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
