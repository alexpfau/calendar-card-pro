<a name="top"></a>

# Fork of alexpfau's Calendar Card Pro for Home Assistant
# with support for label_icon_color added

Example:

<img width="479" height="216" alt="image" src="https://github.com/user-attachments/assets/0a343cc0-aeb3-453b-af84-bc3278dc4ad7" />

Code:

<code>
  type: custom:calendar-card-pro
  title: Termine
  title_font_size: 18pt
  week_separator_width: 2px
  today_indicator: pulse
  day_font_size: 24px
  days_to_show: 3
  compact_days_to_show: ""
  compact_events_complete_days: true
  entities:
    - entity: calendar.abfallkalender
      allowlist: Biotonne
      label: mdi:flower-outline
      accent_color: "#966919"
      label_icon_color: "#966919"
    - entity: calendar.abfallkalender
      allowlist: Gelber
      label: mdi:recycle
      accent_color: "#ffc170"
      label_icon_color: "#ffc170"
</code>code>
