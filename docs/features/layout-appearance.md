# Layout & Appearance

These options control how the card looks rather than what it shows: its dimensions and scrolling behavior, its colors and fonts, the spacing between elements, and the styling of the date column, week numbers and today indicator.

## 📐 Card Dimensions & Scrolling

Calendar Card Pro offers flexible options for controlling the card's size and scroll behavior:

```yaml
# Fixed height - card always maintains exactly this height
height: '300px'

# Maximum height - card grows with content up to this height
max_height: '300px'

# Additional padding inside the card
additional_card_spacing: '10px'
```

The card offers two distinct height control mechanisms:

- **Fixed Height (`height`)**: Creates a calendar content area with exactly the specified height regardless of content amount. The full card also includes its header and card padding, so use the dashboard's layout controls when its outer height must fit a specific space.

- **Maximum Height (`max_height`)**: Allows the calendar content area to grow naturally up to the specified limit. This provides flexibility while still ensuring its event content does not become too large.

In list and column views, both options scroll when content exceeds the available space.
In grid view a fixed `height` compresses the time axis instead — see
[Height in Grid View](#height-in-grid-view). `max_height` still scrolls in every view.

Scrollbars are modern and clean, appearing only during hover or scrolling, and behave the
same on desktop and mobile.

### Height in Column View

Both options work the same way when the card renders as columns, and both may be
overridden inside a `column:` block. That matters more here than it looks: the same events
laid out side by side are far shorter than they are stacked, so a `max_height` tuned for
the list layout often never comes into play in column view — and one tuned for columns
would truncate the list badly.

```yaml
view: column
max_height: '600px'
column:
  max_height: '320px'
```

What scrolls is the **whole card**, not an individual day. The columns sit inside one
scrolling area, so the day headers move together with their events and nothing scrolls out
of alignment with its neighbors. The column layout is exactly as tall as its tallest day,
which means a quiet day leaves empty space beneath its last event rather than stretching
to match — the events stay anchored under their header.

::: tip Sizing From The Dashboard Instead
Home Assistant's own layout controls (⋮ → **Edit** → **Layout**) can constrain the card
too, and they scroll it the same way. Use them when a row height is precise enough;
reach for `max_height` when you want an exact pixel value, or a different limit per view.
:::

### Height in Grid View

A fixed `height` here compresses the time axis rather than scrolling. Hours, events, and
the now line are all positioned as a share of the band, so they squeeze into whatever
room the calendar content area has left after the day headers and the all-day band.
`hour_height` stops applying. The header and card padding sit outside that area, so use
the dashboard's layout controls when the outer card needs a particular size.

The time body retains at least half the configured content height, and a tall all-day band
scrolls in whatever the day headers leave above it. That remainder shrinks as the card
does: around `180px` the band is down to a row or two, and below about twice the header
height it is a sliver — its events are still scrollable rather than dropped, but only a
scroll gesture or the keyboard will reach them, and the time axis starts to be clipped by
the bottom of the card.

`max_height` still caps and scrolls, the same as in the other views.

Both options may be overridden inside a `time_grid:` block. A height tuned for a list of
events is the wrong size for a compressed axis, for the same reason a list height is
usually wrong for columns.

```yaml
view: grid
height: 400px
```

**→ [How Tall an Hour Is](/features/grid-view#how-tall-an-hour-is)** — `hour_height` and when a fixed height takes over.

## 🎨 Visual Styling & Colors

Customize the appearance of your calendar with various styling options:

```yaml
# Card background and title
title: 'My Calendar'
title_font_size: '20px'
title_color: 'var(--primary-color)'
background_color: 'var(--ha-card-background)'

# Event appearance
event_background_opacity: 15 # 0-100 scale for background color intensity
vertical_line_width: '3px' # Width of the colored event indicator line
```

The `event_background_opacity` option (ranging from 0-100) works together with each calendar's `accent_color` to create semi-transparent backgrounds for events. At 0 (default), events have no background color. Higher values create more intense backgrounds.

When styling your calendar, you can use:

- CSS color values (`#ff6c92`, `rgba(255,0,0,0.5)`)
- Home Assistant theme variables (`var(--primary-color)`)
- Named colors (`red`, `blue`)

`accent_color` accepts one more value: `home-assistant`, which follows the color Home
Assistant holds for each calendar instead of a color you pick here. Named colors such as
`red` are unaffected and still mean the CSS color.

**→ [Using the Colors From Home Assistant](/features/core-settings#using-the-colors-from-home-assistant)** — how to set it, and what happens for calendars that have no color.

## 📏 Spacing & Alignment

Fine-tune the spacing and alignment of your calendar elements:

```yaml
# Spacing between elements
day_spacing: '8px' # Space between different calendar days
event_spacing: '6px' # Internal padding within each event

# Date column alignment
date_vertical_alignment: 'top' # Options: 'top', 'middle', 'bottom'

# Event icon alignment
event_icon_vertical_alignment: 'middle' # Options: 'top', 'middle', 'bottom'
```

The `date_vertical_alignment` option controls how dates align with their events, which is especially noticeable when a day has many events. The default `middle` option centers the date between its events, while `top` aligns it with the first event and `bottom` with the last event.

`event_icon_vertical_alignment` does the same job one level down, for the small icons on an event's time, location and description rows. It only becomes visible when one of those wraps onto a second line: the default `top` lines the icon up with the first line of text, while `middle` centers it against the whole block and `bottom` against the last line.

::: warning Changed In v4
This option defaulted to `middle` before v4. Rows wrap often enough — a long address, a description, or a time row carrying a [countdown](/features/column-view#progress-bar-countdown) in a narrow column — that centering left the icon level with neither line of text. Add `event_icon_vertical_alignment: 'middle'` to your card to keep the old behavior.
:::

## 📅 Week Numbers & Visual Separators

For improved organization with longer calendar views, you can enable week numbers and visual separators:

```yaml
# Week number configuration
show_week_numbers: 'iso' # 'iso', 'simple', or null to disable
show_current_week_number: true # Show week number for the first week
first_day_of_week: 'monday' # 'monday', 'sunday', or 'system'

# Week number styling
week_number_font_size: '12px'
week_number_color: 'var(--primary-text-color)'
week_number_background_color: '#03a9f450'

# Separator configuration
day_separator_width: '1px' # Line between days
day_separator_color: '#03a9f430'
week_separator_width: '2px' # Line between weeks
week_separator_color: '#03a9f480'
month_separator_width: '3px' # Line between months
month_separator_color: '#03a9f4'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers" width="600"><br>

This feature creates a sophisticated visual hierarchy with:

- **Week Number Indicators**: Pill-shaped badges showing the current week number
- **Visual Separators**: Horizontal lines of varying thickness to distinguish between days, weeks, and months
- **Smart Precedence**: When multiple separators could appear at once (like when a week also changes month), the most significant one (month) takes priority

The separators follow an intelligent precedence system:

- When multiple separators could appear simultaneously (e.g., a day that's both the start of a week and a month), the most significant one (month) takes visual priority
- This creates a clean visual hierarchy: months > weeks > days

Week numbers can be displayed using either:

- **ISO Week Numbering**: Weeks start on Monday, and the first week of the year is the one containing the first Thursday (ISO 8601 standard)
- **Simple Week Numbering**: Counts weeks starting from January 1st

`first_day_of_week` decides where a week begins, which in turn drives week numbers, week separators and the `start_of_week` [start date](/features/start-date-offset). Its default, `system`, follows Home Assistant rather than the card: it uses the **First day of week** setting in your Home Assistant user profile, and when that is left at _Auto_ it falls back to the convention for your Home Assistant language — Monday for most, Sunday for languages such as English, Japanese, Hebrew and Brazilian Portuguese, Saturday for Arabic and Persian. Set `monday` or `sunday` explicitly to override Home Assistant for this card alone.

::: warning Changed In v4
Before v4, `system` always resolved to Monday and never consulted Home Assistant. If your Home Assistant profile or language implies a different week start, your week numbers and `start_of_week` anchor will shift once you upgrade. Set `first_day_of_week: 'monday'` to keep the old behavior.
:::

### Week Numbers in Column View

In column view the badge moves into the day header, on its own row directly above the
weekday, and each column answers for itself: a column that opens a week shows its number,
and the rest show nothing. That is what makes the option coherent in a grid — a seven-day
window can straddle two weeks, so a single badge spanning the card would have nowhere
sensible to sit.

The row is reserved in **every** column, not only the ones that start a week, so the
weekday, day number and events below stay aligned across the whole card. When
`show_week_numbers` is `null` — the default — no row is added at all.

`show_current_week_number` keeps its meaning: set it to `false` to hide the badge on the
first column, which is usually a partial week. All three styling options carry over
unchanged, so a badge you have already tuned looks the same in both views.

::: tip Per-View Week Numbers
Every option in this section may be set inside a `column:` block, so you can leave week
numbers off in the list layout and switch them on only when the card renders as columns.

```yaml
show_week_numbers: null
column:
  show_week_numbers: iso
```

:::

### Separators in Column View

The three separators keep their meaning in column view, but rotate: instead of horizontal
lines between stacked days, they are **vertical rules in the gaps between day columns**.
The precedence is unchanged — month beats week beats day — and every width still defaults
to `0px`, so a card that shows no lines in the list layout shows none as columns either.

Each rule runs the full height of the grid, from the top of the day headers to the bottom
of the busiest column, so a run of them reads as a set of dividers rather than as ragged
marks of differing lengths. Switching week numbers on is the one exception, covered below.

Two details differ from the list layout:

- **Spacing multipliers are not applied.** In the list a week separator carries more
  breathing room than a day separator, and a month separator more again. In a grid the gap
  between columns is a single uniform `day_spacing`, so a rule sits centered in that gap
  whatever its kind. Use width and color to signal the hierarchy.
- **Week numbers do not imply a week separator, but they do shorten the day rule.** In the
  list layout, switching week numbers on suppresses the day line at a week boundary,
  because the week-number row physically occupies that slot. Column view has no such
  collision — the badges sit in a band of their own above the columns, the rules sit
  between columns — so the day rule stays put and the run of dividers remains regular.

  What does change is how far up each rule reaches. A week number labels a whole week, so
  a day rule carried past it would appear to cut one day out of the label it belongs to.
  Day rules therefore stop level with the top of the weekday names, while week and month
  rules continue up through the badge — which is the boundary they actually mark. With
  week numbers off the badge row has no height and all three kinds are the same length
  again.

::: tip Heavier Rules Between Columns
A hairline reads well between stacked rows but can disappear against a full-height column.
Set the widths independently per view when that happens:

```yaml
day_separator_width: '1px'
column:
  day_separator_width: '2px'
```

:::

## 📆 Date Column Customization

Control the appearance of the date column for a personalized calendar view:

```yaml
# Base date column styling
weekday_font_size: '14px'
weekday_color: 'var(--primary-text-color)'
day_font_size: '26px'
day_color: 'var(--primary-text-color)'
month_font_size: '12px'
month_color: 'var(--primary-text-color)'

# Special styling for weekends (inherits from base when not specified)
weekend_weekday_color: '#e67c73' # Weekend day names
weekend_day_color: '#e67c73' # Weekend day numbers
weekend_month_color: '#e67c73' # Weekend month names

# Special styling for today (inherits from base/weekend when not specified)
today_weekday_color: '#03a9f4' # Today's weekday name
today_day_color: '#03a9f4' # Today's day number
today_month_color: '#03a9f4' # Today's month name
```

The date column appears on the left side of each day's events and helps users quickly identify when events occur. By default, all dates use the base styling, but you can apply special styling to:

- **Weekend days** using the `weekend_*` options — which days those are follows your Home Assistant language
- **Today's date** using the `today_*` options

When the special styling options are not specified, they will inherit from the base styling. If today falls on a weekend, today styling takes precedence over weekend styling.

## 🌟 Today Indicator

Calendar Card Pro provides a sophisticated way to highlight the current day with a customizable indicator:

::: tip Visual Editor
Configure today indicators in the "Date Display" section, where you can choose from dots, pulses, glows, custom icons, emojis or images, and adjust their position.
:::

```yaml
# Enable and choose indicator type
today_indicator: true # Enable basic dot indicator (default)
today_indicator: pulse # Animated pulsing dot
today_indicator: glow # Glowing dot
today_indicator: mdi:star # Any Material Design icon
today_indicator: 🎯 # Emoji
today_indicator: KW 34 # Any text — raise today_indicator_size to make words readable
today_indicator: /local/custom-indicator.png # Image path
today_indicator: https://example.com/today.png # Or any image URL

# Position the indicator precisely with CSS-like coordinates
today_indicator_position: "15% 50%" # Centered left in the date column (default)
today_indicator_position: "15% 15%" # Top left
today_indicator_position: "85% 15%" # Top right

# Restyle the indicator
today_indicator_color: "#03a9f4" # Color — applies to the dot and to MDI icons (default)
today_indicator_size: 6px # Size — applies to icons, emojis and images alike (default)
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_today_indicator.png" alt="Today Indicator" width="600"><br>

The indicator is precisely positioned and always properly centered on the coordinates specified, making it ideal for creating visual emphasis on today's date.

Available indicator types:

- `true` or `dot`: Simple dot indicator
- `pulse`: Animated pulsing dot
- `glow`: Glowing dot with subtle light effect
- `mdi:icon-name`: Any Material Design Icon
- Emoji characters: Any emoji like `🎯` or `⭐`
- Image path: Any image URL or local path
- Any other text: Drawn as the characters themselves — a week number, a quarter, a sprint name

Anything the card does not recognize as one of the first four is drawn as its own characters, so a typo shows up on the card instead of quietly falling back to a dot. Two things follow from that. Text is sized by `today_indicator_size`, which defaults to `6px` — right for an emoji, far too small for a word, so raise it when you use one. And a value shaped like an address is read as an image, so there is no way to draw `/dev` or a URL as literal text.

The `today_indicator_position` option accepts CSS-like position values in the format "x% y%", allowing precise placement of the indicator anywhere within the date column.

::: tip Column View Places It For You
`today_indicator_position` applies in list view only. A column header is as wide as the whole column with its date flush left, so a percentage that works beside a narrow date column lands on top of the day number instead — and a value far enough right ends up closer to the next day than to today. Rather than ask you to calibrate a percentage against your column width, column view puts the indicator immediately before the weekday, giving an unmistakable marker whatever the column measures. Every other indicator option — the type, `today_indicator_size` and `today_indicator_color` — works the same in both views.
:::

`today_indicator_size` scales every indicator type — it sets the icon size, the font size for emoji and text, and the image width. `today_indicator_color` colors the icon-based types (the dot, `pulse`, `glow` and any `mdi:` icon) and is also the color of the glow itself; emojis and images keep their own colors, and text takes the color it inherits.

The options on this page are grouped in the reference under [Layout & Spacing](/reference/configuration#layout-spacing), [Week Numbers & Horizontal Separators](/reference/configuration#week-numbers-horizontal-separators), [Today Indicator](/reference/configuration#today-indicator) and [Date Column](/reference/configuration#date-column).
