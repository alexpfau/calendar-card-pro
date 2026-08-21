/**
 * The `YEAR=` age marker, end to end.
 *
 * Two things about this feature make a naive test file prove nothing, and both shaped
 * what is below.
 *
 * **The read side and the write side are different objects.** The marker is read off the
 * raw event and the count is written into the display copy `groupEventsByDay` builds. A
 * test that seeds `description` and then reads `description` back would pass against an
 * implementation that scanned the display copy — which is broken for every user on the
 * default config, because `show_description` defaults to `false` and the display copy's
 * description is `''` in that case. The default-config assertions below are therefore the
 * load-bearing ones, and `show_description: true` is the *variation*, not the baseline.
 *
 * **The grammar's value is in what it rejects.** An accept-only table cannot distinguish
 * the intended pattern from `/\d{4}/`, so every accepted form here is paired with a
 * near-miss that must not match, and `Academic Year: 2025` is the fixture the grammar
 * exists for: it is a plausible timetable description that a whitespace-tolerant
 * separator turns into `(1)` on every event in the calendar half of the year.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventAge from '../src/utils/event-age';
import * as EventUtils from '../src/utils/events';

/** The instant every test here runs at: a plain mid-week day in 2026, well clear of any
 * year boundary, so the year read from an event is never in question for the wrong reason.
 * The January-1 case that *is* about the boundary lives in `age-marker.dst.test.ts`. */
const FROZEN_NOW = new Date('2026-06-17T10:00:00.000Z');

/** An all-day birthday on the frozen day, which is the shape every calendar produces for
 * a yearly recurring birthday. */
function birthday(
  description: string,
  summary = 'Alex Geburtstag',
  date = '2026-06-17',
): Types.CalendarEventData {
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: { date },
    end: { date: end.toISOString().slice(0, 10) },
    summary,
    description,
    _entityId: 'calendar.personal',
  };
}

/** The single display-copy event `groupEventsByDay` produces for one raw event. */
function displayed(
  event: Types.CalendarEventData,
  overrides: Partial<Types.Config> = {},
): Types.CalendarEventData {
  const config = buildConfig({ days_to_show: 7, ...overrides });
  const events = EventUtils.groupEventsByDay([event], config, true, 'en').flatMap(
    (day) => day.events,
  );

  expect(events).toHaveLength(1);
  return events[0];
}

describe('the YEAR marker grammar', () => {
  // Every one of these is a form somebody could reasonably type. The colon and the equals
  // sign each have a proponent on #124, so both are accepted rather than one being chosen.
  it.each([
    { description: 'YEAR=1986', year: 1986, why: 'the documented form' },
    { description: 'YEAR:1966', year: 1966, why: 'the form the reporter proposed' },
    { description: 'year=1986', year: 1986, why: 'lowercase' },
    { description: 'Year:1966', year: 1966, why: 'title case' },
    { description: 'Geboren YEAR=1966', year: 1966, why: 'after other text' },
    { description: 'Ralf\nYEAR=1966', year: 1966, why: 'on its own line' },
    { description: 'YEAR=1966\nRalf', year: 1966, why: 'on the first line' },
    { description: 'YEAR=1966.', year: 1966, why: 'followed by a full stop' },
    { description: 'YEAR=1966, Berlin', year: 1966, why: 'followed by a comma' },
    { description: 'Geboren\u00a0YEAR=1966', year: 1966, why: 'after a decoded &nbsp;' },
    { description: 'Wedding YEAR=2015', year: 2015, why: 'an anniversary, same grammar' },
  ])('reads $year from $why', ({ description, year }) => {
    expect(EventAge.readMarkerYear(description)).toBe(year);
  });

  // The half that carries the weight. Each of these is a *near* miss — text that a looser
  // grammar would accept — rather than something obviously unrelated.
  it.each([
    { description: 'Academic Year: 2025', why: 'prose puts a space after its colon' },
    { description: 'YEAR = 1986', why: 'spaces around the separator are the prose form' },
    { description: 'https://example.com/?year=2024&t=1', why: 'a query string in a link' },
    { description: 'FISCALYEAR=2024', why: 'the marker must stand as its own token' },
    { description: 'BIRTHYEAR=1966', why: 'likewise, however reasonable it looks' },
    { description: 'YEAR=19866', why: 'more than four digits is not a year' },
    { description: 'YEAR=198', why: 'fewer than four digits is not a year either' },
    { description: 'YEAR=1966_x', why: 'a word character follows the digits' },
    { description: '(YEAR=1966)', why: 'a bracket is not whitespace' },
    { description: 'The year 1986 was a good one', why: 'no separator at all' },
    { description: 'Born in 1966', why: 'a bare year is not a marker' },
    { description: '', why: 'nothing at all' },
  ])('rejects $description, because $why', ({ description }) => {
    expect(EventAge.readMarkerYear(description)).toBeNull();
  });

  it('takes the first marker when a description carries two', () => {
    expect(EventAge.readMarkerYear('YEAR=1966 and YEAR=1970')).toBe(1966);
  });

  // The prefilter must never be able to hide a marker the grammar would have read. This
  // reconciles the two against each other rather than testing the prefilter's own idea of
  // itself: any accepted form has to survive it.
  it.each([
    'YEAR=1986',
    'Geboren YEAR=1966',
    'year:1966',
    '<p>YEAR=1986</p>',
    'Geboren\u00a0YEAR=1966',
  ])('lets %s past the prefilter', (description) => {
    expect(EventAge.mayCarryAgeMarker(description)).toBe(true);
  });

  it.each(['', 'Dinner with the team', 'Born in 1966'])('spends nothing on %s', (description) => {
    expect(EventAge.mayCarryAgeMarker(description)).toBe(false);
  });
});

describe('the count itself', () => {
  it('subtracts, because the event is the birthday', () => {
    expect(EventAge.resolveAgeCount(2026, 1986)).toBe(40);
  });

  it('serves an anniversary with the same subtraction', () => {
    expect(EventAge.resolveAgeCount(2026, 2015)).toBe(11);
  });

  // The guard that does the work a plausibility range on the year would not: a feed
  // stamping the current year into every description becomes a no-op rather than
  // appending `(0)` to every title on the card.
  it('shows nothing when the marker names the event`s own year', () => {
    expect(EventAge.resolveAgeCount(2026, 2026)).toBeNull();
  });

  it('shows nothing rather than a negative number for a future year', () => {
    expect(EventAge.resolveAgeCount(2026, 2030)).toBeNull();
  });

  // No upper bound: implausible for a person, ordinary for an anniversary.
  it('does not cap a long anniversary', () => {
    expect(EventAge.resolveAgeCount(2026, 1526)).toBe(500);
  });
});

describe('appending the count to a title', () => {
  it('appends in brackets', () => {
    expect(EventAge.appendAgeCount('Alex Geburtstag', 40)).toBe('Alex Geburtstag (40)');
  });

  it('drops the leading space when there is no title to append to', () => {
    expect(EventAge.appendAgeCount('', 40)).toBe('(40)');
    expect(EventAge.appendAgeCount('   ', 40)).toBe('(40)');
  });

  it('appends after a title that already ends in a bracketed number', () => {
    // Honest rather than pretty. Suppressing the count here would silently drop it, which
    // is the worse of the two outcomes.
    expect(EventAge.appendAgeCount('Standup (2)', 40)).toBe('Standup (2) (40)');
  });
});

describe('stripping the marker out of a description', () => {
  // Exact output strings, not `not.toContain('YEAR')`. Every artifact this strip can
  // produce is a whitespace one, and a containment assertion is blind to all of them.
  it.each([
    { before: 'Geboren YEAR=1966 in Berlin', after: 'Geboren in Berlin' },
    { before: 'YEAR=1966 Geboren', after: 'Geboren' },
    { before: 'Geboren  YEAR=1966  in Berlin', after: 'Geboren in Berlin' },
    { before: 'YEAR=1966', after: '' },
    { before: 'a YEAR=1900 YEAR=1901 b', after: 'a b' },
    { before: 'Line1\nYEAR=1966\nLine2', after: 'Line1\nLine2' },
  ])('turns $before into $after', ({ before, after }) => {
    expect(EventAge.stripAgeMarker(before)).toBe(after);
  });

  // The doubled-separator case above is the one a single-character left boundary gets
  // wrong: it consumes one space of four and leaves three. Pinned separately so the
  // reason survives if the table is ever reshuffled.
  it('does not leave a run of spaces where the marker was', () => {
    expect(EventAge.stripAgeMarker('Geboren  YEAR=1966  in Berlin')).not.toMatch(/ {2}/);
  });

  it('keeps the line structure of a multi-line description', () => {
    expect(EventAge.stripAgeMarker('Agenda\nCake\nYEAR=1966\nPresents')).toBe(
      'Agenda\nCake\nPresents',
    );
  });

  it('leaves a description that only looks like a marker alone', () => {
    expect(EventAge.stripAgeMarker('Academic Year: 2025')).toBe('Academic Year: 2025');
  });
});

describe('an event on the card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 🚨 Default config, which means `show_description: false`. This is the assertion that
  // fails against an implementation reading the display copy instead of the raw event,
  // and it is the configuration almost every card is on.
  it('shows the age with descriptions turned off', () => {
    expect(displayed(birthday('YEAR=1986')).summary).toBe('Alex Geburtstag (40)');
  });

  it('still shows no description, having read one', () => {
    expect(displayed(birthday('YEAR=1986')).description).toBe('');
  });

  it('shows the age with descriptions turned on', () => {
    const event = displayed(birthday('YEAR=1986'), { show_description: true });
    expect(event.summary).toBe('Alex Geburtstag (40)');
  });

  // The leak: the marker is card syntax, so it must not survive into the drawn text.
  it('keeps the marker out of the description it draws', () => {
    const event = displayed(birthday('Geboren YEAR=1986 in Berlin'), { show_description: true });
    expect(event.description).toBe('Geboren in Berlin');
    expect(event.description).not.toContain('YEAR');
  });

  it('draws no description at all when the marker was the whole of it', () => {
    // Not an edge case: the marker is metadata, so a description containing nothing but
    // the marker is the natural way to write one. `leaves.ts` renders the description
    // block behind a truthiness guard, so an empty string is the difference between no
    // description row and an empty one.
    expect(displayed(birthday('YEAR=1986'), { show_description: true }).description).toBe('');
  });

  it('reads a marker wrapped in the HTML a rich-text calendar produces', () => {
    expect(displayed(birthday('<p>Geboren <b>YEAR=1986</b></p>')).summary).toBe(
      'Alex Geburtstag (40)',
    );
  });

  // The fixture that must not match, at the level that matters — the whole pipeline, not
  // just the regex.
  it('leaves a timetable description alone', () => {
    const event = displayed(birthday('Academic Year: 2025'), { show_description: true });
    expect(event.summary).toBe('Alex Geburtstag');
    expect(event.description).toBe('Academic Year: 2025');
  });

  it('leaves an event with no description alone', () => {
    const event = displayed({ ...birthday(''), description: undefined });
    expect(event.summary).toBe('Alex Geburtstag');
  });

  // Recognized but suppressed. The marker still goes, because showing raw card syntax
  // with no number beside it is the worst of the available outcomes.
  it('removes a marker whose count is suppressed', () => {
    const event = displayed(birthday('YEAR=2026'), { show_description: true });
    expect(event.summary).toBe('Alex Geburtstag');
    expect(event.description).toBe('');
  });

  it('does not touch the raw event it was handed', () => {
    // The transform belongs to the display copy. Writing it back would persist into
    // `this.events` and the cache, and compound on every render.
    const raw = birthday('YEAR=1986');
    displayed(raw);
    expect(raw.summary).toBe('Alex Geburtstag');
    expect(raw.description).toBe('YEAR=1986');
  });

  it('is stable across repeated renders', () => {
    const raw = birthday('YEAR=1986');
    expect(displayed(raw).summary).toBe('Alex Geburtstag (40)');
    expect(displayed(raw).summary).toBe('Alex Geburtstag (40)');
  });
});

describe('the sort the count is appended before', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // `groupEventsByDay` sorts same-time all-day events by `summary.localeCompare`, and that
  // sort runs *after* the display copies are built — so it reads whatever the count wrote.
  // A suffix sits past the character two titles differ at; a prefix would reorder the list.
  it('keeps birthdays in title order', () => {
    const config = buildConfig({ days_to_show: 7 });
    const events = EventUtils.groupEventsByDay(
      [
        birthday('YEAR=1996', 'Zoe Geburtstag'),
        birthday('YEAR=1986', 'Alex Geburtstag'),
        birthday('YEAR=1976', 'Mia Geburtstag'),
      ],
      config,
      true,
      'en',
    ).flatMap((day) => day.events);

    expect(events.map((event) => event.summary)).toEqual([
      'Alex Geburtstag (40)',
      'Mia Geburtstag (50)',
      'Zoe Geburtstag (30)',
    ]);
  });

  // The one case where the suffix does decide the order, and it is harmless: the summary
  // comparison is the last link of a chain that tries entity index first, so it only fires
  // within one calendar at one all-day start, and two people sharing a title is the only
  // way to reach it.
  it('orders two identical titles by their count', () => {
    const config = buildConfig({ days_to_show: 7 });
    const events = EventUtils.groupEventsByDay(
      [birthday('YEAR=1976', 'Geburtstag'), birthday('YEAR=1986', 'Geburtstag')],
      config,
      true,
      'en',
    ).flatMap((day) => day.events);

    expect(events.map((event) => event.summary)).toEqual(['Geburtstag (40)', 'Geburtstag (50)']);
  });
});
