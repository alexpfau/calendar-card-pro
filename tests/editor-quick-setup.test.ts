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
import { mdiCreation } from '@mdi/js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CARD,
  CHASSIS,
  changeField,
  changeFields,
  fakeHass,
  formsOf,
  goOverview,
  lastConfig,
  mountEditor,
  openPanels,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { storyById } from '../src/rendering/editor/stories';
import { chassisSubforms } from '../src/rendering/editor/subforms';

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
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
  const editor = await mountEditor(structuredClone(config), {
    hass: fakeHass({ states: { 'calendar.anna': {}, 'calendar.ben': {}, 'weather.home': {} } }),
  });
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

afterEach(() => document.body.replaceChildren());

describe('Quick Setup', () => {
  it('is offered on a fresh card as a banner with Dismiss, and always under More', async () => {
    const fresh = {
      type: 'custom:calendar-card-pro',
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      days_to_show: 3,
    };
    const { editor } = await mount(fresh);
    const entry = root(editor).querySelector<HTMLElement>('.quick-setup-entry')!;
    const [open, dismiss] = entry.querySelectorAll('button');

    expect(entry.querySelectorAll('button')).toHaveLength(2);
    expect(open.hasAttribute('data-quick-setup-open')).toBe(true);
    expect(open.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Quick Setup Start from an example card and answer a few questions.',
    );
    expect(open.querySelector('svg path')?.getAttribute('d')).toBe(mdiCreation);
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss Quick Setup');

    // Kept after adding a calendar: the session started fresh. Added as a user adds one, with
    // Add Calendar, which opens the new calendar's page; the banner is the overview's.
    await click(editor, '[data-focus="add-calendar"]');
    await changeField(editor, 'add_calendar:pick', 'calendar.ben');
    await click(editor, '[data-focus="add-confirm"]');
    expect(lastConfig(editor)?.entities).toEqual(['calendar.anna', 'calendar.ben']);
    await goOverview(editor);
    const kept = root(editor).querySelector<HTMLElement>('.quick-setup-entry');
    expect(kept).not.toBeNull();
    expect(kept!.querySelectorAll('button')[1]).toBe(dismiss);

    dismiss.click();
    await editor.updateComplete;
    expect(root(editor).querySelector('.quick-setup-entry')).toBeNull();
    const more = root(editor).querySelector<HTMLElement>('[data-focus="more:example"]')!;
    expect(more.hasAttribute('data-quick-setup-open')).toBe(true);
    expect(more.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Start From an Example Quick Setup: an example card and a few questions',
    );
  });

  it('names the calendar a fresh card was started with, and opens it to change it', async () => {
    const fresh = (calendar: string) => ({
      type: 'custom:calendar-card-pro',
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [calendar],
      days_to_show: 3,
    });
    const { editor } = await mount(fresh('calendar.anna'));
    const line = () => root(editor).querySelector<HTMLElement>('[data-started-with]');
    expect(line()!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Home Assistant started this card with calendar.anna, the first calendar it lists. ' +
        'Change Calendar',
    );

    await click(editor, '[data-focus="started-with"]');
    await new Promise((resolve) => setTimeout(resolve));
    expect(root(editor).activeElement).toBe(
      root(editor).querySelector('[data-focus="entry-calendar"]'),
    );

    // Once the card holds a calendar someone chose, nothing is said.
    editor.setConfig({ ...fresh('calendar.anna'), entities: ['calendar.anna', 'calendar.ben'] });
    await goOverview(editor);
    expect(line()).toBeNull();
    const chosen = await mount(fresh('calendar.ben'));
    expect(root(chosen.editor).querySelector('[data-started-with]')).toBeNull();
  });

  it('offers no banner on a card that already stores settings', async () => {
    const { editor } = await mount();
    expect(root(editor).querySelector('.quick-setup-entry')).toBeNull();
    expect(root(editor).querySelector('[data-quick-setup-open]')).not.toBeNull();
  });

  it('opens on the starting point without writing anything', async () => {
    const { editor, reports } = await mount();
    // A closed panel mounts no form: open every panel, so the forms Quick Setup hides are there.
    await openPanels(editor);
    expect(formsOf(editor, CARD)).not.toHaveLength(0);

    await click(editor, '[data-quick-setup-open]');

    expect(step(editor)).toBe('story');
    expect(formsOf(editor, CARD)).toHaveLength(0);
    expect(root(editor).querySelector<HTMLButtonElement>('[data-quick-setup-next]')!.disabled).toBe(
      true,
    );
    expect(
      [...root(editor).querySelectorAll<HTMLElement>('.story-tile')].map((t) => t.dataset.story),
    ).toEqual([
      'simple_agenda',
      'family_hub',
      'now_and_next',
      'today_and_tomorrow',
      'birthdays_and_holidays',
      'house_log',
    ]);
    // Each link is named for its example, so a list of links reads as six different ones.
    const links = [...root(editor).querySelectorAll<HTMLAnchorElement>('.story-link')];
    expect(links.map((link) => link.textContent!.trim())).toEqual([
      'Read about Simple Agenda',
      'Read about Family Hub',
      'Read about Now & Next',
      'Read about Today & Tomorrow',
      'Read about Birthdays & Holidays',
      'Read about House Log',
    ]);
    expect(links[0].href).toBe(
      'https://calendar-card-pro.alexpfau.com/guide/usage#your-first-card',
    );
    // The panel is a heading, which a screen reader's list of headings finds.
    expect(root(editor).querySelector('h2#quick-setup-title')!.textContent!.trim()).toBe(
      'Quick Setup',
    );
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
      weather_entity: 'weather.home',
      time_grid: { weather: { position: 'date' } },
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
    const { editor } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="now_and_next"]');
    await click(editor, '[data-quick-setup-next]');
    expect(step(editor)).toBe('calendars');

    await changeField(editor, 'quick_setup:card_calendars', []);
    expect(root(editor).querySelector('.quick-setup-note')).not.toBeNull();
    expect(root(editor).querySelector<HTMLButtonElement>('[data-quick-setup-next]')!.disabled).toBe(
      true,
    );

    await changeFields(editor, {
      'quick_setup:card_title': 'Hall',
      'quick_setup:card_calendars': ['calendar.ben', 'calendar.anna'],
    });
    expect(lastConfig(editor)).toMatchObject({
      title: 'Hall',
      entities: [
        { entity: 'calendar.ben', accent_color: '#123456' },
        'calendar.anna',
        { entity: 'calendar.anna', event_type: 'all_day' },
      ],
    });

    await click(editor, '[data-quick-setup-next]');
    await changeField(editor, 'quick_setup:weather_entity', 'weather.home');
    // A story without a forecast of its own shows it in the layout it starts in.
    expect(lastConfig(editor)).toMatchObject({
      weather_entity: 'weather.home',
      list: { weather: { position: 'date' } },
    });
    expect(lastConfig(editor)).not.toHaveProperty('weather');

    await click(editor, '[data-quick-setup-next]');
    await changeFields(editor, {
      'quick_setup:show_toolbar': true,
      'quick_setup:event_details': true,
      'quick_setup:day_adds': false,
    });
    expect(lastConfig(editor)).toMatchObject({
      toolbar: { show: true },
      tap_action: { action: 'expand' },
    });
    // Yes to event details is the default, so Now & Next's Nothing goes and no line replaces it.
    expect(lastConfig(editor)).not.toHaveProperty('event_tap_action');
    expect(lastConfig(editor)).not.toHaveProperty('day_tap_action');
  });

  it('cancels back to the card as it was, authorship included', async () => {
    const { editor } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    await click(editor, '[data-story="today_and_tomorrow"]');
    await click(editor, '[data-quick-setup-cancel]');

    expect(step(editor)).toBeUndefined();
    expect(lastConfig(editor)).toEqual(OPENING);

    // `show_empty_days: false` equals the default; it stays because the YAML holds it.
    // The panels come back closed, each mounting no form until it is opened.
    await openPanels(editor);
    await changeField(editor, 'card:title', 'After');
    expect(lastConfig(editor)).toEqual({ ...OPENING, title: 'After' });
  });

  it('cancels without writing when nothing was picked', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-quick-setup-cancel]');

    expect(reports).toEqual([]);
    // The panels come back closed, each mounting no form until it is opened.
    await openPanels(editor);
    expect(formsOf(editor, CARD)).not.toHaveLength(0);
  });

  it('applies, and the next unrelated edit keeps every line the story wrote', async () => {
    const { editor, reports } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    expect(step(editor)).toBe('review');
    const rows = [...root(editor).querySelectorAll('.quick-setup-review > div')].map((row) =>
      [...row.children].map((cell) => cell.textContent!.trim()).join(': '),
    );
    expect(rows).toEqual([
      'Example: Family Hub',
      'Calendars: calendar.anna and calendar.ben',
      'Colors From the Example: calendar.anna',
      'Layout: Grid · 7 days',
      'Title: Our Week',
      'Weather: weather.home',
    ]);
    // Named setting by setting, rather than "every setting not listed here".
    expect(
      root(editor).querySelector('[data-quick-setup-replaced]')!.textContent!.replace(/\s+/g, ' '),
    ).toBe(' Apply replaces 1 setting: Show Empty Days: Off → Default ');

    const written = reports.length;
    await click(editor, '[data-quick-setup-apply]');
    // Apply writes nothing new: the last preview already is the result.
    expect(reports).toHaveLength(written);
    expect(step(editor)).toBeUndefined();

    // The panels come back closed, each mounting no form until it is opened.
    await openPanels(editor);
    await changeField(editor, 'card:title', 'Kitchen');
    const after = lastConfig(editor)!;
    expect(after.title).toBe('Kitchen');
    const shell = storyById('family_hub').shell();
    for (const key of ['list', 'column', 'time_grid', 'toolbar', 'duplicate_accent_color']) {
      expect(after[key], key).toEqual(shell[key]);
    }
  });

  it('lays each example out as one row, its link beside it, over the shared option style', async () => {
    // `.wizard-option` stacks its contents and comes later in the stylesheet, so an example's row
    // has to win on specificity, or its link drops onto a line of its own.
    const { editor } = await mount();
    await click(editor, '[data-quick-setup-open]');
    const rows = [...root(editor).querySelectorAll<HTMLElement>('.story-option')];
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(getComputedStyle(row).flexDirection).toBe('row');
  });

  it('words a replaced setting as its control does, never as true or false', async () => {
    // `filter_duplicates: true` is a dropdown's older value; the review names the option it means.
    const { editor } = await mount({ ...OPENING, filter_duplicates: true });
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="simple_agenda"]');
    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    const items = [...root(editor).querySelectorAll('[data-quick-setup-replaced] li')].map((item) =>
      item.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(items).toContain('Filter Duplicates: Same title, start, end and location → Default');
    expect(items.join('|')).not.toMatch(/\b(true|false)\b/);
  });

  it('lists five settings Apply replaces, then all of them on Show All', async () => {
    const { editor } = await mount({
      ...OPENING,
      title: 'Everything',
      days_to_show: 7,
      day_spacing: '12px',
      show_location: false,
      show_month: false,
      event_font_size: '16px',
      show_countdown: true,
      list: { show_past_events: true },
    });
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="simple_agenda"]');
    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    const items = () =>
      [...root(editor).querySelectorAll('[data-quick-setup-replaced] li')].map((item) =>
        item.textContent!.trim(),
      );

    expect(root(editor).querySelector('#quick-setup-replaces')!.textContent!.trim()).toBe(
      'Apply replaces 6 settings:',
    );
    expect(items()).toEqual([
      'Show Empty Days: Off → Default',
      'Days To Show: 7 → 3',
      'Day Spacing: 12px → Default',
      'Event Font Size: 16px → Default',
      'Show Countdown: On → Default',
    ]);
    await click(editor, '[data-focus="quick-setup-show-all"]');
    expect(items().slice(5)).toEqual(['Show Past Events in List: On → Default']);
    expect(root(editor).querySelector('[data-focus="quick-setup-show-all"]')).toBeNull();
    // Simple Agenda keeps the title the card has: the user's, which Apply does not replace.
    expect(items().join('|')).not.toContain('Title');
  });

  it('names whole-card settings Apply replaces, each value in words', async () => {
    const { editor } = await mount({
      ...OPENING,
      view: 'grid',
      filter_duplicates: true,
      day_tap_action: { action: 'add-event' },
    });
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="simple_agenda"]');
    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    const items = [...root(editor).querySelectorAll('[data-quick-setup-replaced] li')].map((item) =>
      item.textContent!.trim(),
    );

    // Whole-card settings first, then those every layout shares, as What This Card Changes groups.
    expect(items).toEqual([
      'Starting Layout: Grid → Default',
      'Day Tap Action: Add Event → Default',
      'Show Empty Days: Off → Default',
      'Filter Duplicates: Same title, start, end and location → Default',
    ]);
  });

  it('starts a fresh card with no calendar chosen, rather than the one it was started with', async () => {
    const fresh = {
      type: 'custom:calendar-card-pro',
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      days_to_show: 3,
    };
    const { editor } = await mount(fresh);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="simple_agenda"]');
    await click(editor, '[data-quick-setup-next]');
    expect(step(editor)).toBe('calendars');
    expect(root(editor).querySelector<HTMLButtonElement>('[data-quick-setup-next]')!.disabled).toBe(
      true,
    );
    expect(root(editor).querySelector('.quick-setup-note')!.textContent!.trim()).toBe(
      'Choose at least one calendar to go on.',
    );
  });

  it('marks its progress and the example picked, and asks step 4 with Home Assistant’s own switches', async () => {
    const { editor } = await mount();
    await click(editor, '[data-quick-setup-open]');
    const progress = (): string[] =>
      [...root(editor).querySelectorAll('.quick-setup-progress > li')].map(
        (each) => `${each.textContent!.trim()}:${each.className}`,
      );
    expect(progress()).toEqual([
      'Starting Point:current',
      'Title & Calendars:',
      'Weather:',
      'Taps & Toolbar:',
      'Review:',
    ]);
    expect(root(editor).querySelectorAll('.story-option.checked')).toHaveLength(0);

    await click(editor, '[data-story="now_and_next"]');
    const picked = [...root(editor).querySelectorAll('.story-option.checked [data-story]')];
    expect(picked.map((each) => each.getAttribute('data-story'))).toEqual(['now_and_next']);

    for (let i = 0; i < 3; i++) await click(editor, '[data-quick-setup-next]');
    expect(step(editor)).toBe('taps');
    expect(progress().map((each) => each.split(':')[1])).toEqual([
      'done',
      'done',
      'done',
      'current',
      '',
    ]);
    const [taps] = formsOf(editor, CHASSIS);
    expect(taps.classList.contains('boxed')).toBe(true);
    expect(
      taps.schema.map((field) => ('selector' in field ? Object.keys(field.selector) : [])),
    ).toEqual([['boolean'], ['boolean'], ['boolean']]);
  });

  it('draws exactly the forms subforms.ts declares for it, one per step, in order', async () => {
    // The i18n gate reads Quick Setup's strings through `chassisSubforms`, so a form drawn here
    // and not declared there would escape it.
    const { editor } = await mount();
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');

    const drawn: Array<ReadonlyArray<HaFormSchema>> = [];
    for (let i = 0; i < 4; i++) {
      for (const form of formsOf(editor, CHASSIS)) drawn.push(form.schema);
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

  it('closes, restoring nothing, when the YAML changes underneath it', async () => {
    const { editor, reports } = await mount(OPENING, false);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');

    editor.setConfig({ ...OPENING, title: 'Edited in YAML' });
    await editor.updateComplete;

    expect(step(editor)).toBeUndefined();
    expect(reports).toHaveLength(1);
    // The panels come back closed, each mounting no form until it is opened.
    await openPanels(editor);
    expect(formsOf(editor, CARD)).not.toHaveLength(0);
  });

  it('keeps a title the user typed when the story changes', async () => {
    const { editor } = await mount({ ...OPENING, title: undefined });
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    expect(lastConfig(editor)!.title).toBe('Family');

    await click(editor, '[data-story="today_and_tomorrow"]');
    expect(lastConfig(editor)!.title).toBe('Today & Tomorrow');

    await click(editor, '[data-quick-setup-next]');
    await changeField(editor, 'quick_setup:card_title', 'Hall');
    await click(editor, '[data-quick-setup-back]');
    await click(editor, '[data-story="birthdays_and_holidays"]');
    expect(lastConfig(editor)!.title).toBe('Hall');
  });
});

/**
 * A host that echoes the way Home Assistant's `hui-element-editor` does: it records each write
 * as its current value and, after an await, hands the editor that current value, not the one the
 * write carried. So writes sent in one turn are all answered with the newest.
 */
async function mountLikeHomeAssistant(config: Record<string, unknown> = OPENING) {
  let current = structuredClone(config);
  const editor = await mountEditor(structuredClone(current), {
    hass: fakeHass({ states: { 'calendar.anna': {}, 'calendar.ben': {}, 'weather.home': {} } }),
  });
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    current = structuredClone(
      (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config,
    );
    reports.push(structuredClone(current));
    void Promise.resolve().then(() => editor.setConfig(structuredClone(current)));
  });
  return { editor, reports, current: () => current };
}

describe('Quick Setup against Home Assistant’s echo', () => {
  it('ends on the last story picked when picks outrun their echoes, and applies it', async () => {
    const { editor, reports, current } = await mountLikeHomeAssistant();
    await click(editor, '[data-quick-setup-open]');
    root(editor).querySelector<HTMLButtonElement>('[data-story="family_hub"]')!.click();
    root(editor).querySelector<HTMLButtonElement>('[data-story="now_and_next"]')!.click();
    await editor.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await editor.updateComplete;

    expect(reports).toHaveLength(2);
    expect(step(editor)).toBe('story');

    for (let i = 0; i < 4; i++) await click(editor, '[data-quick-setup-next]');
    await click(editor, '[data-quick-setup-apply]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await editor.updateComplete;

    expect(step(editor)).toBeUndefined();
    expect(current()).toMatchObject({ days_to_show: 2, tap_action: { action: 'expand' } });
    expect(current()).not.toHaveProperty('view');
    // The panels come back closed, each mounting no form until it is opened.
    await openPanels(editor);
    await changeField(editor, 'card:title', 'Hall');
    expect(lastConfig(editor)).toMatchObject({ title: 'Hall', days_to_show: 2 });
  });

  it('cancels back to the card as it was when Cancel outruns the previews’ echoes', async () => {
    const { editor, current } = await mountLikeHomeAssistant();
    await click(editor, '[data-quick-setup-open]');
    root(editor).querySelector<HTMLButtonElement>('[data-story="family_hub"]')!.click();
    root(editor).querySelector<HTMLButtonElement>('[data-story="today_and_tomorrow"]')!.click();
    root(editor).querySelector<HTMLButtonElement>('[data-quick-setup-cancel]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await editor.updateComplete;

    expect(current()).toEqual(OPENING);
    // The panels come back closed, each mounting no form until it is opened.
    await openPanels(editor);
    expect(formsOf(editor, CARD)).not.toHaveLength(0);
    await changeField(editor, 'card:title', 'After');
    expect(current()).toEqual({ ...OPENING, title: 'After' });
  });
});
