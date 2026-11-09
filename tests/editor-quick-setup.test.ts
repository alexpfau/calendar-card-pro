/**
 * Quick Setup in the editor (backlog item 188): a card started from an Example Story, with the
 * preview following every answer and Cancel putting the card back exactly as it was.
 *
 * The hard part is the echo. Every answer is a real write, which Home Assistant hands back
 * through `setConfig`, sometimes after a later write has gone out. So these tests run the editor
 * against a host that echoes, and against one that echoes late or not at all, and pin that:
 * an echo of any preview leaves Quick Setup open; anything else closes it; Cancel restores the
 * card and the authorship it was opened with; Apply makes the result the authored truth, so the
 * next unrelated edit keeps every line the story wrote.
 */
import { afterEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { workspaceFields } from '../src/rendering/editor/routing';
import { storyById } from '../src/rendering/editor/stories';
import { chassisSubforms } from '../src/rendering/editor/subforms';

customElements.define('editor-quick-setup-test', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

const OPENING = {
  type: 'custom:calendar-card-pro',
  config_version: Config.CURRENT_CONFIG_VERSION,
  title: 'Our Week',
  show_empty_days: false,
  entities: [
    'calendar.anna',
    { entity: 'calendar.ben', accent_color: '#123456' },
    { entity: 'calendar.anna', event_type: 'all_day' },
  ],
  grid_options: { columns: 'full', rows: 'auto' },
};

async function mount(config: Record<string, unknown> = OPENING, echo = true) {
  const editor = document.createElement('editor-quick-setup-test') as EditorHost;
  editor.hass = {
    states: { 'calendar.anna': {}, 'calendar.ben': {}, 'weather.home': {} },
    locale: { language: 'en' },
  };
  editor.setConfig(structuredClone(config));
  document.body.appendChild(editor);
  await editor.updateComplete;
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    const reported = (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config;
    reports.push(structuredClone(reported));
    if (echo) editor.setConfig(structuredClone(reported));
  });
  return { editor, reports };
}

function root(editor: EditorHost): ShadowRoot {
  return editor.shadowRoot!;
}

function step(editor: EditorHost): string | undefined {
  return root(editor).querySelector<HTMLElement>('[data-quick-setup]')?.dataset.quickSetup;
}

async function click(editor: EditorHost, selector: string): Promise<void> {
  const button = root(editor).querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
  await editor.updateComplete;
}

async function answer(editor: EditorHost, values: Record<string, unknown>): Promise<void> {
  const form = root(editor).querySelector<Form>('ha-form.quick-setup-form')!;
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, ...values } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

async function change(editor: EditorHost, key: string, value: unknown): Promise<void> {
  const form = [...root(editor).querySelectorAll<Form>('ha-form.panel-form')].find((candidate) =>
    [...workspaceFields(candidate.schema)].some(({ node }) => node.name === key),
  )!;
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, [key]: value } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

const last = (reports: Record<string, unknown>[]) => reports[reports.length - 1];

afterEach(() => document.body.replaceChildren());

describe('Quick Setup', () => {
  it('opens on the starting point without writing anything', async () => {
    const { editor, reports } = await mount();
    expect(root(editor).querySelector('ha-form.panel-form')).not.toBeNull();

    await click(editor, '[data-quick-setup-open]');

    expect(step(editor)).toBe('story');
    expect(root(editor).querySelector('ha-form.panel-form')).toBeNull();
    expect(root(editor).querySelector<HTMLButtonElement>('[data-quick-setup-next]')!.disabled).toBe(
      true,
    );
    expect(
      [...root(editor).querySelectorAll<HTMLElement>('.story-tile')].map((t) => t.dataset.story),
    ).toEqual(['family_hub', 'now_and_next', 'today_and_tomorrow', 'birthdays_and_holidays']);
    expect(reports).toEqual([]);
  });

  it('previews a story on the card’s own calendars as soon as it is picked', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      title: 'Our Week',
      view: 'grid',
      weather: { entity: 'weather.home' },
      grid_options: { columns: 'full', rows: 'auto' },
      entities: [
        { entity: 'calendar.anna', accent_color: '#ff6c92' },
        { entity: 'calendar.anna', event_type: 'all_day', accent_color: '#ff6c92' },
        { entity: 'calendar.ben', accent_color: '#123456' },
      ],
    });
    // The echo of its own preview leaves Quick Setup where it was.
    expect(step(editor)).toBe('story');
  });

  it('follows each answer, and brings a removed calendar’s blocks back', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="now_and_next"]');
    await click(editor, '[data-quick-setup-next]');
    expect(step(editor)).toBe('calendars');

    await answer(editor, { card_calendars: [] });
    expect(root(editor).querySelector('.quick-setup-note')).not.toBeNull();
    expect(root(editor).querySelector<HTMLButtonElement>('[data-quick-setup-next]')!.disabled).toBe(
      true,
    );

    await answer(editor, { card_title: 'Hall', card_calendars: ['calendar.ben', 'calendar.anna'] });
    expect(last(reports)).toMatchObject({
      title: 'Hall',
      entities: [
        { entity: 'calendar.ben', accent_color: '#123456' },
        'calendar.anna',
        { entity: 'calendar.anna', event_type: 'all_day' },
      ],
    });

    await click(editor, '[data-quick-setup-next]');
    await answer(editor, { weather_entity: 'weather.home' });
    expect(last(reports).weather).toEqual({ entity: 'weather.home' });

    await click(editor, '[data-quick-setup-next]');
    await answer(editor, { show_toolbar: true, event_details: true, day_adds: false });
    expect(last(reports)).toMatchObject({
      toolbar: { show: true },
      event_tap_action: { action: 'details' },
      tap_action: { action: 'expand' },
    });
    expect(last(reports)).not.toHaveProperty('day_tap_action');
  });

  it('cancels back to the card as it was, authorship included', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    await click(editor, '[data-story="today_and_tomorrow"]');
    await click(editor, '[data-quick-setup-cancel]');

    expect(step(editor)).toBeUndefined();
    expect(last(reports)).toEqual(OPENING);

    // `show_empty_days: false` equals the default; it stays because the YAML holds it.
    await change(editor, 'title', 'After');
    expect(last(reports)).toEqual({ ...OPENING, title: 'After' });
  });

  it('cancels without writing when nothing was picked', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-quick-setup-cancel]');

    expect(reports).toEqual([]);
    expect(root(editor).querySelector('ha-form.panel-form')).not.toBeNull();
  });

  it('applies, and the next unrelated edit keeps every line the story wrote', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    expect(step(editor)).toBe('review');
    const review = root(editor).querySelector('.quick-setup-review')!.textContent!;
    expect(review).toContain('Family Hub');
    expect(review.replace(/\s+/g, ' ')).toContain('Colors from the example for: calendar.anna.');

    const written = reports.length;
    await click(editor, '[data-quick-setup-apply]');
    // Apply writes nothing new: the last preview already is the result.
    expect(reports).toHaveLength(written);
    expect(step(editor)).toBeUndefined();

    await change(editor, 'title', 'Kitchen');
    const after = last(reports);
    expect(after.title).toBe('Kitchen');
    const shell = storyById('family_hub').shell();
    for (const key of ['list', 'column', 'time_grid', 'toolbar', 'duplicate_accent_color']) {
      expect(after[key], key).toEqual(shell[key]);
    }
  });

  it('draws exactly the forms subforms.ts declares for it, one per step, in order', async () => {
    // The i18n gate reads Quick Setup's strings through `chassisSubforms`, so a form drawn here
    // and not declared there would escape it.
    const { editor } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');

    const drawn: Array<ReadonlyArray<HaFormSchema>> = [];
    for (let i = 0; i < 4; i++) {
      const form = root(editor).querySelector<Form>('ha-form.quick-setup-form');
      if (form !== null) drawn.push(form.schema);
      await click(editor, '[data-quick-setup-next]');
    }

    expect(drawn).toEqual(
      chassisSubforms()
        .filter((subform) => subform.path.join('.') === 'quick_setup')
        .map((subform) => subform.schema),
    );
  });

  it('keeps going when an earlier preview’s echo arrives after a later one', async () => {
    const { editor, reports } = await mount(OPENING, false);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    await click(editor, '[data-story="now_and_next"]');
    expect(reports).toHaveLength(2);

    editor.setConfig(structuredClone(reports[0]));
    await editor.updateComplete;
    expect(step(editor)).toBe('story');

    editor.setConfig(structuredClone(reports[1]));
    await editor.updateComplete;
    expect(step(editor)).toBe('story');
  });

  it('re-asserts Apply when an earlier preview’s echo arrives after it', async () => {
    const { editor, reports } = await mount(OPENING, false);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    await click(editor, '[data-story="now_and_next"]');
    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    await click(editor, '[data-quick-setup-apply]');
    const chosen = reports[1];

    editor.setConfig(structuredClone(chosen));
    editor.setConfig(structuredClone(reports[0]));
    await Promise.resolve();
    await editor.updateComplete;

    // The late echo is answered with the choice, not adopted.
    expect(reports).toHaveLength(3);
    expect(reports[2]).toEqual(chosen);
    expect(step(editor)).toBeUndefined();
    // And the editor stayed on it: an edit now builds on Now & Next, not Family Hub.
    await change(editor, 'title', 'Hall');
    expect(last(reports)).toMatchObject({ title: 'Hall', days_to_show: 2 });
    expect(last(reports)).not.toHaveProperty('view');
  });

  it('re-asserts Cancel when a preview’s echo arrives after it', async () => {
    const { editor, reports } = await mount(OPENING, false);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    await click(editor, '[data-quick-setup-cancel]');
    expect(reports).toHaveLength(2);
    expect(reports[1]).toEqual(OPENING);

    editor.setConfig(structuredClone(reports[0]));
    await Promise.resolve();
    await editor.updateComplete;

    expect(reports).toHaveLength(3);
    expect(reports[2]).toEqual(OPENING);
    await change(editor, 'title', 'After');
    expect(last(reports)).toEqual({ ...OPENING, title: 'After' });
  });

  it('closes, restoring nothing, when the YAML changes underneath it', async () => {
    const { editor, reports } = await mount(OPENING, false);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');

    editor.setConfig({ ...OPENING, title: 'Edited in YAML' });
    await editor.updateComplete;

    expect(step(editor)).toBeUndefined();
    expect(reports).toHaveLength(1);
    expect(root(editor).querySelector('ha-form.panel-form')).not.toBeNull();
  });

  it('keeps a title the user typed when the story changes', async () => {
    const { editor, reports } = await mount({ ...OPENING, title: undefined });
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    expect(last(reports).title).toBe('Family');

    await click(editor, '[data-story="today_and_tomorrow"]');
    expect(last(reports).title).toBe('Today & Tomorrow');

    await click(editor, '[data-quick-setup-next]');
    await answer(editor, { card_title: 'Hall' });
    await click(editor, '[data-quick-setup-back]');
    await click(editor, '[data-story="birthdays_and_holidays"]');
    expect(last(reports).title).toBe('Hall');
  });
});
