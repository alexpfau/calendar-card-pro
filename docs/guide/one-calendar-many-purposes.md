# One Calendar, Many Purposes

Most calendar cards treat a calendar as one thing: you add it, and it contributes all of its events, styled one way. This page is about the other approach — listing the same calendar several times and letting each copy answer a different question, alongside the other calendars a household actually has. It is one worked example rather than a list of options, and every option in it links back to its own reference.

## 🏡 The Hallway Tablet

A screen in the hall, on all day, that the whole household walks past. It needs to answer four questions at a glance — _whose birthday is it, do the bins go out, who is out this evening, and is anyone busy_ — without turning into a wall of text, and without putting a parent's work life in front of the children.

Four calendars go into it, as seven blocks. The shared family calendar is listed three times, and the work calendar twice.

```yaml
type: custom:calendar-card-pro
title: Family
days_to_show: 3

entities:
  # 🎂 Birthdays — the name and the age, nothing else
  - entity: calendar.family
    allowlist: 'Birthday of'
    replace_pattern: 'Birthday of '
    label: 🎂
    accent_color: '#e91e63'

  # 🗑️ Bin day — gone once the truck has been
  - entity: calendar.family
    allowlist: 'collection'
    event_type: all_day
    allday_expires_at: '11:00'
    label: 🗑️
    accent_color: '#7cb342'

  # 👨‍👩‍👧‍👦 Everything else on the family calendar — the safety net
  - entity: calendar.family
    blocklist: 'Birthday of|collection'
    label: 👨‍👩‍👧‍👦
    accent_color: '#fb8c00'

  # Ben's own calendar, under his photo
  - entity: calendar.ben
    label: person.ben
    accent_color: '#1e88e5'

  # Anna's own calendar, under hers
  - entity: calendar.anna
    label: person.anna
    accent_color: '#8e24aa'

  # 💼 Work, the half that is fine to share
  - entity: calendar.work
    filter_field: description
    allowlist: '#family'
    days_of_week: weekdays
    label: 💼
    accent_color: '#00897b'

  # 💼 Work, everything else — that someone is busy, not what with
  - entity: calendar.work
    filter_field: description
    blocklist: '#family'
    replace_with: 'Busy'
    days_of_week: weekdays
    label: 💼
    accent_color: '#546e7a'
    show_location: false
    show_description: false
```

Two calendars are listed more than once, and for the same reason: a calendar is a source, not a category. Nothing is drawn twice, because within each calendar the blocks claim disjoint sets of events.

### A Birthday Should Read Like a Name

Calendars write birthdays badly. Google exports them as _Birthday of Lena_, and the card shows that under an _All day_ label, in a row that also has room for a location it does not have.

Three options fix it, and they cooperate:

- [`allowlist`](/features/core-settings#filtering-by-event-name) claims the birthdays for this block.
- [`replace_pattern`](/features/core-settings#dropping-a-prefix-from-every-title) deletes the prefix. With no `replace_with` beside it, the match is removed rather than substituted.
- The age arrives on its own. Put `YEAR=1994` in the event's description and the card works out the rest — see [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts).

What was _Birthday of Lena — All day_ becomes **🎂 Lena (32)**. Next year it says 33, and nobody edits anything.

The empty time and location rows are gone too, but not from anything in this block — the card handles them once, for every all-day event on the screen. That is [the next section](#one-voice-for-the-whole-card).

### A Reminder That Retires Itself

Bin day is only useful before the collection. After it, it is a line of text taking up space until midnight.

One pattern covers every stream, because `collection` catches _Recycling collection_ and _Trash collection_ alike. [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) then sets the time they stop counting as today's news, and [`event_type: all_day`](/features/core-settings#separating-all-day-from-timed-events) keeps the block to all-day entries, so a timed event that happens to mention collection cannot wander in.

### Two People, One Card

Nobody runs a household on a single calendar. Ben and Anna each keep their own, and on the hallway screen those need to be attributable at a glance — which is a job for a label, not a color.

Set [`label`](/features/core-settings#showing-a-persons-picture) to a **person entity ID** and the card draws that person's photo in front of their events. You never paste an address and you never update one: the card reads the picture from the person entity as it draws, so changing the photo in Home Assistant changes it here.

Faces do something emoji cannot. _Whose evening is booked_ is answered before the title is read, at a distance where the title is not yet legible.

Neither block filters anything. That is the point of showing them beside the split ones: a calendar that already means one thing needs no help, and the pattern on this page is for the calendars that do not.

### Busy & Nothing Else

A parent who blocks out work time on the shared screen has already made the useful part visible — everyone can see the morning is gone. The rest of it should not say _Quarterly planning with the board_, and certainly not _1:1 with Sarah — performance review_.

But a blanket _Busy_ is too blunt, because a work calendar also carries the things the household most needs: the late finish, the day of travel, the school run somebody moved a meeting for. So the work calendar is listed twice and split on its **description**.

[`filter_field`](/features/core-settings#matching-the-location-or-description-instead) points `allowlist` and `blocklist` at the location or the description instead of the title. Here it reads the description, and the two blocks split on one marker — a `#family` typed into anything the parent is happy for the household to read:

- The block that **allows** `#family` keeps the real title, in its own color.
- The block that **blocks** it replaces every title with _Busy_ through [`replace_with`](/features/core-settings#hiding-what-an-event-is-about), with no `replace_pattern` beside it. That asymmetry is deliberate: a pattern alone deletes, a pattern with a replacement substitutes, and a replacement alone overrides the field entirely.

Splitting on the description rather than the title is what makes this bearable to live with. Nobody wants to rename a work meeting to control how it appears on a screen at home, and a title prefix would follow the event into every colleague's calendar. A description marker is private to the event and invisible to everyone else.

[`days_of_week: weekdays`](/features/core-settings#showing-a-calendar-on-weekdays-only) is on both halves. A work calendar that keeps talking on Sunday is noise on a family screen.

::: tip Why the Two Halves Add Up
An event with no description at all counts as **not matching**, so an allowlist drops it and a blocklist keeps it. A work event with an empty description therefore lands in the _Busy_ block and only there — the safe default, arrived at by the rule rather than by an extra option.
:::

::: warning A Title Is Not the Only Thing That Leaks
Replacing the title does **not** make an event private on its own.

`show_location: false` is doing real work here — locations are shown by default, and _Meeting Room 2_ gives the game away on its own.

`show_description: false` is not, yet. Descriptions are hidden by default, so on this card it changes nothing. Set it anyway: it is what keeps this block safe the day you turn [`show_description`](/reference/configuration#core-settings) on card-wide.
:::

## 🏷️ One Voice for the Whole Card

Everything above is set **per calendar**. Seven blocks, seven answers, each one filtering and styling itself.

The options in this section are the opposite: they are card-level, they apply to every block at once, and that is not a limitation to work around. A badge that meant something different on each calendar would stop being a legend. The whole value of the shape is that it means the same thing everywhere on the screen.

These six lines go beside `days_to_show`, above the `entities:` list — nothing inside the blocks changes:

```yaml
allday_badge: title
allday_badge_style: filled
show_single_allday_time: false
show_location_allday: false
today_indicator: Today
today_indicator_size: 13px
```

[`allday_badge: title`](/features/event-content#the-all-day-badge) wraps the title of every all-day event in a rounded pill, and `allday_badge_style: filled` paints it in that calendar's own `accent_color`. Nothing in the blocks changes. The colors were already there.

That is the combination worth understanding, because neither half is much on its own. The per-calendar layer gave seven categories seven colors, which on a dashboard you sit in front of is a pleasant detail. The card-level layer turns those colors into a **shape** you can read from the far end of the hall: a pink capsule is a birthday, a green one is bin day, an amber one is something the family is doing all day, a blue or purple one is Ben's or Anna's day off. Timed events stay as plain text. The screen answers _is today a whole-day thing, and whose_ before anyone is close enough to read a word of it.

The two `show_*` options then remove what the pill has made redundant:

- `show_single_allday_time: false` drops the _All day_ row under the capsule, which now says the same thing twice.
- `show_location_allday: false` drops the location row on all-day events, which is usually empty and never interesting on a birthday.

Both are worth setting card-wide rather than per block, and doing so is what let the birthday block above lose its own `show_time` and `show_location` lines. Seven blocks, two options, instead of the same pair repeated in each.

::: warning Tidying Is Not Privacy
`show_location_allday: false` and the `show_location: false` on the work block look identical on screen and are not the same decision.

The card-level one is housekeeping — an all-day event rarely has a venue worth reading. The per-calendar one is a privacy control, and it has to stay on the work block whatever the card does, because work events are timed and the all-day option never touches them.

`show_description_allday` sits on the same fault line. It is the tidying half, and it does nothing here because descriptions are already off card-wide; the `show_description: false` on the work block is the half that still matters the day you turn them on.

Reach for the card-level option to tidy, and the per-calendar one to protect. Do not let the first talk you out of the second.
:::

::: tip Softer, If Filled Is Too Much
`filled` is the loudest of the five treatments, chosen here because this screen is read in passing from several meters away. On a dashboard you actually sit in front of, `allday_badge_style: tinted` — the default — says the same thing far more quietly. All five work at either position; see [Which Treatment Draws It](/features/event-content#which-treatment-draws-it).
:::

Two more worth knowing at this level. [`today_indicator`](/features/layout-appearance#today-indicator) takes any text, so a hallway screen can mark today with the word rather than a dot — raise `today_indicator_size` when you do, since it ships at `6px`, which is right for an emoji and far too small for a word. And `show_multiday_allday_time` is deliberately left **on**: a week-long holiday's row reads _All day, until Friday, Jun 26_, and that end date is the one thing the pill cannot carry. Turn it off only if you do not care when the holiday ends.

## 🧭 Why This Works

The pattern underneath is worth more than the example, and it has two layers.

**Per calendar decides which events appear and what they say.** Every option inside an `entities:` block is independent, so a calendar listed several times is several blocks that filter and style themselves, and the [visual editor's](/features/editor) **Duplicate** action builds each new one for you.

**Card-level decides how the whole thing reads.** The badge, the today indicator and the all-day row options answer once, for every block. They are the card's voice, and they are consistent on purpose.

Two rules keep the first layer predictable:

**Make the blocks complementary.** Within one calendar, each event should match exactly one block. Blocks that overlap render their events more than once — there is no automatic de-duplication between two copies of one calendar.

**Finish with a catch-all.** A block with only a `blocklist` is the safety net, and it goes last for the same reason it exists: it is what is left over. Without it, an event nobody wrote a rule for simply never appears, and it is very hard to notice something missing.

Those are one rule read from either end, which gives you something to check against. **The catch-all's `blocklist` should be exactly the union of the allowlists above it.** The family calendar allowlists `Birthday of` and `collection` and blocklists both; the work calendar allows a marker and blocks the same one. The day either stops matching, an event is drawn twice or one has quietly gone missing.

## 🔭 Where Else to Take It

The same shape solves problems that look unrelated:

- **A meeting URL where a room name should be.** Split on the location with `filter_field: location`, and either hide it or [rewrite it to something readable](/features/core-settings#replacing-a-location-that-is-a-meeting-url) with `replace_field: location`.
- **Online and in-person, told apart.** Filter on `location`, and give each half its own [`location_icon`](/features/event-content#the-location-icon) and color. [Teams meetings get their icon](/features/core-settings#giving-teams-meetings-their-own-icon) without being asked — though only on a block that still shows its location, so not on the one above that hides it.
- **Colors you do not have to choose.** [`accent_color: home-assistant`](/features/core-settings#using-the-colors-from-home-assistant) takes each calendar's color from Home Assistant instead, which is the better answer when the card lists many calendars rather than many slices of one.
- **One calendar, one color per category.** Duplicate it per keyword and give each block its own `accent_color`.

## 📚 Next Steps

- [Core Settings](/features/core-settings) — every per-calendar option, with the filtering and rewriting patterns in full
- [Event Content & Display](/features/event-content) — what each row carries, including the all-day badge and birthday ages
- [Configuration Reference](/reference/configuration) — the complete option table
- [Examples](/reference/examples) — shorter, single-purpose configurations
