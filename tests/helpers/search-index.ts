/**
 * The jump list's index for a configuration, built without mounting the editor: what a test of
 * what a query finds reads, as `element.ts` › `_renderResults` builds it.
 */

import * as Config from '../../src/config/config';
import type * as Types from '../../src/config/types';
import {
  buildFieldIndex,
  entrySchemaAcross,
  schemaCtx,
  universeIndex,
} from '../../src/rendering/editor/field-index';
import { withholdInertFields } from '../../src/rendering/editor/filter';
import type { HaFormSchema } from '../../src/rendering/editor/ha-form';
import { lookup } from '../../src/rendering/editor/localize';
import { workspaceFormData } from '../../src/rendering/editor/routing';
import {
  type SearchEntry,
  type SearchOwner,
  buildSearchIndex,
  search,
} from '../../src/rendering/editor/search';
import { deepEqual } from '../../src/rendering/editor/value';
import type { EditorWorkspace } from '../../src/rendering/editor/workspace';

/** What the index is built for besides the configuration. */
export interface IndexOptions {
  readonly workspace?: EditorWorkspace;
  readonly language?: string;
  readonly hass?: Types.Hass;
  /** Each calendar entry's fields, where a test hands its own; else as the editor builds them. */
  readonly entrySchemas?: ReadonlyArray<ReadonlyArray<HaFormSchema>>;
  /** The configuration as stored; else the options that differ from the card's defaults. */
  readonly raw?: Readonly<Record<string, unknown>>;
  /** The session's added set. */
  readonly added?: ReadonlySet<string>;
}

/**
 * The index a configuration's results come from.
 *
 * @param config - The configuration, merged with the card's defaults
 * @param options - Scope, language, `hass` and entries
 * @returns Every row a query can find
 */
export function searchIndex(
  config: Types.Config,
  options: IndexOptions = {},
): ReadonlyArray<SearchEntry> {
  const { workspace = 'shared', language = 'en' } = options;
  const ctx = schemaCtx(config, workspace, language);
  const index = buildFieldIndex(ctx);
  const defaults = Config.DEFAULT_CONFIG as unknown as Record<string, unknown>;
  const raw =
    options.raw ??
    Object.fromEntries(
      Object.entries(config).filter(([key, value]) => !deepEqual(value, defaults[key])),
    );
  const entries: SearchOwner[] = (config.entities ?? []).map((entry, index) => ({
    entry,
    index,
    key: index,
    schema: options.entrySchemas?.[index]
      ? withholdInertFields(options.entrySchemas[index], workspace, 'entity')
      : entrySchemaAcross(entry, ctx).schema,
  }));
  return buildSearchIndex({
    ...ctx,
    hass: options.hass,
    present: index.fields,
    plan: {
      workspace,
      config,
      raw,
      present: index,
      universe: universeIndex('en', workspace),
      added: options.added ?? new Set(),
      showEverySetting: false,
      entryKeys: (config.entities ?? []).map((_, at) => at),
    },
    data: workspaceFormData(config, workspace),
    entries,
    buttons: [],
    t: (key) => lookup(language, key) ?? key,
  });
}

/**
 * The ids a query finds, an entry's fields as `calendar:<name>@<place>`.
 *
 * @param index - The index
 * @param query - The query
 * @returns The ids, in the order the rows show them
 */
export function hitIds(index: ReadonlyArray<SearchEntry>, query: string): string[] {
  return search(index, query).flatMap(({ entry: { target } }) => {
    if (!('id' in target)) return [];
    return [target.kind === 'field' ? target.id : `${target.id}@${target.key}`];
  });
}
