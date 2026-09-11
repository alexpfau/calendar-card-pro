/**
 * Rendered-editor coverage for the five form handlers that are not the
 * copy/paste buttons.
 *
 * `tests/editor-copy-paste-wiring.test.ts` renders the editor and clicks its
 * two action buttons. Every other interactive surface in the editor is a
 * `value-changed` listener on an `ha-form`, and none of them had a test that
 * dispatched one: the filter bar, the panel option forms, the per-calendar
 * forms, and the two exception forms could each be unwired without any gate
 * noticing. These tests dispatch the same bubbling, composed `value-changed`
 * event Home Assistant's own forms emit, and assert what the editor does with
 * it -- the reported config, the re-rendered panel list, and the fact that the
 * event is stopped rather than allowed to escape into the dashboard.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Entities from '../src/rendering/editor/entities';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';

customElements.define('editor-form-wiring-probe', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
}

/** Mounts a configured editor and waits for its first render. */
async function mount(config: Record<string, unknown>): Promise<EditorHost> {
  const element = document.createElement('editor-form-wiring-probe') as EditorHost;
  element.hass = { states: {}, locale: { language: 'en' } };
  document.body.appendChild(element);
  element.setConfig(config);
  await element.updateComplete;
  return element;
}

/** Collects every config the editor reports while `run` executes. */
function reported(element: EditorHost): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    seen.push((event as CustomEvent).detail.config as Record<string, unknown>);
  });
  return seen;
}

/**
 * Dispatches the event shape `ha-form` emits: bubbling and composed, so an
 * un-stopped event would cross the shadow boundary and reach the document.
 */
function change(form: Element, value: Record<string, unknown>): void {
  form.dispatchEvent(
    new CustomEvent('value-changed', { detail: { value }, bubbles: true, composed: true }),
  );
}

/** The `.data` an `ha-form` was rendered with, as a mutable copy. */
function formData(form: Element): Record<string, unknown> {
  return { ...((form as unknown as { data?: Record<string, unknown> }).data ?? {}) };
}

/** The field names in an `ha-form`'s schema. */
function schemaNames(form: Element): string[] {
  const schema = (form as unknown as { schema?: HaFormSchema[] }).schema ?? [];
  return [...walkSchema(schema)].map(({ node }) => node.name);
}

/** The panel form that owns a given option. */
function panelOwning(element: EditorHost, option: string): Element {
  const forms = Array.from(element.shadowRoot!.querySelectorAll('ha-form.panel-form'));
  const owner = forms.find((form) => schemaNames(form).includes(option));
  if (!owner) throw new Error(`no panel form owns ${option}`);
  return owner;
}

const panelCount = (element: EditorHost): number =>
  element.shadowRoot!.querySelectorAll('ha-expansion-panel').length;

beforeEach(() => {
  document.body.innerHTML = '';
  Entities.clearCopiedSettings();
});

describe('editor filter bar', () => {
  it('narrows the rendered panels to the ones that match the search', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const before = panelCount(element);
    expect(before).toBeGreaterThan(1);

    change(element.shadowRoot!.querySelector('ha-form.filter-form')!, {
      search: 'weather',
      customized_only: false,
    });
    await element.updateComplete;

    const during = panelCount(element);
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan(before);

    const surviving = Array.from(element.shadowRoot!.querySelectorAll('ha-form.panel-form'));
    expect(surviving.some((form) => schemaNames(form).includes('weather'))).toBe(true);
  });

  it('restores every panel when the search is cleared', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const before = panelCount(element);

    change(element.shadowRoot!.querySelector('ha-form.filter-form')!, {
      search: 'weather',
      customized_only: false,
    });
    await element.updateComplete;
    expect(panelCount(element)).toBeLessThan(before);

    change(element.shadowRoot!.querySelector('ha-form.filter-form')!, {
      search: '',
      customized_only: false,
    });
    await element.updateComplete;
    expect(panelCount(element)).toBe(before);
  });

  it('keeps the filter event inside the editor', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    change(element.shadowRoot!.querySelector('ha-form.filter-form')!, {
      search: 'weather',
      customized_only: false,
    });
    await element.updateComplete;

    expect(escaped).toBe(0);
  });

  it('does not report a config change for a filter-only interaction', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    change(element.shadowRoot!.querySelector('ha-form.filter-form')!, {
      search: 'weather',
      customized_only: false,
    });
    await element.updateComplete;

    expect(seen).toHaveLength(0);
  });
});

describe('editor panel option forms', () => {
  it('reports the changed option and preserves the configured calendars', async () => {
    const element = await mount({
      entities: [{ entity: 'calendar.a', label: 'A' }, 'calendar.b'],
    });
    const seen = reported(element);

    const form = panelOwning(element, 'days_to_show');
    change(form, { ...formData(form), days_to_show: 7 });
    await element.updateComplete;

    expect(seen).toHaveLength(1);
    expect(seen[0].days_to_show).toBe(7);
    expect(seen[0].entities).toEqual([{ entity: 'calendar.a', label: 'A' }, 'calendar.b']);
  });

  it('keeps a separate diff baseline per panel so edits accumulate', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    const days = panelOwning(element, 'days_to_show');
    change(days, { ...formData(days), days_to_show: 7 });
    await element.updateComplete;

    const lines = panelOwning(element, 'title_max_lines');
    change(lines, { ...formData(lines), title_max_lines: 3 });
    await element.updateComplete;

    // Located by name rather than by position: `days_to_show` is fetch-time and stays at
    // the top level, `title_max_lines` is a list override and lands in `list:` in v5. The
    // subject is that both survive one report, not where either sits.
    expect(seen).toHaveLength(2);
    expect(seen[1].days_to_show).toBe(7);
    expect(seen[1].list).toHaveProperty('title_max_lines', 3);
  });

  it('keeps the panel event inside the editor', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    const form = panelOwning(element, 'days_to_show');
    change(form, { ...formData(form), days_to_show: 7 });
    await element.updateComplete;

    expect(escaped).toBe(0);
  });

  it('keeps both edits when two changes arrive before the next render', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    const form = panelOwning(element, 'days_to_show');
    const data = formData(form);
    change(form, { ...data, days_to_show: 7 });
    change(form, { ...data, days_to_show: 7, first_day_of_week: 'monday' });
    await element.updateComplete;

    const last = seen[seen.length - 1];
    expect(last).toBeDefined();
    expect(last.days_to_show).toBe(7);
    expect(last.first_day_of_week).toBe('monday');
  });

  it('does not report again when the same value is re-submitted', async () => {
    const element = await mount({ entities: ['calendar.a'] });
    const seen = reported(element);

    const form = panelOwning(element, 'days_to_show');
    change(form, { ...formData(form), days_to_show: 7 });
    await element.updateComplete;
    expect(seen).toHaveLength(1);

    const again = panelOwning(element, 'days_to_show');
    change(again, { ...formData(again), days_to_show: 7 });
    await element.updateComplete;

    expect(seen).toHaveLength(1);
  });
});

describe('editor per-calendar forms', () => {
  it('writes the change to the calendar whose form emitted it', async () => {
    const element = await mount({
      entities: [
        { entity: 'calendar.a', label: 'A' },
        { entity: 'calendar.b', label: 'B' },
      ],
    });
    const seen = reported(element);

    const forms = Array.from(element.shadowRoot!.querySelectorAll('ha-form.entity-form'));
    expect(forms).toHaveLength(2);

    change(forms[1], { ...formData(forms[1]), label: 'CHANGED' });
    await element.updateComplete;

    expect(seen).toHaveLength(1);
    expect(seen[0].entities).toEqual([
      { entity: 'calendar.a', label: 'A' },
      { entity: 'calendar.b', label: 'CHANGED' },
    ]);
  });

  it('keeps the calendar event inside the editor', async () => {
    const element = await mount({ entities: [{ entity: 'calendar.a', label: 'A' }] });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    const form = element.shadowRoot!.querySelector('ha-form.entity-form')!;
    change(form, { ...formData(form), label: 'CHANGED' });
    await element.updateComplete;

    expect(escaped).toBe(0);
  });
});

describe('direct view forms and resets', () => {
  it('offers the view value without a picker or a duplicate form', async () => {
    const element = await mount({ entities: ['calendar.a'], view: 'column' });
    expect(element.shadowRoot!.querySelectorAll('ha-form.exception-form')).toHaveLength(0);

    expect(element.shadowRoot!.querySelector('.exception-picker')).toBeNull();
    expect(schemaNames(panelOwning(element, 'day_spacing'))).toContain('day_spacing');
  });

  it('resets an override without removing the input', async () => {
    const element = await mount({
      entities: ['calendar.a'],
      view: 'column',
      column: { day_spacing: '20px' },
    });
    const reset = element.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-reset-keys="day_spacing"]',
    );
    expect(reset).not.toBeNull();
    reset!.click();
    await element.updateComplete;
    expect(formData(panelOwning(element, 'day_spacing')).day_spacing).toBe('10px');
    expect(element.shadowRoot!.querySelector('[data-reset-keys="day_spacing"]')).toBeNull();
  });

  it('writes an override value into the view block', async () => {
    const element = await mount({ entities: ['calendar.a'], view: 'column' });
    const seen = reported(element);

    const override = panelOwning(element, 'day_spacing');
    const data = formData(override);
    const key = 'day_spacing';
    change(override, { ...data, [key]: '20px' });
    await element.updateComplete;

    const last = seen[seen.length - 1];
    expect(last).toBeDefined();
    expect(last.column).toEqual({ [key]: '20px' });
  });

  it('keeps routed view events inside the editor', async () => {
    const element = await mount({ entities: ['calendar.a'], view: 'column' });
    let escaped = 0;
    document.addEventListener('value-changed', () => (escaped += 1));

    const override = panelOwning(element, 'day_spacing');
    const data = formData(override);
    change(override, { ...data, day_spacing: '20px' });
    await element.updateComplete;

    expect(escaped).toBe(0);
  });
});
