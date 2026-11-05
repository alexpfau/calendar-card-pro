/**
 * The configuration's own toolbar buttons, on the real card.
 *
 * The toolbar defaults to hidden and `buttons` to an empty list, so every DOM gate built from
 * default config sees no button at all and would stay green if they did nothing; every case here
 * writes some. The pure halves have files of their own: which entries are drawn in
 * `toolbar-config.test.ts`, the plan of which start controls fold in `toolbar-fold.test.ts`, the
 * menu's placement in `legend-menu.test.ts`. This file pins how the card joins them: where the
 * buttons sit, what they are named, what a press runs and when nothing does, what they cost the
 * switcher's words, which controls the start group folds into its menu at each width and back,
 * the guard for a row that wraps all the same, and the menu's lifecycle.
 *
 * The plan is arithmetic on the width the resize observer reports, which these tests hand the
 * card. happy-dom lays nothing out, so the guard, which reads the row as drawn, is driven by
 * stubbed measurements: the policy is pinned here, and the layout it rests on can only be checked
 * in a browser.
 */

import { mdiDotsVertical, mdiPlus } from '@mdi/js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { spyOnPopovers } from './popover-spy';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as Logger from '../src/utils/logger';
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

/** A shown toolbar holding add and nothing else, so where the buttons go is plain. */
const ADD_ONLY: Types.ToolbarConfig = {
  show: true,
  view_switcher: false,
  navigation: false,
  reset: false,
  refresh: false,
  legend: false,
};

/** A shown toolbar with every control off: anything in it is a button of the configuration's. */
const BUTTONS_ONLY: Types.ToolbarConfig = { ...ADD_ONLY, add_event: false };

const BACK = { icon: 'mdi:arrow-left', name: 'Back', tap_action: { action: 'back' } };
const DASHBOARD = {
  icon: 'mdi:view-dashboard-outline',
  name: 'Main dashboard',
  tap_action: { action: 'navigate', navigation_path: '/lovelace/0' },
};
const LAMP = {
  icon: 'mdi:lamp',
  name: 'Hall lamp',
  entity: 'light.hall',
  tap_action: { action: 'toggle' },
};
const WEATHER = { icon: 'mdi:weather-partly-cloudy', tap_action: { action: 'more-info' } };

/** Home Assistant's words for the keys the toolbar asks for. */
const STRINGS: Record<string, string> = {
  'ui.common.back': 'Back',
  'ui.common.menu': 'Menu',
  'ui.common.refresh': 'Refresh',
  'ui.common.reset': 'Reset',
  'ui.common.previous': 'Previous',
  'ui.common.next': 'Next',
  'ui.components.calendar.my_calendars': 'My calendars',
  'ui.components.calendar.event.add': 'Add event',
};

/** A Home Assistant with no word for anything the toolbar asks. */
const NO_WORDS = (): string => '';

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  hidden: boolean;
  isExpanded: boolean;
  refreshEvents(): Promise<void>;
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

function hass(localize: (key: string) => string = (key) => STRINGS[key] ?? key) {
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

function configFor(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ entities: [ANNA, BEN], days_to_show: 3, ...overrides });
}

/** A configuration whose toolbar holds these buttons, and the controls `toolbar` names. */
function withButtons(
  buttons: unknown[],
  toolbar: Types.ToolbarConfig = ADD_ONLY,
  overrides: Partial<Types.Config> = {},
): Types.Config {
  return configFor({ ...overrides, toolbar: { ...toolbar, buttons } as Types.ToolbarConfig });
}

/** Let the load, and the renders after it, finish. */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

/**
 * Mounts a card, and hands it a width as a browser's resize observer does before the first paint:
 * 784px unless asked otherwise, or none at all for a card not measured yet.
 */
async function mount(
  config: Types.Config,
  options: {
    flag?: 'preview' | 'editMode';
    localize?: (key: string) => string;
    width?: number | null;
  } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(config);
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize);
  document.body.appendChild(card);
  await settle(card);
  const width = options.width === undefined ? 784 : options.width;
  if (width !== null) await measure(card, width);
  return card;
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

/** The buttons of the configuration's own drawn in the row, in order. */
function customButtons(card: CardUnderTest): HTMLButtonElement[] {
  return Array.from(root(card).querySelectorAll<HTMLButtonElement>('.custom-button'));
}

function menuButton(card: CardUnderTest): HTMLButtonElement | null {
  return root(card).querySelector<HTMLButtonElement>('.custom-menu-button');
}

function menu(card: CardUnderTest): HTMLDialogElement {
  return root(card).querySelector<HTMLDialogElement>('dialog.custom-menu')!;
}

/** The controls in one group of the action row, in order, each by its first two classes. */
function controls(card: CardUnderTest, group: '.toolbar-start' | '.toolbar-end'): string[] {
  return Array.from(root(card).querySelectorAll(`.toolbar-actions > ${group} > *`)).map((element) =>
    element.className.split(' ').slice(0, 2).join(' '),
  );
}

/** Each button drawn in the row, as a screen reader and a pointer meet it. */
function described(card: CardUnderTest) {
  return customButtons(card).map((button) => ({
    icon: button.querySelector('ha-icon')!.getAttribute('icon'),
    label: button.getAttribute('aria-label'),
    title: button.getAttribute('title'),
  }));
}

/** Every `hass-action` the card hands Home Assistant, as Home Assistant reads it. */
function listen(card: CardUnderTest): Array<{ config: Record<string, unknown>; action: string }> {
  const fired: Array<{ config: Record<string, unknown>; action: string }> = [];
  card.addEventListener('hass-action', (ev) =>
    fired.push((ev as unknown as { detail: (typeof fired)[number] }).detail),
  );
  return fired;
}

/** A click a pointer made, which counts one press, at a point. */
function pointerClick(target: EventTarget, x = 10, y = 10): void {
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: x, clientY: y }),
  );
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

//-----------------------------------------------------------------------------
// LAYOUT STUBS
//-----------------------------------------------------------------------------

/**
 * What the stubbed layout reports, in CSS pixels. Zero for the card means "not laid out", which
 * is all happy-dom ever reports. `row` is the action row's border box and `rowPadding` its
 * padding on each side, so its content is `row - 2 * rowPadding`; the row grows with the card
 * one for one, as it does in a browser. `switcher` is the view switcher's width as drawn, and
 * `switcherWords`, where set, its width while it draws its words rather than its pictograms.
 * `startCapacity`, where set, is a theme the arithmetic cannot see: the most icons the start
 * group holds on the row's first line, past which the end group's controls report a second line.
 * `scrollbar` is what a page scrollbar takes from the card, and from its row, while the buttons
 * are drawn in it: what a row tall enough to make the page scroll does in a browser.
 *
 * The defaults are what Chromium measured for a list card 376px wide: a 342px row content box and
 * the switcher's pictograms 108px across.
 */
const layout = {
  card: 0,
  rowInset: 26,
  rowPadding: 4,
  switcher: 108,
  switcherWords: null as number | null,
  startCapacity: null as number | null,
  scrollbar: 0,
};
const LAYOUT_DEFAULTS = { ...layout };

function box(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right,
    bottom: 36,
    width: right - left,
    height: 36,
  } as DOMRect;
}

function stubLayout(): void {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const card = (host: ParentNode | null) =>
      layout.card - (host?.querySelector('.custom-button') ? layout.scrollbar : 0);
    if (this.localName === 'calendar-card-pro-dev') return box(0, card(this.shadowRoot));
    if (this.classList.contains('toolbar-actions')) {
      return box(0, Math.max(0, card(this.getRootNode() as ShadowRoot) - layout.rowInset));
    }
    if (this.classList.contains('view-switcher')) {
      const words = layout.switcherWords !== null && this.querySelector('.toolbar-button-label');
      return box(0, words ? layout.switcherWords! : layout.switcher);
    }
    if (this.classList.contains('toolbar-button') && layout.startCapacity !== null) {
      const row = this.closest('.toolbar-actions');
      const icons = row?.querySelectorAll('.toolbar-start > .toolbar-button').length ?? 0;
      const second = this.closest('.toolbar-end') !== null && icons > layout.startCapacity;
      return { ...box(0, 36), y: second ? 44 : 0, top: second ? 44 : 0, bottom: second ? 80 : 36 };
    }
    return realRect.call(this);
  });
  const realStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = realStyle(element, pseudo);
    if ((element as HTMLElement).classList?.contains('toolbar-actions')) {
      return {
        ...style,
        paddingLeft: `${layout.rowPadding}px`,
        paddingRight: `${layout.rowPadding}px`,
      } as CSSStyleDeclaration;
    }
    return style;
  });
}

/** The resize observer the card asked to watch it. */
function observerOf(card: CardUnderTest): RecordingResizeObserver {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  );
  if (!observer) throw new Error('the card never asked to be observed');
  return observer;
}

/** Deliver a width the way the browser does, and let the frame and the settle delay run. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = observerOf(card);
  layout.card = width;
  observer.callback([{ contentRect: { width } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
}

/** Let the next animation frame run, and the renders it causes. */
async function nextFrame(card: CardUnderTest): Promise<void> {
  vi.advanceTimersToNextFrame();
  await settle(card);
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  callApi.mockResolvedValue([]);
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  Object.assign(layout, LAYOUT_DEFAULTS);
  vi.mocked(Logger.warn).mockClear();
  vi.mocked(Logger.debug).mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

//-----------------------------------------------------------------------------
// WHERE THEY SIT
//-----------------------------------------------------------------------------

describe("the configuration's own buttons", () => {
  it('draw nothing of their own while the list is empty, as by default', async () => {
    const card = await mount(withButtons([]));

    expect(customButtons(card)).toEqual([]);
    expect(menuButton(card)).toBeNull();
    expect(controls(card, '.toolbar-start')).toEqual(['toolbar-button add-event-button']);
  });

  it('sit after add, in the order written, each a command like the others', async () => {
    const card = await mount(withButtons([BACK, DASHBOARD, LAMP]));

    expect(controls(card, '.toolbar-start')).toEqual([
      'toolbar-button add-event-button',
      'toolbar-button custom-button',
      'toolbar-button custom-button',
      'toolbar-button custom-button',
    ]);
    expect(described(card).map(({ icon }) => icon)).toEqual([
      'mdi:arrow-left',
      'mdi:view-dashboard-outline',
      'mdi:lamp',
    ]);
    for (const button of customButtons(card)) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.querySelector('ha-icon')!.classList).toContain('custom-button-icon');
    }
  });

  it('sit after a folded filter and add, at the start group’s inner edge, the end group untouched', async () => {
    const card = await mount(
      withButtons([BACK, DASHBOARD], { show: true, navigation: false, reset: false }),
    );

    expect(controls(card, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
      'toolbar-button custom-button',
      'toolbar-button custom-button',
    ]);
    expect(controls(card, '.toolbar-end')).toEqual(['toolbar-button refresh-button']);
  });

  it('draw a toolbar of their own where they are its only control', async () => {
    const card = await mount(withButtons([BACK], BUTTONS_ONLY));

    expect(controls(card, '.toolbar-start')).toEqual(['toolbar-button custom-button']);
    expect(root(card).querySelector('.header-container.has-toolbar')).not.toBeNull();
  });

  it('leave out an entry that cannot be drawn as written, and say so once per configuration', async () => {
    const stray = { name: 'No icon yet', tap_action: { action: 'back' } };
    const card = await mount(withButtons([BACK, stray, LAMP]));

    expect(described(card).map(({ label }) => label)).toEqual(['Back', 'Hall lamp']);
    const warned = vi
      .mocked(Logger.warn)
      .mock.calls.filter(([message]) => String(message).startsWith('Toolbar button left out'));
    expect(warned).toHaveLength(1);
    expect(warned[0][0]).toContain(JSON.stringify(stray));

    // A render is not a new configuration, so it says nothing more.
    card.isExpanded = !card.isExpanded;
    await settle(card);
    expect(
      vi
        .mocked(Logger.warn)
        .mock.calls.filter(([message]) => String(message).startsWith('Toolbar button left out')),
    ).toHaveLength(1);
  });

  it('are not drawn while the toolbar is hidden', async () => {
    const card = await mount(withButtons([BACK, LAMP], { ...ADD_ONLY, show: false }));

    expect(customButtons(card)).toEqual([]);
    expect(root(card).querySelector('.card-toolbar')).toBeNull();
  });

  it('stop the card presenting itself as a button, and keep its tab stop', async () => {
    const card = await mount(
      withButtons([BACK], BUTTONS_ONLY, { tap_action: { action: 'more-info' } }),
    );
    const haCard = root(card).querySelector('ha-card')!;

    expect(haCard.hasAttribute('role')).toBe(false);
    expect(haCard.getAttribute('tabindex')).toBe('0');

    // The control: the same card with no buttons draws no toolbar and is a button.
    const control = await mount(
      withButtons([], BUTTONS_ONLY, { tap_action: { action: 'more-info' } }),
    );
    expect(root(control).querySelector('ha-card')!.getAttribute('role')).toBe('button');
  });
});

//-----------------------------------------------------------------------------
// NAMES
//-----------------------------------------------------------------------------

describe('what each button is named', () => {
  it('is its name, as its tooltip and for assistive technology', async () => {
    const card = await mount(withButtons([DASHBOARD]));

    expect(described(card)).toEqual([
      { icon: 'mdi:view-dashboard-outline', label: 'Main dashboard', title: 'Main dashboard' },
    ]);
  });

  it("is Home Assistant's own word for back, or English for assistive technology alone", async () => {
    const bare = { icon: 'mdi:arrow-left', tap_action: { action: 'back' } };

    const localized = await mount(withButtons([bare]));
    expect(described(localized)[0]).toMatchObject({ label: 'Back', title: 'Back' });

    const unlocalized = await mount(withButtons([bare]), { localize: NO_WORDS });
    expect(described(unlocalized)[0]).toMatchObject({ label: 'Back', title: null });
  });

  it.each([
    ['refresh', '.refresh-button'],
    ['add-event', '.add-event-button'],
    ['reset', '.reset-button'],
  ])(
    'is exactly what the card’s own %s button is named, with or without Home Assistant’s word',
    async (action, own) => {
      const toolbar: Types.ToolbarConfig = {
        show: true,
        reset: true,
        legend: false,
        view_switcher: false,
      };
      for (const localize of [undefined, NO_WORDS]) {
        const card = await mount(
          withButtons([{ icon: 'mdi:star', tap_action: { action } }], toolbar),
          { localize },
        );
        const builtIn = root(card).querySelector(own)!;

        expect(described(card)[0]).toMatchObject({
          label: builtIn.getAttribute('aria-label'),
          title: builtIn.getAttribute('title'),
        });
      }
    },
  );

  it('is its icon’s words for anything else, for assistive technology alone, reported once', async () => {
    const card = await mount(withButtons([WEATHER, { icon: 'mdi:lamp' }]));

    expect(described(card)).toEqual([
      { icon: 'mdi:weather-partly-cloudy', label: 'weather partly cloudy', title: null },
      { icon: 'mdi:lamp', label: 'lamp', title: null },
    ]);
    const reported = () =>
      vi
        .mocked(Logger.debug)
        .mock.calls.filter(([message]) => String(message).includes('has no name')).length;
    expect(reported()).toBe(2);

    card.isExpanded = !card.isExpanded;
    await settle(card);
    expect(reported()).toBe(2);
  });

  it('keeps the name it was given over the word for its action', async () => {
    const card = await mount(withButtons([{ ...BACK, name: 'Up one level' }]));

    expect(described(card)[0]).toMatchObject({ label: 'Up one level', title: 'Up one level' });
  });
});

//-----------------------------------------------------------------------------
// A PRESS
//-----------------------------------------------------------------------------

describe('a press on a button', () => {
  it("hands Home Assistant's own actions to it, with the button's entity", async () => {
    const card = await mount(withButtons([LAMP]));
    const fired = listen(card);

    pointerClick(customButtons(card)[0]);

    expect(fired).toEqual([
      { config: { entity: 'light.hall', tap_action: { action: 'toggle' } }, action: 'tap' },
    ]);
  });

  it("acts on the card's first calendar where the button names no entity", async () => {
    const card = await mount(withButtons([WEATHER]));
    const fired = listen(card);

    customButtons(card)[0].click();

    expect(fired).toEqual([
      { config: { entity: ANNA, tap_action: WEATHER.tap_action }, action: 'tap' },
    ]);
  });

  it("runs the card's own actions itself, refresh among them, and hands Home Assistant nothing", async () => {
    const card = await mount(
      withButtons([{ icon: 'mdi:refresh', tap_action: { action: 'refresh' } }]),
    );
    const fired = listen(card);
    const refresh = vi.spyOn(card, 'refreshEvents').mockResolvedValue();

    customButtons(card)[0].click();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fired).toEqual([]);
  });

  it('goes back through the history from a back button, where Home Assistant navigated here', async () => {
    window.history.replaceState({ from: '/lovelace/0' }, '', '/dashboard-family/week');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const card = await mount(withButtons([BACK]));
    const fired = listen(card);

    pointerClick(customButtons(card)[0]);

    expect(back).toHaveBeenCalledTimes(1);
    expect(fired).toEqual([]);
  });

  it('opens the event popover below the button pressed, for add-event, by pointer or by key', async () => {
    const popovers = spyOnPopovers();
    try {
      const card = await mount(
        withButtons([BACK, { icon: 'mdi:calendar-plus', tap_action: { action: 'add-event' } }]),
      );
      const pressed = customButtons(card)[1];
      Object.defineProperty(pressed, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 120, top: 8, right: 156, bottom: 44, width: 36, height: 36 }),
      });

      pointerClick(pressed, 130, 20);
      expect(popovers.opened).toHaveBeenCalledTimes(1);
      expect(popovers.opened.mock.calls[0][0].anchor).toMatchObject({
        x: 138,
        y: 26,
        below: true,
        pointerType: 'mouse',
      });

      pressed.click();
      const keyed = popovers.opened.mock.calls[1][0].anchor;
      expect(keyed).toMatchObject({ x: 138, y: 26, below: true });
      expect(keyed).not.toHaveProperty('pointerType');
    } finally {
      popovers.stop();
    }
  });

  it.each([
    ['no action', { icon: 'mdi:star' }],
    ['the action none', { icon: 'mdi:star', tap_action: { action: 'none' } }],
    ['an action with no name', { icon: 'mdi:star', tap_action: {} }],
  ])('does nothing for a button with %s, which is still drawn', async (_name, button) => {
    const card = await mount(withButtons([button]));
    const fired = listen(card);
    const refresh = vi.spyOn(card, 'refreshEvents').mockResolvedValue();

    pointerClick(customButtons(card)[0]);

    expect(customButtons(card)).toHaveLength(1);
    expect(fired).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(['preview', 'editMode'] as const)(
    'runs nothing while the card is edited (%s)',
    async (flag) => {
      window.history.replaceState({ from: '/lovelace/0' }, '', '/dashboard-family/week');
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const card = await mount(
        withButtons([BACK, LAMP, { icon: 'mdi:refresh', tap_action: { action: 'refresh' } }]),
        { flag },
      );
      const fired = listen(card);
      const refresh = vi.spyOn(card, 'refreshEvents').mockResolvedValue();

      for (const button of customButtons(card)) pointerClick(button);

      expect(customButtons(card)).toHaveLength(3);
      expect(back).not.toHaveBeenCalled();
      expect(fired).toEqual([]);
      expect(refresh).not.toHaveBeenCalled();

      // The control: editing over, the same presses run.
      card[flag] = false;
      await settle(card);
      pointerClick(customButtons(card)[1]);
      expect(fired).toHaveLength(1);
    },
  );

  it('keeps a press on the button from becoming a press on the card', async () => {
    const card = await mount(
      withButtons([{ icon: 'mdi:star' }], ADD_ONLY, { tap_action: { action: 'more-info' } }),
    );
    const fired = listen(card);

    tapWithPointer(customButtons(card)[0]);
    customButtons(card)[0].click();
    expect(fired).toEqual([]);

    // The control: the same press on the days is the card's.
    tapWithPointer(root(card).querySelector('.content-container')!);
    expect(fired).toHaveLength(1);
  });
});

//-----------------------------------------------------------------------------
// THE ROW'S WIDTH BUDGET
//-----------------------------------------------------------------------------

describe("what the buttons cost the switcher's words", () => {
  /** Add, the switcher and refresh: words from 248 + 36 + 36 = 320px with no button. */
  const ROW: Types.ToolbarConfig = { show: true, navigation: false, reset: false, legend: false };
  const words = (card: CardUnderTest) => root(card).querySelector('.toolbar-button-label') !== null;

  it('counts each button as one more icon beside the switcher', async () => {
    const plain = await mount(withButtons([], ROW));
    await measure(plain, 320);
    expect(words(plain)).toBe(true);

    // Two buttons take 2 × 36 + 2 × 8 = 88px more.
    const card = await mount(withButtons([BACK, DASHBOARD], ROW));
    await measure(card, 320);
    expect(words(card)).toBe(false);
    await measure(card, 407);
    expect(words(card)).toBe(false);
    await measure(card, 408);
    expect(words(card)).toBe(true);
  });

  it('counts every button, so the words give way before any control folds', async () => {
    // Add, four buttons and refresh: words from 248 + 5 × 36 + 4 × 8 + 36 = 496px. Below that the
    // switcher draws pictograms, and the row holds every control down to 406px.
    const card = await mount(withButtons([BACK, DASHBOARD, LAMP, WEATHER], ROW));
    await measure(card, 496);
    expect([words(card), menuButton(card)]).toEqual([true, null]);
    await measure(card, 495);
    expect([words(card), menuButton(card)]).toEqual([false, null]);
    await measure(card, 406);
    expect([words(card), menuButton(card)]).toEqual([false, null]);
    await measure(card, 405);
    expect(words(card)).toBe(false);
    expect(menuButton(card)).not.toBeNull();
  });

  it('counts the magnifier as one more icon at the end, beside refresh', async () => {
    // Add, the switcher, refresh and the magnifier: words from 248 + 36 + 36 + 8 + 36 = 364px.
    // The date navigation the magnifier needs sits in the heading row, not in this one.
    const card = await mount(withButtons([], { ...ROW, navigation: true, search: true }));
    await measure(card, 363);
    expect(words(card)).toBe(false);
    await measure(card, 364);
    expect(words(card)).toBe(true);
  });

  it('never draws the words beside a menu, at any width', async () => {
    const card = await mount(withButtons([BACK, DASHBOARD, LAMP, WEATHER], ROW));
    for (let width = 260; width <= 560; width += 6) {
      await measure(card, width);
      expect(words(card) && menuButton(card) !== null, `at ${width}px`).toBe(false);
    }
  });

  it('retries words that did not fit once the row holds another number of buttons', async () => {
    const card = await mount(withButtons([BACK], ROW));
    type Signed = {
      _headerToolbar(): Record<string, unknown>;
      _toolbarLabelSignature(controls: unknown): string;
    };
    const signed = card as unknown as Signed;
    const one = signed._toolbarLabelSignature(signed._headerToolbar());

    card.setConfig(withButtons([BACK, DASHBOARD], ROW));
    await settle(card);
    const two = signed._toolbarLabelSignature(signed._headerToolbar());

    expect(two).not.toBe(one);
  });
});

//-----------------------------------------------------------------------------
// THE FOLD
//-----------------------------------------------------------------------------

/**
 * The filter folded, add, the switcher and refresh, as a shown toolbar draws them by default with
 * the date navigation and reset off. With three buttons the start group is five controls, which
 * need 34 + 5 × 36 + 4 × 8 + 8 + 108 + 8 + 36 = 406px on one line; three and the menu button,
 * 362px; two and the menu button, 318px; the filter and the menu button, 274px.
 */
const FOLD_ROW: Types.ToolbarConfig = { show: true, navigation: false, reset: false };
const THREE = [BACK, DASHBOARD, LAMP];

/** The rows of the start group's menu, drawn whether or not it is open. */
function menuRows(card: CardUnderTest): HTMLButtonElement[] {
  const dialog = root(card).querySelector('dialog.custom-menu');
  return dialog ? Array.from(dialog.querySelectorAll<HTMLButtonElement>('.custom-menu-row')) : [];
}

/** What the start group draws: buttons in the row, whether add is there, the menu's rows. */
function startShape(card: CardUnderTest): [number, boolean, number] {
  return [
    customButtons(card).length,
    root(card).querySelector('.toolbar-start > .add-event-button') !== null,
    menuRows(card).length,
  ];
}

describe('the start group where the row runs out of room', () => {
  it('draws every control while the row holds them, and no menu', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 406);

    expect(controls(card, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
      'toolbar-button custom-button',
      'toolbar-button custom-button',
      'toolbar-button custom-button',
    ]);
    expect(menuButton(card)).toBeNull();
  });

  it('folds the last buttons first, two at once, then one more a threshold, then add', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    const at = async (width: number) => {
      await measure(card, width);
      return startShape(card);
    };

    expect(await at(406)).toEqual([3, true, 0]);
    expect(await at(405)).toEqual([1, true, 2]);
    expect(await at(362)).toEqual([1, true, 2]);
    expect(await at(361)).toEqual([0, true, 3]);
    expect(await at(318)).toEqual([0, true, 3]);
    expect(await at(317)).toEqual([0, false, 4]);
    expect(await at(274)).toEqual([0, false, 4]);
    // Back by the same thresholds, the last two together.
    expect(await at(318)).toEqual([0, true, 3]);
    expect(await at(362)).toEqual([1, true, 2]);
    expect(await at(406)).toEqual([3, true, 0]);
  });

  it('draws the menu button where the folded controls were, after the ones it keeps', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 405);

    expect(controls(card, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button add-event-button',
      'toolbar-button custom-button',
      'toolbar-button custom-menu-button',
      'custom-menu',
    ]);
    expect(described(card).map(({ label }) => label)).toEqual(['Back']);
    expect(menuRows(card).map((row) => row.textContent!.trim())).toEqual([
      'Main dashboard',
      'Hall lamp',
    ]);
    const button = menuButton(card)!;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Menu');
    expect(button.getAttribute('title')).toBe('Menu');
    expect(button.querySelector('path')!.getAttribute('d')).toBe(mdiDotsVertical);
  });

  it("decides inside the resize observer's callback, with no frame or timer in between", async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 784);

    layout.card = 361;
    observerOf(card).callback([{ contentRect: { width: 361 } }]);
    await card.updateComplete;

    expect(startShape(card)).toEqual([0, true, 3]);
  });

  it('keeps the filter and the menu button however narrow the card, and never folds the end', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 200);

    expect(controls(card, '.toolbar-start')).toEqual([
      'toolbar-button legend-button',
      'legend-menu',
      'toolbar-button custom-menu-button',
      'custom-menu',
    ]);
    expect(controls(card, '.toolbar-end')).toEqual(['toolbar-button refresh-button']);
  });

  it('counts the magnifier beside refresh as reset is, and never folds it', async () => {
    // At 362px refresh alone leaves room for three and the menu; refresh and the magnifier for
    // two, as reset and refresh do.
    const card = await mount(withButtons(THREE, { ...FOLD_ROW, navigation: true, search: true }));
    await measure(card, 362);
    expect(startShape(card)).toEqual([0, true, 3]);

    await measure(card, 200);
    expect(controls(card, '.toolbar-end')).toEqual([
      'toolbar-button refresh-button',
      'toolbar-button search-button',
    ]);
  });

  it('keeps the first control there is with the filter off: add, or else the first button', async () => {
    const noFilter = await mount(withButtons(THREE, { ...FOLD_ROW, legend: false }));
    await measure(noFilter, 200);
    expect(controls(noFilter, '.toolbar-start')).toEqual([
      'toolbar-button add-event-button',
      'toolbar-button custom-menu-button',
      'custom-menu',
    ]);

    const noAdd = await mount(withButtons(THREE, { ...FOLD_ROW, legend: false, add_event: false }));
    await measure(noAdd, 200);
    expect(controls(noAdd, '.toolbar-start')).toEqual([
      'toolbar-button custom-button',
      'toolbar-button custom-menu-button',
      'custom-menu',
    ]);
    expect(described(noAdd).map(({ label }) => label)).toEqual(['Back']);
  });

  it('never folds one control alone into a menu', async () => {
    // The filter, add and one button need 318px; narrower, add and the button fold together.
    const card = await mount(withButtons([BACK], FOLD_ROW));
    await measure(card, 318);
    expect(startShape(card)).toEqual([1, true, 0]);
    await measure(card, 317);
    expect(startShape(card)).toEqual([0, false, 2]);
    expect(menuRows(card).map((row) => row.textContent!.trim())).toEqual(['Add event', 'Back']);

    // Two buttons alone: the first never folds, and the second would be alone in the menu.
    const two = await mount(
      withButtons([BACK, DASHBOARD], { ...FOLD_ROW, legend: false, add_event: false }),
    );
    await measure(two, 150);
    expect(startShape(two)).toEqual([2, false, 0]);
  });

  it('gives the start group the room of a switcher that is off, and counts reset beside refresh', async () => {
    // At 302px the switcher's row keeps only the filter; without the switcher all five fit
    // (34 + 212 + 8 + 36 = 290px).
    const noSwitcher = await mount(withButtons(THREE, { ...FOLD_ROW, view_switcher: false }));
    await measure(noSwitcher, 302);
    expect(startShape(noSwitcher)).toEqual([3, true, 0]);

    // At 362px refresh alone leaves room for three and the menu, reset and refresh for two.
    const withReset = await mount(withButtons(THREE, { ...FOLD_ROW, reset: true }));
    await measure(withReset, 362);
    expect(startShape(withReset)).toEqual([0, true, 3]);
    const without = await mount(withButtons(THREE, FOLD_ROW));
    await measure(without, 362);
    expect(startShape(without)).toEqual([1, true, 2]);
  });

  it('draws the narrowest start group on a card not measured yet, and the rest once it is', async () => {
    // A narrow card's first report would otherwise find every control wrapped onto two lines.
    const card = await mount(withButtons(THREE, FOLD_ROW), { width: null });
    expect(startShape(card)).toEqual([0, false, 4]);

    await measure(card, 784);
    expect(startShape(card)).toEqual([3, true, 0]);
  });

  it('gives the controls back on the first width even where it crosses no threshold', async () => {
    // With no switcher, filter, add and one button fit on one line from 202px, so 230px crosses
    // no threshold of the words' or the month's: only the first width's own render brings the
    // row back from the narrowest group (`_syncToolbarLabels`).
    const row = { ...FOLD_ROW, view_switcher: false };
    const card = await mount(withButtons([BACK], row), { width: null });
    expect(startShape(card)).toEqual([0, false, 2]);

    await measure(card, 230);
    expect(startShape(card)).toEqual([1, true, 0]);
  });

  it('fold in the editor as on the dashboard, and the menu button opens nothing there', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW), { flag: 'preview' });
    await measure(card, 344);
    expect(menuButton(card)).not.toBeNull();

    pointerClick(menuButton(card)!);
    await settle(card);
    expect(menu(card).open).toBe(false);
  });
});

describe('a control that holds focus as it folds', () => {
  it('hands focus to the menu button', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 406);
    customButtons(card)[2].focus();
    expect(root(card).activeElement).toBe(customButtons(card)[2]);

    await measure(card, 405);

    expect(root(card).activeElement).toBe(menuButton(card));
  });

  it('hands it over from add as well, and leaves a control that stays where it is', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 405);
    const add = root(card).querySelector<HTMLButtonElement>('.toolbar-start > .add-event-button')!;
    add.focus();

    await measure(card, 361);
    expect(root(card).activeElement).toBe(add);

    await measure(card, 317);
    expect(root(card).activeElement).toBe(menuButton(card));
  });
});

describe('a row that wraps where the arithmetic says it fits', () => {
  beforeEach(() => {
    stubLayout();
  });

  const debugged = () =>
    vi
      .mocked(Logger.debug)
      .mock.calls.filter(([message]) => String(message).startsWith('Toolbar row does not fit'))
      .length;

  it('folds one control more at that width, and keeps it folded there', async () => {
    // A theme fits three icons where the arithmetic counts four: the plan draws the filter, add,
    // Back and the menu button, the row wraps, and Back follows the others into the menu.
    const card = await mount(withButtons(THREE, FOLD_ROW));
    layout.startCapacity = 3;
    await measure(card, 405);
    expect(startShape(card)).toEqual([0, true, 3]);

    // Another render at the same width keeps it, even with the theme gone: never the other way.
    layout.startCapacity = null;
    card.isExpanded = !card.isExpanded;
    await settle(card);
    expect(startShape(card)).toEqual([0, true, 3]);
  });

  it('folds two at once where nothing was folded, and on until the row fits', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    layout.startCapacity = 3;
    await measure(card, 406);

    expect(startShape(card)).toEqual([0, true, 3]);
    expect(debugged()).toBe(2);
  });

  it('stops once nothing more can fold, the end group wrapping', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW), { width: null });
    layout.startCapacity = 0;
    await measure(card, 784);

    expect(startShape(card)).toEqual([0, false, 4]);
    expect(debugged()).toBe(3);
  });

  it('brings controls back through a new width alone', async () => {
    const card = await mount(withButtons(THREE, FOLD_ROW));
    layout.startCapacity = 3;
    await measure(card, 405);
    expect(startShape(card)).toEqual([0, true, 3]);

    layout.startCapacity = null;
    await measure(card, 406);
    expect(startShape(card)).toEqual([3, true, 0]);
    // The width it was recorded at plans afresh too: a new width cleared the record.
    await measure(card, 405);
    expect(startShape(card)).toEqual([1, true, 2]);
  });

  it("waits for the switcher's words to give way, and then fits beside its pictograms", async () => {
    // Words wider than the row: the pass that draws them gives them up for the pictograms, and
    // in that pass the start group concludes nothing from the words' width, or it would hold a
    // menu at 784px for the rest of the card's time there.
    layout.switcherWords = 800;
    const card = await mount(withButtons(THREE, FOLD_ROW));
    await measure(card, 784);
    await nextFrame(card);

    expect(root(card).querySelector('.view-switcher .toolbar-button-label')).toBeNull();
    expect(startShape(card)).toEqual([3, true, 0]);
  });

  it('concludes nothing from a card that is not laid out', async () => {
    // A width reported, and nothing laid out to read: every box the row draws is empty.
    layout.startCapacity = 0;
    const card = await mount(withButtons(THREE, FOLD_ROW), { width: null });
    observerOf(card).callback([{ contentRect: { width: 784 } }]);
    await settle(card);

    expect(startShape(card)).toEqual([3, true, 0]);
  });
});

//-----------------------------------------------------------------------------
// THE MENU
//-----------------------------------------------------------------------------

describe("the start group's menu", () => {
  const ROW: Types.ToolbarConfig = { show: true, navigation: false, reset: false };
  const BUTTONS = [
    BACK,
    DASHBOARD,
    { icon: 'mdi:calendar-plus', tap_action: { action: 'add-event' } },
  ];

  /**
   * A card at 344px, where the filter and add keep their places and the three buttons fold: two
   * and the menu button need 318px, three 362px.
   */
  async function mountFolded(
    buttons: unknown[] = BUTTONS,
    toolbar: Types.ToolbarConfig = ROW,
    overrides: Partial<Types.Config> = {},
    width = 344,
  ): Promise<CardUnderTest> {
    stubLayout();
    const card = await mount(withButtons(buttons, toolbar, overrides));
    await measure(card, width);
    expect(menuButton(card)).not.toBeNull();
    return card;
  }

  async function open(card: CardUnderTest, detail = 1): Promise<void> {
    menuButton(card)!.dispatchEvent(
      new MouseEvent('click', { detail, bubbles: true, composed: true }),
    );
    await settle(card);
  }

  const rows = (card: CardUnderTest) =>
    Array.from(menu(card).querySelectorAll<HTMLButtonElement>('.custom-menu-row'));

  it('opens as a modal list of every button, its icon and its name in words', async () => {
    const card = await mountFolded();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');

    await open(card);

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(menu(card).open).toBe(true);
    expect(menuButton(card)!.getAttribute('aria-expanded')).toBe('true');
    expect(menu(card).getAttribute('aria-label')).toBe('Menu');
    expect(
      rows(card).map((row) => [
        row.querySelector('ha-icon')!.getAttribute('icon'),
        row.textContent!.trim(),
        row.getAttribute('type'),
      ]),
    ).toEqual([
      ['mdi:arrow-left', 'Back', 'button'],
      ['mdi:view-dashboard-outline', 'Main dashboard', 'button'],
      ['mdi:calendar-plus', 'Add event', 'button'],
    ]);
  });

  it("runs a row's action and closes", async () => {
    const card = await mountFolded();
    const fired = listen(card);
    await open(card);

    pointerClick(rows(card)[1]);
    await settle(card);

    expect(fired).toEqual([
      { config: { entity: ANNA, tap_action: DASHBOARD.tap_action }, action: 'tap' },
    ]);
    expect(menu(card).open).toBe(false);
    expect(menuButton(card)!.getAttribute('aria-expanded')).toBe('false');
  });

  it('holds add, last to fold, as its first row, which opens the popover under the menu button', async () => {
    const popovers = spyOnPopovers();
    try {
      // At 300px only the filter stays: add and both buttons fold, add first, as drawn.
      const card = await mountFolded([BACK, DASHBOARD], ROW, {}, 300);
      expect(root(card).querySelector('.toolbar-start > .add-event-button')).toBeNull();
      expect(
        rows(card).map((row) => [
          row.querySelector('ha-icon')?.getAttribute('icon') ??
            row.querySelector('path')?.getAttribute('d'),
          row.textContent!.trim(),
        ]),
      ).toEqual([
        [mdiPlus, 'Add event'],
        ['mdi:arrow-left', 'Back'],
        ['mdi:view-dashboard-outline', 'Main dashboard'],
      ]);

      Object.defineProperty(menuButton(card)!, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 64, top: 8, right: 100, bottom: 44, width: 36, height: 36 }),
      });
      await open(card);
      pointerClick(rows(card)[0]);
      await settle(card);

      expect(menu(card).open).toBe(false);
      expect(popovers.opened).toHaveBeenCalledTimes(1);
      expect(popovers.opened.mock.calls[0][0].anchor).toMatchObject({
        x: 82,
        y: 26,
        below: true,
        pointerType: 'mouse',
      });
    } finally {
      popovers.stop();
    }
  });

  it('names its add row in English where Home Assistant has no word for it', async () => {
    stubLayout();
    const card = await mount(withButtons([BACK, DASHBOARD], ROW), { localize: NO_WORDS });
    await measure(card, 300);

    expect(rows(card)[0].textContent!.trim()).toBe('Add event');
    expect(menuButton(card)!.getAttribute('aria-label')).toBe('Menu');
    expect(menuButton(card)!.hasAttribute('title')).toBe(false);
  });

  it('opens the event popover under the menu button for a row that adds an event', async () => {
    const popovers = spyOnPopovers();
    try {
      const card = await mountFolded();
      Object.defineProperty(menuButton(card)!, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 120, top: 8, right: 156, bottom: 44, width: 36, height: 36 }),
      });
      await open(card);

      pointerClick(rows(card)[2]);

      expect(popovers.opened).toHaveBeenCalledTimes(1);
      expect(popovers.opened.mock.calls[0][0].anchor).toMatchObject({
        x: 138,
        y: 26,
        below: true,
        pointerType: 'mouse',
      });
    } finally {
      popovers.stop();
    }
  });

  it('takes focus itself when a press opens it, and leaves it to the dialog for a key', async () => {
    const card = await mountFolded();
    const focus = vi.spyOn(menu(card), 'focus');

    await open(card, 1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(root(card).activeElement).toBe(menu(card));
    expect(menu(card).getAttribute('tabindex')).toBe('-1');

    menu(card).close();
    await settle(card);
    focus.mockClear();
    await open(card, 0);
    expect(menu(card).open).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  });

  it('closes on Escape and hands focus back to the menu button', async () => {
    const card = await mountFolded();
    await open(card);

    menu(card).dispatchEvent(new Event('cancel'));
    menu(card).close();
    await settle(card);

    expect(menu(card).open).toBe(false);
    expect(menuButton(card)!.getAttribute('aria-expanded')).toBe('false');
    expect(root(card).activeElement).toBe(menuButton(card));
  });

  it('closes on a second press of its button, and on a press outside it', async () => {
    const card = await mountFolded();
    await open(card);
    await open(card);
    expect(menu(card).open).toBe(false);

    await open(card);
    vi.spyOn(menu(card), 'getBoundingClientRect').mockReturnValue(box(100, 300));
    menu(card).dispatchEvent(new MouseEvent('click', { clientX: 500, clientY: 10 }));
    await settle(card);
    expect(menu(card).open).toBe(false);
  });

  it('keeps a press on its button, or inside it, from becoming a press on the card', async () => {
    const card = await mountFolded(BUTTONS, ROW, { tap_action: { action: 'more-info' } });
    const fired = listen(card);

    tapWithPointer(menuButton(card)!);
    tapWithPointer(menu(card));
    expect(fired).toEqual([]);

    tapWithPointer(root(card).querySelector('.content-container')!);
    expect(fired).toHaveLength(1);
  });

  it('closes when the card changes width under it, and when editing starts', async () => {
    const card = await mountFolded();
    await open(card);
    await measure(card, 377);
    expect(menu(card).open).toBe(false);

    await open(card);
    card.editMode = true;
    await settle(card);
    expect(menu(card).open).toBe(false);
  });

  it('closes when the configuration takes the buttons away, and when the card leaves the page', async () => {
    const card = await mountFolded();
    await open(card);
    const node = menu(card);

    card.setConfig(withButtons([], ROW));
    await settle(card);
    expect(node.open).toBe(false);

    card.setConfig(withButtons(BUTTONS, ROW));
    await settle(card);
    await measure(card, 344);
    await open(card);
    expect(menu(card).open).toBe(true);
    const again = menu(card);
    card.remove();
    expect(again.open).toBe(false);
  });

  it("stays open through an update that has nothing to do with it, the filter's chips beside it", async () => {
    // The filter as chips never folds here, so its own menu may not stay open; that must not
    // close this one, which has a button of its own.
    const card = await mountFolded([BACK, DASHBOARD, LAMP, WEATHER], {
      show: true,
      navigation: false,
      reset: false,
      legend: 'chips',
    });
    await open(card);
    const node = menu(card);

    card.isExpanded = !card.isExpanded;
    await settle(card);

    expect(menu(card)).toBe(node);
    expect(node.open).toBe(true);
  });

  it("is placed with its right edge on the button's in a card read right to left", async () => {
    const card = await mountFolded();
    Object.defineProperty(menuButton(card)!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 300, top: 50, right: 336, bottom: 86, width: 36, height: 36 }),
    });
    Object.defineProperty(menu(card), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 200, bottom: 150, width: 200, height: 150 }),
    });
    const button = menuButton(card)!;
    const previous = vi.mocked(window.getComputedStyle).getMockImplementation()!;
    vi.mocked(window.getComputedStyle).mockImplementation((element, pseudo) => {
      const style = previous(element, pseudo);
      return element === button ? ({ ...style, direction: 'rtl' } as CSSStyleDeclaration) : style;
    });

    await open(card);

    expect([menu(card).style.left, menu(card).style.top]).toEqual(['136px', '90px']);
  });
});
