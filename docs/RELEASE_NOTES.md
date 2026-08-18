---
title: Release Notes
---

# Calendar Card Pro v4.0.0

**This is a big one.** 🎉

Two days after this card's first public release, someone opened [#14](https://github.com/alexpfau/calendar-card-pro/issues/14) and asked whether the days could sit side by side instead of stacked on top of each other. That was March 2025. It was asked again in June, again in July, and again in November — the most-requested thing in this project's history, and the one I never had a good answer for. Last year did not leave me the time this card deserved, and some of you waited a lot longer than you should have for it.

So I gave this release the time instead: **560 commits**, and the kind of polish I would want if I were the one installing it. 🗓️ **Column view is here** — the same agenda you already have, rotated, with your events and colors carrying over exactly as they are. And because a layout with its own defaults, its own per-view overrides and its own density rules needs an editor that can actually express them, ⚙️ **the visual editor is rebuilt from the ground up**: nine panels, a search box that reaches any of 119 settings in a keystroke, and a filter that hides everything you have never touched.

Here is the part I am proudest of, though. Both of those are opt-in — most cards will never set `view` or open a form — so this could easily have been a big release for a few people and nothing much for everyone else. It is not. ⚡ Moving the editor into a file that loads only when you open it leaves **a card file 41% smaller to download** on every single dashboard, whether or not you ever touch either feature. 🐛 And behind that sit twenty-three fixes that reach further than any feature does: week numbers wrong for one date in seven outside UTC, a twelve-hour clock handed to 33 of the 64 languages Home Assistant ships, and a `first_day_of_week: system` that quietly answered Monday to every user on earth.

A card that does not set `view` keeps the list it has always had. But a few things change whichever layout you use, so they come first. 👇

## ⚠️ Breaking Changes

- **Manual Installation Now Copies Two Files** - The card is no longer a single file. A release ships `calendar-card-pro.js` and `editor.js`, and the card fetches the editor by URL the first time someone opens it. HACS handles this and needs nothing from you. If you install by copying files into `www/`, download **both** and put them in a folder of their own, such as `www/calendar-card-pro/` — copying only `calendar-card-pro.js` leaves a card that renders normally but reports a missing file when you open the visual editor, and `/config/www/` itself is shared with every other hand-installed card, where a second `editor.js` can take the name. Only `calendar-card-pro.js` is registered as a Lovelace resource; see [Manual Installation](https://calendar-card-pro.alexpfau.com/guide/installation#manual-installation)
- **`event_icon_vertical_alignment` Now Defaults to `top`** - It previously defaulted to `middle`. The option is invisible until a row wraps, and `middle` then centers the icon against the whole wrapped block — a clock or map-marker floating level with neither line of a two-line address. Column view wraps routinely, and the list view wraps on a long location or description, so the default moved to the alignment that reads correctly in both. Set `event_icon_vertical_alignment: middle` to keep the old behavior; see [Spacing & Alignment](https://calendar-card-pro.alexpfau.com/features/layout-appearance#spacing-alignment)
- **`first_day_of_week: system` Now Follows Home Assistant** - `system` is the default, and the editor labels it _Follow Home Assistant_, but it returned Monday for every user on earth. Two faults produced it: the branch never read the **First day of week** setting in the Home Assistant user profile at all, and its language fallback tested for `en-US`, `en-CA` or `es-US` in a string that has always been lowercased before it arrives, so it could not match anything. The setting is now resolved the way Home Assistant resolves it — an explicit weekday in the profile wins, and only when that is left at _Auto_ does the language decide. Upgrading therefore shifts week numbers, week separators and the `start_date: start_of_week` anchor for anyone whose profile or language implies a week that does not begin on Monday — nineteen of the 64 languages Home Assistant ships, seventeen starting on Sunday and Arabic and Persian on Saturday. Set `first_day_of_week: monday` to keep the old behavior; see [Week Numbers & Visual Separators](https://calendar-card-pro.alexpfau.com/features/layout-appearance#week-numbers-visual-separators)
- **Weather Badges Are Styled Through Custom Properties** - The weather icon and text carried their font size and color as inline `style` attributes, which no theme could override. Those attributes are gone, and the six `--calendar-card-weather-*` properties the card was already emitting are now read by the stylesheet instead, making them a real override surface. Two things follow. Card-mod rules that targeted the inline-styled elements need updating — the properties are listed under [Weather Custom Properties](https://calendar-card-pro.alexpfau.com/features/theming#weather-custom-properties). And `weather.date.color` / `weather.event.color` no longer carry a default. They did in 3.x, but it never reached a card that showed weather: `setConfig` merged only the top level, so any `weather:` block replaced the whole default sub-tree. The rendered color came from a fallback in the renderer either way — primary for the day header, secondary for the per-event badge — and both fallbacks now live in the stylesheet with the same values, so the badge looks as it did

## 🎉 New Features

### 🗓️ Column View

**See the week at a glance instead of scrolling through it.** `view: column` lays the days out side by side, one column each, instead of stacking them — the same agenda the list layout already shows, rotated. Your events, labels and colors carry over exactly as they are; only the date moves, from the left of each row to the top of each column. The default is still `list`, so nothing changes until you ask for it (#377, #14, #263, #253)

- **It Falls Back on a Phone** - Columns need width, so a card too narrow to give every day a readable one — `column.min_day_width`, 140 pixels — simply renders as a list instead. The same card can be columns on a desktop dashboard and a list on a phone, with no second card and no conditional wrapper. That is also why the editor annotates list-only options rather than hiding them: hiding a control would remove it for the layout that same card uses on a phone
- **Or Sheds a Day Instead** - If you would rather keep the columns, `column.min_days_to_show` lets a narrowing card drop trailing days one at a time before it gives up on the layout. It defaults to `days_to_show`, which leaves the behavior off, because a card quietly showing four of seven days looks exactly like a card configured for four. `column.min_days_fallback: cramp` keeps every day and lets the columns go narrower still
- **Different Values in Columns Than in the List** - A size tuned for a full-width row is usually wrong in a 140px track, so a nested `column:` block holds the values that apply only when the card renders as columns; anything it does not mention keeps its top-level value. It works in both directions, so an option switched off at the top level can be switched back on for columns. Only presentation options may go there — anything deciding _which_ events are loaded has to hold one value in both layouts, since the card switches between them as the dashboard resizes (see [Overriding Options in Column View](https://calendar-card-pro.alexpfau.com/features/column-view#overriding-options-in-column-view))
- **Two Options Start From a Different Default** - `show_empty_days` and `split_multiday_events` both default to `true` in column view and do **not** inherit the top-level value. A list reads perfectly well with the blank days left out; a row of columns does not, because dropping the empty ones stops the columns corresponding to consecutive days. The same reasoning covers a multi-day event — a column _is_ a day, so an event spanning three of them belongs in all three (see [Options That Start From a Different Default](https://calendar-card-pro.alexpfau.com/features/column-view#options-that-start-from-a-different-default))
- **Separators Rotate into the Gutter** - Day, week and month separators keep their existing options and become full-height vertical rules between the columns, with month taking precedence over week and week over day. A column-only rule can also run under each day header — `column.day_header_separator_width` and `_color` — off by default like every other separator in the card. Switching it on centers it inside the space `column.day_header_gap` already reserves, rather than shifting the layout
- **A Header Per Column** - Week numbers move into each column's header instead of taking a full-width row, and the today indicator becomes a leading marker on the weekday row so it stays unambiguous at any column width — the default `15% 50%` position is calibrated for the list view's narrow date cell and would land inside the day number on a full-width column header
- **Room for the Progress Bar** - A countdown and a progress bar never appear on the same event, so each now gets the treatment it needs instead of one compromise suiting neither. The countdown stays on the time row as trailing text after a middot, breaking at an ordinary word boundary when the column is too narrow; the bar moves to a row of its own under the title, spanning 80% of the column
- **One Click From the Card Picker** - Adding a card **by entity** and picking a `calendar.*` entity now offers two starting points under **Community**: _Calendar Card Pro_ for the list layout and _Calendar Card Pro - Columns_ for this one, each previewed with that calendar's real events. The two differ by a single option, so the second is the fastest way to find out whether you like the layout
- **Your Card-Mod Recipes Work in Both** - Both day containers expose the same four state classes — `today`, `tomorrow`, `future-day` and `weekend` — so one selector list can style either layout. `weekend` is new to the list view's `.day-table`; `.date-column.weekend` is unchanged and still drives `weekend_day_color` and `weekend_weekday_color` (see [Card-Mod Examples](https://calendar-card-pro.alexpfau.com/features/theming#card-mod-examples))

Column view is the days-side-by-side half of #300. A time axis, overlap lanes and a now-line are a genuinely different layout — the two want opposite things from vertical space — and are reserved for a separate view under the name `grid`. They are **not** in this release.

### ⚙️ A Rebuilt Visual Editor

**Configuring the card used to mean scrolling one long form and already knowing what you were looking for.** At 119 options that stopped being reasonable, so the editor is rebuilt from the ground up around finding things: nine panels named for what they configure, a search box that reaches any setting in a keystroke, and a filter that hides everything you have never touched.

It is now built on Home Assistant's own form components rather than a hand-assembled tree of them, and you get two things from that. Every control arrives with the keyboard handling and screen-reader labelling Home Assistant maintains. And the editor stops breaking when Home Assistant renames a component — as it did in 2026.5, when `ha-textfield` was removed and the old editor lost every text field it had.

- **Search** - Type what you are after and the editor collapses to it, dropping the panels — and the groups inside them — that have nothing left, so a match is never hidden behind a heading you forgot to open. It looks at everything on screen: the name of a setting, the sentence explaining it, and the choices a dropdown offers. It also matches the YAML option name, so a key copied out of the configuration reference leads straight to its control
- **Customized Only** - One toggle hides everything still set to the value the card would use anyway, leaving exactly what this card changes — the fastest way to see what a config actually does, or to find the one setting you regret. It reads values the way the card does, so a number written as `"3"` still counts as untouched when `3` is the default (see [Search & Customized Only](https://calendar-card-pro.alexpfau.com/features/editor#search-customized-only))
- **Nine Panels Named for What They Configure** - Calendars, Card & Title, Time Range & Content, Events, Day Header, Layout, Separators, Weather, and Actions & Refresh — named for what you want to change rather than for where the option happens to sit in YAML. Panels open one at a time, and options inside them appear only when they apply
- **Every Calendar's Settings in One Place** - Each configured calendar gets its own collapsible form holding all eleven per-calendar options — the label, three colors, four inheritable switches, the two filters and the compact limit — plus a clipboard for copying settings from one calendar to another. Four of those switches are genuinely three-state, because "follow the card" is not the same as "off"; the editor this replaces drew them unchecked and wrote a literal `false` the first time you touched one, which nothing could take back
- **Per-View Exceptions** - Give an option a different value in column view without leaving the editor or hand-writing a `column:` block. Each exception sits in a collapsed group at the end of the panel that owns the option, beside the value it is an exception to (see [Column View Exceptions](https://calendar-card-pro.alexpfau.com/features/editor#column-view-exceptions))
- **Labels You Pick the Way You Think of Them** - A calendar's label can be text, an emoji, an icon or an image, and choosing which gives you the right control for it — Home Assistant's icon picker, say, rather than a box where you have to know `mdi:` already. Most of the time the type is not stored at all: it is read back from the value, so a calendar configured in YAML opens with the right control already selected and no `label_type` option anywhere in it

### 🌍 Eleven Editor Languages

**The editor now speaks your language, completely.** Eleven of them: nine newly translated in full — German, Estonian, Italian, Latvian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish, at 312 of 312 strings each — alongside US English, which lives in code, and British English, which carries only the 36 strings where it differs. The rebuild came with a new and considerably larger string table, so every one of the nine was re-translated against it rather than carried over, and none was lost along the way.

The remaining 24 of the card's 35 languages render the editor in English, which is fully supported. Translation now resolves **per string**, requested language first and English second, so a partial file renders in that language for everything it covers and in English for the rest rather than looking broken. That makes a partial contribution genuinely useful — a language does not have to be finished to be worth having. The calendar itself continues to speak all 35.

### 📏 Per-Field Line Limits

**Stop one long title from pushing the rest of the day off the card.** `title_max_lines`, `time_max_lines` and `location_max_lines` cap how many lines each field may occupy, mirroring the existing `description_max_lines` — a number, `0` for unlimited, and truncated text ends in `...`. They work in both layouts and can be given a different value inside a `column:` block, which is where they earn their keep: a title that runs to four lines in a 140px track pushes every event below it off the screen (see [Limiting Lines Per Field](https://calendar-card-pro.alexpfau.com/features/event-content#limiting-lines-per-field))

### 🌦️ Weather in the Column Layout

**A forecast that fits a 140px column.** In column view an event's weather takes a row beneath the time rather than sitting on the title row beside the summary, where at that width a two-word title breaks into three lines around it. That row shares a leading icon edge with the time, location and description rows, so the condition icon is always shown there.

- **The Condition in Words** - `show_conditions` decides whether the condition is also stated in words alongside the icon — `21° · UV4 · Partly cloudy`. The words come from Home Assistant, which translates all fifteen conditions itself, so they follow the card's configured language and the card ships no condition wording of its own. A middot rather than a comma, because Home Assistant's own vocabulary contains `Clear, night`
- **`weather.event.max_lines`** - Caps how many lines that row may use, `0` for unlimited (see [Weather In The Column Layout](https://calendar-card-pro.alexpfau.com/features/weather#weather-in-the-column-layout))

### 🩺 Diagnosing a Released Build

**Reproduce a bug and actually see why it happened.** A released build prints errors only, so every warning the card raises is invisible to real users — including actionable ones, such as an invalid `start_date` quietly falling back to today. The person best placed to report a problem could not produce the output that would explain it. Running `window.calendarCardProDebug = true` in the browser console turns the detail back on, and `window.calendarCardProLogLevel = 0..3` selects a level directly. Neither persists and neither needs a reinstall: the card reads the flag on its next render, so reproduce the problem without reloading — a reload discards it (see [Reporting a Bug](https://calendar-card-pro.alexpfau.com/contributing#reporting-a-bug))

## ⚡ Performance

None of what follows is opt-in. It applies to every card on every dashboard, including one configured exactly as it was in v3.6.0.

- **The Card File Is 41% Smaller to Download** - The visual editor and its translations are the larger half of the bundle, and most dashboard loads never open it. Splitting the editor into a file the card fetches on demand takes it, and every string it needs, off the path every dashboard pays for. Measured on the production build against v3.6.0, the release before this one: the file every dashboard downloads is **41% smaller** compressed, the figure to compare if your setup serves these files gzipped. On disk — which is what most installs actually transfer — the reduction is larger still, at **45%**. The editor is a separate download paid only by someone who opens it, and only once per version
- **One Card Load Asked Home Assistant for the Same Events Three Times** - Three independent paths start the first load — `setConfig()`, `connectedCallback()`, and the arm of `updated()` that fires when `hass` first arrives — and all three ran before any of them had written the cache. Each therefore found nothing cached and issued its own request: one configured calendar, three round-trips, multiplied by every calendar card on the dashboard and repeated on every page load. A fourth came from the safety net, a retry armed in case Home Assistant attaches the card before handing over its state, which was only ever cancelled while the card was still waiting and so fired even after a successful load. Requests for the same calendars and window are now deduplicated at the API call itself, and the retry is disarmed the moment a load starts with usable state
- **Toggling Two Display Switches No Longer Refetches Your Calendars** - `show_past_events` and `filter_duplicates` are both applied after the data arrives, while building the day list, and neither has any bearing on what the card asks Home Assistant for. Both were nevertheless treated as fetch-affecting, so flipping either switch discarded a still-valid cache entry and spent a network round-trip — and a visible loading state — retrieving a byte-identical payload. The card now re-renders from the data it already has
- **CSS Comments No Longer Ship** - A `css` tagged template's contents are a string literal, so no minifier looks inside one and every explanatory comment in the stylesheet was downloaded by every user. They are now stripped at build time instead of being kept terse in the source

## 🐛 Bug Fixes

### Configuration

- **Sizes Typed Into the Visual Editor Were Thrown Away** - The editor renders twenty-one options — every spacing, font size, icon size and separator width — as free-text fields, and a text field hands its value back as a string, so typing `10` stored `"10"` where CSS needs `10px`. The consequence is worse than an ignored value, because a browser drops the entire declaration rather than the offending token: a typed `event_spacing` took the neighbouring `12px` of padding down with it, and a typed `additional_card_spacing` left the card with no padding at all, looking markedly worse than if the option had never been set. Worse still where the option has no pixel default to fall back on: `title_font_size` is read as `font-size: var(--calendar-card-font-size-title, …)`, and a unitless `24` **substitutes** into that rather than falling back, so the declaration went invalid and the title dropped to its inherited body size — setting the option left the card worse off than never touching it. Bare numbers are now given their unit on every length option, whichever input path they arrive by, including the five whose shipped default is a keyword, a `calc()` or nothing at all and so could not mark them as lengths: `title_font_size`, `progress_bar_width`, `progress_bar_height`, `height` and `max_height`
- **A Separator Set to Zero Still Took Up Its Space** - Whether a separator is drawn at all was decided by matching the literal string `0px`, and `0.0px` or `00px` are perfectly valid ways of writing the same length. A separator written either way rendered an invisible border that still carried a full `day_spacing` margin above and below it, so asking for no separator produced the gap without the line. The numeric part is now parsed rather than matched character by character, so every spelling of zero counts as one
- **Editing a Calendar's Own Settings Appeared To Do Nothing** - Per-calendar options — a label, a color, a per-entity event limit, an allowlist or blocklist — are stamped onto each event while the calendar payload is processed, and every reader prefers that stamp over the live configuration. The card decided whether to reprocess by comparing the entity _identifiers_ alone, which is right for deciding whether to call Home Assistant again and wrong for deciding whether to reprocess, so editing any other per-calendar option left the card unchanged until the next scheduled refresh — up to thirty minutes on the default interval — or a reload. A filter was the sharpest version: an event you had just excluded stayed on screen. Any change to a calendar block now reprocesses the payload already in the cache, with no additional API call
- **An Event Ending Exactly at Midnight Gained a Phantom Extra Day** - The multi-day splitter decided whether an event crossed into the next day by comparing its end against the last millisecond of the day it started on. Midnight is one millisecond past that, so an event running 23:00 to 00:00 — a perfectly ordinary way to say "until the end of the evening" — was classified as multi-day and produced a second entry whose start and end were the same instant. The event appeared twice: once where it belonged, and once as a zero-length entry at the top of the following day. The next day is now entered only when the event genuinely extends past the first instant of it, so an event that really does run past midnight keeps its true end time
- **Two Cards With Different Week Starts Shared One Cache Entry** - `first_day_of_week` moves the fetch window whenever `start_date` is week-relative, but the event cache key left it out. Two cards over the same calendars and window — one set to `sunday`, the other to `monday` — therefore collided on a single entry, and whichever was fetched first was served to both, so one of them showed the wrong week. The resolved weekday is now part of the key, and its parameter is typed as a number so the raw setting cannot be passed again by mistake. Only week-relative start dates are affected: an absolute `start_date` resolves to the same window whatever the week begins on
- **A Slow Reply From the Previous Calendar Could Replace the New One** - Fetching events is asynchronous, and the card read its own identity when a reply arrived rather than when the request was issued. Every edit starts a fresh request, so two are routinely in flight at once, and their latencies are unrelated — the older one can settle last. When it did, it committed the previous calendar's events _and_ stamped them with the current identity, so the check that exists to notice events no longer matching the query reported that they matched, and the wrong calendar stayed on screen until the next scheduled refresh. Each request now takes a monotonic ticket, and a reply whose ticket has been superseded discards itself
- **One Malformed Event Could Empty the Whole Card** - Home Assistant's calendar API is supposed to supply a start and an end, but the payload is produced by whichever integration backs the entity — CalDAV, ICS, Google or a third-party one — so an incomplete event does arrive in practice. Duplicate filtering read both without checking they were there, and it did not cost that event its row: it threw, and the card rendered nothing at all, taking every other event and every other calendar down with it. Only cards with `filter_duplicates` enabled could reach it, which is why it went unreported. Events missing a start or an end are now dropped with a warning naming how many, and everything beside them renders
- **A Start Date That Never Existed Silently Became a Different Day** - A fixed `start_date` is checked part by part — a month of 1 to 12, a day of 1 to 31 — and the assembled date is then tested for validity. That test can never fail: JavaScript does not reject February 30, it rolls it forward into March, so the check passed, the warning promising a fallback to today never printed, and the card quietly showed a window starting three days after the one that was asked for. Every impossible day that clears a 31-day bound behaves this way, and the further out of range the date, the further the window slides. The parts are now read back off the assembled date, so an impossible date falls back to today and says so
- **A Corrupted Cache Entry Was Rendered Instead of Refetched** - A cached entry was read back from browser storage and trusted on the strength of being valid JSON. Anything that parsed was treated as events, and a text value was the dangerous shape: iterating a string yields its characters, so the card built a row per character and still counted the read as a hit, which suppressed the refetch that would have replaced it. Nothing the card writes today produces such an entry, but an older version, another tab, or any of the storage-syncing add-ons people run can. A parsed entry is now checked for the shape the card assumes, and one that fails is evicted so the ordinary miss path refetches it
- **A Bare `hold_action:` Killed the Tap As Well** - Writing `hold_action:` with nothing after it is valid YAML that parses to null, and the card read that as "there is a hold action" when it armed the hold timer but as "there is none" when the press ended. A long press drew the hold indicator and then did nothing — and because the press had already been marked as a hold, the tap action did not run either, so the card stopped responding to an ordinary tap for as long as the key was there. Both ends now agree on what an empty action means

### Appearance

- **A Themed `accent_color` Never Reached the Card** - An `accent_color` written as a CSS variable — `var(--primary-color)`, or anything a theme defines — was composited for `event_background_opacity` by emitting `rgba(var(--calendar-color-rgb, 3, 169, 244), …)`, against a variable this project defines nowhere and no theme knows about. The fallback therefore won every time, and the fallback is `#03a9f4`, the default `accent_color` — so a themed card never looked broken, it looked like it had ignored your theme. Both the background tint and the progress bar now use `color-mix()`, which carries the configured color through without having to resolve it
- **Entity Labels Broke the Alignment of Wrapped Titles** - A glyph or emoji label before an event title left continuation lines starting under the label rather than under the title text; the label now hangs so wrapped titles align
- **Wrapped Event Titles Ignored `event_font_size`** - The block holding an event title declared no line height of its own, so a title that wrapped was spaced on Home Assistant's leading — a fixed 22.4px — instead of the card's. Lowering `event_font_size` then made it look worse rather than better, because the pitch stayed where it was while the glyphs shrank away from it, opening a gap wider than the lines it separated. Column view showed it most, since narrow columns wrap titles routinely. Wrapped titles now use the card's own leading and tighten as the font does; a single-line title keeps the spacing it had in 3.x
- **Sizes Written in `em`, `rem` or `calc()` Were Silently Read as Pixels** - `day_spacing` and `day_font_size` are CSS lengths, and the card honored them as written in most places while quietly converting them to pixels in the few sizes derived from them. `day_spacing: 2em` spaced the day blocks by `2em` but the rules between them by `2px`, so the separators collapsed into the content they divide; `day_font_size: 2em` gave a day number a `3.5px` column to sit in, and a `calc()` value produced no size at all. Derived lengths now scale in the unit they were written in, and anything the card cannot resolve is handed to the browser, which can. Pixel values — the defaults, and what nearly every configuration uses — render exactly as before

### Dates & Times

- **Week Numbers Were Wrong for One Date in Seven Outside UTC** - Both numbering methods built their two dates from local components and then measured the gap between them in milliseconds, so a daylight-saving transition falling inside that gap left the elapsed time an hour short of — or an hour past — a whole number of days, and the rounding that followed tipped the result by a full week. The two methods round in opposite directions, which makes the defect a mirror image: `iso` was wrong only in the southern hemisphere and `simple` only in the northern, each on roughly one date in seven. Sydney showed ISO week 15 on a date in week 14; Berlin and New York showed week 14 on a date in week 15. The arithmetic is now done in UTC internally, where a day is 24 hours by definition, and is verified against every date from 2015 to 2035 across seven zones
- **The Last Day of the Calendar Could Lose Its "No Events" Placeholder** - The same defect in a second place. The empty-day filler measured how wide its window was by subtracting two locally built midnights, so a transition inside that window left the elapsed time short of a whole number of days and the floor that followed dropped it to one day fewer. The loop then stopped a day early, and a day with nothing scheduled vanished from the card instead of showing its placeholder. It needed three things at once — `show_empty_days` enabled, a window spanning the March or October transition, and no events on the last day of it — which is why it went unreported for so long
- **A 24-Hour Locale Could Still Get a 12-Hour Clock** - `time_24h` defaults to `system` and Home Assistant's own time format setting defaults to `language`, so for anyone who has changed neither the clock was chosen from the language alone — by a hardcoded list of twenty-four "likely 24-hour" languages that disagreed with the platform's locale data for 33 of the 64 languages Home Assistant ships. The region was discarded before the lookup, so `en-GB` took the American answer; the list named the macrolanguage `no`, which never matches the `nb` and `nn` tags Home Assistant sends; and Greek and Korean were wrong outright. Ukrainian, Hebrew, Thai, Vietnamese, Icelandic, Catalan, Estonian, Latvian and a dozen more read `1:00 PM` where their language writes `13:00`. A second fault decided the `system` branch by searching the formatted string for `AM` or `PM`, which recognises only an unpunctuated Latin day period, so Greek `1 μ.μ.` and Arabic `1 م` were read as 24-hour. Both are now a single query to the platform's own locale data, which agrees with it for all 64

### Weather

- **"Nowhere" Was the Most Expensive Weather Setting** - The weather position offers "Nowhere" alongside the date column, the event row and both. Picking it drew no weather anywhere, as intended — but it fell through the branch that decides which forecasts to subscribe to and landed on the arm reserved for the positions that draw the most, so the option that renders nothing quietly subscribed to both the daily and hourly forecast streams. It now subscribes to neither
- **A Weather Block Without a Position Drew Nothing** - `weather.position` defaults to `date`, and the documentation says so, but that default only ever reached half the card. A `weather:` block naming an entity and leaving `position` out replaced the shipped block wholesale, so the value arrived unset: the half deciding which forecasts to subscribe to applied the default and dutifully fetched the daily forecast, while both halves that draw the badge compared the raw value, matched nothing, and rendered nothing at all. The card paid for a forecast stream and showed no weather. Only hand-written YAML could reach it, since the editor writes the block out in full. All three now resolve the default in one place
- **The Editor Showed Five Weather Toggles Off While the Card Drew Them On** - Every nested weather option is read as "on unless explicitly false", so a `weather:` block that names an entity and leaves the rest out renders conditions and temperatures anyway. The editor bound that block exactly as written, and a checkbox given nothing to bind draws unchecked — so five toggles sat off in the editor while the card was visibly drawing them. The one panel whose job is to show you what the card is doing was the one contradicting it, and only for hand-written YAML, since a configuration saved from the editor writes the block whole. The weather block is now filled in from its defaults before the form binds to it — `setConfig` merges nested blocks key by key rather than replacing them wholesale — and stripped back down again on write, so the form states the truth without expanding anyone's YAML
- **The Editor Wrote a Weather Color Into Your Configuration** - `weather.event.color` shipped a default, and the editor writes the whole weather block back the moment you pick an entity — so that default was copied into the user's YAML, where it became indistinguishable from a deliberate choice forever after. A card nobody had styled ended up with a weather badge pinned to the primary text color, beside siblings that were not. The default is now absent so it is never created, and each placement supplies the color it actually wants. A configuration already saved in this state keeps its explicit value; delete the `color` line to pick up the per-placement fallback
- **Changing the Weather Entity Left the Old Entity's Forecast on Screen** - Switching to a different weather entity tore down the old subscription but never cleared the forecast it had already delivered, so the card kept drawing the previous entity's conditions and temperatures under the new configuration until the replacement subscription happened to emit. Where the new entity does not offer that forecast type at all there was no later emission to correct it, and the old data simply stayed. The forecasts are now cleared when the entity changes, and only when it changes

### Translations

- **Weekday Names Were Capitalized Mid-Sentence** - Full weekday names are rendered in exactly one place, in the running text after "until", and 17 of 35 languages stored a capital there — Swedish read `till Måndag, 5 Jan` where it wants `till måndag`. Fixed in ten languages: nine lower-cased against `dayjs`, and Polish given the genitive its preposition governs. Seven more need an inflected form that no in-repo evidence supplies, so they are deliberately left flagged rather than half-fixed
- **Romanian Diacritics** - Restored throughout the Romanian translation

## Related Issues

- [#14](https://github.com/alexpfau/calendar-card-pro/issues/14) - Add Column View to Calendar-Card-Pro by @chrannen
- [#253](https://github.com/alexpfau/calendar-card-pro/issues/253) - Landscape mode - days next to each other on desktop and tablet by @fugazzy
- [#263](https://github.com/alexpfau/calendar-card-pro/issues/263) - Horizontal mode by @wsw70
- [#300](https://github.com/alexpfau/calendar-card-pro/issues/300) - Time grid + seven days view (columns) by @rozrabiak — the columns half only; the time grid is a separate view and is not in this release
- [#377](https://github.com/alexpfau/calendar-card-pro/issues/377) - [Epic] Column view — days side by side by @alexpfau

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.6.0...v4.0.0

---

# Calendar Card Pro v3.6.0

**A documentation site of its own, and six fixes for defects that made the card look broken rather than merely wrong.** Everything that used to be buried in a very long README now lives at [calendar-card-pro.alexpfau.com](https://calendar-card-pro.alexpfau.com), with a page per feature and a complete configuration reference. Alongside it: a card that no longer disappears behind a red error box because of one stray line of YAML, per-calendar settings that take effect when you change them instead of whenever a cache happens to expire, and text that stops vanishing mid-word.

## 🎉 New Features

### 📚 A Documentation Site

- **[calendar-card-pro.alexpfau.com](https://calendar-card-pro.alexpfau.com)** - The full manual is now a searchable site rather than a README you scroll through: a page per feature, a [complete configuration reference](https://calendar-card-pro.alexpfau.com/reference/configuration) listing every option with its type and default, a [usage guide](https://calendar-card-pro.alexpfau.com/guide/usage) that starts from a working card, and [ready-made examples](https://calendar-card-pro.alexpfau.com/reference/examples). The README is now a landing page that points at it, so installation and a first working card are the first things you see

## 🐛 Bug Fixes

### Reliability

- **One Stray Line of YAML Took Down the Whole Card** - A bare `-` in the `entities:` list, left behind while editing or written as `entities: [~]`, parses to null. The config normalizer accepted it and then read a property off it, throwing before the card rendered — so Home Assistant replaced the entire calendar with a red error box. Malformed entries are now discarded, which is what the surrounding code always intended (#389)
- **Per-Calendar Settings Ignored Until the Cache Expired** - Events were cached after processing, but the cache key described only what had been _fetched_ — the calendars and the time window. Every other option the processing step reads was invisible to it, so editing a per-calendar label, colour or toggle appeared to do nothing until the entry aged out. The cache now stores the raw calendar payload and reprocesses it on every read, so edits apply immediately; per-calendar event limits were also silently degrading on a cache hit and no longer do

### Appearance

- **Titles Ellipsised When Nothing Had Been Truncated** - Event titles showed a trailing `…` at certain card widths even though no characters had been dropped, and at slightly narrower widths the ellipsis ate one or two real characters before the title finally wrapped. The card offers no title-truncation option, so that ellipsis could only ever announce a truncation that had not happened
- **Words Disappeared Mid-Character in Descriptions and Locations** - The description, location and time rows could shrink below the width of their own longest word and clip it mid-glyph, with no ellipsis to indicate anything was missing — measured on a 300px card, a 179px word in a 167px box painted 12 pixels of its last character and dropped the rest. Long words now wrap instead of being cut off

### Countdown

- **Multi-Day Countdowns Disagreed From Row to Row** - With `split_multiday_events` enabled a multi-day event renders one row per day, and each row was counted differently: the first measured wall-clock time and lost a day after midday, the middle rows counted calendar days, and the last counted to a midnight that exists only because of the split. A holiday four days out read `in 3 days / in 5 days / in 6 days / in 6 days`. Every row now counts whole calendar days to its own date, so the sequence reads consecutively; this also fixes countdowns vanishing from just the middle rows when `show_countdown_allday` was off (Thanks @Scooshie and @BalooDK, #344)

### Configuration

- **Options Removed in v3.0.0 Were Ignored in Silence** - Five options dropped in the v3.0.0 cleanup — `max_events_to_show`, `vertical_line_color`, `horizontal_line_width`, `horizontal_line_color` and `row_spacing` — were discarded without comment for anyone configuring the card in YAML: the value vanished, its replacement took the default, and nothing anywhere said so, which reads as "the update changed my styling". Each removed option is now reported in the browser console together with the option that replaces it. The visual editor already offered a one-click upgrade; this closes the gap for everyone who never opens it

## 🔧 Under the Hood

Groundwork for the [column view](https://github.com/alexpfau/calendar-card-pro/issues/377): the renderer's leaf elements and the event presentation model moved into modules of their own, and whether an all-day event shows a time row is now decided by the formatter instead of by substring-matching the string it had just produced — a test that had no margin in the eight languages whose "until" translation is two characters long. The list view's rendered DOM is byte-identical throughout, now pinned by a test suite so that stays true.

## Related Issues

- [#344](https://github.com/alexpfau/calendar-card-pro/issues/344) - Countdown display appears one day short for all-day calendar events by @Scooshie

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.5.0...v3.6.0

---

# Calendar Card Pro v3.5.0

**Cards that hide themselves when there is nothing to show, start dates that follow the week, titles rendered from Home Assistant templates — and a fix that restores the card title to its intended size.** This release is mostly about fitting the card to the dashboard around it: disappearing when it is empty, saying something useful when a day has no events, anchoring to next Monday instead of a date you keep updating, and driving the title from Home Assistant itself. The card is also easier to find in the first place, now that Home Assistant offers it directly when you add a calendar entity.

## 🎉 New Features

### 🫥 Empty State Control

- **`hide_when_empty` Option** - Removes the entire card from the dashboard when there are no upcoming events, so the cards around it close the gap instead of leaving a "No upcoming events" placeholder behind. A conditional card cannot do this, because this card is not backed by an entity of its own. Defaults to `false`, so existing cards are unchanged (#286)
- **`empty_day_text` Option** - Replaces the text shown on a day that has no events, so a meal-plan calendar can read "Leftovers" instead of "No upcoming events". The `✓` prefix is dropped for custom text and kept for the default, and clearing the field restores both (#279, #197)

The card deliberately never hides while you are editing the dashboard, never hides an error state, and never hides because a compact limit collapsed it — emptiness is measured against the fully expanded event set.

### 📅 Flexible Start Dates

`start_date` now accepts an anchor plus offsets, so a card can follow the calendar rather than a date you have to keep editing:

- **Week Anchor** - `start_of_week` resolves to Monday or Sunday according to the card's `first_day_of_week` setting
- **Weekday Anchors** - `saturday`, or the short form `sat`, resolves to the next Saturday, counting today if today is already Saturday
- **Composable Offsets** - `+N` / `-N` days, `+Nw` / `-Nw` weeks and `+<weekday>` / `-<weekday>` jumps combine on any anchor: `start_of_week+7`, `today+sat+7`, `monday+1w`

Parsing is case-insensitive and ignores whitespace, and existing values such as a fixed `2025-07-01`, `today+7` and `+3` behave exactly as before. The documentation has worked examples of every anchor and offset combination — see [Start Date Configuration](https://calendar-card-pro.alexpfau.com/features/start-date-offset#start-date-configuration) (#296, #276, #193)

### 🏷️ Templated Titles

- **Home Assistant Templates in `title`** - A title containing `{{ ... }}` or `{% ... %}` is rendered by Home Assistant and updates live, so a card can show `{{ now().strftime('%-d %B %Y') }}` or pull a value straight from a sensor. There is no new option to switch on — a title without template syntax is passed through untouched. Template errors are reported under the Title field in the visual editor, and a template that starts failing keeps the last good title on screen rather than blanking the card (#303)

### 🔎 Easier to Find

- **Suggested in the Card Picker** - Home Assistant 2026.6 and newer show Calendar Card Pro under **Community** when you add a card by entity and pick a `calendar.*` entity, pre-filled with that calendar and previewed with its real events. Until now the card only appeared in the full card list, so finding it meant already knowing it existed. There is nothing to configure, and older Home Assistant versions are unaffected (#373)

## 🐛 Bug Fixes

### Appearance

- **Card Title Rendered as Body Text** - The card header was styled entirely through Polymer `--paper-font-headline_-_*` variables that Home Assistant no longer defines. With no fallback values every declaration became invalid, so the title inherited body text and a titled card had no visual hierarchy at all — the card title looked identical to an event title beneath it. Titles now render at their intended size, weight and opacity. **Titled cards become roughly 10px taller and their titles noticeably larger**, which is how they were always meant to look; set `title_font_size` explicitly if you preferred the smaller text (#369)

### Reliability

- **A Calendar That Failed to Load Looked Like an Empty Calendar** - A calendar the card could not read returned zero events, which was indistinguishable from a calendar with nothing in it. The card stated there were no upcoming events, and with `hide_when_empty` enabled it removed itself from the dashboard entirely — an unreachable integration could quietly erase a card, leaving nothing on screen to explain why. Failed fetches are now tracked separately, so the card stays visible and shows its error state instead of asserting that the calendar is empty
- **A Failed Refresh Blanked Events Already on Screen** - Each fetch replaced the event list wholesale, so a single failed poll emptied a populated card until the next successful one. Events already on screen now survive a failed refresh, scoped to the current configuration so that pointing a card at a mistyped entity still clears the previous calendar's events rather than showing them indefinitely
- **Empty Results Cached During an Outage** - An empty result was cached even when an entity had failed, so a transient outage could persist emptiness and keep serving it after the calendar had recovered. Empty results are no longer cached when any entity failed

### Configuration

- **Card With No Entities Stuck on "Loading calendar events..."** - A card with an empty `entities` list never finished its initial load, so it showed the loading message indefinitely and its error state was unreachable. It now reports the misconfiguration instead

### Visual Editor

- **Blank Date Picker for Relative Start Dates** - The editor treated anything that was not a bare number as a fixed date, so documented values such as `today+7` — and the ISO dates Home Assistant itself writes — opened an empty date picker that was one click away from overwriting the configured value. Relative expressions now route to the relative field and keep their value, and ISO dates hand their date portion to the picker (#365)

## Related Issues

- [#193](https://github.com/alexpfau/calendar-card-pro/issues/193) - Weekday Support for Calendar Cards by @goegsig
- [#197](https://github.com/alexpfau/calendar-card-pro/issues/197) - Empty day custom text by @schnipzel35
- [#276](https://github.com/alexpfau/calendar-card-pro/issues/276) - Relative Offset with Weekdays by @jkadw
- [#279](https://github.com/alexpfau/calendar-card-pro/issues/279) - Custom text on empty event days by @DJKatastrof
- [#286](https://github.com/alexpfau/calendar-card-pro/issues/286) - Hide when "No Upcoming Events" by @catdogmaus
- [#296](https://github.com/alexpfau/calendar-card-pro/issues/296) - Add "start_of_week" keyword for start_date to allow for clean weekly offsets by @matthiasnielsen1
- [#303](https://github.com/alexpfau/calendar-card-pro/issues/303) - Support template in title by @EvertJob
- [#365](https://github.com/alexpfau/calendar-card-pro/issues/365) - Visual editor blanks the date picker for relative and ISO `start_date` values by @alexpfau
- [#369](https://github.com/alexpfau/calendar-card-pro/issues/369) - Card title renders as body text by @alexpfau
- [#373](https://github.com/alexpfau/calendar-card-pro/issues/373) - Suggest Calendar Card Pro in the card picker for calendar entities by @alexpfau

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.4.0...v3.5.0

---

# Calendar Card Pro v3.4.0

**Weather across the full day range, correct all-day countdowns, and a card that no longer empties itself when a number field is cleared.** This release closes a set of gaps where the card silently rendered less than it should, and adds editor guidance so the configurations that quietly do nothing become visible while you are creating them.

## 🎉 New Features

### ⏳ Countdown Control

- **`show_countdown_allday` Option** - Hide the countdown on all-day events while keeping it on timed ones. Defaults to `true`, so existing cards are unchanged (#323)

### 🧭 Compact Mode Guidance

Two configurations look perfectly reasonable but produce a card that is identical before and after an `expand` action. Both now surface a warning in the visual editor:

- **Missing Compact Limits** - Shown when an `expand` action is configured but no compact limit is set anywhere, including per-entity `compact_events_to_show` overrides
- **Inert `compact_days_to_show`** - Shown when `compact_days_to_show` is not lower than `days_to_show`, in which case it is silently clamped and has no effect
- **Helper Text for `compact_events_to_show`** - A note explaining that the limit only takes effect once the selected day range actually contains more events than the limit

The warnings are advisory only — nothing is blocked and no runtime behavior changes.

## 🐛 Bug Fixes

### Countdown

- **All-Day Countdowns Off By One** - All-day countdowns were measured from the current instant rather than the calendar day, so they showed the wrong number for roughly half of every day, flipping at midday. An all-day event on the following day also counted down in hours, which is meaningless for an event with no time of day. All-day countdowns now measure whole calendar days from the start of today; timed events are unchanged (#344)

### Weather

- **Missing Weather on Timed Events** - Home Assistant's hourly forecast only spans about two days, and with `weather.position: event` any timed event beyond that horizon silently showed nothing, even though the daily forecast for that same date was already loaded. Timed events now fall back to their day's forecast, so weather appears across the full range instead of only the first day or two. The new `weather.event.daily_forecast_fallback` option (default `true`) turns the fallback off for anyone who would rather see nothing than a daily high next to a 09:00 event (#336)

### Configuration

- **Cleared Number Fields Could Blank the Card** - Clearing a numeric field in the visual editor saved an empty string instead of removing the option. Empty strings slipped past the card's existing guards and then coerced to zero, which dropped every event from a single calendar or, in the case of `days_to_show` and the global `compact_events_to_show`, rendered the entire card empty. Empty and invalid numbers are now ignored throughout, and configurations already saved in this state repair themselves on load (#327)

### Compact Mode

- **Expand Blocked by Valid Limits** - `tap_action: expand` did nothing when the only compact limit in play was `compact_events_to_show: 0` or a per-entity override. The first case left a card that rendered empty with no way to get back, because zero was treated as "no limit set". Both configurations now expand and collapse correctly (#335)

### Translations

- **Raw Key Names in the Visual Editor** - The description toggle and its helper text rendered as the literal strings `show_description` and `entity_show_description_note` in Estonian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish. All eleven editor languages are now complete against the English reference

### Console

- **Source Map 404 on Every Page Load** - Every build appended a `sourceMappingURL` comment referencing a `.map` file that is never published through HACS, so anyone with browser devtools open saw a 404 on each load. Sourcemaps are no longer emitted, and CI now fails if the reference ever returns (#358)

## ⚡ Performance

- **Memoized Color Conversion** - Resolving a color to RGBA created a temporary element, appended it to the document and read back its computed style — a forced synchronous layout that ran once per rendered event, on every render. Results are now cached, removing hundreds of forced layouts per refresh on large calendars. Theme-dependent `var(...)` colors are unaffected and still repaint correctly on a theme change

## 🔧 Technical Changes

- Documented two previously unstated aspects of `filter_duplicates` in the README: the first-listed calendar wins a duplicate and takes its styling with it, and matching ignores the source calendar entirely, so identically named concurrent events merge even within a single calendar
- Added a CI guard that fails the build if a `sourceMappingURL` comment or a `dist/*.map` file ever reappears

## Related Issues

- [#304](https://github.com/alexpfau/calendar-card-pro/issues/304) - 2 different calendars have an event at the same time and only 1 event shows in the calendar by @nytram-md
- [#323](https://github.com/alexpfau/calendar-card-pro/issues/323) - Add option to disable countdown to all-day events by @doctorkb
- [#327](https://github.com/alexpfau/calendar-card-pro/issues/327) - Standard view doesn't show all day events in initial view by @FS1961
- [#335](https://github.com/alexpfau/calendar-card-pro/issues/335) - 'action: expand' does not work by @fredokl
- [#336](https://github.com/alexpfau/calendar-card-pro/issues/336) - Weather icons missing on days containing timed events by @harryvandervossen
- [#344](https://github.com/alexpfau/calendar-card-pro/issues/344) - Countdown display appears one day short for all-day calendar events by @Scooshie
- [#358](https://github.com/alexpfau/calendar-card-pro/issues/358) - Source map error by @tomlut

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.3.0...v3.4.0

---

# Calendar Card Pro v3.3.0

**Home Assistant 2026.5+ visual editor compatibility, two new languages, and important color and relative-time fixes.** This release restores the visual editor on recent Home Assistant versions, brings the card to 35 languages, and resolves several long-standing color and translation issues.

## 🎉 New Features

### 🌐 New Language Additions

Two new languages bring the total to **35**:

- **British English** (`en-GB`) - Complete interface and editor translation (Thanks @martinconroy, #334)
- **Latvian** (`lv`) - Complete interface and editor translation (Thanks @djadjuks, #340)

### 🌐 Expanded Editor Language Support

Three new editor translations bring the visual editor to **11 languages** total (English, British English, German, Norwegian Bokmål, Swedish, Slovak, Polish, Estonian, Lithuanian, Italian, Latvian):

- **Italian Editor Translation** - Complete translation for the visual configuration editor, along with refinements to existing Italian interface strings (Thanks @papperone, #333)
- **British English Editor Translation** - Complete translation for the visual configuration editor
- **Latvian Editor Translation** - Complete translation for the visual configuration editor

## 🐛 Bug Fixes

### Compatibility

- **Home Assistant 2026.5+ Visual Editor** - Restored the text input fields in the visual editor, which disappeared entirely on Home Assistant 2026.5 and later after the `ha-textfield` component was removed. The editor now detects `ha-input` where available and falls back to `ha-textfield` on older versions, so a single build keeps working across both (#338)

### Event Colors

- **`event_color` Now Applied Correctly** - Fixed `event_color` being ignored whenever no per-entity color was configured, which caused affected events to always fall back to the default accent color (Thanks @astraios-de, #341)

### Translations

- **Catalan and Romanian Relative Times** - Fixed relative time strings such as "in 2 days" silently falling back to English for Catalan and Romanian, both of which were missing their Day.js locale registration
- **Latvian Locale Registration** - Completed the Latvian registration so its relative times resolve correctly rather than falling back to English

## 🔧 Technical Changes

- Added `AGENTS.md` documenting repository conventions, the branch model, and the translation checklist for AI coding agents
- Corrected contributor guidance in `CONTRIBUTING.md`, which previously directed pull requests at the wrong base branch
- Added TypeScript type checking (`tsc --noEmit`) to the CI pipeline
- The release workflow now publishes the curated notes from `docs/RELEASE_NOTES.md` instead of auto-generating a commit list

## Related Issues

- [#284](https://github.com/alexpfau/calendar-card-pro/issues/284) - event_color doesn't work by @ZakOyten
- [#338](https://github.com/alexpfau/calendar-card-pro/issues/338) - Missing ha-textfield options in visual editor by @EMERALD0874

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.2.0...v3.3.0

---

# Calendar Card Pro v3.2.0

**Event descriptions, weather UV index, RTL support, and Home Assistant 2026.3 compatibility.** This release introduces major new display features alongside critical compatibility updates and significant bug fixes.

## 🎉 New Features

### 📝 Event Description Display

Calendar Card Pro now supports displaying event descriptions directly below event titles, giving users more context at a glance without opening the event details:

- **`show_description` Option** - Toggle display of event descriptions globally or per entity (Thanks @IT-BAER, #277)
- **`description_max_lines` Option** - Limit displayed lines with CSS line-clamp and `...` truncation (0 = unlimited)
- **Automatic HTML Processing** - HTML tags are stripped and HTML entities are decoded for clean, readable text
- **Full Styling Control** - Configurable `description_font_size`, `description_color`, and `description_icon_size`

### 🌤️ UV Index Display

Weather forecasts now support UV index information, displayable in both date column and event positions:

- **`show_uv_index` Option** - Show UV index in weather forecasts for both date and event positions (Thanks @jandechent, #273)
- **`uv_index_threshold` Option** - Only display the UV index when it exceeds a configurable threshold value (e.g., set to 3 to hide low UV readings)

### 🎨 Enhanced Customization

- **Event Icon Vertical Alignment** - New `event_icon_vertical_alignment` option (`top`, `middle`, `bottom`) to control vertical positioning of time, location, and description icons relative to their text
- **Label Icon Color** - New per-entity `label_icon_color` option to customize the color of `mdi:` and other icon-type labels independently from event text color, with full visual editor support (Thanks @aw1604, #302)
- **Two-Digit Hours** - New `time_two_digit_hours` option to pad single-digit hours with a leading zero (e.g., `09:00` instead of `9:00`)

### 🔄 Improved Loading UX

- Events now remain visible during background data refresh instead of being replaced by a loading spinner
- A subtle, non-intrusive spinner appears in the top-right corner during refresh
- Added `aria-busy` attribute on the card for improved accessibility
- Distinguished initial load (full spinner) from background refresh (subtle indicator)

### ↔️ RTL Language Support

- Added right-to-left (RTL) support for event borders and accent lines using CSS logical properties, enabling proper display for RTL languages such as Hebrew and Arabic (Thanks @baruchiro, #275)

### 🌐 New Language Additions

Three new languages bring the total to **33**:

- **Estonian** (`et`) - Complete interface and editor translation
- **Lithuanian** (`lt`) - Complete interface and editor translation
- **Turkish** (`tr`) - Complete interface translation (Thanks @ofilis, #268)

### 🌐 Expanded Editor Language Support

Three new editor translations bring the visual editor to **8 languages** total (English, German, Norwegian Bokmål, Swedish, Slovak, Polish, Estonian, Lithuanian):

- **Polish Editor Translation** - Complete translation for the visual configuration editor interface
- **Estonian Editor Translation** - Complete translation for the visual configuration editor interface
- **Lithuanian Editor Translation** - Complete translation for the visual configuration editor interface

## 🐛 Bug Fixes

### Compatibility

- **Home Assistant 2026.3+ Compatibility** - Migrated `ha-select` dropdowns to the new WebAwesome API introduced in HA 2026.3, preventing visual editor rendering failures
- **Browser_mod Compatibility** - Delegated tap/hold actions to Home Assistant's native action handler, restoring compatibility with browser_mod and similar custom integrations

### Weather & Performance

- **Weather WebSocket Subscription Leak** - Fixed a memory leak caused by weather forecast WebSocket subscriptions accumulating over time without proper cleanup (#291)
- **Enhanced Refreshing and Caching Logic** - Improved data refresh reliability with better cache invalidation and smarter refresh triggers (#297)

### Location & Description Processing

- **Location Display Corruption Fix** - Removed redundant location/description processing in the renderer that could corrupt location strings when using a custom `remove_location_country` regex pattern—e.g., a regex like `New York|USA` could inadvertently blank the location after double-processing (Thanks @sevorl, #331)

### Visual Editor

- **Date Picker Fix** - Replaced the broken date picker component with a native date input for reliable start date selection
- **Start Date Offset Field** - Fixed the start_date relative offset field (`today+N`) vanishing during editing
- **Label Icon Color Editor** - Added `label_icon_color` to the visual editor entity configuration panels

### Display & Rendering

- **Non-MDI Icon Prefix Support** - Fixed rendering of non-`mdi:` icon prefixes (e.g., `fas:`, `hass:`) in labels and today indicators
- **Loading Spinner Positioning** - Adjusted the loading spinner position to respect the card's border radius

### Translation Fixes

- **Norwegian** - Corrected day and month name capitalization and preposition usage
- **Slovak** - Fixed a typo in the Slovak translation
- **Estonian** - Corrected the Estonian language mapping in localize.ts

### Build & Infrastructure

- **Production Build Fixes** - Resolved production build issues by removing development mode warnings and optimizing build configurations
- **Dependency Updates** - Updated project dependencies

## Related Issues

- [#259](https://github.com/alexpfau/calendar-card-pro/issues/259) - RTL Language event alignment by @dmatik
- [#261](https://github.com/alexpfau/calendar-card-pro/issues/261) - Relative date goes back to fixed date when entering +1 by @iAmRenzo
- [#267](https://github.com/alexpfau/calendar-card-pro/issues/267) - Multiple lit warnings in browser console by @Hitman247m
- [#268](https://github.com/alexpfau/calendar-card-pro/pull/268) - Turkish Translation by @ofilis
- [#273](https://github.com/alexpfau/calendar-card-pro/pull/273) - UV index display by @jandechent
- [#275](https://github.com/alexpfau/calendar-card-pro/pull/275) - RTL support for event borders and accent lines by @baruchiro
- [#277](https://github.com/alexpfau/calendar-card-pro/pull/277) - Event description display by @IT-BAER
- [#280](https://github.com/alexpfau/calendar-card-pro/issues/280) - fire-dom-event not correctly implemented by @johnmph
- [#291](https://github.com/alexpfau/calendar-card-pro/issues/291) - Weather integration does not unsubscribe from websocket forecast events by @PaulVanSchayck
- [#297](https://github.com/alexpfau/calendar-card-pro/issues/297) - Calendar not updated by @L0bit0
- [#302](https://github.com/alexpfau/calendar-card-pro/pull/302) - Label icon color support by @aw1604
- [#307](https://github.com/alexpfau/calendar-card-pro/issues/307) - Icon labels prefix causes custom icons to be blank by @Xalvas
- [#312](https://github.com/alexpfau/calendar-card-pro/pull/312) - Estonian translation by @taims11
- [#326](https://github.com/alexpfau/calendar-card-pro/issues/326) - Reload UI Error and Constant erroring by @buckswheats14
- [#328](https://github.com/alexpfau/calendar-card-pro/issues/328) - Start date dropdown doesn't work by @Hepatic
- [#331](https://github.com/alexpfau/calendar-card-pro/pull/331) - Remove redundant double formatLocation call by @sevorl

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.1.0...v3.2.0

---

# Calendar Card Pro v3.1.0

**Enhanced internationalization and improved customization.** This release significantly expands language support for the visual configuration editor while adding powerful new customization options and fixing important display issues.

## 🎉 New Features

### 🌐 Expanded Editor Language Support

Calendar Card Pro's visual configuration editor now supports three additional languages, making configuration accessible to even more users:

- **Norwegian Bokmål Editor Translation** - Complete translation for the visual configuration editor interface (Thanks @mathiasbk, #235)
- **German Editor Translation** - Complete translation for the visual configuration editor interface (Thanks @NetSecond, #237)
- **Swedish Editor Translation** - Complete translation for the visual configuration editor interface (Thanks @JonasHedberg, #238)

The visual editor now supports 5 languages total: English, Slovak, Norwegian, German, and Swedish.

### 🆕 New Language Addition

- **Bulgarian Language Support** - Added complete Bulgarian translation for the calendar card interface, bringing the total number of supported languages to **30**! (Thanks @kyutov, #246)

### 🎨 Enhanced Styling Capabilities

- **Tomorrow CSS Class** - Added new HTML `tomorrow` CSS class to tomorrow's events, enabling users to use card-mod to apply specific styling to tomorrow's events that's distinct from other future events. See the ReadMe for an example. (Thanks @Squazel, #249)

## 🐛 Bug Fixes

### Weather Display Improvements

- **Zero Temperature Display Fix** - Fixed an issue where minimum temperature values of exactly 0° would not be displayed in the date column when `show_low_temp: true` was configured. The condition now properly handles zero values by checking for `undefined` instead of using truthy evaluation. (Thanks @DaveOzzie, #252)

### Layout and Container Issues

- **Grid Container Overflow Fix** - Resolved an issue where the calendar card would exceed its container boundaries and overlay other sections when `grid_options.rows` was configured. The card now properly respects container boundaries in all grid configurations. (Thanks @Deltids, #233)

## Related Issues

- [#235](https://github.com/alexpfau/calendar-card-pro/pull/235) - Added editor values to Norwegian bokmål language by @mathiasbk
- [#237](https://github.com/alexpfau/calendar-card-pro/pull/237) - Update de.json (complete) by @NetSecond
- [#238](https://github.com/alexpfau/calendar-card-pro/pull/238) - Swedish Translation by @JonasHedberg
- [#246](https://github.com/alexpfau/calendar-card-pro/pull/246) - Add support for Bulgarian language by @kyutov
- [#248](https://github.com/alexpfau/calendar-card-pro/issues/248) - [Feature]: Include HTML class to indicate "tomorrow" by @Squazel
- [#249](https://github.com/alexpfau/calendar-card-pro/pull/249) - feat(tomorrow): Added new HTML class 'tomorrow' by @Squazel
- [#252](https://github.com/alexpfau/calendar-card-pro/issues/252) - [Bug]: Weather minimum temperature not displayed if it's zero degrees by @DaveOzzie
- [#233](https://github.com/alexpfau/calendar-card-pro/issues/233) - [Bug]: Calendar card exceeds container when grid_options.rows is set by @Deltids

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.6...v3.1.0

---

# Calendar Card Pro v3.0.6

## 🎉 New Features

- **Slovak Editor Translation** - Added complete Slovak translation for the visual configuration editor, making Slovak the second fully supported editor language after English. (Thanks @jose1711, #230)

## 🐛 Bug Fixes

- **Event Background Color Fix** - Fixed an issue where the event background color did not correctly use the global `accent_color` setting when no entity-specific `accent_color` was defined. The event background now properly matches the global accent color setting.
- **Slovak Translation Typo Fix** - Fixed a small typo in the Slovak translation for the calendar card interface. (Thanks @jose1711, #230)

## Related Issues

- [#230](https://github.com/alexpfau/calendar-card-pro/pull/230) - Update Slovak translation by @jose1711
- [#232](https://github.com/alexpfau/calendar-card-pro/pull/232) - Update FUNDING.yml by @benjamin-dcs

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.5...v3.0.6

---

# Calendar Card Pro v3.0.5

## 🐛 Bug Fixes

- **Allowlist/Blocklist Filtering Fix** - Fixed incorrect behavior when using multiple configurations for the same calendar entity with different allowlist/blocklist filters. Each entity configuration is now processed independently, correctly applying filters and event limits.
- **Empty Space Removal** - Resolved an issue causing excessive empty space when `compact_events_to_show` was set only at the entity level without a global limit. Days without visible events are now properly filtered out, eliminating unnecessary empty space.
- **Ukrainian Translation Fix** - Corrected incorrect Ukrainian translations for calendar elements.

## Related Issues

- [#228](https://github.com/alexpfau/calendar-card-pro/issues/228) - Calendar event filtering applies incorrectly to multiple instances of the same calendar entity by @Zerosignal84
- [#223](https://github.com/alexpfau/calendar-card-pro/issues/223) - Incorrect Ukrainian translation by @merlin-zaraza
- [#224](https://github.com/alexpfau/calendar-card-pro/pull/224) - Fix Ukrainian translation by @merlin-zaraza

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.4...v3.0.5

---

# Calendar Card Pro v3.0.4

## 🐛 Bug Fixes

- **Fixed accent color backgrounds** - Resolved an issue where event background colors wouldn't display properly when using named colors like "blue" in the accent_color setting (RGB and hex values were unaffected)

## Related Issues

- [#219](https://github.com/alexpfau/calendar-card-pro/issues/219) - Shaded Accent Backgrounds fail after 3.0.x by @dml105

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.3...v3.0.4

---

# Calendar Card Pro v3.0.3

**Editor functionality and documentation fixes.** This release addresses issues with the visual editor and clarifies documentation for filtering options.

## 🐛 Bug Fixes

- **Fixed entity picker selection in editor** - Resolved an issue where in rare cases calendar and weather entity selections wouldn't register in the dropdown, preventing users from selecting or changing weather entities through the UI
- **Clarified blocklist/allowlist documentation** - Updated field descriptions to correctly specify pipe separator (|) rather than commas, matching the actual implementation

## Related Issues

- [#214](https://github.com/alexpfau/calendar-card-pro/issues/214) - Entity picker selection doesn't register in editor by @mhoogenbosch and @dives11
- [#216](https://github.com/alexpfau/calendar-card-pro/issues/216) - Incorrect blocklist/allowlist format documentation by @Kuddelsoft

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.2...v3.0.3

---

# Calendar Card Pro v3.0.2

**Configuration and editor bugfixes.** This release addresses issues with configuration handling discovered after the v3.0.0 release.

## 🐛 Bug Fixes

- **Fixed configuration filtering for weather settings** - Resolved UI synchronization issues by preserving the complete weather configuration structure even when values match defaults, preventing toggle switches and selectors from becoming out of sync
- **Fixed all-day event weather display** - Ensured daily weather forecasts are properly fetched and displayed for all-day events when weather position is set to "event"

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.1...v3.0.2

---

# Calendar Card Pro v3.0.1

**Configuration and editor bugfixes.** This release addresses issues with configuration handling discovered after the v3.0.0 release.

## 🐛 Bug Fixes

- **Fixed configuration bloat** by properly handling default values and empty strings
- **Fixed week numbers unexpectedly showing** when they shouldn't be enabled
- **Fixed UI-only fields** being incorrectly saved to user configurations
- **Improved code documentation** for special cases in the editor

## Related Issues

- [#209](https://github.com/alexpfau/calendar-card-pro/issues/209) - Week separator requires week number by @LiquidPT

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v3.0.0...v3.0.1

---

# Calendar Card Pro v3.0.0

**Visual configuration meets weather integration.** This major release transforms how you interact with and view calendar information, combining intuitive visual configuration with powerful weather forecasts—making your calendar both easier to set up and more contextually informative than ever before.

## 🎉 New Features

### ⚙️ Visual Configuration Editor

Calendar Card Pro now includes a comprehensive visual editor that makes configuration simple and intuitive! This highly-requested feature provides a rich, guided interface for customizing every aspect of your calendar card.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

- **Native Home Assistant Design** - Built with the same UI components as Home Assistant for perfect visual integration and consistent theming
- **Smart, Context-Aware Interface** - Options only appear when relevant, reducing clutter and simplifying configuration
- **Organized Configuration Sections** - Settings are grouped into logical, collapsible panels for easy navigation
- **Automatic Config Upgrader** - ✨ Detects deprecated settings and updates your configuration with one click
- **Specialized Input Helpers** - Advanced pickers for entities, icons, colors and other complex options
- **Mobile-Friendly Design** - Fully responsive interface that works on any device

> **Upgrading from previous versions?** When you first open the editor after updating, any deprecated parameters in your configuration will be automatically detected. Simply click the "Update config..." button that appears to instantly migrate to the latest parameter names!

> **Note:** The visual configuration editor is currently only available in English. The configured calendar card will still display in your selected language, but the editor interface itself is English-only at this time.

<details>
<summary>Editor Feature Details</summary>

- **Logical Organization** - Edit configuration in intuitive sections including Calendar Entities, Core Settings, Appearance & Layout, Date Display, Event Display, Weather Integration, and Interactions
- **Dynamic Fields** - Options for styling and advanced features only appear when their parent features are enabled
- **Smart Validation** - Type-specific input fields with validation ensure your configuration is always correct
- **Visual Helpers** - Specialized selectors for today indicators, calendar labels, and other visual elements
- **Enhanced Accessibility** - Inclusive design principles ensure the editor is usable by everyone
</details>

### 🌦️ Weather Integration

Calendar Card Pro now supports displaying weather forecasts directly alongside your calendar events! This powerful new integration allows you to see the expected weather conditions for each day or for specific events.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_weather.png" alt="Weather Integration" width="600"><br>

- **Dual Display Positions**: Show weather in the date column, event column, or both
- **Customizable Information**: Choose what weather data to display independently for each position
- **Per-Position Styling**: Control the appearance and content of weather data independently in each position
- **Automatic Forecast Matching**: Weather data automatically matches the correct day or event time
- **Home Assistant Integration**: Uses your existing weather entities and requires no additional setup

> **Pro Tip:** The new visual editor makes configuring weather integration simple! Just select your weather entity and customize display options through the intuitive Weather Integration panel.

<details>
<summary>Manual YAML Configuration Details</summary>

```yaml
type: custom:calendar-card-pro
# Basic weather configuration
weather:
  entity: weather.your_weather_entity
  position: date # Options: 'date', 'event', or 'both'
  date:
    show_conditions: true
    show_high_temp: true
    show_low_temp: false
  event:
    show_conditions: true
    show_temp: true
```

For full parameter documentation including styling options, see the [Weather Integration docs](https://calendar-card-pro.alexpfau.com/features/weather).

</details>

### 🕒 Improved Time Format Detection

Calendar Card Pro now correctly integrates with all Home Assistant time format settings:

- **Complete HA Integration** - Properly detects and respects all four Home Assistant time format options: 12-hour, 24-hour, language-based, and system-based settings
- **Smart Language Detection** - When HA is set to use language-based time format, the card intelligently determines the appropriate format based on the language
- **System Settings Support** - Properly detects system/browser time format preferences when HA is configured to use them
- **Override Capability** - Still allows explicit time format configuration via the card's `time_24h` setting, independent of Home Assistant settings

### New Languages

Extended language support to further regions, so that 29 languages are now supported:

- **Croatian Language** - Added complete Croatian translations for all calendar elements

### Parameter Updates

The following parameters have been renamed or removed in v3.0.0 (the editor will automatically detect and update these for you):

- `max_events_to_show` → `compact_events_to_show` (both global and entity-level)
- `vertical_line_color` → `accent_color`
- `horizontal_line_width` → `day_separator_width`
- `horizontal_line_color` → `day_separator_color`

## 🐛 Bug Fixes

### Today Indicator Emoji Detection

- **Improved Emoji Support** – Today indicator now reliably detects and displays all emoji characters, including complex and multi-codepoint emojis, by using Unicode property escapes for robust emoji detection.

### Entity-level Settings Consistency

- **Fixed Entity-level Location Display** - Entity-specific `show_location: true` now correctly overrides the global `show_location: false` setting, ensuring consistent behavior with other entity-level settings like `show_time`.

## Related Issues

This release addresses community-reported issues:

- [#107](https://github.com/alexpfau/calendar-card-pro/issues/107) - Weather Forecast Integration by @rothomas
- [#196](https://github.com/alexpfau/calendar-card-pro/issues/196) - Auto-detect 12/24h time format from HA by @tomofdarkness
- [#199](https://github.com/alexpfau/calendar-card-pro/pull/199) - Added Croatian language translation by @adamivangrgic

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.5...v3.0.0

---

# Calendar Card Pro v2.4.5

**Consistent calendar display in all scenarios.** This release fixes an important bug affecting the display of empty days when an API call returns no events.

## 🐛 Bug Fixes

### Completely Consistent Empty Days Display

- **Unified Empty Days Logic** - Removed separate rendering paths for different empty day scenarios, ensuring consistent behavior in all cases
- **Fixed Show Empty Days Setting** - Corrected the handling of `show_empty_days: true` when the calendar API returns zero events
- **Proper Days To Show Respect** - The card now correctly honors the `days_to_show` setting even when there are no calendar events
- **Single Code Path** - Simplified the code by using a single, unified approach to empty days generation in all scenarios

## 📖 Documentation Improvements

### New Card-Mod Examples

- **Time Next to Event Title** - Added documentation for displaying time in the same row as event titles using card-mod, keeping location on its own row below:

```yaml
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

## Related Issues

This release addresses community-reported issues:

- [#37](https://github.com/alexpfau/calendar-card-pro/issues/37) - Added documentation for showing time in the same row as event titles using card-mod

## How Has This Been Tested

Testing has been conducted across:

- Empty calendar scenarios where API returns zero events
- Multiple `days_to_show` values (2, 3, 5, 7)
- Both `show_empty_days: true` and `show_empty_days: false` settings
- Different combinations of compact and expanded modes
- Various calendar entity configurations
- Card-mod customization examples

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.4...v2.4.5

---

# Calendar Card Pro v2.4.4

**More consistent empty days behavior.** This release fixes an important bug affecting the display of empty days, ensuring the calendar shows exactly what you expect in all configurations.

## 🐛 Bug Fixes

### Improved Empty Days Display

- **Fixed Empty Days Behavior** - Resolved an issue where empty days weren't consistently displayed when `show_empty_days: true` was configured, particularly at the end of the date range
- **Proper Mode Handling** - Fixed how empty days interact with compact mode settings, correctly handling both `compact_days_to_show` and `compact_events_to_show` parameters
- **Edge Case Support** - Better handling of date ranges with sparse events, ensuring consistent behavior regardless of event distribution
- **Parameter Validation** - Ensures `compact_days_to_show` never exceeds `days_to_show` to prevent showing empty days beyond the API fetch range

## Related Issues

This release addresses a community-reported issue:

- [#189](https://github.com/alexpfau/calendar-card-pro/issues/189) - Fixed bug where empty days weren't shown at the end of the date range when `show_empty_days: true` was configured

## How Has This Been Tested

Testing has been conducted across:

- Multiple calendar configurations with various `days_to_show` ranges
- Scenarios with events in different distribution patterns (beginning, middle, or end of range)
- Different combinations of compact mode parameters
- Various empty days settings
- Configurations where `compact_days_to_show` is greater than `days_to_show`

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.3...v2.4.4

---

# Calendar Card Pro v2.4.3

**Bug fixes for edge cases.** This release addresses several critical edge case bugs around the display of week separators and empty days, ensuring the calendar always behaves predictably in all configurations.

## 🐛 Bug Fixes

### Fixed Week Separator Display

- **Week/Month Separator Precedence** - Corrected a bug where week separators weren't displaying when month boundaries coincided with week boundaries and the `month_separator_width` was set to '0px'
- **Proper Visual Hierarchy** - Week separators now appear correctly when they should take precedence over invisible month separators

### Improved Empty Days Handling

- **Fixed Days_to_Show Behavior** - Resolved an issue where the calendar would incorrectly skip empty days and show events from future days instead of properly displaying "No events" messages
- **Consistent Empty State Display** - Empty state message now consistently shows when there are no events within the configured time range

## Related Issues

This release addresses community-reported issues:

- [#160](https://github.com/alexpfau/calendar-card-pro/issues/160) - Fixed bug where the calendar would show future days' events instead of properly respecting the `days_to_show` parameter
- [#175](https://github.com/alexpfau/calendar-card-pro/issues/175) - Fixed week separators not showing when they coincide with month boundaries

## How Has This Been Tested

Testing has been conducted across:

- Multiple calendar configurations with various `days_to_show` and `start_date` settings
- Scenarios with only past events today but events tomorrow
- Calendars with month/week boundaries falling on the same day
- Various combinations of separator width settings

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.2...v2.4.3

---

# Calendar Card Pro v2.4.2

**More accessible and more reliable.** This release brings important bug fixes and language enhancements to provide a more robust and internationally accessible calendar experience.

→→→ Please see the [🆕 What's New](https://calendar-card-pro.alexpfau.com/guide/whats-new) page in the documentation for an overview of v2.4 features with links to their detailed documentation. ←←←

## 🎉 New Features

### New Languages

Extended language support to further regions, so that 28 languages are now supported:

- **Catalan Language** - Added complete Catalan translations for all calendar elements
- **Romanian Language** - Added complete Romanian translations for all calendar elements

## 🐛 Bug Fixes

### Translation Enhancements

Fixed issue with translations in date column not respecting HA system language.

### Event Display Corrections

Fixed visual bugs that affected event display:

- **Today's All-Day Event Display** - Corrected a bug where today's all-day events were incorrectly shown grayed out as if they were past events
- **Week Separator Consistency** - Ensured week separators are consistently displayed for all weeks, even when events are missing on Sunday and Monday

### Documentation Updates

- **Configuration Variables Table** - Fixed table formatting in ReadMe Configuration Variables section
- **Consistent Parameter Naming** - Updated documentation with consistent parameter naming throughout
- **Enhanced Card_mod Examples** - Improved card_mod examples for transparent backgrounds
- **Contribution Instructions** - Updated contribution guidelines to include additional files

## Related Issues

This release addresses several community-reported issues:

- [#169](https://github.com/alexpfau/calendar-card-pro/issues/169) - Fixed translation issues in date column (reported by @medapayne)
- [#174](https://github.com/alexpfau/calendar-card-pro/issues/174) - Fixed today's all-day events incorrectly appearing grayed out (reported by @jonicunha)
- [#175](https://github.com/alexpfau/calendar-card-pro/issues/175) - Fixed inconsistent display of week separators (reported by @LiquidPT)
- [#180](https://github.com/alexpfau/calendar-card-pro/issues/180) - Improved card_mod examples for transparent backgrounds (reported by @Victorsoeby)
- [#168](https://github.com/alexpfau/calendar-card-pro/pull/168) - Fixed Configuration Variables table formatting (contributed by @forsethc)
- [#178](https://github.com/alexpfau/calendar-card-pro/issues/178) - Added Romanian language support (contributed by @chr02ha)
- [#181](https://github.com/alexpfau/calendar-card-pro/issues/181) - Added Catalan language support (contributed by @rserentill)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.1...v2.4.2

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.4.1

**Edge case handling and visual refinement.** This update addresses two specific user-reported issues to ensure your calendar card displays correctly in all scenarios.

→→→ All bug fixes are fully compatible with existing configurations, requiring no changes to your cards. ←←←

## 🐛 Bug Fixes

### Fixed Empty Day Display Issue

Resolved a bug where days with no events were being skipped if:

- A specific `start_date` was configured
- That date had no events
- The following day contained at least one event

Now the calendar correctly shows "No upcoming events" for the configured start date, rather than skipping ahead to the next day with events.

### Improved Scrollbar Behavior

Enhanced the scrollbar handling to:

- Show vertical scrollbars only when hovering and content exceeds the container height
- Never show horizontal scrollbars regardless of content width
- Maintain consistent behavior across all major browsers (Chrome, Firefox, Safari, Edge)

## Related Issues

This release addresses the following user-reported issues:

- [#160](https://github.com/alexpfau/calendar-card-pro/issues/160) - Fixed bug where empty day was skipped when start_date is static and the following day has events
- [#162](https://github.com/alexpfau/calendar-card-pro/issues/162) - Fixed horizontal scrollbar appearing when hovering over calendar

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.4.0...v2.4.1

Thank you to everyone who contributed bug reports that made this release possible!

---

# Calendar Card Pro v2.4.0

**Visually intelligent and precisely configured.** This release brings visual highlights for the current day, progress tracking for running events, and enhanced compact mode controls - making Calendar Card Pro more visually informative and customizable than ever.

→→→ Please see the [🆕 What's New](https://calendar-card-pro.alexpfau.com/guide/whats-new) page in the documentation for an overview of v2.4 features with links to their detailed documentation. ←←←

## 🎉 New Features

### Today Indicator

Visually highlight the current day in your calendar with customizable indicators:

```yaml
# Enable and choose indicator type
today_indicator: true     # Simple dot indicator
today_indicator: pulse    # Animated pulsing dot
today_indicator: glow     # Glowing dot effect
today_indicator: mdi:star # Custom Material Design icon
today_indicator: 🎯       # Emoji character
today_indicator: /local/custom-indicator.png # Custom image

# Position the indicator precisely
today_indicator_position: "15% 50%" # Left-center (default)
today_indicator_position: "85% 15%" # Top-right corner
```

- **Multiple Indicator Types** - Choose from dots, animations, icons, emojis, or custom images
- **Precise Positioning** - Control exact placement with CSS-like position syntax
- **Perfect Centering** - Transform-based alignment ensures proper centering
- **Theme Integration** - Indicator color follows your Home Assistant theme

### Today's Date Styling

Customize the appearance of today's date with dedicated color options:

```yaml
# Style today's date components individually
today_weekday_color: '#03a9f4' # Color for today's weekday name
today_day_color: '#03a9f4' # Color for today's day number
today_month_color: '#03a9f4' # Color for today's month name
```

- **Component-Level Control** - Independently style the weekday name, day number, and month
- **Smart Inheritance** - Undefined values automatically inherit from base or weekend styling
- **Priority System** - Today's styling takes precedence when today falls on a weekend
- **Enhanced Visual Cues** - Makes the current day immediately identifiable at a glance

### Progress Bars for Running Events

Show visual progress indicators for events that are currently in progress:

```yaml
# Enable progress bars for running events
show_progress_bar: true
progress_bar_color: '#03a9f4'
progress_bar_height: '10px'
progress_bar_width: '60px'
```

- **Real-time Updates** - Progress bars show the current completion percentage of events
- **Customizable Appearance** - Control color, height, and width to match your theme
- **Automatic Calculation** - Intelligently determines how much of the event has completed
- **Visual Timeline** - Quickly see how far along your current activities are

### Split Multi-Day Events

Display multi-day events on each day they cover for better visibility:

```yaml
# Show multi-day events on every day they cover
split_multiday_events: true

# Control splitting on a per-calendar basis
entities:
  - entity: calendar.personal
    split_multiday_events: true
  - entity: calendar.work
    split_multiday_events: false
```

- **Improved Conflict Detection** - Easily see when multi-day events overlap with other activities
- **Complete Daily View** - See all active events for any given day at a glance
- **Consistent Formatting** - Maintains proper time and styling information for each segment
- **Calendar-Specific Control** - Enable or disable splitting per calendar entity

### Enhanced Compact Mode Controls

Gain precise control over your compact calendar view:

```yaml
# Display fewer days in compact mode
compact_days_to_show: 2 # Show just 2 days in compact mode
days_to_show: 7 # Show full 7 days when expanded

# Limit events in compact mode
compact_events_to_show: 5 # Show only 5 events in compact mode

# Ensure complete days are shown
compact_events_complete_days: true # Never show partial days
```

- **Optimized Space Usage** - Show fewer days in compact mode while keeping more days available when expanded
- **Clearer Parameter Naming** - More intuitive configuration with `compact_events_to_show`
- **Complete Days Option** - Prevent confusion by showing all events from partially visible days
- **Backward Compatible** - Legacy `max_events_to_show` parameter still supported

## Related Issues

This release addresses the following feature requests and bug reports:

- [#100](https://github.com/alexpfau/calendar-card-pro/issues/100) - Show progress bar for running events (requested by @vichjiri)
- [#93](https://github.com/alexpfau/calendar-card-pro/issues/93) - Limit to number of days instead of events (requested by @mr-light-show)
- [#81](https://github.com/alexpfau/calendar-card-pro/issues/81) - Soft events limit (requested by @noxhirsch)
- [#140](https://github.com/alexpfau/calendar-card-pro/issues/140) - Show "Today" for events on the current day (requested by @martinsheldon)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.3.1...v2.4.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.3.1

**Polish and refinement.** This minor update addresses a visual inconsistency with scrollbars and improves Slovak language support, ensuring your calendar cards look cleaner and function more smoothly.

→→→ All bug fixes and improvements are fully compatible with existing configurations, requiring no changes to your cards. ←←←

## 🐛 Bug Fixes

### Fixed Scrollbar Visibility Issue

Fixed an issue where scrollbars were always visible rather than appearing only when hovering.

### Improved Slovak Translation

Enhanced Slovak language support with more accurate translations.

## Related Issues

This release addresses the following issues:

- [#146](https://github.com/alexpfau/calendar-card-pro/issues/146) - Fixed scrollbar always showing instead of only on hover in both Chrome and Firefox (by @martinsheldon)
- [#147](https://github.com/alexpfau/calendar-card-pro/pull/147) - Improved Slovak translation (contributed by @jose1711)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.3.0...v2.3.1

Thank you to everyone who contributed bug reports and translation improvements that made this release possible!

---

# Calendar Card Pro v2.3.0

**Time-aware and visually enhanced.** This release brings dynamic countdown displays, weekend styling, and flexible date ranges that adapt to your needs, making Calendar Card Pro more informative and visually distinct than ever before.

→→→ Please see the [🆕 What's New](https://calendar-card-pro.alexpfau.com/guide/whats-new) page in the documentation for an overview of v2.3 features with links to their detailed documentation. ←←←

## 🎉 New Features

### Countdown Display

Show how much time remains until an event starts with the new `show_countdown` option:

```yaml
# Enable countdown display for upcoming events
show_countdown: true
```

- **Automatic Time Units** - Shows days remaining for future events, hours for same-day events
- **Multi-Language Support** - Countdown text automatically uses your configured language
- **Subtle Design** - Unobtrusive display that complements the existing time information
- **Enhanced Awareness** - Quickly see which events are coming up soon

### Weekend Day Styling

Make weekend days visually distinct with dedicated color options:

```yaml
# Style weekend days differently
weekend_weekday_color: '#E67C73' # Color for Sat/Sun weekday names
weekend_day_color: '#E67C73' # Color for weekend day numbers
weekend_month_color: '#E67C73' # Color for month names on weekends
```

- **Enhanced Visual Organization** - Weekend days stand out from weekdays
- **Complete Control** - Separately style weekday names, day numbers, and month names
- **Theme Integration** - Works with Home Assistant theme variables and custom colors
- **Improved Readability** - Easier to distinguish between work days and weekend days

### Dynamic Start Date with Relative Offsets

Define "floating" start dates relative to the current day:

```yaml
# Start date examples:
start_date: "today+7"  # Always show events starting 7 days from today
start_date: "+3"       # Shorthand for today+3
start_date: "today-2"  # Show events starting from 2 days ago
start_date: "-1"       # Shorthand for today-1 (yesterday)
```

- **Automatic Adjustment** - Date range automatically updates as days pass
- **Shorthand Notation** - Simplified syntax with + and - operators
- **Fixed or Dynamic** - Use absolute dates for fixed ranges or relative offsets for floating windows
- **Flexible Planning** - Perfect for showing "next two weeks" or "current week plus 3 days" views

### Automatic Hyphenation

Long words (especially compound words in languages like German) now wrap more elegantly with automatic hyphenation.

### Enhanced Cache Management

Improved caching mechanism by adding version-aware caching to automatically invalidate incompatible cache data after updates.

## 🐛 Bug Fixes

- **Fixed All-Day Event Sorting** - All-day events are now properly sorted by calendar entity order first, then alphabetically
- **Improved Multi-Day Event Handling** - Multi-day events that begin before a custom start date now display consistently
- **Cache Invalidation After Updates** - Prevents blank cards after HACS updates by adding version numbers to cache keys

## Related Issues

This release addresses the following feature requests and bug reports:

- [#67](https://github.com/alexpfau/calendar-card-pro/issues/67) - Days remaining countdown (requested by @jelmerwouters-topicus)
- [#76](https://github.com/alexpfau/calendar-card-pro/issues/76) - Time until the event countdown (requested by @pol409887)
- [#98](https://github.com/alexpfau/calendar-card-pro/issues/98) - Show weekends in different color (requested by @yornola)
- [#103](https://github.com/alexpfau/calendar-card-pro/issues/103) - End date customization (requested by @tkabt06)
- [#105](https://github.com/alexpfau/calendar-card-pro/issues/105) - Start days ahead option (requested by @pol409887)
- [#133](https://github.com/alexpfau/calendar-card-pro/issues/133) - Add hyphens:auto (requested by @sevorl)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.2.1...v2.3.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.2.1

**Stability and polish.** This release focuses on fixing issues with advanced filtering techniques introduced in v2.2.0, enhancing event organization, and adding more language support while maintaining full compatibility with existing configurations.

→→→ All bug fixes and improvements are fully compatible with existing configurations, requiring no changes to your cards. ←←←

## 🎉 New Features

### Enhanced All-Day Event Organization

All-day events occurring on the same day are now automatically sorted alphabetically:

```yaml
# Events like these will now be sorted alphabetically:
# "1. Breakfast"
# "2. Lunch"
# "3. Dinner"
```

- **Improved Readability** - Events with similar importance now appear in predictable order
- **Perfect for Task Lists** - Ideal for meal plans, to-do lists, and other numbered items
- **Automatic Organization** - No configuration needed - just works

### Improved Time String Formatting

All event time strings now automatically have their first letter capitalized:

- **Consistent Typography** - Every time string begins with a capital letter
- **Enhanced Readability** - More professional appearance across all calendar events
- **Language-Aware** - Works correctly with all supported languages

### New Language Support

Added support for two new languages:

- **Thai** - Added complete Thai language support
- **Slovak** - Added complete Slovak language support

This brings the total to 26 supported languages in Calendar Card Pro!

## 🐛 Bug Fixes

### Fixed Advanced Filtering Issues

Fixed a critical issue with the advanced filtering features introduced in v2.2.0:

```yaml
entities:
  - entity: calendar.family
    allowlist: 'shopping|grocery'
    label: '🛒'
    accent_color: '#1e88e5'
  - entity: calendar.family
    allowlist: 'birthday|anniversary'
    label: '🎉'
    accent_color: '#e91e63'
```

- **Proper Style Application** - Fixed styles and labels not being correctly applied when filtering the same calendar entity multiple times
- **Configuration Persistence** - The card now properly maintains entity configuration throughout the event processing pipeline
- **Styling Consistency** - Each filtered event now correctly receives its intended styling, labels and accent colors

### Improved Past Events Visibility

Fixed dimming effects for past events when show_past_events is enabled:

```yaml
show_past_events: true
```

- **Visual Distinction** - Past events now properly display with 60% opacity for better visual hierarchy
- **Consistent Styling** - Applied to all parts of the event (title, time, and location)
- **Restored Functionality** - Brings back the visual dimming that was present in previous versions

## Related Issues

This release addresses the following issues:

- [#125](https://github.com/alexpfau/calendar-card-pro/issues/125) - Fixed filtering and styling for multiple entity configurations of the same calendar (reported by @dg9bew)
- [#129](https://github.com/alexpfau/calendar-card-pro/issues/129) - Fixed past events not being dimmed when show_past_events is enabled (reported by @andyblac)
- [#119](https://github.com/alexpfau/calendar-card-pro/issues/119) - Added alphabetical sorting for all-day events that occur on the same day (requested by @joos81)
- [#121](https://github.com/alexpfau/calendar-card-pro/issues/121) - Capitalized first letter of event time strings (suggested by @PrinterElf)
- [#122](https://github.com/alexpfau/calendar-card-pro/issues/122), [#123](https://github.com/alexpfau/calendar-card-pro/issues/123) - Added Thai language support (contributed by @Aekung)
- [#127](https://github.com/alexpfau/calendar-card-pro/issues/127), [#128](https://github.com/alexpfau/calendar-card-pro/issues/128) - Added Slovak language support (contributed by @delneto)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.2.0...v2.2.1

Thank you to everyone who contributed bug reports, feature requests, translations, and suggestions that made this release possible!

---

# Calendar Card Pro v2.2.0

**Calendar filtering and customization, redefined.** This release focuses on giving you precise control over which events appear on your dashboard and how they're displayed, with powerful filtering capabilities and enhanced visual options.

→→→ Please see the [🆕 What's New](https://calendar-card-pro.alexpfau.com/guide/whats-new) page in the documentation for an overview of v2.2 features with links to their detailed documentation. ←←←

## 🎉 New Features

### Advanced Event Filtering

Calendar Card Pro now provides powerful filtering capabilities with regex-based `blocklist` and `allowlist` patterns for each calendar entity:

```yaml
# Exclude specific events by pattern:
entities:
  - entity: calendar.work
    blocklist: "Private|Conference" # Hide private meetings and conferences

# Only show specific events:
entities:
  - entity: calendar.family
    allowlist: "Birthday|Anniversary" # Only show birthdays and anniversaries
```

- **Per-Entity Filtering** - Each calendar can have its own filter rules
- **Regular Expression Support** - Use pattern matching for flexible event filtering
- **Precise Control** - Include or exclude events based on title text patterns
- **Priority System** - When both filters are specified, allowlist takes precedence

### Filter Duplicate Events

Automatically detect and remove redundant events that appear in multiple calendars:

```yaml
entities:
  - calendar.personal # Events from this calendar are prioritized
  - calendar.family # Duplicates from this calendar will be hidden
filter_duplicates: true
```

- **Smart Prioritization** - When duplicates are found, keeps events from calendars listed first
- **Complete Matching** - Compares event title, times, and location for accurate detection
- **Better Organization** - Creates a cleaner view when subscribing to multiple calendars with overlapping events

### Enhanced Calendar Labels

Calendar labels now support multiple formats for better visual customization:

```yaml
entities:
  - entity: calendar.work
    label: '💻' # Original emoji style
  - entity: calendar.family
    label: 'mdi:account-group' # Material Design Icon
  - entity: calendar.vacation
    label: '/local/icons/beach.png' # Custom image
```

- **Material Design Icons** - Use `mdi:icon-name` to display any Material Design icon
- **Custom Images** - Reference images from your `/local/` directory
- **Emoji & Text** - Original label functionality still supported
- **Automatic Format Detection** - The card detects and renders the appropriate format

### Smart Country Filtering

Enhanced control over country names in location displays with three operating modes:

```yaml
# Option 1: Specify exactly which countries to remove
remove_location_country: "USA|United States|Canada"

# Option 2: Use built-in country detection (previous behavior)
remove_location_country: true

# Option 3: Keep all country information (new default)
remove_location_country: false
```

- **Extended Parameter** - Now accepts custom country name patterns in addition to boolean values
- **Backward Compatible** - Still supports the previous `true`/`false` options
- **Regular Expression Support** - Match multiple country variations with one pattern
- **Enhanced Flexibility** - Keep international locations intact while simplifying domestic addresses
- **⚠ Default Changed** - Now defaults to `false` for more predictable global behavior

### Customizable Empty Day Styling

Control how days without events appear in your calendar:

```yaml
empty_day_color: '#ff5722' # Use custom color
```

- **Custom Text Color** - Set the perfect color for "No events" messages
- **Theme Integration** - Works with Home Assistant theme variables
- **Enhanced Accessibility** - Better control over contrast ratios

## 🐛 Bug Fixes

- **Fixed Multi-Day Event Time Display** - Multi-day events now correctly show start time when viewing before or on the event's start date
- **Improved Country Detection** - Enhanced location parsing for more reliable country name removal

## Related Issues

This release addresses the following feature requests and bug reports:

- [#32](https://github.com/alexpfau/calendar-card-pro/issues/32) - Event filtering capabilities (requested by @hlymn231)
- [#110](https://github.com/alexpfau/calendar-card-pro/issues/110) - Event filtering capabilities (requested by @tkabt06)
- [#104](https://github.com/alexpfau/calendar-card-pro/issues/104) - Labels for different event types (requested by @AlexanderTurnowsky)
- [#33](https://github.com/alexpfau/calendar-card-pro/issues/33) - Filter duplicate events (requested by @Bastian007)
- [#118](https://github.com/alexpfau/calendar-card-pro/issues/118) - Support for images in labels (requested by @Raznor09)
- [#116](https://github.com/alexpfau/calendar-card-pro/issues/116) - Fixed multi-day event time display and country detection (reported by @roblombardo)

Additional contributions by @netsoft-ruidias who provided proposals and implementation suggestions for filtering features.

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.1.2...v2.2.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.1.2

This release adds a new layout control feature and fixes several scrollbar-related issues to improve the user experience across different browsers and operating systems.

## 🚀 New Features

### Fixed Height Control

- **Added new `height` parameter**: Complements the existing `max_height` setting to provide greater flexibility in card layout
- **Distinct card height behaviors**:
  - `height` sets an exact size for the card independent of content amount
  - `max_height` allows the card to grow up to a specified limit

## 🐛 Bug Fixes

### Scrollbar and Overflow Improvements

- **Fixed week number pills being cut off**: Resolved an issue where week number pills could be partially hidden when using scrollable cards
- **Improved scrollbar consistency**: Scrollbars now consistently hide by default and only show on hover across all browsers
- **Fixed Chrome/Windows overflow issue**: Prevented unwanted scrollbars from appearing in Chrome on Windows when content doesn't actually overflow
- **Added absorption space**: Added 1px padding to fix edge cases where fractional pixel calculations would cause unnecessary scrolling

## 👤 Contributors

- @eyalgal - Feature request for hiding scrollbars (#112)
- @firstcolle - Feature request for card fixed dimensions (#62)

_This release maintains full compatibility with all existing configurations._

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.1.1...v2.1.2

---

# Calendar Card Pro v2.1.1

This maintenance release addresses a few issues related to week numbers display and styling, focusing on edge cases that were discovered after the initial week numbers feature was introduced in v2.1.0.

## 🐛 Bug Fixes

### Week Numbers Display

- **Fixed week number display with specific configurations**: Week numbers now properly appear when using `show_empty_days: false` together with `first_day_of_week: sunday`
- **Improved week boundary detection**: Enhanced algorithm ensures consistent detection even when some days are hidden
- **Fixed alignment issues**: Week number pills are now properly centered within their columns

### Visual Improvements

- **Removed "W" prefix from week numbers**: Creates cleaner appearance and avoids potential translation issues
- **Changed default week number font size**: Now set to 12px (previously 14px) for better visual balance
- **Enhanced week number pill styling**: Fixed proportional scaling with different font sizes to maintain pill shape

## 👤 Contributors

- @ValMarDav - Reported the week number display issue

_This release maintains full compatibility with all existing configurations._

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.1.0...v2.1.1

---

# Calendar Card Pro v2.1.0

This release introduces powerful new visual organization features and enhanced calendar controls, making Calendar Card Pro even more flexible for all your calendar management needs.

→→→ Please see the [🆕 What's New in v2.1](https://calendar-card-pro.alexpfau.com/guide/whats-new#v21) page in the documentation for detailed examples of all new features. ←←←

## 🎉 New Features

### Week Numbers & Visual Separators

Calendar Card Pro now provides a sophisticated system for displaying week numbers and visual separators that enhances your calendar's organization and readability.

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers" width="600"><br>

**Key Capabilities**:

- **Week Number Indicators** - Pill-shaped badges showing the current week number (ISO or simple numbering)
- **Day, Week & Month Separators** - Distinct horizontal lines to visually organize your events
- **Visual Hierarchy** - Intelligent precedence system when multiple separators could appear
- **First Day of Week Independence** - Week numbering system works properly regardless of first day setting

### Per-Calendar Event Limits

You can now control how many events are shown from each calendar independently, allowing you to:

- **Prioritize important calendars**: Give more space to your most important calendars
- **Prevent one calendar from overwhelming the view**: Ideal for busy calendars like school schedules
- **Control information density**: Show all family events but only the next work meeting

## Related Issues

This release addresses the following feature requests:

- [#17](https://github.com/alexpfau/calendar-card-pro/issues/17) - Week numbers (requested by @akentner)
- [#72](https://github.com/alexpfau/calendar-card-pro/issues/72) - Configurable separators between weeks and months (requested by @teddybaerd)
- [#73](https://github.com/alexpfau/calendar-card-pro/issues/73) - Different number of events for each calendar (requested by @Jales2)

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v2.0.1...v2.1.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v2.0.1

This maintenance release addresses several issues reported by users after the v2.0.0 release, improving preview functionality, empty days display, scrollbar behavior, and Dutch translations.

## 🐛 Bug Fixes

### Card Preview & Browser Integration

- **Fixed card preview in Add to Dashboard dialog**: Calendar entities are now properly detected and displayed in the card selector preview (#97)
- **Improved scrollbar behavior**: Scrollbars now only appear when `max_height` is explicitly set, avoiding unwanted scrollbars in some browsers

### Calendar Display Enhancements

- **Fixed `start_date` with `show_empty_days`**: Calendar now properly honors the configured start date when showing empty days (#102)
- **Improved empty days generation**: Empty placeholders now consistently use the correct reference date

### Language Improvements

- **Updated Dutch translation**: Improved grammar with proper capitalization for weekday and month names (#99)

## 👤 Contributors

- @Misiu - Reported the scrollbar behavior issue (#97)
- @tkabt06 - Reported and tested the start_date with empty days issue (#102)
- @mhoogenbosch - Provided the Dutch translation improvements (#99)

---

# Calendar Card Pro v2.0.0

This major release completely reimagines Calendar Card Pro with a new architecture, enhanced performance, and numerous new features for customization. Calendar Card Pro v2 brings significant improvements to theme compatibility, visual styling options, and smart data management.

→→→ Please see the [🆕 What's New in v2](https://calendar-card-pro.alexpfau.com/guide/whats-new#v20) page in the documentation for detailed examples of all new features. ←←←

## 🚀 Major Refactoring

### Enhanced Performance

- **Complete Rewrite**: Entirely new rendering engine for better performance
- **Smart Caching**: Intelligent caching reduces API calls and improves load times
- **Progressive Rendering**: Efficiently renders events in small batches to maintain responsiveness
- **Stable DOM Structure**: Consistent structure for better compatibility with other components

### Improved Theme & Card-Mod Compatibility

- **Native Theme Support**: Properly integrates with all Home Assistant themes
- **Standard Card Structure**: Uses standard ha-card structure making card-mod work exactly like other cards

## 🎉 New Features

### Custom Styling Per Calendar

- **Accent Colors**: Assign unique colors to the vertical line for each calendar entity (#19 and #92 by @LiquidPT)
- **Background Colors**: Enable semi-transparent backgrounds matching the accent color
- **Smart Rounded Corners**: Events use rounded corners derived from your theme's card radius
- **Visual Hierarchy**: Instantly distinguish events from different calendars at a glance

  <img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_3_custom_styling.png" alt="Custom Styling" width="600"><br>

### Calendar Labels

- **Custom Calendar Identifiers**: Add emoji or text before event titles (#65, #83, #91)
- **Visual Distinction**: Labels appear before event titles with proper spacing
- **Improved Accessibility**: Distinguish calendars beyond just color coding

### Advanced Display Controls

- **Per-Calendar Settings**: Control which information appears for specific calendars
- **Flexible Configuration**: Show time or location information based on calendar type
- **Simplified Display**: Hide time information for all-day events (#7)

### Custom Start Date

- **Date Selection**: View calendars from any date, not just today (#25, #77)
- **Future Planning**: Create seasonal or special-purpose calendars
- **Flexible Format**: Supports both YYYY-MM-DD and ISO date formats

### Empty Day Display

- **Consistent Layout**: Always display all configured days, even when they have no events (#40)
- **Visual Placeholders**: Clear indication of empty days with checkmark emoji
- **Improved Organization**: Easily see when days have no scheduled events

### Enhanced Past Event Display

- **Visual Distinction**: Past events appear with reduced opacity (60%)
- **Improved All-Day Handling**: Correctly handles multi-day all-day events
- **Smart Detection**: All-day events active today are never marked as "past"

### Fixed Height with Scrolling

- **Size Control**: Limit card height while preserving all events (#62, #51)
- **Automatic Scrolling**: Content scrolls when it exceeds defined height
- **Consistent Layout**: Maintain dashboard aesthetics regardless of event count

### Smarter Caching

- **Navigation-Aware Caching**: Option to preserve cache when switching dashboard views
- **Reduced API Calls**: Minimizes unnecessary API requests
- **Mobile-Friendly**: Better performance and battery life for mobile users

### Enhanced Spacing Controls

- **Fine-Tuned Layout**: Control vertical padding within each event (#11)
- **Day Spacing**: Adjust spacing between different calendar day rows
- **Consistent Naming**: More intuitive parameter names (row_spacing → day_spacing)

### Today's Event Styling with Card-Mod

- **Custom Today Highlighting**: Easily style today's events differently with card-mod (#20)
- **Animation Support**: Create subtle animations for today's events
- **Visual Priority**: Make current day events stand out

## 🛠 Breaking Changes

1. **Parameter Renaming**:
   - `row_spacing` is now `day_spacing` (for clarity)

2. **Split Parameters**:
   - `time_location_icon_size` has been split into separate parameters:
     ```yaml
     time_icon_size: '14px'
     location_icon_size: '14px'
     ```

3. **Card DOM Structure**: Internal structure updates may affect existing card-mod customizations

## 📚 Documentation Updates

- **Reorganized README**: Clearer feature explanations with examples
- **Enhanced Configuration Guide**: Comprehensive parameter documentation
- **New Examples**: Additional configuration examples with screenshots
- **Architecture Documentation**: New developer documentation explaining internal design

## ⚙️ Technical Improvements

- **Modular Architecture**: Completely restructured codebase for maintainability
- **Type Safety**: Enhanced TypeScript interfaces throughout the codebase
- **Styling System**: Improved CSS variable integration with Home Assistant themes
- **Event Processing**: Better handling of multi-day and all-day events
- **Error Handling**: Graceful degradation when calendar data is unavailable

## 🐛 Bug Fixes

- **Multiple Lit Versions**: Fixed issues with multiple versions of Lit being loaded (#74)
- **Title Display**: Card title now always displays even with no events (#70)
- **All-Day Events**: Improved detection and display of all-day events
- **Theme Compatibility**: Fixed inconsistencies with various Home Assistant themes
- **Date Alignment**: Fixed date column alignment issues (#41)

## New Contributors

- @LiquidPT made their first contribution in https://github.com/alexpfau/calendar-card-pro/pull/92

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v1.2.3...v2.0.0

Thank you to everyone who contributed feature requests and bug reports that made this release possible!

---

# Calendar Card Pro v1.2.3

This release enhances several language translations and improves date formatting logic, bringing the total number of supported languages to 24.

## 🌎 Language Enhancements

### Norwegian Language

- **Replaced generic Norwegian (no) with proper language variants**:
  - Added Norwegian Bokmål (nb) (#86)
  - Added Norwegian Nynorsk (nn) (#86)

### Grammatical Improvements

- **Improved Russian translations**: Enhanced grammatical cases for better readability (#87)
- **Improved Ukrainian translations**: Fixed grammatical structure (#88)
- **Improved Polish translations**: Corrected grammar issues (#89)

### Date Format Improvements

- **Updated Hungarian language**:
  - Fixed translation issues (#10)
  - Improved date format logic to use month-day format similar to English

## 📚 Documentation

- Updated README to reflect both Norwegian language variants

## 👤 Contributors

- @grotteru - Improved Norwegian language support
- @jakksoft - Enhanced Russian, Ukrainian, and Polish translations
- @suxlala - Hungarian language fixes
- @alexpfau - Date format improvements and code organization

## 🔭 On the Horizon

A major v2 re-architecture update is in active development and will be released soon. This upcoming version will significantly enhance compatibility with card-mod, provide better integration with custom Home Assistant themes, and establish a solid foundation for implementing new features going forward. Stay tuned for this substantial update!

---

# Calendar Card Pro v1.2.2

This release significantly expands language support by adding five new languages and updating one existing translation, bringing the total supported languages to 23.

## 🌎 Language Enhancements

### New Languages

- **Added Norwegian (NO)**: Complete translation support (#82)
- **Added Chinese Simplified (zh-CN)**: Full translation for Mandarin Chinese users (#80)
- **Added Chinese Traditional (zh-TW)**: Support for Traditional Chinese characters (#79)
- **Added Slovenian (sl)**: Complete translation for Slovenian users (#71)
- **Added Greek (el)**: Full Greek language support (#23)

### Updated Languages

- **Improved Vietnamese (vi)**: Enhanced and corrected Vietnamese translations (#78)

## 📚 Documentation

- Updated README to reflect the expanded language support
- Added all new languages to the supported languages list

## 👤 Contributors

- @grotteru - Added Norwegian translation
- @PATCoder97 - Added Chinese Simplified and Traditional translations, improved Vietnamese translations
- @AdmiralStipe - Added Slovenian translation
- @mefistofelis - Added Greek translation

---

# Calendar Card Pro v1.2.1

This maintenance release addresses two important issues: fixing the event limit functionality and improving Icelandic translations.

## 🐛 Bug Fixes

### Event Limit Functionality

- **Fixed `max_events_to_show` behavior**: Events are now properly limited to the configured maximum number across all days (#64)
- **Improved event filtering logic**: Events are limited at the individual event level rather than entire days

### Language Improvements

- **Updated Icelandic translation**: Fixed issues in Icelandic language support (#68)

## 👤 Contributors

- @bvweerd - Reported the `max_events_to_show` issue
- @russi76 - Provided the Icelandic translation fix

---

# Calendar Card Pro v1.2.0

This release significantly expands Calendar Card Pro with comprehensive multi-language support (now supporting 18 languages), improves date formatting across different language conventions, and fixes important bugs.

## 🎉 New Features

### Expanded Language Support

- **18 languages supported**: Calendar Card Pro now includes translations for 16 languages beyond the original English and German
- **Smart date formatting** by language convention:
  - `day-dot-month` format for German (e.g., "17. Mar")
  - `month-day` format for English (e.g., "Mar 17")
  - `day-month` format for most other languages (e.g., "17 Mar")

## 🐛 Bug Fixes

### Time Format Display Issue

- **Fixed 12/24-hour format**: The `time_24h: false` setting now correctly applies to multi-day events (#28)
- **Consistent time display**: All event types now respect user time format preferences

## 📚 Documentation Updates

- Updated README.md to reflect full language support
- Enhanced CONTRIBUTING.md with clearer guidelines for language contributions
- Added language-specific formatting documentation

## 🌍 Language Contributors

A huge thank you to these contributors who made this multi-language release possible:

- Czech (`cs`) - @jakksoft (#58)
- Danish (`da`) - @hrassel / @dkduck (#15)
- Dutch (`nl`) - @mhoogenbosch (#6)
- Finnish (`fi`) - @Kotikaltsu (#9)
- French (`fr`) - @vincegre (#57)
- Hebrew (`he`) - @Shanksg (#18)
- Hungarian (`hu`) - @suxlala (#10)
- Icelandic (`is`) - @russi76 (#35)
- Italian (`it`) - @papperone (#30)
- Polish (`pl`) - @jakksoft (#34)
- Portuguese (`pt`) - @jakksoft (#56)
- Russian (`ru`) - @andrewjswan (#26)
- Spanish (`es`) - @jakksoft (#54)
- Swedish (`sv`) - @CrallH (#13)
- Ukrainian (`uk`) - @andrewjswan (#24)
- Vietnamese (`vi`) - @PATCoder97 (#61)

## ⚙️ Technical Improvements

- **Enhanced date formatting system**: Added region-sensitive date format rules
- **Improved localization framework**: Updated to support multiple date formatting conventions
- **Consistent naming convention**: Language files follow standard IETF language tags

Want to add your language? See the [Adding Translations](https://calendar-card-pro.alexpfau.com/contributing#adding-translations) section in the documentation.

---

# Calendar Card Pro v1.1.0

## 🎉 New Features

### Automatic Language Detection (#36)

- **System language detection**: Calendar Card Pro now automatically detects and uses your Home Assistant system language
- **Smart language selection** following this priority:
  1. Card configuration (if specified)
  2. Home Assistant system setting (if supported)
  3. English as fallback
- **Region code support**: Recognizes language codes with region specifiers (e.g., "de-DE" will use German)

## 🐛 Bug Fixes

### Multi-day Event Display Issue (#16)

- **Fixed ongoing multi-day events**: Events that started in the past but are still ongoing now properly display in the calendar
- **Improved event filtering logic**: Events are now correctly shown for all days they are active, not just their start day
- **Enhanced context for events**: Added "Ends Today" and "Ends Tomorrow" indicators for better comprehension
- **Consistent display across event types**: Fixed handling of both all-day multi-day events and regular multi-day events with start/end times

## 🌍 Translations

- **New translation keys**:
  - `endsToday`: For events that end on the current day
  - `endsTomorrow`: For events ending the next day

## ⚙️ Technical Improvements

- **Improved language handling**: Updated the Home Assistant interface to include locale properties
- **Enhanced formatting**: Added specialized display functions for different event types
- **Configuration default**: Changed default language constant to properly support auto-detection
- **Debug logging**: Added helpful logs for language detection troubleshooting

## Currently Supported Languages

- English (en)
- German (de)

To add support for additional languages, please consider contributing translations via PR.

---

# Calendar Card Pro v1.0.2

### Bug Fixes

- fix(#28): Resolve all-day event timezone display issues by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/39
  - Fixed critical issue where all-day events were displaying on the wrong day for users in timezones west of UTC
  - Implemented timezone-aware handling of all-day events to ensure correct display across all timezones
  - Special thanks to members @kummerr, @ActarusC, and @Twilek-de who helped diagnose and test the fix

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v1.0.0...v1.0.2

---

# Calendar Card Pro v1.0.1

## What's Changed

### Other Changes

- ci: add GitHub Actions workflow for build and lint checks on PRs by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/2
- docs: update link to architecture documentation in README by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/4
- feat: add issue templates for bug reports and feature requests, add PR template by @alexpfau in https://github.com/alexpfau/calendar-card-pro/pull/5

**Full Changelog**: https://github.com/alexpfau/calendar-card-pro/compare/v1.0.0...v1.0.1

---

# Calendar Card Pro v1.0.0

![Calendar Card Pro Banner](https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png)

I am excited to announce the first public release of **Calendar Card Pro** – a high-performance, beautifully designed calendar card for Home Assistant!

## 🚀 Key Features

- **Sleek & Modern Design** – Clean, visually appealing layout based on Material Design principles
- **Multi-Calendar Support** – Display and style multiple calendars with unique colors
- **Compact & Expandable Views** – Toggle between space-efficient and detailed displays
- **Performance Optimized** – Smart caching, progressive rendering, and minimal API calls
- **Deep Home Assistant Integration** – Theme-aware with native ripple effects
- **Multi-Language Support** – Currently available in English and German
- **Highly Customizable** – Extensive options for colors, fonts, spacing and more

## 🔧 Installation

Available through HACS (recommended) or manual installation:

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

## 📖 Documentation

For complete documentation including configuration options, examples, and customization:

- See the [documentation](https://calendar-card-pro.alexpfau.com/) for detailed usage instructions
- Check out the [Examples](https://calendar-card-pro.alexpfau.com/reference/examples) section for configuration samples

## 🙏 Acknowledgements

Special thanks to:

- **@kdw2060** from the Home Assistant community for the original design inspiration
- Home Assistant's Tile Card for interaction patterns

## 🔮 What's Next?

Development continues with planned features including:

- Enhanced event details
- Visual configuration editor
- Additional language support

Enjoy using Calendar Card Pro in your Home Assistant dashboards!
