/**
 * Helper utilities for Calendar Card Pro
 *
 * General purpose utilities: color conversion, indicator and label type
 * detection, ID generation and hashing, locale-aware formatting, config
 * default filtering, and single-entry memoization.
 */

import * as EntityIcons from './entity-icons';
import * as PersonPictures from './person-pictures';

//-----------------------------------------------------------------------------
// COLOR UTILITIES
//-----------------------------------------------------------------------------

/** Resolved RGBA cache keyed by `${color}|${opacity}`; avoids repeated computed-style lookups. */
const rgbaCache = new Map<string, string>();

/**
 * Convert any color format to RGBA with specific opacity
 *
 * @param color - Color in any valid CSS format
 * @param opacity - Opacity value (0-100)
 * @returns RGBA color string
 */
export function convertToRGBA(color: string, opacity: number): string {
  const cacheKey = `${color}|${opacity}`;

  const cached = rgbaCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result = computeRGBA(color, opacity);
  rgbaCache.set(cacheKey, result);
  return result;
}

function computeRGBA(color: string, opacity: number): string {
  if (color.startsWith('var(')) {
    // `color-mix` rather than `rgba(...)`, because a `var()` reference cannot be taken
    // apart into the three channel values `rgba()` needs. The previous form emitted
    // `rgba(var(--calendar-color-rgb, 3, 169, 244), …)` against a variable this card
    // defines nowhere and no theme knows about, so the literal fallback — which is the
    // default `accent_color` `#03a9f4` — won every time. A themed `var(--primary-color)`
    // silently rendered as the shipped blue, and the failure was invisible on a default
    // config precisely because the two agree there.
    //
    // Mixing with `transparent` keeps the whole expression live, so it still follows a
    // theme switch: nothing is resolved at call time, which matters because `rgbaCache`
    // is module-level and never evicted. The stylesheet already applies transparency this
    // way (the progress bar's track and the today outline), so this is the idiom the card
    // uses everywhere else rather than a new dependency.
    return `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
  }

  if (color === 'transparent') {
    return color;
  }

  const tempElement = document.createElement('div');
  tempElement.style.display = 'none';
  tempElement.style.color = color;
  document.body.appendChild(tempElement);

  const computedColor = getComputedStyle(tempElement).color;
  document.body.removeChild(tempElement);

  if (!computedColor) return color;

  const rgbMatch = computedColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  const rgbaMatch = computedColor.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  return color;
}

//-----------------------------------------------------------------------------
// INDICATOR TYPE DETECTION
//-----------------------------------------------------------------------------

/**
 * Checks if a string is a Home Assistant icon value (e.g., mdi:calendar, phu:octopusenergy, fas:home)
 *
 * @param value String to check
 * @returns True if the string matches the HA icon format (prefix:icon-name)
 */
export function isIconValue(value: string): boolean {
  return /^[a-z][a-z0-9]*:[a-z0-9]/i.test(value) && !value.startsWith('http');
}

/**
 * Determine the type of today indicator based on the value
 *
 * @param value The today_indicator value from config
 * @returns Type of indicator ('dot', 'pulse', 'glow', 'mdi', 'image', 'emoji', 'none')
 */
export function getTodayIndicatorType(value: string | boolean): string {
  if (value === undefined || value === false) {
    return 'none';
  }

  if (value === true) {
    return 'dot';
  }

  if (typeof value === 'string') {
    // 🚨 `dot` belongs here and not in the fallthrough, which is where it used to arrive.
    // It is a documented value and it is what the editor's own Dot option writes
    // (`BUILT_IN_INDICATORS`), so it reached the right answer only because *every*
    // unrecognized string did. The moment the fallthrough below became text rather than a
    // dot, that accident would have drawn the word "dot" on the card.
    if (value === 'dot' || value === 'pulse' || value === 'glow') {
      return value;
    }

    // Nothing to draw. `renderTodayIndicator` short-circuits on a falsy value before it ever
    // asks, so this is here for the editor, which does ask: without it an empty field would
    // read as text and open the Custom control on a value that is not set.
    if (value.trim() === '') {
      return 'dot';
    }

    if (isIconValue(value)) {
      return 'mdi';
    }

    // The same two arms `getLabelType` uses, and for the same reason: an address is a shape,
    // not a list of filenames. The list this replaces missed an absolute URL carrying no
    // extension, the four-letter `.jpeg`, and `avif`, `bmp`, `ico` and `apng` — and, being
    // `includes` on a lower-case literal, missed `.PNG` and `.JPEG` outright (#569).
    //
    // 🚨 What this costs changed when the fallthrough became text (#573). It used to cost
    // nothing at all — the only values these arms could claim were ones that reached `dot`,
    // the bucket for "not understood" — and that was the argument for widening them without
    // an escape hatch. Now they can claim a value that would otherwise be *drawn*, so the
    // rule is the trade instead: an address-shaped value is an image, everything else is
    // drawn literally, and there is no way to ask for an address-shaped value as text.
    // `label` makes the same trade and can undo it with `label_type`; this option has no
    // counterpart, so the case to weigh is a badge that is meant to read as `/dev` or as a
    // URL. Both are addresses far more often than they are captions.
    if (value.startsWith('/') || /^https?:\/\//i.test(value)) {
      return 'image';
    }

    // 🚨 Anchored, where the old test was `includes`, so this narrows as well as widens:
    // `report.gifted`, `a.pngx` and `Meeting.jpg tomorrow` were images and are now text.
    // That is deliberate. With the two prefix arms above taking every absolute path and every
    // URL, this arm is only ever reached by a *relative* path — and a relative path that is an
    // image ends at its extension, or at the `?` or `#` that ends the path. So the set this
    // gives up contains no address the card could have loaded; it drew a broken `<img>` for
    // each of them. `getLabelType` carries the same anchor for the same reason.
    if (/\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(value)) {
      return 'image';
    }

    // Anything still here is drawn as its own characters (#573).
    //
    // This used to be `/[\p{Emoji}]/u`, which is not "is this a pictograph": the Unicode
    // `Emoji` property is `Yes` for the ASCII digits, `#` and `*`, because those are the
    // bases of keycap sequences. So `Sprint 12` was drawn as text and `Sprint` was drawn as
    // a dot, and nothing in the config, the docs or the editor explained the difference —
    // the option had a text mode gated on whether the text happened to contain a digit.
    //
    // Widening it rather than narrowing it is the one direction that takes nothing away:
    // every value that drew text before still draws text, `dot`/`pulse`/`glow` are matched
    // above, and `true`/`dot` remain the way to ask for a plain dot. What it costs is the
    // "I typed nonsense and got a dot" fallback — a typo is now visible instead of looking
    // deliberate, which is the better failure for an option whose whole defect history is
    // silent fallbacks.
    //
    // The returned name stays `emoji` on purpose. It is the discriminator for a branch that
    // renders the value verbatim, and it decides the public `today-indicator emoji` class
    // that themes and card-mod select on; renaming it would break those to no benefit.
    return 'emoji';
  }

  return 'none';
}

/**
 * The four shapes a calendar's label can take
 */
export type LabelType = 'none' | 'icon' | 'image' | 'text';

/**
 * Narrow an unknown configuration value to a supported label shape.
 *
 * @param value Value read from the configuration
 * @returns True when the value names one of the four label shapes
 */
export function isLabelType(value: unknown): value is LabelType {
  return value === 'none' || value === 'icon' || value === 'image' || value === 'text';
}

/**
 * Determine which of the four shapes a calendar's label value looks like
 *
 * @param label Label value from a calendar's configuration
 * @returns Shape the value looks like ('none', 'icon', 'image' or 'text')
 */
export function getLabelType(label: unknown): LabelType {
  if (typeof label !== 'string' || label === '') {
    return 'none';
  }

  // 🚨 Before the shape tests, not after. The sentinel is a bare word, so every test below
  // declines it and the final `return 'text'` would claim it — rendering the literal string
  // `home-assistant` as the label rather than the icon it stands for. It is also what keeps
  // `needsExplicitType` from writing a redundant `label_type: icon` beside it, and what makes
  // the editor open the icon panel for a calendar that stores nothing but the sentinel.
  //
  // `resolveLabelType` still lets an explicit `label_type` win, so `label_type: text` remains
  // the way to mean those words literally. That is the escape hatch this claim rests on.
  if (EntityIcons.isEntityIconSentinel(label)) {
    return 'icon';
  }

  // The other half of the same "let Home Assistant answer" family, and here for the same
  // reason the sentinel is: `person.anna` is a dotted lower-case token that every test below
  // declines, so the final `return 'text'` would claim it and draw the entity id in front of
  // every event — which is exactly what it did before this arm existed.
  //
  // `image` rather than a fifth shape, because a picture *is* what gets drawn: the value is
  // swapped for the person's `entity_picture` in `EventUtils.resolveEntityLabel` before
  // anything renders, and what arrives at `renderLabel` is an ordinary address. So this says
  // what the label will be, not what it is written as — the same thing the sentinel's `icon`
  // says one arm up.
  //
  // 🚨 Sitting beside the sentinel is readability, **not** precedence, and the difference is
  // worth stating because the sentinel's own note one arm up is about precedence and reads as
  // though it applies here too. Moving this below the extension arm changes nothing: the two
  // overlap on exactly ten strings — `person.` followed by one of the nine picture extensions
  // — and both answer `image`, so no ordering of them can disagree. Verified by moving it and
  // running the suite: 2810 unit tests, none of them cared.
  //
  // What actually decides those ten is `resolveEntityLabel`, which asks `isPersonEntityId` and
  // nothing else — so `person.png` resolves as a person's picture wherever this arm sits. That
  // is the right answer for them: they are legal person ids but, as image paths, relative ones
  // that Home Assistant serves nothing at. `label_type: text` is the way back, as it is for
  // the sentinel and for a slash-leading word.
  if (PersonPictures.isPersonEntityId(label)) {
    return 'image';
  }

  if (isIconValue(label)) {
    return 'icon';
  }

  // An address, not a word. A label meant to be *read* never starts with a slash or a
  // scheme, so taking those as images covers every image path Home Assistant serves — and
  // every one it adds later — without a prefix list that has to be kept in step with it.
  //
  // The list is what this replaces, and it was a claim about the outside world that had
  // already gone stale: it accepted `/local/` alone, while one ordinary instance served
  // pictures from six further families (`/api/image` — which is where a *person's* picture
  // lives — plus `/api/brands`, `/api/hassio`, `/api/image_proxy`, `/api/camera_proxy` and
  // `/api/media_player_proxy`). 52 of that instance's 169 `entity_picture` values missed
  // both arms and were drawn as their own characters in front of the event title (#566).
  //
  // The cost is a text label that begins with a slash, which now draws a broken image. That
  // is recoverable the same way the `home-assistant` sentinel above is — `label_type: text`
  // outranks everything here — and it is the same trade `getTodayIndicatorType` already
  // makes, for the same kind of free-text value.
  if (label.startsWith('/') || /^https?:\/\//i.test(label)) {
    return 'image';
  }

  // 🚨 Not redundant, and not to be folded into the test above: a *relative* path starts
  // with neither a slash nor a scheme, so this is the only arm that can see one. Retiring
  // it — which #566 proposed — would turn `photo.JPEG` back into text, a case
  // `label-glyph.test.ts` has pinned since before v4.0.0 shipped.
  //
  // The trailing group is the other half of the same defect. Anchoring on `$` alone meant a
  // query string defeated the match even where the path did end in `.png`, so
  // `/api/brands/…/icon.png?placeholder=no` read as text; `?` and `#` end a path, so what
  // follows one cannot be part of the filename.
  if (/\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(label)) {
    return 'image';
  }

  return 'text';
}

/**
 * The shape a calendar's label holds, preferring what the configuration says over what
 * the value itself looks like.
 *
 * @param label Label value from a calendar's configuration
 * @param labelType Shape the configuration names, if it names one
 * @returns The shape to render and to offer in the editor
 */
export function resolveLabelType(label: unknown, labelType?: unknown): LabelType {
  return isLabelType(labelType) ? labelType : getLabelType(label);
}

/**
 * Generate a random instance ID
 *
 * @returns {string} Random alphanumeric identifier
 */
export function generateInstanceId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a deterministic ID based on calendar config
 *
 * @param entities Array of calendar entities
 * @param daysToShow Number of days to display
 * @param startDate Optional custom start date
 * @param firstDayOfWeek Raw `first_day_of_week` setting. Included because
 *   `hasConfigChanged` treats it as fetch-affecting — a week-relative `startDate`
 *   resolves to a different window when it changes — and the two must agree, or a
 *   failed refresh keeps the previous window's events under the new identity.
 * @returns Deterministic ID string based on input parameters
 */
export function generateDeterministicId(
  entities: Array<string | { entity: string; color?: string }>,
  daysToShow: number,
  startDate?: string,
  firstDayOfWeek?: string,
): string {
  const entityIds = entities
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join('_');

  let normalizedStartDate = '';
  if (startDate) {
    try {
      if (startDate.includes('T')) {
        normalizedStartDate = startDate.split('T')[0];
      } else {
        normalizedStartDate = startDate;
      }
    } catch {
      normalizedStartDate = startDate; // Fallback to original
    }
  }

  const startDatePart = normalizedStartDate ? `_${normalizedStartDate}` : '';
  const firstDayPart = firstDayOfWeek ? `_fdw${firstDayOfWeek}` : '';

  const baseString = `calendar_${entityIds}_${daysToShow}${startDatePart}${firstDayPart}`;

  return hashString(baseString);
}

/**
 * Hash a string into a deterministic hexadecimal value.
 *
 * @param str String to hash
 * @returns Hexadecimal hash string
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

//-----------------------------------------------------------------------------
// LOCALE & FORMATTING UTILITIES
//-----------------------------------------------------------------------------

/**
 * Instant used to probe a locale's hour cycle
 *
 * 13:00 is the only hour that renders unambiguously: a 12-hour locale must emit
 * a day period to distinguish it from 01:00, while a 24-hour locale never does.
 */
const HOUR_CYCLE_PROBE = new Date(2000, 0, 1, 13, 0, 0);

/**
 * Resolve whether a locale uses a 24-hour clock, using the platform's CLDR data
 *
 * Asks `Intl` whether formatting an afternoon hour emits a day period, rather
 * than maintaining a language allowlist. This keeps regional variants correct
 * (`en-GB` is 24-hour while `en-US` is not) and detects day periods written in
 * non-Latin scripts (`el` renders `1 μ.μ.`, `zh-TW` renders `下午1時`), both of
 * which a hand-maintained list and an `/AM|PM/` regex get wrong.
 *
 * @param locale - BCP 47 language tag
 * @returns True for 24-hour, false for 12-hour, or undefined if detection failed
 */
function resolveIs24Hour(locale: string): boolean | undefined {
  try {
    const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).formatToParts(
      HOUR_CYCLE_PROBE,
    );

    return !parts.some((part) => part.type === 'dayPeriod');
  } catch {
    return undefined;
  }
}

/**
 * Determines whether to use 24-hour time format based on Home Assistant settings
 *
 * @param locale - Home Assistant locale object
 * @param fallbackTo24h - Whether to default to 24h format if detection fails
 * @returns Boolean indicating whether to use 24-hour format
 */
export function getTimeFormat24h(
  locale?: { time_format?: string; language?: string },
  fallbackTo24h: boolean = true,
): boolean {
  if (!locale) return fallbackTo24h;

  const byLanguage = (): boolean =>
    locale.language ? (resolveIs24Hour(locale.language) ?? fallbackTo24h) : fallbackTo24h;

  if (locale.time_format === '24') {
    return true;
  } else if (locale.time_format === '12') {
    return false;
  } else if (locale.time_format === 'language' && locale.language) {
    return byLanguage();
  } else if (locale.time_format === 'system') {
    const systemLocale = typeof navigator === 'undefined' ? undefined : navigator.language;

    return (systemLocale ? resolveIs24Hour(systemLocale) : undefined) ?? byLanguage();
  }

  return fallbackTo24h;
}

/**
 * Narrows a value to a configuration block we can safely enumerate.
 *
 * YAML turns a key written with nothing after it into `null`, so `date:` alone on its
 * line — an easy way to start a nested block and not finish it — reaches us as `null`
 * rather than as a missing key, and a mistyped block arrives as a bare scalar. Arrays
 * are objects too, so a `typeof` test alone lets one through to a walk that expects
 * string keys. `Object.entries` throws on the first, silently enumerates the characters
 * of the second and yields indices for the third, so all three have to be rejected
 * before the value is walked.
 *
 * @param value - Any value read from a user-supplied configuration
 * @returns True when the value is a plain object safe to enumerate
 */
export function isConfigBlock(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Filter out default values from configuration
 *
 * @param config User configuration to filter
 * @param defaultConfig Default configuration to compare against
 * @returns Filtered configuration without default values
 */
export function filterDefaultValues(
  config: Record<string, unknown>,
  defaultConfig: Record<string, unknown>,
): Record<string, unknown> {
  if (!isConfigBlock(config)) {
    return config;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) {
      continue;
    }

    if (key === 'show_week_numbers' && (value === null || value === '')) {
      continue; // Filter out both null and empty string values for show_week_numbers
    }

    if (key === 'entities' && Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    if (key === 'weather' && typeof value === 'object' && value !== null) {
      result[key] = structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
      continue;
    }

    const isDefaultValue = defaultConfig && key in defaultConfig && defaultConfig[key] === value;

    if (!isDefaultValue) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        defaultConfig &&
        typeof defaultConfig[key] === 'object' &&
        !Array.isArray(defaultConfig[key])
      ) {
        const nestedResult = filterDefaultValues(
          value as Record<string, unknown>,
          defaultConfig[key] as Record<string, unknown>,
        );

        if (Object.keys(nestedResult).length > 0) {
          result[key] = nestedResult;
        }
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

//-----------------------------------------------------------------------------
// MEMOIZATION
//-----------------------------------------------------------------------------

/**
 * Wraps a function so it recomputes only when its arguments change
 *
 * @param fn - Function to memoize
 * @returns A function returning `fn`'s last result while its arguments are unchanged
 */
export function memoizeLast<Args extends readonly unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  let lastArgs: Args | undefined;
  let lastResult: Result;

  return (...args: Args): Result => {
    if (
      lastArgs !== undefined &&
      lastArgs.length === args.length &&
      args.every((arg, index) => Object.is(arg, lastArgs![index]))
    ) {
      return lastResult;
    }

    const result = fn(...args);

    lastArgs = args;
    lastResult = result;

    return result;
  };
}

/** Where `allday_badge` can put the pill. */
export const ALLDAY_BADGE_POSITIONS = ['title', 'time'] as const;

export type AlldayBadgePosition = (typeof ALLDAY_BADGE_POSITIONS)[number];

/**
 * The shapes `allday_badge_style` can name, quietest first.
 *
 * `subtle` leads on both counts: it is the default, and it is genuinely the lightest -- a
 * wash with no edge at all. `outline` follows because a full-strength ring is a harder mark
 * than a wash, which is the opposite of where it sat until 4.2. It led the list then on the
 * reading that "no fill" means "quiet", and that stopped being true when the ring went to
 * full strength: rendered side by side, outline is a bright edge with bright text where
 * subtle has no edge and a mixed, calmer ink.
 */
export const ALLDAY_BADGE_STYLES = ['subtle', 'outline', 'tinted', 'filled'] as const;

export type AlldayBadgeStyle = (typeof ALLDAY_BADGE_STYLES)[number];

/**
 * The shape used when `allday_badge_style` is absent or names nothing recognized.
 *
 * 🚨 This is NOT the same constant as `DEFAULT_CONFIG.allday_badge_style`, and the two must
 * agree. That one is merged in by `setConfig`, so it is what a card without the key actually
 * draws; this one is the resolver's answer for a value that is present and unusable. A test
 * asserting only this one passes while the card's default says something else entirely --
 * which is exactly how a guide's pinned assertion once survived flipping the card default.
 */
export const DEFAULT_ALLDAY_BADGE_STYLE: AlldayBadgeStyle = 'subtle';

/**
 * Resolve `allday_badge` to where the pill goes, or `null` for no pill at all.
 *
 * 🚨 An unrecognized string resolves to `null` — OFF — and that is deliberate. The obvious
 * alternative, falling through to a default position, is the bug already recorded on
 * `getTodayIndicatorType` above: there `'none'` draws a dot, because it is a string matching
 * no special case and every unmatched string reached the default. A value that reads as "off"
 * turning the feature *on* is the worst available answer, so this table is closed and
 * anything outside it means off.
 *
 * That covers `false` and `'off'` without either needing a branch: neither is in the table,
 * so both arrive at the same `null` every other unrecognized value does. `'off'` is what the
 * editor writes and what the docs name; `false` is what a user reaching for a YAML boolean
 * will type, and it would be a poor joke to give them a badge for it.
 *
 * There is no boolean `true`. The option briefly accepted one, from when it was a toggle
 * with a single treatment, and it resolved to `subtle` — but with two positions and five
 * treatments there is no "on" for it to mean. Dropped while the option is unreleased and
 * free.
 *
 * @param value - Configured `allday_badge` value, in any of its accepted shapes
 * @returns Where to draw the pill, or `null` when no pill should be drawn
 */
export function resolveAlldayBadgePosition(value: unknown): AlldayBadgePosition | null {
  if (typeof value === 'string') {
    const candidate = value.toLowerCase().trim();
    return (ALLDAY_BADGE_POSITIONS as ReadonlyArray<string>).includes(candidate)
      ? (candidate as AlldayBadgePosition)
      : null;
  }

  return null;
}

/**
 * Resolve `allday_badge_style` to the treatment to draw.
 *
 * 🚨 This one falls back to a default where `resolveAlldayBadgePosition` above falls back to
 * off, and the asymmetry is the point rather than an oversight. The closed-set rule exists
 * so that a value which *reads as off* can never turn a feature on. No treatment name reads
 * as off: `allday_badge_style` cannot answer the question "is there a badge", only "which
 * one". So a typo here should still give the user the badge they asked for in the other key,
 * in the default treatment — silently drawing nothing because `tintd` is not a word would be
 * the same class of surprise, pointing the other way.
 *
 * @param value - Configured `allday_badge_style` value
 * @returns The treatment to draw, never null
 */
export function resolveAlldayBadgeStyle(value: unknown): AlldayBadgeStyle {
  if (typeof value === 'string') {
    const candidate = value.toLowerCase().trim();
    if ((ALLDAY_BADGE_STYLES as ReadonlyArray<string>).includes(candidate)) {
      return candidate as AlldayBadgeStyle;
    }
  }

  return DEFAULT_ALLDAY_BADGE_STYLE;
}

/**
 * The keywords `allday_badge_color` accepts in place of a literal color.
 *
 * Two, and they are not two colors — they are two *sources*. `accent` follows the calendar
 * the event came from, so it differs per event on a card showing several; `text` follows
 * whatever the pill is nested in, which is the time color on the time row and the title
 * color on the title. Anything else is taken as a color and used for every event alike.
 */
export const ALLDAY_BADGE_COLOR_SOURCES = ['accent', 'text'] as const;

export type AlldayBadgeColorSource = (typeof ALLDAY_BADGE_COLOR_SOURCES)[number];

/** What feeds a badge treatment's color, once `allday_badge_color` has been read. */
export type AlldayBadgeColor =
  | { source: AlldayBadgeColorSource }
  | { source: 'custom'; color: string };

/** The source used when `allday_badge_color` is absent. */
export const DEFAULT_ALLDAY_BADGE_COLOR: AlldayBadgeColorSource = 'accent';

/**
 * Resolve `allday_badge_color` to what feeds the treatment's color.
 *
 * 🚨 This is the one badge option whose value set is OPEN, and that changes what a typo
 * does. The other two are closed sets that fall back — an unrecognized treatment draws the
 * default one. Here an unrecognized string is a color, because that is the whole point, so
 * `acccent` is not corrected to `accent`: it reaches the browser as a color, fails to parse,
 * and the declaration is dropped. That is the same contract `accent_color` has, which
 * likewise validates nothing, and matching it is worth more than a guess at which typos are
 * worth catching.
 *
 * 🚨 The custom value is NOT lowercased, where the two keywords are. `var(--MyToken)` names
 * a custom property, and custom property names are case-sensitive — folding the case turns a
 * working theme token into one that resolves to nothing. Only the keyword comparison folds,
 * and it folds a copy.
 *
 * @param value - Configured `allday_badge_color` value
 * @returns The source to feed the treatment, never null
 */
export function resolveAlldayBadgeColor(value: unknown): AlldayBadgeColor {
  if (typeof value !== 'string') return { source: DEFAULT_ALLDAY_BADGE_COLOR };

  const trimmed = value.trim();
  if (trimmed === '') return { source: DEFAULT_ALLDAY_BADGE_COLOR };

  const keyword = trimmed.toLowerCase();
  if ((ALLDAY_BADGE_COLOR_SOURCES as ReadonlyArray<string>).includes(keyword)) {
    return { source: keyword as AlldayBadgeColorSource };
  }

  return { source: 'custom', color: trimmed };
}
