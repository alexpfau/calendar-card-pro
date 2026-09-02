/**
 * The registry-color subscription lifecycle, driven through the real card element.
 *
 * 🚨 `src/calendar-card-pro.ts` was in no v4.1 audit's scope — the runtime pass took
 * `src/utils/`, the editor pass took `src/rendering/editor/`, and the entry point fell
 * between them. Two things were wrong at the seam between the card and
 * `utils/entity-colors`, and neither is visible from either side alone:
 *
 * 1. `disconnectedCallback` released and `connectedCallback` did not re-acquire. Every
 *    other subscription in that file is acquired on connect; this one re-registered only
 *    because `updateEvents()` happens to flip `isLoading`, which does not happen when that
 *    method returns early.
 * 2. The websocket subscription outlived every card on the page. `releaseEntityColors`
 *    dropped the listener and nothing closed the subscription, so a tab that had once
 *    shown an opted-in card kept re-reading the whole entity registry on every
 *    `entity_registry_updated`, notifying nobody — while `subscribe`'s own docblock said
 *    it did this "only while at least one card is listening".
 *
 * Fixing 2 naively regresses, which is why `refetches rather than freezing` is here: the
 * untorn-down subscription was accidentally keeping `colors` current, so tearing it down
 * without clearing `loaded` would hand the next card a map frozen at the moment the last
 * one left.
 *
 * These drive the element rather than the module, because the module's own tests cannot
 * see a lifecycle callback that never fires.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EntityColors from '../src/utils/entity-colors';

interface CardElement extends HTMLElement {
  hass: Types.Hass;
  isInitialLoad: boolean;
  updateComplete: Promise<boolean>;
  setConfig(config: Types.Config): void;
}

/** Resolve pending microtasks *and* the macrotask queue. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A fake connection that exposes whether anything is subscribed, and counts fetches.
 *
 * `handler` is the live `entity_registry_updated` callback, or `undefined` when nothing is
 * subscribed — which is the observable the teardown tests turn on. `color` stands in for
 * the registry itself, so a test can move it while nobody is watching.
 *
 * `subscribes` counts handshakes rather than live subscriptions, which is the only way to
 * see a *duplicate* one: a second `subscribeEvents` overwrites `handler` with an
 * indistinguishable function, so "is anything subscribed" cannot tell one from two.
 */
function makeHass(color = 'red') {
  const state = {
    handler: undefined as undefined | (() => void),
    fetches: 0,
    subscribes: 0,
    color,
    gate: null as Promise<void> | null,
    open: null as (() => void) | null,
    reject: false,
  };

  const hass = {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async () => [],
    callWS: async () => {
      state.fetches += 1;
      return [{ entity_id: 'calendar.personal', options: { calendar: { color: state.color } } }];
    },
    connection: {
      subscribeEvents: async (cb: () => void) => {
        state.subscribes += 1;
        if (state.gate) await state.gate;
        if (state.reject) throw new Error('websocket refused the subscription');
        state.handler = cb;
        return () => {
          state.handler = undefined;
        };
      },
    },
  } as unknown as Types.Hass;

  return {
    state,
    hass,
    /** Hold `subscribeEvents` open, so a card can come and go mid-handshake. */
    hold() {
      state.gate = new Promise<void>((resolve) => {
        state.open = resolve;
      });
    },
    release() {
      state.open?.();
      state.gate = null;
      state.open = null;
    },
  };
}

async function mount(
  hass: Types.Hass,
  overrides: Record<string, unknown> = { accent_color: 'home-assistant' },
): Promise<CardElement> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
  card.setConfig(buildConfig(overrides) as Types.Config);
  card.hass = hass;
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  await flush();
  return card;
}

/** How many times a registry change reaches this card. */
function watchRepaints(card: CardElement) {
  return vi.spyOn(card as unknown as { requestUpdate: () => void }, 'requestUpdate');
}

describe('registry colors: who is listening', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    EntityColors.resetEntityColors();
    vi.restoreAllMocks();
  });

  it('repaints an opted-in card when the registry moves', async () => {
    // The positive control for every zero below: without it, a test asserting "no repaint"
    // cannot tell a working teardown from a probe that never reached the subscription.
    const { state, hass } = makeHass();
    const card = await mount(hass);
    const repaints = watchRepaints(card);

    expect(state.handler).toBeTypeOf('function');
    state.handler!();
    await flush();

    expect(repaints).toHaveBeenCalledTimes(1);
  });

  it('subscribes to nothing for a card that never opts in', async () => {
    const { state, hass } = makeHass();
    await mount(hass, { accent_color: '#ff0000' });

    expect(state.handler).toBeUndefined();
    expect(state.fetches).toBe(0);
  });

  it('registers once however many times the card updates', async () => {
    const { state, hass } = makeHass();
    const card = await mount(hass);

    card.hass = { ...hass } as Types.Hass;
    await card.updateComplete;
    card.hass = { ...hass } as Types.Hass;
    await card.updateComplete;
    await flush();

    const repaints = watchRepaints(card);
    state.handler!();
    await flush();

    // A stable field rather than an inline arrow is what makes `listeners` a set of one.
    expect(repaints).toHaveBeenCalledTimes(1);
  });
});

describe('registry colors: connect and disconnect are symmetric', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    EntityColors.resetEntityColors();
    vi.restoreAllMocks();
  });

  it('stops repainting a card that has left the document', async () => {
    const { state, hass } = makeHass();
    const card = await mount(hass);
    card.remove();
    await flush();

    const repaints = watchRepaints(card);
    state.handler?.();
    await flush();

    expect(repaints).not.toHaveBeenCalled();
  });

  it('repaints again once the card is put back', async () => {
    const { state, hass } = makeHass();
    const card = await mount(hass);

    card.remove();
    await flush();
    document.body.appendChild(card);
    await card.updateComplete;
    await flush();

    const repaints = watchRepaints(card);
    state.handler!();
    await flush();

    expect(repaints).toHaveBeenCalledTimes(1);
  });

  it('repaints again after a reconnect that changes no reactive property', async () => {
    // 🚨 The case the old code got wrong, and the reason `connectedCallback` may not lean
    // on `updateEvents()`: with no entities that method returns before touching
    // `isLoading`, so Lit requests no update and `updated()` never runs. The card came back
    // deregistered and stayed that way until something unrelated moved.
    const { state, hass } = makeHass();
    const card = await mount(hass, { accent_color: 'home-assistant', entities: [] });

    card.remove();
    await flush();
    document.body.appendChild(card);
    await card.updateComplete;
    await flush();

    const repaints = watchRepaints(card);
    state.handler!();
    await flush();

    expect(repaints).toHaveBeenCalledTimes(1);
  });

  it('stops repainting a card whose config no longer asks for registry colors', async () => {
    const { state, hass } = makeHass();
    const card = await mount(hass);

    card.setConfig(buildConfig({ accent_color: '#ff0000' }) as Types.Config);
    await card.updateComplete;
    await flush();

    const repaints = watchRepaints(card);
    state.handler?.();
    await flush();

    expect(repaints).not.toHaveBeenCalled();
  });
});

describe('registry colors: the last card out closes the subscription', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    EntityColors.resetEntityColors();
    vi.restoreAllMocks();
  });

  it('closes it when the only card leaves', async () => {
    const { state, hass } = makeHass();
    const card = await mount(hass);
    expect(state.handler).toBeTypeOf('function');

    card.remove();
    await flush();

    expect(state.handler).toBeUndefined();
  });

  it('keeps it open while a second card is still listening', async () => {
    // The reference count is the whole point: a per-card teardown would cut the surviving
    // card off from the registry the moment its neighbour was removed.
    const { state, hass } = makeHass();
    const first = await mount(hass);
    const second = await mount(hass);

    first.remove();
    await flush();

    expect(state.handler).toBeTypeOf('function');

    const repaints = watchRepaints(second);
    state.handler!();
    await flush();
    expect(repaints).toHaveBeenCalledTimes(1);

    second.remove();
    await flush();
    expect(state.handler).toBeUndefined();
  });

  it('refetches rather than freezing when a later card arrives', async () => {
    // 🚨 Tearing the subscription down without clearing `loaded` would be a regression
    // rather than a fix: the registry can move while nobody is watching, and the
    // subscription that outlived every card was accidentally the thing keeping `colors`
    // current.
    const { state, hass } = makeHass('red');
    const first = await mount(hass);
    await flush();

    expect(EntityColors.entityColors().get('calendar.personal')).toBe('var(--red-color)');
    const fetchesWhileWatched = state.fetches;

    first.remove();
    await flush();

    // Home Assistant repaints the calendar with nobody subscribed to hear about it.
    state.color = 'blue';

    await mount(hass);
    await flush();

    expect(state.fetches).toBeGreaterThan(fetchesWhileWatched);
    expect(EntityColors.entityColors().get('calendar.personal')).toBe('var(--blue-color)');
  });

  it('closes a subscription that arrives after the card that asked for it', async () => {
    // 🚨 `subscribeEvents` is a websocket round-trip, so a card mounted and removed inside
    // that window — a dashboard edit, a view switch — tears down a placeholder that cannot
    // close a subscription which does not exist yet. Without the generation guard the real
    // unsubscriber is then stored *after* teardown, leaving a live subscription with no
    // listeners: the very leak this teardown exists to prevent, reached by a race instead.
    //
    // Nothing else in this file can see it. The mutation survived a sweep of the other
    // three until this case was written, because every other fixture resolves the
    // handshake in one microtask.
    const conn = makeHass();
    conn.hold();

    const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
    card.setConfig(buildConfig({ accent_color: 'home-assistant' }) as Types.Config);
    card.hass = conn.hass;
    card.isInitialLoad = false;
    document.body.appendChild(card);
    await card.updateComplete;

    // The card is gone before Home Assistant ever answers.
    card.remove();
    await flush();

    conn.release();
    await flush();

    expect(conn.state.handler).toBeUndefined();
  });

  it('closes it when a card is removed with an update still in flight', async () => {
    // 🚨 Lit does not cancel an update scheduled before an element leaves the document, so
    // `updated()` — and with it `_syncEntityColors` — runs for a card that is already
    // detached. Re-acquiring there puts a detached card back in the listener set and
    // reopens the subscription `disconnectedCallback` had just closed, and nothing
    // releases it a second time because that card's `disconnectedCallback` has run.
    //
    // The teardown cases above all remove a card with nothing pending, which is why they
    // could not see it. `isConnected` in `_syncEntityColors` is what this pins; without it
    // the assertion below finds a live handler.
    //
    // It also masked a mutant: with the detached card re-subscribing, a later `subscribe()`
    // supplied the generation bump that `teardown()` is supposed to, so deleting that bump
    // left this file green. It fails now.
    const { state, hass } = makeHass();
    const card = await mount(hass);
    expect(state.handler).toBeTypeOf('function');

    // A hass change schedules an update; the card leaves before it flushes.
    card.hass = { ...hass } as Types.Hass;
    card.remove();
    await flush();
    await flush();

    expect(state.handler).toBeUndefined();
  });
});

describe('registry colors: one subscription, one fetch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    EntityColors.resetEntityColors();
    vi.restoreAllMocks();
  });

  it('opens one subscription however many cards and updates there are', async () => {
    // The guard `subscribe()` opens with claims to do this — "two cards connecting in the
    // same tick cannot both pass the guard above and open a second subscription" — and
    // nothing measured it. `handler` cannot: a second `subscribeEvents` overwrites it with
    // a function indistinguishable from the first, so two subscriptions read exactly like
    // one. Counting handshakes is the only observable that separates them.
    const { state, hass } = makeHass();
    const first = await mount(hass);
    await mount(hass);

    first.hass = { ...hass } as Types.Hass;
    await first.updateComplete;
    await flush();

    expect(state.subscribes).toBe(1);
  });

  it('reads the registry once for two cards mounted together', async () => {
    // `inFlight` is the half of the guard that a second card racing the first depends on:
    // `loaded` is still false while the first fetch is in the air, so without it every
    // card on the dashboard re-reads the whole entity registry on load.
    const { state, hass } = makeHass();
    await mount(hass);
    await mount(hass);
    await flush();

    expect(state.fetches).toBe(1);
  });

  it('recovers when the handshake is refused', async () => {
    // The rejection path was reached by nothing at all. It matters because `subscribe()`
    // claims the slot with a placeholder *before* awaiting: if a refused handshake left
    // that placeholder in place, the `if (unsubscribe)` guard would block every later
    // attempt for the life of the page, and colors would silently stop updating.
    //
    // 🚨 The card must stay mounted for this to test anything. Removing it and mounting a
    // second one recovers either way, because `teardown()` clears the slot on the way out
    // — the first version of this test did that and passed with the whole `.catch` body
    // deleted. With one card still listening there is no teardown, so `.catch` is the only
    // thing that can free the slot.
    const { state, hass } = makeHass();
    state.reject = true;

    const card = await mount(hass);
    await flush();
    expect(state.handler).toBeUndefined();

    const attemptsWhileRefused = state.subscribes;
    expect(attemptsWhileRefused).toBeGreaterThan(0);

    // Home Assistant answers this time, and the same card gets through on its next update.
    state.reject = false;
    card.hass = { ...hass } as Types.Hass;
    await card.updateComplete;
    await flush();

    // A retry happened at all — with the slot still claimed, `subscribe()` returns at its
    // guard and this number never moves.
    expect(state.subscribes).toBeGreaterThan(attemptsWhileRefused);
    expect(state.handler).toBeTypeOf('function');
  });
});
