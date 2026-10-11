import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import {
  OVERFLOW_STRIP_PX,
  type OverflowStripScale,
  measureOverflowStrip,
  overflowStripPct,
} from '../src/utils/grid-overflow-strip';

/**
 * The `+N` strip's width: how much of a day column a count of hidden events needs.
 *
 * The scale is pixels the host measures off a rendered label; everything here is the pure
 * conversion into a share of the column. What it protects is a count such as `+3` in the
 * label's font, so the expectations below are read off the pixels a share draws, not off
 * the formula: at the default 12px label the strip is 28px, however wide the column is.
 */

const scale = (dayWidthPx: number, labelFontPx = 12): OverflowStripScale => ({
  dayWidthPx,
  labelFontPx,
});

/** The pixels a share of a column draws. */
const drawn = (share: number, dayWidthPx: number) => (share / 100) * dayWidthPx;

describe('overflowStripPct', () => {
  it.each([
    ['a week column', 140],
    ['a three-day column', 380],
    ['a one-day card', 900],
  ])('draws the same 28px strip in %s', (_case, width) => {
    expect(OVERFLOW_STRIP_PX).toBe(28);
    expect(drawn(overflowStripPct(scale(width), Infinity), width)).toBeCloseTo(28, 9);
  });

  it('widens with a larger label, and never narrows below the default', () => {
    expect(drawn(overflowStripPct(scale(140, 18), Infinity), 140)).toBeCloseTo(42, 9);
    expect(drawn(overflowStripPct(scale(140, 10), Infinity), 140)).toBeCloseTo(28, 9);
  });

  it.each([
    ['no measurement', null],
    ['a column with no width', scale(0)],
    ['an unreadable font size', scale(140, Number.NaN)],
  ])('keeps the share in use for %s', (_case, measured) => {
    expect(overflowStripPct(measured, Infinity)).toBe(Infinity);
    expect(overflowStripPct(measured, 20)).toBe(20);
  });

  it('keeps the share in use until the strip it draws would be a pixel off', () => {
    const share = overflowStripPct(scale(140), Infinity);

    // 20% of 143px is 28.6px: under a pixel off, so a resize this small redraws nothing.
    expect(overflowStripPct(scale(143), share)).toBe(share);
    // 20% of 146px is 29.2px, and of 134px 26.8px, which are.
    expect(drawn(overflowStripPct(scale(146), share), 146)).toBeCloseTo(28, 9);
    expect(drawn(overflowStripPct(scale(134), share), 134)).toBeCloseTo(28, 9);
  });
});

describe('measureOverflowStrip', () => {
  const grid = () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div class="grid-day-body"><div class="grid-event grid-event-overflow">' +
      '<div class="grid-event-overflow-label" style="font-size: 12px">+3</div></div></div>';
    return root;
  };

  it('reports nothing for a grid that has not been laid out', () => {
    // happy-dom has no layout, so every width reads 0: the state of a card not yet painted,
    // which must keep the share in use rather than divide by zero.
    expect(measureOverflowStrip(grid())).toBeNull();
  });

  it("reads the column a laid-out strip is in, and its label's font", () => {
    const root = grid();
    Object.defineProperty(root.querySelector('.grid-day-body'), 'clientWidth', { value: 140 });
    // Computed styles resolve only for an attached element.
    document.body.appendChild(root);

    const measured = measureOverflowStrip(root);
    root.remove();

    expect(measured).toEqual({ dayWidthPx: 140, labelFontPx: 12 });
  });

  it('reports nothing while no strip is on screen, so nothing is redrawn for it', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="grid-day-body"><div class="grid-event"></div></div>';
    Object.defineProperty(root.querySelector('.grid-day-body'), 'clientWidth', { value: 140 });

    expect(measureOverflowStrip(root)).toBeNull();
  });
});

describe('the card', () => {
  interface Card extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    hass: Types.Hass;
    readonly updateComplete: Promise<boolean>;
  }

  const event = (summary: string, start: string, end: string): Types.CalendarEventData => ({
    summary,
    start: { dateTime: `2026-06-18T${start}:00Z` },
    end: { dateTime: `2026-06-18T${end}:00Z` },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The width the strip is drawn at, read off the emitted style attribute. */
  const stripWidth = (card: Card) =>
    /(?:^|;)\s*width:\s*calc\(([\d.]+)%/.exec(
      card.shadowRoot?.querySelector('.grid-event-overflow')?.getAttribute('style') ?? '',
    )?.[1];

  // The unit tests above call the pieces; this is what decides whether the measurement
  // reaches the layout at all. Without it the strip stays at its unmeasured quarter in every
  // card, and nothing else in the suite would notice.
  it.each(['cascade', 'columns'])(
    'measures the strip it drew and draws the grid again with it (%s)',
    async (overlapLayout) => {
      // happy-dom lays nothing out, so give every day column a width and the label a font.
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains('grid-day-body') ? 400 : 0;
      });
      const computed = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
        const style = computed(element, pseudo);
        return element.classList.contains('grid-event-overflow-label')
          ? ({ ...style, fontSize: '12px' } as CSSStyleDeclaration)
          : style;
      });

      const card = document.createElement('calendar-card-pro-dev') as Card;
      card.setConfig({
        view: 'grid',
        entities: ['calendar.anna'],
        start_date: '2026-06-18',
        days_to_show: 1,
        time_grid: { max_simultaneous_events: 1, overlap_layout: overlapLayout },
      });
      card.hass = {
        states: {},
        locale: { language: 'en', time_format: '24' },
        callApi: vi
          .fn()
          .mockResolvedValue([
            event('Workshop', '09:00', '12:00'),
            event('Call', '09:10', '10:00'),
          ]),
        callService: vi.fn(),
      };
      // Mounting with hass set is what fetches, as it is in a dashboard.
      document.body.appendChild(card);

      // 28px of a 400px column: the event beside it keeps 93% of the width, not 75%.
      await vi.waitFor(() => expect(Number(stripWidth(card))).toBeCloseTo(7, 9));
      // ...and the redraw measured the same and stopped there.
      expect(await card.updateComplete).toBe(true);
      expect(Number(stripWidth(card))).toBeCloseTo(7, 9);
    },
  );
});
