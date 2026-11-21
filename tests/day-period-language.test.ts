import { render as litRender } from 'lit';
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import { formatEventTime, formatTime, isolateClockReadings } from '../src/utils/format';

/**
 * A 12-hour time in Japanese, Korean and Chinese carries its own day period, before the time:
 * `午前11:00`, `오전 11:00`, `上午11:00`. The card wrote `11:00 AM` in every language, so a
 * Japanese card was translated except for its times.
 *
 * The expectations are written out rather than taken from `Intl`, which is what the code reads:
 * deriving them would only restate it. Every other language keeps AM and PM byte for byte.
 */

const morning = new Date(2026, 10, 10, 11, 0);
const afternoon = new Date(2026, 10, 10, 12, 30);
const evening = new Date(2026, 10, 10, 21, 5);

describe('12-hour times in the language of the card', () => {
  it('runs on a build with full locale data', () => {
    expect(new Intl.DateTimeFormat('ja', { hour: 'numeric', hour12: true }).format(morning)).toBe(
      '午前11時',
    );
  });

  it.each([
    ['ja', '午前11:00', '午後12:30', '午後9:05'],
    ['ko', '오전 11:00', '오후 12:30', '오후 9:05'],
    ['zh-cn', '上午11:00', '下午12:30', '下午9:05'],
    ['zh-tw', '上午11:00', '下午12:30', '下午9:05'],
    ['en', '11:00 AM', '12:30 PM', '9:05 PM'],
    ['en-gb', '11:00 AM', '12:30 PM', '9:05 PM'],
    ['de', '11:00 AM', '12:30 PM', '9:05 PM'],
    ['he', '11:00 AM', '12:30 PM', '9:05 PM'],
    ['el', '11:00 AM', '12:30 PM', '9:05 PM'],
  ])('writes %s as %j, %j and %j', (language, am, noon, pm) => {
    expect(formatTime(morning, false, false, language)).toBe(am);
    expect(formatTime(afternoon, false, false, language)).toBe(noon);
    expect(formatTime(evening, false, false, language)).toBe(pm);
  });

  it('keeps the padding and the 24-hour clock as they were', () => {
    expect(formatTime(evening, false, true, 'ja')).toBe('午後09:05');
    expect(formatTime(evening, true, false, 'ja')).toBe('21:05');
    expect(formatTime(evening, false)).toBe('9:05 PM');
  });

  it('writes an event row in the day period of the card', () => {
    const config = buildConfig({ time_24h: false });
    const event = {
      summary: 'Anna',
      start: { dateTime: morning.toISOString() },
      end: { dateTime: afternoon.toISOString() },
    } as Types.CalendarEventData;
    expect(formatEventTime(event, config, 'ja')).toBe('午前11:00 - 午後12:30');
    expect(formatEventTime(event, config, 'en')).toBe('11:00 AM - 12:30 PM');
  });

  it('keeps a day period beside its digits when a line wraps', () => {
    // The space after AM and PM becomes a no-break one when drawn; Korean's before the time too.
    expect(isolateClockReadings(formatTime(morning, false, false, 'ko'))).toBe(
      '\u2068오전\u00a011:00\u2069',
    );
    expect(isolateClockReadings('11:00 AM')).toBe('\u206811:00\u00a0AM\u2069');
  });

  it.each(['grid', 'month'] as const)(
    'writes the times on %s in the day period of the card',
    (view) => {
      // Thursday 12 to Sunday 15 November 2026, on UTC: a block or line starting 11:00, and an
      // overnight one whose later day reads its end.
      const events = [
        {
          summary: 'Anna',
          start: { dateTime: '2026-11-12T11:00:00Z' },
          end: { dateTime: '2026-11-12T12:30:00Z' },
        },
        {
          summary: 'Ben',
          start: { dateTime: '2026-11-13T21:00:00Z' },
          end: { dateTime: '2026-11-14T09:05:00Z' },
        },
      ] as Types.CalendarEventData[];
      const config = buildConfig({
        view,
        time_24h: false,
        start_date: view === 'month' ? '2026-10-26' : '2026-11-12',
        days_to_show: view === 'month' ? 42 : 3,
      });
      const effective = ViewConfig.resolveEffectiveConfig(config, view);
      const days = EventUtils.groupEventsByDay(events, config, false, 'ja', view);
      const container = document.createElement('div');
      litRender(
        view === 'grid'
          ? Grid.renderGridGroupedEvents(days, effective, 'ja', undefined, null, morning)
          : Render.renderMonthGroupedEvents(days, new Date(2026, 9, 26), effective, 'ja', 4, null),
        container,
      );
      const text = container.textContent!.replace(/[\u2066-\u2069\u200f]/g, '');
      expect(text).toContain('午前11:00');
      expect(text).toContain('午前9:05');
    },
  );
});
