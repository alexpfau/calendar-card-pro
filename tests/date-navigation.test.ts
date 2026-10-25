/**
 * The header toolbar's date navigation, on the real card.
 *
 * It ships off, so every gate built from default config sees none of it; each case here turns
 * it on. The pure rules — page length, home, labels, DST — are in `paging.test.ts` and
 * `paging.dst.test.ts`. This file pins how the card joins them: where the controls sit, which
 * window each press fetches and where it is cached, that quick presses add up and only the last
 * page is drawn, that past events and `hide_when_empty` apply at home only, that editing is
 * inert and brings the card home, and that a view switch keeps the page without fetching.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as CalendarChanges from '../src/interaction/calendar-changes';
import * as EventUtils from '../src/utils/events';
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
const NOW = new Date(2026, 5, 17, 10, 0);

/** `Intl`'s range separator: an en dash between thin spaces. */
const TO = '\u2009–\u2009';

/** Home is the week of June 15, Monday to Sunday. */
const BASE: Partial<Types.Config> = {
  entities: ['calendar.anna'],
  days_to_show: 7,
  start_date: 'start_of_week',
  first_day_of_week: 'monday',
  toolbar: { show: true, navigation: true, view_switcher: false, add_event: false },
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  events: Types.CalendarEventData[];
  readonly visibleEventCount: number;
  readonly effectiveView: Types.EffectiveView;
  _columnCount: number;
  _failureCountHint: number;
  _newEventDate(): Date;
  readonly updateComplete: Promise<boolean>;
}

/** Records what the card asks of `ResizeObserver`, and hands back its callback. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];

  readonly observed: Element[] = [];

  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {}
}

/** One event a day at 09:00, named for its day, from May through July. */
function eventsBetween(start: Date, end: Date): Types.CalendarEventData[] {
  const events: Types.CalendarEventData[] = [];
  for (let day = new Date(2026, 4, 1); day < new Date(2026, 7, 1);) {
    const key = day.toISOString().slice(0, 10);
    const at = new Date(`${key}T09:00:00.000Z`);
    if (at >= start && at < end) {
      events.push({
        summary: `Event ${key}`,
        start: { dateTime: `${key}T09:00:00.000Z` },
        end: { dateTime: `${key}T09:30:00.000Z` },
      });
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return events;
}

const callApi = vi.fn();

/** Answer every request from the fixture, at once. */
function answerFromFixture(): void {
  callApi.mockImplementation(async (_method: string, path: string) => {
    const query = new URLSearchParams(path.split('?')[1]);
    return eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!));
  });
}

/** The first day of every window the card has asked Home Assistant for, in order. */
function fetchedStarts(): string[] {
  return callApi.mock.calls.map((call) =>
    new URLSearchParams(String(call[1]).split('?')[1]).get('start')!.slice(0, 10),
  );
}

/** The first day of the window the card asked for last. */
function lastFetchedStart(): string {
  const starts = fetchedStarts();
  return starts[starts.length - 1];
}

function hass(localize?: (key: string) => string): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { supported_features: 7 },
      },
    },
    locale: { language: 'en' },
    callApi,
    localize:
      localize ??
      ((key: string) =>
        ({
          'ui.common.previous': 'Previous',
          'ui.common.next': 'Next',
          'ui.components.calendar.event.add': 'Add event',
        })[key] ?? key),
  };
}

/**
 * Let every pending fetch and render run. `setImmediate` is not faked, so each round drains
 * every microtask the fetch chain queues, however many hops it takes.
 */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config> = {},
  options: { flag?: 'preview' | 'editMode'; localize?: (key: string) => string } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig({ ...BASE, ...overrides }));
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize);
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** Deliver a width the way the browser does, and let the settle delay run out. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  );
  if (!observer) throw new Error('the card never asked to be observed');
  observer.callback([{ contentRect: { width } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

function segments(card: CardUnderTest): HTMLButtonElement[] {
  return Array.from(root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment'));
}

async function press(card: CardUnderTest, which: 'previous' | 'home' | 'next'): Promise<void> {
  segments(card)[{ previous: 0, home: 1, next: 2 }[which]].click();
  await settle(card);
}

function range(card: CardUnderTest): string {
  return root(card).querySelector('.toolbar-range-text')!.textContent!.trim();
}

/** The days whose events the card holds, as its own fixture names them. */
function heldDays(card: CardUnderTest): string[] {
  return [
    ...new Set(card.events.map((event) => (event.summary ?? '').replace('Event ', ''))),
  ].sort();
}

/** Cache entries the card wrote to `localStorage`. */
function persistedEntries(): string[] {
  return Object.keys(localStorage).filter((key) =>
    key.startsWith(Constants.CACHE.EVENT_CACHE_KEY_PREFIX),
  );
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  answerFromFixture();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

describe('the date navigation', () => {
  it('draws nothing of its own until asked for', async () => {
    const card = await mount({ toolbar: { show: true, view_switcher: false } });

    expect(root(card).querySelector('.toolbar-leading')).toBeNull();
    expect(root(card).querySelector('.header-container')!.className).toBe(
      'header-container has-toolbar',
    );
  });

  it('leads a band of its own under the title, the trailing controls at its end', async () => {
    const card = await mount({ title: 'Family', toolbar: { ...BASE.toolbar, add_event: true } });
    const header = root(card).querySelector('.header-container')!;

    expect(header.className).toBe('header-container has-toolbar has-band');
    expect(Array.from(header.children).map((child) => child.className)).toEqual([
      'card-header',
      'card-toolbar toolbar-band',
    ]);
    const band = header.querySelector('.toolbar-band')!;
    expect(Array.from(band.children).map((child) => child.className)).toEqual([
      'toolbar-leading',
      'toolbar-trailing',
    ]);
  });

  it('is the whole header without a title, after the placeholder card-mod styles find', async () => {
    const card = await mount();
    const header = root(card).querySelector('.header-container')!;

    expect(Array.from(header.children).map((child) => child.className)).toEqual([
      'card-header-placeholder',
      'card-toolbar toolbar-band',
    ]);
    expect(root(card).querySelector('.toolbar-trailing')).toBeNull();
  });

  it('names its controls, and the dates on screen', async () => {
    const card = await mount();
    const [previous, home, next] = segments(card);

    // One group for the dates, named by the dates it moves through.
    const group = root(card).querySelector('.toolbar-leading')!;
    expect(group.getAttribute('role')).toBe('group');
    const labelledBy = group.getAttribute('aria-labelledby')!;
    expect(root(card).getElementById(labelledBy)!.textContent!.trim()).toBe(`Jun 15${TO}21`);
    expect(previous.getAttribute('aria-label')).toBe('Previous');
    expect(previous.getAttribute('title')).toBe('Previous');
    expect(next.getAttribute('aria-label')).toBe('Next');
    // Home is an icon, named by its tooltip: today is in the window the card opens with.
    expect(home.getAttribute('aria-label')).toBe('Today');
    expect(home.getAttribute('title')).toBe('Today');
    expect(home.textContent!.trim()).toBe('');
    expect(range(card)).toBe(`Jun 15${TO}21`);
    // Announced when it changes. The button holds the dates alone, so its pill is as wide as
    // they are; an invisible copy of the widest label a week can have keeps the room beside it.
    expect(root(card).querySelector('.toolbar-range-text')!.getAttribute('aria-live')).toBe(
      'polite',
    );
    const reserve = root(card).querySelector('.toolbar-range-reserve')!;
    expect(reserve.textContent).toBe(`Jan 26${TO}Feb 1, 2000`);
    expect(reserve.closest('.toolbar-range')).toBeNull();
    expect(reserve.parentElement!.classList.contains('toolbar-range-anchor')).toBe(true);
    for (const button of [...segments(card), root(card).querySelector('.toolbar-range')!]) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('names the arrows in English for assistive technology alone when Home Assistant has no words', async () => {
    const card = await mount({}, { localize: (key) => key });
    const [previous, , next] = segments(card);

    expect(previous.getAttribute('aria-label')).toBe('Previous');
    expect(next.getAttribute('aria-label')).toBe('Next');
    // An English tooltip on a card in another language would be worse than none.
    expect(previous.hasAttribute('title')).toBe(false);
    expect(next.hasAttribute('title')).toBe(false);
  });

  it('names home by its first day when home does not hold today', async () => {
    const card = await mount({ start_date: 'today+7' });

    expect(segments(card)[1].getAttribute('aria-label')).toBe('Wed, Jun 24');
  });

  it('pages forward and back by the days on screen, and home again', async () => {
    const card = await mount();
    expect(fetchedStarts()).toEqual(['2026-06-15']);

    await press(card, 'next');
    expect(range(card)).toBe(`Jun 22${TO}28`);
    expect(fetchedStarts()).toEqual(['2026-06-15', '2026-06-22']);
    expect(heldDays(card)[0]).toBe('2026-06-22');

    await press(card, 'previous');
    await press(card, 'previous');
    expect(range(card)).toBe(`Jun 8${TO}14`);
    expect(heldDays(card)[0]).toBe('2026-06-08');

    // Home was cached on disk when the card first loaded, and is drawn from there.
    await press(card, 'home');
    expect(range(card)).toBe(`Jun 15${TO}21`);
    expect(heldDays(card)[0]).toBe('2026-06-15');
    expect(fetchedStarts()).toEqual(['2026-06-15', '2026-06-22', '2026-06-08']);
  });

  it('does nothing when home is pressed at home', async () => {
    const card = await mount();
    const fetches = callApi.mock.calls.length;

    await press(card, 'home');
    expect(callApi.mock.calls.length).toBe(fetches);
    expect(range(card)).toBe(`Jun 15${TO}21`);
  });

  it('keeps paged windows out of localStorage, and in memory for the next visit', async () => {
    const card = await mount();
    const onDisk = persistedEntries();
    expect(onDisk).toHaveLength(1);

    await press(card, 'next');
    await press(card, 'next');
    expect(persistedEntries()).toEqual(onDisk);

    // Back over pages already seen: drawn from memory, nothing fetched.
    const fetches = callApi.mock.calls.length;
    await press(card, 'previous');
    await press(card, 'home');
    await press(card, 'next');
    expect(callApi.mock.calls.length).toBe(fetches);
    expect(heldDays(card)[0]).toBe('2026-06-22');
  });

  it('fetches a page again once a calendar was written to since it was cached', async () => {
    const card = await mount();
    await press(card, 'next');
    await press(card, 'home');
    const fetches = callApi.mock.calls.length;

    EventUtils.advanceWriteGeneration();
    await press(card, 'next');
    expect(callApi.mock.calls.length).toBe(fetches + 1);
  });

  it('fetches home on the way back after a calendar changed while it was away', async () => {
    const card = await mount();
    await press(card, 'next');
    const generation = EventUtils.advanceWriteGeneration();
    CalendarChanges.announceCalendarsChanged(document.body, { ids: ['calendar.anna'] }, generation);
    await settle(card);
    // The page on screen refreshes for the change; home, cached on disk, would otherwise be
    // drawn as it was before it.
    expect(lastFetchedStart()).toBe('2026-06-22');

    await press(card, 'home');
    expect(lastFetchedStart()).toBe('2026-06-15');
    expect(fetchedStarts().filter((start) => start === '2026-06-15')).toHaveLength(2);
  });

  it('adds up quick presses, and draws only the page asked for last', async () => {
    const card = await mount();
    const pending: Array<{ start: string; resolve: () => void }> = [];
    callApi.mockImplementation(
      (_method: string, path: string) =>
        new Promise((resolve) => {
          const query = new URLSearchParams(path.split('?')[1]);
          pending.push({
            start: query.get('start')!.slice(0, 10),
            resolve: () =>
              resolve(eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!))),
          });
        }),
    );

    await press(card, 'next');
    await press(card, 'next');
    // The range answers at once; the days below stay home's, dimmed, until a page lands.
    expect(range(card)).toBe(`Jun 29${TO}Jul 5`);
    expect(heldDays(card)[0]).toBe('2026-06-15');
    expect(root(card).querySelector('.content-container')!.className).toBe(
      'content-container page-pending',
    );
    expect(pending.map(({ start }) => start)).toEqual(['2026-06-22', '2026-06-29']);

    // The later request settles first, then the earlier one: only the later is drawn.
    pending[1].resolve();
    await settle(card);
    pending[0].resolve();
    await settle(card);

    expect(heldDays(card)[0]).toBe('2026-06-29');
    expect(root(card).querySelector('.content-container')!.className).toBe('content-container');
  });

  it('shows ended events on pages other than home, and hides them at home as configured', async () => {
    const card = await mount();
    // Home under `show_past_events: false`: by 10:00 on Wednesday, Monday's, Tuesday's and
    // Wednesday's 09:00 events have ended, leaving Thursday to Sunday.
    expect(card.visibleEventCount).toBe(4);

    await press(card, 'previous');
    expect(card.visibleEventCount).toBe(7);

    await press(card, 'home');
    expect(card.visibleEventCount).toBe(4);
  });

  it('never hides a paged card under hide_when_empty, which would take the way back with it', async () => {
    callApi.mockImplementation(async (_method: string, path: string) => {
      const query = new URLSearchParams(path.split('?')[1]);
      // Only home has events.
      return query.get('start')!.startsWith('2026-06-15')
        ? eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!))
        : [];
    });
    const card = await mount({ hide_when_empty: true });
    expect(card.hidden).toBe(false);

    await press(card, 'next');
    expect(card.events).toHaveLength(0);
    expect(card.hidden).toBe(false);
  });

  it('hides an empty card at home, as hide_when_empty always has', async () => {
    callApi.mockResolvedValue([]);
    const card = await mount({ hide_when_empty: true });

    expect(card.hidden).toBe(true);
  });

  it('is drawn and does nothing while the card is being edited, the date picker included', async () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      value: showPicker,
      configurable: true,
    });
    const card = await mount({}, { flag: 'preview' });
    const fetches = callApi.mock.calls.length;

    await press(card, 'next');
    expect(range(card)).toBe(`Jun 15${TO}21`);
    expect(callApi.mock.calls.length).toBe(fetches);

    root(card).querySelector<HTMLButtonElement>('.toolbar-range')!.click();
    expect(showPicker).not.toHaveBeenCalled();

    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).showPicker;
  });

  it('starts every page it asks for at the first step of the backoff', async () => {
    // A page never fetched has no cache entry to carry a failure count, so it would start from
    // the card's own: a step deeper in the backoff for every page visited during an outage.
    const card = await mount();
    callApi.mockRejectedValue(new Error('Home Assistant is unreachable'));

    for (let step = 0; step < 3; step += 1) {
      await press(card, 'next');
      expect(card._failureCountHint, `page ${step + 1}`).toBe(1);
    }
  });

  it('comes home when the dashboard enters edit mode', async () => {
    const card = await mount();
    await press(card, 'next');
    expect(range(card)).toBe(`Jun 22${TO}28`);

    card.editMode = true;
    await settle(card);
    expect(range(card)).toBe(`Jun 15${TO}21`);
    expect(heldDays(card)[0]).toBe('2026-06-15');
  });

  it('comes home when the configuration changes', async () => {
    const card = await mount();
    await press(card, 'next');

    card.setConfig(buildConfig({ ...BASE, title: 'Family' }));
    await settle(card);
    expect(range(card)).toBe(`Jun 15${TO}21`);
    expect(heldDays(card)[0]).toBe('2026-06-15');
  });

  it('keeps the page across a view switch, without fetching', async () => {
    const card = await mount({ toolbar: { ...BASE.toolbar, view_switcher: true } });
    await measure(card, 1400);
    await press(card, 'next');
    const fetches = callApi.mock.calls.length;

    root(card)
      .querySelector<HTMLButtonElement>('.view-switcher-segment[data-view="grid"]')!
      .click();
    await settle(card);
    expect(card.effectiveView).toBe('grid');
    expect(range(card)).toBe(`Jun 22${TO}28`);
    expect(callApi.mock.calls.length).toBe(fetches);
  });

  it('steps by the columns drawn while the layout drops some, starting a page on its first day', async () => {
    const card = await mount({ view: 'grid' });
    await measure(card, 400);
    const columns = card._columnCount;
    expect(columns).toBeGreaterThan(0);
    expect(columns).toBeLessThan(7);

    // Home is the slice holding today, the 17th.
    const homeLabel = range(card);
    expect(homeLabel.startsWith('Jun 17')).toBe(true);

    // The days drawn, read off the grid's own headers.
    const drawnDays = (): number[] =>
      Array.from(root(card).querySelectorAll('.grid-day-header .day')).map((cell) =>
        Number(cell.textContent!.trim()),
      );
    expect(drawnDays()).toEqual(Array.from({ length: columns }, (_, i) => 17 + i));

    await press(card, 'next');
    const start = 17 + columns;
    expect(lastFetchedStart()).toBe(`2026-06-${String(start).padStart(2, '0')}`);
    // The page starts on its own first day, not on today's column: today is not on it, and a
    // page that held today would otherwise be drawn as home again.
    expect(drawnDays()).toEqual(Array.from({ length: columns }, (_, i) => start + i));

    await press(card, 'previous');
    expect(range(card)).toBe(homeLabel);
    expect(drawnDays()).toEqual(Array.from({ length: columns }, (_, i) => 17 + i));

    // A page back holds today's week: it is still drawn from its own first day.
    await press(card, 'previous');
    expect(drawnDays()).toEqual(Array.from({ length: columns }, (_, i) => 17 - columns + i));
  });

  it('draws a page by its dates where empty days are not drawn, so a press never repeats one', async () => {
    // Events only on some days, and a grid that draws only those: a slice by index would hold
    // whichever event days come next, not the page the range names.
    callApi.mockImplementation(async (_method: string, path: string) => {
      const query = new URLSearchParams(path.split('?')[1]);
      const sparse = new Set([
        '2026-06-15',
        '2026-06-18',
        '2026-06-21',
        '2026-06-23',
        '2026-06-27',
      ]);
      return eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!)).filter(
        (event) => sparse.has((event.summary ?? '').replace('Event ', '')),
      );
    });
    const card = await mount({ view: 'grid', time_grid: { show_empty_days: false } });
    await measure(card, 400);
    const columns = card._columnCount;
    expect(columns).toBeGreaterThan(0);
    expect(columns).toBeLessThan(7);

    const drawnDays = (): number[] =>
      Array.from(root(card).querySelectorAll('.grid-day-header .day')).map((cell) =>
        Number(cell.textContent!.trim()),
      );
    const seen: number[] = [];
    let start = 17;
    for (let page = 0; page < 4; page += 1) {
      // Every day drawn is one of the page's own, and no day is drawn twice across pages.
      for (const drawn of drawnDays()) {
        expect(drawn, `page from June ${start}`).toBeGreaterThanOrEqual(start);
        expect(drawn, `page from June ${start}`).toBeLessThan(start + columns);
        expect(seen).not.toContain(drawn);
        seen.push(drawn);
      }
      await press(card, 'next');
      start += columns;
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('opens the date picker, and pages to the week of the day picked', async () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      value: showPicker,
      configurable: true,
    });
    const card = await mount();

    root(card).querySelector<HTMLButtonElement>('.toolbar-range')!.click();
    expect(showPicker).toHaveBeenCalledOnce();

    const input = root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!;
    expect(input.value).toBe('2026-06-15');
    expect(input.getAttribute('tabindex')).toBe('-1');
    expect(input.getAttribute('aria-hidden')).toBe('true');

    input.value = '2026-07-09';
    input.dispatchEvent(new Event('change'));
    await settle(card);
    expect(range(card)).toBe(`Jul 6${TO}12`);
    expect(lastFetchedStart()).toBe('2026-07-06');

    // A day of home's own is home.
    input.value = '2026-06-20';
    input.dispatchEvent(new Event('change'));
    await settle(card);
    expect(range(card)).toBe(`Jun 15${TO}21`);

    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).showPicker;
  });

  it('focuses the date input where the browser cannot show its picker', async () => {
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      value: () => {
        throw new Error('NotSupportedError');
      },
      configurable: true,
    });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    const card = await mount();

    root(card).querySelector<HTMLButtonElement>('.toolbar-range')!.click();
    expect(focus).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).showPicker;
  });

  describe('a second press on the dates closes the picker', () => {
    // What a browser does, measured in Chromium: a press outside an open picker closes it
    // before the page sees the press, then hands the press to the page anyway, and tells the
    // page nothing else. So `:open` is already false when the button hears about it.
    let open: boolean | 'unknown';
    let frames: FrameRequestCallback[];
    let showPicker: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      open = false;
      frames = [];
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      });
      showPicker = vi.fn(() => {
        if (open !== 'unknown') open = true;
      });
      Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
        value: showPicker,
        configurable: true,
      });
      const matches = Element.prototype.matches;
      Object.defineProperty(HTMLInputElement.prototype, 'matches', {
        value(this: HTMLInputElement, selector: string) {
          if (selector !== ':open') return matches.call(this, selector);
          if (open === 'unknown') throw new SyntaxError(`'${selector}' is not a valid selector`);
          return open;
        },
        configurable: true,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).showPicker;
      delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).matches;
    });

    /** A pointer's press on the dates: the browser closes an open picker, then the page hears it. */
    function pressDates(card: CardUnderTest): void {
      const button = root(card).querySelector<HTMLButtonElement>('.toolbar-range')!;
      if (open === true) open = false;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    }

    function runFrames(): void {
      const due = frames;
      frames = [];
      for (const frame of due) frame(0);
    }

    it('and the press after that opens it again', async () => {
      const card = await mount();

      pressDates(card);
      expect(showPicker).toHaveBeenCalledOnce();
      runFrames();

      pressDates(card);
      expect(showPicker).toHaveBeenCalledOnce();
      expect(open).toBe(false);

      pressDates(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    it('but not once the picker closed some other way', async () => {
      const card = await mount();

      pressDates(card);
      runFrames();
      // Escape, or the day already shown picked: no change event, the picker simply goes.
      open = false;
      runFrames();
      expect(frames).toEqual([]);

      pressDates(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    it('nor from a key after a press that was dragged off the dates', async () => {
      const card = await mount();
      const button = root(card).querySelector<HTMLButtonElement>('.toolbar-range')!;

      pressDates(card);
      runFrames();
      // The press closes the picker, then leaves the button: no click follows it.
      open = false;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      // A key's click comes without a pointer press, and opens the picker.
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 0 }));
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    it('only where the browser can say the picker is open', async () => {
      open = 'unknown';
      const card = await mount();

      pressDates(card);
      pressDates(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
      expect(frames).toEqual([]);
    });
  });

  it('preselects a day of the page on screen for a new event', async () => {
    const card = await mount();
    expect(card._newEventDate().getTime()).toBe(NOW.getTime());

    await press(card, 'next');
    expect(card._newEventDate().getTime()).toBe(new Date(2026, 5, 22).getTime());
  });

  it('labels the trailing controls where the band has room, and never with labels off', async () => {
    const labeled = await mount({ toolbar: { ...BASE.toolbar, add_event: true } });
    await measure(labeled, 1400);
    expect(root(labeled).querySelector('.toolbar-button-label')).not.toBeNull();

    // Between the add button's own threshold and the band's, the band keeps icons.
    await measure(labeled, 520);
    expect(root(labeled).querySelector('.toolbar-button-label')).toBeNull();

    document.body.innerHTML = '';
    const icons = await mount({ toolbar: { ...BASE.toolbar, add_event: true, labels: false } });
    await measure(icons, 1400);
    expect(root(icons).querySelector('.toolbar-button-label')).toBeNull();
    expect(root(icons).querySelector('.add-event-button')!.getAttribute('aria-label')).toBe(
      'Add event',
    );
  });

  it('keeps the card off the button role while it holds the navigation', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const haCard = root(card).querySelector('ha-card')!;

    expect(haCard.hasAttribute('role')).toBe(false);
    expect(haCard.getAttribute('tabindex')).toBe('0');
  });
});
