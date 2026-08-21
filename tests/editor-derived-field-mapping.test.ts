/**
 * Every per-calendar control that stores nothing of its own must be mapped to the keys it
 * does decide.
 *
 * 🚨 This test exists because a comment was not enough. `entityConfigKeys` carried a
 * paragraph explaining precisely this hazard, written for `label_icon_source` and correct
 * about it — and `accent_color_mode`, the other half of the same "follow Home Assistant"
 * feature, arrived in a separate pull request weeks later and was never added. The note
 * was beside the code the whole time and did not generalize, because nothing asked it to.
 *
 * The reconciliation is against `EntityConfig` rather than against a second list, so it
 * needs no maintenance: a control whose name is not a config key is *by construction* a
 * derived one, and a derived control that answers for itself names a key no calendar can
 * ever carry.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import * as Types from '../src/config/types';
import { type HaFormSchema, isGroupSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEntitySchema, entityConfigKeys } from '../src/rendering/editor/schemas/entity';

/**
 * The members of `EntityConfig`, read from the source.
 *
 * Read as text rather than imported because an interface leaves nothing behind at runtime.
 * The same scan backs `tests/entity-config-reprocess.test.ts`.
 *
 * @returns Every per-calendar config key, the entity id included
 */
function declaredEntityKeys(): string[] {
  const source = readFileSync(join(process.cwd(), 'src/config/types.ts'), 'utf-8');
  const block = source.match(/export interface EntityConfig\s*\{([\s\S]*?)\n\}/);

  if (!block) throw new Error('EntityConfig not found in types.ts — fix this scan');

  return [...block[1].matchAll(/^ {2}([a-z0-9_]+)\??:/gm)].map((match) => match[1]);
}

/**
 * Every field the per-calendar panel renders, headings and grids excluded.
 *
 * @returns The control names, in declaration order
 */
function entityFieldNames(): string[] {
  const config = { ...DEFAULT_CONFIG, entities: ['calendar.a'] } as Types.Config;
  const schema: HaFormSchema[] = buildEntitySchema({ view: 'list', config, language: 'en' });

  const names: string[] = [];
  for (const { node } of walkSchema(schema)) {
    if (isGroupSchema(node)) continue;
    if ('type' in node && node.type === 'constant') continue;
    names.push(node.name);
  }

  return names;
}

describe('per-calendar derived controls are mapped to the keys they decide', () => {
  it('finds both surfaces, so an empty scan cannot agree with an empty mapping', () => {
    expect(declaredEntityKeys().length, 'the EntityConfig scan found nothing').toBeGreaterThan(5);
    expect(entityFieldNames().length, 'the schema walk found no fields').toBeGreaterThan(5);
  });

  /**
   * The assertion the comment in `entityConfigKeys` could only make in prose.
   *
   * A control named for a real config key answers for itself and needs no entry. A control
   * named for anything else is derived, and must be mapped — otherwise
   * `isEntityFieldCustomized` looks up a key no stored calendar has and answers `false` for
   * every calendar, forever.
   */
  it('maps every control that is not itself a config key', () => {
    const declared = new Set(declaredEntityKeys());

    const unmapped = entityFieldNames()
      .filter((name) => !declared.has(name))
      .filter((name) => {
        const keys = entityConfigKeys(name);
        return keys.length === 1 && keys[0] === name;
      });

    expect(unmapped, 'derived controls with no entry in entityConfigKeys').toEqual([]);
  });

  /**
   * The other direction. A mapping pointing at a key the interface does not declare is a
   * typo that reads exactly like the bug it was written to prevent, and answers `false`
   * just as silently.
   */
  it('maps every control onto keys the interface actually declares', () => {
    const declared = new Set(declaredEntityKeys());

    for (const name of entityFieldNames()) {
      for (const key of entityConfigKeys(name)) {
        expect(declared.has(key), `${name} is mapped to ${key}, which EntityConfig has not`).toBe(
          true,
        );
      }
    }
  });
});
