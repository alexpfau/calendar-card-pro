import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/**
 * `remove_location_country` accepts a raw regular expression. The editor stores whatever
 * is typed into its "Custom Pattern" field without validating it, and YAML bypasses the
 * editor entirely, so the value reaching `formatLocation` may not compile. It is applied
 * during `groupEventsByDay`, on the render path, where a throw takes down the whole card.
 *
 * These tests pin that a pattern which does not compile is ignored rather than thrown.
 */

const LOCATION = 'Hauptstrasse 1, Berlin, Germany';

function eventAt(location: string): Types.CalendarEventData {
  return {
    start: { dateTime: '2026-06-17T12:00:00.000Z' },
    end: { dateTime: '2026-06-17T13:00:00.000Z' },
    summary: 'Meeting',
    location,
    _entityId: 'calendar.personal',
  } as Types.CalendarEventData;
}

/** Runs the full grouping pass the card performs before rendering. */
function renderedLocation(pattern: boolean | string): string | undefined {
  const config = buildConfig({ remove_location_country: pattern, show_location: true });
  const days = EventUtils.groupEventsByDay([eventAt(LOCATION)], config, false, 'en');

  return days[0]?.events?.[0]?.location;
}

// Patterns that are not valid regular expressions. Each previously threw a SyntaxError.
const MALFORMED = ['[', '(', '*', '+', '?', 'a{2,1}', '\\', '(?<', '[z-a]', '(?'];

describe('malformed remove_location_country patterns', () => {
  beforeEach(() => {
    vi.setSystemTime(FROZEN_NOW);
  });

  it.each(MALFORMED)('leaves the location untouched instead of throwing: %j', (pattern) => {
    expect(() => FormatUtils.formatLocation(LOCATION, pattern)).not.toThrow();
    expect(FormatUtils.formatLocation(LOCATION, pattern)).toBe(LOCATION);
  });

  it.each(MALFORMED)('does not break the render path: %j', (pattern) => {
    expect(() => renderedLocation(pattern)).not.toThrow();
    expect(renderedLocation(pattern)).toBe(LOCATION);
  });

  it('warns once per distinct broken pattern rather than once per call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // A pattern no other test uses, so the shared compile cache starts empty for it.
    const pattern = '([unclosed';
    for (let i = 0; i < 5; i++) FormatUtils.formatLocation(LOCATION, pattern);

    const mentioning = warn.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('remove_location_country')),
    );
    expect(mentioning).toHaveLength(1);

    warn.mockRestore();
  });

  // Controls: the country-stripping feature itself still works, so the tests above are
  // measuring tolerance of a broken pattern and not a path that stopped running.
  it('still strips the country for a well-formed pattern', () => {
    expect(FormatUtils.formatLocation(LOCATION, 'Germany|USA')).toBe('Hauptstrasse 1, Berlin');
    expect(renderedLocation('Germany|USA')).toBe('Hauptstrasse 1, Berlin');
  });

  it('still strips a built-in country name in the default boolean mode', () => {
    expect(FormatUtils.formatLocation(LOCATION, true)).toBe('Hauptstrasse 1, Berlin');
    expect(renderedLocation(true)).toBe('Hauptstrasse 1, Berlin');
  });

  it('still returns the location verbatim when country removal is off', () => {
    expect(FormatUtils.formatLocation(LOCATION, false)).toBe(LOCATION);
    expect(renderedLocation(false)).toBe(LOCATION);
  });
});
