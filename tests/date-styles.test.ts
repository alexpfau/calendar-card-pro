/**
 * Today's and past days' dates drawn in a style of their own (#619): `today_date_scale`,
 * `today_date_font_weight`, `past_date_scale`, `past_date_font_weight` and
 * `past_date_opacity`, and the `past-day` class on every day container.
 *
 * Every option ships at a value that changes nothing, so the cases below turn each one on. Sizes
 * are checked at units other than px, because every size the card ships is a px value and a
 * scaler that dropped the author's unit would agree with a px-only test (AGENTS.md, "When you
 * add a length option, test it at a non-px unit"). Whether the column and grid headers then line
 * up is layout, which happy-dom does not do; that was measured in Chromium for the pull request
 * that added this file.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Leaves from '../src/rendering/leaves';
import * as Render from '../src/rendering/render';
import { generateCustomPropertiesObject } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

// FROZEN_NOW is Wednesday, June 17, 2026, 10:00 UTC, and the unit project runs under UTC.
const TODAY = new Date(2026, 5, 17);
const YESTERDAY = new Date(2026, 5, 16);
const TOMORROW = new Date(2026, 5, 18);

/** The weekday, day number and month of one date, as `renderDateContent` draws them. */
function drawDate(date: Date, options: Partial<Types.Config> = {}, isToday = false) {
  const container = document.createElement('div');
  litRender(Leaves.renderDateContent(date, buildConfig(options), 'en', isToday), container);
  const part = (name: string) => container.querySelector<HTMLElement>(`.${name}`)!.style;
  return { weekday: part('weekday'), day: part('day'), month: part('month') };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reading the options', () => {
  it('ships every option at the value that changes nothing', () => {
    const config = buildConfig();

    expect(config.today_date_scale).toBe(1);
    expect(config.past_date_scale).toBe(1);
    expect(config.today_date_font_weight).toBe('default');
    expect(config.past_date_font_weight).toBe('default');
    expect(config.past_date_opacity).toBe(100);
  });

  it('takes any scale above 0 and draws anything else at 1', () => {
    expect(buildConfig({ today_date_scale: 1.25 }).today_date_scale).toBe(1.25);
    expect(buildConfig({ past_date_scale: '0.85' as unknown as number }).past_date_scale).toBe(
      0.85,
    );
    for (const value of [0, -1, 'large', null, true]) {
      expect(
        buildConfig({ today_date_scale: value as unknown as number }).today_date_scale,
        String(value),
      ).toBe(1);
    }
  });

  it('takes an opacity from 0 to 100 and leaves anything else unfaded', () => {
    expect(buildConfig({ past_date_opacity: 0 }).past_date_opacity).toBe(0);
    expect(buildConfig({ past_date_opacity: 55 }).past_date_opacity).toBe(55);
    for (const value of [101, -5, 'half']) {
      expect(
        buildConfig({ past_date_opacity: value as unknown as number }).past_date_opacity,
        String(value),
      ).toBe(100);
    }
  });

  /**
   * Pinned whole, so a name dropped from the table, or one added without a decision, fails here
   * rather than drawing a date in the card's own weight with no warning.
   */
  it('writes each weight the way the card draws it', () => {
    const words = ['default', 'light', 'regular', 'normal', 'medium', 'bold', 'Bold', ' BOLD '];
    expect(Object.fromEntries(words.map((word) => [word, Config.toFontWeightCss(word)]))).toEqual({
      default: '',
      light: 'var(--ha-font-weight-light, 300)',
      regular: 'var(--ha-font-weight-normal, 400)',
      normal: 'var(--ha-font-weight-normal, 400)',
      medium: 'var(--ha-font-weight-medium, 500)',
      bold: 'var(--ha-font-weight-bold, 700)',
      Bold: 'var(--ha-font-weight-bold, 700)',
      ' BOLD ': 'var(--ha-font-weight-bold, 700)',
    });
    expect(Config.toFontWeightCss(600)).toBe('600');
    expect(Config.toFontWeightCss('650')).toBe('650');
    expect(Config.toFontWeightCss(1000)).toBe('1000');
  });

  it('takes nothing else as a weight', () => {
    for (const value of [0, 1001, 'heavy', 'bolder', '', undefined, true]) {
      expect(Config.toFontWeightCss(value), String(value)).toBeUndefined();
      expect(
        buildConfig({ today_date_font_weight: value as unknown as string }).today_date_font_weight,
        String(value),
      ).toBe('default');
    }
  });
});

describe("drawing today's date", () => {
  it('scales all three parts, keeping each unit', () => {
    const date = drawDate(
      TODAY,
      {
        weekday_font_size: '1em',
        day_font_size: '150%',
        month_font_size: '0.8rem',
        today_date_scale: 1.25,
      },
      true,
    );

    expect(date.weekday.fontSize).toBe('1.25em');
    expect(date.day.fontSize).toBe('1.875em');
    expect(date.month.fontSize).toBe('1rem');
  });

  it('scales a keyword from the size it is drawn at, and keeps !important', () => {
    const date = drawDate(
      TODAY,
      { day_font_size: 'large', weekday_font_size: '14px !important', today_date_scale: 0.5 },
      true,
    );

    // `large` is drawn at 18px, so half of it is 9px: smaller, as asked.
    expect(date.day.fontSize).toBe('9px');
    expect(date.weekday.fontSize).toBe('7px');
    expect(date.weekday.getPropertyPriority('font-size')).toBe('important');
  });

  it('scales an inline initial from the browser default, as the date draws it', () => {
    // Written inline, `initial` is `medium`, 16px, not the size the date inherits.
    const date = drawDate(TODAY, { day_font_size: 'initial', today_date_scale: 1.25 }, true);

    expect(date.day.fontSize).toBe('20px');
  });

  it('draws all three parts in its weight', () => {
    const date = drawDate(TODAY, { today_date_font_weight: 'bold' }, true);

    for (const part of [date.weekday, date.day, date.month]) {
      expect(part.fontWeight).toBe('var(--ha-font-weight-bold, 700)');
    }
  });

  it("leaves every other day's date alone", () => {
    const options = {
      today_date_scale: 1.25,
      today_date_font_weight: 'bold',
    } satisfies Partial<Types.Config>;

    for (const day of [YESTERDAY, TOMORROW]) {
      const date = drawDate(day, options);
      expect(date.day.fontSize).toBe('26px');
      expect(date.day.fontWeight).toBe('');
    }
  });

  it('scales the tile with the number, which the tile is sized from', () => {
    const container = document.createElement('div');
    litRender(
      Leaves.renderDateContent(TODAY, buildConfig({ today_date_scale: 1.25 }), 'en', true),
      container,
    );
    const day = container.querySelector<HTMLElement>('.day')!;

    expect(day.classList.contains('today-tile')).toBe(true);
    expect(day.style.fontSize).toBe('32.5px');
  });
});

describe("drawing a past day's date", () => {
  const options = {
    past_date_scale: 0.85,
    past_date_font_weight: 'light',
    past_date_opacity: 55,
  } satisfies Partial<Types.Config>;

  it('scales, weighs and fades all three parts', () => {
    const date = drawDate(YESTERDAY, { ...options, day_font_size: '2em' });

    expect(date.day.fontSize).toBe('1.7em');
    for (const part of [date.weekday, date.day, date.month]) {
      expect(part.fontWeight).toBe('var(--ha-font-weight-light, 300)');
      expect(part.opacity).toBe('0.55');
    }
  });

  it("leaves today's and future days' dates alone", () => {
    for (const [day, isToday] of [
      [TODAY, true],
      [TOMORROW, false],
    ] as const) {
      const date = drawDate(day, options, isToday);
      expect(date.day.fontSize).toBe('26px');
      expect(date.day.fontWeight).toBe('');
      expect(date.day.opacity).toBe('');
    }
  });

  it('keeps a weekend color on a past weekend, fading it with the rest', () => {
    // June 13 and 14, 2026 are the Saturday and Sunday before the frozen Wednesday.
    const date = drawDate(new Date(2026, 5, 13), {
      past_date_opacity: 50,
      weekend_day_color: 'rgb(230, 124, 115)',
    });

    expect(date.day.color).toBe('rgb(230, 124, 115)');
    expect(date.day.opacity).toBe('0.5');
  });

  it('draws nothing new with every option at its shipped value', () => {
    for (const [day, isToday] of [
      [YESTERDAY, false],
      [TODAY, true],
    ] as const) {
      const date = drawDate(day, {}, isToday);
      for (const part of [date.weekday, date.day, date.month]) {
        expect(part.fontWeight).toBe('');
        expect(part.opacity).toBe('');
      }
      expect(date.day.fontSize).toBe('26px');
    }
  });
});

describe('sizing the date column and the headers for the largest date', () => {
  const STRUTS = [
    '--calendar-card-date-strut',
    '--calendar-card-date-weekday-row',
    '--calendar-card-date-weekday-align',
    '--calendar-card-date-day-strut-size',
    '--calendar-card-date-text-strut-size',
  ];

  it('writes no strut while no day is drawn at a scale of its own', () => {
    const props = generateCustomPropertiesObject(buildConfig({ past_date_opacity: 50 }));

    for (const name of STRUTS) expect(props, name).not.toHaveProperty(name);
    expect(props['--calendar-card-date-column-width']).toBe('45.5px');
  });

  it("widens the date column and sizes the struts for today's scale", () => {
    const props = generateCustomPropertiesObject(
      buildConfig({ day_font_size: '2em', month_font_size: '0.75em', today_date_scale: 1.25 }),
    );

    expect(props['--calendar-card-date-column-width']).toBe('4.375em');
    expect(props['--calendar-card-date-day-strut-size']).toBe('2.5em');
    expect(props['--calendar-card-date-text-strut-size']).toBe('max(2.5em, 0.9375em)');
    expect(props['--calendar-card-date-weekday-row']).toBe('17.5px');
    for (const name of STRUTS) expect(props, name).toHaveProperty(name);
  });

  it('sizes the struts for the larger of the two scales', () => {
    const props = generateCustomPropertiesObject(
      buildConfig({ today_date_scale: 1.1, past_date_scale: 1.5 }),
    );

    expect(props['--calendar-card-date-day-strut-size']).toBe('39px');
  });

  it('keeps every header at its usual size when only a past day is drawn smaller', () => {
    const props = generateCustomPropertiesObject(buildConfig({ past_date_scale: 0.85 }));

    expect(props['--calendar-card-date-column-width']).toBe('45.5px');
    expect(props['--calendar-card-date-day-strut-size']).toBe('26px');
  });

  it('writes no !important into a strut, where it would make the value invalid', () => {
    const props = generateCustomPropertiesObject(
      buildConfig({
        weekday_font_size: '14px !important',
        day_font_size: '26px !important',
        month_font_size: '12px !important',
        today_date_scale: 1.25,
      }),
    );

    expect(props['--calendar-card-date-weekday-row']).toBe('17.5px');
    expect(props['--calendar-card-date-day-strut-size']).toBe('32.5px');
    expect(props['--calendar-card-date-text-strut-size']).toBe('max(32.5px, 15px)');
  });

  it('sizes a strut for an initial size as the date draws it', () => {
    const props = generateCustomPropertiesObject(
      buildConfig({ day_font_size: 'initial', today_date_scale: 1.25 }),
    );

    expect(props['--calendar-card-date-day-strut-size']).toBe('20px');
  });

  it('leaves the month out of the text strut while the month is hidden', () => {
    const props = generateCustomPropertiesObject(
      buildConfig({ show_month: false, month_font_size: '40px', today_date_scale: 1.25 }),
    );

    expect(props['--calendar-card-date-text-strut-size']).toBe('32.5px');
  });
});

describe('setting the options for one view', () => {
  it('lets a view block override the card, and inherit it when its value is unusable', () => {
    const config = buildConfig({
      today_date_scale: 1.25,
      today_date_font_weight: 'bold',
      past_date_opacity: 60,
      column: { today_date_scale: 1.5, past_date_opacity: 'faint' as unknown as number },
      time_grid: { today_date_font_weight: 'heavy', today_date_scale: 0 },
    });

    const column = ViewConfig.resolveEffectiveConfig(config, 'column');
    expect(column.today_date_scale).toBe(1.5);
    expect(column.past_date_opacity).toBe(60);

    const grid = ViewConfig.resolveEffectiveConfig(config, 'grid');
    expect(grid.today_date_font_weight).toBe('bold');
    expect(grid.today_date_scale).toBe(1.25);

    expect(ViewConfig.resolveEffectiveConfig(config, 'list').today_date_scale).toBe(1.25);
  });
});

describe('the past-day class', () => {
  // Monday the 15th through Friday the 19th, with the frozen Wednesday in the middle.
  const SPAN = { start_date: '2026-06-15', days_to_show: 5, show_empty_days: true };
  const EVENTS: Types.CalendarEventData[] = [
    {
      start: { dateTime: '2026-06-15T10:00:00.000Z' },
      end: { dateTime: '2026-06-15T11:00:00.000Z' },
      summary: 'Standup',
      _entityId: 'calendar.personal',
    },
  ];

  function classes(view: Types.EffectiveView, selector: string): string[][] {
    const config = ViewConfig.resolveEffectiveConfig(
      buildConfig({ ...SPAN, view, column: { show_empty_days: true } }),
      view,
    );
    const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
    const container = document.createElement('div');
    litRender(
      view === 'list'
        ? Render.renderGroupedEvents(days, config, 'en', undefined, null)
        : view === 'column'
          ? Column.renderColumnGroupedEvents(days, config, 'en', undefined, null)
          : Grid.renderGridGroupedEvents(days, config, 'en', undefined, null, FROZEN_NOW),
      container,
    );
    return [...container.querySelectorAll(selector)].map((element) => [...element.classList]);
  }

  it.each([
    ['list', '.day-table'],
    ['column', '.day-column'],
    ['grid', '.grid-day-header'],
    ['grid', '.grid-day-body'],
  ] as const)('marks the days before today in %s view on %s', (view, selector) => {
    const containers = classes(view, selector);

    expect(containers).toHaveLength(5);
    expect(containers.map((names) => names.includes('past-day'))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(containers.map((names) => names.includes('today'))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it.each([
    ['list', '.day-table'],
    ['column', '.day-column'],
    ['grid', '.grid-day-header'],
  ] as const)('keeps future-day on every day but today in %s view', (view, selector) => {
    // Documented as "the day is not today" since it was added, so a past day carries both.
    expect(classes(view, selector).map((names) => names.includes('future-day'))).toEqual([
      true,
      true,
      false,
      true,
      true,
    ]);
  });
});
