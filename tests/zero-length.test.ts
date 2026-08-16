import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { coercePixelLength } from '../src/config/config';
import type * as Types from '../src/config/types';
import { isZeroLength } from '../src/config/view';
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
