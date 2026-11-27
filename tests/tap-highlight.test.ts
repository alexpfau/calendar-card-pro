/**
 * The highlight a touch browser paints over a press, on a card whose own tap runs something.
 *
 * Chromium highlights the largest element under the finger that still shows a hand cursor
 * (`BestTapNode`), in that element's `-webkit-tap-highlight-color`. A card with a tap of its own
 * draws a pointer on `ha-card`, and everything in it inherits it, so from a toolbar control the
 * highlighted element is `ha-card`: every press on a control on a touch screen washed the whole
 * card in the browser's gray, `rgba(0, 0, 0, 0.18)`, while the card's ripple and its `tap_action`
 * stayed still. The controls' own transparent highlight never applied, since the color is the
 * highlighted element's. The same held for the filter's menu, a narrow month's day and "+N more",
 * and a tap on the card itself drew the gray under its ripple.
 *
 * happy-dom computes `cursor` with inheritance but drops `-webkit-tap-highlight-color`, so the walk
 * to the highlighted element runs on computed styles, and its color is read from the rules of the
 * card's stylesheet it matches, then its ancestors', as the property inherits. The flash itself
 * was measured in Chromium with a screencast, before and after; this file pins its cause, for
 * every element a card with a tap draws. That a press on a control runs no `tap_action` while a
 * tap on the card still does is pinned in `add-event-button.test.ts`, and that the card keeps its
 * ripple in `card-wrapper-dom.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { cardStyles } from '../src/rendering/styles';
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

const TAP: Types.ActionConfig = { action: 'navigate', navigation_path: '/lovelace/1' };

/** Every control the toolbar has, the overlay's button and one of the configuration's own. */
const EVERY_CONTROL: Types.ToolbarConfig = {
  show: true,
  overlay: true,
  reset: true,
  legend: 'menu',
  buttons: [{ icon: 'mdi:lamp', name: 'Hall lamp', tap_action: { action: 'none' } }],
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  overlayFrame?: { close(): void; readonly hidden: ReadonlyArray<string> };
  fitToWidth(widthPx: number): void;
  readonly updateComplete: Promise<boolean>;
}

function hass() {
  const state = (id: string, name: string) => ({
    entity_id: id,
    state: 'off',
    attributes: { supported_features: 7, friendly_name: name },
  });
  return {
    states: { [ANNA]: state(ANNA, 'Anna'), [BEN]: state(BEN, 'Ben') },
    locale: { language: 'en' },
    callApi: vi.fn((_method: string, path: string) =>
      Promise.resolve(
        path.startsWith(`calendars/${ANNA}`)
          ? [
              {
                summary: 'Dentist',
                start: { dateTime: '2026-06-17T14:00:00Z' },
                end: { dateTime: '2026-06-17T15:00:00Z' },
              },
              { summary: 'Fair', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
            ]
          : [],
      ),
    ),
    localize: (key: string) => key,
  };
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config>,
  { width, overlay = false }: { width?: number; overlay?: boolean } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  if (overlay) card.overlayFrame = { close: () => {}, hidden: [] };
  card.setConfig(
    buildConfig({
      entities: [ANNA, BEN],
      days_to_show: 3,
      tap_action: TAP,
      toolbar: EVERY_CONTROL,
      ...overrides,
    }),
  );
  card.hass = hass();
  document.body.appendChild(card);
  await settle(card);
  if (width !== undefined) {
    card.fitToWidth(width);
    await settle(card);
  }
  return card;
}

/** The rules of the card's stylesheet that set the tap highlight, in source order. */
const HIGHLIGHT_RULES: ReadonlyArray<{ selectors: string[]; value: string }> = [
  ...cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@;]+)\{([^{}]*)\}/g),
].flatMap(([, prelude, body]) => {
  const value = /-webkit-tap-highlight-color\s*:\s*([^;]+)/.exec(body)?.[1].trim();
  return value ? [{ selectors: prelude.split(',').map((part) => part.trim()), value }] : [];
});

/** Whether an element matches a selector, a selector happy-dom cannot parse matching nothing. */
function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

/** The element's parent in the flat tree: its slot, its parent, or its shadow root's host. */
function flatParent(element: Element): Element | null {
  const parent = element.assignedSlot ?? element.parentElement;
  if (parent) return parent;
  const root = element.parentNode;
  return root instanceof ShadowRoot ? root.host : null;
}

const cursorOf = (element: Element) => getComputedStyle(element).cursor;

/**
 * The element a touch browser highlights for a press on `target`, as Chromium chooses it: the
 * nearest element that sets a cursor, if that is a hand, and then each parent while it still
 * shows one. Null where no hand cursor shows, which takes no highlight.
 *
 * @param target - The element under the finger
 * @returns The highlighted element, or null
 */
function highlighted(target: Element): Element | null {
  let element: Element | null = target;
  while (element && cursorOf(element) === 'auto') element = flatParent(element);
  if (!element || cursorOf(element) !== 'pointer') return null;
  for (let parent = flatParent(element); parent && cursorOf(parent) === 'pointer';) {
    element = parent;
    parent = flatParent(parent);
  }
  return element;
}

/**
 * The tap highlight color the card's stylesheet gives an element, inherited as the property is:
 * its own rules' last value, else its parent's, up to the card's host. Past that it is the page's,
 * the browser's gray unless Home Assistant sets one.
 *
 * @param element - An element of the card
 * @param host - The card
 * @returns The color as written, or `the page's`
 */
function highlightColor(element: Element, host: Element): string {
  for (let at: Element | null = element; at && at !== host; at = flatParent(at)) {
    const own = HIGHLIGHT_RULES.filter((rule) => rule.selectors.some((sel) => matches(at!, sel)));
    if (own.length) return own[own.length - 1].value;
  }
  return "the page's";
}

/** An element, as a failure names it. */
const named = (element: Element) =>
  `${element.tagName.toLowerCase()}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}`;

/** Every element the card draws whose press a touch browser would highlight in a color. */
function highlightedInColor(card: CardUnderTest): { pressed: number; colored: string[] } {
  const elements = [...card.shadowRoot!.querySelectorAll('*')];
  const colored = new Set<string>();
  let pressed = 0;
  for (const element of elements) {
    const node = highlighted(element);
    if (!node) continue;
    pressed += 1;
    const color = highlightColor(node, card);
    if (color !== 'transparent') colored.add(`${named(node)} (${color})`);
  }
  return { pressed, colored: [...colored] };
}

const inCard = (card: CardUnderTest, selector: string) =>
  card.shadowRoot!.querySelector<HTMLElement>(selector)!;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.useRealTimers();
});

describe('the tap highlight on a card with a tap of its own', () => {
  it('lands on the whole card from a toolbar control, and stops at a chip', async () => {
    const card = await mount({ toolbar: { ...EVERY_CONTROL, legend: 'chips' } }, { width: 900 });
    const haCard = inCard(card, 'ha-card');

    expect(haCard.classList.contains('card-interactive')).toBe(true);
    for (const selector of [
      '.refresh-button',
      '.view-switcher-segment',
      '.date-navigation-segment',
      '.toolbar-month-button',
      '.overlay-button',
      '.custom-button',
      '.content-container',
    ]) {
      expect(highlighted(inCard(card, selector)), selector).toBe(haCard);
    }
    // The chips sit in a row that shows no hand, so a chip is its own highlight, in its own color.
    const chip = inCard(card, '.legend-chip');
    expect(highlighted(chip)).toBe(chip);
    expect(highlightColor(chip, card)).toBe('transparent');
  });

  it.each([
    ['in List, with the filter as a menu', {}, { width: 900 }, '.legend-menu-row'],
    [
      'in List, with the filter as chips',
      { toolbar: { ...EVERY_CONTROL, legend: 'chips' } },
      { width: 900 },
      '.legend-chip',
    ],
    ['in a narrow List, its controls folded', {}, { width: 300 }, '.custom-menu-row'],
    ['in the wide Month', { view: 'month' }, { width: 900 }, '.month-container .event'],
    ['in the narrow Month', { view: 'month' }, { width: 360 }, '.month-narrow .month-date'],
    ['full size, with Close', {}, { width: 900, overlay: true }, '.close-button'],
  ] as const)('draws none on a press anywhere %s', async (_name, overrides, options, draws) => {
    const card = await mount(overrides as Partial<Types.Config>, options);

    const { pressed, colored } = highlightedInColor(card);

    expect(card.shadowRoot!.querySelector(draws), draws).not.toBeNull();
    expect(pressed).toBeGreaterThan(100);
    expect(colored).toEqual([]);
  });
});
