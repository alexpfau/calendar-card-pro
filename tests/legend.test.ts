/**
 * The calendar legend, on the real card.
 *
 * The toolbar defaults to hidden, and shown it offers the legend as a menu; only `legend:
 * chips` draws chips. So every DOM gate built from default config sees no legend at all and
 * would stay green if it did nothing; each case here turns it on. The pure halves have files
 * of their own: the remembered choice in `view-choice.test.ts`, the menu's placement in
 * `legend-menu.test.ts`. This file pins how the card joins them: which events a hidden
 * calendar takes away and from where in the pipeline, that hiding fetches nothing, what is
 * remembered and for which configuration, the `hide_when_empty` exception, editing, where the
 * chips and the button sit, chips that do not fit giving way to exactly the menu's layout,
 * and the menu's lifecycle.
 *
 * happy-dom lays nothing out, so the fold is driven by stubbed measurements: the policy is
 * pinned here, and the layout it rests on can only be checked in a browser.
 */

import { mdiCalendarFilter } from '@mdi/js';
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

/**
 * A toolbar holding the legend's chips and nothing else. Shown, the toolbar draws the date
 * navigation, the view switcher, add and reset by default, so each is switched off by name.
 */
const LEGEND_ONLY: Types.ToolbarConfig = {
  show: true,
  legend: 'chips',
  navigation: false,
  reset: false,
  view_switcher: false,
  add_event: false,
};

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
  'ui.common.reset': 'Reset',
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

/** Let the next animation frame run, and the renders it causes. */
async function nextFrame(card: CardUnderTest): Promise<void> {
  vi.advanceTimersToNextFrame();
  await settle(card);
}

/** The classes of an element's children, in order. */
function childClasses(parent: Element): string[] {
  return Array.from(parent.children).map((child) => child.className);
}

/** The controls in one group of the action row, in order, each by its first two classes. */
function controls(card: CardUnderTest, group: '.toolbar-start' | '.toolbar-end'): string[] {
  return Array.from(root(card).querySelectorAll(`.toolbar-actions > ${group} > *`)).map((element) =>
    element.className.split(' ').slice(0, 2).join(' '),
  );
}

function headingRow(card: CardUnderTest): HTMLElement {
  return root(card).querySelector<HTMLElement>('.toolbar-heading')!;
}

function legendButton(card: CardUnderTest): HTMLButtonElement | null {
  return root(card).querySelector<HTMLButtonElement>('.legend-button');
}

/** Which form the legend takes, as the toolbar draws it. */
function legendForm(card: CardUnderTest) {
  return {
    start: controls(card, '.toolbar-start'),
    lane: root(card).querySelector('.toolbar-legend') !== null,
    chips: chips(card).length,
    heading: headingRow(card).className,
  };
}

/** {@link legendForm} for the legend as a button and its menu, alone in the action row. */
const MENU_FORM = {
  start: ['toolbar-button legend-button', 'legend-menu'],
  lane: false,
  chips: 0,
  heading: 'card-toolbar toolbar-heading',
};

//-----------------------------------------------------------------------------
// LAYOUT STUBS
//-----------------------------------------------------------------------------

/**
 * What the stubbed layout reports, in CSS pixels from the card's left edge, reading left to
 * right. Zero for the card means "not laid out", which is all happy-dom ever reports.
 *
 * The heading row spans the card: the month at its start, the arrows at its end, and the chips
 * between them. `probe` is the width of the longest month in full, which the month keeps the
 * room of while the chips show; `navigation` is the arrows' group, drawn only with the date
 * navigation; `chips` is the chips' natural width. `scrollbar` is the width a page scrollbar
 * takes from the card, and from its heading row, while the chips are drawn: what chips tall
 * enough to make the page scroll do in a browser. The rest are the row's padding on each side,
 * the month's start margin, and the chips' box's padding and margin on each side, as their
 * stylesheet would compute them.
 *
 * With the defaults and no arrows, the chips get the card's width less 20px.
 */
const layout = {
  card: 0,
  probe: 20,
  navigation: 104,
  chips: 0,
  scrollbar: 0,
  gap: 0,
  rowPadding: 0,
  monthMargin: 0,
  lanePadding: 0,
  laneMargin: 0,
};

const LAYOUT_DEFAULTS = { ...layout };

/** A box `left` to `right` on the toolbar's line. */
function box(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right,
    bottom: 40,
    width: right - left,
    height: 40,
  } as DOMRect;
}

function stubLayout(): void {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = (host: ParentNode | null) =>
      layout.card - (host?.querySelector('.toolbar-legend') ? layout.scrollbar : 0);
    if (this.localName === 'calendar-card-pro-dev') return box(0, width(this.shadowRoot));

    const row = this.closest('.toolbar-heading');
    if (!row) return realRect.call(this);
    const rowEnd = width(row);
    const arrows = row.querySelector('.date-navigation') ? layout.navigation : 0;
    const monthStart = layout.rowPadding + layout.monthMargin;
    const arrowsStart = rowEnd - layout.rowPadding - arrows;
    // The chips' box sits between the month and the arrows, a gap from each, and is squeezed to
    // nothing rather than below it when they leave it no room.
    const laneStart = monthStart + layout.probe + layout.gap + layout.laneMargin;
    const laneEnd = Math.max(laneStart, arrowsStart - layout.gap - layout.laneMargin);
    const classes = this.classList;

    if (classes.contains('toolbar-heading')) return box(0, rowEnd);
    if (classes.contains('toolbar-month') || classes.contains('toolbar-month-probe')) {
      return box(monthStart, monthStart + layout.probe);
    }
    if (classes.contains('date-navigation')) return box(arrowsStart, arrowsStart + arrows);
    if (classes.contains('toolbar-legend')) return box(laneStart, laneEnd);
    if (classes.contains('legend-chips')) {
      const start = laneStart + layout.lanePadding;
      return box(start, start + layout.chips);
    }
    return realRect.call(this);
  });
  const realStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = realStyle(element, pseudo);
    const classes = (element as HTMLElement).classList;
    const px = (value: number) => `${value}px`;
    if (classes?.contains('toolbar-heading')) {
      return {
        ...style,
        direction: 'ltr',
        paddingLeft: px(layout.rowPadding),
        paddingRight: px(layout.rowPadding),
        columnGap: px(layout.gap),
      } as CSSStyleDeclaration;
    }
    if (classes?.contains('toolbar-month')) {
      return {
        ...style,
        marginLeft: px(layout.monthMargin),
        marginInlineStart: px(layout.monthMargin),
      } as CSSStyleDeclaration;
    }
    if (classes?.contains('toolbar-legend')) {
      return {
        ...style,
        paddingLeft: px(layout.lanePadding),
        paddingRight: px(layout.lanePadding),
        marginLeft: px(layout.laneMargin),
        marginRight: px(layout.laneMargin),
      } as CSSStyleDeclaration;
    }
    return style;
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
  Object.assign(layout, LAYOUT_DEFAULTS);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

//-----------------------------------------------------------------------------
// THE CHIPS
//-----------------------------------------------------------------------------

describe('the calendar legend', () => {
  it('draws nothing of its own while it is switched off', async () => {
    const card = await mount({
      title: 'Family',
      toolbar: { show: true, add_event: false, legend: false },
    });

    expect(root(card).querySelector('.toolbar-legend')).toBeNull();
    expect(legendButton(card)).toBeNull();
    expect(root(card).querySelector('.legend-menu')).toBeNull();
    expect(root(card).querySelector('.header-container')!.className).toBe(
      'header-container has-toolbar',
    );
  });

  it('draws one chip per calendar after the month, in the order first named', async () => {
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

    // Nothing else in the toolbar, so no action row: the heading row alone, the title in it
    // over the month.
    expect(header.className).toBe('header-container has-toolbar');
    expect(childClasses(header)).toEqual(['card-toolbar toolbar-heading chips-shown']);
    expect(childClasses(headingRow(card))).toEqual([
      'toolbar-identity',
      'toolbar-legend',
      'toolbar-heading-end',
    ]);
    expect(childClasses(root(card).querySelector('.toolbar-identity')!)).toEqual([
      'card-header',
      'toolbar-month',
    ]);
    // Without the date navigation the end group is there, and empty.
    expect(childClasses(root(card).querySelector('.toolbar-heading-end')!)).toEqual([]);
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

  it('sits between the month and the arrows, which keep the row end, and marks the row while it does', async () => {
    const toolbar: Types.ToolbarConfig = {
      show: true,
      navigation: true,
      add_event: true,
      view_switcher: false,
      reset: false,
    };
    /** The heading row's children, with the end group's own children after it. */
    const headingLayout = (card: CardUnderTest) => [
      ...childClasses(headingRow(card)),
      childClasses(root(card).querySelector('.toolbar-heading > .toolbar-heading-end')!),
    ];
    const withChips = await mount({ title: 'Family', toolbar: { ...toolbar, legend: 'chips' } });

    expect(childClasses(root(withChips).querySelector('.header-container')!)).toEqual([
      'card-toolbar toolbar-actions',
      'card-toolbar toolbar-heading chips-shown',
    ]);
    expect(headingLayout(withChips)).toEqual([
      'toolbar-identity',
      'toolbar-legend',
      'toolbar-heading-end',
      ['date-navigation'],
    ]);
    expect(controls(withChips, '.toolbar-start')).toEqual(['toolbar-button add-event-button']);

    // The same card offering a menu: the button leads the action row, before add, and the
    // heading row is the month and the arrows at its end alone, unmarked.
    document.body.innerHTML = '';
    const withMenu = await mount({ title: 'Family', toolbar: { ...toolbar, legend: 'menu' } });

    expect(headingRow(withMenu).className).toBe('card-toolbar toolbar-heading');
    expect(headingLayout(withMenu)).toEqual([
      'toolbar-identity',
      'toolbar-heading-end',
      ['date-navigation'],
    ]);
    expect(controls(withMenu, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
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

  it('keeps a press on a chip, or beside one, from becoming a press on the card', async () => {
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
// WHICH FORM
//-----------------------------------------------------------------------------

describe('the form the legend takes', () => {
  /** A layout with room for the chips several times over, at every width used below. */
  function roomyLayout(): void {
    stubLayout();
    Object.assign(layout, { card: 900, chips: 100 });
  }

  it("is the button and its menu under 'menu' at any width, never the chips", async () => {
    roomyLayout();
    // The control: under `chips` this layout draws the chips, and keeps them at every width.
    const chipped = await mount({ title: 'Family' });
    for (const width of [380, 2000]) {
      await measure(chipped, width);
      await nextFrame(chipped);
      expect(chips(chipped)).toHaveLength(3);
    }
    document.body.innerHTML = '';

    const card = await mount({ title: 'Family', toolbar: { ...LEGEND_ONLY, legend: 'menu' } });
    expect(legendForm(card)).toEqual(MENU_FORM);

    // Each width delivered as the browser does, with the frame the legend's own pass runs in.
    for (const width of [380, 900, 2000]) {
      await measure(card, width);
      await nextFrame(card);
      expect(legendForm(card)).toEqual(MENU_FORM);
    }
  });

  it.each<unknown>([true, 'chip', 'lane'])(
    'reads legend: %s as the menu, neither as chips nor as off',
    async (value) => {
      roomyLayout();
      const card = await mount({
        title: 'Family',
        toolbar: { ...LEGEND_ONLY, legend: value as Types.ToolbarConfig['legend'] },
      });
      await measure(card, 900);
      await nextFrame(card);

      expect(legendForm(card)).toEqual(MENU_FORM);
    },
  );
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
      toolbar: { ...LEGEND_ONLY, navigation: true },
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

  it('are shared at once by another card with the same configuration', async () => {
    // Two cards with one configuration share one remembered choice. Each takes up what the
    // other hides, so neither writes a stale set over the other's on its next press.
    const first = await mount();
    const second = await mount();

    await press(first, BEN);
    expect(chip(second, BEN).getAttribute('aria-pressed')).toBe('false');
    expect(titles(second)).not.toContain('Football');

    await press(second, ANNA);
    expect(readHiddenCalendars(configFingerprint(configFor()))).toEqual([BEN, ANNA]);
    expect(chip(first, ANNA).getAttribute('aria-pressed')).toBe('false');
  });

  it('are not taken up from a card with another configuration', async () => {
    const first = await mount();
    const other = await mount({ title: 'Family' });

    await press(first, BEN);

    expect(chip(other, BEN).getAttribute('aria-pressed')).toBe('true');
  });

  it('are not read for a card without the legend', async () => {
    const config = configFor({
      toolbar: { show: true, add_event: false, view_switcher: false, legend: false },
    });
    writeHiddenCalendars(configFingerprint(config), [BEN]);
    const card = await mount({}, { config });

    expect(titles(card)).toContain('Football');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toContain(BEN);
  });
});

//-----------------------------------------------------------------------------
// THE FOLD
//-----------------------------------------------------------------------------

describe('chips too wide for the heading row', () => {
  /** Chips, refresh and add, so the button has company at both ends of the action row. */
  const FOLDING: Types.ToolbarConfig = {
    show: true,
    legend: 'chips',
    refresh: true,
    navigation: false,
    reset: false,
    view_switcher: false,
  };

  /** Mount a card whose chips need 500px of the 360px its heading row leaves them, at 380px. */
  async function mountFolded(overrides: Partial<Types.Config> = {}): Promise<CardUnderTest> {
    stubLayout();
    Object.assign(layout, { card: 380, chips: 500 });
    return mount({ title: 'Family', toolbar: FOLDING, ...overrides });
  }

  it('fold into a button leading the action row, in the render after the measurement', async () => {
    const card = await mountFolded();
    const header = root(card).querySelector('.header-container')!;

    expect(root(card).querySelector('.toolbar-legend')).toBeNull();
    expect(chips(card)).toEqual([]);
    expect(header.className).toBe('header-container has-toolbar');
    expect(childClasses(header)).toEqual([
      'card-toolbar toolbar-actions',
      'card-toolbar toolbar-heading',
    ]);
    expect(controls(card, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
    ]);
    expect(controls(card, '.toolbar-end')).toEqual(['toolbar-button refresh-button']);
    expect(childClasses(headingRow(card))).toEqual(['toolbar-identity', 'toolbar-heading-end']);
    const button = legendButton(card)!;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('My calendars');
    expect(button.getAttribute('title')).toBe('My calendars');
    // A calendar with a funnel: it says what it filters, where a bare funnel did not.
    expect(button.querySelector('path')!.getAttribute('d')).toBe(mdiCalendarFilter);
  });

  /**
   * The width at which the switcher names its views in words beside the fullest action row: four
   * commands (the folded filter, add, reset and refresh), a gap within each of its two groups.
   */
  const ALL_LABELS =
    Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH +
    4 * Constants.UI.TOOLBAR_COMMAND_WIDTH +
    2 * Constants.UI.TOOLBAR_COMMAND_GAP;

  it.each([
    {
      // The month in full and the arrows leave the chips room for two thirds of them.
      reading: 'with room for some of the chips',
      probe: 20,
      chips: 1.5 * (ALL_LABELS - 20 - LAYOUT_DEFAULTS.navigation),
      heading: 'card-toolbar toolbar-heading',
    },
    {
      // Too narrow for every month in full beside the arrows, so the month is short.
      reading: 'with the month shortened',
      probe: ALL_LABELS,
      chips: ALL_LABELS / 2,
      heading: 'card-toolbar toolbar-heading short-month',
    },
  ])("give way to exactly the menu's layout $reading, never to a part of them", async (row) => {
    // Wide enough for the switcher's words, so the comparison covers them.
    stubLayout();
    Object.assign(layout, { card: ALL_LABELS, probe: row.probe, chips: row.chips });
    const mountWith = async (legend: Types.ToolbarConfig['legend']) => {
      const card = await mount({
        title: 'Family',
        toolbar: { show: true, reset: true, refresh: true, legend },
      });
      await measure(card, ALL_LABELS);
      await nextFrame(card);
      return card;
    };
    const folded = await mountWith('chips');
    const menu = await mountWith('menu');

    expect(chips(folded)).toEqual([]);
    expect(root(folded).querySelector('.toolbar-legend')).toBeNull();
    expect(headingRow(folded).classList.contains('chips-shown')).toBe(false);

    // What the comparison covers: the button leads the action row, before add; the views are
    // words; reset and refresh end it; the month is in the form this width gives it.
    expect(controls(menu, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
    ]);
    expect(controls(menu, '.toolbar-end')).toEqual([
      'toolbar-button reset-button',
      'toolbar-button refresh-button',
    ]);
    expect(legendButton(menu)!.getAttribute('title')).toBe('My calendars');
    expect(
      root(menu).querySelectorAll('.view-switcher-segment .toolbar-button-label'),
    ).toHaveLength(3);
    expect(headingRow(menu).className).toBe(row.heading);

    for (const selector of ['.toolbar-actions', '.toolbar-heading']) {
      expect(root(folded).querySelector(selector)!.outerHTML).toBe(
        root(menu).querySelector(selector)!.outerHTML,
      );
    }
  });

  it('measure their room from the month and the arrows, even once those overflow the row', async () => {
    // The longest month in full and the arrows already take more than the 380px card, so the
    // chips' own box is squeezed to nothing, and says nothing about how much wider the card
    // must be.
    stubLayout();
    Object.assign(layout, {
      card: 380,
      probe: 300,
      navigation: 104,
      chips: 300,
      gap: 8,
      rowPadding: 12,
      monthMargin: -4,
      lanePadding: 2,
      laneMargin: -4,
    });
    const card = await mount({ title: 'Family', toolbar: { ...LEGEND_ONLY, navigation: true } });

    expect(legendButton(card)).not.toBeNull();
    expect(chips(card)).toEqual([]);

    // The row, less its padding on both sides, the month in full pulled back by its margin,
    // the arrows and a gap either side of the chips, less the chips' padding on both sides,
    // which their negative margins give back: negative while the month and arrows overflow.
    const room = 380 - 2 * 12 - (300 - 4) - 104 - 2 * 8 - 2 * 2 + 2 * 4;
    expect(room).toBeLessThan(0);
    const unfoldAt = Math.ceil(380 + 300 - room) + Constants.UI.LEGEND_UNFOLD_MARGIN;

    await measure(card, unfoldAt - 1);
    await nextFrame(card);
    expect(legendButton(card)).not.toBeNull();

    await measure(card, unfoldAt);
    await nextFrame(card);
    expect(legendButton(card)).toBeNull();
    expect(chips(card)).toHaveLength(3);
  });

  it('conclude nothing from a card that is not laid out', async () => {
    stubLayout();
    const card = await mount({ title: 'Family', toolbar: FOLDING });

    expect(root(card).querySelector('.toolbar-legend')).not.toBeNull();
    expect(legendButton(card)).toBeNull();
  });

  it('are drawn again a frame after the card is wide enough for them, and not before', async () => {
    // Folded at 380px with 140px missing, so the chips fit from 520px; the margin makes it
    // 522px, so a card resting on the boundary is not judged to fit and then not.
    const card = await mountFolded();
    const unfoldAt = 380 + (500 - 360) + Constants.UI.LEGEND_UNFOLD_MARGIN;

    await measure(card, unfoldAt - 1);
    await nextFrame(card);
    expect(legendButton(card)).not.toBeNull();

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

    await nextFrame(card);
    expect(legendButton(card)).toBeNull();
    expect(root(card).querySelector('.toolbar-legend')).not.toBeNull();
  });

  it('fold again from a wider width when an unfold still does not fit', async () => {
    const card = await mountFolded();
    const unfoldAt = 380 + (500 - 360) + Constants.UI.LEGEND_UNFOLD_MARGIN;

    // Wide enough by the old reading, but a font has made the chips wider meanwhile.
    layout.chips = unfoldAt + 80;
    await measure(card, unfoldAt);
    await nextFrame(card);
    expect(legendButton(card)).not.toBeNull();

    // Not drawn again at the width that just failed, nor a little above it.
    await measure(card, unfoldAt + 50);
    await nextFrame(card);
    expect(legendButton(card)).not.toBeNull();
  });

  it('do not unfold again at a width where drawing the chips narrowed the card', async () => {
    // Drawing the chips makes the page tall enough for a 15px scrollbar, which narrows the
    // card under the chips it just drew. They fold, the scrollbar goes, the card is as wide as
    // before, and without this they would unfold again, every other frame, for good.
    const card = await mountFolded();
    const unfoldAt = 380 + (500 - 360) + Constants.UI.LEGEND_UNFOLD_MARGIN;
    const frames = async () => {
      for (let frame = 0; frame < 6; frame += 1) await nextFrame(card);
    };
    layout.scrollbar = 15;

    // Wide enough for the chips without the scrollbar, and not with it.
    await measure(card, unfoldAt);
    await frames();
    expect(legendButton(card)).not.toBeNull();

    // Wide enough with it: drawn, and they stay.
    await measure(card, unfoldAt + 18);
    await frames();
    expect(legendButton(card)).toBeNull();
    expect(root(card).querySelector('.toolbar-legend')).not.toBeNull();
  });

  it('name a chip whose name is cut short in a tooltip, and no other', async () => {
    stubLayout();
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.textContent?.trim() === 'Ben' ? 300 : 0;
    });
    const card = await mount({ title: 'Family' });

    expect(chip(card, BEN).getAttribute('title')).toBe('Ben');
    expect(chip(card, ANNA).hasAttribute('title')).toBe(false);
  });

  it('fold on a card narrowed below them a frame after the resize', async () => {
    stubLayout();
    Object.assign(layout, { card: 900, chips: 500 });
    const card = await mount({ title: 'Family', toolbar: FOLDING });
    expect(legendButton(card)).toBeNull();

    // The first width the card hears of re-renders the toolbar at once.
    layout.card = 380;
    RecordingResizeObserver.instances
      .find(({ observed }) => observed.includes(card))!
      .callback([{ contentRect: { width: 380 } }]);
    await settle(card);
    // Not inside the browser's delivery of the resize: that render leaves the chips as they are.
    expect(legendButton(card)).toBeNull();

    await nextFrame(card);
    expect(legendButton(card)).not.toBeNull();
  });

  it('are measured again when a calendar is renamed', async () => {
    const card = await mountFolded();

    layout.chips = 300;
    card.hass = hass({ [ANNA]: 'Anna', [BEN]: 'Benjamin' });
    await settle(card);

    expect(legendButton(card)).toBeNull();
    expect(chip(card, BEN).textContent!.trim()).toBe('Benjamin');
  });

  it('leave a button that carries a mark while a calendar is hidden', async () => {
    writeHiddenCalendars(configFingerprint(configFor({ title: 'Family', toolbar: FOLDING })), [
      BEN,
    ]);
    const card = await mountFolded();

    expect(legendButton(card)!.classList).toContain('filtered');
  });

  it('leave a button that stays an icon however wide the card, named by its tooltip', async () => {
    const card = await mountFolded();
    // Keep the fold while the card grows: the chips are wider than any card here.
    layout.chips = 5000;

    for (const width of [400, 2000]) {
      await measure(card, width);
      expect(legendButton(card)!.querySelector('.toolbar-button-label'), `${width}px`).toBeNull();
      expect(legendButton(card)!.getAttribute('aria-label')).toBe('My calendars');
      expect(legendButton(card)!.getAttribute('title')).toBe('My calendars');
    }
  });
});

//-----------------------------------------------------------------------------
// THE MENU
//-----------------------------------------------------------------------------

describe("the menu the legend's button opens", () => {
  const MENU: Types.ToolbarConfig = { ...LEGEND_ONLY, legend: 'menu' };

  async function mountMenu(overrides: Partial<Types.Config> = {}): Promise<CardUnderTest> {
    return mount({ title: 'Family', toolbar: MENU, ...overrides });
  }

  const button = (card: CardUnderTest) => legendButton(card)!;
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

  /** Report the button and the menu at fixed places, as a browser would lay them out. */
  function placeButtonAndMenu(card: CardUnderTest): void {
    // Own properties, since happy-dom lays nothing out.
    Object.defineProperty(button(card), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 300, top: 50, right: 336, bottom: 86, width: 36, height: 36 }),
    });
    Object.defineProperty(dialog(card), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 200, bottom: 150, width: 200, height: 150 }),
    });
  }

  it('opens as a modal list of every calendar, each a checkbox', async () => {
    const card = await mountMenu();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    await open(card);

    // Modal, because that is what reaches the top layer past the card's clipping.
    expect(showModal).toHaveBeenCalledTimes(1);
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
    const card = await mountMenu();
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

  it("is placed beside its button, its left edge on the button's", async () => {
    const card = await mountMenu();
    placeButtonAndMenu(card);

    await open(card);

    expect([dialog(card).style.left, dialog(card).style.top]).toEqual(['300px', '90px']);
  });

  it("puts its right edge on the button's in a card read right to left", async () => {
    const card = await mountMenu();
    placeButtonAndMenu(card);
    const realStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = realStyle(element, pseudo);
      return element === button(card)
        ? ({ ...style, direction: 'rtl' } as CSSStyleDeclaration)
        : style;
    });

    await open(card);

    // The button ends at 336px, so the 200px menu starts at 136px.
    expect([dialog(card).style.left, dialog(card).style.top]).toEqual(['136px', '90px']);
  });

  it('keeps where a long list was scrolled to when the card updates under it', async () => {
    const card = await mountMenu();
    await open(card);
    let scrolled = 120;
    Object.defineProperty(dialog(card), 'scrollTop', {
      configurable: true,
      get: () => scrolled,
      set: (value: number) => {
        scrolled = value;
      },
    });
    // A real menu measured with its height cleared has nothing to scroll, and is back at its
    // top by the time it is measured.
    Object.defineProperty(dialog(card), 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        scrolled = 0;
        return { left: 0, top: 0, right: 200, bottom: 600, width: 200, height: 600 };
      },
    });

    card.hass = hass();
    await settle(card);

    expect(scrolled).toBe(120);
  });

  it('closes when the card changes width under it', async () => {
    const card = await mountMenu();
    await measure(card, 380);
    await open(card);

    await measure(card, 381);

    expect(dialog(card).open).toBe(false);
  });

  it('stays open through an update that has nothing to do with it', async () => {
    const card = await mountMenu();
    await open(card);
    const node = dialog(card);

    card.hass = hass();
    await settle(card);

    expect(dialog(card)).toBe(node);
    expect(node.open).toBe(true);
  });

  it('closes on Escape and hands focus back to its button', async () => {
    const card = await mountMenu();
    await open(card);

    dialog(card).dispatchEvent(new Event('cancel'));
    dialog(card).close();
    await settle(card);

    expect(dialog(card).open).toBe(false);
    expect(button(card).getAttribute('aria-expanded')).toBe('false');
    expect(root(card).activeElement).toBe(button(card));
  });

  it('closes on a press outside it, and not on one on its own padding', async () => {
    const card = await mountMenu();
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
    const card = await mountMenu();
    await open(card);
    await open(card);

    expect(dialog(card).open).toBe(false);
    expect(button(card).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a scroll of the page, and not on one inside it', async () => {
    const card = await mountMenu();
    await open(card);

    dialog(card).dispatchEvent(new Event('scroll', { composed: true }));
    expect(dialog(card).open).toBe(true);

    window.dispatchEvent(new Event('scroll'));
    await settle(card);
    expect(dialog(card).open).toBe(false);
  });

  it('closes when editing starts, and opens on nothing while it lasts', async () => {
    const card = await mountMenu();
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
      configFingerprint(configFor({ title: 'Family', toolbar: MENU, hide_when_empty: true })),
      [BEN],
    );
    const card = await mountMenu({ hide_when_empty: true });
    expect(card.hidden).toBe(false);
    await open(card);

    row(card, BEN).click();
    await settle(card);

    expect(card.hidden).toBe(true);
    expect(dialog(card).open).toBe(false);
  });

  it('closes when the configuration takes the legend away, and when the card leaves the page', async () => {
    const card = await mountMenu();
    await open(card);
    const node = dialog(card);

    // The toolbar stays, with its default controls; only the legend goes.
    card.setConfig(configFor({ title: 'Family', toolbar: { show: true, legend: false } }));
    await settle(card);
    expect(node.open).toBe(false);

    card.setConfig(configFor({ title: 'Family', toolbar: MENU }));
    await settle(card);
    await open(card);
    const again = dialog(card);
    expect(again.open).toBe(true);

    card.remove();
    expect(again.open).toBe(false);
  });
});
