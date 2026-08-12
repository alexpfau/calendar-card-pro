import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Deprecation notices must survive a production build.
 *
 * `rollup.config.mjs` rewrites `CURRENT_LOG_LEVEL` to 0 (ERROR) for production, so
 * every `Logger.warn` in the codebase is dead weight in the shipped bundle. That is
 * the right trade for internal commentary, but a removed config key is a setting the
 * user wrote by hand and the card is discarding — advice they never see is no advice.
 *
 * `Logger.deprecation` is therefore deliberately ungated. This pins that, because the
 * obvious "tidy-up" is to route it through `simpleLog` like its neighbours, which
 * would silently restore the bug in production while every dev build still looked
 * correct. The level is mocked at module load since `currentLogLevel` is captured
 * once, at import time, and has no setter.
 */
describe('Logger.deprecation', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('still logs when the log level is pinned to ERROR, as production ships it', async () => {
    vi.resetModules();
    vi.doMock('../src/config/constants', async () => {
      const actual =
        await vi.importActual<typeof import('../src/config/constants')>('../src/config/constants');
      return { ...actual, LOGGING: { ...actual.LOGGING, CURRENT_LOG_LEVEL: 0 } };
    });

    const Logger = await import('../src/utils/logger');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Control: at this level an ordinary warning must be suppressed. If this ever
    // starts logging, the mock stopped working and the assertion below proves nothing.
    Logger.warn('ordinary warning');
    expect(warnSpy).not.toHaveBeenCalled();

    Logger.deprecation('"row_spacing" was removed');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('row_spacing');
  });
});
