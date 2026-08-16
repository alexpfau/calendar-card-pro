import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { generateCustomPropertiesObject } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';
import { formatEventTime, formatLocation } from '../src/utils/format';

/**
 * Options that render nothing at their default.
 *
 * The suite is built from default config, so an option whose default is `false`,
 * `undefined` or `0` produces no output and is invisible to every DOM gate — the
 * gate passes because the renderer agrees with the default by accident, not
 * because the option works. `max-lines.test.ts` closes that gap for the four
 * `*_max_lines` options; an audit of all 36 off-defaults in `DEFAULT_CONFIG`
 * found four more with no behavioural coverage at all:
 *
 * | Option                    | Default     | Previously covered by       |
 * | ------------------------- | ----------- | --------------------------- |
 * | `title_font_size`         | `undefined` | nothing                     |
 * | `title_color`             | `undefined` | editor label strings only   |
 * | `time_two_digit_hours`    | `false`     | nothing                     |
 * | `remove_location_country` | `false`     | editor schema mapping only  |
 *
 * Editor-schema coverage does not count here. It proves the option reaches the
 * stored config, not that anything downstream reads it — which is the failure
 * this file exists to catch.
 *
 * Every test below is paired with its default-state counterpart. A lone on-state
 * assertion cannot distinguish "the option works" from "the fixture happens to
 * produce this"; the pair can, because only the option differs between them.
 */

/** A timed event on the frozen date, in UTC to match the pinned zone. */
function timedEvent(
  startHour: string,
  endHour: string,
  location?: string,
): Types.CalendarEventData {
  return {
    start: { dateTime: `2026-06-17T${startHour}:00.000Z` },
    end: { dateTime: `2026-06-17T${endHour}:00.000Z` },
    summary: 'Standup',
    ...(location === undefined ? {} : { location }),
    _entityId: 'calendar.personal',
  };
}

describe('title typography custom properties', () => {
  it('emits neither property at the default', () => {
    const props = generateCustomPropertiesObject(buildConfig());

    expect(props).not.toHaveProperty('--calendar-card-font-size-title');
    expect(props).not.toHaveProperty('--calendar-card-color-title');
  });

  it('emits the title font size when set', () => {
    const props = generateCustomPropertiesObject(buildConfig({ title_font_size: '32px' }));

    expect(props['--calendar-card-font-size-title']).toBe('32px');
  });

  it('emits the title color when set', () => {
    const props = generateCustomPropertiesObject(
      buildConfig({ title_color: 'var(--accent-color)' }),
    );

    expect(props['--calendar-card-color-title']).toBe('var(--accent-color)');
  });
});

describe('time_two_digit_hours', () => {
  it('leaves a single-digit hour unpadded at the default', () => {
    const config = buildConfig({ time_24h: true, show_end_time: false });

    expect(formatEventTime(timedEvent('09:00', '10:00'), config, 'en')).toBe('9:00');
  });

  it('pads a single-digit hour when enabled', () => {
    const config = buildConfig({
      time_24h: true,
      show_end_time: false,
      time_two_digit_hours: true,
    });

    expect(formatEventTime(timedEvent('09:00', '10:00'), config, 'en')).toBe('09:00');
  });

  it('pads both ends of a range, not just the start', () => {
    const config = buildConfig({ time_24h: true, time_two_digit_hours: true });

    expect(formatEventTime(timedEvent('09:00', '10:00'), config, 'en')).toBe('09:00 - 10:00');
  });

  it('pads the 12-hour clock after the meridiem conversion', () => {
    const config = buildConfig({
      time_24h: false,
      show_end_time: false,
      time_two_digit_hours: true,
    });

    // 14:00 UTC is 2 PM: the pad has to apply to the converted hour, not the raw one.
    expect(formatEventTime(timedEvent('14:00', '15:00'), config, 'en')).toBe('02:00 PM');
  });
});

describe('remove_location_country', () => {
  it('keeps the country at the default', () => {
    expect(formatLocation('Hauptstrasse 1, Berlin, Germany', false)).toBe(
      'Hauptstrasse 1, Berlin, Germany',
    );
  });

  it('strips a recognized country name when enabled', () => {
    expect(formatLocation('Hauptstrasse 1, Berlin, Germany', true)).toBe('Hauptstrasse 1, Berlin');
  });

  it('strips a custom trailing string when given one', () => {
    expect(formatLocation('Hauptstrasse 1, Berlin, Deutschland', 'Deutschland')).toBe(
      'Hauptstrasse 1, Berlin',
    );
  });

  it('leaves a location that does not end with the configured string', () => {
    expect(formatLocation('Hauptstrasse 1, Berlin, Germany', 'Austria')).toBe(
      'Hauptstrasse 1, Berlin, Germany',
    );
  });

  describe('wiring through the grouping path', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FROZEN_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // The leaf tests above prove formatLocation works. These prove the config
    // option actually reaches it — an option can be correct and still be wired
    // to nothing, and that failure is invisible to a leaf test.
    it('leaves the country in place at the default', () => {
      const event = timedEvent('14:00', '15:00', 'Hauptstrasse 1, Berlin, Germany');

      const days = EventUtils.groupEventsByDay([event], buildConfig(), false, 'en');

      expect(days[0].events[0].location).toBe('Hauptstrasse 1, Berlin, Germany');
    });

    it('strips the country when the option is enabled', () => {
      const event = timedEvent('14:00', '15:00', 'Hauptstrasse 1, Berlin, Germany');

      const days = EventUtils.groupEventsByDay(
        [event],
        buildConfig({ remove_location_country: true }),
        false,
        'en',
      );

      expect(days[0].events[0].location).toBe('Hauptstrasse 1, Berlin');
    });
  });
});
