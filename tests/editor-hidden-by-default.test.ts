/**
 * The per-calendar "Hidden by Default" switch in the visual editor (backlog item 425).
 *
 * Pinned here: where it sits and when it is offered, and that it belongs to the calendar as Show in
 * Calendar Filter does. It is offered only where the filter lists the calendar, since a calendar
 * started hidden anywhere else could never be shown again; a change is written to every block of
 * the calendar; Remove leaves it, Copy and Paste do not carry it, and an entry pointed at another
 * calendar takes that calendar's. Only `true` is stored.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import {
  changeField,
  entry,
  fakeHass,
  formsOf,
  keysOf,
  mountEditor,
  openPanels,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as CalendarList from '../src/rendering/editor/calendar-list';
import * as Entities from '../src/rendering/editor/entities';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

/** The fields a schema renders, in order, headings excluded. */
function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node))
    .filter(({ node }) => !('type' in node && node.type === 'constant'))
    .map(({ node }) => node.name);
}

describe('the switch', () => {
  const declared = () => buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });

  it('follows Show in Calendar Filter, as a switch, named for what it does', () => {
    const names = fieldNames(declared());
    const at = names.indexOf('show_in_legend');

    expect(names[at + 1]).toBe('hidden_by_default');
    expect(declared().find((node) => node.name === 'hidden_by_default')).toEqual({
      name: 'hidden_by_default',
      selector: { boolean: {} },
    });
    expect(lookup('en', 'entity.hidden_by_default')).toBe('Hidden by Default');
  });

  it('is offered only where the filter is shown and lists the calendar', () => {
    const offered = (hasLegend: boolean, listed: boolean) =>
      fieldNames(
        entitySchemaFor(
          declared(),
          'text',
          'custom',
          'custom',
          true,
          'custom',
          hasLegend,
          true,
          false,
          listed,
        ),
      ).includes('hidden_by_default');

    expect([offered(true, true), offered(true, false), offered(false, true)]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('is translated wherever Show in Calendar Filter is', () => {
    const missing = Object.entries(EDITOR_LANGUAGE_STRINGS)
      .filter(([, strings]) => strings['entity.show_in_legend'] !== undefined)
      .filter(
        ([, strings]) =>
          !strings['entity.hidden_by_default'] || !strings['entity.hidden_by_default.helper'],
      )
      .map(([language]) => language);

    expect(Object.keys(EDITOR_LANGUAGE_STRINGS).length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});

describe('writing it', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
  });

  it('stores only true, and writes it to every block of the calendar', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      BEN,
      { entity: ANNA, event_type: 'all_day' },
    ];

    const on = Entities.writeEntity(entities, 2, {
      ...Entities.toEntityFormData(entities[2], entities),
      hidden_by_default: true,
    });
    expect(on).toEqual([
      { entity: ANNA, hidden_by_default: true, event_type: 'timed' },
      BEN,
      { entity: ANNA, hidden_by_default: true, event_type: 'all_day' },
    ]);
    expect(on.map((each) => Entities.toEntityFormData(each, on).hidden_by_default)).toEqual([
      true,
      false,
      true,
    ]);

    const off = Entities.writeEntity(on, 0, {
      ...Entities.toEntityFormData(on[0], on),
      hidden_by_default: false,
    });
    expect(off).toEqual(entities);
  });

  it('stays with the calendar through Remove, and out of Copy and Paste', () => {
    expect(
      Entities.removeEntity(
        [
          { entity: ANNA, event_type: 'timed' },
          { entity: ANNA, event_type: 'all_day', hidden_by_default: true },
        ],
        1,
      ),
    ).toEqual([{ entity: ANNA, hidden_by_default: true, event_type: 'timed' }]);

    Entities.copySettings({ entity: ANNA, hidden_by_default: true, color: '#f00' });
    expect(Entities.copiedSettings()).toEqual({ color: '#f00' });
    expect(Entities.pasteSettings([BEN], 0)).toEqual([{ entity: BEN, color: '#f00' }]);
  });

  it('is taken from the calendar an entry is pointed at, and left behind with the other', () => {
    const state = {
      entities: [
        { entity: ANNA, hidden_by_default: true, color: '#f00' },
        { entity: BEN, show_in_legend: false },
      ] as Array<string | Types.EntityConfig>,
      keys: [1, 2],
    };

    // Anna's entry joins Ben's calendar, which the filter leaves out and does not start hidden:
    // it takes both of Ben's settings, and keeps its color, which is its own.
    const { state: moved, adopted } = CalendarList.repointEntry(state, 0, BEN);
    expect(adopted).toBe(true);
    expect(moved.entities).toEqual([
      { entity: BEN, show_in_legend: false },
      { entity: BEN, show_in_legend: false, color: '#f00' },
    ]);

    // The other way round, a bare entry joining a calendar that starts hidden takes that.
    const back = CalendarList.repointEntry(
      { entities: [{ entity: ANNA, hidden_by_default: true }, BEN], keys: [1, 2] },
      1,
      ANNA,
    );
    expect(back.state.entities).toEqual([
      { entity: ANNA, hidden_by_default: true },
      { entity: ANNA, hidden_by_default: true },
    ]);
  });
});

describe('the switch in the rendered editor', () => {
  async function render(entities: ReadonlyArray<unknown>, toolbar?: Types.ToolbarConfig) {
    const states = Object.fromEntries(
      [ANNA, BEN].map((id) => [id, { entity_id: id, state: 'off', attributes: {} }]),
    );
    const element = await mountEditor(
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities,
        ...(toolbar ? { toolbar } : {}),
      },
      { hass: fakeHass({ states }) },
    );
    await openPanels(element);
    const emitted: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
    });
    return {
      element,
      emitted,
      offers: () =>
        keysOf(element, 'entry').map((_, index) =>
          formsOf(element, entry(index))
            .flatMap((form) => fieldNames(form.schema))
            .includes('hidden_by_default'),
        ),
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is offered for a calendar the filter lists, and not for one it leaves out', async () => {
    const editor = await render([ANNA, { entity: BEN, show_in_legend: false }], {
      show: true,
      legend: 'chips',
    });
    expect(editor.offers()).toEqual([true, false]);

    document.body.innerHTML = '';
    expect((await render([ANNA], { show: true, legend: false })).offers()).toEqual([false]);
  }, 30_000);

  it('writes the switch to every block of the calendar', async () => {
    const editor = await render([ANNA, { entity: ANNA, event_type: 'all_day' }, BEN], {
      show: true,
      legend: 'chips',
    });

    await changeField(editor.element, 'calendar:hidden_by_default', true, entry(1));

    expect(editor.emitted).toHaveLength(1);
    expect(editor.emitted[0].entities).toEqual([
      { entity: ANNA, hidden_by_default: true },
      { entity: ANNA, hidden_by_default: true, event_type: 'all_day' },
      BEN,
    ]);
  });
});
