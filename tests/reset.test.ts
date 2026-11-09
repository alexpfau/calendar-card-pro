/**
 * The toolbar's reset button, on the real card.
 *
 * The toolbar defaults to hidden, so every DOM gate built from default config sees no reset
 * button and would stay green if it did nothing; each case here shows the toolbar. What it
 * undoes is owned elsewhere — paging in `date-navigation.test.ts`, the switcher in
 * `view-switcher.test.ts`, the legend in `legend.test.ts`, the stored choice in
 * `view-choice.test.ts` — so this file pins how the button joins them: when it is drawn and
 * where, when it is lit, that one press undoes each choice and all of them, what it forgets and
 * tells a twin card, and that editing leaves it inert and loses nothing.
 */

import { mdiCheck, mdiRefresh, mdiUndoVariant } from '@mdi/js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
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
      uid: 'lunch',
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
  ],
};

/**
 * Every control reset can undo, and reset itself; add is left out unless a case wants it. The
 * legend is drawn as chips, which a card that is never laid out always shows, so a case can
 * press one.
 */
const EVERYTHING: Types.ToolbarConfig = {
  show: true,
  navigation: true,
  view_switcher: true,
  legend: 'chips',
  reset: true,
  add_event: false,
};

/** Reset and refresh, and nothing reset could undo: no navigation, switcher or legend. */
const COMMANDS_ONLY: Types.ToolbarConfig = {
  show: true,
  reset: true,
  refresh: true,
  navigation: false,
  view_switcher: false,
  legend: false,
  add_event: false,
};

const BASE: Partial<Types.Config> = {
  entities: [ANNA, BEN],
  days_to_show: 3,
  toolbar: EVERYTHING,
};

/** A compact list that a tap expands. */
const EXPANDABLE: Partial<Types.Config> = {
  compact_events_to_show: 1,
  tap_action: { action: 'expand' },
};

const STRINGS: Record<string, string> = {
  'ui.common.reset': 'Reset',
  'ui.common.refresh': 'Refresh',
  'ui.common.previous': 'Previous',
  'ui.common.next': 'Next',
  'ui.components.calendar.my_calendars': 'My calendars',
  'ui.components.calendar.event.add': 'Add event',
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  isExpanded: boolean;
  toggleExpanded(): void;
  readonly requestedView: Types.EffectiveView;
  readonly effectiveView: Types.EffectiveView;
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

function calendarOf(path: string): string {
  return path.split('?')[0].replace('calendars/', '');
}

function hass(localize: (key: string) => string = (key) => STRINGS[key] ?? key) {
  return {
    states: Object.fromEntries(
      [
        [ANNA, 'Anna'],
        [BEN, 'Ben'],
      ].map(([id, name]) => [
        id,
        {
          entity_id: id,
          state: 'off',
          attributes: { supported_features: 7, friendly_name: name },
        },
      ]),
    ),
    locale: { language: 'en' },
    callApi,
    localize,
  };
}

function configFor(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ ...BASE, ...overrides });
}

/** Let the load, and the renders after it, finish. */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config> = {},
  options: { flag?: 'preview' | 'editMode'; localize?: (key: string) => string } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(configFor(overrides));
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize);
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
  observer.callback([{ contentRect: { width } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

function resetButton(card: CardUnderTest): HTMLButtonElement | null {
  return root(card).querySelector<HTMLButtonElement>('.reset-button');
}

/**
 * Whether the reset button is lit: drawn, and neither hidden (`.unavailable`), showing the check
 * after a press (`.reset-done`), nor `aria-disabled`. Both of the first two do nothing on a press,
 * so either must agree with `aria-disabled`.
 */
function lit(card: CardUnderTest): boolean {
  const button = resetButton(card);
  if (!button) throw new Error('no reset button');
  const off = button.classList.contains('unavailable') || button.classList.contains('reset-done');
  const disabled = button.getAttribute('aria-disabled') === 'true';
  if (off !== disabled) throw new Error('hidden or confirming and aria-disabled disagree');
  return !off;
}

/**
 * A whole press by a mouse, down and up, as the card's gesture reads it: a tap runs the card's
 * `tap_action` only at pointer-up, so a press that stops short of it proves nothing.
 */
function tapWithPointer(target: EventTarget): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      isPrimary: { value: true },
      pointerType: { value: 'mouse' },
      clientX: { value: 0 },
      clientY: { value: 0 },
    });
    target.dispatchEvent(event);
  }
}

async function pressReset(card: CardUnderTest): Promise<void> {
  resetButton(card)!.click();
  await settle(card);
}

async function pressNext(card: CardUnderTest): Promise<void> {
  root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
  await settle(card);
}

async function pressView(card: CardUnderTest, view: Types.EffectiveView): Promise<void> {
  root(card)
    .querySelector<HTMLButtonElement>(`.view-switcher-segment[data-view="${view}"]`)!
    .click();
  await settle(card);
}

async function pressChip(card: CardUnderTest, id: string): Promise<void> {
  root(card).querySelector<HTMLButtonElement>(`.legend-chip[data-calendar="${id}"]`)!.click();
  await settle(card);
}

async function expand(card: CardUnderTest): Promise<void> {
  card.toggleExpanded();
  await settle(card);
}

function range(card: CardUnderTest): string {
  return root(card).querySelector('.toolbar-range-text')!.textContent!.trim();
}

function drawnView(card: CardUnderTest): string {
  const classes = root(card).querySelector('ha-card')!.classList;
  if (classes.contains('grid-view')) return 'grid';
  if (classes.contains('column-view')) return 'column';
  return 'list';
}

function titles(card: CardUnderTest): string[] {
  return Array.from(root(card).querySelectorAll('.content-container .event-title')).map((title) =>
    title.textContent!.trim(),
  );
}

/**
 * Every write and removal of the remembered-choice entry, from now on. Spied on the instance:
 * happy-dom's `localStorage` does not reach a spy on `Storage.prototype`.
 */
function watchChoiceWrites(): () => string[] {
  const set = vi.spyOn(localStorage, 'setItem');
  const remove = vi.spyOn(localStorage, 'removeItem');
  return () => [
    ...set.mock.calls.filter(([key]) => key === VIEW_CHOICE_STORAGE_KEY).map(() => 'set'),
    ...remove.mock.calls.filter(([key]) => key === VIEW_CHOICE_STORAGE_KEY).map(() => 'remove'),
  ];
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  callApi.mockImplementation(async (_method: string, path: string) => HELD[calendarOf(path)] ?? []);
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

//-----------------------------------------------------------------------------
// THE BUTTON
//-----------------------------------------------------------------------------

describe('the reset button', () => {
  it('draws nothing of its own until asked for', async () => {
    const card = await mount({ toolbar: { ...EVERYTHING, reset: false } });

    expect(resetButton(card)).toBeNull();
    expect(root(card).querySelector('.date-navigation')).not.toBeNull();
  });

  it('is drawn only on a card with something it could undo', async () => {
    const nothingToUndo = await mount({ toolbar: COMMANDS_ONLY });
    expect(resetButton(nothingToUndo)).toBeNull();
    expect(root(nothingToUndo).querySelector('.refresh-button')).not.toBeNull();

    const reasons: Array<[string, Types.ToolbarConfig, Partial<Types.Config>]> = [
      ['navigation', { ...COMMANDS_ONLY, navigation: true }, {}],
      ['the view switcher', { ...COMMANDS_ONLY, view_switcher: true }, {}],
      ['the legend', { ...COMMANDS_ONLY, legend: 'menu' }, {}],
      ['an expand tap', COMMANDS_ONLY, { tap_action: { action: 'expand' } }],
      ['an expand hold', COMMANDS_ONLY, { hold_action: { action: 'expand' } }],
    ];
    for (const [name, toolbar, extra] of reasons) {
      document.body.innerHTML = '';
      const card = await mount({ toolbar, ...extra });
      expect(resetButton(card), name).not.toBeNull();
    }

    document.body.innerHTML = '';
    const hidden = await mount({ toolbar: { ...EVERYTHING, show: false } });
    expect(resetButton(hidden)).toBeNull();
  });

  it('is drawn for the legend in either form, without navigation or the switcher', async () => {
    for (const legend of ['menu', 'chips'] as const) {
      document.body.innerHTML = '';
      const card = await mount({ toolbar: { ...COMMANDS_ONLY, legend } });
      expect(resetButton(card), legend).not.toBeNull();
      expect(root(card).querySelector('.date-navigation'), legend).toBeNull();
      expect(root(card).querySelector('.view-switcher'), legend).toBeNull();
    }

    document.body.innerHTML = '';
    const noLegend = await mount({ toolbar: COMMANDS_ONLY });
    expect(resetButton(noLegend)).toBeNull();
  });

  it('is not drawn for a legend that lists no calendar', async () => {
    // Every calendar left out of the filter leaves the legend nothing to hide, so the card has
    // nothing for a reset to undo, exactly as with `legend: false` above.
    const allOut = await mount({
      toolbar: { ...COMMANDS_ONLY, legend: 'chips' },
      entities: [
        { entity: ANNA, show_in_legend: false },
        { entity: BEN, show_in_legend: false },
      ],
    });
    expect(resetButton(allOut)).toBeNull();

    // The control: one calendar still listed is a legend, and a reason to reset.
    document.body.innerHTML = '';
    const oneListed = await mount({
      toolbar: { ...COMMANDS_ONLY, legend: 'chips' },
      entities: [{ entity: ANNA, show_in_legend: false }, BEN],
    });
    expect(resetButton(oneListed)).not.toBeNull();
  });

  it('leads the end of the action row, with refresh after it and search last', async () => {
    const card = await mount({
      toolbar: { ...EVERYTHING, legend: 'menu', refresh: true, add_event: true },
    });
    const row = root(card).querySelector('.toolbar-actions')!;
    const kinds = (parent: Element) =>
      Array.from(parent.children).map((element) =>
        element.className.split(' ').slice(0, 2).join(' '),
      );

    expect(kinds(row)).toEqual(['toolbar-start', 'view-switcher', 'toolbar-end']);
    expect(kinds(row.querySelector('.toolbar-start')!)).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
    ]);
    // Side by side, reset first, spaced as the filter and add at the start are.
    expect(kinds(row.querySelector('.toolbar-end')!)).toEqual([
      'toolbar-button reset-button',
      'toolbar-button refresh-button',
      'toolbar-button search-button',
    ]);
    expect(resetButton(card)!.nextElementSibling).toBe(root(card).querySelector('.refresh-button'));
    const buttons = row.querySelectorAll('button');
    expect(buttons[buttons.length - 1].classList).toContain('search-button');

    // Without reset, refresh leads the end, and nothing comes before it to widen.
    document.body.innerHTML = '';
    const noReset = await mount({ toolbar: { ...EVERYTHING, reset: false, refresh: true } });
    expect(kinds(root(noReset).querySelector('.toolbar-end')!)).toEqual([
      'toolbar-button refresh-button',
      'toolbar-button search-button',
    ]);
  });

  it("is named by Home Assistant's own word, or in English for assistive technology", async () => {
    const named = await mount();
    expect(resetButton(named)!.getAttribute('aria-label')).toBe('Reset');
    expect(resetButton(named)!.getAttribute('title')).toBe('Reset');

    document.body.innerHTML = '';
    const unnamed = await mount({}, { localize: (key) => key });
    expect(resetButton(unnamed)!.getAttribute('aria-label')).toBe('Reset');
    expect(resetButton(unnamed)!.hasAttribute('title')).toBe(false);
  });

  it('stays an icon however wide the card, named by its tooltip', async () => {
    const card = await mount({ toolbar: COMMANDS_ONLY, ...EXPANDABLE });

    for (const width of [300, 2000]) {
      await measure(card, width);
      expect(resetButton(card)!.querySelector('.toolbar-button-label'), `${width}px`).toBeNull();
      expect(resetButton(card)!.textContent!.trim()).toBe('');
      expect(resetButton(card)!.getAttribute('aria-label')).toBe('Reset');
      expect(resetButton(card)!.getAttribute('title')).toBe('Reset');
    }
  });

  it("draws a U-turn, so it never reads as refresh's arrow turned round", async () => {
    const card = await mount({ toolbar: { ...EVERYTHING, refresh: true } });
    const iconOf = (selector: string) =>
      root(card).querySelector(`${selector} path`)!.getAttribute('d');

    expect(iconOf('.reset-button')).toBe(mdiUndoVariant);
    expect(iconOf('.refresh-button')).toBe(mdiRefresh);
  });

  it('is drawn dimmed rather than hidden where it is alone in its row', async () => {
    // Hidden, it would leave the row an empty strip over the month while there is nothing to
    // undo, which is most of the time.
    const lone: Types.ToolbarConfig = {
      show: true,
      reset: true,
      navigation: true,
      view_switcher: false,
      legend: false,
      add_event: false,
      refresh: false,
      search: false,
    };
    const classes = (of: CardUnderTest) => Array.from(resetButton(of)!.classList);
    const icon = (of: CardUnderTest) => resetButton(of)!.querySelector('path')!.getAttribute('d');
    const card = await mount({ toolbar: lone });
    const actions = root(card).querySelector('.toolbar-actions')!;
    expect(actions.querySelectorAll('button')).toHaveLength(1);
    expect(classes(card)).toEqual(expect.arrayContaining(['alone', 'unavailable']));
    expect(lit(card)).toBe(false);

    // Lit, then confirming, it is the same button as anywhere else.
    await pressNext(card);
    expect(lit(card)).toBe(true);
    await pressReset(card);
    expect(icon(card)).toBe(mdiCheck);

    // Any other control in the row, and it hides again as usual.
    document.body.innerHTML = '';
    const withRefresh = await mount({ toolbar: { ...lone, refresh: true } });
    expect(classes(withRefresh)).not.toContain('alone');
  });

  it('keeps a press from becoming a press on the card, as refresh beside it does', async () => {
    const card = await mount({
      tap_action: { action: 'more-info' },
      toolbar: { ...EVERYTHING, refresh: true },
    });
    await pressNext(card);
    const fired: Event[] = [];
    card.addEventListener('hass-action', (ev) => fired.push(ev));

    tapWithPointer(resetButton(card)!);
    resetButton(card)!.click();
    await settle(card);
    const refresh = root(card).querySelector<HTMLButtonElement>('.refresh-button')!;
    tapWithPointer(refresh);
    refresh.click();
    await settle(card);
    expect(fired).toEqual([]);

    // The control: the same press on the days is the card's.
    tapWithPointer(root(card).querySelector('.content-container')!);
    expect(fired).toHaveLength(1);
  });
});

//-----------------------------------------------------------------------------
// THE CHECK A PRESS SHOWS
//-----------------------------------------------------------------------------

describe('the check a press on reset shows', () => {
  const icon = (card: CardUnderTest) => resetButton(card)!.querySelector('path')!.getAttribute('d');
  const classes = (card: CardUnderTest) => Array.from(resetButton(card)!.classList);

  it('shows a check for a moment after a press that did its work, then hides', async () => {
    const card = await mount();
    await pressNext(card);
    await pressReset(card);

    // The check, as refresh shows one, and no press does anything meanwhile.
    expect(classes(card)).toContain('reset-done');
    expect(classes(card)).not.toContain('unavailable');
    expect(icon(card)).toBe(mdiCheck);
    expect(lit(card)).toBe(false);

    vi.advanceTimersByTime(Constants.TIMING.RESET_CONFIRMATION - 1);
    await settle(card);
    expect(classes(card)).toContain('reset-done');
    expect(classes(card)).not.toContain('unavailable');

    // Then it fades out still showing the check, so the U-turn never shows on the way out.
    vi.advanceTimersByTime(1);
    await settle(card);
    expect(classes(card)).toContain('reset-done');
    expect(classes(card)).toContain('unavailable');
    expect(icon(card)).toBe(mdiCheck);
    expect(lit(card)).toBe(false);

    vi.advanceTimersByTime(Constants.TIMING.RESET_FADE - 1);
    await settle(card);
    expect(icon(card)).toBe(mdiCheck);

    // Hidden by then, it takes the U-turn back for the next time it appears.
    vi.advanceTimersByTime(1);
    await settle(card);
    expect(classes(card)).not.toContain('reset-done');
    expect(classes(card)).toContain('unavailable');
    expect(icon(card)).toBe(mdiUndoVariant);
  });

  it('gives way at once to a change made while it fades out', async () => {
    const card = await mount();
    await pressNext(card);
    await pressReset(card);
    vi.advanceTimersByTime(Constants.TIMING.RESET_CONFIRMATION);
    await settle(card);
    expect(classes(card)).toEqual(expect.arrayContaining(['reset-done', 'unavailable']));

    await pressNext(card);
    expect(lit(card)).toBe(true);
    expect(icon(card)).toBe(mdiUndoVariant);
    expect(classes(card)).not.toContain('reset-done');
  });

  it('shows no check for a press with nothing to undo', async () => {
    const card = await mount();
    await pressReset(card);

    expect(classes(card)).toContain('unavailable');
    expect(classes(card)).not.toContain('reset-done');
    expect(icon(card)).toBe(mdiUndoVariant);
  });

  it('gives way at once to a change made while it shows', async () => {
    const card = await mount();
    await pressNext(card);
    await pressReset(card);
    expect(classes(card)).toContain('reset-done');

    await pressNext(card);
    expect(lit(card)).toBe(true);
    expect(icon(card)).toBe(mdiUndoVariant);
    expect(classes(card)).not.toContain('reset-done');
  });

  it('ends with the card leaving the page, so a card put back is never stuck on it', async () => {
    const card = await mount();
    await pressNext(card);
    await pressReset(card);
    expect(classes(card)).toContain('reset-done');

    card.remove();
    document.body.appendChild(card);
    await settle(card);
    expect(classes(card)).toContain('unavailable');
    expect(classes(card)).not.toContain('reset-done');
  });
});

//-----------------------------------------------------------------------------
// WHEN IT IS LIT, AND WHAT A PRESS UNDOES
//-----------------------------------------------------------------------------

describe('what reset undoes', () => {
  it('is hidden while the card shows its configuration, and a press does nothing', async () => {
    const card = await mount(EXPANDABLE);
    const requests = callApi.mock.calls.length;
    const writes = watchChoiceWrites();

    expect(lit(card)).toBe(false);
    await pressReset(card);

    expect(writes()).toEqual([]);
    expect(callApi.mock.calls.length).toBe(requests);
    expect(lit(card)).toBe(false);
  });

  it('goes back to the days the card opens with', async () => {
    const card = await mount();
    const home = range(card);

    await pressNext(card);
    expect(range(card)).not.toBe(home);
    expect(lit(card)).toBe(true);

    await pressReset(card);
    expect(range(card)).toBe(home);
    expect(lit(card)).toBe(false);
  });

  it('goes back to the configured view, and forgets the one this device picked', async () => {
    const card = await mount();
    const fingerprint = configFingerprint(configFor());

    await pressView(card, 'grid');
    expect(drawnView(card)).toBe('grid');
    expect(readViewChoice(fingerprint)).toBe('grid');
    expect(lit(card)).toBe(true);

    await pressReset(card);
    expect(drawnView(card)).toBe('list');
    expect(card.requestedView).toBe('list');
    expect(readViewChoice(fingerprint)).toBeUndefined();
    expect(lit(card)).toBe(false);
  });

  it('shows every calendar again, and forgets the ones this device hid', async () => {
    const card = await mount();
    const fingerprint = configFingerprint(configFor());

    await pressChip(card, BEN);
    expect(titles(card)).not.toContain('Football');
    expect(lit(card)).toBe(true);

    await pressReset(card);
    expect(titles(card)).toContain('Football');
    expect(readHiddenCalendars(fingerprint)).toEqual([]);
    expect(lit(card)).toBe(false);
  });

  it('collapses an expanded compact card', async () => {
    const card = await mount(EXPANDABLE);
    expect(titles(card)).toHaveLength(1);

    await expand(card);
    expect(titles(card)).toHaveLength(3);
    expect(lit(card)).toBe(true);

    await pressReset(card);
    expect(card.isExpanded).toBe(false);
    expect(titles(card)).toHaveLength(1);
    expect(lit(card)).toBe(false);
  });

  it('undoes every choice in one press, forgetting them in one write', async () => {
    const card = await mount(EXPANDABLE);
    const fingerprint = configFingerprint(configFor(EXPANDABLE));
    const home = range(card);

    await expand(card);
    await pressChip(card, BEN);
    await pressNext(card);
    await pressView(card, 'column');
    expect(lit(card)).toBe(true);

    const writes = watchChoiceWrites();
    await pressReset(card);

    expect(writes()).toEqual(['remove']);
    expect(readViewChoice(fingerprint)).toBeUndefined();
    expect(readHiddenCalendars(fingerprint)).toEqual([]);
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toBeNull();
    expect(drawnView(card)).toBe('list');
    expect(range(card)).toBe(home);
    expect(card.isExpanded).toBe(false);
    expect(titles(card)).toEqual(['Dentist']);
    expect(lit(card)).toBe(false);
  });

  it('keeps what this device chose for another configuration', async () => {
    const other = configFingerprint(configFor({ title: 'Family' }));
    writeViewChoice(other, 'grid');
    writeHiddenCalendars(other, [BEN]);
    const card = await mount();

    await pressView(card, 'grid');
    await pressReset(card);

    expect(readViewChoice(other)).toBe('grid');
    expect(readHiddenCalendars(other)).toEqual([BEN]);
  });

  it('lights up for an expansion only where the expansion shows, and clears it anyway', async () => {
    // Columns draw no compact limits, so a card expanded as a list and then switched keeps the
    // flag and draws nothing different. A lit button there would undo nothing visible.
    const card = await mount({ ...EXPANDABLE, view: 'column' });
    expect(drawnView(card)).toBe('column');
    await pressView(card, 'list');
    await expand(card);
    await pressView(card, 'column');

    expect(card.isExpanded).toBe(true);
    expect(drawnView(card)).toBe('column');
    expect(lit(card)).toBe(false);
    // Dimmed means inert: a press there leaves even the unseen flag alone.
    await pressReset(card);
    expect(card.isExpanded).toBe(true);

    await pressNext(card);
    expect(lit(card)).toBe(true);
    await pressReset(card);

    expect(card.isExpanded).toBe(false);
    expect(lit(card)).toBe(false);
  });

  it('falls back to the list for a configured view the card is too narrow for', async () => {
    const card = await mount({ view: 'column', days_to_show: 7 });
    await measure(card, 1400);
    expect(drawnView(card)).toBe('column');
    await pressView(card, 'list');
    expect(lit(card)).toBe(true);

    // Too narrow for columns, the configuration draws the list picked: nothing to undo shows.
    await measure(card, 320);
    expect(drawnView(card)).toBe('list');
    expect(lit(card)).toBe(false);

    await measure(card, 1400);
    expect(lit(card)).toBe(true);
    await pressReset(card);

    expect(card.requestedView).toBe('column');
    expect(drawnView(card)).toBe('column');
    expect(lit(card)).toBe(false);
  });

  /**
   * A layout picked with the switcher that the card is too narrow for falls back to the list.
   * Where the configuration draws the list as well, nothing on screen differs from it, and a lit
   * button would undo nothing visible, as for an expansion that does not show.
   */
  it('stays dark for a picked layout that falls back to the list the configuration draws', async () => {
    const card = await mount({ days_to_show: 7 });
    await measure(card, 1400);
    await pressView(card, 'column');
    expect(drawnView(card)).toBe('column');
    expect(lit(card)).toBe(true);

    await measure(card, 320);
    expect(drawnView(card)).toBe('list');
    expect(card.requestedView).toBe('column');
    expect(lit(card)).toBe(false);
    // Dark means inert: the pick stays for when the card is wide enough again.
    await pressReset(card);
    expect(card.requestedView).toBe('column');

    await measure(card, 1400);
    expect(drawnView(card)).toBe('column');
    expect(lit(card)).toBe(true);
  });

  it('lights up for a picked layout that falls back where the configuration draws another', async () => {
    // A grid still fits one day at this width, so the configuration draws it, not the list.
    const card = await mount({ view: 'grid', days_to_show: 7 });
    await measure(card, 1400);
    await pressView(card, 'column');
    await measure(card, 320);

    expect(drawnView(card)).toBe('list');
    expect(card.requestedView).toBe('column');
    expect(lit(card)).toBe(true);
  });

  /**
   * A seven-day grid on a 374px phone opens on two days; a third would sit narrower than
   * `min_day_width`. Reset once fitted the configured grid as though all seven days were on
   * screen, keeping the margin a layout on screen keeps, and drew three days the card never
   * opens with. It draws what a fresh load draws.
   */
  it('goes back to the days a fresh load draws on a narrow grid', async () => {
    const phone = 374;
    const grid: Partial<Types.Config> = {
      view: 'grid',
      days_to_show: 7,
      list: { days_to_show: 3 },
      time_grid: { start_time: '07:00', end_time: '22:00', hour_height: '36px' },
    };
    const dayHeaders = (card: CardUnderTest) => root(card).querySelectorAll('.grid-day-header');

    const fresh = await mount(grid);
    await measure(fresh, phone);
    expect(drawnView(fresh)).toBe('grid');
    expect(dayHeaders(fresh)).toHaveLength(2);
    fresh.remove();

    const card = await mount(grid);
    await measure(card, phone);
    await pressView(card, 'list');
    expect(drawnView(card)).toBe('list');
    expect(lit(card)).toBe(true);

    await pressReset(card);
    expect(drawnView(card)).toBe('grid');
    expect(dayHeaders(card)).toHaveLength(2);
    expect(lit(card)).toBe(false);

    await measure(card, phone);
    expect(dayHeaders(card)).toHaveLength(2);
  });
});

//-----------------------------------------------------------------------------
// TWO CARDS, AND EDITING
//-----------------------------------------------------------------------------

describe('reset beside other cards and while editing', () => {
  it('shows every calendar again on a twin card with the same configuration', async () => {
    const first = await mount();
    const twin = await mount();

    await pressChip(first, BEN);
    expect(titles(twin)).not.toContain('Football');
    expect(lit(twin)).toBe(true);

    await pressReset(first);
    await settle(twin);

    expect(titles(twin)).toContain('Football');
    expect(lit(twin)).toBe(false);
  });

  it('leaves a card with another configuration alone', async () => {
    const card = await mount();
    const other = await mount({ title: 'Family' });
    await pressChip(other, BEN);

    await pressNext(card);
    await pressReset(card);
    await settle(other);

    expect(titles(other)).not.toContain('Football');
    expect(lit(other)).toBe(true);
  });

  it('is drawn hidden and does nothing while the card is edited, and loses nothing', async () => {
    const fingerprint = configFingerprint(configFor());
    writeViewChoice(fingerprint, 'grid');
    writeHiddenCalendars(fingerprint, [BEN]);
    const card = await mount({}, { flag: 'editMode' });

    expect(drawnView(card)).toBe('list');
    expect(lit(card)).toBe(false);
    resetButton(card)!.click();
    await settle(card);
    expect(readViewChoice(fingerprint)).toBe('grid');
    expect(readHiddenCalendars(fingerprint)).toEqual([BEN]);

    card.editMode = false;
    await settle(card);

    expect(drawnView(card)).toBe('grid');
    expect(lit(card)).toBe(true);
  });
});

//-----------------------------------------------------------------------------
// THE RESET ACTION
//-----------------------------------------------------------------------------

describe('the reset card action', () => {
  /** Every control reset can undo, and no reset button. */
  const NO_BUTTON: Types.ToolbarConfig = { ...EVERYTHING, reset: false };

  const haCard = (card: CardUnderTest): HTMLElement =>
    root(card).querySelector<HTMLElement>('ha-card')!;

  /** A whole tap on the card's own space, which runs `tap_action`. */
  async function tapCard(card: CardUnderTest): Promise<void> {
    tapWithPointer(haCard(card));
    await settle(card);
  }

  it('undoes every choice from a tap, on a card without the reset button', async () => {
    const overrides = { toolbar: NO_BUTTON, tap_action: { action: 'reset' } };
    const card = await mount(overrides);
    const fingerprint = configFingerprint(configFor(overrides));
    const home = range(card);
    expect(resetButton(card)).toBeNull();

    await pressChip(card, BEN);
    await pressNext(card);
    await pressView(card, 'column');
    expect(drawnView(card)).toBe('column');
    // Remembered for this configuration, so the reads below can see them forgotten.
    expect(readViewChoice(fingerprint)).toBe('column');
    expect(readHiddenCalendars(fingerprint)).toEqual([BEN]);

    const writes = watchChoiceWrites();
    await tapCard(card);

    expect(writes()).toEqual(['remove']);
    expect(readViewChoice(fingerprint)).toBeUndefined();
    expect(readHiddenCalendars(fingerprint)).toEqual([]);
    expect(drawnView(card)).toBe('list');
    expect(range(card)).toBe(home);
    expect(titles(card)).toContain('Football');
  });

  it('runs from a hold as from a tap', async () => {
    const card = await mount({ toolbar: NO_BUTTON, hold_action: { action: 'reset' } });
    const home = range(card);

    await pressNext(card);
    expect(range(card)).not.toBe(home);

    (card as unknown as { handleAction(action: Types.ActionConfig): void }).handleAction(
      (card as unknown as { config: Types.Config }).config.hold_action!,
    );
    await settle(card);

    expect(range(card)).toBe(home);
  });

  it('collapses an expanded card whose only control is its expand action', async () => {
    // No toolbar at all: expand is then the one thing a reset could undo.
    const card = await mount({
      toolbar: { show: false },
      compact_events_to_show: 1,
      tap_action: { action: 'expand' },
      hold_action: { action: 'reset' },
    });
    await expand(card);
    expect(titles(card)).toHaveLength(3);

    (card as unknown as { handleAction(action: Types.ActionConfig): void }).handleAction(
      (card as unknown as { config: Types.Config }).config.hold_action!,
    );
    await settle(card);

    expect(card.isExpanded).toBe(false);
    expect(titles(card)).toHaveLength(1);
  });

  it('collapses an expansion its expand action was edited away from', async () => {
    // The configuration changes, the expansion stays: with no expand action left, only the
    // reset action can still undo it, so it must still run.
    const compact = { toolbar: { show: false }, compact_events_to_show: 1 };
    const card = await mount({ ...compact, tap_action: { action: 'expand' } });
    await expand(card);
    expect(titles(card)).toHaveLength(3);

    card.setConfig(configFor({ ...compact, tap_action: { action: 'reset' } }));
    await settle(card);
    expect(card.isExpanded).toBe(true);
    expect(root(card).querySelector('ha-card')!.getAttribute('role')).toBe('button');

    await tapCard(card);

    expect(card.isExpanded).toBe(false);
    expect(titles(card)).toHaveLength(1);
  });

  it('does nothing where the card shows its configuration: no write, no request, no check', async () => {
    const card = await mount({ tap_action: { action: 'reset' } });
    const requests = callApi.mock.calls.length;
    const writes = watchChoiceWrites();

    await tapCard(card);

    expect(writes()).toEqual([]);
    expect(callApi.mock.calls.length).toBe(requests);
    expect(resetButton(card)!.classList.contains('reset-done')).toBe(false);
  });

  it('leaves a picked layout alone while it falls back to the list the configuration draws', async () => {
    // The action follows the button: nothing on screen differs, so it keeps the pick for when
    // the card is wide enough for it again.
    const overrides = { toolbar: NO_BUTTON, tap_action: { action: 'reset' }, days_to_show: 7 };
    const card = await mount(overrides);
    const fingerprint = configFingerprint(configFor(overrides));
    await measure(card, 1400);
    await pressView(card, 'column');
    await measure(card, 320);
    expect(drawnView(card)).toBe('list');

    const writes = watchChoiceWrites();
    await tapCard(card);
    expect(writes()).toEqual([]);
    expect(readViewChoice(fingerprint)).toBe('column');
    expect(card.requestedView).toBe('column');

    await measure(card, 1400);
    expect(drawnView(card)).toBe('column');
    await tapCard(card);
    expect(readViewChoice(fingerprint)).toBeUndefined();
    expect(drawnView(card)).toBe('list');
  });

  it("shows the button's check where the card has the button", async () => {
    const card = await mount({ tap_action: { action: 'reset' } });
    await pressNext(card);
    expect(lit(card)).toBe(true);

    await tapCard(card);

    expect(resetButton(card)!.classList.contains('reset-done')).toBe(true);
  });

  it('is no action at all on a card with nothing a reset could undo', async () => {
    // No toolbar and no expand action: nothing could ever differ from the configuration, so the
    // card promises nothing, as `add-event` on a card that cannot add one does not.
    const card = await mount({ toolbar: { show: false }, tap_action: { action: 'reset' } });

    expect(haCard(card).hasAttribute('role')).toBe(false);
    expect(haCard(card).hasAttribute('tabindex')).toBe(false);

    // The control: the same card with an action that runs is a button with a tab stop.
    const control = await mount({ toolbar: { show: false }, tap_action: { action: 'refresh' } });
    expect(haCard(control).getAttribute('role')).toBe('button');
    expect(haCard(control).getAttribute('tabindex')).toBe('0');
  });

  it('is no action while the card is edited, and loses nothing', async () => {
    const overrides = { toolbar: NO_BUTTON, tap_action: { action: 'reset' } };
    const fingerprint = configFingerprint(configFor(overrides));
    writeViewChoice(fingerprint, 'grid');
    writeHiddenCalendars(fingerprint, [BEN]);
    const card = await mount(overrides, { flag: 'editMode' });

    await tapCard(card);
    expect(readViewChoice(fingerprint)).toBe('grid');
    expect(readHiddenCalendars(fingerprint)).toEqual([BEN]);

    card.editMode = false;
    await settle(card);
    expect(drawnView(card)).toBe('grid');
  });
});
