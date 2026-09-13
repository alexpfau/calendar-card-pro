# Visual Configuration Editor

Configure the card with Home Assistant's visual editor and see a live preview as you edit.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

The v5 editor shown above is editing **All Layouts**, with **Card Displays** still set to List.

To open it, click the three dots (⋮) in the top-right corner of the card and select **Configure**. If you have not added a card yet, start with [Usage](/guide/usage).

## 🗂️ Editor Organization

The editor is organized into nine panels, each named for what it configures rather than for where the option happens to live in YAML. They are listed here in the order the editor shows them:

| Panel                    | What it covers                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| **Calendars**            | Which calendars the card shows, and how each one looks                            |
| **Layout**               | How the card arranges days, and how much room it takes up                         |
| **Time Range & Content** | Which days the card covers, and what it puts in them                              |
| **Card & Title**         | The card itself, and the heading above it                                         |
| **Day Header**           | How each day announces itself, whichever layout it is announced in                |
| **Events**               | The events themselves, and the lines each one can carry                           |
| **Separators**           | Every rule the card draws — between days in any view, and in grid across them too |
| **Weather**              | A forecast beside the day, beside the event, or both                              |
| **Actions & Refresh**    | What a tap does, and how often the card re-reads its calendars                    |

Panels open one at a time, and options inside them appear only when they apply — enabling a feature reveals the settings that belong to it.

The longer panels are divided further by sub-headings, which name what the options beneath them decide. **Calendars** and **Time Range & Content** share the same spine, because they configure the same pipeline one level apart: **Event Filtering** comes first, then **Multi-Day Events**. A calendar adds **Label & Colors** above them, **Text Replacement** between the two — its options are written the same way the filters are, so the two read as a pair — and **Event Details** below; the card-level panel adds **Empty Days** at the end. Reading either panel therefore answers the same questions in the same order.

## 🧭 Options for the Selected View

Two controls sit together above search. **Card Displays** chooses the card's starting
layout and writes the existing `view` option. **Editing Settings For** selects an
editor workspace: **All Layouts**, **List**, **Column**, or **Grid**. It starts by
following Card Displays, then stays independent once you choose a workspace. The workspace
is never saved to YAML; opening the editor again starts from the card's displayed view.

**All Layouts** edits the shared base — the top level, which layouts fall back to after
their own overrides and any [different built-in defaults](#yaml-view-defaults).
It offers only the options that have a shared meaning, so the layout-specific ones are
absent there rather than being written somewhere only one view reads.

Each of the other three omits controls that cannot affect that view, including
their per-calendar forms. Compact-mode controls appear in List.
Multi-day splitting also appears in Column, but not Grid, which arranges
multi-day events itself. Grid omits empty-day text and color because it draws blank
columns rather than placeholder rows.

A panel can also change its name for the workspace you are in. Grid titles the
**Separators** panel **Rules**, because grid is the only view that draws rules _across_
the days as well as between them, so the shared name covers half of what the panel holds
there.

The workspace follows your selection, not the preview's width-dependent fallback.
Search and **Customized Only** do not bring back controls for another workspace.
To edit a list-only option used by a responsive fallback, choose List under
Editing Settings For; Card Displays stays unchanged.

Cards created or adopted by the v5 editor carry an internal configuration-format marker.
Configurations left alone keep working exactly as they are — see
[Per-View Options](/features/core-settings#per-view-options).

Presentation controls show the value used by the selected workspace and write directly
to its scope: the top level for All Layouts, then `list:`, `column:` and `time_grid:` for
the three views. A missing view value uses that layout's own default when it has one,
otherwise the shared base. Editing All Layouts therefore changes only the layouts that
inherit that option; it does not overwrite their explicit choices or built-in defaults.
Card-wide options such as calendars, title, language, and actions stay card-wide in every
workspace.

Hiding a control does not delete its stored value. For example, these empty-day options
remain available to the list fallback, even though their controls are absent while
editing Grid:

```yaml
view: grid
show_empty_days: true
empty_day_text: 'No plans'
empty_day_color: '#607d8b'
```

**→ [Options With No Effect in Grid View](/reference/configuration#options-with-no-effect-in-grid-view)** and
**[Options With No Effect in Column View](/reference/configuration#options-with-no-effect-in-column-view)** — the scoped options.

### Upgrading a Card From Before v5

Before v5, List settings lived at the top level, alongside values inherited by Column.
In v5, that same location means **All Layouts**. When an older List or Grid card contains an option
whose default differs in another layout, the editor cannot safely guess which meaning you
want. It pauses before showing the normal controls and offers two choices:

- **Keep my existing List appearance** — recommended. The existing values stay with List,
  while Column and Grid keep their own settings and defaults.
- **Use these settings for all layouts** — the existing values become the shared starting
  point. A layout's own settings and built-in defaults can still take precedence.

Either choice preserves the layout currently on screen at the moment you choose it. On a
Grid card, the choice decides what List — including a responsive List fallback — uses
later; the current Grid appearance is unchanged.

The editor asks only when at least one authored value is genuinely ambiguous. The five
options that only List can read move automatically, because they have no possible shared
meaning. A List or Grid card with no ambiguous values opens normally and adopts the v5
format on its first actual edit. Merely opening and closing the editor writes nothing.

Column cards do not show this choice. Column inherited most top-level values before v5, so
moving them would change the layout already on screen. Its first editor edit keeps those
values shared, moves only the unambiguous List-only options, and records the v5 format.

A versionless configuration already containing `list:` or `time_grid:` is treated as
layered. It opens normally and adopts the marker on its first actual edit without
reinterpreting shared values.

Once the choice or automatic adoption is saved, it is not asked again. The marker is
maintained by the editor; ordinary users do not need to add it by hand.

### Switching an Existing Card to Grid

On a v5-format card, changing **Card Displays** from List or Column to Grid keeps values
you explicitly set through All Layouts, including a value equal to the List default. For
options where Grid has a different default, the editor copies your value into `time_grid:`
rather than replacing it. Options you did not set use Grid's defaults without writing
those defaults into YAML. A fresh card switched to Grid does not need a `time_grid:` block.
This transition preserves existing per-view choices; it does not remove older overrides
that happen to match a divergent Grid default.

For example, these two authored values are kept in Grid:

```yaml
event_font_size: '18px'
event_background_opacity: 5
```

The corresponding entries after switching are:

```yaml
view: grid
event_font_size: '18px'
event_background_opacity: 5
time_grid:
  event_font_size: '18px'
  event_background_opacity: 5
```

One notice lists the options kept instead of Grid's defaults. Use the option's
**Reset** button in the Grid workspace to return to its default; switching away and
back in the same editing session does not recreate a reset value.

This preserves continuity across an explicit editor transition, not a change made only
in YAML. Opening an already-Grid v5 card is read-only: a YAML card with root
`event_background_opacity: 5` and no Grid opacity still shows Grid's default of 20.
An unversioned Grid card with ambiguous root values first shows the upgrade choice above;
either answer leaves its current Grid appearance alone. Choose the Grid workspace to
change that value directly.

::: info Saving & Reopening
An explicit shared choice is kept in YAML when another layout has a different default
for that option, even if you set it back to the card's default. The same applies when
you choose shared storage during an upgrade. Closing and reopening does not lose that
choice.

For example, explicitly setting Event Font Size to `14px` in All Layouts keeps
`event_font_size: '14px'` in the saved configuration. A later editor transition to Grid
can therefore preserve `14px` after reopening, just as it does in the original session.
Untouched defaults are not added, and a value set directly in Grid still wins.
:::

### YAML & View Defaults

The editor does not change the renderer's precedence rules. With no per-view override,
these top-level values behave as follows:

| Top-Level YAML            | List              | Column            | Grid              |
| ------------------------- | ----------------- | ----------------- | ----------------- |
| `show_empty_days: false`  | Hides empty days  | Keeps empty days  | Keeps empty days  |
| `show_past_events: false` | Hides past events | Hides past events | Keeps past events |

Set the corresponding value in `column:` or `time_grid:` to change that view, or use
its editor workspace. Grid also substitutes its own styling defaults, even when you
set a different top-level value. All thirteen are listed in
[Grid Options That Start From a Different Default](/features/grid-view#options-that-start-from-a-different-default).
Column's two substitutions are listed in
[Column Options That Start From a Different Default](/features/column-view#options-that-start-from-a-different-default).

A YAML-only edit produces no reconciliation notice. The notice belongs to an explicit
editor transition to Grid; opening an editor or choosing a workspace is not a migration.

## ✨ Key Features

- **Live Preview** — see changes immediately as you configure the card
- **Context-Aware Options** — settings appear only when they are relevant, so a panel shows what applies rather than everything that exists
- **Search** — find any option by name or by what it does, without knowing which panel holds it
- **Customized Only** — hide everything left at its default, to see what a card actually changes
- **Direct Per-View Editing** — choose a workspace and edit its effective values without adding a second control

::: info Editor Language Support
The editor is available in **11 languages**, and the calendar itself in **35**. Nine of the eleven — German, Estonian, Italian, Latvian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish — are translated in full. English is the source language and lives in the card's code rather than in a translation file, and British English carries only the strings where it differs from it.

Translation resolves **per string**: a label that has been translated appears in your language, and one that has not appears in English, in the same form. That is what makes a partial translation genuinely useful — every string you add appears immediately, without waiting for the rest.

If your language is not among the 11 the editor is entirely in English. Either way, calendar settings applied through it still display correctly in all 35 supported languages, and contributions of further editor translations are very welcome.
:::

## 🔎 Search & Customized Only

The editor holds several hundred options, so it opens with a search box above the panels.

Typing filters every panel down to what matches and drops the panels — and the groups inside them — that have nothing left, so a match is never hidden behind a collapsed heading. What survives is expanded for you. A sub-heading is never itself a match: it survives only to caption a result beneath it, so searching a word that appears in a heading and nowhere else returns nothing rather than a heading with an empty section under it.

Search matches what is on screen: the name of a setting, the sentence explaining it, and the choices a dropdown offers. Typing `width` finds **Minimum Day Width**; typing `iso` finds the week-number control, because that is where the word appears. It also matches the YAML option name, so a key copied out of the [Configuration Options reference](/reference/configuration) leads straight to its control.

**Customized Only** hides everything still set to the value the card would use anyway, leaving exactly what this card changes. It reads values the way the card does, so a number written as `"3"` in YAML counts as untouched when `3` is the default, and a value the card rejects counts as untouched too — because that is what the card is using.

Three things follow their own rule under it, for reasons worth knowing:

- **Calendars** show only the ones you have given settings of their own, which is a quick way to see which calendars have a color or a label and which simply follow the card.
- **Per-calendar options** count as customized when they are set at all. Several of them mean "follow the card" when left alone, so `Show Time: Off` on one calendar is a real setting rather than a default.
- **View values** count as customized when the selected layout stores its own value. Values inherited from the shared base or supplied by the layout's defaults are not user edits.

::: tip Not Everything Is There To Be Found
The editor only offers the settings your current configuration calls for: a fixed calendar content height appears once the height mode is fixed, and the compact-mode modifier appears once there is an event limit for it to modify. A search cannot turn up a control that is not on screen, so if nothing matches, check whether the option it depends on is switched on.
:::

## 📋 Per-Calendar Panels & Actions

The Calendars picker lists each calendar **once**, however many times the card uses it. It answers one question — which calendars this card shows — and the panels beneath it answer the other: how many blocks each calendar has, and what is set on each.

Every calendar gets a collapsible panel of its own, headed with the calendar's name as Home Assistant knows it — the same name the picker shows, rather than the entity id underneath it. A calendar that has been removed from Home Assistant keeps its id in the heading, since that is all there is left to identify it by.

The line under the heading says what the panel holds: your own label if you have set one, **Configured** if the calendar carries settings of its own, and **Using the card settings** if it does not.

Each panel opens with four actions:

| Action             | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| **Copy Settings**  | Takes this calendar's settings, without taking the calendar itself    |
| **Paste Settings** | Applies them to this calendar, keeping the calendar it is applied to  |
| **Duplicate**      | Gives this calendar a second block, carrying the first one's settings |
| **Remove**         | Drops this block                                                      |

They sit above the settings rather than below them, so they are visible the moment a panel opens. **Remove** is held apart from the other three because it is the only one that discards anything, and a card editor has no undo.

The clipboard behind **Copy Settings** outlives the dialog, so settings copied while editing one card can be pasted into another — useful when several cards list the same calendars.

**Duplicate** is how you give one calendar two sets of settings. That is what [splitting a calendar by event type](/features/core-settings#separating-all-day-from-timed-events) needs, and it cannot be done from the picker, which will not hold the same calendar twice. Both panels then carry the same heading, because they are the same calendar, and their secondary lines are numbered **Entry 1 of 2** and **Entry 2 of 2** so you can tell which is which.

The copy starts out identical to the block it came from, so until you change something on one of them the card shows every event from that calendar **twice** — two blocks, both matching everything. That is expected, and setting **Event Type** on each is usually the change that resolves it.

::: tip Two Ways to Take Something Away, and They Differ
Clearing a calendar's row in the **picker** removes that calendar from the card altogether, along with every block it had. **Remove** on a panel drops just that one block and leaves the calendar's others alone. The picker is where you decide a calendar is no longer on this card; Remove is where you decide it needs one fewer set of settings.
:::

**→ [Entity configuration options](/features/core-settings#available-options-for-entity-configuration-objects)** — everything a single calendar's panel can set.

## 🏷️ Per-Calendar Labels

Each calendar under the picker gets its own collapsible form, and the first control in it
is **Label Type**. A label is the mark shown before every event from that calendar, and it
can be four things — nothing, text or an emoji, an icon, or an image.

Most of the time the type is not stored at all. It is read back from the value, because
the value is usually enough to decide how the card draws it: `mdi:home` is an icon,
`/local/work.png` is an image, and anything else is text. That is why a calendar
configured in YAML opens with the right control already selected, without a `label_type`
option anywhere in it.

The type is only written out when the value alone would give the wrong answer — picking
**Text or Emoji** and then typing `mdi:home`, for example, or picking **An Icon** before
choosing one. In those cases `label_type` is stored alongside `label` and takes
precedence over the value, so the card draws what you chose rather than what the value
looks like.

Choosing **An Icon** gives you Home Assistant's icon picker rather than a box you have to
know `mdi:` to use, and it is the only type for which **Label Icon Color** appears — that
color does nothing unless the label is an icon, so it is no longer shown under every
calendar.

::: tip Your Choice Wins Over the Value
Type `mdi:calendar` into the text box and the card renders it as the literal text
`mdi:calendar`, not as an icon. The editor records that you asked for text, so the value
is left alone rather than being reinterpreted. Switch **Label Type** to **An Icon** to
get the icon picker.
:::

**→ [Entity configuration options](/features/core-settings#available-options-for-entity-configuration-objects)** — the `label` option itself, and the rest of the per-calendar table.

## ⚖️ View Exceptions

View-specific values no longer need an exception picker. Select List, Column, or Grid under
**Editing Settings For**, then use the ordinary controls. Their helper text says whether
the value comes from the shared card settings, from that layout's own default, or from a
value set for the layout.

For example, editing Event Font Size in Grid writes the grid value while leaving the
List value alone:

```yaml
event_font_size: '14px'
time_grid:
  event_font_size: '16px'
```

**Reset** buttons below each panel remove individual view values and restore what the
layout would use without them. They do not remove the input or clear other layouts.
Where one mode control governs several options, its reset clears those options together.

List keeps every valid explicit value in `list:`, even one equal to the shared value;
use Reset to return to inheritance. Column and most Grid values equal to what the view
inherits are omitted from their saved blocks. Options with a
[different grid default](/features/grid-view#options-that-start-from-a-different-default)
stay explicit when edited back to that default; use Reset to remove the explicit value.

**→ [Column View](/features/column-view)** — the `column:` block, and what may go in it.

## 🔄 Deprecated Options

Five options were removed in v3.0.0. They are **inert** — the card has not read them in three major versions — so a configuration still carrying one is not doing what it says:

| Removed                 | Use instead              |
| ----------------------- | ------------------------ |
| `max_events_to_show`    | `compact_events_to_show` |
| `vertical_line_color`   | `accent_color`           |
| `horizontal_line_width` | `day_separator_width`    |
| `horizontal_line_color` | `day_separator_color`    |
| `row_spacing`           | `day_spacing`            |

`max_events_to_show` is also recognized on an individual entry under `entities:`.

**Opening a card in the editor and saving removes them.** There is no button to press: because the options do nothing, deleting them changes no behavior, and leaving them in place only misleads whoever reads the YAML next. Their replacements are not filled in for you — the card has been running on defaults for those settings, so setting them now is a change you should make deliberately.

::: warning YAML Is Not Migrated Automatically
The pruning happens **only when the visual editor saves**. There is no runtime migration, so a deprecated option written directly in YAML is ignored and the card falls back to the default — it does not keep working under the old name.

The card does tell you when this happens: each deprecated option found in your configuration is reported in the browser console, naming the current option to use in its place. Open your browser's developer tools and look for messages prefixed with `📅 Calendar Card Pro`. If you manage your card in YAML, use the current names from the [Configuration Options reference](/reference/configuration).
:::
