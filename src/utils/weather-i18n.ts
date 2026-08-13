/* eslint-disable import/order */
/**
 * Weather condition text in the **card's** language
 *
 * Every other string the card renders honours its own `language` option. Condition
 * text did not, and could not: `formatEntityState` resolves through the translations
 * Home Assistant loaded for the signed-in **user's** profile language, and its API
 * carries no language parameter. A `language: en` card on a German instance therefore
 * rendered one English sentence with `Sonnig` inside it.
 *
 * The fix keeps the property that made the original approach attractive — the card
 * still ships **no** condition strings of its own — by asking Home Assistant for the
 * same vocabulary in a different language. `frontend/get_translations` takes one, and
 * answers with the whole `weather` component's `entity_component` table.
 *
 * Fetched once per language and cached for the life of the page. The render path stays
 * synchronous: it reads this cache, and falls back to `formatEntityState` — today's
 * behaviour, in the instance's language — for as long as the cache is cold. That is
 * what makes a first paint show the right weather in the wrong language for one frame
 * rather than showing an empty row or a raw `partlycloudy`.
 */

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as Logger from './logger';

//-----------------------------------------------------------------------------
// LANGUAGE CODES
//-----------------------------------------------------------------------------

/**
 * Card language code → Home Assistant language code, for the pairs where a plain
 * re-casing is not enough.
 *
 * Chinese is the whole list. Home Assistant identifies the two written forms by
 * **script** subtag, `zh-Hans` and `zh-Hant`; the card, and dayjs, use the older
 * region form. Measured against a live instance (2026.8.1): `zh-Hans` and `zh-Hant`
 * return Chinese, while `zh-CN`, `zh-TW` and their lowercase spellings all return
 * English.
 *
 * That is the trap this whole file has to be careful about — **an unknown language
 * code is not an error**. Home Assistant answers it with English, successfully, so a
 * wrong code is indistinguishable from a working one by the shape of the response.
 * Nothing here can detect it; only comparing payloads across codes can, which is what
 * the probe in the commit message did.
 */
const HA_LANGUAGE_OVERRIDES: Record<string, string> = {
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
};

/** Prefix Home Assistant files the weather component's fifteen condition states under. */
const CONDITION_KEY_PREFIX = 'component.weather.entity_component._.state.';

/**
 * The conditions Home Assistant defines, as a closed set.
 *
 * Verified two ways rather than recalled: `frontend/get_translations` returns exactly
 * these fifteen for every language tried, and `CONDITION_ICON_MAP` in `weather.ts`
 * independently maps the same fifteen. `weather-condition-language.test.ts` pins the two
 * lists to each other, so a sixteenth icon without a sixteenth entry here fails a test
 * rather than going unnoticed — which is the only reason it is safe to write the set out
 * twice instead of importing it (`weather.ts` imports *this* module, so the dependency
 * cannot run the other way).
 *
 * Worth having as a list at all because Home Assistant fills per-key gaps server-side:
 * a language it has not translated comes back complete, in English, rather than short.
 * A payload that is *not* complete therefore means something changed — a new condition,
 * or a different response shape — and that is worth saying out loud once.
 *
 * The filling is per **key**, not per language, and that is the part worth being exact
 * about: a *translated* language can still carry individual English values. Measured on
 * a live instance (2026.8.1), `pt-BR` returns fourteen Portuguese conditions and
 * `windy-variant` as "Windy, cloudy". So the check below detects a change in the
 * response *shape* and can never detect a translation gap — every language is complete
 * by construction. Read it as a structural-change detector, which is what it is; the
 * name "completeness" invites the other reading.
 */
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
 * Convert a card language code to the spelling Home Assistant expects.
 *
 * The card lowercases its codes (`getEffectiveLanguage` returns `'en-gb'`), Home
 * Assistant capitalises the region (`en-GB`), and the match is case-sensitive. Every
 * code without a region passes through untouched, which is 32 of the card's 35.
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
 * The Home Assistant language the card needs fetched, or `undefined` when it needs
 * nothing fetched at all.
 *
 * `undefined` is the common case and the important one: when the card's language
 * already matches the instance's, `formatEntityState` is *by definition* returning the
 * right words, so there is nothing to fetch, nothing to cache and no reason to leave
 * the synchronous path. Only a card that has been given a different `language` pays
 * for any of this.
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

/** HA language code → its fifteen conditions, keyed by raw token. */
const conditionsByLanguage = new Map<string, Record<string, string>>();

/**
 * Languages whose fetch is currently outstanding.
 *
 * Without this, a re-render storm — and the card re-renders on every `hass` update,
 * which on a busy instance is several a second — would fire one request per render
 * until the first one landed.
 */
const inFlight = new Set<string>();

/**
 * Languages already reported as unfetchable, so the log says it once rather than once
 * per render for the rest of the session.
 */
const reportedFailures = new Set<string>();

/**
 * Look up a condition in a language already fetched.
 *
 * A miss is reported once per language and condition. It has to be, because the caller's
 * fallback is `formatEntityState` — which succeeds, in the *instance's* language, and so
 * puts a German word inside an English card with nothing raised anywhere. That is the
 * same shape of silent failure the raw-token case in `formatCondition` already guards,
 * one layer up.
 *
 * **What that report can and cannot see**, which is worth stating because the two are
 * easy to swap. Home Assistant fills every key server-side, so a key genuinely absent
 * from a fetched payload means a *non-standard condition token* — a third-party weather
 * integration emitting something outside the fifteen — and that is the case this catches.
 *
 * It cannot see the case that actually occurs. An untranslated condition comes back as a
 * **present key holding the English string**, so `text` is truthy and nothing fires.
 * Measured on 2026.8.1, sampling eight card languages: all returned 15/15 keys, and
 * seven of them carried `windy-variant` in English (`is` carried `exceptional` too). A
 * Portuguese card therefore reads `Windy, cloudy` with no report anywhere, and by
 * construction there is nothing here to detect it with — the value is not wrong, it is
 * Home Assistant's own fallback, and telling it apart would mean fetching English as a
 * second payload to compare against. Deliberately not done: it is a gap in Home
 * Assistant's translations rather than in the card, the card cannot close it, and the
 * comparison would cost a request on a path built to avoid needless ones.
 *
 * `weather-condition-language.test.ts` pins that silence as behaviour, so this stays a
 * decision someone has to revisit on purpose rather than a comment that quietly rots.
 *
 * @param haLanguage Home Assistant language code, from `conditionLanguage`
 * @param condition Raw condition token, e.g. `partlycloudy`
 * @returns The translated text, or `undefined` when the language is not cached yet or
 *   Home Assistant has no string for that condition
 */
export function lookupCondition(haLanguage: string, condition: string): string | undefined {
  const conditions = conditionsByLanguage.get(haLanguage);

  // Not fetched yet is not a miss — it is the first paint, and the caller is about to
  // fall back on purpose.
  if (!conditions) {
    return undefined;
  }

  const text = conditions[condition];

  if (!text) {
    reportMissingCondition(haLanguage, condition);
  }

  return text;
}

/** Languages and conditions already reported missing, as `<language>:<condition>`. */
const reportedMisses = new Set<string>();

/**
 * Report a condition the fetched language does not carry, once per pair.
 */
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

/**
 * Send a one-shot WebSocket command, whichever of the two entry points this `hass`
 * happens to carry.
 *
 * `hass.callWS` is Home Assistant's own one-line wrapper around
 * `connection.sendMessagePromise`, so these are the same call; which one is present
 * depends on how the `hass` object reached the card.
 *
 * @param hass Home Assistant instance
 * @param message Command to send
 * @returns The reply, or `undefined` when this instance offers neither entry point
 */
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

/**
 * Reduce Home Assistant's reply to the fifteen conditions, dropping the two dozen
 * attribute names that come with it.
 */
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
 * Fetch the condition vocabulary for the card's language, once.
 *
 * Returns immediately — and does nothing — when the card's language already matches
 * the instance's, when the language is cached, or when a request for it is already
 * outstanding. Safe to call on every update for that reason, and it is: the caller has
 * no cheaper way to notice that a re-render changed the answer.
 *
 * Every failure is swallowed. The words are an enhancement over an icon and a
 * temperature that render without any of this, so an instance that cannot answer must
 * lose the improvement and keep the row — the same rule `formatCondition` follows, for
 * the same reason.
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

/**
 * Say once, at the moment a payload arrives, which conditions it does not carry.
 *
 * Checking here rather than at render time is the point: Home Assistant fills per-key
 * gaps server-side, so a complete-looking payload is the norm and a short one means
 * something changed — a condition added to Home Assistant, or a changed response shape.
 * Finding that out when the data lands beats discovering it one condition at a time, on
 * whichever day the weather happens to turn.
 */
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

/**
 * Report a language that could not be fetched, once per language.
 *
 * Deliberately `debug` rather than `error`: nothing is broken from the user's side,
 * the condition simply keeps appearing in the instance's language, which is where it
 * appeared before any of this existed.
 */
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
 * against it. Kept in sync by test, not by import — see `KNOWN_CONDITIONS`.
 */
export function knownConditions(): string[] {
  return [...KNOWN_CONDITIONS];
}

/**
 * Forget every cached language.
 *
 * Exists for the tests, which would otherwise leak a cache entry from one case into
 * the next and pass for the wrong reason.
 */
export function resetConditionTranslations(): void {
  conditionsByLanguage.clear();
  inFlight.clear();
  reportedFailures.clear();
  reportedMisses.clear();
}
