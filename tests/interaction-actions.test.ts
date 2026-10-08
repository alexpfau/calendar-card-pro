/**
 * `handleAction` had no test of its own, and coverage read as 0% for the whole module.
 *
 * Not a gap in the fixtures: the one file that exercises tap and hold —
 * `tests/host-interaction.test.ts` — does `vi.mock('../src/interaction/actions')`, because
 * what it is pinning is the *host's* pointer handling and it wants to assert which label
 * reached the handler. That is the right call there, and its consequence is that the real
 * dispatch has never run in a test. Nothing verified that the card emits `hass-action` at
 * all, that the event crosses a shadow boundary, or that the entity Home Assistant needs
 * for `more-info` is the one attached.
 *
 * So this file imports the module directly and asserts what leaves the element, rather
 * than that the module was called.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { handleAction } from '../src/interaction/actions';

/** A config differing from the default only in the fields named. */
function config(overrides: Partial<Types.Config>): Types.Config {
  return {
    ...Config.DEFAULT_CONFIG,
    entities: ['calendar.personal'],
    ...overrides,
  } as Types.Config;
}

/** Captured `hass-action` events, and the node they were dispatched from. */
function listeningNode(): { node: HTMLElement; events: Event[] } {
  const node = document.createElement('div');
  const events: Event[] = [];

  node.addEventListener('hass-action', (event) => events.push(event));
  document.body.appendChild(node);

  return { node, events };
}

/** The `detail` Home Assistant reads off the event. */
function detailOf(event: Event): { config: { entity?: string }; action: string } {
  return (event as unknown as { detail: { config: { entity?: string }; action: string } }).detail;
}

describe('handleAction delegates to Home Assistant', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches hass-action for a tap', () => {
    const { node, events } = listeningNode();

    handleAction(node, config({ tap_action: { action: 'more-info' } }), 'tap');

    expect(events).toHaveLength(1);
    expect(detailOf(events[0]).action).toBe('tap');
  });

  it('dispatches hass-action for a hold', () => {
    const { node, events } = listeningNode();

    handleAction(node, config({ hold_action: { action: 'more-info' } }), 'hold');

    expect(events).toHaveLength(1);
    expect(detailOf(events[0]).action).toBe('hold');
  });

  it('reads the label rather than defaulting to tap', () => {
    // The two assertions above pass individually even if the label is hard-coded, since
    // each only ever sees its own. Both actions are configured here and only the label
    // varies, so a fixed value fails one of the two.
    const both = config({
      tap_action: { action: 'more-info' },
      hold_action: { action: 'navigate', navigation_path: '/lovelace/0' },
    });
    const { node, events } = listeningNode();

    handleAction(node, both, 'tap');
    handleAction(node, both, 'hold');

    expect(events.map((event) => detailOf(event).action)).toEqual(['tap', 'hold']);
  });

  it('crosses the shadow boundary', () => {
    // The card dispatches from inside its own shadow root, so an event that does not
    // compose never reaches the Home Assistant handler listening further up. Both flags
    // are load-bearing and neither is observable from the assertions above.
    const { node, events } = listeningNode();

    handleAction(node, config({ tap_action: { action: 'more-info' } }), 'tap');

    expect(events[0].bubbles).toBe(true);
    expect(events[0].composed).toBe(true);
  });

  it('hands over both action configs, since Home Assistant chooses by label', () => {
    const both = config({
      tap_action: { action: 'more-info' },
      hold_action: { action: 'navigate', navigation_path: '/lovelace/0' },
    });
    const { node, events } = listeningNode();

    handleAction(node, both, 'hold');

    expect(detailOf(events[0]).config).toMatchObject({
      tap_action: { action: 'more-info' },
      hold_action: { action: 'navigate', navigation_path: '/lovelace/0' },
    });
  });
});

describe('handleAction resolves the entity more-info needs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('takes the first entity when it is a plain string', () => {
    const { node, events } = listeningNode();

    handleAction(
      node,
      config({
        entities: ['calendar.first', 'calendar.second'],
        tap_action: { action: 'more-info' },
      }),
      'tap',
    );

    expect(detailOf(events[0]).config.entity).toBe('calendar.first');
  });

  it('takes the first entity when it is an object', () => {
    const { node, events } = listeningNode();

    handleAction(
      node,
      config({
        entities: [{ entity: 'calendar.configured', color: '#fff' }, 'calendar.second'],
        tap_action: { action: 'more-info' },
      }),
      'tap',
    );

    expect(detailOf(events[0]).config.entity).toBe('calendar.configured');
  });

  it('still dispatches with no entity when none is configured', () => {
    // `more-info` needs an entity, but a card with an empty `entities` list is a
    // configuration the editor can produce mid-edit. Swallowing the action here would
    // make the card silently unresponsive rather than letting Home Assistant report it.
    const { node, events } = listeningNode();

    handleAction(node, config({ entities: [], tap_action: { action: 'more-info' } }), 'tap');

    expect(events).toHaveLength(1);
    expect(detailOf(events[0]).config.entity).toBeUndefined();
  });
});

describe('handleAction keeps expand to itself', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('runs the callback and dispatches nothing', () => {
    // `expand` is the card's own action and has no Home Assistant equivalent, so
    // delegating it would reach a handler that does not know the name.
    const expand = vi.fn();
    const { node, events } = listeningNode();

    handleAction(node, config({ tap_action: { action: 'expand' } }), 'tap', expand);

    expect(expand).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });

  it('does not delegate when no callback was supplied', () => {
    const { node, events } = listeningNode();

    handleAction(node, config({ tap_action: { action: 'expand' } }), 'tap');

    expect(events).toHaveLength(0);
  });

  it('does not run the callback for any other action', () => {
    // The control for the pair above: the callback is passed on every real call site in
    // `calendar-card-pro.ts`, so it has to be the action that selects it, not its presence.
    const expand = vi.fn();
    const { node, events } = listeningNode();

    handleAction(node, config({ tap_action: { action: 'more-info' } }), 'tap', expand);

    expect(expand).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });
});

describe('handleAction with nothing configured', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does nothing when the action for that label is absent', () => {
    // `tap_action` and `hold_action` are required by the type, but the config arriving at
    // `setConfig` is untyped YAML and a user can write `hold_action:` with no body.
    const missing = { ...config({}), hold_action: undefined } as unknown as Types.Config;
    const expand = vi.fn();
    const { node, events } = listeningNode();

    handleAction(node, missing, 'hold', expand);

    expect(events).toHaveLength(0);
    expect(expand).not.toHaveBeenCalled();
  });

  it('does nothing when the action is explicitly none', () => {
    // Card defaults and the documented disable form are both `{ action: 'none' }`. Without
    // this guard, every default-config tap still dispatched `hass-action`.
    const { node, events } = listeningNode();
    const expand = vi.fn();

    handleAction(node, config({ tap_action: { action: 'none' } }), 'tap', expand);
    handleAction(node, config({ hold_action: { action: 'none' } }), 'hold', expand);

    expect(events).toHaveLength(0);
    expect(expand).not.toHaveBeenCalled();
  });

  it('still acts on the label that is present', () => {
    // The control: the early return must be selected by the missing half, not by the
    // config being unusual.
    const missing = { ...config({ tap_action: { action: 'more-info' } }), hold_action: undefined };
    const { node, events } = listeningNode();

    handleAction(node, missing as unknown as Types.Config, 'tap');

    expect(events).toHaveLength(1);
  });
});
