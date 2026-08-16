import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import * as Templates from '../src/utils/templates';

/**
 * The title-template subsystem had no test call sites at all: a sweep of seven
 * mutations across `src/utils/templates.ts` — dropping `{%` detection, dropping
 * `{{` detection, removing the resubscribe dedup guard, neutralising both
 * stale-version guards, skipping the version bump in `destroy()`, and deleting
 * the teardown error handling — left the entire suite green. That covers every
 * branch a user can reach through `title:`, which the card consults at five
 * separate call sites, so a template that stopped being recognised or a stale
 * render that overwrote a newer one would have shipped silently.
 *
 * These tests pin the two syntaxes documented in `docs/features/title-templates.md`
 * and the subscription lifecycle rules that keep a slow or superseded render
 * from replacing the title the user is currently looking at.
 */

/** One captured `render_template` subscription. */
interface Captured {
  handler: (message: unknown) => void;
  message: { type: string; template: string; report_errors?: boolean };
}

/**
 * Build a Home Assistant stub that records every `render_template` subscription
 * and hands back a controllable unsubscribe function.
 */
function makeHass(options: { unsubscribe?: () => void } = {}) {
  const captured: Captured[] = [];
  const hass = {
    connection: {
      subscribeMessage: (handler: (message: unknown) => void, message: Captured['message']) => {
        captured.push({ handler, message });
        return Promise.resolve(options.unsubscribe ?? (() => undefined));
      },
    },
  } as unknown as Types.Hass;

  return { hass, captured };
}

/** Let the un-awaited `void this._subscribe(...)` chain settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('title template detection', () => {
  it('recognizes both documented Jinja2 syntaxes and nothing else', () => {
    // Both forms are documented, so dropping either one silently disables a
    // syntax the docs still promise.
    expect(Templates.isTemplate('{{ states("sensor.x") }}')).toBe(true);
    expect(Templates.isTemplate('{% if true %}Yes{% endif %}')).toBe(true);

    // Controls: a literal title must never be sent to `render_template`.
    expect(Templates.isTemplate('My Calendar')).toBe(false);
    expect(Templates.isTemplate('Braces { and } alone')).toBe(false);
    expect(Templates.isTemplate(undefined)).toBe(false);
    expect(Templates.isTemplate(42)).toBe(false);
  });
});

describe('template result and error handling', () => {
  it('delivers rendered results and normalizes non-string payloads', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    const { hass, captured } = makeHass();

    await Templates.subscribeToTemplate(hass, '{{ x }}', { onResult, onError });
    expect(captured).toHaveLength(1);

    captured[0].handler({ result: 'Upcoming' });
    expect(onResult).toHaveBeenCalledWith('Upcoming');

    // Home Assistant may return a number or null; the title is a string.
    captured[0].handler({ result: 7 });
    expect(onResult).toHaveBeenCalledWith('7');
    captured[0].handler({ result: null });
    expect(onResult).toHaveBeenCalledWith('');

    expect(onError).not.toHaveBeenCalled();
  });

  it('swallows warning-level messages but surfaces real errors', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    const { hass, captured } = makeHass();

    await Templates.subscribeToTemplate(hass, '{{ x }}', { onResult, onError });

    // A warning must not reach the card, so the last good title survives.
    captured[0].handler({ error: 'undefined variable', level: 'WARNING' });
    expect(onError).not.toHaveBeenCalled();

    // Presence control: a non-warning error does reach the card, which proves
    // the assertion above is about the level and not about errors never firing.
    captured[0].handler({ error: 'TemplateSyntaxError', level: 'ERROR' });
    expect(onError).toHaveBeenCalledWith('TemplateSyntaxError');
  });

  it('returns no unsubscribe handle when there is nothing to subscribe to', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    const { hass } = makeHass();

    expect(await Templates.subscribeToTemplate(undefined, '{{ x }}', { onResult, onError })).toBe(
      undefined,
    );
    expect(await Templates.subscribeToTemplate(hass, '', { onResult, onError })).toBe(undefined);
  });
});

describe('template subscription lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not resubscribe while the template and connection are unchanged', async () => {
    const { hass, captured } = makeHass();
    const subscription = new Templates.TemplateSubscription({
      onResult: vi.fn(),
      onError: vi.fn(),
    });

    subscription.update(hass, '{{ x }}');
    await flush();
    expect(captured).toHaveLength(1);

    // Repeating an identical update must be inert even after the resubscribe
    // debounce would have elapsed.
    subscription.update(hass, '{{ x }}');
    await vi.advanceTimersByTimeAsync(400);
    expect(captured).toHaveLength(1);

    // Presence control: a genuinely changed template does resubscribe, so the
    // assertion above is about deduplication and not about subscription being
    // broken outright.
    subscription.update(hass, '{{ y }}');
    await vi.advanceTimersByTimeAsync(400);
    expect(captured).toHaveLength(2);

    subscription.destroy();
  });

  it('suppresses results that arrive after the subscription was destroyed', async () => {
    const onResult = vi.fn();
    const { hass, captured } = makeHass();
    const subscription = new Templates.TemplateSubscription({ onResult, onError: vi.fn() });

    subscription.update(hass, '{{ x }}');
    await flush();

    // Presence control: while live, results reach the card.
    captured[0].handler({ result: 'Live' });
    expect(onResult).toHaveBeenCalledWith('Live');
    onResult.mockClear();

    // After teardown a late render must not overwrite the current title.
    subscription.destroy();
    captured[0].handler({ result: 'Stale' });
    expect(onResult).not.toHaveBeenCalled();
  });

  it('unsubscribes a subscription that completed after being superseded', async () => {
    const unsubscribe = vi.fn();
    const { hass } = makeHass({ unsubscribe });
    const subscription = new Templates.TemplateSubscription({
      onResult: vi.fn(),
      onError: vi.fn(),
    });

    // Destroying before the in-flight subscribe resolves must still release it,
    // otherwise the websocket subscription leaks for the life of the page.
    subscription.update(hass, '{{ x }}');
    subscription.destroy();
    await flush();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('survives an unsubscribe handle that throws', async () => {
    const unsubscribe = vi.fn(() => {
      throw new Error('connection already closed');
    });
    const { hass } = makeHass({ unsubscribe });
    const subscription = new Templates.TemplateSubscription({
      onResult: vi.fn(),
      onError: vi.fn(),
    });

    subscription.update(hass, '{{ x }}');
    await flush();

    // A disconnected websocket must not take the card down during teardown.
    expect(() => subscription.destroy()).not.toThrow();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
