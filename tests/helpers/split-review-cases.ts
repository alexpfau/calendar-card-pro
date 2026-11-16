/**
 * The case table Split's review list is checked against (section 5.7): the card's own
 * `processEvents` and `groupEventsByDay` beside the editor's mirror (`split-review.ts`), naming
 * the same events on the same first day. `tests/editor-split-review.test.ts` runs it under the unit
 * project's UTC, and `tests/editor-split-review.dst.test.ts` in the four zones that change their
 * clocks.
 *
 * The moment is pinned to Wednesday 2026-01-14 at 11:30 local time: January, where every zone the
 * suite runs in is off UTC, and a weekday, so today, the week's start and the weekend all differ.
 */

import type * as Types from '../../src/config/types';
import { reviewWindow, shownOn } from '../../src/rendering/editor/split-review';
import * as EventUtils from '../../src/utils/events';
import { getLocalDateKey } from '../../src/utils/format';
import { drawnIn } from '../../src/utils/search';
import { buildConfig } from '../fixtures';

/** The moment every case is judged at. */
export function reviewNow(): Date {
  return new Date(2026, 0, 14, 11, 30);
}

const CALENDAR = 'calendar.ben';

const at = (day: number, hour = 0, minute = 0): string =>
  new Date(2026, 0, day, hour, minute).toISOString();

const date = (day: number): string => getLocalDateKey(new Date(2026, 0, day));

const timed = (summary: string, from: string, to?: string): Types.CalendarEventData =>
  ({
    summary,
    start: { dateTime: from },
    ...(to === undefined ? {} : { end: { dateTime: to } }),
    _entityId: CALENDAR,
  }) as Types.CalendarEventData;

const allDay = (summary: string, from: number, to: number): Types.CalendarEventData => ({
  summary,
  start: { date: date(from) },
  end: { date: date(to) },
  _entityId: CALENDAR,
});

/** Ben's events around the pinned Wednesday, each named for what it tests. */
export function reviewEvents(): Types.CalendarEventData[] {
  return [
    timed('Past this morning', at(14, 8), at(14, 9)),
    timed('Under way now', at(14, 11), at(14, 12)),
    timed('Dentist', at(14, 16), at(14, 16, 45)),
    allDay('All day today', 14, 15),
    allDay('All day yesterday', 13, 14),
    timed('Monday meeting', at(12, 10), at(12, 11)),
    timed('Friday training', at(16, 17), at(16, 18, 30)),
    allDay('Soccer Tournament', 17, 18),
    timed('Sunday brunch', at(18, 9), at(18, 10)),
    allDay('Long weekend', 15, 19),
    timed('Weekend trip', at(16, 20), at(18, 10)),
    allDay('Holiday from Sunday', 11, 16),
    timed('Conference', at(12, 9), at(15, 12)),
    timed('Next Tuesday', at(20, 16), at(20, 17)),
    timed('Far away', at(26, 10), at(26, 11)),
    timed('Overnight', at(15, 23, 30), at(16, 0, 30)),
    timed('Reminder', at(15, 12), at(15, 12)),
    timed('No end', at(16, 8)),
    timed('Two whole days', at(19, 9), at(21, 9)),
    allDay('Weekend away', 17, 19),
    timed('Friday at midnight', at(16, 0), at(17, 0)),
    timed('Early hours', at(15, 3), at(15, 4)),
    timed('Night shift', at(15, 23), at(16, 8)),
  ];
}

/** One configuration the review is checked under. */
export interface ReviewCase {
  readonly name: string;
  readonly view: Types.EffectiveView;
  readonly config: Types.Config;
  readonly hass: Types.Hass;
}

const STARTS: ReadonlyArray<string | undefined> = [
  undefined,
  'today+1',
  'start_of_week',
  'today-2',
  'monday',
  '2026-01-16',
  '2026-01-13T08:00:00',
];

const WEEKS = {
  'card Monday': { card: 'monday', ha: undefined },
  'card Sunday': { card: 'sunday', ha: undefined },
  'Home Assistant Sunday': { card: 'system', ha: 'sunday' },
} as const;

const DAYS = {
  'every day': { filter: undefined, country: undefined },
  weekdays: { filter: 'weekdays', country: undefined },
  weekends: { filter: 'weekends', country: undefined },
  'weekends, Friday and Saturday': { filter: 'weekends', country: 'IL' },
} as const;

/**
 * Home Assistant as the review and the card read it: its locale's first weekday and its country.
 *
 * @param firstWeekday - Its profile's first weekday, else the language decides
 * @param country - Its country, which says which days are the weekend
 * @returns The fake
 */
function hassFor(firstWeekday: string | undefined, country: string | undefined): Types.Hass {
  return {
    config: country === undefined ? {} : { country },
    locale: {
      language: 'en',
      ...(firstWeekday === undefined ? {} : { first_weekday: firstWeekday }),
    },
  } as unknown as Types.Hass;
}

/**
 * Every case: three layouts; no start date, `today+1`, `start_of_week`, `today-2`, `monday`, a
 * fixed date and an ISO date-time; the card's Monday and Sunday weeks and Home Assistant's own
 * Sunday; past events shown and hidden; every day, weekdays, weekends and a Friday and Saturday
 * weekend; splitting across days off and on; an expiry time or none. Then a card whose `list:`
 * and `time_grid:` blocks give different `days_to_show`, reviewed with each displayed.
 *
 * @returns The cases
 */
export function reviewCases(): ReviewCase[] {
  const cases: ReviewCase[] = [];
  for (const view of ['list', 'column', 'grid'] as const) {
    for (const start of STARTS) {
      for (const [weekName, week] of Object.entries(WEEKS)) {
        for (const past of [false, true]) {
          for (const [daysName, days] of Object.entries(DAYS)) {
            for (const split of [false, true]) {
              for (const expires of [undefined, '10:00']) {
                cases.push({
                  name: [
                    view,
                    start ?? 'today',
                    weekName,
                    past ? 'past shown' : 'past hidden',
                    daysName,
                    split ? 'split' : 'whole',
                    expires ?? 'midnight',
                  ].join(' · '),
                  view,
                  hass: hassFor(week.ha, days.country),
                  config: buildConfig({
                    view,
                    entities: [
                      {
                        entity: CALENDAR,
                        ...(days.filter === undefined ? {} : { days_of_week: days.filter }),
                        ...(expires === undefined ? {} : { allday_expires_at: expires }),
                      },
                    ],
                    days_to_show: 7,
                    ...(start === undefined ? {} : { start_date: start }),
                    first_day_of_week: week.card,
                    show_past_events: past,
                    split_multiday_events: split,
                    // Grid shows past events by its own default, which the top level does not
                    // reach, so its block says it too.
                    ...(view === 'grid' ? { time_grid: { show_past_events: past } } : {}),
                  } as Partial<Types.Config>),
                });
              }
            }
          }
        }
      }
    }
  }
  for (const start of [undefined, 'today+1'] as const) {
    for (const [hours, band] of [
      ['Grid 07:00 to 22:00', {}],
      ['Grid 09:00 to 18:00', { start_time: '09:00', end_time: '18:00' }],
      ['Grid 00:00 to 24:00', { start_time: '00:00', end_time: '24:00' }],
    ] as const) {
      for (const banners of [true, false]) {
        for (const past of [false, true]) {
          cases.push({
            name: `grid · ${start ?? 'today'} · ${hours} · banners ${banners} · past ${past}`,
            view: 'grid',
            hass: hassFor(undefined, undefined),
            config: buildConfig({
              view: 'grid',
              entities: [{ entity: CALENDAR }],
              days_to_show: 7,
              ...(start === undefined ? {} : { start_date: start }),
              multiday_banners: banners,
              show_past_events: past,
              time_grid: { ...band, show_past_events: past },
            } as Partial<Types.Config>),
          });
        }
      }
    }
  }
  for (const view of ['list', 'grid'] as const) {
    for (const start of [undefined, 'start_of_week'] as const) {
      cases.push({
        name: `${view} · ${start ?? 'today'} · blocks give List 3 days and Grid 9`,
        view,
        hass: hassFor(undefined, undefined),
        config: buildConfig({
          view,
          entities: [{ entity: CALENDAR }],
          days_to_show: 5,
          ...(start === undefined ? {} : { start_date: start }),
          list: { days_to_show: 3 },
          time_grid: { days_to_show: 9 },
        } as Partial<Types.Config>),
      });
    }
  }
  return cases;
}

/** Each event the card shows, by title, and the first day it lands on. */
export type FirstDays = ReadonlyMap<string, string>;

/**
 * What the card itself draws for the case: its `processEvents` and `groupEventsByDay`, each
 * event's first day. The clock must be pinned to `reviewNow()` by the caller.
 *
 * @param each - The case
 * @param events - The calendar's events
 * @returns Each event's first day
 */
export function cardFirstDays(each: ReviewCase, events: Types.CalendarEventData[]): FirstDays {
  // As the layout draws them: Grid leaves out a day outside the hours it shows.
  const days = drawnIn(
    EventUtils.groupEventsByDay(
      EventUtils.processEvents(events, each.config),
      each.config,
      false,
      'en',
      each.view,
      each.hass,
    ),
    each.config,
    each.view,
  );
  const first = new Map<string, string>();
  for (const bucket of days) {
    for (const row of bucket.events) {
      if (row._isEmptyDay) continue;
      const key = getLocalDateKey(new Date(bucket.timestamp));
      const title = row._source?.summary ?? row.summary ?? '';
      if (!first.has(title) || first.get(title)! > key) first.set(title, key);
    }
  }
  return first;
}

/** What a mirror is handed: the window, and the configuration and layout it was built for. */
export interface MirrorInputs {
  readonly config: Types.Config;
  readonly view: Types.EffectiveView;
  readonly entry: string | Types.EntityConfig;
  readonly hass: Types.Hass;
  readonly now: Date;
}

/**
 * What the editor's review names for the case: each event's first day through `shownOn`.
 *
 * @param each - The case
 * @param events - The calendar's events
 * @param plant - A defect planted at the mirror's inputs, to prove the comparison sees it
 * @returns Each event's first day
 */
export function mirrorFirstDays(
  each: ReviewCase,
  events: Types.CalendarEventData[],
  plant: (inputs: MirrorInputs) => MirrorInputs = (inputs) => inputs,
  now: Date = reviewNow(),
): FirstDays {
  const inputs = plant({
    config: each.config,
    view: each.view,
    entry: each.config.entities[0],
    hass: each.hass,
    now,
  });
  const window = reviewWindow(inputs.config, inputs.view, inputs.hass, inputs.now);
  const first = new Map<string, string>();
  for (const event of events) {
    const day = shownOn(event, inputs.entry, window, each.view, inputs.hass, inputs.now);
    if (day !== null) first.set(event.summary ?? '', getLocalDateKey(day));
  }
  return first;
}

/**
 * Where two answers differ, as readable lines.
 *
 * @param card - The card's
 * @param mirror - The mirror's
 * @returns One line per event they disagree on; none where they agree
 */
export function disagreements(card: FirstDays, mirror: FirstDays): string[] {
  const titles = new Set([...card.keys(), ...mirror.keys()]);
  return [...titles]
    .filter((title) => card.get(title) !== mirror.get(title))
    .map(
      (title) =>
        `${title}: card ${card.get(title) ?? 'none'}, review ${mirror.get(title) ?? 'none'}`,
    );
}

/**
 * Defects planted at the mirror's inputs, each a way it could drift from the card: the start
 * fixed to today, no weekday filter, no past rule, a fixed first weekday, the layout's block
 * ignored, and a different moment.
 */
export const PLANTED: Readonly<Record<string, (inputs: MirrorInputs) => MirrorInputs>> = {
  'start fixed to today': (inputs) => ({
    ...inputs,
    config: { ...inputs.config, start_date: undefined },
  }),
  'no weekday filter': (inputs) => ({
    ...inputs,
    entry: { ...(inputs.entry as Types.EntityConfig), days_of_week: undefined },
  }),
  'no past rule': (inputs) => ({ ...inputs, config: { ...inputs.config, show_past_events: true } }),
  'first weekday fixed to Monday': (inputs) => ({
    ...inputs,
    config: { ...inputs.config, first_day_of_week: 'monday' },
  }),
  "the layout's block ignored": (inputs) => ({
    ...inputs,
    view: inputs.view === 'grid' ? 'list' : 'grid',
  }),
  'no expiry time': (inputs) => ({
    ...inputs,
    entry: { ...(inputs.entry as Types.EntityConfig), allday_expires_at: undefined },
  }),
  'the hours Grid draws ignored': (inputs) => ({
    ...inputs,
    config: { ...inputs.config, time_grid: { start_time: '00:00', end_time: '24:00' } },
  }),
  'no splitting across days': (inputs) => ({
    ...inputs,
    config: { ...inputs.config, split_multiday_events: false },
  }),
};

/**
 * Every local day of 2026 that is not 24 hours long in the zone the suite runs in: none under
 * UTC, two in each zone that changes its clocks.
 *
 * @returns The days, at local midnight or the day's first moment
 */
export function transitionDays(): Date[] {
  const days: Date[] = [];
  for (let day = 0; day < 365; day++) {
    const start = new Date(2026, 0, 1 + day);
    if (new Date(2026, 0, 2 + day).getTime() - start.getTime() !== 86_400_000) days.push(start);
  }
  return days;
}

/** One configuration and moment around a change of clocks, and the events it is judged on. */
export interface TransitionReview {
  readonly name: string;
  readonly now: Date;
  readonly each: ReviewCase;
  readonly events: Types.CalendarEventData[];
}

/**
 * Cases around each change of clocks: just before the night it happens, just after, and at noon
 * of the changed day; events crossing that night, on its hours, and all-day and timed events
 * spanning it; three layouts, past events shown and hidden, split across days or not, and a
 * window opening on the day or the day before.
 *
 * @returns The cases
 */
export function transitionReviews(): TransitionReview[] {
  const reviews: TransitionReview[] = [];
  for (const changed of transitionDays()) {
    const [y, m, d] = [changed.getFullYear(), changed.getMonth(), changed.getDate()];
    const local = (offset: number, hour: number, minute = 0): string =>
      new Date(y, m, d + offset, hour, minute).toISOString();
    const key = (offset: number): string => getLocalDateKey(new Date(y, m, d + offset));
    const events: Types.CalendarEventData[] = [
      timed('Across the night', local(-1, 22), local(0, 9)),
      timed('Half past midnight', local(0, 0, 30), local(0, 1, 30)),
      timed('Through the change', local(0, 1, 30), local(0, 3, 30)),
      timed('Three in the morning', local(0, 3), local(0, 4)),
      timed('Two whole days', local(-1, 12), local(1, 12)),
      timed('Next morning', local(1, 8), local(1, 9)),
      timed('After the change', local(0, 23), local(1, 8)),
      {
        summary: 'Three days',
        start: { date: key(-1) },
        end: { date: key(2) },
        _entityId: CALENDAR,
      },
      {
        summary: 'The day itself',
        start: { date: key(0) },
        end: { date: key(1) },
        _entityId: CALENDAR,
      },
    ];
    for (const now of [
      new Date(y, m, d - 1, 23, 30),
      new Date(y, m, d, 0, 15),
      new Date(y, m, d, 12),
      new Date(y, m, d + 1, 0, 15),
    ]) {
      for (const view of ['list', 'column', 'grid'] as const) {
        for (const past of [false, true]) {
          for (const split of [false, true]) {
            for (const start of [undefined, 'today-1'] as const) {
              reviews.push({
                name: `${key(0)} at ${now.toString()} · ${view} · past ${past} · split ${split} · ${start ?? 'today'}`,
                now,
                events,
                each: {
                  name: '',
                  view,
                  hass: hassFor(undefined, undefined),
                  config: buildConfig({
                    view,
                    entities: [{ entity: CALENDAR }],
                    days_to_show: 4,
                    ...(start === undefined ? {} : { start_date: start }),
                    show_past_events: past,
                    split_multiday_events: split,
                    time_grid: { start_time: '00:00', end_time: '24:00', show_past_events: past },
                  } as Partial<Types.Config>),
                },
              });
            }
          }
        }
      }
    }
  }
  return reviews;
}
