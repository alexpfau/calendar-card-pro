/**
 * Refresh, on the real card: the toolbar's button and the `refresh` card action.
 *
 * Both load the events again through one guarded entry point, so the cases here pin what that
 * point promises from every way in: a fresh request even when the cached events are not due,
 * nothing while a load is under way, and the toolbar button inert while the card is edited.
 * `interaction-actions.test.ts` pins that `handleAction` hands `refresh` to the card and never
 * to Home Assistant; this file pins what the card then does with it.
 */

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

/** A bar holding the refresh button and nothing else. */
const REFRESH_ONLY = { show: true, refresh: true, view_switcher: false, add_event: false };

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
    const card = await mount({ toolbar: { show: true, add_event: false, view_switcher: false } });

    expect(refreshButton(card)).toBeNull();
    expect(root(card).querySelector('.card-toolbar')).toBeNull();
  });

  it('sits between the view switcher and add, which stays last', async () => {
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

    expect(
      Array.from(root(card).querySelectorAll('.toolbar-trailing > *')).map((element) =>
        element.className.split(' ').slice(0, 2).join(' '),
      ),
    ).toEqual([
      'view-switcher',
      'toolbar-button refresh-button',
      'toolbar-button add-event-button',
    ]);
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

  it('carries its label from the width the fixed threshold allows for one command', async () => {
    const card = await mount();

    await measure(card, Constants.UI.TOOLBAR_LABEL_MIN_WIDTH - 1);
    expect(refreshButton(card)!.classList).toContain('icon-only');

    await measure(card, Constants.UI.TOOLBAR_LABEL_MIN_WIDTH);
    expect(refreshButton(card)!.classList).not.toContain('icon-only');
    expect(refreshButton(card)!.textContent!.trim()).toBe('Refresh');
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

    held.forEach((release) => release());
    await settle(card);
    expect(card.isLoading).toBe(false);
    expect(refreshButton(card)!.classList).not.toContain('busy');
  });

  it('leaves the corner spinner to a card without it', async () => {
    // The control for the case above: the spinner goes because the button turns instead.
    const card = await mount({ toolbar: { show: true, add_event: false, view_switcher: false } });
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
