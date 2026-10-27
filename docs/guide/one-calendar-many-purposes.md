# Family Agenda

Anna, Ben and their baby son Leo, the invented family of [the Family Hub](/guide/family-calendar), keep a tablet in the hallway that everyone walks past. It answers four questions at a glance, _whose birthday is it, does the trash go out, who is out this evening, and is anyone busy_, without spelling out on the screen what Ben's meetings are about.

## 🖼️ See It

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/story_family_agenda.png" alt="A three-day family agenda under a toolbar: tinted boxes titled in calendar colors with faces in front, a rule between the days, all-day events as filled pills, a shared plan drawn once in gold, and Ben's working hours reading Busy" width="600"><br>

Three days of the Family Hub's week, in the same colors. Each all-day event is a filled pill: Leo's daycare closure in his green, collection day in purple until it retires at 11:00, the grandparents' visit in the Family calendar's gold. Ben's working hours say _Busy_, except the offsite he marked for the family.

## 📋 Copy the Card

Replace the entity ids with your own, and each `person.*` label with a person from your Home Assistant. The lines above `entities:` speak for the whole card; the blocks below them are per calendar:

```yaml
type: custom:calendar-card-pro
config_version: 5
title: Family
days_to_show: 3
filter_duplicates: true # a plan on several calendars is drawn once, with every face
duplicate_accent_color: '#ffb74d' # and in the Family calendar's gold
event_background_opacity: 12
event_gap: 6px
event_color: accent
allday_badge: title
allday_badge_style: filled
show_single_allday_time: false
show_location_allday: false
weather:
  entity: weather.home
toolbar:
  show: true
  view_switcher: false
event_tap_action:
  action: details
list:
  date_vertical_alignment: top
  day_separator_width: 1px

entities:
  # Anna's own calendar, under her face
  - entity: calendar.anna
    label: person.anna
    accent_color: '#ff6c92'

  # Ben's own calendar, under his face
  - entity: calendar.ben
    label: person.ben
    accent_color: '#03a9f4'

  # Leo's own calendar, under his face
  - entity: calendar.leo
    label: person.leo
    accent_color: '#66bb6a'

  # Ben's work, the half that is fine to share
  - entity: calendar.work
    filter_field: description
    allowlist: '#family'
    days_of_week: weekdays
    label: person.ben
    accent_color: '#90a4ae'

  # Ben's work, everything else — that he is busy, not what with
  - entity: calendar.work
    filter_field: description
    blocklist: '#family'
    replace_with: 'Busy'
    days_of_week: weekdays
    label: person.ben
    accent_color: '#90a4ae'
    show_location: false
    show_description: false

  # 🎂 Birthdays — the name and the age, nothing else
  - entity: calendar.family
    allowlist: 'birthday'
    replace_pattern: "🎂 |'s birthday"
    label: 🎂
    accent_color: '#ffb74d'

  # 👨‍👩‍👦 Everything else on the family calendar — the safety net
  - entity: calendar.family
    blocklist: 'birthday'
    label: 👨‍👩‍👦
    accent_color: '#ffb74d'

  # 🗑️ Collection day — gone once the truck has been
  - entity: calendar.trash_pickup
    replace_pattern: '🗑️ '
    allday_expires_at: '11:00'
    label: 🗑️
    accent_color: '#b388ff'
```

## 🗂️ Calendars & Event Blocks

Where a calendar holds several kinds of event, this card lists it more than once, as blocks that each pick their own events and style. The Family Hub's [calendars](/guide/family-calendar#calendars-event-blocks) go in, with Ben's work calendar added, as eight blocks:

| Calendar                | Holds                                                       | Blocks |
| ----------------------- | ----------------------------------------------------------- | ------ |
| `calendar.anna`         | Anna's own plans                                            | 1      |
| `calendar.ben`          | Ben's own plans                                             | 1      |
| `calendar.leo`          | Leo's daycare, naps and classes                             | 1      |
| `calendar.work`         | Ben's working hours, a few of them marked `#family`         | 2      |
| `calendar.family`       | what belongs to nobody in particular, a visit or a birthday | 2      |
| `calendar.trash_pickup` | the recycling and trash collection days                     | 1      |

A calendar is a source, not a category. Nothing is drawn twice, because within each calendar the blocks claim disjoint sets of events, and the four calendars that already mean one thing are listed once, unfiltered. Filters need a reliable word or marker in an event's title, location or description, never a new calendar.

## 🧩 How the Card Works

### The Same Week, Laid Out as a List

A screen read in passing wants three days, today first, in the default list layout. Finished timed events drop off as they end, and the one under way has a green "Now ·" before its time. Late in the evening the list starts at tomorrow; add [`show_empty_today: true`](/features/event-content#showing-today-when-it-is-empty) to keep today's row.

Apart from Ben's work, the events are the Family Hub's, with the same titles. Where the two screens word something differently, the card is doing it:

- **An emoji moves into the label.** The Family Hub's grid needs _🎂 Grandma's birthday_ and _🗑️ Trash collection_ to carry their emoji in the title, because an all-day banner shows nothing else. Every list row has a label, so here the 🎂 and the 🗑️ are labels, taken out of the titles. The visit keeps its 🧳: its label says whose it is, and the 🧳 says what.
- **Ben's work is here.** The Family Hub leaves his work calendar off; this card shows when he is busy, as [Busy & Nothing Else](#busy-nothing-else) explains.

### A Birthday Should Read Like a Name

Grandma's birthday is a yearly all-day event on the Family calendar, _🎂 Grandma's birthday_, with `YEAR=1956` in its description. Once the 🎂 is the label, the title has one thing left to say:

- [`allowlist`](/features/core-settings#filtering-by-event-name) claims the birthdays for this block; on the Family calendar, only a birthday has the word in its title.
- [`replace_pattern`](/features/core-settings#dropping-a-prefix-from-every-title) deletes the cake and the _'s birthday_. With no `replace_with`, whatever matches is removed, and the `|` lets one pattern remove both.
- The age comes from the `YEAR=1956` marker, as [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts) explains.

What the Family Hub shows as _🎂 Grandma's birthday (70)_ reads here as **🎂 Grandma (70)**. Next year it says 71, and nobody edits anything. A tap opens the birthday as the calendar stores it, _🎂 Grandma's birthday_, without the age, which only the card works out.

### A Reminder That Retires Itself

Collection day is only useful before the truck comes. The trash pickup calendar holds nothing else, so its one block needs no filter, and [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) retires the row: it goes with the card's first refresh after 11:00, not on the minute. It acts only where finished events are hidden, as a list hides them by default, which is why the Family Hub's grid leaves it out ([The All-Day Band](/guide/family-calendar#the-all-day-band)). `replace_pattern: '🗑️ '` takes the emoji out of the title, now that it is the label.

### Three People, One Card

On a hallway screen, whose plan it is needs answering at a glance, which is a job for a label, not a color. [`label: person.anna`](/features/core-settings#showing-a-persons-picture) shows that person's picture from Home Assistant, the same faces as on [the Family Hub](/guide/family-calendar#a-face-for-every-calendar), and a face answers _whose evening is booked_ before anyone can read the title. Ben's face is on both work blocks too, so _Busy_ says who without saying what with.

The three personal blocks filter nothing. A calendar that already means one thing needs no help.

### Busy & Nothing Else

Ben blocks out his working hours, so everyone can see Thursday afternoon is gone. The screen should not also say it is the _Roadmap review_, and some meeting titles are a good deal more private than that. A blanket _Busy_ is too blunt, though, because a work calendar also carries what the family needs: the late finish, the day of travel, the offsite.

So the work calendar is listed twice and split on its **description**. [`filter_field`](/features/core-settings#matching-the-location-or-description-instead) points `allowlist` and `blocklist` there, and both blocks name one marker, a `#family` typed into anything Ben is happy for the family to read:

- The block that **allows** `#family` keeps the real title, so Friday's _Team offsite_ appears by name.
- The block that **blocks** it replaces every title with _Busy_ through [`replace_with`](/features/core-settings#hiding-what-an-event-is-about), which overrides the whole title when no `replace_pattern` stands beside it.

Both keep the gray and Ben's face, so only the title tells them apart. A description marker leaves the title alone, and the card never shows it, because descriptions are hidden by default. Anyone invited can still read it in their own calendar, so mark only events where that is fine. [`days_of_week: weekdays`](/features/core-settings#showing-a-calendar-on-weekdays-only) keeps a work calendar that talks on Sunday off a family screen.

::: tip Why the Two Halves Add Up
An event with no description counts as **not matching**, so an allowlist drops it and a blocklist keeps it. A work event with an empty description therefore lands in the _Busy_ block and only there: the safe default, by the rule rather than by an extra option.
:::

::: warning A Title Is Not the Only Thing That Leaks
`show_location: false` does real work on the _Busy_ block, because locations show by default and _Meeting Room 2_ gives the game away. `show_description: false` changes nothing yet, but keeps the block safe the day you turn [`show_description`](/reference/configuration#core-settings) on card-wide.

All of that hides Ben's meetings **on the screen** only. A tap opens [Home Assistant's own dialog](/features/actions#tapping-an-event), which shows the event as the calendar stores it, so a tap on _Busy_ shows the real title, location and description. `event_tap_action` is card-wide, so no block can opt out. Where nobody should read Ben's meetings from the hall tablet, [remove it](#keeping-bens-meetings-private), or keep the work calendar off this card.
:::

### Why This Works

There are two layers. **Per calendar decides which events appear and what they say:** every option in an `entities:` block is independent, so a calendar listed several times is several blocks, and the [visual editor's](/features/editor) **Duplicate** action builds each one. **Card-level decides how the whole thing reads**, as [One Voice for the Whole Card](#one-voice-for-the-whole-card) shows. Two rules keep the first layer predictable:

**Make the blocks complementary.** Within one calendar, each event should match exactly one block. With [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events), blocks that overlap draw an event once, styled by the first of them, so the overlap stops showing and the later block's label and color quietly never apply.

**Finish with a catch-all.** A block with only a `blocklist` goes last for its calendar and catches what is left over. Without it, an event nobody wrote a rule for never appears, and something missing is very hard to notice.

They are one rule read from either end: **the catch-all's `blocklist` should be exactly the union of the allowlists above it.** The Family calendar allows and blocks `birthday`; the work calendar allows and blocks `#family`. The day they stop matching, an event is drawn twice, in the wrong block's colors, or not at all.

## 🏷️ How the Display Reads

### One Voice for the Whole Card

The lines above `entities:` apply to every block at once, and that is the point: a shape that meant something different on each calendar would stop being a legend.

**The toolbar.** [`toolbar: show: true`](/features/layout-appearance#header-toolbar) puts the calendar filter, add and refresh in a row of their own, and under them the month, with arrows that page three days at a time. The filter lists six calendars, not eight blocks, so hiding Ben's work hides both halves. `view_switcher: false` drops the layout switch, because this card is a list on purpose.

**Gaps, rules and tint.** [`event_gap: 6px`](/features/layout-appearance#gaps-between-events) gives every event a box and an accent bar of its own. Events standing apart blur the days together, so `day_separator_width: 1px` draws a rule between them, and `date_vertical_alignment: top` puts each date beside its day's first event. [`event_background_opacity: 12`](/features/layout-appearance#visual-styling-colors) tints each box in its calendar's color, [`event_color: accent`](/features/event-content#event-text-in-calendar-colors) draws each title in a readable shade of it, and `weather` puts the forecast under each date.

**The pills.** [`allday_badge: title`](/features/event-content#the-all-day-badge) wraps every all-day title in a pill, and `allday_badge_style: filled` makes it solid. Its color, [`allday_badge_color`](/features/event-content#which-color-it-is-drawn-in), defaults to `accent`, so each pill takes its calendar's color, and the colors become a **shape** you can read from the far end of the hall: a gold capsule belongs to the whole family; purple is collection day; pink, blue or green is Anna's, Ben's or Leo's own day. A quieter dashboard can use the default `subtle` style, but the color has to stay `accent`, because the legend is the color.

`show_single_allday_time: false` drops the _All day_ row under a one-day pill, and `show_location_allday: false` the location under every pill, once for every block. `show_multiday_allday_time` stays on, because _All day, until Sunday, Oct 18_ carries the end of the grandparents' visit, which the pill cannot.

::: warning Tidying Is Not Privacy
`show_location_allday: false` and the _Busy_ block's `show_location: false` look identical on screen and are not the same decision. The card-level one is housekeeping. The per-calendar one is a privacy control, and it has to stay, because work events are timed and the all-day option never touches them. `show_description_allday` sits on the same fault line.

Neither reaches the details dialog, which the card-wide `event_tap_action` opens for every event, _Busy_ included, and which shows the event as stored. Tidy the screen with the card-level option, protect it with the per-calendar one, and protect the event itself with [no tap action](#keeping-bens-meetings-private).
:::

## 🔀 Variations

### Colors From Home Assistant

Home Assistant holds a color for each calendar. To follow it, set `accent_color: home-assistant` at card level and delete the `accent_color` line from every block:

```yaml
accent_color: home-assistant # each calendar's color, as set in Home Assistant
entities:
  - entity: calendar.anna
    label: person.anna # and no accent_color in any block
```

Both blocks of a split calendar then share its color. A Local Calendar has none until you give it one, and takes your theme's primary color meanwhile; see [Using the Colors From Home Assistant](/features/core-settings#using-the-colors-from-home-assistant). Keep `duplicate_accent_color` matching the Family calendar, so shared plans still read as the family's.

### A Word Instead of the Tile

[`today_indicator`](/features/layout-appearance#today-indicator) takes any text, so a hallway screen can mark today with the word instead of the [date tile](/features/layout-appearance#the-date-tile). A word is drawn over the date column, so it needs a size, and a place above the weekday that only a centered date leaves. Replace the card's `list:` with:

```yaml
today_indicator: Today
today_indicator_size: 13px # ships at 6px, right for an emoji, not a word
list:
  date_vertical_alignment: middle
  day_separator_width: 1px
  today_indicator_position: '50% 8%'
```

The position is a share of the day's height, so on a day with one event the word can still touch the date.

### Keeping Ben's Meetings Private

Delete `event_tap_action` from the card, and a tap on an event does nothing, so the _Busy_ rows keep their secret everywhere. If you keep the dialog, `allow_event_edit: false` and `allow_event_delete: false` at least take [Edit and Delete](/features/actions#narrowing-what-the-dialog-offers) out of it on a screen everyone shares.

## 🔀 Combining the Techniques

### Shared Plans in the Filtered Agenda

The zoo trip on Thursday is on Ben's and Leo's calendars, date night on Friday on Anna's and Ben's, and the birthday lunch on Saturday on all three. [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events) draws each once, with every face in front of the title, and [`duplicate_accent_color`](/features/core-settings#labeling-coloring-shared-events) colors it the Family calendar's gold. The copies have to match exactly, in title, start, end and location. As on the Family Hub, a plan on more than one person's calendar is a family plan; see [Gold Means the Whole Family](/guide/family-calendar#gold-means-the-whole-family).

Every block on this page also works in grid view, apart from the all-day layer, so the [Family Hub](/guide/family-calendar) can take any of them onto its hour axis.

## 📚 Next Steps

- [Family Hub](/guide/family-calendar): the same family's week, on one card for every screen
- [Core Settings](/features/core-settings): every per-calendar option
- [Event Content & Display](/features/event-content): the all-day badge and birthday ages
- [Header Toolbar](/features/layout-appearance#header-toolbar): the filter, paging and refresh
- [Tapping an Event](/features/actions#tapping-an-event): the details dialog
- [Configuration Reference](/reference/configuration): every option
- [Example Stories](/reference/examples): every story
