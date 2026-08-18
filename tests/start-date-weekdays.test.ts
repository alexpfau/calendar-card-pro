/**
 * Weekday vocabulary of the `start_date` grammar.
 *
 * `docs/features/start-date-offset.md` publishes fourteen spellings —
 * `monday | tuesday | … | sunday`, and the abbreviations `mon, tue, wed, thu,
 * fri, sat, sun` — and the worked examples lean on them in both roles the
 * grammar offers: as the anchor (`saturday`, `monday+1w`) and as a jump
 * operand (`today+sat`, `start_of_week+mon`, "then +tue, +wed, +thu, +fri").
 *
 * Nothing exercised that vocabulary. Deleting any one of the fourteen entries
 * from the `WEEKDAYS` table left every gate green, and the two roles fail
 * differently and quietly: as an anchor the parser falls through to
 * `{ kind: 'nomatch' }`, so the card silently starts from today instead of the
 * requested weekday, and as an operand it becomes `unrecognized operand`.
 *
 * The unknown-token cases are the control. They are what makes the fourteen
 * `ok` assertions mean something — they prove the parser rejects a word it does
 * not know, so accepting one it does is a decision rather than a default.
 */

import { describe, expect, it } from 'vitest';

import { parseStartDateExpression } from '../src/utils/start-date';

/** Wednesday, so that "already on it" and "roll forward" both get exercised. */
const NOW = new Date(2025, 0, 8, 12, 0, 0);

const FIRST_DAY_MONDAY = 1;

/** Every spelling the documentation promises, with the weekday it names. */
const SPELLINGS: ReadonlyArray<readonly [string, number]> = [
  ['sunday', 0],
  ['sun', 0],
  ['monday', 1],
  ['mon', 1],
  ['tuesday', 2],
  ['tue', 2],
  ['wednesday', 3],
  ['wed', 3],
  ['thursday', 4],
  ['thu', 4],
  ['friday', 5],
  ['fri', 5],
  ['saturday', 6],
  ['sat', 6],
];

describe('start_date weekday vocabulary', () => {
  it.each(SPELLINGS)('resolves %s as an anchor', (spelling, weekday) => {
    const result = parseStartDateExpression(spelling, FIRST_DAY_MONDAY, NOW);

    expect(result.kind, spelling).toBe('ok');
    expect(result.kind === 'ok' && result.date.getDay(), spelling).toBe(weekday);
  });

  it.each(SPELLINGS)('resolves %s as a jump operand', (spelling, weekday) => {
    const result = parseStartDateExpression(`today+${spelling}`, FIRST_DAY_MONDAY, NOW);

    expect(result.kind, spelling).toBe('ok');
    expect(result.kind === 'ok' && result.date.getDay(), spelling).toBe(weekday);
  });

  it('reads an abbreviation as the same day as its full name', () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['sunday', 'sun'],
      ['monday', 'mon'],
      ['tuesday', 'tue'],
      ['wednesday', 'wed'],
      ['thursday', 'thu'],
      ['friday', 'fri'],
      ['saturday', 'sat'],
    ];

    for (const [full, short] of pairs) {
      const long = parseStartDateExpression(full, FIRST_DAY_MONDAY, NOW);
      const brief = parseStartDateExpression(short, FIRST_DAY_MONDAY, NOW);

      expect(long.kind === 'ok' && long.date.getTime(), full).toBe(
        brief.kind === 'ok' && brief.date.getTime(),
      );
    }
  });

  it('stays on the named weekday when today already is that weekday', () => {
    const result = parseStartDateExpression('wednesday', FIRST_DAY_MONDAY, NOW);

    expect(result.kind === 'ok' && result.date.getDate()).toBe(8);
  });

  it('rolls forward rather than back when the weekday has passed this week', () => {
    const result = parseStartDateExpression('monday', FIRST_DAY_MONDAY, NOW);

    expect(result.kind === 'ok' && result.date.getDate()).toBe(13);
  });

  it('does not accept a word outside the published vocabulary as an anchor', () => {
    expect(parseStartDateExpression('funday', FIRST_DAY_MONDAY, NOW).kind).toBe('nomatch');
  });

  it('does not accept a word outside the published vocabulary as an operand', () => {
    const result = parseStartDateExpression('today+funday', FIRST_DAY_MONDAY, NOW);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain('funday');
  });
});
