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
