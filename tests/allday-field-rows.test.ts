import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

const CALENDAR = 'calendar.personal';
const LOCATION = 'Community Hall';
const DESCRIPTION = 'Bring membership card';

type TestEvent = Types.CalendarEventData & { summary: string };

function renderList(events: Types.CalendarEventData[], config: Types.Config): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en'), container);
  return container;
}

/** iCal all-day ends are exclusive, so a single-day event on the 18th ends on the 19th. */
function allDayEvent(start: string, endExclusive: string, summary: string): TestEvent {
  return {
    start: { date: start },
    end: { date: endExclusive },
    summary,
    location: LOCATION,
    description: DESCRIPTION,
    _entityId: CALENDAR,
  };
}

function timedEvent(summary: string): TestEvent {
  return {
    start: { dateTime: '2026-06-18T09:00:00.000Z' },
    end: { dateTime: '2026-06-18T10:00:00.000Z' },
    summary,
    location: LOCATION,
    description: DESCRIPTION,
    _entityId: CALENDAR,
  };
}

function rowFor(container: ParentNode, title: string): Element {
  const titleElement = Array.from(container.querySelectorAll('.event-title')).find(
    (element) => element.textContent?.trim() === title,
  );
  expect(titleElement).toBeDefined();
  const row = titleElement?.closest('td.event');
  expect(row).not.toBeNull();
  return row as Element;
}

function fieldText(row: ParentNode, selector: '.location' | '.description'): string | null {
  return row.querySelector(`${selector} span`)?.textContent?.trim() ?? null;
}

function rowForEvent(event: TestEvent, overrides: Partial<Types.Config> = {}): Element {
  return rowFor(
    renderList(
      [event],
      buildConfig({
        days_to_show: 8,
        show_description: true,
        ...overrides,
      }),
    ),
    event.summary,
  );
}

describe('all-day location and description rows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows location and description rows on an all-day event at their true defaults', () => {
    const row = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'));

    expect(fieldText(row, '.location')).toBe(LOCATION);
    expect(fieldText(row, '.description')).toBe(DESCRIPTION);
  });

  it('hides location rows on single-day and multi-day all-day events when turned off', () => {
    const single = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_location_allday: false,
    });
    const multi = rowForEvent(allDayEvent('2026-06-18', '2026-06-21', 'Festival'), {
      show_location_allday: false,
    });

    expect(fieldText(single, '.location')).toBeNull();
    expect(fieldText(multi, '.location')).toBeNull();
  });

  it('hides description rows on single-day and multi-day all-day events when turned off', () => {
    const single = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_description_allday: false,
    });
    const multi = rowForEvent(allDayEvent('2026-06-18', '2026-06-21', 'Festival'), {
      show_description_allday: false,
    });

    expect(fieldText(single, '.description')).toBeNull();
    expect(fieldText(multi, '.description')).toBeNull();
  });

  it('leaves timed event rows visible when both all-day suppressors are off', () => {
    const row = rowForEvent(timedEvent('Timed workshop'), {
      show_location_allday: false,
      show_description_allday: false,
    });

    expect(fieldText(row, '.location')).toBe(LOCATION);
    expect(fieldText(row, '.description')).toBe(DESCRIPTION);
  });

  it('keeps location and description suppression independent', () => {
    const noLocation = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_location_allday: false,
    });
    const noDescription = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_description_allday: false,
    });

    expect(fieldText(noLocation, '.location')).toBeNull();
    expect(fieldText(noLocation, '.description')).toBe(DESCRIPTION);
    expect(fieldText(noDescription, '.location')).toBe(LOCATION);
    expect(fieldText(noDescription, '.description')).toBeNull();
  });
});
