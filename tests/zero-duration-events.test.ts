import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import { buildEventPresentation } from '../src/rendering/presentation';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import { formatEventTime, formatEventTimeParts, getCountdownString } from '../src/utils/format';

/**
 * Events with no duration (#625).
 *
 * A reminder — anything a calendar records as starting and ending at the same instant —
 * printed its time twice, `9:41 - 9:41`, in every release up to and including v4.2.0: the
 * single-day formatter built a range whenever `show_end_time` was on, and that option is on
 * by default. It now prints `9:41`. Home Assistant admits these events on purpose — its
 * `MIN_EVENT_DURATION` is zero because Google Calendar creates them — so this is a shape
 * real calendars deliver, not a malformed one.
 *
 * Grid view had a worse problem with them, never released: it read a zero-length event as
 * an empty interval and dropped it before layout, so the reminder that list and column
 * showed was simply absent from the grid. It is now drawn as a minimum-height marker at its
 * instant, which is too short to reveal a time row — like any block that short — so grid
 * announces its time in the block's accessible name. These tests pin both, and everything
 * else that reads an event's span: the grid's accessible name and lanes, the countdown, and
 * the progress bar, which divides by the duration.
 *
 * Runs under `TZ=UTC` with the rest of the unit project, so an ISO instant here is also the
 * wall-clock time printed. The one case that needs a real zone, the repeated hour when the
 * clocks go back, is in `zero-duration-events.dst.test.ts`.
 */

/** A timed event, from and to ISO instants. */
function timed(from: string, to: string, summary = 'Reminder'): Types.CalendarEventData {
  return {
    start: { dateTime: from },
    end: { dateTime: to },
    summary,
    _entityId: 'calendar.personal',
  };
}

/** A reminder at an instant: same start and end. */
const reminder = (at: string, summary = 'Reminder') => timed(at, at, summary);

/** 14:41 on `FROZEN_NOW`'s day, so later today and inside grid's default 07:00–22:00. */
const AT = '2026-06-17T14:41:00.000Z';

const VIEWS: Types.EffectiveView[] = ['list', 'column', 'grid'];

/**
 * Render one view the way the card host does: grouped for that view, handed the effective
 * config. Grouping another way gives days the view would not have, and skipping
 * `resolveEffectiveConfig` drops the view's own defaults.
 */
function renderView(
  view: Types.EffectiveView,
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config> = {},
): HTMLElement {
  const config = buildConfig({ view, days_to_show: 1, ...overrides });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, new Date())
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    container,
  );
  return container;
}

/** Every time row's visible text, whitespace collapsed. */
function timeRows(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.time .time-actual')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

/** The grid's accessible names, split back into the words `gridEventAccessibleName` joins. */
function accessibleWords(container: HTMLElement): string[][] {
  return [...container.querySelectorAll('.grid-event-accessible')].map((node) =>
    (node.getAttribute('aria-label') ?? '').split(', ').map((word) => word.replace(/[⁨⁩]/g, '')),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the time text of an event with no duration', () => {
  it.each([
    ['24-hour', { time_24h: true }, '9:41', '21:41'],
    ['12-hour', { time_24h: false }, '9:41 AM', '9:41 PM'],
    ['24-hour two-digit', { time_24h: true, time_two_digit_hours: true }, '09:41', '21:41'],
    ['12-hour two-digit', { time_24h: false, time_two_digit_hours: true }, '09:41 AM', '09:41 PM'],
  ] as const)('reads the start time once on a %s clock', (_clock, clock, morning, evening) => {
    const config = buildConfig(clock);

    expect(formatEventTime(reminder('2026-06-17T09:41:00.000Z'), config, 'en')).toBe(morning);
    expect(formatEventTime(reminder('2026-06-17T21:41:00.000Z'), config, 'en')).toBe(evening);
  });

  // The control that keeps the assertions above honest: the same clock and the same start
  // still draw a range the moment the event lasts into the next minute.
  it.each([
    ['24-hour', { time_24h: true }, '9:41 - 9:42'],
    ['12-hour', { time_24h: false }, '9:41 AM - 9:42 AM'],
    ['24-hour two-digit', { time_24h: true, time_two_digit_hours: true }, '09:41 - 09:42'],
  ] as const)('still reads a range for a one-minute event on a %s clock', (_c, clock, range) => {
    const config = buildConfig(clock);

    expect(
      formatEventTime(timed('2026-06-17T09:41:00.000Z', '2026-06-17T09:42:00.000Z'), config, 'en'),
    ).toBe(range);
  });

  it('leaves no droppable end for the grid to split off', () => {
    // `end` is what grid view draws as `.time-end` and drops from a short block. An event
    // that has no end in its text must not offer one: the row would be cut to nothing.
    const config = buildConfig({ time_24h: true });

    expect(formatEventTimeParts(reminder(AT), config, 'en')).toEqual({ text: '14:41' });
    expect(formatEventTimeParts(timed(AT, '2026-06-17T15:41:00.000Z'), config, 'en')).toEqual({
      text: '14:41 - 15:41',
      end: ' - 15:41',
    });
  });

  it('reads the same with show_end_time off, which never drew an end', () => {
    expect(
      formatEventTime(reminder(AT), buildConfig({ time_24h: true, show_end_time: false }), 'en'),
    ).toBe('14:41');
  });

  // The rule is "the range would print one reading twice", so it is the minute that
  // decides rather than exact equality. Seconds are not printed.
  it.each([
    ['ends 30 seconds later, inside its minute', '14:41:00', '14:41:30', '14:41'],
    ['ends at the last millisecond of its minute', '14:41:00', '14:41:59.999', '14:41'],
    ['starts and ends inside one minute', '14:41:10', '14:41:50', '14:41'],
    ['lasts 20 seconds but crosses into the next minute', '14:41:50', '14:42:10', '14:41 - 14:42'],
    ['ends exactly at the next minute', '14:41:00', '14:42:00', '14:41 - 14:42'],
  ])('treats an event that %s accordingly', (_case, from, to, expected) => {
    const event = timed(`2026-06-17T${from}Z`, `2026-06-17T${to}Z`);

    expect(formatEventTime(event, buildConfig({ time_24h: true }), 'en')).toBe(expected);
  });

  it('reads the same at midnight, where it is still a single-day event', () => {
    const config = buildConfig({ time_24h: true });

    expect(formatEventTime(reminder('2026-06-18T00:00:00.000Z'), config, 'en')).toBe('0:00');
  });
});

describe('an event with no duration in each view', () => {
  // The row's text, not its visibility. Grid reveals a time row only on a block tall enough
  // to hold one, and a reminder's minimum-height marker never is, so happy-dom reading the
  // hidden row proves what it says rather than that it shows. Grid announces the time in the
  // block's accessible name instead, which is pinned further down.
  it.each(
    VIEWS.flatMap((view) => [
      [view, '24-hour', { time_24h: true }, '14:41'],
      [view, '12-hour', { time_24h: false }, '2:41 PM'],
    ]) as Array<[Types.EffectiveView, string, Partial<Types.Config>, string]>,
  )(
    'writes the start time once into the %s view time row on a %s clock',
    (view, _c, clock, expected) => {
      const container = renderView(view, [reminder(AT)], { ...clock, show_countdown: false });

      expect(timeRows(container)).toEqual([expected]);
      // The grid's droppable-end element would carry the second reading. It must not exist.
      expect(container.querySelectorAll('.time-end')).toHaveLength(0);
    },
  );

  it('draws a grid block for it, which grid used to drop before layout', () => {
    const container = renderView('grid', [reminder(AT)]);
    const blocks = container.querySelectorAll<HTMLElement>('.grid-event:not(.grid-event-overflow)');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].querySelector('.event-title')?.textContent?.trim()).toBe('Reminder');
    // 14:41 in the default 07:00–22:00 band, with no height of its own: the stylesheet's
    // `min-height` turns that into a marker at its start.
    expect(blocks[0].style.getPropertyValue('--calendar-card-grid-block-top')).toBe(
      `${((881 - 420) / 900) * 100}%`,
    );
    expect(blocks[0].style.getPropertyValue('--calendar-card-grid-block-height')).toBe('0%');
    expect(blocks[0].classList.contains('clipped-top')).toBe(false);
    expect(blocks[0].classList.contains('clipped-bottom')).toBe(false);
  });

  it('names the grid block with its time once', () => {
    const words = accessibleWords(renderView('grid', [reminder(AT)], { time_24h: true }));

    expect(words).toEqual([['Reminder', '14:41']]);
  });

  it.each([
    ['cascade', undefined],
    ['columns', 'columns'],
  ] as const)(
    'puts two reminders at one instant side by side rather than one on the other (%s)',
    (_layout, overlapLayout) => {
      const container = renderView(
        'grid',
        [reminder(AT, 'Water plants'), reminder(AT, 'Take tablet')],
        overlapLayout ? { time_grid: { overlap_layout: overlapLayout } } : {},
      );
      const blocks = [
        ...container.querySelectorAll<HTMLElement>('.grid-event:not(.grid-event-overflow)'),
      ];

      expect(
        blocks.map((block) => block.querySelector('.event-title')?.textContent?.trim()),
      ).toEqual(['Water plants', 'Take tablet']);
      // The emitted attribute, not `style.width`: happy-dom's CSSOM discards a `calc()` that
      // holds a custom property, so the CSSOM reads empty for what the renderer wrote.
      const styles = blocks.map((block) => block.getAttribute('style') ?? '');
      expect(styles.map((style) => /inset-inline-start:\s*calc\((\d+)%/.exec(style)?.[1])).toEqual([
        '0',
        '50',
      ]);
      expect(/(?:^|;)\s*width:\s*calc\(50%/.test(styles[1])).toBe(true);

      // Two instants at one minute start together, so even the cascade puts them side by
      // side. There the first one's box runs on under the second, which is painted over it,
      // and its text keeps to its own half; in columns the box itself stops there.
      if (overlapLayout === 'columns') {
        expect(/(?:^|;)\s*width:\s*calc\(50%/.test(styles[0])).toBe(true);
      } else {
        expect(blocks[0].style.getPropertyValue('--calendar-card-grid-text-inline-ratio')).toBe(
          '0.5',
        );
      }
    },
  );

  // The band is half-open, and the lower edge is the one an instant needed spelled out.
  it.each([
    ['at the band start', '2026-06-17T07:00:00.000Z', 1],
    ['a minute before the band end', '2026-06-17T21:59:00.000Z', 1],
    ['at the band end', '2026-06-17T22:00:00.000Z', 0],
    ['a minute before the band start', '2026-06-17T06:59:00.000Z', 0],
  ])('draws a grid reminder %s only when inside the band', (_case, at, expected) => {
    const container = renderView('grid', [reminder(at)]);

    expect(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).toHaveLength(
      expected,
    );
  });
});

describe('the countdown to an event with no duration', () => {
  const config = buildConfig({ show_countdown: true });
  const countdown = (event: Types.CalendarEventData) =>
    buildEventPresentation(event, config, 'en').contentParts.countdownStr;

  it('counts down to its start exactly as to any event starting then', () => {
    // A countdown reads the start alone, so a reminder and a meeting at the same minute
    // must agree — and the reminder must have one at all.
    expect(countdown(reminder(AT))).not.toBeNull();
    expect(countdown(reminder(AT))).toBe(countdown(timed(AT, '2026-06-17T15:41:00.000Z')));
    expect(getCountdownString(reminder(AT), 'en')).toBe(countdown(reminder(AT)));
  });

  it.each([
    ['at its instant', 0],
    ['a millisecond after it', 1],
  ])('has none %s', (_case, offsetMs) => {
    vi.setSystemTime(new Date(Date.parse(AT) + offsetMs));

    expect(countdown(reminder(AT))).toBeNull();
  });
});

describe('the progress bar of an event with no duration', () => {
  /**
   * Progress is elapsed time over duration, and a reminder's duration is zero, so the bar
   * is only safe because `isEventCurrentlyRunning` is half-open: running from the start up
   * to, but not including, the end. An empty interval is never running, so the division is
   * never reached. Pinned at the instant and either side of it, because an inclusive end
   * would make the instant itself compute 0/0 and draw `width: NaN%` for one render — and
   * the bar would appear and vanish around it.
   */
  it.each([
    ['a millisecond before it', -1],
    ['at its instant', 0],
    ['a millisecond after it', 1],
  ])('is never running %s', (_case, offsetMs) => {
    vi.setSystemTime(new Date(Date.parse(AT) + offsetMs));
    const event = reminder(AT);
    const config = buildConfig({ show_progress_bar: true });

    expect(EventUtils.isEventCurrentlyRunning(event)).toBe(false);
    expect(EventUtils.calculateEventProgress(event)).toBeNull();
    expect(buildEventPresentation(event, config, 'en').contentParts.progressPercentage).toBeNull();
  });

  it.each(VIEWS)('draws no bar in %s view at its instant', (view) => {
    vi.setSystemTime(new Date(AT));
    const container = renderView(view, [reminder(AT)], { show_progress_bar: true });

    expect(container.querySelectorAll('.progress-bar')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('NaN');
  });

  // Without this the assertions above would pass for a renderer that never draws a bar.
  it.each(VIEWS)('CONTROL: draws a bar in %s view for an event running then', (view) => {
    vi.setSystemTime(new Date(Date.parse(AT) + 30_000));
    const container = renderView(view, [timed(AT, '2026-06-17T14:42:00.000Z', 'Meeting')], {
      show_progress_bar: true,
    });

    expect(container.querySelectorAll('.progress-bar')).toHaveLength(1);
    expect(container.querySelector<HTMLElement>('.progress-bar-filled')?.style.width).toBe('50%');
  });

  it('leaves the percentage out of the grid block name', () => {
    vi.setSystemTime(new Date(AT));
    const words = accessibleWords(
      renderView('grid', [reminder(AT)], { show_progress_bar: true, time_24h: true }),
    );

    expect(words).toEqual([['Reminder', '14:41']]);
  });
});
