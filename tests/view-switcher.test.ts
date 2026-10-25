/**
 * The header toolbar's view switcher, on the real card.
 *
 * The toolbar defaults to hidden, so every DOM gate built from default config sees no
 * switcher and would stay green if it did nothing; each case here turns it on. The pure
 * halves — the remembered choice and the width fit — have files of their own
 * (`view-choice.test.ts`, the view resolvers). This file pins how the card joins them:
 * which view is marked, which are offered at a width, that a switch draws without
 * fetching, that it survives a reload and not an edit, and that editing neither uses it
 * nor disturbs it.
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

/** A shown toolbar holding the switcher and nothing else. */
const SWITCHER_ONLY = { show: true, add_event: false };

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
    ['the switcher is off', { toolbar: { show: true, view_switcher: false, add_event: false } }],
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

  it('sits before the add button, which stays last', async () => {
    const card = await mount({ toolbar: { show: true } });
    const trailing = card.shadowRoot!.querySelector('.toolbar-trailing')!;

    expect(Array.from(trailing.children).map((child) => child.className.split(' ')[0])).toEqual([
      'view-switcher',
      'toolbar-button',
    ]);
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
    // So does the gap between the switcher and the add button.
    [
      'the gap between controls',
      (card: CardUnderTest) => card.shadowRoot!.querySelector<HTMLElement>('.toolbar-trailing')!,
    ],
  ])(
    "never runs the card's tap action from %s, while the rest of the card still does",
    async (_name, target) => {
      const card = await mount({ toolbar: { show: true }, tap_action: { action: 'more-info' } });
      const el = target(card);

      dispatchPointer(el, 'pointerdown');
      dispatchPointer(el, 'pointerup');
      el.click();
      await card.updateComplete;
      expect(handleAction).not.toHaveBeenCalled();

      // The control: the same press on the events reaches the card's gesture.
      const content = card.shadowRoot!.querySelector('.content-container')!;
      dispatchPointer(content, 'pointerdown');
      dispatchPointer(content, 'pointerup');
      expect(handleAction).toHaveBeenCalledOnce();
    },
  );

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
    // Both on one side of every toolbar label threshold, so no label change re-renders.
    for (const threshold of [
      Constants.UI.TOOLBAR_LABEL_MIN_WIDTH,
      Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH,
    ]) {
      expect(five >= threshold).toBe(six >= threshold);
    }

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

describe('labels', () => {
  it.each([
    ['the switcher alone', SWITCHER_ONLY],
    ['the switcher beside the add button', { show: true }],
  ])('labels %s only from the wider threshold', async (_name, toolbar) => {
    const card = await mount({ toolbar });

    await measure(card, Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH - 1);
    for (const button of segments(card)) {
      expect(button.querySelector('.toolbar-button-label')).toBeNull();
      expect(button.classList.contains('icon-only')).toBe(true);
    }
    expect(segment(card, 'column').getAttribute('aria-label')).toBe('Columns');
    expect(segment(card, 'column').getAttribute('title')).toBe('Columns');

    await measure(card, Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH);
    expect(segments(card).map((button) => button.textContent!.trim())).toEqual([
      'List',
      'Columns',
      'Grid',
    ]);
    expect(segment(card, 'column').hasAttribute('aria-label')).toBe(false);
  });

  it('keeps the add button labeled from its own threshold when it is alone', async () => {
    const card = await mount({ toolbar: { show: true, view_switcher: false } });
    await measure(card, Constants.UI.TOOLBAR_LABEL_MIN_WIDTH);

    expect(
      card.shadowRoot!.querySelector('.add-event-button .toolbar-button-label'),
    ).not.toBeNull();
  });

  it('labels nothing while the add button has no words to show', async () => {
    const card = await mount({ toolbar: { show: true } }, { localize: () => '' });
    await measure(card, WIDE);

    expect(card.shadowRoot!.querySelector('.toolbar-button-label')).toBeNull();
    expect(segment(card, 'grid').getAttribute('aria-label')).toBe('Grid');
  });

  /**
   * happy-dom lays nothing out, so the overflow is described to the card the way a browser
   * would report it: the labeled bar reaching past the header's edge, the icon bar not.
   */
  function reportOverflow(labeledOverflows: () => boolean) {
    const original = HTMLElement.prototype.getBoundingClientRect;
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const box = (left: number, width: number) =>
        ({ left, right: left + width, width, top: 0, bottom: 36, height: 36 }) as DOMRect;
      if (this.classList.contains('header-container')) return box(0, 668);
      if (this.classList.contains('card-toolbar')) {
        const labeled = this.querySelector('.toolbar-button-label') !== null;
        return labeled ? box(labeledOverflows() ? 200 : 170, 495) : box(516, 152);
      }
      return original.call(this);
    });
  }

  it('drops the labels when a long title pushes them past the edge, until there is room', async () => {
    let overflows = true;
    reportOverflow(() => overflows);
    const card = await mount({ title: 'Familienkalender', toolbar: { show: true } });

    await measure(card, 700);
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.toolbar-button-label')).toBeNull();
    expect(segment(card, 'grid').getAttribute('aria-label')).toBe('Grid');

    // Wider than the width it overflowed at: the labels are tried again, and now they fit.
    overflows = false;
    await measure(card, 720);
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.toolbar-button-label')).not.toBeNull();
  });

  it('tries the labels again for a different title at the same width', async () => {
    let overflows = true;
    reportOverflow(() => overflows);
    const card = await mount({ title: 'Familienkalender', toolbar: { show: true } });
    await measure(card, 700);
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.toolbar-button-label')).toBeNull();

    overflows = false;
    card.setConfig(configFor({ title: 'Family', toolbar: { show: true } }));
    await card.updateComplete;
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.toolbar-button-label')).not.toBeNull();
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
    expect(Config.resolveToolbar(configFor())).toEqual({
      show: true,
      labels: true,
      navigation: false,
      addEvent: false,
      viewSwitcher: true,
    });
  });
});
