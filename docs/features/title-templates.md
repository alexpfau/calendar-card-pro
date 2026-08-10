# Dynamic Titles with Templates

The `title` accepts [Home Assistant templates](https://www.home-assistant.io/docs/configuration/templating/), so the card heading can show live data instead of a fixed string:

```yaml
title: "{{ now().strftime('%-d %B %Y') }}" # 14 March 2025
```

No separate option enables this. Any title containing `{{` or `{%` is rendered as a template; everything else is used exactly as written.

## 🧩 What You Can Do With It

- **Show the current date or time**

  ```yaml
  title: "{{ now().strftime('%A, %-d %B') }}" # Friday, 14 March
  ```

- **Show a sensor value**

  ```yaml
  title: 'Calendar — {{ states("sensor.outside_temperature") }}°C'
  ```

- **Change the title conditionally**

  ```yaml
  title: >-
    {% if is_state('binary_sensor.workday_sensor', 'on') %}
      Work Week
    {% else %}
      Weekend
    {% endif %}
  ```

- **Count today's events from a calendar entity**

  ```yaml
  title: '{{ state_attr("calendar.family", "message") or "Nothing scheduled" }}'
  ```

::: tip Test Your Template First
Test a template in **Developer Tools → Template** first. What renders there is exactly what the card will show.
:::

## 🔁 How Updates Work

Home Assistant renders the template on its own and pushes a new value to the card whenever something the template depends on changes — there is no polling interval to configure and no need to reload the dashboard.

- **Templates that read entities** update the moment that entity changes state.
- **Templates that use `now()`** are re-evaluated by Home Assistant on a timer, so a title showing the current time keeps itself up to date.

The rest of the card is unaffected: a title change never triggers a calendar refresh, and the events shown are exactly the same as with a static title.

::: info The First Paint
The heading is briefly empty on first paint while Home Assistant renders the template. The card never displays the raw template text.
:::

## ⚠️ When a Template Fails

Errors are reported where you can act on them, and the card itself stays usable:

- **In the visual editor**, an invalid template shows Home Assistant's own error message directly under the Title field as you type.
- **In the browser console**, the error is logged with the template that produced it.
- **On the card**, the last value that rendered successfully stays on screen. A card that has never rendered successfully shows no title rather than an error.

Error reporting for templates that fail _after_ they were accepted requires Home Assistant 2023.9 or newer. On older versions templating still works, but a template that starts failing later will simply stop updating.

::: info Literal Braces in a Title
Because templates are detected by looking for `{{` and `{%`, a title that contains those characters literally will be treated as a template. This is the one trade-off of not requiring a separate option, and a literal `{{` in a card title is not something the card supports.
:::
