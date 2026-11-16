/**
 * The jump list's index for a configuration, built without mounting the editor: what a test of
 * what a query finds reads, as `element.ts` › `_renderResults` builds it.
 */

import type * as Types from '../../src/config/types';
import { buildFieldIndex, entrySchema, schemaCtx } from '../../src/rendering/editor/field-index';
import { withholdInertFields } from '../../src/rendering/editor/filter';
import type { HaFormSchema } from '../../src/rendering/editor/ha-form';
import { lookup } from '../../src/rendering/editor/localize';
import { placementOf } from '../../src/rendering/editor/pages';
import { workspaceFormData } from '../../src/rendering/editor/routing';
import {
  type SearchEntry,
  type SearchOwner,
  buildSearchIndex,
  search,
} from '../../src/rendering/editor/search';
import type { EditorWorkspace } from '../../src/rendering/editor/workspace';

/** What the index is built for besides the configuration. */
export interface IndexOptions {
  readonly workspace?: EditorWorkspace;
  readonly language?: string;
  readonly hass?: Types.Hass;
  /** Each calendar entry's fields, where a test hands its own; else as the editor builds them. */
  readonly entrySchemas?: ReadonlyArray<ReadonlyArray<HaFormSchema>>;
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
  const present = buildFieldIndex(ctx).fields;
  const shown = new Set([...present.keys()].filter((id) => placementOf(id) !== undefined));
  const entries: SearchOwner[] = (config.entities ?? []).map((entry, index) => ({
    entry,
    index,
    key: index,
    schema: options.entrySchemas?.[index]
      ? withholdInertFields(options.entrySchemas[index], workspace, 'entity')
      : entrySchema(entry, ctx),
  }));
  return buildSearchIndex({
    ...ctx,
    hass: options.hass,
    present,
    shown,
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
  return search(index, query).map(({ entry: { target } }) =>
    target.kind === 'field' ? target.id : `${target.id}@${target.key}`,
  );
}
