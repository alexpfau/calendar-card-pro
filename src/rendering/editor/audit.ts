/**
 * Stored Settings: every line the YAML stores, grouped by where it
 * lives (the whole card, All Layouts, each layout, each calendar, then the lines kept as written),
 * each with the field that writes it where the editor has one. DOM-free, so the tests read the
 * groups the page draws.
 *
 * Built on stored presence, never on "differs from the default": a line equal to its default is
 * listed all the same, because the YAML holds it. Options v3.0.0 removed are left to the notices
 * page (`deprecated.ts`), since the next write removes them. Values from YAML, a dropdown's value
 * none of its options offers, are here too (`withYamlOption`).
 */

import { buttonTitle } from './buttons';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchemaAcross,
  parseFieldId,
  schemaCtx,
  universeIndex,
} from './field-index';
import { FULL_SIZE_PATHS } from './full-size';
import type { Gate, Prereq } from './gates';
import type { SelectOption, SelectorSchema } from './ha-form';
import type { PageId } from './pages';
import { type PlanCtx, appearanceOf, fieldState, hasLayoutCopy } from './plan';
import { destination, startingView } from './routing';
import { isSet as holdsValue, isSyntheticKey } from './synthetic';
import { type EditorWorkspace, WORKSPACES, storedPath } from './workspace';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import { VIEWS, viewBlockFor } from '../../config/view';
import { isConfigBlock, memoizeLast } from '../../utils/helpers';

/** One stored line. */
export interface AuditLine {
  /** Its keys, outermost first: `['time_grid', 'end_time']`, `['entities', '3', 'label']`. */
  readonly path: ReadonlyArray<string>;
  /** Its YAML path as the page shows it: `time_grid.end_time`, `entities[3].label`. */
  readonly text: string;
  readonly value: unknown;
  /** The field that writes it; absent where the editor keeps it as written. */
  readonly field?: FieldId;
  /** A line the editor owns with no one field: Card Displays, a toolbar's own buttons. */
  readonly page?: PageId | 'overview';
  /** Stored but not in use: the gate holding it back. */
  readonly inactive?: { readonly gate: Gate; readonly unmet: Prereq };
}

/** One group of the page. */
export interface AuditGroup {
  /**
   * `whole`: the card's top-level lines with one value for every layout; `card`: those every
   * layout uses unless it has its own (All Layouts); then a layout's block, a calendar entry's
   * lines, and the lines kept as written.
   */
  readonly kind: 'whole' | 'card' | 'layout' | 'entry' | 'kept';
  /** Where its lines are written: All Layouts for the card's, a calendar's and the kept lines. */
  readonly workspace: EditorWorkspace;
  /** A calendar entry's key, for its group. */
  readonly key?: number;
  readonly lines: ReadonlyArray<AuditLine>;
}

/** What the groups are read from. */
export interface AuditCtx {
  /** The configuration as stored. */
  readonly raw: Readonly<Record<string, unknown>>;
  /** The configuration as the editor holds it, merged with root defaults. */
  readonly config: Readonly<Types.Config>;
  readonly entryKeys: ReadonlyArray<number>;
  readonly pending?: Readonly<Record<string, string>>;
}

/** Root lines the page does not list: the card's type and version, and its calendar list. */
const SKIPPED: ReadonlySet<string> = new Set(['type', 'entities', 'config_version']);

/** Lines the editor owns with no one field, and where they are edited. */
const OWNED: Readonly<Record<string, PageId | 'overview'>> = {
  view: 'overview',
  'toolbar.buttons': 'card_header',
};

/**
 * Home Assistant's own keys, which its Layout tab writes: the part of `HA_CARD_KEYS` that tab
 * edits, so the tag can name it.
 */
export const HA_LAYOUT_KEYS: ReadonlySet<string> = new Set([
  'grid_options',
  'layout_options',
  'view_layout',
]);

const owners = new Map<string, Map<string, FieldId[]>>();

/**
 * The fields that write each path, in a workspace: the card's by their full path (a layout's own
 * line under its block), or, for `calendar`, a calendar entry's by option.
 *
 * @param workspace - The workspace, or `calendar`
 * @returns Field ids by path
 */
function ownersIn(workspace: EditorWorkspace | 'calendar'): Map<string, FieldId[]> {
  let map = owners.get(workspace);
  if (map) return map;
  map = new Map();
  const entry = workspace === 'calendar';
  // A calendar's options are the same in every layout, but each layout offers only its own.
  const fields = entry
    ? WORKSPACES.flatMap((each) => [...universeIndex('en', each).fields.values()])
    : universeIndex('en', workspace).fields.values();
  for (const field of fields) {
    const { scope } = parseFieldId(field.id);
    if (entry !== (scope === 'calendar') || scope === 'button') continue;
    // A layout group is written under the block of the layout: `list.weather.position`.
    const nested = entry ? field.dataPath : storedPath(field.dataPath, workspace);
    if (nested === undefined) continue;
    for (const key of field.configKeys) {
      const block = entry || nested.length > 0 ? undefined : destination(key, workspace);
      const path = [...(block ? [block] : nested), key].join('.');
      const ids = map.get(path) ?? [];
      if (!ids.includes(field.id)) map.set(path, [...ids, field.id]);
    }
  }
  owners.set(workspace, map);
  return map;
}

/**
 * The first field that writes a path: a card option's in a workspace, or a calendar option's.
 *
 * @param path - The YAML path, `day_spacing`
 * @param workspace - The workspace, or `calendar`
 * @returns The field's id, or `undefined`
 */
export function fieldFor(
  path: string,
  workspace: EditorWorkspace | 'calendar',
): FieldId | undefined {
  return ownersIn(workspace).get(path)?.[0];
}

/**
 * A field as the first layout offering it builds it, in a language: a calendar's option some
 * layouts withhold is found all the same.
 *
 * @param id - Field id
 * @param language - Editor language
 * @returns The field, or `undefined`
 */
export function anyField(id: FieldId, language: string): IndexedField | undefined {
  for (const workspace of WORKSPACES) {
    const field = universeIndex(language, workspace).fields.get(id);
    if (field) return field;
  }
  return undefined;
}

/**
 * The plan context a line is judged in: every setting shown, so a field is live wherever it
 * applies, and a value its gate holds back reads as stored but not in use.
 *
 * @param ctx - Audit context
 * @param workspace - Where the line is written
 * @returns The context
 */
function planCtx(ctx: AuditCtx, workspace: EditorWorkspace): PlanCtx {
  return {
    workspace,
    config: ctx.config,
    raw: ctx.raw,
    present: buildFieldIndex(schemaCtx(ctx.config as Types.Config, workspace, 'en')),
    universe: universeIndex('en', workspace),
    added: new Set(),
    showEverySetting: true,
    pending: ctx.pending,
    entryKeys: ctx.entryKeys,
  };
}

/**
 * A stored line with the field that writes it: of the fields writing its option, one drawn here,
 * then the one named after it, then the value rather than its mode (Start Date's fixed date, not
 * its mode), and whether it is in use.
 *
 * @param path - The line's keys
 * @param text - Its YAML path
 * @param value - Its value
 * @param ids - The fields writing it
 * @param pctx - Where it is judged
 * @returns The line
 */
function ownedLine(
  path: ReadonlyArray<string>,
  text: string,
  value: unknown,
  ids: ReadonlyArray<FieldId>,
  pctx: PlanCtx,
): AuditLine {
  const key = path[path.length - 1];
  let field = ids[0];
  let rank = Infinity;
  for (const id of ids) {
    const { name } = parseFieldId(id);
    const appearance = appearanceOf(id) ?? 'add';
    // A mode's value outranks the mode, which only says which value is kept.
    const mode = isSyntheticKey(name) && !(typeof appearance === 'object' && 'with' in appearance);
    // A field drawn here outranks one named after the option: a value its mode leaves undrawn
    // (a calendar's color while it follows Home Assistant) writes nothing.
    const at =
      (fieldState(id, appearance, pctx).kind === 'live' ? 0 : 4) +
      (name === key ? 0 : 2) +
      (mode ? 1 : 0);
    if (at < rank) [field, rank] = [id, at];
  }
  const state = fieldState(field, appearanceOf(field) ?? 'add', pctx);
  return {
    path,
    text,
    value,
    field,
    inactive:
      state.kind === 'inactive' && state.source === 'here'
        ? { gate: state.gate, unmet: state.unmet }
        : undefined,
  };
}

/**
 * Whether a top-level line has one value for every layout: one the editor owns with no field (the
 * layout shown, the toolbar's own buttons), or one whose field has no copy per layout.
 *
 * @param line - A line of the card's top level
 * @returns `true` for the Whole Card group
 */
function wholeCard(line: AuditLine): boolean {
  if (line.page !== undefined) return true;
  const field =
    line.field === undefined ? undefined : universeIndex('en', 'shared').fields.get(line.field);
  return field !== undefined && !hasLayoutCopy(field);
}

/**
 * Whether a line is one Stored Settings lists: any the YAML writes a value for, `null` and an
 * empty string included, as `event_tap_action: null` runs nothing and an emptied Countries To
 * Remove keeps Custom.
 *
 * @param value - The line's value
 * @returns Whether it is listed
 */
function listed(value: unknown): boolean {
  return value !== undefined;
}

/**
 * Every line the YAML stores, by group: the card's top level, split into the lines with one value
 * for every layout and those a layout can have its own of, then each layout's block, each calendar
 * entry storing more than its id, then what the editor keeps as written. A group with no line is
 * left out.
 *
 * @param ctx - Audit context
 * @returns The groups, in page order
 */
export function auditGroups(ctx: AuditCtx): AuditGroup[] {
  const raw = ctx.raw;
  const blocks = new Map<string, Types.EffectiveView>(
    VIEWS.flatMap((view) => {
      const block = viewBlockFor(view)?.blockKey;
      return block ? [[block as string, view] as const] : [];
    }),
  );
  const kept: AuditLine[] = [];
  const walk = (
    from: Readonly<Record<string, unknown>>,
    prefix: ReadonlyArray<string>,
    workspace: EditorWorkspace,
  ): AuditLine[] => {
    const map = ownersIn(workspace);
    let pctx: PlanCtx | undefined;
    const lines: AuditLine[] = [];
    for (const [key, value] of Object.entries(from)) {
      const path = [...prefix, key];
      const text = path.join('.');
      if (
        !listed(value) ||
        (prefix.length === 0 &&
          (SKIPPED.has(key) || blocks.has(key) || key in Config.DEPRECATED_CONFIG_MAP))
      ) {
        continue;
      }
      const ids = map.get(text);
      if (ids) {
        lines.push(ownedLine(path, text, value, ids, (pctx ??= planCtx(ctx, workspace))));
      } else if (OWNED[text]) {
        lines.push({ path, text, value, page: OWNED[text] });
      } else if (
        isConfigBlock(value) &&
        [...map.keys()].some((each) => each.startsWith(`${text}.`))
      ) {
        lines.push(...walk(value, path, workspace));
      } else {
        kept.push({ path, text, value });
      }
    }
    return lines;
  };

  const top = walk(raw, [], 'shared');
  const groups: AuditGroup[] = [
    { kind: 'whole', workspace: 'shared', lines: top.filter(wholeCard) },
    { kind: 'card', workspace: 'shared', lines: top.filter((line) => !wholeCard(line)) },
  ];
  for (const [block, view] of blocks) {
    const held = raw[block];
    if (isConfigBlock(held)) {
      groups.push({ kind: 'layout', workspace: view, lines: walk(held, [block], view) });
    }
  }

  const entities = Array.isArray(raw.entities) ? raw.entities : [];
  const byOption = ownersIn('calendar');
  // A calendar's lines are judged as its page judges them: in the layout the card opens in, across
  // the card's layouts (`element.ts` › `_entryBase`).
  const onPage = startingView(ctx.config as Types.Config);
  let base: PlanCtx | undefined;
  entities.forEach((entry: unknown, at) => {
    if (!isConfigBlock(entry)) return;
    base ??= planCtx(ctx, onPage);
    const pctx: PlanCtx = {
      ...base,
      present: entityFieldIndex(
        entrySchemaAcross(
          entry as unknown as Types.EntityConfig,
          schemaCtx(ctx.config as Types.Config, onPage, 'en'),
        ).schema,
      ),
      entry: ctx.entryKeys[at],
    };
    const lines = Object.entries(entry).flatMap(([key, value]): AuditLine[] => {
      if (key === 'entity' || !listed(value) || key in Config.DEPRECATED_ENTITY_CONFIG_MAP) {
        return [];
      }
      const path = ['entities', String(at), key];
      const text = `entities[${at}].${key}`;
      const ids = byOption.get(key);
      return [ids ? ownedLine(path, text, value, ids, pctx) : { path, text, value }];
    });
    groups.push({ kind: 'entry', workspace: onPage, key: ctx.entryKeys[at], lines });
  });
  groups.push({ kind: 'kept', workspace: 'shared', lines: kept });
  return groups.filter((group) => group.lines.length > 0);
}

/** One line `overlay:` holds beyond the Full Size page's own settings. */
export interface FullSizeLine extends AuditLine {
  /** The layout whose block holds it, for a line under `overlay.time_grid` and the like. */
  readonly view?: Types.EffectiveView;
}

/** The Full Size page's own settings, by their path inside `overlay:`, which it draws itself. */
const FULL_SIZE_OWN: ReadonlySet<string> = new Set(FULL_SIZE_PATHS.map((path) => path.join('.')));

/**
 * Every line `overlay:` holds but the Full Size page's own settings: the block walked as Stored
 * Settings walks the card, since it holds the card's options, each with the field that writes it,
 * a layout block's lines with their layout, and what no field writes as written. A line the walk
 * leaves to another page of the card's (a calendar list, a removed option) is listed as written
 * too, since nothing else shows it for the card opened full size. Paths are the card's own,
 * `overlay` first.
 *
 * @param block - The `overlay:` block as stored
 * @param config - The card's configuration as the editor holds it
 * @returns The lines, in the block's order of groups
 */
export const fullSizeLines = memoizeLast(
  (block: unknown, config: Readonly<Types.Config>): ReadonlyArray<FullSizeLine> => {
    if (!isConfigBlock(block)) return [];
    const groups = auditGroups({ raw: block, config, entryKeys: [] });
    const lines: FullSizeLine[] = groups.flatMap((group) =>
      group.kind === 'entry'
        ? []
        : group.lines.map((line) =>
            group.kind === 'layout'
              ? { ...line, view: group.workspace as Types.EffectiveView }
              : line,
          ),
    );
    const covered = new Set(lines.map((line) => line.path[0]));
    for (const [key, value] of Object.entries(block)) {
      const empty = isConfigBlock(value) && Object.keys(value).length === 0;
      if (value !== undefined && !empty && !covered.has(key)) {
        lines.push({ path: [key], text: key, value });
      }
    }
    return lines
      .filter((line) => !FULL_SIZE_OWN.has(line.text))
      .map((line) => ({
        ...line,
        path: ['overlay', ...line.path],
        text: `overlay.${line.text}`,
      }));
  },
);

/**
 * The page's counts, which its More row shows too: the lines the editor sets, and those of them
 * not in use. Lines kept as written, a calendar's unknown ones included, are counted by neither.
 *
 * @param groups - The groups
 * @returns The counts
 */
export function auditCounts(groups: ReadonlyArray<AuditGroup>): { set: number; inactive: number } {
  const lines = groups
    .flatMap((group) => group.lines)
    .filter((line) => line.field !== undefined || line.page !== undefined);
  return { set: lines.length, inactive: lines.filter((line) => line.inactive).length };
}

/**
 * A value as one line of YAML in flow style, for a line no control words: `columns: 12`, a list
 * as `a, b`, and what nests inside either in braces or brackets, `target: {entity_id: [a, b]}`.
 * Never JSON, whose quotes and brackets on every word make a stored line hard to read. A string
 * inside either is quoted only where it would read as something else: empty, holding a comma,
 * colon, bracket or quote, or reading as null, a boolean or a number.
 *
 * @param value - The value as stored
 * @returns The text
 */
export function plainValue(value: unknown): string {
  return flow(value, false);
}

/**
 * `plainValue` at any depth.
 *
 * @param value - The value
 * @param nested - Whether it sits inside a block or list, where it keeps its brackets
 * @returns The text
 */
function flow(value: unknown, nested: boolean): string {
  const list = Array.isArray(value);
  if (!list && !isConfigBlock(value)) {
    return nested && typeof value === 'string' && AMBIGUOUS.test(value)
      ? JSON.stringify(value)
      : String(value);
  }
  const items = list
    ? value.map((each) => flow(each, true))
    : Object.entries(value)
        .filter(([, inner]) => inner !== undefined)
        .map(([key, inner]) => `${flow(key, true)}: ${flow(inner, true)}`);
  const text = items.join(', ');
  return nested || items.length === 0 ? (list ? `[${text}]` : `{${text}}`) : text;
}

/** A string that, unquoted, would read as another value or split where it does not. */
const AMBIGUOUS = /^$|^\s|\s$|[,:[\]{}"]|^(?:null|true|false|[-+.\d][\d.]*)$/;

/**
 * The toolbar's own buttons, each named as its row on the toolbar page names it.
 *
 * @param value - `toolbar.buttons` as stored
 * @param untitled - The words for a button with no name or icon, with `{number}` for its place
 * @returns The names, or the value as YAML where it is no list or an empty one
 */
export function buttonNames(value: unknown, untitled: string): string {
  return Array.isArray(value) && value.length > 0
    ? value.map((entry, at) => buttonTitle(entry, at, untitled)).join(', ')
    : plainValue(value);
}

/**
 * Whether a dropdown holds a value none of its options offers: a value from YAML, which the
 * dropdown would otherwise show as blank.
 *
 * @param node - The field's node
 * @param value - Its value
 * @returns `true` for a value from YAML
 */
export function outsideOptions(node: SelectorSchema, value: unknown): boolean {
  const select = 'select' in node.selector ? node.selector.select : undefined;
  if (!select || select.multiple || select.custom_value || !holdsValue(value)) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return !(select.options as ReadonlyArray<SelectOption | string>).some(
    (option) => String(typeof option === 'object' ? option.value : option) === String(value),
  );
}

/**
 * A dropdown offering, besides its own options, the value from YAML it holds, labeled so, so the
 * value shows and stays until another is chosen.
 *
 * @param node - The field's node
 * @param value - Its value
 * @param label - The value's label, "monthly (From YAML)"
 * @returns The node with that option, or the node itself where the value is one of its options
 */
export function withYamlOption(
  node: SelectorSchema,
  value: unknown,
  label: string,
): SelectorSchema {
  if (!outsideOptions(node, value) || !('select' in node.selector)) return node;
  const select = node.selector.select!;
  const options = select.options as ReadonlyArray<SelectOption | string>;
  return {
    ...node,
    selector: {
      select: { ...select, options: [...options, { value: value as string | number, label }] },
    },
  } as SelectorSchema;
}
