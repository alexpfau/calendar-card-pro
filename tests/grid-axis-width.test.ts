import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import {
  TIME_GRID_DEFAULTS,
  computeColumnThresholdPxFor,
  normalizeAxisWidth,
  resolveTimeGridOption,
} from '../src/config/view';
import * as Logger from '../src/utils/logger';

/**
 * `axis_width` is painted raw into `grid-template-columns` and reserved in pixels by the
 * width fitter, which runs before any grid exists and so cannot measure the painted
 * track. A value the browser honors but the reservation cannot read — `3.5em`, `50%`,
 * `calc(48px + 1em)` — made the two disagree: the axis drew its true width while the
 * fitter reserved a 48px constant and granted day columns the card had no room for.
 *
 * The fix is a contract rather than better arithmetic: only what the reservation reads
 * may be painted. These tests pin that contract from both ends — what survives, what is
 * folded, and that the reservation's answer moves with an accepted value and does not
 * move with a folded one.
 */

/** The pattern the reservation reads, restated here so the test does not import a mock. */
const PX = /^(\d+(?:\.\d+)?)px$/i;

const build = (overrides: Partial<Types.TimeGridOverrides> = {}) => {
  const config = buildConfig();
  config.days_to_show = 7;
  config.time_grid = { ...overrides };
  return config;
};

const resolve = (axis_width: unknown) =>
  String(
    resolveTimeGridOption(build({ axis_width } as Partial<Types.TimeGridOverrides>), 'axis_width'),
  );

/**
 * Values that must reach the stylesheet unchanged.
 *
 * The bare numbers are here because `axis_width` is in `LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT`,
 * so `coercePixelLengthAgainst` gains them a unit — a supported spelling, not an invalid
 * one, and the reason this check runs after that coercion rather than before it. The
 * mixed-case forms are valid CSS and are preserved verbatim rather than lowercased.
 */
const ACCEPTED: ReadonlyArray<readonly [unknown, string]> = [
  ['max-content', 'max-content'],
  ['128px', '128px'],
  ['128PX', '128PX'],
  ['128Px', '128Px'],
  ['128pX', '128pX'],
  ['0px', '0px'],
  ['12.5px', '12.5px'],
  [128, '128px'],
  ['128', '128px'],
  [0, '0px'],
];

/**
 * Values the browser would honor, or silently drop, and the reservation cannot read.
 *
 * `-10px` is rejected by both the accept pattern and the reservation's, which is strictly
 * better than the behavior it replaces: a negative track invalidates the whole
 * `grid-template-columns` declaration, so today it takes the day columns with it.
 */
const FOLDED: readonly unknown[] = [
  '3.5em',
  '4rem',
  '20em',
  '50%',
  '10vw',
  'calc(48px + 1em)',
  'var(--axis)',
  'min-content',
  'fit-content(120px)',
  'auto',
  '1fr',
  '-10px',
  'px',
  '128 px',
  '',
  '   ',
  true,
  [],
  {},
];

/**
 * Spellings that mean "not set".
 *
 * `axis_width:` with nothing after it is `null` in YAML, not an empty string, and the
 * pixel coercion already treats it as absent — so it takes the default without reporting
 * a fallback and must not warn. `''` is a different thing: the option is present and its
 * value is wrong, so it folds and warns like any other unusable length.
 */
const ABSENT: readonly unknown[] = [undefined, null];

describe('axis_width normalization contract', () => {
  it('resolves every input to something the reservation can read', () => {
    const corpus = [...ACCEPTED.map(([input]) => input), ...FOLDED, ...ABSENT];

    // The denominator beside the verdict: a corpus that silently shrank would otherwise
    // pass this loop by running fewer times.
    expect(corpus).toHaveLength(31);

    for (const input of corpus) {
      const resolved = resolve(input);
      expect(
        resolved === 'max-content' || PX.test(resolved),
        `${JSON.stringify(input)} resolved to ${JSON.stringify(resolved)}`,
      ).toBe(true);
    }
  });

  it.each(ACCEPTED)('keeps %j verbatim', (input, expected) => {
    expect(resolve(input)).toBe(expected);
    expect(normalizeAxisWidth(input).usedFallback).toBe(false);
  });

  it.each(FOLDED.map((input) => [input]))('folds %j to the shipped default', (input) => {
    expect(resolve(input)).toBe(TIME_GRID_DEFAULTS.axis_width);
    expect(normalizeAxisWidth(input).usedFallback).toBe(true);
  });

  it.each(ABSENT.map((input) => [input]))(
    'leaves %j at the default without reporting a fallback',
    (input) => {
      // `setConfig` warns on `usedFallback`, so an unset option reporting one would warn
      // on every card that never set it.
      expect(resolve(input)).toBe(TIME_GRID_DEFAULTS.axis_width);
      expect(normalizeAxisWidth(input).usedFallback).toBe(false);
    },
  );

  it('leaves an omitted block entry at the default', () => {
    expect(resolveTimeGridOption(build(), 'axis_width')).toBe('max-content');
  });
});

describe('the reservation moves with the value that is painted', () => {
  // 383 is the `max-content` answer for three columns at the shipped hourly cadence, and
  // 463 is that answer with a 128px axis. Both figures matter: without the second, a
  // normalizer that folded *everything* would pass the first. 48px and 72px are
  // deliberately absent from this file — they are the reservation's own constants, so a
  // broken implementation and a working one agree on them and neither can falsify.
  it('reads an accepted pixel value exactly', () => {
    expect(computeColumnThresholdPxFor(build({ axis_width: '128px' }), 3, 'grid')).toBe(463);
    expect(computeColumnThresholdPxFor(build({ axis_width: 128 as never }), 3, 'grid')).toBe(463);
    expect(computeColumnThresholdPxFor(build({ axis_width: '128PX' }), 3, 'grid')).toBe(463);
  });

  it('reserves the default for a folded value, which is now also what is painted', () => {
    const fallback = computeColumnThresholdPxFor(build(), 3, 'grid');
    expect(fallback).toBe(383);

    for (const axis_width of ['3.5em', '4rem', '50%', 'calc(48px + 1em)']) {
      expect(computeColumnThresholdPxFor(build({ axis_width }), 3, 'grid')).toBe(fallback);
      // The reservation matching is only half the claim — before the fix it matched here
      // too, while the stylesheet drew the real length. This is the half that moved.
      expect(resolve(axis_width)).toBe('max-content');
    }
  });
});

describe('axis_width warning', () => {
  const setConfig = (time_grid: Record<string, unknown>) => {
    const card = document.createElement('calendar-card-pro-dev') as HTMLElement & {
      setConfig(config: Record<string, unknown>): void;
    };
    card.setConfig({ view: 'grid', entities: ['calendar.anna'], days_to_show: 1, time_grid });
    return card;
  };

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(FOLDED.filter((value) => typeof value === 'string').map((value) => [value]))(
    'warns once, naming the offending value, for %j',
    (axis_width) => {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      setConfig({ axis_width });

      const matching = warn.mock.calls.filter(([message]) => /axis_width/.test(String(message)));
      expect(matching).toHaveLength(1);
      expect(matching[0][0]).toContain(String(axis_width));
      expect(matching[0][0]).toMatch(/128px/);
      expect(matching[0][0]).toMatch(/max-content/);
    },
  );

  it.each([...ACCEPTED.map(([input]) => [input]), ...ABSENT.map((input) => [input])])(
    'stays silent for %j',
    (axis_width) => {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      setConfig(axis_width === undefined ? {} : { axis_width });

      expect(warn.mock.calls.filter(([message]) => /axis_width/.test(String(message)))).toEqual([]);
    },
  );

  it('warns once per setConfig, not once per resolve', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const card = setConfig({ axis_width: '3.5em' });

    // Resolving repeatedly is what rendering does; none of it may reach the log.
    const config = (card as unknown as { config: Types.Config }).config;
    for (let i = 0; i < 5; i += 1) {
      resolveTimeGridOption(config, 'axis_width');
      computeColumnThresholdPxFor(config, 3, 'grid');
    }

    expect(warn.mock.calls.filter(([message]) => /axis_width/.test(String(message)))).toHaveLength(
      1,
    );
  });
});
