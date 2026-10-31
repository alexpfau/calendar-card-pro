import { describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import {
  GRID_AXIS_PADDING_END_PX,
  GRID_AXIS_PADDING_START_PX,
  computeColumnThresholdPxFor,
  resolveColumnFit,
} from '../src/config/view';
import { cardStyles } from '../src/rendering/styles';

/**
 * The hour-label gutter is painted at `max-content`, so the browser always sizes it
 * correctly from the hidden sizer — whose font is `time_font_size`. Nothing is ever
 * mis-painted. What was wrong is the *reservation*: the width fitter runs before any
 * grid exists, cannot measure the painted track, and returned a constant measured at
 * the shipped 12px font. Raise the font and the painted axis grows while the
 * reservation does not, so `fitColumns` grants a day column the card has no room for.
 *
 * The reservation now scales the *text* portion of that constant with the resolved
 * font and adds the axis padding back unscaled, because `padding-inline: 4px 8px` is
 * fixed where the labels are not.
 *
 * ## Why no case here uses `time_font_size: 12px`
 *
 * 12px is doubly non-discriminating, and each half hides a different defect:
 *
 * 1. It is the identity point of the scale, so a reservation that scales and one that
 *    ignores the font both answer 48 (hourly) and 72 (sub-hourly). A test at 12px
 *    passes against the unfixed code.
 * 2. It is also the single font at which text-only scaling and whole-constant scaling
 *    agree — `48·f/12` and `36·f/12 + 12` are equal at f = 12 and nowhere else. So a
 *    12px case cannot tell a reservation that holds the padding fixed from one that
 *    inflates it, which at 32px is a 20px over-reservation.
 *
 * Every assertion below is therefore taken at 13px, 20px or 32px, and is an exact
 * value rather than a direction, since "it grew" is satisfied by both scalings.
 */

const build = (
  overrides: Partial<Types.TimeGridOverrides> = {},
  cardWide: Partial<Types.Config> = {},
) => {
  const config = buildConfig();
  config.days_to_show = 7;
  Object.assign(config, cardWide);
  config.time_grid = { ...overrides };
  return config;
};

/** Pixels the card must be wide to earn three day columns in grid view. */
const threshold = (config: Types.Config) => computeColumnThresholdPxFor(config, 3, 'grid');

/**
 * 383 is the shipped-default answer at the hourly cadence and is pinned by the
 * `axis_width` contract; it is repeated here as the baseline every scaled figure below
 * is a displacement of. A change that moves it has moved every existing card.
 */
const HOURLY_DEFAULT_PX = 383;

describe('grid axis reservation scales with time_font_size', () => {
  it('reserves the text portion scaled and the padding fixed, at the hourly cadence', () => {
    // Reservations 48 -> 51 / 72 / 108, i.e. (48 - 12)·f/12 + 12. Whole-constant
    // scaling would give 52 / 80 / 128 and thresholds 387 / 415 / 463, so these three
    // values are what pins the padding treatment rather than merely the scaling.
    expect(threshold(build({}, { time_font_size: '13px' }))).toBe(386);
    expect(threshold(build({}, { time_font_size: '20px' }))).toBe(407);
    expect(threshold(build({}, { time_font_size: '32px' }))).toBe(443);
  });

  it('scales the wider sub-hourly reservation from its own baseline', () => {
    // The sub-hourly constant is 72, not 48, so the same fonts displace further:
    // reservations 77 / 112 / 172. A single shared scale factor applied to one
    // constant would collapse these onto the hourly figures.
    const minutes = (time_font_size: string) =>
      threshold(build({ axis_label_minutes: 30 }, { time_font_size }));

    expect(minutes('13px')).toBe(412);
    expect(minutes('20px')).toBe(447);
    expect(minutes('32px')).toBe(507);
  });

  it('honors a time_grid override rather than the card-wide value', () => {
    // `time_font_size` is in COLUMN_OVERRIDE_KEYS, so grid view may carry its own.
    // Reading `config.time_font_size` would answer 383 for the first and 407 for the
    // second — exactly backwards.
    expect(threshold(build({ time_font_size: '20px' }))).toBe(407);
    expect(threshold(build({ time_font_size: '12px' }, { time_font_size: '20px' }))).toBe(
      HOURLY_DEFAULT_PX,
    );
  });

  it('falls back to the unscaled constant for a font it cannot resolve', () => {
    // A CSS length needing a layout context cannot be read before layout exists. The
    // fallback is today's behavior exactly, so it is strictly no worse, and it fires
    // silently: `time_font_size` is card-wide and renders correctly in list and column
    // view, so warning from grid would scold configurations that are fine.
    for (const time_font_size of ['1.5em', '1rem', 'larger', 'calc(12px + 1em)', '120%', '']) {
      expect(threshold(build({}, { time_font_size }))).toBe(HOURLY_DEFAULT_PX);
    }
  });

  it('falls back rather than shrinking for a negative length', () => {
    // Not hypothetical: the gutter's `parsePx` substitutes the *day_spacing* default
    // for a negative value, so routing a font through it would answer 10px and scale
    // the reservation *down* — under-reserving, which is the direction that mis-fits.
    // The font reads through a sanitizer-free parse for this reason.
    expect(threshold(build({}, { time_font_size: '-5px' }))).toBe(HOURLY_DEFAULT_PX);
  });

  it('leaves an explicitly sized axis alone', () => {
    // Only `max-content` defers to the painted text. A pixel `axis_width` is already
    // exact, so scaling it by the font would reserve width nothing will ever paint.
    const explicit = (time_font_size: string) =>
      threshold(build({ axis_width: '128px' }, { time_font_size }));

    expect(explicit('20px')).toBe(463);
    expect(explicit('32px')).toBe(463);
  });

  it('costs a day column at a width that a smaller font clears', () => {
    // The arithmetic exists to decide this. Both calls take the identical hysteresis
    // path from a null previous layout, so the comparison isolates the font.
    const fitAt = (time_font_size: string) =>
      resolveColumnFit('grid', build({}, { time_font_size }), 400, null).columns;

    expect(fitAt('20px')).toBeLessThan(fitAt('12px'));
  });

  it('reads its padding from the stylesheet it is compensating for', () => {
    // The scaling subtracts exactly the padding the axis paints. Two independent
    // copies of that number is how the two drift apart silently, so the rule is
    // interpolated from these constants and this reconciles the pair.
    expect(GRID_AXIS_PADDING_START_PX + GRID_AXIS_PADDING_END_PX).toBe(12);
    expect(cardStyles.cssText).toContain(
      `padding-inline: ${GRID_AXIS_PADDING_START_PX}px ${GRID_AXIS_PADDING_END_PX}px;`,
    );
  });
});
