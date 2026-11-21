# Choose a Layout

The card draws the same events in four layouts. `view` picks the one it opens in, and the
[view switcher](/features/header-toolbar#switching-between-layouts) lets anyone at the dashboard
change it.

## 🗺️ The Four Layouts

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
view: column
```

| Layout                           | `view`   | Good for                                                                                                       |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| [List](/features/list-view)      | `list`   | The default: what is coming, day under day, on a card of any width                                             |
| [Columns](/features/column-view) | `column` | A week read across the card, one column per day                                                                |
| [Grid](/features/grid-view)      | `grid`   | A week on a time axis, where the length of an event and the gaps between show                                  |
| [Month](/features/month-view)    | `month`  | Six weeks at a glance, as on a wall calendar; on a phone, a narrow month with the chosen day's events under it |

- **Columns and Grid need room.** On a card too narrow for even their fewest days, they draw a
  list instead, and switch back once there is room.
- **Month always shows six weeks**, whatever `days_to_show` says.
- **One card can offer all four.** With the [toolbar](/features/header-toolbar) on, the view
  switcher offers every layout, and each device remembers the one picked on it until the card is
  edited.

## 🧱 Per-View Options

Calendar Card Pro renders in four layouts, and each has a block of its own: `list:`,
`column:`, `time_grid:` and `month:`. Top-level presentation options form the **shared base**.
For an option that a view can override, the card uses the view's explicit value first,
then any built-in default specific to that view, then the shared value. List has no
different built-in defaults; Column, Grid and Month do.

```yaml
# Shared starting values
event_font_size: 14px
show_location: true

column:
  event_font_size: 11px # Column view only — narrower columns, smaller type
```

A block names what you want that layout to use explicitly. The example above shows
locations in List, Column and Month, where Grid's own default hides them, and the event font
sizes are **14px in List and in Month's day list, 11px in Column, and 12px in Grid**: Grid's own typography
default takes precedence over the shared font size. Set `time_grid.event_font_size` as well if
you want to change it there.
See the [Column defaults](/features/column-view#options-that-start-from-a-different-default),
[Grid defaults](/features/grid-view#options-that-start-from-a-different-default) and
[Month defaults](/features/month-view#options-that-start-from-a-different-default) for
the complete exception lists.

Each block also holds the options only that layout has — the compact caps and date-cell
settings in `list:`, the column widths in `column:`, the time axis in `time_grid:`, and in
`month:` the card's heights, the day width it turns narrow at, weekend and today shading and
the text sizes in its days. Those have no shared meaning, so the visual editor does not offer
them under Layout Defaults.

Options that act on the card as a whole stay at the top level, and a view block ignores
them: the ones that decide which events are loaded, such as `entities` and `start_date`, and
others such as the actions, the `toolbar`, the `title` and the date colors. See
[Options That Cannot Be Overridden](/features/column-view#options-that-cannot-be-overridden)
for the full list.
`days_to_show` is the exception: it decides what is loaded, and each layout can still have
its own, except Month, which always shows six weeks — see
[Showing a Different Number of Days in Each Layout](#showing-a-different-number-of-days-in-each-layout).

In the [visual editor](/features/editor#options-for-the-selected-view), open **Layout Defaults**
under **Layouts** to edit shared values, or a layout's row to edit only its block.

::: tip Older Configurations Keep Working
List options written at the top level, as cards from before v5 have them, are still read
there, permanently; nothing needs changing by hand. On its first edit, the visual editor
moves the options only List reads into `list:`. A top-level value that could mean either
"List only" or "shared by every layout" stays List's on a List or Grid card, where the editor
keeps it for List when it opens and offers **Use Them for Every Layout** instead; see
[Adopting the Layout Format](/features/editor#adopting-the-layout-format).
:::

::: details What the Visual Editor Keeps in YAML

- A Layout Defaults value for an option whose default differs between layouts stays in the saved
  YAML even when it equals the card default. Removing it lets Column, Grid or Month go back to its
  own default.
- Picking Grid as the layout the card opens in copies such values into `time_grid:`, so the grid
  keeps showing them. That is something the editor does for you; the YAML precedence above is
  unchanged.

:::

### Showing a Different Number of Days in Each Layout

`days_to_show` can be set in each layout's block, so a family card can look two weeks ahead
as a list and show this week on the grid:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.anna
  - calendar.ben
start_date: start_of_week
days_to_show: 14 # List, and Columns, which sets none of its own
time_grid:
  days_to_show: 7 # Grid shows this week only
toolbar:
  show: true
  view_switcher: true
```

List, Columns and Grid start on the same day, because `start_date` stays shared, and Month
opens the month holding it, or today's month for Tomorrow and Start of Week. Switching layouts
never loads anything. The rest of the card follows the layout on screen:

- The [date navigation](/features/header-toolbar#paging-through-dates) pages by that
  layout's days. Switching layouts while paged keeps the first day and shows the new layout's
  count from it.
- When Columns or Grid falls back to List on a narrow card, it shows List's own count:
  `list.days_to_show` when it is set, otherwise the top-level value. So a Columns card set to
  5 days in `column:` shows List's count when it turns into a list. Leave the
  column's own count unset if both should match.
- Columns and Grid shed days on a narrow card from their own count, unless `min_days_to_show`
  says otherwise: Grid down to one, and Columns down to two where the toolbar's date navigation
  can page to the days dropped; without it, Columns keeps every day or draws a list.
- `hide_when_empty` judges the layout on screen, the list a narrow card falls back to
  included, so a week with nothing on the grid hides the card even though its list would show
  something next week. While a layout picked with the view switcher is on screen, an event in
  `view`'s own layout keeps the card too, so the switcher back stays in reach.

**→ [Column View](/features/column-view)** — what column may override, and what it ignores.
**→ [Grid View](/features/grid-view)** — the same for the time grid.
**→ [Month View](/features/month-view)** — the same for the month, which shows six weeks whatever `days_to_show` says.
**→ [List-Only Options in the configuration reference](/reference/configuration#list-only-options)** — the ten options only list reads.

**→ [Core Settings in the configuration reference](/reference/configuration#core-settings)** — `view`, `days_to_show` and the options only one layout has.
