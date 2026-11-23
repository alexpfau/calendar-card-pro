/**
 * Every card waiting on one weather-translation request must be told when it lands.
 *
 * `ensureConditionTranslations()` deduplicates the WebSocket call, which is right — two
 * calendar cards on the same dashboard should not each ask Home Assistant for the same
 * language. But the second caller was turned away at the door: it returned early on the
 * in-flight check and its `onLoaded` callback was dropped on the floor.
 *
 * The translations then arrive and are cached, so the data is there — but only the card
 * that happened to ask first is told to redraw. The second card keeps showing the
 * untranslated English fallback until something unrelated in Home Assistant forces it to
 * render again, which on a quiet dashboard can be minutes.
 *
 * The control is the single-caller case, which always worked; it has to keep working,
 * because the cheapest wrong fix is to drop the deduplication entirely and let both cards
 * issue their own request.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import * as WeatherI18n from '../src/utils/weather-i18n';

/** A hass whose translation request resolves only when the test releases it. */
function deferredHass(counter: { n: number }): {
  hass: Types.Hass;
  release: () => Promise<void>;
} {
  let resolveRequest: (value: unknown) => void = () => {};
  const pending = new Promise((resolve) => {
    resolveRequest = resolve;
  });

  const hass = {
    language: 'en',
    locale: { language: 'en' },
    states: {},
    callService: () => {},
    callWS: () => {
      counter.n += 1;
      return pending;
    },
  } as unknown as Types.Hass;

  return {
    hass,
    release: async () => {
      resolveRequest({
        resources: {
          'component.weather.entity_component._.state.sunny': 'Ensoleillé',
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('concurrent weather-translation consumers', () => {
  beforeEach(() => {
    WeatherI18n.resetConditionTranslations();
  });

  it('control: a single caller is notified and the translation is cached', async () => {
    const counter = { n: 0 };
    const { hass, release } = deferredHass(counter);
    const first = vi.fn();

    WeatherI18n.ensureConditionTranslations(hass, 'fr', first);
    await release();

    expect({
      requests: counter.n,
      firstCalls: first.mock.calls.length,
      translated: WeatherI18n.lookupCondition('fr', 'sunny'),
    }).toEqual({ requests: 1, firstCalls: 1, translated: 'Ensoleillé' });
  });

  it('notifies every card waiting on the same in-flight language request', async () => {
    const counter = { n: 0 };
    const { hass, release } = deferredHass(counter);
    const first = vi.fn();
    const second = vi.fn();

    WeatherI18n.ensureConditionTranslations(hass, 'fr', first);
    WeatherI18n.ensureConditionTranslations(hass, 'fr', second);
    await release();

    expect({
      requests: counter.n,
      firstCalls: first.mock.calls.length,
      secondCalls: second.mock.calls.length,
    }).toEqual({ requests: 1, firstCalls: 1, secondCalls: 1 });
  });
});

/**
 * A language whose words could not be loaded is asked for again on a backoff, not on every card
 * update: a minute, doubling, as the registry colors are (`page-backoff.ts`). Nothing schedules
 * the retry; the first update after the wait makes it.
 */
describe('a translation request that fails', () => {
  beforeEach(() => {
    WeatherI18n.resetConditionTranslations();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T10:00:00Z'));
    return () => vi.useRealTimers();
  });

  /** A hass whose translations are refused, or answered empty, `failures` times, then answered. */
  function failingHass(failures: number, empty = false) {
    const calls: number[] = [];
    const start = Date.now();
    const hass = {
      language: 'en',
      locale: { language: 'en' },
      states: {},
      callService: () => {},
      callWS: () => {
        calls.push((Date.now() - start) / 1000);
        if (calls.length <= failures) {
          return empty ? Promise.resolve({ resources: {} }) : Promise.reject(new Error('down'));
        }
        return Promise.resolve({
          resources: { 'component.weather.entity_component._.state.sunny': 'Ensoleillé' },
        });
      },
    } as unknown as Types.Hass;
    return { hass, calls };
  }

  /** A card update every ten seconds for `minutes`, each asking for the words. */
  async function updates(hass: Types.Hass, minutes: number, onLoaded = () => {}) {
    for (let at = 0; at < minutes * 6; at++) {
      WeatherI18n.ensureConditionTranslations(hass, 'fr', onLoaded);
      await vi.advanceTimersByTimeAsync(10 * 1000);
    }
  }

  it.each([
    ['refused', false],
    ['answered without words', true],
  ])('waits a minute, then two, when %s', async (_name, empty) => {
    const conn = failingHass(Infinity, empty);
    await updates(conn.hass, 4);

    expect(conn.calls).toEqual([0, 60, 180]);
  });

  it('loads the words once a later try gets through, and tells the card', async () => {
    const conn = failingHass(1);
    const loaded = vi.fn();
    await updates(conn.hass, 2, loaded);

    expect(conn.calls).toEqual([0, 60]);
    expect(WeatherI18n.lookupCondition('fr', 'sunny')).toBe('Ensoleillé');
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});
