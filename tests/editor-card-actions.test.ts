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

import {
  CARD,
  type FormElement,
  changeField,
  fakeHass,
  formOf,
  formsOf,
  mountEditor,
  openPageOf,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
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
    const asked: string[] = [];
    const element = await mountEditor(
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
      },
      {
        hass: fakeHass({
          localize: (key: string) => {
            asked.push(key);
            return `HA:${key}`;
          },
        }),
      },
    );
    // A closed panel mounts no form: open every panel, so every form's hass is checked.
    await openPanels(element);

    const forms = formsOf(element);
    expect(forms.length).toBeGreaterThan(0);

    for (const form of forms) {
      const formHass = form.hass;
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
  async function mount(config: Record<string, unknown>) {
    document.body.innerHTML = '';
    const element = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      ...config,
    });
    // A closed panel mounts no form: open every panel, as these tests read forms behind them.
    await openPanels(element);

    const reported: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      const next = { ...((event as CustomEvent).detail.config as Record<string, unknown>) };
      delete next.config_version;
      reported.push(next);
    });

    const names = (form: FormElement) => [...walkSchema(form.schema)].map(({ node }) => node.name);

    return { element, reported, names };
  }

  const last = (reported: ReadonlyArray<Record<string, unknown>>) => reported[reported.length - 1];

  it('stores Show Event Details as the details action, and reveals the switches', async () => {
    const { element, reported } = await mount({});

    expect(valueOf(element, 'actions:event_tap_action')).toEqual({ action: 'none' });
    expect(formOf(element, 'actions:allow_event_edit')).toBeUndefined();
    expect(formOf(element, 'actions:allow_event_delete')).toBeUndefined();

    await changeField(element, 'actions:event_tap_action', { action: 'details' });

    // Both on the dropdown's page, each in a form of its own, and nothing but the action written.
    await openPageOf(element, 'actions:event_tap_action');
    const page = element.shadowRoot!.querySelector('.page[data-page="taps_refresh"]')!;
    for (const id of ['actions:allow_event_edit', 'actions:allow_event_delete']) {
      expect(page.contains(formOf(element, id)!), id).toBe(true);
    }
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      event_tap_action: { action: 'details' },
    });
  });

  it('stores Nothing as no key at all, and hides the switches again', async () => {
    const { element, reported } = await mount({
      event_tap_action: { action: 'details' },
    });
    expect(valueOf(element, 'actions:event_tap_action')).toEqual({ action: 'details' });
    expect(formOf(element, 'actions:allow_event_edit')).toBeDefined();

    await changeField(element, 'actions:event_tap_action', { action: 'none' });

    expect(last(reported)).toEqual({ entities: ['calendar.anna'] });
    expect(formOf(element, 'actions:allow_event_edit')).toBeUndefined();
    expect(formOf(element, 'actions:allow_event_delete')).toBeUndefined();
  });

  it("shows one of Home Assistant's actions as stored, without the switches, and keeps its fields", async () => {
    const urlAction = { action: 'url', url_path: 'https://example.com/search?q={title}' };
    const { element, reported } = await mount({
      event_tap_action: { action: 'more-info', entity: 'calendar.ben' },
    });
    expect(valueOf(element, 'actions:event_tap_action')).toEqual({
      action: 'more-info',
      entity: 'calendar.ben',
    });
    expect(formOf(element, 'actions:allow_event_edit')).toBeUndefined();

    // A field name in braces is the user's text and is stored as written.
    await changeField(element, 'actions:event_tap_action', urlAction);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], event_tap_action: urlAction });
    expect(formOf(element, 'actions:allow_event_edit')).toBeUndefined();

    await changeField(element, 'actions:event_tap_action', { action: 'details' });
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      event_tap_action: { action: 'details' },
    });
  });

  // Home Assistant's `ui_action` selector draws no helper, so the editor draws it under the form.
  it('keeps an action field’s helper behind its ⓘ, as any setting’s', async () => {
    const { element } = await mount({ event_tap_action: { action: 'more-info' } });
    await openPageOf(element, 'actions:event_tap_action');
    const help = element.shadowRoot!.querySelector(
      '[data-setting="actions:event_tap_action"] > .setting-help',
    );
    expect(help?.textContent?.trim()).toBe(EDITOR_STRINGS['event_tap_action.helper']);
    // Not drawn a second time under the form, as a toolbar button's action field draws it.
    expect(element.shadowRoot!.querySelector('.setting .action-helper')).toBeNull();
  });

  it.each(['allow_event_edit', 'allow_event_delete'])(
    'stores %s only while it is off, its non-default value',
    async (option) => {
      const { element, reported } = await mount({ event_tap_action: { action: 'details' } });

      await changeField(element, `actions:${option}`, false);
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        event_tap_action: { action: 'details' },
        [option]: false,
      });

      await changeField(element, `actions:${option}`, true);
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        event_tap_action: { action: 'details' },
      });
    },
  );

  it('offers the toolbar switch beside the title, and its controls only while it is on', async () => {
    const { element, reported, names } = await mount({});

    // The card's own fields, each in a form of its own, by the ids their wrappers name.
    const cardIds = () =>
      formsOf(element, CARD)
        .map((form) => form.closest('[data-field]')?.getAttribute('data-field') ?? '')
        .filter((id) => id.startsWith('card:'));
    expect(cardIds()).toEqual(expect.arrayContaining(['card:title', 'card:toolbar.show']));
    expect(cardIds()).not.toContain('card:toolbar.add_event');
    // Off, the switch is the toolbar's only field, and its form holds its value alone.
    expect(valueOf(element, 'card:toolbar')).toEqual({ show: false });

    // Every control but reset arrives switched on, as the card reads them, search included
    // (backlog item 182), the filter as a menu, and nothing but the switch is written.
    await changeField(element, 'card:toolbar.show', true);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });
    expect(cardIds()).toEqual(
      expect.arrayContaining(
        [
          'show',
          'navigation',
          'view_switcher',
          'reset',
          'refresh',
          'search',
          'add_event',
          'legend',
        ].map((name) => `card:toolbar.${name}`),
      ),
    );
    expect(valueOf(element, 'card:toolbar')).toEqual({
      show: true,
      navigation: true,
      view_switcher: true,
      reset: false,
      add_event: true,
      refresh: true,
      search: true,
      legend: 'menu',
      // View Switcher is on, so its qualifier line is drawn, offering every layout.
      view_switcher_layouts: ['list', 'column', 'grid', 'month'],
    });

    // The one control off by default reads back on once it is switched on: one flip.
    await changeField(element, 'card:toolbar.reset', true);
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, reset: true },
    });
    expect((valueOf(element, 'card:toolbar') as Record<string, unknown>).reset).toBe(true);
    await changeField(element, 'card:toolbar.reset', false);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    // Search, on by default, is written only once switched off, and reads back off.
    await changeField(element, 'card:toolbar.search', false);
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, search: false },
    });
    expect((valueOf(element, 'card:toolbar') as Record<string, unknown>).search).toBe(false);
    await changeField(element, 'card:toolbar.search', true);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    // And one on by default is written only once switched off.
    await changeField(element, 'card:toolbar.refresh', false);
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, refresh: false },
    });
    await changeField(element, 'card:toolbar.refresh', true);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    // The filter's dropdown holds strings, so it says `off` where the configuration says
    // `false`: written as `false`, never as the word, and shown as the word again.
    await changeField(element, 'card:toolbar.legend', 'off');
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, legend: false },
    });
    expect((valueOf(element, 'card:toolbar') as Record<string, unknown>).legend).toBe('off');
    await changeField(element, 'card:toolbar.legend', 'chips');
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, legend: 'chips' },
    });
    expect((valueOf(element, 'card:toolbar') as Record<string, unknown>).legend).toBe('chips');
    // The default, a menu, is not written.
    await changeField(element, 'card:toolbar.legend', 'menu');
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });

    await changeField(element, 'card:toolbar.add_event', false);
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, add_event: false },
    });

    // Hiding the bar keeps the choices made for it.
    await changeField(element, 'card:toolbar.show', false);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { add_event: false } });
    expect(names(formOf(element, 'card:toolbar')!)).not.toContain('add_event');

    // One switch at a time, as the form allows: the button's switch is not drawn while the
    // toolbar is hidden, so it cannot change in the same event that shows it.
    await changeField(element, 'card:toolbar.show', true);
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      toolbar: { show: true, add_event: false },
    });
    await changeField(element, 'card:toolbar.add_event', true);
    expect(last(reported)).toEqual({ entities: ['calendar.anna'], toolbar: { show: true } });
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it.each(['list', 'column', 'grid', 'month'])(
    'writes the toolbar at the top level while editing the %s layout',
    async (view) => {
      const { element, reported } = await mount({ view });

      await changeField(element, 'card:toolbar.show', true);
      // `view` stays as the YAML wrote it, even at its default `list`: the edit did not touch it.
      expect(last(reported)).toEqual({
        entities: ['calendar.anna'],
        view,
        toolbar: { show: true },
      });
    },
  );

  // The layouts the switcher offers are an option of their own, `view_switcher_layouts`, so the
  // View Switcher chip stays a plain on and off and an edit beside the list keeps it as written.
  it('keeps a stored list of switcher layouts through edits beside it', async () => {
    const toolbar = { show: true, view_switcher_layouts: ['list', 'month'] };
    const { element, reported } = await mount({ view: 'month', toolbar });

    expect(valueOf(element, 'card:toolbar.view_switcher')).toBe(true);
    expect(valueOf(element, 'card:toolbar.view_switcher_layouts')).toEqual(['list', 'month']);
    await changeField(element, 'card:toolbar.refresh', false);
    await changeField(element, 'card:title', 'Family');
    expect(last(reported)).toEqual({
      entities: ['calendar.anna'],
      view: 'month',
      title: 'Family',
      toolbar: { ...toolbar, refresh: false },
    });

    // The chip turns the switcher off and keeps the list; on again, the list is still there.
    await changeField(element, 'card:toolbar.view_switcher', false);
    expect(last(reported)).toMatchObject({
      toolbar: { ...toolbar, refresh: false, view_switcher: false },
    });
    await changeField(element, 'card:toolbar.view_switcher', true);
    expect(last(reported)).toMatchObject({ toolbar: { ...toolbar, refresh: false } });
    expect((last(reported).toolbar as Record<string, unknown>).view_switcher).toBeUndefined();
    await changeField(element, 'card:toolbar.view_switcher_layouts', ['list', 'grid', 'month']);
    expect(last(reported)).toMatchObject({
      toolbar: { show: true, refresh: false, view_switcher_layouts: ['list', 'grid', 'month'] },
    });
  });
});
