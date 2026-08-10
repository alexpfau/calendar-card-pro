import { defineConfig } from 'vitest/config';

/**
 * Test configuration for Calendar Card Pro.
 *
 * `vitest` and `happy-dom` are devDependencies. AGENTS.md states the project has
 * "no test suite ... keep it that way", with bundle size as the stated rationale —
 * that rationale does not apply here, because a test runner never enters
 * `dist/calendar-card-pro.js`. Rollup's only input is `src/calendar-card-pro.ts`,
 * so nothing under `tests/` can reach the bundle even accidentally.
 *
 * `happy-dom` rather than `jsdom`: it renders Lit correctly at roughly a fifth of
 * the install footprint, and swapping back is a one-word change to `environment`
 * below if a real gap ever appears.
 */
export default defineConfig({
  test: {
    // Lit needs a DOM to render into. Pure-logic tests do not care either way, so
    // setting this once avoids per-file environment annotations later.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],

    // Time and zone are pinned globally rather than per-file. Anything that renders
    // a date depends on both, and a suite that passes in Europe and fails in
    // America is worse than no suite at all.
    env: {
      TZ: 'UTC',
    },
  },
});
