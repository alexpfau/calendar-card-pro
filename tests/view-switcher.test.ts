/**
 * The header toolbar's view switcher, on the real card.
 *
 * The toolbar defaults to hidden, so every DOM gate built from default config sees no
 * switcher and would stay green if it did nothing; each case here turns it on. The pure
 * halves — the remembered choice and the width fit — have files of their own
 * (`view-choice.test.ts`, the view resolvers). This file pins how the card joins them:
 * which view is marked, which are offered at a width, that a switch draws without
 * fetching, that it survives a reload and not an edit, and that editing neither uses it
 * nor disturbs it. It also pins the action row the switcher sits in: its place between the
 * row's start and end groups, the press guard on both toolbar rows, and the widths from
 * which the switcher names its views in words rather than pictograms.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import {
  computeColumnThresholdPx,
  computeColumnThresholdPxFor,
  resolveColumnFit,
  resolveColumnFitIfPicked,
} from '../src/config/view';
import { cardStyles } from '../src/rendering/styles';
import {
  VIEW_CHOICE_STORAGE_KEY,
  configFingerprint,
  readViewChoice,
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

const handleAction = vi.hoisted(() => vi.fn());
vi.mock('../src/interaction/actions', () => ({ handleAction }));

/**
 * A shown toolbar holding the switcher and nothing else. A shown toolbar draws add, the date
 * navigation, reset and the calendar filter by default, so each is switched off here and
 * turned back on only where a case is about it.
 */
const SWITCHER_ONLY: Types.ToolbarConfig = {
  show: true,
  add_event: false,
  navigation: false,
  reset: false,
  refresh: false,
  legend: false,
};

/** The switcher beside the add button, and nothing else. */
const SWITCHER_AND_ADD: Types.ToolbarConfig = { ...SWITCHER_ONLY, add_event: true };

/**
 * Seven days: at the default 140px a day, Columns needs about a thousand pixels, while Grid
 * sheds days down to one and fits almost anywhere. So a 400px card offers List and Grid,
 * and a 1400px card offers all three.
 */
const BASE: Partial<Types.Config> = {
  entities: ['calendar.anna'],
  days_to_show: 7,
  toolbar: SWITCHER_ONLY,
};

const NARROW = 400;
const WIDE = 1400;

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  preview: boolean;
  editMode: boolean;
  readonly effectiveView: Types.EffectiveView;
  readonly requestedView: Types.EffectiveView;
  _columnCount: number;
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

function hass(localize?: (key: string) => string): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { supported_features: 7 },
      },
    },
    locale: { language: 'en' },
    callApi,
    localize:
      localize ??
      ((key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : '')),
  };
}

/** The configuration a card is given, built as Home Assistant would hand it over. */
function configFor(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ ...BASE, ...overrides });
}

async function mount(
  overrides: Partial<Types.Config> = {},
  options: { localize?: (key: string) => string; flag?: 'preview' | 'editMode' } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(configFor(overrides));
  if (options.flag) card[options.flag] = true;
  card.hass = hass(options.localize);
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

/** Deliver a width the way the browser does, and let the settle delay run out. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  );
  if (!observer) throw new Error('the card never asked to be observed');
  observer.callback([{ contentRect: { width } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await card.updateComplete;
}

function switcher(card: CardUnderTest): HTMLElement | null {
  return card.shadowRoot!.querySelector<HTMLElement>('.view-switcher');
}

function segments(card: CardUnderTest): HTMLButtonElement[] {
  return Array.from(card.shadowRoot!.querySelectorAll<HTMLButtonElement>('.view-switcher-segment'));
}

function segment(card: CardUnderTest, view: Types.EffectiveView): HTMLButtonElement {
  return card.shadowRoot!.querySelector<HTMLButtonElement>(
    `.view-switcher-segment[data-view="${view}"]`,
  )!;
}

/** The view each segment stands for, and how it is drawn. */
function describeSegments(card: CardUnderTest) {
  return segments(card).map((button) => ({
    view: button.dataset.view,
    pressed: button.getAttribute('aria-pressed'),
    disabled: button.getAttribute('aria-disabled'),
  }));
}

async function press(card: CardUnderTest, view: Types.EffectiveView): Promise<void> {
  segment(card, view).click();
  await card.updateComplete;
}

/** Which view the content area draws, read from the card's own class. */
function drawnView(card: CardUnderTest): string {
  const classes = card.shadowRoot!.querySelector('ha-card')!.classList;
  if (classes.contains('grid-view')) return 'grid';
  if (classes.contains('column-view')) return 'column';
  return 'list';
}

/** A toolbar element's own class: its first, or its second for a `.toolbar-button`. */
function kind(el: Element): string {
  return el.classList[0] === 'toolbar-button' ? el.classList[1] : el.classList[0];
}

/** One element of the card's own, which the case expects to be there. */
function part(card: CardUnderTest, selector: string): HTMLElement {
  const el = card.shadowRoot!.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`the card draws no ${selector}`);
  return el;
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  handleAction.mockClear();
  callApi.mockReset();
  callApi.mockResolvedValue([]);
  document.body.innerHTML = '';
  localStorage.clear();
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

describe('the view switcher', () => {
  it('confirms the fixture: List and Grid fit a narrow card, all three a wide one', async () => {
    // Guards the widths every case below relies on. Without it a change to the column or
    // grid defaults would quietly turn the narrow cases into wide ones.
    const card = await mount();

    await measure(card, NARROW);
    expect(describeSegments(card).map((entry) => entry.disabled)).toEqual([null, 'true', null]);

    await measure(card, WIDE);
    expect(describeSegments(card).map((entry) => entry.disabled)).toEqual([null, null, null]);
  });

  it.each([
    ['the toolbar is hidden', { toolbar: { show: false, view_switcher: true } }],
    ['the switcher is off', { toolbar: { ...SWITCHER_ONLY, view_switcher: false } }],
  ])('draws nothing when %s', async (_name, overrides) => {
    const card = await mount(overrides);

    expect(switcher(card)).toBeNull();
    expect(card.shadowRoot!.querySelector('.card-toolbar')).toBeNull();
  });

  it('offers List, Columns and Grid in that order, the configured view marked', async () => {
    const card = await mount({ view: 'column' });

    expect(switcher(card)!.getAttribute('role')).toBe('group');
    expect(describeSegments(card)).toEqual([
      { view: 'list', pressed: 'false', disabled: null },
      { view: 'column', pressed: 'true', disabled: null },
      { view: 'grid', pressed: 'false', disabled: null },
    ]);
    // Native buttons, so each is a tab stop and Enter and Space need no handling of ours.
    for (const button of segments(card)) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    }
  });

  it('sits in the middle of the action row: filter and add before it, reset and refresh after', async () => {
    const card = await mount({ toolbar: { show: true, reset: true, refresh: true } });
    const root = card.shadowRoot!;
    const actions = root.querySelector('.toolbar-actions')!;
    const kinds = (parent: Element) => Array.from(parent.children).map(kind);

    // The action row, then the heading row, which takes the placeholder in where a title
    // would be: at the start of the block it shares with the month.
    expect(
      Array.from(root.querySelector('.header-container')!.children).map((row) => row.className),
    ).toEqual(['card-toolbar toolbar-actions', 'card-toolbar toolbar-heading']);
    expect(root.querySelector('.toolbar-identity')!.firstElementChild!.className).toBe(
      'card-header-placeholder',
    );
    expect(kinds(actions)).toEqual(['toolbar-start', 'view-switcher', 'toolbar-end']);
    expect(kinds(actions.querySelector('.toolbar-start')!)).toEqual([
      'legend-button',
      'legend-menu',
      'add-event-button',
    ]);
    expect(kinds(actions.querySelector('.toolbar-end')!)).toEqual([
      'reset-button',
      'refresh-button',
    ]);
    // None of them is drawn in the heading row as well.
    expect(
      root.querySelectorAll('.toolbar-heading .toolbar-button, .toolbar-heading .view-switcher'),
    ).toHaveLength(0);
  });

  it("draws each view's pictogram in the text color", async () => {
    const card = await mount();
    const icon = segment(card, 'grid').querySelector('svg.view-switcher-icon')!;

    expect(icon.getAttribute('viewBox')).toBe('0 0 48 32');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('g')!.getAttribute('fill')).toBe('currentColor');
    expect(icon.querySelectorAll('rect')).toHaveLength(11);
  });

  it('switches the layout without fetching anything', async () => {
    const card = await mount();
    await measure(card, WIDE);
    const fetchesBefore = callApi.mock.calls.length;

    await press(card, 'grid');
    expect(card.effectiveView).toBe('grid');
    expect(drawnView(card)).toBe('grid');
    expect(segment(card, 'grid').getAttribute('aria-pressed')).toBe('true');
    expect(segment(card, 'list').getAttribute('aria-pressed')).toBe('false');

    await press(card, 'column');
    expect(drawnView(card)).toBe('column');
    expect(card._columnCount).toBe(7);

    await press(card, 'list');
    expect(drawnView(card)).toBe('list');

    vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
    expect(callApi.mock.calls.length).toBe(fetchesBefore);
  });

  /** A bubbling, composed pointer event carrying the fields the card's gesture reads. */
  function dispatchPointer(target: EventTarget, type: string): void {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      isPrimary: { value: true },
      clientX: { value: 0 },
      clientY: { value: 0 },
    });
    target.dispatchEvent(event);
  }

  it.each([
    ['a segment', (card: CardUnderTest) => segment(card, 'grid')],
    // The gray rim around the segments belongs to the switcher, not to any button.
    ['the track around the segments', (card: CardUnderTest) => switcher(card)!],
    // The gaps between the action row's controls belong to the row, not to any button.
    ['a gap in the action row', (card: CardUnderTest) => part(card, '.toolbar-actions')],
    ['the gap between the filter and add', (card: CardUnderTest) => part(card, '.toolbar-start')],
    // So do the heading row's: around the month, and between it and the arrows.
    ['a gap in the heading row', (card: CardUnderTest) => part(card, '.toolbar-heading')],
    ['the room around the month', (card: CardUnderTest) => part(card, '.toolbar-month')],
    // The block the month shares with the title is the row's too, and so is the empty
    // placeholder an untitled card draws there: only a title is the card's.
    ['the block holding the month', (card: CardUnderTest) => part(card, '.toolbar-identity')],
    [
      "an untitled card's placeholder over the month",
      (card: CardUnderTest) => part(card, '.toolbar-identity > .card-header-placeholder'),
    ],
    [
      "the arrows' group at the row's end",
      (card: CardUnderTest) => part(card, '.toolbar-heading-end'),
    ],
  ])(
    "never runs the card's tap action from %s, while the rest of the card still does",
    async (_name, target) => {
      const card = await mount({ toolbar: { show: true }, tap_action: { action: 'more-info' } });
      const el = target(card);
      // Nothing above the card may take the press for a tap on the card either.
      const clicksOnHost = vi.fn();
      card.addEventListener('click', clicksOnHost);

      dispatchPointer(el, 'pointerdown');
      dispatchPointer(el, 'pointerup');
      el.click();
      await card.updateComplete;
      expect(handleAction).not.toHaveBeenCalled();
      expect(clicksOnHost).not.toHaveBeenCalled();

      // The control: the same press on the events reaches the card's gesture.
      const content = card.shadowRoot!.querySelector('.content-container')!;
      dispatchPointer(content, 'pointerdown');
      dispatchPointer(content, 'pointerup');
      expect(handleAction).toHaveBeenCalledOnce();
    },
  );

  it("still runs the card's tap action from the title drawn over the month", async () => {
    const card = await mount({
      title: 'Family',
      toolbar: { show: true },
      tap_action: { action: 'more-info' },
    });
    const title = part(card, '.toolbar-heading .toolbar-identity > h1.card-header');
    // The toolbar is drawn, so this is the small label over the month, inside the heading row
    // whose every other press is kept from the card.
    expect(title.nextElementSibling?.className).toBe('toolbar-month with-picker');

    dispatchPointer(title, 'pointerdown');
    dispatchPointer(title, 'pointerup');
    expect(handleAction).toHaveBeenCalledOnce();
    expect(handleAction.mock.calls[0][2]).toBe('tap');
  });

  it('stops the card presenting itself as a button around it, and keeps its tab stop', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const haCard = card.shadowRoot!.querySelector('ha-card')!;

    expect(haCard.hasAttribute('role')).toBe(false);
    expect(haCard.getAttribute('tabindex')).toBe('0');
  });
});

describe('narrow cards', () => {
  it('dims a view that cannot fit, and ignores a press on it', async () => {
    const card = await mount();
    await measure(card, NARROW);

    expect(describeSegments(card)).toEqual([
      { view: 'list', pressed: 'true', disabled: null },
      { view: 'column', pressed: 'false', disabled: 'true' },
      { view: 'grid', pressed: 'false', disabled: null },
    ]);
    expect(segment(card, 'column').classList.contains('unavailable')).toBe(true);

    await press(card, 'column');
    expect(drawnView(card)).toBe('list');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it('offers a view again once the card is wide enough for it', async () => {
    const card = await mount();
    await measure(card, NARROW);
    expect(segment(card, 'column').getAttribute('aria-disabled')).toBe('true');

    // The layout on screen does not change here, so only the offer moves.
    await measure(card, WIDE);
    expect(drawnView(card)).toBe('list');
    expect(segment(card, 'column').hasAttribute('aria-disabled')).toBe(false);
  });

  it('marks the list a remembered view falls back to, and keeps the memory for wider', async () => {
    const card = await mount();
    await measure(card, WIDE);
    await press(card, 'column');

    await measure(card, NARROW);
    expect(drawnView(card)).toBe('list');
    expect(segment(card, 'list').getAttribute('aria-pressed')).toBe('true');
    expect(segment(card, 'column').getAttribute('aria-disabled')).toBe('true');

    await measure(card, WIDE);
    expect(drawnView(card)).toBe('column');
  });

  it('makes the marked list the choice when it is pressed over a fallen-back view', async () => {
    const config = configFor();
    const card = await mount();
    await measure(card, WIDE);
    await press(card, 'column');
    await measure(card, NARROW);

    await press(card, 'list');
    expect(readViewChoice(configFingerprint(config))).toBeUndefined();

    await measure(card, WIDE);
    expect(drawnView(card)).toBe('list');
  });

  /**
   * A view on screen keeps its layout until the card is half a hysteresis band narrower than
   * it needs to enter it. A window narrowing into that band leaves Columns drawn — and the
   * switcher once judged a pick by the entry threshold, so after switching away Columns was
   * dimmed and could not be picked again, though the card had drawn it a moment before.
   */
  it('keeps a layout on offer after switching away from it inside the hysteresis band', async () => {
    const config = configFor();
    const inBand = computeColumnThresholdPx(config, 'column') - 8;
    // The two rules this case lies between: entering refuses the width, staying allows it.
    expect(resolveColumnFit('column', config, inBand, null).view).toBe('list');
    expect(resolveColumnFitIfPicked('column', config, inBand).view).toBe('column');

    const card = await mount();
    await measure(card, WIDE);
    await press(card, 'column');
    await measure(card, inBand);
    expect(drawnView(card)).toBe('column');

    await press(card, 'list');
    expect(segment(card, 'column').hasAttribute('aria-disabled')).toBe(false);

    await press(card, 'column');
    expect(drawnView(card)).toBe('column');
    expect(card._columnCount).toBe(7);

    // The next settled measurement must agree with the press, not undo it.
    await measure(card, inBand);
    expect(drawnView(card)).toBe('column');
  });

  /**
   * The same band from the other side: a card loaded there opens on the list, because the
   * configured layout needs its entry width to start in. It is still offered, exactly as it
   * would be after a detour through another layout, and pressing it draws it.
   */
  it('offers the configured layout the list stands in for inside the band, and draws it', async () => {
    const config = configFor({ view: 'column' });
    const inBand = computeColumnThresholdPx(config, 'column') - 8;

    const card = await mount({ view: 'column' });
    await measure(card, inBand);
    expect(drawnView(card)).toBe('list');
    expect(segment(card, 'column').hasAttribute('aria-disabled')).toBe(false);

    await press(card, 'column');
    expect(drawnView(card)).toBe('column');
    expect(card._columnCount).toBe(7);

    await measure(card, inBand);
    expect(drawnView(card)).toBe('column');
  });

  /**
   * A pick is fitted by the pick rule until a measurement confirms it. The first
   * measurement of a fresh card has nothing to start from, so without that a reload at the
   * width the pick was granted at drew the list, and so did a press made before the width
   * settled.
   */
  it('keeps a pick made inside the band across a reload at the same width', async () => {
    const inBand = computeColumnThresholdPx(configFor(), 'column') - 8;
    const first = await mount();
    await measure(first, WIDE);
    await press(first, 'column');
    await measure(first, inBand);
    expect(drawnView(first)).toBe('column');
    first.remove();

    const second = await mount();
    await measure(second, inBand);
    expect(drawnView(second)).toBe('column');
    expect(second._columnCount).toBe(7);
  });

  it('keeps a pick made before the first width settled', async () => {
    const inBand = computeColumnThresholdPx(configFor(), 'column') - 8;
    const card = await mount();
    await press(card, 'column');
    await measure(card, inBand);
    expect(drawnView(card)).toBe('column');
  });

  it('draws no switcher when only one view fits', async () => {
    const card = await mount({ time_grid: { min_days_to_show: 7 } });
    await measure(card, NARROW);

    expect(switcher(card)).toBeNull();
    expect(card.shadowRoot!.querySelector('.card-toolbar')).toBeNull();

    await measure(card, WIDE);
    expect(switcher(card)).not.toBeNull();
  });
});

describe('what a device remembers', () => {
  it('keeps a switch across a reload of the same configuration', async () => {
    const first = await mount();
    await measure(first, WIDE);
    await press(first, 'grid');
    first.remove();

    const second = await mount();
    expect(second.effectiveView).toBe('grid');
    expect(segment(second, 'grid').getAttribute('aria-pressed')).toBe('true');
  });

  it('resets when the configuration changes', async () => {
    const card = await mount();
    await measure(card, WIDE);
    await press(card, 'grid');

    card.setConfig(configFor({ title: 'Family' }));
    await card.updateComplete;
    expect(card.effectiveView).toBe('list');
  });

  /**
   * The stated limit of keying a choice by the configuration: nothing tells a card which
   * configuration it replaced, because Home Assistant builds a fresh card for a changed one.
   * So a configuration changed back to exactly what it was finds its choice again. Pinned so
   * the docs that say so stay true.
   */
  it('finds the choice again when the configuration is changed back exactly', async () => {
    const card = await mount();
    await measure(card, WIDE);
    await press(card, 'grid');

    card.setConfig(configFor({ title: 'Family' }));
    await card.updateComplete;
    card.setConfig(configFor());
    await card.updateComplete;
    expect(card.effectiveView).toBe('grid');
  });

  it('stores nothing for the configured view itself', async () => {
    const card = await mount({ view: 'grid' });
    await measure(card, WIDE);
    await press(card, 'list');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).not.toBeNull();

    await press(card, 'grid');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it('ignores a remembered view once the switcher is turned off', async () => {
    const first = await mount();
    await measure(first, WIDE);
    await press(first, 'grid');
    first.remove();

    const off = await mount({ toolbar: { ...SWITCHER_ONLY, view_switcher: false } });
    expect(off.effectiveView).toBe('list');
  });

  it('works without storage, for as long as the page lives', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const card = await mount();
    await measure(card, WIDE);

    await press(card, 'grid');
    expect(drawnView(card)).toBe('grid');
    setItem.mockRestore();
  });
});

describe.each<'preview' | 'editMode'>(['preview', 'editMode'])('while %s is set', (flag) => {
  it('marks the configured view, offers every view, and a press changes nothing', async () => {
    const card = await mount({ view: 'column' }, { flag });
    await measure(card, NARROW);

    expect(drawnView(card)).toBe('column');
    expect(describeSegments(card)).toEqual([
      { view: 'list', pressed: 'false', disabled: null },
      { view: 'column', pressed: 'true', disabled: null },
      { view: 'grid', pressed: 'false', disabled: null },
    ]);

    await press(card, 'grid');
    expect(drawnView(card)).toBe('column');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toBeNull();
  });

  it("shows the configured view over a remembered one, and leaves the dashboard's fit alone", async () => {
    const card = await mount();
    await measure(card, WIDE);
    await press(card, 'column');
    expect(card._columnCount).toBe(7);

    card[flag] = true;
    await card.updateComplete;
    expect(drawnView(card)).toBe('list');
    expect(segment(card, 'list').getAttribute('aria-pressed')).toBe('true');

    // A width measured while editing keeps fitting the view the dashboard asks for.
    await measure(card, 1200);
    card[flag] = false;
    await card.updateComplete;
    expect(drawnView(card)).toBe('column');
    expect(card._columnCount).toBe(7);
  });

  /**
   * The configured view shown while editing is fitted for that display alone. A resize that
   * changes its day columns, and nothing the dashboard draws, must still re-render it.
   */
  it('refits the configured view it shows when a resize changes only its day columns', async () => {
    const overrides: Partial<Types.Config> = { view: 'column', column: { min_days_to_show: 1 } };
    const config = configFor(overrides);
    const six = computeColumnThresholdPxFor(config, 6, 'column') + 20;
    const five = computeColumnThresholdPxFor(config, 5, 'column') + 20;
    expect(resolveColumnFit('column', config, six, null).columns).toBe(6);
    expect(resolveColumnFit('column', config, five, null).columns).toBe(5);
    // Both on one side of the switcher's threshold, so no change to its words re-renders.
    const threshold = Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH;
    expect(five >= threshold).toBe(six >= threshold);

    const card = await mount(overrides);
    await measure(card, WIDE);
    await press(card, 'list');

    card[flag] = true;
    await card.updateComplete;
    await measure(card, six);
    expect(card.shadowRoot!.querySelectorAll('.day-column')).toHaveLength(6);

    await measure(card, five);
    expect(card.shadowRoot!.querySelectorAll('.day-column')).toHaveLength(5);
  });
});

describe('words or pictograms', () => {
  const WITH_SWITCHER = Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH;
  const { TOOLBAR_COMMAND_WIDTH: ICON, TOOLBAR_COMMAND_GAP: GAP } = Constants.UI;

  /** Home Assistant's words for every command the action row can hold. */
  const EVERY_LABEL: Readonly<Record<string, string>> = {
    'ui.components.calendar.event.add': 'Add event',
    'ui.common.reset': 'Reset',
    'ui.common.refresh': 'Refresh',
    'ui.components.calendar.my_calendars': 'My calendars',
  };

  /**
   * Home Assistant answering with every label but one.
   *
   * @param missing - The key it has no words for, if any
   * @returns A `localize`
   */
  function labelsWithout(missing?: string): (key: string) => string {
    return (key) => (key === missing ? '' : (EVERY_LABEL[key] ?? ''));
  }

  /** A shown toolbar with every control off, for a case to turn on what it is about. */
  const NOTHING: Types.ToolbarConfig = {
    show: true,
    navigation: false,
    add_event: false,
    view_switcher: false,
    reset: false,
    refresh: false,
    legend: false,
  };

  /** Every command the action row can hold, beside the date navigation. */
  const EVERY_COMMAND: Types.ToolbarConfig = {
    ...NOTHING,
    navigation: true,
    add_event: true,
    view_switcher: true,
    reset: true,
    refresh: true,
    legend: 'menu',
  };

  /** How many controls the action row draws, and how many of them are words. */
  function actionRowWords(card: CardUnderTest) {
    const controls = Array.from(
      card.shadowRoot!.querySelectorAll(
        '.toolbar-actions .toolbar-button, .toolbar-actions .view-switcher-segment',
      ),
    );
    return {
      controls: controls.length,
      words: controls.filter((control) => control.querySelector('.toolbar-button-label')).length,
    };
  }

  function wordsDrawn(card: CardUnderTest): boolean {
    return card.shadowRoot!.querySelector('.toolbar-button-label') !== null;
  }

  /** Render again with nothing changed, as any update from Home Assistant would. */
  async function rerender(card: CardUnderTest): Promise<void> {
    (card as unknown as { requestUpdate(): void }).requestUpdate();
    await card.updateComplete;
  }

  it.each([
    ['the switcher alone', SWITCHER_ONLY, WITH_SWITCHER],
    ['the switcher beside the add button', SWITCHER_AND_ADD, WITH_SWITCHER + ICON],
  ])(
    'names the views of %s in words from its width, and draws their pictograms below it',
    async (_name, toolbar, threshold) => {
      const card = await mount({ toolbar });

      await measure(card, threshold - 1);
      for (const button of segments(card)) {
        expect(button.querySelector('.toolbar-button-label')).toBeNull();
        expect(button.querySelector('svg.view-switcher-icon')).not.toBeNull();
        expect(button.classList.contains('icon-only')).toBe(true);
      }
      expect(segment(card, 'column').getAttribute('aria-label')).toBe('Columns');
      expect(segment(card, 'column').getAttribute('title')).toBe('Columns');

      // Words, and only words: no pictogram beside them, and nothing to name them twice.
      await measure(card, threshold);
      expect(segments(card).map((button) => button.textContent!.trim())).toEqual([
        'List',
        'Columns',
        'Grid',
      ]);
      for (const button of segments(card)) {
        expect(button.querySelector('svg')).toBeNull();
        expect(button.classList.contains('icon-only')).toBe(false);
      }
      expect(segment(card, 'column').hasAttribute('aria-label')).toBe(false);
      expect(segment(card, 'column').hasAttribute('title')).toBe(false);
    },
  );

  /**
   * The switcher's words need its own width, and every command beside it its icon, with a gap
   * between two in a group. The date navigation and
   * the filter's chips are the heading row's, and count for nothing here. Each width is written
   * out rather than worked out, so a change to the rule shows up as a change to this table.
   */
  it.each<[string, Types.ToolbarConfig, number, number]>([
    ['the switcher alone', { view_switcher: true }, WITH_SWITCHER, 3],
    ['the switcher and add', { view_switcher: true, add_event: true }, WITH_SWITCHER + ICON, 4],
    ['the switcher and reset', { view_switcher: true, reset: true }, WITH_SWITCHER + ICON, 4],
    [
      'the switcher, add and the folded filter',
      { view_switcher: true, add_event: true, legend: 'menu' },
      WITH_SWITCHER + 2 * ICON + GAP,
      5,
    ],
    [
      'the switcher, add and reset',
      { view_switcher: true, add_event: true, reset: true },
      WITH_SWITCHER + 2 * ICON,
      5,
    ],
    [
      'the switcher, reset and refresh',
      { view_switcher: true, reset: true, refresh: true },
      WITH_SWITCHER + 2 * ICON + GAP,
      5,
    ],
    ['every command', EVERY_COMMAND, WITH_SWITCHER + 4 * ICON + 2 * GAP, 7],
    [
      'the switcher and add, the filter drawn as chips',
      { view_switcher: true, add_event: true, legend: 'chips' },
      WITH_SWITCHER + ICON,
      4,
    ],
  ])('names the views beside %s from its own width', async (_name, controls, threshold, count) => {
    const card = await mount(
      { toolbar: { ...NOTHING, ...controls } },
      { localize: labelsWithout() },
    );

    await measure(card, threshold - 1);
    expect(actionRowWords(card)).toEqual({ controls: count, words: 0 });

    await measure(card, threshold);
    expect(actionRowWords(card)).toEqual({ controls: count, words: 3 });
  });

  it('keeps every command an icon at any width, named by its tooltip', async () => {
    const card = await mount({ toolbar: EVERY_COMMAND }, { localize: labelsWithout() });
    await measure(card, WIDE * 2);

    const commands = Array.from(
      card.shadowRoot!.querySelectorAll<HTMLButtonElement>('.toolbar-actions .toolbar-button'),
    );
    expect(commands.map((button) => button.getAttribute('title'))).toEqual([
      'My calendars',
      'Add event',
      'Reset',
      'Refresh',
    ]);
    for (const button of commands) {
      expect(button.querySelector('.toolbar-button-label')).toBeNull();
      expect(button.querySelector('svg.toolbar-button-icon')).not.toBeNull();
      expect(button.getAttribute('aria-label')).toBe(button.getAttribute('title'));
    }
    // The views beside them are words at this width.
    expect(actionRowWords(card).words).toBe(3);

    // Without the switcher, the row has no words at all.
    document.body.innerHTML = '';
    const noSwitcher = await mount(
      { toolbar: { ...EVERY_COMMAND, view_switcher: false } },
      { localize: labelsWithout() },
    );
    await measure(noSwitcher, WIDE * 2);
    expect(wordsDrawn(noSwitcher)).toBe(false);
  });

  it.each([
    ['add', 'ui.components.calendar.event.add', '.add-event-button', 'Add event'],
    ['reset', 'ui.common.reset', '.reset-button', 'Reset'],
    ['refresh', 'ui.common.refresh', '.refresh-button', 'Refresh'],
    ['the folded filter', 'ui.components.calendar.my_calendars', '.legend-button', 'Calendars'],
  ])(
    'names the views in words while %s has no words of its own, which it is named in English',
    async (_name, missing, selector, english) => {
      const card = await mount({ toolbar: EVERY_COMMAND }, { localize: labelsWithout(missing) });
      await measure(card, WIDE);

      // The views are the card's own words, so a command Home Assistant cannot name does not
      // take them away.
      expect(actionRowWords(card).words).toBe(3);
      // The command is named for assistive technology in English, and shows no tooltip: an
      // English word on a card in another language would be worse than none.
      const button = part(card, selector);
      expect(button.getAttribute('aria-label')).toBe(english);
      expect(button.hasAttribute('title')).toBe(false);
    },
  );

  /** How the stubbed layout places the action row's controls, the views in words. */
  type RowLayout = 'fits' | 'wraps' | 'overflows-end' | 'overflows-start';

  /**
   * happy-dom lays nothing out, so the action row is described to the card the way a browser
   * would report it: a 700px row with its controls side by side on one line, except that the
   * last one drops to a second line while the row wraps, and one reaches past an edge while it
   * overflows. Only the boxes the card reads are described; everything else keeps happy-dom's
   * empty one.
   *
   * @param layout - The layout to report at the moment of reading
   * @returns The spy
   */
  function reportActionRow(layout: () => RowLayout) {
    const original = HTMLElement.prototype.getBoundingClientRect;
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const row = this.closest('.toolbar-actions');
      if (!row) return original.call(this);
      const box = (left: number, top: number, width: number) =>
        ({
          x: left,
          y: top,
          left,
          top,
          width,
          height: 36,
          right: left + width,
          bottom: top + 36,
        }) as DOMRect;
      if (this === row) return box(0, 0, 700);

      const controls = Array.from(row.querySelectorAll('.toolbar-button, .view-switcher'));
      const index = controls.indexOf(this);
      if (index === -1) return original.call(this);
      const last = index === controls.length - 1;
      const mode = layout();
      if (mode === 'wraps' && last) return box(0, 44, 100);
      if (mode === 'overflows-end' && last) return box(650, 0, 100);
      if (mode === 'overflows-start' && index === 0) return box(-20, 0, 100);
      return box(index * 110, 0, 100);
    });
  }

  /** A card width the views are words at, with room either side of it to measure. */
  const LABELED_WIDTH = WITH_SWITCHER + ICON + 60;

  it.each<[string, RowLayout]>([
    ['wraps onto a second line', 'wraps'],
    ["reaches past the row's end", 'overflows-end'],
    ["reaches past the row's start, as in a right-to-left card", 'overflows-start'],
  ])(
    'draws the pictograms while the row with the words %s, until the card is wider',
    async (_name, broken) => {
      let layout: RowLayout = broken;
      reportActionRow(() => layout);
      const card = await mount({ toolbar: SWITCHER_AND_ADD });

      await measure(card, LABELED_WIDTH);
      await card.updateComplete;
      expect(wordsDrawn(card)).toBe(false);
      expect(segment(card, 'grid').getAttribute('aria-label')).toBe('Grid');

      // From here the words would fit, so only the card keeps them off: narrower, and at the
      // very width they did not fit at, a render still draws pictograms.
      layout = 'fits';
      for (const width of [LABELED_WIDTH - 20, LABELED_WIDTH]) {
        await measure(card, width);
        await rerender(card);
        expect(wordsDrawn(card)).toBe(false);
      }

      // Wider than the width it overflowed at: the words are tried again, and now they fit.
      await measure(card, LABELED_WIDTH + 20);
      await card.updateComplete;
      expect(wordsDrawn(card)).toBe(true);
    },
  );

  it('keeps the words off for another title at the same width, not for another language', async () => {
    let layout: RowLayout = 'wraps';
    reportActionRow(() => layout);
    const card = await mount({ title: 'Familienkalender', toolbar: SWITCHER_AND_ADD });
    await measure(card, LABELED_WIDTH);
    await card.updateComplete;
    expect(wordsDrawn(card)).toBe(false);

    // The title is drawn over the month, in the heading row: a shorter one makes no room in
    // the action row, so the words are not tried again, although the row would now fit.
    layout = 'fits';
    card.setConfig(configFor({ title: 'Family', toolbar: SWITCHER_AND_ADD }));
    await card.updateComplete;
    await card.updateComplete;
    expect(part(card, 'h1.card-header').textContent).toBe('Family');
    expect(wordsDrawn(card)).toBe(false);

    // The control: another language changes the row's own words, so at the same width they
    // are tried again, and drawn.
    card.setConfig(configFor({ title: 'Family', language: 'de', toolbar: SWITCHER_AND_ADD }));
    await card.updateComplete;
    await card.updateComplete;
    expect(segments(card).map((button) => button.textContent!.trim())).toEqual([
      'Liste',
      'Spalten',
      'Zeitraster',
    ]);
  });

  it("names each view in the card's language", async () => {
    const card = await mount({ language: 'de' });
    await measure(card, WIDE);

    expect(segments(card).map((button) => button.textContent!.trim())).toEqual([
      'Liste',
      'Spalten',
      'Zeitraster',
    ]);
  });
});

describe('the resolved toolbar the card reads', () => {
  it('is the one place a toolbar default comes from', () => {
    // What every case in this file starts from: the switcher, and nothing else.
    expect(Config.resolveToolbar(configFor())).toEqual({
      show: true,
      navigation: false,
      addEvent: false,
      viewSwitcher: true,
      reset: false,
      refresh: false,
      legend: false,
    });
    // What it switches off: a shown toolbar draws every control but reset by default.
    expect(Config.resolveToolbar(buildConfig({ toolbar: { show: true } }))).toEqual({
      show: true,
      navigation: true,
      addEvent: true,
      viewSwitcher: true,
      reset: false,
      refresh: true,
      legend: 'menu',
    });
  });
});

describe('a switch is drawn at once', () => {
  it("keeps the padding each view sets out of the card's transition", () => {
    // Home Assistant's ha-card transitions all of its properties, and list pads the card's
    // start 8px where column and grid pad it 16px, so every switch to or from list slid the
    // card's contents 8px over 300ms. The card names what may transition instead, pinned by
    // value so neither the padding nor `all` can come back in.
    const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\}\s*ha-card\s*\{([^}]*)\}/.exec(css)![1];
    const properties = /transition-property:\s*([^;]+);/
      .exec(rule)?.[1]
      .split(',')
      .map((property) => property.trim());

    expect(properties).toEqual(['background-color', 'border-color', 'box-shadow', 'color']);
  });
});
