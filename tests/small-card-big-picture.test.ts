/**
 * The Small Card, Big Picture story's card, mounted, doing what its page says.
 *
 * `docs/guide/small-card-big-picture.md` prints a narrow list for a column of a dashboard that
 * opens itself full size, and its promises are behaviors: a lean toolbar with the layout switcher
 * and Open Full Size, a tap anywhere but an event or the button opening the same card full size
 * in Month, a tap on an event still opening that event, and full size bringing the calendar chips,
 * the add button and search the small card leaves out. `tests/example-stories.test.ts` checks the
 * card's option names, its `overlay:` block included; nothing ran the card until this file.
 *
 * Each promise is pinned beside a control arm, the page's card with the option responsible taken
 * out or changed, so an assertion that could not fail shows as a control that does not move.
 *
 * Runs in the UTC project. The fixture's instants are written in UTC, so the three days are fixed
 * by `FROZEN_NOW` alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import { spyOnPopovers } from './popover-spy';
import {
  type StoryCard,
  type StoryEvent,
  type StoryHass,
  dropOption,
  mountStory,
  readStoryCard,
  rowTitled,
  settle,
  shadow,
  tap,
  titles,
  withOptions,
} from './story-card';
import type * as Types from '../src/config/types';
import { OVERLAY_TAG, type OverlayParams } from '../src/rendering/overlay';

vi.mock('../src/utils/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/logger')>()),
  debug: vi.fn(),
  info: vi.fn(),
}));

const PAGE = 'small-card-big-picture';
const { config: CARD, entities: BLOCKS } = readStoryCard(PAGE);

/** A timed event on a day of June 2026, in UTC like `FROZEN_NOW`. */
function at(day: number, from: string, to: string, summary: string, extra = {}): StoryEvent {
  return {
    summary,
    start: { dateTime: `2026-06-${day}T${from}:00Z` },
    end: { dateTime: `2026-06-${day}T${to}:00Z` },
    ...extra,
  };
}

/** Wednesday the 17th at 10:00, with the zoo trip on Ben's and Leo's calendars on Thursday. */
const ZOO = at(18, '09:30', '12:00', 'Zoo 🦒', { location: 'London' });
const WEEK: StoryHass = {
  payload: {
    'calendar.anna': [at(17, '12:00', '13:00', 'Pilates')],
    'calendar.ben': [ZOO],
    'calendar.leo': [at(17, '13:30', '15:00', 'Nap'), { ...ZOO }],
    'calendar.family': [
      {
        summary: '🎂 Grandma’s birthday',
        start: { date: '2026-06-19' },
        end: { date: '2026-06-20' },
      },
    ],
  },
  // Every calendar accepts new events, so the add button is the toolbar's choice alone.
  states: Object.fromEntries(
    ['anna', 'ben', 'leo', 'family', 'trash_pickup'].map((name) => [
      `calendar.${name}`,
      { entity_id: `calendar.${name}`, state: 'off', attributes: { supported_features: 7 } },
    ]),
  ),
};

/** The card's own element, where a tap on the card lands. */
const haCard = (card: StoryCard) => shadow(card).querySelector('ha-card') as Element;

/** The card the overlay holds, once Home Assistant's dialog manager has opened one. */
interface FullSize extends StoryCard {
  readonly config: Types.Config;
}

/** Every overlay a card asked Home Assistant to open, and the one the stand-in made. */
let opened: OverlayParams[] = [];
let overlay: (HTMLElement & { hass?: unknown; showDialog(p: OverlayParams): void }) | null = null;

/**
 * Home Assistant's dialog manager, as far as `show-dialog` goes for the overlay: the dialog made
 * once, handed `hass`, shown and attached. The event popover is left to `spyOnPopovers`.
 */
function manager(event: Event): void {
  const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: OverlayParams }>).detail;
  if (detail.dialogTag !== OVERLAY_TAG) return;
  opened.push(detail.dialogParams);
  overlay ??= document.createElement(OVERLAY_TAG) as typeof overlay & HTMLElement;
  overlay!.hass = (event.target as StoryCard).hass;
  overlay!.showDialog(detail.dialogParams);
  if (!overlay!.isConnected) document.body.appendChild(overlay!);
}

/** The card full size, after the overlay has loaded its events. */
async function fullSize(): Promise<FullSize> {
  const inner = overlay?.shadowRoot?.querySelector<FullSize>('.frame > *');
  expect(inner, 'nothing opened full size').toBeTruthy();
  await settle(inner as FullSize);
  return inner as FullSize;
}

/** A pointer's press on a toolbar button: a click with a count, as a browser fires for a mouse. */
function pointerClick(button: Element): void {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
}

const activeElement = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'activeElement')!;

describe('the Small Card, Big Picture card behaves as its page describes', () => {
  let popovers: ReturnType<typeof spyOnPopovers>;

  beforeEach(() => {
    // happy-dom's `ShadowRoot.activeElement` throws while focus is in another shadow tree, as the
    // overlay's is, where a browser answers null.
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(FROZEN_NOW);
    popovers = spyOnPopovers();
    opened = [];
    overlay = null;
    document.addEventListener('show-dialog', manager);
  });

  afterEach(() => {
    Object.defineProperty(ShadowRoot.prototype, 'activeElement', activeElement);
    document.removeEventListener('show-dialog', manager);
    popovers.stop();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the card off the page, with the options the page teaches', () => {
    // The denominator. A page read as nothing would leave every arm below comparing an empty
    // card with an empty card, so the card is pinned by value before anything runs it.
    expect(BLOCKS.map((block) => block.entity)).toEqual([
      'calendar.anna',
      'calendar.ben',
      'calendar.leo',
      'calendar.family',
      'calendar.trash_pickup',
    ]);
    expect(CARD.view).toBeUndefined();
    expect(CARD.event_tap_action).toBeUndefined();
    expect(CARD).toMatchObject({
      type: 'custom:calendar-card-pro',
      days_to_show: 3,
      filter_duplicates: true,
      tap_action: { action: 'overlay' },
      toolbar: {
        show: true,
        legend: false,
        add_event: false,
        refresh: false,
        search: false,
        overlay: true,
      },
      overlay: { view: 'month', toolbar: { legend: 'chips', add_event: true, search: true } },
    });
  });

  it('draws the three days under the switcher, Open Full Size and the arrows, and nothing else', async () => {
    const card = await mountStory(CARD, WEEK);
    expect(card.effectiveView).toBe('list');
    // The zoo trip on two calendars is one row.
    expect(titles(card)).toEqual(['Pilates', 'Nap', 'Zoo 🦒', '🎂 Grandma’s birthday']);

    const root = shadow(card);
    expect(root.querySelector('.overlay-button')).not.toBeNull();
    expect(root.querySelector('.view-switcher, .view-switcher-collapsed')).not.toBeNull();
    expect(root.querySelector('.date-navigation')).not.toBeNull();
    for (const left of [
      '.add-event-button',
      '.refresh-button',
      '.search-button',
      '.legend-button',
      '.legend-chips',
    ]) {
      expect(root.querySelector(left), left).toBeNull();
    }

    // Control: without `overlay: true` in the toolbar the button is gone, so it was the option.
    const plain = await mountStory(dropOption(CARD, 'toolbar.overlay'), WEEK);
    expect(shadow(plain).querySelector('.overlay-button')).toBeNull();
  });

  it('opens full size in Month on a tap on the card, and on the button', async () => {
    const card = await mountStory(CARD, WEEK);
    await tap(card, haCard(card));
    expect(opened).toHaveLength(1);
    expect((await fullSize()).effectiveView).toBe('month');

    document.body.innerHTML = '';
    opened = [];
    overlay = null;
    const pressed = await mountStory(CARD, WEEK);
    pointerClick(shadow(pressed).querySelector('.overlay-button') as Element);
    await settle(pressed);
    expect(opened).toHaveLength(1);
    expect((await fullSize()).effectiveView).toBe('month');

    // Controls. Without `tap_action` the same tap opens nothing, so the tap above was the
    // page's action; without `view: month` under `overlay:` it opens in Grid, so Month was
    // the option and not where full size starts anyway.
    document.body.innerHTML = '';
    opened = [];
    overlay = null;
    const inert = await mountStory(dropOption(CARD, 'tap_action'), WEEK);
    await tap(inert, haCard(inert));
    expect(opened).toHaveLength(0);

    const grid = await mountStory(dropOption(CARD, 'overlay.view'), WEEK);
    await tap(grid, haCard(grid));
    expect((await fullSize()).effectiveView).toBe('grid');
  });

  it('opens an event on a tap on it, not full size', async () => {
    const card = await mountStory(CARD, WEEK);
    await tap(card, rowTitled(card, 'Pilates').target);
    expect(popovers.opened).toHaveBeenCalledTimes(1);
    expect(popovers.opened.mock.calls[0][0].entry?.summary).toBe('Pilates');
    expect(opened).toHaveLength(0);

    // Control: with the event tap turned off, as "Every tap opens it" suggests, the same tap
    // opens full size, so the popover above was the default the page keeps.
    const every = await mountStory(
      withOptions(CARD, { event_tap_action: { action: 'none' } }),
      WEEK,
    );
    await tap(every, rowTitled(every, 'Pilates').target);
    expect(popovers.opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(1);
  });

  it('brings the calendar chips, the add button and search full size, and Close for the button', async () => {
    const card = await mountStory(CARD, WEEK);
    await tap(card, haCard(card));
    const root = shadow(await fullSize());
    expect(root.querySelectorAll('.legend-chip')).toHaveLength(5);
    expect(root.querySelector('.add-event-button')).not.toBeNull();
    expect(root.querySelector('.search-button')).not.toBeNull();
    expect(root.querySelector('.overlay-button')).toBeNull();

    // Control: without the `overlay:` block's toolbar, full size takes the small card's own,
    // which leaves all three out.
    document.body.innerHTML = '';
    opened = [];
    overlay = null;
    const own = await mountStory(dropOption(CARD, 'overlay.toolbar'), WEEK);
    await tap(own, haCard(own));
    const ownRoot = shadow(await fullSize());
    expect(ownRoot.querySelector('.legend-chip')).toBeNull();
    expect(ownRoot.querySelector('.add-event-button')).toBeNull();
    expect(ownRoot.querySelector('.search-button')).toBeNull();
  });
});
