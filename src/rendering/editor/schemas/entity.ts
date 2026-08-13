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
 *
 * ## Why the label has a type, and where that type lives
 *
 * `label` holds four shapes in one value — nothing, text or an emoji, an icon, or a path
 * to an image — and the value alone usually says which. Usually, but not always: an
 * empty value reads as *nothing*, which is indistinguishable from a text label the user
 * has cleared on the way to typing another one. That is not an editor problem to be
 * plumbed around, it is a state the model could not represent, and the editor collapsed
 * the control every time the user reached it.
 *
 * So the shape is **resolved** rather than inferred — `label_type` where the calendar
 * names one, the value's own reading where it does not — and `resolveLabelType` is the
 * single place that decides, asked by this dropdown and by `renderLabel` alike. The
 * dropdown is a real config key now, and the key is written only where inference would
 * give a different answer, so an ordinary label's YAML is untouched.
 *
 * It buys two things a lone text box could not. An icon gets Home Assistant's icon
 * picker instead of a field you have to know `mdi:` to use — the one thing the editor
 * this replaces had here and the rebuild lost. And `label_icon_color`, which does
 * nothing unless the label is an icon, is now shown only then instead of sitting under
 * every calendar as a colour for something that is not there.
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

/** The UI-only field naming the shape a calendar's label holds. */
export const LABEL_TYPE = 'label_type';

/** The four shapes, in the order they are offered. */
export const LABEL_TYPES: ReadonlyArray<'none' | 'text' | 'icon' | 'image'> = [
  'none',
  'text',
  'icon',
  'image',
];

/**
 * The config keys a per-calendar form field answers for.
 *
 * All but one answer for the key they are named after. The shape dropdown answers for
 * **both** `label_type` and `label`: it is stored only where the value would be read
 * wrongly, so asked in its own name alone it would report *not customized* for every
 * ordinary label and be hidden by *Customized only* while the label it names was still
 * on screen.
 *
 * @param name - Per-calendar field name
 * @returns The config keys it configures
 */
export function entityConfigKeys(name: string): ReadonlyArray<string> {
  return name === LABEL_TYPE ? [LABEL_TYPE, 'label'] : [name];
}

/**
 * The dropdown naming the shape of a calendar's label.
 *
 * @param language - Effective language code
 * @returns The field
 */
function labelType(language: string): SelectorSchema {
  return {
    name: LABEL_TYPE,
    selector: {
      select: {
        mode: 'dropdown',
        options: LABEL_TYPES.map((value) => ({
          value,
          label: lookup(language, `entity.${LABEL_TYPE}.option.${value}.label`) ?? humanize(value),
        })),
      },
    },
  };
}

/**
 * The label fields for one shape.
 *
 * `label` keeps its name in all three shapes that have a value, because it *is* the
 * value: binding an icon to a second key would mean two form fields writing one config
 * key and a mapping between them, for no gain. What changes is the selector, which is
 * how the icon shape gets a picker.
 *
 * @param type - Shape the label currently holds
 * @returns The fields to render under the type dropdown
 */
export function labelFields(type: string): SelectorSchema[] {
  if (type === 'icon') {
    return [{ name: 'label', selector: { icon: {} } }, text('label_icon_color')];
  }

  return type === 'none' ? [] : [text('label')];
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
 * **The superset, for every label shape at once.** This is what the panel *declares*, so
 * that `check:i18n` reconciles every label the form can draw and the schema stays one
 * array rather than one per calendar. What each calendar renders is this narrowed to its
 * own label shape by `entitySchemaFor` — the same act the filter already performs per
 * calendar, and for the same reason: the list is per item, the schema is not.
 *
 * @param ctx - Schema context
 * @returns The per-calendar schema, with the label fields of every shape
 */
export function buildEntitySchema(ctx: SchemaCtx): HaFormSchema[] {
  return [
    labelType(ctx.language),
    text('label'),
    text('label_icon_color'),
    row(text('color'), text('accent_color')),

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

/**
 * Narrows the declared schema to the label fields one calendar's shape calls for.
 *
 * Every other field passes through untouched, and the order the panel declares is kept —
 * the label fields simply take the place of the superset's copies of them, wherever the
 * first of those sits.
 *
 * @param schema - The per-calendar schema, as declared
 * @param type - Shape this calendar's label holds
 * @returns The schema this calendar renders
 */
export function entitySchemaFor(schema: ReadonlyArray<HaFormSchema>, type: string): HaFormSchema[] {
  const replaced = new Set(['label', 'label_icon_color']);
  let inserted = false;

  return schema.flatMap((node) => {
    if (!replaced.has(node.name)) return [node];
    if (inserted) return [];

    inserted = true;
    return labelFields(type);
  });
}

/** Every per-calendar option the form offers, in render order. */
export const ENTITY_FIELD_NAMES: ReadonlyArray<string> = [
  LABEL_TYPE,
  'label',
  'label_icon_color',
  'color',
  'accent_color',
  'show_time',
  'show_location',
  'show_description',
  'split_multiday_events',
  'compact_events_to_show',
  'blocklist',
  'allowlist',
];
