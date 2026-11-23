---
title: Architecture
---

# Calendar Card Pro Architecture

This page is for contributors. It maps the source tree, states the rules that hold across the
whole card, and sends you to the page that covers the part you are about to change. Four
companion pages hold the detail: [Data Loading & Caching](/architecture-data),
[Rendering & Views](/architecture-rendering),
[Interaction & Event Writes](/architecture-interaction) and
[Toolbar & Navigation](/architecture-toolbar). The traps, the gates and the release process are
in [AGENTS.md](https://github.com/alexpfau/calendar-card-pro/blob/dev/AGENTS.md); read it before a
structural change.

## 🗺️ Where to Start

Find the change you are making, open the files named, and read the page beside them.

| To change                                             | Start with                                                                                                                                                                                                                | Read                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| What is fetched, cached, refreshed or pushed live     | `utils/events.ts`, `utils/live-calendars.ts`, `calendar-card-pro.ts`                                                                                                                                                      | [Data Loading & Caching](/architecture-data)                                                         |
| How events are filtered, deduplicated or split        | `utils/events.ts`                                                                                                                                                                                                         | [Event Data Flow](/architecture-data#event-data-flow)                                                |
| How an event looks in every view                      | `rendering/presentation.ts`, `rendering/leaves.ts`                                                                                                                                                                        | [Rendering & Views](/architecture-rendering)                                                         |
| One layout only                                       | `rendering/render.ts`, `rendering/column.ts` or `rendering/grid.ts`                                                                                                                                                       | [Rendering & Views](/architecture-rendering)                                                         |
| What a tap, hold, swipe or drag does                  | `calendar-card-pro.ts`, `interaction/actions.ts`, `interaction/grid-draft.ts`, `interaction/grid-move.ts`                                                                                                                 | [Gesture Model](#gesture-model), then [Interaction & Event Writes](/architecture-interaction)        |
| Adding, editing, moving or deleting events            | `rendering/event-popover.ts`, `interaction/popover-model.ts`, `interaction/event-details.ts`, `interaction/calendar-writes.ts`, `interaction/grid-move.ts`, and `calendar-card-pro.ts` for a dragged event (`_writeMove`) | [Interaction & Event Writes](/architecture-interaction)                                              |
| The toolbar, paging, view switcher or calendar filter | `rendering/toolbar.ts`, `rendering/legend.ts`, `utils/paging.ts`                                                                                                                                                          | [Toolbar & Navigation](/architecture-toolbar)                                                        |
| A configuration option or the editor                  | `config/`, `rendering/editor/`, then the module that reads the option                                                                                                                                                     | [Configuration Layers](#configuration-layers-editor-adoption), [Adding an Option](#adding-an-option) |
| Translations                                          | `translations/` for the card, `rendering/editor/translations/` for the editor                                                                                                                                             | [Adding Translations](/contributing#adding-translations)                                             |

## 🗂️ Directory Structure

Every source area and top-level module, with what it owns; the editor's schemas and views and the
language files are summarized. Tests live in `tests/`, the build and documentation gates in
`scripts/`, and these pages in `docs/`.

```text
src/
├── calendar-card-pro.ts          # Main entry point and component class
├── config/                       # Configuration-related code
│   ├── config.ts                 # DEFAULT_CONFIG and config helpers
│   ├── constants.ts              # Application constants and defaults
│   ├── types.ts                  # TypeScript interface definitions
│   ├── view.ts                   # View blocks, defaults, density, fallback, the load window
│   └── views.ts                  # The views, in order, free of imports
├── interaction/                  # User interaction handling
│   ├── actions.ts                # Runs the card's tap and hold actions
│   ├── add-event.ts              # Add button: writable calendars, label, new-event times
│   ├── back.ts                   # Where the `back` action goes
│   ├── calendar-changes.ts       # Page-wide announcement after a write
│   ├── calendar-writes.ts        # Feature bits; the create, update and delete commands
│   ├── event-action-kind.ts      # What an event action amounts to, for card and editor
│   ├── event-actions.ts          # Event actions: the event's fields, filling them in
│   ├── event-details.ts          # An event's popover entry, display text and permissions
│   ├── event-map.ts              # Zone and place lookup, map tiles under a location
│   ├── event-times.ts            # An event's span, as edited and as stored
│   ├── feedback.ts               # Hold indicator (the ripple is drawn by render.ts)
│   ├── grid-draft.ts             # A new event drawn by drag in a grid
│   ├── grid-move.ts              # Moving an event by drag in a grid
│   ├── popover-model.ts          # The popover's draft: built, compared, checked, written
│   ├── rrule.ts                  # Home Assistant's repeat rules: read, written, worded
│   └── search-session.ts         # A search's year-wide load and its rows
├── rendering/                    # UI rendering code
│   ├── editor/                   # Schema-driven configuration editor (its own bundle)
│   │   ├── index.ts              # Build entry and public surface of the editor
│   │   ├── element.ts            # The Lit element: overview, pages and the forms they mediate
│   │   ├── views/                # Overview and page templates; focus, scroll and Escape helpers
│   │   ├── pages.ts              # Page registry: each built field's page, heading and appearance
│   │   ├── panels.ts             # Builder registry and schema walking
│   │   ├── schemas/              # One field builder per section, plus their shared vocabulary
│   │   ├── field-index.ts        # Every built field, by a stable id
│   │   ├── plan.ts               # The shown set: live fields, folded settings and gate lines
│   │   ├── shown.ts              # The shown set in words: value sources, what Reset leaves
│   │   ├── gates.ts              # Why a field is withheld, and the setting that opens it
│   │   ├── filter.ts             # Withholds the fields a layout ignores
│   │   ├── search.ts             # The search's index, matching and ranking
│   │   ├── navigation.ts         # The overview, the pages and the way back
│   │   ├── summary.ts            # A value in words, for search, Stored Settings and rows
│   │   ├── announce.ts           # The editor's one live region
│   │   ├── history.ts            # Undo and Redo snapshots
│   │   ├── reset.ts              # One reset path for every destination
│   │   ├── audit.ts              # Stored Settings
│   │   ├── misplaced.ts          # Moves an option the card ignores to where it works
│   │   ├── deprecated.ts         # Removed options a card still holds, and their replacements
│   │   ├── prefs.ts              # Show YAML Option Names
│   │   ├── quick-setup.ts        # Quick Setup's answers and the configuration they build
│   │   ├── stories.ts            # The Example Stories Quick Setup starts from
│   │   ├── preview.ts            # Configurations previewed before a change is made
│   │   ├── calendar-list.ts      # Entries grouped by calendar, and the list's operations
│   │   ├── split.ts              # Split This Calendar: when an entry can split, and what it writes
│   │   ├── split-review.ts       # Where an entry's upcoming events land after a split
│   │   ├── calendar-days.ts      # The card's day arithmetic, mirrored for Split's review
│   │   ├── word-lists.ts         # blocklist and allowlist read as words, and written back
│   │   ├── reorder.ts            # Keyboard and pointer reordering as data
│   │   ├── chips.ts              # Toggle chips: the event parts and the toolbar's controls
│   │   ├── chip-labels.ts        # Each chip's label
│   │   ├── colors.ts             # The composed color control's data
│   │   ├── ha-form.ts            # Home Assistant's schema shape, and the element each node needs
│   │   ├── value.ts              # Serialization, legacy migration, authored-value retention
│   │   ├── entities.ts           # Per-calendar schema and form helpers
│   │   ├── buttons.ts            # Write path for the toolbar's own buttons
│   │   ├── exceptions.ts         # Removes stored view overrides for Reset controls
│   │   ├── subforms.ts           # Reusable schema fragments
│   │   ├── workspace.ts          # The editing scope: Layout Defaults (`shared`) or one of the four layouts
│   │   ├── routing.ts            # Scope projections and scope-captured writes
│   │   ├── write-frames.ts       # What each write belongs to, and the part of a change it writes
│   │   ├── normalize.ts          # Comparable root and nested form values
│   │   ├── synthetic.ts          # UI-only fields, and values invalid while typed
│   │   ├── localize.ts           # The string hooks `ha-form` calls
│   │   ├── hass-localize.ts      # Wraps hass.localize to name `expand` in HA's action editor
│   │   ├── hass-key.ts           # Which hass each form is handed and redraws it; selectors drawn by value
│   │   ├── strings.ts            # English editor strings
│   │   ├── version.ts            # Build-stamped version the editor reports
│   │   ├── translations/         # The same keys per language, partial by design
│   │   └── styles.ts             # Editor chassis CSS
│   ├── render.ts                 # Card shell and the list view
│   ├── card-size.ts              # The whole card's height in every layout
│   ├── toolbar.ts                # Header toolbar and its controls
│   ├── legend.ts                 # The calendar filter: its chips, its button and menu
│   ├── menu.ts                   # The toolbar's menus: placed, painted, opened and closed
│   ├── surface.ts                # Opaque menu and switcher surfaces under see-through themes
│   ├── view-pictograms.ts        # The picture of each view, for editor and toolbar
│   ├── activation.ts             # Marks rendered events and days as tap targets
│   ├── event-popover.ts          # The event popover: details, editing in place, new events
│   ├── popover-shell.ts          # The popover's shell: opening, placing, its look, closing
│   ├── search-panel.ts           # The search panel: its field, its results, the keyboard
│   ├── day-panel.ts              # The day panel a month's "+N more" opens: List's rows
│   ├── column.ts                 # The column view
│   ├── grid.ts                   # The timed grid and spanning all-day band
│   ├── grid-accessibility.ts     # Full configured names for timed Grid events
│   ├── month.ts                  # The month view: six week rows, bars, lines and "+N more"
│   ├── leaves.ts                 # Leaf renderers shared across the views
│   ├── presentation.ts           # Layout-independent per-event presentation models
│   ├── accent-text.ts            # The `accent` text sentinel's fields and properties; CSS-free
│   └── styles.ts                 # CSS styles and dynamic styling
├── translations/                 # Localization support
│   ├── dayjs.ts                  # Relative-time localization
│   ├── language-codes.ts         # Card-language codes and language selection, table-free
│   ├── localize.ts               # Translation functions
│   └── languages/                # Translation files (39 supported languages)
│       ├── en.json               # English translations
│       ├── de.json               # German translations
│       └── ...                   # Other language files
└── utils/                        # Utility functions
    ├── events.ts                 # Calendar event fetching, caching and processing
    ├── live-calendars.ts         # Live calendar changes over `calendar/event/subscribe`
    ├── hass-relevance.ts         # Which `hass` updates can change what the card draws
    ├── grid.ts                   # Pure time-grid geometry, overlap lanes, banner spans
    ├── grid-title-fit.ts         # Browser-measured label/title fitting, separate from geometry
    ├── grid-time-fit.ts          # Picks each grid time row's degradation step
    ├── grid-cascade-threshold.ts # Measured cascade threshold, in minutes, for `utils/grid.ts`
    ├── grid-overflow-strip.ts    # Measured `+N` strip width, as a column share
    ├── month-layout.ts           # A month row's lines, and what each day hides behind "+N"
    ├── month-day.ts              # A month day's list, the narrow form and the selected day
    ├── content-box.ts            # A clipping text box's width without its inline room
    ├── format.ts                 # Date and text formatting
    ├── event-age.ts              # The `YEAR=` marker: ages and anniversary counts
    ├── text-replace.ts           # Per-calendar `replace_pattern` / `replace_with`
    ├── start-date.ts             # The `start_date` grammar, and the window it opens
    ├── paging.ts                 # Paging through dates: page length, home, the range's name
    ├── helpers.ts                # Generic utilities (color, ID generation)
    ├── entity-colors.ts          # Calendar colors from HA's entity registry, over WebSocket
    ├── entity-icons.ts           # Calendar icons from entity state, for `label: home-assistant`
    ├── person-pictures.ts        # Person pictures from entity state, for `label: person.*`
    ├── calendar-names.ts         # A calendar's name: `name`, HA's, or its id
    ├── logger.ts                 # Logging system
    ├── templates.ts              # Jinja2 title templates over the HA websocket
    ├── title-motion.ts           # Pure per-title timing and cohort admission state
    ├── title-motion-controller.ts # Visible per-card membership and native clock alignment
    ├── title-words.ts            # Splits grid titles so they wrap only at spaces
    ├── view-choice.ts            # Per-device view choice and hidden calendars
    ├── toolbar-fold.ts           # Which start controls fold into the menu
    ├── search.ts                 # Searching events: the window, folding, matching, order
    ├── editor-url.ts             # Where the editor file lives, relative to the card
    ├── links.ts                  # Web addresses in an event's text, as link pieces
    ├── weather.ts                # Weather data fetching and processing
    └── weather-i18n.ts           # Condition text in the card's language
```

## 🧭 Four Views, One Agenda

The card renders the same agenda in one of four layouts, and this is the structural fact most
worth holding on to before changing anything under `rendering/`:

- **`view: list`** stacks days vertically, each day a row. It is the default.
- **`view: column`** lays days side by side, one column each.
- **`view: grid`** positions timed events against a shared hour axis, with all-day events in a
  band above it.
- **`view: month`** draws six whole weeks, a row each: all-day and multi-day events as bars across
  their days and timed events as lines, or, where a day is too narrow for titles, a narrow form with the selected
  day's list.

They share the card shell, the event pipeline and the presentation models. `leaves.ts` holds the
shared renderers and `presentation.ts` everything about an event that does not depend on layout;
`render.ts`, `column.ts`, `grid.ts` and `month.ts` only arrange those pieces, Grid adds the pure
geometry in `utils/grid.ts` and Month its occupancy in `utils/month-layout.ts`, which know no
pixels. A behavior meant for every view belongs in the shared path, never once per renderer (see
[Rendering & Views](/architecture-rendering)).

The effective view can change with available width. A narrower Column or Grid card first draws
fewer days, down to `min_days_to_show` (two for Columns and one for Grid unless set; Columns keeps
every day by default under `cramp`), in a window kept as close to today as the configured range
allows (`visibleDayWindowStart`). Below that floor `min_days_fallback` decides: `list` falls back to
List, and `cramp` holds the floor with days narrower than `min_day_width`, Column narrowing its
columns and Grid scrolling sideways with each day at least `2rem` wide. `config/view.ts` owns this
resolution and its hysteresis, so resizing does not flip layouts back and forth. Month never falls
back: below `month → min_day_width` a day, it draws its narrow form, with a hysteresis of its own
(`utils/month-day.ts`).

Switching layouts at home never fetches, because the load spans every view the card can show: the
longest `days_to_show` from the shared start, and Month's weeks where it is reachable, which
can start before it (`ViewConfig.loadConfig`; see [View Switcher](/architecture-toolbar#view-switcher)).
A switch away from home carries the date in view, and a page's load holds the weeks of the month
its day falls in, or under `month → start: week` the weeks from its own, so that switch lands on the same load wherever the next layout's days lie in
those weeks. A day picked on a narrow month at home, or days running past the weeks, are loaded
as any page is. The editor's
scope is separate again: opening List's page exposes its controls without changing the layout.

## 🧱 Configuration Layers & Editor Adoption

The top level is the shared base. `list:`, `column:`, `time_grid:` and `month:` hold presentation
values for their own views; calendars, fetching, actions and the other card-wide options stay at the top level,
and nothing that decides _which_ events are fetched may differ between views. A shared view option
resolves as explicit view override, then built-in divergent view default, then shared value; List
has no divergent defaults. View-only options use their own block defaults, with a root fallback for
the legacy List-only options.

::: warning One Rule, Two Implementations
`resolveViewOption` applies that order per key and `resolveEffectiveConfig` in bulk; the card
renders through the second. A change to the rule changes both.
:::

- **Scopes.** The scope is the place, not a setting: a layout's page and its topic pages carry
  the layout in their route (`navigation.ts` › `Route`, `routeScope`), and `_workspace` derives
  from the route. **Layout Defaults** (`shared`) writes roots; **List**, **Columns**, **Grid** and
  **Month** write their blocks (`workspace.ts`). Whole Card's pages (`pages.ts` ›
  `WHOLE_CARD_PAGES`) edit in the shared scope, and the overview edits in the layout the card
  opens in. A calendar's page belongs to no layout: its options are stored once, on the entry, so
  it is built for every layout the card can show (`field-index.ts` › `entryViews`,
  `entrySchemaAcross`), and an option only some of them apply says so. Its route names a layout
  only where a search result adds one none of them is, for an option only that layout applies
  (`element.ts` › `_entryWorkspace`), and search judges a calendar's fields in that page's context,
  whatever scope it runs in. A whole-card setting a topic also names is drawn
  there as a `copy` or a `reference` (`pages.ts` › `Appearance`), never placed there, so search
  and every walk of where a setting lives read its home alone. A copy carries the field's
  `data-field` and a reference does not, so Pick From Preview, landing on the page a part opens,
  finds a copy there and passes over a reference. `routing.ts` captures
  the destination with each rendered form, so a delayed event cannot write into another scope.
- **Format marker.** `config_version: 6` records editor adoption, not renderer precedence.
  `configVersionState` reads a missing marker or an older nonnegative integer as legacy, accepts
  the current version, and blocks visual-editor writes for a future version or any other value,
  negative, fractional or not a number; it does not coerce `'5'` to a number.
- **Adoption.** An ambiguous legacy List or Grid card is upgraded when the editor opens, as one
  undo step: authored divergent roots keep the List appearance (moved into `list:`), and the
  receipt offers to apply them to all layouts instead (kept at the root), as a second step. Both
  move the List-only roots into `list:`, keep a value the block already holds over the older
  root, and stamp the format (`migrateListConfig`). After an Undo of the upgrade, the next edit
  upgrades the same way, inside its own step. Legacy Column cards, unambiguous cards and
  versionless cards already carrying `list:`, `time_grid:` or `month:` adopt on their first real
  edit, and
  opening the editor writes nothing for them.
- **Authored values.** Authorship is captured from raw input before defaults are merged, so
  migration sees `false`, zero and default-equal values, and `_report` updates the editor's own
  state before forms reopen or Home Assistant echoes the save. `toStoredConfig` takes the stored
  YAML as its baseline: a value the YAML holds is kept, even at its default, unless the write
  changed it; an explicit divergent root is kept whatever its value; implicit defaults stay absent.
  A switch to Grid then copies those authored roots into `time_grid:` (`reconcileTimeGridValues`),
  in the editor only, never when YAML loads.

::: warning Shared Is Not List
Layout Defaults builds its fields as List (`baseViewForWorkspace`), but its conditional controls
must read the shared value through `resolveWorkspaceOption`, never a `list:` override. Resolving
them as List shows the wrong controls on the shared surface.
:::

::: warning One Authorship Model
Serialization (`toStoredConfig`), the shown set and its per-view words (`plan.ts` › `storedAt`),
Reset (`reset.ts`) and the switch to Grid (`reconcileTimeGridValues`) must read authorship the same
way, from the stored YAML and the authored root keys, never from the merged configuration. A write
path or label that reads the merged values shows a kept line as inherited, or loses a choice the
switch to Grid has to copy.
:::

See [Per-View Options](/features/layouts#per-view-options) and the
[editor upgrade flow](/features/editor#adopting-the-layout-format) for user-facing examples.

## 📦 One Card, Its Editor & Its Languages

The build emits self-contained files into a flat `dist/`: the card, `calendar-card-pro.js`, the
editor, `editor.js`, and one file per editor language, `editor-de.js` and so on (each `-dev`
suffixed in development builds). The card fetches the editor only when someone opens it, which
keeps the editor off every dashboard load, and the editor fetches only the language it is drawn in.

No file imports another. The card computes the editor's URL at runtime (`utils/editor-url.ts`),
carrying its own cache-busting query onto it, where neither module graph sees it. A plain dynamic
`import()` would make Rollup emit a shared chunk that the editor imports back from the card, and the
query HACS appends to the card's URL would make the browser load that as a second copy of the card.
The editor finds a language file the same way (`translations/files.ts`), carrying on the query it
was given. `npm run check:bundle` asserts the result after every build.

### Editor Languages

US English lives in `strings.ts` and British English, a delta of a few dozen spellings, is built
into the editor (`translations/held.ts`). Every other translation is written by the build into a
file of its own (`emitEditorLanguages`): the version, a fingerprint of the English keys and one
value per key, in the order the editor rebuilds its keys in. The editor reads it by position and
refuses a file from another version or for other keys. Opening the editor in German downloads the
editor and German, about half of what it downloaded when every language was inside it; HACS still
stores every file, since it downloads every release asset.

The editor draws nothing until its language has loaded or failed (`_language` in `element.ts`),
because labels, helpers and the search index are kept by language: strings arriving under a
language already drawn would leave them stale. A file that is missing, stale, malformed or never
answers settles the language anyway, and the editor shows it in English, key by key, through
`lookup`. `translations/index.ts` still imports every language, for the tests and the gates; the
editor does not import it.

The event popover and the search panel ship inside the card's file: every HACS user downloads every
release asset, so a third file would spare nobody its bytes.

### Compact Payloads, Readable Sources

`scripts/compact-payloads.mjs` compacts data before compilation in both build variants, leaving the
authored translations, browser requirements and the two-file layout unchanged.

- **Day.js.** Locales keep their names and complete relative-time definitions, and English stays
  intact. The card uses Day.js for relative time only, and a build-time source guard rejects any
  other Day.js API or plugin; expanding that surface means revisiting the subset.
- **Editor strings.** The sorted English keys are stored once, with one aligned value array per
  language. A missing translation is `null` and an empty string stays empty, so partial
  translations, the British English delta and the fallback order use the same lookup code as
  before. An English-key change invalidates every vector in incremental builds. The key vector
  ships front-coded by dot segment and is rebuilt before the first lookup; the build decodes what
  it emits and fails unless the keys come back exactly. Only English and British English ship
  inside the editor; every other language's vector is its own file (see _Editor Languages_).
- **Editor templates.** In files under `src/rendering/editor/` only, a run of ASCII whitespace
  spanning a line break in an `html` template becomes one space, outside quoted attributes and
  comments, and in the stylesheet it goes beside a brace or semicolon. The card's templates keep
  their whitespace, which its list-view snapshots depend on; the editor's are safe only while
  none renders text under a preserving `white-space`.
- **Guards.** The transforms reject duplicate or unknown keys, non-string values, unsupported
  source shapes and unsafe locale initializers. Tests compare unoptimized and compacted output
  across languages, thresholds and the suite's timezones; the source-only translation checks stay
  independent of compaction.

The editor build also tunes terser on its own (`rollup.config.mjs`): less inlining, which gzip
rewards, and renamed private members of the editor element (`editorPrivateMembers`). The renaming
covers the undecorated `private` and `protected` members of `element.ts`; the build refuses to
start if any of them appears as a whole string literal in `src/`, since a member read by its name
would break. The card keeps its options and stays byte-identical.

## 🧩 Module Responsibilities

Seven layers, each with one job; a change usually belongs to exactly one of them. The companion
pages hold the module notes for `interaction/`, `rendering/` and most of `utils/`.

1. **`calendar-card-pro.ts`** coordinates the lifecycle, state, gestures, timers and live
   subscriptions. It skips a render whose only change is a `hass` that changed nothing it draws
   (`shouldUpdate`, `utils/hass-relevance.ts`); `tests/hass-relevance.test.ts` reconciles that rule
   with every `hass` read, so a new reader the rule misses fails there.
2. **`config/`** validates and resolves the authored configuration: `DEFAULT_CONFIG`, entity
   normalization, change detection and the `toolbar:` reader in `config.ts`, and view resolution,
   width thresholds and per-view scope (`VIEW_SCOPE`) in `view.ts`.
3. **`utils/events.ts`** fetches, caches and processes events.
4. **`rendering/presentation.ts`** computes layout-independent event state.
5. **`render.ts`, `column.ts` and `grid.ts`** arrange the shared leaves.
6. **`interaction/`** builds actions, drafts and write commands, without touching the DOM.
7. **`rendering/editor/`** is a separate schema-driven application in its own bundle. Its schemas
   name selectors, never Home Assistant input elements, and everything but `element.ts`,
   `styles.ts` and `views/` is free of Lit and the DOM, so the tests and `check:i18n` can import a
   schema.

The editor opens on an overview and shows each section on a page of its own. The builders in
`schemas/` stay the authority on whether a field exists; the page registry (`pages.ts`) places each
field they build, by its id (`field-index.ts`), on the overview, a section page or a calendar
entry's page, under a heading and with an appearance, and `tests/editor-page-registry.test.ts`
fails on a built field no page places. `plan.ts` decides what a page draws: every field that applies
here (the editor always plans with `showEverySetting`), each under a head row of its own
(`views/shown.ts` › `settingHead`) that holds its name, its value while folded, a chevron and its
ⓘ, outside Home Assistant's field box, and under the name the setting's facts (`shown.ts` ›
`stateFacts`), none of them pressable. Where no value is stored, a folded row still names what
applies (`unset.ts`). Below `NARROW_WIDTH` the editor carries a `narrow` attribute and drops the
value. Home Assistant draws a switch at least 56 px tall
with its label at the top, so `_fitSwitchRows` takes back the part below the label as a
`ResizeObserver` reports each switch row drawn. A field whose plan says only `every`, at its default and not opened this
session, is folded to that head; opening it adds it to the session's added set, which leaving the
page clears. `element.ts` draws that plan and never filters a form itself, and every Reset and
Remove goes through `reset.ts`, from a button in plain view right after the setting's Set. A calendar entry's or a toolbar button's write names its owner by key, never by
place (`write-frames.ts`), so a removal above it cannot hand its form another owner. `hass-key.ts`
skips a `hass` that changes nothing the editor draws, and hands a fresh `hass` only to forms whose
selectors read states (`LIVE_SELECTORS`); every other form gets a steady one.

In `translations/`, `language-codes.ts` imports nothing, so the editor can pick a language without
the translation tables, and `dayjs.ts` owns relative time. `logger.ts` can be raised above errors
at runtime in a released build, so a bug report can carry the output that explains it.

## 🔀 Data Flow

Events travel one read path, and every write comes back into it through a refresh.

```text
Read   Home Assistant (REST or live push) → stored window or fetch → processEvents
         → groupEventsByDay → buildEventPresentation → List, Column or Grid
Write  gesture, add button or drag → popover draft → calendar/event/* command
         → _refreshAfterWrite → refreshEvents on every card showing the calendar → Read
```

The read path and the write invalidation are on [Data Loading & Caching](/architecture-data); the
write side is on [Interaction & Event Writes](/architecture-interaction).

## 👆 Gesture Model

One recognizer on `ha-card` decides every press, so a tap, a hold, a swipe and a drag can never
both happen. It reads the target at pointer-down and runs the innermost target's action.

| Target                                               | Tap                | Hold                |
| ---------------------------------------------------- | ------------------ | ------------------- |
| An event                                             | `event_tap_action` | `event_hold_action` |
| An empty slot: a day's empty space, a grid time slot | `day_tap_action`   | draws, in a grid    |
| A narrow month's day                                 | selects the day    | `hold_action`       |
| The card: everything else, title and toolbar rows    | `tap_action`       | `hold_action`       |

- **Precedence.** A tap or a hold runs the innermost target's action, else the next target out's.
  An event covers its slot: a press on an event falls through to the card, never to the slot. A
  narrow month's day covers its day too: a tap selects it and runs nothing else, and
  `day_tap_action` is its list's, under the weeks.
- **Not targets.** Toolbar controls and the filter menu keep their presses (`stopCardGesture`), and
  a press that begins on a link in an event row arms nothing.
- **Endings.** Every armed press ends in exactly one way at pointer-up (`_handlePointerUp`):
  **held** runs the hold, or in a grid draws or moves an event; **stayed** is a tap; **moved** is
  neither, but swipes to page by touch, or draws or moves in a grid by mouse; **canceled** does
  nothing.
- **Keys and editing.** Enter and Space activate the focused card, event or day. There is no key
  hold: an event with a hold and no tap of its own is still a button, and the keys run its hold
  (`_activate`). A month is one grid with one tab stop, which the arrows, Home, End and the page
  keys move, paging where they leave its rows; Enter or Space opens a wide day's panel or selects a
  narrow day (`_handleMonthKeyDown`). While Home Assistant edits the card, nothing that writes to
  a calendar runs, and no swipe.

The full rules are in [Gesture Model in Detail](/architecture-interaction#gesture-model-in-detail).

## 🎯 Design Principles

The rules a change is judged against in review, alongside the shared pipeline described under
[Four Views, One Agenda](#four-views-one-agenda):

- **The source stays the source.** `_source` keeps the event as Home Assistant returned it; display
  text, repaired ends and split days live only on display copies, which no write reads.
- **Pure where it can be.** Geometry, paging, search, toolbar folding, the popover draft and the
  repeat rules touch no DOM; the browser is measured in thin modules beside them.
- **Checked at runtime.** Types do not protect YAML, Home Assistant payloads or stored entries, so
  each is checked where it is read, and a bad value falls back without discarding valid neighbors.
- **Public contracts where Home Assistant renames things.** Editor schemas name selectors, never
  Home Assistant input elements, which it renames without notice; the popover and the search panel
  use only the public dialog contract (`show-dialog`); words come from `hass.localize`, and colors
  from theme variables. The card does render a few Home Assistant elements (`ha-card`, `ha-icon`,
  `ha-ripple`, and `ha-form` and `ha-svg-icon` in the editor), and adding
  another needs a reason.

## 🧹 Maintenance Guidelines

Whatever a component starts (a timer, observer, listener, subscription or animation) it stops on
disconnect; `disconnectedCallback` in `calendar-card-pro.ts` is the list to extend. Before pushing,
run every gate [AGENTS.md](https://github.com/alexpfau/calendar-card-pro/blob/dev/AGENTS.md) lists.

### Adding an Option

1. Give it a type in `config/types.ts`, a default in `DEFAULT_CONFIG`, and a runtime check where it
   is read.
2. Decide its scope: card-wide, overridable per view, or view-only. An option a view ignores needs
   a `VIEW_SCOPE` entry.
3. Decide when it is read. A fetch-time option must reach the cache key and may not be overridden
   per view (`FETCH_TIME_KEYS`); a processing-time option goes into `PROCESSING_TIME_KEYS`, or a
   card-level change to it renders stale; a render-time option needs nothing.
4. Add a per-calendar option to `normalizeEntities`'s field list, where `tsc` names it if it is
   missing, and a new event field to the display copy `groupEventsByDay` builds, which drops a
   missing one silently.
5. Add the editor field where its scope puts it, not at the end of its section, with its string in
   `strings.ts`; `check:i18n` names every missing key.
6. Add a test that turns it on, since the suite is built from default config, and for a length, one
   at a non-px unit.
7. Add its row to [the reference](/reference/configuration) and a section on its feature page.
