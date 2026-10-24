/**
 * The add-event button.
 *
 * The toolbar defaults to hidden, so every DOM gate built from default config sees no
 * button at all and would stay green if the option did nothing. Each on-state case below
 * is paired with the state that must draw nothing — the toolbar hidden, the button
 * switched off inside a shown one, or only read-only calendars — so the pair distinguishes
 * "the option works" from "the fixture happens to produce this".
 *
 * Every case shows the add button alone (`ADD_ONLY`): the view switcher beside it has
 * its own file, and keeping it out here keeps these assertions about one control.
 *
 * Where it goes is the header toolbar rule: in the title's row when there is a title, in a
 * slim row of its own when there is not, and — the half no other gate can see — with no
 * toolbar at all, a header byte for byte what it was before the toolbar existed.
 *
 * Two behaviors are pinned beyond the rendering: a press on the button must never become
 * a press on the card (the card captures the pointer for its own tap and hold actions),
 * and the dialog must preselect the first calendar that can actually take the event.
 */

import { mdiPlus } from '@mdi/js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as AddEvent from '../src/interaction/add-event';
import * as Dialogs from '../src/interaction/ha-calendar-dialogs';
import '../src/calendar-card-pro';

/** A shown toolbar holding the add button and nothing else. */
const ADD_ONLY = { show: true, view_switcher: false };

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

const handleAction = vi.hoisted(() => vi.fn());
vi.mock('../src/interaction/actions', () => ({ handleAction }));

const WRITABLE = 'calendar.anna';
const WRITABLE_2 = 'calendar.ben';
const READ_ONLY = 'calendar.holidays';

/** States for one writable calendar, a second writable one, and a read-only one. */
function states(): Record<string, Types.HassEntity> {
  return {
    [WRITABLE]: { entity_id: WRITABLE, state: 'off', attributes: { supported_features: 7 } },
    [WRITABLE_2]: { entity_id: WRITABLE_2, state: 'off', attributes: { supported_features: 1 } },
    [READ_ONLY]: { entity_id: READ_ONLY, state: 'off', attributes: { supported_features: 0 } },
  };
}

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  updateEvents(force?: boolean): Promise<void>;
  refreshEvents(): Promise<void>;
  _activePointerId: number | null;
  _holdIndicator: HTMLElement | null;
  readonly updateComplete: Promise<boolean>;
}

async function mount(
  overrides: Partial<Types.Config> = {},
  hassExtras: Record<string, unknown> = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig(overrides));
  // A `callApi` that answers, so no calendar counts as failing: the button leaves failing
  // calendars out, and without one every calendar on the card would fail to load.
  card.hass = {
    states: states(),
    locale: { language: 'en' },
    callApi: vi.fn().mockResolvedValue([]),
    // What Home Assistant 2026.10 answers for the one key the button asks for.
    localize: (key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : ''),
    ...hassExtras,
  };
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

interface LitLike {
  requestUpdate(): void;
}

function button(card: CardUnderTest): HTMLElement | null {
  return card.shadowRoot!.querySelector<HTMLElement>('.add-event-button');
}

function header(card: CardUnderTest): HTMLElement {
  return card.shadowRoot!.querySelector<HTMLElement>('.header-container')!;
}

/** Markup with Lit's per-render marker ids blanked, and nothing else touched. */
function markup(el: Element): string {
  return el.outerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '<!--?lit$-->');
}

/**
 * The header exactly as `dev` renders it, before the toolbar existed: one marker, then
 * the title or the zero-height placeholder, with the template's own whitespace around it.
 * A second binding in the header — even one rendering nothing — adds a marker and a text
 * node here, which a whitespace-collapsing snapshot would not see.
 */
const HEADER_BEFORE_TOOLBAR = {
  untitled:
    '<div class="header-container">\n        <!--?lit$--><div class="card-header-placeholder"></div>\n      </div>',
  titled:
    '<div class="header-container">\n        <!--?lit$--><h1 class="card-header"><!--?lit$-->Family</h1>\n      </div>',
};

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

/** Deliver a card width the way the browser does, then let the card re-render. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  );
  if (!observer) throw new Error('the card never asked to be observed');
  observer.callback([{ contentRect: { width } }]);
  await card.updateComplete;
}

/** A card measured wide enough for the button's label. */
async function mountWide(
  overrides: Partial<Types.Config> = {},
  hassExtras: Record<string, unknown> = {},
): Promise<CardUnderTest> {
  const card = await mount(overrides, hassExtras);
  await measure(card, 600);
  return card;
}

/** A bubbling, composed pointer event carrying the fields the card's gesture reads. */
function dispatchPointer(target: EventTarget, type: string, pointerId = 1): void {
  const event = new Event(type, { bubbles: true, composed: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    button: { value: 0 },
    isPrimary: { value: true },
    clientX: { value: 0 },
    clientY: { value: 0 },
  });
  target.dispatchEvent(event);
}

/** Stand in for Home Assistant having already loaded its event dialog. */
function dialogAlreadyLoaded(): void {
  const original = customElements.get.bind(customElements);
  vi.spyOn(customElements, 'get').mockImplementation((tag: string) =>
    tag === Dialogs.EVENT_EDITOR_DIALOG_TAG
      ? (class {} as CustomElementConstructor)
      : original(tag),
  );
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  handleAction.mockClear();
  document.body.innerHTML = '';
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe('writableCalendarIds', () => {
  it('keeps writable calendars in configuration order, once each', () => {
    const hass = { states: states() } as unknown as Types.Hass;

    expect(
      AddEvent.writableCalendarIds(hass, [
        READ_ONLY,
        { entity: WRITABLE_2 },
        WRITABLE,
        { entity: WRITABLE_2, event_type: 'all_day' },
        'calendar.missing',
      ]),
    ).toEqual([WRITABLE_2, WRITABLE]);
  });

  it('finds nothing before Home Assistant arrives', () => {
    expect(AddEvent.writableCalendarIds(null, [WRITABLE])).toEqual([]);
  });

  it('leaves out calendars that are failing to load', () => {
    const hass = { states: states() } as unknown as Types.Hass;

    expect(
      AddEvent.writableCalendarIds(hass, [READ_ONLY, WRITABLE_2, WRITABLE], [WRITABLE_2]),
    ).toEqual([WRITABLE]);
  });
});

describe('newEventDate', () => {
  const start = new Date(2026, 5, 15);
  const at = (day: number, hour = 0, ms = 0) => new Date(2026, 5, day, hour, 0, 0, ms);

  it('offers now while today is one of the days shown, and the first day otherwise', () => {
    expect({
      'first day': AddEvent.newEventDate(start, 2, at(15)),
      'last moment shown': AddEvent.newEventDate(start, 2, new Date(at(17).getTime() - 1)),
      'first moment not shown': AddEvent.newEventDate(start, 2, at(17)),
      'day after the last': AddEvent.newEventDate(start, 2, at(17, 10)),
      'day before the first': AddEvent.newEventDate(start, 2, at(14, 10)),
    }).toEqual({
      'first day': at(15),
      'last moment shown': new Date(at(17).getTime() - 1),
      'first moment not shown': start,
      'day after the last': start,
      'day before the first': start,
    });
  });
});

describe('add-event button rendering', () => {
  it.each([
    ['switched off', { entities: [WRITABLE] }],
    ['the toolbar is hidden', { entities: [WRITABLE], toolbar: { show: false, add_event: true } }],
    [
      'switched off inside a shown toolbar',
      { entities: [WRITABLE], toolbar: { ...ADD_ONLY, add_event: false } },
    ],
    ['switched on with only read-only calendars', { entities: [READ_ONLY], toolbar: ADD_ONLY }],
  ])('leaves the header exactly as it was when %s', async (_name, overrides) => {
    const untitled = await mount(overrides);
    const titled = await mount({ ...overrides, title: 'Family' });

    expect(button(untitled)).toBeNull();
    expect(markup(header(untitled))).toBe(HEADER_BEFORE_TOOLBAR.untitled);
    expect(markup(header(titled))).toBe(HEADER_BEFORE_TOOLBAR.titled);
    expect(untitled.shadowRoot!.querySelector('.card-toolbar')).toBeNull();
  });

  it('puts the button in the title row, after the title', async () => {
    const card = await mount({
      entities: [READ_ONLY, WRITABLE],
      toolbar: ADD_ONLY,
      title: 'Family',
    });
    const row = header(card);
    const [title, toolbar] = Array.from(row.children);

    expect(row.className).toBe('header-container has-toolbar');
    expect(title.outerHTML.replace(/<!--[^>]*-->/g, '')).toBe(
      '<h1 class="card-header">Family</h1>',
    );
    expect(toolbar.className).toBe('card-toolbar toolbar-in-title-row');
    expect(row.children).toHaveLength(2);
    expect(toolbar.querySelector('.toolbar-trailing > .add-event-button')).toBe(button(card));
    expect(card.shadowRoot!.querySelectorAll('.card-toolbar, .add-event-button')).toHaveLength(2);
  });

  it('keeps the button in the title row while a templated title is still resolving', async () => {
    // No `hass.connection`, so the template never resolves and the heading stays pending.
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      title: '{{ states("sensor.family") }}',
    });
    const [title, toolbar] = Array.from(header(card).children);

    expect(title.tagName).toBe('H1');
    expect(toolbar.classList.contains('toolbar-in-title-row')).toBe(true);
  });

  it('gives an untitled card a slim row of its own', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    const row = header(card);
    const [placeholder, toolbar] = Array.from(row.children);

    expect(row.className).toBe('header-container has-toolbar');
    expect(placeholder.className).toBe('card-header-placeholder');
    expect(toolbar.className).toBe('card-toolbar toolbar-own-row');
    expect(toolbar.contains(button(card))).toBe(true);
    expect(card.shadowRoot!.querySelectorAll('.card-toolbar, .add-event-button')).toHaveLength(2);
    // The content still follows the header directly, as card-mod styles expect.
    expect(row.nextElementSibling?.classList.contains('content-container')).toBe(true);
  });

  it("draws a native button with Home Assistant's label beside a plus", async () => {
    const card = await mountWide({ entities: [WRITABLE], toolbar: ADD_ONLY });
    const el = button(card)!;

    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.querySelector('svg path')?.getAttribute('d')).toBe(mdiPlus);
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.toolbar-button-label')?.textContent).toBe('Add event');
    // The visible label is the name; a second one in aria-label would only shadow it.
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it("uses Home Assistant's own translation of the label", async () => {
    const localize = (key: string) =>
      key === 'ui.components.calendar.event.add' ? 'Aggiungi evento' : '';
    const card = await mountWide({ entities: [WRITABLE], toolbar: ADD_ONLY }, { localize });

    expect(button(card)!.querySelector('.toolbar-button-label')?.textContent).toBe(
      'Aggiungi evento',
    );
  });

  it('draws only the icon, still named, when Home Assistant has no label to give', async () => {
    // Measured wide, so it is the missing string and not the width that drops the label.
    const card = await mountWide(
      { entities: [WRITABLE], toolbar: ADD_ONLY },
      { localize: () => '' },
    );
    const el = button(card)!;

    expect(el.classList.contains('icon-only')).toBe(true);
    expect(el.querySelector('.toolbar-button-label')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
    expect(el.getAttribute('aria-label')).toBe('Add event');
    // English is the last resort for assistive technology, never a tooltip on screen.
    expect(el.hasAttribute('title')).toBe(false);
  });
});

describe('the add-event label follows the width of the card', () => {
  /** What the button shows and what it is called, read off the DOM. */
  function shape(card: CardUnderTest) {
    const el = button(card)!;
    return {
      label: el.querySelector('.toolbar-button-label')?.textContent ?? null,
      iconOnly: el.classList.contains('icon-only'),
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
    };
  }

  const LABELED = { label: 'Add event', iconOnly: false, ariaLabel: null, title: null };
  const ICON_ONLY = { label: null, iconOnly: true, ariaLabel: 'Add event', title: 'Add event' };

  it('draws the icon alone, named, until the card has been measured', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    expect(shape(card)).toEqual(ICON_ONLY);
  });

  it.each([
    [479, ICON_ONLY],
    [480, LABELED],
    [900, LABELED],
  ])('at %ipx draws %o', async (width, expected) => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    await measure(card, width);
    expect(shape(card)).toEqual(expected);
  });

  it('drops the label again when the card narrows', async () => {
    const card = await mountWide({ entities: [WRITABLE], toolbar: ADD_ONLY });
    expect(shape(card)).toEqual(LABELED);

    await measure(card, 479);
    expect(shape(card)).toEqual(ICON_ONLY);
  });

  it('decides on the measurement itself, before the view fit settles', async () => {
    // `measure` awaits only the render, never the settle delay, so a label decided where
    // the column fit is decided would still be missing here.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    await measure(card, 600);

    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(shape(card)).toEqual(LABELED);
  });

  it('does not re-render a card that has no toolbar for it', async () => {
    const card = await mount({ entities: [WRITABLE] });
    const requestUpdate = vi.spyOn(card as unknown as LitLike, 'requestUpdate');

    await measure(card, 600);
    expect(requestUpdate).not.toHaveBeenCalled();

    // The control: the same measurement on a card with the button does ask.
    const withButton = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    const asks = vi.spyOn(withButton as unknown as LitLike, 'requestUpdate');
    await measure(withButton, 600);
    expect(asks).toHaveBeenCalled();
  });
});

describe('the card around the add-event button', () => {
  function haCard(card: CardUnderTest): Element {
    return card.shadowRoot!.querySelector('ha-card')!;
  }

  const TAPPABLE = { tap_action: { action: 'expand' as const } };

  it('is not a button while the add-event button is in it, and keeps its tab stop', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY, ...TAPPABLE });

    expect(button(card)).not.toBeNull();
    expect(haCard(card).hasAttribute('role')).toBe(false);
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
  });

  it('runs its tap action for Enter and Space on the card itself, beside the button', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY, ...TAPPABLE });

    for (const key of ['Enter', ' ']) {
      haCard(card).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }),
      );
    }
    expect(handleAction.mock.calls.map((call) => call[2])).toEqual(['tap', 'tap']);

    // The control: the same key on the button is the button's, as the next describe pins.
    button(card)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    expect(handleAction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the button is off', { entities: [WRITABLE] }],
    ['no calendar accepts events', { entities: [READ_ONLY], toolbar: ADD_ONLY }],
  ])('stays a button when %s', async (_name, overrides) => {
    const card = await mount({ ...overrides, ...TAPPABLE });

    expect(button(card)).toBeNull();
    expect(haCard(card).getAttribute('role')).toBe('button');
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
  });

  it('becomes a button again once every writable calendar is failing', async () => {
    const card = await mount(
      { entities: [READ_ONLY, WRITABLE], toolbar: ADD_ONLY, ...TAPPABLE },
      { callApi: vi.fn().mockRejectedValue(new Error('unavailable')) },
    );

    await vi.waitFor(() => expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull());
    expect(button(card)).toBeNull();
    expect(haCard(card).getAttribute('role')).toBe('button');
  });
});

describe('pressing the add-event button', () => {
  it('opens the dialog for the first writable calendar and refreshes once saved', async () => {
    dialogAlreadyLoaded();
    const card = await mount({ entities: [READ_ONLY, WRITABLE_2, WRITABLE], toolbar: ADD_ONLY });
    const refreshEvents = vi.spyOn(card, 'refreshEvents').mockResolvedValue();

    const shown = new Promise<CustomEvent>((resolve) =>
      document.body.addEventListener('show-dialog', (ev) => resolve(ev as CustomEvent), {
        once: true,
      }),
    );
    button(card)!.click();
    const detail = (await shown).detail as {
      dialogTag: string;
      dialogParams: { calendarId: string; updated: () => unknown };
    };

    expect(detail.dialogTag).toBe('dialog-calendar-event-editor');
    expect(detail.dialogParams.calendarId).toBe(WRITABLE_2);
    expect(refreshEvents).not.toHaveBeenCalled();

    // What the refresh does with a request already in flight is in
    // `dialog-writes.test.ts`; this pins only that saving asks for one.
    detail.dialogParams.updated();
    expect(refreshEvents).toHaveBeenCalledOnce();
  });

  it('preselects the first writable calendar that is not failing to load', async () => {
    dialogAlreadyLoaded();
    const callApi = vi.fn((_method: string, path: string) =>
      path.startsWith(`calendars/${WRITABLE_2}`)
        ? Promise.reject(new Error('unavailable'))
        : Promise.resolve([]),
    );
    const card = await mount(
      { entities: [READ_ONLY, WRITABLE_2, WRITABLE], toolbar: ADD_ONLY },
      { callApi },
    );
    await vi.waitFor(() => expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull());

    const shown = new Promise<CustomEvent>((resolve) =>
      document.body.addEventListener('show-dialog', (ev) => resolve(ev as CustomEvent), {
        once: true,
      }),
    );
    button(card)!.click();

    // The control is the case above: the same calendars, all loading, preselect WRITABLE_2.
    expect((await shown).detail.dialogParams.calendarId).toBe(WRITABLE);
  });

  it('draws nothing while every writable calendar is failing to load', async () => {
    const card = await mount(
      { entities: [READ_ONLY, WRITABLE], toolbar: ADD_ONLY },
      { callApi: vi.fn().mockRejectedValue(new Error('unavailable')) },
    );

    await vi.waitFor(() => expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull());
    expect(button(card)).toBeNull();
    expect(markup(header(card))).toBe(HEADER_BEFORE_TOOLBAR.untitled);
  });

  it.each([
    ['today, when the card starts today', {}, FROZEN_NOW],
    ['today, when the days shown include it', { start_date: '2026-06-15' }, FROZEN_NOW],
    [
      'the first day, when the days shown end before today',
      { start_date: '2026-06-15', days_to_show: 2 },
      new Date(2026, 5, 15),
    ],
    [
      'the first day, when the days shown start after today',
      { start_date: '2026-07-01' },
      new Date(2026, 6, 1),
    ],
  ])('starts a new event on %s', async (_name, overrides, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN_NOW);
    dialogAlreadyLoaded();
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY, ...overrides });

    const shown = new Promise<CustomEvent>((resolve) =>
      document.body.addEventListener('show-dialog', (ev) => resolve(ev as CustomEvent), {
        once: true,
      }),
    );
    button(card)!.click();

    expect((await shown).detail.dialogParams.selectedDate).toEqual(expected);
  });

  it("does not run the card's tap action, while a tap elsewhere on the card still does", async () => {
    dialogAlreadyLoaded();
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      tap_action: { action: 'expand' },
    });
    const el = button(card)!;
    // Nothing above the card may take the press for a tap on the card either.
    const clicksOnHost = vi.fn();
    card.addEventListener('click', clicksOnHost);

    dispatchPointer(el, 'pointerdown');
    dispatchPointer(el, 'pointerup');
    el.click();

    expect(card._activePointerId).toBeNull();
    expect(handleAction).not.toHaveBeenCalled();
    expect(clicksOnHost).not.toHaveBeenCalled();

    // The control: the same tap on the events reaches the card's gesture.
    const content = card.shadowRoot!.querySelector('.content-container')!;
    dispatchPointer(content, 'pointerdown');
    dispatchPointer(content, 'pointerup');
    expect(handleAction).toHaveBeenCalledOnce();
    expect(handleAction.mock.calls[0][2]).toBe('tap');
  });

  it("does not run the card's hold action on a long press, while a hold elsewhere does", async () => {
    vi.useFakeTimers();
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      hold_action: { action: 'expand' },
    });
    const el = button(card)!;

    dispatchPointer(el, 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    expect(card._holdIndicator).toBeNull();
    dispatchPointer(el, 'pointerup');
    expect(handleAction).not.toHaveBeenCalled();

    const content = card.shadowRoot!.querySelector('.content-container')!;
    dispatchPointer(content, 'pointerdown', 2);
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    dispatchPointer(content, 'pointerup', 2);
    expect(handleAction).toHaveBeenCalledOnce();
    expect(handleAction.mock.calls[0][2]).toBe('hold');
  });

  it("lets keys through to Home Assistant without running the card's tap action", async () => {
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      tap_action: { action: 'expand' },
    });
    const seen: string[] = [];
    const listener = (ev: Event) => seen.push((ev as KeyboardEvent).key);
    document.addEventListener('keydown', listener);

    try {
      button(card)!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
      );
    } finally {
      document.removeEventListener('keydown', listener);
    }

    expect(seen).toEqual(['Enter']);
    expect(handleAction).not.toHaveBeenCalled();
  });
});
