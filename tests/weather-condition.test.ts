import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import * as Logger from '../src/utils/logger';
import { formatCondition, resetUntranslatedConditions } from '../src/utils/weather';

/**
 * Condition text, and the trap that makes it worth testing.
 *
 * The column view's weather row states the condition in words, and the card ships no
 * condition strings of its own: Home Assistant already translates all fifteen under
 * `component.weather.entity_component._.state.*`, and `formatEntityState` takes a state
 * *override*, so handing it a forecast's condition returns that condition's text.
 *
 * Everything below exists because the failure mode is **silent**. `computeStateDisplay`
 * builds its lookup key from `computeDomain(stateObj.entity_id)`; a state object without
 * an `entity_id` produces `component.undefined.entity_component._.state.sunny`, which
 * matches nothing, and the chain falls through to *return the raw state*. The row still
 * renders. It just renders `sunny` to a German user, with no error anywhere — so a test
 * that only checked "some text came back" would pass against exactly the bug this is
 * guarding.
 */

/** A weather entity as Home Assistant hands it over: a full state object, `entity_id` and all. */
function weatherState(entityId = 'weather.home', state = 'sunny'): Types.HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: { temperature: 24, temperature_unit: '°C', friendly_name: 'Home' },
  };
}

/**
 * A `hass` whose formatter behaves like the real one: it resolves a translation only
 * when the state object carries an `entity_id` in the `weather` domain, and otherwise
 * returns the raw token, exactly as `computeStateDisplay` does.
 */
function hassWithFormatter(
  translations: Record<string, string>,
  states: Record<string, Types.HassEntity> = { 'weather.home': weatherState() },
): Types.Hass {
  return {
    states,
    callApi: async () => undefined,
    callService: () => undefined,
    formatEntityState: (stateObj, state) => {
      const value = state ?? stateObj.state;
      const domain = String(stateObj.entity_id).split('.')[0];
      return translations[`component.${domain}.entity_component._.state.${value}`] ?? value;
    },
  } as unknown as Types.Hass;
}

const GERMAN: Record<string, string> = {
  'component.weather.entity_component._.state.sunny': 'Sonnig',
  'component.weather.entity_component._.state.partlycloudy': 'Teilweise bewölkt',
  'component.weather.entity_component._.state.pouring': 'Strömender Regen',
};

describe('weather condition text', () => {
  beforeEach(() => {
    resetUntranslatedConditions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('localizes a forecast condition rather than the entity state', () => {
    // The entity itself is `sunny`; the forecast being described is `partlycloudy`.
    // Returning "Sonnig" here would mean the override argument was dropped and every
    // event in the card showed the same condition — right words, wrong weather.
    const hass = hassWithFormatter(GERMAN);

    expect(formatCondition(hass, 'weather.home', 'partlycloudy')).toBe('Teilweise bewölkt');
    expect(formatCondition(hass, 'weather.home', 'sunny')).toBe('Sonnig');
  });

  it('passes the real state object, so the domain resolves', () => {
    // The whole trap, asserted directly: a formatter that derives its key from
    // `entity_id` must be given an object that has one. A literal `{ state }` built at
    // the call site would land on `component.undefined.…` and miss.
    const seen: Types.HassEntity[] = [];
    const hass = {
      states: { 'weather.home': weatherState() },
      callApi: async () => undefined,
      callService: () => undefined,
      formatEntityState: (stateObj: Types.HassEntity) => {
        seen.push(stateObj);
        return 'Sonnig';
      },
    } as unknown as Types.Hass;

    formatCondition(hass, 'weather.home', 'sunny');

    expect(seen).toHaveLength(1);
    expect(seen[0].entity_id).toBe('weather.home');
  });

  it('makes a missed lookup visible instead of merely cosmetic', () => {
    // Home Assistant's final fallback is to return the state it was given, so an
    // untranslated condition is indistinguishable from a working one by its return
    // value alone. Rendering it is still correct — there is no better text — but it is
    // reported, because otherwise a whole language degrades to English tokens with
    // nothing raised anywhere.
    const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
    const hass = hassWithFormatter({});

    expect(formatCondition(hass, 'weather.home', 'partlycloudy')).toBe('partlycloudy');
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toContain('partlycloudy');
  });

  it('reports each condition once, not once per event per render', () => {
    const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);
    const hass = hassWithFormatter({});

    formatCondition(hass, 'weather.home', 'rainy');
    formatCondition(hass, 'weather.home', 'rainy');
    formatCondition(hass, 'weather.home', 'rainy');

    expect(debug).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a condition that did resolve', () => {
    const debug = vi.spyOn(Logger, 'debug').mockImplementation(() => undefined);

    expect(formatCondition(hassWithFormatter(GERMAN), 'weather.home', 'pouring')).toBe(
      'Strömender Regen',
    );
    expect(debug).not.toHaveBeenCalled();
  });

  /**
   * Each of these must lose the words and keep the row. The icon beside them is what
   * fixes the column layout and it needs no `hass` at all, so a missing formatter is a
   * reason to say less, never a reason to throw.
   */
  describe('degrades rather than throwing', () => {
    it('returns nothing without a hass', () => {
      expect(formatCondition(undefined, 'weather.home', 'sunny')).toBeUndefined();
      expect(formatCondition(null, 'weather.home', 'sunny')).toBeUndefined();
    });

    it('returns nothing on an instance with no formatter', () => {
      const hass = {
        states: { 'weather.home': weatherState() },
        callApi: async () => undefined,
        callService: () => undefined,
      } as unknown as Types.Hass;

      expect(formatCondition(hass, 'weather.home', 'sunny')).toBeUndefined();
    });

    it('returns nothing when the entity is not in the state machine', () => {
      const hass = hassWithFormatter(GERMAN, {});

      expect(formatCondition(hass, 'weather.home', 'sunny')).toBeUndefined();
    });

    it('returns nothing without an entity or a condition', () => {
      const hass = hassWithFormatter(GERMAN);

      expect(formatCondition(hass, undefined, 'sunny')).toBeUndefined();
      expect(formatCondition(hass, 'weather.home', undefined)).toBeUndefined();
      expect(formatCondition(hass, 'weather.home', '')).toBeUndefined();
    });

    it('returns nothing when the formatter answers with an empty string', () => {
      const hass = {
        states: { 'weather.home': weatherState() },
        callApi: async () => undefined,
        callService: () => undefined,
        formatEntityState: () => '',
      } as unknown as Types.Hass;

      // A stray separator beside a temperature is worse than no words at all.
      expect(formatCondition(hass, 'weather.home', 'sunny')).toBeUndefined();
    });
  });
});
