# Per-Event Weather in Column View — Design Specification

**Scope:** column view only (`view: 'column'`, unreleased, targeting v4.0.0).
List view is shipped and is **not** changed by anything in this document.

---

## Status — read this before the design **[2026-08-12]**

**Built in stage 5.** The design was adopted; three parts of it were superseded before
or during implementation and are listed here, because the body below still reads as
first written.

| Section | Superseded by | What actually shipped |
| ------- | ------------- | --------------------- |
| §4.3, row order | C2b in [`v4-backlog.md`](./v4-backlog.md) | **Temperature, UV index, then the words last.** §4.3 orders the row `icon, condition, temperature, UV` and its worked example shows the words first. C2b ruled the reverse, and for a reason §4.3 could not have had: with a line limit in play, whatever truncates must reach the generated text before it reaches a number the user configured on purpose. |
| §4.3, truncation | C2b | **The words wrap by default and clamp only when a limit is set.** §4.3 prescribes `white-space: nowrap` with `text-overflow: ellipsis`, which is a single line always — and that leaves `weather.event.max_lines` nothing to clamp, so the two cannot both hold. C2b is the later ruling and is explicit that `0` means unlimited and that visible wrapping beats silent truncation. Implemented with the same `-webkit-box` clamp as the other four line limits: wraps at the default, ellipsizes at a limit. The rest of §4.3 — `flex: 0 1 auto` and `min-width: 0` on the words, `flex: none` on both numbers — shipped exactly as written, and is what makes the numbers survive every width. |
| §5.1, "no new key" | C2b | **One key was added:** `weather.event.max_lines`. §5.1's cost estimate ("no new config key … one optional English editor helper string") predates C2b; the real cost was one key, three English strings, a reference row, a feature-table row and a prose section. |
| The `152px` figure, throughout | a later independent review | **The narrowest track is 140px, not 152px.** Every "152px" below — §4.3's width analysis, the worked ASCII example, and the default-setting argument in §6 — is derived from a track width that no configuration produces. The floor is `COLUMN_DEFAULTS.min_day_width`, `140`, by construction: the view falls back to the list exactly when a day cannot be given that much, and `column.min_days_fallback: cramp` narrows past it rather than falling back. `140 x 3 + 32 padding + 2 x 10 gutter = 472` is the fit threshold; in the common 500px Home Assistant section three columns get about **149px**. The figure most likely predates the 32px card-padding term. Nothing here needs re-deciding — every conclusion the number supports gets *stronger* at 140px, which is why it shipped correct — but do not carry `152` forward into new work. The source comments it had propagated into have been corrected. |

Two smaller corrections, from building it:

1. **`hass` was threaded to the containers, not to the leaves.** §1 records it as
   available at both call sites, which is true of `renderEvent` and `renderColumnEvent`
   — but `renderEventContent` and `renderEventWeather` had no `hass` parameter, so two
   signatures changed. The "~20–30 lines" estimate assumed otherwise.
2. **The rule is keyed on the badge's *placement*, not on the view.** §4.1 phrases it as
   "in column view", which would have been a fourteenth `=== 'column'` gate in `src/`
   (backlog C3, which forbids exactly that). The placement is already a parameter, and
   it is also the actual reason — the icon gutter exists because the badge has a row of
   its own — so a future layout that asks for a row inherits the fix rather than needing
   to be named.

§7.1's open call — whether words should be *on* by default in column view — was not
resolved on paper and still wants an eye on a real card. Nothing in the implementation
makes flipping it expensive.

---

**Status when written:** design proposal for maintainer ruling. Nothing implemented;
working tree clean. Superseded by the banner above.

---

## 1. Feasibility Verdict

**Yes. The proposal is buildable, and the part the maintainer was uncertain about is free.**

The two open questions were "do we have the conditions available as text" and "how do we decide
which icon to show". Both are already answered inside the codebase and by Home Assistant:

| Question | Answer | Evidence |
| --- | --- | --- |
| Is the condition available as text? | **Yes, already stored on every forecast.** `WeatherData.condition` is populated for every processed forecast entry and never read by any renderer. | `src/utils/weather.ts:93`, `src/config/types.ts:355` |
| Is that text translatable? | **Yes, by Home Assistant, in every language HA supports — at zero cost to our bundle.** | Verified live, see §3.3 |
| Must we ship condition strings in our 35 languages? | **No.** Not one new string. | §3.3, §3.4 |
| How is the icon chosen? | A 15-entry map in our own code, plus night overrides. Already independent of `show_conditions`. | `src/utils/weather.ts:222-265` |
| Is `hass` available where we'd need it? | **Yes**, already threaded to both call sites. | `src/rendering/render.ts:516`, `src/rendering/column.ts:361` |

**What it depends on** — three things, all small and all verified:

1. **`hass.formatEntityState(stateObj, state?)`** — the second parameter is an *override*, so we
   can pass an arbitrary forecast condition rather than the entity's current state
   (`computeStateDisplay`: `state !== undefined ? state : stateObj.state`).
   Our `Hass` interface **already declares this function** and has never called it
   (`src/config/types.ts:477`, added in PR #107, dead ever since).
2. **Two small type widenings** — `Hass.states` is narrowed to `Record<string, { state: string }>`
   (`src/config/types.ts:463`) and `HassEntity` has no `entity_id` (`src/config/types.ts:530-540`).
   Both are needed for the call, and getting `entity_id` wrong degrades **silently** (see §3.5).
3. **A width decision** — verbal conditions in a 152px column track will not fit. This is the one
   genuine design risk in the maintainer's proposal and §4.3 proposes a fix that costs no new option.

**Net cost:** roughly 20–30 lines, no new config key required, **no new translated strings for
condition text**, and one optional English editor helper string. Bundle impact is negligible.

---

## 2. What the Card Does Today

### 2.1 Where weather data comes from and what is kept

Forecasts arrive over `weather/subscribe_forecast` and are processed once into `WeatherData`
(`src/utils/weather.ts:280-321`, `src/utils/weather.ts:54-105`). Each processed entry stores:

```
icon, condition, temperature, templow, datetime, hour,
precipitation, precipitation_probability, uv_index
```

— `src/config/types.ts:353-363`, populated at `src/utils/weather.ts:91-101`.

**`condition` is already stored** (`src/utils/weather.ts:93`) and is currently **read by nothing**.
The only consumer of the condition is `getWeatherIcon`, and that runs at processing time
(`src/utils/weather.ts:88`) and stores its result as `icon`. So the raw condition token
(`sunny`, `partlycloudy`, …) is already sitting in the renderer's hand, unused.

### 2.2 How the icon is chosen

A 15-entry literal map from HA's condition vocabulary to MDI icon names:

- `CONDITION_ICON_MAP` — `src/utils/weather.ts:222-238`
- `NIGHT_ICONS` overrides for `sunny`, `partlycloudy`, `lightning-rainy` — `src/utils/weather.ts:241-245`
- `getWeatherIcon(condition, hour)` — `src/utils/weather.ts:254-265`; night is `hour >= 18 || hour < 6`
- Unknown conditions fall back to `mdi:weather-cloudy-alert` — `src/utils/weather.ts:264`

The map covers exactly the 15 conditions HA defines (cross-checked against
`homeassistant/components/weather/strings.json` — identical set, no gaps, no extras).

**Note:** the icon is *already* derived without reference to `show_conditions`. The gating happens
purely at render time. That is what makes the proposal cheap.

### 2.3 The two positions, and how `show_conditions` gates each

**Date position** (`renderDateWeather` — `src/rendering/leaves.ts:54-108`):

| Flag | Line | Default |
| --- | --- | --- |
| `showConditions` | `leaves.ts:76` | `true` (`!== false`) |
| `showHighTemp` | `leaves.ts:77` | `true` |
| `showUvIndex` | `leaves.ts:78-81` | `false`; also requires `uv_index >= uv_index_threshold` |
| `showLowTemp` | `leaves.ts:82-83` | `false`; **and `!showUvIndex`** ← the rule in §6.3 |

The icon is rendered only when `showConditions` — `src/rendering/leaves.ts:92-96`.

**Event position** (`renderEventWeather` — `src/rendering/leaves.ts:373-441`):

| Flag | Line | Default |
| --- | --- | --- |
| `showConditions` | `leaves.ts:411` | `true` |
| `showTemp` | `leaves.ts:412` | `true` |
| `showUvIndex` | `leaves.ts:413-416` | `false`; also requires threshold |

The icon is rendered only when `showConditions` — **`src/rendering/leaves.ts:426-428`. This is the
line the maintainer's complaint is about.**

Two suppressions apply before any of that, and both must be preserved:

- **No forecast → no badge at all**, `html``` `` — `src/rendering/leaves.ts:407-409`
- **Ended timed events show no weather** — `src/rendering/leaves.ts:386-394`

### 2.4 Placement: the one thing that already differs per view

`renderEventContent` takes a `weatherPlacement` parameter, `'title' | 'row'`, defaulting to
`'title'` — `src/rendering/leaves.ts:496-502`.

- **List view** — badge on the summary row, beside the title (`leaves.ts:532`, via `renderEventTitle`
  at `leaves.ts:344`). Called without the placement argument, so it takes the `'title'` default —
  `src/rendering/render.ts:558`.
- **Column view** — badge gets its own row, inserted into `.time-location` between the time row and
  the location row — `src/rendering/leaves.ts:572`.

The rationale is recorded at `src/rendering/leaves.ts:473-485`: the narrowest column track is 152px,
so a title-row badge makes a two-word summary wrap into three lines (live-verified: `Team Sync
Meeting` rendered as `Team` / `Sync 24 degrees` / `Meeting`).

### 2.5 Why removing the icon looks broken — confirmed in the CSS

In column view the weather row is one of four siblings inside `.time-location`
(`src/rendering/leaves.ts:533-588`), and the other three each lead with an icon:

| Row | Icon | Line |
| --- | --- | --- |
| time | `mdi:clock-outline` | `leaves.ts:538` |
| **weather** | condition icon (gated) | `leaves.ts:572` → `leaves.ts:427` |
| location | `mdi:map-marker-outline` | `leaves.ts:576` |
| description | `mdi:information-outline` | `leaves.ts:584` |

The stylesheet does explicit work to line the condition icon up in that shared gutter, and the
comment says so in as many words:

> *"The two resets below are what actually line the condition icon up under the clock and
> map-marker icons, and neither is optional."*
> — `src/rendering/styles.ts:786-788`

The resets themselves are `src/rendering/styles.ts:799-811` (`margin-inline-start: 0`,
`margin-inline-end: 4px` on the icon, `font-weight: normal`).

So with `show_conditions: false` the column view produces a row that the CSS has deliberately
aligned to a gutter, with nothing in the gutter — a bare temperature hanging in the icon column,
between two icon-led rows above and below it. **The maintainer's description is accurate and the
stylesheet corroborates it.**

The list view has no such problem: there the badge floats to the right of the title with no gutter
to join (`src/rendering/styles.ts:644-650`, `margin-left: 8px`), so dropping the icon just leaves a
temperature beside the summary — which is exactly what the docs advertise (§5.2).

---

## 3. What Home Assistant Provides

All findings below were read from the maintainer's live instance, **Home Assistant 2026.8.1**,
instance language `de` (`ha_get_overview`).

### 3.1 The weather entities on this instance

Two, both `supported_features: 3` (daily + hourly):

- **`weather.forecast_home`** — met.no. State `sunny`.
  Attributes: `temperature: 26.8`, `dew_point: 11.8`, `temperature_unit: °C`, `humidity: 39`,
  `cloud_coverage: 0.0`, `uv_index: 6.4`, `pressure: 1023.8`, `pressure_unit: hPa`,
  `wind_bearing: 23.9`, `wind_speed: 10.4`, `wind_speed_unit: km/h`, `visibility_unit: km`,
  `precipitation_unit: mm`, `attribution`, `friendly_name`, `supported_features`.
- **`weather.rosenheim_dwd`** — DWD. State `sunny`.
  Same shape plus `visibility: 48.1`, `station_id`, `station_name`, `report_time`, `forecast_time`.

**The entity's `state` *is* the condition token.** Both read `sunny`.

Three absences matter and are load-bearing for §3.4: **no `unit_of_measurement`, no `state_class`,
no `device_class`** on either entity.

### 3.2 Per-forecast fields

Our `WeatherForecast` type (`src/config/types.ts:337-348`) already models
`datetime, condition, temperature, templow, precipitation, precipitation_probability,
wind_speed, wind_bearing, humidity, uv_index`, and `processForecastData` reads
`condition`, `temperature`, `templow`, `uv_index`, `precipitation`, `precipitation_probability`
(`src/utils/weather.ts:91-101`). Nothing new needs fetching.

### 3.3 **The condition-text finding** (the crux)

Home Assistant ships the condition vocabulary as translated strings, keyed
`component.weather.entity_component._.state.<condition>`, defined in core at
`homeassistant/components/weather/strings.json` and delivered to the frontend per language.

**Verified empirically against the live instance** (read-only `frontend/get_translations`,
`category: entity_component`, `integration: weather`, `language: de`). All 15 conditions came
back translated:

| Condition | English (`strings.json`) | German (live) |
| --- | --- | --- |
| `clear-night` | Clear, night | Klare Nacht |
| `cloudy` | Cloudy | Bewölkt |
| `exceptional` | Exceptional | Außergewöhnlich |
| `fog` | Fog | Nebel |
| `hail` | Hail | Hagel |
| `lightning` | Lightning | Gewitter |
| `lightning-rainy` | Lightning, rainy | Gewitter, regnerisch |
| `partlycloudy` | Partly cloudy | Teilweise bewölkt |
| `pouring` | Pouring | Strömender Regen |
| `rainy` | Rainy | Regnerisch |
| `snowy` | Snowy | Schneefall |
| `snowy-rainy` | Snowy, rainy | Schneeregen |
| `sunny` | Sunny | Sonnig |
| `windy` | Windy | Windig |
| `windy-variant` | Windy, cloudy | Windig, bewölkt |

**Consequence: we ship zero new translated strings for condition text, in any of our 35 languages.**
HA's translation pipeline covers every language HA itself supports, which is a superset of ours.
This is the single most important finding and it removes what would otherwise have been the
dominant cost of the feature.

As a bonus, the same payload carries
`component.weather.entity_component._.state_attributes.uv_index.name` → **"UV-Index"**, which is a
translated label for the UV field the card currently hardcodes as the literal `UV`
(`src/rendering/leaves.ts:104` and `:436`). Out of scope here, but noted in §7.4.

### 3.4 How a custom card reaches those strings

`hass.formatEntityState` is HA's own entity-state formatter, and it accepts a state override:

```ts
export type FormatEntityStateFunc = (stateObj: HassEntity, state?: string) => string;
```
— `home-assistant/frontend`, `src/common/translations/entity-state.ts`

It forwards to `computeStateDisplay(localize, stateObj, locale, config, entities, state)`, which
resolves the value as `state !== undefined ? state : stateObj.state` — so **passing a forecast's
condition returns that condition's localized text, not the entity's current one.** That is exactly
the call the proposal needs.

The resolution chain ends at:

```
entity.translation_key  → component.<platform>.entity.<domain>.<translation_key>.state.<state>
device_class            → component.<domain>.entity_component.<device_class>.state.<state>
default                 → component.weather.entity_component._.state.<condition>   ← lands here
raw                     → the state string itself                                  ← safe fallback
```
— `home-assistant/frontend`, `src/common/entity/compute_state_display.ts`

**One risk, ruled out.** `computeStateDisplay` checks `isNumericFromAttributes(attributes)` *before*
reaching the translation branch, and a numeric hit would run the condition through
`Intl.NumberFormat`. The predicate is:

```ts
isNumericFromAttributes = (attributes) => !!attributes.unit_of_measurement || !!attributes.state_class;
```
— `home-assistant/frontend`, `src/common/number/format_number.ts`

Neither live weather entity has `unit_of_measurement` or `state_class` (§3.1), and no HA weather
entity does — the domain uses `temperature_unit` / `pressure_unit` / etc. instead. With no
`device_class` and no `translation_key` either, resolution lands squarely on the `_` default key.
**Confirmed safe.**

Our `Hass` interface already declares the function — `src/config/types.ts:477`. It was added by
PR #107 (`feat: weather forecast in date column`) and has **never been called**: a repo-wide grep
for `formatEntityState` across `src/`, `tests/` and `docs/` returns only that declaration.

### 3.5 Two type gaps that would fail *silently*

Both are cheap to fix and expensive to miss:

1. **`Hass.states` is narrowed to `Record<string, { state: string }>`** — `src/config/types.ts:463`.
   We need the full state object to pass to `formatEntityState`, so this needs widening (the runtime
   value already carries everything).
2. **Our declaration is stricter than HA's.** `src/config/types.ts:477` declares the second
   parameter as required (`state: string`), whereas HA's own type has it optional
   (`state?: string`). Benign for this use — we always pass a condition — but they should be
   reconciled while the line is being touched, so the declaration does not misdescribe the API.
3. **`HassEntity` declares no `entity_id`** — `src/config/types.ts:530-540`.
   `computeStateDisplay` calls `computeDomain(stateObj.entity_id)` to build the lookup key. A
   `stateObj` without `entity_id` yields the key `component.undefined.entity_component._.state.sunny`,
   which misses, and the chain falls through to *"return the raw state"*. The card would render
   `sunny` instead of `Sonnig` — **no error, no warning, just untranslated English tokens for every
   non-English user.** This is the one implementation detail most likely to ship broken.

**Mitigation to specify in the implementation:** pass the real `hass.states[config.weather.entity]`
object (which has `entity_id` at runtime), and guard the whole call — `formatEntityState` is
optional on the interface (`?`), so an older or non-standard `hass` must degrade to icon-only rather
than throw.

---

## 4. Proposed Design

### 4.1 The rule

> **In column view, whenever an event weather badge is rendered at all, it always leads with the
> condition icon. `show_conditions` no longer gates the icon there; it gates whether the condition
> is *also* stated in words, alongside the temperature and UV index.**

This is the maintainer's proposal, adopted. Concretely, for the **event** position:

| | List view (shipped, unchanged) | Column view (proposed) |
| --- | --- | --- |
| `show_conditions: true` | icon + temp | **icon + words + temp** |
| `show_conditions: false` | temp only | **icon + temp** |
| no forecast for the event | nothing | nothing |
| event already ended | nothing | nothing |

The critical scoping word is **"whenever a badge is rendered at all"**. *Always shown* must not be
read as "render an empty icon row when there is no data". The two existing suppressions at
`src/rendering/leaves.ts:407-409` and `:386-394` stay exactly as they are. This matters beyond
tidiness: `tests/column-dom.test.ts:228-230` asserts that the two views render the **same number**
of `.event-weather` elements, and a column-only empty row would break that gate.

### 4.2 What is deliberately *not* changed

- **List view: nothing.** The `'title'` placement, the icon gating at `leaves.ts:426-428`, and the
  documented temp-only configuration (§5.2) all keep working byte-for-byte.
- **The date position, in either view.** The maintainer's complaint is specific to the event row,
  and the reason is structural: the day header arranges weekday / day number / month / weather
  *horizontally* (`src/rendering/styles.ts:1097-1105`), so it has no icon gutter to break. A
  header showing `24°` with no icon is unremarkable. `show_conditions` under `weather.date` therefore
  keeps its current meaning everywhere. **Applying the new rule to both positions would be a
  needless second behaviour change** — recommend against.

So the change is confined to one branch of one function, reached only from the column view.

### 4.3 The width problem — the one real risk, and the fix

The maintainer's proposal puts variable-length prose into the narrowest layout the card has. The
column track bottoms out at **152px** (`src/rendering/leaves.ts:477`), and German is not kind:
`Strömender Regen 18° UV7` will not fit. Unlike the day header, which already truncates for exactly
this reason —

> *"It truncates rather than wrapping, because wrapping would push the header onto a third line and
> change the height of every column in the row."* — `src/rendering/styles.ts:1094-1096`

— the event weather row has **no clamp at all** today (`src/rendering/styles.ts:799-811`). Wrapping
there is just as costly: a grid row is as tall as its tallest column, so one long condition on one
day inflates every column in that row.

**Recommended fix — make only the words shrinkable, and let the numbers win.** Order the row
naturally (`icon`, condition, temperature, UV) but give the condition span
`flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
while temperature and UV stay `flex: none`. In a wide column you get the full phrase; in a narrow
one it degrades:

```
280px   [icon] Teilweise bewölkt 21° UV7
152px   [icon] Teilweise be… 21° UV7
```

The temperature and UV index — the two highest-value fields, and the ones users actually configured —
survive every width. This costs **no new config option**, reuses flexbox already in the file, and
follows the truncation precedent the day header set.

*(Rejected alternative: a `condition_max_lines` option in the `*_max_lines` family. It fits the
existing vocabulary but adds a config key, a docs row and an editor string to solve a problem that
one ellipsis solves, and multi-line prose in a 152px track is not a good outcome even when it fits.)*

### 4.4 Behaviour when data is missing or partial

| Situation | Result | Rationale |
| --- | --- | --- |
| No weather entity / position excludes events | no row | `hasEventWeather` — `leaves.ts:363-368` |
| No forecast matches the event | no row | preserves list/column parity, `leaves.ts:407-409` |
| Timed event already ended | no row | unchanged, `leaves.ts:386-394` |
| Condition token unknown to our map | icon `mdi:weather-cloudy-alert`, and HA returns the raw token as text | `weather.ts:264`; HA's final fallback |
| `hass.formatEntityState` unavailable | **icon + temp, no words** | must not throw; the icon is what fixes the layout, and it needs no `hass` |
| Condition text resolves empty | render icon + temp, omit the span | avoids a stray separator |

The last two are why the icon must be unconditional rather than "shown when we have text": the row's
structural integrity cannot depend on a translation lookup succeeding.

### 4.5 Alternative considered, and why the maintainer's proposal is better

**Alternative: leave `show_conditions` gating the icon, and substitute a neutral placeholder icon
when it is off.** This keeps the gutter intact with a one-line change and no new semantics.

Rejected: a placeholder that is not the condition is either meaningless (a dot) or misleading (a
generic cloud on a sunny day), and it spends the gutter — the most valuable pixels in the row — on
nothing. The maintainer's version spends it on the single most informative glyph available, and it
resolves the naming oddity too: `show_conditions` currently means "show an icon", which is a strange
name for an icon toggle; under the proposal it means "show the conditions", which is what it says.

---

## 5. Config & Migration Impact

### 5.1 No config key changes, and no migration

**Recommendation: reuse `weather.event.show_conditions`. Do not add a new key.**

- No new option to document in the reference table, no new editor field, no new string, no bundle
  cost, and nothing for `check:docs` to reconcile.
- **No user's config changes meaning.** Column view has never shipped. Every config in the wild
  today renders as a list, and the list view's semantics are untouched. The key's meaning shifts
  only in a layout that does not yet exist for anyone.

This is precisely the window in which such a shift is free, and it closes at v4.0.0.

*(Alternative: a separate `show_condition_text` key. It keeps `show_conditions` meaning exactly one
thing in both views, at the cost of a new option, a reference row, an editor field with strings, and
a `show_conditions` that is inert-but-not-annotatable in column view — see §6.2 for why that
annotation is not expressible. Recommend against, but it is a clean fallback if the maintainer
dislikes the dual meaning.)*

### 5.2 The one config in the wild that this touches

`docs/features/weather.md:25-30` presents temp-only event weather as a **documented, worked
example**:

```yaml
  event:
    # Event row shows just the temperature (no icon)
    show_conditions: false
    show_temp: true
```

So `show_conditions: false` is not a theoretical setting — it is advertised. Under the proposal a
user with that config who adopts `view: column` sees an icon appear in their event rows.

That is the intended outcome (it is the fix), and it is not a silent regression, because:

- it cannot happen without the user opting into a brand-new view, and
- the same card **still renders their config exactly as before** below the width threshold, where it
  falls back to the list layout.

The docs comment `# Event row shows just the temperature (no icon)` becomes list-specific and needs
a qualifier when this lands (§5.4).

### 5.3 A per-view override cannot solve this — checked, and it can't

The obvious escape — "let the user set `column: { weather: { event: { show_conditions: … } } }`" — is
**not available**, for two independent reasons:

1. **`weather` is fetch-time.** It is a member of `FETCH_TIME_KEYS` (`src/config/view.ts:198`), so a
   `column.weather` block is rejected with *"it determines which events are loaded from Home
   Assistant, so it cannot differ between views"* (`src/config/view.ts:771-777`).
2. **No weather key is override-eligible.** `COLUMN_OVERRIDE_KEYS` (`src/config/view.ts:33-88`)
   contains 60-odd keys and **not one weather key**. The override mechanism is also whole-key
   granular, so a nested sub-path like `weather.event.show_conditions` is not expressible in it even
   in principle.

**Worth flagging as a documentation defect:** `docs/development/column-view-rationale.md:1838-1841`
classifies the `weather.date.*` / `weather.event.*` presentation sub-keys — `show_conditions`
explicitly among them — as **"Category B — override-eligible."** That is an aspiration, not the
implemented behaviour, and it directly contradicts `view.ts:198`. Whatever is decided here, that
paragraph should be corrected, or a reader will reasonably conclude the override route exists.

Since the override route is closed, **a behavioural rule in the column renderer is the only
mechanism available** — which is what the maintainer proposed.

### 5.4 Documentation to update when this lands

- `docs/features/weather.md:43,51` — the two `show_conditions` rows, to state both behaviours.
- `docs/features/weather.md:25-30` — qualify the `# no icon` comment as list-layout.
- `docs/features/weather.md:85,96` — the position-specific bullets.
- `docs/reference/configuration.md:200-201` — the weather sub-key lists; add the condition-text
  behaviour to the prose, and keep the bidirectional footer link intact.
- A prose paragraph on the column-view feature page (a table row alone is how
  `show_countdown_allday` shipped undiscoverable — AGENTS.md).
- `docs/development/column-view-rationale.md:1838-1841` — the Category B misclassification above.

---

## 6. Editor Changes

### 6.1 Current state

The Weather panel is schema-driven (`src/rendering/editor/schemas/weather.ts`). Both position groups
declare a field literally named `show_conditions`:

- date group — `src/rendering/editor/schemas/weather.ts:85`
- event group — `src/rendering/editor/schemas/weather.ts:97`

Labels are path-qualified in the string table: `date.show_conditions` and `event.show_conditions`
(`src/rendering/editor/strings.ts:329,341`), both currently `'Show Conditions'`.

### 6.2 Do **not** express this through `VIEW_SCOPE` — it cannot work here

Two independent blockers, both worth recording because the instinct will be to reach for it:

1. **Wrong semantics.** `VIEW_SCOPE` / `applicabilityNote` says *"this option applies to the list
   layout"* for options that do nothing in the current view (`src/config/view.ts:164-182`,
   `src/rendering/editor/localize.ts:199-216`). Under this proposal `show_conditions` **does** apply
   in column view — it toggles the words. It is not inert, so the annotation would be false.
2. **Key collision.** `applicabilityNote` is called with the **bare** `schema.name` —
   `src/rendering/editor/localize.ts:135`. Both weather groups name their field `show_conditions`,
   so a `VIEW_SCOPE['show_conditions']` entry would annotate the **date** field too. Making that
   safe would require giving `applicabilityNote` the path-aware treatment `helperKey` already has
   (`src/rendering/editor/localize.ts:158-163`) — a change to shared editor machinery for a note
   that should not be written in the first place.

**Recommendation: use a path-qualified helper string instead.** Helper resolution *is* path-aware —
`computeHelper` builds the key via `helperKey(schema, path)` → `qualifiedKey`
(`src/rendering/editor/localize.ts:132-133`) — so `event.show_conditions.helper` reaches the event
field and only the event field. Add to `src/rendering/editor/strings.ts`:

```ts
'event.show_conditions.helper':
  'Shows the condition icon. In the column layout the icon is always shown, and this adds the ' +
  'condition in words.',
```

This satisfies the standing "annotate, never hide" ruling in the form the ruling actually cares
about: both layouts are live for one card, and this sentence is true of both simultaneously — which
a `VIEW_SCOPE` note, phrased as *applies to one layout*, could not be.

**Cost:** one English string. Per AGENTS.md the `editor` section of the 35 language files is optional
and resolves per key with an English fallback, so translations are optional follow-up, not a
blocker. `check:i18n` reconciles `strings.ts` against schema fields in both directions, so this is
mechanically verified.

### 6.3 The UV-index / low-temperature rule (already ruled, not yet expressed)

**The rule as implemented** — `src/rendering/leaves.ts:82-83`:

```ts
const showLowTemp =
  dateConfig.show_low_temp === true && !showUvIndex && dailyForecast.templow !== undefined;
```

UV index takes the slot; the low temperature yields. This applies to the **date position only** —
the event position has no `show_low_temp`.

**What the editor shows today:** two independent switches, `show_low_temp` then `show_uv_index`
(`src/rendering/editor/schemas/weather.ts:87-88`), with nothing connecting them. A user can enable
both and be quietly given only one.

**Recommendation: annotate it. Do not hide `show_low_temp`.**

Hiding would be *actively wrong*, and the reason is subtle enough to be worth stating: the
precedence is **evaluated per day, at runtime**, not statically. `showUvIndex` also requires
`uv_index >= uv_index_threshold` (`src/rendering/leaves.ts:78-81`), so on a day whose UV falls below
the threshold, `showUvIndex` is `false` and **the low temperature does show**. With both switches on
and a threshold of, say, 5, a user legitimately gets UV on bright days and the low temperature on
dull ones. A conditional-reveal — the pattern `uvIndexFields` uses for `uv_index_threshold`
(`src/rendering/editor/schemas/weather.ts:49-51`), which *is* a static dependency — would therefore
remove a control that is doing real work.

So add one path-qualified helper to `src/rendering/editor/strings.ts`, beside
`'date.show_low_temp'` at line 331:

```ts
'date.show_low_temp.helper':
  'The UV index takes this place on days it is shown.',
```

**Cost:** one English string, no schema change, no behaviour change. It converts a silent
precedence into a stated one.

### 6.4 Editor summary

| Change | File | Cost |
| --- | --- | --- |
| Helper on `event.show_conditions` | `editor/strings.ts` (near `:341`) | 1 English string |
| Helper on `date.show_low_temp` | `editor/strings.ts` (near `:331`) | 1 English string |
| `VIEW_SCOPE` entry | — | **none; explicitly rejected, §6.2** |
| Schema change | — | **none** |

---

## 7. Open Questions

### 7.1 Should the words show by default in column view? — **the one decision I'd escalate**

`show_conditions` defaults to `true` (`src/rendering/leaves.ts:411`). Read literally, the proposal
therefore makes **verbal conditions the default** for every column card — a default 152px column
would read `Teilweise bewölkt 21°`.

**My recommendation: adopt the proposal as stated, with §4.3's ellipsis.** Reasons: it keeps one
key with one meaning per view; the maintainer's framing ("`show_conditions` toggles showing the
conditions verbally") implies default-on; and the column view has more vertical room per event than
the list does, since the badge already occupies its own row whose width is otherwise wasted.

**But this is a taste call about default density and it should be made by eye, not on paper.** The
cheap way to settle it is to deploy a dev build and look at it at 3, 5 and 7 columns. If it reads as
cluttered, the fix is a one-line default flip for the column path only — no schema or docs churn.

### 7.2 Separator between the words and the temperature?

`[icon] Sonnig 21°` relies on whitespace alone. The existing row uses a bare space between temp and
UV (`src/rendering/leaves.ts:429-438`). A middot (`Sonnig · 21°`) reads better but is one more glyph
in the tightest layout. **Recommendation: plain space, matching the existing row.**

### 7.3 Does the day-header weather want the same treatment?

Covered in §4.2 — **no**, the header is horizontal and has no gutter to break. Flagged only so the
decision is on the record rather than an oversight.

### 7.4 The hardcoded `UV` label

`UV${forecast.uv_index}` is a literal in both positions (`src/rendering/leaves.ts:104`, `:436`) and
is untranslated in all 35 languages. HA has a translated label available —
`component.weather.entity_component._.state_attributes.uv_index.name` → *"UV-Index"* (§3.3). Out of
scope for this spec, and arguably `UV` is fine as an international abbreviation, but it is adjacent
and now cheap. **Recommendation: leave it; note it as a candidate.**

### 7.5 Should the condition text be available in list view too?

Not proposed, and I'd recommend against for now: the list badge shares the title row and has no
spare width. Recording it because a future reader will ask why the capability is column-only.

---

## 8. What I Could Not Verify

1. **Rendered appearance.** No dev build was deployed and no browser screenshot taken — this is a
   read-only design task. The width analysis in §4.3 is derived from the 152px figure recorded at
   `src/rendering/leaves.ts:477` and from the CSS, **not measured live.** §7.1 should be settled by
   eye before implementation.

2. **`formatEntityState` reachability from inside a custom card at runtime.** I verified the
   translations exist and are delivered (§3.3, live), verified the function's signature and
   resolution chain in the frontend source (§3.4), and verified our interface already declares it
   (`src/config/types.ts:477`). I did **not** execute a card that calls it. The residual unknown is
   whether the `entity_component` translation category is guaranteed loaded in every frontend
   context where our card renders. It is loaded wherever HA itself displays a weather entity, and
   the fallback chain degrades to the raw token rather than throwing — but a one-line console check
   in a dev build would close this properly, and it is worth doing first because §3.5's failure mode
   is silent.

3. **Per-language condition text beyond German.** Verified `de` live and `en` from
   `homeassistant/components/weather/strings.json`. The remaining languages are asserted from HA's
   translation pipeline, not read. Core no longer keeps per-language files in-repo (Lokalise
   delivery), so `frontend/get_translations` per language is the way to spot-check more.

4. **Behaviour of `show_conditions` for the *date* position in column view** was reasoned from the
   CSS (`src/rendering/styles.ts:1097-1105`) rather than observed. §4.2 proposes no change there, so
   the risk is confined to whether the *existing* header looks acceptable without an icon — a
   pre-existing question this spec does not alter.

5. **Whether any real user actually runs `show_conditions: false`.** §5.2 establishes it is
   documented and therefore plausible; I have no telemetry and the project collects none.
