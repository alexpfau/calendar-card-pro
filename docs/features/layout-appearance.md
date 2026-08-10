# Layout & Appearance

## 📐 Card Dimensions & Scrolling

Calendar Card Pro offers flexible options for controlling the card's size and scroll behavior:

```yaml
# Fixed height - card always maintains exactly this height
height: '300px'

# Maximum height - card grows with content up to this height
max_height: '300px'

# Additional padding inside the card
additional_card_spacing: '10px'
```

The card offers two distinct height control mechanisms:

- **Fixed Height (`height`)**: Creates a card with exactly the specified height regardless of content amount. This is ideal when you need a card that perfectly fits a specific dashboard layout.

- **Maximum Height (`max_height`)**: Allows the card to grow naturally up to the specified limit. This provides flexibility while still ensuring the card doesn't become too large.

Both options provide:

- Automatic scrolling when content exceeds the available space
- Modern, clean scrollbars that only appear during hover/scrolling
- Consistent behavior across desktop and mobile browsers

## 🎨 Visual Styling & Colors

Customize the appearance of your calendar with various styling options:

```yaml
# Card background and title
title: 'My Calendar'
title_font_size: '20px'
title_color: 'var(--primary-color)'
background_color: 'var(--ha-card-background)'

# Event appearance
event_background_opacity: 15 # 0-100 scale for background color intensity
vertical_line_width: '3px' # Width of the colored event indicator line
```

The `event_background_opacity` setting (ranging from 0-100) works together with each calendar's `accent_color` to create semi-transparent backgrounds for events. At 0 (default), events have no background color. Higher values create more intense backgrounds.

When styling your calendar, you can use:

- CSS color values (`#ff6c92`, `rgba(255,0,0,0.5)`)
- Home Assistant theme variables (`var(--primary-color)`)
- Named colors (`red`, `blue`)

## 📏 Spacing & Alignment

Fine-tune the spacing and alignment of your calendar elements:

```yaml
# Spacing between elements
day_spacing: '8px' # Space between different calendar days
event_spacing: '6px' # Internal padding within each event

# Date column alignment
date_vertical_alignment: 'top' # Options: 'top', 'middle', 'bottom'

# Event icon alignment
event_icon_vertical_alignment: 'top' # Options: 'top', 'middle', 'bottom'
```

The `date_vertical_alignment` option controls how dates align with their events, which is especially noticeable when a day has many events. The default `middle` setting centers the date between its events, while `top` aligns it with the first event and `bottom` with the last event.

`event_icon_vertical_alignment` does the same job one level down, for the small icons on an event's time, location and description rows. It only becomes visible when one of those wraps onto a second line: the default `middle` centres the icon against the whole block, while `top` lines it up with the first line of text.

## 📅 Week Numbers & Visual Separators

For improved organization with longer calendar views, you can enable week numbers and visual separators:

```yaml
# Week number configuration
show_week_numbers: 'iso' # 'iso', 'simple', or null to disable
show_current_week_number: true # Show week number for the first week
first_day_of_week: 'monday' # 'monday', 'sunday', or 'system'

# Week number styling
week_number_font_size: '12px'
week_number_color: 'var(--primary-text-color)'
week_number_background_color: '#03a9f450'

# Separator configuration
day_separator_width: '1px' # Line between days
day_separator_color: '#03a9f430'
week_separator_width: '2px' # Line between weeks
week_separator_color: '#03a9f480'
month_separator_width: '3px' # Line between months
month_separator_color: '#03a9f4'
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_4_week_numbers.png" alt="Week Numbers" width="600"><br>

This feature creates a sophisticated visual hierarchy with:

- **Week Number Indicators**: Pill-shaped badges showing the current week number
- **Visual Separators**: Horizontal lines of varying thickness to distinguish between days, weeks, and months
- **Smart Precedence**: When multiple separators could appear at once (like when a week also changes month), the most significant one (month) takes priority

The separators follow an intelligent precedence system:

- When multiple separators could appear simultaneously (e.g., a day that's both the start of a week and a month), the most significant one (month) takes visual priority
- This creates a clean visual hierarchy: months > weeks > days

Week numbers can be displayed using either:

- **ISO Week Numbering**: Weeks start on Monday, and the first week of the year is the one containing the first Thursday (ISO 8601 standard)
- **Simple Week Numbering**: Counts weeks starting from January 1st

## 📆 Date Column Customization

Control the appearance of the date column for a personalized calendar view:

```yaml
# Base date column styling
weekday_font_size: '14px'
weekday_color: 'var(--primary-text-color)'
day_font_size: '26px'
day_color: 'var(--primary-text-color)'
month_font_size: '12px'
month_color: 'var(--primary-text-color)'

# Special styling for weekends (inherits from base when not specified)
weekend_weekday_color: '#e67c73' # Weekend day names
weekend_day_color: '#e67c73' # Weekend day numbers
weekend_month_color: '#e67c73' # Weekend month names

# Special styling for today (inherits from base/weekend when not specified)
today_weekday_color: '#03a9f4' # Today's weekday name
today_day_color: '#03a9f4' # Today's day number
today_month_color: '#03a9f4' # Today's month name
```

The date column appears on the left side of each day's events and helps users quickly identify when events occur. By default, all dates use the base styling, but you can apply special styling to:

- **Weekend days** (Saturday and Sunday) using the `weekend_*` parameters
- **Today's date** using the `today_*` parameters

When special styling parameters are not specified, they will inherit from the base styling. If today falls on a weekend, today styling takes precedence over weekend styling.

## 🌟 Today Indicator

Calendar Card Pro provides a sophisticated way to highlight the current day with a customizable indicator:

> **Visual Editor:** Configure today indicators in the "Date Display" section, where you can choose from dots, pulses, glows, custom icons, emojis or images, and adjust their position.

```yaml
# Enable and choose indicator type
today_indicator: true # Enable basic dot indicator (default)
today_indicator: pulse # Animated pulsing dot
today_indicator: glow # Glowing dot
today_indicator: mdi:star # Any Material Design icon
today_indicator: 🎯 # Emoji
today_indicator: /local/custom-indicator.png # Image path

# Position the indicator precisely with CSS-like coordinates
today_indicator_position: "15% 50%" # Centered left in the date column (default)
today_indicator_position: "15% 15%" # Top left
today_indicator_position: "85% 15%" # Top right

# Restyle the indicator
today_indicator_color: "#03a9f4" # Colour — applies to the dot and to MDI icons (default)
today_indicator_size: 6px # Size — applies to icons, emojis and images alike (default)
```

<img src="https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/example_today_indicator.png" alt="Today Indicator" width="600"><br>

The indicator is precisely positioned and always properly centered on the coordinates specified, making it ideal for creating visual emphasis on today's date.

Available indicator types:

- `true` or `dot`: Simple dot indicator
- `pulse`: Animated pulsing dot
- `glow`: Glowing dot with subtle light effect
- `mdi:icon-name`: Any Material Design Icon
- Emoji characters: Any emoji like `🎯` or `⭐`
- Image path: Any image URL or local path

The `today_indicator_position` parameter accepts CSS-like position values in the format "x% y%", allowing precise placement of the indicator anywhere within the date column.

`today_indicator_size` scales every indicator type — it sets the icon size, the emoji font size and the image width. `today_indicator_color` colours the icon-based types (the dot, `pulse`, `glow` and any `mdi:` icon) and is also the colour of the glow itself; emojis and images keep their own colours.
