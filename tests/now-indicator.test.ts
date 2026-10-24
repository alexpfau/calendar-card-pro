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

  it('puts the label inside the time row, ahead of the time it qualifies', () => {
    const row = renderView(view).querySelector('.event-now .time-actual')!;
    const label = row.querySelector('.now-indicator')!;

    // In the markup the label follows the clock icon; the stylesheet orders it first.
    expect(label.previousElementSibling?.tagName.toLowerCase()).toBe('ha-icon');
    expect(row.textContent?.replace(/\s+/g, ' ').trim()).toBe('Now9:30 AM - 11:00 AM');
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

  it('draws none even when the grid block asks for one', () => {
    expect(nowMarks(renderView('grid', { time_grid: { show_now_indicator: true } }))).toEqual({
      events: [],
      labels: [],
    });
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
  async function mounted(view: Types.EffectiveView): Promise<CardUnderTest> {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      view,
      entities: ['calendar.personal'],
      days_to_show: 3,
      show_past_events: true,
      time_grid: { show_past_events: true },
    });
    const served = EVENTS.map(({ _entityId: _omit, ...event }) => event);
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

  it('releases the timer when the card is disconnected', async () => {
    const card = await mounted('list');
    card.remove();

    expect(card._nowBoundaryTimerId).toBeNull();
  });
});
