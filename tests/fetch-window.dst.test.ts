import { describe, expect, it } from 'vitest';

import { getTimeWindow } from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

/**
 * The window a card asks Home Assistant for, across a DST change.
 *
 * The window is half-open: local midnight on its first day to local midnight after its last.
 * Over a week that crosses a DST change those two midnights are not a whole number of 24-hour
 * days apart, so an end computed as `start + days * 24 h` lands an hour off midnight and asks
 * for an hour of the next day, or stops an hour short of the last one.
 *
 * Every zone this runs under catches that, and none is uniquely required: the transitions are
 * found at run time rather than written down, so each zone checks its own two.
 */

/** Days of 2026 during which the local UTC offset changes. */
function transitions(): Date[] {
  const found: Date[] = [];
  for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026;) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    if (next.getTimezoneOffset() !== day.getTimezoneOffset()) found.push(day);
    day = next;
  }
  return found;
}

describe('the fetch window across a DST change', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2026, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2026, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
    expect(transitions()).toHaveLength(2);
  });

  it.each(transitions().map((day) => [getLocalDateKey(day), day] as const))(
    'a week spanning the change on %s ends at local midnight after its last day',
    (_label, day) => {
      const first = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 3);
      const window = getTimeWindow(7, getLocalDateKey(first), 1);

      expect(window.start.getTime()).toBe(first.getTime());
      expect(window.end.getTime()).toBe(
        new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7).getTime(),
      );
      // The change really is inside: the two midnights are not seven whole days apart.
      expect(window.end.getTime() - window.start.getTime()).not.toBe(7 * 24 * 60 * 60 * 1000);
    },
  );
});
