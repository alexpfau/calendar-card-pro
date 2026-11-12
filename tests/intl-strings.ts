/**
 * Every string the card takes from `Intl`, each through the function the card calls for it, so a
 * test can ask what a language reads as under a given `Intl`.
 *
 * `tests/intl-fallback.test.ts` reconciles the `Intl` calls in `src/` against the one rule they
 * share; this list is what the tests read the rule's effect from, and the place to add a string
 * when a new call writes one.
 */
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';

/** An event starting at a given UTC time on the fixture's day or after it. */
function startingAt(iso: string): Types.CalendarEventData {
  return {
    summary: 'Anna',
    start: { dateTime: iso },
    end: { dateTime: new Date(new Date(iso).getTime() + 3600000).toISOString() },
  } as Types.CalendarEventData;
}

const RRULE_PREFIX = 'ui.components.calendar.event.rrule.';
const RRULE_WORDS: Record<string, string> = {
  every: 'every',
  week: 'week',
  on: 'on',
  until: 'until',
};
const localizeRRule = (key: string) =>
  key.startsWith(RRULE_PREFIX) ? (RRULE_WORDS[key.slice(RRULE_PREFIX.length)] ?? '') : '';

/**
 * Every string the card takes from `Intl` in a language, each through the function the card
 * calls for it. The modules are imported here, so after `vi.resetModules()` they are fresh and
 * no format cached in an earlier case answers; without it, the same modules answer again, caches
 * and all, which is what a test of emptying those caches needs.
 *
 * @param language - The language to read the strings in
 * @returns Each string by name, and whether the clock is 24-hour
 */
export async function intlStrings(
  language: string,
): Promise<Record<string, string | boolean | null>> {
  const { getNowString, getRelativeUnitString } = await import('../src/translations/dayjs');
  const Paging = await import('../src/utils/paging');
  const Format = await import('../src/utils/format');
  const Presentation = await import('../src/rendering/presentation');
  const { spanText } = await import('../src/interaction/popover-model');
  const { describeRRule } = await import('../src/interaction/rrule');
  const { getTimeFormat24h } = await import('../src/utils/helpers');
  const { formatList } = await import('../src/rendering/editor/localize');

  const running = startingAt('2026-06-17T09:30:00.000Z');
  const tuesday = new Date(2026, 5, 16);
  const presentation = Presentation.buildEventPresentation(running, buildConfig(), language);

  return {
    now: getNowString(language),
    nowBadge: presentation.contentParts.nowLabel ?? null,
    hours: getRelativeUnitString(3, 'hour', language),
    tomorrow: getRelativeUnitString(1, 'day', language),
    countdownHours: Format.getCountdownString(startingAt('2026-06-17T14:00:00.000Z'), language),
    countdownTomorrow: Format.getCountdownString(startingAt('2026-06-18T12:00:00.000Z'), language),
    today: Paging.todayWord(language),
    dayName: Paging.dayName(tuesday, language),
    monthHeading: Paging.monthHeadingText(Paging.monthHeadingParts(tuesday, language)),
    popoverSpan: spanText(
      { allDay: false, start: new Date(2026, 5, 16, 13, 0), end: new Date(2026, 5, 16, 14, 0) },
      language,
      true,
    ),
    rrule: describeRRule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260714', localizeRRule, language) ?? null,
    // Ends on a Friday, which Nynorsk and Bokmål both call "fredag": the weekday in this
    // phrase is the card's own word, and the rest of the date is the browser's.
    endDate: Format.formatEventTime(
      {
        summary: 'Anna',
        start: { dateTime: '2026-06-17T09:30:00.000Z' },
        end: { dateTime: '2026-06-19T15:00:00.000Z' },
      } as Types.CalendarEventData,
      buildConfig({ split_multiday_events: false, time_24h: true }),
      language,
    ),
    clock24h: getTimeFormat24h({ time_format: 'language', language }),
    editorList: formatList(language, ['Anna', 'Ben'], 'conjunction'),
  };
}
