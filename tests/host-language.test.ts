/**
 * The host's `effectiveLanguage` getter, and that the language it resolves reaches the DOM.
 *
 * Nothing read this getter. `tests/host-updated-wiring.test.ts` covers the *re-derivation*
 * side — it asserts `_language` follows a config edit — but `_language` is the private field,
 * and every consumer of the language (`groupedEvents`, `visibleEventCount`, `render`) goes
 * through the getter instead. So the fallback arm was free: replacing `this._language || 'en'`
 * with `&&` returns `'en'` for every configured language and `''` when none is set, and the
 * whole suite stayed green. Measured at 68 of 74 rows changed in a lifecycle differential,
 * against 0 for the two sibling mutants in `updated()`, which recompute more often and reach
 * the same answer.
 *
 * The DOM assertions are the half that matters. A getter test alone would pass on a card whose
 * renderers had stopped consulting the language at all, and this suite is otherwise built from
 * English fixtures, where a hard-wired `'en'` is indistinguishable from a correct resolution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  events: unknown[];
  isInitialLoad: boolean;
  updateComplete: Promise<boolean>;
  effectiveLanguage: string;
}

/** A Thursday, so the weekday abbreviation differs between English and German. */
const EVENT = {
  start: { dateTime: '2026-06-18T09:00:00.000Z' },
  end: { dateTime: '2026-06-18T10:00:00.000Z' },
  summary: 'Zahnarzt',
  _entityId: 'calendar.personal',
};

/** An all-day event, whose label is a translated string rather than a formatted date. */
const ALL_DAY = {
  start: { date: '2026-06-18' },
  end: { date: '2026-06-19' },
  summary: 'Urlaub',
  _entityId: 'calendar.personal',
};

function make(config: Record<string, unknown>): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.personal'], days_to_show: 7, ...config });
  card.isInitialLoad = false;
  return card;
}

/** Mount with events already in hand, so nothing depends on the fetch path. */
async function render(
  config: Record<string, unknown>,
  locale: { language: string } | undefined,
  events: unknown[] = [EVENT],
): Promise<CardUnderTest> {
  const card = make(config);
  document.body.appendChild(card);
  card.hass = { states: {}, locale, connection: {} };
  card.events = events;
  await card.updateComplete;
  return card;
}

describe('effectiveLanguage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('prefers the configured language over the Home Assistant locale', async () => {
    const card = await render({ language: 'de' }, { language: 'en' });

    expect(card.effectiveLanguage).toBe('de');
  });

  it('falls back to the Home Assistant locale when none is configured', async () => {
    const card = await render({}, { language: 'de' });

    expect(card.effectiveLanguage).toBe('de');
  });

  it('falls back to English when neither names a supported language', async () => {
    // The `|| 'en'` arm. Reachable in production: `_language` is only assigned once `hass`
    // has arrived, and `render()` reads the getter before that on the very first paint.
    const card = await render({ language: 'klingon' }, { language: 'klingon' });

    expect(card.effectiveLanguage).toBe('en');
  });

  it('resolves a regional locale to its base language', async () => {
    // `de-DE` is not a translation of its own; `getEffectiveLanguage` splits it. Included
    // because it is the shape a real Home Assistant profile sends.
    const card = await render({}, { language: 'de-DE' });

    expect(card.effectiveLanguage).toBe('de');
  });

  it('is English before hass arrives', async () => {
    // The other half of the fallback: with no `hass` there is nothing to resolve against,
    // and the getter must still return a usable language rather than an empty string.
    const card = make({ language: 'de' });
    document.body.appendChild(card);

    expect(card.effectiveLanguage).toBe('en');
  });
});

describe('the resolved language reaches the rendered card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders weekday names in the configured language', async () => {
    const german = await render({ language: 'de' }, { language: 'en' });
    const text = german.shadowRoot?.textContent ?? '';

    // 2026-06-18 is a Thursday: `Do` in German, `Thu` in English.
    expect(text).toContain('Do');
    expect(text).not.toContain('Thu');
  });

  it('renders weekday names in English when that is what resolves', async () => {
    // The control. Without it, an assertion that German renders `Do` is also satisfied by a
    // card that renders `Do` regardless of language — and every other fixture in this suite
    // is English, so nothing else would notice.
    const english = await render({ language: 'en' }, { language: 'de' });
    const text = english.shadowRoot?.textContent ?? '';

    expect(text).toContain('Thu');
    expect(text).not.toContain('Do');
  });

  it('renders translated strings, not just formatted dates', async () => {
    // A weekday could in principle come from `Intl` rather than from the card's own
    // translations. `allDay` cannot: it exists only in the language files.
    const german = await render({ language: 'de' }, { language: 'en' }, [ALL_DAY]);
    const text = german.shadowRoot?.textContent ?? '';

    expect(text).toContain('Ganztägig');
    expect(text).not.toContain('All day');
  });

  it('follows the Home Assistant locale when no language is configured', async () => {
    // Ties the two halves together: the getter's locale fallback is what the DOM shows.
    const card = await render({}, { language: 'de' }, [ALL_DAY]);

    expect(card.effectiveLanguage).toBe('de');
    expect(card.shadowRoot?.textContent ?? '').toContain('Ganztägig');
  });
});
