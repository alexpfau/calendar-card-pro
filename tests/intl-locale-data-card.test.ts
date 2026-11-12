/**
 * The card and the editor teach Home Assistant's `Intl` polyfill their language, and draw again
 * once it has it (`src/translations/intl-locale-data.ts`, called from `willUpdate`).
 *
 * The loader itself is held in `tests/intl-locale-data.test.ts`; this file holds the wiring, with
 * the same stand-in for Home Assistant's polyfill and files: a German card under an Icelandic
 * Home Assistant first draws "Núna", the polyfill's word, and "Jetzt" once German has arrived,
 * with no other change; without the polyfill nothing is fetched at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { homeAssistantFiles, installPolyfill, removePolyfill } from './intl-polyfill';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import { forgetIntlFormats } from '../src/translations/intl-locales';

customElements.define('intl-locale-data-editor-probe', CalendarCardProEditor);

const NOW = new Date('2026-06-17T10:00:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  render(): unknown;
}

interface EditorUnderTest extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
  render(): unknown;
}

const RUNNING: Types.CalendarEventData = {
  summary: 'Swim practice',
  start: { dateTime: '2026-06-17T09:30:00Z' },
  end: { dateTime: '2026-06-17T10:30:00Z' },
};

async function mountCard(language: string, haLanguage: string): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 2, language });
  card.hass = {
    states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
    locale: { language: haLanguage, first_weekday: 'monday', time_format: '24' },
    callApi: vi.fn().mockResolvedValue([RUNNING]),
    callService: vi.fn(),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

const nowBadge = (card: CardUnderTest): string =>
  card.shadowRoot!.querySelector('.now-indicator')?.textContent?.trim() ?? '';

/** A `fetch` that holds every answer until `release` is called. */
function heldFetch(serve: (url: string) => Promise<unknown>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const asked: string[] = [];
  return {
    asked,
    release: () => release(),
    fetch: async (url: string) => {
      asked.push(url);
      await gate;
      return serve(url);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  removePolyfill();
  forgetIntlFormats();
});

describe('the card', () => {
  it("draws the polyfill's word until German arrives, then draws again in German", async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    const held = heldFetch(files.fetch);
    vi.stubGlobal('fetch', held.fetch);

    const card = await mountCard('de', 'is');
    expect(nowBadge(card)).toBe('Núna');
    expect(held.asked).toEqual([
      '/static/locale-data/intl-datetimeformat/de.json',
      '/static/locale-data/intl-relativetimeformat/de.json',
    ]);
    const render = vi.spyOn(card, 'render');

    held.release();
    await vi.advanceTimersByTimeAsync(1);
    await card.updateComplete;

    expect(nowBadge(card)).toBe('Jetzt');
    expect(render).toHaveBeenCalled();
  });

  it('fetches nothing without the polyfill', async () => {
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);

    const card = await mountCard('nl', 'is');
    await vi.advanceTimersByTimeAsync(1);

    expect(nowBadge(card)).toBe('Nu');
    expect(files.asked).toEqual([]);
  });
});

describe('the editor', () => {
  it('loads its language for the lists it joins, and draws again', async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);

    const editor = document.createElement('intl-locale-data-editor-probe') as EditorUnderTest;
    editor.hass = { states: {}, locale: { language: 'is' } };
    document.body.appendChild(editor);
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, language: 'fr' });
    await editor.updateComplete;
    const render = vi.spyOn(editor, 'render');

    await vi.advanceTimersByTimeAsync(1);
    await editor.updateComplete;

    expect(files.asked).toEqual(['/static/locale-data/intl-listformat/fr.json']);
    expect(render).toHaveBeenCalled();
  });
});
