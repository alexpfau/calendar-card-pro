/**
 * `show_countdown: once_per_day`: on a day with several events, a countdown that reads the same
 * as the one above it is left out.
 *
 * Off by default, so every case turns it on, and each "left out" assertion sits beside the same
 * day drawn with `show_countdown: true`, which must show every countdown: a harness that drew
 * none at all would otherwise pass every case here.
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import { COUNTDOWN_ONCE_PER_DAY } from '../src/config/constants';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { walkSchema } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';
import { toStoredConfig } from '../src/rendering/editor/value';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import * as Presentation from '../src/rendering/presentation';
import * as EventUtils from '../src/utils/events';

const NOW = new Date('2026-06-17T10:00:00Z');

const allDay = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { date: start },
  end: { date: end },
});

const timed = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
});

/** Three bins on one day, three days from NOW, and one more a week later. */
const BINS = [
  allDay('Paper', '2026-06-20', '2026-06-21'),
  allDay('Plastic', '2026-06-20', '2026-06-21'),
  allDay('Organic', '2026-06-20', '2026-06-21'),
  allDay('Paper', '2026-06-27', '2026-06-28'),
];

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

let callApi: ReturnType<typeof vi.fn>;

async function mount(config: Record<string, unknown>, events: Types.CalendarEventData[]) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    entities: ['calendar.anna'],
    days_to_show: 14,
    show_countdown: COUNTDOWN_ONCE_PER_DAY,
    ...config,
  });
  callApi = vi.fn().mockResolvedValue(events);
  card.hass = {
    states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  callApi.mockClear();
  return card;
}

/** Each drawn event's title and countdown, in drawn order; null where it draws none. */
function rows(card: CardUnderTest): Array<[string, string | null]> {
  return (
    [...card.shadowRoot!.querySelectorAll('.event')]
      // Column view shows empty days by default, and their notices are not events.
      .filter(
        (event) => event.querySelector('.event-title') && !event.querySelector('.empty-day-title'),
      )
      .map((event) => [
        event.querySelector('.event-title')!.textContent!.trim(),
        event.querySelector('.time-countdown')?.textContent?.trim() || null,
      ])
  );
}

const countdowns = (card: CardUnderTest) => rows(card).map(([, countdown]) => countdown);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['list', 'column'] as const)('in %s view', (view) => {
  it('counts down once for a day whose countdowns all read the same', async () => {
    expect(countdowns(await mount({ view, show_countdown: true }, BINS))).toEqual([
      'in 3 days',
      'in 3 days',
      'in 3 days',
      'in 10 days',
    ]);
    document.body.replaceChildren();
    expect(countdowns(await mount({ view }, BINS))).toEqual([
      'in 3 days',
      null,
      null,
      'in 10 days',
    ]);
  });

  it('keeps countdowns later today, which name clock times', async () => {
    const today = [
      timed('Piano lesson', '2026-06-17T15:10:00Z', '2026-06-17T16:00:00Z'),
      timed('Swim practice', '2026-06-17T15:20:00Z', '2026-06-17T16:00:00Z'),
    ];
    expect(countdowns(await mount({ view }, today))).toEqual(['in 5 hours', 'in 5 hours']);
  });

  it('passes over a row with no countdown rather than letting it take the first place', async () => {
    const day = [
      allDay('Holiday', '2026-06-20', '2026-06-21'),
      timed('Piano lesson', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z'),
      timed('Swim practice', '2026-06-20T15:00:00Z', '2026-06-20T16:00:00Z'),
    ];
    expect(countdowns(await mount({ view, show_countdown_allday: false }, day))).toEqual([
      null,
      'in 3 days',
      null,
    ]);
  });

  it('keeps a countdown that differs from the one above, as on a carried-in day', async () => {
    // Paged to the 22nd: the trip starts tomorrow and runs into the window, so it is drawn on
    // the window's first day but counts to its own start. The holiday is already under way
    // and has no countdown, so it takes no place either.
    const events = [
      allDay('Trip', '2026-06-18', '2026-06-25'),
      allDay('Holiday', '2026-06-16', '2026-06-24'),
      allDay('Paper', '2026-06-22', '2026-06-23'),
      allDay('Plastic', '2026-06-22', '2026-06-23'),
    ];
    // Unsplit, which column view is not by default, and its own default outranks the card's:
    // a split trip counts each day to itself.
    const unsplit = { split_multiday_events: false };
    const drawn = rows(
      await mount(
        { view, start_date: '2026-06-22', days_to_show: 1, ...unsplit, column: unsplit },
        events,
      ),
    );
    const byTitle = Object.fromEntries(drawn);

    expect(byTitle.Trip).toBe('tomorrow');
    expect(byTitle.Holiday).toBeNull();
    expect([byTitle.Paper, byTitle.Plastic].sort()).toEqual(['in 5 days', null].sort());
  });

  it('measures each split row from its own day', async () => {
    const events = [
      allDay('Trip', '2026-06-19', '2026-06-22'),
      allDay('Paper', '2026-06-20', '2026-06-21'),
    ];
    const drawn = rows(await mount({ view, split_multiday_events: true }, events));

    expect(drawn.filter(([, countdown]) => countdown === 'in 3 days')).toHaveLength(1);
    expect(drawn.map(([, countdown]) => countdown)).toContain('in 2 days');
    expect(drawn.map(([, countdown]) => countdown)).toContain('in 4 days');
  });

  it('leaves nothing to repeat beyond countdown_max_days', async () => {
    expect(countdowns(await mount({ view, countdown_max_days: 5 }, BINS))).toEqual([
      'in 3 days',
      null,
      null,
      null,
    ]);
  });
});

it('compares with the nearest countdown above, passing over rows without one', () => {
  // In any order, not only the one the card sorts into: a row with no countdown between two
  // that read alike does not make the second one first.
  const day = [
    timed('Piano lesson', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z'),
    allDay('Holiday', '2026-06-20', '2026-06-21'),
    timed('Swim practice', '2026-06-20T15:00:00Z', '2026-06-20T16:00:00Z'),
    allDay('Paper', '2026-06-21', '2026-06-22'),
    timed('Book club', '2026-06-20T18:00:00Z', '2026-06-20T19:00:00Z'),
  ];
  const repeated = (overrides: Partial<Types.Config>) => [
    ...Presentation.repeatedCountdowns(
      day,
      buildConfig({ show_countdown: COUNTDOWN_ONCE_PER_DAY, ...overrides }),
      'en',
    ),
  ];

  expect(repeated({ show_countdown_allday: false })).toEqual([2, 4]);
  // With all-day countdowns on, the holiday reads the same and the paper differs.
  expect(repeated({})).toEqual([1, 2]);
  expect(repeated({ show_countdown: true })).toEqual([]);
});

it('keeps the first countdown once tomorrow becomes today at midnight', async () => {
  // Mounted just before midnight on a fixed start date, so nothing loads as midnight passes.
  vi.setSystemTime(new Date('2026-06-17T23:58:00Z'));
  const tomorrow = [
    timed('Piano lesson', '2026-06-18T09:00:00Z', '2026-06-18T10:00:00Z'),
    timed('Swim practice', '2026-06-18T15:00:00Z', '2026-06-18T16:00:00Z'),
  ];
  const card = await mount({ view: 'list', start_date: '2026-06-17', days_to_show: 3 }, tomorrow);
  expect(countdowns(card)).toEqual(['tomorrow', null]);

  await vi.advanceTimersByTimeAsync(3 * 60_000);
  await card.updateComplete;

  expect(countdowns(card)).toEqual(['in 9 hours', 'in 15 hours']);
  expect(callApi).not.toHaveBeenCalled();
});

it('is read per view', async () => {
  const config = buildConfig({ show_countdown: true, column: { show_countdown: 'once_per_day' } });
  expect(resolveEffectiveConfig(config, 'list').show_countdown).toBe(true);
  expect(resolveEffectiveConfig(config, 'column').show_countdown).toBe(COUNTDOWN_ONCE_PER_DAY);
});

it('draws every countdown in grid view, as true does', () => {
  const config = buildConfig({
    entities: ['calendar.anna'],
    view: 'grid',
    days_to_show: 4,
    show_countdown: COUNTDOWN_ONCE_PER_DAY,
  });
  const events = [
    timed('Piano lesson', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z'),
    timed('Swim practice', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z'),
  ].map((event) => ({ ...event, _entityId: 'calendar.anna' }));
  const container = document.createElement('div');
  render(
    renderGridGroupedEvents(
      EventUtils.groupEventsByDay(events, config, false, 'en', 'grid'),
      resolveEffectiveConfig(config, 'grid'),
      'en',
      undefined,
      null,
      NOW,
    ),
    container,
  );
  const drawn = [...container.querySelectorAll('.grid-event .time-countdown')].map((el) =>
    el.textContent?.trim(),
  );
  expect(drawn).toEqual(['in 3 days', 'in 3 days']);
});

describe('the editor', () => {
  const fields = (config: Partial<Types.Config>, workspace: 'shared' | Types.EffectiveView) =>
    [
      ...walkSchema(
        buildEventsSchema({
          view: workspace === 'shared' ? 'list' : workspace,
          workspace,
          config: buildConfig(config),
          language: 'en',
        }),
      ),
    ]
      .filter(({ node }) => !('schema' in node))
      .map(({ node }) => node.name);

  it.each(['shared', 'list', 'column'] as const)(
    'offers the switch after the all-day one in the %s workspace while countdowns are on',
    (workspace) => {
      const shown = fields({ show_countdown: true }, workspace);
      expect(shown.indexOf('countdown_once_per_day')).toBe(
        shown.indexOf('show_countdown_allday') + 1,
      );
      expect(fields({ show_countdown: false }, workspace)).not.toContain('countdown_once_per_day');
    },
  );

  it.each([
    ['shared', {}],
    ['list', { list: { show_countdown: COUNTDOWN_ONCE_PER_DAY } }],
    ['column', { column: { show_countdown: COUNTDOWN_ONCE_PER_DAY } }],
  ] as const)(
    'keeps the switch on screen once it is on, in the %s workspace',
    (workspace, block) => {
      const on = { show_countdown: COUNTDOWN_ONCE_PER_DAY, ...block } as Partial<Types.Config>;
      const shown = fields(on, workspace);
      expect(shown).toContain('countdown_once_per_day');
      expect(shown).toContain('countdown_exact_days');
    },
  );

  it('leaves it out of the Grid workspace, where every countdown is drawn', () => {
    expect(fields({ show_countdown: true }, 'grid')).not.toContain('countdown_once_per_day');
    expect(fields({ show_countdown: true }, 'grid')).toContain('countdown_exact_days');
  });

  it.each([
    ['shared', undefined],
    ['list', 'list'],
    ['column', 'column'],
  ] as const)('writes once_per_day and true from the %s workspace', (workspace, block) => {
    const config = buildConfig({ show_countdown: true });
    const frame: Routing.FormFrame = {
      workspace,
      schema: [{ name: 'countdown_once_per_day', selector: { boolean: {} } }],
      data: Routing.workspaceFormData(config, workspace),
    };
    expect(frame.data.countdown_once_per_day).toBe(false);

    const on = Routing.applyWorkspaceChange(
      config,
      frame,
      { ...frame.data, countdown_once_per_day: true },
      {},
    ).config;
    const written = block ? on[block] : on;
    expect(written).toMatchObject({ show_countdown: COUNTDOWN_ONCE_PER_DAY });
    expect(Routing.workspaceFormData(on, workspace).countdown_once_per_day).toBe(true);
    expect(Routing.workspaceFormData(on, workspace).show_countdown).toBeTruthy();
    const stored = toStoredConfig(on);
    expect(block ? stored[block] : stored).toMatchObject({ show_countdown: 'once_per_day' });

    // The schema the editor builds next, from what was just written, still offers the switch.
    const rebuilt = [
      ...walkSchema(
        buildEventsSchema({
          view: workspace === 'shared' ? 'list' : workspace,
          workspace,
          config: on,
          language: 'en',
        }),
      ),
    ].map(({ node }) => node.name);
    expect(rebuilt).toContain('countdown_once_per_day');

    const onFrame = { ...frame, data: Routing.workspaceFormData(on, workspace) };
    const off = Routing.applyWorkspaceChange(
      on,
      onFrame,
      { ...onFrame.data, countdown_once_per_day: false },
      {},
    ).config;
    expect(block ? off[block] : off).toMatchObject({ show_countdown: true });
  });
});
