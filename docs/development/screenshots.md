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

::: tip There Is A Companion Skill
`calendar-card-pro-deploy` at
`/Users/alexpfau/Documents/Tech/GitHub/calendar-card-pro/.agents/skills/` covers the rest
of the live-Home-Assistant loop — deploying a dev build, the cache-buster bump, the
browser harness, and the machine-specific setup. It is **untracked, so it does not exist
in a worktree**; the absolute path is deliberate. This page is the tracked half and covers
the card knowledge; that one covers the machine.
:::

Playwright is deliberately **not** a dependency: its postinstall downloads a browser that
no gate would ever use, and CI runs `npm ci` on every pull request. The script resolves it
from a global install, because Node's ESM resolver does not consult the global root on its
own.

Create the token in Home Assistant under Profile → Security, keep it out of the repo, and
revoke it when the run is done.

### If the browser cannot reach Home Assistant

macOS gates LAN access **per binary** (System Settings → Privacy & Security → Local
Network). The symptom is specific and misleading: `curl` reaches Home Assistant fine while
Chromium reports `ERR_ADDRESS_UNREACHABLE` and Node reports `EHOSTUNREACH`, and the
browser can still load public internet pages, so it does not look like a networking
problem at all. It can appear on a machine where captures worked the day before, because
the grant can reset.

Grant Node and Chromium the permission, or — without touching any system setting — relay
through loopback, which the check exempts, from a binary that still holds the grant:

```python
# python3 relay.py   →   point HA_URL at http://127.0.0.1:8199
import socket, threading
TARGET, LISTEN = ("<ha-ip>", 8123), ("127.0.0.1", 8199)
def pump(a, b):
    try:
        while (chunk := a.recv(65536)):
            b.sendall(chunk)
    finally:
        a.close(); b.close()
srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(LISTEN); srv.listen(64)
while True:
    c, _ = srv.accept()
    u = socket.create_connection(TARGET)
    threading.Thread(target=pump, args=(c, u), daemon=True).start()
    threading.Thread(target=pump, args=(u, c), daemon=True).start()
```

It is transparent at the TCP layer, so WebSocket upgrades pass through unchanged.
`HA_URL` exists for exactly this; the default stays `homeassistant.local`.

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

## Framing: the card is not the whole picture

Every image carries **20 output pixels** of dashboard background around the card
(`CARD_PADDING_OUTPUT_PX`). Without it the crop lands flush on the card's bounding box,
which cuts its rounded corners square and loses any sense of how it sits on a dashboard —
the card reads harsher than it does in use. 20px reproduces what the pre-v4 screenshots
carried, measured at 20–21px on `example_1_basic_native`.

The constant is in **output** pixels rather than CSS pixels on purpose. The two shot
families are captured at different scales (3.2 for list, 2 for column), so a fixed CSS
padding would render as a visibly different border in each; fixing the output width makes
every published image match. Each shot divides by its own scale.

Three things about capturing it:

- An **element screenshot cannot do this** — it clips to the element box by definition. It
  has to be a clipped *page* screenshot.
- **`fullPage: true` is not the answer** for a card taller than the viewport. It stitches,
  and the stitch leaves a grey band across the bottom of the card. Instead the viewport is
  grown until the padded card fits, then clipped normally: one paint, no stitching.
- On the narrowest shot the card all but fills the viewport, so the full padding **does not
  exist to capture**. The clip is clamped to the page and the image gets the section's own
  margin instead (16 output px rather than 20). That is expected; the clamp is explicit in
  the code so the smaller number does not read as a bug.

## The refresh spinner will ship if you let it

The card draws a `.loading-indicator` over its top-right corner while it re-reads its
calendars, and **it does not change the card's height**, so the settle-on-stable-size loop
cannot see it.

The subtlety that caught this twice: **absence has to be sustained, not merely observed
once.** The first fix polled for a zero count and returned on the first one — which passes
*before the spinner has appeared at all*, because the card mounts, its size goes stable,
and only then does the fetch start. Two screenshots shipped with a spinner through a check
that was, on its own terms, working. `waitForSpinner()` now requires six consecutive clear
polls, and runs again immediately before the shutter, since resizing the viewport makes the
card re-measure and re-fetch.

The capture is also **fail-closed**: if the spinner is present immediately after the
screenshot, the shot throws rather than writing a quietly wrong image. A spinner is
invisible in the run log and obvious in the committed file, which is the wrong way round.

To check an existing image without opening it, sample the top-right corner against the
top-left — the spinner is a bright ring on a flat background, so a large brightness spread
on the right with a flat left is the tell.

## The progress bar needs an event running *right now*

`example_today_indicator` shows a countdown on future events and a progress bar on the
one in progress. The countdown is easy — something is always upcoming. The bar is not:
it renders only while an event is actually running, so capture at the wrong hour and the
feature the screenshot exists to show is simply absent.

Check before capturing:

```
ha_eval_template("{{ states('calendar.calendar_card_pro_work') }}")   # 'on' == running
```

An all-day event reports `on` without giving a meaningful bar — it needs a **timed** one.
If nothing is running, create a short fixture spanning the current moment, capture, and
**delete it again**:

```
ha_config_set_calendar_event(entity_id="calendar.calendar_card_pro_work",
    summary="…", start="<40 min ago>", end="<2 h ahead>")
# capture example_today_indicator only
ha_config_remove_calendar_event(entity_id=…, uid=…)
```

Delete it rather than leaving it: a one-off event violates the weekly-recurring convention
that makes `rrule == null` a reliable fixture filter, and while it exists it appears in
**every other screenshot whose range covers today** — which is most of them. Capture the
one shot that needs it first, then remove it and take the rest.

Making it weekly-recurring instead would keep it reproducible but put it in every
Saturday-covering screenshot, which is worse.

## Before committing a retake

- Compare against the previous image, not just against the config. Composition drifts in
  ways a config diff cannot show.
- `npm run check:docs` and `npm run docs:build`.
- Images are referenced by `main`-branch raw URL, so they are wrong on the live site until
  the branch merges and correct the moment it does.
