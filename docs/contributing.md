# Contributing & Roadmap

## 🚀 How to Contribute

Want to improve **Calendar Card Pro**? I welcome contributions of all kinds—whether it’s **fixing bugs, improving performance, or adding new features**!

### Getting Started

1. **Fork this repo** and clone it locally.
2. **Install dependencies**:
   ```sh
   npm install
   ```
3. **Start development**:
   ```sh
   npm run dev
   ```
4. **Open a Pull Request** with your changes.

💡 For detailed contribution guidelines, see [CONTRIBUTING.md](https://github.com/alexpfau/calendar-card-pro/blob/dev/CONTRIBUTING.md).

## 📅 Roadmap & Planned Features

I am continuously working on improving **Calendar Card Pro**. Here’s what’s planned for upcoming releases:

- **New Features & Improvements** - Feature requests as proposed by community members.
- **Expanded Language Support** – Adding more languages (looking for community translations).

💡 Got a feature request? **Open a GitHub Issue** or start a **discussion**!

## 📖 Developer Documentation

For those interested in contributing code, I maintain detailed **[architecture documentation](/architecture)** that explains:

- **Code Organization** – Structure and module responsibilities.
- **Data Flow & Processing** – How events are fetched, stored, and displayed.
- **Performance Optimization** – Techniques for fast rendering and caching.
- **Design Principles** – Best practices for UI consistency and accessibility.

## 🌍 Adding Translations

**Calendar Card Pro** currently supports:

- **Bulgarian** (`bg`)
- **Catalan** (`ca`)
- **Czech** (`cs`)
- **Danish** (`da`)
- **Dutch** (`nl`)
- **English** (`en`)
- **English (British)** (`en-gb`)
- **Estonian** (`et`)
- **Finnish** (`fi`)
- **French** (`fr`)
- **German** (`de`)
- **Greek** (`el`)
- **Hebrew** (`he`)
- **Croatian** (`hr`)
- **Hungarian** (`hu`)
- **Icelandic** (`is`)
- **Italian** (`it`)
- **Latvian** (`lv`)
- **Lithuanian** (`lt`)
- **Norwegian Bokmål** (`nb`)
- **Norwegian Nynorsk** (`nn`)
- **Polish** (`pl`)
- **Portuguese** (`pt`)
- **Romanian** (`ro`)
- **Russian** (`ru`)
- **Slovak** (`sk`)
- **Slovenian** (`sl`)
- **Spanish** (`es`)
- **Swedish** (`sv`)
- **Thai** (`th`)
- **Turkish** (`tr`)
- **Ukrainian** (`uk`)
- **Vietnamese** (`vi`)
- **Chinese (Simplified)** (`zh-cn`)
- **Chinese (Traditional)** (`zh-tw`)

To add a new language:

1. **Create a new file** in `src/translations/languages/[lang-code].json`
2. **Copy the structure** from `en.json` and translate all values (never change the keys).
   The file must contain **every** key present in `en.json`, including the `editor` section.
3. **Register it in `src/translations/localize.ts`** — this is two edits:
   - add the `import` for your JSON file
   - add an entry to the `TRANSLATIONS` map. **The key must be lowercase**
     (e.g. `'en-gb'`, `'zh-cn'`), because lookups lowercase the configured language.
4. **Register it in `src/translations/dayjs.ts`** — this is also **two** edits, and both
   are required. Forgetting the second one is a silent failure: the language will work
   everywhere except relative times, which quietly fall back to English.
   - add `import 'dayjs/locale/[lang-code]';`
   - add the base language code to the `supportedLocales` array
   - _Note:_ regional variants normally need no dayjs entry, since `mapLocale()` reduces
     them to their base code (e.g. `en-gb` → `en`). Only add one if dayjs ships a distinct
     locale you actually need (as with `zh-cn` / `zh-tw`).
5. **Add your language to the supported list above** in this README, in alphabetical order.
6. **Verify** with `npm run lint` and `npm run build`
7. **Submit a Pull Request** with your changes

**Example**: To add German support, you would:

1. Create `src/translations/languages/de.json`
2. Copy the structure from `en.json` and translate all values (not keys)
3. Add `import deTranslations from './languages/de.json';` and `de: deTranslations,` in `localize.ts`
4. Add `import 'dayjs/locale/de';` **and** `'de',` to `supportedLocales` in `dayjs.ts`
5. Add a `- **German** (de)` entry to the list above

## 🏆 Acknowledgements

- **Original design inspiration** from [Calendar Add-on & Calendar Designs](https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790) by **[@kdw2060](https://github.com/kdw2060)**.
- **Interaction patterns** inspired by Home Assistant’s [Tile Card](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/cards/hui-tile-card.ts), which is licensed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md).
- **Material Design ripple interactions**, originally by Google, used under the [Apache License 2.0](https://github.com/material-components/material-components-web/blob/master/LICENSE).

Calendar Card Pro is released under the [MIT License](https://github.com/alexpfau/calendar-card-pro/blob/main/LICENSE). Full third-party attributions are listed in [NOTICE](https://github.com/alexpfau/calendar-card-pro/blob/main/NOTICE).
