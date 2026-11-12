/**
 * `countdown_exact_days` and `countdown_max_days`: how far ahead a countdown is shown, and
 * whether it counts later dates in days rather than months and years.
 *
 * Both default to today's behavior, so every case here turns one on, and each is paired with
 * a control that proves the same harness produces the default wording when it is off: a
 * "shows nothing" assertion is satisfied by a harness that never produces a countdown at all.
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { walkSchema } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import * as Presentation from '../src/rendering/presentation';
import * as EventUtils from '../src/utils/events';

const NOW = new Date('2026-06-17T10:00:00Z');

/** A timed event `days` calendar days after NOW's date, at 08:00 UTC, or later today. */
function timedIn(days: number, hour = 8, minute = 0): Types.CalendarEventData {
  const start = new Date(Date.UTC(2026, 5, 17 + days, hour, minute));
  return {
    summary: 'Piano lesson',
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 3600000).toISOString() },
  };
}

/** A one-day all-day event `days` calendar days after NOW's date. */
function allDayIn(days: number): Types.CalendarEventData {
  const iso = (offset: number) =>
    new Date(Date.UTC(2026, 5, 17 + offset)).toISOString().slice(0, 10);
  return { summary: 'Holiday', start: { date: iso(days) }, end: { date: iso(days + 1) } };
}

/** The countdown `buildEventPresentation` hands the renderers, through the real gate. */
function presented(event: Types.CalendarEventData, overrides: Partial<Types.Config>, lang = 'en') {
  const config = buildConfig({ show_countdown: true, ...overrides });
  return Presentation.buildEventPresentation(event, config, lang, null).contentParts.countdownStr;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('countdown_exact_days', () => {
  it.each([
    { days: 2, natural: 'in 2 days', exact: 'in 2 days' },
    { days: 25, natural: 'in 25 days', exact: 'in 25 days' },
    { days: 26, natural: 'in a month', exact: 'in 26 days' },
    { days: 30, natural: 'in a month', exact: 'in 30 days' },
    { days: 365, natural: 'in a year', exact: 'in 365 days' },
    { days: 400, natural: 'in a year', exact: 'in 400 days' },
  ])('counts $days days as "$exact", where the default says "$natural"', (row) => {
    for (const event of [timedIn(row.days), allDayIn(row.days)]) {
      expect(presented(event, {})).toBe(row.natural);
      expect(presented(event, { countdown_exact_days: true })).toBe(row.exact);
    }
  });

  it('leaves later today and tomorrow as they read without it', () => {
    const on = { countdown_exact_days: true };
    expect(presented(timedIn(0, 10, 20), on)).toBe('in 20 minutes');
    expect(presented(timedIn(0, 15), on)).toBe('in 5 hours');
    expect(presented(timedIn(1), on)).toBe('tomorrow');
    expect(presented(allDayIn(1), on)).toBe('tomorrow');
  });

  it('ignores the time of day on either side, as the default count does', () => {
    for (const hour of [0, 9, 23]) {
      vi.setSystemTime(new Date(Date.UTC(2026, 5, 17, hour, 30)));
      expect(presented(timedIn(30, 23, 59), { countdown_exact_days: true })).toBe('in 30 days');
      expect(presented(timedIn(30, 0, 1), { countdown_exact_days: true })).toBe('in 30 days');
    }
  });

  it.each([
    { lang: 'de', exact: 'in 30 Tagen', natural: 'in einem Monat' },
    { lang: 'de-AT', exact: 'in 30 Tagen', natural: 'in einem Monat' },
    { lang: 'es', exact: 'dentro de 30 días', natural: 'en un mes' },
    { lang: 'fi', exact: '30 päivän päästä', natural: 'kuukauden päästä' },
    { lang: 'zh-cn', exact: '30天后', natural: '1 个月内' },
    // Serbian is where a Day.js locale name and a language tag part: the default count goes
    // through `DAYJS_LOCALE_NAMES` and this one does not, so both scripts are checked.
    { lang: 'sr', exact: 'за 30 дана', natural: 'за један месец' },
    { lang: 'sr-latn', exact: 'za 30 dana', natural: 'za jedan mesec' },
    // A language the card does not speak reads in English, like every other countdown.
    { lang: 'xx', exact: 'in 30 days', natural: 'in a month' },
  ])('words the count in the card language: $lang', ({ lang, exact, natural }) => {
    expect(presented(timedIn(30), {}, lang)).toBe(natural);
    expect(presented(timedIn(30), { countdown_exact_days: true }, lang)).toBe(exact);
  });

  it('is read per view, like show_countdown', () => {
    const config = buildConfig({ show_countdown: true, column: { countdown_exact_days: true } });
    expect(resolveEffectiveConfig(config, 'list').countdown_exact_days).toBe(false);
    expect(resolveEffectiveConfig(config, 'column').countdown_exact_days).toBe(true);
  });
});

describe('countdown_max_days', () => {
  it('keeps a countdown on the last day of the range and drops it the day after', () => {
    expect(presented(timedIn(7), { countdown_max_days: 7 })).toBe('in 7 days');
    expect(presented(allDayIn(7), { countdown_max_days: 7 })).toBe('in 7 days');
    expect(presented(timedIn(8), { countdown_max_days: 7 })).toBeNull();
    expect(presented(allDayIn(8), { countdown_max_days: 7 })).toBeNull();
    expect(presented(timedIn(8), {})).toBe('in 8 days');
  });

  it('measures calendar dates, so the time of day never moves the edge', () => {
    vi.setSystemTime(new Date('2026-06-17T23:59:00Z'));
    expect(presented(timedIn(1, 0, 1), { countdown_max_days: 1 })).toBe('tomorrow');
    expect(presented(timedIn(2, 0, 1), { countdown_max_days: 1 })).toBeNull();
    vi.setSystemTime(new Date('2026-06-17T00:01:00Z'));
    expect(presented(timedIn(1, 23, 59), { countdown_max_days: 1 })).toBe('tomorrow');
  });

  it('keeps today alone at 0', () => {
    expect(presented(timedIn(0, 10, 40), { countdown_max_days: 0 })).toBe('in 40 minutes');
    expect(presented(timedIn(1), { countdown_max_days: 0 })).toBeNull();
    expect(presented(allDayIn(1), { countdown_max_days: 0 })).toBeNull();
  });

  it('combines with exact days', () => {
    const both = { countdown_max_days: 30, countdown_exact_days: true };
    expect(presented(timedIn(30), both)).toBe('in 30 days');
    expect(presented(timedIn(31), both)).toBeNull();
  });

  it.each([
    { value: undefined, label: 'unset' },
    { value: -1, label: 'negative' },
    { value: 'soon', label: 'not a number' },
    { value: '', label: 'blank' },
    { value: null, label: 'null' },
  ])('counts down to every event when $label', ({ value }) => {
    const overrides = { countdown_max_days: value } as unknown as Partial<Types.Config>;
    expect(buildConfig(overrides).countdown_max_days).toBeUndefined();
    expect(presented(timedIn(400), overrides)).toBe('in a year');
  });

  it('reads a quoted number as that number', () => {
    const quoted = { countdown_max_days: '3' } as unknown as Partial<Types.Config>;
    expect(presented(timedIn(3), quoted)).toBe('in 3 days');
    expect(presented(timedIn(4), quoted)).toBeNull();
  });

  it("lets a view replace the card's limit, and inherits it where the view is blank", () => {
    const resolved = (column: Record<string, unknown>) =>
      resolveEffectiveConfig(
        buildConfig({ countdown_max_days: 7, column } as unknown as Partial<Types.Config>),
        'column',
      ).countdown_max_days;

    expect(resolved({ countdown_max_days: 0 })).toBe(0);
    expect(resolved({ countdown_max_days: 30 })).toBe(30);
    expect(resolved({ countdown_max_days: null })).toBe(7);
    expect(resolved({ countdown_max_days: '' })).toBe(7);
    expect(resolved({})).toBe(7);
    expect(
      resolveEffectiveConfig(buildConfig({ countdown_max_days: 7 }), 'list').countdown_max_days,
    ).toBe(7);
  });
});

describe('split multi-day rows', () => {
  let instance = 0;

  /** One countdown per row, through the real fetch, split and grouping pipeline. */
  async function rows(events: unknown[], overrides: Partial<Types.Config>) {
    vi.setSystemTime(new Date('2026-08-13T11:30:00Z'));
    const config = buildConfig({
      entities: ['calendar.anna'],
      split_multiday_events: true,
      days_to_show: 12,
      show_countdown: true,
      ...overrides,
    });
    const hass = { states: {}, callApi: async () => events, locale: { language: 'en' } } as never;
    const { events: processed } = await EventUtils.fetchEventData(
      hass,
      config,
      `countdown-options-${instance++}`,
      'network',
    );
    return EventUtils.groupEventsByDay(processed, config, false, 'en')
      .flatMap((day) => day.events)
      .filter((event) => !event._isEmptyDay)
      .map(
        (event) =>
          Presentation.buildEventPresentation(event, config, 'en', null).contentParts.countdownStr,
      );
  }

  // Splitting gives a timed event's middle days an all-day shape while its first and last
  // keep a time, so the timed event covers all three row shapes.
  it.each([
    {
      shape: 'timed',
      event: {
        summary: 'Trip',
        start: { dateTime: '2026-08-17T07:00:00.000Z' },
        end: { dateTime: '2026-08-20T12:00:00.000Z' },
      },
    },
    {
      shape: 'all-day',
      event: { summary: 'Trip', start: { date: '2026-08-17' }, end: { date: '2026-08-21' } },
    },
  ])('measures each $shape row from its own day', async ({ event }) => {
    expect(await rows([event], {})).toEqual(['in 4 days', 'in 5 days', 'in 6 days', 'in 7 days']);
    expect(await rows([event], { countdown_max_days: 5 })).toEqual([
      'in 4 days',
      'in 5 days',
      null,
      null,
    ]);
  });
});

describe('the drawn card', () => {
  interface CardUnderTest extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    hass: Types.Hass;
    readonly updateComplete: Promise<boolean>;
    updateEvents(force?: boolean): Promise<void>;
  }

  let callApi: ReturnType<typeof vi.fn>;

  async function mount(config: Record<string, unknown>, events: Types.CalendarEventData[]) {
    vi.stubGlobal('localStorage', memoryStorage());
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      entities: ['calendar.anna'],
      days_to_show: 40,
      show_countdown: true,
      ...config,
    });
    callApi = vi.fn().mockResolvedValue(events);
    card.hass = {
      states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      connection: {
        subscribeMessage: () => Promise.reject({ code: 'unknown_command' }),
      },
      callApi,
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    callApi.mockClear();
    return card;
  }

  const countdowns = (card: CardUnderTest): string[] =>
    [...card.shadowRoot!.querySelectorAll('.time-countdown')].map(
      (el) => el.textContent?.trim() ?? '',
    );

  it.each(['list', 'column'] as const)(
    'draws exact days and the range in %s view',
    async (view) => {
      const events = [timedIn(2), timedIn(30)];

      expect(countdowns(await mount({ view }, events))).toEqual(['in 2 days', 'in a month']);
      document.body.replaceChildren();
      expect(countdowns(await mount({ view, countdown_exact_days: true }, events))).toEqual([
        'in 2 days',
        'in 30 days',
      ]);
      document.body.replaceChildren();
      expect(countdowns(await mount({ view, countdown_max_days: 7 }, events))).toEqual([
        'in 2 days',
      ]);
    },
  );

  it('brings an event into range at midnight, with no update from Home Assistant', async () => {
    // Mounted just before midnight on a fixed start date, so nothing is due to load in the
    // minutes it crosses, and the clock repaint is the only thing that can draw the change.
    vi.setSystemTime(new Date('2026-06-17T23:58:00Z'));
    const card = await mount(
      { view: 'list', start_date: '2026-06-17', days_to_show: 5, countdown_max_days: 1 },
      [timedIn(2)],
    );
    expect(countdowns(card)).toEqual([]);

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    await card.updateComplete;

    expect(countdowns(card)).toEqual(['tomorrow']);
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe('grid view', () => {
  /**
   * Each timed block's countdown, drawn and announced. Spanish, because its exact count reads
   * "dentro de 2 días" where its default reads "en 2 días", so two days apart is enough to
   * tell the modes apart on a short grid.
   */
  function blocks(overrides: Partial<Types.Config>) {
    const config = buildConfig({
      entities: ['calendar.anna'],
      view: 'grid',
      days_to_show: 4,
      language: 'es',
      show_countdown: true,
      ...overrides,
    });
    const events = [timedIn(2, 9), timedIn(3, 9)].map((event) => ({
      ...event,
      _entityId: 'calendar.anna',
    }));
    const container = document.createElement('div');
    render(
      renderGridGroupedEvents(
        EventUtils.groupEventsByDay(events, config, false, 'es', 'grid'),
        resolveEffectiveConfig(config, 'grid'),
        'es',
        undefined,
        null,
        NOW,
      ),
      container,
    );
    return [...container.querySelectorAll('.grid-event')].map((block) => ({
      drawn: block.querySelector('.time-countdown')?.textContent?.trim() ?? null,
      announced: block.querySelector('.grid-event-accessible')?.getAttribute('aria-label') ?? '',
    }));
  }

  it('draws and announces exact days', () => {
    const natural = blocks({});
    expect(natural.map((block) => block.drawn)).toEqual(['en 2 días', 'en 3 días']);
    expect(natural[0].announced).toContain('en 2 días');

    const exact = blocks({ countdown_exact_days: true });
    expect(exact.map((block) => block.drawn)).toEqual(['dentro de 2 días', 'dentro de 3 días']);
    expect(exact[0].announced).toContain('dentro de 2 días');
    expect(exact[0].announced).not.toContain('en 2 días');
  });

  it('neither draws nor announces a countdown beyond the range', () => {
    const ranged = blocks({ countdown_max_days: 2 });
    expect(ranged.map((block) => block.drawn)).toEqual(['en 2 días', null]);
    expect(ranged[0].announced).toContain('en 2 días');
    // Only the countdown leaves the name: the title and the time stay.
    expect(ranged[1].announced).toContain('Piano lesson');
    expect(ranged[1].announced).toContain('9:00');
    expect(ranged[1].announced).not.toMatch(/días/);
  });
});

describe('the editor', () => {
  const fields = (config: Partial<Types.Config>, view: Types.EffectiveView = 'list') =>
    [...walkSchema(buildEventsSchema({ view, config: buildConfig(config), language: 'en' }))]
      .filter(({ node }) => !('schema' in node))
      .map(({ node }) => node.name);

  it('offers both options, which dates first and how they read last, while countdowns are on', () => {
    const shown = fields({ show_countdown: true });
    const countdown = shown.filter((name) =>
      ['countdown_max_days', 'show_countdown_allday', 'countdown_exact_days'].includes(name),
    );
    expect(countdown).toEqual([
      'countdown_max_days',
      'show_countdown_allday',
      'countdown_exact_days',
    ]);
  });

  it('offers neither while countdowns are off', () => {
    const shown = fields({ show_countdown: false, show_progress_bar: true });
    expect(shown).not.toContain('countdown_max_days');
    expect(shown).not.toContain('countdown_exact_days');
  });

  it.each([
    { workspace: 'list', block: 'list' },
    { workspace: 'column', block: 'column' },
    { workspace: 'grid', block: 'time_grid' },
  ] as const)(
    "shows a blank limit in the $workspace workspace as the card's, as the card reads it",
    ({ workspace, block }) => {
      const withBlock = (value: unknown) =>
        buildConfig({ countdown_max_days: 7, [block]: { countdown_max_days: value } } as never);

      for (const blank of [null, '', 'soon']) {
        expect(Routing.valueSource(withBlock(blank), workspace, 'countdown_max_days')).toBe(
          'inherited',
        );
        expect(Routing.workspaceConfig(withBlock(blank), workspace).countdown_max_days).toBe(7);
      }
      expect(Routing.valueSource(withBlock(0), workspace, 'countdown_max_days')).toBe('own');
      expect(Routing.workspaceConfig(withBlock(0), workspace).countdown_max_days).toBe(0);
    },
  );

  it('offers both in the Grid workspace, where countdowns are drawn too', () => {
    const shown = fields({ show_countdown: true }, 'grid');
    expect(shown).toContain('countdown_max_days');
    expect(shown).toContain('countdown_exact_days');
  });
});
