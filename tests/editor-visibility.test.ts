/**
 * A calendar's visibility conditions in the visual editor.
 *
 * Written as YAML in Home Assistant's own code editor (the `object` selector), under a Visibility
 * heading of their own directly before Event Filtering: whether an entry shows at all is the
 * coarsest question its panel asks. Pinned here: the field and its words, that conditions written
 * in the YAML editor reach the stored entry as written and come back to the form unchanged, and
 * that a cleared editor stores nothing, since an empty object would read as one condition the
 * card cannot judge and hide the calendar. Its place among the panel's other fields is pinned
 * with them, in `editor-filter.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Entities from '../src/rendering/editor/entities';
import { lookup } from '../src/rendering/editor/localize';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

const ANNA = 'calendar.anna';

const CONDITIONS = [
  { condition: 'user', users: ['8a1c'] },
  {
    condition: 'or',
    conditions: [{ condition: 'state', entity: 'input_boolean.guest', state: 'on' }],
  },
];

describe('the visibility field', () => {
  it('is a code editor under a heading of its own', () => {
    const schema = buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });
    const at = schema.findIndex((node) => node.name === 'visibility');

    expect(schema[at]).toEqual({ name: 'visibility', selector: { object: {} } });
    expect(schema[at - 1]).toEqual({ name: 'heading_visibility', type: 'constant' });
  });

  it("is named in Home Assistant's words, and explained", () => {
    expect({
      heading: lookup('en', 'heading_visibility'),
      label: lookup('en', 'entity.visibility'),
      helper: EDITOR_STRINGS['entity.visibility.helper'],
    }).toEqual({
      heading: 'Visibility',
      label: 'Conditions',
      helper:
        'Shows this calendar\u2019s events only while all of these hold, written as YAML in the ' +
        'shapes a card\u2019s Visibility tab writes: user, state, numeric state, screen and time ' +
        'conditions. Left empty, they always show. Not applied while you edit the card.',
    });
  });

  it('is translated in every language that translates the name', () => {
    const missing = Object.entries(EDITOR_LANGUAGE_STRINGS)
      .filter(([, strings]) => strings['entity.name'] !== undefined)
      .filter(
        ([, strings]) =>
          !strings.heading_visibility ||
          !strings['entity.visibility'] ||
          !strings['entity.visibility.helper'],
      )
      .map(([language]) => language);

    expect(Object.keys(EDITOR_LANGUAGE_STRINGS).length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});

describe('writing visibility conditions', () => {
  it('stores them as written, and shows them again as written', () => {
    const entry = Entities.fromEntityFormData(ANNA, { visibility: CONDITIONS });

    expect(entry).toEqual({ entity: ANNA, visibility: CONDITIONS });
    expect(Entities.toEntityFormData(entry).visibility).toEqual(CONDITIONS);
  });

  it('stores nothing for a cleared editor, whatever it hands back', () => {
    for (const cleared of [undefined, null, '', [], {}]) {
      expect(Entities.fromEntityFormData(ANNA, { visibility: cleared })).toBe(ANNA);
    }
  });

  it('keeps them through an edit to anything else', () => {
    const before = { entity: ANNA, label: 'A', visibility: CONDITIONS };
    const after = Entities.fromEntityFormData(
      ANNA,
      { ...Entities.toEntityFormData(before), label: 'B' },
      before,
    );

    expect(after).toEqual({ entity: ANNA, label: 'B', visibility: CONDITIONS });
  });
});
