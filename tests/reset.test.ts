/**
 * The toolbar's reset button, on the real card.
 *
 * The toolbar defaults to hidden and reset to off, so every DOM gate built from default config
 * sees no reset button and would stay green if it did nothing; each case here turns it on.
 * What it undoes is owned elsewhere — paging in `date-navigation.test.ts`, the switcher in
 * `view-switcher.test.ts`, the legend in `legend.test.ts`, the stored choice in
 * `view-choice.test.ts` — so this file pins how the button joins them: when it is drawn and
 * where, when it is lit, that one press undoes each choice and all of them, what it forgets and
 * tells a twin card, and that editing leaves it inert and loses nothing.
 */

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

/** Every control reset can undo, and reset itself; add is left out unless a case wants it. */
const EVERYTHING = {
  show: true,
  navigation: true,
  view_switcher: true,
  legend: true,
  reset: true,
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

/** Whether the reset button is lit: drawn, and neither dimmed nor `aria-disabled`. */
function lit(card: CardUnderTest): boolean {
  const button = resetButton(card);
  if (!button) throw new Error('no reset button');
  const dimmed = button.classList.contains('unavailable');
  const disabled = button.getAttribute('aria-disabled') === 'true';
  if (dimmed !== disabled) throw new Error('dimmed and aria-disabled disagree');
  return !dimmed;
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
    const commandsOnly = { show: true, reset: true, refresh: true, view_switcher: false };
    const nothingToUndo = await mount({ toolbar: commandsOnly });
    expect(resetButton(nothingToUndo)).toBeNull();
    expect(root(nothingToUndo).querySelector('.refresh-button')).not.toBeNull();

    for (const [name, toolbar, extra] of [
      ['navigation', { ...commandsOnly, navigation: true }, {}],
      ['the view switcher', { ...commandsOnly, view_switcher: true }, {}],
      ['the legend', { ...commandsOnly, legend: true }, {}],
      ['an expand tap', commandsOnly, { tap_action: { action: 'expand' } }],
      ['an expand hold', commandsOnly, { hold_action: { action: 'expand' } }],
    ] as const) {
      document.body.innerHTML = '';
      const card = await mount({ toolbar, ...extra });
      expect(resetButton(card), name).not.toBeNull();
    }

    document.body.innerHTML = '';
    const hidden = await mount({ toolbar: { ...EVERYTHING, show: false } });
    expect(resetButton(hidden)).toBeNull();
  });

  it('sits between the view switcher and refresh, leading the commands', async () => {
    const card = await mount({ toolbar: { ...EVERYTHING, refresh: true, add_event: true } });

    expect(
      Array.from(root(card).querySelectorAll('.toolbar-trailing > *')).map((element) =>
        element.className.split(' ').slice(0, 2).join(' '),
      ),
    ).toEqual([
      'view-switcher',
      'toolbar-button reset-button',
      'toolbar-button refresh-button',
      'toolbar-button add-event-button',
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

  it('counts as one more command toward the width the labels need', async () => {
    const toolbar = {
      show: true,
      reset: true,
      refresh: true,
      view_switcher: false,
      add_event: false,
    };
    const card = await mount({ toolbar, ...EXPANDABLE });
    const labeledFrom =
      Constants.UI.TOOLBAR_LABEL_MIN_WIDTH + Constants.UI.TOOLBAR_EXTRA_LABEL_MIN_WIDTH;

    await measure(card, labeledFrom - 1);
    expect(resetButton(card)!.classList).toContain('icon-only');

    await measure(card, labeledFrom);
    expect(resetButton(card)!.classList).not.toContain('icon-only');
    expect(resetButton(card)!.textContent!.trim()).toBe('Reset');
    expect(resetButton(card)!.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps every control an icon where Home Assistant has no word for it', async () => {
    const toolbar = {
      show: true,
      reset: true,
      refresh: true,
      view_switcher: false,
      add_event: false,
    };
    const card = await mount(
      { toolbar, ...EXPANDABLE },
      { localize: (key) => (key === 'ui.common.reset' ? key : (STRINGS[key] ?? key)) },
    );

    await measure(card, 2000);
    expect(resetButton(card)!.classList).toContain('icon-only');
    expect(root(card).querySelector('.refresh-button')!.classList).toContain('icon-only');
  });

  it('keeps a press from becoming a press on the card', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    await pressNext(card);
    const fired: Event[] = [];
    card.addEventListener('hass-action', (ev) => fired.push(ev));

    resetButton(card)!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    resetButton(card)!.click();
    await settle(card);

    expect(fired).toEqual([]);
  });
});

//-----------------------------------------------------------------------------
// WHEN IT IS LIT, AND WHAT A PRESS UNDOES
//-----------------------------------------------------------------------------

describe('what reset undoes', () => {
  it('is dimmed while the card shows its configuration, and a press does nothing', async () => {
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

    await measure(card, 320);
    await pressReset(card);

    expect(card.requestedView).toBe('column');
    expect(drawnView(card)).toBe('list');
    expect(lit(card)).toBe(false);
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

  it('is drawn dimmed and does nothing while the card is edited, and loses nothing', async () => {
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
