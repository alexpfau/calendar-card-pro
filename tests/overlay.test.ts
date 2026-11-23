/**
 * The card opened full size in the overlay: what opens it, what it opens on, what it carries in
 * and what it keeps out, how it closes, and the keys inside it.
 *
 * Wednesday, November 18, 2026, 10:00 UTC; Mondays first. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import {
  FADE_IN_EASING,
  FADE_IN_MS,
  GROW_EASING,
  GROW_FROM,
  GROW_MS,
  OVERLAY_TAG,
  type OverlayParams,
} from '../src/rendering/overlay';
import { shellStyles } from '../src/rendering/popover-shell';
import * as EventUtils from '../src/utils/events';
import * as ViewChoice from '../src/utils/view-choice';
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

const NOW = new Date('2026-11-18T10:00:00Z');
const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

interface RawEvent {
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  calendar: string;
}

const timed = (calendar: string, summary: string, date: string, from: string, to: string) => ({
  calendar,
  summary,
  start: { dateTime: `${date}T${from}:00Z` },
  end: { dateTime: `${date}T${to}:00Z` },
});

const EVENTS: RawEvent[] = [
  timed(ANNA, 'Standup', '2026-11-18', '08:00', '08:15'),
  timed(BEN, 'Football', '2026-11-19', '17:30', '19:00'),
  timed(ANNA, 'Dentist', '2026-11-26', '14:00', '15:00'),
];

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  preview: boolean;
  overlayFrame?: unknown;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  handleAction(action: Types.ActionConfig): void;
  readonly config: Types.Config;
}

interface OverlayUnderTest extends HTMLElement {
  hass?: Types.Hass;
  showDialog(params: OverlayParams): void;
  closeDialog(): boolean;
  readonly updateComplete: Promise<boolean>;
}

/** Answers no size: the cards are never measured here. */
class SilentResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function hass(): Types.Hass {
  const state = (id: string, name: string) => ({
    entity_id: id,
    state: 'off',
    attributes: { friendly_name: name, supported_features: 7 },
  });
  return {
    states: { [ANNA]: state(ANNA, 'Anna'), [BEN]: state(BEN, 'Ben') },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      subscribeMessage: vi.fn((_callback: unknown, message: { type: string }) =>
        message.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => {}),
      ),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn((_method: string, path: string) => {
      const [, id, query] = /^calendars\/([^?]+)\?(.*)$/.exec(path)!;
      const params = new URLSearchParams(query);
      const from = Date.parse(params.get('start')!);
      const to = Date.parse(params.get('end')!);
      return Promise.resolve(
        EVENTS.filter(
          (event) =>
            event.calendar === id &&
            Date.parse(event.start.dateTime) < to &&
            Date.parse(event.end.dateTime) > from,
        ).map(({ calendar: _calendar, ...event }) => ({ ...event })),
      );
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

const BASE = {
  view: 'list',
  entities: [ANNA, BEN],
  first_day_of_week: 'monday',
  days_to_show: 7,
  title: 'Family',
  toolbar: { show: true, navigation: true, view_switcher: false, legend: 'menu' },
  tap_action: { action: 'overlay' },
};

/** Every dialog a card asked Home Assistant to open. */
let dialogs: Array<{ dialogTag: string; dialogParams: unknown }> = [];
/** The overlay the dialog manager's stand-in made, once it has made one. */
let overlay: OverlayUnderTest | null = null;
/** How many times the overlay said it closed. */
let closed = 0;

/**
 * Home Assistant's dialog manager, as far as `show-dialog` goes: the dialog made once, handed
 * `hass`, shown, and attached.
 */
function manager(event: Event): void {
  const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: OverlayParams }>).detail;
  dialogs.push(detail);
  if (detail.dialogTag !== OVERLAY_TAG) return;
  if (!overlay) {
    overlay = document.createElement(OVERLAY_TAG) as OverlayUnderTest;
    overlay.addEventListener('dialog-closed', () => (closed += 1));
  }
  overlay.hass = (event.target as CardUnderTest).hass;
  overlay.showDialog(detail.dialogParams);
  if (!overlay.isConnected) document.body.appendChild(overlay);
}

/** The card the overlay holds. */
const inner = (): CardUnderTest | null =>
  overlay?.shadowRoot?.querySelector<CardUnderTest>('.frame > *') ?? null;

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await overlay?.updateComplete;
    await inner()?.updateComplete;
  }
}

async function mount(config: Record<string, unknown> = {}): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...BASE, ...config });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

/** Opens the overlay from the card's tap. */
async function open(card: CardUnderTest): Promise<CardUnderTest> {
  card.handleAction(card.config.tap_action);
  await settle();
  return inner()!;
}

const lastParams = (): OverlayParams =>
  dialogs.filter(({ dialogTag }) => dialogTag === OVERLAY_TAG).slice(-1)[0]
    .dialogParams as OverlayParams;

/**
 * A pointer's press on a toolbar button: a click with a count, as a browser fires for a mouse,
 * where a key's click has none.
 */
function pointerClick(button: HTMLElement): void {
  button.dispatchEvent(
    new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: 40, clientY: 20 }),
  );
}

/** The element focus is on, through every shadow root. */
function deepActive(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

const originalResizeObserver = globalThis.ResizeObserver;
const activeElement = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'activeElement')!;

beforeEach(() => {
  // happy-dom's `ShadowRoot.activeElement` throws while focus is in another shadow tree, where a
  // browser answers null.
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
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();
  globalThis.ResizeObserver = SilentResizeObserver as unknown as typeof ResizeObserver;
  dialogs = [];
  overlay = null;
  closed = 0;
  document.addEventListener('show-dialog', manager);
});

afterEach(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', activeElement);
  document.removeEventListener('show-dialog', manager);
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('opening the overlay', () => {
  it('opens the card in Grid, with the toolbar, and the overlay named after the card', async () => {
    const card = await mount();
    const opened = await open(card);

    expect(opened.localName).toBe('calendar-card-pro-dev');
    expect(opened.overlayFrame).toBeDefined();
    expect(opened.config.view).toBe('grid');
    expect(opened.shadowRoot!.querySelector('.grid-container, .grid-view, .time-grid')).not.toBe(
      null,
    );
    expect(overlay!.shadowRoot!.querySelector('dialog')!.getAttribute('aria-label')).toBe('Family');
    expect(overlay!.shadowRoot!.querySelector('dialog')!.open).toBe(true);
    // Nothing on the dashboard's card says it is in an overlay.
    expect(card.overlayFrame).toBeUndefined();
    expect(card.shadowRoot!.querySelector('.close-button')).toBe(null);
  });

  it('fills the overlay rather than taking the card’s own height', async () => {
    const opened = await open(await mount({ max_height: '200px', card_height: '300px' }));
    const card = opened.shadowRoot!.querySelector<HTMLElement>('ha-card')!;
    expect(card.style.getPropertyValue('--calendar-card-content-flex')).toBe('1 1 0');
    expect(card.style.getPropertyValue('height')).toBe('');
    expect(opened.config.max_height).toBe('none');
  });

  it('opens on the date in view, as a layout switch carries it', async () => {
    const card = await mount();
    card
      .shadowRoot!.querySelector<HTMLButtonElement>('.date-navigation-segment:last-child')!
      .click();
    await card.updateComplete;
    const opened = await open(card);

    expect(lastParams().day).toEqual(new Date(2026, 10, 25));
    expect((opened as unknown as { _pageRequested: string | null })._pageRequested).toBe(
      '2026-11-25',
    );
  });

  it('opens on its own home from the card’s home', async () => {
    const opened = await open(await mount());
    expect(lastParams().day).toBe(null);
    expect((opened as unknown as { _pageRequested: string | null })._pageRequested).toBe(null);
  });

  it('adds an event from a day inside, so Grid draws one, where the card sets no day tap', async () => {
    const opened = await open(await mount());
    expect(opened.config.day_tap_action).toEqual({ action: 'add-event' });
    const kept = await open(await mount({ day_tap_action: { action: 'none' } }));
    expect(kept.config.day_tap_action).toEqual({ action: 'none' });
  });

  it('opens nothing while the card is being edited', async () => {
    const card = await mount();
    card.preview = true;
    await card.updateComplete;
    card.handleAction(card.config.tap_action);
    await settle();
    expect(dialogs).toEqual([]);
  });
});

describe('the toolbar’s Open Full Size button', () => {
  it('is off until the toolbar asks for it', async () => {
    const card = await mount();
    expect(card.shadowRoot!.querySelector('.overlay-button')).toBe(null);
  });

  it('ends the top row, named in the card’s words, and opens the overlay from where it is', async () => {
    const card = await mount({
      tap_action: { action: 'none' },
      toolbar: { ...BASE.toolbar, overlay: true },
    });
    const button = card.shadowRoot!.querySelector<HTMLButtonElement>(
      '.toolbar-end > .overlay-button',
    )!;
    expect(button.getAttribute('aria-label')).toBe('Open full size');
    expect(button.title).toBe('Open full size');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.parentElement!.lastElementChild).toBe(button);

    pointerClick(button);
    await settle();
    expect(lastParams().pointer).toBe(true);
    expect(lastParams().from).toMatchObject({ x: 0, y: 0, pointerType: 'mouse' });
    // Close stands in its place inside, where nothing opens another overlay.
    const opened = inner()!;
    expect(opened.shadowRoot!.querySelector('.overlay-button')).toBe(null);
    expect(opened.shadowRoot!.querySelector('.toolbar-end > .close-button')).not.toBe(null);
  });

  it('is named in the card’s language, which Home Assistant has no word for', async () => {
    const card = await mount({ language: 'de', toolbar: { ...BASE.toolbar, overlay: true } });
    expect(card.shadowRoot!.querySelector('.overlay-button')!.getAttribute('aria-label')).toBe(
      'In voller Größe öffnen',
    );
  });

  it('does nothing while the card is being edited', async () => {
    const card = await mount({ toolbar: { ...BASE.toolbar, overlay: true } });
    card.preview = true;
    await card.updateComplete;
    pointerClick(card.shadowRoot!.querySelector<HTMLButtonElement>('.overlay-button')!);
    await settle();
    expect(dialogs).toEqual([]);
  });
});

describe('what comes in and what stays out', () => {
  it('starts with the calendars the card’s legend hides, and stores nothing on the device', async () => {
    const config = { ...BASE, toolbar: { ...BASE.toolbar, view_switcher: true } };
    ViewChoice.writeHiddenCalendars(ViewChoice.configFingerprint(config), [BEN]);
    const card = await mount({ toolbar: config.toolbar });
    const stored = localStorage.getItem(ViewChoice.VIEW_CHOICE_STORAGE_KEY);
    const opened = await open(card);

    expect(lastParams().hidden).toEqual([BEN]);
    expect(opened.shadowRoot!.textContent).not.toContain('Football');

    // A layout picked inside is the overlay's alone. Unmeasured, the switcher is collapsed, so the
    // pick is made from its menu.
    opened.shadowRoot!.querySelector<HTMLButtonElement>('.view-switcher-pill')!.click();
    await settle();
    opened
      .shadowRoot!.querySelector<HTMLButtonElement>('.layout-menu-row[data-view="month"]')!
      .click();
    await settle();
    expect(opened.shadowRoot!.querySelector('.month-container')).not.toBe(null);
    expect(localStorage.getItem(ViewChoice.VIEW_CHOICE_STORAGE_KEY)).toBe(stored);
    expect(card.shadowRoot!.querySelector('.month-container')).toBe(null);
  });
});

describe('closing the overlay', () => {
  it('closes on Close, named by Home Assistant’s word, and lets its card go', async () => {
    const opened = await open(await mount());
    const close = opened.shadowRoot!.querySelector<HTMLButtonElement>(
      '.toolbar-end .close-button',
    )!;
    expect(close.getAttribute('aria-label')).toBe('Close');

    close.click();
    await settle();
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(closed).toBe(1);
    expect(opened.isConnected).toBe(false);
    expect(overlay!.shadowRoot!.querySelector('dialog')!.open).toBe(false);
  });

  it('closes for `back` inside it, rather than leaving the page', async () => {
    const back = vi.spyOn(window.history, 'back');
    const opened = await open(await mount({ hold_action: { action: 'back' } }));
    opened.handleAction(opened.config.hold_action);
    await settle();
    expect(closed).toBe(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('draws Close at the end of the heading row when the toolbar holds nothing else', async () => {
    const opened = await open(
      await mount({ overlay: { toolbar: { show: false, view_switcher: false } } }),
    );
    expect(opened.shadowRoot!.querySelector('.toolbar-actions')).toBe(null);
    expect(opened.shadowRoot!.querySelector('.toolbar-heading-end > .close-button')).not.toBe(null);
  });

  it('starts focus on Close, ringed, when no pointer opened it', async () => {
    const opened = await open(await mount());
    await settle();
    expect(lastParams().pointer).toBe(false);
    expect(deepActive()).toBe(opened.shadowRoot!.querySelector('.close-button'));
  });

  it('starts focus on the overlay itself after a pointer’s press, which shows no ring', async () => {
    const card = await mount({ toolbar: { ...BASE.toolbar, overlay: true } });
    pointerClick(card.shadowRoot!.querySelector<HTMLButtonElement>('.overlay-button')!);
    await settle();
    const frame = overlay!.shadowRoot!.querySelector<HTMLElement>('.frame')!;
    expect(deepActive()).toBe(frame);
    expect(frame.getAttribute('tabindex')).toBe('-1');
  });
});

describe('keys inside the overlay', () => {
  it('leaves a month’s arrows to the month, which the guard on the page behind hears after it', async () => {
    const opened = await open(await mount({ overlay: { view: 'month' } }));
    const today = [
      ...opened.shadowRoot!.querySelectorAll<HTMLElement>('.month-container [role="gridcell"]'),
    ].find((cell) => cell.getAttribute('aria-label')!.startsWith('Wednesday, November 18'))!;
    today.focus();

    const down = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    today.dispatchEvent(down);
    await settle();

    expect(deepActive()?.getAttribute('aria-label')).toMatch(/^Wednesday, November 25/);
  });

  it('keeps Page Down from scrolling the dashboard behind, where nothing inside takes it', async () => {
    const opened = await open(await mount());
    const close = opened.shadowRoot!.querySelector<HTMLElement>('.close-button')!;
    const key = new KeyboardEvent('keydown', {
      key: 'PageDown',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    close.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
  });
});

describe('how the overlay opens and closes', () => {
  /** Every animation played, as its keyframes and timing. */
  const played = () => {
    const animate = vi.spyOn(HTMLElement.prototype, 'animate');
    onTestFinished(() => animate.mockRestore());
    return () =>
      animate.mock.calls.map(([keyframes, options]) => ({
        keyframes,
        options: options as KeyframeAnimationOptions,
      }));
  };

  /** Opens an overlay by hand, as Home Assistant would, from a press at a point. */
  async function openFrom(from?: { x: number; y: number }): Promise<OverlayUnderTest> {
    const element = document.createElement(OVERLAY_TAG) as OverlayUnderTest;
    element.addEventListener('dialog-closed', () => (closed += 1));
    element.hass = hass();
    element.showDialog({
      cardTag: 'calendar-card-pro-dev',
      config: { entities: [ANNA], view: 'grid', toolbar: { show: true } },
      day: null,
      hidden: [],
      label: 'Family',
      from,
      pointer: true,
    });
    document.body.appendChild(element);
    overlay = element;
    await settle();
    return element;
  }

  it('grows out of the press as a popover does, from a tenth of its size, and fades in', async () => {
    const calls = played();
    const element = await openFrom({ x: 120, y: 80 });
    const frame = element.shadowRoot!.querySelector<HTMLElement>('.frame')!;
    // The frame is unmeasured here, at 0, 0, so the press is where it grows from on the frame.
    expect(frame.style.transformOrigin).toBe('120px 80px');
    expect(calls()).toEqual([
      {
        keyframes: [{ transform: 'scale(0.1)' }, { transform: 'scale(1)' }],
        options: { duration: 230, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
      },
      {
        keyframes: [{ opacity: 0 }, { opacity: 1 }],
        options: { duration: 180, easing: 'cubic-bezier(0, 0, 0.58, 1)' },
      },
    ]);
  });

  it('opens exactly as the popovers do', () => {
    const popover = shellStyles.cssText;
    expect(popover).toContain(`pop-grow ${GROW_MS}ms ${GROW_EASING}`);
    expect(popover).toContain(`pop-fade ${FADE_IN_MS}ms ${FADE_IN_EASING}`);
    expect(popover).toMatch(
      new RegExp(
        `@keyframes pop-grow\\s*\\{\\s*from\\s*\\{\\s*transform:\\s*scale\\(${GROW_FROM}\\)`,
      ),
    );
  });

  it('grows out of its middle where nothing says where it was opened from', async () => {
    await openFrom();
    expect(overlay!.shadowRoot!.querySelector<HTMLElement>('.frame')!.style.transformOrigin).toBe(
      'center',
    );
  });

  it('shrinks back toward the press and fades as it closes, as a popover does', async () => {
    const element = await openFrom({ x: 120, y: 80 });
    const calls = played();
    element.closeDialog();
    await settle();
    expect(calls().slice(0, 2)).toEqual([
      {
        keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(0.15)' }],
        options: { duration: 180, easing: 'cubic-bezier(0.37, 0, 0.63, 1)', fill: 'forwards' },
      },
      {
        keyframes: [{ opacity: '1' }, { opacity: 0 }],
        options: { duration: 180, easing: 'ease', fill: 'forwards' },
      },
    ]);
    expect(element.shadowRoot!.querySelector<HTMLElement>('.frame')!.style.transformOrigin).toBe(
      '120px 80px',
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(closed).toBe(1);
  });

  it('plays nothing where the system asks for less motion', async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({ matches: query.includes('reduce'), media: query }) as MediaQueryList) as typeof matchMedia;
    onTestFinished(() => {
      window.matchMedia = matchMedia;
    });
    const calls = played();
    const element = await openFrom({ x: 120, y: 80 });
    element.closeDialog();
    await settle();
    expect(calls()).toEqual([]);
    expect(element.shadowRoot!.querySelector('dialog')!.open).toBe(false);
  });
});
