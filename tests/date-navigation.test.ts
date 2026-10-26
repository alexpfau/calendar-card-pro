/**
 * The header toolbar's heading row and date navigation, on the real card.
 *
 * The toolbar ships hidden, so every gate built from default config sees none of it; each case
 * here shows it. The pure rules — page length, home, labels, month headings, DST — are in
 * `paging.test.ts` and the `*.dst.test.ts` files. This file pins how the card joins them: where
 * the rows and controls sit, which month the heading names and when it shortens, which window
 * each press fetches and where it is cached, that quick presses add up and only the last page
 * is drawn, that past events and `hide_when_empty` apply at home only, that editing is inert
 * and brings the card home, that a view switch keeps the page without fetching, and when the
 * action row carries labels.
 */

import { mdiHomeOutline } from '@mdi/js';
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

/**
 * The date navigation and nothing else: every other control is on by default once the toolbar
 * is shown, so each is turned off here and back on by the cases that want it.
 */
const NAVIGATION_ONLY: Types.ToolbarConfig = {
  show: true,
  navigation: true,
  view_switcher: false,
  add_event: false,
  reset: false,
  legend: false,
};

/** Home is the week of June 15, Monday to Sunday. */
const BASE: Partial<Types.Config> = {
  entities: ['calendar.anna'],
  days_to_show: 7,
  start_date: 'start_of_week',
  first_day_of_week: 'monday',
  toolbar: NAVIGATION_ONLY,
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
  requestUpdate(): void;
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

/**
 * Answers a case is holding back, released after every case whatever its outcome. Requests are
 * shared between cards asking for the same window, so one a failed case left open would be
 * joined by the next case's card, which would then never load, and fail for nothing of its own.
 */
let held: Array<() => void> = [];

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

function hass(
  localize?: (key: string) => string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
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
          'ui.common.reset': 'Reset',
          'ui.components.calendar.event.add': 'Add event',
        })[key] ?? key),
    ...extra,
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
  options: {
    flag?: 'preview' | 'editMode';
    localize?: (key: string) => string;
    hass?: Record<string, unknown>;
  } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig({ ...BASE, ...overrides }));
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize, options.hass);
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
  layout.card = width;
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

/** The exact dates on screen, as the hidden live region holds them. */
function range(card: CardUnderTest): string {
  return root(card).querySelector('.toolbar-range-text')!.textContent!.trim();
}

/** The month the heading shows. */
function month(card: CardUnderTest): string {
  return root(card).querySelector('.toolbar-month-text')!.textContent!.trim();
}

function monthButton(card: CardUnderTest): HTMLButtonElement {
  return root(card).querySelector<HTMLButtonElement>('button.toolbar-month-button')!;
}

/** Pick a day in the date picker, as the browser reports it. */
async function pick(card: CardUnderTest, day: string): Promise<void> {
  const input = root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!;
  input.value = day;
  input.dispatchEvent(new Event('change'));
  await settle(card);
}

/** The class names of an element's children, in order. */
function childClasses(element: Element): string[] {
  return Array.from(element.children).map((child) => child.className);
}

/** The text of each of an element's children, in order. */
function childTexts(element: Element): string[] {
  return Array.from(element.children).map((child) => child.textContent!);
}

/** Every month in full, and in English's short form, January first. */
const MONTHS_2000 = [
  'January 2000',
  'February 2000',
  'March 2000',
  'April 2000',
  'May 2000',
  'June 2000',
  'July 2000',
  'August 2000',
  'September 2000',
  'October 2000',
  'November 2000',
  'December 2000',
];
const SHORT_MONTHS_2000 = [
  'Jan 2000',
  'Feb 2000',
  'Mar 2000',
  'Apr 2000',
  'May 2000',
  'Jun 2000',
  'Jul 2000',
  'Aug 2000',
  'Sep 2000',
  'Oct 2000',
  'Nov 2000',
  'Dec 2000',
];

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

//-----------------------------------------------------------------------------
// LAYOUT STUBS
//-----------------------------------------------------------------------------

/**
 * What the stubbed layout reports, in CSS pixels. Zero means "not laid out", which is all
 * happy-dom ever reports, and what every case that installs no stub runs under.
 *
 * `card` is the card's width, which `measure` keeps in step with the width it delivers, and
 * the heading row spans all of it, the month at its start. `probe` is the width of every month
 * in full laid over one another, `navigation` the width of the arrows' group, and `chips` the
 * width the chips need.
 */
const layout = { card: 0, probe: 0, navigation: 0, chips: 0 };

/** The heading row's column gap, which the stubbed stylesheet reports. */
const HEADING_GAP = 8;

/** Describe the heading row to the card the way a browser would lay it out. */
function stubHeadingLayout(): void {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const box = (left: number, width: number) =>
      ({
        x: left,
        y: 0,
        left,
        right: left + width,
        width,
        top: 0,
        bottom: 40,
        height: 40,
      }) as DOMRect;
    if (this.localName === 'calendar-card-pro-dev') return box(0, layout.card);
    if (this.classList.contains('toolbar-heading')) return box(0, layout.card);
    if (this.classList.contains('toolbar-month')) return box(0, layout.probe);
    if (this.classList.contains('toolbar-month-probe')) return box(0, layout.probe);
    if (this.classList.contains('date-navigation')) {
      return box(layout.card - layout.navigation, layout.navigation);
    }
    if (this.classList.contains('legend-chips')) return box(0, layout.chips);
    return realRect.call(this);
  });
  // The chips' box pads itself by 4px and gives it back with its margins, as the stylesheet
  // draws it.
  const realStyle = window.getComputedStyle.bind(window);
  const stubbed: Record<string, Partial<CSSStyleDeclaration>> = {
    'toolbar-heading': {
      direction: 'ltr',
      columnGap: `${HEADING_GAP}px`,
      paddingLeft: '0px',
      paddingRight: '0px',
    },
    'toolbar-month': { marginInlineStart: '0px' },
    'toolbar-legend': {
      marginLeft: '-4px',
      marginRight: '-4px',
      paddingLeft: '4px',
      paddingRight: '4px',
    },
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = realStyle(element, pseudo);
    const name = Object.keys(stubbed).find((cls) =>
      (element as HTMLElement).classList?.contains(cls),
    );
    return name ? ({ ...style, ...stubbed[name] } as CSSStyleDeclaration) : style;
  });
}

/** The action row's width under `reportActionRowOverflow`. */
const ACTION_ROW_WIDTH = 760;

/**
 * Describe the action row the way a browser would report it: as icons everything fits, and
 * with the switcher's words, while `labeledOverflows` says so, every control reaches past the
 * row's end.
 */
function reportActionRowOverflow(labeledOverflows: () => boolean): void {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const box = (left: number, width: number) =>
      ({
        x: left,
        y: 0,
        left,
        right: left + width,
        width,
        top: 0,
        bottom: 36,
        height: 36,
      }) as DOMRect;
    if (this.classList.contains('toolbar-actions')) return box(0, ACTION_ROW_WIDTH);
    const row = this.closest('.toolbar-actions');
    if (row && this.matches('.toolbar-button, .view-switcher')) {
      const labeled = row.querySelector('.toolbar-button-label') !== null;
      return labeled && labeledOverflows() ? box(ACTION_ROW_WIDTH - 60, 120) : box(0, 120);
    }
    return realRect.call(this);
  });
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
  Object.assign(layout, { card: 0, probe: 0, navigation: 0, chips: 0 });
});

afterEach(async () => {
  held.forEach((release) => release());
  held = [];
  await new Promise((resolve) => setImmediate(resolve));
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

describe('the date navigation', () => {
  it('is on once the toolbar is shown, and draws nothing of its own when turned off', async () => {
    const on = await mount({ toolbar: { show: true } });
    expect(root(on).querySelector('.date-navigation')).not.toBeNull();
    expect(root(on).querySelector('button.toolbar-month-button')).not.toBeNull();

    document.body.innerHTML = '';
    const off = await mount({ toolbar: { show: true, navigation: false } });
    expect(root(off).querySelector('.date-navigation')).toBeNull();
    expect(root(off).querySelector('button.toolbar-month-button')).toBeNull();
    expect(root(off).querySelector('.toolbar-date-input')).toBeNull();
    expect(root(off).querySelector('.header-container')!.className).toBe(
      'header-container has-toolbar',
    );
  });

  it('sets the month and the arrows in the heading row, last in the header, under the action row', async () => {
    const card = await mount({
      title: 'Family',
      toolbar: { ...NAVIGATION_ONLY, add_event: true, reset: true },
    });
    const header = root(card).querySelector('.header-container')!;

    expect(header.className).toBe('header-container has-toolbar');
    expect(childClasses(header)).toEqual([
      'card-toolbar toolbar-actions',
      'card-toolbar toolbar-heading',
    ]);
    // The title moves into the heading row, a small label over the month: the two share one
    // block, so the arrows can sit on the month's baseline whatever the title's height.
    expect(childClasses(header.querySelector('.toolbar-heading')!)).toEqual([
      'toolbar-identity',
      'toolbar-heading-end',
    ]);
    expect(childClasses(header.querySelector('.toolbar-identity')!)).toEqual([
      'card-header',
      'toolbar-month with-picker',
    ]);
    expect(childClasses(header.querySelector('.toolbar-heading-end')!)).toEqual([
      'date-navigation',
    ]);
    const actions = header.querySelector('.toolbar-actions')!;
    expect(childClasses(actions)).toEqual(['toolbar-start', 'toolbar-end']);
    expect(actions.querySelector('.date-navigation, .toolbar-month')).toBeNull();
  });

  it('keeps the placeholder over the month without a title, and draws no empty action row', async () => {
    const alone = await mount();
    expect(childClasses(root(alone).querySelector('.header-container')!)).toEqual([
      'card-toolbar toolbar-heading',
    ]);
    expect(childClasses(root(alone).querySelector('.toolbar-identity')!)).toEqual([
      'card-header-placeholder',
      'toolbar-month with-picker',
    ]);
    expect(root(alone).querySelector('.toolbar-actions')).toBeNull();

    document.body.innerHTML = '';
    const withAdd = await mount({ toolbar: { ...NAVIGATION_ONLY, add_event: true } });
    expect(childClasses(root(withAdd).querySelector('.header-container')!)).toEqual([
      'card-toolbar toolbar-actions',
      'card-toolbar toolbar-heading',
    ]);
    expect(
      root(withAdd).querySelector('.toolbar-identity > .card-header-placeholder'),
    ).not.toBeNull();
  });

  it('names its controls, and the dates on screen', async () => {
    const card = await mount();
    const [previous, home, next] = segments(card);

    // One group for the arrows, named by the dates it moves through. The row is none:
    // it holds the card's heading, which a group named by the dates would mislabel.
    const group = root(card).querySelector('.date-navigation')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(root(card).querySelector('.toolbar-heading')!.hasAttribute('role')).toBe(false);
    const labelledBy = group.getAttribute('aria-labelledby')!;
    expect(root(card).getElementById(labelledBy)!.textContent!.trim()).toBe(`Jun 15${TO}21`);
    expect(previous.getAttribute('aria-label')).toBe('Previous');
    expect(previous.getAttribute('title')).toBe('Previous');
    expect(next.getAttribute('aria-label')).toBe('Next');
    // Home is an icon, named by its tooltip: today is in the window the card opens with.
    expect(home.getAttribute('aria-label')).toBe('Today');
    expect(home.getAttribute('title')).toBe('Today');
    expect(home.textContent!.trim()).toBe('');
    expect(month(card)).toBe('June 2026');
    expect(range(card)).toBe(`Jun 15${TO}21`);
    // The dates are announced when they change. The month button holds the month alone, and
    // an invisible copy of every month keeps the room of the widest beside it, so paging
    // never moves the arrows.
    expect(root(card).querySelector('.toolbar-range-text')!.getAttribute('aria-live')).toBe(
      'polite',
    );
    const reserve = root(card).querySelector('.toolbar-month-reserve')!;
    expect(reserve.getAttribute('aria-hidden')).toBe('true');
    expect(childTexts(reserve)).toEqual(MONTHS_2000);
    expect(reserve.closest('.toolbar-month-button')).toBeNull();
    expect(reserve.parentElement!.className).toBe('toolbar-month with-picker');
    for (const button of [...segments(card), monthButton(card)]) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it("gives the exact dates as the month's tooltip and description, and says when they change", async () => {
    const card = await mount();
    const button = monthButton(card);
    const track = root(card).querySelector('.date-navigation')!;
    const live = root(card).querySelector('#toolbar-range-text')!;

    expect(button.getAttribute('title')).toBe(`Jun 15${TO}21`);
    expect(button.getAttribute('aria-describedby')).toBe('toolbar-range-text');
    expect(track.getAttribute('aria-labelledby')).toBe('toolbar-range-text');
    expect(live.className).toBe('toolbar-range-text');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent!.trim()).toBe(`Jun 15${TO}21`);

    // A week later the month is the same, so the dates are all that tells the pages apart.
    await press(card, 'next');
    expect(month(card)).toBe('June 2026');
    expect(monthButton(card).getAttribute('title')).toBe(`Jun 22${TO}28`);
    expect(root(card).querySelector('#toolbar-range-text')!.textContent!.trim()).toBe(
      `Jun 22${TO}28`,
    );
  });

  it('draws the month as plain text without navigation, the dates in its tooltip', async () => {
    const card = await mount({
      toolbar: { ...NAVIGATION_ONLY, navigation: false, add_event: true },
    });
    const heading = root(card).querySelector('.toolbar-heading')!;

    // The group at the row's end is drawn without navigation too, and holds nothing then.
    expect(childClasses(heading)).toEqual(['toolbar-identity', 'toolbar-heading-end']);
    expect(childClasses(heading.querySelector('.toolbar-identity')!)).toEqual([
      'card-header-placeholder',
      'toolbar-month',
    ]);
    expect(heading.querySelector('.toolbar-heading-end')!.children).toHaveLength(0);
    const label = heading.querySelector('.toolbar-month-slot > span.toolbar-month-label')!;
    expect(label.getAttribute('title')).toBe(`Jun 15${TO}21`);
    expect(label.textContent!.trim()).toBe('June 2026');
    expect(range(card)).toBe(`Jun 15${TO}21`);
    // No arrows, so no group for them to be named in.
    expect(heading.hasAttribute('aria-labelledby')).toBe(false);
    expect(root(card).querySelector('[role="group"][aria-labelledby]')).toBeNull();
    expect(root(card).querySelector('button.toolbar-month-button')).toBeNull();
    expect(root(card).querySelector('.toolbar-date-input')).toBeNull();
    expect(root(card).querySelector('.date-navigation')).toBeNull();
  });

  it('draws home as a house, named for where it leads', async () => {
    const today = await mount();
    const home = segments(today)[1];
    expect(home.querySelector('path')!.getAttribute('d')).toBe(mdiHomeOutline);
    expect(home.getAttribute('aria-label')).toBe('Today');

    document.body.innerHTML = '';
    const later = await mount({ start_date: 'today+7' });
    const laterHome = segments(later)[1];
    expect(laterHome.querySelector('path')!.getAttribute('d')).toBe(mdiHomeOutline);
    expect(laterHome.getAttribute('aria-label')).toBe('Wed, Jun 24');
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
          const answer = () =>
            resolve(eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!)));
          pending.push({ start: query.get('start')!.slice(0, 10), resolve: answer });
          held.push(answer);
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

  it('names the month the page starts in, never the one it ends in', async () => {
    const card = await mount();
    expect(month(card)).toBe('June 2026');

    await press(card, 'next');
    await press(card, 'next');
    expect(range(card)).toBe(`Jun 29${TO}Jul 5`);
    expect(month(card)).toBe('June 2026');

    await pick(card, '2026-12-02');
    expect(range(card)).toBe(`Nov 30${TO}Dec 6`);
    expect(month(card)).toBe('November 2026');
  });

  it('names the page asked for at once, over the days still dimmed below it', async () => {
    const card = await mount();
    await press(card, 'next');
    await press(card, 'next');
    expect(heldDays(card)[0]).toBe('2026-06-29');

    callApi.mockImplementation(
      (_method: string, path: string) =>
        new Promise((resolve) => {
          const query = new URLSearchParams(path.split('?')[1]);
          held.push(() =>
            resolve(eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!))),
          );
        }),
    );

    await press(card, 'next');
    expect(month(card)).toBe('July 2026');
    expect(range(card)).toBe(`Jul 6${TO}12`);
    expect(heldDays(card)[0]).toBe('2026-06-29');
    expect(root(card).querySelector('.content-container')!.className).toBe(
      'content-container page-pending',
    );

    held.splice(0).forEach((release) => release());
    await settle(card);
    expect(heldDays(card)[0]).toBe('2026-07-06');
    expect(month(card)).toBe('July 2026');
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
    expect(month(card)).toBe('June 2026');
    expect(callApi.mock.calls.length).toBe(fetches);

    monthButton(card).click();
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

    monthButton(card).click();
    expect(showPicker).toHaveBeenCalledOnce();

    const input = root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!;
    expect(input.value).toBe('2026-06-15');
    expect(input.getAttribute('tabindex')).toBe('-1');

    input.value = '2026-07-09';
    input.dispatchEvent(new Event('change'));
    await settle(card);
    expect(range(card)).toBe(`Jul 6${TO}12`);
    expect(month(card)).toBe('July 2026');
    expect(lastFetchedStart()).toBe('2026-07-06');
    // Hidden from assistive technology again once the picker has closed.
    expect(input.getAttribute('aria-hidden')).toBe('true');

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

    monthButton(card).click();
    expect(focus).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).showPicker;
  });

  describe('a second press on the month closes the picker', () => {
    // Two browsers, two ways to close a picker. Chrome, measured: a press outside an open
    // picker closes it before the page sees the press, then hands the press to the page
    // anyway, and tells the page nothing else, so `:open` is already false when the button
    // hears about it. Safari, reported: the picker stays until the input loses focus, so no
    // press closes it unless the input had focus to lose. `open: 'unknown'` stands for a
    // browser that cannot report `:open`, which is the case the Safari tests take.
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

    /** A pointer's press on the month: the browser closes an open picker, then the page hears it. */
    function pressMonth(card: CardUnderTest): void {
      const button = monthButton(card);
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

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledOnce();
      runFrames();

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledOnce();
      expect(open).toBe(false);

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    it('but not once the picker closed some other way', async () => {
      const card = await mount();

      pressMonth(card);
      runFrames();
      // Escape, or the day already shown picked: no change event, the picker simply goes.
      open = false;
      runFrames();
      expect(frames).toEqual([]);

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    it('nor from a key after a press that was dragged off the month', async () => {
      const card = await mount();
      const button = monthButton(card);

      pressMonth(card);
      runFrames();
      // The press closes the picker, then leaves the button: no click follows it.
      open = false;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      // A key's click comes without a pointer press, and opens the picker.
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 0 }));
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    /** The input that lends the picker, and whether it holds focus, Safari's sign of an open picker. */
    const input = (card: CardUnderTest): HTMLInputElement =>
      root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!;
    const focused = (card: CardUnderTest): Element | null => root(card).activeElement;

    it('in a browser that ties the picker to focus, and that cannot report it', async () => {
      open = 'unknown';
      const card = await mount();

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledOnce();
      expect(focused(card)).toBe(input(card));
      // Exposed while it holds focus, and named by the dates it opens on.
      expect(input(card).hasAttribute('aria-hidden')).toBe(false);
      expect(input(card).getAttribute('aria-labelledby')).toBe('toolbar-range-text');

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledOnce();
      expect(focused(card)).toBeNull();
      expect(input(card).getAttribute('aria-hidden')).toBe('true');

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
      expect(frames).toEqual([]);
    });

    it('and a press anywhere else, which takes focus from the input, closes it too', async () => {
      open = 'unknown';
      const card = await mount();

      pressMonth(card);
      // What Safari does with a press outside: focus leaves the input, and the picker goes.
      input(card).blur();
      expect(input(card).getAttribute('aria-hidden')).toBe('true');

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
    });

    it('picking a day closes it, and a keyboard gets its focus back on the month', async () => {
      open = 'unknown';
      const card = await mount();
      const button = monthButton(card);

      button.focus();
      // Enter or Space on the button: a click with no pointer press before it.
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 0 }));
      expect(focused(card)).toBe(input(card));

      input(card).value = '2026-07-09';
      input(card).dispatchEvent(new Event('change'));
      await settle(card);
      expect(range(card)).toBe(`Jul 6${TO}12`);
      expect(focused(card)).toBe(button);
      expect(input(card).getAttribute('aria-hidden')).toBe('true');
    });

    it('as does Escape, and a pointer leaves focus nowhere', async () => {
      open = 'unknown';
      const card = await mount();

      pressMonth(card);
      input(card).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(focused(card)).toBeNull();
      expect(input(card).getAttribute('aria-hidden')).toBe('true');

      pressMonth(card);
      expect(showPicker).toHaveBeenCalledTimes(2);
    });
  });

  it('preselects a day of the page on screen for a new event', async () => {
    const card = await mount();
    expect(card._newEventDate().getTime()).toBe(NOW.getTime());

    await press(card, 'next');
    expect(card._newEventDate().getTime()).toBe(new Date(2026, 5, 22).getTime());
  });

  it('keeps the card off the button role while it holds the navigation', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const haCard = root(card).querySelector('ha-card')!;

    expect(haCard.hasAttribute('role')).toBe(false);
    expect(haCard.getAttribute('tabindex')).toBe('0');
  });
});

//-----------------------------------------------------------------------------
// THE MONTH'S CAPITALS
//-----------------------------------------------------------------------------

describe("the controls beside the month, centered on the month's capitals", () => {
  /** Where the stubbed layout puts the heading row, and the top and foot of the month's capitals. */
  const geometry = { rowTop: 100, rowHeight: 60, paddingBottom: 0, capTop: 134.6, baseline: 151.7 };

  beforeEach(() => {
    Object.assign(geometry, {
      rowTop: 100,
      rowHeight: 60,
      paddingBottom: 0,
      capTop: 134.6,
      baseline: 151.7,
    });
    const realRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const { rowTop, rowHeight, capTop, baseline } = geometry;
      if (this.classList.contains('toolbar-heading')) {
        return { top: rowTop, bottom: rowTop + rowHeight, height: rowHeight } as DOMRect;
      }
      if (this.classList.contains('toolbar-month-cap')) {
        return { top: capTop, bottom: baseline, height: baseline - capTop } as DOMRect;
      }
      return realRect.call(this);
    });
    const realStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = realStyle(element, pseudo);
      return (element as HTMLElement).classList?.contains('toolbar-heading')
        ? ({ ...style, paddingBottom: `${geometry.paddingBottom}px` } as CSSStyleDeclaration)
        : style;
    });
  });

  const heading = (card: CardUnderTest): HTMLElement =>
    root(card).querySelector<HTMLElement>('.toolbar-heading')!;
  const middle = (card: CardUnderTest): string =>
    heading(card).style.getPropertyValue('--calendar-card-heading-middle');

  async function rerender(card: CardUnderTest): Promise<void> {
    card.requestUpdate();
    await settle(card);
  }

  it("writes how far the middle of the month's capitals stands above the row's foot", async () => {
    const card = await mount({ title: 'Family' });
    // The capitals run from 134.6 to 151.7, so their middle is at 143.15, 16.85 above the foot.
    expect(middle(card)).toBe('16.85px');

    // A larger title size puts the middle further from the foot.
    Object.assign(geometry, { capTop: 126, baseline: 149.6 });
    await rerender(card);
    expect(middle(card)).toBe('22.20px');
  });

  it("measures from the row's content box, inside any padding a theme gives it", async () => {
    geometry.paddingBottom = 4;
    const card = await mount();
    expect(middle(card)).toBe('12.85px');
  });

  it('measures the same height for a card scrolled above the viewport', async () => {
    Object.assign(geometry, { rowTop: -300, capTop: -265.4, baseline: -248.3 });
    const card = await mount();
    expect(middle(card)).toBe('16.85px');
  });

  it('writes nothing for a row with no layout, leaving the stylesheet its stand-in', async () => {
    Object.assign(geometry, { rowHeight: 0, capTop: 0, baseline: 0 });
    const card = await mount();
    expect(middle(card)).toBe('');

    // Laid out later, it measures then.
    Object.assign(geometry, { rowHeight: 60, capTop: 134.6, baseline: 151.7 });
    await rerender(card);
    expect(middle(card)).toBe('16.85px');
  });

  it('never sets them below the foot', async () => {
    Object.assign(geometry, { capTop: 165, baseline: 180 });
    const card = await mount();
    expect(middle(card)).toBe('0.00px');
  });

  it('writes onto the row alone, which no render binds a style to', async () => {
    const card = await mount();
    expect(heading(card).getAttribute('style')).toBe('--calendar-card-heading-middle: 16.85px;');
    // A render that changes nothing keeps it.
    await rerender(card);
    expect(middle(card)).toBe('16.85px');
  });
});

//-----------------------------------------------------------------------------
// THE MONTH'S SHORT FORM
//-----------------------------------------------------------------------------

describe("the month's short form", () => {
  beforeEach(() => {
    stubHeadingLayout();
    Object.assign(layout, { probe: 300, navigation: 100 });
  });

  /** The card width from which every month in full fits beside the gap and the arrows. */
  const fullFrom = (): number => layout.probe + HEADING_GAP + layout.navigation;

  const heading = (card: CardUnderTest): Element => root(card).querySelector('.toolbar-heading')!;
  const reserve = (card: CardUnderTest): Element =>
    root(card).querySelector('.toolbar-month-reserve')!;
  const probe = (card: CardUnderTest): Element => root(card).querySelector('.toolbar-month-probe')!;

  it('shortens the month where every month in full does not fit beside the arrows, and only there', async () => {
    const card = await mount();

    await measure(card, fullFrom() - 1);
    expect(heading(card).className).toBe('card-toolbar toolbar-heading short-month');
    expect(month(card)).toBe('Jun 2026');
    // The room kept is the widest short month's; the months in full are still there to measure.
    expect(childTexts(reserve(card))).toEqual(SHORT_MONTHS_2000);
    expect(childTexts(probe(card))).toEqual(MONTHS_2000);
    // The dates stay exact whichever form the month takes.
    expect(range(card)).toBe(`Jun 15${TO}21`);

    await measure(card, fullFrom());
    expect(heading(card).className).toBe('card-toolbar toolbar-heading');
    expect(month(card)).toBe('June 2026');
    expect(childTexts(reserve(card))).toEqual(MONTHS_2000);

    await measure(card, fullFrom() - 1);
    expect(month(card)).toBe('Jun 2026');
  });

  it("keeps the gap before the row's end without the arrows, where the end group stays empty", async () => {
    // The group at the row's end is drawn without navigation too, so the month still loses the
    // gap before it, and is shortened rather than cut off in the band of widths that gap costs.
    const card = await mount({
      toolbar: { ...NAVIGATION_ONLY, navigation: false, add_event: true },
    });
    expect(root(card).querySelector('.date-navigation')).toBeNull();

    await measure(card, layout.probe + HEADING_GAP - 1);
    expect(month(card)).toBe('Jun 2026');

    await measure(card, layout.probe + HEADING_GAP);
    expect(month(card)).toBe('June 2026');
  });

  it('never shortens the month while the chips show', async () => {
    // The chips fit only where the month in full does too, so the two can only disagree in the
    // frame between a resize and the legend's own pass, which waits a frame. Frames are run by
    // hand here so that one can be looked at.
    let frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const runFrames = async (card: CardUnderTest): Promise<void> => {
      const due = frames;
      frames = [];
      for (const frame of due) frame(0);
      await settle(card);
    };
    layout.chips = 60;
    /** The width from which the chips fit: the month in full, the arrows and a gap either side. */
    const chipsFrom = layout.probe + layout.navigation + 2 * HEADING_GAP + layout.chips;
    expect(chipsFrom).toBeGreaterThan(fullFrom());

    try {
      const card = await mount({ toolbar: { ...NAVIGATION_ONLY, legend: 'chips' } });
      await measure(card, chipsFrom + 100);
      await runFrames(card);
      expect(heading(card).className).toBe('card-toolbar toolbar-heading chips-shown');
      expect(month(card)).toBe('June 2026');

      // Narrowed past both widths: the chips are still drawn until their pass, and the month
      // with them is in full, though it would be short without them.
      await measure(card, fullFrom() - 1);
      expect(heading(card).className).toBe('card-toolbar toolbar-heading chips-shown');
      expect(root(card).querySelectorAll('.toolbar-heading .legend-chip')).toHaveLength(1);
      expect(month(card)).toBe('June 2026');
      expect(childTexts(reserve(card))).toEqual(MONTHS_2000);

      // Their pass folds them into the button, and the month takes its short form at once.
      await runFrames(card);
      expect(root(card).querySelector('.legend-button')).not.toBeNull();
      expect(heading(card).className).toBe('card-toolbar toolbar-heading short-month');
      expect(month(card)).toBe('Jun 2026');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

//-----------------------------------------------------------------------------
// THE ACTION ROW'S LABELS
//-----------------------------------------------------------------------------

describe("the view switcher's words", () => {
  /** Add and reset beside the switcher, with the date navigation. */
  const LABELED: Types.ToolbarConfig = {
    show: true,
    navigation: true,
    view_switcher: true,
    add_event: true,
    reset: true,
    legend: false,
  };

  /** The switcher's own threshold, and add and reset each an icon beside it. */
  const labeledFrom = (): number =>
    Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH + 2 * Constants.UI.TOOLBAR_COMMAND_WIDTH;

  /** The words the action row draws, in order. */
  function labels(card: CardUnderTest): string[] {
    return Array.from(root(card).querySelectorAll('.toolbar-actions .toolbar-button-label')).map(
      (label) => label.textContent!.trim(),
    );
  }

  const ALL_LABELS = ['List', 'Columns', 'Grid'];

  it('are drawn from their own threshold, whatever the navigation', async () => {
    for (const navigation of [true, false]) {
      document.body.innerHTML = '';
      const card = await mount({ toolbar: { ...LABELED, navigation } });

      await measure(card, labeledFrom() - 1);
      expect(root(card).querySelector('.view-switcher'), `navigation ${navigation}`).not.toBeNull();
      expect(labels(card), `navigation ${navigation}`).toEqual([]);

      await measure(card, labeledFrom());
      expect(labels(card), `navigation ${navigation}`).toEqual(ALL_LABELS);
    }
  });

  describe('once they did not fit', () => {
    // A retry would fit from the moment the words are dropped, so a retry would show.
    let overflows: boolean;

    beforeEach(() => {
      overflows = true;
      reportActionRowOverflow(() => overflows);
    });

    it('are not tried again for a page turned at the same width', async () => {
      const card = await mount({ toolbar: LABELED });
      const width = labeledFrom() + 48;

      await measure(card, width);
      expect(labels(card)).toEqual([]);
      overflows = false;

      await press(card, 'next');
      expect(range(card)).toBe(`Jun 22${TO}28`);
      expect(labels(card)).toEqual([]);

      // The control: wider than the width they did not fit at, they are tried again.
      await measure(card, width + 1);
      expect(labels(card)).toEqual(ALL_LABELS);
    });

    it('are not tried again for a templated title ticking over at the same width', async () => {
      const results: Array<(message: unknown) => void> = [];
      const connection = {
        subscribeMessage: (handler: (message: unknown) => void) => {
          results.push(handler);
          return Promise.resolve(() => undefined);
        },
      };
      const card = await mount(
        { title: '{{ states("sensor.family") }}', toolbar: LABELED },
        { hass: { connection } },
      );
      const title = (): string =>
        root(card).querySelector('.card-header')?.textContent?.trim() ?? '';
      expect(results).toHaveLength(1);
      results[0]({ result: 'Anna' });
      await settle(card);
      expect(title()).toBe('Anna');
      const width = labeledFrom() + 48;

      await measure(card, width);
      expect(labels(card)).toEqual([]);
      overflows = false;

      results[0]({ result: 'Anna and Ben' });
      await settle(card);
      expect(title()).toBe('Anna and Ben');
      expect(labels(card)).toEqual([]);

      await measure(card, width + 1);
      expect(labels(card)).toEqual(ALL_LABELS);
    });
  });
});
