/**
 * The tap and hold dropdowns offer the card's own `expand` action, and name it.
 *
 * `expand` has been honored by `handleAction` since v3, but the v4 editor rebuild replaced
 * a hand-written dropdown with Home Assistant's `ui_action` selector, whose option list is
 * `this.actions ?? DEFAULT_ACTIONS` — a replacement, not a merge. With no list supplied,
 * HA offered its own seven actions and `expand` simply vanished from the UI while YAML
 * kept working. It shipped that way in v4.0.0, v4.1.0 and v4.2.0.
 *
 * Two things are pinned, and they fail in ways the other cannot see.
 *
 * The **option list is pinned by value**, not walked. A test that iterates the list it is
 * checking cannot notice an entry leaving it: drop one and the loop runs one fewer time,
 * every assertion still passes, and the option is gone from the editor with its string and
 * translations left behind. That is the exact failure this repository has paid for
 * repeatedly, so the whole array is compared at once and both directions fail — a dropped
 * action and an unexplained new one.
 *
 * The **label** is separate because a listed action with no name is still broken. HA builds
 * each option's label from its own string table, so an action it has never heard of renders
 * as the raw lowercase key. `withCardActionLabels` is the seam that fixes that, and what
 * matters about it is not only that it answers — it must delegate everything else
 * untouched, and return a stable object, because every form downstream gates work on
 * `changedProperties.has('hass')`.
 */

import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import {
  HA_ACTION_LABEL_PREFIX,
  withCardActionLabels,
} from '../src/rendering/editor/hass-localize';
import { walkSchema } from '../src/rendering/editor/panels';
import {
  ACTION_OPTIONS,
  CARD_ACTIONS,
  EVENT_ACTIONS,
  EVENT_ACTION_OPTIONS,
  buildActionsSchema,
  cardActionLabelKey,
} from '../src/rendering/editor/schemas/actions';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { eventOpensDetails } from '../src/rendering/editor/synthetic';

customElements.define('editor-card-actions-probe', CalendarCardProEditor);

/** The exact list both dropdowns offer, card actions first. */
const EXPECTED_ACTIONS = [
  'expand',
  'refresh',
  'add-event',
  'reset',
  'back',
  'more-info',
  'toggle',
  'navigate',
  'url',
  'perform-action',
  'assist',
  'none',
];

/**
 * The exact list the event tap and hold dropdowns offer: the event's own `details` first, then
 * Home Assistant's actions without `toggle`, since a calendar cannot be toggled. The card's own
 * actions are nothing on an event, so they are not offered.
 */
const EXPECTED_EVENT_ACTIONS = [
  'details',
  'more-info',
  'navigate',
  'url',
  'perform-action',
  'assist',
  'none',
];

/**
 * Minimal `hass` with a localize that reports what it was asked.
 *
 * @param asked - Collects every key delegated through to Home Assistant
 * @returns A `hass` stub carrying only what the wrapper touches
 */
function hassStub(asked: string[] = []): Types.Hass {
  return {
    states: {},
    callApi: async () => undefined,
    callService: () => undefined,
    localize: (key: string) => {
      asked.push(key);
      return `HA:${key}`;
    },
  } as unknown as Types.Hass;
}

describe('card action options', () => {
  it('offers exactly the documented action list, in order', () => {
    // Pinned by value. A walk over ACTION_OPTIONS would agree with a list that had
    // silently lost `expand`, which is the whole defect this test exists for.
    expect([...ACTION_OPTIONS]).toEqual(EXPECTED_ACTIONS);
  });

  it('names expand, refresh, add-event, reset and back as card actions rather than Home Assistant ones', () => {
    expect([...CARD_ACTIONS]).toEqual(['expand', 'refresh', 'add-event', 'reset', 'back']);
  });

  it('puts the card actions ahead of Home Assistant’s, so they are not buried', () => {
    expect(ACTION_OPTIONS.indexOf('expand')).toBe(0);
    expect(ACTION_OPTIONS.indexOf('refresh')).toBe(1);
    expect(ACTION_OPTIONS.indexOf('add-event')).toBe(2);
    expect(ACTION_OPTIONS.indexOf('reset')).toBe(3);
    expect(ACTION_OPTIONS.indexOf('back')).toBe(4);
  });

  it('gives the card and event dropdowns their lists, through a ui_action selector', () => {
    const schema = buildActionsSchema({
      view: 'list',
      config: { ...Config.DEFAULT_CONFIG },
      language: 'en',
    });
    const rows = schema.filter(
      (node): node is Extract<typeof node, { selector: unknown }> =>
        'selector' in node && node.name !== undefined,
    );
    const actionRows = rows.filter((node) => 'ui_action' in (node.selector as object));

    expect(actionRows.map((node) => node.name)).toEqual([
      'tap_action',
      'hold_action',
      'event_tap_action',
      'event_hold_action',
    ]);
    const offered = (name: string) => {
      const node = actionRows.find((row) => row.name === name)!;
      const selector = node.selector as { ui_action: { actions?: ReadonlyArray<string> } };
      return [...(selector.ui_action.actions ?? [])];
    };
    expect(offered('tap_action')).toEqual(EXPECTED_ACTIONS);
    expect(offered('hold_action')).toEqual(EXPECTED_ACTIONS);
    expect(offered('event_tap_action')).toEqual(EXPECTED_EVENT_ACTIONS);
    expect(offered('event_hold_action')).toEqual(EXPECTED_EVENT_ACTIONS);
    expect([...EVENT_ACTION_OPTIONS]).toEqual(EXPECTED_EVENT_ACTIONS);
  });

  it('defines an English label for every card action', () => {
    // Reconciled against CARD_ACTIONS rather than listed again, so a second card action
    // added later is covered without anyone remembering this file.
    for (const action of [...CARD_ACTIONS, ...EVENT_ACTIONS]) {
      expect(EDITOR_STRINGS[cardActionLabelKey(action)]).toBeTruthy();
    }
    expect([...EVENT_ACTIONS]).toEqual(['details']);
    expect(EDITOR_STRINGS[cardActionLabelKey('details')]).toBe('Show Event Details');
    expect(EDITOR_STRINGS[cardActionLabelKey('expand')]).toBe('Toggle Compact/Expanded View');
    expect(EDITOR_STRINGS[cardActionLabelKey('refresh')]).toBe('Refresh Events');
    expect(EDITOR_STRINGS[cardActionLabelKey('reset')]).toBe('Reset Card');
    expect(EDITOR_STRINGS[cardActionLabelKey('back')]).toBe('Go Back');
  });
});

describe('withCardActionLabels', () => {
  it('answers Home Assistant’s action-label key for a card action', () => {
    const wrappedHass = withCardActionLabels(hassStub(), 'en');
    expect(wrappedHass?.localize?.(`${HA_ACTION_LABEL_PREFIX}expand`)).toBe(
      'Toggle Compact/Expanded View',
    );
  });

  it('delegates every other key untouched', () => {
    const asked: string[] = [];
    const wrappedHass = withCardActionLabels(hassStub(asked), 'en');

    expect(wrappedHass?.localize?.(`${HA_ACTION_LABEL_PREFIX}navigate`)).toBe(
      `HA:${HA_ACTION_LABEL_PREFIX}navigate`,
    );
    expect(wrappedHass?.localize?.('ui.something.else')).toBe('HA:ui.something.else');
    // The card key must never reach Home Assistant; everything else must.
    expect(asked).toEqual([`${HA_ACTION_LABEL_PREFIX}navigate`, 'ui.something.else']);
  });

  it('translates the label when the language has one', () => {
    // `de` carries this key, so the German dropdown must show German. Asserting merely
    // "not empty" would pass on the English fallback, which is the failure worth catching:
    // a translation file that lost the key still renders a perfectly plausible label.
    const german = withCardActionLabels(hassStub(), 'de');
    expect(german?.localize?.(`${HA_ACTION_LABEL_PREFIX}expand`)).toBe(
      'Kompakte/Erweiterte Ansicht umschalten',
    );

    // A language with no editor translations at all falls back to English, not to the
    // raw key, and never reaches Home Assistant.
    const czech = withCardActionLabels(hassStub(), 'cs');
    expect(czech?.localize?.(`${HA_ACTION_LABEL_PREFIX}expand`)).toBe(
      'Toggle Compact/Expanded View',
    );
  });

  it('names back in the editor language, as the word its back buttons carry', () => {
    expect(
      withCardActionLabels(hassStub(), 'en')?.localize?.(`${HA_ACTION_LABEL_PREFIX}back`),
    ).toBe('Go Back');
    expect(
      withCardActionLabels(hassStub(), 'de')?.localize?.(`${HA_ACTION_LABEL_PREFIX}back`),
    ).toBe('Zurück');
  });

  it('returns a stable object for one hass and language', () => {
    // A fresh object per render would make every form downstream update on every
    // unrelated state change, because they all gate on changedProperties.has('hass').
    const base = hassStub();
    expect(withCardActionLabels(base, 'en')).toBe(withCardActionLabels(base, 'en'));
    expect(withCardActionLabels(base, 'de')).not.toBe(withCardActionLabels(base, 'en'));
    expect(withCardActionLabels(hassStub(), 'en')).not.toBe(withCardActionLabels(base, 'en'));
  });

  it('hands back the original when there is nothing to answer with', () => {
    expect(withCardActionLabels(undefined, 'en')).toBeUndefined();

    // A hass with no localize has nothing to delegate to, so wrapping it would replace
    // Home Assistant's own raw-key fallback with a broken call.
    const bare = { states: {} } as unknown as Types.Hass;
    expect(withCardActionLabels(bare, 'en')).toBe(bare);
  });
});

/**
 * The wrapper existing is not the wrapper being used.
 *
 * Every assertion above would pass with `element.ts` still handing `<ha-form>` the raw
 * `hass`, which is the whole fix silently doing nothing. This mounts the real editor and
 * asks the form what it was actually given — the one question the unit tests above cannot
 * answer.
 */
describe('editor wiring', () => {
  it('gives its forms a hass that can name the card’s actions', async () => {
    document.body.innerHTML = '';
    const element = document.createElement('editor-card-actions-probe') as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
      readonly updateComplete: Promise<unknown>;
    };
    const asked: string[] = [];
    element.hass = {
      states: {},
      locale: { language: 'en' },
      localize: (key: string) => {
        asked.push(key);
        return `HA:${key}`;
      },
    };
    document.body.appendChild(element);
    element.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    await element.updateComplete;

    const forms = Array.from(element.shadowRoot!.querySelectorAll('ha-form'));
    expect(forms.length).toBeGreaterThan(0);

    for (const form of forms) {
      const formHass = (form as unknown as { hass?: Types.Hass }).hass;
      expect(formHass?.localize?.(`${HA_ACTION_LABEL_PREFIX}expand`)).toBe(
        'Toggle Compact/Expanded View',
      );
      // Still Home Assistant's own table for everything else.
      expect(formHass?.localize?.('ui.common.save')).toBe('HA:ui.common.save');
    }

    expect(asked).not.toContain(`${HA_ACTION_LABEL_PREFIX}expand`);
  });
});

/**
 * The event's own action, named in Home Assistant's dropdown.
 *
 * `details` is an action Home Assistant has never heard of, so without the wrapper it renders
 * as the raw lowercase key among Navigate and URL. Pinned in English and German, so a
 * translation that lost the key fails rather than falling back to English unseen.
 */
describe('the event action dropdowns', () => {
  it('names details in the editor language', () => {
    expect(
      withCardActionLabels(hassStub(), 'en')?.localize?.(`${HA_ACTION_LABEL_PREFIX}details`),
    ).toBe('Show Event Details');
    expect(
      withCardActionLabels(hassStub(), 'de')?.localize?.(`${HA_ACTION_LABEL_PREFIX}details`),
    ).toBe('Termindetails anzeigen');
  });

  it.each([
    ['no event action', false, {}],
    ['a tap that shows details', true, { event_tap_action: { action: 'details' } }],
    ['a hold that shows details', true, { event_hold_action: { action: 'details' } }],
    ['none', false, { event_tap_action: { action: 'none' } }],
    ["one of Home Assistant's actions", false, { event_tap_action: { action: 'url' } }],
    ['a bare key', false, { event_tap_action: null }],
  ])('reads %s as opening details: %s', (_name, opens, config) => {
    const merged = { ...Config.DEFAULT_CONFIG, ...config } as unknown as Types.Config;
    expect(eventOpensDetails(merged)).toBe(opens);
  });
});

/**
 * The event tap action and the event dialog's two switches, driven through the rendered
 * editor.
 *
 * The schema tests above and in `editor-schema.test.ts` prove the builder branches; these
 * prove the editor rebuilds the panel when the dropdown changes, and that what it reports to
 * Home Assistant is the minimal configuration — `ha-form` hands back every field it shows,
 * so a switch left at its default must still write nothing.
 */
describe('the event tap action in the editor', () => {
  type EditorHost = HTMLElement & {
    hass: unknown;
    setConfig(config: unknown): void;
    readonly updateComplete: Promise<unknown>;
  };

  async function mount(config: Record<string, unknown>) {
    document.body.innerHTML = '';
    const element = document.createElement('editor-card-actions-probe') as EditorHost;
    element.hass = { states: {}, locale: { language: 'en' } };
    document.body.appendChild(element);
    element.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      ...config,
    });
    await element.updateComplete;

    const reported: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      const next = { ...((event as CustomEvent).detail.config as Record<string, unknown>) };
      delete next.config_version;
      reported.push(next);
    });

    const forms = () => Array.from(element.shadowRoot!.querySelectorAll('ha-form.panel-form'));
    const names = (form: Element) =>
      [...walkSchema((form as unknown as { schema: HaFormSchema[] }).schema)].map(
        ({ node }) => node.name,
      );
    const owner = (option: string) => forms().find((form) => names(form).includes(option));
    const shown = (option: string) =>
      (owner(option) as unknown as { data: Record<string, unknown> } | undefined)?.data[option];

    /** Fires the whole-object change `ha-form` emits, from the form owning `option`. */
    const change = async (option: string, value: unknown) => {
      const form = owner(option);
      if (!form) throw new Error(`no rendered form offers ${option}`);
      const data = (form as unknown as { data: Record<string, unknown> }).data;
      form.dispatchEvent(
        new CustomEvent('value-changed', { detail: { value: { ...data, [option]: value } } }),
      );
      await element.updateComplete;
    };

    return { reported, owner, names, shown, change };
  }

  const last = (reported: ReadonlyArray<Record<string, unknown>>) => reported[reported.length - 1];

  it('stores Show Event Details as the details action, and reveals the switches', async () => {
    const { reported, owner, shown, change } = await mount({});

    expect(shown('event_tap_action')).toEqual({ action: 'none' });
    expect(owner('allow_event_edit')).toBeUndefined();
    expect(owner('allow_event_delete')).toBeUndefined();

    await change('event_tap_action', { action: 'details' });

    // Both under the same form as the dropdown, and nothing but the action written.
    expect(owner('allow_event_edit')).toBe(owner('event_tap_action'));
    expect(owner('allow_event_delete')).toBe(owner('event_tap_action'));
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      event_tap_action: { action: 'details' },
    });
  });

  it('stores Nothing as no key at all, and hides the switches again', async () => {
    const { reported, owner, shown, change } = await mount({
      event_tap_action: { action: 'details' },
    });
    expect(shown('event_tap_action')).toEqual({ action: 'details' });
    expect(owner('allow_event_edit')).toBeDefined();

    await change('event_tap_action', { action: 'none' });

    expect(last(reported)).toEqual({ entities: ['calendar.anna'] });
    expect(owner('allow_event_edit')).toBeUndefined();
    expect(owner('allow_event_delete')).toBeUndefined();
  });

  it("shows one of Home Assistant's actions as stored, without the switches, and keeps its fields", async () => {
    const urlAction = { action: 'url', url_path: 'https://example.com/search?q={title}' };
    const { reported, owner, shown, change } = await mount({
      event_tap_action: { action: 'more-info', entity: 'calendar.ben' },
    });
    expect(shown('event_tap_action')).toEqual({ action: 'more-info', entity: 'calendar.ben' });
    expect(owner('allow_event_edit')).toBeUndefined();

    // A field name in braces is the user's text and is stored as written.
    await change('event_tap_action', urlAction);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], event_tap_action: urlAction });
    expect(owner('allow_event_edit')).toBeUndefined();

    await change('event_tap_action', { action: 'details' });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      event_tap_action: { action: 'details' },
    });
  });

  it.each(['allow_event_edit', 'allow_event_delete'])(
    'stores %s only while it is off, its non-default value',
    async (option) => {
      const { reported, change } = await mount({ event_tap_action: { action: 'details' } });

      await change(option, false);
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        event_tap_action: { action: 'details' },
        [option]: false,
      });

      await change(option, true);
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        event_tap_action: { action: 'details' },
      });
    },
  );

  it('offers the toolbar switch beside the title, and its controls only while it is on', async () => {
    const { reported, owner, names, shown, change } = await mount({});

    const card = owner('toolbar');
    expect(card).toBeDefined();
    expect(names(card!)).toContain('title');
    expect(names(card!)).not.toContain('tap_action');
    expect(names(card!)).not.toContain('add_event');
    expect(shown('toolbar')).toEqual({
      show: false,
      navigation: true,
      view_switcher: true,
      reset: false,
      add_event: true,
      refresh: true,
      search: false,
      legend: 'menu',
      buttons: [],
    });

    // Every control but reset and search arrives switched on, as the card reads them, the
    // filter as a menu, and nothing but the switch is written.
    await change('toolbar', { ...(shown('toolbar') as object), show: true });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });
    expect(names(owner('toolbar')!)).toEqual(
      expect.arrayContaining([
        'show',
        'navigation',
        'view_switcher',
        'reset',
        'refresh',
        'search',
        'add_event',
        'legend',
      ]),
    );
    expect(shown('toolbar')).toEqual({
      show: true,
      navigation: true,
      view_switcher: true,
      reset: false,
      add_event: true,
      refresh: true,
      search: false,
      legend: 'menu',
      buttons: [],
    });

    // The one control off by default reads back on once it is switched on: one flip.
    await change('toolbar', { ...(shown('toolbar') as object), reset: true });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, reset: true },
    });
    expect((shown('toolbar') as Record<string, unknown>).reset).toBe(true);
    await change('toolbar', { ...(shown('toolbar') as object), reset: false });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    // Search, off by default as a control added after v5, likewise.
    await change('toolbar', { ...(shown('toolbar') as object), search: true });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, search: true },
    });
    expect((shown('toolbar') as Record<string, unknown>).search).toBe(true);
    await change('toolbar', { ...(shown('toolbar') as object), search: false });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    // And one on by default is written only once switched off.
    await change('toolbar', { ...(shown('toolbar') as object), refresh: false });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, refresh: false },
    });
    await change('toolbar', { ...(shown('toolbar') as object), refresh: true });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    // The filter's dropdown holds strings, so it says `off` where the configuration says
    // `false`: written as `false`, never as the word, and shown as the word again.
    await change('toolbar', { ...(shown('toolbar') as object), legend: 'off' });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, legend: false },
    });
    expect((shown('toolbar') as Record<string, unknown>).legend).toBe('off');
    await change('toolbar', { ...(shown('toolbar') as object), legend: 'chips' });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, legend: 'chips' },
    });
    expect((shown('toolbar') as Record<string, unknown>).legend).toBe('chips');
    // The default, a menu, is not written.
    await change('toolbar', { ...(shown('toolbar') as object), legend: 'menu' });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    await change('toolbar', { ...(shown('toolbar') as object), add_event: false });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, add_event: false },
    });

    // Hiding the bar keeps the choices made for it.
    await change('toolbar', { ...(shown('toolbar') as object), show: false });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { add_event: false } });
    expect(names(owner('toolbar')!)).not.toContain('add_event');

    // One switch at a time, as the form allows: the button's switch is not drawn while the
    // toolbar is hidden, so it cannot change in the same event that shows it.
    await change('toolbar', { ...(shown('toolbar') as object), show: true });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, add_event: false },
    });
    await change('toolbar', { ...(shown('toolbar') as object), add_event: true });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });
  });

  it.each(['list', 'column', 'grid'])(
    'writes the toolbar at the top level while editing the %s layout',
    async (view) => {
      const { reported, shown, change } = await mount({ view });

      await change('toolbar', { ...(shown('toolbar') as object), show: true });
      // `view` stays as the YAML wrote it, even at its default `list`: the edit did not touch it.
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        view,
        toolbar: { show: true },
      });
    },
  );
});
