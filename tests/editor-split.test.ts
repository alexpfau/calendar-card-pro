/**
 * Split This Calendar (section 5.7, D12): when it refuses and why, what it writes, and the task on
 * an entry's page that writes it.
 *
 * What it promises about the card, that every event lands in exactly one part, is proven through
 * the card's own pipeline in `split-membership.dst.test.ts`; what its review names, in
 * `editor-split-review.test.ts`. Here: every refusal, including an event type inherited from the
 * card, an own compact budget, an own allowlist and an unreadable pattern (refused by words,
 * allowed by type); the blocklist merge; the Match Against lock; the two parts in the entry's place,
 * All-Day first, with their labels and colors; one undo step; and the preview the card is shown on
 * the way, which Cancel and Escape take back.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  fakeHass,
  goEntry,
  goOverview,
  keysOf,
  lastConfig,
  mountEditor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { freeSwatch } from '../src/rendering/editor/colors';
import { refusals, splitEntry, splitInList } from '../src/rendering/editor/split';

afterEach(() => document.body.replaceChildren());

const card = (options: Partial<Types.Config> = {}): Types.Config =>
  ({ ...Config.DEFAULT_CONFIG, ...options }) as Types.Config;

describe('when Split refuses', () => {
  it('refuses nothing for an entry that keeps every event', () => {
    expect(refusals({ entity: 'calendar.ben' }, card())).toEqual({});
    expect(refusals('calendar.ben', card())).toEqual({});
  });

  it('refuses All-Day vs. With a Time for an entry that keeps one type, its own or the card’s', () => {
    expect(refusals({ entity: 'calendar.ben', event_type: 'all_day' }, card()).type).toBe(
      'split.refused.all_day',
    );
    expect(refusals({ entity: 'calendar.ben', event_type: 'timed' }, card()).type).toBe(
      'split.refused.timed',
    );
    expect(refusals({ entity: 'calendar.ben' }, card({ event_type: 'all_day' })).type).toBe(
      'split.refused.all_day_card',
    );
    expect(refusals({ entity: 'calendar.ben' }, card({ event_type: 'timed' })).type).toBe(
      'split.refused.timed_card',
    );
    // Its own `all` keeps every event whatever the card says, as `resolveEventType` reads it.
    expect(
      refusals({ entity: 'calendar.ben', event_type: 'all' }, card({ event_type: 'timed' })).type,
    ).toBeUndefined();
  });

  it('refuses By Words for an entry with its own allowlist, and allows it by type', () => {
    const refused = refusals({ entity: 'calendar.family', allowlist: 'School' }, card());

    expect(refused).toEqual({ words: 'split.refused.words' });
  });

  it('refuses By Words for a pattern the card cannot read, and allows it by type', () => {
    expect(refusals({ entity: 'calendar.family', blocklist: '[' }, card())).toEqual({
      pattern: 'split.refused.blocklist',
    });
    expect(refusals({ entity: 'calendar.family', allowlist: '(' }, card())).toEqual({
      pattern: 'split.refused.allowlist',
      words: 'split.refused.words',
    });
  });

  it('refuses both for an entry with its own Compact Events to Show, as the card reads it', () => {
    expect(refusals({ entity: 'calendar.ben', compact_events_to_show: 3 }, card()).budget).toBe(
      'split.refused.budget',
    );
    expect(refusals({ entity: 'calendar.ben', compact_events_to_show: 0 }, card()).budget).toBe(
      'split.refused.budget',
    );
    // A value the card discards is no budget of its own.
    const discarded = { entity: 'calendar.ben', compact_events_to_show: 'many' };
    expect(refusals(discarded as unknown as Types.EntityConfig, card()).budget).toBeUndefined();
  });

  it('holds Match Against to the field the entry’s own blocklist looks in', () => {
    expect(
      refusals({ entity: 'calendar.ben', blocklist: 'Field', filter_field: 'location' }, card())
        .field,
    ).toBe('location');
    expect(refusals({ entity: 'calendar.ben', blocklist: 'Soccer' }, card()).field).toBe('title');
    expect(refusals({ entity: 'calendar.ben', filter_field: 'location' }, card()).field).toBe(
      undefined,
    );
  });
});

describe('what Split writes', () => {
  const ben: Types.EntityConfig = {
    entity: 'calendar.ben',
    name: 'Ben',
    label: '⚽',
    accent_color: 'var(--blue-color)',
    days_of_week: 'weekdays',
    visibility: [
      { condition: 'user', users: ['anna'] },
    ] as unknown as Types.EntityConfig['visibility'],
  };

  it('writes the all-day part first, each keeping every other option', () => {
    const [allDay, timed] = splitEntry(ben, { kind: 'type' }, [
      { label: '⚽', color: 'var(--blue-color)' },
      { label: '🏃', color: 'var(--teal-color)' },
    ]);

    expect(allDay).toEqual({ ...ben, event_type: 'all_day' });
    expect(timed).toEqual({
      ...ben,
      event_type: 'timed',
      label: '🏃',
      accent_color: 'var(--teal-color)',
    });
    // Copies, not one array shared by both parts and the original.
    expect(allDay.visibility).not.toBe(ben.visibility);
    expect(allDay.visibility).not.toBe(timed.visibility);
  });

  it('writes the words as one part’s allowlist and the other’s blocklist', () => {
    const [worded, other] = splitEntry(
      { entity: 'calendar.ben', filter_field: 'description' },
      { kind: 'words', terms: [' Training ', 'C++'], field: 'location' },
      [{}, {}],
    );

    expect(worded).toEqual({
      entity: 'calendar.ben',
      allowlist: 'Training|C\\+\\+',
      filter_field: 'location',
    });
    expect(other).toEqual({
      entity: 'calendar.ben',
      blocklist: 'Training|C\\+\\+',
      filter_field: 'location',
    });

    // Matched against the title, the field is left to its default on both.
    const [titled] = splitEntry(
      { entity: 'calendar.ben', filter_field: 'description' },
      { kind: 'words', terms: ['Training'], field: 'title' },
      [{}, {}],
    );
    expect(titled).toEqual({ entity: 'calendar.ben', allowlist: 'Training' });
  });

  it('joins the words to a blocklist the entry has, and keeps it beside the allowlist', () => {
    const [worded, other] = splitEntry(
      { entity: 'calendar.ben', blocklist: 'Soccer' },
      { kind: 'words', terms: ['Training'], field: 'title' },
      [{}, {}],
    );

    expect(worded).toEqual({ entity: 'calendar.ben', blocklist: 'Soccer', allowlist: 'Training' });
    expect(other).toEqual({ entity: 'calendar.ben', blocklist: 'Soccer|Training' });
    expect(
      splitEntry(
        { entity: 'calendar.ben', blocklist: '^Bin' },
        { kind: 'words', terms: ['Training'], field: 'title' },
        [{}, {}],
      )[1].blocklist,
    ).toBe('(?:^Bin)|(?:Training)');
  });

  it('takes a part’s label off where it is cleared, and its color where it follows the card', () => {
    const [first, second] = splitEntry(ben, { kind: 'type' }, [
      { label: '' },
      { color: undefined },
    ]);

    expect(first.label).toBeUndefined();
    expect(first.accent_color).toBeUndefined();
    expect(second.label).toBe('⚽');
    expect(second.accent_color).toBeUndefined();
  });

  it('puts the parts in the entry’s place, part 2 right after it under a new key', () => {
    const pair = splitEntry(ben, { kind: 'type' }, [{}, {}]);
    const state = {
      entities: ['calendar.anna', ben, 'calendar.leo', { entity: 'calendar.ben' }],
      keys: [1, 2, 3, 4],
    };

    expect(splitInList(state, 1, pair, 9)).toEqual({
      entities: ['calendar.anna', pair[0], pair[1], { entity: 'calendar.ben' }, 'calendar.leo'],
      keys: [1, 2, 9, 4, 3],
    });
  });
});

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const STATES = {
  'calendar.ben': { entity_id: 'calendar.ben', state: 'off', attributes: { friendly_name: 'Ben' } },
  'calendar.anna': {
    entity_id: 'calendar.anna',
    state: 'off',
    attributes: { friendly_name: 'Anna' },
  },
};

/** Ben's upcoming events, as Home Assistant's REST answer gives them, around the moment now. */
function upcoming(): Types.CalendarEventData[] {
  const now = new Date();
  const day = (offset: number): string => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const at = (offset: number, hour: number): string =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour).toISOString();
  return [
    { summary: 'Soccer Tournament', start: { date: day(1) }, end: { date: day(2) } },
    { summary: 'Dentist', start: { dateTime: at(1, 16) }, end: { dateTime: at(1, 17) } },
    { summary: 'Soccer Training', start: { dateTime: at(2, 17) }, end: { dateTime: at(2, 18) } },
  ];
}

/**
 * The editor on a card with Ben and Anna, on Ben's page.
 *
 * @param ben - Ben's entry
 * @param options - The card's own options, and a REST answer
 * @returns The editor and the REST requests it made
 */
async function onBensPage(
  ben: Types.EntityConfig = { entity: 'calendar.ben', accent_color: 'var(--blue-color)' },
  options: {
    card?: Record<string, unknown>;
    callApi?: (method: string, path: string) => unknown;
  } = {},
): Promise<{ editor: Editor; paths: string[] }> {
  const paths: string[] = [];
  const editor = await mountEditor(
    {
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ben, 'calendar.anna'],
      ...options.card,
    },
    {
      hass: fakeHass({
        states: STATES,
        callApi: async (method: string, path: string) => {
          paths.push(path);
          return options.callApi ? options.callApi(method, path) : upcoming();
        },
      }),
    },
  );
  await goEntry(editor, keysOf(editor, 'entry')[0]);
  return { editor, paths };
}

const root = (editor: Editor): ShadowRoot => editor.shadowRoot!;

/** Presses a control by its `data-focus` key, and waits for the render. */
async function press(editor: Editor, focus: string): Promise<void> {
  const control = root(editor).querySelector<HTMLElement>(`[data-focus="${focus}"]`);
  if (control === null) throw new Error(`No control "${focus}"`);
  control.click();
  await editor.updateComplete;
}

/** Waits for the review's read to answer and the step to draw it. */
async function settle(editor: Editor): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await editor.updateComplete;
  }
}

const task = (editor: Editor): HTMLElement | null =>
  root(editor).querySelector<HTMLElement>('.split-task');

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Split This Calendar on an entry’s page', () => {
  it('opens from the row under Which Events and as the first item of the page’s ⋮', async () => {
    const { editor } = await onBensPage();

    expect(
      root(editor).querySelector('[data-heading="page.which_events"] .split-row'),
    ).not.toBeNull();
    await press(editor, 'more:page');
    const first = root(editor).querySelector('.strip button');
    expect(first?.getAttribute('data-focus')).toBe('strip:page:split');
    expect(first?.getAttribute('aria-label')).toBe('Split Ben');

    await press(editor, 'strip:page:split');
    expect(task(editor)?.getAttribute('role')).toBe('group');
    expect(task(editor)?.getAttribute('aria-label')).toBe('Split This Calendar');
    expect(root(editor).querySelector('.split-steps')?.getAttribute('aria-label')).toBe(
      'Step 1 of 3',
    );
    expect(text(root(editor).querySelector('.split-title'))).toBe('Split Ben');
    expect(root(editor).activeElement?.classList.contains('split-title')).toBe(true);
    // The row gives way to the task it opened.
    expect(root(editor).querySelector('.split-row')).toBeNull();
  });

  it('splits All-Day vs. With a Time in one undo step, previewing both parts on the way', async () => {
    const { editor, paths } = await onBensPage();
    const [benKey, annaKey] = keysOf(editor, 'entry');
    await press(editor, 'split-row');
    const reported = (): number =>
      (lastConfig(editor)?.entities as unknown[] | undefined)?.length ?? 1;

    // How: All-Day vs. With a Time is chosen; nothing is sent yet.
    expect(
      root(editor).querySelector<HTMLInputElement>('[data-focus="split-how:type"]')?.checked,
    ).toBe(true);
    expect(lastConfig(editor)).toBeUndefined();

    // Colors: the card previews both parts, while the editor keeps the one entry.
    await press(editor, 'split-next');
    const preview = lastConfig(editor)!.entities as Types.EntityConfig[];
    expect(preview.map((each) => (typeof each === 'string' ? each : each.event_type))).toEqual([
      'all_day',
      'timed',
      'calendar.anna',
    ]);
    expect(preview[0].accent_color).toBe('var(--blue-color)');
    const free = freeSwatch(
      [{ entity: 'calendar.ben', accent_color: 'var(--blue-color)' }],
      card(),
    );
    expect(preview[1].accent_color).toBe(free);
    expect(keysOf(editor, 'entry')).toEqual([benKey, annaKey]);
    expect(text(task(editor))).toContain("Ben's color now.".replace("'", '’'));
    expect(text(task(editor))).toContain('Not used by another calendar on this card.');

    // An echo of the preview changes nothing in the editor.
    editor.setConfig(lastConfig(editor) as unknown as Types.Config);
    await editor.updateComplete;
    expect(keysOf(editor, 'entry')).toEqual([benKey, annaKey]);
    expect(task(editor)).not.toBeNull();

    // Review: Ben's events, read over the card's REST path, under the part that keeps each.
    await press(editor, 'split-next');
    await settle(editor);
    expect(paths.some((path) => path.startsWith('calendars/calendar.ben?start='))).toBe(true);
    const cards = [...root(editor).querySelectorAll('.split-part')].map(text);
    expect(cards[0]).toContain('Ben · All-day events');
    expect(cards[0]).toContain('Only all-day events · Blue');
    expect(cards[0]).toContain('Days Ahead: 3 · Events: 1');
    expect(cards[0]).toContain('· Soccer Tournament');
    expect(cards[1]).toContain('Events: 2');
    // In the card's own clock: Home Assistant here names no 24-hour preference.
    expect(cards[1]).toContain('· 4:00 PM · Dentist');
    expect(text(task(editor))).toContain(
      'Every event Ben shows now lands in exactly one part: none shows twice, none goes missing.',
    );

    await press(editor, 'split-apply');
    const written = lastConfig(editor)!.entities as Types.EntityConfig[];
    expect(written).toEqual([preview[0], preview[1], 'calendar.anna']);
    const keys = keysOf(editor, 'entry');
    expect(keys[0]).toBe(benKey);
    expect(keys[2]).toBe(annaKey);
    expect(task(editor)).toBeNull();
    const panel = root(editor).querySelector('.split-done');
    expect(text(panel)).toContain('Split Ben into 2 entries. This page now edits the first.');
    expect(root(editor).activeElement).toBe(panel);
    expect([...panel!.querySelectorAll('.tag')].map(text)).toEqual(['New', 'New']);

    // One step back, to the one entry.
    await press(editor, 'split-undo');
    expect(lastConfig(editor)!.entities).toEqual([
      { entity: 'calendar.ben', accent_color: 'var(--blue-color)' },
      'calendar.anna',
    ]);
    expect(reported()).toBe(2);
    expect(root(editor).querySelector('.split-done')).toBeNull();
  });

  it('lists the two entries on the overview, tagged New', async () => {
    const { editor } = await onBensPage();
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    await press(editor, 'split-next');
    await press(editor, 'split-apply');
    await press(editor, 'back-top');

    const tagged = [...root(editor).querySelectorAll('.cal-row')]
      .filter((row) => row.querySelector('.tag') !== null)
      .map((row) => text(row.querySelector('.cal-title')));
    expect(tagged).toEqual(['All-day events New', 'Events with a time New']);
  });

  it('splits by words over the entry’s own blocklist, Match Against held to its field', async () => {
    const { editor } = await onBensPage({
      entity: 'calendar.ben',
      blocklist: 'Field',
      filter_field: 'location',
    });
    await press(editor, 'split-row');
    const words = root(editor).querySelector<HTMLInputElement>('[data-focus="split-how:words"]')!;
    words.checked = true;
    words.dispatchEvent(new Event('change'));
    await editor.updateComplete;
    const form = root(editor).querySelector<HTMLElement & { data: Record<string, unknown> }>(
      'ha-form.split-words',
    )!;
    expect(form.data).toEqual({ filter_field: 'location', words: [''] });
    expect(
      root(editor).querySelector<HTMLButtonElement>('[data-focus="split-next"]')?.disabled,
    ).toBe(true);

    // A change of field is not taken: the blocklist looks in Location.
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { filter_field: 'title', words: ['Lake'] } },
      }),
    );
    await editor.updateComplete;
    await press(editor, 'split-next');
    await press(editor, 'split-next');
    await settle(editor);
    expect(text(task(editor))).toContain('Writes Allowlist: Lake, matching the location');
    expect(text(task(editor))).toContain('Writes Blocklist: Lake, matching the location');

    await press(editor, 'split-apply');
    expect((lastConfig(editor)!.entities as unknown[]).slice(0, 2)).toEqual([
      { entity: 'calendar.ben', blocklist: 'Field', filter_field: 'location', allowlist: 'Lake' },
      expect.objectContaining({ blocklist: 'Field|Lake', filter_field: 'location' }),
    ]);
  });

  it('shows each part’s rule alone where the events cannot be read', async () => {
    const { editor } = await onBensPage(undefined, {
      callApi: () => Promise.reject(new Error('401')),
    });
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    await press(editor, 'split-next');
    await settle(editor);

    const cards = [...root(editor).querySelectorAll('.split-part')].map(text);
    expect(cards[0]).toContain('Only all-day events');
    expect(cards[0]).toContain(
      'Ben’s upcoming events could not be read. The preview shows where they land.',
    );
    expect(cards[0]).not.toContain('Days Ahead');
  });

  it.each([
    ['Cancel', (editor: Editor) => press(editor, 'split-close')],
    [
      'Escape',
      async (editor: Editor) => {
        root(editor)
          .querySelector('.split-title')!
          .dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
          );
        await editor.updateComplete;
      },
    ],
  ])('takes the preview back on %s', async (_, close) => {
    const { editor } = await onBensPage();
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    await press(editor, 'split-next');

    await close(editor);

    expect(task(editor)).toBeNull();
    expect(lastConfig(editor)!.entities).toEqual([
      { entity: 'calendar.ben', accent_color: 'var(--blue-color)' },
      'calendar.anna',
    ]);
    expect(root(editor).activeElement?.getAttribute('data-focus')).toBe('split-row');
  });

  it('is canceled by any other change, which then writes over the entry as it was', async () => {
    const { editor } = await onBensPage();
    await press(editor, 'split-row');
    await press(editor, 'split-next');

    await press(editor, 'more:page');
    await press(editor, 'strip:page:duplicate');

    expect(task(editor)).toBeNull();
    expect(lastConfig(editor)!.entities).toEqual([
      { entity: 'calendar.ben', accent_color: 'var(--blue-color)' },
      { entity: 'calendar.ben', accent_color: 'var(--blue-color)' },
      'calendar.anna',
    ]);
  });

  it('refuses with the reason and a way out, and keeps Next off for a budget', async () => {
    const { editor } = await onBensPage(
      { entity: 'calendar.ben', allowlist: 'School', compact_events_to_show: 2 },
      { card: { event_type: 'all_day' } },
    );
    await press(editor, 'split-row');

    const refused = [...root(editor).querySelectorAll('.split-refusal')].map(text);
    expect(refused).toEqual([
      expect.stringContaining(
        'Can’t split Ben: it has its own Compact Events to Show, which two entries would double.',
      ),
      expect.stringContaining(
        'it already shows only all-day events, following the card’s Event Type.',
      ),
      expect.stringContaining(
        'Can’t split Ben by words: it already shows only events containing “School”.',
      ),
    ]);
    for (const how of ['type', 'words']) {
      expect(
        root(editor).querySelector<HTMLInputElement>(`[data-focus="split-how:${how}"]`)?.disabled,
      ).toBe(true);
    }
    expect(
      root(editor).querySelector<HTMLButtonElement>('[data-focus="split-next"]')?.disabled,
    ).toBe(true);

    await press(editor, 'split-way:calendar:allowlist');
    expect(task(editor)).toBeNull();
    expect(root(editor).querySelector('.jump [data-field="calendar:allowlist"]')).not.toBeNull();
  });
});

describe('Split This Calendar in What This Card Changes', () => {
  /** The audit's rows, by YAML path, with their group. */
  async function audit(editor: Editor): Promise<Record<string, string>> {
    await goOverview(editor);
    await press(editor, 'more:audit');
    return Object.fromEntries(
      [...root(editor).querySelectorAll<HTMLElement>('[data-audit]')].map((row) => [
        row.dataset.audit!,
        row.closest<HTMLElement>('.audit-group')!.dataset.heading!,
      ]),
    );
  }

  it('lists both parts after Split, as one undo step, and the one entry again after Undo', async () => {
    const { editor } = await onBensPage({ entity: 'calendar.ben', days_of_week: 'weekdays' });
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    await press(editor, 'split-next');
    await press(editor, 'split-apply');
    const history = (editor as unknown as { _history: { undo(): unknown; redo(): unknown } })
      ._history;

    const split = await audit(editor);
    expect(Object.keys(split).filter((path) => path.startsWith('entities'))).toEqual([
      'entities[0].days_of_week',
      'entities[0].event_type',
      // Part 1 keeps Ben's color, which follows the card; part 2 takes a free swatch.
      'entities[1].days_of_week',
      'entities[1].event_type',
      'entities[1].accent_color',
    ]);
    expect(split['entities[0].event_type']).not.toBe(split['entities[1].event_type']);

    // One step: Undo takes the whole split back, and nothing further is left to undo.
    await press(editor, 'undo');
    const undone = await audit(editor);
    expect(Object.keys(undone).filter((path) => path.startsWith('entities'))).toEqual([
      'entities[0].days_of_week',
    ]);
    expect(history.undo()).toBeUndefined();
  });
});

describe('Split This Calendar when the editor goes away or a run is left behind', () => {
  it('takes the preview back when the editor is detached before Split', async () => {
    const { editor } = await onBensPage();
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    expect((lastConfig(editor)!.entities as unknown[]).length).toBe(3);

    editor.remove();

    expect(lastConfig(editor)!.entities).toEqual([
      { entity: 'calendar.ben', accent_color: 'var(--blue-color)' },
      'calendar.anna',
    ]);
  });

  it('ignores a change sent late by a form of a canceled run', async () => {
    const { editor } = await onBensPage();
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    const stale = root(editor).querySelector<HTMLElement>(
      'ha-form.split-form[data-split-label="0"]',
    )!;
    await press(editor, 'split-close');
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    const sent = (): unknown => (lastConfig(editor)!.entities as Types.EntityConfig[])[0].label;
    const before = sent();

    stale.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { label: 'Old' } } }));
    await editor.updateComplete;

    expect(sent()).toBe(before);
    const fresh = root(editor).querySelector<HTMLElement & { data: Record<string, unknown> }>(
      'ha-form.split-form[data-split-label="0"]',
    )!;
    expect(fresh.data.label).toBe('');
  });
});

describe('a word list the card cannot read', () => {
  it('is flagged at its field, through the form’s error map', async () => {
    const { editor } = await onBensPage({ entity: 'calendar.ben', blocklist: '[' });

    const form = root(editor).querySelector<HTMLElement & { error?: unknown }>(
      '[data-field="calendar:blocklist"] ha-form',
    );
    expect(form?.error).toEqual({
      blocklist: 'This pattern cannot be read, so the card ignores it.',
    });
    await press(editor, 'split-row');
    expect(text(task(editor))).toContain('its Blocklist cannot be read');
  });

  it('is not flagged where the card reads it', async () => {
    const { editor } = await onBensPage({ entity: 'calendar.ben', blocklist: 'Soccer|School' });

    const form = root(editor).querySelector<HTMLElement & { error?: unknown }>(
      '[data-field="calendar:blocklist"] ha-form',
    );
    expect(form?.error).toBeUndefined();
  });
});
