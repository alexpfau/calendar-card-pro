/**
 * The "Now" indicator: a running timed event in list and column view gets a localized
 * "Now" label before its time and an `event-now` class that colors the time row.
 *
 * The time the label depends on is the time the card renders at, not the time it fetched,
 * so the card also needs a repaint at each event boundary; the timer that provides it is
 * pinned at the bottom of this file.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Presentation from '../src/rendering/presentation';
import * as Render from '../src/rendering/render';
import * as Styles from '../src/rendering/styles';
import { getNowString } from '../src/translations/dayjs';
import * as EventUtils from '../src/utils/events';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const RUNNING = EVENTS.find((event) => event.summary === 'Currently running review')!;
const UPCOMING = EVENTS.find((event) => event.summary === 'Upcoming one-to-one')!;
const PAST = EVENTS.find((event) => event.summary === 'Past standup')!;
const ALL_DAY_TODAY = EVENTS.find((event) => event.summary === 'Public holiday')!;

describe('the word', () => {
  it('comes from Intl, capitalized, in the card language', () => {
    expect(getNowString('en')).toBe('Now');
    expect(getNowString('de')).toBe('Jetzt');
    expect(getNowString('fr')).toBe('Maintenant');
    expect(getNowString('zh-cn')).toBe('现在');
  });

  it('maps a regional code through the same reduction as relative times', () => {
    expect(getNowString('en-GB')).toBe('Now');
  });
});

describe('which events are "now"', () => {
  const present = (event: Types.CalendarEventData, overrides: Partial<Types.Config> = {}) =>
    Presentation.buildEventPresentation(event, buildConfig(overrides), 'en');

  it('labels a timed event between its start and its end', () => {
    const presentation = present(RUNNING);

    expect(presentation.isNow).toBe(true);
    expect(presentation.contentParts.nowLabel).toBe('Now');
  });

  it.each([
    ['a finished event', PAST],
    ['an event yet to start', UPCOMING],
    // All-day events never run in this sense, or a day of them would read "Now" all day.
    ['an all-day event today', ALL_DAY_TODAY],
  ])('leaves %s unlabeled', (_label, event) => {
    const presentation = present(event);

    expect(presentation.isNow).toBe(false);
    expect(presentation.contentParts.nowLabel).toBeNull();
  });

  it('labels nothing when show_now_indicator is off', () => {
    const presentation = present(RUNNING, { show_now_indicator: false });

    expect(presentation.isNow).toBe(false);
    expect(presentation.contentParts.nowLabel).toBeNull();
  });

  it('labels nothing on an empty-day placeholder', () => {
    const placeholder: Types.CalendarEventData = {
      ...RUNNING,
      summary: 'No events',
      _isEmptyDay: true,
    };

    expect(present(placeholder).contentParts.nowLabel).toBeNull();
  });
});

function renderView(view: Types.EffectiveView, overrides: Partial<Types.Config> = {}): HTMLElement {
  const config = buildConfig({ view, days_to_show: 1, show_past_events: true, ...overrides });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');
  const template =
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, new Date(FROZEN_NOW))
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null);
  litRender(template, container);
  return container;
}

/** Titles of the events marked `event-now`, and the text of every "Now" label drawn. */
function nowMarks(container: HTMLElement) {
  return {
    events: [...container.querySelectorAll('.event-now')].map((event) =>
      event.querySelector('.event-title')?.textContent?.trim(),
    ),
    labels: [...container.querySelectorAll('.now-indicator')].map((label) => label.textContent),
  };
}

describe.each(['list', 'column'] as const)('in %s view', (view) => {
  it('marks the running event, and only it', () => {
    expect(nowMarks(renderView(view))).toEqual({
      events: ['Currently running review'],
      labels: ['Now'],
    });
  });

  it('keeps the clock in its place, filled, with "Now" and the time as one run after it', () => {
    const container = renderView(view);
    const row = container.querySelector('.event-now .time-actual')!;

    // The clock stays the row's first child, in line with every other row's icons; only
    // its glyph changes. The label and the time are one run, so they wrap as a sentence.
    expect([...row.children].map((child) => child.tagName.toLowerCase())).toEqual([
      'ha-icon',
      'span',
    ]);
    expect(row.children[0].getAttribute('icon')).toBe('mdi:clock');
    const run = row.children[1];
    expect(run.className).toBe('now-time');
    expect([...run.children].map((child) => child.className)).toEqual(['now-indicator', '']);
    expect(run.textContent?.replace(/\s+/g, ' ').trim()).toBe('Now9:30 AM - 11:00 AM');

    const idle = container.querySelector('.event:not(.event-now) .time-actual > ha-icon');
    expect(idle?.getAttribute('icon')).toBe('mdi:clock-outline');
  });

  it('marks nothing when show_now_indicator is off', () => {
    expect(nowMarks(renderView(view, { show_now_indicator: false }))).toEqual({
      events: [],
      labels: [],
    });
  });

  it("honors the view's own block over the card-level value", () => {
    const block = view === 'list' ? 'list' : 'column';
    const off = renderView(view, { [block]: { show_now_indicator: false } });
    const on = renderView(view, {
      show_now_indicator: false,
      [block]: { show_now_indicator: true },
    });

    expect(nowMarks(off).labels).toEqual([]);
    expect(nowMarks(on).labels).toEqual(['Now']);
  });
});

describe('in grid view', () => {
  it('draws no label: the now line already runs through the block', () => {
    const container = renderView('grid');

    // The control: the running event is on the grid, so a missing label is a decision and
    // not an event that never rendered.
    expect(container.textContent).toContain('Currently running review');
    expect(nowMarks(container)).toEqual({ events: [], labels: [] });
  });

  it('says "Now" in the accessible name of a running block, as the hidden now line shows it', () => {
    const names = (overrides: Partial<Types.Config> = {}) =>
      [...renderView('grid', overrides).querySelectorAll('.grid-event-accessible')].map((node) =>
        (node.getAttribute('aria-label') ?? '')
          .split(', ')
          .map((word) => word.replace(/[\u2068\u2069]/g, '')),
      );

    const running = names().filter((words) => words.includes('Now'));
    expect(running.map((words) => words.slice(0, 3))).toEqual([
      ['Currently running review', 'Now', '9:30 AM - 11:00 AM'],
    ]);
    expect(
      names().length,
      'only one block to name, so the filter above proves little',
    ).toBeGreaterThan(1);

    // No line, nothing to say on its behalf.
    expect(
      names({ time_grid: { show_now_line: false } }).filter((words) => words.includes('Now')),
    ).toEqual([]);
  });

  it('draws none even when the grid block asks for one', () => {
    expect(nowMarks(renderView('grid', { time_grid: { show_now_indicator: true } }))).toEqual({
      events: [],
      labels: [],
    });
  });
});

describe('now_color', () => {
  it('feeds the card and is what the grid line follows until it has a color of its own', () => {
    const config = buildConfig({ view: 'grid', now_color: 'rgb(1, 2, 3)' });
    expect(Styles.generateCustomPropertiesObject(config)['--calendar-card-now-color']).toBe(
      'rgb(1, 2, 3)',
    );
    expect(ViewConfig.resolveTimeGridOption(config, 'now_line_color')).toBe(
      'var(--calendar-card-now-color, #34d399)',
    );

    const own = buildConfig({ view: 'grid', time_grid: { now_line_color: 'rgb(4, 5, 6)' } });
    expect(ViewConfig.resolveTimeGridOption(own, 'now_line_color')).toBe('rgb(4, 5, 6)');
  });

  it("can differ per view, like the indicator's switch", () => {
    const config = buildConfig({ view: 'column', column: { now_color: 'rgb(7, 8, 9)' } });
    expect(ViewConfig.resolveEffectiveConfig(config, 'column').now_color).toBe('rgb(7, 8, 9)');
    expect(ViewConfig.resolveEffectiveConfig(config, 'list').now_color).toBe('#34d399');
  });
});

describe('the next event boundary', () => {
  const at = (iso: string) => new Date(iso).getTime();

  it('is the earliest start or end still ahead', () => {
    // 10:00: the review ends at 11:00, before the one-to-one starts at 14:00.
    expect(EventUtils.nextEventBoundary(EVENTS, at('2026-06-17T10:00:00Z'))).toBe(
      at('2026-06-17T11:00:00Z'),
    );
    // 11:30: nothing running, so the next start.
    expect(EventUtils.nextEventBoundary(EVENTS, at('2026-06-17T11:30:00Z'))).toBe(
      at('2026-06-17T14:00:00Z'),
    );
  });

  it('skips all-day events and empty-day placeholders', () => {
    const placeholder: Types.CalendarEventData = {
      summary: 'No events',
      start: { dateTime: '2026-06-17T12:00:00Z' },
      end: { dateTime: '2026-06-17T13:00:00Z' },
      _isEmptyDay: true,
    };

    expect(EventUtils.nextEventBoundary([ALL_DAY_TODAY, placeholder], FROZEN_NOW.getTime())).toBe(
      null,
    );
  });

  it('includes the next midnight while a timed event runs through it', () => {
    // Split across days, its segments hand over there: the first ends, the next begins.
    const overnight: Types.CalendarEventData = {
      summary: 'Overnight shift',
      start: { dateTime: '2026-06-17T23:00:00Z' },
      end: { dateTime: '2026-06-19T10:00:00Z' },
    };

    expect(EventUtils.nextEventBoundary([overnight], at('2026-06-17T23:30:00Z'))).toBe(
      at('2026-06-18T00:00:00Z'),
    );
    expect(EventUtils.nextEventBoundary([overnight], at('2026-06-18T12:00:00Z'))).toBe(
      at('2026-06-19T00:00:00Z'),
    );
    expect(EventUtils.nextEventBoundary([overnight], at('2026-06-19T05:00:00Z'))).toBe(
      at('2026-06-19T10:00:00Z'),
    );
    // A midnight the event does not reach is no boundary of its own.
    expect(EventUtils.nextEventBoundary(EVENTS, at('2026-06-17T10:00:00Z'))).toBe(
      at('2026-06-17T11:00:00Z'),
    );
  });

  it('is null once every timed event is over', () => {
    expect(EventUtils.nextEventBoundary(EVENTS, at('2026-06-20T00:00:00Z'))).toBe(null);
  });
});

describe('the card repaints at each boundary', () => {
  interface CardUnderTest extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    hass: Types.Hass;
    readonly updateComplete: Promise<boolean>;
    updateEvents(force?: boolean): Promise<void>;
    _nowBoundaryTimerId: number | null;
    _nowBoundaryAt: number | null;
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  /** Mounted against a hass that serves the fixture, so the card draws its own events. */
  async function mounted(
    view: Types.EffectiveView,
    events: Types.CalendarEventData[] = EVENTS,
    timeGrid: Record<string, unknown> = {},
  ): Promise<CardUnderTest> {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      view,
      entities: ['calendar.personal'],
      days_to_show: 3,
      show_past_events: true,
      time_grid: { show_past_events: true, ...timeGrid },
    });
    const served = events.map(({ _entityId: _omit, ...event }) => event);
    card.hass = {
      states: {
        'calendar.personal': { entity_id: 'calendar.personal', state: 'on', attributes: {} },
      },
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      callApi: vi.fn().mockResolvedValue(served),
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    return card;
  }

  const labels = (card: CardUnderTest) =>
    [...card.shadowRoot!.querySelectorAll('.now-indicator')].length;

  it.each(['list', 'column'] as const)(
    'arms a timer for the next boundary in %s view',
    async (view) => {
      const card = await mounted(view);

      expect(card._nowBoundaryAt).toBe(new Date('2026-06-17T11:00:00Z').getTime());
      expect(card._nowBoundaryTimerId).not.toBeNull();
    },
  );

  it('arms none in grid view, whose now-line tick already repaints', async () => {
    const card = await mounted('grid');

    expect(card._nowBoundaryTimerId).toBeNull();
  });

  it('arms one in grid view once the now line, and its tick, is off', async () => {
    // Nothing else would repaint a finished block dim, or away under show_past_events off.
    const card = await mounted('grid', EVENTS, { show_now_line: false });

    expect(card._nowBoundaryAt).toBe(new Date('2026-06-17T11:00:00Z').getTime());
    expect(card._nowBoundaryTimerId).not.toBeNull();
  });

  it('keeps its timer through an unrelated update instead of rescanning', async () => {
    const card = await mounted('list');
    const armed = card._nowBoundaryTimerId;
    const scan = vi.spyOn(EventUtils, 'nextEventBoundary');

    card.hass = { ...card.hass };
    await card.updateComplete;

    expect(card._nowBoundaryTimerId).toBe(armed);
    expect(scan).not.toHaveBeenCalled();
    scan.mockRestore();
  });

  it('takes the label off when the event ends, with nothing else changing', async () => {
    const card = await mounted('list');
    expect(labels(card)).toBe(1);

    // The boundary plus the timer's one-second margin; no hass update, no refetch.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1000);
    await card.updateComplete;

    expect(labels(card)).toBe(0);
    // And it walks on to the next one rather than stopping.
    expect(card._nowBoundaryAt).toBe(new Date('2026-06-17T14:00:00Z').getTime());
  });

  it("hands a split event's label over at midnight, with nothing else changing", async () => {
    // Column view splits by default: 23:00-23:59 today, then all-day tomorrow, which is not
    // marked. Without the midnight boundary the timer waited for the event's own end, two
    // days out, and today's segment kept "Now" after midnight had passed it.
    vi.setSystemTime(new Date('2026-06-17T23:30:00Z'));
    const card = await mounted('column', [
      {
        summary: 'Overnight shift',
        start: { dateTime: '2026-06-17T23:00:00Z' },
        end: { dateTime: '2026-06-19T10:00:00Z' },
      },
    ]);
    expect(labels(card)).toBe(1);
    expect(card._nowBoundaryAt).toBe(new Date('2026-06-18T00:00:00Z').getTime());

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000);
    await card.updateComplete;

    expect(labels(card)).toBe(0);
  });

  it('releases the timer when the card is disconnected', async () => {
    const card = await mounted('list');
    card.remove();

    expect(card._nowBoundaryTimerId).toBeNull();
  });
});
