import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * A right-to-left card is the mirror of a left-to-right one.
 *
 * The list view laid out its card from physical sides. The card's own padding was 8px on the
 * left and 16px on the right, the date column 8px and 12px, the week row and every separator
 * started 8px from the left, and the title floated left with an 8px left margin. In a
 * left-to-right card the narrow side is the dates' outer edge; in a right-to-left one, where the
 * dates sit on the right, it is the events' side. So a right-to-left list kept the
 * left-to-right insets: its dates sat further from the card's edge, its separators ran past them
 * toward that edge, and its title stayed on the left above dates on the right.
 *
 * The same held for four things inside the card. The list's today indicator was placed by a
 * left offset, so `today_indicator_position` put it at the same distance from the left in either
 * direction. The progress bar's fill rounded its left end, which in right-to-left is the end
 * that stops partway along the track. The loading ring sat in the top right corner, beside a
 * right-to-left toolbar's first control rather than its last. And the own-row weather line's
 * separators, in column and grid view, each held a zero-width space that took the direction of
 * the chip after it, so the browser split the separator in two and the dot before the
 * temperature lost one of its margins.
 *
 * Each was measured in Chromium, WebKit and Firefox against the same cards in left-to-right:
 * written by inline side, with the card's padding turned around under :dir(rtl), every box of
 * the list layout mirrors its left-to-right counterpart, and the left-to-right cards stayed
 * byte-identical. happy-dom does no layout, so this reads
 * the stylesheet: what regressed is the declaration.
 */

const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every innermost rule as a normalized selector list and a body, nested at-rules included. */
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
  selector: prelude.replace(/\s+/g, ' ').trim(),
  body,
}));

/** Each declaration in a rule body as a property and a value, whitespace normalized. */
function declarations(body: string): [string, string][] {
  return body
    .split(';')
    .filter((decl) => decl.includes(':'))
    .map((decl) => {
      const idx = decl.indexOf(':');
      return [
        decl.slice(0, idx).trim(),
        decl
          .slice(idx + 1)
          .trim()
          .replace(/\s+/g, ' '),
      ];
    });
}

/** Every value rules with exactly this selector list declare for `prop`, in source order. */
function declaredAll(selector: string, prop: string): string[] {
  return RULES.filter((rule) => rule.selector === selector).flatMap((rule) =>
    declarations(rule.body)
      .filter(([name]) => name === prop)
      .map(([, value]) => value),
  );
}

/** The last value a rule with exactly this selector list declares for `prop`, or ''. */
function declared(selector: string, prop: string): string {
  const values = declaredAll(selector, prop);
  return values.length ? values[values.length - 1] : '';
}

/** How many space-separated values a declaration has, not counting spaces inside parentheses. */
function valueCount(value: string): number {
  let depth = 0;
  let count = 1;
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ' ' && depth === 0) count++;
  }
  return count;
}

/** A declaration that names a physical side of the box, other than a left or right margin or
 * padding, which inline-glyph-gaps.test.ts pins on its own. Transforms are not read: the only
 * horizontal ones scroll a title by a direction the card writes for each title. */
function isPhysical(prop: string, value: string): boolean {
  if (/^(margin|padding)-(left|right)$/.test(prop)) return false;
  if (/^(left|right)$/.test(prop)) return true;
  if (/-(left|right)(-|$)/.test(prop)) return true;
  if (/^(float|clear|text-align|justify-self|justify-content)$/.test(prop)) {
    return /\b(left|right)\b/.test(value);
  }
  return (
    /^(margin|padding|border-radius|border-width|inset)$/.test(prop) && valueCount(value) === 4
  );
}

describe('right-to-left mirroring', () => {
  it('reads the stylesheet', () => {
    // Guards the scans below: an empty rule list would pass them all.
    expect(RULES.length).toBeGreaterThan(300);
    expect(declared('.date-column', 'text-align')).toBe('center');
  });

  it('names a physical side nowhere but these', () => {
    const physical = RULES.flatMap((rule) =>
      declarations(rule.body)
        .filter(([prop, value]) => isPhysical(prop, value))
        .map(([prop, value]) => `${rule.selector} { ${prop}: ${value} }`),
    );

    expect(physical).toEqual([
      // The card's padding, as one shorthand per direction: see the test below.
      'ha-card { padding: calc(var(--calendar-card-spacing-additional) + 16px) 16px calc(var(--calendar-card-spacing-additional) + 16px) 8px }',
      'ha-card:dir(rtl) { padding: calc(var(--calendar-card-spacing-additional) + 16px) 8px calc(var(--calendar-card-spacing-additional) + 16px) 16px }',
      // The fallback for a browser without float: inline-start, which follows it.
      '.card-header { float: left }',
      // The list's today-indicator box is as wide as its cell, so either side is the same box.
      '.today-indicator-container:not(.inline) { left: 0 }',
      // One line that cannot wrap, sized to its own text, so its alignment moves nothing.
      '.time-countdown { text-align: right }',
      // A title wrapping beside the time: the room for the time, the time over it and the room a
      // cut keeps on the last line, each on the side named by the row's direction, which the card
      // measures, because older supported browsers can neither float to the inline end nor ask
      // :dir(). One rule per direction.
      ".time-beside-title > .summary-row.title-wrap[data-title-fit='ltr'] > .summary > .title-room { float: right }",
      ".time-beside-title > .summary-row.title-wrap[data-title-fit='rtl'] > .summary > .title-room { float: left }",
      ".time-beside-title > .summary-row.title-wrap[data-title-fit='ltr'] > .title-aside { right: 0 }",
      ".time-beside-title > .summary-row.title-wrap[data-title-fit='rtl'] > .title-aside { left: 0 }",
      ".time-beside-title > .summary-row.title-wrap[data-title-fit='ltr'][data-title-cut=''] > .summary::before { float: right }",
      ".time-beside-title > .summary-row.title-wrap[data-title-fit='rtl'][data-title-cut=''] > .summary::before { float: left }",
      // Grid keeps a title on the dashboard's side, one rule per direction.
      '.grid-event-disclosure .summary:dir(ltr) > .event-title { text-align: left }',
      '.grid-event-disclosure .summary:dir(rtl) > .event-title { text-align: right }',
    ]);
  });

  describe('the list layout holds its insets by inline side', () => {
    it.each([
      ['.week-row-table', 'padding-inline-start', '8px', 'the week row, from the dates side'],
      ['.week-number-cell', 'padding-inline-end', '12px', 'the week pill, as the date column'],
      ['.separator', 'margin-inline-start', '8px', 'a day separator, level with the dates'],
      ['.week-separator', 'margin-inline-start', '8px', 'a week separator, the same'],
      ['.month-separator', 'margin-inline-start', '8px', 'a month separator, the same'],
      ['.date-column', 'padding-inline-start', '8px', "the dates, from the card's edge"],
      ['.date-column', 'padding-inline-end', '12px', 'the dates, from the events'],
      ['.card-header', 'float', 'inline-start', 'the title, at the start of the line'],
      ['.card-header', 'margin-inline-start', '8px', 'the title, level with the dates'],
    ])('%s %s: %s (%s)', (selector, prop, value) => {
      expect(declared(selector, prop)).toBe(value);
    });

    it("mirrors the card's own padding as one shorthand, narrow at the dates", () => {
      // One declaration per direction, so the four sides still stand or fall together on
      // additional_card_spacing: a var() that resolves to nothing leaves no padding at all, as
      // it always has in left-to-right. Split into padding-block and padding-inline, the
      // inline pair would have survived it and padded such a card 8px and 16px.
      const spacing = 'calc(var(--calendar-card-spacing-additional) + 16px)';
      expect(declared('ha-card', 'padding')).toBe(`${spacing} 16px ${spacing} 8px`);
      expect(declared('ha-card:dir(rtl)', 'padding')).toBe(`${spacing} 8px ${spacing} 16px`);
      for (const prop of ['padding-inline', 'padding-block', 'padding-left', 'padding-right']) {
        expect(declared('ha-card', prop)).toBe('');
      }
      // Column and grid view pad both sides alike, and outweigh either.
      expect(declared('.calendar-card-pro.column-view', 'padding-inline')).toBe('16px');
      expect(declared('.calendar-card-pro.grid-view', 'padding-inline')).toBe(
        'var(--calendar-card-grid-inset)',
      );
    });

    it('floats the title left first, where a browser cannot float it to the inline start', () => {
      // Source order is the fallback: the second declaration replaces the first only where it
      // parses. The other way round, inline-start would always lose.
      expect(declaredAll('.card-header', 'float')).toEqual(['left', 'inline-start']);
    });

    it('names no logical float or :dir() in the rules that place the time beside a title', () => {
      // Chromium before 118 has no float to the inline end and before 120 no :dir(), nor Safari
      // before 16.4, and the card supports browsers older than all three. A room floated by one
      // and a time placed by the other sat on opposite sides of a right-to-left row.
      const placing = RULES.filter((rule) => rule.selector.includes('.title-wrap'));
      expect(placing.length).toBeGreaterThan(10);
      for (const rule of placing) {
        expect(rule.selector, rule.selector).not.toContain(':dir(');
        expect(rule.body, rule.selector).not.toMatch(/float:\s*inline-|inset-inline/);
      }
    });

    it('lets column and grid view drop the title margin in either direction', () => {
      // A physical left margin under these used to survive in right-to-left, where the
      // views' margin-inline-start: 0 is the right one.
      expect(declared('.card-header', 'margin')).toBe('0 0 16px');
      for (const view of ['column-view', 'grid-view']) {
        expect(declared(`.calendar-card-pro.${view} .card-header`, 'margin-inline-start')).toBe(
          '0',
        );
      }
    });
  });

  it("turns the today indicator's centering around in right-to-left only", () => {
    // The inline style centers it with translate(var(--calendar-card-today-indicator-shift,
    // -50%), -50%) from its inline start (today-indicator-position.test.ts). Pulled back by
    // half its width is toward the start only in left-to-right.
    const box = '.today-indicator-container:not(.inline)';
    const rtl = `${box}:dir(rtl)`;
    expect(declared(rtl, '--calendar-card-today-indicator-shift')).toBe('50%');
    // Set on the indicator's own box too, so a value inherited from a theme or card-mod
    // further up cannot move a left-to-right one from the -50% it always had.
    expect(declared(box, '--calendar-card-today-indicator-shift')).toBe('-50%');

    // Nothing else sets it.
    const setters = RULES.filter((rule) =>
      declarations(rule.body).some(([prop]) => prop === '--calendar-card-today-indicator-shift'),
    ).map((rule) => rule.selector);
    expect(setters).toEqual([box, rtl]);
  });

  it('keeps the pulse a scale about the center, so a pulsing indicator mirrors too', () => {
    // Keyframes that set a transform replace the inline one while they run. Column view's pulse
    // has none to replace, and runs a plain scale. The list's pulse runs keyframes that repeat
    // the inline centering, the shift variable included, before the scale, so it scales about
    // the point the dot is centered on and turns around with it in right-to-left. A physical
    // translation in them, or an origin off center, would move it by the same amount both ways.
    const transforms = (name: string) => {
      const frames = CSS.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?\\})\\s*\\}`));
      expect(frames, name).not.toBeNull();
      return [...(frames?.[1] ?? '').matchAll(/transform:\s*([^;]+);/g)].map((m) =>
        m[1].replace(/\s+/g, ' ').trim(),
      );
    };
    expect(transforms('pulse-animation')).toEqual(['scale(0.95)', 'scale(1.1)', 'scale(0.95)']);
    const centering = 'translate(var(--calendar-card-today-indicator-shift, -50%), -50%)';
    expect(transforms('pulse-animation-placed')).toEqual([
      `${centering} scale(0.95)`,
      `${centering} scale(1.1)`,
      `${centering} scale(0.95)`,
    ]);
    expect(
      declared(
        '.today-indicator-container:not(.inline) ha-icon.today-indicator.pulse',
        'animation-name',
      ),
    ).toBe('pulse-animation-placed');
    expect(CSS).not.toMatch(/transform-origin/);
  });

  it("rounds the progress fill at its inline start, the end that meets the track's", () => {
    const fill = '.progress-bar-filled';
    expect(declared(fill, 'border-start-start-radius')).toBe('999px');
    expect(declared(fill, 'border-end-start-radius')).toBe('999px');
    // The end that stops partway along the track stays square in either direction.
    expect(declared(fill, 'border-radius')).toBe('');
    expect(declared(fill, 'border-start-end-radius')).toBe('');
    expect(declared(fill, 'border-end-end-radius')).toBe('');
  });

  it('puts the loading ring in the top corner at the inline end', () => {
    expect(declared('.loading-indicator', 'inset-inline-end')).toBe(
      'calc(3.5px + max(0px, (var(--ha-card-border-radius, 12px) - 12px) * 0.15))',
    );
    expect(declared('.loading-indicator', 'right')).toBe('');
    expect(declared('.loading-indicator', 'left')).toBe('');
  });

  it('pads the filter menu rows by inline side, so a right-to-left menu mirrors them', () => {
    expect(declared('.legend-menu-row', 'padding-block')).toBe('4px');
    expect(declared('.legend-menu-row', 'padding-inline')).toBe('10px 12px');
    expect(declared('.legend-menu-row', 'padding')).toBe('');
  });

  it('isolates the folded countdown and its separator, in either direction', () => {
    // The countdown that follows the time text in column and grid view. Isolated, a countdown
    // running against the card cannot carry its start margin to its far end, and the
    // separator's zero-width space cannot carry its end margin off with the countdown. Both
    // halves are needed: the separator alone left an English countdown in a right-to-left card
    // touching its dot, and in Firefox drew the dot over its first letter. Both directions,
    // because a Hebrew countdown on a left-to-right card lost its gap too.
    const countdown = '.time .time-actual .time-text > .time-countdown';
    expect(declared(countdown, 'unicode-bidi')).toBe('isolate');
    expect(declared(`${countdown}::before`, 'unicode-bidi')).toBe('isolate');
    const scoped = RULES.filter(
      (rule) =>
        rule.selector.includes('.time-countdown') &&
        /:dir\(/.test(rule.selector) &&
        declarations(rule.body).some(([prop]) => prop === 'unicode-bidi'),
    );
    expect(scoped).toEqual([]);
  });

  it("isolates the own-row weather line's separators in right-to-left only", () => {
    const separator = '.time-location .event-weather .event-weather-text > span + span::before';
    // Both margins stay on the separator itself, by inline side.
    expect(declared(separator, 'margin-inline-start')).toBe('4px');
    expect(declared(separator, 'margin-inline-end')).toBe('4px');
    // Isolated, its zero-width space cannot carry its end margin off with the next chip.
    expect(
      declared(
        '.time-location .event-weather:dir(rtl) .event-weather-text > span + span::before',
        'unicode-bidi',
      ),
    ).toBe('isolate');
    // Left-to-right is left as it was.
    expect(declared(separator, 'unicode-bidi')).toBe('');
  });
});
