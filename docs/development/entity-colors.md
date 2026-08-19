# Entity Colors From Home Assistant

Home Assistant 2026.2 gave calendar entities a color of their own, stored in the entity
registry. [Issue #314](https://github.com/alexpfau/calendar-card-pro/issues/314) — filed by
the core contributor who landed the feature — asks Calendar Card Pro to pick it up. This
file specifies how.

**Status:** approved, in implementation. The settled design decisions are recorded under
[Decisions](#decisions).

Like [column-view.md](https://github.com/alexpfau/calendar-card-pro/blob/dd73f37d2c76cf324571b2bd44aae02060f7bb0a/docs/development/column-view.md)
before it, this is a working document with a lifecycle: it is deleted once the feature ships
and the user-facing documentation has absorbed it. That link is pinned to a commit rather
than to a tag because the file no longer exists on any branch or release.

| Part                                     | Question it answers                               |
| ---------------------------------------- | ------------------------------------------------- |
| [1](#part-1-what-home-assistant-shipped) | What HA actually shipped, established from source |
| [2](#part-2-the-config-surface)          | The config grammar, and what was rejected         |
| [3](#part-3-editor-ux)                   | The editor controls                               |
| [4](#part-4-backwards-compatibility)     | Why existing configs are untouched                |
| [5](#part-5-scoping)                     | Per-entity, per-view, and what is out of scope    |
| [6](#part-6-runtime-plumbing)            | How the value reaches the render path             |
| [7](#part-7-test-plan)                   | What gets pinned                                  |
| [8](#part-8-documentation)               | Docs changes required in the same PR              |
| [9](#part-9-implementation-order)        | Build order                                       |

---

## Part 1. What Home Assistant Shipped

Everything here was established from upstream source rather than from PR prose. Claims
verified a second time directly against the source are marked **✔✔**; those resting on a
single research pass are **✔**. The distinction is not decoration — see
[Verification](../../AGENTS.md#verification).

### 1.1 Where The Color Lives

**In the entity registry, in the generic per-domain `options` blob, at
`options.calendar.color`.** It is not a state attribute, not a config entry field, and not a
new top-level registry column. **✔✔**

`homeassistant/components/calendar/__init__.py`:

```python
class CalendarEntity(Entity):
    _attr_initial_color: str | None

    @override
    def get_initial_entity_options(self) -> er.EntityOptionsType | None:
        if self.initial_color is None:
            return None
        try:
            validated_color = cv.color_hex(self.initial_color)
        except vol.Invalid:
            return None
        return {DOMAIN: {"color": validated_color}}
```

There is **one** field a consumer reads, not two. `initial_color` is an integration-side seed
consumed by `get_initial_entity_options()` **on first registration only**; the user's
override writes the same `options.calendar.color`. So there is no `original_color` / `color`
pair to resolve the way `original_name` / `name` must be. Read the one field.

### 1.2 How A Card Reads It

**`config/entity_registry/list` over the websocket. `hass.entities` will not do.** **✔✔**

Both halves were verified directly. `as_partial_dict` — which `partial_json_repr` serializes
and `websocket_list_entities` returns — contains `"options": self.options`. But
`_as_display_dict`, which backs `list_for_display` and therefore `hass.entities`, contains no
`options` key at all beyond a hardcoded `sensor` display-precision special case. The
compressed display registry a card would prefer to use does not carry this value.

Home Assistant's own calendar card confirms the intended path — it subscribes to the full
registry rather than reading `hass.entities`:

```ts
// frontend: src/panels/lovelace/cards/hui-calendar-card.ts
subscribeEntityRegistry(this.hass!.connection!, (entities) => {
  this._entityRegistry = entities;
});
// …
const entityColor = entityOptionsMap.get(entity)?.calendar?.color;
if (entityColor && isValidColorString(entityColor)) {
  backgroundColor = computeCssColor(entityColor);
} else {
  backgroundColor = getColorByIndex(idx, computedStyles);
}
```

Note what the reference implementation does with the value: it becomes a **background or
accent**, never a text color. [Part 5](#part-5-scoping) leans on that.

### 1.3 Value Format — The Load-Bearing Question

**The value can be a literal CSS color or a Home Assistant theme token. The card must resolve
tokens; it cannot treat the value as an opaque CSS color.** **✔✔**

This is the finding that shapes the design, so it was not taken on trust. The first pass
reasoned from `isValidColorString()` in the _reader_, which proves nothing about the writer.
Checking the writer instead:

- `entity-registry-settings-editor.ts` renders **`ha-color-picker`** for the calendar domain
  — not a hex field.
- `ha-color-picker.ts` builds its options as
  `Array.from(THEME_COLORS).forEach((color) => … id: color …)` and fires `value-changed` with
  that id. **Selecting "Red" stores the string `red`.**
- Core validates the user-update path with `vol.Any(None, dict)` and nothing more.
  `cv.color_hex` guards only the integration-supplied `initial_color`.

| Route                            | What gets stored              |
| -------------------------------- | ----------------------------- |
| Integration sets `initial_color` | Hex only, via `cv.color_hex`  |
| User picks from the UI dropdown  | **A theme token**, e.g. `red` |
| User types a custom value        | Any string                    |
| Direct websocket API             | Any string, unvalidated       |

The resolution rule is `computeCssColor`, whose entire body is:

```ts
export function computeCssVariableName(color: string): string {
  if (THEME_COLORS.has(color) || YAML_ONLY_THEMES_COLORS.has(color)) {
    return `--${color}-color`;
  }
  return color;
}
export function computeCssColor(color: string): string {
  const cssVarName = computeCssVariableName(color);
  return cssVarName !== color ? `var(${cssVarName})` : color;
}
```

**25** `THEME_COLORS` (`primary`, `accent`, `red`, `pink`, `purple`, `deep-purple`, `indigo`,
`blue`, `light-blue`, `cyan`, `teal`, `green`, `light-green`, `lime`, `yellow`, `amber`,
`orange`, `deep-orange`, `brown`, `light-grey`, `grey`, `dark-grey`, `blue-grey`, `black`,
`white`) plus **3** `YAML_ONLY_THEMES_COLORS` (`primary-text`, `secondary-text`, `disabled`)
= **28 tokens**. A research pass twice reported 26; the number above is a count of the
fetched source. Cite 28, or the palette table ships short.

::: tip This Lands Better Than It Looks
A token resolves to `var(--red-color)`, and `computeRGBA` in `utils/helpers.ts` already
routes anything starting with `var(` through `color-mix(in srgb, … %, transparent)` — the v4
fix for themed accent colors. So `event_background_opacity` should composite a token-derived
color correctly through code that already exists. That is a claim to test, not to assume
([test 3](#part-7-test-plan)), but the branch is there and it is the branch this needs.
:::

### 1.4 Version

**Home Assistant 2026.2.** **✔✔** Established by ancestry rather than by merge dates:

```text
core#145606 (b13c2e30)  vs 2026.1.0 → ahead   (not in it)
core#145606 (b13c2e30)  vs 2026.2.0 → behind  (in it)
core#161671 (1bb4c9d2)  vs 2026.2.0 → behind  (in it)
```

All three upstream PRs are merged. The frontend is bundled into core releases and is not
separately tagged.

### 1.5 Which Integrations Populate It

**Google Calendar, and nothing else in core.** **✔** A code search for `initial_color` across
`homeassistant/components` returns exactly two hits: the base class, and `google/calendar.py`
(`initial_color=calendar_item.background_color`, passed through unconverted because Google's
API already returns hex). Local Calendar, CalDAV and Todoist do not set it. Integrations
outside core could not be established.

**This is the most important fact for the design.** The large majority of users run Local
Calendar, CalDAV or an ICS feed, so for them the color is **absent unless they set it by
hand**. A design that renders badly when the color is missing renders badly for most people
who try it. [2.4](#24-what-happens-when-home-assistant-has-no-color) is about exactly that.

### 1.6 What Absence Looks Like

`options` is never `None` on the Python side — a converter coerces it to `{}` — so the wire
carries `"options": {}` and `entry.options?.calendar?.color` yields `undefined`. **✔** There
is no empty-string case to guard, but the card should treat an empty string as absent
regardless, since the API accepts arbitrary strings.

### 1.7 Change Notification

The event is **`entity_registry_updated`**. **✔** Home Assistant's own subscription responds
by re-fetching the whole list behind a 500 ms debounce rather than patching in place. A card
that fetches once and never subscribes goes stale until the page reloads.

---

## Part 2. The Config Surface

### 2.1 The Decision

**Widen the grammar of `accent_color` with a sentinel value. Add no new config key.**

```yaml
accent_color: home-assistant # every calendar follows its own Home Assistant color

entities:
  - calendar.personal # unchanged: inherits the card
  - entity: calendar.work
    accent_color: home-assistant # this calendar follows Home Assistant
  - entity: calendar.trash
    accent_color: '#43a047' # unchanged: an explicit color
```

`accent_color` stays typed `string`. Its default stays `#03a9f4`. The three modes are
**readings of one value**, not a second key:

| Stored value     | Mode    | Meaning                                                                                        |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------- |
| absent or empty  | inherit | Per calendar: use the card's `accent_color`. Card-wide: use the default. **Today's behavior.** |
| `home-assistant` | follow  | Use Home Assistant's color for that calendar                                                   |
| anything else    | custom  | Use it as a CSS color. **Today's behavior.**                                                   |

### 2.2 Why This Shape

`start_date` is the worked precedent, and the match is exact: one key, three modes read off
the value's shape, and a mode stored nowhere.

```ts
export function startDateMode(config): 'default' | 'fixed' | 'offset' {
  const value = config.start_date;
  if (!isSet(value)) return 'default';
  return FIXED_DATE_PATTERN.test(String(value).trim()) ? 'fixed' : 'offset';
}
```

`heightMode`, `languageMode`, `locationCountryMode` and `todayIndicatorStyle` are four more
instances of the idiom in `rendering/editor/synthetic.ts`, and `labelTypeOf` is the
per-calendar one in `rendering/editor/entities.ts`. This is not a new mechanism; it is _the_
mechanism this editor already uses for this exact problem.

The cost difference is concrete. A new key means touching `config/types.ts`,
`DEFAULT_CONFIG`, `normalizeEntities`, the editor schema, `strings.ts`, the editor
translation files, the reference table, the per-entity table and a feature page — and it
leaves a second key in users' YAML that can contradict the first. Widening the grammar
touches the resolver, the editor's derive/apply pair, and the docs.

### 2.3 Alternatives Rejected

**A separate `accent_color_source: default | entity | custom` key.** Rejected on three
counts. It is the expensive shape above. It admits contradictory states — what does
`source: custom` with an empty `accent_color` mean? And it is the failure shape the v4
weather work already produced once: a mode key the editor writes on open makes a defaulted
value indistinguishable from a deliberate one. `toStoredConfig` would strip
`source: default`, but the moment a user picks any other mode the key is real and permanent.
No such risk exists when the mode is derived.

It also drags in a gate. `check-docs.mjs` check 21 requires a reference row to name every
value of a string-literal union in `types.ts`. `'default' | 'entity' | 'custom'` is such a
union; `string` is not.

**A `follow_entity_colors: true` boolean.** Cheaper than a mode key but strictly weaker: a
boolean cannot express "this calendar follows HA, that one is pinned to my brand color"
without a second per-calendar mechanism, which is where the mode key came from.

**Reading HA's color unconditionally, with no opt-in.** Rejected. It would change what every
existing card renders the moment a user sets a color in HA for an unrelated reason. The issue
asks for the card to be _able_ to pick the color up, not to be governed by it.

**A fallback list — `accent_color: home-assistant, #ff0000`.** Deferred, not rejected. It answers
[2.4](#24-what-happens-when-home-assistant-has-no-color)'s limitation cleanly and can be
added later **without a breaking change**, because `home-assistant` alone stays valid. Not worth the
parser on day one.

**Applying the sentinel to per-calendar `color`, the event title color.** Rejected on
evidence: HA's own calendar card and calendar panel both use this value as `backgroundColor`,
never as a text color. Tinting title text with a background swatch produces unreadable rows
at both ends of the palette. Left as a follow-up if it is ever asked for.

### 2.4 What Happens When Home Assistant Has No Color

Given [1.5](#15-which-integrations-populate-it) this is the common path, not an edge case.
**The sentinel falls through the existing resolution chain rather than terminating it.** For
an event from entity `E`:

1. Per-calendar `accent_color`
   - `home-assistant` → HA's color for `E` if present → **use it**; otherwise fall to 2
   - a literal → use it
   - absent → fall to 2
2. Card-wide `accent_color`
   - `home-assistant` → HA's color for `E` if present → **use it**; otherwise
     `DEFAULT_CONFIG.accent_color`
   - a literal → use it

So "follow Home Assistant" degrades to exactly what the card renders today. A user who flips
the card-wide switch sees their Google calendars pick up their colors and everything else
stay as it was — the right outcome for the majority described in 1.5.

**One asymmetry, to be documented rather than hidden.** A card-wide sentinel cannot fall back
to "the card-wide literal", because the sentinel occupies that slot; it falls back to the
shipped default `#03a9f4`. A user wanting "follow HA, else my brand color" must set the brand
color per calendar. The deferred fallback-list grammar is the clean answer if that is ever
requested.

**Rejected alternative:** falling back to Home Assistant's own `getColorByIndex` palette, as
`hui-calendar-card` does. It would give every calendar a distinct color automatically, which
is tempting, but it makes rendering depend on list order — reordering `entities` would
silently repaint the card — and introduces a second palette the card does not otherwise have.

### 2.5 The Sentinel Token

`home-assistant`. It is not a CSS named color, not one of the 28 HA tokens, and cannot
collide with the existing grammar. Hyphenated lowercase also matches the vocabulary the
value sits beside: `deep-purple`, `light-grey`.

`entity` was the first proposal and was rejected. It reads badly two lines below
`entity: calendar.work`, where the same word means two different things in adjacent lines.

Also considered: `home_assistant` — the in-repo sentinel precedent is
`vertical_line_color: 'accent_color'` in `config/config.ts`, but that snake*case names a
\_config key*, whereas this names an external product, so the precedent does not bind.
`auto` says nothing about where the value comes from, and the card already uses `auto` for
`height` in a different sense. `ha` is cryptic. `registry` is accurate jargon nobody outside
this document uses.

### 2.6 Token Resolution Applies To Registry Values Only

**This is a hard constraint, not an implementation detail.** Sixteen of Home Assistant's 25
theme tokens are simultaneously valid CSS color names: `red`, `blue`, `green`, `orange`,
`pink`, `purple`, `teal`, `cyan`, `amber`, `lime`, `indigo`, `brown`, `grey`, `black`,
`white`, `yellow`.

`rendering/styles.ts` writes `config.accent_color` **raw** into CSS custom properties, so
`accent_color: red` renders as CSS red, `#FF0000`, today. If token resolution were ever
applied to the user's own `accent_color` string, that identical config would silently become
`var(--red-color)` — Home Assistant's Material red, a visibly different shade — for every
user who typed a bare color name. Nothing would error; the card would just change color on
upgrade.

So: **resolve tokens only for values read out of the entity registry. Never for
user-authored `accent_color` strings.** Exposure is limited today because the docs teach hex
everywhere and contain no bare-name examples, but the field is free text and the rule has to
hold regardless. Pinned by [test 11](#part-7-test-plan).

The three `YAML_ONLY_THEMES_COLORS` (`primary-text`, `secondary-text`, `disabled`) are
handled as cheap insurance rather than as a live case: HA's own `isValidColorString` checks
`THEME_COLORS` and not those three, so they cannot arrive through any validated path.

---

## Part 3. Editor UX

### 3.1 ha-form Can Express This, And Already Does

The question was whether `ha-form` can express a conditional field cleanly. The framing needs
correcting first: **no conditional selector is involved.** The schema is a plain array the
card rebuilds on every render, so "conditional" means an `if` inside a builder function. That
pattern already ships twice:

```ts
// schemas/content.ts — card-wide
function startDateFields(language: string, mode: string): HaFormSchema[] {
  const fields = [select(language, 'start_date_mode', ['default', 'fixed', 'offset'])];
  if (mode === 'fixed')
    fields.push({ name: 'start_date_fixed', selector: { text: { type: 'date' } } });
  else if (mode === 'offset') fields.push(text('start_date_offset'));
  return fields;
}
```

```ts
// schemas/entity.ts — per calendar
export function entitySchemaFor(schema, type) {
  /* swaps the label fields for the chosen shape */
}
```

So a dropdown plus a color field that appears only for "custom" is not merely feasible, it is
the house pattern. No new selector, no `static-html`, and no Home Assistant input element
named — which is the rule that keeps the editor immune to HA renaming its components.

### 3.2 Three Modes Per Calendar, Two Card-Wide

The mode sets differ by level, because the levels express different things.

**Per calendar** — three, matching the existing `ENTITY_TRISTATE_VALUES` idiom, which already
ships the phrase _"Follow the card"_:

| Option                    | Stored                             |
| ------------------------- | ---------------------------------- |
| Follow the card (default) | key absent                         |
| Follow Home Assistant     | `home-assistant`                   |
| Custom color              | the literal, in a text field below |

**Card-wide** — two. Nothing sits above the card to inherit from, so an "inherit" option
would be a synonym for "custom, at the default value":

| Option                 | Stored                               |
| ---------------------- | ------------------------------------ |
| Custom color (default) | the literal, stripped when `#03a9f4` |
| Follow Home Assistant  | `home-assistant`                     |

Offering three card-wide options would be the mistake: an entry that behaves identically to
another reads as a bug.

### 3.3 Concrete Changes

**Events panel** (`schemas/events.ts`). Today the row is
`row(color('accent_color'), text('vertical_line_width'))`. It becomes a mode dropdown plus
the width, with the color field appearing below only in custom mode. `eventsSchema` is a
`memoizeLast` over its inputs, so **the derived mode must be added as a memo argument** and
passed from `buildEventsSchema`; miss that and the schema will not rebuild when the mode
changes.

**Per-calendar subform** (`schemas/entity.ts`). `row(text('color'), text('accent_color'))`
becomes the tristate dropdown, with `accent_color` narrowed back in by `entitySchemaFor` when
the mode is custom.

**Synthetic field** (`synthetic.ts`). One new `accent_color_mode` entry with its
`derive`/`apply` pair. `apply` carries the previous literal when returning to custom, the way
`start_date_mode` carries a previous offset, so toggling to "Follow Home Assistant" and back
does not silently discard the color the user typed.

**The per-calendar mode is not a `SYNTHETIC_FIELDS` entry** — that registry is card-wide
only. It follows `LABEL_TYPE`: derived in `toEntityFormData`, and skipped by name in
`fromEntityFormData` so it can never be written.

**Strings** (`strings.ts`): two field labels, their helpers, and five option labels.
`check:i18n` reconciles strings against the fields the schemas reference in both directions
and fails on a missing one. The editor translation files may lag — partial files are
supported and fall back to English per key.

---

## Part 4. Backwards Compatibility

The requirement is that every existing config renders identically, with no migration step and
no editor round-trip writing a new key. The argument has four parts.

**1. No new key exists.** The mode is derived on read and dropped on write. There is nothing
for the editor to persist, so the v4 failure shape cannot recur — that bug needed a real key
with a real default to write.

**2. Every existing value keeps its meaning.** The grammar today is "any CSS color, or
empty". `home-assistant` was not a valid CSS color before this change, so no existing config can
contain it. Absent stays inherit; a literal stays a literal. Only a value that was previously
meaningless gains meaning — the same argument that made `start_date`'s grammar safe to widen.

**3. The derived mode round-trips.** A config with `accent_color: '#ff6347'` derives
`custom`, renders the literal in the color field, and writes back `#ff6347`. A config with
the key absent derives `inherit`, renders no color field, and writes nothing. Pinned by
[test 4](#part-7-test-plan).

**4. The resolver's default path is unchanged.** The sentinel adds a branch _above_ the
existing chain in `getEntityAccentColorWithOpacity`; it does not restructure it. With no
sentinel anywhere in a config the new code is never entered. Pinned by test 9's control.

**And nothing is fetched unless asked for.** The registry subscription is gated on a config
predicate ([6.3](#63-the-gate)), so a user who never opts in pays no websocket traffic, no
`entity_registry_updated` subscription and no extra render. Without that gate the feature
would impose a cost on every existing card in order to serve the ones that opted in.

---

## Part 5. Scoping

**Per calendar: free.** `accent_color` already exists at both levels with the per-calendar
value winning (`entityConfig?.accent_color || config.accent_color`). Widening the grammar
makes the sentinel available at both levels under that same precedence with **no new scoping
machinery** — which answers the card-wide-versus-per-calendar question by following the
existing precedent rather than inventing one. Card-wide chooses the default posture; a
calendar overrides it.

**Per view: out of scope**, and worth stating rather than leaving silent. `accent_color` is
**not** in `COLUMN_OVERRIDE_KEYS`, though `vertical_line_width` and
`event_background_opacity` both are — so the accent bar's width and its tint are
column-overridable while its color is not. That asymmetry predates this issue and should not
be resolved inside it. The sentinel is a _value_ of `accent_color`, so it automatically
carries whatever view scoping the key has; if `accent_color` is ever added to the override
list, the sentinel follows for free.

**Also out of scope, recorded so they are not rediscovered:**

- Per-calendar `color`, the event title color — see [2.3](#23-alternatives-rejected).
- Event-level colors. The comment thread on #314 raises Google's per-event `colorId` via
  [home-assistant discussion 4343](https://github.com/orgs/home-assistant/discussions/4343).
  That metadata is not exposed by HA today; this design does not block it, since a per-event
  color would resolve below the per-calendar one in the same chain.
- Writing colors back to Home Assistant. The card is a consumer.

---

## Part 6. Runtime Plumbing

### 6.1 The Shape Of The Problem

The value arrives asynchronously over a websocket, while `getEntityAccentColorWithOpacity` is
synchronous and called per event during render. So the card needs a cache populated out of
band and read synchronously — which is what `utils/weather-i18n.ts` already does for
condition translations: a module-level cache, one fetch, and an `onLoaded` callback that
triggers a re-render.

### 6.2 New Module

`src/utils/entity-colors.ts`, holding:

- A `Map<entityId, string>` covering **calendar entities only**. The registry list returns
  every entity in the instance; everything else is discarded on arrival rather than retained.
- A fetch using the existing `sendCommand` shape from `weather-i18n.ts`: `hass.callWS` when
  present, else `hass.connection.sendMessagePromise`, else give up quietly. Both are already
  optional on the card's `Hass` type and both are already used this way.
- A subscription to `entity_registry_updated` through `hass.connection.subscribeEvents`,
  already on the `Hass` type, debounced, re-fetching and re-rendering on change.
- `resolveEntityColor(value)` — the card's own `computeCssColor`: the 28-token map, else pass
  through. A frozen table, pinned by value in [test 2](#part-7-test-plan).

### 6.3 The Gate

A predicate, `usesEntityColor(config)`, true when the card's `accent_color` is the sentinel or
any calendar's is. Nothing subscribes, fetches or re-renders while it is false. This is what
keeps [Part 4](#part-4-backwards-compatibility)'s last paragraph true.

### 6.4 Threading It To The Render Path

`getEntityAccentColorWithOpacity` gains an optional color-map parameter. Its only two call
sites are both in `buildEventPresentation` (`rendering/presentation.ts`), which **already
receives `hass`** — so this is one parameter through one function, and the map stays
injectable for tests rather than reached for as a module singleton.

### 6.5 Risks

- **Registry payload size.** `config/entity_registry/list` returns every entity in the
  instance. Mitigated by the [6.3](#63-the-gate) gate, a single module-level fetch shared
  across card instances, and discarding non-calendar rows immediately. Worth measuring on a
  large instance before shipping.
- **`var(--red-color)` must resolve inside the card's shadow DOM.** Custom properties inherit
  through shadow boundaries and HA's default theme defines these, so it should — but this is
  exactly the kind of "should" that belongs in a browser rather than in a document. Verify on
  a live instance under a **custom theme** as well as the default.
- **A user-typed color Home Assistant never validates.** The API accepts any string. Whatever
  comes back is written into a CSS custom property, so a junk value yields no accent rather
  than a broken card — acceptable, but pinned by test 8.

---

## Part 7. Test Plan

The suite is built from default config, so an option that is off by default is invisible to
it unless a test turns it on. Every test below turns something on.

| #   | What                     | Pins                                                                                                                                                                        |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolution chain         | Sentinel at each level, times HA color present or absent, including the card-wide-falls-to-default case in 2.4                                                              |
| 2   | Token table **by value** | `toEqual` on the whole 28-entry map, so a dropped entry fails. Not an `Object.keys()` walk — that idiom has silently shrunk three tables in this repo already               |
| 3   | Opacity and token        | `home-assistant` plus a token plus `event_background_opacity: 30` yields `color-mix(in srgb, var(--red-color) 30%, transparent)`. The 1.3 claim, tested rather than assumed |
| 4   | Editor round-trip        | A config with a hex `accent_color` survives `toStoredConfig` byte-identical, and changing an _unrelated_ field introduces no new key                                        |
| 5   | Per-calendar round-trip  | `fromEntityFormData` never writes the mode key, in any of the three modes                                                                                                   |
| 6   | Mode derivation          | Each stored shape maps to its mode, at both levels                                                                                                                          |
| 7   | Mode toggle carries      | custom, then follow, then custom preserves the typed literal                                                                                                                |
| 8   | Degradation              | No `callWS`, no `connection`, HA older than 2026.2, a junk color value, an unknown entity — no throw, falls back                                                            |
| 9   | DOM, feature **on**      | `list-dom` and `column-dom` with the sentinel and a stubbed registry. Plus a **control**: a config with no sentinel produces byte-identical DOM to today                    |
| 10  | Gate predicate           | `usesEntityColor` false means nothing fetched and nothing subscribed                                                                                                        |
| 11  | **CSS names stay CSS**   | `accent_color: red` still resolves to the CSS keyword, not `var(--red-color)`, at both levels. The [2.6](#26-token-resolution-applies-to-registry-values-only) constraint   |

Test 9's control is what would catch a regression in Part 4's claim, so it is not optional.
Test 2's phrasing matters: pin the table, do not iterate it.

Every npm gate applies, run on the Node major in `.nvmrc`.

---

## Part 8. Documentation

A user-facing change is not done until `docs/` documents it in the same PR.

| File                                 | Change                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `docs/reference/configuration.md`    | The `accent_color` row names the `home-assistant` value, in both the card-wide and per-entity tables  |
| `docs/features/core-settings.md`     | The per-entity `accent_color` row, plus a prose section with real YAML and the HA 2026.2 requirement  |
| `docs/features/layout-appearance.md` | A sentence where `accent_color` and `event_background_opacity` are already discussed together         |
| Cross-link footers                   | `**→ [Feature page](/features/…)**` from the reference section, and a link back from the feature page |

::: warning Check 21 Is Structurally Blind Here, So Widen It
Check 21 forces a reference row to name every value an option accepts — but only for
**string-literal unions in `types.ts`**. At `check-docs.mjs`, `values` comes from
`type.includes('|') ? … : aliases.get(type) || []` and the field is only registered
`if (values.length > 1)`, so a `string`-typed field yields `[]` and is never checked.
`accent_color` stays `string`, so a reference row that never mentions `home-assistant`
is a green build — check 2 passes because the option is already documented, and check 1
passes because the default is unchanged. This is the `show_countdown_allday` failure mode.

Documenting it by hand is necessary but not sufficient. **Widen check 21 in the same PR** to
cover sentinel values on `string`-typed options, so the rule is mechanical rather than
another written convention that the next person has to remember.
:::

The prose must state that the feature requires **Home Assistant 2026.2 or newer**; that in
core only **Google Calendar** sets a color automatically; that everyone else sets it per
calendar under Settings, then Devices & Services, then Entities; and what happens when it is
unset ([2.4](#24-what-happens-when-home-assistant-has-no-color)). Without that last part the
feature reads as broken to the majority described in 1.5.

**The mixed-source sentence is required, not optional.** A user running Google alongside
Local Calendar gets real colors for the Google calendars and `#03a9f4` for the rest, and
without a sentence saying so that reads as a bug rather than as the documented fallback. Say
it where the card-wide switch is introduced, not in a footnote.

Not touched in the feature PR: `README.md` and both "What's New" surfaces. Those are
release-PR work.

---

## Part 9. Implementation Order

Each step is independently reviewable and leaves the suite green.

1. **`entity-colors.ts`** — token table, `resolveEntityColor`, `usesEntityColor`. Pure, no
   I/O. Tests 2 and 10.
2. **Resolver** — the sentinel branch in `getEntityAccentColorWithOpacity`, and the map
   parameter threaded through `buildEventPresentation`. Tests 1 and 3.
3. **Registry fetch and subscription**, behind the gate. Test 8.
4. **Editor, card-wide** — synthetic field, schema, strings. Tests 4, 6, 7.
5. **Editor, per calendar** — tristate, `entitySchemaFor` narrowing, strings. Test 5.
6. **DOM tests and the control.** Test 9.
7. **Documentation**, including the mixed-source sentence, and the check 21 widening so the
   sentinel's reference row is enforced mechanically.
8. **Full gate run** on the `.nvmrc` Node major, then a live check against a real instance for
   the two [6.5](#65-risks) risks only a browser can answer, plus the
   [2.6](#26-token-resolution-applies-to-registry-values-only) regression: a card with
   `accent_color: red` must still render CSS red.

---

## Decisions

Settled by the maintainer. Recorded here because the reasoning is not recoverable from the
code.

1. **Sentinel spelling: `home-assistant`.** `entity` rejected — see
   [2.5](#25-the-sentinel-token).
2. **Two card-wide modes, three per calendar**, as
   [3.2](#32-three-modes-per-calendar-two-card-wide) argues.
3. **The `home-assistant, #ff0000` fallback grammar is deferred**, with one rider: because
   Google Calendar is the only core integration that populates the color, a user mixing
   Google with Local Calendar gets real colors for some calendars and `#03a9f4` for the
   rest, which reads as broken rather than deliberate. That needs a docs sentence now, even
   though the grammar waits. Carried into [Part 8](#part-8-documentation).
4. **Target release:** next feature release, off this branch.
5. **Minimum version: a docs statement only, no editor hint.** The card gates on no Home
   Assistant version anywhere, and this would be the only one.

A sixth decision, arrived at during implementation planning rather than from a question:
**this spec never reaches `dev`.** It lives on the feature branch and is deleted before the
feature PR opens — one finished feature, one PR, no working notes inside it.
