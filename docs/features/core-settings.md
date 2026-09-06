# Core Settings

Core settings control which calendars the card reads, which of their events it keeps, and how many of them it shows at once. Everything else in this documentation builds on the entity configuration described here.

## 🗂️ Entity Configuration

Calendar Card Pro can display events from multiple calendar entities in Home Assistant. The `entities` array accepts either:

1. **A simple entity ID** (default styling applies)
2. **An advanced object configuration** (custom styling per entity)

```yaml
entities:
  - calendar.family # Simple entity ID (default styling)
  - entity: calendar.work
    # Advanced object with custom styling (see options below)
    color: '#1e90ff'
    accent_color: '#ff6347'
```

### Available Options for Entity Configuration Objects

| Option                   | Type    | Default                  | Description                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entity`                 | string  | —                        | **Required.** The calendar entity ID                                                                                                                                                                                                                                                                                                                                     |
| `label`                  | string  | `-`                      | Calendar label displayed before event titles. Supports text/emoji, MDI icons (`mdi:icon-name`), or images — any address, whether a file you saved (`/local/image.jpg`) or one Home Assistant serves (`/api/image/serve/…`). Accepts a person entity ID (`person.anna`) to show that person's picture, and `home-assistant` to follow this calendar's Home Assistant icon |
| `label_type`             | string  | derived from `label`     | Forces how `label` is read: `none`, `text`, `icon` or `image`. Only needed when the value alone would be read as the wrong kind                                                                                                                                                                                                                                          |
| `color`                  | string  | `event_color`            | Custom color for event titles from this calendar                                                                                                                                                                                                                                                                                                                         |
| `accent_color`           | string  | `accent_color`           | Custom color for the vertical line and event background (when `event_background_opacity` is >0). Accepts `home-assistant` to follow this calendar's Home Assistant color                                                                                                                                                                                                 |
| `label_icon_color`       | string  | `-`                      | Custom color for label icons (only applies to `mdi:` and other icon labels)                                                                                                                                                                                                                                                                                              |
| `show_time`              | boolean | `show_time`              | Whether to show event times for this calendar (overrides global `show_time` option)                                                                                                                                                                                                                                                                                      |
| `show_location`          | boolean | `show_location`          | Whether to show event locations for this calendar (overrides global `show_location` option)                                                                                                                                                                                                                                                                              |
| `location_icon`          | string  | `mdi:map-marker-outline` | Icon shown beside this calendar's locations, e.g. `mdi:office-building`. Unset, Microsoft Teams meetings get `mdi:microsoft-teams` and every other location the map marker                                                                                                                                                                                               |
| `show_description`       | boolean | `show_description`       | Whether to show event descriptions for this calendar (overrides global `show_description` option)                                                                                                                                                                                                                                                                        |
| `compact_events_to_show` | number  | `compact_events_to_show` | Maximum number of events to show from this calendar (works with global `compact_events_to_show`)                                                                                                                                                                                                                                                                         |
| `blocklist`              | string  | `-`                      | RegExp pattern to specify events to exclude (e.g., "Private\|Conference")                                                                                                                                                                                                                                                                                                |
| `allowlist`              | string  | `-`                      | RegExp pattern to specify events to include (e.g., "Birthday\|Anniversary")                                                                                                                                                                                                                                                                                              |
| `filter_field`           | string  | `title`                  | Which field `blocklist` and `allowlist` read: `title`, `location` or `description`. One at a time — list the calendar twice to filter on a second                                                                                                                                                                                                                        |
| `replace_field`          | string  | `title`                  | Which field `replace_pattern` and `replace_with` rewrite: `title`, `location` or `description`. One at a time, and listing the calendar twice does **not** add a second                                                                                                                                                                                                  |
| `replace_pattern`        | string  | `-`                      | RegExp pattern to find in that field. Every match is replaced, whatever its case. Unset, the whole field is replaced instead                                                                                                                                                                                                                                             |
| `replace_with`           | string  | `-`                      | Text to put in place of each match, or of the whole field when `replace_pattern` is unset. Unset, the match is removed                                                                                                                                                                                                                                                   |
| `split_multiday_events`  | boolean | `split_multiday_events`  | Whether multi-day events from this calendar span each day they cover (overrides global `split_multiday_events`)                                                                                                                                                                                                                                                          |
| `event_type`             | string  | `event_type`             | Which class of this calendar's events to keep — `all`, `timed` for events with a clock time, or `all_day` for all-day ones (overrides global `event_type`)                                                                                                                                                                                                               |
| `allday_expires_at`      | string  | midnight                 | Time of day, as `HH:MM`, at which this calendar's all-day events start counting as past, read against the last day each one covers. Unset, they last until midnight. Only applies while `show_past_events` is `false`                                                                                                                                                    |
| `days_of_week`           | string  | `-`                      | Restricts this calendar to `weekdays` (Monday to Friday) or `weekends` (Saturday and Sunday), judged on the day each row lands on. Unset, every day qualifies                                                                                                                                                                                                            |

This structure gives you granular control over how information from different calendars is displayed.

These options are per calendar. For the card-wide options they override, see [Core Settings in the configuration reference](/reference/configuration#core-settings).

### Using the Colors From Home Assistant

Home Assistant holds a color for each calendar entity, which you set under **Settings →
Devices & Services → Entities**, and which the built-in calendar card and calendar panel
already use. Setting `accent_color` to `home-assistant` makes Calendar Card Pro follow it,
so a calendar keeps the same color everywhere.

Set it card-wide and every calendar follows its own color:

```yaml
type: custom:calendar-card-pro
accent_color: home-assistant
entities:
  - calendar.work
  - calendar.family
  - calendar.trash
```

Or per calendar, mixing it freely with your own colors:

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.work
    accent_color: home-assistant # follows Home Assistant
  - entity: calendar.family
    accent_color: '#43a047' # your own color wins
  - calendar.trash # follows the card
```

::: warning Requires Home Assistant 2026.2
Calendar colors were added in Home Assistant 2026.2. On an older version there is nothing to
read, and every calendar falls back exactly as described below.
:::

**Calendars Home Assistant has no color for fall back rather than losing their color.** A
per-calendar `home-assistant` falls back to the card's `accent_color`; a card-wide
`home-assistant` falls back to the built-in `#03a9f4`.

This matters more than it sounds, because **Google Calendar is currently the only
integration that fills the color in for you** — and it does so only at the moment a calendar
is **first added** to Home Assistant. Local Calendar, CalDAV and ICS feeds start with no
color at all. So if you run Google alongside Local Calendar and switch the card over, expect
your Google calendars to pick up their colors while the rest stay on the card default until
you set a color for them by hand. That is the fallback working, not a bug.

::: warning A Google Integration Older Than 2026.2 Has No Colors, and Nothing Back-Fills Them
Because the import happens once, when a calendar is first added, a Google integration that
was set up before Home Assistant 2026.2 has no colors stored — so switching the card over
shows every calendar on the fallback, which looks exactly like the feature not working.

**Removing and re-adding the integration does not fix this**, and is worth not attempting.
Home Assistant remembers a removed calendar's settings and restores them when the same
calendar comes back, so the color returns as empty as it left, and the import that would
have filled it is skipped precisely because the old settings were found. That is how the
Google Calendar integration and the entity registry work between them, and nothing Calendar
Card Pro does on its side can change it.

**Set the colors by hand instead** — see below. It is a moment per calendar, it is the only
thing that works today, and it leaves your integration, your entity IDs and anything
referring to them alone.

That work is also safe to do: the same restore that declines to import a color is what
preserves one you set yourself, so hand-set colors survive removing and re-adding the
integration later for some unrelated reason.
:::

::: tip Setting a Color By Hand
Any calendar can be given a color, whichever integration it came from, and this is the path
to prefer for the case above. Open **Settings → Devices & Services → Entities**, pick the
calendar, and use the color field in its settings.
:::

### Choosing How a Label Is Read

`label` holds one of four things — nothing, text or an emoji, an icon, or the address of an
image — and the card works out which by looking at the value. A value starting `mdi:` is an
icon. An address is an image: anything beginning with `/` or `https://`, plus a relative
filename ending in a picture extension. Anything else is text. That is right almost always,
so most configurations never need to say more:

```yaml
entities:
  - entity: calendar.family
    label: '📅' # text
  - entity: calendar.work
    label: mdi:briefcase # icon
  - entity: calendar.school
    label: /local/school.png # image
```

`label_type` is for the cases where reading the value gets it wrong. Set it to `none`,
`text`, `icon` or `image` and it wins over the value:

```yaml
entities:
  # Shows the nine characters "mdi:calendar" rather than the icon of that name
  - entity: calendar.notes
    label: 'mdi:calendar'
    label_type: text
```

::: tip Visual Editor
The **Label Type** dropdown under each calendar writes this for you, and only when it has
to. Pick a type and the right control appears below it — a text box, Home Assistant's icon
browser, or a path field — along with **Label Icon Color** where the label is an icon.
:::

You will rarely write `label_type` by hand, and existing configurations do not need it:
leave it out and the value is read exactly as it always was.

### Using a Picture Home Assistant Already Serves

An image label does not have to be a file you saved in `www/`. Home Assistant serves the
pictures it already holds over addresses beginning `/api/`, and any of them works as a
label — a camera snapshot, an integration's brand icon, a person's photo:

```yaml
entities:
  - entity: calendar.deliveries
    label: /api/camera_proxy/camera.front_door # a camera's current frame
  - entity: calendar.anna
    label: /api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512 # a picture, by address
```

Find the address in **Developer Tools → States**: pick the entity and read its
`entity_picture` attribute. These addresses need no authentication, so the card loads them
with no further setup.

::: tip For a Person, Name the Person Instead
The second line above works, but there is a shorter way that does not go stale — see
[Showing a Person's Picture](#showing-a-persons-picture) below.
:::

::: warning A Text Label Beginning With a Slash
Because the card reads a leading `/` as the start of an address, a label you mean as words
needs `label_type: text` to stay words:

```yaml
entities:
  - entity: calendar.notes
    label: /dev
    label_type: text
```

:::

### Showing a Person's Picture

Set `label` to a **person entity ID** and the card shows that person's picture. You do not
have to find the address, and you never have to update it — the card reads it from the
person entity each time it draws, so a new photo in Home Assistant appears on the card
without touching your configuration:

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.anna
    label: person.anna # Anna's photo
  - entity: calendar.ben
    label: person.ben
  - calendar.family # no label
```

This is the same idea as [following a calendar's
icon](#following-the-icon-from-home-assistant), one entity over. The difference is which
entity holds the value: an icon belongs to the calendar being labeled, so `home-assistant`
needs no further detail, while a picture belongs to a **person**, who has to be named.

**Only `person.` entity IDs are read this way.** Plenty of other entities carry a picture —
cameras, media players, integrations — and any of them still works if you paste its
address, as above. They are deliberately not resolved from an entity ID, because an entity
ID is a lowercase dotted word and so is plenty of ordinary text: reading every domain that
way would quietly turn a label like `v2.0` into a picture lookup.

**A person Home Assistant has no picture for shows no label**, rather than an empty space
where one would go. That is the same nothing an unlabeled calendar shows, so mixing the two
costs nothing in alignment. The same is true of a `person.` ID naming somebody who no
longer exists.

::: tip Setting a Person's Picture
Open **Settings → People**, pick the person, and use the picture field. A person does not
need a Home Assistant login to have one.
:::

::: tip Visual Editor
Choose **An Image** as the label type and an **Image Source** dropdown appears above the
field. Set it to **A person's picture** and the field becomes a person picker; leave it on
**Custom image** for a path you type yourself.
:::

::: warning A Text Label Shaped Like a Person
The card reads `person.anna` as "show that person's picture" rather than as ten characters
of text. On the rare occasion you want the characters themselves, say so with `label_type`:

```yaml
entities:
  - entity: calendar.notes
    label: person.anna
    label_type: text
```

:::

### Following the Icon From Home Assistant

Home Assistant holds an icon for each calendar entity as well as a color, and `label` takes
the same `home-assistant` value the [accent color](#using-the-colors-from-home-assistant)
does. The card then shows whatever icon that calendar has in Home Assistant, so changing it
in one place changes it in both instead of leaving the two to drift apart:

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.work
    label: home-assistant # follows Home Assistant's icon
  - entity: calendar.family
    label: mdi:home # your own icon wins
  - calendar.trash # no label
```

It is per calendar only. There is no card-wide counterpart, because a label belongs to one
calendar in a way a color does not — a single label in front of every event would say
nothing about which calendar the event came from.

**A calendar Home Assistant has no icon for shows no label**, rather than an empty space
where one would go. That is the same nothing an unlabeled calendar shows, so mixing the two
costs nothing in alignment.

Most integrations supply no icon, so this usually means setting one yourself — the same
place you set a color, and the same moment's work:

::: tip Setting an Icon By Hand
Open **Settings → Devices & Services → Entities**, pick the calendar, and use the icon field
in its settings. Any calendar can be given one, whichever integration it came from.
:::

::: tip Visual Editor
Choose **An Icon** as the label type and an **Icon Source** dropdown appears above the
picker. Set it to **Follow Home Assistant** and the picker goes away, because there is
nothing left to pick. **Label Icon Color** stays either way, so an inherited icon can still
be tinted to match the rest of your card.
:::

Because the icon is read at the moment the card draws, an icon changed in Home Assistant
appears without reloading the dashboard or waiting for the next calendar refresh.

::: warning `home-assistant` as a Literal Label
The card reads `home-assistant` as "follow Home Assistant" rather than as nine characters of
text. On the rare occasion you want the words themselves, say so with `label_type`:

```yaml
entities:
  - entity: calendar.notes
    label: home-assistant
    label_type: text
```

:::

## 🔍 Event Filtering

Calendar Card Pro provides powerful filtering capabilities to control exactly which events appear on your dashboard:

::: tip Visual Editor
Set up filters in the entity configuration panels. For each calendar entity, you can specify blocklist/allowlist patterns and configure duplicate filtering from the "Calendar Entities" section.
:::

### Filtering by Event Name

```yaml
entities:
  - entity: calendar.work
    blocklist: 'Private|Conference' # Hide events with these words
  - entity: calendar.personal
    allowlist: 'Birthday|Anniversary' # Only show events with these words
```

These filters use regular expressions, allowing for flexible pattern matching:

- **Blocklist**: Hide events that match specified patterns
- **Allowlist**: Only show events that match specified patterns
- **Priority**: When both are specified, allowlist takes precedence

### Matching the Location or Description Instead

By default both lists read the event **title**. `filter_field` points them somewhere else:
it takes `title`, `location` or `description`, and applies to that calendar's `blocklist`
and `allowlist` alike.

```yaml
entities:
  - entity: calendar.work
    filter_field: location
    blocklist: 'zoom\.us' # hide the events whose location is a Zoom link
```

It selects a field rather than adding one, so a calendar filtering on `location` has
stopped filtering on the title. To filter on two fields, list the calendar twice — each
block filters independently.

An event that has no location at all, or no description, counts as not matching: an
allowlist drops it and a blocklist keeps it. That is the same rule the title filter has
always applied to an event with no title, and it is what makes the two-block pattern below
add up.

::: tip Patterns Are Unchanged
`filter_field` is a separate option rather than a prefix inside the pattern, because the
lists are plain regular expressions and every character in them already means something.
`allowlist: 'location:'` still matches the literal text `location:` in a title, exactly as
it did before.
:::

::: warning The Description Is Matched Before Its Formatting Is Removed
The card strips HTML out of descriptions for display, but the filter reads the description
as your calendar delivered it. With Google Calendar that usually means HTML, so a pattern
matching a link may need to allow for the anchor markup wrapped around it. The same is true
of `show_description: false` — hiding descriptions does not stop them being filtered on.
:::

### Hiding Google Tasks Blended Into a Calendar

With **Show tasks in Calendar** enabled, Google surfaces scheduled Google Tasks through the
Calendar API as synthetic events **inside the same feed** as real ones. There is no separate
calendar entity for them, so they cannot be filtered out by leaving an entity off the card,
and their titles are whatever the task happened to be called — `contact admissions` — so no
title pattern can catch them reliably.

They all carry the same tell in their description, and `filter_field` reaches it:

```yaml
entities:
  - entity: calendar.work
    filter_field: description
    blocklist: 'tasks\.google\.com/task/'
```

Google's boilerplate reads:

```
Changes made to the title, description or attachments will not be saved.
To make edits, please go to: https://tasks.google.com/task/<id>
```

**Match the URL, not the sentence above it.** Google translates that sentence for every
account language, exactly as Microsoft translates its meeting text; it does not translate
the URL. The URL is also unaffected by whether the description arrives as HTML or as plain
text, where a pattern spanning translated words might not be.

The same approach works for any source that injects boilerplate-bearing events into a feed:
find a phrase every one of them carries and no real event does, and block on it.

### Giving Teams Meetings Their Own Icon

Pairing `filter_field: location` with [`location_icon`](/features/event-content#the-location-icon)
splits one calendar into online and in-person halves, each with its own icon and color:

```yaml
entities:
  - entity: calendar.work
    allowlist: 'Microsoft Teams'
    filter_field: location
    accent_color: '#6264a7'
  - entity: calendar.work
    blocklist: 'Microsoft Teams'
    filter_field: location
    location_icon: mdi:office-building
```

Because the same pattern is allowed in one block and blocked in the other, every event
lands in exactly one of them — nothing is lost and nothing appears twice. The visual
editor's **Duplicate** action on a calendar's panel builds the second block for you.

Teams meetings need no allowlist to get their icon; that happens on its own. This pattern
is for when you want the two halves styled differently, or want a specific icon on the
half that is _not_ a Teams call.

### Hiding a Location That Is Really a Meeting URL

Online meetings tend to put a long join URL where a room name should be, and one of those
across a card is enough to unbalance every row around it. You usually still want the
event — just not that line of text under it.

`show_location` is a per-calendar option, so the partition above solves this too. Split
the calendar on the pattern and turn the location off on the half that carries the URL:

```yaml
entities:
  - entity: calendar.work
    filter_field: location
    allowlist: 'zoom\.us|teams\.microsoft\.com|meet\.google\.com'
    show_location: false
  - entity: calendar.work
    filter_field: location
    blocklist: 'zoom\.us|teams\.microsoft\.com|meet\.google\.com'
```

The online meetings keep their title, their time and their icon and lose only the URL.
Every other event on the same calendar still shows its room, because the second block
never had the option set.

Swap `show_location` for `show_description` to do the same to a description, or set both
if the URL appears twice. And if you would rather those events were gone altogether,
delete the first block — a lone `blocklist` filters them out instead of quieting them.

### Separating All-Day From Timed Events

The `event_type` option decides which class of event a calendar contributes. It takes three
values: `all` shows everything and is the default, `timed` keeps just the events that have
a clock time, and `all_day` keeps just the all-day ones.

```yaml
type: custom:calendar-card-pro
event_type: timed # Card-wide: no all-day events anywhere
entities:
  - calendar.work
  - entity: calendar.birthdays
    event_type: all # This one calendar departs from the card
```

Its more interesting use is as a way of splitting a single calendar in two. Because `timed`
and `all_day` are exact opposites, listing the same calendar twice — once each way — divides
its events between the two blocks without losing or repeating any, and each block can then
carry its own label and colors:

```yaml
type: custom:calendar-card-pro
entities:
  - entity: calendar.family
    event_type: all_day # Birthdays, holidays, trips
    accent_color: '#9e9e9e'
  - entity: calendar.family
    event_type: timed # Appointments, meetings
    accent_color: '#1e88e5'
```

This is the same technique as [Advanced Filtering Techniques](#advanced-filtering-techniques)
below, and it composes with the name filters: a block may set `event_type` and an
`allowlist` together, and an event has to satisfy both to appear.

::: tip Listing a Calendar Twice in the Visual Editor
Home Assistant's calendar picker hides a calendar you have already chosen, so the second
listing cannot be added there. Use **Duplicate** at the foot of the calendar's own panel
instead: it lists the calendar again with the same settings, ready for you to change the
one option that differs. The two panels are numbered so you can tell them apart, and
**Remove** on the panel drops one block without taking the other — see
[Per-Calendar Panels & Actions](/features/editor#per-calendar-panels-actions).
:::

::: tip It Describes the Kind of Event, Not Its Length
`event_type` says nothing about how long an event lasts. A dinner from 23:30 to 00:30 is
`timed` even though it touches two dates, and a one-day holiday is `all_day` just as a
two-week one is. For how the card handles events spanning several days, see
[Multi-Day Events](/features/multi-day-events).
:::

### Retiring All-Day Events During the Day

An all-day event has no end time, only an end date, so the card treats one as past at
**midnight after the last day it covers**. That is usually right — a birthday is a birthday
all day — but it is wrong for a feed describing something that happens at a particular
hour. A waste-collection calendar is the common case: the bin is emptied in the morning and
its entry sits on the card until midnight.

`allday_expires_at` moves that moment earlier within the final day. It takes a time of day,
and from that time onward the card treats the event as past:

```yaml
entities:
  - entity: calendar.waste_collection
    allday_expires_at: '10:00' # gone from mid-morning, once the truck has been
  - calendar.family # unaffected — birthdays stay up all day
```

It is per calendar and has no card-wide counterpart, which is the point: your bin feed and
your birthdays want opposite answers, and only the calendar itself knows which.

The time is read against the **last** day the event covers, so a holiday running Monday to
Wednesday retires on Wednesday morning rather than Monday's. Split the calendar with
`split_multiday_events: true` and each day retires on its own morning instead.

Leaving the option out keeps the default, midnight — the option changes _when_ within the
final day, never _whether_.

Write the time as `HH:MM` on a 24-hour clock. A single-digit hour works, and so do seconds
if you want them, so `9:30` and `10:00:30` are both read. A value the card cannot read as a
time falls back to midnight, which looks exactly like leaving the option out — so check the
value first if a calendar is not retiring when you expect it to.

::: warning It Only Applies While Past Events Are Hidden
`allday_expires_at` decides _when_ an all-day event becomes past. Whether past events are
drawn at all is [`show_past_events`](/reference/configuration#core-settings), which
defaults to `false`. With `show_past_events: true` the card is being asked to show what is
over, so this option has nothing left to do and the event stays.
:::

::: tip It Takes Effect on the Next Refresh, Not on the Minute
The card has one timer, the refresh interval, and nothing schedules a redraw at the time
you name here. An event retires on the first render after its moment passes — which may be
the refresh, a dashboard reload, or any edit that redraws the card. Expect the row to go
within the refresh interval of the time you set, not exactly on it.
:::

### Showing a Calendar on Weekdays Only

`days_of_week` restricts one calendar to weekdays or to weekends. It takes `weekdays` for
Monday to Friday and `weekends` for Saturday and Sunday; leave it out and every day
qualifies, which is the default.

```yaml
entities:
  - entity: calendar.school_holidays
    days_of_week: weekdays # term dates matter on school days
    split_multiday_events: true # judge each day of the holiday on its own
  - calendar.family # keeps its weekend events
```

Like `event_type`, the two values are exact opposites, so listing one calendar twice — once
each way — divides it between two blocks that can carry their own labels and colors,
without losing an event or showing one twice.

::: warning Pair This With `split_multiday_events` on a Calendar of Long Events
The example above sets both, and on a holidays calendar it needs to. `days_of_week` judges
the day a row **lands on**, and an event spanning several days is drawn as a single row on
the first of them unless you split it. So a fortnight's holiday beginning on a Saturday is
one Saturday row, and `weekdays` hides the whole fortnight rather than showing you its
weekdays.

With `split_multiday_events: true` that same holiday becomes a row per day, each judged
separately, and you get the Monday-to-Friday view you asked for. Column view already
defaults the option to `true`, so this pairing only needs stating for list view.
:::

::: tip It Filters the Day a Row Lands On, Not the Day It Started
The same rule explains an event already running when the card's window opens: it is drawn
on the window's **first day**, whichever weekday that is, so that is the day the filter
judges — not the date the event began. A calendar of single-day entries never notices the
distinction, since the two dates are the same.
:::

::: warning A Day the Filter Empties Follows `show_empty_days`
Filtering runs before the card pads out its window, so a Saturday whose only entry this
calendar supplied becomes an empty day like any other. With
[`show_empty_days`](/reference/configuration#core-settings) off — the default in list view
— that day is left out entirely and a later one takes its place. With it on, as column
view defaults to, the day still appears carrying the usual _No upcoming events_ notice.
:::

Weekend means Saturday and Sunday. That is the same definition the
[weekend colors](/features/layout-appearance#date-column-customization) use, so a day
this option treats as a weekend is a day the card already colors as one.

### Filtering Duplicate Events

When several calendars carry the same events — shared family or team calendars, most often —
`filter_duplicates` collapses each repeated event to a single row:

```yaml
entities:
  - calendar.personal # Listed first, so its copy of a shared event is the one kept
  - calendar.family # Its duplicate copy is hidden
filter_duplicates: true
```

An event counts as a duplicate of another when its **title**, **start**, **end** and
**location** all match. The surviving copy is the one from the entry listed **first** in
`entities`, carrying that entry's own `color` and `accent_color` — so reordering `entities`
changes which calendar's styling a shared event shows. That same first-listed priority also
picks the winner when the two competing entries are blocks of one calendar, which is what
[keyword icon mapping](#mapping-icons-onto-events-by-keyword) relies on.

When the merge spans two or more **distinct** calendars, the surviving row can do more than
inherit one calendar's styling: it can name every calendar the event belongs to and take a
color that marks it as shared. The next section,
[Labeling & Coloring Shared Events](#labeling-coloring-shared-events), covers both.

::: warning Matching Ignores Which Calendar an Event Came From
Any two events that share a title, start, end and location are treated as duplicates, even if
they are genuinely separate events and even if both live in the **same** calendar. Nothing is
hidden merely for starting at the same time — all four fields must match.

If events start disappearing unexpectedly, set `filter_duplicates: false` to confirm whether
this option is the cause.
:::

### Labeling & Coloring Shared Events

When filtering collapses an event that two or more **distinct** calendars hold, the surviving
row can answer two questions about it: **who** it belongs to, and **that** it is shared. Labels
answer the first and `duplicate_accent_color` answers the second, and the two are meant to be
read together:

```yaml
filter_duplicates: true
duplicate_accent_color: '#43a047'
entities:
  - entity: calendar.anna
    label: person.anna
    accent_color: '#e91e63'
  - entity: calendar.ben
    label: person.ben
    accent_color: '#1e88e5'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_shared_event_color.png" alt="One calendar's events in pink and another's in blue, with the events both calendars share drawn in green and showing both calendars' pictures" width="600"><br>

Anna's own events stay pink and Ben's stay blue. Anything they both hold shows **both** faces
in front of the title and turns green — the faces say whose it is, the green says at a glance
that it is shared.

**The labels need nothing switched on.** A merged row draws the label of every calendar it
came from, in the order the calendars are listed, so if you already label your calendars this
is what a shared event shows. Labels that resolve to the same value are drawn **once**, so two
calendars sharing one label — the same emoji, the same `mdi:` icon — do not stamp it twice.

**The color is the one line you switch on.** `duplicate_accent_color` replaces the accent of a
merged row — the accent line, the row's background tint when
[`event_background_opacity`](/features/layout-appearance) is on, and the
[all-day badge](/features/event-content#the-all-day-badge), since all three derive from the same
accent. Any CSS color works, including a theme variable such as `var(--success-color)`. Leave it
unset and a shared row keeps the first-listed calendar's color, exactly as every release before
v4.2 did.

Both behaviors need two or more **distinct** calendars. Listing one calendar twice to
[map icons by keyword](#mapping-icons-onto-events-by-keyword) is deliberately untouched: that
row keeps the first block's single icon and its own calendar's color, which is what the pattern
needs.

::: tip Pick a Label That Reads Well Beside Another One
Any label kind works, but they do not all sit together equally well. A person's picture, an
image, an emoji or an `mdi:` icon is drawn at a fixed size, so several in a row read as a row of
faces or badges. Plain text is not combined into a phrase — two calendars labeled `Anna:` and
`Ben:` render as `Anna: Ben:`, not `Anna & Ben:`, because any rule for merging your words would
have to guess where your punctuation ends and would get it wrong for somebody.

If you label calendars with names and share events between them, prefer
[a person's picture](#showing-a-persons-picture).
:::

### Advanced Filtering Techniques

You can combine filtering features with labels and accent colors to create sophisticated displays. For example, to apply different styling to specific event types within the same calendar:

```yaml
entities:
  - entity: calendar.family
    allowlist: 'shopping|grocery' # Only show shopping-related events
    label: '🛒' # Add shopping cart label to these events
    accent_color: '#1e88e5' # Blue accent for shopping events
  - entity: calendar.family
    allowlist: 'birthday|anniversary' # Only show celebration events
    label: '🎉' # Add celebration label to these events
    accent_color: '#e91e63' # Pink accent for celebration events
  - entity: calendar.family
    blocklist: 'shopping|grocery|birthday|anniversary' # Show all other events
    accent_color: '#607d8b' # Neutral accent for all other events
    # No label for remaining events
```

This technique lets you:

- Apply different labels and colors to different event types from the same calendar
- Create category-based visual organization without needing multiple calendar sources
- Use accent colors with backgrounds (when event_background_opacity > 0) for even more distinction
- Avoid needing to create separate calendars for different event categories

In the visual editor, build this with **Duplicate** at the foot of the calendar's panel —
once for each extra block — and then give each copy its own filter, label and color. See
[Per-Calendar Panels & Actions](/features/editor#per-calendar-panels-actions).

Any event whose title matches two of these blocks is drawn once per block. If your patterns
can overlap, add `filter_duplicates: true` — see
[Mapping Icons Onto Events by Keyword](#mapping-icons-onto-events-by-keyword) below for what
it does and which copy survives.

### Mapping Icons Onto Events by Keyword

The same shape gives every event an icon chosen by what its title says, without adding
emoji to the events themselves. A `label` holding an `mdi:` value renders as an icon —
there is no `label_type` to set, because the shape is read from the value:

```yaml
filter_duplicates: true
entities:
  - entity: calendar.family
    allowlist: swim
    label: mdi:swim
  - entity: calendar.family
    allowlist: meeting
    label: mdi:briefcase
  - entity: calendar.family
    allowlist: birthday
    label: mdi:cake
  - entity: calendar.family
    blocklist: 'swim|meeting|birthday'
```

The last block is the catch-all: it blocks every keyword the blocks above it match, so
anything unmapped still appears, with no icon. Give it a `label` of its own —
`mdi:calendar-blank`, say — if you would rather unmapped events carried a fallback icon
than none.

::: warning `filter_duplicates: true` Is Doing Real Work Here
It is not decoration, and the pattern is wrong without it. **A title can match more than
one block** — "Swim meeting" matches both `swim` and `meeting` — and each matching block
contributes its own copy, so that event is drawn **twice**, once per icon. Turning
`filter_duplicates` on collapses the copies and keeps the one from the block listed
**first**, which turns the block order into the priority order of a mapping table. With the
blocks above, "Swim meeting" takes `mdi:swim`; list `meeting` before `swim` and the same
event takes `mdi:briefcase`.

The option is card-level, not per calendar, so switching it on for this also deduplicates
across your other calendars — see [Filtering Duplicate Events](#filtering-duplicate-events)
for what that means, and reorder `entities` if a shared event starts appearing under
styling you did not expect.
:::

Put the most specific keywords first, since the first match wins. Each rule can also carry
a `color` and an `accent_color`, so a mapping can be more than an icon.

## ✏️ Text Replacement

Filtering decides which events appear. Text replacement decides what they **say** once they
are there — rewriting an event's title, location or description on the card without touching
the calendar it came from.

Three per-calendar options do it. `replace_field` names which field to rewrite and defaults
to the title; `replace_pattern` is what to find, as a regular expression; `replace_with` is
what to put there.

[One Calendar, Many Purposes](/guide/one-calendar-many-purposes) puts `replace_pattern` and
`replace_with` to work in a single card, alongside the filters above.

### What Each Combination Does

`replace_pattern` and `replace_with` are independently optional, and which of them you set
is the instruction:

| `replace_pattern` | `replace_with` | Result                          |
| ----------------- | -------------- | ------------------------------- |
| set               | unset          | the match is **removed**        |
| set               | set            | the match is **replaced**       |
| unset             | set            | the **whole field** is replaced |
| unset             | unset          | nothing happens                 |

That third row is why "remove this text" has a row of its own rather than being written as
an empty `replace_with`: the visual editor cannot store an empty value, so leaving the field
blank is the only way to say it.

### Dropping a Prefix From Every Title

Birthday calendars in particular tend to prefix every entry, which costs the same width on
every row and tells you nothing:

```yaml
entities:
  - entity: calendar.birthdays
    replace_pattern: 'Birthday of '
```

`Birthday of Ben` becomes `Ben`. With no `replace_with`, whatever matched
is removed.

The pattern is a regular expression, matched **case-insensitively** and applied to **every**
occurrence — so a fragment repeated inside one generated title is removed from all of it, not
just the first:

```yaml
entities:
  - entity: calendar.work
    replace_pattern: '\[AUTO\] '
```

Capture groups work too, which is often tidier than deleting:

```yaml
entities:
  - entity: calendar.birthdays
    replace_pattern: 'Birthday of (.+)'
    replace_with: '$1 🎂'
```

### Hiding What an Event Is About

Leave `replace_pattern` out and the whole field is replaced, whatever it said. This is the
shared-calendar case: the family card shows that something is on, without showing what.

```yaml
entities:
  - entity: calendar.personal
    replace_with: 'Busy'
```

Every event from that calendar now reads `Busy`, keeping its time, its color and its place in
the day. The calendar itself is untouched — this is a display setting, so the same calendar on
your own card still shows real titles.

::: tip Ages Are Suppressed Automatically
If those events carry a [`YEAR=` marker](/features/event-content#birthday-ages-anniversary-counts),
the count is **not** appended to a replaced title. `Busy (40)` would announce that the hidden
event is a birthday, which is the opposite of what you asked for. A title your pattern merely
_edited_ keeps its count.
:::

### Replacing a Location That Is a Meeting URL

Set `replace_field` to point the pattern somewhere other than the title:

```yaml
entities:
  - entity: calendar.work
    replace_field: location
    replace_pattern: 'https://\S*zoom\.us/\S+'
    replace_with: 'Zoom call'
```

The row keeps a location — it just reads `Zoom call` instead of a sixty-character join link.
If you would rather the line vanished entirely, [hiding it](#hiding-a-location-that-is-really-a-meeting-url)
is the other way round.

An empty field is never filled in. A `replace_with` on the location rewrites the events that
have one and leaves the rest alone, rather than giving every event a location it never had.

::: warning Rewriting a Location Also Decides Its Icon
The [Teams icon](/features/event-content#the-location-icon) is chosen from the location the
card is about to draw, so a rewrite that removes the words `Microsoft Teams` — or the join
link — takes the Teams icon with it and leaves the map marker. Set `location_icon` on the
same block to name the icon you want and the detection stops mattering either way.
:::

### One Field Per Block

::: warning A Calendar Cannot Be Listed Twice to Rewrite Two Fields
This is the one place the "list the calendar twice" pattern used throughout this page does
**not** transfer.

It works for filters because `blocklist` and `allowlist` are complementary: each block takes a
different share of the events, and every event lands in exactly one of them. Two replacement
blocks are not complementary — both match the **same** events, and each contributes its own
copy, so every event on that calendar is drawn **twice**.

Turning on [`filter_duplicates`](#filtering-duplicate-events) does not rescue it. The copies
are identical as far as deduplication is concerned, because it compares events as the calendar
delivered them and a replacement only changes what is drawn. The first block's copy is the one
kept, so the second block's replacement is silently discarded along with the duplicate row.

Rewrite the field that matters most on the card. The rest of a calendar's settings — colors,
icons, filters — are unaffected either way.
:::

Rewriting also runs **after** the card's own formatting, so patterns are written against what
you actually see: a country name removed by
[`remove_location_country`](/features/event-content#time-location-information) is already gone,
HTML in a description is already flattened, and a `YEAR=` marker is already stripped.

**→ [Per-entity options in the configuration reference](/reference/configuration#per-entity-options)** — the full per-calendar list.

## 📊 Compact Mode & Event Limits

Calendar Card Pro offers powerful controls for managing what appears in compact and expanded mode:

```yaml
# Total days to fetch from API and display when expanded
days_to_show: 7

# Event limit for compact mode
compact_events_to_show: 5 # Preferred: New option name

# Day limit in compact mode
compact_days_to_show: 2 # Fewer days to display in compact mode

# Ensure complete days are shown
compact_events_complete_days: true # Never cut off a day's events mid-day
```

::: warning Compact Mode Applies to List View Only
All three options on this page cap the card as a whole, which a stack of days can express
and a row of days cannot: a limit of three events would fill the first column, spill into
the second and leave every later one blank. So `compact_events_to_show`,
`compact_days_to_show` and `compact_events_complete_days` — including the per-calendar
`compact_events_to_show` below — are read in list view and ignored in column and grid view.

They are not errors and they need not be removed: a card set to `view: column` renders as a
list whenever it is too narrow for columns, and they all apply again the moment it does. To
control how much a column view shows, use
[`min_days_to_show` and `min_days_fallback`](/features/column-view#showing-fewer-columns-instead)
instead. Grid view never falls back to list on a narrow screen; use its
[`time_grid` day-width and height options](/features/grid-view) rather than compact caps.
:::

### Entity-Level vs. Global Event Limits

In addition, you can control how many events are displayed in compact mode from each calendar independently:

```yaml
entities:
  - entity: calendar.family # Show all events from family calendar (no limit)
  - entity: calendar.work
    compact_events_to_show: 2 # Only show 2 most important work events
```

This feature provides several important behaviors:

- **Entity limits are applied first**: Each calendar is restricted to its specific maximum
- **Global limit is applied second**: Total events across all calendars are then limited
- **Chronological order is preserved**: Events remain sorted by date/time
- **Different behavior per mode**: In compact mode, both entity and global limits apply; in expanded mode, all limits are removed and all events within the configured date range are displayed

### Controlling Days in Compact Mode

The `compact_days_to_show` option lets you display fewer days in compact mode:

```yaml
days_to_show: 7 # Show 7 days when expanded
compact_days_to_show: 2 # Show only the next 2 days with events in compact mode
```

This is useful for dashboards where you want an initial view showing just the most immediate events, with the ability to expand to view the entire week.

### Preserving Complete Days

When using event limits, the `compact_events_complete_days` option ensures that partial days are never shown:

```yaml
compact_events_to_show: 5
compact_events_complete_days: true
```

When enabled, this feature ensures that if at least one event from a day is shown, all events from that day will be displayed. This prevents confusion that might arise when some events from a day are visible but others are hidden.

For example, with `compact_events_to_show: 5` and `compact_events_complete_days: true`:

- If the first 5 events are spread across 2 days, all events from those 2 days will be shown
- This might result in showing more than 5 events total, but ensures you never miss events from partially shown days

### Benefits of These Controls

These flexible controls allow you to:

- **Create concise dashboard views**: Show just what's immediately relevant
- **Prioritize important calendars**: Give more visual space to key calendars
- **Prevent overwhelming views**: Limit verbose calendars (like school schedules)
- **Provide complete context**: Ensure users can see all events for any shown day
- **Support easy expansion**: Allow users to see the full calendar with a single tap

## 🧭 Column View

Column view moved to its own page — it outgrew this one.

**→ [Column View](/features/column-view)** — the layout, per-view overrides, spacing and the responsive fallbacks.

**→ [Core Settings in the configuration reference](/reference/configuration#core-settings)** — the full option table for everything on this page.
