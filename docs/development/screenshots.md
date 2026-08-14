# Screenshots

Every image under `.github/img/` is captured from a persistent tab on the Home Assistant
demo dashboard by `scripts/capture-screenshots.mjs`. This page is why that exists and what
it cost to learn.

The short version: **a screenshot is a config plus a date plus a calendar, and only the
first of those is written down anywhere.** Every incident below is a variation on that.

## Running a capture

```bash
npm i -g playwright && npx playwright install chromium   # not a repo dependency
HA_TOKEN=<long-lived token> node scripts/capture-screenshots.mjs            # everything
HA_TOKEN=… node scripts/capture-screenshots.mjs --only column-week          # one shot
HA_TOKEN=… node scripts/capture-screenshots.mjs --probe column-week         # width sweep
HA_TOKEN=… node scripts/capture-screenshots.mjs --list                      # ids
```

Playwright is deliberately **not** a dependency: its postinstall downloads a browser that
no gate would ever use, and CI runs `npm ci` on every pull request. The script resolves it
from a global install, because Node's ESM resolver does not consult the global root on its
own.

Create the token in Home Assistant under Profile → Security, keep it out of the repo, and
revoke it when the run is done.

## Which tab feeds which image

| Tab | Theme | Feeds |
| --- | --- | --- |
| `CCP Release - Basic` | none (stock) | `example_1_basic_native` |
| `CCP Release - Advanced` | `ios-dark-mode-blue-red-alternative` | `example_1_basic_ios`, `example_2_*`, `example_3_*`, `example_4_*`, `example_today_indicator`, `example_weather`, `example_editor` |
| `CCP Release - Complete` | `Bubble` | `example_5_complete` |
| `CCP Release - Column` | `ios-dark-mode-blue-red-alternative` | `example_column_*` |
| `CCP Release - Header` | `ios-dark-mode-blue-red-alternative` | `header.png` |

The theme is a property of the **view**, not something to emulate in the browser. That is
why the same basic card appears twice from two different tabs — it is how the
native/iOS pair has always been made. Browser `colorScheme` only picks the light or dark
side of the *stock* theme, which matters solely for the one tab that sets none.

The three-theme spread is deliberate: stock proves the card looks right out of the box,
the iOS theme is the hero look, and Bubble — used once — proves theme compatibility.

## A capture config is not a documentation config

The card on the dashboard may carry things the published YAML does not. `start_date` is
the main one: it exists to force a particular week into frame, not to teach anything, so
it stays out of `docs/`. Per-entity `compact_events_to_show` tweaks used to hit a target
event count are the same.

Everything else **must** match. `reference/examples.md` prints the YAML beside the image,
so a reader will try to reproduce it. If the card changes, change the docs in the same
commit.

## Read the config off the image, not off the dashboard

The most expensive mistake in this file's history: assuming the cards on the dashboard were
the configs that produced the published images. They were not, and nothing said so.

- None carried a `start_date`, so each began on whatever day it was captured.
- `days_to_show` had drifted — the basic card read `7` where both the published image and
  the documented YAML said `3`.

The result reproduced the rendering faithfully and the composition not at all. When
retaking an existing screenshot, derive its config from the image itself:

| Read this | From that |
| --- | --- |
| Start weekday | the first day column or row |
| Day count | how many days are drawn |
| Calendars | which events appear, and in which colour |
| Compact budget | where the list stops |
| Options | month shown? locations shown? week numbers? separators? 12h or 24h? |

Then pin `start_date` to the next occurrence of that weekday. The demo events recur
weekly, so the same weekday reproduces the same event sequence with only the dates moved.

Two dates carry extra constraints. The **week-numbers** shot needs a Sunday whose span
crosses a month boundary, or the month separator it exists to demonstrate never renders.
The **today-indicator** shot cannot be pinned at all: its subject is *today*, so its
composition is whatever the capture day provides.

## The demo calendars drift too

Config cannot fix a missing event. Three published images contained a `Release Party` that
had been deleted from the work calendar; it is back as a weekly Friday
`🚀 v4.0.0 Release Party 🎉`. Two events that did not exist when the originals were taken
now do — the Conference Trip's weekly Thu→Fri span and Stand-Up Comedy Night — which is
why a Friday start is now crowded and the compact pair starts on a Monday instead.

Before a retake, check what is actually in the calendars:

```
ha_config_get_calendar_events(entity_id="calendar.calendar_card_pro_family", …)
```

Every legitimate demo event is **weekly recurring**, which makes `rrule == null` a reliable
filter for one-off test fixtures that would otherwise pollute a capture.

## Deprecated keys rot silently in a frozen tab

Seven of the nine list-view source cards were still configured with v3 key names —
`max_events_to_show`, `vertical_line_color`, `horizontal_line_width`,
`horizontal_line_color`, `row_spacing`. `config.ts` is explicit: *"the value is simply
ignored and the replacement key silently takes its default."*

Compact mode was therefore **off** on every card that believed it was using it, and the
compact screenshot captured fully expanded. A frozen capture view is never re-validated,
so nothing warns until someone tries to reproduce a picture from it. **Check the capture
cards against `DEPRECATED_CONFIG_MAP` whenever the card drops a key.**

## Widths are measured, not reasoned about

Home Assistant's sections grid changes its own column count at its own breakpoints, so
viewport width → card width is **not monotonic**: an 800px viewport can yield a *wider*
card than a 900px one. Never pick a width by arithmetic.

`--probe` renders a shot across a width sweep and reports what the card actually did:

```
viewport  1600px  card  1280px  7 columns
viewport  1400px  card  1080px  6 columns
viewport   900px  card   500px  LIST (fallback)
viewport   800px  card   736px  4 columns     ← not monotonic
```

Width-sensitive shots carry an `expect` (a column count, or `list`) asserted against the
rendered DOM after capture, so a config change that moves a breakpoint is reported rather
than quietly producing the wrong picture. `.column-view` marks the column layout and
`.day-column` counts the columns.

For the record, the card's own arithmetic is
`min_day_width × d + 32 + (d − 1) × day_spacing`, with a ±16px hysteresis half-band on
top. Every column count therefore has **two** thresholds — a raw one and an "enter" one
16px above it. Quote the enter threshold in documentation: it is the width that holds from
any starting state.

## Resolution

The list views are `max_columns: 1` sections and Home Assistant caps a section column at
**500 CSS px**, so those cards cannot be widened without changing the dashboard. They are
captured at `deviceScaleFactor: 3.2`, which lands on the 1600px width every published list
screenshot already uses. Column-view cards are not capped and stay at `2`.

## The editor is not a card

`example_editor.png` needs the card-configuration dialog, so it has its own path:

1. Load the view with `?edit=1`.
2. Click **`hui-card-edit-mode`**, not the card. The wrapper intercepts pointer events, so
   clicking the card itself times out. It wraps *every* card including headings, so its
   index is not the calendar-card index.
3. Crop from the dialog's own furniture — its title and footer buttons — plus the measured
   inset.

Step 3 is not the obvious approach and is the one that works. Home Assistant renders the
dialog into the top layer with no stable class or role: `.mdc-dialog__surface`,
`.mdc-dialog__container`, `[role="dialog"]` and a geometry sweep of every shadow root all
come back empty, and `ha-dialog` itself reports a zero-height box. Element screenshots also
hang on `waiting for fonts to load`. Anchoring on visible furniture survives Home Assistant
renaming its internals, which it does between releases.

Nothing is saved — the browser context is discarded without touching **Save**.

## Before committing a retake

- Compare against the previous image, not just against the config. Composition drifts in
  ways a config diff cannot show.
- `npm run check:docs` and `npm run docs:build`.
- Images are referenced by `main`-branch raw URL, so they are wrong on the live site until
  the branch merges and correct the moment it does.
