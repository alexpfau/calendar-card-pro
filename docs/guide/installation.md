# Installation

Calendar Card Pro installs like any other custom Lovelace card. HACS is the recommended route because it handles updates for you; manual installation is available if you do not use HACS.

## 📦 HACS Installation (Recommended)

The easiest way to install **Calendar Card Pro** is via **[HACS (Home Assistant Community Store)](https://hacs.xyz/)**.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=alexpfau&repository=calendar-card-pro&category=plugin)

### Steps

1. Ensure **[HACS](https://hacs.xyz/docs/setup/download)** is installed in Home Assistant.
2. Go to **HACS → Frontend → Custom Repositories**.
3. Add this repository: `https://github.com/alexpfau/calendar-card-pro` as type `Dashboard`
4. Install **Calendar Card Pro** from HACS.
5. **Clear your browser cache** and reload Home Assistant.

## 📂 Manual Installation

<details>
<summary>📖 Click to expand manual installation instructions</summary>

### Steps

1. **Download** the latest release:  
   👉 [calendar-card-pro.zip](https://github.com/alexpfau/calendar-card-pro/releases/latest)

2. **Extract all files** to your Home Assistant `www` folder:  
   /config/www/

3. **Navigate to:**
   Home Assistant → Settings → Dashboards → Resources → Add Resource

4. **Add the resource** to your Lovelace Dashboard:

```yaml
url: /local/calendar-card-pro.js
type: module
```

5. **Clear cache & refresh** your browser to apply changes.

::: warning Extract Both Files
The card ships as two files: `calendar-card-pro.js` and `editor.js`. Both must sit in the
same folder, and only `calendar-card-pro.js` is named as a resource — the card fetches the
editor itself, the first time you open it, so a dashboard never downloads it.

Copying just `calendar-card-pro.js` leaves you with a card that renders normally but
cannot be configured: opening the visual editor reports that a file is missing. HACS
handles all of this for you, which is why it is the recommended route.
:::

</details>
