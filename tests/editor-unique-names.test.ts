/**
 * No two fields on one page share a name (ia-final §5 rule 5).
 *
 * A field's accessible name is its label: the card-owned wrapper around each field's form is
 * named after it (`aria-label`), and so is the control inside. Two fields named alike on one page
 * are two things a screen reader, a search result or an Undo label cannot tell apart. Checked
 * over the whole gate corpus in every scope, so a field that appears only once a gate opens is
 * checked against its neighbors as they then stand; calendar entry pages too, one entry at a
 * time.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  type FieldId,
  buildFieldIndex,
  entityFieldIndex,
  entrySchema,
  fieldLabel,
  schemaCtx,
} from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import { placementOf } from '../src/rendering/editor/pages';
import { WORKSPACES } from '../src/rendering/editor/workspace';

const STATES = corpus();

/**
 * The labels on each page, by page, for one built set of fields.
 *
 * @param labels - Field ids with their labels
 * @returns The pages that draw two fields alike, each with the name and the ids sharing it
 */
function clashes(
  labels: ReadonlyArray<readonly [FieldId, string, string]>,
): Array<{ page: string; name: string; ids: FieldId[] }> {
  const byPage = new Map<string, Map<string, FieldId[]>>();
  for (const [id, page, name] of labels) {
    const names = byPage.get(page) ?? new Map<string, FieldId[]>();
    const key = name.trim().toLowerCase();
    names.set(key, [...(names.get(key) ?? []), id]);
    byPage.set(page, names);
  }
  return [...byPage].flatMap(([page, names]) =>
    [...names].filter(([, ids]) => ids.length > 1).map(([name, ids]) => ({ page, name, ids })),
  );
}

describe('unique names on a page', () => {
  it('names every card field on a page differently, over the corpus in every scope', () => {
    const found = new Map<string, { page: string; name: string; ids: FieldId[] }>();
    let pages = 0;
    let fields = 0;
    for (const workspace of WORKSPACES) {
      for (const state of STATES.filter((candidate) => candidate.workspace === workspace)) {
        const ctx = schemaCtx(state.config, workspace, 'en');
        const labels = [...buildFieldIndex(ctx).fields.values()].map(
          (field) =>
            [field.id, placementOf(field.id)?.page ?? 'unplaced', fieldLabel(field, 'en')] as const,
        );
        fields += labels.length;
        pages += new Set(labels.map(([, page]) => page)).size;
        for (const clash of clashes(labels)) found.set(`${clash.page}:${clash.name}`, clash);
      }
    }
    console.info(
      `unique names: ${STATES.length} corpus states, ${WORKSPACES.length} scopes, ` +
        `${pages} drawn pages, ${fields} fields named`,
    );
    expect(fields).toBeGreaterThan(10_000);
    expect([...found.values()]).toEqual([]);
  });

  it('names every field on a calendar entry page differently', () => {
    const found: Array<{ page: string; name: string; ids: FieldId[] }> = [];
    let entries = 0;
    for (const workspace of WORKSPACES) {
      for (const state of STATES.filter((candidate) => candidate.workspace === workspace)) {
        const ctx = schemaCtx(state.config, workspace, 'en');
        for (const entry of state.config.entities ?? []) {
          entries++;
          const labels = [...entityFieldIndex(entrySchema(entry, ctx)).fields.values()].map(
            (field) => [field.id, 'entry', fieldLabel(field, 'en')] as const,
          );
          found.push(...clashes(labels));
        }
      }
    }
    console.info(`unique names: ${entries} calendar entry pages`);
    expect(entries).toBeGreaterThan(100);
    expect(found).toEqual([]);
  });

  it('names Weather’s day and event settings by where they show', () => {
    const config = {
      ...DEFAULT_CONFIG,
      entities: ['calendar.anna'],
      weather_entity: 'weather.home',
      list: {
        weather: {
          position: 'both',
          date: { show_uv_index: true },
          event: { show_uv_index: true },
        },
      },
    } as Types.Config;
    const ctx = schemaCtx(config, 'list', 'en');
    const index = buildFieldIndex(ctx);
    const label = (id: FieldId): string => fieldLabel(index.fields.get(id)!, 'en');
    expect(label('weather:weather.date.show_conditions')).toBe('Show Conditions Beside Days');
    expect(label('weather:weather.event.show_conditions')).toBe('Show Conditions Beside Events');
    expect(label('weather:weather.date.uv_index_threshold')).toBe('UV Index Threshold Beside Days');
    expect(label('weather:weather.event.color')).toBe('Color Beside Events');
  });
});
