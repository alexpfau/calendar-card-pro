/**
 * Grid view draws a timed event a full day or longer as one banner in its all-day band
 * (`multiday_banners`, on by default; #716). The event stays timed: its times sit at the
 * banner's ends, its popover shows them, and nothing of it is drawn in the hours.
 *
 * The fixture is the request's own: on call from Monday 10:00 to Friday 16:00, in a week
 * drawn from Sunday. The unit project runs in UTC; the clock changes are in
 * `grid-multiday-banner.dst.test.ts`.
 */

import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as GridRender from '../src/rendering/grid';
import * as EventUtils from '../src/utils/events';
import { fullDaySpan } from '../src/utils/format';
import * as Search from '../src/utils/search';

interface Card extends HTMLElement {
  config: Types.Config;
  hass: unknown;
  events: Types.CalendarEventData[];
  isInitialLoad: boolean;
  groupedEvents: Types.EventsByDay[];
  setConfig(config: Partial<Types.Config>): void;
  render(): unknown;
  updateEvents(mode?: string | boolean): Promise<void>;
}

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

/** A local time in November 2026: the 1st is a Sunday. */
const at = (date: number, hour: number, minute = 0) => new Date(2026, 10, date, hour, minute);

function timed(
  start: Date,
  end: Date,
  summary = 'On call',
  entityId = ANNA,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    _entityId: entityId,
    ...extra,
  };
}

/** The request's on-call week. */
const ON_CALL = timed(at(2, 10), at(6, 16));
const DENTIST = timed(at(4, 9), at(4, 9, 45), 'Dentist', BEN);

/** What a drawn banner says and where it sits. */
interface Drawn {
  title: string;
  times: string[];
  column: string;
  before: boolean;
  after: boolean;
}

function draw(
  input: Types.CalendarEventData[],
  options: Partial<Types.Config> = {},
  entities: Array<Partial<Types.EntityConfig> & { entity: string }> = [
    { entity: ANNA },
    { entity: BEN },
  ],
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({
    view: 'grid',
    start_date: '2026-11-01',
    days_to_show: 7,
    time_24h: true,
    entities,
    ...options,
  });
  card.hass = { states: {}, locale: { language: 'en', time_format: '24' } };
  card.events = EventUtils.processEvents(input, card.config);
  card.isInitialLoad = false;
  const container = document.createElement('div');
  render(card.render(), container);
  const banners: Drawn[] = [...container.querySelectorAll<HTMLElement>('.grid-banner-timed')].map(
    (banner) => ({
      title: banner.querySelector('.grid-banner-title')?.textContent?.trim() ?? '',
      // Without the isolates and the no-break space a 12-hour reading is drawn with.
      times: [...banner.querySelectorAll('.grid-banner-time')].map(
        (time) =>
          time.textContent
            ?.replace(/[\u2068\u2069]/g, '')
            .replace(/\u00a0/g, ' ')
            .trim() ?? '',
      ),
      column: banner.style.gridColumn,
      before: banner.classList.contains('continues-before'),
      after: banner.classList.contains('continues-after'),
    }),
  );
  const blocks = [...container.querySelectorAll('.grid-event:not(.grid-event-overflow)')].map(
    (block) => block.querySelector('.event-title')?.textContent?.trim() ?? '',
  );
  return { card, container, banners, blocks };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(4, 8, 30));
});

afterEach(() => vi.useRealTimers());

describe('which events are a full day or longer (fullDaySpan)', () => {
  it.each([
    ['a night shift, 22:00 to 06:00', at(2, 22), at(3, 6), null],
    ['23 hours across midnight', at(2, 10), at(3, 9), null],
    ['a minute short of a day', at(2, 10), at(3, 9, 59), null],
    ['exactly a day', at(2, 10), at(3, 10), 2],
    ['midnight to midnight, one date', at(2, 0), at(3, 0), null],
    ['the on-call week', at(2, 10), at(6, 16), 5],
    ['to the first moment of a later date', at(2, 10), at(5, 0), 3],
    ['no length at all', at(2, 10), at(2, 10), null],
  ])('%s', (_name, start, end, days) => {
    const span = fullDaySpan({ dateTime: start.toISOString() }, { dateTime: end.toISOString() });
    expect(span?.days ?? null).toBe(days);
  });

  it('counts an all-day event from two dates', () => {
    expect(fullDaySpan({ date: '2026-11-02' }, { date: '2026-11-03' })).toBeNull();
    expect(fullDaySpan({ date: '2026-11-02' }, { date: '2026-11-04' })?.days).toBe(2);
  });
});

describe('the banner', () => {
  it('draws the week as one banner over its days, its times at its ends, nothing in the hours', () => {
    const { banners, blocks } = draw([ON_CALL, DENTIST]);
    expect(banners).toEqual([
      {
        title: 'On call',
        times: ['10:00', '16:00'],
        column: '3 / span 5',
        before: false,
        after: false,
      },
    ]);
    expect(blocks).toEqual(['Dentist']);
  });

  it('marks an end past the window instead of drawing its time', () => {
    const { banners } = draw([ON_CALL], { start_date: '2026-11-04' });
    expect(banners).toEqual([
      { title: 'On call', times: ['16:00'], column: '2 / span 3', before: true, after: false },
    ]);
  });

  it('draws no time at an end that is a day’s first moment, and leaves that day out', () => {
    const { banners } = draw([timed(at(2, 0), at(6, 0))]);
    expect(banners).toEqual([
      { title: 'On call', times: [], column: '3 / span 4', before: false, after: false },
    ]);
  });

  it('follows show_time and show_end_time', () => {
    expect(draw([ON_CALL], { show_time: false }).banners[0].times).toEqual([]);
    expect(draw([ON_CALL], { show_end_time: false }).banners[0].times).toEqual(['10:00']);
    expect(draw([ON_CALL], { time_24h: false }).banners[0].times).toEqual(['10:00 AM', '4:00 PM']);
  });

  it('keeps a night shift, and anything under a full day, in the hours', () => {
    const { banners, blocks } = draw([timed(at(2, 22), at(3, 6), 'Night shift')], {
      time_grid: { start_time: '00:00', end_time: '24:00' },
    });
    expect(banners).toEqual([]);
    expect(blocks).toEqual(['Night shift', 'Night shift']);
  });

  it('keeps its days while it runs, past events hidden, and goes once it ends', () => {
    // In time_grid:, because grid shows past events by default whatever the top level says.
    const hidden = { time_grid: { show_past_events: false } };
    // Wednesday morning: Monday and Tuesday are behind, but the event is not, so the banner
    // keeps them, where a block a day drops them.
    expect(draw([ON_CALL], hidden).banners[0].column).toBe('3 / span 5');
    expect(
      draw([ON_CALL], { time_grid: { show_past_events: false, multiday_banners: false } }).blocks,
    ).toHaveLength(3);
    vi.setSystemTime(at(6, 16, 1));
    expect(draw([ON_CALL], hidden).banners).toEqual([]);
  });
});

describe('switching it off and on', () => {
  it.each([
    ['in time_grid:', { time_grid: { multiday_banners: false } }],
    ['at the top level', { multiday_banners: false }],
  ])('draws a block a day with the card-wide value off %s', (_name, options) => {
    const { banners, blocks } = draw([ON_CALL], options as Partial<Types.Config>);
    expect(banners).toEqual([]);
    expect(blocks).toHaveLength(5);
  });

  it('lets a calendar keep its own blocks, or ask for a banner the card turned off', () => {
    const off = draw([ON_CALL], {}, [{ entity: ANNA, multiday_banners: false }]);
    expect([off.banners, off.blocks.length]).toEqual([[], 5]);

    const on = draw([ON_CALL], { time_grid: { multiday_banners: false } }, [
      { entity: ANNA, multiday_banners: true },
    ]);
    expect([on.banners.length, on.blocks]).toEqual([1, []]);
  });

  it('chooses by title with the calendar listed twice, filtered each way', () => {
    const shift = timed(at(2, 8), at(3, 9), 'Long shift');
    const { banners, blocks } = draw(
      [ON_CALL, shift],
      { time_grid: { start_time: '00:00', end_time: '24:00' } },
      [
        { entity: ANNA, allowlist: 'shift', multiday_banners: false },
        { entity: ANNA, blocklist: 'shift' },
      ],
    );
    expect(banners.map((banner) => banner.title)).toEqual(['On call']);
    expect(blocks).toEqual(['Long shift', 'Long shift']);
  });

  it('is read while drawing, so a change redraws without fetching again', () => {
    const { card } = draw([ON_CALL]);
    const fetch = vi.fn().mockResolvedValue(undefined);
    card.updateEvents = fetch as unknown as Card['updateEvents'];
    const banners = () =>
      card.groupedEvents.flatMap((day) => day.events.filter((event) => event._gridBanner));

    expect(banners()).toHaveLength(5);
    card.setConfig({ ...card.config, time_grid: { multiday_banners: false } });
    expect(banners()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('days a banner leaves out', () => {
  it('splits into runs around days a calendar skips, with times only at the real ends', () => {
    // Friday 10:00 to Tuesday 16:00, on a calendar shown on weekdays only.
    const { banners } = draw([timed(at(6, 10), at(10, 16), 'Away')], { start_date: '2026-11-05' }, [
      { entity: ANNA, days_of_week: 'weekdays' },
    ]);
    // In the band's order, the longer run first.
    expect(banners).toEqual([
      { title: 'Away', times: ['16:00'], column: '6 / span 2', before: true, after: false },
      { title: 'Away', times: ['10:00'], column: '3 / span 1', before: false, after: true },
    ]);
  });
});

describe('an event in two calendars, duplicates filtered', () => {
  /**
   * Never a banner on some days and blocks on others, which is the one look the request
   * turned down. The first-listed calendar decides for every copy: decided per copy, the
   * banner keeps its finished days where a block does not, so with past events hidden the
   * early days would be the banner's and the rest the blocks'.
   */
  it.each([
    ['blocks first', [{ entity: ANNA, multiday_banners: false }, { entity: BEN }], 'blocks'],
    ['the banner first', [{ entity: ANNA }, { entity: BEN, multiday_banners: false }], 'banner'],
  ] as const)('draws it one way throughout, %s', (_name, entities, drawn) => {
    const copies = [ON_CALL, { ...ON_CALL, _entityId: BEN }];
    // Past events hidden in time_grid:, the only place that reaches grid's own default.
    for (const extra of [{}, { time_grid: { show_past_events: false } }]) {
      const { banners, blocks } = draw(
        copies,
        { filter_duplicates: true, ...extra },
        entities as unknown as Array<Types.EntityConfig>,
      );
      if (drawn === 'banner') {
        expect([banners.length, blocks]).toEqual([1, []]);
      } else {
        expect(banners).toEqual([]);
        expect(blocks.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('search', () => {
  it('finds a banner whose times lie outside the hours drawn, and rings it', () => {
    // Friday 23:00 to Monday 06:00 on a weekdays calendar: both days it keeps miss 07:00
    // to 22:00, which would hide a block, and the banner is drawn anyway.
    const event = timed(at(6, 23), at(9, 6), 'Away');
    const config = buildConfig({
      view: 'grid',
      start_date: '2026-11-05',
      days_to_show: 7,
      entities: [{ entity: ANNA, days_of_week: 'weekdays' }],
    });
    const processed = EventUtils.processEvents([event], config);
    const days = EventUtils.groupEventsByDay(processed, config, false, 'en', 'grid');
    const drawn = Search.drawnIn(days, config, 'grid');
    expect(
      drawn
        .flatMap((day) => day.events)
        .filter((entry) => !entry._isEmptyDay)
        .map((entry) => entry.summary),
    ).toEqual(['Away', 'Away']);
    // The control: as blocks, neither day reaches into the hours, so nothing is found.
    const asBlocks = { ...config, time_grid: { multiday_banners: false } } as Types.Config;
    const blockDays = EventUtils.groupEventsByDay(processed, asBlocks, false, 'en', 'grid');
    expect(
      Search.drawnIn(blockDays, asBlocks, 'grid')
        .flatMap((day) => day.events)
        .filter((entry) => !entry._isEmptyDay),
    ).toEqual([]);

    const target: Search.RingTarget = {
      entityId: ANNA,
      start: at(6, 23).toISOString(),
      summary: 'Away',
    };
    const { days: rung, found } = Search.ringIn(drawn, target);
    expect(found).toBe(true);
    const container = document.createElement('div');
    render(
      GridRender.renderGridGroupedEvents(
        rung,
        ViewConfig.resolveEffectiveConfig(config, 'grid'),
        'en',
      ),
      container,
    );
    expect(container.querySelectorAll('.grid-banner-timed.search-ring')).toHaveLength(2);
  });
});
