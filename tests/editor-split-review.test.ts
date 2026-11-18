import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import {
  PLANTED,
  budgetDisagreements,
  cardFirstDays,
  disagreements,
  mirrorFirstDays,
  reviewCases,
  reviewEvents,
  reviewNow,
  tiedEvents,
} from './helpers/split-review-cases';
import type * as Types from '../src/config/types';
import * as Days from '../src/rendering/editor/calendar-days';
import { splitEntry } from '../src/rendering/editor/split';
import {
  READ_TIMEOUT,
  readUpcoming,
  reviewParts,
  reviewWindow,
} from '../src/rendering/editor/split-review';
import * as FormatUtils from '../src/utils/format';

/**
 * Split This Calendar's review list: it reads the calendar over the card's own REST
 * path, names the events the card shows for the entry in the layout displayed, and puts each in
 * the first part that keeps it.
 *
 * The case table runs the card's `processEvents` and `groupEventsByDay` beside the editor's
 * mirror under UTC; `editor-split-review.dst.test.ts` runs the same table in the four zones that
 * change their clocks.
 */

describe("Split's review reads the calendar as the card does", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the REST path the card asks, for the window', async () => {
    const callApi = vi.fn().mockResolvedValue([{ summary: 'Dentist', start: {}, end: {} }]);
    const window = { start: new Date(Date.UTC(2026, 0, 14)), end: new Date(Date.UTC(2026, 0, 21)) };

    const events = await readUpcoming({ callApi } as unknown as Types.Hass, 'calendar.ben', window);

    expect(callApi).toHaveBeenCalledWith(
      'GET',
      'calendars/calendar.ben?start=2026-01-14T00:00:00.000Z&end=2026-01-21T00:00:00.000Z',
    );
    expect(events).toEqual([{ summary: 'Dentist', start: {}, end: {}, _entityId: 'calendar.ben' }]);
  });

  it('gives up after its timeout, and on an answer that is no list', async () => {
    vi.useFakeTimers();
    const hang = { callApi: () => new Promise(() => undefined) } as unknown as Types.Hass;
    const window = { start: new Date(0), end: new Date(1) };

    const pending = readUpcoming(hang, 'calendar.ben', window);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();

    const odd = { callApi: () => Promise.resolve({ events: [] }) } as unknown as Types.Hass;
    expect(await readUpcoming(odd, 'calendar.ben', window)).toBeNull();
    const failing = { callApi: () => Promise.reject(new Error('401')) } as unknown as Types.Hass;
    expect(await readUpcoming(failing, 'calendar.ben', window)).toBeNull();
  });
});

describe("Split's review puts each shown event in the first part that keeps it", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(reviewNow());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const hass = {
    config: {},
    locale: { language: 'en', time_format: '24' },
  } as unknown as Types.Hass;

  it('lists all-day events under the first part and timed ones under the second', () => {
    const config = buildConfig({ entities: ['calendar.ben'], days_to_show: 7 });
    const original = config.entities[0];
    const pair = splitEntry(original, { kind: 'type' }, [{}, {}]);
    const window = reviewWindow(config, 'list', hass, reviewNow());

    const [allDay, timed] = reviewParts(
      reviewEvents(),
      original,
      pair,
      window,
      'list',
      hass,
      'en',
      reviewNow(),
    );

    // Ties keep the calendar's order, as the card's own rows do.
    expect(allDay.lines.slice(0, 2)).toEqual([
      'Wed 14 · All day today',
      'Wed 14 · Holiday from Sunday',
    ]);
    expect(timed.lines[0]).toBe('Wed 14 · 9:00 · Conference');
    expect(timed.lines).toHaveLength(5);
    expect(timed.lines[4]).toMatch(/^\+\d+$/);
    // Every event the entry shows, once: the parts' counts add up to the entry's.
    const shown = mirrorCount(config, original);
    expect(allDay.count + timed.count).toBe(shown);
    expect(allDay.count).toBeGreaterThan(0);
  });

  it('gives an event both parts would keep to the first', () => {
    const config = buildConfig({ entities: ['calendar.ben'], days_to_show: 7 });
    const original = config.entities[0];
    const both: readonly [Types.EntityConfig, Types.EntityConfig] = [
      { entity: 'calendar.ben' },
      { entity: 'calendar.ben' },
    ];
    const window = reviewWindow(config, 'list', hass, reviewNow());

    const [first, second] = reviewParts(reviewEvents(), original, both, window, 'list', hass, 'en');

    expect(second.count).toBe(0);
    expect(first.count).toBe(mirrorCount(config, original));
  });

  it('splits by words into the worded part and every other event', () => {
    const config = buildConfig({ entities: ['calendar.ben'], days_to_show: 7 });
    const original = config.entities[0];
    const pair = splitEntry(original, { kind: 'words', terms: ['training'], field: 'title' }, [
      {},
      {},
    ]);
    const window = reviewWindow(config, 'list', hass, reviewNow());

    const [worded, other] = reviewParts(reviewEvents(), original, pair, window, 'list', hass, 'en');

    expect(worded.lines).toEqual(['Fri 16 · 17:00 · Friday training']);
    expect(other.count).toBe(mirrorCount(config, original) - 1);
  });
});

/**
 * How many events the mirror names for an entry.
 *
 * @param config - The card's configuration
 * @param entry - The entry
 * @returns The count
 */
function mirrorCount(config: Types.Config, entry: string | Types.EntityConfig): number {
  return mirrorFirstDays(
    { name: '', view: 'list', config, hass: { config: {}, locale: {} } as unknown as Types.Hass },
    reviewEvents(),
    (inputs) => ({ ...inputs, entry }),
  ).size;
}

describe("Split's review names what the card shows, under UTC", () => {
  const cases = reviewCases();
  const events = reviewEvents();
  let card: ReturnType<typeof cardFirstDays>[] = [];

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(reviewNow());
    card = cases.map((each) => cardFirstDays(each, events));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('names the same events on the same first day as the card, in every case', () => {
    const found = cases.flatMap((each, at) =>
      disagreements(card[at], mirrorFirstDays(each, events)).map((line) => `${each.name}: ${line}`),
    );
    const named = card.reduce((sum, days) => sum + days.size, 0);

    // The denominators beside the verdict: a table that names nothing would agree trivially.
    expect({ cases: cases.length, named: named > cases.length * 5 }).toEqual({
      cases: 2044,
      named: true,
    });
    expect(found).toEqual([]);
  });

  it.each(Object.keys(PLANTED))('disagrees with the card where the mirror has %s', (name) => {
    const found = cases.filter(
      (each, at) =>
        disagreements(card[at], mirrorFirstDays(each, events, PLANTED[name])).length > 0,
    );

    expect(found.length).toBeGreaterThan(0);
  });
});

describe("Split's review rests on a card-wide limit keeping the same events, ties included, under UTC", () => {
  // List's cases: the event limit and Skip First Events act in List alone.
  const cases = reviewCases().filter((each) => each.view === 'list');
  const events = tiedEvents();

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(reviewNow());
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('draws what the entry drew, in its order, each event in the part the review assigns', () => {
    let rows = 0;
    let cut = 0;
    const found = cases.flatMap((each) => {
      const result = budgetDisagreements(each, events);
      rows += result.rows;
      cut += result.cut;
      return result.lines.map((line) => `${each.name}: ${line}`);
    });

    // The denominators beside the verdict: the limits cut rows in most cases, not in none.
    expect({ cases: cases.length, rows: rows > cases.length * 4, cut: cut > cases.length }).toEqual(
      {
        cases: 674,
        rows: true,
        cut: true,
      },
    );
    expect(found).toEqual([]);
    // Draws every List case four times over, twice split; the limit is set for CI's slower
    // runner under load rather than for a hang.
  }, 30_000);

  it('disagrees where every event is assigned to the first part', () => {
    expect(cases.some((each) => budgetDisagreements(each, events, () => 0).lines.length)).toBe(
      true,
    );
  });
});

describe("the review's day helpers are the card's own", () => {
  const letters = [...'abcdefghijklmnopqrstuvwxyz'];
  const pairs = letters.flatMap((a) => letters.map((b) => `${a}${b}`));
  const languages = [
    ...pairs,
    'en-gb',
    'en-us',
    'pt-br',
    'zh-hans',
    'zh-hant',
    'sr-latn',
    'es-419',
    'EN-GB',
  ];
  const week = Array.from({ length: 7 }, (_, day) => new Date(2026, 0, 11 + day));

  it('holds the card’s country table by value', () => {
    expect(Days.WEEKEND_BY_COUNTRY).toEqual(FormatUtils.WEEKEND_BY_COUNTRY);
  });

  it('finds the same weekend and first weekday for every language and country code', () => {
    const mismatches: string[] = [];
    const firstWeekdays = [undefined, '', 'language', 'sunday', 'monday', 'saturday', 'friday'];
    for (const language of languages) {
      for (const first_weekday of firstWeekdays) {
        const locale = { language, first_weekday };
        for (const configured of ['system', 'sunday', 'monday'] as const) {
          if (
            Days.firstDayOfWeek(configured, locale) !==
            FormatUtils.getFirstDayOfWeek(configured, locale)
          ) {
            mismatches.push(`first day: ${configured} ${language} ${first_weekday}`);
          }
        }
      }
      const home = { locale: { language } } as unknown as Types.Hass;
      for (const day of week) {
        if (Days.isWeekend(day, home) !== FormatUtils.isWeekendDate(day, home)) {
          mismatches.push(`weekend: ${language} ${day.getDay()}`);
        }
      }
    }
    for (const country of pairs.map((pair) => pair.toUpperCase())) {
      const home = { config: { country }, locale: { language: 'ar' } } as unknown as Types.Hass;
      for (const day of week) {
        if (Days.isWeekend(day, home) !== FormatUtils.isWeekendDate(day, home)) {
          mismatches.push(`weekend: ${country} ${day.getDay()}`);
        }
      }
    }

    expect({ languages: languages.length, countries: pairs.length, mismatches }).toEqual({
      languages: 684,
      countries: 676,
      mismatches: [],
    });
  });

  it('writes a time and judges a full day as the card does', () => {
    const mismatches: string[] = [];
    const times = [
      new Date(2026, 0, 14, 0, 5),
      new Date(2026, 0, 14, 9, 30),
      new Date(2026, 0, 14, 12, 0),
      new Date(2026, 0, 14, 23, 59),
    ];
    for (const time_24h of [true, false, undefined]) {
      for (const time_format of [undefined, '12', '24', 'language', 'system']) {
        for (const language of ['en', 'de', 'en-gb', 'ja']) {
          for (const time_two_digit_hours of [true, false]) {
            const config = { ...buildConfig(), time_24h, time_two_digit_hours } as Types.Config;
            const home = { locale: { language, time_format } } as unknown as Types.Hass;
            for (const time of times) {
              const card = FormatUtils.formatTime(
                time,
                FormatUtils.resolveTimeFormat24h(config, home),
                time_two_digit_hours,
              );
              if (Days.formatTime(time, config, home) !== card)
                mismatches.push(`${card} ${time_24h} ${time_format} ${language}`);
            }
          }
        }
      }
    }
    const at = (day: number, hour: number, minute = 0): { dateTime: string } => ({
      dateTime: new Date(2026, 0, day, hour, minute).toISOString(),
    });
    const spans: Array<[Types.CalendarEventData['start'], Types.CalendarEventData['end']]> = [
      [{ date: '2026-01-14' }, { date: '2026-01-15' }],
      [{ date: '2026-01-14' }, { date: '2026-01-16' }],
      [at(14, 22), at(15, 6)],
      [at(14, 12), at(15, 12)],
      [at(14, 12), at(15, 11, 59)],
      [at(14, 9), at(17, 8)],
      [at(14, 0), at(15, 0)],
      [at(14, 0), at(16, 0)],
      [at(14, 10), at(14, 18)],
    ];
    for (const [start, end] of spans) {
      if (Days.spansFullDays(start, end) !== (FormatUtils.fullDaySpan(start, end) !== null)) {
        mismatches.push(`span ${JSON.stringify(start)} ${JSON.stringify(end)}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
