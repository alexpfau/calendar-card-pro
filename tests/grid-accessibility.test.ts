import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { cardStyles } from '../src/rendering/styles';
import { groupEventsByDay } from '../src/utils/events';
import { formatEventTime } from '../src/utils/format';

const source: Types.CalendarEventData = {
  _entityId: 'calendar.anna',
  summary: 'Library pickup, extended unellipsized title',
  start: { dateTime: '2026-06-17T10:00:00Z' },
  end: { dateTime: '2026-06-17T10:05:00Z' },
  location: 'Community room',
  description: 'Fictional library information',
};

const hass = {
  states: {
    'calendar.anna': { attributes: { friendly_name: 'Anna calendar', icon: 'mdi:calendar' } },
    'calendar.ben': { attributes: { friendly_name: 'Ben calendar' } },
    'calendar.family': { attributes: { friendly_name: 'Family calendar' } },
    'weather.fictional': { state: 'rainy', attributes: { friendly_name: 'Fictional weather' } },
    'person.anna': {
      attributes: { friendly_name: 'Anna', entity_picture: '/fictional-avatar.svg' },
    },
  },
  formatEntityState: (_state: unknown, condition?: string) =>
    condition === 'rainy' ? 'Rainy' : condition,
} as unknown as Types.Hass;

function fixture(
  options: Partial<Types.Config> = {},
  events: Types.CalendarEventData[] = [source],
  forecasts?: Types.WeatherForecasts,
) {
  const config = buildConfig({
    entities: [{ entity: 'calendar.anna', label: 'Anna' }],
    view: 'grid',
    days_to_show: 3,
    show_description: true,
    time_24h: true,
    ...options,
  });
  const effective = resolveEffectiveConfig(config, 'grid');
  const language = config.language ?? 'en';
  const prepared = events.map((event) => ({
    ...event,
    _matchedConfig: config.entities.find(
      (entry): entry is Types.EntityConfig =>
        typeof entry === 'object' && entry.entity === event._entityId,
    ),
  }));
  const container = document.createElement('div');
  render(
    renderGridGroupedEvents(
      groupEventsByDay(prepared, config, false, language, 'grid'),
      effective,
      language,
      forecasts,
      hass,
      FROZEN_NOW,
    ),
    container,
  );
  return { container, effective };
}

function accessibleGroup(block: Element): HTMLElement {
  const group = block.querySelector<HTMLElement>(':scope > .grid-event-accessible');
  expect(group).not.toBeNull();
  expect(group!.getAttribute('role')).toBe('group');
  expect(block.querySelectorAll('[role="group"]')).toHaveLength(1);
  return group!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});
afterEach(() => vi.useRealTimers());

describe('timed Grid accessible information', () => {
  it('names short blocks without extra tab stops or duplicate visual descendants', () => {
    const { container } = fixture();
    const block = container.querySelector('.grid-event')!;
    const group = accessibleGroup(block);
    expect(block.hasAttribute('role')).toBe(false);
    expect(block.hasAttribute('aria-label')).toBe(false);
    expect(block.getAttribute('tabindex')).toBeNull();
    expect(group.getAttribute('tabindex')).toBeNull();
    expect(group.getAttribute('aria-label')).toContain(source.summary);
    expect(group.getAttribute('aria-label')).toContain('Anna');
    expect(block.querySelector('.grid-event-disclosure')?.getAttribute('aria-hidden')).toBe('true');
    expect(group.closest('[aria-hidden="true"]')).toBeNull();
    expect(group.getAttribute('aria-label')).toContain('10:00 - 10:05');
    expect(group.getAttribute('aria-label')).toContain(source.location);
    expect(group.getAttribute('aria-label')).toContain(source.description);
  });

  it.each(['', 'en', 'he'])(
    'keeps accessible language out of the visual inheritance chain under page language "%s"',
    (pageLanguage) => {
      const { container } = fixture({
        language: 'de',
        entities: [{ entity: 'calendar.anna', label: 'Family calendar:' }],
        time_grid: { scroll_long_titles: true },
      });
      if (pageLanguage) container.lang = pageLanguage;
      const block = container.querySelector('.grid-event')!;
      const group = accessibleGroup(block);
      expect(group.lang).toBe('de');
      expect(group.textContent?.trim()).toBe('');
      expect(group.children).toHaveLength(0);
      expect(block.hasAttribute('lang')).toBe(false);
      for (const visual of block.querySelectorAll('.summary, .calendar-label, .event-title')) {
        expect(visual.closest('[lang]')).toBe(pageLanguage ? container : null);
        expect(group.contains(visual)).toBe(false);
      }
    },
  );

  it('gives the empty semantic group event bounds without intercepting pointer input', () => {
    const rule = cardStyles.cssText.match(/\.grid-event-accessible\s*\{([^}]+)\}/)?.[1];
    expect(rule).toMatch(/position:\s*absolute;/);
    expect(rule).toMatch(/inset:\s*0;/);
    expect(rule).toMatch(/pointer-events:\s*none;/);
  });

  it.each([
    ['Anna', 'Anna'],
    ['🎉', '🎉'],
    ['mdi:calendar', 'Anna calendar'],
    ['/fictional-avatar.svg', 'Anna calendar'],
    ['person.anna', 'Anna'],
    ['home-assistant', 'Anna calendar'],
  ])('keeps meaningful identity for %s without reading an image URL', (label, expected) => {
    const { container } = fixture({ entities: [{ entity: 'calendar.anna', label }] });
    const name = accessibleGroup(container.querySelector('.grid-event')!).getAttribute(
      'aria-label',
    )!;
    expect(name.split(', ')[0]).toBe(`\u2068${expected}\u2069`);
    expect(name).not.toContain('/fictional-avatar.svg');
  });

  it('keeps merged label order and resolves each icon or picture against its own calendar', () => {
    const { container } = fixture(
      {
        filter_duplicates: true,
        entities: [
          { entity: 'calendar.anna', label: 'person.anna' },
          { entity: 'calendar.ben', label: 'mdi:calendar', label_icon_color: 'red' },
          { entity: 'calendar.family', label: 'Family' },
        ],
      },
      ['calendar.anna', 'calendar.ben', 'calendar.family'].map((entity) => ({
        ...source,
        _entityId: entity,
      })),
    );
    const blocks = container.querySelectorAll('.grid-event');
    expect(blocks).toHaveLength(1);
    expect(accessibleGroup(blocks[0]).getAttribute('aria-label')!.split(', ').slice(0, 3)).toEqual([
      '\u2068Anna\u2069',
      '\u2068Ben calendar\u2069',
      '\u2068Family\u2069',
    ]);
    expect(blocks[0].querySelectorAll('.summary > :not(.event-title)')).toHaveLength(3);
  });

  it('does not expose disabled details or labels even though the raw feed contains them', () => {
    const { container } = fixture({
      entities: [{ entity: 'calendar.anna', label: 'Anna', label_type: 'none' }],
      time_grid: { show_time: false, show_location: false, show_description: false },
    });
    const name = accessibleGroup(container.querySelector('.grid-event')!).getAttribute(
      'aria-label',
    );
    expect(name).toBe(`\u2068${source.summary}\u2069`);
  });

  it('uses the complete original interval on every timed continuation, honoring formatting', () => {
    const event = { ...source, end: { dateTime: '2026-06-19T12:00:00Z' } };
    const { container, effective } = fixture(
      { time_24h: false, time_grid: { start_time: '08:00', end_time: '18:00' } },
      [event],
    );
    const blocks = container.querySelectorAll('.grid-event');
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(accessibleGroup(block).getAttribute('aria-label')).toContain(
        formatEventTime(event, effective, 'en', hass),
      );
    }
    expect(blocks[1].querySelector('.time')).toBeNull();
  });

  it('describes the displayed day’s weather on a continuation, not its source day’s forecast', () => {
    const event = {
      ...source,
      start: { dateTime: '2026-06-16T14:00:00Z' },
      end: { dateTime: '2026-06-19T12:00:00Z' },
    };
    const forecasts: Types.WeatherForecasts = {
      daily: {},
      hourly: {
        '2026-06-17_0': {
          icon: 'mdi:weather-rainy',
          condition: 'rainy',
          temperature: 19,
          uv_index: 3,
          datetime: '2026-06-17T00:00:00Z',
          hour: 0,
        },
      },
    };
    const { container } = fixture(
      {
        weather: {
          entity: 'weather.fictional',
          position: 'event',
          event: { show_temp: true, show_conditions: true, show_uv_index: true },
        },
      },
      [event],
      forecasts,
    );
    const block = container.querySelector('.grid-event')!;
    expect(block.querySelector('.event-weather')?.textContent).toContain('19°');
    expect(accessibleGroup(block).getAttribute('aria-label')).toContain('19°');
    expect(accessibleGroup(block).getAttribute('aria-label')).toContain('UV3');
    expect(accessibleGroup(block).getAttribute('aria-label')).toContain(
      block.querySelector('.weather-condition')!.textContent,
    );
  });

  it('leaves all-day banners and overflow-count placeholders outside the treatment', () => {
    const { container } = fixture({ time_grid: { max_simultaneous_events: 1 } }, [
      source,
      { ...source, summary: 'Another overlapping appointment' },
      {
        ...source,
        summary: 'Community holiday',
        start: { date: '2026-06-17' },
        end: { date: '2026-06-18' },
      },
    ]);
    const banner = container.querySelector('.grid-banner')!;
    const overflow = container.querySelector('.grid-event-overflow')!;
    expect(banner.getAttribute('role')).toBeNull();
    expect(banner.querySelector('[role="group"]')).toBeNull();
    expect(banner.querySelector('.calendar-label')).toBeNull();
    expect(overflow.getAttribute('role')).toBeNull();
    expect(overflow.querySelector('[role="group"]')).toBeNull();
    expect(overflow.textContent?.trim()).toBe('+1');
  });
});
