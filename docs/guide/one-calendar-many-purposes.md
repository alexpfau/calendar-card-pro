# A Family Calendar: The Filtered Agenda

Anna, Ben and their baby son Leo, the same invented family as in [The Weekly Grid](/guide/family-calendar), want a short list agenda this time, on a tablet in the hallway: whose birthday it is, whether the trash goes out, who has plans, and whether Ben is at work, without saying what the meeting is about. The same six calendars feed it, with the same events in the same colors. Two of them each hold several kinds of event, so the card lists those two twice each as filtered blocks and leaves the rest as they are.

This walkthrough builds that filtered agenda. The same blocks work in the weekly grid too; the last section shows what carries over and what does not.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_family_agenda.png" alt="A three-day list agenda for one family, Thursday to Saturday: all-day events as filled pills in their calendar's color, each person's events with their face in front of the title, plans shared by several people drawn once in gold with every face, and work hours that say Busy beside Ben's face" width="600"><br>

Thursday morning in the same week as [The Weekly Grid](/guide/family-calendar), with the same events in the same colors. Every row is tinted in its calendar's color, and each all-day event is a pill in that color: Leo's daycare closure in his green, the trash collection in purple until it retires at 11:00, and the grandparents' visit and Grandma's birthday in the Family calendar's gold. Ben's working hours say _Busy_ beside his face, except the offsite he marked for the family. A plan on several calendars is drawn once, in gold, with every face in front of it. The screenshot uses the **[iOS Theme](https://github.com/basnijholt/lovelace-ios-themes)** (ios-dark-mode-blue-red-alternative).

::: tip Choose Your Walkthrough

- **A whole week by the hour** is [The Weekly Grid](/guide/family-calendar).
- **A short agenda with its own rules for each kind of event** is this walkthrough.
- **Both kinds of calendar?** Choose the display first, then split only the calendars whose events need different treatment.

Filters read an event's title, location or description, so they need a reliable word or marker there. They never require moving events into new calendars.
:::

## 🏡 The Household & the Display

### The Hallway Tablet

A screen in the hall, on all day, that the whole household walks past. It needs to answer four questions at a glance — _whose birthday is it, does the trash go out, who is out this evening, and is anyone busy_ — without turning into a wall of text, and without telling every visitor what Ben's meetings are about.

That makes it a short list rather than a week: three days, today first, in the default list layout, where finished timed events drop off as they end. Each row reads like a sentence, so this display is about what each event says, and the blocks below decide that.

## 🗂️ Calendars & Event Blocks

Most calendar cards treat a calendar as one thing: you add it, and it contributes all of its events, styled one way. This card takes the other approach where it has to. The six calendars of [The Weekly Grid](/guide/family-calendar#calendars-event-blocks) go into it, as eight blocks:

| Calendar                | Holds                                                       | Blocks |
| ----------------------- | ----------------------------------------------------------- | ------ |
| `calendar.anna`         | Anna's own plans                                            | 1      |
| `calendar.ben`          | Ben's own plans                                             | 1      |
| `calendar.leo`          | Leo's daycare, naps and classes                             | 1      |
| `calendar.work`         | Ben's working hours, a few of them marked `#family`         | 2      |
| `calendar.family`       | what belongs to nobody in particular, a visit or a birthday | 2      |
| `calendar.trash_pickup` | the recycling and trash collection days                     | 1      |

Two calendars are listed twice, and for the same reason: a calendar is a source, not a category. Nothing is drawn twice, because within each calendar the blocks claim disjoint sets of events. The other four already mean one thing each, so they are listed once with no filtering at all, exactly as in the grid.

## 🧾 The Whole Card

The complete card. The lines above `entities:` speak for the whole card, as [One Voice for the Whole Card](#one-voice-for-the-whole-card) explains, and the blocks below them are per calendar, in the grid's order:

```yaml
type: custom:calendar-card-pro
title: Family
view: list
days_to_show: 3
filter_duplicates: true # a plan on several calendars is drawn once, with every face
duplicate_accent_color: '#ffb74d' # and in the Family calendar's gold, as on the grid
event_background_opacity: 10
allday_badge: title
allday_badge_style: filled
show_single_allday_time: false
show_location_allday: false
today_indicator: Today
today_indicator_size: 13px
list:
  today_indicator_position: '50% 8%'

entities:
  # Anna's own calendar, under her picture
  - entity: calendar.anna
    label: /local/demo/anna.png
    accent_color: '#ff6c92'

  # Ben's own calendar, under his
  - entity: calendar.ben
    label: /local/demo/ben.png
    accent_color: '#03a9f4'

  # Leo's own calendar, under his
  - entity: calendar.leo
    label: /local/demo/leo.png
    accent_color: '#66bb6a'

  # Ben's work, the half that is fine to share
  - entity: calendar.work
    filter_field: description
    allowlist: '#family'
    days_of_week: weekdays
    label: /local/demo/ben.png
    accent_color: '#90a4ae'

  # Ben's work, everything else — that he is busy, not what with
  - entity: calendar.work
    filter_field: description
    blocklist: '#family'
    replace_with: 'Busy'
    days_of_week: weekdays
    label: /local/demo/ben.png
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

## 🧩 How the Card Works

### The Same Week, Laid Out as a List

Every event on this card is the same event as on [The Weekly Grid](/guide/family-calendar), on the same calendar and with the same title in that calendar. Where the two screens word something differently, the card is doing it, and it does it for the layout:

- **An emoji moves into the label.** The grid needs _🎂 Grandma's birthday_ and _🗑️ Trash collection_ to carry their emoji in the title, because a banner in its all-day band shows nothing else. Every row in a list has a label in front of it, so here the 🎂 and the 🗑️ are labels, and their blocks take them out of the titles rather than say them twice. The visit keeps its 🧳, because its label says whose it is and the 🧳 says what, as Leo's face and the 🏫 do on the daycare closure.
- **Ben's work shows a little more.** The grid replaces every work title with _Work_. This card says _Busy_ instead, but lets through the few events Ben marked for the family, so Friday's offsite appears by name. [Busy & Nothing Else](#busy-nothing-else) explains the split.

The colors are the same on both screens, one for each calendar, and gold still means the family.

### A Birthday Should Read Like a Name

Grandma's birthday is a yearly all-day event on the Family calendar, called _🎂 Grandma's birthday_, with `YEAR=1956` in its description. Once the 🎂 is the label, the rest of the title has only one thing left to say: whose birthday it is.

Three options make it say that, and they cooperate:

- [`allowlist`](/features/core-settings#filtering-by-event-name) claims the birthdays for this block. On the Family calendar, only a birthday has the word in its title.
- [`replace_pattern`](/features/core-settings#dropping-a-prefix-from-every-title) deletes the cake and the _'s birthday_. With no `replace_with` beside it, whatever matches is removed rather than substituted, and the `|` between the two pieces lets one pattern remove both.
- The age arrives on its own from the `YEAR=1956` marker, as it does on the grid — see [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts).

What the grid shows as _🎂 Grandma's birthday (70)_ reads here as **🎂 Grandma (70)**, with the cake as its label. Next year it says 71, and nobody edits anything. A calendar that writes its birthdays as _Birthday of Grandma_ needs only a different pattern, as [Dropping a Prefix From Every Title](/features/core-settings#dropping-a-prefix-from-every-title) shows.

The row also loses the _All day_ line and the empty location under it, but not through anything in this block — the card handles those once, for every all-day event on the screen. That is [One Voice for the Whole Card](#one-voice-for-the-whole-card), further down.

### A Reminder That Retires Itself

Collection day is only useful before the truck comes. After that, it is a line of text taking up space until midnight.

The trash pickup calendar holds nothing but collection days, so its one block needs no filter. [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) sets the time they stop counting as today's news, and from 11:00 the row is gone. The grid leaves this option out, because grid view keeps the morning on screen as part of the week, as [The All-Day Band](/guide/family-calendar#the-all-day-band) explains. `replace_pattern: '🗑️ '` takes the emoji out of the title, now that it is the label, as the birthday block does with the cake.

### Three People, One Card

Nobody runs a household on a single calendar. Anna, Ben and Leo each have their own, and on the hallway screen those need to be attributable at a glance — which is a job for a label, not a color.

Each personal calendar's `label` points at a picture, and the card draws it in front of that calendar's events. They are the same three faces as in [The Weekly Grid](/guide/family-calendar#a-face-for-every-calendar), files in Home Assistant's `www` folder. [`label: person.anna`](/features/core-settings#showing-a-persons-picture) works too, and reads the picture from the person entity as the card draws, so a new photo in Home Assistant appears here without touching the card. A photo shows as a small square, though, for the reason [Round Faces Need Round Pictures](/guide/family-calendar#a-face-for-every-calendar) gives.

Faces do something emoji cannot. _Whose evening is booked_ is answered before the title is read, at a distance where the title is not yet legible.

The work calendar carries Ben's face as well, on both of its blocks, as it does on the grid. A _Busy_ row then says who is busy without saying what with.

None of the three personal blocks filters anything. That is the point of showing them beside the split ones: a calendar that already means one thing needs no help, and the splitting on this page is for the calendars that do not.

### Busy & Nothing Else

Ben blocks out his working hours on the family screen, and that has already made the useful part visible — everyone can see Thursday afternoon is gone. The screen should not also say that the afternoon is the _Roadmap review_, and some meeting titles are a good deal more private than that.

But a blanket _Busy_ is too blunt, because a work calendar also carries the things the family most needs: the late finish, the day of travel, the offsite that takes a whole morning. So the work calendar is listed twice and split on its **description**.

[`filter_field`](/features/core-settings#matching-the-location-or-description-instead) points `allowlist` and `blocklist` at the location or the description instead of the title. Here it reads the description, and the two blocks split on one marker — a `#family` typed into anything Ben is happy for the family to read:

- The block that **allows** `#family` keeps the real title. Friday's _Team offsite_ carries the marker, so it appears by name.
- The block that **blocks** it replaces every title with _Busy_ through [`replace_with`](/features/core-settings#hiding-what-an-event-is-about), with no `replace_pattern` beside it. That asymmetry is deliberate: a pattern alone deletes, a pattern with a replacement substitutes, and a replacement alone overrides the field entirely.

Both blocks keep the work calendar's gray and Ben's face, so on the screen only the title tells them apart.

Splitting on the description rather than the title is what makes this bearable to live with. Nobody wants to rename a work meeting to control how it appears on a screen at home, and a title prefix would follow the event into every colleague's calendar. A description marker leaves the title alone, and this card never shows it, because descriptions are hidden by default. Anyone invited to the meeting can still read the description in their own calendar, though, so mark only the events where that is fine.

[`days_of_week: weekdays`](/features/core-settings#showing-a-calendar-on-weekdays-only) is on both halves. A work calendar that keeps talking on Sunday is noise on a family screen.

::: tip Why the Two Halves Add Up
An event with no description at all counts as **not matching**, so an allowlist drops it and a blocklist keeps it. A work event with an empty description therefore lands in the _Busy_ block and only there — the safe default, arrived at by the rule rather than by an extra option.
:::

::: warning A Title Is Not the Only Thing That Leaks
Replacing the title does **not** make an event private on its own.

`show_location: false` is doing real work here — locations are shown by default, and _Meeting Room 2_ gives the game away on its own.

`show_description: false` is not, yet. Descriptions are hidden by default, so on this card it changes nothing. Set it anyway: it is what keeps this block safe the day you turn [`show_description`](/reference/configuration#core-settings) on card-wide.
:::

### Why This Works

The pattern underneath is worth more than the example, and it has two layers.

**Per calendar decides which events appear and what they say.** Every option inside an `entities:` block is independent, so a calendar listed several times is several blocks that filter and style themselves, and the [visual editor's](/features/editor) **Duplicate** action builds each new one for you.

**Card-level decides how the whole thing reads.** The badge, the today indicator and the all-day row options answer once, for every block. They are the card's voice, and they are consistent on purpose.

Two rules keep the first layer predictable:

**Make the blocks complementary.** Within one calendar, each event should match exactly one block. Without `filter_duplicates`, blocks that overlap render their events more than once, which at least makes the overlap easy to spot. With [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events), as this card sets, they render once instead, styled by whichever block is listed first, so the overlap stops showing and the later block's label and color quietly never apply.

**Finish with a catch-all.** A block with only a `blocklist` is the safety net, and it goes after the other blocks of its calendar for the same reason it exists: it is what is left over. Without it, an event nobody wrote a rule for simply never appears, and it is very hard to notice something missing.

Those are one rule read from either end, which gives you something to check against. **The catch-all's `blocklist` should be exactly the union of the allowlists above it.** The family calendar allowlists `birthday` and blocklists it; the work calendar allows a marker and blocks the same one. The day either stops matching, an event is drawn twice, or drawn in the wrong block's colors with `filter_duplicates` on, or one has quietly gone missing.

## 🏷️ How the Display Reads

### One Voice for the Whole Card

Everything above is set **per calendar**. Eight blocks, eight answers, each one filtering and styling itself.

The badge and all-day lines at the top of [the card](#the-whole-card) are the opposite: they apply to every block at once, and that is not a limitation to work around. A badge that meant something different on each calendar would stop being a legend. The whole value of the shape is that it means the same thing everywhere on the screen. Nothing inside the blocks refers to them.

[`allday_badge: title`](/features/event-content#the-all-day-badge) wraps the title of every all-day event in a rounded pill, and `allday_badge_style: filled` makes that pill a solid capsule rather than an outline or a wash. The color it is filled with comes from [`allday_badge_color`](/features/event-content#which-color-it-is-drawn-in), which defaults to `accent` — so each pill takes its own calendar's `accent_color`. Nothing in the blocks changes. The colors were already there.

That is the combination worth understanding, because neither half is much on its own. The per-calendar layer gave each calendar its color, the same one it has on the grid, which on a dashboard you sit in front of is a pleasant detail. The card-level layer turns those colors into a **shape** you can read from the far end of the hall: a gold capsule belongs to the whole family, a visit or a birthday; a purple one is collection day; and a pink, blue or green one is Anna's, Ben's or Leo's own day. The label in front of it says which. Timed events stay as plain text. The screen answers _is today a whole-day thing, and whose_ before anyone is close enough to read a word of it.

[`event_background_opacity: 10`](/features/layout-appearance#visual-styling-colors) carries the same colors into the timed rows, tinting each one with its calendar's `accent_color` at 10% opacity. The pill marks a whole-day event; the tint gives every row a faint band of its own color, enough to keep Anna's haircut, Leo's music class and the _Busy_ afternoon apart at a glance down the hall without the whole screen turning loud.

The two `show_*` options then remove what the pill has made redundant:

- `show_single_allday_time: false` drops the _All day_ row under the capsule, which now says the same thing twice.
- `show_location_allday: false` drops the location row on all-day events, which is usually empty and never interesting on a birthday.

Both are worth setting card-wide rather than per block, and doing so is what let the birthday block above lose its own `show_time` and `show_location` lines. Eight blocks, two options, instead of the same pair repeated in each.

::: warning Tidying Is Not Privacy
`show_location_allday: false` and the `show_location: false` on the work block look identical on screen and are not the same decision.

The card-level one is housekeeping — an all-day event rarely has a venue worth reading. The per-calendar one is a privacy control, and it has to stay on the work block whatever the card does, because work events are timed and the all-day option never touches them.

`show_description_allday` sits on the same fault line. It is the tidying half, and it does nothing here because descriptions are already off card-wide; the `show_description: false` on the work block is the half that still matters the day you turn them on.

Reach for the card-level option to tidy, and the per-calendar one to protect. Do not let the first talk you out of the second.
:::

::: tip Softer, If Filled Is Too Much
`filled` is the loudest of the four shapes, chosen here because this screen is read in passing from several meters away. On a dashboard you actually sit in front of, `allday_badge_style: subtle` — the default — says the same thing far more quietly. All four work at either position; see [Which Shape Draws It](/features/event-content#which-shape-draws-it).

The shape is the free choice here. The **color** is not: `allday_badge_color` has to stay `accent` for any of this to work, because the legend is the color. Setting it to `text` or to a single custom color draws every pill alike, which is a tidy look on a card showing one calendar and the one thing that undoes this entire page.
:::

Two more worth knowing at this level. [`today_indicator`](/features/layout-appearance#today-indicator) takes any text, so a hallway screen can mark today with the word rather than a dot — raise `today_indicator_size` when you do, since it ships at `6px`, which is right for an emoji and far too small for a word. Move it too: its default spot, `'15% 50%'`, sits just left of the date, where a dot fits and a word runs into the day number and off the card. `today_indicator_position: '50% 8%'` under `list:` puts it above the weekday instead. The position is a share of the day's height, so on a day with only one event it can still touch the date. And `show_multiday_allday_time` is deliberately left **on**: the grandparents' visit reads _All day, until Sunday, Oct 18_, and that end date is the one thing the pill cannot carry. Turn it off only if you do not care when a visit or a holiday ends.

## 🔀 Combining the Techniques

### Shared Plans in the Filtered Agenda

The family shares plans across their own calendars: the zoo trip on Thursday is on Ben's and Leo's, date night on Friday on Anna's and Ben's, and the birthday lunch on Saturday on all three. Without help the card would draw each once per calendar. [`filter_duplicates: true`](/features/core-settings#filtering-duplicate-events) draws it once, with every face in front of the title, and [`duplicate_accent_color`](/features/core-settings#labeling-coloring-shared-events) colors it the Family calendar's gold. The copies have to match exactly, in title, start, end and location.

That is the grid's rule, kept for the grid's reason: a plan on more than one person's calendar is a family plan, so gold means the family on both screens. [Gold Means the Whole Family](/guide/family-calendar#gold-means-the-whole-family) explains it.

`filter_duplicates` also decides between blocks of one calendar, so once it is on, an overlap between two blocks stops showing as a doubled row, as [Why This Works](#why-this-works) explains. Complementary blocks are what keep that from mattering.

### These Filters in a Weekly Grid

Every block on this page works in grid view too: filters, text replacement, labels on timed events and `days_of_week` do not depend on the layout. What changes is how all-day events are drawn, and with it the card-level layer. The all-day badge and the all-day row options do nothing in grid view, a banner shows no label, and `allday_expires_at` retires nothing while grid view keeps past events on screen. [What Does Not Transfer From List View](/guide/family-calendar#what-does-not-transfer-from-list-view) has the details, and [A Mixed Calendar in the Weekly Grid](/guide/family-calendar#a-mixed-calendar-in-the-weekly-grid) splits Ben's work calendar inside a grid card.

## 📚 Next Steps

- [A Family Calendar: The Weekly Grid](/guide/family-calendar) — the other walkthrough: the same family's week on an hour axis, with each person's calendar combined and every shared plan drawn once
- [Core Settings](/features/core-settings) — every per-calendar option, including patterns this page does not use: a meeting URL rewritten to something readable, online and in-person meetings told apart, colors taken from Home Assistant
- [Event Content & Display](/features/event-content) — what each row carries, including the all-day badge and birthday ages
- [Configuration Reference](/reference/configuration) — the complete option table
- [Examples](/reference/examples) — shorter, single-purpose configurations
