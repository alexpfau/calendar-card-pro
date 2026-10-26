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
import type { HaFormSchema, SelectorSchema } from '../src/rendering/editor/ha-form';
import {
  HA_ACTION_LABEL_PREFIX,
  withCardActionLabels,
} from '../src/rendering/editor/hass-localize';
import { walkSchema } from '../src/rendering/editor/panels';
import {
  ACTION_OPTIONS,
  CARD_ACTIONS,
  EVENT_TAP_CHOICES,
  buildActionsSchema,
  cardActionLabelKey,
} from '../src/rendering/editor/schemas/actions';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { SYNTHETIC_FIELDS } from '../src/rendering/editor/synthetic';

customElements.define('editor-card-actions-probe', CalendarCardProEditor);

/** The exact list both dropdowns offer, card actions first. */
const EXPECTED_ACTIONS = [
  'expand',
  'refresh',
  'more-info',
  'toggle',
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

  it('names expand and refresh as card actions rather than Home Assistant ones', () => {
    expect([...CARD_ACTIONS]).toEqual(['expand', 'refresh']);
  });

  it('puts the card actions ahead of Home Assistant’s, so they are not buried', () => {
    expect(ACTION_OPTIONS.indexOf('expand')).toBe(0);
    expect(ACTION_OPTIONS.indexOf('refresh')).toBe(1);
  });

  it('gives both dropdowns the same list, through a ui_action selector', () => {
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

    expect(actionRows.map((node) => node.name)).toEqual(['tap_action', 'hold_action']);
    for (const node of actionRows) {
      const selector = node.selector as { ui_action: { actions?: ReadonlyArray<string> } };
      expect([...(selector.ui_action.actions ?? [])]).toEqual(EXPECTED_ACTIONS);
    }
  });

  it('defines an English label for every card action', () => {
    // Reconciled against CARD_ACTIONS rather than listed again, so a second card action
    // added later is covered without anyone remembering this file.
    for (const action of CARD_ACTIONS) {
      expect(EDITOR_STRINGS[cardActionLabelKey(action)]).toBeTruthy();
    }
    expect(EDITOR_STRINGS[cardActionLabelKey('expand')]).toBe('Toggle Compact/Expanded View');
    expect(EDITOR_STRINGS[cardActionLabelKey('refresh')]).toBe('Refresh Events');
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
 * The event tap dropdown: two choices, Nothing and Show Event Details, and nothing else.
 *
 * Not Home Assistant's action selector. That offered all of Home Assistant's actions, none
 * of them about an event, and a "Default" entry that cleared the action and so showed as
 * Nothing straight after. Pinned by value, labels included, so a third choice, a lost one
 * or a label that falls back to a humanized value all fail here.
 */
describe('the event tap dropdown', () => {
  /** The dropdown as the panel builds it for a configuration and language. */
  function dropdown(config: Partial<Types.Config> = {}, language = 'en') {
    const schema = buildActionsSchema({
      view: 'list',
      config: { ...Config.DEFAULT_CONFIG, ...config } as Types.Config,
      language,
    });
    const nodes = [...walkSchema(schema)].map(({ node }) => node);
    const field = nodes.find((node) => node.name === 'event_tap_action_mode') as
      SelectorSchema | undefined;
    return { nodes, field };
  }

  it('offers exactly Nothing and Show Event Details, Nothing first', () => {
    expect([...EVENT_TAP_CHOICES]).toEqual(['none', 'details']);
    expect(dropdown().field?.selector).toEqual({
      select: {
        mode: 'dropdown',
        options: [
          { value: 'none', label: 'Nothing' },
          { value: 'details', label: 'Show Event Details' },
        ],
      },
    });
  });

  it('names both choices in the editor language', () => {
    expect(dropdown({}, 'de').field?.selector).toEqual({
      select: {
        mode: 'dropdown',
        options: [
          { value: 'none', label: 'Nichts' },
          { value: 'details', label: 'Termindetails anzeigen' },
        ],
      },
    });
  });

  it("leaves Home Assistant's action selector to the card's own tap and hold", () => {
    // The event tap is not one of them, so it offers no Default entry and none of Home
    // Assistant's actions, whatever the configuration holds.
    for (const config of [{}, { event_tap_action: { action: 'more-info' } }]) {
      const { nodes } = dropdown(config);
      const uiActions = nodes.filter(
        (node) => 'selector' in node && 'ui_action' in (node.selector as object),
      );
      expect(uiActions.map((node) => node.name)).toEqual(['tap_action', 'hold_action']);
      expect(nodes.map((node) => node.name)).not.toContain('event_tap_action');
    }
  });

  it.each([
    ['no event tap action', 'none', {}],
    ['details', 'details', { event_tap_action: { action: 'details' } }],
    ['none', 'none', { event_tap_action: { action: 'none' } }],
    ["one of Home Assistant's actions", 'none', { event_tap_action: { action: 'more-info' } }],
    ['expand', 'none', { event_tap_action: { action: 'expand' } }],
    ['a bare key', 'none', { event_tap_action: null }],
  ])('shows %s as %s', (_name, shown, config) => {
    const merged = { ...Config.DEFAULT_CONFIG, ...config } as unknown as Types.Config;
    expect(SYNTHETIC_FIELDS.event_tap_action_mode.derive(merged)).toBe(shown);
  });

  it('stores details whole and Nothing as no key at all, whatever was stored before', () => {
    const field = SYNTHETIC_FIELDS.event_tap_action_mode;
    const holding = (action: Record<string, unknown> | null) =>
      ({ ...Config.DEFAULT_CONFIG, event_tap_action: action }) as unknown as Types.Config;

    for (const before of [
      null,
      { action: 'none' },
      { action: 'details' },
      { action: 'more-info', entity: 'calendar.ben' },
      { action: 'navigate', navigation_path: '/lovelace/0' },
    ]) {
      expect(field.apply('details', holding(before))).toEqual({
        changes: { event_tap_action: { action: 'details' } },
      });
      expect(field.apply('none', holding(before))).toEqual({
        changes: { event_tap_action: undefined },
      });
    }
  });
});

/**
 * The event tap dropdown and the event dialog's two switches, driven through the rendered
 * editor.
 *
 * The schema tests above and in `editor-schema.test.ts` prove the builder branches; these
 * prove the editor rebuilds the panel when the dropdown changes, and that what it reports to
 * Home Assistant is the minimal configuration — `ha-form` hands back every field it shows,
 * so a switch left at its default must still write nothing.
 */
describe('the event tap dropdown in the editor', () => {
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

    expect(shown('event_tap_action_mode')).toBe('none');
    expect(owner('allow_event_edit')).toBeUndefined();
    expect(owner('allow_event_delete')).toBeUndefined();

    await change('event_tap_action_mode', 'details');

    // Both under the same form as the dropdown, and nothing but the action written.
    expect(owner('allow_event_edit')).toBe(owner('event_tap_action_mode'));
    expect(owner('allow_event_delete')).toBe(owner('event_tap_action_mode'));
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      event_tap_action: { action: 'details' },
    });
  });

  it('stores Nothing as no key at all, and hides the switches again', async () => {
    const { reported, owner, shown, change } = await mount({
      event_tap_action: { action: 'details' },
    });
    expect(shown('event_tap_action_mode')).toBe('details');
    expect(owner('allow_event_edit')).toBeDefined();

    await change('event_tap_action_mode', 'none');

    expect(last(reported)).toEqual({ entities: ['calendar.anna'] });
    expect(owner('allow_event_edit')).toBeUndefined();
    expect(owner('allow_event_delete')).toBeUndefined();
  });

  it('shows any other stored action as Nothing, and replaces it with what is chosen', async () => {
    const { reported, owner, shown, change } = await mount({
      event_tap_action: { action: 'more-info', entity: 'calendar.ben' },
    });
    expect(shown('event_tap_action_mode')).toBe('none');
    expect(owner('allow_event_edit')).toBeUndefined();

    await change('event_tap_action_mode', 'details');
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      event_tap_action: { action: 'details' },
    });

    await change('event_tap_action_mode', 'none');
    expect(last(reported)).toEqual({ entities: ['calendar.anna'] });
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
      labels: true,
      navigation: false,
      view_switcher: true,
      reset: false,
      add_event: true,
      refresh: false,
      legend: false,
    });

    // The v5 controls and the labels arrive switched on, as the card reads them, the date
    // navigation off, and nothing but the switch is written.
    await change('toolbar', { ...(shown('toolbar') as object), show: true });
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });
    expect(names(owner('toolbar')!)).toEqual(
      expect.arrayContaining([
        'show',
        'labels',
        'navigation',
        'view_switcher',
        'reset',
        'refresh',
        'add_event',
        'legend',
      ]),
    );
    expect(shown('toolbar')).toEqual({
      show: true,
      labels: true,
      navigation: false,
      view_switcher: true,
      reset: false,
      add_event: true,
      refresh: false,
      legend: false,
    });

    // A control added later, off by default, reads back on once it is switched on: one flip.
    await change('toolbar', { ...(shown('toolbar') as object), legend: true });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, legend: true },
    });
    expect((shown('toolbar') as Record<string, unknown>).legend).toBe(true);
    await change('toolbar', { ...(shown('toolbar') as object), legend: false });
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
      // `view: list` is the default, so it is not written either.
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        ...(view === 'list' ? {} : { view }),
        toolbar: { show: true },
      });
    },
  );
});
