import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { generateCustomPropertiesObject } from '../src/rendering/styles';

/**
 * Whether each theming option reaches the CSS custom property that renders it.
 *
 * `generateCustomPropertiesObject` is the entire theming pipeline: roughly fifty options
 * become custom properties, and the stylesheet reads nothing else. Thirty-one of those
 * properties were never named in any test, and rewriting a mapping to a hardcoded constant
 * -- which is exactly what a configured value silently doing nothing looks like -- left the
 * whole suite green for every one that was tried.
 *
 * Every value below is distinct, so the assertions fail not only when a mapping is dropped
 * but also when two are crossed. That is the failure this file is really aimed at: a
 * property that carries *a* value looks correct in a browser until someone notices their
 * location colour is following their time colour.
 */
type Pair = readonly [option: string, property: string, value: string];

const PASS_THROUGH: readonly Pair[] = [
  ['background_color', '--calendar-card-background-color', 'rgb(1, 0, 0)'],
  ['weekday_font_size', '--calendar-card-font-size-weekday', '101px'],
  ['day_font_size', '--calendar-card-font-size-day', '102px'],
  ['month_font_size', '--calendar-card-font-size-month', '103px'],
  ['event_font_size', '--calendar-card-font-size-event', '104px'],
  ['time_font_size', '--calendar-card-font-size-time', '105px'],
  ['location_font_size', '--calendar-card-font-size-location', '106px'],
  ['description_font_size', '--calendar-card-font-size-description', '107px'],
  ['weekday_color', '--calendar-card-color-weekday', 'rgb(2, 0, 0)'],
  ['day_color', '--calendar-card-color-day', 'rgb(3, 0, 0)'],
  ['month_color', '--calendar-card-color-month', 'rgb(4, 0, 0)'],
  ['event_color', '--calendar-card-color-event', 'rgb(5, 0, 0)'],
  ['time_color', '--calendar-card-color-time', 'rgb(6, 0, 0)'],
  ['location_color', '--calendar-card-color-location', 'rgb(7, 0, 0)'],
  ['description_color', '--calendar-card-color-description', 'rgb(8, 0, 0)'],
  ['accent_color', '--calendar-card-line-color-vertical', 'rgb(9, 0, 0)'],
  ['vertical_line_width', '--calendar-card-line-width-vertical', '108px'],
  ['day_spacing', '--calendar-card-day-spacing', '109px'],
  ['event_spacing', '--calendar-card-event-spacing', '110px'],
  ['additional_card_spacing', '--calendar-card-spacing-additional', '111px'],
  ['progress_bar_color', '--calendar-card-progress-bar-color', 'rgb(10, 0, 0)'],
  ['progress_bar_height', '--calendar-card-progress-bar-height', '112px'],
  ['today_indicator_color', '--calendar-card-today-indicator-color', 'rgb(11, 0, 0)'],
  ['today_indicator_size', '--calendar-card-today-indicator-size', '113px'],
  ['week_number_font_size', '--calendar-card-week-number-font-size', '114px'],
  ['week_number_color', '--calendar-card-week-number-color', 'rgb(12, 0, 0)'],
  ['week_number_background_color', '--calendar-card-week-number-bg-color', 'rgb(13, 0, 0)'],
  ['time_icon_size', '--calendar-card-icon-size-time', '115px'],
  ['location_icon_size', '--calendar-card-icon-size-location', '116px'],
  ['description_icon_size', '--calendar-card-icon-size-description', '117px'],
  ['height', '--calendar-card-height', '118px'],
] as const;

/** Properties that fall back to a fixed value rather than to the browser's default. */
const FALLBACKS: readonly (readonly [option: string, property: string, fallback: string])[] = [
  ['time_icon_size', '--calendar-card-icon-size-time', '14px'],
  ['location_icon_size', '--calendar-card-icon-size-location', '14px'],
  ['description_icon_size', '--calendar-card-icon-size-description', '14px'],
  ['height', '--calendar-card-height', 'auto'],
] as const;

function propsFor(overrides: Record<string, unknown>): Record<string, string> {
  return generateCustomPropertiesObject(buildConfig(overrides) as Types.Config);
}

describe('custom property mapping', () => {
  const configured = propsFor(
    Object.fromEntries(PASS_THROUGH.map(([option, , value]) => [option, value])),
  );

  it.each(PASS_THROUGH)('maps %s to %s', (_option, property, value) => {
    expect(configured[property]).toBe(value);
  });

  it.each(FALLBACKS)('falls %s back to %s when unset', (option, property, fallback) => {
    // Paired absence for the four options that carry their own fallback: the pass-through
    // assertions above cannot tell a working mapping from one that ignores the config and
    // happens to emit the same string.
    expect(propsFor({ [option]: undefined })[property]).toBe(fallback);
  });

  it('emits the derived date column width from the day font size', () => {
    expect(propsFor({ day_font_size: '20px' })['--calendar-card-date-column-width']).toBe('35px');
  });

  it('derives the date column width in the unit the day font size was written in', () => {
    // The pixel case above cannot see the defect this guards: deriving the width with
    // `parseFloat` sized an `em` day number's column in `px` -- a `2em` font in a 3.5px
    // column -- and turned a `calc()` font size into the literal `NaNpx`.
    expect(propsFor({ day_font_size: '2em' })['--calendar-card-date-column-width']).toBe('3.5em');
    expect(propsFor({ day_font_size: '1.5rem' })['--calendar-card-date-column-width']).toBe(
      '2.625rem',
    );
    expect(
      propsFor({ day_font_size: 'calc(1em + 2px)' })['--calendar-card-date-column-width'],
    ).toBe('calc(1.75 * (calc(1em + 2px)))');
  });

  it('dims the default empty day color and passes a configured one through', () => {
    const fallback = propsFor({ empty_day_color: Config.DEFAULT_CONFIG.empty_day_color });
    const custom = propsFor({ empty_day_color: 'rgb(14, 0, 0)' });

    expect(fallback['--calendar-card-empty-day-color']).toContain('color-mix');
    expect(custom['--calendar-card-empty-day-color']).toBe('rgb(14, 0, 0)');
  });

  it('covers every property the stylesheet reads', () => {
    // Without this the table can fall behind the source: a theming option added later would
    // arrive with no assertion and nothing would say so.
    const emitted = Object.keys(configured).filter((name) => name.startsWith('--calendar-card-'));
    const asserted = new Set<string>([
      ...PASS_THROUGH.map(([, property]) => property),
      '--calendar-card-date-column-width',
      '--calendar-card-empty-day-color',
    ]);
    const known = new Set<string>([
      // Asserted in their own dedicated files, listed here so this check stays exhaustive.
      '--calendar-card-description-max-lines',
      '--calendar-card-title-max-lines',
      '--calendar-card-time-max-lines',
      '--calendar-card-location-max-lines',
      '--calendar-card-title-display',
      '--calendar-card-time-display',
      '--calendar-card-date-column-vertical-alignment',
      '--calendar-card-event-icon-vertical-alignment',
      '--calendar-card-event-border-radius',
      '--calendar-card-max-height',
      '--calendar-card-weather-date-icon-size',
      '--calendar-card-weather-date-font-size',
      '--calendar-card-weather-date-color',
      '--calendar-card-weather-event-icon-size',
      '--calendar-card-weather-event-font-size',
      '--calendar-card-weather-event-max-lines',
      '--calendar-card-weather-event-condition-display',
      '--calendar-card-weather-event-color',
    ]);

    expect(emitted.filter((name) => !asserted.has(name) && !known.has(name))).toEqual([]);
  });
});
