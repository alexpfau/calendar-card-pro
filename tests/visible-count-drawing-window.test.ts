import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

const timed = (date: string, start: string, end: string): Types.CalendarEventData => ({
  summary: 'Appointment',
  start: { dateTime: `${date}T${start}:00Z` },
  end: { dateTime: `${date}T${end}:00Z` },
  _entityId: 'calendar.anna',
});

async function mount(
  events: Types.CalendarEventData[],
  options: Partial<Types.Config> = {},
  width?: number,
) {
  const card = document.createElement('calendar-card-pro-dev');
  vi.spyOn(card, 'updateEvents').mockResolvedValue();
  card.setConfig({
    entities: ['calendar.anna'],
    view: 'grid',
    days_to_show: 3,
    hide_when_empty: true,
    ...options,
  });
  card.hass = { states: {}, locale: { language: 'en' } } as Types.Hass;
  card.events = events.map((event) => ({
    ...event,
    _matchedConfig: card.config.entities[0] as Types.EntityConfig,
  }));
  card.isInitialLoad = false;
  if (width !== undefined) {
    (card as unknown as { _handleWidthMeasured(width: number): void })._handleWidthMeasured(width);
  }
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-18T10:00:00Z'));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('hide_when_empty counts the qualifying date range before drawing limits', () => {
  it('hides a genuinely empty range even though Grid synthesizes day placeholders', async () => {
    const card = await mount([]);
    expect(card.groupedEvents).toHaveLength(3);
    expect(card.visibleEventCount).toBe(0);
    expect(card.hidden).toBe(true);
  });

  it('keeps a card whose qualifying event falls outside the Grid time band', async () => {
    const card = await mount([timed('2026-06-18', '06:00', '06:30')]);
    expect(card.shadowRoot?.querySelectorAll('.grid-event')).toHaveLength(0);
    expect(card.visibleEventCount).toBe(1);
    expect(card.hidden).toBe(false);
  });

  it('keeps a card whose qualifying event is on a density-dropped trailing day', async () => {
    const card = await mount([timed('2026-06-20', '11:00', '12:00')], {}, 250);
    expect(card.effectiveView).toBe('grid');
    expect(card.shadowRoot?.querySelectorAll('.grid-day-body')).toHaveLength(1);
    expect(card.shadowRoot?.querySelectorAll('.grid-event')).toHaveLength(0);
    expect(card.visibleEventCount).toBe(1);
    expect(card.hidden).toBe(false);
  });

  it('keeps a List card whose event was only removed by its compact budget', async () => {
    const card = await mount([timed('2026-06-18', '11:00', '12:00')], {
      view: 'list',
      compact_events_to_show: 0,
    });
    expect(card.shadowRoot?.querySelectorAll('.event-title:not(.empty-day-title)')).toHaveLength(0);
    expect(card.visibleEventCount).toBe(1);
    expect(card.hidden).toBe(false);
  });

  it('still excludes events retired by the active view before counting', async () => {
    const card = await mount([timed('2026-06-18', '06:00', '06:30')], {
      time_grid: { show_past_events: false },
    });
    expect(card.visibleEventCount).toBe(0);
    expect(card.hidden).toBe(true);
  });

  it('still excludes dates rejected by the calendar before counting', async () => {
    const card = await mount([timed('2026-06-18', '11:00', '12:00')], {
      entities: [{ entity: 'calendar.anna', days_of_week: 'weekends' }],
    });
    expect(card.visibleEventCount).toBe(0);
    expect(card.hidden).toBe(true);
  });
});
