/**
 * Pick From Preview in the editor (`views/pick.ts`, `element.ts` › `_pickPart`).
 *
 * The editor is mounted the way Home Assistant's card dialog holds it: inside a shadow root of
 * its own, beside the real card in preview mode, the card a light child of what wraps it. Only
 * the shape is copied; no Home Assistant element is named or needed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { fakeHass } from './helpers/editor-host';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';

const EDITOR_TAG = 'pick-test-editor';
if (!customElements.get(EDITOR_TAG))
  customElements.define(EDITOR_TAG, class extends CalendarCardProEditor {});

interface Card extends HTMLElement {
  setConfig(config: unknown): void;
  hass: Types.Hass;
  preview: boolean;
  events: Types.CalendarEventData[];
  isInitialLoad: boolean;
  config: Types.Config;
  updateEvents(): Promise<void>;
  updateComplete: Promise<boolean>;
}

type Editor = CalendarCardProEditor & { updateComplete: Promise<boolean> };

// Nothing a List-or-other-layout migration would ask about, so the editor opens on its overview.
const CONFIG = {
  type: 'custom:calendar-card-pro-dev',
  entities: ['calendar.anna', 'calendar.ben'],
  days_to_show: 3,
  toolbar: { show: true, legend: 'chips' },
};

async function makeCard(config: Record<string, unknown>, preview = true): Promise<Card> {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  vi.spyOn(card, 'updateEvents').mockResolvedValue();
  card.setConfig(config);
  card.preview = preview;
  card.hass = {
    states: {},
    locale: { language: 'en' },
    callApi: async () => [],
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
  } as unknown as Types.Hass;
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  card.events = [
    {
      summary: 'Dentist',
      start: { dateTime: at(1) },
      end: { dateTime: at(2) },
      location: 'Maple Street Clinic',
      _entityId: 'calendar.anna',
    },
  ].map((each) => ({ ...each, _matchedConfig: card.config.entities[0] as Types.EntityConfig }));
  card.isInitialLoad = false;
  return card;
}

/**
 * Home Assistant's dialog, in shape: the editor in a shadow root, the preview beside it, and on a
 * sections dashboard (`section`) inside a section's shadow root one level further down.
 */
async function dialog(
  options: {
    preview?: boolean;
    section?: boolean;
    card?: Record<string, unknown>;
    editor?: Record<string, unknown>;
  } = {},
) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const holder = document.createElement('div');
  const editor = document.createElement(EDITOR_TAG) as Editor;
  editor.hass = fakeHass() as Types.Hass;
  editor.setConfig((options.editor ?? CONFIG) as unknown as Types.Config);
  holder.attachShadow({ mode: 'open' }).append(editor);
  const wrap = document.createElement('div');
  const card = await makeCard(options.card ?? CONFIG, options.preview ?? true);
  wrap.append(card);
  if (options.section) {
    const section = document.createElement('div');
    section.attachShadow({ mode: 'open' }).append(wrap);
    root.append(holder, section);
  } else {
    root.append(holder, wrap);
  }
  document.body.append(host);
  await settle(editor, card);
  return { editor, card, wrap };
}

async function settle(editor: Editor, card?: Card): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await editor.updateComplete;
    await card?.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const $ = (editor: Editor, selector: string) =>
  editor.shadowRoot!.querySelector<HTMLElement>(selector);
const text = (element: Element | null): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const pickButton = (editor: Editor) => $(editor, '[data-focus="pick"]');

/** Every sentence the live region says from now on. */
function listen(editor: Editor): string[] {
  const said: string[] = [];
  const region = $(editor, '.live-region')!;
  new MutationObserver(() => {
    const text = region.textContent?.trim();
    if (text) said.push(text);
  }).observe(region, { childList: true, characterData: true, subtree: true });
  return said;
}

function fire(target: Element, type: string, init: Record<string, unknown> = {}): Event {
  const event = type.startsWith('pointer')
    ? new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, ...init })
    : new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Pick From Preview', () => {
  it('draws no button where the dialog shows no preview of the card', async () => {
    const { editor } = await dialog({ preview: false });
    expect(pickButton(editor)).toBeNull();
    const alone = document.createElement(EDITOR_TAG) as Editor;
    alone.hass = fakeHass() as Types.Hass;
    alone.setConfig(CONFIG as unknown as Types.Config);
    document.body.append(alone);
    await settle(alone);
    expect(pickButton(alone)).toBeNull();
  });

  it('finds the preview a sections dashboard holds in a section, one shadow root down', async () => {
    const { editor, card } = await dialog({ section: true });
    expect(pickButton(editor)).not.toBeNull();
    pickButton(editor)!.click();
    await settle(editor, card);
    expect(card.shadowRoot!.querySelector('.ccp-pick-layer')).not.toBeNull();
  });

  it('never reaches a card two shadow roots below the dialog, as a dashboard’s own cards are', async () => {
    const { editor, wrap } = await dialog({ preview: false });
    const deeper = document.createElement('div');
    const inner = document.createElement('div');
    inner.attachShadow({ mode: 'open' }).append(await makeCard(CONFIG));
    deeper.attachShadow({ mode: 'open' }).append(inner);
    wrap.append(deeper);
    editor.requestUpdate();
    await settle(editor);
    expect(pickButton(editor)).toBeNull();
  });

  it('turns on from its button, beside Undo and Redo, and Escape turns it off', async () => {
    const { editor, card } = await dialog();
    const button = pickButton(editor)!;
    expect(button.getAttribute('aria-label')).toBe('Pick From Preview');
    expect(button.closest('.search-row')).not.toBeNull();
    button.click();
    await settle(editor, card);
    expect(pickButton(editor)!.getAttribute('aria-pressed')).toBe('true');
    expect($(editor, '[data-pick-banner]')!.textContent).toContain(
      'Click a part of the preview to open its settings.',
    );
    expect(card.shadowRoot!.querySelector('.ccp-pick-layer')).not.toBeNull();

    $(editor, '.card-config')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await settle(editor, card);
    expect($(editor, '[data-pick-banner]')).toBeNull();
    expect(pickButton(editor)!.getAttribute('aria-pressed')).toBe('false');
    expect(card.shadowRoot!.querySelector('.ccp-pick-layer')).toBeNull();
    expect(editor.shadowRoot!.activeElement).toBe(pickButton(editor));
  });

  it('keeps the preview’s own gestures from the card while on, and only then', async () => {
    const { editor, card } = await dialog();
    const location = card.shadowRoot!.querySelector('.location span')!;
    const seen: string[] = [];
    for (const type of ['pointerdown', 'pointerup', 'contextmenu', 'click']) {
      location.parentElement!.addEventListener(type, () => seen.push(type));
    }
    pickButton(editor)!.click();
    await settle(editor, card);
    fire(location, 'pointerdown', { pointerType: 'mouse' });
    fire(location, 'pointerup', { pointerType: 'mouse' });
    const menu = fire(location, 'contextmenu');
    expect(menu.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);

    $(editor, '[data-pick-banner] button')!.click();
    await settle(editor, card);
    fire(location, 'pointerdown', { pointerType: 'mouse' });
    expect(seen).toEqual(['pointerdown']);
  });

  it('opens the part clicked: its page, its heading, its first setting marked', async () => {
    const { editor, card } = await dialog();
    pickButton(editor)!.click();
    await settle(editor, card);
    const said = listen(editor);
    const day = card.shadowRoot!.querySelector('.date-column .day')!;
    fire(day, 'pointermove', { pointerType: 'mouse' });
    expect(card.shadowRoot!.querySelector('.ccp-pick-label')!.textContent).toBe(
      'Days › Date · Click to Edit',
    );
    fire(day, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="day_header"]')).not.toBeNull();
    // Every setting is drawn, so the heading's first in the registry, opened by the jump.
    const jump = $(editor, '.page-group[data-heading="heading.date"] .jump [data-field]');
    expect(jump?.getAttribute('data-field')).toBe('day_header:date_vertical_alignment');
    expect($(editor, '[data-pick-banner]')).toBeNull();
    expect(card.shadowRoot!.querySelector('.ccp-pick-layer')).toBeNull();
    expect(said).toContain('Showing Days › Date.');
  });

  it('opens Weeks at its first setting of its own, past First Day Of Week’s row', async () => {
    const weeks = { ...CONFIG, show_week_numbers: 'iso', first_day_of_week: 'monday' };
    const { editor, card } = await dialog({ card: weeks, editor: weeks });
    pickButton(editor)!.click();
    await settle(editor, card);
    fire(card.shadowRoot!.querySelector('.week-number')!, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="day_header"]')).not.toBeNull();
    const heading = '.page-group[data-heading="heading.weeks"]';
    // The heading opens with the whole card's First Day Of Week, a row that opens it at home.
    expect($(editor, `${heading} [data-reference="content:first_day_of_week"]`)).not.toBeNull();
    const jump = $(editor, `${heading} .jump [data-field]`);
    expect(jump?.getAttribute('data-field')).toBe('day_header:week_number_mode');
    expect(editor.shadowRoot!.activeElement?.closest('[data-reference]')).toBeNull();
    expect(editor.shadowRoot!.activeElement?.closest('.jump')).not.toBeNull();
  });

  it('opens a heading whose settings are all folded at its first, opened', async () => {
    const { editor, card } = await dialog();
    pickButton(editor)!.click();
    await settle(editor, card);
    const said = listen(editor);
    const location = card.shadowRoot!.querySelector('.location span')!;
    fire(location, 'pointermove', { pointerType: 'mouse' });
    expect(card.shadowRoot!.querySelector('.ccp-pick-label')!.textContent).toBe(
      'Event Appearance › Location · Click to Edit',
    );
    fire(location, 'click');
    await settle(editor, card);
    const jump = $(editor, '.page-group[data-heading="location"] .jump [data-field]');
    expect(jump).not.toBeNull();
    expect(
      editor.shadowRoot!.activeElement?.closest('.page-group')?.getAttribute('data-heading'),
    ).toBe('location');
    expect(said).toContain('Showing Event Appearance › Location.');
  });

  it('opens Layouts in Switcher for the view switcher, under the Controls that turn it off', async () => {
    const { editor, card } = await dialog();
    pickButton(editor)!.click();
    await settle(editor, card);
    const said = listen(editor);
    const switcher = card.shadowRoot!.querySelector('.view-switcher .view-switcher-segment')!;
    fire(switcher, 'pointermove', { pointerType: 'mouse' });
    expect(card.shadowRoot!.querySelector('.ccp-pick-label')!.textContent).toBe(
      'Card & Header › Toolbar · Click to Edit',
    );
    fire(switcher, 'click');
    await settle(editor, card);
    // Not the toolbar's first setting, Show Toolbar: the line that says what the switcher offers,
    // a checkbox per layout under the Controls.
    const jump = $(editor, '.page-group[data-heading="heading_toolbar"] .jump [data-field]');
    expect(jump?.getAttribute('data-field')).toBe('card:toolbar.view_switcher_layouts');
    expect(
      editor.shadowRoot!.querySelectorAll('[data-composed="layouts"] input[type="checkbox"]'),
    ).toHaveLength(4);
    expect(said).toContain('Showing Card & Header › Toolbar.');
  });

  it('opens a legend chip’s calendar on its own page', async () => {
    const { editor, card } = await dialog();
    pickButton(editor)!.click();
    await settle(editor, card);
    const chip = card.shadowRoot!.querySelector('.legend-chip[data-calendar="calendar.ben"]')!;
    fire(chip, 'click');
    await settle(editor, card);
    expect($(editor, '.entry-page')?.getAttribute('data-entry-key')).toBe('1');
  });

  // A Whole Card page edits the shared scope, which is Layout Defaults' too, so a part that names
  // no layout of its own has to open under the layout the preview draws there, the one the card
  // opens in: where the same pick lands from that layout's own page.
  it('opens a part picked from a Whole Card page under the layout the preview draws', async () => {
    const month = { ...CONFIG, view: 'month' };
    const pickTime = async (from: string) => {
      const { editor, card } = await dialog({ card: month, editor: month });
      // The preview is configured, not redrawn: it keeps drawing Month's time on another
      // layout's page, where happy-dom trips over focus in a redraw.
      vi.spyOn(card, 'setConfig').mockImplementation(() => undefined);
      $(editor, `[data-focus="${from}"]`)!.click();
      await settle(editor, card);
      const start = {
        page: $(editor, '.page')?.getAttribute('data-page') ?? null,
        sub: text($(editor, '.page-sub')),
      };
      pickButton(editor)!.click();
      await settle(editor, card);
      const said = listen(editor);
      fire(card.shadowRoot!.querySelector('.month-line-time')!, 'click');
      await settle(editor, card);
      const landed = {
        page: $(editor, '.page')?.getAttribute('data-page'),
        sub: text($(editor, '.page-sub')),
        field: $(editor, '.page-group[data-heading="time"] .jump [data-field]')?.getAttribute(
          'data-field',
        ),
        said,
      };
      document.body.replaceChildren();
      vi.restoreAllMocks();
      return { start, landed };
    };
    // From Month's own page, under Month, at Time's first setting in Month's order.
    const control = await pickTime('layout:month');
    expect(control.start).toEqual({ page: null, sub: 'Layout' });
    expect(control.landed).toEqual({
      page: 'events',
      sub: 'Month',
      field: 'events:time_two_digit_hours',
      said: ['Showing Event Appearance › Time.'],
    });
    // From a layout the card does not open in, under that layout, so "the layout the preview
    // draws" is not simply the one the card opens in.
    expect((await pickTime('layout:grid')).landed).toMatchObject({ page: 'events', sub: 'Grid' });
    for (const page of ['card_header', 'events_weather_language', 'taps_refresh']) {
      const from = await pickTime(`nav:${page}`);
      expect(from.start, page).toEqual({ page, sub: 'Whole Card' });
      expect(from.landed, page).toEqual(control.landed);
    }
  });

  it('switches to Grid for a part only Grid’s scope holds, and says so', async () => {
    const { editor, card } = await dialog({ card: { ...CONFIG, view: 'grid' } });
    pickButton(editor)!.click();
    await settle(editor, card);
    const said = listen(editor);
    fire(card.shadowRoot!.querySelector('.grid-axis-label')!, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="size_spacing"]')).not.toBeNull();
    expect(said).toEqual(['Showing Size & Spacing › Hour Labels.']);
  });

  it('outlines on the first tap of a touch screen and opens on a second on the same part', async () => {
    const { editor, card } = await dialog();
    pickButton(editor)!.click();
    await settle(editor, card);
    const location = card.shadowRoot!.querySelector('.location span')!;
    fire(location, 'pointerdown', { pointerType: 'touch' });
    fire(location, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="events"]')).toBeNull();
    expect(card.shadowRoot!.querySelector('.ccp-pick-label')!.textContent).toBe(
      'Event Appearance › Location · Tap to Edit',
    );
    fire(location, 'pointerdown', { pointerType: 'touch' });
    fire(location, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="events"]')).not.toBeNull();
  });

  it('follows the card when Home Assistant replaces it, and ends as the editor moves', async () => {
    const { editor, card, wrap } = await dialog();
    pickButton(editor)!.click();
    await settle(editor, card);
    const next = await makeCard({ ...CONFIG, title: 'Family' });
    card.replaceWith(next);
    await settle(editor, next);
    expect(next.shadowRoot!.querySelector('.ccp-pick-layer')).not.toBeNull();
    expect(wrap.contains(card)).toBe(false);

    $(editor, '[data-focus="nav:taps_refresh"]')!.click();
    await settle(editor, next);
    expect($(editor, '.page[data-page="taps_refresh"]')).not.toBeNull();
    expect($(editor, '[data-pick-banner]')).toBeNull();
    expect(next.shadowRoot!.querySelector('.ccp-pick-layer')).toBeNull();
  });
});

// The preview follows the layout being edited through the card Home Assistant's dialog previews, found as
// Pick From Preview finds it, and configured through its own `setConfig` (`views/scope-preview.ts`).
describe('the preview in Home Assistant’s dialog', () => {
  it('draws the layout being edited, the card as it opens elsewhere, and no switcher the card never offers', async () => {
    const month = {
      ...CONFIG,
      view: 'month',
      toolbar: {
        show: true,
        view_switcher: true,
        view_switcher_layouts: ['list', 'grid', 'month'],
      },
    };
    const { editor, card } = await dialog({ card: month, editor: month });
    // What the preview's card is configured with, recorded rather than drawn: the card's own
    // rendering is the card's tests' business, and happy-dom trips over focus in a redraw here.
    const given: Array<Record<string, unknown>> = [];
    vi.spyOn(card, 'setConfig').mockImplementation((config) => {
      given.push(config as Record<string, unknown>);
    });
    const last = () => given[given.length - 1];
    const shown = () => last()?.view ?? 'month';
    const press = async (key: string) => {
      editor.shadowRoot!.querySelector<HTMLElement>(`[data-focus="${key}"]`)!.click();
      await settle(editor, card);
    };
    expect(given).toEqual([]);

    // A layout's page draws that layout: the configuration as written, `view` alone laid over it,
    // since the switcher offers Grid.
    await press('layout:grid');
    expect(last()).toEqual({ ...month, view: 'grid' });
    // Its topics too.
    await press('nav:size_spacing');
    expect(shown()).toBe('grid');
    // Back on the overview, the card as it opens, handed back as written.
    await press('back-top');
    await press('back-top');
    expect(last()).toEqual(month);
    // Layout Defaults is no layout of its own: the card as it opens.
    await press('layout:shared');
    expect(last()).toEqual(month);
    await press('back-top');
    // Columns, which the switcher does not offer, is drawn without the switcher.
    await press('layout:column');
    expect(last()).toEqual({
      ...month,
      view: 'column',
      toolbar: { ...month.toolbar, view_switcher: false },
    });
  });
});
