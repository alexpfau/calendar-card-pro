import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import {
  DEFAULT_CONFIG,
  coercePixelLength,
  coercePixelLengthAgainst,
  normalizeEntities,
  normalizeLengthOptions,
  normalizeNumericOptions,
} from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  isZeroLength,
  resolveColumnOption,
  validateColumnOverrides,
  validateView,
} from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * `isZeroLength` decides whether a separator is drawn at all, so a zero it fails to
 * recognise is not a cosmetic miss: `createSeparatorStyle` gives week and month rules a
 * `day_spacing`-derived margin above *and* below, and that margin does not scale with
 * the border width. A separator the predicate calls non-zero is therefore emitted with
 * an invisible border and a full pair of margins — the user asked for no separator and
 * got the gap without the line.
 *
 * The spellings below are not hypothetical. All three separator widths are free-text
 * fields in the visual editor, and `coercePixelLength` turns the unitless input those
 * fields hand back into a pixel length. `0.0` becomes `0.0px`; `-0` becomes `-0px`.
 * Neither is the literal `0` the original predicate required, so both slipped through.
 */
const ZERO_SPELLINGS = [
  '0',
  '0px',
  '0em',
  '0rem',
  '0%',
  '0.0',
  '0.0px',
  '0.00px',
  '00',
  '00px',
  '-0',
  '-0px',
  '+0px',
  '.0px',
  ' 0.0px ',
];

const NON_ZERO_SPELLINGS = [
  '1px',
  '0.5px',
  '0.1em',
  '2',
  '-1px',
  '10%',
  '0.01px',
  'thin',
  '',
  'px',
  'calc(0px)',
  'var(--x)',
];

function eventAt(date: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: `${date}T12:00:00.000Z` },
    end: { dateTime: `${date}T13:00:00.000Z` },
    summary,
    _entityId: 'calendar.personal',
  };
}

// Straddles a month boundary so the month-separator branch is reachable at all. A
// fixture that stays inside one month renders zero separators for every width, which
// makes a "no separator was emitted" assertion pass vacuously.
const ACROSS_MONTH_BOUNDARY: Types.CalendarEventData[] = [
  eventAt('2026-06-29', 'June event'),
  eventAt('2026-07-01', 'July event'),
];

function renderWithMonthSeparator(width: string): HTMLElement {
  const config = buildConfig({
    month_separator_width: width,
    week_separator_width: '0px',
    day_separator_width: '0px',
    days_to_show: 30,
  });
  const days = EventUtils.groupEventsByDay(ACROSS_MONTH_BOUNDARY, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en'), container);
  return container;
}

describe('isZeroLength', () => {
  it.each(ZERO_SPELLINGS)('treats %o as zero', (value) => {
    expect(isZeroLength(value)).toBe(true);
  });

  it.each(NON_ZERO_SPELLINGS)('treats %o as non-zero', (value) => {
    expect(isZeroLength(value)).toBe(false);
  });

  it('recognises what the editor pipeline actually produces for a zero width', () => {
    // The reachability chain, asserted rather than described: a free-text editor field
    // hands back a unitless string, `coercePixelLength` appends `px`, and the result is
    // what the renderers test. Every step has to agree that this means "no separator".
    const produced = ['0', '0.0', '00', '-0', '0.00'].map((typed) =>
      coercePixelLength('month_separator_width', typed),
    );

    expect(produced).toEqual(['0px', '0.0px', '00px', '-0px', '0.00px']);
    expect(produced.filter((value) => !isZeroLength(value as string))).toEqual([]);
  });
});

describe('zero-width separators in the rendered DOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a separator when the width is genuinely non-zero', () => {
    // Guards the guard. Without this, a fixture or config change that stops producing a
    // month boundary would make every assertion below pass while testing nothing.
    const separators = renderWithMonthSeparator('2px').querySelectorAll('[class*=separator]');

    expect(separators).toHaveLength(1);
    expect(separators[0].getAttribute('style')).toContain('border-top-width:2px');
  });

  it.each(['0px', '0.0px', '00px', '-0px', '0.00px'])(
    'emits no separator element at all for %o',
    (width) => {
      expect(renderWithMonthSeparator(width).querySelectorAll('[class*=separator]')).toHaveLength(
        0,
      );
    },
  );

  it('leaves no separator margin behind for a zero width', () => {
    // The regression this file exists for. `0.0px` used to render an invisible rule
    // carrying `margin-top` and `margin-bottom` of `day_spacing`, so suppressing the
    // border alone would not have fixed what the user saw.
    const styles = Array.from(
      renderWithMonthSeparator('0.0px').querySelectorAll<HTMLElement>('[style]'),
    ).map((node) => node.getAttribute('style') ?? '');

    expect(styles.filter((style) => style.includes('border-top-style:solid'))).toEqual([]);
  });
});

/**
 * A blank YAML value — `day_separator_width:` with nothing after the colon — parses as
 * `null`, and `setConfig`'s shallow `{ ...DEFAULT_CONFIG, ...config }` merge lets that
 * `null` overwrite the shipped `'0px'`. Nothing downstream restored it, so the `null`
 * reached `isZeroLength`, which calls `.trim()` on it: a `TypeError` that took the whole
 * card down to a blank box, in both views, for all three separator widths.
 *
 * The column-only key is the same bug wearing different clothes. It resolves through
 * `normalizeColumnValue`, which wraps the coercion in `String(...)` — so instead of
 * throwing it produced the literal string `'null'`, which `isZeroLength` reads as
 * non-zero and draws as an invisible rule carrying a full pair of margins.
 *
 * Both are fixed at one boundary, in `coercePixelLengthAgainst`, so these tests exercise
 * the real `setConfig` chain rather than `buildConfig` — `buildConfig` calls
 * `normalizeNumericOptions` but *not* `normalizeLengthOptions`, so a test written through
 * it would bypass the very step under test.
 */
const SEPARATOR_KEYS = [
  'day_separator_width',
  'week_separator_width',
  'month_separator_width',
] as const;

/** The verbatim normalization chain from `setConfig` (calendar-card-pro.ts). */
function realSetConfig(raw: Record<string, unknown>): Types.Config {
  const config = {
    ...DEFAULT_CONFIG,
    entities: ['calendar.personal'],
    ...raw,
  } as unknown as Types.Config;

  config.entities = normalizeEntities(config.entities);
  normalizeNumericOptions(config);
  normalizeLengthOptions(config);
  validateView(config);
  validateColumnOverrides(config);
  return config;
}

function drawWith(view: Types.EffectiveView, raw: Record<string, unknown>): HTMLElement {
  const config = realSetConfig({ days_to_show: 30, show_empty_days: true, ...raw });
  const days = EventUtils.groupEventsByDay(ACROSS_MONTH_BOUNDARY, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'column'
      ? Column.renderColumnGroupedEvents(days, config, 'en', undefined, null)
      : Render.renderGroupedEvents(days, config, 'en', undefined, null),
    container,
  );
  return container;
}

describe('blank YAML values reaching the length guards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the shipped default when a length option arrives blank', () => {
    expect(coercePixelLengthAgainst('0px', null)).toBe('0px');
    expect(coercePixelLengthAgainst('0px', undefined)).toBe('0px');
    expect(coercePixelLengthAgainst('12px', null)).toBe('12px');
  });

  it('leaves a blank non-length option alone', () => {
    // The over-reach control. Length-ness is inferred from the shipped default, so an
    // option that takes a number or a boolean must not acquire a pixel string from this.
    expect(coercePixelLengthAgainst(10, null)).toBeNull();
    expect(coercePixelLengthAgainst(true, null)).toBeNull();
    expect(coercePixelLengthAgainst('sans-serif', null)).toBeNull();
  });

  it('still passes an empty string through', () => {
    // The scope control. `''` is pinned as pass-through by `pixel-length-coercion.test.ts`
    // and cannot throw — `isZeroLength('')` returns `false` without touching `.trim()` on
    // a nullish value. Substituting a default for it would be a guess, not a fix.
    expect(coercePixelLengthAgainst('0px', '')).toBe('');
  });

  it.each(SEPARATOR_KEYS)('normalizes a blank %s back to its shipped default', (key) => {
    expect(realSetConfig({ [key]: null })[key]).toBe(DEFAULT_CONFIG[key]);
  });

  it.each(SEPARATOR_KEYS)('leaves a real %s value untouched', (key) => {
    // The opposite direction: the fallback must not fire for a value the user did supply.
    expect(realSetConfig({ [key]: '3px' })[key]).toBe('3px');
  });

  it('CONTROL: the fixture renders more than one day, so the guards are reachable', () => {
    // Guards the guards. `renderGroupedEvents` short-circuits its separator branch on the
    // previous day, so a single-day fixture would make every render assertion below pass
    // without ever calling `isZeroLength`.
    const config = realSetConfig({ days_to_show: 30, show_empty_days: true });

    expect(
      EventUtils.groupEventsByDay(ACROSS_MONTH_BOUNDARY, config, false, 'en', 'list').length,
    ).toBeGreaterThan(1);
  });

  it('CONTROL: a real separator width still renders in both views', () => {
    for (const view of ['list', 'column'] as Types.EffectiveView[]) {
      expect(drawWith(view, { month_separator_width: '3px' }).innerHTML.length).toBeGreaterThan(0);
    }
  });

  it.each(
    SEPARATOR_KEYS.flatMap((key) =>
      (['list', 'column'] as Types.EffectiveView[]).map((view) => [view, key] as const),
    ),
  )('renders %s view with a blank %s', (view, key) => {
    let container: HTMLElement | undefined;

    expect(() => {
      container = drawWith(view, { [key]: null });
    }).not.toThrow();
    // Not throwing is only half of it — an empty container would satisfy that too.
    expect(container?.innerHTML.length ?? 0).toBeGreaterThan(0);
  });

  it('resolves a blank column-only length to its column default', () => {
    // The `String(null)` path: this used to resolve to the literal `'null'`, which reads
    // as non-zero and draws an invisible rule with a full pair of margins.
    const config = realSetConfig({
      view: 'column',
      column: { day_header_separator_width: null },
    });

    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('0px');
  });

  it('keeps an explicit column-only length', () => {
    const config = realSetConfig({
      view: 'column',
      column: { day_header_separator_width: '3px' },
    });

    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('3px');
  });
});
