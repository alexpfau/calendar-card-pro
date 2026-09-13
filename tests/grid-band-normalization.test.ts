import { type TemplateResult, render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { workspaceFields } from '../src/rendering/editor/routing';
import * as Logger from '../src/utils/logger';

customElements.define('grid-band-normalization-editor-test', CalendarCardProEditor);

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  events: Types.CalendarEventData[];
  isInitialLoad: boolean;
  render(): TemplateResult;
}

interface Editor extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  readonly updateComplete: Promise<boolean>;
}

interface Form extends HTMLElement {
  schema: HaFormSchema[];
  data: Record<string, unknown>;
}

function draw(raw: Record<string, unknown>): { first: string; last: string } {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({
    view: 'grid',
    entities: ['calendar.anna'],
    days_to_show: 1,
    start_date: '2026-06-17',
    time_24h: true,
    ...raw,
  });
  card.hass = { states: {}, locale: { language: 'en' } };
  card.events = [];
  card.isInitialLoad = false;
  const container = document.createElement('div');
  render(card.render(), container);
  const labels = [...container.querySelectorAll('.grid-axis-label')].map((label) =>
    label.textContent!.trim(),
  );
  expect(labels.length).toBeGreaterThan(1);
  return { first: labels[0], last: labels.at(-1)! };
}

function formFor(editor: Editor, key: string): Form {
  const forms = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form')].filter((form) =>
    [...workspaceFields(form.schema)].some(({ node }) => node.name === key),
  );
  expect(forms).toHaveLength(1);
  return forms[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('joint band validation after card normalization', () => {
  it.each([
    { start_time: 8, end_time: '19:00' },
    { start_time: '08:00', end_time: 19 },
    { start_time: 0, end_time: '19:00' },
    { start_time: null, end_time: '19:00' },
    { start_time: true, end_time: '19:00' },
    { start_time: ['08:00'], end_time: '19:00' },
    { start_time: {}, end_time: '19:00' },
    { start_time: 'bad', end_time: '19:00' },
    { start_time: '08:00', end_time: 'bad' },
    { start_time: '19:00', end_time: '08:00' },
  ])('defaults both invalid supplied bounds: %j', (time_grid) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    expect(draw({ time_grid })).toEqual({ first: '7', last: '22' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/time_grid.*07:00.*22:00/));
  });

  it.each([
    { time_grid: {}, first: '7', last: '22' },
    { time_grid: { end_time: '19:00' }, first: '7', last: '19' },
    { time_grid: { start_time: '08:00' }, first: '8', last: '22' },
    { time_grid: { start_time: undefined, end_time: '19:00' }, first: '7', last: '19' },
    { time_grid: { start_time: '08:00', end_time: '19:00' }, first: '8', last: '19' },
    { time_grid: { start_time: '08:00', end_time: '24:00' }, first: '8', last: '0' },
  ])('keeps valid or omitted bounds: $first-$last', ({ time_grid, first, last }) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    expect(draw({ time_grid })).toEqual({ first, last });
    expect(warn).not.toHaveBeenCalled();
  });
});

it.each([
  { start_time: 8, end_time: '19:00' },
  { start_time: '08:00', end_time: 19 },
])(
  'retains an invalid band through editor projection and an unrelated save: %j',
  async (time_grid) => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const editor = document.createElement('grid-band-normalization-editor-test') as Editor;
    editor.setConfig({ config_version: 5, view: 'grid', entities: ['calendar.anna'], time_grid });
    editor.hass = { states: {}, locale: { language: 'en' } };
    document.body.append(editor);
    await editor.updateComplete;
    const reports: Record<string, unknown>[] = [];
    editor.addEventListener('config-changed', (event) =>
      reports.push((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config),
    );
    const axis = formFor(editor, 'start_time').data.time_grid;
    const invalidKey = typeof time_grid.start_time === 'number' ? 'start_time' : 'end_time';
    expect(axis).toHaveProperty(invalidKey, String(time_grid[invalidKey]));
    expect(draw({ time_grid: axis })).toEqual({ first: '7', last: '22' });
    const form = formFor(editor, 'title');
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...form.data, title: 'Keep invalid bounds visible' } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(reports).toHaveLength(1);
    expect(draw(reports[0])).toEqual({ first: '7', last: '22' });
    const repair = formFor(editor, invalidKey);
    repair.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: {
          value: {
            ...repair.data,
            time_grid: {
              ...(repair.data.time_grid as Record<string, unknown>),
              [invalidKey]: invalidKey === 'start_time' ? '08:00' : '19:00',
            },
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(reports).toHaveLength(2);
    expect(draw(reports[1])).toEqual({ first: '8', last: '19' });
  },
);
