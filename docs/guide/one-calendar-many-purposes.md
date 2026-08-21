# One Calendar, Many Purposes

Most calendar cards treat a calendar as one thing: you add it, and it contributes all of its events, styled one way. This page is about the other approach — listing the same calendar several times and letting each copy answer a different question. It is one worked example rather than a list of options, and every setting in it links back to its own reference.

## 🏡 The Hallway Tablet

A screen in the hall, on all day, that the whole household walks past. It needs to answer three questions at a glance — _whose birthday is it, do the bins go out, and is anyone busy_ — without turning into a wall of text, and without putting a parent's work life in front of the children.

One calendar goes into it, four times.

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
    show_time: false
    show_location: false

  # 🗑️ Bin day — gone once the truck has been
  - entity: calendar.family
    allowlist: 'collection'
    event_type: all_day
    allday_expires_at: '11:00'
    label: 🗑️
    accent_color: '#7cb342'

  # 💼 Work — that someone is busy, not what with
  - entity: calendar.family
    allowlist: 'Work:'
    replace_with: 'Busy'
    label: 💼
    accent_color: '#546e7a'
    show_location: false
    show_description: false

  # Everything else — the safety net
  - entity: calendar.family
    blocklist: 'Birthday of|collection|Work:'
```

Every block is **the same calendar**. Nothing is drawn twice, because the first three claim what they match and the fourth takes everything they did not — its `blocklist` is exactly the union of the three allowlists above it.

Three of the four carry a label, and the fourth deliberately does not. The labels mark the three questions the screen exists to answer; family life is everything else, and it does not need announcing.

### A Birthday Should Read Like a Name

Calendars write birthdays badly. Google exports them as _Birthday of Lena Weber_, and the card shows that under an _All day_ label, in a row that also has room for a location it does not have.

Four settings fix it, and they cooperate:

- [`allowlist`](/features/core-settings#filtering-by-event-name) claims the birthdays for this block.
- [`replace_pattern`](/features/core-settings#text-replacement) deletes the prefix. With no `replace_with` beside it, the match is removed rather than substituted.
- The age arrives on its own. Put `YEAR=1994` in the event's description and the card works out the rest — see [Birthday Ages & Anniversary Counts](/features/event-content#birthday-ages-anniversary-counts).
- `show_time` and `show_location` are off, because a birthday has neither worth reading.

What was _Birthday of Lena Weber — All day_ becomes **🎂 Lena Weber (32)**. Next year it says 33, and nobody edits anything.

### A Reminder That Retires Itself

Bin day is only useful before the collection. After it, it is a line of text taking up space until midnight.

One pattern covers every stream, because `collection` catches _Recycling collection_ and _Trash collection_ alike. [`allday_expires_at`](/features/core-settings#retiring-all-day-events-during-the-day) then sets the time they stop counting as today's news, and [`event_type: all_day`](/features/core-settings#separating-all-day-from-timed-events) keeps the block to all-day entries, so a timed event that happens to mention collection cannot wander in.

### Busy & Nothing Else

A parent who blocks out work time on the shared calendar has already put it where the whole household can read it. That is half the point — everyone can see the morning is gone. The other half is that it should not say _Quarterly planning with the board_, and it certainly should not say _1:1 with Sarah — performance review_.

Prefixing those entries is enough for an `allowlist` to find them, and [`replace_with`](/features/core-settings#hiding-what-an-event-is-about) **with no `replace_pattern` beside it** then replaces the whole title rather than part of it. That asymmetry is deliberate: a pattern alone deletes, a pattern with a replacement substitutes, and a replacement alone overrides the field entirely.

The row keeps its time, its color and its place in the day, so the screen still says that something is on at nine. It just stops saying what.

::: warning A Title Is Not the Only Thing That Leaks
Replacing the title does **not** make an event private on its own.

`show_location: false` is doing real work here — locations are shown by default, and _Meeting Room 2_ gives the game away on its own.

`show_description: false` is not, yet. Descriptions are hidden by default, so on this card it changes nothing. Set it anyway: it is what keeps this block safe the day you turn [`show_description`](/reference/configuration#core-settings) on card-wide.
:::

## 🧭 Why This Works

The pattern underneath is worth more than the example. **Every option here is per calendar**, so a calendar listed four times is four blocks that filter and style themselves independently, and the [visual editor's](/features/editor) **Duplicate** action builds each new one for you.

Two rules keep it predictable:

**Make the blocks complementary.** Each event should match exactly one block. The example allowlists three patterns and blocklists all three in the catch-all, so every event lands once. Blocks that overlap render their events more than once — there is no automatic de-duplication between two copies of one calendar.

**Finish with a catch-all.** A block with only a `blocklist` is the safety net, and it goes last for the same reason it exists: it is what is left over. Without it, an event nobody wrote a rule for simply never appears, and it is very hard to notice something missing.

Those are one rule read from either end, which gives you something to check against. **The catch-all's `blocklist` should be exactly the union of the allowlists above it.** The day it stops being, either an event is drawn twice or one has quietly gone missing.

## 🔭 Where Else to Take It

The same shape solves problems that look unrelated:

- **A meeting URL where a room name should be.** Split on the location, and set `show_location: false` on the half that carries a link — or rewrite it to something readable with `replace_field: location`.
- **Online and in-person, told apart.** Filter on `location`, and give each half its own [`location_icon`](/features/event-content#the-location-icon) and color. Teams meetings get their icon without being asked.
- **A work calendar that goes quiet at the weekend.** [`days_of_week: weekdays`](/features/core-settings#showing-a-calendar-on-weekdays-only) on that block alone.
- **One calendar, one color per category.** Duplicate it per keyword and give each block its own `accent_color`.

## 📚 Next Steps

- [Core Settings](/features/core-settings) — every per-calendar option, with the filtering and rewriting patterns in full
- [Event Content & Display](/features/event-content) — what each row carries, including birthday ages
- [Configuration Reference](/reference/configuration) — the complete option table
- [Examples](/reference/examples) — shorter, single-purpose configurations
