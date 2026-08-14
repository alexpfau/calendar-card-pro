/**
 * Weather condition text in the card's language.
 * Home Assistant translates conditions through `frontend/get_translations`; this cache
 * keeps rendering synchronous and falls back to the instance language while it is cold.
 */

import * as Logger from './logger';
import * as Types from '../config/types';
import * as Localize from '../translations/localize';

//-----------------------------------------------------------------------------
// LANGUAGE CODES
//-----------------------------------------------------------------------------

/** Home Assistant uses script subtags for Chinese weather translations. */
const HA_LANGUAGE_OVERRIDES: Record<string, string> = {
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
};

const CONDITION_KEY_PREFIX = 'component.weather.entity_component._.state.';

/** Home Assistant weather condition tokens; complete payloads may still contain English fallback values. */
const KNOWN_CONDITIONS = [
  'clear-night',
  'cloudy',
  'exceptional',
  'fog',
  'hail',
  'lightning',
  'lightning-rainy',
  'partlycloudy',
  'pouring',
  'rainy',
  'snowy',
  'snowy-rainy',
  'sunny',
  'windy',
  'windy-variant',
];

/**
 * Convert a card language code to the spelling Home Assistant expects
 *
 * @param cardLanguage Effective card language, e.g. `'en-gb'`
 * @returns The Home Assistant spelling, e.g. `'en-GB'`
 */
export function toHaLanguage(cardLanguage: string): string {
  const lower = cardLanguage.toLowerCase();

  const override = HA_LANGUAGE_OVERRIDES[lower];
  if (override) {
    return override;
  }

  const [base, region] = lower.split('-');
  return region ? `${base}-${region.toUpperCase()}` : base;
}

/**
 * Resolve the Home Assistant language the card needs fetched.
 *
 * @param hass Home Assistant instance, if one is available
 * @param configLanguage The card's configured `language`, if any
 * @returns Home Assistant language code to fetch, or `undefined`
 */
export function conditionLanguage(
  hass: Types.Hass | null | undefined,
  configLanguage: string | undefined,
): string | undefined {
  if (!hass) {
    return undefined;
  }

  const effective = Localize.getEffectiveLanguage(configLanguage, hass.locale);
  const haLanguage = toHaLanguage(effective);
  const instanceLanguage = hass.locale?.language;

  if (instanceLanguage && instanceLanguage.toLowerCase() === haLanguage.toLowerCase()) {
    return undefined;
  }

  return haLanguage;
}

//-----------------------------------------------------------------------------
// CACHE
//-----------------------------------------------------------------------------

const conditionsByLanguage = new Map<string, Record<string, string>>();

const inFlight = new Set<string>();

const reportedFailures = new Set<string>();

/**
 * Look up a condition in a language already fetched
 *
 * @param haLanguage Home Assistant language code, from `conditionLanguage`
 * @param condition Raw condition token, e.g. `partlycloudy`
 * @returns The translated text, or `undefined` when the language is not cached yet or
 *   Home Assistant has no string for that condition
 */
export function lookupCondition(haLanguage: string, condition: string): string | undefined {
  const conditions = conditionsByLanguage.get(haLanguage);

  if (!conditions) {
    return undefined;
  }

  const text = conditions[condition];

  if (!text) {
    reportMissingCondition(haLanguage, condition);
  }

  return text;
}

const reportedMisses = new Set<string>();

function reportMissingCondition(haLanguage: string, condition: string): void {
  const key = `${haLanguage}:${condition}`;

  if (reportedMisses.has(key)) {
    return;
  }

  reportedMisses.add(key);
  Logger.debug(
    `Home Assistant has no "${condition}" for ${haLanguage}; that condition will follow ` +
      "the instance's language instead",
  );
}

//-----------------------------------------------------------------------------
// FETCH
//-----------------------------------------------------------------------------

function sendCommand<T>(hass: Types.Hass, message: Types.WebSocketMessage): Promise<T> | undefined {
  if (typeof hass.callWS === 'function') {
    return hass.callWS<T>(message);
  }

  const connection = hass.connection;
  if (connection && typeof connection.sendMessagePromise === 'function') {
    return connection.sendMessagePromise<T>(message);
  }

  return undefined;
}

function extractConditions(
  response: Types.TranslationsResponse | undefined,
): Record<string, string> {
  const resources = response?.resources;
  if (!resources) {
    return {};
  }

  const conditions: Record<string, string> = {};

  for (const [key, value] of Object.entries(resources)) {
    if (key.startsWith(CONDITION_KEY_PREFIX) && typeof value === 'string' && value) {
      conditions[key.slice(CONDITION_KEY_PREFIX.length)] = value;
    }
  }

  return conditions;
}

/**
 * Fetch the condition vocabulary for the card's language, once
 *
 * @param hass Home Assistant instance, if one is available
 * @param configLanguage The card's configured `language`, if any
 * @param onLoaded Called once, after new translations land, so the caller can re-render
 */
export function ensureConditionTranslations(
  hass: Types.Hass | null | undefined,
  configLanguage: string | undefined,
  onLoaded: () => void,
): void {
  const haLanguage = conditionLanguage(hass, configLanguage);

  if (!hass || !haLanguage) {
    return;
  }

  if (conditionsByLanguage.has(haLanguage) || inFlight.has(haLanguage)) {
    return;
  }

  const request = sendCommand<Types.TranslationsResponse>(hass, {
    type: 'frontend/get_translations',
    language: haLanguage,
    category: 'entity_component',
    integration: 'weather',
  });

  if (!request) {
    reportFailure(haLanguage, 'this instance exposes no WebSocket command API');
    return;
  }

  inFlight.add(haLanguage);

  request
    .then((response) => {
      const conditions = extractConditions(response);

      if (Object.keys(conditions).length === 0) {
        reportFailure(haLanguage, 'Home Assistant returned no condition strings');
        return;
      }

      conditionsByLanguage.set(haLanguage, conditions);
      reportIncompletePayload(haLanguage, conditions);
      Logger.debug(`Loaded ${Object.keys(conditions).length} weather conditions in ${haLanguage}`);
      onLoaded();
    })
    .catch((error) => {
      reportFailure(haLanguage, String(error));
    })
    .finally(() => {
      inFlight.delete(haLanguage);
    });
}

function reportIncompletePayload(haLanguage: string, conditions: Record<string, string>): void {
  const missing = KNOWN_CONDITIONS.filter((condition) => !conditions[condition]);

  if (missing.length === 0) {
    return;
  }

  Logger.debug(
    `Home Assistant returned ${Object.keys(conditions).length} weather conditions for ` +
      `${haLanguage}, without ${missing.join(', ')}; ` +
      "those will follow the instance's language instead",
  );
}

function reportFailure(haLanguage: string, reason: string): void {
  if (reportedFailures.has(haLanguage)) {
    return;
  }

  reportedFailures.add(haLanguage);
  Logger.debug(
    `Could not load weather conditions in ${haLanguage} (${reason}); ` +
      "conditions will follow Home Assistant's language instead",
  );
}

/**
 * The fifteen conditions Home Assistant defines, exposed so the icon map can be pinned
 */
export function knownConditions(): string[] {
  return [...KNOWN_CONDITIONS];
}

/**
 * Forget every cached language
 */
export function resetConditionTranslations(): void {
  conditionsByLanguage.clear();
  inFlight.clear();
  reportedFailures.clear();
  reportedMisses.clear();
}
