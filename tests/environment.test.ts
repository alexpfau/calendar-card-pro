import { describe, expect, it } from 'vitest';

/**
 * Guards the test environment itself.
 *
 * Every assertion this suite will ever make about a rendered date, a day boundary,
 * an all-day event or a relative time depends on the process running in a known
 * timezone. `vitest.config.mjs` pins it via `test.env.TZ`, which works because
 * Vitest sets the variable before a worker's first `Date` use — but that is a
 * behaviour of the runner, not a guarantee of the language, and it would break
 * silently: the suite would keep passing on a maintainer's machine and start
 * disagreeing with CI, or agree with CI while both asserted the wrong day.
 *
 * A day boundary is the specific hazard. The card groups events into days, so a
 * one-hour host offset can move an event across midnight and change which column
 * it belongs to — a failure that looks like a grouping bug rather than a
 * configuration one, and that costs far more to diagnose than this file costs to
 * keep.
 */
describe('test environment', () => {
  it('runs in UTC, so date assertions do not depend on the host timezone', () => {
    expect(new Date('2026-06-15T12:00:00Z').getTimezoneOffset()).toBe(0);
  });

  it('reports UTC through Intl, which is what dayjs and toLocaleString resolve against', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
  });

  it('provides a DOM, which Lit requires to render', () => {
    // happy-dom, configured in vitest.config.mjs. Pure-logic tests do not need this,
    // but the Stage 2 render tests will, and a missing DOM surfaces there as a
    // confusing "document is not defined" rather than as a setup problem.
    expect(typeof document).toBe('object');
    expect(typeof customElements).toBe('object');
  });
});
