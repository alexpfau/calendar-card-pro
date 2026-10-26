/**
 * The calendar legend, on the real card.
 *
 * The toolbar defaults to hidden and the legend to off, so every DOM gate built from default
 * config sees no legend and would stay green if it did nothing; each case here turns it on.
 * The pure halves have files of their own: the remembered choice in `view-choice.test.ts`, the
 * menu's placement in `legend-menu.test.ts`. This file pins how the card joins them: which
 * events a hidden calendar takes away and from where in the pipeline, that hiding fetches
 * nothing, what is remembered and for which configuration, the `hide_when_empty` exception,
 * editing, the fold into a button and its menu's lifecycle.
 *
 * happy-dom lays nothing out, so the fold is driven by stubbed measurements: the policy is
 * pinned here, and the layout it rests on was checked in Chromium and WebKit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import { buildDetailEntry, detailPermissions } from '../src/interaction/event-details';
import * as EventUtils from '../src/utils/events';
import {
  VIEW_CHOICE_STORAGE_KEY,
  configFingerprint,
  readHiddenCalendars,
  readViewChoice,
  writeHiddenCalendars,
  writeViewChoice,
} from '../src/utils/view-choice';
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

/** What each calendar holds. Team lunch is in Anna's and Ben's alike: one event, twice. */
const HELD: Record<string, Types.CalendarEventData[]> = {
  [ANNA]: [
    {
      summary: 'Dentist',
      uid: 'dentist',
      start: { dateTime: '2026-06-17T15:00:00.000Z' },
      end: { dateTime: '2026-06-17T16:00:00.000Z' },
    },
    {
      summary: 'Team lunch',
      uid: 'lunch-anna',
      start: { dateTime: '2026-06-18T12:00:00.000Z' },
      end: { dateTime: '2026-06-18T13:00:00.000Z' },
    },
  ],
  [BEN]: [
    {
      summary: 'Football',
      uid: 'football',
      start: { dateTime: '2026-06-17T18:00:00.000Z' },
      end: { dateTime: '2026-06-17T19:00:00.000Z' },
    },
    {
      summary: 'Team lunch',
      uid: 'lunch-ben',
      start: { dateTime: '2026-06-18T12:00:00.000Z' },
      end: { dateTime: '2026-06-18T13:00:00.000Z' },
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

/** A bar holding the legend and nothing else. */
const LEGEND_ONLY = { show: true, legend: true, view_switcher: false, add_event: false };

const BASE: Partial<Types.Config> = {
  entities: [
    { entity: ANNA, accent_color: '#e53935' },
    { entity: BEN, accent_color: '#1e88e5' },
    FAMILY,
  ],
  days_to_show: 3,
  toolbar: LEGEND_ONLY,
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  hidden: boolean;
  events: Types.CalendarEventData[];
  readonly groupedEvents: Types.EventsByDay[];
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

const callApi = vi.fn();

/** The calendar a request is for. */
function calendarOf(path: string): string {
  return path.split('?')[0].replace('calendars/', '');
}

function answerFromFixture(held: Record<string, Types.CalendarEventData[]> = HELD): void {
  callApi.mockImplementation(async (_method: string, path: string) => held[calendarOf(path)] ?? []);
}

const STRINGS: Record<string, string> = {
  'ui.components.calendar.my_calendars': 'My calendars',
  'ui.components.calendar.event.add': 'Add event',
  'ui.common.refresh': 'Refresh',
  'ui.common.previous': 'Previous',
  'ui.common.next': 'Next',
};

function hass(
  names: Record<string, string> = { [ANNA]: 'Anna', [BEN]: 'Ben' },
  localize: (key: string) => string = (key) => STRINGS[key] ?? key,
): Record<string, unknown> {
  return {
    states: Object.fromEntries(
      [ANNA, BEN, FAMILY].map((id) => [
        id,
        {
          entity_id: id,
          state: 'off',
          attributes: { supported_features: 7, ...(names[id] ? { friendly_name: names[id] } : {}) },
        },
      ]),
    ),
    locale: { language: 'en' },
    callApi,
    localize,
  };
}

/** The configuration a card is given, built as Home Assistant would hand it over. */
function configFor(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ ...BASE, ...overrides });
}

/**
 * Let the load, and the renders after it, finish. Several rounds, because a load commits on
 * one turn and the card renders the commit on the next.
 */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config> = {},
  options: {
    flag?: 'preview' | 'editMode';
    hass?: Record<string, unknown>;
    config?: Types.Config;
  } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(options.config ?? configFor(overrides));
  if (options.flag) card[options.flag] = true;
  card.hass = options.hass ?? hass();
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** Deliver a width the way the browser does, and let the frame and the settle delay run. */
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

function chips(card: CardUnderTest): HTMLButtonElement[] {
  return Array.from(root(card).querySelectorAll<HTMLButtonElement>('.legend-chip'));
}

function chip(card: CardUnderTest, id: string): HTMLButtonElement {
  return root(card).querySelector<HTMLButtonElement>(`.legend-chip[data-calendar="${id}"]`)!;
}

/** Each chip as drawn: its name, whether it is pressed, and its color. */
function describeChips(card: CardUnderTest) {
  return chips(card).map((button) => ({
    name: button.textContent!.trim(),
    pressed: button.getAttribute('aria-pressed'),
    hidden: button.classList.contains('hidden-calendar'),
    color: button.style.getPropertyValue('--calendar-card-legend-color'),
  }));
}

/** The titles of the events drawn, in order. */
function titles(card: CardUnderTest): string[] {
  return Array.from(root(card).querySelectorAll('.content-container .event-title')).map((title) =>
    title.textContent!.trim(),
  );
}

async function press(card: CardUnderTest, id: string): Promise<void> {
  chip(card, id).click();
  await settle(card);
}

//-----------------------------------------------------------------------------
// LAYOUT STUBS
//-----------------------------------------------------------------------------

/**
 * What the stubbed layout reports: the card's width, the lane's content width and the chips'
 * natural width. Zero means "not laid out", which is all happy-dom ever reports.
 */
const layout = { card: 0, lane: 0, chips: 0 };

function stubLayout(): void {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width =
      this.localName === 'calendar-card-pro-dev'
        ? layout.card
        : this.classList.contains('legend-chips')
          ? layout.chips
          : undefined;
    if (width === undefined) return realRect.call(this);
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 40, width, height: 40 } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('toolbar-legend') ? layout.lane : 0;
  });
  const realStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = realStyle(element, pseudo);
    if (!(element as HTMLElement).classList?.contains('toolbar-legend')) return style;
    return { ...style, paddingLeft: '0px', paddingRight: '0px' } as CSSStyleDeclaration;
  });
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  answerFromFixture();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  Object.assign(layout, { card: 0, lane: 0, chips: 0 });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

//-----------------------------------------------------------------------------
// THE LANE
//-----------------------------------------------------------------------------

describe('the calendar legend', () => {
  it('draws nothing of its own until asked for', async () => {
    const card = await mount({ title: 'Family', toolbar: { show: true, add_event: false } });

    expect(root(card).querySelector('.toolbar-legend')).toBeNull();
    expect(root(card).querySelector('.header-container')!.className).toBe(
      'header-container has-toolbar',
    );
  });

  it('draws one chip per calendar in a lane under the title, in the order first named', async () => {
    // Anna is listed twice, as an `event_type` split would list her: one chip, colored by
    // her first block. Family has no name in Home Assistant and is named by its id, as the
    // fetch-failure notice names it.
    const card = await mount({
      title: 'Family',
      entities: [
        { entity: ANNA, accent_color: '#e53935' },
        { entity: BEN, accent_color: '#1e88e5' },
        { entity: ANNA, accent_color: '#000000' },
        FAMILY,
      ],
    });
    const header = root(card).querySelector('.header-container')!;

    expect(header.className).toBe('header-container has-toolbar has-legend');
    expect(Array.from(header.children).map((child) => child.className)).toEqual([
      'card-header',
      'toolbar-legend',
    ]);
    expect(describeChips(card)).toEqual([
      { name: 'Anna', pressed: 'true', hidden: false, color: '#e53935' },
      { name: 'Ben', pressed: 'true', hidden: false, color: '#1e88e5' },
      {
        name: FAMILY,
        pressed: 'true',
        hidden: false,
        color: String(buildConfig().accent_color),
      },
    ]);
  });

  it("is a group named by Home Assistant's own words, or in English for assistive technology", async () => {
    const named = await mount();
    const lane = root(named).querySelector('.toolbar-legend')!;
    expect(lane.getAttribute('role')).toBe('group');
    expect(lane.getAttribute('aria-label')).toBe('My calendars');

    document.body.innerHTML = '';
    const unnamed = await mount({}, { hass: hass(undefined, (key) => key) });
    expect(root(unnamed).querySelector('.toolbar-legend')!.getAttribute('aria-label')).toBe(
      'Calendars',
    );
  });

  it('follows the bar, after the date navigation and in the header card-mod styles find', async () => {
    const card = await mount({
      title: 'Family',
      toolbar: {
        show: true,
        legend: true,
        navigation: true,
        add_event: false,
        view_switcher: false,
      },
    });
    const header = root(card).querySelector('.header-container')!;

    expect(header.className).toBe('header-container has-toolbar has-band has-legend');
    expect(Array.from(header.children).map((child) => child.className)).toEqual([
      'card-header',
      'card-toolbar toolbar-band',
      'toolbar-legend',
    ]);
  });

  it('hides a calendar on a press, fetching nothing, and shows it again on the next', async () => {
    const card = await mount();
    const requests = callApi.mock.calls.length;
    expect(titles(card)).toEqual(['Recycling', 'Dentist', 'Football', 'Team lunch', 'Team lunch']);

    await press(card, BEN);
    expect(titles(card)).toEqual(['Recycling', 'Dentist', 'Team lunch']);
    expect(describeChips(card).map(({ pressed, hidden }) => [pressed, hidden])).toEqual([
      ['true', false],
      ['false', true],
      ['true', false],
    ]);

    await press(card, BEN);
    expect(titles(card)).toEqual(['Recycling', 'Dentist', 'Football', 'Team lunch', 'Team lunch']);
    expect(callApi.mock.calls.length).toBe(requests);
  });

  it('keeps a press inside the lane from becoming a press on the card', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const fired: Event[] = [];
    card.addEventListener('hass-action', (ev) => fired.push(ev));

    chip(card, BEN).dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    chip(card, BEN).click();
    root(card)
      .querySelector('.toolbar-legend')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(fired).toEqual([]);
  });

  it('stops the card presenting itself as a button, and keeps its tab stop', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const haCard = root(card).querySelector('ha-card')!;

    expect(haCard.getAttribute('role')).toBeNull();
    expect(haCard.getAttribute('tabindex')).toBe('0');
  });
});

//-----------------------------------------------------------------------------
// WHAT A HIDDEN CALENDAR TAKES AWAY
//-----------------------------------------------------------------------------

describe('a hidden calendar', () => {
  it("hands a duplicate to the next calendar shown, merged from that calendar's copy alone", async () => {
    const card = await mount({ filter_duplicates: true });
    const lunch = () =>
      card.groupedEvents.flatMap((day) => day.events).filter((e) => e.summary === 'Team lunch');

    expect(lunch()).toHaveLength(1);
    expect(lunch()[0]._entityId).toBe(ANNA);
    expect(lunch()[0]._mergedFrom).toHaveLength(2);

    await press(card, ANNA);

    expect(lunch()).toHaveLength(1);
    expect(lunch()[0]._entityId).toBe(BEN);
    expect(lunch()[0]._mergedFrom).toBeUndefined();
    expect(titles(card)).toEqual(['Recycling', 'Football', 'Team lunch']);
  });

  it('lets the details dialog edit a merged row once only one of its calendars is shown', async () => {
    // A row merged from two calendars cannot be edited or deleted: which copy would change?
    // With one of them hidden it is that calendar's own event again.
    const card = await mount({ filter_duplicates: true });
    const permissions = () => {
      const lunch = card.groupedEvents
        .flatMap((day) => day.events)
        .find((e) => e.summary === 'Team lunch')!;
      return detailPermissions(card.hass as Types.Hass, lunch, buildDetailEntry(lunch)!, {
        allowEdit: true,
        allowDelete: true,
        failedEntities: [],
      } as never);
    };

    expect(permissions()).toEqual({ canEdit: false, canDelete: false });
    await press(card, ANNA);
    expect(permissions().canDelete).toBe(true);
  });

  it('counts for nothing against the compact limits', async () => {
    const card = await mount({ compact_events_to_show: 2 });
    expect(titles(card)).toEqual(['Recycling', 'Dentist']);

    await press(card, ANNA);
    expect(titles(card)).toEqual(['Recycling', 'Football']);
  });

  it.each(['column', 'grid'] as const)('draws none of its events in %s view', async (view) => {
    const card = await mount({ view });
    const text = () => root(card).querySelector('.content-container')!.textContent!;
    expect(text()).toContain('Football');
    expect(text()).toContain('Recycling');

    await press(card, BEN);
    await press(card, FAMILY);

    expect(text()).not.toContain('Football');
    expect(text()).not.toContain('Recycling');
    expect(text()).toContain('Dentist');
  });

  it('keeps the card and its chips while hide_when_empty would hide it', async () => {
    const card = await mount({ hide_when_empty: true });

    for (const id of [ANNA, BEN, FAMILY]) await press(card, id);

    // Only the empty day's placeholder is left.
    expect(titles(card)).toEqual(['✓ No events']);
    expect(card.hidden).toBe(false);
    expect(card.style.display).toBe('');
    expect(chips(card)).toHaveLength(3);
  });

  it('leaves hide_when_empty to act as it always has while every calendar is shown', async () => {
    // The control for the case above: the exception is the hidden calendars, not the legend.
    answerFromFixture({});
    const card = await mount({ hide_when_empty: true });

    expect(card.hidden).toBe(true);
    expect(card.style.display).toBe('none');
  });

  it('is shown again, and toggles nothing, while the card is being edited', async () => {
    writeHiddenCalendars(configFingerprint(configFor()), [BEN]);
    const card = await mount({}, { flag: 'preview' });

    expect(titles(card)).toContain('Football');
    expect(describeChips(card).every(({ pressed }) => pressed === 'true')).toBe(true);
    await press(card, ANNA);
    expect(titles(card)).toContain('Dentist');
    expect(readHiddenCalendars(configFingerprint(configFor()))).toEqual([BEN]);

    // Leaving the editor brings the device's choice back, from the same events.
    const events = card.events;
    card.preview = false;
    await settle(card);
    expect(card.events).toBe(events);
    expect(titles(card)).not.toContain('Football');
    expect(chip(card, BEN).getAttribute('aria-pressed')).toBe('false');
  });

  it('fetches nothing, and keeps a page that is still loading dimmed', async () => {
    const card = await mount({
      days_to_show: 7,
      start_date: 'start_of_week',
      first_day_of_week: 'monday',
      toolbar: {
        show: true,
        legend: true,
        navigation: true,
        view_switcher: false,
        add_event: false,
      },
    });
    // The next page never answers.
    callApi.mockImplementation(() => new Promise(() => undefined));
    root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await settle(card);
    const requests = callApi.mock.calls.length;
    expect(root(card).querySelector('.content-container')!.classList).toContain('page-pending');

    await press(card, BEN);

    expect(callApi.mock.calls.length).toBe(requests);
    expect(root(card).querySelector('.content-container')!.classList).toContain('page-pending');
  });
});

//-----------------------------------------------------------------------------
// MEMORY
//-----------------------------------------------------------------------------

describe('the hidden calendars a device remembers', () => {
  it('survive a reload of the same configuration, and not an edit', async () => {
    const first = await mount();
    await press(first, BEN);
    expect(readHiddenCalendars(configFingerprint(configFor()))).toEqual([BEN]);

    document.body.innerHTML = '';
    const reloaded = await mount();
    expect(titles(reloaded)).not.toContain('Football');
    expect(chip(reloaded, BEN).getAttribute('aria-pressed')).toBe('false');

    document.body.innerHTML = '';
    const edited = await mount({ title: 'Family' });
    expect(titles(edited)).toContain('Football');
  });

  it('are remembered without a view switcher, and beside a view the switcher chose', async () => {
    const fingerprint = configFingerprint(configFor());
    writeViewChoice(fingerprint, 'grid');
    const card = await mount();

    await press(card, ANNA);

    expect(readViewChoice(fingerprint)).toBe('grid');
    expect(readHiddenCalendars(fingerprint)).toEqual([ANNA]);
    await press(card, ANNA);
    expect(readViewChoice(fingerprint)).toBe('grid');
    expect(readHiddenCalendars(fingerprint)).toEqual([]);
  });

  it('leave out any calendar the configuration no longer shows', async () => {
    writeHiddenCalendars(configFingerprint(configFor()), ['calendar.zoe', BEN]);
    const card = await mount();

    expect(describeChips(card).map(({ name, pressed }) => [name, pressed])).toEqual([
      ['Anna', 'true'],
      ['Ben', 'false'],
      [FAMILY, 'true'],
    ]);
  });

  it('are not read for a card without the legend', async () => {
    const config = configFor({ toolbar: { show: true, add_event: false, view_switcher: false } });
    writeHiddenCalendars(configFingerprint(config), [BEN]);
    const card = await mount({}, { config });

    expect(titles(card)).toContain('Football');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toContain(BEN);
  });
});

//-----------------------------------------------------------------------------
// THE FOLD
//-----------------------------------------------------------------------------

describe('a legend too wide for one row', () => {
  const FOLDING = { show: true, legend: true, refresh: true, view_switcher: false };

  function legendButton(card: CardUnderTest): HTMLButtonElement | null {
    return root(card).querySelector<HTMLButtonElement>('.legend-button');
  }

  /** The classes of the trailing group's controls, by their first two names. */
  function trailing(card: CardUnderTest): string[] {
    return Array.from(root(card).querySelectorAll('.toolbar-trailing > *')).map((element) =>
      element.className.split(' ').slice(0, 2).join(' '),
    );
  }

  /** Mount a card whose chips need 500px of a 360px lane on a 380px card. */
  async function mountFolded(overrides: Partial<Types.Config> = {}): Promise<CardUnderTest> {
    stubLayout();
    Object.assign(layout, { card: 380, lane: 360, chips: 500 });
    return mount({ title: 'Family', toolbar: FOLDING, ...overrides });
  }

  it('folds into a button leading the trailing group, before it is painted', async () => {
    const card = await mountFolded();

    expect(root(card).querySelector('.toolbar-legend')).toBeNull();
    expect(root(card).querySelector('.header-container')!.className).toBe(
      'header-container has-toolbar',
    );
    expect(trailing(card)).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button refresh-button',
      'toolbar-button add-event-button',
    ]);
    const button = legendButton(card)!;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('My calendars');
    expect(button.getAttribute('title')).toBe('My calendars');
  });

  it('concludes nothing from a card that is not laid out', async () => {
    stubLayout();
    const card = await mount({ title: 'Family', toolbar: FOLDING });

    expect(root(card).querySelector('.toolbar-legend')).not.toBeNull();
    expect(legendButton(card)).toBeNull();
  });

  it('draws the chips again a frame after the card is wide enough for them, and not before', async () => {
    // Folded at 380px with 140px missing, so the chips fit from 520px; the margin makes it
    // 522px, so a card resting on the boundary is not judged to fit and then not.
    const card = await mountFolded();
    const unfoldAt = 380 + (500 - 360) + Constants.UI.LEGEND_UNFOLD_MARGIN;

    await measure(card, unfoldAt - 1);
    vi.advanceTimersToNextFrame();
    await settle(card);
    expect(legendButton(card)).not.toBeNull();

    layout.lane = unfoldAt - 20;
    layout.chips = 400;
    const observer = RecordingResizeObserver.instances.find(({ observed }) =>
      observed.includes(card),
    )!;
    layout.card = unfoldAt;
    observer.callback([{ contentRect: { width: unfoldAt } }]);
    // A render the resize causes, as a label threshold crossed with it would.
    (card as unknown as { requestUpdate(): void }).requestUpdate();
    await settle(card);
    // The resize alone changes nothing: a fold changes the card's height, which must not
    // happen while the browser is delivering resize observations.
    expect(legendButton(card)).not.toBeNull();

    vi.advanceTimersToNextFrame();
    await settle(card);
    expect(legendButton(card)).toBeNull();
    expect(root(card).querySelector('.toolbar-legend')).not.toBeNull();
  });

  it('folds again from a wider width when an unfold still does not fit', async () => {
    const card = await mountFolded();
    const unfoldAt = 380 + (500 - 360) + Constants.UI.LEGEND_UNFOLD_MARGIN;

    // Wide enough by the old reading, but a font has made the chips wider meanwhile.
    Object.assign(layout, { lane: unfoldAt - 20, chips: unfoldAt + 80 });
    await measure(card, unfoldAt);
    vi.advanceTimersToNextFrame();
    await settle(card);
    expect(legendButton(card)).not.toBeNull();

    // Not drawn again at the width that just failed, nor a little above it.
    await measure(card, unfoldAt + 50);
    vi.advanceTimersToNextFrame();
    await settle(card);
    expect(legendButton(card)).not.toBeNull();
  });

  it('folds a card narrowed below its chips a frame after the resize', async () => {
    stubLayout();
    Object.assign(layout, { card: 900, lane: 880, chips: 500 });
    const card = await mount({ title: 'Family', toolbar: FOLDING });
    expect(legendButton(card)).toBeNull();

    // Narrower than both label thresholds, so the resize re-renders the bar at once.
    layout.lane = 360;
    layout.card = 380;
    RecordingResizeObserver.instances
      .find(({ observed }) => observed.includes(card))!
      .callback([{ contentRect: { width: 380 } }]);
    await settle(card);
    // Not inside the browser's delivery of the resize: that render leaves the chips as they are.
    expect(legendButton(card)).toBeNull();

    vi.advanceTimersToNextFrame();
    await settle(card);
    expect(legendButton(card)).not.toBeNull();
  });

  it('measures again when a calendar is renamed', async () => {
    const card = await mountFolded();

    layout.chips = 300;
    card.hass = hass({ [ANNA]: 'Anna', [BEN]: 'Benjamin' });
    await settle(card);

    expect(legendButton(card)).toBeNull();
    expect(chip(card, BEN).textContent!.trim()).toBe('Benjamin');
  });

  it('carries a mark while a calendar is hidden', async () => {
    writeHiddenCalendars(configFingerprint(configFor({ title: 'Family', toolbar: FOLDING })), [
      BEN,
    ]);
    const card = await mountFolded();

    expect(legendButton(card)!.classList).toContain('filtered');
  });

  it('labels the button only from the width every labeled control needs', async () => {
    // Refresh, add and the folded legend: two commands past the one each threshold allows.
    const card = await mountFolded();
    const needs =
      Constants.UI.TOOLBAR_LABEL_MIN_WIDTH + 2 * Constants.UI.TOOLBAR_EXTRA_LABEL_MIN_WIDTH;
    // Keep the fold while the card grows: the chips are wider than any card here.
    layout.chips = 5000;

    await measure(card, needs - 1);
    expect(legendButton(card)!.classList).toContain('icon-only');

    await measure(card, needs);
    expect(legendButton(card)!.classList).not.toContain('icon-only');
    expect(legendButton(card)!.textContent!.trim()).toBe('My calendars');
  });
});

//-----------------------------------------------------------------------------
// THE MENU
//-----------------------------------------------------------------------------

describe('the menu a folded legend opens', () => {
  const FOLDING = { show: true, legend: true, view_switcher: false, add_event: false };

  async function mountFolded(overrides: Partial<Types.Config> = {}): Promise<CardUnderTest> {
    stubLayout();
    Object.assign(layout, { card: 380, lane: 360, chips: 500 });
    return mount({ title: 'Family', toolbar: FOLDING, ...overrides });
  }

  const button = (card: CardUnderTest) =>
    root(card).querySelector<HTMLButtonElement>('.legend-button')!;
  const dialog = (card: CardUnderTest) =>
    root(card).querySelector<HTMLDialogElement>('dialog.legend-menu')!;
  const row = (card: CardUnderTest, id: string) =>
    root(card).querySelector<HTMLInputElement>(
      `.legend-menu-row[data-calendar="${id}"] .legend-menu-check`,
    )!;

  async function open(card: CardUnderTest): Promise<void> {
    button(card).click();
    await settle(card);
  }

  it('opens as a modal list of every calendar, each a checkbox', async () => {
    const card = await mountFolded();
    await open(card);

    expect(dialog(card).open).toBe(true);
    expect(button(card).getAttribute('aria-expanded')).toBe('true');
    expect(dialog(card).getAttribute('aria-label')).toBe('My calendars');
    const rows = Array.from(root(card).querySelectorAll('.legend-menu-row')).map((element) => [
      element.textContent!.trim(),
      (element.querySelector('input') as HTMLInputElement).checked,
    ]);
    expect(rows).toEqual([
      ['Anna', true],
      ['Ben', true],
      [FAMILY, true],
    ]);
  });

  it('hides a calendar from its checkbox, and stays open on the same node', async () => {
    const card = await mountFolded();
    await open(card);
    const node = dialog(card);

    row(card, BEN).click();
    await settle(card);

    expect(titles(card)).not.toContain('Football');
    expect(row(card, BEN).checked).toBe(false);
    expect(dialog(card)).toBe(node);
    expect(node.open).toBe(true);
    expect(button(card).classList).toContain('filtered');
  });

  it('stays open through an update that has nothing to do with it', async () => {
    const card = await mountFolded();
    await open(card);
    const node = dialog(card);

    card.hass = hass();
    await settle(card);

    expect(dialog(card)).toBe(node);
    expect(node.open).toBe(true);
  });

  it('closes on Escape and hands focus back to its button', async () => {
    const card = await mountFolded();
    await open(card);

    dialog(card).dispatchEvent(new Event('cancel'));
    dialog(card).close();
    await settle(card);

    expect(dialog(card).open).toBe(false);
    expect(button(card).getAttribute('aria-expanded')).toBe('false');
    expect(root(card).activeElement).toBe(button(card));
  });

  it('closes on a press outside it, and not on one on its own padding', async () => {
    const card = await mountFolded();
    await open(card);
    vi.spyOn(dialog(card), 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 300,
      bottom: 300,
      width: 200,
      height: 200,
    } as DOMRect);

    dialog(card).dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 150 }));
    expect(dialog(card).open).toBe(true);

    dialog(card).dispatchEvent(new MouseEvent('click', { clientX: 500, clientY: 150 }));
    await settle(card);
    expect(dialog(card).open).toBe(false);
    expect(root(card).activeElement).toBe(button(card));
  });

  it('closes on a second press of its button', async () => {
    const card = await mountFolded();
    await open(card);
    await open(card);

    expect(dialog(card).open).toBe(false);
    expect(button(card).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a scroll of the page, and not on one inside it', async () => {
    const card = await mountFolded();
    await open(card);

    dialog(card).dispatchEvent(new Event('scroll', { composed: true }));
    expect(dialog(card).open).toBe(true);

    window.dispatchEvent(new Event('scroll'));
    await settle(card);
    expect(dialog(card).open).toBe(false);
  });

  it('closes when editing starts, and opens on nothing while it lasts', async () => {
    const card = await mountFolded();
    await open(card);

    card.editMode = true;
    await settle(card);
    expect(dialog(card).open).toBe(false);

    await open(card);
    expect(dialog(card).open).toBe(false);
  });

  it('closes before the card hides itself', async () => {
    // Every calendar shown again and nothing to show: hide_when_empty acts, and a modal menu
    // left open over a hidden card would keep the page inert under nothing.
    answerFromFixture({});
    writeHiddenCalendars(
      configFingerprint(configFor({ title: 'Family', toolbar: FOLDING, hide_when_empty: true })),
      [BEN],
    );
    const card = await mountFolded({ hide_when_empty: true });
    expect(card.hidden).toBe(false);
    await open(card);

    row(card, BEN).click();
    await settle(card);

    expect(card.hidden).toBe(true);
    expect(dialog(card).open).toBe(false);
  });

  it('closes when the configuration changes, and when the card leaves the page', async () => {
    const card = await mountFolded();
    await open(card);
    const node = dialog(card);

    card.setConfig(configFor({ title: 'Family', toolbar: { show: true } }));
    await settle(card);
    expect(node.open).toBe(false);

    card.setConfig(configFor({ title: 'Family', toolbar: FOLDING }));
    await settle(card);
    await open(card);
    const again = dialog(card);
    expect(again.open).toBe(true);

    card.remove();
    expect(again.open).toBe(false);
  });
});
