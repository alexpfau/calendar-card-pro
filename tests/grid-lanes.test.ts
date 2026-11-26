import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as LaneRender from '../src/rendering/lanes';
import * as EventUtils from '../src/utils/events';
import * as Lanes from '../src/utils/lanes';

/**
 * Grid's lanes (backlog item 334, #869): with `lanes` on, each calendar keeps a fixed slice of
 * every day, so its events sit in the same place whatever the other calendars hold that day.
 * Rendered as the card renders a grid, through `groupEventsByDay` and the configuration resolved
 * for grid view, with the lanes the card hands the renderer.
 */

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const CLARA = 'calendar.clara';

/** One event, matched to its entry as `processEvents` stamps it. */
function timed(
  entry: Types.EntityConfig,
  day: number,
  from: number,
  to: number,
  summary: string,
): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: new Date(2026, 5, day, from).toISOString() },
    end: { dateTime: new Date(2026, 5, day, to).toISOString() },
    _entityId: entry.entity,
    _matchedConfig: entry,
  };
}

function cardConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({
    view: 'grid',
    days_to_show: 2,
    entities: [
      { entity: ANNA, name: 'Anna' },
      { entity: BEN, name: 'Ben', label: 'B' },
      { entity: CLARA, name: 'Clara', label: 'Clara' },
    ],
    ...overrides,
  });
}

/** The day's events: Anna and Ben at ten on the 17th, Anna alone at two on the 18th. */
function events(config: Types.Config): Types.CalendarEventData[] {
  const [anna, ben] = config.entities as Types.EntityConfig[];
  return [
    timed(anna, 17, 10, 11, 'Swimming'),
    timed(ben, 17, 10, 11, 'Piano'),
    timed(anna, 18, 14, 15, 'Dentist'),
  ];
}

/** Renders the grid as the card does, its lanes resolved as the card resolves them. */
function renderGrid(config: Types.Config): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
  const days = EventUtils.groupEventsByDay(events(config), config, false, 'en', 'grid');
  const lanes = LaneRender.laneHeads(Lanes.laneUniverse(effective, 'grid'), effective, null);
  const container = document.createElement('div');
  litRender(
    Grid.renderGridGroupedEvents(
      days,
      effective,
      'en',
      undefined,
      null,
      FROZEN_NOW,
      undefined,
      Infinity,
      false,
      undefined,
      false,
      false,
      lanes,
    ),
    container,
  );
  return container;
}

/** Where each block of a day sits across it, as `[title, inline start, width]`. */
function placed(container: HTMLElement, day: number): Array<[string, string, string]> {
  const body = container.querySelectorAll<HTMLElement>('.grid-day-body')[day];
  return [...body.querySelectorAll<HTMLElement>('.grid-event')].map((block) => [
    block.querySelector('.event-title')?.textContent?.trim() ?? '',
    block.style.insetInlineStart,
    block.style.width,
  ]);
}

const slice = (from: number, width: number) =>
  [
    `calc(${from}% + var(--calendar-card-grid-event-gap))`,
    `calc(${width}% - var(--calendar-card-grid-event-gap) * 2)`,
  ] as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a grid drawing lanes', () => {
  it('keeps each calendar in its own slice on every day, an empty slice included', () => {
    const container = renderGrid(cardConfig({ lanes: true }));
    const third = 100 / 3;
    expect(placed(container, 0)).toEqual([
      ['Swimming', ...slice(0, third)],
      ['Piano', ...slice(third, third)],
    ]);
    // The point of the option: Anna's dentist stays in Anna's slice on a day Ben has nothing.
    // Without lanes it would take the whole day.
    expect(placed(container, 1)).toEqual([['Dentist', ...slice(0, third)]]);
  });

  it('marks each block with its lane, and names the lane to assistive technology', () => {
    const container = renderGrid(cardConfig({ lanes: true }));
    const blocks = [...container.querySelectorAll<HTMLElement>('.grid-day-body .grid-event')];
    expect(blocks.map((block) => block.dataset.lane)).toEqual([ANNA, BEN, ANNA]);
    const names = blocks.map((block) =>
      block.querySelector('.grid-event-accessible')!.getAttribute('aria-label')!,
    );
    // The lane's name leads, then the block's own label and title.
    expect(names[0].startsWith('\u2068Anna\u2069, \u2068Swimming\u2069')).toBe(true);
    expect(names[1].startsWith('\u2068Ben\u2069, \u2068B\u2069, \u2068Piano\u2069')).toBe(true);
  });

  it('heads each day as a grid without lanes does: each block says whose it is', () => {
    // Each block's label already says whose it is, so a strip of lane headers under every date
    // would only repeat it: the dates are headed exactly as they always were.
    const heads = (config: Types.Config) =>
      renderGrid(config)
        .querySelector('.grid-head')!
        .innerHTML.replace(/<!--[^]*?-->/g, '');
    expect(heads(cardConfig({ lanes: true }))).toBe(heads(cardConfig()));
  });

  it('gives each lane two root units of a crammed day, so none narrows to nothing', () => {
    const config = cardConfig({ lanes: true, time_grid: { min_days_fallback: 'cramp' } });
    const grid = renderGrid(config).querySelector<HTMLElement>('.grid-container')!;
    expect(grid.style.gridTemplateColumns).toContain('minmax(calc(3 * 2rem), 1fr)');
  });

  it('reads `lanes` from the grid’s own block over the card’s', () => {
    const container = renderGrid(cardConfig({ lanes: true, time_grid: { lanes: false } }));
    expect(container.querySelector('[data-lane]')).toBeNull();
  });
});

describe('a grid without lanes', () => {
  it('draws exactly what it always has: whole days, no lane on any block', () => {
    const container = renderGrid(cardConfig());
    // The cascade's own arrangement of two events starting together, whatever calendar each is.
    expect(placed(container, 0)).toEqual([
      ['Swimming', ...slice(0, 100)],
      ['Piano', ...slice(50, 50)],
    ]);
    expect(placed(container, 1)).toEqual([['Dentist', ...slice(0, 100)]]);
    expect(container.querySelector('[data-lane]')).toBeNull();
    expect(
      container.querySelector<HTMLElement>('.grid-container')!.style.gridTemplateColumns,
    ).not.toContain('calc(');
  });
});
