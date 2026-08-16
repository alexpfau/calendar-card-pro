import { defineConfig } from 'vitest/config';

/**
 * Test configuration for Calendar Card Pro.
 *
 * `vitest` and `happy-dom` are devDependencies. The bundle-size constraint in
 * AGENTS.md governs `dependencies` only — a test runner never enters
 * `dist/calendar-card-pro.js`. Rollup's only input is `src/calendar-card-pro.ts`,
 * so nothing under `tests/` can reach the bundle even accidentally.
 *
 * `happy-dom` rather than `jsdom`: it renders Lit correctly at roughly a fifth of
 * the install footprint, and swapping back is a one-word change to `environment`
 * below if a real gap ever appears.
 *
 * The suite is split into projects so that one file can opt out of the global UTC
 * pin. See the `dst-*` projects below for why that exception has to exist.
 */
export default defineConfig({
  test: {
    // Lit needs a DOM to render into. Pure-logic tests do not care either way, so
    // setting this once avoids per-file environment annotations later.
    environment: 'happy-dom',

    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.dst.test.ts'],

          // Time and zone are pinned globally rather than per-file. Anything that
          // renders a date depends on both, and a suite that passes in Europe and
          // fails in America is worse than no suite at all.
          env: {
            TZ: 'UTC',
          },
        },
      },

      // The UTC pin above is correct for everything that formats a date, but it also
      // hides an entire class of bug: UTC has no DST transitions, so date arithmetic
      // that silently assumes every day is 24 hours long is *always* correct here.
      // Two week-number functions were wrong for roughly one date in seven under real
      // zones while passing every UTC assertion. These projects run the `.dst.test.ts`
      // files under real zones instead.
      //
      // Both zones are required, not belt-and-braces. The drift is negative north of
      // the equator and positive south of it, and the two functions round in opposite
      // directions, so each zone catches exactly the bug the other misses. Zones with
      // a stable, long-standing DST rule are chosen deliberately — the assertions must
      // not depend on a recent legislative change in the host's tz database.
      ...['Europe/Berlin', 'Australia/Sydney'].map((timeZone) => ({
        extends: true,
        test: {
          name: `dst-${timeZone.split('/')[1].toLowerCase()}`,
          include: ['tests/**/*.dst.test.ts'],
          env: {
            TZ: timeZone,
          },
        },
      })),
    ],
  },
});
