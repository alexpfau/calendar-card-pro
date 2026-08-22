import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import * as Logger from '../src/utils/logger';
import {
  CONDITION_ICON_MAP,
  formatCondition,
  resetUntranslatedConditions,
} from '../src/utils/weather';
import {
  conditionLanguage,
  ensureConditionTranslations,
  knownConditions,
  resetConditionTranslations,
  toHaLanguage,
} from '../src/utils/weather-i18n';

/**
 * Condition text in the **card's** language rather than the instance's.
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

    /**
     * `toHaLanguage` maps any region correctly, including for languages the card does
     * not ship — but nothing outside the card's own translation map can reach it, because
     * `getEffectiveLanguage` resolves an unknown code away first. `pt-br` is the useful
     * illustration: the casing rule handles it, and the card would still fetch German on
     * a German instance, because `pt-br` is not one of its 35 languages.
     *
     * Both halves are worth pinning. The mapping generalises, and adding a language to
     * the card is what makes the generalisation reachable — not a change here.
     */
    it('maps a region the card does not ship, but cannot route to it', () => {
      expect(toHaLanguage('pt-br')).toBe('pt-BR');

      const hass = germanHass();
      expect(conditionLanguage(hass, 'pt-br')).toBeUndefined();

      // `pt` is a card language, so this one does route.
      expect(conditionLanguage(hass, 'pt')).toBe('pt');
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

    /**
     * The second copy of the trap `formatCondition` already guards one layer up. A
     * fetched language missing one condition falls back to `formatEntityState`, which
     * *succeeds* — in the instance's language — so the row shows a German word inside an
     * English card with nothing raised anywhere. Indistinguishable from working, exactly
     * like the raw-token case, unless it is said out loud.
     */
    it('reports a condition the fetched language does not carry', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const hass = germanHass({ en: { sunny: 'Sunny' } });

      ensureConditionTranslations(hass, 'en', () => undefined);
      await settle();
      debug.mockClear();

      expect(formatCondition(hass, 'weather.home', 'partlycloudy', 'en')).toBe('Teilweise bewölkt');

      const misses = debug.mock.calls.filter((call) =>
        String(call[0]).includes('has no "partlycloudy"'),
      );
      expect(misses).toHaveLength(1);
    });

    it('reports each missing condition once, not once per render', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const hass = germanHass({ en: { sunny: 'Sunny' } });

      ensureConditionTranslations(hass, 'en', () => undefined);
      await settle();
      debug.mockClear();

      for (let i = 0; i < 5; i++) {
        formatCondition(hass, 'weather.home', 'partlycloudy', 'en');
      }

      const misses = debug.mock.calls.filter((call) => String(call[0]).includes('has no'));
      expect(misses).toHaveLength(1);
    });

    it('says nothing about a cold cache, which is not a miss', () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const hass = germanHass({ en: ENGLISH_CONDITIONS });

      // Before the fetch resolves, falling back is the design — not a gap to report.
      expect(formatCondition(hass, 'weather.home', 'sunny', 'en')).toBe('Sonnig');

      const misses = debug.mock.calls.filter((call) => String(call[0]).includes('has no'));
      expect(misses).toHaveLength(0);
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

  /**
   * The condition set is closed, and the card writes it out twice — once as
   * `CONDITION_ICON_MAP` in `weather.ts`, once as `KNOWN_CONDITIONS` in
   * `weather-i18n.ts`, because the import can only run one way. This is what stops the
   * two drifting, and it is the falsifier for the claim that the set is closed at
   * fifteen: adding a sixteenth icon without a sixteenth known condition fails here.
   */
  describe('the closed condition set', () => {
    it('matches the icon map exactly, in both directions', () => {
      expect([...knownConditions()].sort()).toEqual(Object.keys(CONDITION_ICON_MAP).sort());
    });

    /**
     * The reconciliation above is over *keys*, so it says nothing about which icon each
     * condition draws — and nothing else did either. Rewriting `hail` to
     * `mdi:weather-hurricane`, `fog` to `mdi:weather-tornado` and `pouring` to
     * `mdi:weather-snowy` each left the whole suite green: ten of the fifteen values
     * appeared in no assertion anywhere, and a wrong one is silent by nature, because a
     * plausible weather glyph in a 14px badge does not read as a defect.
     *
     * Pinned whole rather than sampled, so an entry that changes value, an entry that
     * disappears and an entry nobody expected all fail here — the three directions a
     * loop over the table's own keys cannot see.
     */
    it('draws each condition with its own icon', () => {
      expect({ ...CONDITION_ICON_MAP }).toEqual({
        'clear-night': 'mdi:weather-night',
        cloudy: 'mdi:weather-cloudy',
        fog: 'mdi:weather-fog',
        hail: 'mdi:weather-hail',
        lightning: 'mdi:weather-lightning',
        'lightning-rainy': 'mdi:weather-lightning-rainy',
        partlycloudy: 'mdi:weather-partly-cloudy',
        pouring: 'mdi:weather-pouring',
        rainy: 'mdi:weather-rainy',
        snowy: 'mdi:weather-snowy',
        'snowy-rainy': 'mdi:weather-snowy-rainy',
        sunny: 'mdi:weather-sunny',
        windy: 'mdi:weather-windy',
        'windy-variant': 'mdi:weather-windy-variant',
        exceptional: 'mdi:weather-cloudy-alert',
      });
    });

    /**
     * The fallback for a condition the map does not carry. It shares its icon with
     * `exceptional`, so asserting the map alone cannot tell the two apart, and reaching
     * the real fallback means going through `getWeatherIcon`, which is not exported —
     * `weather-night-icons.test.ts` drives it through the subscription path instead.
     * What is pinned here is only that the map has no entry to hit.
     */
    it('has no entry for a condition Home Assistant does not define', () => {
      expect(CONDITION_ICON_MAP['not-a-condition']).toBeUndefined();
    });

    it('is the fifteen Home Assistant defines', () => {
      // Verified against a live instance (2026.8.1): `frontend/get_translations` returns
      // exactly these for every language, English-filled where untranslated.
      expect(knownConditions()).toHaveLength(15);
      expect(knownConditions()).toContain('windy-variant');
      expect(knownConditions()).toContain('clear-night');
    });

    /**
     * Home Assistant fills per-key gaps server-side, so a short payload means something
     * changed — a new condition, or a different response shape. Worth saying once, when
     * the data lands, rather than discovering it whenever the weather turns.
     */
    it('reports a payload that arrives incomplete', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const hass = germanHass({ en: { sunny: 'Sunny' } });

      ensureConditionTranslations(hass, 'en', () => undefined);
      await settle();

      const incomplete = debug.mock.calls.filter((call) =>
        String(call[0]).includes('without clear-night'),
      );
      expect(incomplete).toHaveLength(1);
    });

    it('says nothing when the payload is complete', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
      const complete: Record<string, string> = {};
      for (const condition of knownConditions()) {
        complete[condition] = `x-${condition}`;
      }
      const hass = germanHass({ en: complete });

      ensureConditionTranslations(hass, 'en', () => undefined);
      await settle();

      const incomplete = debug.mock.calls.filter((call) => String(call[0]).includes('without'));
      expect(incomplete).toHaveLength(0);
    });

    /**
     * The limit of both diagnostics, pinned as behaviour rather than left in a comment.
     *
     * Home Assistant fills gaps per **key**, so an untranslated condition arrives as a
     * present key holding the English string. The structural check sees 15/15 and says
     * nothing; the per-condition report sees a truthy value and says nothing. Measured
     * on 2026.8.1 across eight card languages: all returned 15/15, and seven carried
     * `windy-variant` in English — so a Portuguese card really does read
     * `Windy, cloudy`, silently, and this is the shape it arrives in.
     *
     * Asserting the silence is the point. It is a gap in Home Assistant's translations,
     * not in the card, and closing it would mean fetching English as a second payload
     * purely to compare. If anyone ever decides that trade is worth making, this test
     * fails and forces the decision to be deliberate.
     */
    it('cannot see an untranslated condition that arrives English-filled', async () => {
      const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);

      // Dutch, whose real payload is Dutch throughout with `windy-variant` in English.
      // A card language on purpose: `getEffectiveLanguage` rejects anything outside the
      // card's own map before `toHaLanguage` ever sees it, so `pt-br` — the clearest
      // illustration of the casing rule — cannot reach this path until the card ships
      // that language.
      const dutch: Record<string, string> = {};
      for (const condition of knownConditions()) {
        dutch[condition] = `nl-${condition}`;
      }
      dutch['windy-variant'] = 'Windy, cloudy';

      const hass = germanHass({ nl: dutch });
      ensureConditionTranslations(hass, 'nl', () => undefined);
      await settle();

      // It is returned, not reported — the value is HA's own fallback, not an error.
      expect(formatCondition(hass, 'weather.home', 'windy-variant', 'nl')).toBe('Windy, cloudy');

      const reports = debug.mock.calls.filter((call) => {
        const text = String(call[0]);
        return text.includes('has no') || text.includes('without');
      });
      expect(reports).toHaveLength(0);
    });
  });
});
