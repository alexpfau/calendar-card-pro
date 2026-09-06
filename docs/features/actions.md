# Actions & Interactions

Calendar Card Pro is interactive: you can let users expand a compact card to reveal more events, and bind your own tap and hold actions to the card — navigating to another view, calling a service, or opening a URL.

## 🔄 Expandable Calendar Card

One of Calendar Card Pro's most powerful features is the ability to toggle between compact and expanded mode:

```yaml
# Limit events in compact mode
compact_events_to_show: 5

# Enable expand/collapse with tap
tap_action:
  action: expand
```

When a `compact_events_to_show` limit is set, the card displays that number of events initially, adding a subtle indicator when more events are available. The `expand` action then allows users to toggle between this compact mode and the full set of events.

::: warning List View Only
The whole compact family is inert while the card is rendering as column or grid —
`compact_events_to_show`, its per-calendar form, `compact_days_to_show`,
`compact_events_complete_days`, and the `expand` action that drives them. A side-by-side
card with `tap_action: expand` has nothing visible to change until the layout is a list.

This is deliberate rather than an omission. Compact mode caps events **across the card**,
not per day, so a limit of three would fill the first day columns and leave every later one
empty — the layout would stop corresponding to consecutive days, which is the one thing a
side-by-side view has to get right.

Column density is controlled by [showing fewer columns instead](/features/column-view#showing-fewer-columns-instead), which trades columns for fit without dropping events. Grid density is controlled by [`time_grid` day-width options](/features/grid-view#fitting-narrow-cards) the same way — including the default `min_days_fallback: list`, which does switch a too-narrow grid card to the list layout, where compact caps and `expand` apply again.
:::

When using expansion with both global and per-calendar limits:

- In compact mode: Both global and per-calendar limits are enforced
- In expanded mode: **every** compact limit is removed — the card-wide caps **and** each calendar's own `compact_events_to_show`. What remains is the ordinary `days_to_show` window
- The expand/collapse state persists until manually toggled or the page is reloaded

**Example scenario**: If you have a configuration like this:

```yaml
entities:
  - entity: calendar.family
    # No limit for family calendar
  - entity: calendar.work
    compact_events_to_show: 2
    # At most 2 work events while compact
  - entity: calendar.holidays
    compact_events_to_show: 1
    # At most 1 holiday event while compact
compact_events_to_show: 4
# Show at most 4 events total in compact mode

tap_action:
  action: expand
```

In compact mode, you'll see at most 4 events total, with work showing at most 2 and holidays showing at most 1.
In expanded mode after tapping, those caps are all gone: every family, work and holiday event inside `days_to_show` is visible.

## 👆 Custom Tap & Hold Actions

Calendar Card Pro supports all standard Home Assistant actions:

```yaml
# Navigate to another view on tap
tap_action:
  action: navigate
  navigation_path: /lovelace/calendar

# Open a URL on long press
hold_action:
  action: url
  url_path: https://calendar.google.com
```

### Available Actions

Calendar Card Pro handles one action itself — `expand` — and forwards **everything else to Home Assistant's own action handler**. That means any action Home Assistant supports works here, including ones added after this page was written.

The commonly used ones:

| Action Type                       | Description                                       | Additional Parameters                                     |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `expand`                          | Toggle between compact and full calendar view     | None                                                      |
| `more-info`                       | Open the Home Assistant entity dialog             | None                                                      |
| `navigate`                        | Go to another Lovelace view                       | `navigation_path: /lovelace/view`                         |
| `url`                             | Open external URL or internal page                | `url_path: https://example.com`, `open_tab: _blank`       |
| `perform-action` / `call-service` | Call any Home Assistant action (service)          | `service: domain.service`, `service_data: { key: value }` |
| `toggle`                          | Toggle the target entity                          | None                                                      |
| `assist`                          | Open the Assist dialog                            | None                                                      |
| `fire-dom-event`                  | Fire a DOM event (used by browser_mod and others) | Any additional keys are passed through                    |
| `none`                            | Disable the action                                | None                                                      |

::: tip Both Action Names Work
Home Assistant renamed `call-service` to `perform-action` in 2024.8. Both names still work; `perform-action` is preferred for new configurations.
:::

Because these are forwarded, the parameters are Home Assistant's own — see the [Home Assistant actions documentation](https://www.home-assistant.io/dashboards/actions/) for the full list.

All actions integrate seamlessly with Home Assistant's native ripple effect and haptic feedback for a polished user experience.

Actions are set via the card's `tap_action` and `hold_action` options — see [Actions in the configuration reference](/reference/configuration#actions).
