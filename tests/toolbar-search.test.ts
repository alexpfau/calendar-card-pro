/**
 * Searching from the toolbar, on the real card: the magnifier, the year-wide load behind the
 * panel and when it is asked again, what a term finds as the card's own rows draw it, and what a
 * pick does: page the card to the day and ring the event there.
 *
 * The toolbar defaults to hidden and `search` to off, so every DOM gate built from default config
 * sees no magnifier and no search at all; every case here turns both on. The pure half (the
 * window, folding, order, cap and ring identity) is `search.test.ts`; the panel alone is
 * `search-panel.test.ts`; how the magnifier costs the switcher's words and never folds is pinned
 * beside the other buttons' fold in `toolbar-buttons.test.ts`.
 *
 * Home Assistant's dialog manager is played by a stand-in that does what it does with
 * `show-dialog`: makes the panel once, hands it `hass`, calls `showDialog` and attaches it. Fetches
 * answer from a fixed set of events per calendar, overlapping the window asked for, as Home
 * Assistant's calendar API does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import { SEARCH_PANEL_TAG, type SearchPanelParams } from '../src/rendering/search-panel';
import * as EventUtils from '../src/utils/events';
import * as LiveCalendars from '../src/utils/live-calendars';
import type * as Search from '../src/utils/search';
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

/** The year-wide window, as the load asks Home Assistant for it from NOW. */
const WIDE = 'start=2025-06-17T00:00:00.000Z&end=2027-06-18T00:00:00.000Z';

interface RawEvent {
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  uid?: string;
}

const timed = (start: string, end: string, summary: string, extra: Partial<RawEvent> = {}) => ({
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
  ...extra,
});

/** What each calendar holds. Names are invented. */
let calendars: Record<string, RawEvent[]>;

function defaultCalendars(): Record<string, RawEvent[]> {
  return {
    [ANNA]: [
      timed('2026-06-18T07:00:00Z', '2026-06-18T08:00:00Z', 'Swim', { uid: 'swim-1' }),
      timed('2026-12-08T15:30:00Z', '2026-12-08T16:00:00Z', 'Dentist check-up', {
        uid: 'dentist-1',
        location: 'Dental Clinic, 12 High Street, Germany',
      }),
      timed('2026-01-10T09:00:00Z', '2026-01-10T10:00:00Z', 'Dentist cleaning', {
        uid: 'dentist-0',
      }),
      // Outside the year either side: never found.
      timed('2025-03-01T09:00:00Z', '2025-03-01T10:00:00Z', 'Dentist long ago'),
      timed('2027-08-01T09:00:00Z', '2027-08-01T10:00:00Z', 'Dentist far ahead'),
    ],
    [BEN]: [
      timed('2026-09-02T16:00:00Z', '2026-09-02T17:00:00Z', 'Piano', {
        uid: 'piano-1',
        description: 'Bring the sheet music for the recital',
      }),
    ],
  };
}

/** Calendars whose year-wide request fails, and requests held until a test lets them answer. */
const failing = new Set<string>();
let holdWide = false;
const held: Array<() => void> = [];

const callApi = vi.fn(async (_method: string, path: string) => {
  const [, id, query] = /^calendars\/([^?]+)\?(.*)$/.exec(path)!;
  const params = new URLSearchParams(query);
  const start = Date.parse(params.get('start')!);
  const end = Date.parse(params.get('end')!);
  const wide = query === WIDE;
  if (wide && holdWide) await new Promise<void>((resolve) => held.push(resolve));
  if (wide && failing.has(id)) throw new Error(`${id} is down`);
  const at = (point: RawEvent['start']) => Date.parse(point.dateTime ?? `${point.date}T00:00:00Z`);
  return (calendars[id] ?? []).filter((e) => at(e.start) < end && at(e.end) > start);
});

/** The calendars asked for the year-wide window, in the order asked. */
function wideRequests(): string[] {
  return callApi.mock.calls
    .map(([, path]) => path)
    .filter((path) => path.endsWith(`?${WIDE}`))
    .map((path) => path.slice('calendars/'.length, path.indexOf('?')));
}

const STRINGS: Record<string, string> = {
  'ui.common.search': 'Search',
  'ui.common.close': 'Close',
  'ui.common.refresh': 'Refresh',
  'ui.components.calendar.today': 'Today',
  'ui.components.calendar.event_retrieval_error': 'Could not retrieve events for calendars',
};

function hass(localize: (key: string) => string = (key) => STRINGS[key] ?? '') {
  return {
    states: Object.fromEntries(
      [
        [ANNA, 'Anna'],
        [BEN, 'Ben'],
      ].map(([id, name]) => [
        id,
        { entity_id: id, state: 'off', attributes: { supported_features: 7, friendly_name: name } },
      ]),
    ),
    locale: { language: 'en' },
    callApi,
    localize,
  };
}

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  hidden: boolean;
  readonly updateComplete: Promise<boolean>;
}

interface PanelUnderTest extends HTMLElement {
  hass?: unknown;
  showDialog(params: SearchPanelParams): void;
  closeDialog(): boolean;
  readonly updateComplete: Promise<boolean>;
}

const SEARCH_ON: Types.ToolbarConfig = { show: true, search: true };

function configFor(overrides: Partial<Types.Config> = {}, toolbar = SEARCH_ON): Types.Config {
  return buildConfig({ entities: [ANNA, BEN], days_to_show: 7, toolbar, ...overrides });
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

/** Let the loads, and the renders after them, finish. */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

/** Deliver a width the way the browser does, and let the settle delay run. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  )!;
  observer.callback([{ contentRect: { width } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
}

async function mount(
  config: Types.Config,
  options: { flag?: 'preview' | 'editMode'; localize?: (key: string) => string } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(config);
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize);
  document.body.appendChild(card);
  await settle(card);
  await measure(card, 784);
  return card;
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

function magnifier(card: CardUnderTest): HTMLButtonElement | null {
  return root(card).querySelector<HTMLButtonElement>('.search-button');
}

/** The controls in one group of the action row, in order, each by its first two classes. */
function controls(card: CardUnderTest, group: '.toolbar-start' | '.toolbar-end'): string[] {
  return Array.from(root(card).querySelectorAll(`.toolbar-actions > ${group} > *`)).map((element) =>
    element.className.split(' ').slice(0, 2).join(' '),
  );
}

/** The element focus is on, through every shadow root. */
function deepActive(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

/**
 * Home Assistant's dialog manager, as far as `show-dialog` goes: one panel, made once, handed
 * `hass` and shown; and, as Home Assistant does, the element focus was on when it opened noted,
 * and focused again a frame after the panel says it has closed.
 */
const manager = {
  requests: [] as SearchPanelParams[],
  returnFocusTo: [] as Array<HTMLElement | null>,
  panel: null as PanelUnderTest | null,
  listener(event: Event): void {
    const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: SearchPanelParams }>)
      .detail;
    if (detail?.dialogTag !== SEARCH_PANEL_TAG) return;
    manager.requests.push(detail.dialogParams);
    const target = deepActive();
    manager.returnFocusTo.push(target);
    if (!manager.panel) {
      const panel = document.createElement(SEARCH_PANEL_TAG) as PanelUnderTest;
      panel.addEventListener('dialog-closed', () => {
        const returnTo = manager.returnFocusTo[manager.returnFocusTo.length - 1];
        deepActive()?.blur();
        requestAnimationFrame(() => setTimeout(() => returnTo?.focus()));
      });
      manager.panel = panel;
    }
    manager.panel.hass = (event.target as CardUnderTest).hass;
    manager.panel.showDialog(detail.dialogParams);
    if (!manager.panel.isConnected) document.body.appendChild(manager.panel);
  },
};

/** The last panel's source: the card's search, as the panel reads it. */
function source(): SearchPanelParams['source'] {
  return manager.requests[manager.requests.length - 1].source;
}

/** Press the magnifier, and let the panel open and the load answer. */
async function openSearch(card: CardUnderTest): Promise<PanelUnderTest> {
  magnifier(card)!.click();
  await settle(card);
  await manager.panel?.updateComplete;
  return manager.panel!;
}

function isOpen(): boolean {
  return manager.panel?.shadowRoot?.querySelector('dialog')?.open === true;
}

/** Close the panel as Escape does, and let it play its way out and focus come back. */
async function closeSearch(card: CardUnderTest): Promise<void> {
  manager.panel!.closeDialog();
  await afterClose(card);
}

/**
 * Let the card's update run, then a closing panel play its way out and the card's two frames
 * after it pass.
 */
async function afterClose(card: CardUnderTest): Promise<void> {
  await settle(card);
  vi.advanceTimersByTime(400);
  await settle(card);
  for (let frame = 0; frame < 3; frame += 1) {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(1);
    await settle(card);
  }
}

/** What a term finds, as `[title, day]` per row in the order drawn. */
function found(term: string): Array<[string, string]> {
  return source()
    .find(term)
    .groups.flatMap((group) => group.hits.map(({ row }): [string, string] => [row.title, row.day]));
}

function rowFor(term: string, title: string): Search.SearchRow {
  const row = source()
    .find(term)
    .groups.flatMap((group) => group.hits.map((hit) => hit.row))
    .find((candidate) => candidate.title === title);
  if (!row) throw new Error(`no row "${title}" for "${term}"`);
  return row;
}

/** The ringed element's text, or null. */
function ringed(card: CardUnderTest): string | null {
  const ring = root(card).querySelector('.search-ring');
  return ring ? (ring.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}

/** The element focused in the card, if focus is in it. */
function focused(card: CardUnderTest): Element | null {
  return root(card).activeElement;
}

const originalResizeObserver = globalThis.ResizeObserver;

/**
 * happy-dom's `ShadowRoot.activeElement` throws while focus is in another shadow tree, here the
 * panel's field, where a browser answers null; the card reads it as its toolbar is planned.
 */
const activeElement = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'activeElement')!;

beforeEach(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', {
    ...activeElement,
    get(this: ShadowRoot) {
      try {
        return activeElement.get!.call(this);
      } catch {
        return null;
      }
    },
  });
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(NOW);
  calendars = defaultCalendars();
  failing.clear();
  holdWide = false;
  held.length = 0;
  callApi.mockClear();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  manager.requests = [];
  manager.returnFocusTo = [];
  manager.panel = null;
  document.addEventListener('show-dialog', manager.listener);
});

afterEach(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', activeElement);
  document.removeEventListener('show-dialog', manager.listener);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

//-----------------------------------------------------------------------------
// THE MAGNIFIER
//-----------------------------------------------------------------------------

describe('the magnifier', () => {
  it('is last in the row, after refresh, named by Home Assistant’s word for search', async () => {
    const card = await mount(configFor());

    expect(controls(card, '.toolbar-end')).toEqual([
      'toolbar-button refresh-button',
      'toolbar-button search-button',
    ]);
    const button = magnifier(card)!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Search');
    expect(button.getAttribute('title')).toBe('Search');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('is named in English for assistive technology alone where Home Assistant has no word', async () => {
    const card = await mount(configFor(), { localize: () => '' });

    expect(magnifier(card)!.getAttribute('aria-label')).toBe('Search');
    expect(magnifier(card)!.hasAttribute('title')).toBe(false);
  });

  it('is not drawn by default, nor without the date navigation a pick needs', async () => {
    const off = await mount(configFor({}, { show: true }));
    expect(magnifier(off)).toBeNull();

    const noNavigation = await mount(
      configFor({}, { show: true, search: true, navigation: false }),
    );
    expect(magnifier(noNavigation)).toBeNull();

    const hiddenToolbar = await mount(configFor({}, { show: false, search: true }));
    expect(magnifier(hiddenToolbar)).toBeNull();
  });

  it('is drawn while the card is being edited, and opens nothing there', async () => {
    for (const flag of ['editMode', 'preview'] as const) {
      const card = await mount(configFor(), { flag });
      expect(magnifier(card)).not.toBeNull();

      magnifier(card)!.click();
      await settle(card);

      expect(manager.requests).toEqual([]);
      expect(wideRequests()).toEqual([]);
    }
  });
});

//-----------------------------------------------------------------------------
// OPENING
//-----------------------------------------------------------------------------

describe('opening the panel', () => {
  it('asks Home Assistant’s dialog manager for it below the magnifier, which takes focus first', async () => {
    const card = await mount(configFor({ past_event_opacity: 40 }));
    const events: Array<{ dialogTag: string; dialogImport: () => Promise<unknown> }> = [];
    card.addEventListener('show-dialog', (event) =>
      events.push((event as CustomEvent).detail as (typeof events)[number]),
    );

    await openSearch(card);

    expect(events.map(({ dialogTag }) => dialogTag)).toEqual([SEARCH_PANEL_TAG]);
    await events[0].dialogImport();
    expect(customElements.get(SEARCH_PANEL_TAG)).toBeDefined();
    const params = manager.requests[0];
    expect({
      below: params.anchor?.below,
      hang: params.hang,
      dark: params.dark,
      language: params.language,
      pastOpacity: params.pastOpacity,
    }).toEqual({ below: true, hang: 'left', dark: false, language: 'en', pastOpacity: 0.4 });
    expect(isOpen()).toBe(true);
  });

  it('opens once: a second press while it is open asks for nothing more', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    magnifier(card)!.click();
    await settle(card);

    expect(manager.requests).toHaveLength(1);
    expect(wideRequests()).toEqual([ANNA, BEN]);
  });

  it('puts focus on the magnifier as it opens, so focus comes back to it when it closes', async () => {
    const card = await mount(configFor());
    await openSearch(card);
    expect(manager.returnFocusTo).toEqual([magnifier(card)]);
    expect(deepActive()).toBe(manager.panel!.shadowRoot!.querySelector('input'));

    await closeSearch(card);

    expect(isOpen()).toBe(false);
    expect(focused(card)).toBe(magnifier(card));
  });

  it('puts focus on the magnifier for a key press as for a pointer’s', async () => {
    const card = await mount(configFor());
    const button = magnifier(card)!;
    button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: 5, clientY: 5 }),
    );
    await settle(card);

    expect(manager.returnFocusTo).toEqual([button]);
    expect(manager.requests[0].anchor?.pointerType).toBe('mouse');
  });
});

//-----------------------------------------------------------------------------
// THE YEAR-WIDE LOAD
//-----------------------------------------------------------------------------

describe('the year-wide load', () => {
  it('asks each calendar once, a year back and a year ahead, without a live subscription', async () => {
    const card = await mount(
      configFor({
        entities: [ANNA, BEN, { entity: ANNA, event_type: 'all_day' }],
      } as Partial<Types.Config>),
    );
    const lease = vi.spyOn(LiveCalendars, 'lease');

    await openSearch(card);

    expect(wideRequests()).toEqual([ANNA, BEN]);
    expect(lease).not.toHaveBeenCalled();
  });

  it('is kept for the next opening, and typing asks nothing', async () => {
    const card = await mount(configFor());
    await openSearch(card);
    found('d');
    found('dentist');
    await closeSearch(card);

    await openSearch(card);
    found('swim');

    expect(wideRequests()).toEqual([ANNA, BEN]);
  });

  it('is asked again after a calendar is written to', async () => {
    const card = await mount(configFor());
    await openSearch(card);
    await closeSearch(card);

    EventUtils.advanceWriteGeneration();
    await openSearch(card);

    expect(wideRequests()).toEqual([ANNA, BEN, ANNA, BEN]);
  });

  it('is asked again after a live subscription reports a change', async () => {
    const card = await mount(configFor());
    const changes = vi.spyOn(LiveCalendars, 'changeCount').mockReturnValue(4);
    await openSearch(card);
    await closeSearch(card);

    changes.mockReturnValue(5);
    await openSearch(card);

    expect(wideRequests()).toEqual([ANNA, BEN, ANNA, BEN]);
  });

  it('is asked again once the card’s refresh interval has passed, and not before', async () => {
    const card = await mount(configFor({ refresh_interval: 30 }));
    await openSearch(card);
    await closeSearch(card);

    vi.setSystemTime(NOW.getTime() + 29 * 60_000);
    await openSearch(card);
    await closeSearch(card);
    expect(wideRequests()).toEqual([ANNA, BEN]);

    vi.setSystemTime(NOW.getTime() + 30 * 60_000 + 1_000);
    await openSearch(card);
    expect(wideRequests()).toEqual([ANNA, BEN, ANNA, BEN]);
  });

  it('is asked again on a new day, for that day’s year either side', async () => {
    const card = await mount(configFor({ refresh_interval: 24 * 60 }));
    await openSearch(card);
    await closeSearch(card);

    vi.setSystemTime(Date.UTC(2026, 5, 18, 0, 0, 1));
    await openSearch(card);

    const paths = callApi.mock.calls.map(([, path]) => path);
    expect(paths).toContain(
      `calendars/${ANNA}?start=2025-06-18T00:00:00.000Z&end=2027-06-19T00:00:00.000Z`,
    );
  });

  it('is asked again when the card’s calendars change', async () => {
    const card = await mount(configFor());
    await openSearch(card);
    await closeSearch(card);

    card.setConfig(configFor({ entities: [ANNA] } as Partial<Types.Config>));
    await settle(card);
    await openSearch(card);

    expect(wideRequests()).toEqual([ANNA, BEN, ANNA]);
  });

  it('names a calendar that could not be loaded, and asks it alone again at the next opening', async () => {
    failing.add(BEN);
    const card = await mount(configFor());
    const panel = await openSearch(card);

    expect(source().failed).toEqual(['Ben']);
    expect(panel.shadowRoot!.querySelector('.note.error')!.textContent).toBe(
      'Could not retrieve events for calendars: Ben',
    );
    // Its year is not searched: the card's own days are not all of it.
    expect(found('piano')).toEqual([]);
    await closeSearch(card);

    failing.clear();
    await openSearch(card);

    expect(wideRequests()).toEqual([ANNA, BEN, BEN]);
    expect(source().failed).toEqual([]);
    expect(found('piano')).toEqual([['Piano', '2026-09-02']]);
  });

  it('finds what the card already holds until a calendar answers', async () => {
    holdWide = true;
    const card = await mount(configFor());
    await openSearch(card);

    expect(source().loading).toBe(true);
    expect(found('swim')).toEqual([['Swim', '2026-06-18']]);
    expect(found('dentist')).toEqual([]);

    held.splice(0).forEach((answer) => answer());
    await settle(card);

    expect(source().loading).toBe(false);
    expect(found('dentist')).toEqual([
      ['Dentist check-up', '2026-12-08'],
      ['Dentist cleaning', '2026-01-10'],
    ]);
  });
});

//-----------------------------------------------------------------------------
// WHAT IT FINDS
//-----------------------------------------------------------------------------

describe('what a term finds', () => {
  it('is every event of the year either side, upcoming first, never one outside it', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    expect(found('dentist')).toEqual([
      ['Dentist check-up', '2026-12-08'],
      ['Dentist cleaning', '2026-01-10'],
    ]);
  });

  it('spans the whole year whatever days a layout’s own block shows', async () => {
    const card = await mount(configFor({ list: { days_to_show: 3 } } as Partial<Types.Config>));
    await openSearch(card);

    expect(found('dentist')).toEqual([
      ['Dentist check-up', '2026-12-08'],
      ['Dentist cleaning', '2026-01-10'],
    ]);
  });

  it('includes the past whatever show_past_events says, since a search spans its own days', async () => {
    const card = await mount(configFor({ show_past_events: false }));
    await openSearch(card);

    expect(found('cleaning')).toEqual([['Dentist cleaning', '2026-01-10']]);
  });

  it('reads the location as drawn, its country removed, and the description where it is shown', async () => {
    const card = await mount(
      configFor({
        show_location: true,
        show_description: true,
        remove_location_country: true,
      } as Partial<Types.Config>),
    );
    await openSearch(card);

    const row = rowFor('high street', 'Dentist check-up');
    expect(row.location).toBe('Dental Clinic, 12 High Street');
    expect(found('germany')).toEqual([]);
    expect(found('recital')).toEqual([['Piano', '2026-09-02']]);
  });

  it('does not look in a location or a description the card does not draw', async () => {
    const card = await mount(
      configFor({ show_location: false, show_description: false } as Partial<Types.Config>),
    );
    await openSearch(card);

    expect(found('high street')).toEqual([]);
    expect(found('recital')).toEqual([]);
  });

  it('reads a title with the calendar’s replacements made, as its rows draw it', async () => {
    const card = await mount(
      configFor({
        entities: [{ entity: ANNA, replace_pattern: 'Dentist', replace_with: 'Teeth' }, BEN],
      } as Partial<Types.Config>),
    );
    await openSearch(card);

    expect(found('dentist')).toEqual([]);
    expect(found('teeth')).toEqual([
      ['Teeth check-up', '2026-12-08'],
      ['Teeth cleaning', '2026-01-10'],
    ]);
  });

  it('leaves out what the card is set up not to show', async () => {
    const card = await mount(
      configFor({
        entities: [{ entity: ANNA, blocklist: 'cleaning' }, BEN],
      } as Partial<Types.Config>),
    );
    await openSearch(card);

    expect(found('dentist')).toEqual([['Dentist check-up', '2026-12-08']]);
  });

  it('leaves out a calendar the filter hides', async () => {
    const card = await mount(configFor({}, { ...SEARCH_ON, legend: 'chips' }));
    root(card).querySelector<HTMLButtonElement>(`.legend-chip[data-calendar="${BEN}"]`)!.click();
    await settle(card);
    await openSearch(card);

    expect(found('piano')).toEqual([]);
    expect(found('dentist')).toHaveLength(2);
  });

  it('finds an event two calendars share once, as filter_duplicates draws it', async () => {
    const shared = timed('2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', 'Parents evening', {
      uid: 'school-1',
    });
    calendars[ANNA].push(shared);
    calendars[BEN].push(shared);

    const apart = await mount(configFor());
    await openSearch(apart);
    expect(found('parents')).toHaveLength(2);
    await closeSearch(apart);
    apart.remove();
    manager.panel = null;

    const once = await mount(configFor({ filter_duplicates: true }));
    await openSearch(once);
    expect(found('parents')).toEqual([['Parents evening', '2026-10-01']]);
  });

  it('lists each copy of an event a calendar listed twice draws twice, the keyboard reaching both', async () => {
    const card = await mount(
      configFor({ entities: [ANNA, { entity: ANNA }, BEN] } as Partial<Types.Config>),
    );
    const panel = await openSearch(card);

    expect(found('check-up')).toEqual([
      ['Dentist check-up', '2026-12-08'],
      ['Dentist check-up', '2026-12-08'],
    ]);
    const ids = source()
      .find('check-up')
      .groups.flatMap((group) => group.hits.map((hit) => hit.row.id));
    expect(new Set(ids).size).toBe(2);

    const field = panel.shadowRoot!.querySelector<HTMLInputElement>('input')!;
    field.value = 'check-up';
    field.dispatchEvent(new Event('input'));
    await panel.updateComplete;
    const active: Array<string | null> = [];
    for (let press = 0; press < 3; press += 1) {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await panel.updateComplete;
      active.push(field.getAttribute('aria-activedescendant'));
    }
    expect(active).toEqual(['search-option-0', 'search-option-1', 'search-option-0']);
  });

  it('names each result’s calendar and writes its day and time as the card does', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    const row = rowFor('dentist', 'Dentist check-up');
    expect({
      calendar: row.calendar,
      dayText: row.dayText,
      timeText: row.timeText,
      month: row.month,
    }).toEqual({
      calendar: 'Anna',
      dayText: 'Tue, Dec 8',
      timeText: '3:30 PM - 4:00 PM',
      month: 'December 2026',
    });
  });
});

//-----------------------------------------------------------------------------
// PICKING
//-----------------------------------------------------------------------------

describe('picking a result', () => {
  /** Type a term into the open panel, move to a result, and pick it with Enter. */
  async function pickWithKeyboard(card: CardUnderTest, term: string, downs = 1): Promise<void> {
    const field = manager.panel!.shadowRoot!.querySelector<HTMLInputElement>('input')!;
    field.value = term;
    field.dispatchEvent(new Event('input'));
    await manager.panel!.updateComplete;
    for (let press = 0; press < downs; press += 1) {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await manager.panel!.updateComplete;
    }
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(card);
  }

  it.each(['list', 'column', 'time_grid'] as const)(
    'pages the card in %s view to the day, and rings the event there',
    async (view) => {
      const card = await mount(
        configFor({ view, event_tap_action: { action: 'details' } } as Partial<Types.Config>),
      );
      await openSearch(card);

      await pickWithKeyboard(card, 'check');
      await afterClose(card);

      expect(isOpen()).toBe(false);
      expect(root(card).querySelector('.toolbar-month-text')!.textContent!.trim()).toBe(
        'December 2026',
      );
      expect(ringed(card)).toContain('Dentist check-up');
      expect(root(card).querySelectorAll('.search-ring')).toHaveLength(1);
    },
  );

  it('moves focus to the ringed event once the panel has gone, then lets the ring go', async () => {
    const card = await mount(configFor({ event_tap_action: { action: 'details' } }));
    await openSearch(card);
    await pickWithKeyboard(card, 'check');

    await afterClose(card);

    const ring = root(card).querySelector('.search-ring')!;
    const target = focused(card) as HTMLElement;
    expect(ring.contains(target) || ring === target).toBe(true);
    expect(target.matches('[role="button"][tabindex]')).toBe(true);

    vi.advanceTimersByTime(Constants.TIMING.SEARCH_RING);
    await settle(card);
    expect(ringed(card)).toBeNull();
    expect(focused(card)).toBe(target);
  });

  it('leaves focus on the magnifier where the event is no target of its own', async () => {
    const card = await mount(configFor({ event_tap_action: { action: 'none' } }));
    await openSearch(card);
    await pickWithKeyboard(card, 'check');
    await afterClose(card);

    expect(ringed(card)).toContain('Dentist check-up');
    expect(focused(card)).toBe(magnifier(card));
  });

  it('rings for two seconds from when it is drawn, by a class alone, nothing else changing', async () => {
    const card = await mount(configFor());
    await openSearch(card);
    await pickWithKeyboard(card, 'check');
    const ring = root(card).querySelector('.search-ring')!;
    expect(ring).not.toBeNull();
    // Each class list by its tokens: removing a class rewrites the attribute's spacing.
    const markup = () =>
      root(card)
        .querySelector('.content-container')!
        .innerHTML.replace(/<!--[^>]*-->/g, '')
        .replace(
          /class="([^"]*)"/g,
          (_, list: string) =>
            `class="${list
              .split(/\s+/)
              .filter((name) => name && name !== 'search-ring')
              .join(' ')}"`,
        );

    await afterClose(card);
    const drawn = markup();
    for (let elapsed = 0; elapsed < Constants.TIMING.SEARCH_RING - 500; elapsed += 250) {
      vi.advanceTimersByTime(250);
      await settle(card);
    }
    expect(ring.classList.contains('search-ring')).toBe(true);

    vi.advanceTimersByTime(500);
    await settle(card);
    expect(ring.isConnected).toBe(true);
    expect(ring.classList.contains('search-ring')).toBe(false);
    expect(markup()).toBe(drawn);
  });

  it('pages all the same and rings nothing where the page does not draw the event', async () => {
    calendars[ANNA].push(
      timed('2026-12-08T08:00:00Z', '2026-12-08T09:00:00Z', 'Breakfast', { uid: 'b-1' }),
    );
    const card = await mount(
      configFor({ compact_events_to_show: 1, event_tap_action: { action: 'details' } }),
    );
    await openSearch(card);
    await pickWithKeyboard(card, 'check');
    await afterClose(card);

    expect(root(card).querySelector('.toolbar-month-text')!.textContent!.trim()).toBe(
      'December 2026',
    );
    expect(ringed(card)).toBeNull();
    expect(focused(card)).toBe(magnifier(card));
  });

  it('ends one ring at the next pick, and rings only the second', async () => {
    const card = await mount(configFor());
    await openSearch(card);
    await pickWithKeyboard(card, 'check');
    await afterClose(card);
    expect(ringed(card)).toContain('Dentist check-up');

    await openSearch(card);
    await pickWithKeyboard(card, 'piano');
    await afterClose(card);

    expect(root(card).querySelector('.toolbar-month-text')!.textContent!.trim()).toBe(
      'September 2026',
    );
    expect(root(card).querySelectorAll('.search-ring')).toHaveLength(1);
    expect(ringed(card)).toContain('Piano');
  });
});

//-----------------------------------------------------------------------------
// CLOSING
//-----------------------------------------------------------------------------

describe('the panel closes', () => {
  it('when the card changes width under it', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    await measure(card, 640);
    await afterClose(card);

    expect(isOpen()).toBe(false);
  });

  it('when editing starts', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    card.editMode = true;
    await afterClose(card);

    expect(isOpen()).toBe(false);
  });

  it('when the card hides itself, its calendars emptied under it', async () => {
    const card = (await mount(configFor({ hide_when_empty: true }))) as CardUnderTest & {
      refreshEvents(): Promise<void>;
    };
    await openSearch(card);
    expect(card.hidden).toBe(false);

    calendars = { [ANNA]: [], [BEN]: [] };
    await card.refreshEvents();
    await afterClose(card);

    expect(card.hidden).toBe(true);
    expect(isOpen()).toBe(false);
  });

  it('when the magnifier goes away', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    card.setConfig(configFor({}, { show: true }));
    await afterClose(card);

    expect(isOpen()).toBe(false);
  });

  it('when the card is taken away', async () => {
    const card = await mount(configFor());
    await openSearch(card);

    card.remove();
    vi.advanceTimersByTime(400);
    for (let round = 0; round < 4; round += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(isOpen()).toBe(false);
  });
});
