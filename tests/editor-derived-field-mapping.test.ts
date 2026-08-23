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
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';

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

/**
 * Every value the per-calendar dropdowns offer, by control.
 *
 * Unioned across both views, because a control the column view alone renders is still a
 * control, and a union can only widen what the reconciliation below has to account for.
 *
 * @returns Option values per control name, sorted
 */
function offeredOptions(): Map<string, string[]> {
  const found = new Map<string, Set<string>>();

  for (const view of ['list', 'column'] as const) {
    const config = { ...DEFAULT_CONFIG, view, entities: ['calendar.a'] } as Types.Config;

    for (const { node } of walkSchema(buildEntitySchema({ view, config, language: 'en' }))) {
      if (isGroupSchema(node) || !('selector' in node)) continue;
      if (!('select' in node.selector)) continue;

      const options = node.selector.select?.options;
      if (!options) continue;

      const values = found.get(node.name) ?? new Set<string>();
      for (const option of options) values.add(typeof option === 'string' ? option : option.value);
      found.set(node.name, values);
    }
  }

  return new Map([...found].map(([name, values]) => [name, [...values].sort()]));
}

/**
 * Every option the per-calendar strings name, by control.
 *
 * The `entity.` prefix is what makes this the right second surface and not a coincidence:
 * a per-calendar dropdown resolves its labels through `entity.<name>.option.<value>.label`,
 * where the card-wide controls use an unprefixed key of their own. So the two sets are
 * exactly the per-calendar options, and reconciling them needs no list of exceptions.
 *
 * @returns Option values per control name, sorted
 */
function namedOptions(): Map<string, string[]> {
  const found = new Map<string, Set<string>>();

  for (const key of Object.keys(EDITOR_STRINGS)) {
    const match = /^entity\.([a-z0-9_]+)\.option\.([a-z0-9_]+)\.label$/.exec(key);
    if (!match) continue;

    const values = found.get(match[1]) ?? new Set<string>();
    values.add(match[2]);
    found.set(match[1], values);
  }

  return new Map([...found].map(([name, values]) => [name, [...values].sort()]));
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

/**
 * The same lesson one level down, on the options a per-calendar dropdown offers.
 *
 * 🚨 An option list is a table, and every assertion in the suite reads it by walking it —
 * which is the failure this repository has already paid for three times. Remove an entry
 * and the walk runs one fewer time; nothing counts, so nothing notices. Measured rather
 * than argued: dropping `person` from `LABEL_IMAGE_SOURCES` takes a person's picture out
 * of the editor's Image Source dropdown altogether, leaving the feature reachable only by
 * writing YAML by hand — and **all nine gates stay green**, this suite among them, with
 * no test failing anywhere. Every existing assertion covers whether the control is
 * *there* and which picker it renders, both of which survive, because the mode is derived
 * from the stored label rather than read back off the list.
 *
 * Reconciled against the strings that name the options rather than against a second copy
 * of the list, for the reason the block above gives: a second list is one more thing to
 * forget, and forgetting is the bug. This one fails on a dropdown nobody has written yet.
 */
describe('per-calendar dropdowns and the strings naming their options agree', () => {
  it('finds both surfaces, so an empty walk cannot agree with an empty string table', () => {
    expect(offeredOptions().size, 'the schema walk found no dropdowns').toBeGreaterThan(5);
    expect(namedOptions().size, 'no per-calendar option strings were found').toBeGreaterThan(5);
  });

  /**
   * A string naming an option no dropdown offers. That is what a dropped table entry looks
   * like from here, and it is the direction with teeth: the option simply stops existing in
   * the editor, while the control, its helper text and its translations all stay put.
   */
  it('offers every option its strings name', () => {
    const offered = offeredOptions();

    for (const [name, values] of namedOptions()) {
      expect(offered.get(name) ?? [], `${name} names options it does not offer`).toEqual(values);
    }
  });

  /**
   * The other direction. An option with no string of its own still renders — `lookup` falls
   * back to `humanize` — so it appears in the dropdown as an untranslated, capitalized
   * version of its own value, in all eleven editor languages. That reads as a translation
   * gap rather than as the missing string it is.
   */
  it('names every option it offers', () => {
    const named = namedOptions();

    for (const [name, values] of offeredOptions()) {
      expect(named.get(name) ?? [], `${name} offers options nothing names`).toEqual(values);
    }
  });
});
