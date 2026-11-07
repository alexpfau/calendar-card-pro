/**
 * The card's `back` action.
 *
 * Two halves, pinned apart. The decision is pure (`interaction/back.ts`): where the page behind
 * is one Home Assistant navigated from, go back through the history; anywhere else, replace this
 * page with the action's `navigation_path`, else this dashboard's root. The card carries it out:
 * `history.back()`, or Home Assistant's own `navigate` action with `navigation_replace`, so the
 * card writes no history itself.
 *
 * The one assumption that can break without notice is Home Assistant's `history.state.from`,
 * which it stamps on every page it navigates to and documents nowhere. The case that matters is
 * the one where it is gone or renamed: `back` must then take the fallback, which stays on this
 * dashboard, and never the history, which could leave the app. That case is pinned here by name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { backStep, cameFromHomeAssistant, dashboardRoot } from '../src/interaction/back';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/** A page Home Assistant shows a dashboard view on, two levels deep as every view is. */
const VIEW_PATH = '/dashboard-admin/ccp-current-testing';

describe('what a press of back does', () => {
  it('goes back through the history where Home Assistant navigated here from a page of its own', () => {
    expect(backStep({ from: '/lovelace/0' }, VIEW_PATH)).toEqual({ kind: 'history' });
    // Even with a fallback of its own: the page behind wins, as on Home Assistant's own arrow.
    expect(backStep({ from: '/lovelace/0' }, VIEW_PATH, '/lovelace/home')).toEqual({
      kind: 'history',
    });
  });

  it("shows the action's navigation_path in place of this page where there is no page behind it", () => {
    expect(backStep(null, VIEW_PATH, '/lovelace/home')).toEqual({
      kind: 'replace',
      path: '/lovelace/home',
    });
    expect(backStep(null, VIEW_PATH, '  /lovelace/home  ')).toEqual({
      kind: 'replace',
      path: '/lovelace/home',
    });
  });

  it('shows the root of this dashboard where there is no page behind it and no path', () => {
    expect(backStep(null, VIEW_PATH)).toEqual({ kind: 'replace', path: '/dashboard-admin' });
  });

  it.each([
    ['a fresh tab or a bookmark, with no state at all', null],
    ['the state Home Assistant boots a fresh tab with', { root: true }],
    ['a state that is not an object', 'from'],
    ['an empty state', {}],
  ])('reads %s as no page behind this one', (_name, state) => {
    expect(cameFromHomeAssistant(state)).toBe(false);
    expect(backStep(state, VIEW_PATH)).toEqual({ kind: 'replace', path: '/dashboard-admin' });
  });

  it('takes the fallback, never the history, if Home Assistant renames the key it stamps', () => {
    // `from` is Home Assistant's own and undocumented. Renamed, every page reads as having
    // nothing behind it: `back` then stays on this dashboard rather than leaving the app.
    for (const state of [{ fromPath: '/lovelace/0' }, { previous: '/lovelace/0' }]) {
      expect(backStep(state, VIEW_PATH)).toEqual({ kind: 'replace', path: '/dashboard-admin' });
    }
    // The control: the key it stamps today is read as a page behind this one.
    expect(backStep({ from: '/lovelace/0' }, VIEW_PATH).kind).toBe('history');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['a number', 42],
    ['null', null],
  ])('ignores a navigation_path that is %s', (_name, path) => {
    expect(backStep(null, VIEW_PATH, path)).toEqual({ kind: 'replace', path: '/dashboard-admin' });
  });
});

describe("the root of a page's dashboard", () => {
  it.each([
    [VIEW_PATH, '/dashboard-admin'],
    ['/lovelace/0', '/lovelace'],
    ['/lovelace', '/lovelace'],
    ['/lovelace/', '/lovelace'],
    ['//lovelace/0', '/lovelace'],
    ['/', '/'],
    ['', '/'],
  ])('is %s → %s', (pathname, root) => {
    expect(dashboardRoot(pathname)).toBe(root);
  });
});

//-----------------------------------------------------------------------------
// ON THE CARD
//-----------------------------------------------------------------------------

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  handleAction(action: Types.ActionConfig): void;
  readonly config: Types.Config;
  readonly updateComplete: Promise<boolean>;
}

/** Let the load, and the renders after it, finish. */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config>,
  flag?: 'preview' | 'editMode',
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig({ entities: ['calendar.anna'], ...overrides }));
  if (flag) card[flag] = true;
  card.hass = {
    states: {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
    },
    locale: { language: 'en' },
    callApi: vi.fn(async () => []),
    localize: (key: string) => key,
  };
  document.body.appendChild(card);
  await settle(card);
  return card;
}

const haCard = (card: CardUnderTest): HTMLElement =>
  card.shadowRoot!.querySelector<HTMLElement>('ha-card')!;

/** A whole press by a mouse on the card's own space, which runs `tap_action` at pointer-up. */
function tapCard(card: CardUnderTest): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      isPrimary: { value: true },
      pointerType: { value: 'mouse' },
      clientX: { value: 0 },
      clientY: { value: 0 },
    });
    haCard(card).dispatchEvent(event);
  }
}

/** Every `hass-action` the card hands Home Assistant, as Home Assistant reads it. */
function listen(card: CardUnderTest): Array<{ config: Record<string, unknown>; action: string }> {
  const fired: Array<{ config: Record<string, unknown>; action: string }> = [];
  card.addEventListener('hass-action', (ev) =>
    fired.push((ev as unknown as { detail: (typeof fired)[number] }).detail),
  );
  return fired;
}

describe('back on the card', () => {
  let back: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', VIEW_PATH);
    back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('goes back through the history where Home Assistant navigated here', async () => {
    window.history.replaceState({ from: '/lovelace/0' }, '', VIEW_PATH);
    const card = await mount({ tap_action: { action: 'back' } });
    const fired = listen(card);

    tapCard(card);

    expect(back).toHaveBeenCalledTimes(1);
    expect(fired).toEqual([]);
  });

  it("has Home Assistant replace the page with this dashboard's root where nothing is behind it", async () => {
    const card = await mount({ tap_action: { action: 'back' } });
    const fired = listen(card);

    tapCard(card);

    expect(back).not.toHaveBeenCalled();
    expect(fired).toEqual([
      {
        config: {
          tap_action: {
            action: 'navigate',
            navigation_path: '/dashboard-admin',
            navigation_replace: true,
          },
        },
        action: 'tap',
      },
    ]);
  });

  it('goes to its own navigation_path instead, from a hold as from a tap', async () => {
    const card = await mount({
      hold_action: { action: 'back', navigation_path: '/lovelace/home' },
    });
    const fired = listen(card);

    card.handleAction(card.config.hold_action!);

    expect(back).not.toHaveBeenCalled();
    expect(fired).toHaveLength(1);
    expect(fired[0].config.tap_action).toEqual({
      action: 'navigate',
      navigation_path: '/lovelace/home',
      navigation_replace: true,
    });
  });

  it('is no action at all while the card is edited', async () => {
    window.history.replaceState({ from: '/lovelace/0' }, '', VIEW_PATH);
    const card = await mount({ tap_action: { action: 'back' } }, 'editMode');
    const fired = listen(card);

    // No tab stop or button role promises what a press would refuse.
    expect(haCard(card).hasAttribute('role')).toBe(false);
    expect(haCard(card).hasAttribute('tabindex')).toBe(false);

    tapCard(card);
    card.handleAction(card.config.tap_action!);

    expect(back).not.toHaveBeenCalled();
    expect(fired).toEqual([]);

    // The control: editing over, the same card is a button and goes back.
    card.editMode = false;
    await settle(card);
    expect(haCard(card).getAttribute('role')).toBe('button');
    tapCard(card);
    expect(back).toHaveBeenCalledTimes(1);
  });
});
