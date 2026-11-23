/**
 * A label of several parts (backlog item 286), and the height of a picture label (backlog item
 * 285).
 *
 * A face picture per calendar used to take the one label a calendar has, so an entry listed
 * twice to sort its events had no room left for the icon or emoji that says what kind of event it
 * is. `label` now takes a list, and each part is read and drawn as a single value would be.
 * `label_image_size` sets how tall a picture is, and the wrapped lines of the title hang past it.
 *
 * Both are opt-in: a suite built from default config draws neither, so every case here turns one
 * on. The single-value form is pinned against the list of one, which has to draw the same markup.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { gridEventAccessibleName } from '../src/rendering/grid-accessibility';
import * as Month from '../src/rendering/month';
import { buildEventPresentation } from '../src/rendering/presentation';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

const PICTURE = '/api/image/serve/anna/512x512';

/** A Home Assistant holding Anna's picture and name. */
const HASS = {
  states: {
    'person.anna': { attributes: { entity_picture: PICTURE, friendly_name: 'Anna' } },
  },
} as unknown as Types.Hass;

/** One event of the calendar. */
function event(entityId = 'calendar.anna'): Types.CalendarEventData {
  return {
    summary: 'Football practice',
    start: { dateTime: '2026-06-17T16:00:00.000Z' },
    end: { dateTime: '2026-06-17T17:00:00.000Z' },
    _entityId: entityId,
  };
}

/** List view rows for the events, as the card groups them. */
function rows(config: Types.Config, events = [event()]): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en', undefined, HASS), container);
  return container;
}

/** Each label before the title, as its shape and what it draws. */
function labels(container: HTMLElement): string[] {
  const summary = container.querySelector('.summary')!;
  return [...summary.children]
    .filter((node) => node.matches('.calendar-label, .label-icon, .label-image'))
    .map((node) =>
      node.matches('.label-icon')
        ? `icon ${node.getAttribute('icon')}${node.getAttribute('style') ? ` ${node.getAttribute('style')}` : ''}`
        : node.matches('.label-image')
          ? `image ${node.getAttribute('src')} alt=${node.getAttribute('alt')}`
          : `text ${node.textContent}`,
    );
}

/** The markup of the first row, the label run and title included. */
const rowMarkup = (container: HTMLElement): string =>
  container.querySelector('.summary-row')!.outerHTML.replace(/<!--[^>]*-->/g, '');

describe('a label of several parts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws each part in order, each read by its own shape', () => {
    const config = buildConfig({
      entities: [
        {
          entity: 'calendar.anna',
          label: ['person.anna', 'mdi:soccer', '⚽', 'Club'],
          label_icon_color: '#43a047',
        },
      ],
    });
    expect(labels(rows(config))).toEqual([
      `image ${PICTURE} alt=Anna`,
      'icon mdi:soccer color: #43a047;',
      'text ⚽',
      'text Club',
    ]);
  });

  it('draws a list of one exactly as the single value', () => {
    for (const single of ['person.anna', 'mdi:soccer', '⚽']) {
      const asValue = rows(buildConfig({ entities: [{ entity: 'calendar.anna', label: single }] }));
      const asList = rows(
        buildConfig({ entities: [{ entity: 'calendar.anna', label: [single] }] }),
      );
      expect(rowMarkup(asList), single).toBe(rowMarkup(asValue));
    }
  });

  it('leaves out a part Home Assistant holds nothing for, and draws nothing for an empty list', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.anna', label: ['person.ben', '', 'mdi:soccer'] }],
    });
    expect(labels(rows(config))).toEqual(['icon mdi:soccer']);

    const empty = rows(buildConfig({ entities: [{ entity: 'calendar.anna', label: [] }] }));
    expect(labels(empty)).toEqual([]);
    expect(empty.querySelector('.summary > .event-title:only-child')).not.toBeNull();
  });

  it('reads every part as label_type says, and hides them all for none', () => {
    const text = buildConfig({
      entities: [{ entity: 'calendar.anna', label: ['mdi:soccer', 'Club'], label_type: 'text' }],
    });
    expect(labels(rows(text))).toEqual(['text mdi:soccer', 'text Club']);

    const none = buildConfig({
      entities: [{ entity: 'calendar.anna', label: ['mdi:soccer', 'Club'], label_type: 'none' }],
    });
    expect(labels(rows(none))).toEqual([]);
  });

  it('draws every part of each calendar on a merged duplicate, each once', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: ['person.anna', 'mdi:soccer'] },
        { entity: 'calendar.ben', label: ['👨', 'mdi:soccer'] },
      ],
      filter_duplicates: true,
    });
    const drawn = labels(rows(config, [event('calendar.anna'), event('calendar.ben')]));
    expect(drawn).toEqual([`image ${PICTURE} alt=Anna`, 'icon mdi:soccer', 'text 👨']);
  });

  it('draws every part on a wide month line', () => {
    const config = ViewConfig.resolveEffectiveConfig(
      buildConfig({
        view: 'month',
        entities: [{ entity: 'calendar.anna', label: ['person.anna', 'mdi:soccer'] }],
      }),
      'month',
    );
    const rowsStart = ViewConfig.monthHomeRowsStart(FROZEN_NOW, 1);
    const days = EventUtils.groupEventsByDay(
      [event()],
      { ...config, start_date: FormatUtils.getLocalDateKey(rowsStart), days_to_show: 42 },
      false,
      'en',
      'month',
    );
    const container = document.createElement('div');
    litRender(Month.renderMonthGroupedEvents(days, rowsStart, config, 'en', 4, HASS), container);
    const line = container.querySelector('.month-line-label')!;
    expect(
      [...line.children].map((node) => node.getAttribute('src') ?? node.getAttribute('icon')),
    ).toEqual([PICTURE, 'mdi:soccer']);
  });

  it('names a grid block by the person and the calendar its parts stand for', () => {
    const config = buildConfig({
      view: 'grid',
      entities: [
        { entity: 'calendar.anna', name: 'Family', label: ['person.anna', 'mdi:soccer', 'Club'] },
      ],
    });
    const drawn = { ...event(), _matchedConfig: config.entities[0] as Types.EntityConfig };
    const { contentParts } = buildEventPresentation(drawn, config, 'en', HASS);
    const name = gridEventAccessibleName(drawn, contentParts, config, 'en', undefined, HASS);
    expect(name.split(', ').slice(0, 3)).toEqual([
      '\u2068Anna\u2069',
      '\u2068Family\u2069',
      '\u2068Club\u2069',
    ]);
  });
});

describe('the height of a picture label', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The style the row's summary carries for the entry. */
  function summaryStyle(entry: Partial<Types.EntityConfig>): string | null {
    const config = buildConfig({
      entities: [{ entity: 'calendar.anna', label: 'person.anna', ...entry }],
    });
    return rows(config).querySelector('.summary')!.getAttribute('style');
  }

  it('is written on the summary, in the unit it was given', () => {
    expect(summaryStyle({ label_image_size: '2em' })).toBe('--calendar-card-label-image-size: 2em');
    expect(summaryStyle({ label_image_size: '1.5rem' })).toBe(
      '--calendar-card-label-image-size: 1.5rem',
    );
    expect(summaryStyle({ label_image_size: '40px' })).toBe(
      '--calendar-card-label-image-size: 40px',
    );
  });

  it('reads a bare number as pixels', () => {
    expect(summaryStyle({ label_image_size: 40 as unknown as string })).toBe(
      '--calendar-card-label-image-size: 40px',
    );
    expect(summaryStyle({ label_image_size: '24' })).toBe('--calendar-card-label-image-size: 24px');
  });

  it('writes nothing when unset, or set to what no picture can be drawn at', () => {
    for (const unusable of [undefined, '', 'big', '-5px', '50%', 'auto']) {
      expect(summaryStyle({ label_image_size: unusable }), String(unusable)).toBeNull();
    }
  });

  it('sizes the picture and its hanging indent from the property, the text’s height without it', () => {
    const css = cardStyles.cssText;
    expect(css).toMatch(/\.label-image \{\s*height: var\(--calendar-card-label-image-size, 1em\);/);
    expect(css).toMatch(
      /\.summary:has\(> \.label-image\) \{\s*text-indent: calc\(-1 \* \(var\(--calendar-card-label-image-size, 1em\) \+ 4px\)\);/,
    );
  });

  it('leaves a wide month line’s picture at the text’s height', () => {
    expect(cardStyles.cssText).toMatch(
      /\.month-line-label \{[^}]*--calendar-card-label-image-size: 1em;/,
    );
  });
});
