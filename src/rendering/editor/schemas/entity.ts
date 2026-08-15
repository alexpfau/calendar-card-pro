/**
 * Per-calendar entity schema rows.
 */

import type { HaFormSchema, SelectorSchema } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { SchemaCtx } from '../panels';
import { row, text } from './common';

export const INHERIT = 'inherit';

export const ENTITY_TRISTATE_VALUES: Readonly<Record<string, ReadonlyArray<string>>> = {
  show_time: [INHERIT, 'show', 'hide'],
  show_location: [INHERIT, 'show', 'hide'],
  show_description: [INHERIT, 'show', 'hide'],
  split_multiday_events: [INHERIT, 'split', 'whole'],
};

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

export const LABEL_TYPE = 'label_type';

const LABEL_TYPES: ReadonlyArray<'none' | 'text' | 'icon' | 'image'> = [
  'none',
  'text',
  'icon',
  'image',
];

/**
 * The config keys a per-calendar form field answers for.
 *
 * @param name - Per-calendar field name
 * @returns The config keys it configures
 */
export function entityConfigKeys(name: string): ReadonlyArray<string> {
  return name === LABEL_TYPE || name === 'label' ? [LABEL_TYPE, 'label'] : [name];
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
 * @param type - Shape the label currently holds
 * @returns The fields to render under the type dropdown
 */
function labelFields(type: string): SelectorSchema[] {
  if (type === 'icon') {
    return [{ name: 'label', selector: { icon: {} } }, text('label_icon_color')];
  }

  return type === 'none' ? [] : [text('label')];
}

/**
 * Builds the schema rendered for each configured calendar.
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
