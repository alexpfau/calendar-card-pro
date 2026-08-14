/**
 * Helper utilities for Calendar Card Pro
 *
 * General purpose utility functions for debouncing, memoization,
 * performance monitoring, and other common tasks.
 */

//-----------------------------------------------------------------------------
// COLOR UTILITIES
//-----------------------------------------------------------------------------

/**
 * Cache of resolved RGBA strings, keyed by `${color}|${opacity}`.
 *
 * Resolving a color requires a synchronous layout flush (see computeRGBA), which is
 * far too expensive to repeat for every event on every render. Colors and opacity both
 * come from the card configuration, so the number of distinct keys stays very small.
 *
 * Theme-dependent colors are not cached by value here: `var(...)` colors short-circuit
 * before any computed-style lookup and resolve to a CSS expression that the browser
 * re-evaluates itself, so a theme switch is still picked up correctly.
 */
const rgbaCache = new Map<string, string>();

/**
 * Convert any color format to RGBA with specific opacity
 *
 * Results are memoized because the underlying color resolution forces a synchronous
 * reflow and this is called once per rendered event.
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

/**
 * Resolve a color to RGBA, without caching.
 *
 * @param color - Color in any valid CSS format
 * @param opacity - Opacity value (0-100)
 * @returns RGBA color string
 */
function computeRGBA(color: string, opacity: number): string {
  // If color is a CSS variable, we need to handle it specially
  if (color.startsWith('var(')) {
    // Create a temporary CSS variable with opacity
    return `rgba(var(--calendar-color-rgb, 3, 169, 244), ${opacity / 100})`;
  }

  if (color === 'transparent') {
    return color;
  }

  // Create temporary element to compute the color
  const tempElement = document.createElement('div');
  tempElement.style.display = 'none';
  tempElement.style.color = color;
  document.body.appendChild(tempElement);

  // Get computed color in RGB format
  const computedColor = getComputedStyle(tempElement).color;
  document.body.removeChild(tempElement);

  // If computation failed, return original color
  if (!computedColor) return color;

  // Handle RGB format (rgb(r, g, b))
  const rgbMatch = computedColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  // If already RGBA, replace the alpha component
  const rgbaMatch = computedColor.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  // Fallback to original color if parsing fails
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
  // Handle boolean/undefined cases
  if (value === undefined || value === false) {
    return 'none';
  }

  if (value === true) {
    return 'dot';
  }

  // Handle string values
  if (typeof value === 'string') {
    // Check for special values
    if (value === 'pulse' || value === 'glow') {
      return value;
    }

    // Check for icon format (mdi:, phu:, fas:, hass:, etc.)
    if (isIconValue(value)) {
      return 'mdi';
    }

    // Check for image path
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

    // Check if it's an emoji (this is an approximation)
    // More sophisticated emoji detection could be added if needed
    const emojiRegex = /[\p{Emoji}]/u;
    if (emojiRegex.test(value)) {
      return 'emoji';
    }

    // Default to dot for other strings
    return 'dot';
  }

  return 'none';
}

/**
 * The four shapes a calendar's label can take.
 *
 * Named as a type because it is now a configuration value in its own right and not
 * only a classifier's return: `label_type` may be stored to say what a label *is*
 * when the value alone would be read as something else.
 */
export type LabelType = 'none' | 'icon' | 'image' | 'text';

/** Whether a value is one of the four shapes, and so usable as an explicit type. */
export function isLabelType(value: unknown): value is LabelType {
  return value === 'none' || value === 'icon' || value === 'image' || value === 'text';
}

/**
 * Determine which of the four shapes a calendar's label value looks like
 *
 * The counterpart to `getTodayIndicatorType` for the per-calendar label, and written
 * here beside it for the same reason: the editor has to offer a control per shape, and
 * a classifier of its own would eventually disagree with the renderer about what a
 * value means. `renderLabel` in `rendering/leaves.ts` makes exactly these three tests in
 * exactly this order; `tests/label-glyph.test.ts` pins the two together, so a change to
 * one that is not made to the other fails rather than drifting silently.
 *
 * **This reads the value alone.** It is the fallback half of `resolveLabelType`, which
 * is what both the renderer and the editor should ask — a configuration may name its
 * shape explicitly, and where it does, this function's answer is not the last word.
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
 * the value looks like.
 *
 * The single reading of the label's shape, asked by the renderer and by the editor so
 * the two cannot disagree — the property `getLabelType` was written to guarantee, now
 * that there are two inputs rather than one.
 *
 * **Why an explicit type exists at all.** Inferring the shape from the value makes the
 * empty string mean two different things: *no label*, and *a text label the user is
 * part-way through typing*. The editor could not tell them apart, so clearing the box
 * to retype removed the key, reclassified the label as absent and took the box away
 * mid-edit — the state was not representable, so no amount of editor plumbing could
 * hold it. `label_type` makes it representable, and nothing more: it is stored only
 * where inference would get the answer wrong, so a configuration that never needed it
 * never grows it.
 *
 * The explicit type wins outright where it is set, which also buys a label that could
 * not be written before — `label_type: text` with `label: mdi:calendar` renders the
 * literal text rather than an icon.
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
 * Creates a stable ID that persists across page reloads
 * but changes when the data requirements change
 *
 * @param entities Array of calendar entities
 * @param daysToShow Number of days to display
 * @param showPastEvents Whether to show past events
 * @param startDate Optional custom start date
 * @returns Deterministic ID string based on input parameters
 */
export function generateDeterministicId(
  entities: Array<string | { entity: string; color?: string }>,
  daysToShow: number,
  showPastEvents: boolean,
  startDate?: string,
): string {
  // Extract just the entity IDs, normalized for comparison
  const entityIds = entities
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join('_');

  // Normalize ISO date format to YYYY-MM-DD for caching
  let normalizedStartDate = '';
  if (startDate) {
    try {
      if (startDate.includes('T')) {
        // It's an ISO date, extract just the date part
        normalizedStartDate = startDate.split('T')[0];
      } else {
        normalizedStartDate = startDate;
      }
    } catch {
      normalizedStartDate = startDate; // Fallback to original
    }
  }

  // Include the normalized startDate in the ID
  const startDatePart = normalizedStartDate ? `_${normalizedStartDate}` : '';

  // Create a base string with all data-affecting parameters
  const baseString = `calendar_${entityIds}_${daysToShow}_${showPastEvents ? 1 : 0}${startDatePart}`;

  // Hash it for a compact, consistent ID
  return hashString(baseString);
}

/**
 * Simple string hash function for creating deterministic IDs
 * Converts a string into a stable hash value for use as an identifier
 *
 * @param str - Input string to hash
 * @returns Alphanumeric hash string
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to alphanumeric string
  return Math.abs(hash).toString(36);
}

//-----------------------------------------------------------------------------
// LOCALE & FORMATTING UTILITIES
//-----------------------------------------------------------------------------

/**
 * Determines whether to use 24-hour time format based on Home Assistant settings
 *
 * This function examines Home Assistant locale settings to determine the
 * appropriate time format. It handles explicit settings (24h/12h), language-based
 * preferences, and system preferences by checking browser/OS settings.
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

  // Handle different time_format values
  if (locale.time_format === '24') {
    return true;
  } else if (locale.time_format === '12') {
    return false;
  } else if (locale.time_format === 'language' && locale.language) {
    // Use language to determine format
    return is24HourByLanguage(locale.language);
  } else if (locale.time_format === 'system') {
    // Handle 'system' setting by detecting browser/OS preference
    try {
      // Create a formatter without specifying hour12 option
      const formatter = new Intl.DateTimeFormat(navigator.language, {
        hour: 'numeric',
      });
      // Format afternoon time (13:00) and check if it has AM/PM markers
      const formattedTime = formatter.format(new Date(2000, 0, 1, 13, 0, 0));
      return !formattedTime.match(/AM|PM|am|pm/);
    } catch {
      // Default to language-based detection on error
      return locale.language ? is24HourByLanguage(locale.language) : fallbackTo24h;
    }
  }

  // Default to fallback value for other cases
  return fallbackTo24h;

  // Internal helper function for language-based detection
  function is24HourByLanguage(language: string): boolean {
    // Languages/locales that typically use 24h format
    const likely24hLanguages = [
      'de',
      'fr',
      'es',
      'it',
      'pt',
      'nl',
      'ru',
      'pl',
      'sv',
      'no',
      'fi',
      'da',
      'cs',
      'sk',
      'sl',
      'hr',
      'hu',
      'ro',
      'bg',
      'el',
      'tr',
      'zh',
      'ja',
      'ko',
    ];

    // Extract base language code (e.g., 'de-AT' -> 'de')
    const baseLanguage = language.split('-')[0].toLowerCase();

    return likely24hLanguages.includes(baseLanguage);
  }
}

/**
 * Filter out default values from configuration
 * This helps avoid bloated YAML configuration by removing unnecessary properties
 *
 * @param config User configuration to filter
 * @param defaultConfig Default configuration to compare against
 * @returns Filtered configuration without default values
 */
export function filterDefaultValues(
  config: Record<string, unknown>,
  defaultConfig: Record<string, unknown>,
): Record<string, unknown> {
  // Skip filtering if config is not an object
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }

  // Make a copy of the config to avoid mutating the original
  const result = Array.isArray(config)
    ? ([] as unknown as Record<string, unknown>)
    : ({} as Record<string, unknown>);

  // Process each property in the config
  for (const [key, value] of Object.entries(config)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Special handling for show_week_numbers to allow null value through
    if (key === 'show_week_numbers' && (value === null || value === '')) {
      continue; // Filter out both null and empty string values for show_week_numbers
    }

    // Special handling for entity arrays
    if (key === 'entities' && Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    // Special handling for weather config - preserve entire structure once defined
    if (key === 'weather' && typeof value === 'object' && value !== null) {
      // Deep clone the weather config to preserve the full structure
      result[key] = structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
      continue;
    }

    // Check if this is a default value
    const isDefaultValue = defaultConfig && key in defaultConfig && defaultConfig[key] === value;

    if (!isDefaultValue) {
      // For nested objects, recursively filter
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

        // Only add the nested object if it has properties
        if (Object.keys(nestedResult).length > 0) {
          result[key] = nestedResult;
        }
      } else {
        // Otherwise add the value directly
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
 * Wraps a function so it recomputes only when its arguments change.
 *
 * A single-slot cache with shallow (`Object.is`) argument comparison — the same
 * contract as the `memoize-one` package every Home Assistant card editor uses, in
 * the six lines it actually takes. It is written here rather than depended upon
 * because the bundle-size rule governs `dependencies`, and this is the whole of what
 * we need from that package.
 *
 * One slot is the right size for the job. The caller is a schema builder invoked once
 * per render with the same arguments almost every time, so the hit rate of a
 * single-entry cache is already ~100% and a larger cache would only add a key to
 * compute and entries to evict.
 *
 * `Object.is` rather than `===` so a `NaN` argument compares equal to itself, which
 * is what "the arguments did not change" means. Arguments are compared by identity,
 * so callers must pass the values a schema reads rather than the object holding
 * them: a config object rebuilt on every keystroke never compares equal.
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

    // Computed before either slot is written, so a throwing call leaves the cache as
    // it was. Committing the arguments first would record a result that was never
    // produced, and the retry — with identical arguments — would return it.
    const result = fn(...args);

    lastArgs = args;
    lastResult = result;

    return result;
  };
}
