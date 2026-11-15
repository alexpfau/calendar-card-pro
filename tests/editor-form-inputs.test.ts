/**
 * One-off proof for the pull request that takes presentation out of the panel builders: every
 * control the editor draws is handed the same inputs before and after.
 *
 * Outer DOM cannot show this, because `ha-form` is an unknown element under happy-dom and its
 * properties never reach the serialized markup. So this reads what each field's form is handed,
 * for every page, corpus state and scope, and reduces it to a canonical record per field: its id,
 * its selector with options, its data path and value, the label and helper the form's own
 * `computeLabel` and `computeHelper` resolve for it, the wrapper's accessible name and its `hass`
 * feed. Grid names, `titleKey`, `flatten` and other label metadata are deliberately not compared
 * as such: the stripping changes them on purpose, and what they are for is already folded into the
 * resolved strings and the data path.
 *
 * The clock is pinned, because the corpus opens Start Date's fixed-date gate with today's date.
 *
 * The fixture was generated at the base commit (`WRITE_FORM_INPUTS=1`, then `npx prettier --write`
 * on the file it writes). The test and the fixture are deleted by the pull request's last commit,
 * so no frozen oracle outlives it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as nodeTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type MountedEditor, changeField, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { placementOf } from '../src/rendering/editor/pages';
import { WORKSPACES } from '../src/rendering/editor/workspace';

const FIXTURE = join(process.cwd(), 'tests', 'editor-form-inputs.fixture.json');

interface Fixture {
  /** Each distinct field record, sorted by its canonical form. */
  readonly records: ReadonlyArray<unknown>;
  /** Each distinct run of records a place drew, in document order, as indexes into `records`. */
  readonly runs: ReadonlyArray<ReadonlyArray<number>>;
  /** The run each place drew, by place. */
  readonly visits: Readonly<Record<string, number>>;
}

/** The form element as the editor hands it its inputs. */
interface Form {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
  computeLabel?: (schema: HaFormSchema, data?: unknown, options?: { path?: string[] }) => string;
  computeHelper?: (schema: HaFormSchema, options?: { path?: string[] }) => string | undefined;
}

/**
 * Serializes with object keys sorted, so equal records hash alike.
 *
 * @param value - Value to serialize
 * @returns Canonical JSON
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((key) => [key, (inner as Record<string, unknown>)[key]]),
        )
      : inner,
  );
}

/**
 * Reads a value at a data path.
 *
 * @param data - Form data
 * @param path - Keys, outermost first
 * @returns The value, or `undefined`
 */
function at(data: unknown, path: ReadonlyArray<string>): unknown {
  let cursor = data;
  for (const step of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[step];
  }
  return cursor;
}

/**
 * The canonical record of every control a form is handed, walked as `ha-form` walks it: a named
 * collapsible adds to the label path it hands down, and a named group that is not flattened nests
 * the data.
 *
 * @param frame - The field's wrapper
 * @param form - Its form
 * @returns One record per control
 */
function records(frame: HTMLElement, form: Form): unknown[] {
  const out: unknown[] = [];
  const walk = (
    schema: ReadonlyArray<HaFormSchema>,
    path: ReadonlyArray<string>,
    dataPath: ReadonlyArray<string>,
  ): void => {
    for (const node of schema) {
      if ('schema' in node) {
        walk(
          node.schema,
          node.type === 'expandable' && node.name !== '' ? [...path, node.name] : path,
          node.name !== '' && node.flatten !== true ? [...dataPath, node.name] : dataPath,
        );
        continue;
      }
      const options = path.length > 0 ? { path: [...path] } : undefined;
      const data = at(form.data, dataPath);
      out.push({
        id: frame.dataset.field,
        wrapper: frame.getAttribute('aria-label'),
        hass: frame.querySelector('ha-form')?.getAttribute('data-hass') ?? null,
        name: node.name,
        kind: 'selector' in node ? 'selector' : node.type,
        selector: 'selector' in node ? node.selector : null,
        dataPath,
        value: at(data, [node.name]) ?? null,
        label: form.computeLabel?.(node, data, options) ?? null,
        helper: form.computeHelper?.(node, options) ?? null,
      });
    }
  };
  walk(form.schema, [], []);
  return out;
}

/**
 * Packs what each place drew: each distinct record once, each distinct run of them once.
 *
 * @param drawn - Records by place
 * @returns The fixture
 */
function pack(drawn: ReadonlyMap<string, ReadonlyArray<unknown>>): Fixture {
  const records = [...new Set([...drawn.values()].flat().map(canonical))].sort();
  const recordIndex = new Map(records.map((text, index) => [text, index]));
  const runs: number[][] = [];
  const runIndex = new Map<string, number>();
  const visits: Record<string, number> = {};
  for (const place of [...drawn.keys()].sort()) {
    const run = drawn.get(place)!.map((record) => recordIndex.get(canonical(record))!);
    const key = run.join(',');
    if (!runIndex.has(key)) {
      runIndex.set(key, runs.length);
      runs.push(run);
    }
    visits[place] = runIndex.get(key)!;
  }
  return { records: records.map((text) => JSON.parse(text) as unknown), runs, visits };
}

/**
 * Unpacks a fixture into the records each place drew.
 *
 * @param fixture - The fixture
 * @returns Records by place
 */
function unpack(fixture: Fixture): Map<string, unknown[]> {
  return new Map(
    Object.entries(fixture.visits).map(([place, run]) => [
      place,
      fixture.runs[run].map((index) => fixture.records[index]),
    ]),
  );
}

/**
 * Clicks a rendered control, then waits for the editor to draw what it opens.
 *
 * @param editor - Editor element
 * @param selector - The control
 */
async function click(editor: MountedEditor, selector: string): Promise<void> {
  const control = editor.shadowRoot!.querySelector<HTMLElement>(selector);
  if (control === null) throw new Error(`The editor draws no ${selector}`);
  control.click();
  await editor.updateComplete;
}

describe('canonical form inputs', () => {
  let editor: MountedEditor | undefined;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-04T12:00:00Z') });
  });
  afterAll(() => {
    editor?.remove();
    vi.useRealTimers();
  });

  it('hands every control the same inputs as at the base commit, over the corpus in every scope', async () => {
    editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    const drawn = new Map<string, unknown[]>();
    const read = (place: string): void => {
      const list: unknown[] = [];
      for (const frame of editor!.shadowRoot!.querySelectorAll<HTMLElement>('[data-field]')) {
        const form = frame.querySelector('ha-form') as unknown as (Form & HTMLElement) | null;
        if (form !== null) list.push(...records(frame, form));
      }
      drawn.set(place, list);
    };

    const seen = new Set<string>();
    const stateKeys = new Set<string>();
    for (const workspace of WORKSPACES) {
      for (const state of corpus().filter((candidate) => candidate.workspace === workspace)) {
        const config = state.config as Types.Config;
        const key = `${workspace} ${JSON.stringify(config)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const named = `${workspace} ${state.display} ${state.gate ?? 'fresh'}${state.branch === undefined ? '' : `#${state.branch}`}`;
        let stateKey = named;
        for (let n = 2; stateKeys.has(stateKey); n++) stateKey = `${named} (${n})`;
        stateKeys.add(stateKey);

        const pages = new Set<string>();
        for (const field of buildFieldIndex(schemaCtx(config, workspace, 'en')).fields.values()) {
          const page = placementOf(field.id)?.page;
          if (page !== undefined && page !== 'overview') pages.add(page);
        }

        editor.setConfig({ ...config, config_version: Config.CURRENT_CONFIG_VERSION });
        await editor.updateComplete;
        while (editor.shadowRoot!.querySelector('[data-focus="back-top"]') !== null) {
          await click(editor, '[data-focus="back-top"]');
        }
        await changeField(editor, 'workspace:editing_workspace', workspace);

        read(`${stateKey} overview`);
        for (const page of [...pages].sort()) {
          await click(editor, `[data-focus="nav:${page}"]`);
          read(`${stateKey} ${page}`);
          await click(editor, '[data-focus="back-top"]');
        }
        await nodeTimeout(0);
      }
    }

    const actual = pack(drawn);
    const controls = [...drawn.values()].reduce((sum, list) => sum + list.length, 0);
    console.info(
      `form inputs: ${seen.size} corpus states, ${drawn.size} places, ` +
        `${controls} controls, ${actual.records.length} distinct records`,
    );
    expect(controls).toBeGreaterThan(10_000);

    if (process.env.WRITE_FORM_INPUTS === '1') {
      writeFileSync(FIXTURE, `${canonical(actual)}\n`);
      return;
    }

    const expected = unpack(JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture);
    const places = [...new Set([...expected.keys(), ...drawn.keys()])].sort();
    const differing = places.filter(
      (place) => canonical(expected.get(place)) !== canonical(drawn.get(place)),
    );
    console.info(`form inputs: ${places.length} places compared, ${differing.length} differ`);
    expect(drawn.size).toBe(expected.size);
    expect(Object.fromEntries(differing.map((place) => [place, drawn.get(place) ?? null]))).toEqual(
      Object.fromEntries(differing.map((place) => [place, expected.get(place) ?? null])),
    );
  }, 600_000);
});
