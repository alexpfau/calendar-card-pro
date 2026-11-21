/**
 * Pick From Preview's part map against the card it maps (`src/rendering/editor/pick.ts`).
 *
 * The map names the card's own class names, so a markup change could break a pick without a
 * word: a renamed part would fall through to whatever holds it, and the outline would then name
 * the wrong page. This file renders the real card in List, Columns, Grid and Month, Month both wide
 * and in the narrow form a narrow card draws, with every part the map names turned on, and holds
 * the map in both directions:
 *
 * - every selector in the map matches something in at least one layout, so a stale entry fails
 *   rather than building up;
 * - every element the card draws that holds no other reaches a part of its own, not one of the
 *   catch-alls, so a new part that nobody mapped fails here instead of opening Card & Header;
 * - what each part takes in from inside it is pinned by value, so a part whose entry is dropped,
 *   landing its pieces on what holds it, fails too.
 *
 * And every target names a page and a heading the page registry has, in the scope it says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { WEATHER } from './fixtures';
import type * as Types from '../src/config/types';
import { OVERRIDE_BLOCK_BY_VIEW } from '../src/config/view';
import { parseFieldId } from '../src/rendering/editor/field-index';
import { PAGES } from '../src/rendering/editor/pages';
import { PICK_CATCH_ALLS, PICK_PARTS } from '../src/rendering/editor/pick';
import { partOn } from '../src/rendering/editor/views/pick';

interface Card extends HTMLElement {
  setConfig(config: unknown): void;
  hass: Types.Hass;
  events: Types.CalendarEventData[];
  weatherForecasts: Types.WeatherForecasts;
  isInitialLoad: boolean;
  config: Types.Config;
  updateEvents(): Promise<void>;
  updateComplete: Promise<boolean>;
}

const event = (
  summary: string,
  start: string,
  end: string,
  entity: string,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData =>
  ({
    summary,
    start: start.length === 10 ? { date: start } : { dateTime: start },
    end: end.length === 10 ? { date: end } : { dateTime: end },
    _entityId: entity,
    ...extra,
  }) as Types.CalendarEventData;

const EVENTS = [
  event('Dentist', '2026-06-17T09:30:00Z', '2026-06-17T11:00:00Z', 'calendar.anna', {
    location: 'Maple Street Clinic',
    description: 'Bring the card',
  }),
  event('Soccer', '2026-06-17T10:00:00Z', '2026-06-17T11:30:00Z', 'calendar.ben', {
    location: 'Riverside Park',
  }),
  event('Swim', '2026-06-17T10:15:00Z', '2026-06-17T11:45:00Z', 'calendar.ben'),
  event('Bin Day', '2026-06-18', '2026-06-19', 'calendar.ben'),
  event('Trip', '2026-06-18', '2026-06-21', 'calendar.anna'),
];

/** Two more on the 17th for Month, whose four lines then hold three and a "+2 more". */
const MONTH_EVENTS = [
  ...EVENTS,
  event('Piano', '2026-06-17T15:00:00Z', '2026-06-17T16:00:00Z', 'calendar.anna'),
  event('Book club', '2026-06-17T18:00:00Z', '2026-06-17T19:00:00Z', 'calendar.ben'),
];

/** Answers the resize observer the card starts, with a width a test reports. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const originalResizeObserver = globalThis.ResizeObserver;

/** Every part on, in the shape each layout can draw it. */
function config(view: Types.EffectiveView): Record<string, unknown> {
  return {
    title: 'Family',
    view,
    // The list runs into July, a Wednesday, so it draws a plain month rule and its label.
    days_to_show: view === 'list' ? 15 : 5,
    show_empty_days: true,
    entities: [
      { entity: 'calendar.anna', label: '🎒' },
      { entity: 'calendar.ben', label: 'mdi:soccer' },
    ],
    toolbar: {
      show: true,
      navigation: true,
      add_event: true,
      view_switcher: true,
      refresh: true,
      legend: 'chips',
      buttons: [{ icon: 'mdi:lightbulb', name: 'Lamp' }],
    },
    show_week_numbers: 'iso',
    today_indicator: 'dot',
    show_location: true,
    show_description: true,
    show_countdown: true,
    show_progress_bar: true,
    show_now_indicator: true,
    week_separator_width: '2px',
    day_separator_width: '1px',
    month_separator_width: '3px',
    month_separator_label: true,
    event_gap: '4px',
    // The badge beside the time in List, the pill around the title in Columns.
    allday_badge: view === 'list' ? 'time' : 'title',
    weather: { entity: 'weather.home', position: 'both' },
    time_grid: { today_background_color: '#ffeeee', max_simultaneous_events: 1 },
  };
}

/**
 * The card in a layout, its events matched to their calendars.
 *
 * @param view - The layout
 * @param width - A card width to report, as the resize observer would: a narrow one turns a
 *   month narrow
 * @param overrides - Options laid over the layout's configuration
 * @returns The card
 */
async function mount(
  view: Types.EffectiveView,
  width?: number,
  overrides: Record<string, unknown> = {},
): Promise<Card> {
  // Only this card's observers: an earlier layout's grid keeps one of its own.
  RecordingResizeObserver.instances = [];
  const card = document.createElement('calendar-card-pro-dev') as Card;
  vi.spyOn(card, 'updateEvents').mockResolvedValue();
  card.setConfig({ ...config(view), ...overrides });
  card.hass = {
    states: {
      'weather.home': { state: 'sunny', attributes: {} },
    },
    locale: { language: 'en' },
    callApi: async () => [],
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
  } as unknown as Types.Hass;
  card.events = (view === 'month' ? MONTH_EVENTS : EVENTS).map((each) => ({
    ...each,
    _matchedConfig: card.config.entities.find(
      (entry) => (entry as Types.EntityConfig).entity === each._entityId,
    ) as Types.EntityConfig,
  }));
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  card.weatherForecasts = WEATHER;
  await card.updateComplete;
  if (width !== undefined) {
    for (const observer of RecordingResizeObserver.instances) {
      observer.callback([{ contentRect: { width } }]);
    }
    await card.updateComplete;
  }
  return card;
}

/**
 * The entry the map decides an element by, as `partOn` reads it, and the one selector of that
 * entry's list the element matches.
 */
function entryOf(element: Element): { group: string; selector: string } | undefined {
  const group = PICK_PARTS.find(([selectors]) => element.matches(selectors))?.[0];
  if (group === undefined) return undefined;
  return { group, selector: group.split(', ').find((each) => element.matches(each))! };
}

/** The element and its ancestors up to the card's shadow root, innermost first. */
function pathOf(element: Element): Element[] {
  const path: Element[] = [];
  for (let node: Node | null = element; node instanceof Element; node = node.parentNode) {
    path.push(node);
  }
  return path;
}

/**
 * Every element the card draws that holds no other, an `svg` counted whole: what a pointer lands
 * on. A container is the space between its parts, which a catch-all is for.
 */
function leaves(root: ShadowRoot): Element[] {
  return [...root.querySelectorAll('*')].filter(
    (each) =>
      each.localName !== 'style' &&
      (each.localName === 'svg' || (each.closest('svg') === null && each.children.length === 0)),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-17T10:00:00Z'));
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
});

describe('Pick From Preview part map', () => {
  it('matches every selector it holds in some layout, and leaves no drawn part unmapped', async () => {
    const matched = new Set<string>();
    const unmapped: string[] = [];
    const absorbed = new Set<string>();
    let elements = 0;
    // List twice: with week numbers off it draws the plain week rule instead of the week row.
    // Month twice: at a phone's width it draws its narrow form and the chosen day's list.
    const layouts: ReadonlyArray<{
      view: Types.EffectiveView;
      width?: number;
      overrides?: Record<string, unknown>;
    }> = [
      { view: 'list' },
      { view: 'list', overrides: { show_week_numbers: null } },
      { view: 'column' },
      // Columns again with Calendar Filter as its menu, which draws the filter's button.
      {
        view: 'column',
        overrides: { toolbar: { ...(config('column').toolbar as object), legend: 'menu' } },
      },
      { view: 'grid' },
      { view: 'month' },
      { view: 'month', width: 375 },
    ];
    for (const { view, width, overrides } of layouts) {
      const card = await mount(view, width, overrides);
      const root = card.shadowRoot!;
      for (const [selectors] of PICK_PARTS) {
        for (const selector of selectors.split(', ')) {
          if (root.querySelector(selector)) matched.add(selector);
        }
      }
      for (const element of leaves(root)) {
        elements++;
        const part = partOn(pathOf(element), card);
        const entry = part && entryOf(part.element);
        const name = [element.localName, ...element.classList].join('.');
        if (entry === undefined || PICK_CATCH_ALLS.has(entry.group)) {
          unmapped.push(`${view}${width === undefined ? '' : ' narrow'}: ${name}`);
        } else if (part!.element !== element) {
          absorbed.add(`${entry.selector} ⊃ ${name}`);
        }
      }
      card.remove();
    }
    // The denominator: seven renders of four layouts drew a card worth checking.
    expect(elements).toBeGreaterThan(300);
    // Each selector of a group on its own, so one gone stale beside a live one still fails.
    expect(
      PICK_PARTS.flatMap(([selectors]) => selectors.split(', ')).filter(
        (each) => !matched.has(each),
      ),
    ).toEqual([]);
    expect([...new Set(unmapped)]).toEqual([]);
    // What each part takes in from inside it, pinned whole: a part whose own entry goes missing
    // lands its pieces on what holds it, and a new piece inside a part arrives unannounced, and
    // either changes this table.
    expect([...absorbed].sort()).toEqual([
      '.card-toolbar ⊃ input.toolbar-date-input',
      '.card-toolbar ⊃ span.toolbar-month-cap',
      '.card-toolbar ⊃ span.toolbar-month-name',
      '.card-toolbar ⊃ span.toolbar-range-text',
      '.card-toolbar ⊃ svg.toolbar-button-icon',
      '.card-toolbar ⊃ svg.toolbar-button-icon.date-navigation-direction',
      '.card-toolbar ⊃ svg.toolbar-month-icon',
      '.column-day-header ⊃ div.day',
      '.column-day-header ⊃ div.month',
      '.column-day-header ⊃ div.weekday',
      '.custom-button ⊃ ha-icon.custom-button-icon',
      '.date-column ⊃ div.day',
      '.date-column ⊃ div.month',
      '.date-column ⊃ div.weekday',
      '.description ⊃ ha-icon',
      '.description ⊃ span',
      '.event ⊃ div.grid-event-accessible',
      '.event ⊃ div.time-location',
      '.event-gap-row ⊃ td.event-gap-cell',
      '.event-title ⊃ span.title-word',
      '.event-weather ⊃ ha-icon',
      '.event-weather ⊃ span',
      '.grid-axis ⊃ div.grid-axis-label',
      '.grid-axis ⊃ span',
      '.grid-container ⊃ div.grid-boundary.grid-boundary-band-bottom',
      '.grid-container ⊃ div.grid-boundary.grid-boundary-band-top',
      '.grid-container ⊃ div.grid-boundary.grid-boundary-body-end',
      '.grid-day-body ⊃ div.grid-day-plane',
      '.grid-day-body ⊃ div.grid-event-backdrop-rules',
      '.grid-event-overflow ⊃ div.grid-event-overflow-label',
      '.legend-button ⊃ svg.toolbar-button-icon',
      '.legend-chip ⊃ span.legend-chip-label',
      // The filter's menu: its two buttons, each calendar's row, and its frame.
      '.legend-menu ⊃ button.legend-menu-action',
      '.legend-menu ⊃ button.legend-menu-action.unavailable',
      '.legend-menu ⊃ input.legend-menu-check',
      '.legend-menu ⊃ span.legend-menu-label',
      '.legend-menu ⊃ span.legend-menu-page',
      '.legend-menu ⊃ span.legend-menu-surface',
      '.location ⊃ ha-icon',
      '.location ⊃ span',
      '.month-container ⊃ div.month-probe',
      '.month-date ⊃ span.day',
      '.month-date ⊃ span.month-date-month',
      '.month-day-list-date ⊃ span.month-day-list-form',
      '.month-day-list-date ⊃ span.month-day-list-name',
      '.month-day-list-date ⊃ span.month-day-list-rest',
      '.month-narrow-marks ⊃ span.month-narrow-mark',
      '.month-separator ⊃ div.month-separator-line',
      '.month-separator ⊃ span.month-separator-label',
      '.month-weekdays ⊃ div.month-weekday',
      '.month-weekdays ⊃ div.month-weekday.weekend',
      '.progress-bar ⊃ div.progress-bar-filled',
      '.separator-cell ⊃ div.month-separator-line',
      '.separator-cell ⊃ div.separator-line',
      '.separator-cell ⊃ span.month-separator-label',
      '.time ⊃ ha-icon',
      '.time ⊃ span',
      '.time ⊃ span.time-end',
      '.today-indicator-container ⊃ ha-icon.today-indicator.dot',
      '.view-switcher ⊃ span.view-switcher-probe',
      '.view-switcher ⊃ span.view-switcher-probe.view-switcher-page',
      '.view-switcher ⊃ svg.view-switcher-icon',
      '.weather ⊃ ha-icon',
      '.weather ⊃ span.weather-temp-high',
    ]);
  });

  it('opens a page and heading the registry has, in the scope it names', () => {
    for (const [selector, target] of PICK_PARTS) {
      if ('calendar' in target) continue;
      const page = PAGES.find((each) => each.id === target.page);
      expect(page, selector).toBeDefined();
      if (target.heading !== undefined) {
        expect(
          page!.headings.some((heading) => heading.key === target.heading),
          `${selector} → ${target.page} › ${target.heading}`,
        ).toBe(true);
      }
      // A layout's own setting opens in that layout's scope.
      const block = target.field === undefined ? undefined : parseFieldId(target.field).dataPath[0];
      const own = Object.entries(OVERRIDE_BLOCK_BY_VIEW).find(([, key]) => key === block)?.[0];
      if (own !== undefined) expect(target.scope, selector).toBe(own);
      // A setting it names sits under that heading.
      if (target.field !== undefined) {
        const heading = page!.headings.find((each) => each.key === target.heading)!;
        expect(
          heading.fields.map(([id]) => id),
          `${selector} → ${target.field}`,
        ).toContain(target.field);
      }
    }
    // The parts that name their setting: the switcher, Layouts in Switcher; Grid's own parts,
    // each at the setting it is, where its topic keeps it; and a narrow month's day list, Events
    // in Day List.
    expect(
      PICK_PARTS.flatMap(([selector, target]) =>
        'field' in target && target.field !== undefined ? [`${selector} ${target.field}`] : [],
      ),
    ).toEqual([
      '.view-switcher card:toolbar.view_switcher_layouts',
      '.legend-button, .legend-menu, .legend-chips card:toolbar.legend',
      '.grid-now-line, .grid-now-dot layout:time_grid.show_now_line',
      '.grid-event-overflow layout:time_grid.max_simultaneous_events',
      '.grid-allday-band layout:time_grid.allday_band_max_rows',
      '.grid-weekend layout:time_grid.weekend_background_color',
      '.grid-today layout:time_grid.today_background_color',
      '.grid-day-body layout:time_grid.hour_height',
      '.month-narrow-marks, .month-narrow .month-day layout:month.min_day_width',
      '.month-day-list-more, .month-day-list-rows, .month-day-list layout:month.narrow_card_height',
    ]);
  });

  it('decides an element by its innermost part', async () => {
    const card = await mount('list');
    const location = card.shadowRoot!.querySelector('.location span')!;
    expect(entryOf(partOn(pathOf(location), card)!.element)?.selector).toBe('.location');
    const empty = card.shadowRoot!.querySelector('.empty-day-title')!;
    expect(partOn(pathOf(empty), card)!.target).toEqual({
      page: 'which_events',
      heading: 'heading_nothing',
    });
  });
});
