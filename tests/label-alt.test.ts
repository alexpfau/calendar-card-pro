/**
 * The text alternative on a label picture.
 *
 * `renderLabel` drew `<img class="label-image">` with no `alt` — axe's only critical finding
 * on the card. A picture from `label: person.anna` says whose event it is, which nothing else
 * in the row says, so it is named after that person as Home Assistant holds them. Any other
 * picture is a configured image whose meaning only its author knows, and gets `alt=""`,
 * which marks it decorative the way the icon and emoji labels already read.
 *
 * Both paths are pinned: the ordinary row, where the label travels as a plain string and the
 * person is no longer visible in it once resolved to a picture URL, and the merged duplicate,
 * which draws one picture per contributing calendar.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

function lunch(entityId: string): Types.CalendarEventData {
  return {
    summary: 'Team lunch',
    start: { dateTime: '2026-06-17T11:00:00.000Z' },
    end: { dateTime: '2026-06-17T12:00:00.000Z' },
    _entityId: entityId,
  };
}

/** People with pictures; a person named `null` has a picture and no friendly name. */
function hassWithPeople(people: Record<string, string | null>): Types.Hass {
  return {
    states: Object.fromEntries(
      Object.entries(people).map(([entityId, name]) => [
        entityId,
        {
          attributes: {
            entity_picture: `/api/image/serve/${entityId}/512x512`,
            ...(name === null ? {} : { friendly_name: name }),
          },
        },
      ]),
    ),
  } as unknown as Types.Hass;
}

function render(
  view: 'list' | 'grid',
  events: Types.CalendarEventData[],
  config: Types.Config,
  hass: Types.Hass,
): HTMLElement {
  const container = document.createElement('div');
  if (view === 'grid') {
    const grid = { ...config, view: 'grid' } as Types.Config;
    const days = EventUtils.groupEventsByDay(events, grid, false, 'en', 'grid');
    litRender(
      Grid.renderGridGroupedEvents(
        days,
        ViewConfig.resolveEffectiveConfig(grid, 'grid'),
        'en',
        undefined,
        hass,
        FROZEN_NOW,
      ),
      container,
    );
  } else {
    const days = EventUtils.groupEventsByDay(events, config, false, 'en');
    litRender(Render.renderGroupedEvents(days, config, 'en', undefined, hass), container);
  }
  return container;
}

/** Every label picture as `src → alt`, with `null` for a missing attribute. */
function pictures(container: HTMLElement): Array<[string | null, string | null]> {
  return [...container.querySelectorAll('img.label-image')].map((image) => [
    image.getAttribute('src'),
    image.getAttribute('alt'),
  ]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(['list', 'grid'] as const)('label pictures in %s view', (view) => {
  it("names a person's picture after the person", () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.anna', label: 'person.anna' }] });
    const container = render(
      view,
      [lunch('calendar.anna')],
      config,
      hassWithPeople({ 'person.anna': 'Anna' }),
    );

    expect(pictures(container)).toEqual([['/api/image/serve/person.anna/512x512', 'Anna']]);
  });

  it('marks a person with no name in Home Assistant as decorative rather than omitting alt', () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.anna', label: 'person.anna' }] });
    const container = render(
      view,
      [lunch('calendar.anna')],
      config,
      hassWithPeople({ 'person.anna': null }),
    );

    expect(pictures(container)).toEqual([['/api/image/serve/person.anna/512x512', '']]);
  });

  it('marks any other picture as decorative', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.anna', label: '/local/sunflower.png' }],
    });
    const container = render(view, [lunch('calendar.anna')], config, hassWithPeople({}));

    expect(pictures(container)).toEqual([['/local/sunflower.png', '']]);
  });

  it('draws no picture for a person label written out as text', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.anna', label: 'person.anna', label_type: 'text' }],
    });
    // Fetch processing stamps the matching block on every event, and the label's shape is read
    // from it; without the stamp the renderer never learns the label was declared text.
    const container = render(
      view,
      [{ ...lunch('calendar.anna'), _matchedConfig: config.entities[0] as Types.EntityConfig }],
      config,
      hassWithPeople({ 'person.anna': 'Anna' }),
    );

    expect(pictures(container)).toEqual([]);
    expect(container.querySelector('.calendar-label')?.textContent).toBe('person.anna');
  });

  it('names each person on a merged duplicate', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: 'person.anna' },
        { entity: 'calendar.ben', label: 'person.ben' },
      ],
      filter_duplicates: true,
      time_grid: { filter_duplicates: true },
    } as Partial<Types.Config>);
    const container = render(
      view,
      [lunch('calendar.anna'), lunch('calendar.ben')],
      config,
      hassWithPeople({ 'person.anna': 'Anna', 'person.ben': 'Ben' }),
    );

    expect(pictures(container)).toEqual([
      ['/api/image/serve/person.anna/512x512', 'Anna'],
      ['/api/image/serve/person.ben/512x512', 'Ben'],
    ]);
  });
});
