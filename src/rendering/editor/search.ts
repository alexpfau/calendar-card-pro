/**
 * The jump list's index and matching (section 5.8, first stage): every field the editor draws,
 * on a page, on the overview, on a calendar entry or on a toolbar button, as one row with its
 * label, a breadcrumb, its value and its YAML path, found by today's matching.
 *
 * A field is found by its label, helper, aliases (`localize.ts` › `computeAliases`, #834's: there
 * is no second alias table), key and option text, and by the words that brought it on screen
 * before results were rows: its page's title, its panel's title and the line under it, the title
 * of a group around it, a calendar's names for its fields and the calendar picker, a button's
 * name, icon and entity for its fields. Under Customized Only a title finds nothing by itself.
 * Case and surrounding space are ignored; folding, ranking and tags come with the full search.
 *
 * DOM-free, so the tests read it as the element does.
 */

import * as Buttons from './buttons';
import * as Entities from './entities';
import { type FieldId, type IndexedField, builtSchema, fieldId } from './field-index';
import { type HaFormSchema, isGroupSchema } from './ha-form';
import * as EditorLocalize from './localize';
import { ENTRY_GROUPS, OVERVIEW_FIELDS, PAGES, type PageId, placementOf } from './pages';
import { PANELS, type SchemaCtx } from './panels';
import * as Routing from './routing';
import { ENTITY_PATH } from './schemas/calendars';
import { TOOLBAR_BUTTON_PATH } from './schemas/card';
import { entityConfigKeys } from './schemas/entity';
import { type Describe, wordValue } from './summary';
import { configKeysForField } from './synthetic';
import type * as Types from '../../config/types';
import { configuredCalendarName, homeAssistantName } from '../../utils/calendar-names';
import * as Helpers from '../../utils/helpers';

/** Which of a field's texts a query matched. */
export type MatchSource = 'label' | 'key' | 'alias' | 'option' | 'heading' | 'helper';

/** What choosing a result opens: a card field by id, or a field of one entry or one button. */
export type SearchTarget =
  | { readonly kind: 'field'; readonly id: FieldId; readonly page?: PageId }
  | { readonly kind: 'entry-field'; readonly id: FieldId; readonly key: number }
  | { readonly kind: 'button-field'; readonly id: FieldId; readonly key: number };

/** One row of the jump list. */
export interface SearchEntry {
  readonly target: SearchTarget;
  /** In the editor's language. */
  readonly label: string;
  /** Shown on every row, whatever Show YAML Option Names says (candidate A §9, R56). */
  readonly yamlPath: string;
  readonly crumbs: ReadonlyArray<string>;
  /** The value as the field shows it, "Not Set", or nothing where it has no words. */
  readonly value?: string;
  /** Every text the field is found by, lowercased, with where it came from. */
  readonly text: ReadonlyArray<readonly [text: string, source: MatchSource]>;
}

/** A matching row, with the source of the text that matched first. */
export interface SearchHit {
  readonly entry: SearchEntry;
  readonly source: MatchSource;
}

/** One calendar entry or toolbar button, as the editor draws its form. */
export interface SearchOwner {
  readonly entry: unknown;
  readonly index: number;
  readonly key: number;
  /** Its fields, as the switches leave them. */
  readonly schema: ReadonlyArray<HaFormSchema>;
}

/** Everything the index reads besides the fields themselves. */
export interface SearchCtx extends SchemaCtx {
  readonly hass?: Types.Hass;
  /** Customized Only: a title then finds nothing by itself. */
  readonly customizedOnly: boolean;
  /** The card fields built here, by id. */
  readonly present: ReadonlyMap<FieldId, IndexedField>;
  /** The ids the switches keep. */
  readonly shown: ReadonlySet<FieldId>;
  /** The scope's form data. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly entries: ReadonlyArray<SearchOwner>;
  readonly buttons: ReadonlyArray<SearchOwner>;
  /** The editor's strings, by literal key. */
  readonly t: (key: string) => string;
  readonly describe?: Describe;
}

type Texts = Array<readonly [string | undefined, MatchSource]>;

/**
 * Every string a node puts in front of the user, plus the keys behind them: what `filter.ts` ›
 * `searchableText` read for in-place filtering, each with its source.
 *
 * @param node - Schema node
 * @param path - Enclosing group names, outermost first
 * @param ctx - The index's context
 * @param dataPath - Enclosing configuration keys, outermost first
 * @param entity - Whether the node configures one calendar
 * @returns Text to search
 */
function nodeTexts(
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  ctx: SchemaCtx,
  dataPath: ReadonlyArray<string>,
  entity: boolean,
): Texts {
  if ('type' in node && node.type === 'grid') return [];
  const { language } = ctx;
  const key = EditorLocalize.qualifiedKey(node.name, path);
  const text: Texts = [
    [node.name, 'key'],
    [key, 'key'],
    // The label path and the configuration path diverge wherever a group nests data without
    // nesting labels, so the key as written in YAML has to match too.
    [EditorLocalize.qualifiedKey(node.name, dataPath), 'key'],
  ];

  // A group's own words are its title and the line under it; a field's `titleKey` resolves
  // through `computeLabel` below like any other.
  if ('type' in node && node.type === 'expandable' && node.titleKey !== undefined) {
    text.push(
      [node.title, 'heading'],
      [EditorLocalize.lookup(language, `${node.titleKey}.helper`), 'helper'],
    );
    return text;
  }

  // A derived control writes keys it is not named after (`time_format` writes `time_24h`).
  for (const written of entity ? entityConfigKeys(node.name) : configKeysForField(node.name)) {
    text.push([written, 'key'], [EditorLocalize.qualifiedKey(written, dataPath), 'key']);
  }

  text.push(
    [EditorLocalize.computeLabel(language, node, path), 'label'],
    [
      EditorLocalize.computeHelper(language, ctx.view, node, path, ctx.workspace !== undefined),
      'helper',
    ],
    [EditorLocalize.computeAliases(language, node, path), 'alias'],
  );
  if (ctx.workspace !== undefined && 'selector' in node) {
    const source = Routing.valueSource(ctx.rawConfig ?? ctx.config, ctx.workspace, node.name);
    if (source) text.push([EditorLocalize.lookup(language, `value_source.${source}`), 'helper']);
  }
  if ('value' in node && typeof node.value === 'string') text.push([node.value, 'label']);
  if ('selector' in node && 'select' in node.selector && node.selector.select !== null) {
    for (const option of node.selector.select.options) {
      if (typeof option === 'string') text.push([option, 'option']);
      else {
        text.push(
          [String(option.value), 'option'],
          [option.label, 'option'],
          [option.description, 'option'],
        );
      }
    }
  }
  return text;
}

/** One field found by a walk, with the words of what encloses it. */
interface Leaf {
  readonly node: Extract<HaFormSchema, { selector: unknown }>;
  readonly path: ReadonlyArray<string>;
  readonly dataPath: ReadonlyArray<string>;
  readonly text: Texts;
}

/**
 * Walks a schema to its fields, each carrying its own text and, outside Customized Only, the
 * text of every group around it, as a group's title once let all of it through.
 *
 * @param schema - The schema
 * @param ctx - The index's context
 * @param owner - Whose fields: the card's, a calendar entry's or a toolbar button's
 * @param path - Enclosing group names
 * @param dataPath - Enclosing configuration keys
 * @param around - The enclosing groups' text
 * @returns The fields
 */
function leaves(
  schema: ReadonlyArray<HaFormSchema>,
  ctx: SearchCtx,
  owner: 'card' | 'entry' | 'button',
  path: ReadonlyArray<string>,
  dataPath: ReadonlyArray<string>,
  around: Texts = [],
): Leaf[] {
  const entity = owner === 'entry';
  return schema.flatMap((node): Leaf[] => {
    if (isGroupSchema(node)) {
      const own = ctx.customizedOnly ? [] : nodeTexts(node, path, ctx, dataPath, entity);
      const heading = own.map(([text]) => [text, 'heading'] as const);
      return leaves(
        node.schema,
        ctx,
        owner,
        node.type === 'expandable' && node.name !== '' ? [...path, node.name] : path,
        node.name !== '' && node.flatten !== true ? [...dataPath, node.name] : dataPath,
        [...around, ...heading],
      );
    }
    if (!('selector' in node)) return [];
    // A calendar's and a button's fields were matched by their label path as their data path.
    const own = nodeTexts(node, path, ctx, owner === 'card' ? dataPath : path, entity);
    return [{ node, path, dataPath, text: [...own, ...around] }];
  });
}

/**
 * Lowercases a row's texts, dropping the holes.
 *
 * @param texts - The texts
 * @returns Them, ready to match
 */
function lowered(texts: Texts): SearchEntry['text'] {
  return texts.flatMap(([text, source]) =>
    typeof text === 'string' && text !== '' ? [[text.toLowerCase(), source] as const] : [],
  );
}

/**
 * Words a field's value: "Not Set" where it holds none, nothing where it holds one with no words.
 *
 * @param node - The field's node
 * @param value - Its value
 * @param ctx - The index's context
 * @returns The words, or `undefined` to show none
 */
function valueWords(node: Leaf['node'], value: unknown, ctx: SearchCtx): string | undefined {
  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  return (
    wordValue({ node }, value, ctx.language, ctx.describe) ??
    (empty ? ctx.t('search.not_set') : undefined)
  );
}

/**
 * The key a field's YAML path names: its own where it writes one, else the first it writes.
 *
 * @param name - The field's name
 * @param written - The keys it writes
 * @returns The key
 */
function keyOf(name: string, written: ReadonlyArray<string>): string {
  return written.includes(name) ? name : (written[0] ?? name);
}

/**
 * A calendar's own identity: its entity id, its label, its name on this card and Home
 * Assistant's name for it, which heads its panel.
 *
 * @param entry - Entry as stored
 * @param ctx - The index's context
 * @returns The words
 */
function calendarTexts(entry: unknown, ctx: SearchCtx): Texts {
  const config = Entities.asEntityConfig(entry as Types.EntityConfig);
  return [
    [config.entity, 'heading'],
    [typeof config.label === 'string' ? config.label : undefined, 'heading'],
    [configuredCalendarName([...(ctx.config.entities ?? []), config], config.entity), 'heading'],
    [homeAssistantName(config.entity, ctx.hass), 'heading'],
  ];
}

/**
 * The value at a data path.
 *
 * @param data - Form data
 * @param path - Keys, outermost first
 * @returns The value, or `undefined` where a step is missing
 */
function at(data: unknown, path: ReadonlyArray<string>): unknown {
  let value = data;
  for (const key of path) value = Helpers.isConfigBlock(value) ? value[key] : undefined;
  return value;
}

/**
 * The card fields' rows, by id: each field the switches keep and the registry places, found by
 * its own text, its panel's title and helper, and its page's title.
 *
 * @param ctx - The index's context
 * @returns Rows by id
 */
function cardRows(ctx: SearchCtx): Map<FieldId, SearchEntry> {
  const rows = new Map<FieldId, SearchEntry>();
  const scope = ctx.workspace ?? ctx.view;
  const titles = (page: PageId | 'overview'): Texts => {
    const def = PAGES.find((each) => each.id === page);
    return ctx.customizedOnly || def === undefined
      ? []
      : [
          [def.id, 'heading'],
          [ctx.t(def.titleKey), 'heading'],
        ];
  };
  for (const panel of PANELS) {
    const panelText: Texts = ctx.customizedOnly
      ? []
      : [
          [panel.id, 'heading'],
          [EditorLocalize.lookupForView(ctx.language, panel.titleKey, scope), 'heading'],
          [EditorLocalize.lookupForView(ctx.language, panel.titleKey, scope, '.helper'), 'heading'],
        ];
    for (const leaf of leaves(builtSchema(panel, ctx), ctx, 'card', [], [])) {
      const id = fieldId(panel.id, leaf.dataPath, leaf.node.name);
      const place = placementOf(id);
      const field = ctx.present.get(id);
      if (!place || !field || !ctx.shown.has(id) || rows.has(id)) continue;
      const text: Texts = [...leaf.text, ...panelText, ...titles(place.page as PageId)];
      // The picker lists the calendars, so a search for one keeps it beside their rows.
      if (configKeysForField(leaf.node.name).includes('entities') && leaf.dataPath.length === 0) {
        for (const entry of ctx.config.entities ?? []) text.push(...calendarTexts(entry, ctx));
      }
      const page = PAGES.find((each) => each.id === place.page);
      const heading = page?.headings[place.heading];
      const headingKey = heading?.keyByView?.[ctx.view] ?? heading?.key;
      const written = keyOf(leaf.node.name, field.configKeys);
      const block = leaf.dataPath.length === 0 ? Routing.destination(written, scope) : undefined;
      rows.set(id, {
        target: { kind: 'field', id, page: page?.id },
        label: EditorLocalize.computeLabel(ctx.language, leaf.node, field.labelPath),
        yamlPath: [...(block ? [block] : leaf.dataPath), written].join('.'),
        crumbs: page
          ? [ctx.t(page.titleKey), ...(headingKey ? [ctx.t(headingKey)] : [])]
          : [ctx.t('search.overview')],
        value: valueWords(leaf.node, at(ctx.data, [...leaf.dataPath, leaf.node.name]), ctx),
        text: lowered(text),
      });
    }
  }
  return rows;
}

/**
 * Rows for each field of one calendar entry or one toolbar button, found by its own text and by
 * the entry's or the button's identity, as its panel once was.
 *
 * @param owner - The entry or button
 * @param ctx - The index's context
 * @param crumbs - Where it is, its own name last
 * @param entity - Whether it is a calendar entry
 * @returns Its rows, in its form's order
 */
function ownerRows(
  owner: SearchOwner,
  ctx: SearchCtx,
  crumbs: ReadonlyArray<string>,
  entity: boolean,
): SearchEntry[] {
  const identity = entity ? calendarTexts(owner.entry, ctx) : buttonTexts(owner.entry);
  const data = entity
    ? Entities.toEntityFormData(
        owner.entry as Types.EntityConfig,
        (ctx.config.entities ?? []) as Types.EntityConfig[],
      )
    : owner.entry;
  return leaves(
    owner.schema,
    ctx,
    entity ? 'entry' : 'button',
    entity ? ENTITY_PATH : TOOLBAR_BUTTON_PATH,
    [],
  ).map((leaf) => {
    const { name } = leaf.node;
    const id = fieldId(entity ? 'calendar' : 'button', leaf.dataPath, name);
    const group = entity ? ENTRY_GROUPS[placementOf(id)?.heading ?? -1]?.key : undefined;
    return {
      target: { kind: entity ? 'entry-field' : 'button-field', id, key: owner.key },
      label: EditorLocalize.computeLabel(ctx.language, leaf.node, leaf.path),
      // A label's source decides `label`, which its keys list last.
      yamlPath: `${entity ? 'entities' : 'toolbar.buttons'}[${owner.index}].${
        entity ? keyOf(name, [...entityConfigKeys(name)].reverse()) : name
      }`,
      crumbs: group ? [...crumbs, ctx.t(group)] : crumbs,
      value: valueWords(leaf.node, at(data, [...leaf.dataPath, name]), ctx),
      text: lowered([...leaf.text, ...identity]),
    };
  });
}

/**
 * A toolbar button's own identity: its name, its icon, the words its icon is named by on the
 * card, and its entity.
 *
 * @param entry - The button as written
 * @returns The words
 */
function buttonTexts(entry: unknown): Texts {
  const button = Helpers.isConfigBlock(entry) ? entry : {};
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;
  const icon = text(button.icon);
  return [
    [text(button.name), 'heading'],
    [icon, 'heading'],
    [icon === undefined ? undefined : Helpers.iconWords(icon), 'heading'],
    [text(button.entity), 'heading'],
  ];
}

/**
 * The jump list's index: the overview's own fields, then each page's in the registry's order,
 * a toolbar button's fields under the heading that draws the buttons, then each calendar
 * entry's.
 *
 * @param ctx - The index's context
 * @returns Every row a query can find
 */
export function buildSearchIndex(ctx: SearchCtx): ReadonlyArray<SearchEntry> {
  const card = cardRows(ctx);
  const rows: SearchEntry[] = [];
  const take = (fields: ReadonlyArray<readonly [FieldId, unknown]>): void => {
    for (const [id] of fields) {
      const row = card.get(id);
      if (row) rows.push(row);
    }
  };
  take(OVERVIEW_FIELDS);
  for (const page of PAGES) {
    for (const heading of page.headings) {
      take(heading.fields);
      if (!heading.extras?.includes('own-buttons')) continue;
      for (const button of ctx.buttons) {
        const name = Buttons.buttonTitle(
          button.entry,
          button.index,
          ctx.t('toolbar.buttons.untitled'),
        );
        const crumbs = [ctx.t(page.titleKey), ...(heading.key ? [ctx.t(heading.key)] : []), name];
        rows.push(...ownerRows(button, ctx, crumbs, false));
      }
    }
  }
  for (const owner of ctx.entries) {
    const { entity } = Entities.asEntityConfig(owner.entry as Types.EntityConfig);
    rows.push(...ownerRows(owner, ctx, [Entities.entityDisplayName(entity, ctx.hass)], true));
  }
  return rows;
}

/**
 * The query as matching compares it.
 *
 * @param query - As typed
 * @returns Lowercased, without the space around it
 */
function normalized(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * The rows a query finds, in the index's order.
 *
 * @param index - The index
 * @param query - As typed
 * @returns The hits; none for a query of nothing but space
 */
export function search(index: ReadonlyArray<SearchEntry>, query: string): SearchHit[] {
  const wanted = normalized(query);
  if (wanted === '') return [];
  return index.flatMap((entry) => {
    const found = entry.text.find(([text]) => text.includes(wanted));
    return found ? [{ entry, source: found[1] }] : [];
  });
}

/**
 * Where a label shows the query, to mark it.
 *
 * @param label - The label
 * @param query - As typed
 * @returns The range, or none where the label does not hold it or lowercasing moved its letters
 */
export function highlight(
  label: string,
  query: string,
): ReadonlyArray<readonly [start: number, end: number]> {
  const wanted = normalized(query);
  const lower = label.toLowerCase();
  const start = wanted === '' || lower.length !== label.length ? -1 : lower.indexOf(wanted);
  return start < 0 ? [] : [[start, start + wanted.length]];
}
