/**
 * Helper utilities for Calendar Card Pro
 *
 * General purpose utilities: color conversion, indicator and label type
 * detection, ID generation and hashing, locale-aware formatting, config
 * default filtering, and single-entry memoization.
 */

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
    return `rgba(var(--calendar-color-rgb, 3, 169, 244), ${opacity / 100})`;
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
    if (value === 'pulse' || value === 'glow') {
      return value;
    }

    if (isIconValue(value)) {
      return 'mdi';
    }

    if (
      value.startsWith('/') ||
      value.includes('.png') ||
      value.includes('.jpg') ||
      value.includes('.svg') ||
      value.includes('.webp') ||
      value.includes('.gif')
    ) {
      return 'image';
    }

    const emojiRegex = /[\p{Emoji}]/u;
    if (emojiRegex.test(value)) {
      return 'emoji';
    }

    return 'dot';
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

  if (isIconValue(label)) {
    return 'icon';
  }

  if (label.startsWith('/local/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(label)) {
    return 'image';
  }

  return 'text';
}

/**
 * The shape a calendar's label holds, preferring what the configuration says over what
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
