/**
 * The per-calendar schema — everything one calendar can say for itself.
 *
 * Rendered once per configured calendar by a hand-written list, because `ha-form` has
 * no member for an ordered list of heterogeneous sub-configs and never grew one. The
 * *list* is therefore ours; **the fields are not**. Each calendar's settings are an
 * ordinary schema fed to an ordinary `<ha-form>`, which is what keeps labels, helpers,
 * grids and the `check:i18n` reconciliation working exactly as they do everywhere else.
 * If this file ever starts naming an input element, the seam has been drawn in the
 * wrong place.
 *
 * The schema is **static** — one array for every calendar rather than one per calendar.
 * That is not only cheaper: a schema built per entity would key its strings by entity
 * id, and neither the string table nor the i18n check can reconcile against a key that
 * only exists on somebody's dashboard.
 *
 * ## Why four of these are dropdowns rather than switches
 *
 * `show_time`, `show_location`, `show_description` and `split_multiday_events` are
 * declared optional on `EntityConfig`, and the card reads them **presence-first**:
 * `getEntitySetting(...) ?? config.show_time` (`presentation.ts:124`), and
 * `typeof … !== 'undefined'` for the split (`events.ts:898`). So each has three states,
 * not two — *inherit*, *on*, *off* — and a checkbox can only express the last two.
 *
 * The editor this replaces bound them to `addBooleanField`, which is a real defect
 * rather than a stylistic one: an unset option rendered as an unchecked box, which
 * reads as "off" when it means "follow the card", and the first touch wrote a literal
 * `false` that no control could take back. A three-way dropdown is the smallest thing
 * that tells the truth and the only one that can return a calendar to inheriting.
 */

import type { HaFormSchema, SelectorSchema } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { SchemaCtx } from '../panels';
import { row, text } from './common';

/** The three states an inheritable per-calendar option can be in. */
export const INHERIT = 'inherit';

/**
 * Option values for the four inheritable settings, in the order they are offered.
 *
 * Worded per field rather than shared, because *Hide* and *Keep whole* say something
 * a generic *Off* does not, and the string table is the cheap place to be specific.
 */
export const ENTITY_TRISTATE_VALUES: Readonly<Record<string, ReadonlyArray<string>>> = {
  show_time: [INHERIT, 'show', 'hide'],
  show_location: [INHERIT, 'show', 'hide'],
  show_description: [INHERIT, 'show', 'hide'],
  split_multiday_events: [INHERIT, 'split', 'whole'],
};

/**
 * Which of the three option values maps to which stored value.
 *
 * `undefined` is the stored form of *inherit*, and it is stored by the key being
 * **absent** rather than present and undefined — see `entities.ts`.
 */
export const ENTITY_TRISTATE_STORED: Readonly<Record<string, boolean | undefined>> = {
  [INHERIT]: undefined,
  show: true,
  hide: false,
  split: true,
  whole: false,
};

/**
 * A three-way dropdown for an option that may also be left to the card.
 *
 * Option labels are keyed under `entity.<name>` rather than under the bare field name,
 * so a per-calendar *Show times* cannot be confused with — or accidentally re-use — the
 * card-level option of the same name, which is a plain switch and means something
 * broader.
 *
 * @param language - Effective language code
 * @param name - Per-entity config key
 * @returns The field
 */
function inheritable(language: string, name: string): SelectorSchema {
  return {
    name,
    selector: {
      select: {
        mode: 'dropdown',
        options: ENTITY_TRISTATE_VALUES[name].map((value) => ({
          value,
          label: lookup(language, `entity.${name}.option.${value}.label`) ?? humanize(value),
        })),
      },
    },
  };
}

/**
 * Builds the schema rendered for each configured calendar.
 *
 * Flat by construction: no sub-groups, so every key in the string table is
 * `entity.<option>` and stays that way. Home Assistant qualifies a label key with the
 * name of any enclosing collapsible group, so grouping these would spell their strings
 * `entity.filtering.blocklist` and buy nothing — the whole form is already inside one
 * collapsible panel per calendar.
 *
 * `entity` itself is deliberately absent. Which calendars the card shows, and in what
 * order, is the picker's job; repeating the id as an editable field here would give two
 * controls for one fact and a way to make them disagree.
 *
 * @param ctx - Schema context
 * @returns The per-calendar schema
 */
export function buildEntitySchema(ctx: SchemaCtx): HaFormSchema[] {
  return [
    text('label'),
    row(text('color'), text('accent_color')),
    text('label_icon_color'),

    inheritable(ctx.language, 'show_time'),
    inheritable(ctx.language, 'show_location'),
    inheritable(ctx.language, 'show_description'),
    inheritable(ctx.language, 'split_multiday_events'),

    {
      name: 'compact_events_to_show',
      selector: { number: { min: 1, mode: 'box' } },
    },

    text('blocklist'),
    text('allowlist'),
  ];
}

/** Every per-calendar option the form offers, in render order. */
export const ENTITY_FIELD_NAMES: ReadonlyArray<string> = [
  'label',
  'color',
  'accent_color',
  'label_icon_color',
  'show_time',
  'show_location',
  'show_description',
  'split_multiday_events',
  'compact_events_to_show',
  'blocklist',
  'allowlist',
];
