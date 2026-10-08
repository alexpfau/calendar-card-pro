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
import {
  HA_ACTION_LABEL_PREFIX,
  withCardActionLabels,
} from '../src/rendering/editor/hass-localize';
import {
  ACTION_OPTIONS,
  CARD_ACTIONS,
  buildActionsSchema,
  cardActionLabelKey,
} from '../src/rendering/editor/schemas/actions';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';

customElements.define('editor-card-actions-probe', CalendarCardProEditor);

/** The exact list both dropdowns offer, card actions first. */
const EXPECTED_ACTIONS = [
  'expand',
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

  it('names expand as a card action rather than a Home Assistant one', () => {
    expect([...CARD_ACTIONS]).toEqual(['expand']);
  });

  it('puts the card action ahead of Home Assistant’s, so it is not buried', () => {
    expect(ACTION_OPTIONS.indexOf('expand')).toBe(0);
  });

  it('gives both dropdowns the same list, through a ui_action selector', () => {
    const schema = buildActionsSchema({} as never);
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
