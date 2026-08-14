# Visual Editor — Target State & Implementation Plan

**Calendar Card Pro v4 and beyond.**

---

## Status — read this before the plan **[2026-08-12]**

This document was written as a design proposal. It has since been **approved, partly
superseded by maintainer rulings, and partly corrected by implementation.** The design is
still authoritative; the scoping and several mechanical claims are not.

**Maintainer rulings that supersede the plan as written:**

| Ruled | Effect on this document |
| ----- | ----------------------- |
| **Everything ships in v4.0.0** | The v4-minimum / v4.1 split throughout §4 and §6 no longer applies. There is no deadline; coherence beats speed. Sequencing is now dependency order, not release scope. |
| **Build a fresh editor, do not migrate the old one** | §4's panel-by-panel migration is moot. The old `editor.ts` and `editor.styles.ts` are **deleted** on `feature/column-view-v4`; `dev` and `main` still carry them. |
| **A new translation-key namespace is fine** | i18n cost must not shape the design. Build English-only, translate at the end, mining the dormant sections first. |
| **Q6: keep dormant keys, prune dead ones** | Keys that leave the schema on a view switch are **preserved** — switching view must not destroy configuration a user would get back. The five keys removed in v3.0.0 *are* stripped on write. |
| **View vocabulary is `list` / `column` / `grid`** | Recorded as A3-H in `column-view.md`. |

**Corrections found by implementation.** Each was verified against the real Home Assistant
frontend or our own runtime, not inferred:

1. **`ui_color` is the wrong selector for our colours.** It emits a theme token that cards
   resolve through `computeCssColor()`. We write colours straight into CSS custom
   properties, so a token would arrive as `color: primary` and be dropped, and the picker
   cannot express alpha (`#03a9f450`) or our four `var(--…)` defaults. **Colours stay
   `text`** wherever this document says otherwise.
2. **`ha-form-expandable` appends its name to the label path unconditionally**, whether
   `flatten` is set or not. Data binding *is* flatten-dependent; labels are not. §3.3's
   exceptions node would not have worked as written.
3. **`optional_actions` cannot express exceptions.** It is **add-only**: there is no
   removal handler, and any key present in the data is force-promoted on every update, so
   a field with a value can never be hidden again. The exceptions widget is hand-written.
4. **`filterDefaultValues` was not sound**, contrary to §5.3 — it misses the object-valued
   `tap_action` / `hold_action` defaults and passes `weather` through unconditionally. The
   new write path handles all three; the old one is left alone because it dies with the
   old editor.
5. **The composed column default omitted `COLUMN_DEFAULT_OVERRIDES`.** The correct
   reference is `COLUMN_DEFAULT_OVERRIDES[k] ?? config[k]`.
6. **The ~480px editor width is a myth** and was fed into the earlier assessment in error.
   HA's card-edit dialog is a two-pane flex, 50/50 side by side at ≥1000px; the 390–500px
   maximum applies to the *preview*.
7. **The `entity` selector does support `reorder`** — §4.2's ⚠ is discharged. It is a real
   field on `EntitySelector`, forwarded to `ha-entities-picker`, which without it
   instantiates `ha-sortable` with `disabled=true` *and renders no drag handle*. Added in
   PR #26217 (2025-07-18), so HA 2025.8+; older instances ignore it. One flag, no
   fallback buttons.
8. **Per-entity `show_time` / `show_location` / `show_description` /
   `split_multiday_events` are tri-state, not boolean.** The card reads them
   presence-first, so *absent* means "follow the card". §4 does not say so, and the editor
   being replaced bound them to checkboxes — which cannot express the third state and
   whose first touch wrote a `false` nothing could take back. They are three-way
   dropdowns.
9. **Divergent view defaults are annotated beside the shared control, not pre-seeded as
   exceptions.** §3.3 asks for `show_empty_days` and `split_multiday_events` to be seeded
   into the exceptions node. Seeded, every column card opens with two exception rows it
   never asked for, against the rule that an unused exceptions widget adds no chrome. The
   sentence now sits under the shared control, driven from `DEFAULT_OVERRIDES_BY_VIEW`.
10. **Every "52 overrides" figure below is a snapshot, and the count is now 54.**
    `show_past_events` and `filter_duplicates` became overridable in `d6e8381`, after this
    document was written. The counts at §2, §5.3 and §9.3 are left as measured rather than
    chased, because nothing depends on the number: `editor-schema.test.ts` asserts an empty
    set of missing keys against `COLUMN_OVERRIDE_KEYS`, so coverage follows the array
    wherever it goes. Read `view.ts`, not a figure in this file.

**Where implementation stands:** Stages 1 to 3 have landed on `feature/column-view-v4` —
foundation, value plumbing, the nine-panel taxonomy, the `check:i18n` rewrite, and the two
hand-written widgets (per-calendar settings and per-view exceptions). Open work is indexed
in [`v4-backlog.md`](./v4-backlog.md) under *Editor*, which is the list to read before
starting a stage.

The seam between schema-driven and hand-written is now explicit rather than implied.
`PanelDef.subforms` declares the schemas a panel renders outside its own `<ha-form>`, and
`check:i18n` walks them, so the per-calendar fields and every exception row are reconciled
against the string table exactly like the panels are. A hand-written widget that stops
declaring its schema is a check failure, not a silent hole.

---

**Inputs.** `editor-research-ha-native.md` (how HA builds editors), `editor-research-hacs.md`
(what the ecosystem does), `editor-greenfield-assessment.md` (internal analysis — mined, verdict
overturned in §9), `grid-view-feasibility.md`, `column-key-naming-review.md`, plus
`src/rendering/editor.ts`, `src/config/view.ts`, `src/config/config.ts`, `src/config/types.ts`,
`src/translations/languages/en.json`, `scripts/check-i18n.mjs`, `rollup.config.mjs`, `hacs.json`,
`docs/reference/configuration.md` and `docs/development/column-view.md` (D4–D8, A3-B, A3-G, A3-H).

**Counted directly in this session**, so these numbers are mine rather than inherited:
`editor.ts` **2,411** lines · **92** top-level `DEFAULT_CONFIG` keys (three of them containers:
`entities`, `weather`, `column`) · **12** `EntityConfig` keys · **10** `WeatherPositionConfig` keys
· **52** `COLUMN_OVERRIDE_KEYS` · **6** `COLUMN_ONLY_KEYS` · **122** `add*Field()` call sites ·
**239** `editor.*` translation keys · **28** `helper-text` sites · **7** `ha-alert` sites ·
**7** expansion panels · **105** option rows in `docs/reference/configuration.md`.

---

## 1. The design in one page

**The editor becomes a schema-driven form with a search box on top and one hand-written widget for
calendars.** `getConfigElement()` still returns our own element; inside it, each panel is an
`<ha-form>` fed by a memoised schema function. We stop owning the field-rendering layer.

Five things the user gets that they cannot have today:

1. **Search across all 117 options.** A field at the very top of the editor. Type `font`, or
   `location`, or `color`, and every panel collapses to just the matching fields, each still under
   its panel heading. **No card in the HACS survey has this** (`editor-research-hacs.md:413-416`),
   and it is the direct answer to the one problem that is actually hurting — findability at 117
   options across seven collapsed drawers.

2. **A "Customised only" toggle** beside it. Shows the options that differ from their defaults —
   the user's real configuration, typically 10–20 keys out of 117. It answers "what have I
   changed?", "what is different in column view?" and "what will I lose if I switch?" with one
   mechanism.

3. **A Layout panel that owns the view**, with a `list | column | grid` selector rendered as
   illustrated boxes, one sentence stating that a column card renders **as a list** on narrow
   screens, and — the part nothing else in the ecosystem does — **a live width table** generated
   from `computeColumnThresholdPxFor` and `fitColumns` (`view.ts:869`, D6-B):

   ```
   This card renders            ≥ 1088 px   7 columns
                                ≥  938 px   6 columns
                                ≥  638 px   4 columns
                                ≥  488 px   3 columns
                                <  472 px   as a list
   ```

   That turns the single most confusing thing about column view — *why does my card look different
   on my phone* — into a table, and it discharges the D7 too-narrow and auto-fit-honesty
   requirements in `column-view.md`.

4. **Exceptions instead of tabs.** Any option that may differ per view gains an
   *"Add exception for column view"* affordance **inside its own panel**, so the shared value and
   its column exception sit adjacent. The default state is zero extra chrome.

5. **Applicability instead of inertness.** An option that does nothing in column view is not
   labelled "inert"; it is labelled *"Applies to the list layout, which this card uses on narrow
   screens."* That is the honest statement — both layouts are live for the same card
   (`column-view.md` D8) — and it costs one `computeHelper` hook driven from one exported table,
   replacing eight hand-placed conditional siblings.

And one thing they stop getting: **breakage when Home Assistant renames a component.** A schema
names a *selector*, never an element. `getInputTag()` (`editor.ts:50-64`), the shim we wrote when
HA 2026.5 removed `ha-textfield`, is deleted rather than maintained. This is the prize —
`editor-research-hacs.md:599-617` measures it: Mushroom absorbed the same class of HA break in
**+6/−6 lines** because it never names an input element.

**The one-line justification.** The taxonomy is not where the redesign lives, and that is why the
previous attempt read like reordering dropdowns. Grouping is a *browsing* aid; **search** is how
you *find* something at 117 options. The earlier assessment could not offer search because it
priced it as "a field registry, therefore a rewrite of the most fragile file in the repo, therefore
v4.1" (`editor-greenfield-assessment.md:455-493`). **Once the editor is schema-driven, the schema
is the field registry**, and search is a `.filter()` over an array — roughly 130 lines, not a
rewrite. That single fact is what overturns the earlier verdict, and everything below follows from
it.

**Scope split.** v4.0.0 ships the column surface **built the new way** (a schema-driven Layout
panel, the scope table, the exception mechanism, and one migrated panel to prove the pattern), so
it is never built twice. The full rewrite, search and the per-entity widget follow in v4.1. §6 has
the ordering; §8 Q1 is where to disagree.

---

## 2. Information architecture

### 2.1 The honest framing first

Any sane cut of 117 options lands within a panel or two of any other sane cut. The maintainer's
critique of the earlier assessment — that it amounted to *"restructuring and reordering our
drop-down lists"* — is correct **as a critique of taxonomy-as-the-answer**, and it would be equally
correct against the taxonomy below if the taxonomy were all there was. So, plainly:

> The taxonomy is demoted. It is the browsing surface, and it must stop lying about layouts. It is
> **not** the findability mechanism. Search is.

Three structural moves below are UX changes rather than reorderings, and they are what the panel
list is in service of.

### 2.2 Move A — panels named for the thing, not for a region of the list layout

Today's seven panels are named after regions of the *list* layout — `Date Display`, `Event
Display`, and the docs go further with literal headings `## 📆 Date Column` and `## 📅 Event
Column` (`docs/reference/configuration.md:121,142`). In column view there is no date column: the
date is a header band above the events. A noun that becomes false when a second view exists cannot
absorb a third.

What is stable across `list`, `column` and `grid`: a **card**; **days**, each with a **header**
(weekday / day number / month — the left cell in list, the top band in column, the column head in a
grid); **events**; **rules between days**; **weather**; **interactions**; **what content is
selected**; and **how days are arranged**. That yields:

| # | Panel | Owns | Change vs today |
| --- | --- | --- | --- |
| 1 | **Calendars** | `entities[]` and all per-entity config | rename from *Calendar Entities* |
| 2 | **Layout** | `view`, the six density keys, `height` / `max_height`, `day_spacing`, `event_spacing`, `additional_card_spacing`, the width table, the two-layouts sentence | **new** |
| 3 | **Time Range & Content** | `days_to_show`, `start_date*`, `first_day_of_week`, compact-mode family, `show_past_events`, `show_empty_days`, `empty_day_text`, `empty_day_color`, `hide_when_empty`, `filter_duplicates`, `split_multiday_events`, language & time format | rename from *Core Settings*; gains `empty_day_color` |
| 4 | **Card & Title** | `title`, `title_font_size`, `title_color`, `background_color` | split out of *Appearance & Layout*; matches docs `## 🏷️ Header` (`configuration.md:63`) |
| 5 | **Day Header** | weekday/day/month font + colour, `show_month`, weekend colours, today colours, `date_vertical_alignment`, today-indicator family, week-number family | **rename** from *Date Display* |
| 6 | **Events** | `event_color`, `accent_color`, `event_background_opacity`, `vertical_line_width`, `event_font_size`, time, location, description, icon alignment, countdown, progress bar, the four `*_max_lines` | rename from *Event Display*; gains `accent_color` |
| 7 | **Separators** | day / week / month separator width + colour, `day_header_separator_*` | **split out** of *Date Display* |
| 8 | **Weather** | `weather.*` | unchanged |
| 9 | **Actions & Refresh** | `tap_action`, `hold_action`, `refresh_interval`, `refresh_on_navigate` | rename from *Interactions* |

Two renames carry the weight. **"Date Display" → "Day Header"**: a list row's date cell and a
column's header band are the same thing under two layouts, `day_header` is the term the spec itself
uses (`column-view.md` D2), and `day_header_gap` / `day_header_separator_*` already ship with that
noun (`view.ts:104-111`). **Separators become their own panel**: they are not date formatting, the
docs already grouped them separately (`configuration.md:91`), and column view adds
`day_header_separator_*`, which has no home under "Date Display" and an obvious one here.

This also repairs the two adjacency failures the earlier assessment found and that the per-entity
editor already gets right: `accent_color` moves next to `event_color`, and `empty_day_color` next
to `empty_day_text`.

**Docs obligation.** `docs/reference/configuration.md` headings move in the same PR — `## 📆 Date
Column` → `## 📅 Day Header`, `## 📅 Event Column` → `## 🗓️ Events`, and a new `## 🧱 Separators`.
`check:docs` gates it, anchors change, and the absolute links it validates must move together.

### 2.3 Move B — two-column field grids, so a panel is half as tall

Every field today is a full-width row, so *Date Display* is ~35 stacked rows across 265 lines of
template (`editor.ts:1016-1281`). `ha-form`'s `type: "grid"` pairs naturally-paired fields — a font
size beside its colour, a separator width beside its colour — and collapses to one column when the
pane narrows, via `auto-fit` + `minmax(200px, 1fr)` with **no breakpoint and no JS**
(`ha-form-grid.ts:92-101`, per `editor-research-ha-native.md:291-304`). That roughly halves the
vertical extent of every styling-heavy panel, and it costs three lines of schema:

```ts
{ type: 'grid', name: '', schema: [
    { name: 'day_font_size', selector: { text: {} } },
    { name: 'day_color',     selector: { ui_color: {} } },
]},
```

This is the single change with the largest effect on how the editor *feels*, and the current
architecture cannot make it cheaply — it is 20-odd hand-written flex rows and a media query we
would then own.

It also settles the width question. The card-edit dialog is **not** a ~480 px column: it is a
two-pane flex that goes 50/50 side-by-side at ≥1000 px, and the 390–500 px `max-width` belongs to
the **card preview**, not the editor pane (`hui-dialog-edit-card.ts:452-526`, per
`editor-research-ha-native.md:838-862`). Designing for two columns is therefore correct, and
`auto-fit` means the stacked case needs no separate design.

> **Found while verifying this:** `calendar-card-pro.ts:303-312` carries the false belief in a code
> comment — *"The edit modal is about 480px wide"* — as the justification for returning the
> requested view in preview. The **behaviour is right** (the *preview* really is 390–500 px, so a
> measured fallback there would show every column user a list), but the comment names the wrong
> element. Fix the comment while the area is open; do not change the behaviour.

### 2.4 Move C — collapsible sub-groups instead of `h3` → `h5` nesting

Today a panel's internal structure is heading text: `h3`/`h5` in the card-level template
(`editor.ts:811,1036`) and `h4`/`h5` in the per-entity renderer (`:1917,1932`) — two conventions in
one file. Under the new scheme a sub-group that is genuinely optional becomes a nested
`expandable`, which `ha-form` supports recursively and which brings `aria-level` heading semantics
with it (`ha-form-expandable.ts:95-101`).

So *Day Header* presents as **six things** — a typography grid, then collapsed *Weekend Colours*,
*Today Colours*, *Today Indicator*, *Week Numbers* — rather than 35 stacked fields. `flatten: true`
keeps the underlying config flat, so **no YAML migration is needed to gain grouping**
(`ha-form.ts:36-37,281-284`).

### 2.5 What findability actually costs, and why it is now affordable

Search is a filter over the schema array plus a re-render:

```ts
// panel schema, filtered
const q = this._search.trim().toLowerCase();
const visible = (schema: HaFormSchema[]): HaFormSchema[] =>
  schema.flatMap((n) =>
    'schema' in n ? [{ ...n, expanded: true, schema: visible(n.schema) }].filter((g) => g.schema.length)
               : matches(n, q) ? [n] : []);
```

Matching should consider the config key, the resolved label, and the resolved helper text — so
typing `overflow` finds `title_max_lines` through its helper prose, not just its name. A panel
whose filtered schema is empty is not rendered at all; panels with hits render expanded.

The **Customised only** toggle is the same shape with a different predicate: `!deepEqual(value,
defaultFor(key))`, reusing the comparison that `filterDefaultValues` (`helpers.ts`) already
performs on save. Two filters, one mechanism, ~130 lines including the chrome.

Neither is expressible against today's editor without first building the field registry the earlier
assessment deferred. **That is the whole argument**, and it is why the taxonomy work above is a
supporting act rather than the headline.

---

## 3. The per-view model

### 3.1 The reframe

`view: column` falls back to the list layout below a width threshold, so **one card instance
renders column on a desktop and list on a phone** (`column-view.md` D6, D8). Both layouts are live
simultaneously. The brief is right that configuring two views at once is the normal case — but the
actionable form of that is sharper:

> **Two layouts are always live. Wanting *different values* in them is the exception.**

Only 52 of ~117 keys are even eligible (`view.ts:33-87`) and a typical card will override two or
three. So the editor presents **one configuration, plus a legible exception mechanism, plus an
honest statement of what is live where.** That sentence rules out tabs (§9.1) and rules out a
"Column Settings" panel (§9.3).

### 3.2 Applicability, not inertness

D8 lists eight options inert in column view and rules that hiding them is forbidden, for a
structural reason: hiding `today_indicator_position` on a column card removes the only control for
the layout that card actually uses on a phone. Correct — and it means the honest label is not *"this
does nothing"* but **"this applies to the list layout"**:

| Option | Helper text shown when `view: column` |
| --- | --- |
| `date_vertical_alignment` | Applies to the list layout, which this card uses on narrow screens. |
| `today_indicator_position` | Applies to the list layout — column view places the indicator for you. |
| `compact_events_to_show` (card and per-entity) | Applies to the list layout. Compact limits cap events per card, which would empty columns rather than shorten the card. |
| `compact_days_to_show` | Applies to the list layout — capping days would delete trailing columns. |
| `compact_events_complete_days` | Applies to the list layout — the height budget rotates per column. |
| `action: 'expand'` | Has no effect while `view: column`, because the compact limits it expands are list-only. |
| `split_multiday_events` (per-entity) | Column view always splits multi-day events. Use the column exception to change that. |

This reads as information rather than as a defect report, and it generalises: with `grid`, a key
may apply to list **and** column but not grid, which "inert" cannot express and "applies to" can.

**Mechanism: one hook, one table.** `ha-form` takes a `computeHelper(schema) => string | undefined`
callback (`ha-form.ts:45-89`). All eight notes therefore come from a single function reading a
single exported table, instead of eight hand-placed conditional `helper-text` siblings — the
mechanism the earlier assessment correctly identified as unscalable
(`editor-greenfield-assessment.md:207-213`). In `view.ts`, beside `COLUMN_ONLY_KEYS`:

```ts
/** Which views each option actually affects. Absent key ⇒ affects every view. */
export const VIEW_SCOPE: Readonly<Record<string, ReadonlySet<Types.EffectiveView>>> = {
  date_vertical_alignment:       new Set(['list']),
  today_indicator_position:      new Set(['list']),
  compact_events_to_show:        new Set(['list']),
  compact_days_to_show:          new Set(['list']),
  compact_events_complete_days:  new Set(['list']),
};
```

Keyed by view rather than as a flat "column-inert" list, because `grid` will have its own set —
and because `grid-view-feasibility.md:127-157` found `events.ts:207` already leaking list semantics
into any future view through a negative-form binary gate. A flat list would repeat that mistake one
layer up. This discharges D8's own closing request to build the export before the annotations.

The compact-mode family is a special case worth honouring: it is *wholly* inert in column view, so
the note belongs once on the sub-group, not four times on its members. `expandable` groups can
carry helper text, so this is expressible without a special case in our code.

### 3.3 Exceptions, sited in the panel that owns the option

An override is an exception to a value that lives somewhere specific, so it belongs **next to that
value**, not in a separate panel and not in a separate tab. Concretely, each panel's schema ends
with a per-view exceptions node:

```ts
{ type: 'expandable', name: 'column', title: t('exceptions_column'), schema: [
    { type: 'optional_actions', flatten: true, schema: [
        { name: 'show_location', selector: { boolean: {} } },
        { name: 'location_font_size', selector: { text: {} } },
        // …only this panel's override-eligible keys
    ]},
]},
```

Two `ha-form` properties do the work. `expandable` **without** `flatten` nests its children's data
under its `name`, so the whole node reads and writes `config.column.*` with no plumbing on our side
(`ha-form.ts:36-37,281-284`). And `optional_actions` is HA's progressive-disclosure primitive —
fields stay hidden behind an "add" menu until chosen (`types.ts:85-89`,
`ha-form-optional_actions.ts`) — which is *exactly* the shape of an exception list: nothing is
shown until the user asks for an exception, and what they add is what they overrode.

> ⚠ **Verify before committing.** `optional_actions` is described in the research
> (`editor-research-ha-native.md:312-315`) but was not read end-to-end, and two behaviours matter:
> whether removing a field **deletes its key** from the data (we need it to), and whether it
> composes under a non-flattened parent. If either fails, fall back to a ~100-line hand-rolled
> exceptions widget with an add-picker — same UX, more of our code. This is the largest single
> unknown in the plan and it is cheap to settle with one afternoon in a live HA.

Two rules the exceptions node must respect, both already established:

- **Only un-dotted, override-eligible names.** `entities[].*` and `weather.*` are not eligible
  (`column-view.md` D6 categories; `column.entities` is explicitly out of MVP).
- **Prune the parent when it empties**, or users accumulate `column: {}`. `filterDefaultValues`
  passes the block through verbatim because `DEFAULT_CONFIG.column` is `undefined`, so the
  recursion branch never runs (`helpers.ts` — verified: `typeof defaultConfig[key] === 'object'`
  is false). See §5.3.

**Keys with a divergent default** (`COLUMN_DEFAULT_OVERRIDES`, `view.ts:433-438` — currently
`show_empty_days` and `split_multiday_events`) are pre-seeded into the exceptions node rather than
hidden, with helper text naming them as column defaults. This is the only honest surface for
"column view already changed this for you".

### 3.4 Scaling to `grid`

The rule is an asymmetry, and it is deliberate:

- **Generalise the editor's view loop now.** The editor is new code written with two views known;
  iterating a list of length one costs nothing. Everything is keyed by view name —
  `VIEW_SCOPE`, an `OVERRIDE_KEYS_BY_VIEW` lookup, and a derived `VIEWS_WITH_OVERRIDES` the
  exception nodes are generated from. **Never write `=== 'column'` in the editor.** `src/` already
  has ten such gates, two semantically wrong for a third view
  (`grid-view-feasibility.md:121-157`); the editor has zero and must keep it that way.
- **Do not generalise `view.ts`'s resolution layer now.** `grid-view-feasibility.md:176-188` argues
  — from the same reasoning that cancelled Phase 3 — that a registry parameterised by view name
  while only one view is registered would guess at which four things vary. Agreed.

When `grid` lands the editor changes are: one entry in the view registry, one option in the `view`
selector plus its illustration, labels for grid-only keys, and grid's `VIEW_SCOPE` sets. No
structural change, and no second exceptions mechanism.

---

## 4. Per-entity configuration — the hand-written half

### 4.1 Where the seam sits, and why it is forced

`HaFormSchema` has no member for *an ordered list of heterogeneous sub-configs*. There is no
`type: "list"`, HA did not add one, and consequently **every** HA card with a list is a hybrid —
tile, heading, entities, thermostat, area, history-graph, and even the four-option calendar card,
which puts three fields through `<ha-form>` and then drops out to a hand-written
`<ha-entities-picker>` with its own `_entitiesChanged` handler
(`hui-calendar-card-editor.ts:86-121`, per `editor-research-ha-native.md:1117-1150`).

So the seam is not a choice. It is: **everything scalar goes through schema; the `entities` array
is ours.** Draw it there and nowhere else — no other part of our config is list-shaped
(`weather.date` / `weather.event` are fixed-key objects, expressible as nested `expandable`
nodes; `column` is a fixed-key object too).

### 4.2 The widget

Pattern A from `editor-research-hacs.md:427-451`, which is our direct competitor's solution in our
exact domain, plus Pattern C's clipboard, which is the best per-entity UX found anywhere and which
nobody else has:

```
[ ha-selector: entity, multiple, reorder, filter { domain: 'calendar' } ]

▸ calendar.family          Family            [copy] [paste]
▾ calendar.work            Work
     ┌ ha-form  .schema = ENTITY_SCHEMA  .data = entities[1] ┐
     │  Label · Label type · Colours · Filters · Overrides   │
     └───────────────────────────────────────────────────────┘
```

Four behaviours it must carry, three of which exist today and one of which is new:

1. **String-or-object normalisation.** `entities` accepts `'calendar.x'` or `{ entity: 'calendar.x',
   … }`; the form binds the object form and writes back the narrowest shape.
2. **Identity-preserving reselection.** When the multi-picker changes, match existing sub-configs by
   `entity` id so deselecting and reselecting a calendar does not destroy its colour and filters
   (atomic's `_entitiesChanged`, `editor-research-hacs.md:443-446`).
3. **Order is meaningful and must be draggable.** Our own copy says so — *"The copy from the
   calendar listed first is kept, along with its label and color"* (`en.json`,
   `filter_duplicates_note`). The `entity` selector's `reorder: true` gives drag-sorting for free
   (`selector.ts:273-291`) — ⚠ verify it is present in our supported HA floor before relying on it;
   the fallback is up/down buttons, ~30 lines.
4. **New: a settings clipboard.** *Copy settings* / *Paste settings* per calendar. For the
   multi-calendar setups that are this card's core use case, "configure one, paste into the other
   five" beats every alternative. Use our **own** namespaced storage key — `multiple-entity-row`'s
   in-source comment explains exactly why HA's `dashboardCardClipboard` must not be reused: it is
   consumed by `<hui-card-picker>` and would surface garbage there
   (`editor-research-hacs.md:475-480`).

### 4.3 The 209 lines that disappear

`_renderTypeSelector` / `_renderTypeField` / `_handleValueTypeChange` / `getValueType`
(`editor.ts:2202-2411`) exist to give the per-entity *label* a type (none / text / icon / image) and
the today-indicator a type, neither of which is a config key — the type is *derived from the shape
of the value*. That is precisely HA's **synthetic-field idiom** (`hui-gauge-card-editor.ts`, per
`editor-research-ha-native.md:625-666`): derive the field into `data` on the way in, `delete` it on
the way out, and gate the dependent fields by recomputing the schema. About 40 lines replace about
209, and the config keeps exactly the same shape.

The same idiom absorbs `height_mode`, `language_mode` and `start_date_mode`
(`editor.ts:692-751`), each of which today needs a duplicated special case in **both**
`_valueChanged` and `_selectChanged` (`:507-660`) — a duplication that grows by one copy per new
sentinel key.

### 4.4 Why not the `object` selector

`{ selector: { object: { multiple: true, fields: {…} } } }` renders a sortable list of sub-forms
with add and delete for **zero lines of our code** (`ha-selector-object.ts:113-190`), and it is
structurally our per-entity config. Rejected anyway — see §9.6: it cannot express the string-or-object
union, gives no place for the synthetic `label_type` field, and cannot host the clipboard. It is
the right answer for a card whose sub-objects are plain records; ours are not.

---

## 5. Mechanics

### 5.1 Schema composition and memoisation

A new module, `src/rendering/editor-schema.ts`, with **no Lit and no DOM import** — that constraint
is what lets the test suite and the i18n check import it directly (§5.5):

```ts
export interface SchemaCtx { view: Types.EffectiveView; config: Types.Config; }
export const PANELS: readonly PanelDef[];              // id, titleKey, icon, build(ctx)
export function entitySchema(ctx: SchemaCtx): HaFormSchema[];
```

Each panel's `build` is memoised on the fields it actually reads — the view, and the handful of
sibling values that drive progressive disclosure (`show_time`, `show_location`, `show_description`,
`show_progress_bar`, `show_countdown`, `show_week_numbers`, `today_indicator`, `height_mode`,
`start_date_mode`, `weather.entity`). **All 12 native editors surveyed use `memoizeOne`, only 5 use
`visible:`** (`editor-research-ha-native.md:1104-1109`), so memoised recomputation is the portable
baseline and `visible:` is a later, purely internal refactor requiring a stated minimum HA version.

**`memoize-one` should not be added as a dependency.** The bundle rule governs `dependencies`, and
a single-slot memoiser keyed on a shallow-equal argument tuple is six lines. Write it in
`utils/helpers.ts`. (§8 Q5.)

### 5.2 One handler, and the guard that has no schema equivalent

`ha-form` fires **one** `value-changed` carrying the whole merged data object; there is no
per-field handler and therefore **no place for a field-specific `event.type` guard to live**
(`ha-form.ts:265-295`, and `editor-research-ha-native.md:170-174` says so explicitly).

That matters because ours are load-bearing. The `start_date_offset` guard (`editor.ts:575`) exists
so the field does not vanish mid-edit while the value is an intermediate string like `-`. Under
`ha-form` the replacement is: keep `start_date_offset` as a **synthetic string field** held in
editor state, and commit it to config only when it parses; the intermediate never reaches the
config and so never re-renders the field away. ~20 lines. **This is the trickiest single item in
the migration** and the one most likely to ship a regression — call it out in review.

The handler also needs to know *which* key changed, for the synthetic-field logic. Diff old vs new
data (~20 lines); do not try to recover it from the event.

### 5.3 Stripping defaults before writing

`ha-form` hands back the whole merged object, and **atomic-calendar-revive shipped "the editor
writes every default into your YAML" twice — the second time introduced by the `ha-form` migration
itself** (`editor-research-hacs.md:634`, §3.1). This is not optional.

We already have `filterDefaultValues` (`helpers.ts`, called at `editor.ts:358`) and it is sound:
it compares with `===`, which **is** a correct deep-equal for our defaults, because every
`DEFAULT_CONFIG` value is a scalar except three, and all three bypass the comparison —
`entities` (array, passed through explicitly), `weather` (an object at `config.ts:119`, deep-cloned
and preserved whole by its own special case), and `column` (`undefined` at `config.ts:153`). The
brief's `JSON.stringify` warning therefore does not describe a bug we have — but it does describe
the one we would introduce:

- **`column:` needs its own pass.** The block's defaults are not in `DEFAULT_CONFIG`; they are
  `COLUMN_DEFAULTS` for the six column-only keys (`view.ts:236-273`) and *the effective top-level
  value* for the override keys (52 when this was written, 54 today). So strip `column.min_day_width: 140` (equals the column default)
  and `column.show_location: false` when top-level `show_location` is already `false` (a redundant
  override). Composed default = `{ ...COLUMN_DEFAULTS, ...pick(config, COLUMN_OVERRIDE_KEYS) }`.
- **Prune the block when it empties**, or `column: {}` accumulates.
- **Keep the `show_week_numbers` null/empty special case** — `helpers.ts` documents it as
  load-bearing, and D5 confirms it.

### 5.4 Prune or keep dropped keys — **keep**

`ha-form` renders exactly the schema it is given, so a key dropped from the schema on a view switch
stays in the YAML silently (`editor-research-hacs.md:573-578`). Three reasons to keep:

1. Both layouts are live, so a "column-inert" key is still the live control for the narrow list
   rendering. Deleting it would delete a setting that is doing something.
2. Deleting user values on a view toggle is exactly the silent config/render divergence this
   project has ruled against twice (G14; D4 `[v14]`).
3. **It is a small question for us anyway.** Unlike a card that swaps whole option sets per variant,
   our option set is view-stable — the schema barely changes across views, only its annotations do.

The mitigation for the resulting stale-key risk is not pruning, it is **visibility**: the
*Customised only* filter (§2.5) shows every non-default key, including ones that no longer do
anything, which is strictly more informative than silently deleting them.

### 5.5 Replacing the `check:i18n` editor scrape

`readEditorKeyUsage()` (`scripts/check-i18n.mjs:155-169`) scrapes `editor.ts` with two regexes and
**hard-exits with code 2 if the literal set is ever empty** (`assertFound`, `:57-68`). A fully
schema-driven editor presents zero literal `_getTranslation('…')` calls and would fail the gate
outright.

**Replacement: move label coverage into the test suite, keep wiring checks in the script.**

- Delete `readEditorKeyUsage()` and its `assertFound` call, plus the two checks that consume it.
- Add `tests/editor-schema-i18n.test.ts`, which **imports `editor-schema.ts` directly** — a real
  import of real code, so it cannot suffer the regex's false positives or its blindness to computed
  keys — walks every node, and asserts each `name` / explicit label key resolves in `en.json`. Also
  reports editor keys no schema node references (today: `image_label_note`, `start_date`).
- `check:i18n` keeps everything about **language wiring** — the `TRANSLATIONS` map key casing, the
  `dayjs.ts` import **and** `supportedLocales` array entry. Those are the checks that catch the
  silent failure AGENTS.md documents (Catalan and Romanian shipping with English relative times for
  months), and they have nothing to do with `editor.ts`.

AGENTS.md's bundle rule exempts `devDependencies`, so this costs nothing in shipped bytes, and it
removes a text scraper's veto over the shape of production source.

**Sequencing note that unlocks the whole plan:** `assertFound` fails only on an *empty* literal
set. While any hand-rolled panel survives, literals survive, so **the gate keeps working
throughout the migration** and only has to be replaced when the last panel is converted.

### 5.6 Lazy-loading — **not available**, and the brief's premise needs correcting

The brief lists lazy-loading as "an available, independent win". Verified against our build, it is
not:

- `hacs.json` pins **one** filename: `calendar-card-pro.js`.
- `rollup.config.mjs:20-32` emits a single entry, and its own comment records that the release
  workflow **attaches only `dist/calendar-card-pro.js`** — the reasoning that disabled sourcemaps
  after issues #315 and #358, where a `sourceMappingURL` pointing at an unpublished file 404'd in
  every user's browser.

A dynamic `import()` in `getConfigElement()` makes Rollup emit a **second chunk that is never
published**, reproducing exactly that 404 — this time fatal, because the editor would simply fail
to open. `output.inlineDynamicImports` avoids the extra file but defers only *evaluation*, not
download or parse, so it buys almost nothing.

Shipping two files would mean changing the HACS install shape for every existing user, and **I
could not verify whether HACS downloads non-`filename` release assets for a plugin** — that is the
question to answer before reopening this. **Recommendation: drop it, and take the win by making the
editor smaller instead** (§7). Flagged as §8 Q4.

### 5.7 Version gating and churn surface

No minimum HA version increase in v4: memoised schema functions work everywhere `ha-form` does, and
`ha-form` long predates any version we support. `visible:` is under a month old
(`conditions.ts`, added 2026-07-17, renamed 2026-07-22) and stays out until it is a year old and we
have a floor to state.

**What we stop naming**, and therefore what HA can no longer break under us: `ha-textfield` /
`ha-input` (and `getInputTag()` with them), `ha-select`, `ha-formfield`, `ha-switch`,
`ha-icon-picker`, and the raw `<input type="date">` in `addDateField`. **What we still name:**
`ha-form`, `ha-expansion-panel`, `ha-selector`, `ha-alert`, `ha-button`, `ha-svg-icon` — six
structural, slow-moving elements instead of a dozen input elements. Prefer `ha-selector` over
`ha-entity-picker` in the calendars widget to keep that list short.

⚠ **Unverified:** the minimum HA version for each selector we intend to use (`ui_color`,
`ui_action`, `entity.reorder`, `select.mode: 'box'`, `optional_actions`). That needs one pass
against HA release notes, or a live check, before the schema is fixed.

### 5.8 What we deliberately do *not* adopt

- **`superstruct` + `assertConfig`.** It is a runtime dependency for validation we largely have
  (`normalizeConfig`, `validateView`, `validateColumnOverrides`). Its one real prize — HA's graceful
  "this config can't be edited visually" downgrade — is already reachable by **throwing from
  `setConfig`**, which `hui-element-editor` catches and turns into the YAML fallback
  (`hui-element-editor.ts:419-434`). Cheaper, no bytes. (§8 Q8.)
- **`getConfigForm()`.** It works for custom cards and is documented, but it gives up the ability to
  render anything that is not a schema node — and §4 establishes we need exactly that. HA's own docs
  scope it to "cards with relatively simple configuration requirements". (§9.5.)

---

## 6. Sequencing

### 6.1 The principle that makes this safe

**Build the new thing the new way; migrate the old thing later.** `ha-form` is per-instance, so one
schema-driven panel beside six hand-rolled ones is a valid, shippable intermediate state — and
§5.5 shows the i18n gate survives it, because `assertFound` only fires on an *empty* literal set.

That matters because the column surface is a **hard v4.0.0 release blocker** (D7,
`column-view.md`), and D6 deferred it originally on the grounds that it *"would be built twice"*.
Building it schema-driven from the first line is what makes that fear stop applying: the v4 work is
not thrown away by the v4.1 rewrite, it is the seed of it.

### 6.2 v4.0.0 — the release-blocking minimum

| # | Item | Discharges | Effort |
| --- | --- | --- | --- |
| **S0** | Make deprecated-key resolution **runtime**, not editor-only | live silent-data-loss bug; reopens the rename window | S |
| **S1** | **Layout panel** — new, schema-driven: `view` selector (boxed, illustrated), the two-layouts sentence, the six density keys, the live width table, height & spacing | D7 rows 1 (partly), 6, 8 · the missing `view` control | M |
| **S2** | `VIEW_SCOPE` export in `view.ts` + `computeHelper` applicability text | D8 in full | S |
| **S3** | **Exceptions mechanism** (`expandable name:'column'` + `optional_actions`), wired for the Layout panel's keys and the high-demand ones (`show_location`, `show_time`, `show_description`, `event_font_size`, `height`, `max_height`) | D7 row 1 | M |
| **S4** | Migrate **Separators** to schema — the cheapest proof of the pattern | — | S |
| **S5** | `tests/editor-schema.test.ts` — round-trip, default-stripping, `column: {}` pruning, `VIEW_SCOPE` completeness | the editor's zero test coverage | M |
| **S6** | Docs: taxonomy re-cut in `configuration.md`; rule in-or-N/A the three open D7 rows | D7 rows 2–4 | S |

**S0 first, and it is not editor work.** `DEPRECATED_CONFIG_MAP` is consumed only by the editor
(`editor.ts:67-73`, used at `:381` and `:453`), so a YAML-first user's renamed key is silently
reverted to default today — a live bug across five existing entries. Resolving deprecated names on
read in `normalizeConfig` is ~15 lines and permanently reopens the rename window, which downgrades
every naming decision in this document from irreversible to cheap. It **must** land before the
editor surface, because after that the project's own reasoning declares the window shut.

**S4 is chosen for a specific reason.** The three separator blocks (`editor.ts:1149-1279`) are 130
lines differing only in a key prefix — the highest schema-compression ratio in the file, in the
panel with the fewest interactions with anything else. It converts to ~30 lines and proves the
pattern (nesting, grid pairing, progressive disclosure, exceptions) at the lowest possible risk.

**Why `Separators` and not `Weather`:** weather is 16 fields behind an entity gate across two
position sub-objects (`editor.ts:1501-1624`) and would exercise nested non-flattened `expandable`
on the first attempt. Do it second.

**Explicitly not in v4:** search, the Customised filter, the per-entity widget rewrite, the
clipboard, and the six remaining panel migrations.

### 6.3 v4.1 — the rewrite, and the payoff

| # | Item | Effort |
| --- | --- | --- |
| **S7** | Fresh `editor.ts` + `editor-schema.ts`: migrate the six remaining panels; delete all eight `add*Field` helpers, `getInputTag()`, the action renderer and the value-type machinery | L |
| **S8** | **Search + Customised only** — the payoff, now that every field is data | M |
| **S9** | Per-entity widget: multi-picker + per-entity `ha-form` + identity-preserving merge + clipboard | M |
| **S10** | Replace the `check:i18n` editor scrape (forced only now — the last literal `_getTranslation` disappears with S7) | S |
| **S11** | Translations: mine the old language files for reusable strings, then machine-translate the new English set | S |

S11 is last, deliberately. The maintainer's ruling that translation cost no longer constrains the
design is what makes a fresh key namespace viable — and per-key fallback (`localize.ts`, resolving
requested → English → key name) means a partially translated editor degrades to English rather than
to raw key names, so **shipping English-only is safe at every intermediate step**.

### 6.4 Post-v4.1

`visible:` conditions replacing memoised recomputation (internal, needs a stated HA floor);
`grid` view, which by construction is a registry entry plus labels plus a `VIEW_SCOPE` set; and
revisiting lazy-loading only if §8 Q4 is answered by verifying HACS multi-asset behaviour.

---

## 7. Cost & risk

### 7.1 Lines of code — my number, and the working

**~1,400–1,600 lines** for the complete rewrite, against 2,411 today: a **35–42 % cut**. That
excludes `editor.styles.ts`, which is a separate file and shrinks independently.

The two research reports disagree and **I side with neither**. Adjudication first:

- **`editor-research-hacs.md:642-648` says ~600–800**, extrapolated from atomic-calendar-revive's
  5.9 LOC/option. **Too low.** Atomic exposes 62 card-level options to our ~111, has no deprecation
  upgrader, no synthetic-field machinery, no search, and a much smaller per-entity form. Its ratio
  measures a smaller problem.
- **`editor-research-ha-native.md:1055-1062` says ~1,300–1,500**, from a measured marginal cost of
  **8–13 lines per option** across gauge, tile and clock. Right in magnitude, but the marginal
  figure overstates *our* case, because **our option mix is unusually cheap**: HA's measured
  editors are dominated by `select` with option lists and `number` with min/max/mode/unit, whereas
  ours is dominated by 24 `*_color` keys, ~30 `show_*` booleans and ~25 CSS-length strings — all
  one-line schema entries:

  ```ts
  { name: 'show_location', selector: { boolean: {} } },
  { name: 'day_color',     selector: { ui_color: {} } },
  ```

Recomputed against our actual key inventory:

| Component | Count | Lines each | Total |
| --- | ---: | ---: | ---: |
| Booleans (`show_*` etc.) | ~30 | 1 | 30 |
| Colours (`*_color`) | ~24 | 1 | 24 |
| CSS-length text (`*_font_size`, `*_width`, `*_spacing`, `*_size`) | ~25 | 1–2 | ~40 |
| Numbers with ranges | ~10 | 4 | 40 |
| Selects with option lists | ~10 | 8 | 80 |
| Entity / icon / action / date | ~6 | 3 | 18 |
| Weather sub-config (2 + 2×10) | 22 | 2 | 44 |
| Layout nodes (9 `expandable`, ~20 `grid`, exceptions nodes) | — | — | ~150 |
| **Card schema module** | **~127 entries** | **≈ 3.4 avg** | **~430** |
| Entity schema | 12 | 5 | ~60 |
| Chassis: lifecycle, `setConfig`, upgrade + deprecation banner, `_getTranslation`, `computeLabel` / `computeHelper`, panel mounts | — | — | ~320 |
| Value handler + key diffing + default-stripping incl. the `column:` pass | — | — | ~110 |
| Synthetic fields (`label_type`, `today_indicator`, `height_mode`, `language_mode`, `start_date_mode` + its intermediate-value guard) | — | — | ~140 |
| Per-entity widget (picker, panels, identity merge, clipboard) | — | — | ~170 |
| Search + Customised filter + chrome | — | — | ~130 |
| **Total** | | | **~1,360** |

Round up for prettier wrapping, JSDoc (AGENTS.md requires it on public functions) and the things
estimates always miss: **~1,400–1,600**.

**Why it is not the 75–90 % a naive reading suggests.** The schema is only ~430 of those lines. The
rest is chassis, the hand-written half, and two features that do not exist today (search, the
clipboard). What shrinks is the 912-line `render()` template and the 236 lines of field helpers;
what does not shrink is everything that was never about rendering fields.

Deleted outright: `getInputTag()` (30), the eight `add*Field` helpers (236), the action-config
renderer (77 → `selector: { ui_action: {} }`), and ~170 of the 209-line value-type machinery.

### 7.2 Bundle delta

Baseline given in the brief and not re-verified here (`node_modules` is absent in this worktree, so
no build was run): the editor is **52,531 B raw / 11,137 B gzip — 13.6 % / 10.3 % of the shipped
bundle**.

Directionally: a ~40 % source cut does not map linearly to bytes — schema data minifies worse per
line than code — but the deletions above are real code, and **every selector implementation is
HA's, not ours**, so nothing is added on that side. Against that, search and the memoiser add a
little. Estimate **−25 % to −35 % of the editor's bytes ⇒ roughly −3 KB gzip ⇒ ~−3 % of the total
bundle**, with no new runtime dependency. Treat as an estimate; measure with a real build before
quoting it.

### 7.3 HA-churn exposure — the actual prize

This is the argument that does not show up in a line count. §5.7 lists the change: from ~12 named
HA elements down to ~6, and the six that remain are structural rather than input elements. The
measured contrast in the survey:

| Incident | Card | Fix cost |
| --- | --- | --- |
| HA 2026.2 broke dropdowns | Mushroom (`ha-form`) | 3 files, +6/−6 |
| HA 2026.4 changed name selector | Mushroom (`ha-form`) | one ternary |
| HA 2026.5 removed `ha-textfield` | **us** (hand-rolled) | a bespoke runtime-detection shim we still carry |

`ha-form` is not immunity — Mushroom #1703 is a real long-lived breakage — but the ceiling on
damage is far lower (`editor-research-hacs.md:599-617`).

### 7.4 What could go wrong

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | `optional_actions` does not delete keys on removal, or does not compose under a non-flattened parent | **High** — it is the exceptions mechanism | Verify in a live HA early (§3.3). Fallback: ~100-line hand-rolled exceptions widget, same UX |
| R2 | `start_date_offset` intermediate-value guard has no schema equivalent | **High** — a shipped regression in a field users edit by hand | Synthetic field held in editor state, committed only when it parses (§5.2). Test it explicitly |
| R3 | Default-stripping misses the `column:` block and writes redundant overrides | High | §5.3; the failure mode that bit atomic **twice** |
| R4 | Stale `hass` inside `ha-form` — entity pickers keep the `hass` from the last config change | Medium | Declare `hass` reactive; documented in-source by `multiple-entity-row` |
| R5 | `title` accepts Jinja and we validate it live (`_titleTemplateError`, `editor.ts:103`); `ha-form` merges the whole object per keystroke | Medium | Re-wire the subscription onto the merged-value path. `multiple-entity-row` *throws* on Jinja rather than round-tripping — we must not, since `title` templating is a shipped feature |
| R6 | The editor has **zero tests** today, so nothing catches a migration regression | Medium | S5 lands with the first migrated panel, not after. Note AGENTS.md: the suite is built from **default config**, so every test must set `view: 'column'` explicitly or it passes while testing nothing |
| R7 | Search is novel in this ecosystem — nobody has shipped one to learn from | Medium | Ship it in v4.1, not v4; filter-in-place keeps the fallback (just clear the box) trivially obvious |
| R8 | Selector availability below our HA floor | Medium | One verification pass before fixing the schema (§5.7) |
| R9 | Taxonomy rename churns docs anchors and `check:docs` | Low | Same PR, both surfaces; the gate catches it |

---

## 8. Open questions

Recommendation first in each, so "yes" is the low-effort path.

**Q1 — Ship the column surface schema-driven in v4, and defer the full rewrite plus search to
v4.1?** **Recommendation: yes.** It discharges the D7 blocker, builds nothing twice, and keeps a
2,411-line rewrite out of a release that is already carrying an unreleased view. The alternative —
everything in v4 — is defensible if you would rather do one taxonomy break than two; say so and I
would re-sequence §6 into a single phase.

**Q2 — At v4.1, a fresh `editor.ts` with an entirely new translation-key namespace, English-only,
old language files backed up and mined?** **Recommendation: yes.** Your ruling that translations
are no longer a constraint is what makes this affordable, and per-key fallback means every
intermediate state degrades to English rather than to raw key names.

**Q3 — Keep `getConfigElement()` rather than moving to `getConfigForm()`?** **Recommendation: yes,
keep.** `getConfigForm` genuinely works for custom cards and would delete our element entirely, but
it can render nothing that is not a schema node — and §4 shows the entities list must be
hand-written, as it is in *every* HA card with a list, including the four-option calendar card.

**Q4 — Drop lazy-loading of the editor?** **Recommendation: yes, drop it.** §5.6: it is blocked by
the single-file HACS contract, and a second chunk that HACS does not publish would 404 exactly like
the sourcemaps did in #315/#358. I could **not verify** whether HACS downloads non-`filename`
release assets for a plugin — if you know it does, this reopens and is worth ~10 KB gzip off every
dashboard load.

**Q5 — Write a six-line memoiser instead of adding `memoize-one`?** **Recommendation: yes.** The
bundle rule governs `dependencies`; this is trivially small and avoids the precedent.

**Q6 — Keep keys that drop out of the schema on a view switch, rather than pruning them?**
**Recommendation: keep.** Both layouts are live, so the key is usually still doing something; and
the Customised filter makes genuinely stale keys visible, which beats deleting them silently.

**Q7 — Reframe "inert in this view" as "applies to the list layout"?** **Recommendation: yes.** It
is more accurate (the card really does render as a list on a phone), it reads as information rather
than as a bug report, and it generalises to three views where "inert" does not.

**Q8 — Skip `superstruct`?** **Recommendation: yes, skip.** Its one real prize is reachable by
throwing from `setConfig`, which HA already catches and turns into the YAML fallback.

**Q9 — Adopt the nine-panel taxonomy in §2.2, moving `docs/reference/configuration.md` headings in
the same PR?** **Recommendation: yes**, but note it is deliberately unexciting — the value is in
removing view-dependent nouns, not in the reordering itself.

**Q10 — Search as filter-in-place (panels stay, non-matching fields disappear) rather than a flat
result list?** **Recommendation: filter-in-place.** It preserves the grouping as context — a user
learns *where* the option lives while finding it — and clearing the box is an obvious undo.

**Q11 — Per-entity: multi-picker + per-entity `ha-form` + clipboard, rather than the `object`
selector?** **Recommendation: yes.** The `object` selector is free but cannot express the
string-or-object union or host the synthetic `label_type` field.

**Q12 — Put the live width table in the Layout panel?** **Recommendation: yes.** It is novel, so it
carries some risk of being wrong in ways nobody has learned yet — but it discharges two D7 blockers
with data we already compute, and it answers the question column view will otherwise generate
support threads about.

---

## 9. Rejected alternatives

### 9.1 Tabs per view — one tab each for List, Column, Grid

Rejected, agreeing with D8 and with the earlier assessment, but on the stronger reason: **tabs model
the problem backwards.** An override is an exception to a value, and an exception wants *adjacency*
to the thing it excepts. Tabs present three near-identical configurations, force a decision about
which tab to type in for the ~65 keys that are not even eligible, and make the one comparison that
matters — shared value versus its column exception — impossible to see at once.

D8's stated third reason, that tabs *"would double the translation burden across all 11 editor
languages"*, is **factually wrong** and should not be cited again: an override reuses its parent's
label key by construction, so a per-view repeat costs zero new strings.

### 9.2 Hiding fields that do not apply in the current view

Already ruled out and the ruling is right. Worth recording the sharpened form of the rule, because
"never hide" as written contradicts the codebase's own practice at ~14 sites:

> **Hide on a value the user just set in the same panel; annotate on a condition set elsewhere.**

`show_location: false` hiding the five location styling fields is correct progressive disclosure and
must survive. `view: column` hiding `today_indicator_position` is not, because that field is the
live control for the layout the card uses on a phone.

### 9.3 A single "Column Settings" panel holding all the overrides

Rejected. It destroys adjacency, recreates the entire taxonomy inside itself so every future option
must be filed twice, and does not survive a third view — "Column Settings" plus "Grid Settings" is
two panels that are copies of each other. The exceptions nodes (§3.3) give the same capability
sited correctly, and the Customised filter (§2.5) gives the one genuine benefit of a single place —
seeing everything that diverges — as a *read* surface rather than a second *write* surface.

### 9.4 A `views: { column: { … } }` wrapper

Rejected. `grid:` as a flat sibling is equally extensible, the nesting adds a level to every YAML
path and every editor data path, and it is a breaking change to a block about to ship. No benefit
identified.

### 9.5 `getConfigForm()`

Rejected — see Q3. Attractive (it deletes our element entirely, and HA builds the form from a
static array) and verified to work for third-party cards, but it forecloses the hand-written half
we are certain to need.

### 9.6 The `object` selector with `multiple: true` for the entities list

Rejected. It is a genuinely free sortable list-of-sub-forms, but it cannot represent our
`string | EntityConfig` union, gives no place for the synthetic `label_type` field that replaces
209 lines of value-type machinery, cannot host the clipboard, and degrades to a raw YAML editor
whenever `fields` is incomplete.

### 9.7 Auto-deriving editor fields from `DEFAULT_CONFIG`

Rejected. Control type, option lists, ordering, grouping, disclosure predicates and helper prose are
all absent from `DEFAULT_CONFIG` and would need a side table — at which point the side table *is*
the schema, and deriving from `DEFAULT_CONFIG` has added a second source of truth rather than
removed one.

### 9.8 Big-bang rewrite inside v4.0.0

Rejected for v4 only, not on principle (Q1). The column surface is a release blocker and the
release already carries an unreleased view; §6.1 shows the incremental path costs nothing because
the v4 work is the seed of the rewrite rather than a throwaway.

### 9.9 Overturned from `editor-greenfield-assessment.md`

Two of its conclusions do not survive, and it is worth being explicit about which, because its
*analysis* is sound and heavily reused above.

- **"Keep the field-rendering machinery and make it declarative from the inside out"** (its §1
  verdict; the five `add*Field` helpers as the seam). Overturned. That assessment never evaluated
  `ha-form` — it was written under a brief that did not include it — and keeping our own helpers
  keeps the exact liability that is the main prize: **we go on owning the field-rendering layer,
  and go on absorbing HA's component churn by hand.** Its seam argument was correct about *where*
  to intervene cheaply, and its five-helper wrapper is genuinely the right shape for a v4-only
  patch; it is the wrong end state.

- **"Search is v4.1 because it needs a field registry, and a field registry is a rewrite of the
  most fragile file in the repo"** (its §3.6). Overturned in its reasoning, upheld in its
  scheduling. **The schema *is* the field registry**, so search is a filter over an array — ~130
  lines — rather than a prerequisite rewrite. It still lands in v4.1, but because the panels must
  be migrated first, not because search is expensive. This is the single most consequential
  difference between the two documents.

Retained from it substantially unchanged, with credit: the diagnosis of the list-shaped taxonomy;
the observation that the docs and the editor disagree about where a third of the options live; the
"exceptions, not configurations" reframe; `VIEW_INERT_KEYS` as a single exported source (here
generalised to `VIEW_SCOPE`); the ruling to generalise the *editor's* view loop now while leaving
`view.ts`'s resolution layer alone; and the `DEPRECATED_CONFIG_MAP` one-way door, which is S0 above.

---

## Appendix — what I could not verify

- **No live Home Assistant contact** (per the brief), so nothing here is validated against a real
  frontend. The three that most need it: `optional_actions` semantics (R1), `entity` selector
  `reorder` availability, and how a two-column `grid` reads in the actual editor pane.
- **No build was run** — `node_modules` is absent in this worktree and installing it was out of
  scope. The bundle figures in §7.2 are the brief's measurement plus my directional estimate, not a
  measurement of mine.
- **Whether HACS downloads non-`filename` release assets for a plugin** — the question that decides
  Q4. What I *did* verify is our side: `hacs.json` pins one filename and `rollup.config.mjs:20-32`
  documents that the release attaches only that file.
- **Minimum HA versions** for `ui_color`, `ui_action`, `select.mode: 'box'`, `entity.reorder` and
  `optional_actions` (§5.7).
- **`ha-form` internals** are cited from `editor-research-ha-native.md` at its pinned SHA
  (`home-assistant/frontend` @ `08b33ccb`), not re-read by me. That report flags its own §6.2 line
  numbers marked `~` as approximations.
- **`docs/development/column-view.md` was read selectively** — the heading index, D4–D8, A3-B, A3-G
  and A3-H — as instructed. Rulings elsewhere in its 2,240 lines may bear on this design.
- **The ~117-option figure** comes from the brief. My own counts are listed at the top of this
  document; the closest direct equivalents are 92 top-level `DEFAULT_CONFIG` keys (three of them
  containers) and 105 documented option rows.
- **Effort sizes (S / M / L)** are relative, not hour estimates.
