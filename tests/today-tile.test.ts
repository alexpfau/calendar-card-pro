/**
 * The today tile: the default today indicator, drawn on today's day number itself.
 *
 * The tile is the one indicator style that is not an element of its own, so it has its own
 * failure shapes: a value the type resolver does not recognize would be drawn as the
 * literal word "tile" (every unknown string is text since #573), the editor's "None" would
 * snap back to the tile if it stored an absent key now that the tile is the default, and
 * the column and grid headers would fall out of line if only today's number grew by the
 * tile's footprint. Each of those is pinned here.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import { buildDayHeaderSchema } from '../src/rendering/editor/schemas/day-header';
import { deriveSyntheticData } from '../src/rendering/editor/synthetic';
import { applyFormChange, toStoredConfig } from '../src/rendering/editor/value';
import * as Grid from '../src/rendering/grid';
import * as Leaves from '../src/rendering/leaves';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderView(view: Types.EffectiveView, overrides: Partial<Types.Config> = {}): HTMLElement {
  const config = buildConfig({ view, days_to_show: 3, ...overrides });
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

describe('the tile is the shipped default', () => {
  it('ships today_indicator: tile', () => {
    expect(Config.DEFAULT_CONFIG.today_indicator).toBe('tile');
  });

  it('resolves `tile` as a style of its own, never as text to draw', () => {
    expect(Helpers.getTodayIndicatorType('tile')).toBe('tile');
    expect(Leaves.isTileIndicator(buildConfig())).toBe(true);
    expect(Leaves.isTileIndicator(buildConfig({ today_indicator: false }))).toBe(false);
    expect(Leaves.isTileIndicator(buildConfig({ today_indicator: 'dot' }))).toBe(false);
  });

  it('draws no separate indicator element for the tile', () => {
    expect(Leaves.renderTodayIndicator(buildConfig(), true)).toBe(
      Leaves.renderTodayIndicator(buildConfig({ today_indicator: false }), true),
    );
  });
});

describe.each(['list', 'column', 'grid'] as const)('in %s view', (view) => {
  it('marks today, and only today, with the tile', () => {
    const container = renderView(view);
    const days = [...container.querySelectorAll<HTMLElement>('.day')];

    expect(days.length, 'no day numbers rendered, so the assertions below are vacuous').toBe(3);
    expect(days.map((day) => day.classList.contains('today-tile'))).toEqual([true, false, false]);
  });

  it("paints today's digits in the tile ink unless today_day_color names a color", () => {
    const tile = renderView(view).querySelector<HTMLElement>('.day.today-tile')!;
    expect(tile.style.color).toBe('var(--calendar-card-today-indicator-ink)');

    const named = renderView(view, { today_day_color: 'rgb(1, 2, 3)' }).querySelector<HTMLElement>(
      '.day.today-tile',
    )!;
    expect(named.style.color).toBe('rgb(1, 2, 3)');
  });

  it('draws nothing on the number once the indicator is turned off or changed', () => {
    expect(renderView(view, { today_indicator: false }).querySelector('.today-tile')).toBeNull();
    expect(renderView(view, { today_indicator: 'dot' }).querySelector('.today-tile')).toBeNull();
  });
});

describe("the tile's digits on a weekend", () => {
  // Today's colors fall back to the weekend ones, as the editor's helper says. The tile's
  // automatic shade must not cut in between: on a weekend, a weekend_day_color names the
  // digits just as today_day_color would.
  const saturday = new Date(2026, 5, 20);
  const digits = (overrides: Partial<Types.Config>, date = saturday) => {
    const host = document.createElement('div');
    litRender(Leaves.renderDateContent(date, buildConfig(overrides), 'en', true), host);
    return host.querySelector<HTMLElement>('.day.today-tile')!.style.color;
  };

  it('takes weekend_day_color on a weekend', () => {
    expect(saturday.getDay()).toBe(6);
    expect(digits({ weekend_day_color: 'rgb(9, 8, 7)' })).toBe('rgb(9, 8, 7)');
  });

  it('keeps its own shade on a weekday, and gives way to today_day_color always', () => {
    const wednesday = new Date(2026, 5, 17);
    expect(digits({ weekend_day_color: 'rgb(9, 8, 7)' }, wednesday)).toBe(
      'var(--calendar-card-today-indicator-ink)',
    );
    expect(digits({})).toBe('var(--calendar-card-today-indicator-ink)');
    expect(digits({ weekend_day_color: 'rgb(9, 8, 7)', today_day_color: 'rgb(1, 2, 3)' })).toBe(
      'rgb(1, 2, 3)',
    );
  });
});

describe.each(['column', 'grid'] as const)('the %s header row', (view) => {
  it("reserves the tile's footprint on every day, so the date row stays level", () => {
    const headers = [...renderView(view).querySelectorAll('.column-date-content')];

    expect(headers.length).toBe(3);
    expect(headers.every((header) => header.classList.contains('with-today-tile'))).toBe(true);
  });

  it('reserves nothing when another indicator is configured', () => {
    const headers = [
      ...renderView(view, { today_indicator: 'pulse' }).querySelectorAll('.column-date-content'),
    ];

    expect(headers.length).toBe(3);
    expect(headers.some((header) => header.classList.contains('with-today-tile'))).toBe(false);
  });
});

describe('the editor', () => {
  function applyOne(config: Types.Config, key: string, value: unknown) {
    const previous = { ...(config as unknown as Record<string, unknown>) };
    const applied = applyFormChange(config, previous, { ...previous, [key]: value }, {});
    return { config: applied.config, stored: toStoredConfig(applied.config) };
  }

  it('offers the tile among the styles', () => {
    const schema = JSON.stringify(
      buildDayHeaderSchema({ config: buildConfig(), view: 'list', language: 'en' }),
    );

    expect(schema).toContain('"name":"today_indicator_style"');
    expect(schema).toContain('"value":"tile"');
  });

  it('stores None as false, so it does not snap back to the default tile', () => {
    const { config, stored } = applyOne(buildConfig(), 'today_indicator_style', 'none');

    expect(config.today_indicator).toBe(false);
    expect(stored.today_indicator).toBe(false);
    expect(deriveSyntheticData(config).today_indicator_style).toBe('none');
  });

  it('stores nothing when the tile is chosen again, because it is the default', () => {
    const away = applyOne(buildConfig(), 'today_indicator_style', 'dot');
    const back = applyOne(away.config, 'today_indicator_style', 'tile');

    expect(back.config.today_indicator).toBe('tile');
    expect('today_indicator' in back.stored).toBe(false);
  });

  it('offers only a color for the tile: it has no size or position', () => {
    const names = (config: Types.Config) =>
      JSON.stringify(buildDayHeaderSchema({ config, view: 'list', language: 'en' }));

    const tile = names(buildConfig());
    expect(tile).toContain('"today_indicator_color"');
    expect(tile).not.toContain('"today_indicator_size"');
    expect(tile).not.toContain('"today_indicator_position"');

    // The control: the dot is positioned and sized, so both fields come back.
    const dot = names(buildConfig({ today_indicator: 'dot' }));
    expect(dot).toContain('"today_indicator_size"');
    expect(dot).toContain('"today_indicator_position"');
  });
});

/**
 * Month fills today's tile, and its digits are 16px at 600, which WCAG does not count as large
 * text, so they need 4.5 to 1. Home Assistant's light-blue primary gave white 3.3 to 1. The
 * stylesheet darkens the fill in OKLab; this reads the factor it uses out of the stylesheet and
 * applies it to every sRGB color, in steps of 5, so the claim cannot drift from the CSS. The
 * conversions use OKLab's published matrices; Chrome 157 computed the same contrast for six
 * theme primaries, pure green's 4.70 the lowest.
 */
describe("Month's filled tile", () => {
  const css = cardStyles.cssText.replace(/\s+/g, ' ');
  const WIDE = '.month-container:not(.month-narrow) .month-date > .day.today-tile';
  const NARROW = '.month-narrow .month-day.month-selected .month-date > .day.today-tile';

  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  function oklab(r: number, g: number, b: number): [number, number, number] {
    const [R, G, B] = [r, g, b].map(linear);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function luminance([L, a, b]: [number, number, number]): number {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const clip = (v: number) => Math.min(1, Math.max(0, v));
    const R = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    const G = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    const B = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }

  it('darkens the fill of both forms, lightness and chroma by one factor, with white digits', () => {
    const block = css.match(
      /@supports \(color: oklch\(from red l c h\)\)[^{]*\{([^@]*?background: oklab\( from var\(--calendar-card-today-indicator-color\)[^;]*;[^@]*)\}/,
    );
    expect(block, 'the gated block darkening the fill').not.toBeNull();
    const body = block![1];
    expect(body).toContain(`${WIDE}, ${NARROW} {`);
    const factors = [...body.matchAll(/calc\(([lab]) \* ([\d.]+) \/ max\(l, ([\d.]+)\)\)/g)];
    expect(factors.map((f) => f[1])).toEqual(['l', 'a', 'b']);
    expect(new Set(factors.flatMap((f) => [f[2], f[3]])).size).toBe(1);
    // Both fills redefine the ink their digits read inline, in the same rule as the fill, and
    // set no color of their own, which would outrank a color named for the digits.
    const shared = body.slice(body.indexOf(`${WIDE}, ${NARROW} {`)).split('}')[0];
    expect(shared).toMatch(/--calendar-card-today-indicator-ink: #fff;/);
    expect(shared).not.toMatch(/[;{] color:/);
  });

  it('gives white digits at least 4.5 to 1 on every sRGB indicator color', () => {
    const cap = Number(css.match(/calc\(l \* ([\d.]+) \/ max\(l, \1\)\)/)?.[1]);
    expect(cap).toBeGreaterThan(0);
    let worst = Infinity;
    for (let r = 0; r <= 255; r += 5)
      for (let g = 0; g <= 255; g += 5)
        for (let b = 0; b <= 255; b += 5) {
          const lab = oklab(r / 255, g / 255, b / 255);
          const k = cap / Math.max(lab[0], cap);
          const y = luminance([lab[0] * k, lab[1] * k, lab[2] * k]);
          worst = Math.min(worst, 1.05 / (y + 0.05));
        }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it("measured Home Assistant's light-blue primary below 4.5 to 1 without it", () => {
    // The control: the undarkened fill, white on #009ac7, which the review measured at 3.26.
    const y = luminance(oklab(0x00 / 255, 0x9a / 255, 0xc7 / 255));
    expect(1.05 / (y + 0.05)).toBeLessThan(4.5);
  });
});
