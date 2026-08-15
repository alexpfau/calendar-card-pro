# Contributing to Calendar Card Pro

Thank you for your interest in contributing to Calendar Card Pro! This document outlines the process for contributing to the project, including code changes, translations, and bug reports.

## Understanding the Codebase

Before contributing code, I strongly recommend reviewing my [architecture documentation](./docs/architecture.md), which explains:

- Module organization and responsibilities
- Data flow and event handling
- Performance optimization techniques
- Design principles and patterns

## Development Environment Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/[your-username]/calendar-card-pro.git`
3. Install dependencies: `npm install`
4. Start development mode: `npm run dev`
5. The build emits **two** files into `dist/`: `calendar-card-pro-dev.js` and
   `editor-dev.js` — the card fetches the editor by URL when someone opens it. Both must
   be installed together; a production build (`npm run build`) emits the same pair without
   the `-dev` suffix, and those two files are exactly what a release attaches
6. For testing in Home Assistant, follow the [testing instructions](#testing-in-home-assistant)

## Branch Structure

The repository follows this branch structure:

- **`main`**: Production-ready code, each release is tagged
- **`dev`**: Ongoing development branch where features are integrated
- **Feature branches**: Individual features/fixes (branch from `dev`, merge back to `dev` via PRs)

### Workflow

1. Create feature branches from `dev` for new features or bug fixes
2. Develop and test your changes in the feature branch
3. Submit a PR to merge your feature branch into `dev`
4. After review and testing, changes in `dev` are periodically merged into `main` for releases

## Testing in Home Assistant

To test your changes in a real Home Assistant environment:

1. Copy **both** build outputs into your Home Assistant's `www/community/calendar-card-pro/`
   folder, keeping them side by side in the same directory:
   - `dist/calendar-card-pro-dev.js`
   - `dist/editor-dev.js`
2. Add the resource to Home Assistant. Register **only the card** — the editor is never a
   Lovelace resource, because the card loads it on demand:
   ```yaml
   url: /hacsfiles/calendar-card-pro/calendar-card-pro-dev.js
   type: module
   ```
3. Add the card to your dashboard using type: `custom:calendar-card-pro-dev`
4. Test with various calendar types and configurations
5. Verify performance with both small and large event sets

> **⚠️ Copy both files, not just the card**
>
> The card loads the visual editor on demand, resolving `./editor-dev.js` against its own
> URL. Copy only `calendar-card-pro-dev.js` and the card renders perfectly — then the
> editor 404s the moment you open it, which looks like a code bug rather than a missing
> file. The two files must sit in the same directory.

> **💡 Pro Tip: Defeating Home Assistant's Aggressive Caching**
>
> Home Assistant aggressively caches resources, and sometimes your changes won't appear even after clearing browser cache or restarting Home Assistant. To solve this:
>
> 1. Add a version query parameter to your resource URL:
>    ```yaml
>    url: /hacsfiles/calendar-card-pro/calendar-card-pro-dev.js?v=1
>    type: module
>    ```
> 2. Each time you update the file and want to test new changes, increment the version number:
>    ```yaml
>    url: /hacsfiles/calendar-card-pro/calendar-card-pro-dev.js?v=2
>    type: module
>    ```
>
> You only ever bump this on the card. The card copies its own query string onto the
> editor URL it builds, so `?v=2` fetches `editor-dev.js?v=2` as well and the two can
> never fall out of sync — provided you remembered to copy the new `editor-dev.js` across.

> **Note:** The build system emits **two** files, and renames both depending on the build mode:
>
> - Development build (`npm run dev`): `calendar-card-pro-dev.js` + `editor-dev.js`
> - Production build (`npm run build`): `calendar-card-pro.js` + `editor.js`
>
> This naming convention allows both development and production versions to coexist in the same Home Assistant directory, making it easier to test changes alongside the stable version installed via HACS. The Home Assistant card element name also includes the `-dev` suffix in development mode, ensuring there's no conflict between versions.

## Adding New Translations

Calendar Card Pro ships translations for the card and, separately, for the visual editor.
Wiring up a language touches several files across both, and missing one of them fails
silently — so the full, current instructions live in a single place rather than being
repeated here:

**→ [Adding Translations](https://calendar-card-pro.alexpfau.com/contributing#adding-translations)**

That guide covers both namespaces:

- **Card translations** — `src/translations/languages/*.json`. Every language is loaded
  eagerly, so each new one also needs wiring in `localize.ts` and `dayjs.ts`. These files
  must **not** contain an `editor` section; `npm run check:i18n` rejects one.
- **[Editor translations](https://calendar-card-pro.alexpfau.com/contributing#translating-the-editor)**
  — `src/rendering/editor/translations/*.json`, loaded only when the editor is opened.
  These are optional and may be partial: each key falls back to English on its own, so
  anything you leave out simply renders in English.

Whichever you are adding, verify it mechanically before opening a pull request:

```bash
npm run check:i18n
```

It checks the wiring, not the wording — it cannot tell you whether your Latvian reads well,
but it catches every way a language can end up half-registered, including the silent dayjs
one that leaves relative times quietly in English.

## Code Style and Quality Standards

- Follow TypeScript best practices and maintain strict typing
- Use the established module structure - place new code in the appropriate module
- Follow the existing patterns for similar functionality
- Document all public functions with JSDoc comments
- Run linting and formatting before submitting: `npm run lint` (the script already applies
  `--fix`) and `npm run format`. Formatting covers the whole repo, documentation included,
  and `npm run check:format` fails the pull request if you skip it
- Add a test when you add a config option. The Vitest suite in `tests/` is built from
  default config, so an option defaulting to `false` renders nothing and stays invisible
  to it unless a test turns the option on
- Keep bundle size in mind - avoid large dependencies

## Pull Request Process

1. Create a feature branch from `dev` (`feature/my-new-feature`)
2. Make your changes following our code style guidelines
3. Run every gate CI runs. A green local run should mean a green pull request:

   ```bash
   npx tsc --noEmit      # typecheck — deliberately not an npm script
   npm run lint
   npm run check:format  # prettier across the whole repo, docs included
   npm test
   npm run check:i18n    # translation wiring
   npm run check:docs    # docs and config parity — gates every PR, not only docs changes
   npm run build
   npm run check:bundle  # after the build; it reads dist/
   ```

   `check:docs` is the one that surprises people: it reads like a docs-only concern but
   gates every PR, and adding a config option without a reference-table row fails it —
   which is the point.

4. Submit a PR against the **`dev`** branch (not `main` — `main` only receives release
   PRs from `dev`)
5. Respond to any feedback during code review

## Bug Reports

When filing a bug report, please include:

1. A clear description of the issue
2. Steps to reproduce the problem
3. Expected behavior
4. Actual behavior
5. Version of Calendar Card Pro and Home Assistant
6. Browser and OS information
7. Screenshots if applicable

Thank you for contributing to Calendar Card Pro!
