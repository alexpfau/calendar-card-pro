import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as Leaves from '../src/rendering/leaves';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

/**
 * How the weather badge presents itself — C6.
 *
 * Three defects found on a live build, all in the same few lines, and all invisible to
 * every gate that existed. `list-dom.test.ts` freezes the list view, which is the one
 * placement none of them affected; `column-dom.test.ts` asserts *where* the badge goes,
 * never what it looks like once it is there.
 *
 * ## Why the composition is asserted by modelling the CSS
 *
 * The separators are `span + span::before` in the stylesheet, chosen so the markup stays
 * identical in both placements and the DOM snapshots stay untouched. happy-dom does not
 * render pseudo-element content, so no DOM query can see the middot.
 *
 * `compose()` below therefore applies the selector's own rule — join the element
 * children, inserting a separator wherever a span directly follows a span — to the real
 * rendered DOM. That is not a re-implementation of the feature: the feature *is* that
 * rule, and what these tests need to pin is which pieces are present and in what order,
 * because that is the entire input to it. The rule's existence and scoping are asserted
 * separately, against the stylesheet text, so both halves of the claim are covered.
 *
 * The alternative — a browser-based visual check — is the only thing that could read the
 * real pseudo-element, and it is not something this suite can run.
 */

/** A `hass` whose formatter localizes conditions the way Home Assistant's does. */
function hassWith(translations: Record<string, string>): Types.Hass {
  return {
    states: {
      'weather.home': { entity_id: 'weather.home', state: 'sunny', attributes: {} },
    },
    callApi: async () => undefined,
    callService: () => undefined,
    formatEntityState: (stateObj: Types.HassEntity, state?: string) => {
      const value = state ?? stateObj.state;
      const domain = String(stateObj.entity_id).split('.')[0];
      return translations[`component.${domain}.entity_component._.state.${value}`] ?? value;
    },
  } as unknown as Types.Hass;
}

const ENGLISH = hassWith({
  'component.weather.entity_component._.state.sunny': 'Sunny',
  // Home Assistant's own vocabulary, comma and all. This is why the separator is a
  // middot: with a comma there would be nothing to tell ours apart from theirs.
  'component.weather.entity_component._.state.clearnight': 'Clear, night',
});

/** An event at a fixed hour, with a forecast built to match it exactly. */
const EVENT: Types.CalendarEventData = {
  start: { dateTime: '2026-06-17T14:00:00.000Z' },
  end: { dateTime: '2026-06-17T16:00:00.000Z' },
  summary: 'Weather test',
  _entityId: 'calendar.personal',
};

function forecasts(overrides: Partial<Types.WeatherData> = {}): Types.WeatherForecasts {
  return {
    hourly: {
      '2026-06-17_14': {
        icon: 'mdi:weather-sunny',
        condition: 'sunny',
        temperature: 30,
        uv_index: 4,
        datetime: '2026-06-17T14:00:00.000Z',
        hour: 14,
        ...overrides,
      },
    },
    daily: {},
  };
}

interface Pieces {
  show_temp?: boolean;
  show_uv_index?: boolean;
  show_conditions?: boolean;
}

function weatherConfig(event: Pieces): Types.Config {
  const config = buildConfig();
  config.weather = {
    entity: 'weather.home',
    position: 'event',
    event: { daily_forecast_fallback: false, ...event },
  };
  return config;
}

/** Renders the badge leaf directly, at the placement asked for. */
function badge(config: Types.Config, placement: 'title' | 'row', data = forecasts()): HTMLElement {
  const host = document.createElement('div');
  litRender(Leaves.renderEventWeather(EVENT, config, data, placement, ENGLISH), host);
  const element = host.querySelector('.event-weather');
  expect(element, 'expected a rendered badge').not.toBeNull();
  return element as HTMLElement;
}

/**
 * The badge as the stylesheet composes it.
 *
 * Applies `span + span::before` to the real element children: an `ha-icon` contributes
 * its glyph placeholder and never a separator after it, and each span that directly
 * follows another span is preceded by the middot.
 */
function compose(element: HTMLElement): string {
  const out: string[] = [];
  let previousWasSpan = false;

  for (const child of Array.from(element.children)) {
    const isSpan = child.tagName.toLowerCase() === 'span';
    const text = (child.textContent ?? '').trim();

    if (isSpan) {
      out.push(previousWasSpan ? `· ${text}` : text);
    } else {
      out.push('[icon]');
    }
    previousWasSpan = isSpan;
  }

  return out.join(' ');
}

describe('weather presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the composed string', () => {
    /*
     * Every combination of the three optional pieces, because the whole reason the
     * separators are a CSS rule rather than template output is that a template would
     * have to enumerate exactly this table and would get one of the rows wrong.
     *
     * The icon is unconditional in this placement — see `renderEventWeather` — so the
     * "no pieces at all" row is still a rendered badge, and it must carry no stray
     * separator.
     */
    it.each([
      [{ show_temp: true, show_uv_index: true, show_conditions: true }, '[icon] 30° · UV4 · Sunny'],
      [{ show_temp: true, show_uv_index: true, show_conditions: false }, '[icon] 30° · UV4'],
      [{ show_temp: true, show_uv_index: false, show_conditions: true }, '[icon] 30° · Sunny'],
      [{ show_temp: false, show_uv_index: true, show_conditions: true }, '[icon] UV4 · Sunny'],
      [{ show_temp: true, show_uv_index: false, show_conditions: false }, '[icon] 30°'],
      [{ show_temp: false, show_uv_index: true, show_conditions: false }, '[icon] UV4'],
      [{ show_temp: false, show_uv_index: false, show_conditions: true }, '[icon] Sunny'],
      [{ show_temp: false, show_uv_index: false, show_conditions: false }, '[icon]'],
    ])('composes %o as the row', (pieces, expected) => {
      expect(compose(badge(weatherConfig(pieces), 'row'))).toBe(expected);
    });

    it('never puts a separator directly after the icon', () => {
      // Stated on its own because it is the one thing `span + span` buys that a
      // simpler `:not(:first-child)::before` would not, and a future refactor to the
      // simpler selector would pass every row above while breaking exactly this.
      for (const pieces of [
        { show_temp: true, show_uv_index: true, show_conditions: true },
        { show_temp: false, show_uv_index: false, show_conditions: true },
      ]) {
        const children = Array.from(badge(weatherConfig(pieces), 'row').children);
        expect(children[0].tagName.toLowerCase()).toBe('ha-icon');
        // The first span has no span before it, so the rule cannot fire on it.
        expect(children[1]?.previousElementSibling?.tagName.toLowerCase()).toBe('ha-icon');
      }
    });

    it('stays unambiguous when the condition itself contains a comma', () => {
      // "Clear, night" is Home Assistant's own string. With a comma separator this row
      // would read `30°, UV 4, Clear, night` and nothing would mark where our
      // separators end and theirs begins.
      const config = weatherConfig({ show_temp: true, show_uv_index: true, show_conditions: true });
      const composed = compose(badge(config, 'row', forecasts({ condition: 'clearnight' })));

      expect(composed).toBe('[icon] 30° · UV4 · Clear, night');
      expect(composed).not.toContain('30°,');
    });

    it('leaves the condition capitalized as Home Assistant translated it', () => {
      // Downcasing reads better in English and is wrong in some of the 35 languages the
      // card ships. The middot is what makes the capital acceptable, so the two
      // decisions are pinned together.
      const config = weatherConfig({ show_temp: true, show_conditions: true });
      const words = badge(config, 'row').querySelector('.weather-condition');

      expect(words?.textContent?.trim()).toBe('Sunny');
    });
  });

  describe('the frozen list view', () => {
    it('puts no separator in the DOM at all, which is what keeps the snapshots still', () => {
      // The whole reason the separators are `::before` and not template output. If a
      // future edit emits them as text or as a wrapper element, the list view's DOM
      // snapshots move — and the failure would land three files away from the change
      // that caused it, so it is stated here too.
      const config = weatherConfig({ show_temp: true, show_uv_index: true, show_conditions: true });
      const row = badge(config, 'row');

      expect(row.textContent).not.toContain('·');
      expect(row.innerHTML).not.toContain('·');
      // Icon plus one element per configured piece, and nothing in between.
      expect(Array.from(row.children).map((c) => c.tagName)).toEqual([
        'HA-ICON',
        'SPAN',
        'SPAN',
        'SPAN',
      ]);
    });

    it('carries no separator rule that can reach the title badge', () => {
      // The scoping claim, asserted against the real stylesheet rather than trusted.
      const rules = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
      const separators = rules.match(/[^}]*span \+ span::before[^{]*\{/g) ?? [];

      expect(separators).toHaveLength(1);
      expect(separators[0]).toContain('.time-location .event-weather');
    });

    it('renders the list badge exactly as it did before the row learned separators', () => {
      // End to end, through the real list pipeline: the badge that ships today.
      const config = buildConfig({ split_multiday_events: true });
      config.weather = {
        entity: 'weather.home',
        position: 'event',
        event: { show_conditions: true, show_temp: true },
      };

      const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'list');
      const host = document.createElement('div');
      litRender(Render.renderGroupedEvents(days, config, 'en', WEATHER, ENGLISH), host);

      const element = host.querySelector('.event-weather') as HTMLElement;
      expect(element).not.toBeNull();
      // No condition span, and therefore nothing a separator could sit between.
      expect(element.querySelector('.weather-condition')).toBeNull();
      expect(element.querySelectorAll('span')).toHaveLength(1);
    });
  });

  describe('colour', () => {
    /*
     * The row is one of four siblings inside .time-location and the other three are
     * `--secondary-text-color`. The badge was the odd one out twice over: its text
     * colour was shipped as a *default*, which the visual editor copies into the user's
     * YAML on the first edit, and its icon was given no colour at all and inherited.
     */
    it('ships no colour default, so each placement can supply its own', () => {
      // The `progress_bar_width` shape. A shipped default is merged in before render,
      // and from that point a value the user chose is indistinguishable from one they
      // never touched — which is exactly how a card nobody had styled ended up with a
      // primary-coloured weather row.
      expect(DEFAULT_CONFIG.weather?.event?.color).toBeUndefined();
      expect(DEFAULT_CONFIG.weather?.date?.color).toBeUndefined();
    });

    it('colours the row icon to match its text', () => {
      const element = badge(weatherConfig({ show_temp: true }), 'row');
      const icon = element.querySelector('ha-icon');
      const text = element.querySelector('span');

      expect(icon?.getAttribute('style')).toContain('color: var(--secondary-text-color)');
      expect(text?.getAttribute('style')).toContain('color: var(--secondary-text-color)');
    });

    it('leaves the title icon uncoloured, because the list view is frozen', () => {
      // Not an oversight and not consistency for its own sake: colouring it would be
      // more correct and would move the DOM snapshots, and the badge reads correctly
      // as it is.
      const icon = badge(weatherConfig({ show_temp: true }), 'title').querySelector('ha-icon');

      expect(icon?.getAttribute('style')).toBe('--mdc-icon-size: 14px;');
    });

    it('lets a configured colour reach the icon as well as the text', () => {
      const config = weatherConfig({ show_temp: true });
      config.weather!.event!.color = 'rgb(1, 2, 3)';
      const element = badge(config, 'row');

      expect(element.querySelector('ha-icon')?.getAttribute('style')).toContain('rgb(1, 2, 3)');
      expect(element.querySelector('span')?.getAttribute('style')).toContain('rgb(1, 2, 3)');
    });

    it('keeps the day header on the primary colour, whose neighbours it matches', () => {
      // Checked because the report asked whether the day header had inherited the same
      // assumption. It had not: the weekday, day number and month all default to the
      // primary colour, so the badge beside them is right to.
      const config = buildConfig();
      config.weather = { entity: 'weather.home', position: 'date', date: { show_high_temp: true } };

      const host = document.createElement('div');
      litRender(
        Leaves.renderDateWeather(new Date('2026-06-17T12:00:00.000Z'), config, WEATHER),
        host,
      );

      expect(host.querySelector('.weather')?.getAttribute('style')).toContain(
        'color: var(--primary-text-color)',
      );
    });
  });

  describe('the day header spacing', () => {
    /*
     * `renderDateWeather` indented its parts, which put whitespace text nodes between
     * the icon and the temperature. `.date-column .weather` is a flex container and
     * discards them; `.column-date-content .weather` is a grid item with no flex, so
     * the same markup rendered a real space there on top of the 1px margin.
     *
     * Fixed in the template rather than by flexing the column container, which carries
     * `text-overflow: ellipsis` and `white-space: nowrap` — both of which need a block
     * container, so flexing it would trade a spacing bug for a truncation bug.
     */
    function dateBadge(): HTMLElement {
      const config = buildConfig();
      config.weather = {
        entity: 'weather.home',
        position: 'date',
        date: { show_conditions: true, show_high_temp: true, show_low_temp: true },
      };

      const host = document.createElement('div');
      litRender(
        Leaves.renderDateWeather(new Date('2026-06-17T12:00:00.000Z'), config, WEATHER),
        host,
      );
      return host.querySelector('.weather') as HTMLElement;
    }

    it('emits no whitespace between the icon and the text', () => {
      const element = dateBadge();
      const stray = Array.from(element.childNodes).filter(
        (node) => node.nodeType === 3 && (node.textContent ?? '').trim() === '',
      );

      expect(stray.map((n) => JSON.stringify(n.textContent))).toEqual([]);
    });

    it('reads identically in both views', () => {
      // The acceptance criterion, stated directly. Before the fix the column view's
      // header read `24° /13°` where the list view read `24°/13°`, because one
      // container discarded the template's indentation and the other did not.
      const config = buildConfig();
      config.weather = {
        entity: 'weather.home',
        position: 'date',
        date: { show_conditions: true, show_high_temp: true },
      };

      const column = document.createElement('div');
      litRender(
        Column.renderColumnGroupedEvents(
          EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'column'),
          config,
          'en',
          WEATHER,
          ENGLISH,
        ),
        column,
      );

      const list = document.createElement('div');
      litRender(
        Render.renderGroupedEvents(
          EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'list'),
          config,
          'en',
          WEATHER,
          ENGLISH,
        ),
        list,
      );

      const columnText = column.querySelector('.weather')?.textContent;
      const listText = list.querySelector('.weather')?.textContent;

      expect(columnText).toBe(listText);
      expect(columnText).toBe('24°');
    });
  });
});
