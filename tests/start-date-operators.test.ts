/**
 * The two published parts of the `start_date` grammar that nothing exercised:
 * the `Nw` week unit, and the operator ceiling.
 *
 * `docs/features/start-date-offset.md` names `+Nw` in its BNF, in a worked
 * example (`monday+1w`), and in its table (`tuesday+2w`); the editor's helper
 * text and the parser's own JSDoc name it too. Only `tests/` never did — the
 * spelling appeared solely in a comment. Deleting `weeksMatch` outright left
 * the whole suite green while every documented week expression turned into
 * `kind: 'error'`, so the card would refuse a config the docs tell people to
 * write.
 *
 * The ceiling is the same story from the other side: `MAX_OPERATORS` rejects a
 * ninth operator, and nothing pinned either the limit or the acceptance of an
 * expression right at it. See `docs/features/start-date-offset.md`, which now
 * publishes the number rather than promising "any number of operators".
 */

import { describe, expect, it } from 'vitest';

import { parseStartDateExpression } from '../src/utils/start-date';

/** Wednesday, 8 January 2025 — the reference date the weekday suite uses. */
const NOW = new Date(2025, 0, 8, 12, 0, 0);

const FIRST_DAY_MONDAY = 1;

/** The resolved date as `YYYY-MM-DD`, or the failure kind when it did not resolve. */
function resolve(expression: string): string {
  const result = parseStartDateExpression(expression, FIRST_DAY_MONDAY, NOW);
  if (result.kind !== 'ok') return result.kind;

  const { date } = result;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('start_date week operator', () => {
  /**
   * The day unit is the control: `monday+1` and `monday+1w` share an anchor and
   * differ only in the unit, so a run where both give the same date is a run
   * where `w` has stopped meaning anything.
   */
  it('advances by seven days per week, not one', () => {
    expect(resolve('monday')).toBe('2025-01-13');
    expect(resolve('monday+1')).toBe('2025-01-14');
    expect(resolve('monday+1w')).toBe('2025-01-20');
  });

  it('resolves the documented worked example and table entry', () => {
    expect(resolve('monday+1w')).toBe('2025-01-20');
    expect(resolve('tuesday+2w')).toBe('2025-01-28');
  });

  it('scales with the multiplier from the `today` anchor', () => {
    expect(resolve('today+1w')).toBe('2025-01-15');
    expect(resolve('today+2w')).toBe('2025-01-22');
    expect(resolve('today+4w')).toBe('2025-02-05');
  });

  it('subtracts whole weeks as well', () => {
    expect(resolve('today-1w')).toBe('2025-01-01');
    expect(resolve('monday-1w')).toBe('2025-01-06');
  });

  it('combines with day operators in one expression', () => {
    expect(resolve('today+1w+1')).toBe('2025-01-16');
  });
});

describe('start_date operator ceiling', () => {
  const operator = (count: number) => `today${'+1'.repeat(count)}`;

  it('accepts an expression at the published maximum', () => {
    expect(resolve(operator(8))).toBe('2025-01-16');
  });

  it('rejects one operator beyond it, naming the limit', () => {
    const result = parseStartDateExpression(operator(9), FIRST_DAY_MONDAY, NOW);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain('maximum 8');
  });

  it('leaves ordinary short expressions unaffected', () => {
    expect(resolve('today+1')).toBe('2025-01-09');
  });
});
