/**
 * Visibility conditions on one calendar, on the real card.
 *
 * `visibility.test.ts` pins how conditions are judged; this file pins what an entry they hide
 * means for the card: its events gone from every view of them, and a calendar every entry of
 * which is hidden treated as though it were not on the card at all — no chip, no search result,
 * no place in the event limits, no add-event target, no failure named, no action falling back to
 * it, nothing keeping `hide_when_empty` from hiding the card or lighting reset. Each case turns a
 * condition on, since the suite's default config has none and would pass every assertion with
 * the feature doing nothing.
 *
 * It also pins when the card judges them again: a `hass` naming the entity a condition reads, a
 * media query's change, a `time` condition's moment, all without fetching; and never while the
 * card is being edited, which shows every calendar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { SearchSession } from '../src/interaction/search-session';
import * as EventUtils from '../src/utils/events';
import { configFingerprint, writeHiddenCalendars } from '../src/utils/view-choice';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/** Wednesday, June 17, 2026, mid-morning; the unit project runs on UTC. */
const NOW = new Date(Date.UTC(2026, 5, 17, 10, 0));

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const FAMILY = 'calendar.family';
const VACATION = 'input_boolean.vacation';

const HELD: Record<string, Types.CalendarEventData[]> = {
  [ANNA]: [
    {
      summary: 'Dentist',
      uid: 'dentist',
      start: { dateTime: '2026-06-17T15:00:00.000Z' },
      end: { dateTime: '2026-06-17T16:00:00.000Z' },
    },
    {
      summary: 'Holiday',
      uid: 'holiday',
      start: { date: '2026-06-18' },
      end: { date: '2026-06-19' },
    },
  ],
  [BEN]: [
    {
      summary: 'Football',
      uid: 'football',
      start: { dateTime: '2026-06-17T18:00:00.000Z' },
      end: { dateTime: '2026-06-17T19:00:00.000Z' },
    },
  ],
  [FAMILY]: [
    {
      summary: 'Recycling',
      uid: 'recycling',
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
    },
  ],
};

/** Shown to Ben only, which hides it from Anna, who views every case unless one says otherwise. */
const BEN_ONLY = [{ condition: 'user', users: ['u-ben'] }];

/** Shown while nobody is on vacation. */
const AT_WORK = [{ condition: 'state', entity: VACATION, state: 'off' }];

/** The toolbar with the legend's chips, add event and reset, and nothing else. */
const TOOLBAR: Types.ToolbarConfig = {
  show: true,
  legend: 'chips',
  navigation: false,
  reset: true,
  view_switcher: false,
  add_event: true,
  refresh: false,
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass: Types.Hass;
  preview: boolean;
  hidden: boolean;
  readonly updateComplete: Promise<boolean>;
  handleAction(action: Types.ActionConfig): void;
  _writableCalendars: string[];
  _searchHost(): ConstructorParameters<typeof SearchSession>[0] extends () => infer H ? H : never;
  _differsFromConfiguration: boolean;
  _visibilityQueries: Map<string, () => void>;
  _visibilityTimerId: number | null;
}

const callApi = vi.fn();

function calendarOf(path: string): string {
  return path.split('?')[0].replace('calendars/', '');
}

function answer(held: Record<string, Types.CalendarEventData[]> = HELD, failing: string[] = []) {
  callApi.mockImplementation(async (_method: string, path: string) => {
    const id = calendarOf(path);
    if (failing.includes(id)) throw new Error(`${id} is down`);
    return held[id] ?? [];
  });
}

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}) {
  return { entity_id: entityId, state: value, attributes };
}

function makeHass(
  options: { user?: string; vacation?: string; locale?: Record<string, unknown> } = {},
): Types.Hass {
  return {
    states: {
      [ANNA]: state(ANNA, 'off', { friendly_name: 'Anna', supported_features: 7 }),
      [BEN]: state(BEN, 'off', { friendly_name: 'Ben', supported_features: 7 }),
      [FAMILY]: state(FAMILY, 'off', { friendly_name: 'Family', supported_features: 7 }),
      [VACATION]: state(VACATION, options.vacation ?? 'off'),
    },
    user: { id: options.user ?? 'u-anna' },
    locale: { language: 'en', ...options.locale },
    config: { time_zone: 'UTC' },
    callApi,
    localize: (key: string) => key,
  } as unknown as Types.Hass;
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

/** The configuration a card is given, built as Home Assistant would hand it over. */
function configFor(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({
    entities: [{ entity: ANNA, visibility: BEN_ONLY } as never, BEN, FAMILY],
    days_to_show: 3,
    toolbar: TOOLBAR,
    ...overrides,
  });
}

async function mount(
  overrides: Partial<Types.Config> = {},
  options: { hass?: Types.Hass; preview?: boolean } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(configFor(overrides));
  if (options.preview) card.preview = true;
  card.hass = options.hass ?? makeHass();
  document.body.appendChild(card);
  await settle(card);
  return card;
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

function titles(card: CardUnderTest): string[] {
  return Array.from(root(card).querySelectorAll('.content-container .event-title')).map((title) =>
    title.textContent!.trim(),
  );
}

function chipIds(card: CardUnderTest): string[] {
  return Array.from(root(card).querySelectorAll<HTMLElement>('.legend-chip')).map(
    (chip) => chip.dataset.calendar!,
  );
}

function notice(card: CardUnderTest): string | null {
  return root(card).querySelector('.fetch-error-text')?.textContent?.trim() ?? null;
}

/** A `MediaQueryList` the test answers, and can tell its listeners about. */
function stubMatchMedia(matching: Set<string>) {
  const listeners = new Map<string, Set<() => void>>();
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      return matching.has(query);
    },
    addEventListener: (_type: string, listener: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.get(query)?.delete(listener);
    },
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    listeners,
    flip(query: string, matches: boolean) {
      if (matches) matching.add(query);
      else matching.delete(query);
      for (const listener of listeners.get(query) ?? []) listener();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  answer();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe('an entry its conditions hide', () => {
  it('draws none of its events, and those of every other calendar', async () => {
    const card = await mount();

    expect(titles(card)).toEqual(['Recycling', 'Football']);
  });

  it('draws them for the person its conditions name (control)', async () => {
    const card = await mount({}, { hass: makeHass({ user: 'u-ben' }) });

    expect(titles(card)).toEqual(['Recycling', 'Dentist', 'Football', 'Holiday']);
  });

  it('hides one entry of a calendar listed twice, and keeps the other and its chip', async () => {
    const card = await mount({
      entities: [
        { entity: ANNA, event_type: 'timed', visibility: BEN_ONLY } as never,
        { entity: ANNA, event_type: 'all_day' },
        BEN,
      ],
    });

    expect(titles(card)).toEqual(['Football', 'Holiday']);
    expect(chipIds(card)).toEqual([ANNA, BEN]);
  });

  it('keeps hiding it after a new configuration that changes no entry', async () => {
    const card = await mount();
    const fetched = callApi.mock.calls.length;

    // Every object new, as Home Assistant hands over a configuration it parsed again.
    card.setConfig(structuredClone(configFor({ title: 'Renamed' })));
    await settle(card);

    // The events still carry the entry they were matched to under the old configuration.
    expect(callApi.mock.calls.length).toBe(fetched);
    expect(titles(card)).toEqual(['Recycling', 'Football']);
  });

  it('shows every calendar while the card is being edited', async () => {
    const card = await mount({}, { preview: true });

    expect(titles(card)).toContain('Dentist');
    expect(chipIds(card)).toEqual([ANNA, BEN, FAMILY]);
  });

  it('leaves its events out of the compact limit, which fills from the calendars shown', async () => {
    const card = await mount({ compact_events_to_show: 2 });

    expect(titles(card)).toEqual(['Recycling', 'Football']);
  });
});

describe('a calendar every entry of which is hidden', () => {
  it('has no chip in the legend, which cannot show it again', async () => {
    const card = await mount();

    expect(chipIds(card)).toEqual([BEN, FAMILY]);
  });

  it('is not offered to add or move an event to', async () => {
    const card = await mount();

    expect(card._writableCalendars).toEqual([BEN, FAMILY]);
  });

  it('is not named when it cannot be loaded, and its failure keeps nothing on screen', async () => {
    answer(HELD, [ANNA]);
    const card = await mount({ hide_when_empty: true });

    expect(notice(card)).toBeNull();
    expect(titles(card)).toEqual(['Recycling', 'Football']);
  });

  it('leaves a shown calendar that failed to blank the card, its own events aside', async () => {
    // Only Anna's events are held, and her conditions hide them: nothing shown was loaded, so
    // the card draws the notice alone rather than empty days claiming there is nothing.
    answer({ [ANNA]: HELD[ANNA] }, [BEN]);
    const card = await mount({ entities: [{ entity: ANNA, visibility: BEN_ONLY } as never, BEN] });

    expect(notice(card)).toContain('Ben');
    // Not even an empty day's placeholder.
    expect(titles(card)).toEqual([]);
  });

  it('is named when it cannot be loaded and is shown (control)', async () => {
    answer(HELD, [ANNA]);
    const card = await mount({}, { hass: makeHass({ user: 'u-ben' }) });

    expect(notice(card)).toContain('Anna');
  });

  it('lets hide_when_empty hide a card holding only its events', async () => {
    answer({ [ANNA]: HELD[ANNA] });
    const card = await mount({ hide_when_empty: true });

    expect(card.hidden).toBe(true);
  });

  it('lets hide_when_empty hide the card though it failed', async () => {
    answer({}, [ANNA]);
    const card = await mount({ hide_when_empty: true });

    expect(card.hidden).toBe(true);
  });

  it('never lights reset, though the legend remembers it as hidden', async () => {
    writeHiddenCalendars(configFingerprint(configFor()), [ANNA]);

    const shown = await mount({}, { hass: makeHass({ user: 'u-ben' }) });
    expect(shown._differsFromConfiguration).toBe(true);

    const hidden = await mount();
    expect(hidden._differsFromConfiguration).toBe(false);
  });

  it('limits nothing with its own compact limit, so expanding changes nothing', async () => {
    const entities = [
      { entity: ANNA, visibility: BEN_ONLY, compact_events_to_show: 1 } as never,
      BEN,
    ];
    const card = await mount({ entities, tap_action: { action: 'expand' } });

    card.handleAction({ action: 'expand' });
    await settle(card);
    expect(card._differsFromConfiguration).toBe(false);

    // The control: shown to Ben, the limit is real, and expanding it is something to reset.
    const shown = await mount(
      { entities, tap_action: { action: 'expand' } },
      { hass: makeHass({ user: 'u-ben' }) },
    );
    shown.handleAction({ action: 'expand' });
    await settle(shown);
    expect(shown._differsFromConfiguration).toBe(true);
  });

  it('is not what a tap on no entity of its own applies to', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const fired: Array<{ config: { entity?: string } }> = [];
    card.addEventListener('hass-action', (event) => fired.push((event as CustomEvent).detail));

    card.handleAction({ action: 'more-info' });

    expect(fired.map(({ config }) => config.entity)).toEqual([BEN]);
  });

  it('is not found by a search, and is once its conditions show it', async () => {
    const hass = makeHass();
    const card = await mount({}, { hass });
    const session = new SearchSession(() => card._searchHost(), {
      picked: () => undefined,
      gone: () => undefined,
    });
    const changed = vi.fn();
    session.attach({ changed, close: () => undefined });
    // As the card holds the search it opened, so it tells the panel itself.
    (card as unknown as { _search: SearchSession })._search = session;

    expect(session.find('Dentist').total).toBe(0);
    expect(session.find('Football').total).toBe(1);

    card.hass = { ...hass, user: { id: 'u-ben' } } as Types.Hass;
    await settle(card);

    expect(changed).toHaveBeenCalled();
    expect(session.find('Dentist').total).toBe(1);
  });
});

describe('judging again', () => {
  it('follows the state a condition reads, without fetching', async () => {
    const hass = makeHass();
    const card = await mount({
      entities: [{ entity: ANNA, visibility: AT_WORK } as never, BEN],
    });
    expect(titles(card)).toContain('Dentist');
    const fetched = callApi.mock.calls.length;

    card.hass = { ...hass, states: { ...hass.states, [VACATION]: state(VACATION, 'on') } };
    await settle(card);

    expect(titles(card)).toEqual(['Football']);
    expect(callApi.mock.calls.length).toBe(fetched);
  });

  it('follows a media query, and stops listening once detached', async () => {
    const wide = '(min-width: 600px)';
    const media = stubMatchMedia(new Set());
    const card = await mount({
      entities: [
        { entity: ANNA, visibility: [{ condition: 'screen', media_query: wide }] } as never,
        BEN,
      ],
    });
    expect(titles(card)).toEqual(['Football']);
    expect(media.listeners.get(wide)?.size).toBe(1);

    media.flip(wide, true);
    await settle(card);
    expect(titles(card)).toEqual(['Dentist', 'Football', 'Holiday']);

    card.remove();
    expect(media.listeners.get(wide)?.size).toBe(0);
    expect(card._visibilityTimerId).toBeNull();
  });

  it('turns at a time condition, from a timer it sets for that moment', async () => {
    // A day between refreshes, so nothing but the condition's own timer draws the card again.
    const card = await mount({
      entities: [
        { entity: ANNA, visibility: [{ condition: 'time', after: '12:00' }] } as never,
        BEN,
      ],
      refresh_interval: 1440,
    });
    const fetched = callApi.mock.calls.length;
    expect(titles(card)).toEqual(['Football']);

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000 - 1000);
    await settle(card);
    expect(titles(card)).toEqual(['Football']);

    await vi.advanceTimersByTimeAsync(2000);
    await settle(card);

    expect(titles(card)).toEqual(['Dentist', 'Football', 'Holiday']);
    expect(callApi.mock.calls.length).toBe(fetched);
  });

  it('holds no listener or timer for a card with no conditions (control)', async () => {
    const card = await mount({ entities: [ANNA, BEN] });

    expect(card._visibilityQueries.size).toBe(0);
    expect(card._visibilityTimerId).toBeNull();
  });
});
