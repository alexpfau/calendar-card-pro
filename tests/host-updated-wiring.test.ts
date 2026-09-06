/**
 * The card host's `updated()` lifecycle hook and the two helpers it drives.
 *
 * A mutation sweep over this region broke 19 of 22 behaviours with the entire
 * suite green. The three that were caught were caught for a reason worth
 * recording: `hide_when_empty`'s only existing test calls `_applyVisibility()`
 * **directly** (`tests/off-value-guards.test.ts:196`), so the gate's own logic
 * was pinned while the fact that anything ever calls it was not. Deleting the
 * call site left every test passing. That is the same leaf-covered/wiring-bare
 * shape the ResizeObserver work found, and it is why these tests drive the real
 * lifecycle — `setConfig`, `hass`, `appendChild` — rather than invoking the
 * private helpers.
 *
 * What that left free: a card that re-fetched the whole calendar on every state
 * change in the house, a language that never followed a config edit, weather
 * setup that never re-ran when the entity changed, a title template that stayed
 * subscribed after being removed, a stale rendered title left on screen, a
 * transport error blanking a good title, and the `card-visibility-changed`
 * event — which Home Assistant's own conditional/section machinery listens for
 * — free to stop bubbling, stop crossing the shadow boundary, report the
 * inverse of what happened, or not fire at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/calendar-card-pro';

const subscriptions = vi.hoisted(() => [] as RecordingSubscriptionShape[]);

interface RecordingSubscriptionShape {
  readonly callbacks: { onResult: (r: string) => void; onError: (e: unknown) => void };
  readonly updates: unknown[];
  destroyed: number;
  update(hass: unknown, value: unknown): void;
  destroy(): void;
}

vi.mock('../src/utils/templates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/templates')>();
  class RecordingSubscription implements RecordingSubscriptionShape {
    readonly updates: unknown[] = [];
    destroyed = 0;
    constructor(
      readonly callbacks: { onResult: (r: string) => void; onError: (e: unknown) => void },
    ) {
      subscriptions.push(this);
    }
    update(_hass: unknown, value: unknown): void {
      this.updates.push(value);
    }
    destroy(): void {
      this.destroyed += 1;
    }
  }
  return { ...actual, TemplateSubscription: RecordingSubscription };
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  preview: boolean;
  editMode: boolean;
  isInitialLoad: boolean;
  renderedTitle?: string;
  updateEvents(force?: boolean): Promise<void>;
  updateComplete: Promise<boolean>;
  _language: string;
  _hasFetchError: boolean;
  _titleSubscription?: RecordingSubscriptionShape;
  _scheduleWeatherSetup(): void;
  _applyVisibility(): void;
}

const HASS = { states: {}, locale: { language: 'en' }, connection: {} };

function make(config: Record<string, unknown> = {}): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.personal'], ...config });
  return card;
}

/** Mount and let the first `updated()` pass settle. */
async function mount(card: CardUnderTest): Promise<void> {
  card.isInitialLoad = false;
  document.body.appendChild(card);
  card.hass = HASS;
  await card.updateComplete;
}

beforeEach(() => {
  subscriptions.length = 0;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('updated(): fetch, language and weather re-wiring', () => {
  it('force-fetches once when hass first arrives, not on every later hass', async () => {
    const card = make();
    card.isInitialLoad = false;
    const updateEvents = vi.spyOn(card, 'updateEvents').mockResolvedValue(undefined);
    document.body.appendChild(card);

    card.hass = HASS;
    await card.updateComplete;
    const afterFirst = updateEvents.mock.calls.filter((c) => c[0] === true).length;

    card.hass = { ...HASS, states: { 'light.x': { state: 'on' } } };
    await card.updateComplete;
    card.hass = { ...HASS, states: { 'light.x': { state: 'off' } } };
    await card.updateComplete;

    // Positive control: the first hass really does trigger the forced fetch.
    expect(afterFirst).toBe(1);
    // Home Assistant replaces `hass` on every state change in the house. Without
    // the `!changedProps.get('hass')` guard each one re-fetches every calendar.
    expect(updateEvents.mock.calls.filter((c) => c[0] === true)).toHaveLength(1);
  });

  it('re-derives the language when only the config language changes', async () => {
    const card = make({ language: 'de' });
    await mount(card);
    expect(card._language).toBe('de');

    card.setConfig({ entities: ['calendar.personal'], language: 'fr' });
    await card.updateComplete;

    expect(card._language).toBe('fr');
  });

  it('re-runs weather setup when the weather config changes without hass changing', async () => {
    const card = make({ weather: { entity: 'weather.home', position: 'date' } });
    await mount(card);

    const schedule = vi.spyOn(card, '_scheduleWeatherSetup');
    card.setConfig({
      entities: ['calendar.personal'],
      weather: { entity: 'weather.home', position: 'event' },
    });
    await card.updateComplete;

    expect(schedule).toHaveBeenCalled();
  });

  it('drives the visibility gate from the lifecycle, not only when called directly', async () => {
    const card = make({ hide_when_empty: true });
    await mount(card);

    // Never calls `_applyVisibility()` — that the lifecycle calls it is the point.
    expect(card.hidden).toBe(true);

    // Positive control: the same lifecycle leaves a card visible at the default.
    const visible = make({ hide_when_empty: false });
    await mount(visible);
    expect(visible.hidden).toBe(false);
  });
});

describe('updated(): title template subscription lifecycle', () => {
  it('subscribes for a templated title and pushes it the current template', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].updates.at(-1)).toBe('{{ states("sensor.x") }}');
  });

  it('reuses one subscription across updates instead of creating another', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);
    const first = card._titleSubscription;

    card.hass = { ...HASS, states: { 'light.x': { state: 'on' } } };
    await card.updateComplete;
    card.setConfig({ entities: ['calendar.personal'], title: '{{ states("sensor.y") }}' });
    await card.updateComplete;

    expect(subscriptions).toHaveLength(1);
    expect(card._titleSubscription).toBe(first);
    // Control: it is genuinely being kept in step, not merely kept alive.
    expect(subscriptions[0].updates.at(-1)).toBe('{{ states("sensor.y") }}');
  });

  it('keeps the subscription in step when hass changes', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);
    const before = subscriptions[0].updates.length;

    card.hass = { ...HASS, states: { 'light.x': { state: 'on' } } };
    await card.updateComplete;

    expect(subscriptions[0].updates.length).toBeGreaterThan(before);
  });

  it('destroys the subscription and clears the rendered title when the template goes away', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);
    subscriptions[0].callbacks.onResult('Rendered');
    await card.updateComplete;
    // Control: the rendered title really was in place before the config edit.
    expect(card.renderedTitle).toBe('Rendered');

    card.setConfig({ entities: ['calendar.personal'], title: 'Plain title' });
    await card.updateComplete;

    expect(subscriptions[0].destroyed).toBe(1);
    expect(card._titleSubscription).toBeUndefined();
    // A stale rendered title would keep drawing the old template's output under
    // a title the user has since replaced with literal text.
    expect(card.renderedTitle).toBeUndefined();
  });

  it('keeps an already rendered title when the subscription reports an error', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);
    subscriptions[0].callbacks.onResult('Rendered');
    await card.updateComplete;

    subscriptions[0].callbacks.onError(new Error('connection lost'));
    await card.updateComplete;

    expect(card.renderedTitle).toBe('Rendered');
  });

  it('falls back to an empty title when the first render itself errors', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);

    subscriptions[0].callbacks.onError(new Error('connection lost'));
    await card.updateComplete;

    expect(card.renderedTitle).toBe('');
  });

  it('does not recreate the subscription when sync runs after disconnect', async () => {
    const card = make({ title: '{{ states("sensor.x") }}' });
    await mount(card);
    expect(subscriptions).toHaveLength(1);

    card.remove();
    expect(card._titleSubscription).toBeUndefined();
    expect(subscriptions[0].destroyed).toBe(1);

    // Same shape as the now-line timer leak: disconnect tears the resource down,
    // then a late updated() path would otherwise re-arm it on a detached card.
    (card as CardUnderTest & { _updateTitleSubscription(): void })._updateTitleSubscription();

    expect(card._titleSubscription).toBeUndefined();
    expect(subscriptions).toHaveLength(1);
  });
});

describe('_applyVisibility(): gate conditions', () => {
  function visibilityCard(config: Record<string, unknown> = {}): CardUnderTest {
    const card = make({ hide_when_empty: true, ...config });
    card.isInitialLoad = false;
    card.hass = HASS;
    return card;
  }

  it('hides an empty card, and only when the option is on', () => {
    const on = visibilityCard();
    on._applyVisibility();
    expect(on.hidden).toBe(true);

    const off = visibilityCard({ hide_when_empty: false });
    off._applyVisibility();
    expect(off.hidden).toBe(false);
  });

  it('stays visible in the card picker preview', () => {
    const card = visibilityCard();
    card.preview = true;
    card._applyVisibility();
    expect(card.hidden).toBe(false);
  });

  it('stays visible while the dashboard is in edit mode', () => {
    const card = visibilityCard();
    card.editMode = true;
    card._applyVisibility();
    expect(card.hidden).toBe(false);
  });

  it('stays visible when the card is in an error state', () => {
    const card = visibilityCard();
    // `setConfig` replaces the whole config, so the option under test has to be
    // restated here — dropping it makes this case pass for the wrong reason.
    card.setConfig({ entities: [], hide_when_empty: true });
    card._applyVisibility();
    expect(card.hidden).toBe(false);
  });

  it('stays visible when the last fetch failed', () => {
    const card = visibilityCard();
    card._hasFetchError = true;
    card._applyVisibility();
    expect(card.hidden).toBe(false);
  });

  it('sets and clears the inline display style with the hidden flag', () => {
    const card = visibilityCard();
    card._applyVisibility();
    expect(card.style.display).toBe('none');

    card.preview = true;
    card._applyVisibility();
    expect(card.style.display).toBe('');
  });
});

describe('_applyVisibility(): card-visibility-changed event', () => {
  function listen(card: CardUnderTest): CustomEvent<{ value: boolean }>[] {
    const seen: CustomEvent<{ value: boolean }>[] = [];
    card.addEventListener('card-visibility-changed', (e) =>
      seen.push(e as CustomEvent<{ value: boolean }>),
    );
    return seen;
  }

  it('announces the new visibility, and reports it the right way round', () => {
    const card = make({ hide_when_empty: true });
    card.isInitialLoad = false;
    card.hass = HASS;
    const seen = listen(card);

    card._applyVisibility();
    expect(seen).toHaveLength(1);
    // `value` is whether the card is *visible*, not whether it is hidden.
    expect(seen[0].detail.value).toBe(false);

    card.preview = true;
    card._applyVisibility();
    expect(seen).toHaveLength(2);
    expect(seen[1].detail.value).toBe(true);
  });

  it('only announces an actual change', () => {
    const card = make({ hide_when_empty: true });
    card.isInitialLoad = false;
    card.hass = HASS;
    const seen = listen(card);

    card._applyVisibility();
    card._applyVisibility();
    card._applyVisibility();

    // Home Assistant re-lays out the surrounding section on each of these.
    expect(seen).toHaveLength(1);
  });

  it('escapes the card so a host layout can act on it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const card = make({ hide_when_empty: true });
    card.isInitialLoad = false;
    card.hass = HASS;
    host.appendChild(card);
    // Connecting starts a fetch that fails against the empty `states` map, and a
    // fetch error legitimately suppresses hiding. Pin both inputs so this test
    // measures event propagation rather than fetch timing.
    card._hasFetchError = false;
    card.hidden = false;

    const seen: CustomEvent<{ value: boolean }>[] = [];
    document.body.addEventListener('card-visibility-changed', (e) =>
      seen.push(e as CustomEvent<{ value: boolean }>),
    );

    card._applyVisibility();

    // Reaching an ancestor at all requires bubbles; HA's own cards sit inside
    // shadow roots, which additionally requires composed.
    expect(seen).toHaveLength(1);
    expect(seen[0].bubbles).toBe(true);
    expect(seen[0].composed).toBe(true);
  });
});
