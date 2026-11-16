/**
 * The jump list's index, matching and ranking (section 5.8): every setting the editor knows, as one
 * row with its label, a breadcrumb, its value, where the value comes from and its YAML path,
 * whether its page draws it, keeps it in an Add row, waits on another setting for it, holds it
 * without using it, or offers it only in another layout; besides them each page that a query
 * names, and the two jobs Home Assistant's own tabs do.
 *
 * A field is found by its label in the editor's language and in English (and British English,
 * so "colour" finds the color settings), its YAML key as written, qualified and legacy, its
 * aliases (`localize.ts` › `computeAliases`, #834's: there is no second alias table), its
 * options, its helper, and the words that brought it on screen before results were rows: its
 * page's title, its heading's title and the line under it, a calendar's names for its fields, a
 * button's name, icon and entity for its fields.
 *
 * Both sides are folded (`fold`), the query's words match in any order, and a query no row holds
 * falls back to the letters of a label in order. Rows rank by tier (card settings, then a
 * calendar's, then Home Assistant's tabs), then by how the label matched, then by key or alias,
 * then option or heading, and a row found only in its helper comes last with the phrase it
 * matched.
 *
 * DOM-free, so the tests read it as the element does.
 */

import * as Buttons from './buttons';
import * as Entities from './entities';
import {
  type FieldId,
  type IndexedField,
  buttonFieldIndex,
  entityFieldIndex,
  universeIndex,
} from './field-index';
import { type GateData, needsText } from './gates';
import * as EditorLocalize from './localize';
import { CALENDARS_BLOCK } from './pages';
import {
  type Appearance,
  ENTRY_GROUPS,
  FAMILIES,
  OVERVIEW_FIELDS,
  PAGES,
  type PageDef,
  type PageId,
} from './pages';
import type { SchemaCtx } from './panels';
import * as Plan from './plan';
import * as Routing from './routing';
import * as Shown from './shown';
import { interpolate } from './strings';
import { type Describe, wordValue } from './summary';
import { eventTapReading } from './synthetic';
import { WORD_LIST_FIELDS, fromPattern } from './word-lists';
import type { EditorWorkspace } from './workspace';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import { configuredCalendarName, homeAssistantName } from '../../utils/calendar-names';
import * as Helpers from '../../utils/helpers';

/** Which of a row's texts a query matched. */
export type MatchSource = 'label' | 'key' | 'alias' | 'option' | 'heading' | 'helper';

/** One of the jobs Home Assistant's own tabs do, above this editor. */
export type HaTab = 'layout' | 'visibility';

/**
 * What choosing a result opens: a card field by id, a field of one entry or one button, a page,
 * or nothing at all for one of Home Assistant's tabs.
 */
export type SearchTarget =
  | { readonly kind: 'field'; readonly id: FieldId; readonly page?: PageId }
  | { readonly kind: 'entry-field'; readonly id: FieldId; readonly key: number }
  | { readonly kind: 'button-field'; readonly id: FieldId; readonly key: number }
  | { readonly kind: 'page'; readonly page: PageId }
  | { readonly kind: 'ha-tab'; readonly tab: HaTab }
  /** Split This Calendar, at the top of an entry's Which Events. */
  | { readonly kind: 'split'; readonly key: number }
  /** A block of the overview's own: the calendar list, where calendars are also reordered. */
  | { readonly kind: 'overview'; readonly block: 'calendars' };

/** A result that opens a field. */
export type FieldTarget = Extract<
  SearchTarget,
  { kind: 'field' } | { kind: 'entry-field' } | { kind: 'button-field' }
>;

/** Where a field stands here, which its row's tag and what choosing it does follow. */
export type ResultStatus =
  /** Drawn on its page. */
  | { readonly kind: 'live' }
  /** Waiting in its heading's Add row: choosing it adds it, writing nothing. */
  | { readonly kind: 'add' }
  /** Withheld until another setting allows it: choosing it opens that setting. */
  | { readonly kind: 'gated'; readonly by: FieldId }
  /** Withheld, but stored all the same: choosing it opens its gate line and Reset. */
  | { readonly kind: 'inactive'; readonly by: FieldId }
  /** Offered only by other layouts: choosing it switches the scope to the first. */
  | { readonly kind: 'other-layout'; readonly views: ReadonlyArray<Types.EffectiveView> }
  /** A page, or one of Home Assistant's tabs. */
  | { readonly kind: 'info' };

/** One row of the jump list. */
export interface SearchEntry {
  readonly target: SearchTarget;
  /** In the editor's language. */
  readonly label: string;
  /** Shown on every field's row, whatever Show YAML Option Names says (candidate A §9, R56). */
  readonly yamlPath: string;
  readonly crumbs: ReadonlyArray<string>;
  /** The value as the field shows it, "Not Set", or nothing where it has no words. */
  readonly value?: string;
  /** Where the value comes from: "Set for Grid", "Whole Card". */
  readonly words?: string;
  /** Why it is not drawn: "Needs Show Description", "Only in List and Columns". */
  readonly tag?: string;
  /** What a gate waits for, "Show Description", where one withholds it. */
  readonly needs?: string;
  readonly status: ResultStatus;
  /** Card settings 0, a calendar's 1, Home Assistant's tabs 2. */
  readonly tier: 0 | 1 | 2;
  /** For a calendar entry's field, whether the entry stores its own value. */
  readonly stored?: boolean;
  /** Every text the row is found by, folded, with where it came from and as written. */
  readonly text: ReadonlyArray<readonly [folded: string, source: MatchSource, written: string]>;
}

/** The words of a helper that a helper-only match was found by, with the query marked. */
export interface MatchedPhrase {
  readonly text: string;
  readonly marks: ReadonlyArray<readonly [start: number, end: number]>;
}

/** A matching row, with the source of its best match. */
export interface SearchHit {
  readonly entry: SearchEntry;
  readonly source: MatchSource;
  /** Higher ranks first within a tier. */
  readonly score: number;
  /** Only for a helper-only match. */
  readonly phrase?: MatchedPhrase;
}

/** One calendar entry or toolbar button, as the editor draws its form. */
export interface SearchOwner {
  readonly entry: unknown;
  readonly index: number;
  readonly key: number;
  /** Its fields. */
  readonly schema: ReadonlyArray<HaFormSchemaLike>;
}

type HaFormSchemaLike = Parameters<typeof entityFieldIndex>[0][number];

/** Everything the index reads besides the fields themselves. */
export interface SearchCtx extends SchemaCtx {
  readonly hass?: Types.Hass;
  /** The card fields built here, by id. */
  readonly present: ReadonlyMap<FieldId, IndexedField>;
  /** The shown set's context, whose answer each row's status and words follow. */
  readonly plan: Plan.PlanCtx;
  /** The scope's form data. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly entries: ReadonlyArray<SearchOwner>;
  readonly buttons: ReadonlyArray<SearchOwner>;
  /** The editor's strings, by literal key. */
  readonly t: (key: string) => string;
  readonly describe?: Describe;
}

/** Tapping an Event Opens It, which reads as the action stored in its place. */
const OPENS_DETAILS: FieldId = 'actions:event_opens_details';

/** Letters NFD leaves whole, as they fold. */
const FOLD_TABLE: Readonly<Record<string, string>> = {
  ß: 'ss',
  ø: 'o',
  æ: 'ae',
  ł: 'l',
  đ: 'd',
  œ: 'oe',
};

/** Hangul, which is not folded: its syllables decompose into letters, not marks. */
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/** What each ASCII character folds to, worked out once: most text is ASCII. */
let ASCII_FOLDED: string[] | undefined;

/**
 * What each ASCII character folds to.
 *
 * @returns By character code
 */
function asciiFolded(): string[] {
  return Array.from({ length: 128 }, (_, code) => {
    const char = String.fromCharCode(code);
    return /[\p{P}\s]/u.test(char) ? ' ' : char.toLowerCase();
  });
}

/**
 * Folds one character: Hangul as it is; else decomposed, its marks dropped, recomposed and
 * lowercased, a letter NFD leaves whole replaced from the table, and punctuation or space turned
 * into a space.
 *
 * @param char - One code point
 * @returns What it folds to, possibly empty or longer
 */
function foldChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code < 128) return (ASCII_FOLDED ??= asciiFolded())[code];
  if (HANGUL.test(char)) return char;
  const bare = char.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase();
  return bare.replace(/[ßøæłđœ]/g, (letter) => FOLD_TABLE[letter]).replace(/[\p{P}\s]/gu, ' ');
}

/**
 * Folds a text and says where each folded character came from, so a match in the folded text
 * can be marked in the text as written.
 *
 * @param text - As written
 * @returns The folded text, and per folded character the range it came from
 */
function foldMapped(text: string): {
  folded: string;
  from: Array<readonly [start: number, end: number]>;
} {
  let folded = '';
  const from: Array<readonly [number, number]> = [];
  let at = 0;
  for (const char of text) {
    const start = at;
    at += char.length;
    for (const out of foldChar(char)) {
      // Runs of space collapse, and none leads.
      if (out === ' ' && (folded === '' || folded.endsWith(' '))) continue;
      folded += out;
      // One entry per UTF-16 unit, as the folded text is indexed.
      for (let unit = 0; unit < out.length; unit++) from.push([start, at]);
    }
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    from.pop();
  }
  return { folded, from };
}

/**
 * Folds text for matching, the same for a query and for what it is matched against: case,
 * diacritics, ß, ø, æ, ł, đ and œ, and `_`, `-` and other punctuation as spaces (section 5.8).
 * Korean is left as it is.
 *
 * @param text - As written
 * @returns The folded text, its spaces single and trimmed
 */
export function fold(text: string): string {
  // ASCII folds as a whole the way it folds a character at a time, and faster.
  if (!/[^\x00-\x7f]/.test(text)) {
    return text
      .toLowerCase()
      .replace(/[\p{P}\s]+/gu, ' ')
      .trim();
  }
  return foldMapped(text).folded;
}

type Texts = Array<readonly [string | undefined, MatchSource]>;

/**
 * The legacy keys a field's options replaced (`DEPRECATED_CONFIG_MAP`), so a pasted old key finds
 * the setting that writes its successor.
 *
 * @param keys - The options the field writes
 * @param entity - Whether it is a calendar's field
 * @returns The old keys
 */
function legacyKeys(keys: ReadonlyArray<string>, entity: boolean): string[] {
  const map = entity ? Config.DEPRECATED_ENTITY_CONFIG_MAP : Config.DEPRECATED_CONFIG_MAP;
  return Object.keys(map).filter((old) => keys.includes(map[old]));
}

/**
 * Every text a field is found by, each with its source: its labels, keys, aliases, helper and
 * options.
 *
 * @param field - The field
 * @param ctx - The index's context
 * @param owner - Whose field
 * @returns Text to search
 */
function fieldTexts(
  field: IndexedField,
  ctx: SearchCtx,
  owner: 'card' | 'entry' | 'button',
): Texts {
  const { language } = ctx;
  const { node, labelPath } = field;
  // A calendar's and a button's fields were matched by their label path as their data path.
  const dataPath = owner === 'card' ? field.dataPath : labelPath;
  const written = field.configKeys;
  const text: Texts = [
    [node.name, 'key'],
    [EditorLocalize.qualifiedKey(node.name, labelPath), 'key'],
    // The label path and the configuration path diverge wherever a group nests data without
    // nesting labels, so the key as written in YAML has to match too.
    [EditorLocalize.qualifiedKey(node.name, dataPath), 'key'],
  ];
  // A derived control writes keys it is not named after (`time_format` writes `time_24h`).
  for (const key of written) {
    text.push([key, 'key'], [EditorLocalize.qualifiedKey(key, dataPath), 'key']);
  }
  for (const key of legacyKeys(written, owner === 'entry')) text.push([key, 'key']);

  const label = EditorLocalize.computeLabel(language, node, labelPath);
  text.push(
    [label, 'label'],
    [EditorLocalize.computeLabel('en', node, labelPath), 'label'],
    // British spelling: "colour" finds every color setting without an alias of its own.
    [
      EditorLocalize.computeLabel('en-gb', node, labelPath),
      language === 'en-gb' ? 'label' : 'alias',
    ],
    [
      EditorLocalize.computeHelper(
        language,
        ctx.view,
        node,
        labelPath,
        ctx.workspace !== undefined,
      ),
      'helper',
    ],
    [EditorLocalize.computeAliases(language, node, labelPath), 'alias'],
  );
  if ('value' in node && typeof node.value === 'string') text.push([node.value, 'label']);
  if ('select' in node.selector && node.selector.select !== null) {
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

/**
 * Folds a row's texts, dropping the holes and the repeats.
 *
 * @param texts - The texts
 * @returns Them, ready to match
 */
function folded(texts: Texts): SearchEntry['text'] {
  const seen = new Set<string>();
  return texts.flatMap(([text, source]) => {
    if (typeof text !== 'string') return [];
    const value = fold(text);
    if (value === '' || seen.has(`${source}\u0000${value}`)) return [];
    seen.add(`${source}\u0000${value}`);
    return [[value, source, text] as const];
  });
}

/**
 * Words a field's value: "Not Set" where it holds none, nothing where it holds one with no words.
 *
 * @param field - The field
 * @param value - Its value
 * @param ctx - The index's context
 * @returns The words, or `undefined` to show none
 */
function valueWords(field: IndexedField, value: unknown, ctx: SearchCtx): string | undefined {
  // A word list reads as its terms, as its control shows them, while its pattern reads as terms.
  if (WORD_LIST_FIELDS.has(field.id) && typeof value === 'string' && value !== '') {
    const terms = fromPattern(value);
    if (terms !== undefined) return terms.join(', ');
  }
  // Tapping an Event Opens It gives way to the action stored in its place.
  if (field.id === OPENS_DETAILS && eventTapReading(ctx.config) === 'other') {
    const action = ctx.config.event_tap_action;
    return (
      ctx.describe?.({ node: { name: 'event_tap_action', selector: { ui_action: {} } } }, action) ??
      String(action?.action)
    );
  }
  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  return (
    wordValue(field, value, ctx.language, ctx.describe) ??
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
 * Assistant's name for it, which heads its page.
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
 * Names a layout as Settings For does: "Grid", "All Layouts".
 *
 * @param ctx - The index's context
 * @returns The namer
 */
function layoutNamer(ctx: SearchCtx): Shown.LayoutName {
  return (view) => ctx.t(`editing_workspace.option.${view}.label`);
}

/**
 * A field's label in the editor's language, from whichever index holds it.
 *
 * @param ctx - The index's context
 * @returns The namer
 */
function labelNamer(ctx: SearchCtx): (id: FieldId) => string {
  const universe = universeIndex(ctx.language, ctx.plan.workspace);
  return (id) => {
    const field = ctx.present.get(id) ?? universe.fields.get(id);
    return field ? EditorLocalize.computeLabel(ctx.language, field.node, field.labelPath) : id;
  };
}

/**
 * A value worked out the first time it is asked for, then kept.
 *
 * @param compute - Works it out
 * @returns Its getter
 */
function once<T>(compute: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = compute();
      done = true;
    }
    return value;
  };
}

/**
 * Where a field's value comes from, in its page's words (`shown.ts` › `stateText`).
 *
 * @param field - The field
 * @param plan - The shown set's context, the entry's for an entry's field
 * @param ctx - The index's context
 * @param state - What `plan.ts` › `stateOf` found, where the caller has it
 * @returns The words
 */
function stateWords(
  field: IndexedField,
  plan: Plan.PlanCtx,
  ctx: SearchCtx,
  state = Plan.stateOf(field, plan),
): string | undefined {
  return Shown.stateText(
    state,
    ctx.t,
    layoutNamer(ctx),
    (value) => valueWords(field, value, ctx) ?? String(value),
  );
}

/** A card field placed by the registry, where it is placed. */
interface Placed {
  readonly id: FieldId;
  readonly appearance: Appearance;
  readonly page?: PageDef;
  readonly heading?: PageDef['headings'][number];
}

/**
 * Where a field stands here and the field to word it from: present, or withheld by a gate, or
 * offered only by another layout, in the editor's language.
 *
 * @param place - The field's placement
 * @param ctx - The index's context
 * @param plan - The plan context, a calendar entry's for its fields
 * @param present - The fields drawn here
 * @param gateData - The form data its gate reads
 * @returns The field, its status and the form data its value is read from; nothing for a field
 *   this scope neither draws nor names
 */
function standing(
  place: Placed,
  ctx: SearchCtx,
  plan: Plan.PlanCtx = ctx.plan,
  present: ReadonlyMap<FieldId, IndexedField> = ctx.present,
  gateData: GateData = { card: ctx.data },
):
  | { field: IndexedField; status: ResultStatus; data: unknown; tag?: string; needs?: string }
  | undefined {
  const state = Plan.fieldState(place.id, place.appearance, plan);
  const own = present.get(place.id);
  if (own) {
    return {
      field: own,
      status: { kind: state.kind === 'add' ? 'add' : 'live' },
      data: ctx.data,
    };
  }
  const t = ctx.t;
  switch (state.kind) {
    case 'gated':
    case 'inactive': {
      const field = universeIndex(ctx.language, ctx.plan.workspace).fields.get(place.id);
      if (!field) return undefined;
      const needs = needsText(state.gate, gateData, ctx.language, labelNamer(ctx)) ?? '';
      const top = state.kind === 'inactive' && state.source === 'all-layouts';
      return {
        field,
        status: { kind: state.kind, by: state.unmet.field },
        data: top ? Routing.workspaceFormData(ctx.config, 'shared', ctx.plan.pending) : ctx.data,
        tag:
          state.kind === 'gated'
            ? Plan.needsTag(state.gate, gateData, ctx.language, labelNamer(ctx))
            : interpolate(t('search.not_in_use'), { needs }),
        needs,
      };
    }
    case 'other-layout': {
      const field = universeIndex(ctx.language, state.views[0]).fields.get(place.id);
      if (!field) return undefined;
      const layouts = EditorLocalize.formatList(
        ctx.language,
        state.views.map(layoutNamer(ctx)),
        'conjunction',
      );
      return {
        field,
        status: { kind: 'other-layout', views: state.views },
        data: Routing.workspaceFormData(ctx.config, state.views[0], ctx.plan.pending),
        tag: interpolate(t('search.only_in'), { layouts }),
      };
    }
    default:
      return undefined;
  }
}

/**
 * One card field's row: found by its own text, its page's title, and its heading's title and the
 * line under it (a family's, for a family).
 *
 * @param place - The field's placement
 * @param ctx - The index's context
 * @returns The row, or nothing for a field this scope neither draws nor names
 */
function cardRow(place: Placed, ctx: SearchCtx): SearchEntry | undefined {
  const found = standing(place, ctx);
  if (!found) return undefined;
  const { field, status, data } = found;
  const { page, heading } = place;
  const views = status.kind === 'other-layout' ? status.views : undefined;
  const headingKey =
    (views === undefined ? heading?.keyByView?.[ctx.view] : heading?.keyByView?.[views[0]]) ??
    heading?.key;
  // A family's helper line is the family's, not the heading's (`pages.ts` › `FAMILIES`).
  const helperKey =
    heading?.helperKey ??
    Object.values(FAMILIES).find((family) => family.titleKey === heading?.key)?.helperKey;
  const crumbs = page
    ? [ctx.t(page.titleKey), ...(headingKey ? [ctx.t(headingKey)] : [])]
    : [ctx.t('search.overview')];
  const scope = views?.[0] ?? ctx.workspace ?? ctx.view;
  const written = keyOf(field.node.name, field.configKeys);
  const block =
    field.dataPath.length === 0
      ? Routing.destination(written, scope as EditorWorkspace)
      : undefined;
  const yamlPath = [...(block ? [block] : field.dataPath), written].join('.');
  const texts: Texts = [...fieldTexts(field, ctx, 'card'), [yamlPath, 'key']];
  if (page) {
    texts.push(
      [page.id, 'heading'],
      [ctx.t(page.titleKey), 'heading'],
      [heading?.key, 'heading'],
      [headingKey && ctx.t(headingKey), 'heading'],
      [helperKey && ctx.t(helperKey), 'heading'],
    );
  }
  // Worded only when a row is drawn: matching never reads them, and a query draws few rows.
  const words = once(() =>
    status.kind === 'live' || status.kind === 'add' ? stateWords(field, ctx.plan, ctx) : undefined,
  );
  return {
    target: { kind: 'field', id: place.id, page: page?.id },
    label: EditorLocalize.computeLabel(ctx.language, field.node, field.labelPath),
    yamlPath,
    crumbs,
    value: valueWords(field, Routing.atPath(data, field.dataPath, field.node.name), ctx),
    get words() {
      return words();
    },
    tag: found.tag,
    needs: found.needs,
    status,
    tier: 0,
    text: folded(texts),
  };
}

/**
 * A page's own row, found by its title and the words on its title key: the titles of the panels
 * whose settings it took.
 *
 * @param page - The page
 * @param ctx - The index's context
 * @returns The row
 */
function pageRow(page: PageDef, ctx: SearchCtx): SearchEntry {
  const title = ctx.t(page.titleKey);
  return {
    target: { kind: 'page', page: page.id },
    label: title,
    yamlPath: '',
    crumbs: [ctx.t('overview.settings')],
    status: { kind: 'info' },
    tier: 0,
    text: folded([
      [title, 'label'],
      [EditorLocalize.lookup('en', page.titleKey), 'label'],
      [EditorLocalize.lookup(ctx.language, `${page.titleKey}.aliases`), 'alias'],
    ]),
  };
}

/** The keys Home Assistant's tabs are named by, on which their search words sit. */
export const HA_TAB_KEYS = ['search.ha_tab.layout', 'search.ha_tab.visibility'] as const;

/**
 * Rows for the jobs Home Assistant's own tabs do, above this editor: each found by its name, its
 * words and the tab's own name, and opening nothing.
 *
 * @param ctx - The index's context
 * @returns The rows
 */
function haTabRows(ctx: SearchCtx): SearchEntry[] {
  const { t, language } = ctx;
  const { lookup } = EditorLocalize;
  const tabs: ReadonlyArray<readonly [HaTab, string, string, Texts]> = [
    [
      'layout',
      t('search.ha_tab.layout'),
      t('search.ha_tab.layout_note'),
      [
        [lookup('en', 'search.ha_tab.layout'), 'label'],
        [lookup(language, 'search.ha_tab.layout.aliases'), 'alias'],
      ],
    ],
    [
      'visibility',
      t('search.ha_tab.visibility'),
      t('search.ha_tab.visibility_note'),
      [[lookup('en', 'search.ha_tab.visibility'), 'label']],
    ],
  ];
  return tabs.map(([tab, label, note, words]) => ({
    target: { kind: 'ha-tab', tab },
    label,
    yamlPath: '',
    crumbs: [],
    tag: note,
    status: { kind: 'info' },
    tier: 2,
    text: folded([[label, 'label'], ...words, [note, 'heading']]),
  }));
}

/**
 * Rows for each field of one calendar entry, in its page's order: the fields its page builds,
 * and those a gate withholds from it, found by their own text and by the entry's identity.
 *
 * @param owner - The entry
 * @param ctx - The index's context
 * @returns Its rows
 */
function entryRows(owner: SearchOwner, ctx: SearchCtx): SearchEntry[] {
  const entities = (ctx.config.entities ?? []) as Types.EntityConfig[];
  const config = Entities.asEntityConfig(owner.entry as Types.EntityConfig);
  const name = Entities.entityDisplayName(config.entity, ctx.hass);
  const identity = calendarTexts(owner.entry, ctx);
  const present = entityFieldIndex(owner.schema);
  const plan: Plan.PlanCtx = { ...ctx.plan, present, entry: owner.key };
  const data = Entities.toEntityFormData(owner.entry as Types.EntityConfig, entities);
  const rows: SearchEntry[] = [];
  for (const group of ENTRY_GROUPS) {
    for (const [id, appearance] of group.fields) {
      const found = standing({ id, appearance }, ctx, plan, present.fields, {
        card: ctx.data,
        entry: data,
      });
      if (!found) continue;
      const { field, status, tag, needs } = found;
      const { name: key } = { name: field.node.name };
      const words = once(() => Plan.stateOf(field, plan));
      const live = status.kind === 'live' || status.kind === 'add';
      rows.push({
        target: { kind: 'entry-field', id, key: owner.key },
        label: EditorLocalize.computeLabel(ctx.language, field.node, field.labelPath),
        // A label's source decides `label`, which its keys list last.
        yamlPath: `entities[${owner.index}].${keyOf(key, [...field.configKeys].reverse())}`,
        crumbs: group.key ? [name, ctx.t(group.key)] : [name],
        value: valueWords(field, Routing.atPath(data, field.dataPath, key), ctx),
        get words() {
          return live ? stateWords(field, plan, ctx, words()) : undefined;
        },
        tag,
        needs,
        status,
        tier: 1,
        get stored() {
          return words()?.words?.kind === 'set-entry';
        },
        text: folded([...fieldTexts(field, ctx, 'entry'), ...identity]),
      });
    }
  }
  return rows;
}

/**
 * Split This Calendar on one entry: found by its name, the line under it and the entry's identity,
 * under the heading it opens at the top of.
 *
 * @param owner - The entry
 * @param ctx - The index's context
 * @returns Its row
 */
function splitRow(owner: SearchOwner, ctx: SearchCtx): SearchEntry {
  const config = Entities.asEntityConfig(owner.entry as Types.EntityConfig);
  const label = ctx.t('split.title');
  const group = ENTRY_GROUPS.find((each) =>
    each.fields.some(([id]) => id === 'calendar:blocklist'),
  )?.key;
  return {
    target: { kind: 'split', key: owner.key },
    label,
    yamlPath: '',
    crumbs: [Entities.entityDisplayName(config.entity, ctx.hass), ...(group ? [ctx.t(group)] : [])],
    status: { kind: 'info' },
    tier: 1,
    text: folded([
      [label, 'label'],
      [EditorLocalize.lookup('en', 'split.title'), 'label'],
      [ctx.t('split.row_helper'), 'helper'],
      ...calendarTexts(owner.entry, ctx),
    ]),
  };
}

/**
 * The overview's calendar list: found by its title and by the words of reordering it, with the
 * number of entries as its value.
 *
 * @param ctx - The index's context
 * @returns Its row
 */
function calendarsRow(ctx: SearchCtx): SearchEntry {
  const label = ctx.t(CALENDARS_BLOCK.titleKey);
  // "Drag to move {name}, or press Space", without the calendar it names.
  const reorder = ctx.t('reorder.tooltip').replace(/\{\w+\}/g, '');
  return {
    target: { kind: 'overview', block: 'calendars' },
    label,
    yamlPath: 'entities',
    crumbs: [ctx.t('search.overview')],
    value: interpolate(ctx.t('calendars.entries'), {
      count: String((ctx.config.entities ?? []).length),
    }),
    status: { kind: 'live' },
    tier: 0,
    text: folded([
      [label, 'label'],
      [EditorLocalize.lookup('en', CALENDARS_BLOCK.titleKey), 'label'],
      ['entities', 'key'],
      [reorder, 'helper'],
    ]),
  };
}

/**
 * Rows for each field of one toolbar button, found by its own text and by the button's identity.
 *
 * @param owner - The button
 * @param ctx - The index's context
 * @param crumbs - Where it is, its own name last
 * @returns Its rows, in its form's order
 */
function buttonRows(
  owner: SearchOwner,
  ctx: SearchCtx,
  crumbs: ReadonlyArray<string>,
): SearchEntry[] {
  const identity = buttonTexts(owner.entry);
  return [...buttonFieldIndex(owner.schema).fields.values()].map((field) => ({
    target: { kind: 'button-field', id: field.id, key: owner.key },
    label: EditorLocalize.computeLabel(ctx.language, field.node, field.labelPath),
    yamlPath: `toolbar.buttons[${owner.index}].${field.node.name}`,
    crumbs,
    value: valueWords(field, Routing.atPath(owner.entry, field.dataPath, field.node.name), ctx),
    status: { kind: 'live' },
    tier: 0,
    text: folded([...fieldTexts(field, ctx, 'button'), ...identity]),
  }));
}

/**
 * The jump list's index: the overview's own fields, then each page's row and its fields in the
 * registry's order, a toolbar button's fields under the heading that draws the buttons, then each
 * calendar entry's, then Home Assistant's tabs.
 *
 * @param ctx - The index's context
 * @returns Every row a query can find
 */
export function buildSearchIndex(ctx: SearchCtx): ReadonlyArray<SearchEntry> {
  const rows: SearchEntry[] = [];
  const seen = new Set<FieldId>();
  const take = (place: Placed): void => {
    if (seen.has(place.id)) return;
    seen.add(place.id);
    const row = cardRow(place, ctx);
    if (row) rows.push(row);
  };
  rows.push(calendarsRow(ctx));
  for (const [id, appearance] of OVERVIEW_FIELDS) take({ id, appearance });
  const workspace = ctx.workspace ?? ctx.view;
  for (const page of PAGES) {
    if (page.onlyIn === undefined || page.onlyIn === workspace) rows.push(pageRow(page, ctx));
    for (const heading of page.headings) {
      for (const [id, appearance] of heading.fields) take({ id, appearance, page, heading });
      if (!heading.extras?.includes('own-buttons')) continue;
      for (const button of ctx.buttons) {
        const name = Buttons.buttonTitle(
          button.entry,
          button.index,
          ctx.t('toolbar.buttons.untitled'),
        );
        const crumbs = [ctx.t(page.titleKey), ...(heading.key ? [ctx.t(heading.key)] : []), name];
        rows.push(...buttonRows(button, ctx, crumbs));
      }
    }
  }
  for (const owner of ctx.entries) rows.push(...entryRows(owner, ctx), splitRow(owner, ctx));
  rows.push(...haTabRows(ctx));
  return rows;
}

/** How a match ranks within its tier, highest first (the prototype's `search`). */
const SCORE = {
  exact: 100,
  prefix: 95,
  wordStart: 90,
  substring: 80,
  allInLabel: 70,
  keyOrAlias: 60,
  optionOrHeading: 50,
  helper: 10,
  letters: 5,
} as const;

/**
 * The words of a helper around the first word of the query only the helper holds: its sentence,
 * cut to a few words either side, with the words marked.
 *
 * @param written - The helper as written
 * @param terms - The query's folded words
 * @returns The phrase
 */
function phraseOf(written: string, terms: ReadonlyArray<string>): MatchedPhrase {
  const { folded: text, from } = foldMapped(written);
  const ranges = terms.flatMap((term) => {
    const at = termAt(text, term);
    return at < 0 ? [] : [[from[at][0], from[at + term.length - 1][1]] as const];
  });
  const [first, last] = [
    Math.min(...ranges.map(([start]) => start)),
    Math.max(...ranges.map(([, end]) => end)),
  ];
  // The sentence holding the match.
  let start = written.slice(0, first).search(/[^.!?]*$/);
  const tail = /[.!?](\s|$)/.exec(written.slice(last));
  let end = tail ? last + tail.index + 1 : written.length;
  start += written.slice(start).search(/\S/);
  // Cut long sentences a few words from the match.
  let lead = '';
  let trail = '';
  const before = written.slice(start, first).split(' ');
  if (before.length > 6) {
    start = first - before.slice(-5).join(' ').length;
    lead = '…';
  }
  const after = written.slice(last, end).split(' ');
  if (after.length > 7) {
    end = last + after.slice(0, 6).join(' ').length;
    trail = '…';
  }
  const shift = lead.length - start;
  return {
    text: `${lead}${written.slice(start, end)}${trail}`,
    marks: merged(ranges.map(([from, to]) => [from + shift, to + shift] as const)),
  };
}

/**
 * Sorts ranges and merges those that overlap.
 *
 * @param ranges - Ranges
 * @returns Them, in order, apart
 */
function merged(
  ranges: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const prev = out[out.length - 1];
    if (prev && start <= prev[1]) out[out.length - 1] = [prev[0], Math.max(prev[1], end)];
    else out.push([start, end]);
  }
  return out;
}

/**
 * Where a text holds a word of the query: anywhere, as German compounds need ("farbe" in
 * "Hintergrundfarbe"), but a word shorter than three letters only where a word starts, or "at"
 * would match inside "path" and "format". Korean is held anywhere.
 *
 * @param text - Folded text
 * @param term - One folded word of the query
 * @returns Its index, or -1
 */
function termAt(text: string, term: string): number {
  if (term.length >= 3 || HANGUL.test(term)) return text.indexOf(term);
  const at = ` ${text}`.replace(/\n/g, ' ').indexOf(` ${term}`);
  return at < 0 ? -1 : at;
}

/**
 * Whether a text holds a word of the query (`termAt`).
 *
 * @param text - Folded text
 * @param term - One folded word of the query
 * @returns `true` when it does
 */
function holdsTerm(text: string, term: string): boolean {
  return termAt(text, term) >= 0;
}

/** Each row's texts joined, by the sources a match tier reads, worked out once a row. */
const HAYS = new WeakMap<SearchEntry, { all: string; named: string; unhelped: string }>();

/**
 * A row's texts joined for matching: all of them, those naming it (label, key and alias), and
 * all but its helper.
 *
 * @param entry - The row
 * @returns The texts
 */
function haysOf(entry: SearchEntry): { all: string; named: string; unhelped: string } {
  let hay = HAYS.get(entry);
  if (!hay) {
    const join = (sources: ReadonlyArray<MatchSource>): string =>
      entry.text
        .filter(([, source]) => sources.includes(source))
        .map(([text]) => text)
        .join('\n');
    hay = {
      all: entry.text.map(([text]) => text).join('\n'),
      named: join(['label', 'key', 'alias']),
      unhelped: join(['label', 'key', 'alias', 'option', 'heading']),
    };
    HAYS.set(entry, hay);
  }
  return hay;
}

/**
 * How one row matches a query, if it does: every word somewhere in its texts, ranked by the best
 * text that holds them.
 *
 * @param entry - The row
 * @param wanted - The folded query
 * @param terms - Its words
 * @returns The match, or `undefined`
 */
function match(
  entry: SearchEntry,
  wanted: string,
  terms: ReadonlyArray<string>,
): Omit<SearchHit, 'entry'> | undefined {
  const hay = haysOf(entry);
  const holds = (text: string): boolean => terms.every((term) => holdsTerm(text, term));
  if (!holds(hay.all)) return undefined;

  let best = 0;
  for (const [label, source] of entry.text) {
    if (source !== 'label') continue;
    const score =
      label === wanted
        ? SCORE.exact
        : label.startsWith(wanted)
          ? SCORE.prefix
          : ` ${label}`.includes(` ${wanted}`)
            ? SCORE.wordStart
            : holdsTerm(label, wanted)
              ? SCORE.substring
              : terms.every((term) => holdsTerm(label, term))
                ? SCORE.allInLabel
                : 0;
    best = Math.max(best, score);
  }
  if (best > 0) return { source: 'label', score: best };

  const first = (sources: ReadonlyArray<MatchSource>): MatchSource =>
    entry.text.find(
      ([text, source]) => sources.includes(source) && holdsTerm(text, terms[0]),
    )?.[1] ?? sources[0];
  if (holds(hay.named)) {
    return { source: first(['key', 'alias']), score: SCORE.keyOrAlias };
  }
  if (holds(hay.unhelped)) {
    return { source: first(['option', 'heading']), score: SCORE.optionOrHeading };
  }
  // Found only through its helper: ranked last, with the phrase that matched.
  const others = hay.unhelped;
  const helper = entry.text.find(
    ([text, source]) =>
      source === 'helper' &&
      terms.some((term) => !holdsTerm(others, term) && holdsTerm(text, term)),
  );
  return {
    source: 'helper',
    score: SCORE.helper,
    phrase: helper
      ? phraseOf(
          helper[2],
          terms.filter((term) => holdsTerm(helper[0], term)),
        )
      : undefined,
  };
}

/**
 * Whether a label holds a query's letters in order.
 *
 * @param label - Folded label
 * @param letters - The query's letters, without spaces
 * @returns `true` when it does
 */
function holdsLetters(label: string, letters: string): boolean {
  let at = 0;
  // By UTF-16 unit on both sides, so a character outside the basic plane compares whole.
  for (let unit = 0; unit < label.length && at < letters.length; unit++) {
    if (label[unit] === letters[at]) at++;
  }
  return at === letters.length;
}

/**
 * The rows a query finds, best first: by tier, then by how well, then in the index's order. A
 * query of three letters or more whose words no row holds falls back to the labels holding its
 * letters in order.
 *
 * @param index - The index
 * @param query - As typed
 * @returns The hits; none for a query of nothing but space
 */
export function search(index: ReadonlyArray<SearchEntry>, query: string): SearchHit[] {
  const wanted = fold(query);
  if (wanted === '') return [];
  const terms = wanted.split(' ');
  const order = new Map(index.map((entry, at) => [entry, at]));
  let hits: SearchHit[] = index.flatMap((entry) => {
    const found = match(entry, wanted, terms);
    return found ? [{ entry, ...found }] : [];
  });
  const letters = wanted.replace(/ /g, '');
  if (hits.length === 0 && letters.length >= 3) {
    hits = index.flatMap((entry) =>
      entry.text.some(([text, source]) => source === 'label' && holdsLetters(text, letters))
        ? [{ entry, source: 'label' as const, score: SCORE.letters }]
        : [],
    );
  }
  return hits.sort(
    (a, b) =>
      a.entry.tier - b.entry.tier || b.score - a.score || order.get(a.entry)! - order.get(b.entry)!,
  );
}

/** A result as the list draws it: one row, or one field of several calendars folded together. */
export type ResultItem =
  | { readonly kind: 'hit'; readonly hit: SearchHit }
  | { readonly kind: 'calendars'; readonly id: FieldId; readonly hits: ReadonlyArray<SearchHit> };

/**
 * Folds the hits for one field of several calendar entries into one item, where the first of
 * them ranks; a field of one entry stays a row.
 *
 * @param hits - The hits, ranked
 * @returns The items, in the same order
 */
export function collapse(hits: ReadonlyArray<SearchHit>): ResultItem[] {
  // Split This Calendar folds as a field of every entry does.
  const groupOf = (target: SearchTarget): FieldId | undefined =>
    target.kind === 'entry-field' ? target.id : target.kind === 'split' ? SPLIT_GROUP : undefined;
  const byField = new Map<FieldId, SearchHit[]>();
  for (const hit of hits) {
    const id = groupOf(hit.entry.target);
    if (id === undefined) continue;
    const list = byField.get(id) ?? [];
    list.push(hit);
    byField.set(id, list);
  }
  const items: ResultItem[] = [];
  for (const hit of hits) {
    const id = groupOf(hit.entry.target);
    const group = id === undefined ? undefined : byField.get(id);
    if (id === undefined || group === undefined || group.length < 2) {
      items.push({ kind: 'hit', hit });
    } else if (group[0] === hit) items.push({ kind: 'calendars', id, hits: group });
  }
  return items;
}

/** The id Split This Calendar's rows fold under. */
export const SPLIT_GROUP: FieldId = 'calendar:split';

/**
 * Where a label shows the query's words, to mark them: the first place each word occurs, in the
 * label as written, however folding moved its letters.
 *
 * @param label - The label
 * @param query - As typed
 * @returns The ranges, in order and apart
 */
export function highlight(
  label: string,
  query: string,
): ReadonlyArray<readonly [start: number, end: number]> {
  const wanted = fold(query);
  if (wanted === '') return [];
  const { folded: text, from } = foldMapped(label);
  return merged(
    wanted.split(' ').flatMap((term) => {
      const at = termAt(text, term);
      return at < 0 ? [] : [[from[at][0], from[at + term.length - 1][1]] as const];
    }),
  );
}
