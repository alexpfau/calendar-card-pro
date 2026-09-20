import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';
import * as GridTimeFit from '../src/utils/grid-time-fit';

/**
 * The grid time row's horizontal fit.
 *
 * Grid is the only view whose time row can be too narrow for its own text, because a
 * block's width is the day width divided by its concurrent column count and has nothing to
 * do with the height that reveals the row. This used to be gated by `min-width: 60px` on
 * the container rung, which was right about its own arithmetic and wrong about the
 * question: it charged every row 18px for a clock icon before charging it anything for a
 * time, and it was calibrated around an ellipsis that makes a false statement inside a
 * clock reading.
 *
 * Two surfaces are pinned here. The ladder itself is a pure function and is pinned by
 * value, at the widths measured on the deployed card, so a rung cannot be reordered or a
 * threshold nudged without a named failure. The markup split it depends on is pinned
 * separately, because CSS cannot hide half of a text node and the whole ladder is inert
 * without it.
 */

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 5, 17, h, m).toISOString();
};

function timed(from: string, to: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: at(from) },
    end: { dateTime: at(to) },
    summary,
    _entityId: 'calendar.personal',
  };
}

/** The grid's own 24-hour clock, so a pinned width means the string it was measured on. */
function gridConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ view: 'grid', days_to_show: 1, time_24h: true, ...overrides });
}

function renderGrid(events: Types.CalendarEventData[], config: Types.Config): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'grid');
  const container = document.createElement('div');
  litRender(
    Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW),
    container,
  );
  return container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Widths measured on the deployed card in Chromium, at the shipped 12px type.
 *
 * The clock icon is 14px of box and 4px of margin. `10:00` is 29.86 and ` - 12:00` adds
 * 39.12, so a full row needs 86.98. These are the numbers the deleted constant was
 * calibrated from, kept here so the ladder is pinned against reality rather than against
 * itself.
 */
const ICON = 18;
const START = 29.86;
const END = 39.12;
const FULL = ICON + START + END;

describe('grid time row fit', () => {
  describe('the ladder', () => {
    /**
     * Every rung, pinned by value at a width taken from a real screenshot.
     *
     * Reconciled against the whole table rather than walked, so dropping a rung fails here
     * instead of quietly running one fewer case.
     */
    it('gives up the icon before the end time, and the end time before the row', () => {
      const rung = (available: number) =>
        GridTimeFit.gridTimeFit({ available, full: FULL, icon: ICON, end: END });

      expect([124.6, 79, 72.9, 45.9, 29.2].map(rung)).toEqual([
        { time: true, icon: true, end: true },
        { time: true, icon: false, end: true },
        { time: true, icon: false, end: true },
        { time: true, icon: false, end: false },
        { time: false, icon: false, end: false },
      ]);
    });

    it('keeps the icon where only the end time has to go', () => {
      expect(
        GridTimeFit.gridTimeFit({ available: START + ICON, full: FULL, icon: ICON, end: END }),
      ).toEqual({ time: true, icon: true, end: false });
    });

    /**
     * `show_end_time: false` is the reported card's own setting and defaults to true, so a
     * suite built from default config never renders this string at all. With nothing to
     * drop the ladder must collapse to two rungs by itself.
     */
    it('collapses to two rungs when no end time is drawn', () => {
      const rung = (available: number) =>
        GridTimeFit.gridTimeFit({ available, full: ICON + START, icon: ICON, end: 0 });

      expect([124.6, 45.9, 29.2].map(rung)).toEqual([
        { time: true, icon: true, end: true },
        { time: true, icon: false, end: true },
        { time: false, icon: false, end: false },
      ]);
    });

    /**
     * The 0.66px between the narrowest measured lane and a bare start time. A measured
     * predicate has no calibration to be wrong, so this is a boundary rather than a knife
     * edge — but it is the boundary the maintainer's report turns on, so it is pinned.
     */
    it('reveals a bare start time at exactly the width it needs, and not below', () => {
      const bare = { full: ICON + START, icon: ICON, end: 0 };

      expect(GridTimeFit.gridTimeFit({ available: START, ...bare }).time).toBe(true);
      expect(GridTimeFit.gridTimeFit({ available: START - 0.66, ...bare }).time).toBe(false);
    });

    it('hides the row rather than guessing when a block has not been laid out', () => {
      const hidden = { time: false, icon: false, end: false };

      expect(GridTimeFit.gridTimeFit({ available: 0, full: FULL, icon: ICON, end: END })).toEqual(
        hidden,
      );
      expect(
        GridTimeFit.gridTimeFit({ available: Number.NaN, full: FULL, icon: ICON, end: END }),
      ).toEqual(hidden);
      expect(GridTimeFit.gridTimeFit({ available: 400, full: 0, icon: 0, end: 0 })).toEqual(hidden);
    });
  });

  describe('the markup it acts on', () => {
    it('draws the end time as its own element in grid', () => {
      const container = renderGrid([timed('10:00', '12:00', 'QA Window')], gridConfig());
      const row = container.querySelector('.grid-event-disclosure .time-actual');

      expect(row?.textContent?.trim()).toBe('10:00 - 12:00');
      expect(row?.querySelector('.time-end')?.textContent).toBe(' - 12:00');
    });

    it('draws no end element when no end time is shown', () => {
      const container = renderGrid(
        [timed('10:00', '12:00', 'QA Window')],
        gridConfig({ show_end_time: false }),
      );
      const row = container.querySelector('.grid-event-disclosure .time-actual');

      expect(row?.textContent?.trim()).toBe('10:00');
      expect(row?.querySelector('.time-end')).toBeNull();
    });

    /**
     * The split is grid-only on the merits, not for a quiet snapshot. A list row has no
     * bottom edge standing in for the end time, so there the end is not droppable and the
     * element would be dead weight.
     */
    it('leaves the other views with one text node', () => {
      const config = buildConfig({ view: 'list', days_to_show: 1, time_24h: true });
      const event = timed('10:00', '12:00', 'QA Window');
      const parts = FormatUtils.formatEventTimeParts(event, config, 'en');
      const container = document.createElement('div');
      litRender(
        Render.renderGroupedEvents(
          EventUtils.groupEventsByDay([event], config, false, 'en', 'list'),
          ViewConfig.resolveEffectiveConfig(config, 'list'),
          'en',
        ),
        container,
      );

      expect(parts.end).toBe(' - 12:00');
      expect(parts.text).toBe(`10:00${parts.end}`);
      expect(container.querySelector('.time-actual')?.textContent?.trim()).toBe('10:00 - 12:00');
      expect(container.querySelector('.time-end')).toBeNull();
    });
  });

  describe('what the formatter calls droppable', () => {
    it('offers the end time of a single-day timed event', () => {
      const parts = FormatUtils.formatEventTimeParts(
        timed('10:00', '12:00', 'Standup'),
        gridConfig(),
        'en',
      );

      expect(parts.end).toBe(' - 12:00');
    });

    it('offers nothing when the end time is already not drawn', () => {
      const parts = FormatUtils.formatEventTimeParts(
        timed('10:00', '12:00', 'Standup'),
        gridConfig({ show_end_time: false }),
        'en',
      );

      expect(parts).toEqual({ text: '10:00' });
    });

    /**
     * A multi-day phrase looks equally droppable and is not: it is a sentence about days
     * this block does not cover, so no edge of the block redraws what cutting it would
     * remove. `formatMultiDayTime` writes the whole thing as one phrase for that reason.
     */
    it('offers nothing on a multi-day phrase', () => {
      const parts = FormatUtils.formatEventTimeParts(
        {
          start: { dateTime: new Date(2026, 5, 17, 10).toISOString() },
          end: { dateTime: new Date(2026, 5, 19, 14).toISOString() },
          summary: 'Conference',
          _entityId: 'calendar.personal',
        },
        gridConfig(),
        'en',
      );

      expect(parts.end).toBeUndefined();
      expect(parts.text).toContain('Jun 19');
    });

    it('offers nothing on an all-day event', () => {
      const parts = FormatUtils.formatEventTimeParts(
        {
          start: { date: '2026-06-17' },
          end: { date: '2026-06-18' },
          summary: 'Public Holiday',
          _entityId: 'calendar.personal',
        },
        gridConfig(),
        'en',
      );

      expect(parts.end).toBeUndefined();
    });
  });

  describe('the DOM it drives', () => {
    /**
     * A block whose geometry is stubbed, because happy-dom lays nothing out.
     *
     * The stubs are the measured widths of the reported card: a 45.9px lane holding a row
     * that needs 86.98px. Only the four numbers the adapter reads are faked, so everything
     * between the read and the class — the selectors, the reveal, the restore — is the real
     * code path.
     */
    function block(available: number, { withEnd = true, withIcon = true } = {}): HTMLElement {
      const el = document.createElement('div');
      el.className = 'grid-event';
      el.innerHTML = `
        <div class="grid-event-disclosure">
          <div class="time"><div class="time-actual">
            ${withIcon ? '<ha-icon icon="mdi:clock-outline"></ha-icon>' : ''}
            <span>10:00${withEnd ? '<span class="time-end"> - 12:00</span>' : ''}</span>
          </div></div>
        </div>`;

      const time = el.querySelector<HTMLElement>('.time')!;
      Object.defineProperty(time, 'clientWidth', { get: () => available });
      time.getBoundingClientRect = () => ({ width: ICON + START + (withEnd ? END : 0) }) as DOMRect;

      const icon = el.querySelector<HTMLElement>('ha-icon');
      // The whole 18px in the box, because happy-dom has no stylesheet and so reports no
      // margin. The adapter adds the margin in a browser; here there is none to add.
      if (icon) icon.getBoundingClientRect = () => ({ width: ICON }) as DOMRect;
      const end = el.querySelector<HTMLElement>('.time-end');
      if (end) end.getBoundingClientRect = () => ({ width: END }) as DOMRect;

      return el;
    }

    /** The three phased passes the host runs, in the order it runs them. */
    function fit(el: HTMLElement): string[] {
      const target = GridTimeFit.gridTimeTarget(el)!;
      GridTimeFit.prepareGridTimeMeasurement(target);
      const available = GridTimeFit.measureGridTimeAvailable(target);
      GridTimeFit.releaseGridTimeWidth(target);
      const costs = GridTimeFit.measureGridTimeCosts(target, available);
      GridTimeFit.applyGridTimeFit(target, GridTimeFit.gridTimeFit(costs));
      return [...el.querySelector('.grid-event-disclosure')!.classList];
    }

    it('reveals a full row where the block is wide enough for one', () => {
      expect(fit(block(124.6))).toEqual(['grid-event-disclosure', 'grid-time-fits']);
    });

    it('drops the icon first', () => {
      expect(fit(block(72.9))).toEqual([
        'grid-event-disclosure',
        'grid-time-fits',
        'grid-time-no-icon',
      ]);
    });

    it('drops the end time next, and keeps the start', () => {
      expect(fit(block(45.9))).toEqual([
        'grid-event-disclosure',
        'grid-time-fits',
        'grid-time-no-icon',
        'grid-time-no-end',
      ]);
    });

    it('sets nothing at all where not even a start time fits', () => {
      expect(fit(block(29.2))).toEqual(['grid-event-disclosure']);
    });

    /**
     * The reason the gate is positive. The compact clamp rides the same rung as the reveal,
     * so a negative gate would have to restore the medium clamp to undo itself; a positive
     * one leaves a row that fits nothing exactly where the stylesheet left it.
     */
    it('leaves no inline style behind either way', () => {
      for (const available of [124.6, 29.2]) {
        const el = block(available);
        fit(el);

        expect(el.querySelector<HTMLElement>('.time')!.getAttribute('style') ?? '').toBe('');
      }
    });

    it('clears a previous decision before measuring again', () => {
      const el = block(124.6);
      const disclosure = el.querySelector('.grid-event-disclosure')!;
      disclosure.classList.add('grid-time-no-icon', 'grid-time-no-end', 'grid-time-fits');

      expect(fit(el)).toEqual(['grid-event-disclosure', 'grid-time-fits']);
    });

    /**
     * With nothing to drop, the ladder skips the rung that would drop it. No `no-end` class
     * is set, because there is no end element for it to hide and setting it anyway would
     * make the classes claim a degradation that never happened.
     */
    it('reads no end element where none is drawn', () => {
      const el = block(45.9, { withEnd: false });

      expect(GridTimeFit.gridTimeTarget(el)?.end).toBeNull();
      expect(fit(el)).toEqual(['grid-event-disclosure', 'grid-time-fits', 'grid-time-no-icon']);
    });

    it('ignores a block with no time row rather than throwing', () => {
      const el = document.createElement('div');
      el.innerHTML = '<div class="grid-event-disclosure"></div>';

      expect(GridTimeFit.gridTimeTarget(el)).toBeNull();
    });
  });
});
