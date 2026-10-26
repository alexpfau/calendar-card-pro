/**
 * Refresh, on the real card: the toolbar's button and the `refresh` card action.
 *
 * Both load the events again through one guarded entry point, so the cases here pin what that
 * point promises from every way in: a fresh request even when the cached events are not due,
 * nothing while a load is under way, and the toolbar button inert while the card is edited.
 * Then what it shows, on the button or in the corner: at least one turn however fast the load,
 * a check or an alert for a moment, and every press ignored until it is over.
 * `interaction-actions.test.ts` pins that `handleAction` hands `refresh` to the card and never
 * to Home Assistant; this file pins what the card then does with it.
 */

import { mdiAlertCircleOutline, mdiCheck, mdiRefresh } from '@mdi/js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
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

const NOW = new Date(Date.UTC(2026, 5, 17, 10, 0));

/**
 * A bar holding the refresh button and nothing else: every other control is on by default once
 * the toolbar is shown, so each is turned off.
 */
const REFRESH_ONLY: Types.ToolbarConfig = {
  show: true,
  refresh: true,
  navigation: false,
  view_switcher: false,
  add_event: false,
  reset: false,
  legend: false,
};

const BASE: Partial<Types.Config> = {
  entities: ['calendar.anna', 'calendar.ben'],
  days_to_show: 3,
  toolbar: REFRESH_ONLY,
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  isLoading: boolean;
  handleAction(actionConfig: Types.ActionConfig): void;
  _handlePointerDown(ev: PointerEvent): void;
  _handlePointerUp(ev: PointerEvent): void;
  _handleKeyDown(ev: KeyboardEvent): void;
  readonly config: Types.Config;
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

/** Requests left unanswered, so a load can be held open; `release` answers them all. */
let held: Array<() => void> = [];

function answerAtOnce(): void {
  callApi.mockImplementation(async () => [
    {
      summary: 'Dentist',
      start: { dateTime: '2026-06-17T15:00:00.000Z' },
      end: { dateTime: '2026-06-17T16:00:00.000Z' },
    },
  ]);
}

function holdAnswers(): void {
  callApi.mockImplementation(
    () =>
      new Promise((resolve) => {
        held.push(() => resolve([]));
      }),
  );
}

function hass(localize: (key: string) => string = defaultLocalize): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
      'calendar.ben': { entity_id: 'calendar.ben', state: 'off', attributes: {} },
    },
    locale: { language: 'en' },
    callApi,
    localize,
  };
}

function defaultLocalize(key: string): string {
  return (
    {
      'ui.common.refresh': 'Refresh',
      'ui.common.reset': 'Reset',
      'ui.components.calendar.event.add': 'Add event',
    }[key] ?? key
  );
}

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
  card.setConfig(buildConfig({ ...BASE, ...overrides }));
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize);
  document.body.appendChild(card);
  await settle(card);
  return card;
}

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

function refreshButton(card: CardUnderTest): HTMLButtonElement | null {
  return root(card).querySelector<HTMLButtonElement>('.refresh-button');
}

/** The icon a refresh control draws, by its path. */
function iconOf(element: Element | null): string | null | undefined {
  return element?.querySelector('path')?.getAttribute('d');
}

/** The card's corner indicator, where the card draws one. */
function corner(card: CardUnderTest): HTMLElement | null {
  return root(card).querySelector<HTMLElement>('.loading-indicator');
}

/** Let time pass, and every render it causes land. */
async function advance(card: CardUnderTest, ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await settle(card);
}

/** Answer for one calendar and fail for the other. */
function failOneCalendar(): void {
  callApi.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('calendar.ben')) throw new Error('Ben is unreachable');
    return [];
  });
}

/** A minimal stand-in for a real PointerEvent, which happy-dom does not construct. */
function pointer(pointerId: number): PointerEvent {
  return { pointerId, clientX: 0, clientY: 0, button: 0 } as unknown as PointerEvent;
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  answerAtOnce();
  held = [];
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(async () => {
  // Requests are shared between cards asking for the same window, so one a test left open
  // would be joined by the next test's card, which would then never load.
  held.forEach((release) => release());
  await new Promise((resolve) => setImmediate(resolve));
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

describe('the refresh button', () => {
  it('draws nothing of its own until asked for', async () => {
    const card = await mount({ toolbar: { ...REFRESH_ONLY, refresh: false } });

    expect(refreshButton(card)).toBeNull();
    expect(root(card).querySelector('.card-toolbar')).toBeNull();
    expect(root(card).querySelector('.header-container')!.className).toBe('header-container');
  });

  it('sits last in the action row, at its end after reset', async () => {
    const card = await mount({
      entities: [{ entity: 'calendar.anna' }],
      toolbar: { show: true, refresh: true },
    });
    // Two views must fit for a switcher, and a writable calendar for add.
    card.hass = {
      ...hass(),
      states: {
        'calendar.anna': {
          entity_id: 'calendar.anna',
          state: 'off',
          attributes: { supported_features: 7 },
        },
      },
    };
    await settle(card);
    const row = root(card).querySelector('.toolbar-actions')!;
    const kinds = (parent: Element) =>
      Array.from(parent.children).map((element) =>
        element.className.split(' ').slice(0, 2).join(' '),
      );

    expect(kinds(row)).toEqual(['toolbar-start', 'view-switcher', 'toolbar-end']);
    expect(kinds(row.querySelector('.toolbar-end')!)).toEqual([
      'toolbar-button reset-button',
      'toolbar-button refresh-button',
    ]);
    const buttons = row.querySelectorAll('button');
    expect(buttons[buttons.length - 1]).toBe(refreshButton(card));
    // The start holds the filter and add, the heading row the month and the arrows.
    expect(kinds(row.querySelector('.toolbar-start')!)).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
    ]);
    expect(root(card).querySelector('.toolbar-heading .refresh-button')).toBeNull();
  });

  it("is named by Home Assistant's own word, or in English for assistive technology", async () => {
    const named = await mount();
    expect(refreshButton(named)!.getAttribute('aria-label')).toBe('Refresh');
    expect(refreshButton(named)!.getAttribute('title')).toBe('Refresh');

    document.body.innerHTML = '';
    const unnamed = await mount({}, { localize: (key) => key });
    expect(refreshButton(unnamed)!.getAttribute('aria-label')).toBe('Refresh');
    expect(refreshButton(unnamed)!.hasAttribute('title')).toBe(false);
  });

  it('stays an icon however wide the card, named by its tooltip', async () => {
    const card = await mount();

    for (const width of [300, 2000]) {
      await measure(card, width);
      expect(refreshButton(card)!.querySelector('.toolbar-button-label'), `${width}px`).toBeNull();
      expect(refreshButton(card)!.textContent!.trim()).toBe('');
      expect(refreshButton(card)!.getAttribute('title')).toBe('Refresh');
    }
  });

  it('asks again for every calendar, though the events it holds are not due', async () => {
    const card = await mount();
    const before = callApi.mock.calls.length;
    expect(before).toBe(2);

    refreshButton(card)!.click();
    await settle(card);

    expect(callApi.mock.calls.length).toBe(before + 2);
  });

  it('turns while the card loads, in place of the corner spinner, and ignores a press', async () => {
    const card = await mount();
    holdAnswers();

    refreshButton(card)!.click();
    await settle(card);
    const during = callApi.mock.calls.length;

    expect(card.isLoading).toBe(true);
    expect(refreshButton(card)!.classList).toContain('busy');
    expect(root(card).querySelector('.loading-indicator')).toBeNull();
    expect(root(card).querySelector('ha-card')!.getAttribute('aria-busy')).toBe('true');

    refreshButton(card)!.click();
    await settle(card);
    expect(callApi.mock.calls.length).toBe(during);
  });

  it('leaves the corner spinner to a card without it', async () => {
    // The control for the case above: the spinner goes because the button turns instead, not
    // because the card has a toolbar.
    const card = await mount({ toolbar: { ...REFRESH_ONLY, refresh: false, navigation: true } });
    expect(root(card).querySelector('.card-toolbar')).not.toBeNull();
    holdAnswers();

    void (card as unknown as { refreshEvents(): Promise<void> }).refreshEvents();
    await settle(card);

    expect(card.isLoading).toBe(true);
    expect(root(card).querySelector('.loading-indicator')).not.toBeNull();
  });

  it('does nothing while the card is being edited', async () => {
    const card = await mount({}, { flag: 'editMode' });
    const before = callApi.mock.calls.length;

    refreshButton(card)!.click();
    await settle(card);

    expect(callApi.mock.calls.length).toBe(before);
  });

  it('stops the card presenting itself as a button', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });

    expect(root(card).querySelector('ha-card')!.getAttribute('role')).toBeNull();
  });
});

describe('the refresh action', () => {
  const NO_BAR = { show: false };

  it.each([
    [
      'a tap',
      { tap_action: { action: 'refresh' } },
      (card: CardUnderTest) => {
        card._handlePointerDown(pointer(1));
        card._handlePointerUp(pointer(1));
      },
    ],
    [
      'a hold',
      { hold_action: { action: 'refresh' } },
      (card: CardUnderTest) => {
        card._handlePointerDown(pointer(1));
        vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
        card._handlePointerUp(pointer(1));
      },
    ],
    [
      'Enter on the card',
      { tap_action: { action: 'refresh' } },
      (card: CardUnderTest) => {
        const haCard = root(card).querySelector('ha-card')!;
        haCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      },
    ],
    [
      'the public handleAction',
      { tap_action: { action: 'refresh' } },
      (card: CardUnderTest) => card.handleAction(card.config.tap_action),
    ],
  ])('asks again for every calendar on %s', async (_way, actions, act) => {
    const card = await mount({ ...actions, toolbar: NO_BAR });
    const before = callApi.mock.calls.length;

    act(card);
    await settle(card);

    expect(callApi.mock.calls.length).toBe(before + 2);
  });

  it('does nothing while a load is under way', async () => {
    const card = await mount({ tap_action: { action: 'refresh' }, toolbar: NO_BAR });
    holdAnswers();
    card.handleAction(card.config.tap_action);
    await settle(card);
    const during = callApi.mock.calls.length;

    card.handleAction(card.config.tap_action);
    await settle(card);

    expect(callApi.mock.calls.length).toBe(during);
  });

  it('dispatches nothing to Home Assistant', async () => {
    const card = await mount({ tap_action: { action: 'refresh' }, toolbar: NO_BAR });
    const fired: Event[] = [];
    card.addEventListener('hass-action', (ev) => fired.push(ev));

    card.handleAction(card.config.tap_action);
    await settle(card);

    expect(fired).toEqual([]);
  });
});

describe('what a refresh someone asked for shows', () => {
  const NO_BAR = { show: false };
  const TURN = Constants.TIMING.REFRESH_MIN_TURN;
  const CONFIRMATION = Constants.TIMING.REFRESH_CONFIRMATION;

  it('turns for one whole turn though the load ends at once, then shows a check', async () => {
    const card = await mount();

    refreshButton(card)!.click();
    await settle(card);
    expect(card.isLoading).toBe(false);
    expect(refreshButton(card)!.classList).toContain('busy');
    expect(iconOf(refreshButton(card))).toBe(mdiRefresh);

    await advance(card, TURN - 1);
    expect(refreshButton(card)!.classList).toContain('busy');

    await advance(card, 1);
    expect(refreshButton(card)!.classList).not.toContain('busy');
    expect(refreshButton(card)!.classList).toContain('refresh-done');
    expect(iconOf(refreshButton(card))).toBe(mdiCheck);

    await advance(card, CONFIRMATION - 1);
    expect(refreshButton(card)!.classList).toContain('refresh-done');

    await advance(card, 1);
    expect(refreshButton(card)!.classList).not.toContain('refresh-done');
    expect(refreshButton(card)!.classList).not.toContain('busy');
    expect(iconOf(refreshButton(card))).toBe(mdiRefresh);
    // Through all of it the button stood in for the corner.
    expect(corner(card)).toBeNull();
  });

  it('turns for as long as a slower load lasts, and shows the check as soon as it ends', async () => {
    const card = await mount();
    holdAnswers();

    refreshButton(card)!.click();
    await advance(card, TURN * 2);
    expect(refreshButton(card)!.classList).toContain('busy');

    held.forEach((release) => release());
    await settle(card);
    await advance(card, 0);
    expect(refreshButton(card)!.classList).toContain('refresh-done');
  });

  it('ignores every press until the button is itself again', async () => {
    const card = await mount();

    refreshButton(card)!.click();
    await settle(card);
    const once = callApi.mock.calls.length;

    // The load is over, but the turn is not.
    refreshButton(card)!.click();
    await settle(card);
    expect(callApi.mock.calls.length).toBe(once);

    await advance(card, TURN);
    refreshButton(card)!.click();
    await settle(card);
    expect(callApi.mock.calls.length).toBe(once);

    await advance(card, CONFIRMATION);
    refreshButton(card)!.click();
    await settle(card);
    expect(callApi.mock.calls.length).toBe(once + 2);
  });

  it('shows an alert instead where a calendar could not be loaded', async () => {
    const card = await mount();
    failOneCalendar();

    refreshButton(card)!.click();
    await settle(card);
    await advance(card, TURN);

    expect(refreshButton(card)!.classList).toContain('refresh-failed');
    expect(refreshButton(card)!.classList).not.toContain('refresh-done');
    expect(iconOf(refreshButton(card))).toBe(mdiAlertCircleOutline);

    await advance(card, CONFIRMATION);
    expect(refreshButton(card)!.classList).not.toContain('refresh-failed');
    expect(iconOf(refreshButton(card))).toBe(mdiRefresh);
  });

  it('shows nothing after a load the card started by itself', async () => {
    const card = await mount();
    holdAnswers();

    void (card as unknown as { refreshEvents(): Promise<void> }).refreshEvents();
    await settle(card);
    expect(refreshButton(card)!.classList).toContain('busy');

    held.forEach((release) => release());
    await settle(card);
    expect(refreshButton(card)!.classList).not.toContain('busy');

    for (let step = 0; step < 3; step += 1) {
      await advance(card, TURN);
      expect(refreshButton(card)!.className).not.toMatch(/busy|refresh-done|refresh-failed/);
    }
  });

  it('shows the same in the corner where there is no button', async () => {
    const card = await mount({ tap_action: { action: 'refresh' }, toolbar: NO_BAR });

    card.handleAction(card.config.tap_action);
    await settle(card);
    expect(card.isLoading).toBe(false);
    expect(corner(card)!.querySelector('.spinner')).not.toBeNull();

    await advance(card, TURN);
    expect(corner(card)!.querySelector('.spinner')).toBeNull();
    expect(corner(card)!.classList).toContain('refresh-done');
    expect(iconOf(corner(card))).toBe(mdiCheck);
    // A picture only: a live region holding nothing but an icon would announce nothing.
    expect(corner(card)!.getAttribute('aria-hidden')).toBe('true');
    expect(corner(card)!.hasAttribute('role')).toBe(false);

    await advance(card, CONFIRMATION);
    expect(corner(card)).toBeNull();
  });

  it('shows the alert in the corner too', async () => {
    const card = await mount({ tap_action: { action: 'refresh' }, toolbar: NO_BAR });
    failOneCalendar();

    card.handleAction(card.config.tap_action);
    await settle(card);
    await advance(card, TURN);

    expect(corner(card)!.classList).toContain('refresh-failed');
    expect(iconOf(corner(card))).toBe(mdiAlertCircleOutline);
  });

  it('shows a hold on the button where the card draws one', async () => {
    const card = await mount({ hold_action: { action: 'refresh' } });

    card._handlePointerDown(pointer(1));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    card._handlePointerUp(pointer(1));
    await settle(card);
    expect(refreshButton(card)!.classList).toContain('busy');

    await advance(card, TURN);
    expect(refreshButton(card)!.classList).toContain('refresh-done');
    expect(corner(card)).toBeNull();
  });

  it('waits out a load that replaced it, and shows how that one went', async () => {
    // The last load failed one calendar, so an outcome read before any load answered this
    // press would be an alert.
    failOneCalendar();
    const card = await mount();
    expect(root(card).querySelector('.fetch-error-text')!.textContent).toContain('calendar.ben');
    holdAnswers();

    refreshButton(card)!.click();
    await settle(card);
    // A calendar written to elsewhere: its refresh does not join the press's request, and
    // replaces it.
    void (card as unknown as { refreshEvents(after: number): Promise<void> }).refreshEvents(
      EventUtils.advanceWriteGeneration(),
    );
    await settle(card);
    expect(held.length).toBe(4);

    // The press's own requests answer; nothing they carry reaches the card.
    held.splice(0, 2).forEach((release) => release());
    await advance(card, TURN * 2);
    expect(card.isLoading).toBe(true);
    expect(refreshButton(card)!.classList).toContain('busy');

    held.splice(0).forEach((release) => release());
    await settle(card);
    await advance(card, 0);
    expect(refreshButton(card)!.classList).toContain('refresh-done');
  });

  it('ignores a press during a load the card started itself, by button or action', async () => {
    const card = await mount({ tap_action: { action: 'refresh' } });
    holdAnswers();
    void (card as unknown as { refreshEvents(): Promise<void> }).refreshEvents();
    await settle(card);
    const during = callApi.mock.calls.length;

    refreshButton(card)!.click();
    card.handleAction(card.config.tap_action);
    await settle(card);

    expect(callApi.mock.calls.length).toBe(during);
    held.forEach((release) => release());
    await settle(card);
    await advance(card, TURN);
    expect(refreshButton(card)!.className).not.toMatch(/refresh-done|refresh-failed/);
  });

  it('ignores a press before the card has loaded anything', async () => {
    // Without Home Assistant there is nothing to load yet, and nothing is loading.
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig(buildConfig(BASE));
    document.body.appendChild(card);
    await settle(card);
    expect(card.isLoading).toBe(false);

    refreshButton(card)!.click();
    await settle(card);
    expect(refreshButton(card)!.classList).not.toContain('busy');
    await advance(card, TURN);
    expect(refreshButton(card)!.className).not.toMatch(/busy|refresh-done|refresh-failed/);
  });

  it('is over when the card leaves the page mid-load, so its answer shows nothing', async () => {
    const card = await mount();
    holdAnswers();
    refreshButton(card)!.click();
    await settle(card);

    card.remove();
    document.body.appendChild(card);
    await settle(card);
    held.splice(0).forEach((release) => release());
    await settle(card);

    for (let step = 0; step < 3; step += 1) {
      await advance(card, TURN);
      expect(refreshButton(card)!.className).not.toMatch(/busy|refresh-done|refresh-failed/);
    }
  });

  it('is over when the card leaves the page, so it comes back ready', async () => {
    const card = await mount();
    refreshButton(card)!.click();
    await settle(card);
    await advance(card, TURN);
    expect(refreshButton(card)!.classList).toContain('refresh-done');

    card.remove();
    document.body.appendChild(card);
    await settle(card);
    expect(refreshButton(card)!.className).not.toMatch(/busy|refresh-done|refresh-failed/);

    const before = callApi.mock.calls.length;
    refreshButton(card)!.click();
    await settle(card);
    expect(callApi.mock.calls.length).toBe(before + 2);
  });
});
