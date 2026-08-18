/**
 * `filter_duplicates` decides what to hide by comparing a signature built from an event's
 * title, time and location. Every existing test for the option uses events that differ in
 * *time*, so the time component alone separates them and the other two components never
 * carry a decision. Degrade either one and the tests stay green while the card silently
 * drops real events — "if events are disappearing unexpectedly" is exactly the symptom the
 * option's own documentation tells people to watch for.
 *
 * These cases put weight on each component in turn, using pairs that are identical except
 * for the one field under test, so a signature that stops distinguishing on that field
 * fails here rather than in a user's calendar.
 *
 * The all-day pairs deliberately share one end of their span rather than sliding both, the
 * way successive occurrences of a repeating event do. A pair that moves wholesale is still
 * separated by whichever end survives, so it cannot show that both ends are being read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Same calendar, same clock slot — only the field under test differs. */
function timed(
  summary: string,
  location: string | undefined,
  from = '09:00',
  to = '10:00',
): Types.CalendarEventData {
  return {
    start: { dateTime: `2026-06-18T${from}:00.000Z` },
    end: { dateTime: `2026-06-18T${to}:00.000Z` },
    summary,
    ...(location === undefined ? {} : { location }),
    _entityId: 'calendar.personal',
  };
}

/** An all-day event, in the shape a calendar delivers one: an exclusive end date. */
function allDay(summary: string, date: string, endDate: string): Types.CalendarEventData {
  return {
    start: { date },
    end: { date: endDate },
    summary,
    _entityId: 'calendar.personal',
  };
}

function kept(events: Types.CalendarEventData[]): string[] {
  return survivors(events).map((event) => event.summary ?? '');
}

/** For pairs that share a title, the span is the only thing left to tell them apart. */
function keptSpans(events: Types.CalendarEventData[]): string[] {
  return survivors(events).map((event) => `${event.start.date}→${event.end.date}`);
}

function survivors(events: Types.CalendarEventData[]): Types.CalendarEventData[] {
  const config = buildConfig({
    entities: ['calendar.personal'],
    filter_duplicates: true,
    days_to_show: 7,
  } as Partial<Types.Config>);
  config.entities = Config.normalizeEntities(config.entities);

  return EventUtils.groupEventsByDay(events, config, false, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay);
}

describe('filter_duplicates compares more than the clock', () => {
  it('control: two events alike in every compared field collapse to one', () => {
    // The opposite direction. Without this the cases below would also pass against a
    // signature that never matched anything, i.e. with the feature quietly disabled.
    expect(kept([timed('Shared standup', undefined), timed('Shared standup', undefined)])).toEqual([
      'Shared standup',
    ]);
  });

  it('keeps two differently titled events that share a slot', () => {
    // Overlapping commitments in one calendar are ordinary, and both belong on the card.
    expect(kept([timed('Standup', undefined), timed('Dentist', undefined)])).toEqual([
      'Standup',
      'Dentist',
    ]);
  });

  it('keeps one title running in two places at once', () => {
    // Location is the last thing separating these; the calendar itself treats them as two
    // bookings.
    expect(kept([timed('Review', 'Room A'), timed('Review', 'Room B')])).toEqual([
      'Review',
      'Review',
    ]);
  });

  it('keeps same-titled all-day events that begin together but end apart', () => {
    // A one-day placeholder alongside the full trip. Identify an all-day event by its
    // start alone and the longer one vanishes.
    expect(
      keptSpans([
        allDay('Trip', '2026-06-18', '2026-06-19'),
        allDay('Trip', '2026-06-18', '2026-06-21'),
      ]),
    ).toEqual(['2026-06-18→2026-06-19', '2026-06-18→2026-06-21']);
  });

  it('keeps same-titled all-day events that end together but begin apart', () => {
    // The mirror image: someone joining partway through a stretch that is already on the
    // calendar. Both ends of the span carry identity, not just one.
    expect(
      keptSpans([
        allDay('Trip', '2026-06-18', '2026-06-21'),
        allDay('Trip', '2026-06-20', '2026-06-21'),
      ]),
    ).toEqual(['2026-06-18→2026-06-21', '2026-06-20→2026-06-21']);
  });
});
