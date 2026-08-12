import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A production build must stay quiet by default and become diagnosable on request.
 *
 * `rollup.config.mjs` pins `CURRENT_LOG_LEVEL` to 0 (ERROR) for production, which
 * silences all 17 `Logger.warn` sites — including user-actionable ones such as
 * *"Invalid start_date … falling back to today"*. The alternative to a runtime opt-in
 * was to decide, per call site, which warnings deserve to ship; that judgement has to
 * be re-made every time a call site is added and fails silently when it is skipped.
 *
 * These tests pin both halves of the bargain. The default must remain silent — a
 * regression there is a card that chatters in every user's console — and the override
 * must work without a rebuild, because its whole purpose is to be usable by someone who
 * has only the released bundle.
 *
 * The level is mocked at module load because `currentLogLevel` is still captured once,
 * at import time; only the *override* is read per call.
 */

interface OverrideHost {
  calendarCardProDebug?: unknown;
  calendarCardProLogLevel?: unknown;
}

const host = globalThis as unknown as OverrideHost;

/** Load the logger with the level production ships. */
async function loadProductionLogger() {
  vi.resetModules();
  vi.doMock('../src/config/constants', async () => {
    const actual =
      await vi.importActual<typeof import('../src/config/constants')>('../src/config/constants');
    return { ...actual, LOGGING: { ...actual.LOGGING, CURRENT_LOG_LEVEL: 0 } };
  });
  return import('../src/utils/logger');
}

describe('production log level override', () => {
  beforeEach(() => {
    delete host.calendarCardProDebug;
    delete host.calendarCardProLogLevel;
  });

  afterEach(() => {
    delete host.calendarCardProDebug;
    delete host.calendarCardProLogLevel;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('stays silent by default, exactly as production ships today', async () => {
    const Logger = await loadProductionLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    Logger.warn('invalid start_date');
    Logger.info('cache hit');
    Logger.debug('render pass');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('errors are never suppressed, with or without the override', async () => {
    const Logger = await loadProductionLogger();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    Logger.error('could not load calendar(s)');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('the boolean flag raises a production build all the way to DEBUG', async () => {
    const Logger = await loadProductionLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    host.calendarCardProDebug = true;

    Logger.warn('invalid start_date');
    Logger.info('cache hit');
    Logger.debug('render pass');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it('takes effect without reloading the module, which is the entire point', async () => {
    const Logger = await loadProductionLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Same module instance throughout: a user sets the flag in the console on a card
    // that has already loaded, and the next render must observe it.
    Logger.warn('before');
    expect(warnSpy).not.toHaveBeenCalled();

    host.calendarCardProDebug = true;
    Logger.warn('after');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    delete host.calendarCardProDebug;
    Logger.warn('after clearing');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('the numeric override selects a level rather than an all-or-nothing switch', async () => {
    const Logger = await loadProductionLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    host.calendarCardProLogLevel = 1; // WARN

    Logger.warn('invalid start_date');
    Logger.info('cache hit');
    Logger.debug('render pass');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('the numeric override wins over the boolean flag', async () => {
    const Logger = await loadProductionLogger();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    host.calendarCardProDebug = true;
    host.calendarCardProLogLevel = 0; // explicit ERROR beats the blunt flag

    Logger.info('cache hit');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a string', '3'],
    ['a non-integer', 1.5],
    ['a negative level', -1],
    ['a level above DEBUG', 4],
    ['null', null],
  ])('ignores %s and falls back to the compiled default', async (_label, value) => {
    const Logger = await loadProductionLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    host.calendarCardProLogLevel = value;

    Logger.warn('invalid start_date');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('only an exact `true` enables the flag, so a truthy string does not', async () => {
    const Logger = await loadProductionLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    host.calendarCardProDebug = 'yes';

    Logger.warn('invalid start_date');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
