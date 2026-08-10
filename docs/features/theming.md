# Theming & Card-Mod

Calendar Card Pro seamlessly integrates with all Home Assistant themes and fully supports card-mod customization:

- **Automatic Theme Detection**: Uses your active Home Assistant theme variables
- **Standard Card Structure**: Follows HA conventions for consistent styling
- **CSS Customization**: Accessible structure for easy card-mod targeting

## 🎨 Card-Mod Examples

**Custom title styling:**

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
title: Family Schedule
card_mod:
  style: |
    ha-card .header-container h1.card-header {
      width: 100%;
      text-align: center;
      font-weight: bold;
      border-bottom: 1px solid var(--primary-color);
      float: none !important; /* Override the default float:left */
    }
```

**Highlight today's events:**

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    /* Make today's events stand out */
    .day-table.today .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }

    /* Add subtle left border pulse animation */
    .day-table.today .event {
      border-left-width: 4px !important;
      transition: border-left-color 1s ease-in-out;
      animation: todayPulse 3s infinite alternate;
    }

    @keyframes todayPulse {
      from { border-left-color: var(--accent-color); }
      to { border-left-color: var(--primary-color); }
    }
```

**Highlight tomorrow's events:**

This works analogously to "today" as seen above, but using the "tomorrow" class. For example:

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    /* Make tomorrow's events stand out */
    .day-table.tomorrow .event-title {
      font-size: 16px !important;     /* Larger text */
      font-weight: bold !important;   /* Bold text */
      color: var(--accent-color) !important; /* Use theme accent color */
    }
```

**Frameless calendar integration:**

```yaml
type: custom:calendar-card-pro
entities:
  - calendar.family
card_mod:
  style: |
    ha-card {
      border-radius: 0;
      border: none;
      box-shadow: none;
      background: transparent !important;
    }
```

**Move time into the same row as the event title:**

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

These examples demonstrate how Calendar Card Pro can be customized to match any dashboard design using card-mod's powerful CSS customization capabilities.
