# Usage

Once **Calendar Card Pro** is installed, follow these steps to add and configure it in your Home Assistant dashboard.

## 📌 Adding the Card to Your Dashboard

1. **Ensure a Calendar Integration is Set Up**  
   Calendar Card Pro requires at least one `calendar.*` entity in Home Assistant (e.g., **Google Calendar, CalDAV**).
2. **Open Your Dashboard for Editing**
   - Navigate to **Home Assistant → Dashboard**
   - Click the three-dot menu (⋮) → **Edit Dashboard**
3. **Add Calendar Card Pro**
   - Click the ➕ **Add Card** button
   - Search for `"Calendar"` or scroll to find `"Calendar Card Pro"`
   - Select the card to add it to your dashboard
4. **Configure with the Visual Editor**
   - Click the three dots (⋮) in the top-right corner of the card
   - Select **"Configure"** to open the visual editor
   - Follow the intuitive interface to customize your calendar

> **Shortcut (Home Assistant 2026.6+):** In the card picker, switch to the **By entity** tab and pick any `calendar.*` entity. Calendar Card Pro is offered under **Community**, already pointed at that calendar and previewed with its real events — so you can skip straight to step 4. Nothing needs to be enabled for this.

> **Note:** The visual configuration editor is currently available in 11 languages, while the calendar itself supports 35 languages. Community contributions for additional editor translations are welcome!

## ⚙️ Customizing the Card

Calendar Card Pro offers two ways to customize your card:

1. **Visual Editor (Recommended)**
   - Open the comprehensive visual editor
   - Organized panels guide you through all available options
   - Changes are previewed in real-time
   - Smart validation prevents configuration errors

2. **YAML Configuration (Advanced)**
   - Use YAML configuration for advanced customization or automation
   - Reference the [📚 Configuration Variables](/reference/configuration) section for all available options

## 🚀 Next Steps

- **Try the Visual Editor** - Open the card configuration and explore the intuitive editor panels to customize your calendar
- **Discover Advanced Features** - Check out [✨ Features & Configuration](/features/editor) to learn about specialized capabilities like weather integration and event filtering
- **See Examples** - Browse the [💡 Examples](/reference/examples) section for inspiration and pre-configured setups
- **Reference Configuration** - For advanced YAML customization, use the [📚 Configuration Variables](/reference/configuration) as a complete reference
- **Get Involved!** - Check out [Contributing & Roadmap](/contributing) to learn how to contribute or see upcoming features
