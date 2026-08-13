import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import * as Logger from '../src/utils/logger';
import { formatCondition, resetUntranslatedConditions } from '../src/utils/weather';
import {
  conditionLanguage,
  ensureConditionTranslations,
  resetConditionTranslations,
  toHaLanguage,
} from '../src/utils/weather-i18n';

/**
 * Condition text in the **card's** language rather than the instance's (backlog Y7).
 *
 * `formatEntityState` resolves against whatever translations Home Assistant loaded for
 * the signed-in user, and takes no language parameter, so a `language: en` card on a
 * German instance rendered `Sonnig` — one German word inside an otherwise English card,
 * while every other string obeyed the option.
 *
 * The fix asks Home Assistant for the same vocabulary in the card's language over
 * `frontend/get_translations` and caches it. Two properties are worth more than the
 * rest and are asserted first: the fetch does not happen when the languages already
 * agree, and a cold cache renders the instance's wording rather than nothing.
 */

const GERMAN_INSTANCE = { language: 'de' };

/** The reply shape `frontend/get_translations` actually returns, verified against 2026.8.1. */
function translationsReply(conditions: Record<string, string>): Types.TranslationsResponse {
  const resources: Record<string, string> = {
    // The two dozen attribute names HA sends alongside; they must be filtered out.
    'component.weather.entity_component._.name': 'Weather',
    'component.weather.entity_component._.state_attributes.humidity.name': 'Humidity',
  };

  for (const [condition, text] of Object.entries(conditions)) {
    resources[`component.weather.entity_component._.state.${condition}`] = text;
  }

  return { resources };
}

function weatherState(entityId = 'weather.home', state = 'sunny'): Types.HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: { temperature: 24, temperature_unit: '°C', friendly_name: 'Home' },
  };
}

/**
 * A German instance: `formatEntityState` speaks German, and `callWS` answers
 * `frontend/get_translations` with whatever the requested language maps to here.
 */
function germanHass(
  byLanguage: Record<string, Record<string, string>> = {},
  options: { callWS?: boolean } = {},
): Types.Hass & { calls: Types.WebSocketMessage[] } {
  const calls: Types.WebSocketMessage[] = [];

  const hass = {
    states: { 'weather.home': weatherState() },
    locale: GERMAN_INSTANCE,
    callApi: async () => undefined,
    callService: () => undefined,
    calls,
    formatEntityState: (stateObj: Types.HassEntity, state?: string) => {
      const value = state ?? stateObj.state;
      const german: Record<string, string> = {
        sunny: 'Sonnig',
        partlycloudy: 'Teilweise bewölkt',
        'clear-night': 'Klare Nacht',
        rainy: 'Regnerisch',
      };
      return german[value] ?? value;
    },
  } as unknown as Types.Hass & { calls: Types.WebSocketMessage[] };

  if (options.callWS !== false) {
    (hass as Types.Hass).callWS = (async (message: Types.WebSocketMessage) => {
      calls.push(message);
      const requested = String(message.language);
      return translationsReply(byLanguage[requested] ?? {});
    }) as Types.Hass['callWS'];
  }

  return hass;
}

const ENGLISH_CONDITIONS = {
  sunny: 'Sunny',
  partlycloudy: 'Partly cloudy',
  'clear-night': 'Clear, night',
};

/** Let the fetch's `.then()` chain settle without leaning on timers. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('weather conditions follow the card language', () => {
  beforeEach(() => {
    resetConditionTranslations();
    resetUntranslatedConditions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The bug, stated directly. Against the previous implementation this returns
   * `'Sonnig'` — `formatEntityState` is the only source of text and it speaks German —
   * so this case fails before the fix and passes after it.
   */
  it('renders English on a German instance once the vocabulary has loaded', async () => {
    const hass = germanHass({ en: ENGLISH_CONDITIONS });

    ensureConditionTranslations(hass, 'en', () => undefined);
    await settle();

    expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sunny');
    expect(formatCondition(hass, 'weather.home', 'partlycloudy', 'en')).toBe('Partly cloudy');
    expect(formatCondition(hass, 'weather.home', 'clear-night', 'en')).toBe('Clear, night');
  });

  it('asks Home Assistant for the card language, with the keys that command needs', async () => {
    const hass = germanHass({ en: ENGLISH_CONDITIONS });

    ensureConditionTranslations(hass, 'en', () => undefined);
    await settle();

    expect(hass.calls).toEqual([
      {
        type: 'frontend/get_translations',
        language: 'en',
        category: 'entity_component',
        integration: 'weather',
      },
    ]);
  });

  it('re-renders once the words arrive, and not before', async () => {
    const hass = germanHass({ en: ENGLISH_CONDITIONS });
    const onLoaded = vi.fn();

    ensureConditionTranslations(hass, 'en', onLoaded);
    expect(onLoaded).not.toHaveBeenCalled();

    await settle();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  /**
   * The common case must not pay for any of this. A card with no `language`, or one
   * set to the instance's own, is already correct through `formatEntityState`.
   */
  describe('does nothing when the languages already agree', () => {
    it('sends no request when the card language matches the instance', async () => {
      const hass = germanHass({ de: { sunny: 'Sonnig' } });

      ensureConditionTranslations(hass, 'de', () => undefined);
      await settle();

      expect(hass.calls).toEqual([]);
    });

    it('sends no request when the card has no language of its own', async () => {
      const hass = germanHass();

      ensureConditionTranslations(hass, undefined, () => undefined);
      await settle();

      expect(hass.calls).toEqual([]);
      expect(formatCondition(hass, 'weather.home', 'sunny', undefined)).toBe('Sonnig');
    });
  });

  /**
   * First paint. The fetch cannot resolve before the first render, so what the row
   * shows in that frame is a design decision, not an accident: the instance's wording,
   * never a blank and never a raw `partlycloudy`.
   */
  it('shows the instance wording while the fetch is still in flight', () => {
    const hass = germanHass({ en: ENGLISH_CONDITIONS });

    ensureConditionTranslations(hass, 'en', () => undefined);

    // Synchronously after the call, before any await: the cache is still cold.
    expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sonnig');
  });

  it('fires one request for a language however many renders ask for it', async () => {
    const hass = germanHass({ en: ENGLISH_CONDITIONS });

    // A re-render storm: the card re-renders on every hass update.
    for (let i = 0; i < 25; i++) {
      ensureConditionTranslations(hass, 'en', () => undefined);
    }
    await settle();
    ensureConditionTranslations(hass, 'en', () => undefined);
    await settle();

    expect(hass.calls).toHaveLength(1);
  });

  /**
   * Home Assistant identifies the two written forms of Chinese by script subtag, and
   * answers an unrecognised code with **English rather than an error** — so a wrong
   * code here is invisible at runtime. Measured against 2026.8.1: `zh-Hans` returns
   * Chinese, `zh-CN` and `zh-cn` return English.
   */
  describe('language codes', () => {
    it('maps the card codes Home Assistant spells differently', () => {
      expect(toHaLanguage('zh-cn')).toBe('zh-Hans');
      expect(toHaLanguage('zh-tw')).toBe('zh-Hant');
    });

    it('capitalises the region, because the match is case-sensitive', () => {
      expect(toHaLanguage('en-gb')).toBe('en-GB');
    });

    it('leaves a plain language code alone', () => {
      for (const code of ['de', 'en', 'fr', 'sv', 'th', 'uk']) {
        expect(toHaLanguage(code)).toBe(code);
      }
    });

    it('requests the mapped code, not the card one', async () => {
      const hass = germanHass({ 'zh-Hans': { sunny: '晴' } });

      ensureConditionTranslations(hass, 'zh-CN', () => undefined);
      await settle();

      expect(hass.calls[0].language).toBe('zh-Hans');
      expect(formatCondition(hass, 'weather.home', 'sunny', 'zh-CN')).toBe('晴');
    });

    it('reports nothing to fetch when the instance already speaks the card language', () => {
      const hass = germanHass();

      expect(conditionLanguage(hass, 'de')).toBeUndefined();
      expect(conditionLanguage(hass, 'en')).toBe('en');
      expect(conditionLanguage(undefined, 'en')).toBeUndefined();
    });
  });

  /**
   * The words are an enhancement over an icon and a temperature that render without
   * any of this. Every failure keeps the row and loses the improvement — which means
   * falling back to exactly the behaviour that shipped before the fix.
   */
  describe('degrades to the instance language rather than throwing', () => {
    it('survives an instance with no WebSocket command API', async () => {
      const hass = germanHass({ en: ENGLISH_CONDITIONS }, { callWS: false });

      expect(() => ensureConditionTranslations(hass, 'en', () => undefined)).not.toThrow();
      await settle();

      expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sonnig');
    });

    it('survives a rejected request', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const hass = germanHass();
      (hass as Types.Hass).callWS = (() =>
        Promise.reject(new Error('unknown command'))) as Types.Hass['callWS'];

      ensureConditionTranslations(hass, 'en', () => undefined);
      await settle();

      expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sonnig');
      expect(debug).toHaveBeenCalled();
    });

    it('survives a reply carrying no conditions', async () => {
      const hass = germanHass({ en: {} });
      const onLoaded = vi.fn();

      ensureConditionTranslations(hass, 'en', onLoaded);
      await settle();

      expect(onLoaded).not.toHaveBeenCalled();
      expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sonnig');
    });

    it('falls back per condition when the language lacks one', async () => {
      // HA's own coverage is uneven — several languages are missing `windy-variant`.
      const hass = germanHass({ en: { sunny: 'Sunny' } });

      ensureConditionTranslations(hass, 'en', () => undefined);
      await settle();

      expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sunny');
      expect(formatCondition(hass, 'weather.home', 'partlycloudy', 'en')).toBe('Teilweise bewölkt');
    });

    it('reports an unfetchable language once, not once per render', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const hass = germanHass({ en: {} });

      for (let i = 0; i < 5; i++) {
        ensureConditionTranslations(hass, 'en', () => undefined);
        await settle();
      }

      const failures = debug.mock.calls.filter((call) =>
        String(call[0]).includes('Could not load weather conditions'),
      );
      expect(failures).toHaveLength(1);
    });
  });

  it('uses connection.sendMessagePromise when callWS is absent', async () => {
    const calls: Types.WebSocketMessage[] = [];
    const hass = germanHass({ en: ENGLISH_CONDITIONS }, { callWS: false });
    (hass as Types.Hass).connection = {
      subscribeEvents: async () => () => undefined,
      subscribeMessage: async () => () => undefined,
      sendMessagePromise: (async (message: Types.WebSocketMessage) => {
        calls.push(message);
        return translationsReply(ENGLISH_CONDITIONS);
      }) as NonNullable<Types.Hass['connection']>['sendMessagePromise'],
    };

    ensureConditionTranslations(hass, 'en', () => undefined);
    await settle();

    expect(calls).toHaveLength(1);
    expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sunny');
  });
});
