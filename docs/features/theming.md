# Theming & Card-Mod

Calendar Card Pro seamlessly integrates with all Home Assistant themes and fully supports card-mod customization:

- **Automatic Theme Detection**: Uses your active Home Assistant theme variables
- **Standard Card Structure**: Follows HA conventions for consistent styling
- **CSS Customization**: Accessible structure for easy card-mod targeting

## 🌦️ Weather Custom Properties

The weather badges expose the same custom properties that the card writes from
`weather.date` and `weather.event`, so themes and card-mod can override them without
depending on inline styles:

| Custom Property                           | Default                       | Affects                                                     |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `--calendar-card-weather-date-icon-size`  | `14px`                        | Weather icon in the day header                              |
| `--calendar-card-weather-date-font-size`  | `12px`                        | Weather temperature and UV text in the day header           |
| `--calendar-card-weather-date-color`      | `var(--primary-text-color)`   | Weather text in the day header                              |
| `--calendar-card-weather-event-icon-size` | `14px`                        | Weather icon in an event row                                |
| `--calendar-card-weather-event-font-size` | `12px`                        | Weather temperature, UV, and condition text in an event row |
| `--calendar-card-weather-event-color`     | `var(--secondary-text-color)` | Weather icon and text in an event row                       |

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
weather:
  entity: weather.home
  position: both
card_mod:
  style: |
    ha-card {
      --calendar-card-weather-event-color: var(--primary-color);
      --calendar-card-weather-event-font-size: 13px;
    }
```

## 🎨 Card-Mod Examples

### Day container classes

Every recipe below selects a **day container** — the element wrapping one day's events.
Which element that is depends on the active view, so a rule written for one layout does
nothing in the other unless both are named:

| View                            | Day container | Emitted by                              |
| ------------------------------- | ------------- | --------------------------------------- |
| List                            | `.day-table`  | the table holding that day's rows       |
| [Column](/features/column-view) | `.day-column` | the grid cell holding that day's column |

Both carry the same four state classes, so the state half of a selector is portable even
though the container name is not:

| Class        | Applied when                    |
| ------------ | ------------------------------- |
| `today`      | the day is today                |
| `tomorrow`   | the day is tomorrow             |
| `future-day` | the day is not today            |
| `weekend`    | the day is a Saturday or Sunday |

In list view, `weekend` is additionally on the date cell (`.date-column.weekend`), which
is what the built-in `weekend_day_color` and `weekend_weekday_color` options style.

::: tip Write Rules For Both Layouts
Selector lists cost nothing and survive a later switch to column view:

```css
.day-table.today .event-title,
.day-column.today .event-title { ... }
```

The event-level classes are shared by both views, so only the day container needs
doubling up. They are listed under [Card & event classes](#card-event-classes).
:::

### Card & event classes

The card root, `.calendar-card-pro`, carries one class describing the layout as a whole:

| Class         | Applied when                                                   |
| ------------- | -------------------------------------------------------------- |
| `column-view` | [column view](/features/column-view) is the layout being drawn |

List view adds no view class of its own, so `.calendar-card-pro:not(.column-view)` is the
way to target it.

Inside a day, every event carries `.event`, plus `past-event` once it has finished, plus
one or both of a position pair:

| Class          | Applied when                        |
| -------------- | ----------------------------------- |
| `event-first`  | the event is the first of its day   |
| `event-middle` | the event is neither first nor last |
| `event-last`   | the event is the last of its day    |

::: warning A Lone Event Is Both First And Last
A day with a single event gets `event-first` **and** `event-last` together — it is the
first and the last. A rule written for `.event-first` alone will therefore also hit every
single-event day. Use `.event-first:not(.event-last)` when you mean "first of several".
:::

The remaining event-level classes — `.event-title`, `.time`, `.location` — are plain
element classes with no state attached.

### Custom title styling

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
title: Family Schedule
card_mod:
  style: |
    ha-card .header-container h1.card-header {
      width: 100%;
      text-align: center;
      font-weight: bold;
      border-bottom: 1px solid var(--primary-color);
      float: none !important; /* Override the default float:left */
    }
```

### Highlight today's events

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    /* Make today's events stand out */
    .day-table.today .event-title,
    .day-column.today .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }

    /* Add subtle left border pulse animation */
    .day-table.today .event,
    .day-column.today .event {
      border-left-width: 4px !important;
      transition: border-left-color 1s ease-in-out;
      animation: todayPulse 3s infinite alternate;
    }

    @keyframes todayPulse {
      from { border-left-color: var(--accent-color); }
      to { border-left-color: var(--primary-color); }
    }
```

### Highlight tomorrow's events

This works analogously to "today" as seen above, but using the "tomorrow" class. For example:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    /* Make tomorrow's events stand out */
    .day-table.tomorrow .event-title,
    .day-column.tomorrow .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }
```

### Shade weekend days

`weekend` is on the day container in both views, so one rule covers Saturday and Sunday
whichever layout is active:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    .day-table.weekend,
    .day-column.weekend {
      background: var(--secondary-background-color);
      border-radius: 8px;
    }
```

### Frameless calendar integration

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    ha-card {
      border-radius: 0;
      border: none;
      box-shadow: none;
      background: transparent !important;
    }
```

### Move time into the same row as the event title

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    div.event-content {
      display: grid;
      grid-template-areas: 
        "title time"
        "location location";
      grid-template-columns: 1fr auto;
      column-gap: 10px;
      row-gap: 0px;
    }

    div.summary {
      grid-area: title;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    div.time {
      grid-area: time;
      white-space: nowrap;
    }

    div.location {
      grid-area: location;
      white-space: normal;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    div.time-location {
      display: contents;
    }
```

These examples demonstrate how Calendar Card Pro can be customized to match any dashboard design using card-mod's powerful CSS customization capabilities.

Before reaching for card-mod, check whether a built-in option already does what you need: the card exposes its own color, font and spacing options under [Layout & Spacing](/reference/configuration#layout-spacing) in the configuration reference.
