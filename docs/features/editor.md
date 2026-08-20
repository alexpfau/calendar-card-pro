# Visual Configuration Editor

Calendar Card Pro includes a comprehensive visual editor that makes configuration intuitive and accessible—no YAML required!

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_editor.png" alt="Visual Configuration Editor" width="600"><br>

To open it, click the three dots (⋮) in the top-right corner of the card and select **Configure**. If you have not added a card yet, start with [Usage](/guide/usage).

## 🗂️ Editor Organization

The editor is organized into nine panels, each named for what it configures rather than for where the option happens to live in YAML. They are listed here in the order the editor shows them:

| Panel                    | What it covers                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| **Calendars**            | Which calendars the card shows, and how each one looks             |
| **Layout**               | How the card arranges days, and how much room it takes up          |
| **Time Range & Content** | Which days the card covers, and what it puts in them               |
| **Card & Title**         | The card itself, and the heading above it                          |
| **Day Header**           | How each day announces itself, whichever layout it is announced in |
| **Events**               | The events themselves, and the lines each one can carry            |
| **Separators**           | The rules the card draws between days, weeks and months            |
| **Weather**              | A forecast beside the day, beside the event, or both               |
| **Actions & Refresh**    | What a tap does, and how often the card re-reads its calendars     |

Panels open one at a time, and options inside them appear only when they apply — enabling a feature reveals the settings that belong to it.

The longer panels are divided further by sub-headings, which name what the options beneath them decide. **Calendars** and **Time Range & Content** share the same spine, because they configure the same pipeline one level apart: **Which Events Appear** comes first, then **Events Across Several Days**. A calendar adds **Label & Colors** above them and **What Each Event Shows** below; the card-level panel adds **When There Is Nothing To Show** at the end. Reading either panel therefore answers the same questions in the same order.

## ✨ Key Features

- **Live Preview** — see changes immediately as you configure the card
- **Context-Aware Options** — settings appear only when they are relevant, so a panel shows what applies rather than everything that exists
- **Search** — find any option by name or by what it does, without knowing which panel holds it
- **Customized Only** — hide everything left at its default, to see what a card actually changes
- **Per-View Exceptions** — give an option a different value in column view without leaving the editor

::: info Editor Language Support
The editor is available in **11 languages**, and the calendar itself in **35**. Nine of the eleven — German, Estonian, Italian, Latvian, Lithuanian, Norwegian Bokmål, Polish, Slovak and Swedish — are translated in full. English is the source language and lives in the card's code rather than in a translation file, and British English carries only the strings where it differs from it.

Translation resolves **per string**: a label that has been translated appears in your language, and one that has not appears in English, in the same form. That is what makes a partial translation genuinely useful — every string you add appears immediately, without waiting for the rest.

If your language is not among the 11 the editor is entirely in English. Either way, calendar settings applied through it still display correctly in all 35 supported languages, and contributions of further editor translations are very welcome.
:::

## 🔎 Search & Customized Only

The editor holds several hundred options, so it opens with a search box above the panels.

Typing filters every panel down to what matches and drops the panels — and the groups inside them — that have nothing left, so a match is never hidden behind a collapsed heading. What survives is expanded for you. A sub-heading is never itself a match: it survives only to caption a result beneath it, so searching a word that appears in a heading and nowhere else returns nothing rather than a heading with an empty section under it.

Search matches what is on screen: the name of a setting, the sentence explaining it, and the choices a dropdown offers. Typing `width` finds **Minimum Day Width**; typing `iso` finds the week-number control, because that is where the word appears. It also matches the YAML option name, so a key copied out of the [Configuration Options reference](/reference/configuration) leads straight to its control.

**Customized Only** hides everything still set to the value the card would use anyway, leaving exactly what this card changes. It reads values the way the card does, so a number written as `"3"` in YAML counts as untouched when `3` is the default, and a value the card rejects counts as untouched too — because that is what the card is using.

Three things follow their own rule under it, for reasons worth knowing:

- **Calendars** show only the ones you have given settings of their own, which is a quick way to see which calendars have a color or a label and which simply follow the card.
- **Per-calendar options** count as customized when they are set at all. Several of them mean "follow the card" when left alone, so `Show Time: Off` on one calendar is a real setting rather than a default.
- **Exceptions** are always shown, since an option you asked to differ in one layout is a customization by definition — even before you change its value.

::: tip Not Everything Is There To Be Found
The editor only offers the settings your current configuration calls for: a fixed card height appears once the height mode is fixed, and the compact-mode modifier appears once there is an event limit for it to modify. A search cannot turn up a control that is not on screen, so if nothing matches, check whether the option it depends on is switched on.
:::

## 🏷️ Per-Calendar Labels

Each calendar under the picker gets its own collapsible form, and the first control in it
is **Label Type**. A label is the mark shown before every event from that calendar, and it
can be four things — nothing, text or an emoji, an icon, or an image.

Most of the time the type is not stored at all. It is read back from the value, because
the value is usually enough to decide how the card draws it: `mdi:home` is an icon,
`/local/work.png` is an image, and anything else is text. That is why a calendar
configured in YAML opens with the right control already selected, without a `label_type`
option anywhere in it.

The type is only written out when the value alone would give the wrong answer — picking
**Text or Emoji** and then typing `mdi:home`, for example, or picking **An Icon** before
choosing one. In those cases `label_type` is stored alongside `label` and takes
precedence over the value, so the card draws what you chose rather than what the value
looks like.

Choosing **An Icon** gives you Home Assistant's icon picker rather than a box you have to
know `mdi:` to use, and it is the only type for which **Label Icon Color** appears — that
color does nothing unless the label is an icon, so it is no longer shown under every
calendar.

::: tip Your Choice Wins Over the Value
Type `mdi:calendar` into the text box and the card renders it as the literal text
`mdi:calendar`, not as an icon. The editor records that you asked for text, so the value
is left alone rather than being reinterpreted. Switch **Label Type** to **An Icon** to
get the icon picker.
:::

**→ [Entity configuration options](/features/core-settings#available-options-for-entity-configuration-objects)** — the `label` option itself, and the rest of the per-calendar table.

## ⚖️ Column View Exceptions

Every panel that owns an option the column layout can override ends with a collapsed
**Column View Exceptions** group. Pick an option there and it gets a second control, whose
value applies only when the card renders as columns; remove it and the option returns to
the shared value above. A card with no exceptions costs one collapsed heading and nothing
else.

The control an exception gets is the same control the option has in the panel above, which
now holds for every overridable option without exception. Three of them store more than one
kind of value in one key — week numbers, the today indicator, and country removal in
locations — so each gets the same type dropdown it has in its own panel rather than being
left to hand-written YAML.

An exception that ends up equal to the value it would inherit is not written to your
configuration, so setting one back to the shared value removes the line rather than
pinning it.

**→ [Column View](/features/column-view)** — the `column:` block, and what may go in it.

## 🔄 Deprecated Options

Five options were removed in v3.0.0. They are **inert** — the card has not read them in three major versions — so a configuration still carrying one is not doing what it says:

| Removed                 | Use instead              |
| ----------------------- | ------------------------ |
| `max_events_to_show`    | `compact_events_to_show` |
| `vertical_line_color`   | `accent_color`           |
| `horizontal_line_width` | `day_separator_width`    |
| `horizontal_line_color` | `day_separator_color`    |
| `row_spacing`           | `day_spacing`            |

`max_events_to_show` is also recognized on an individual entry under `entities:`.

**Opening a card in the editor and saving removes them.** There is no button to press: because the options do nothing, deleting them changes no behavior, and leaving them in place only misleads whoever reads the YAML next. Their replacements are not filled in for you — the card has been running on defaults for those settings, so setting them now is a change you should make deliberately.

::: warning YAML Is Not Migrated Automatically
The pruning happens **only when the visual editor saves**. There is no runtime migration, so a deprecated option written directly in YAML is ignored and the card falls back to the default — it does not keep working under the old name.

The card does tell you when this happens: each deprecated option found in your configuration is reported in the browser console, naming the current option to use in its place. Open your browser's developer tools and look for messages prefixed with `📅 Calendar Card Pro`. If you manage your card in YAML, use the current names from the [Configuration Options reference](/reference/configuration).
:::
