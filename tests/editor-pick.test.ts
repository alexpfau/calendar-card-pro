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
      'Day Header › Date · Click to Edit',
    );
    fire(day, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="day_header"]')).not.toBeNull();
    // Every setting is drawn, so the heading's first in the registry, opened by the jump.
    const jump = $(editor, '.page-group[data-heading="heading.date"] .jump [data-field]');
    expect(jump?.getAttribute('data-field')).toBe('day_header:date_vertical_alignment');
    expect($(editor, '[data-pick-banner]')).toBeNull();
    expect(card.shadowRoot!.querySelector('.ccp-pick-layer')).toBeNull();
    expect(said).toContain('Showing Day Header › Date.');
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
    // Not the toolbar's first setting, Show Toolbar: the one that says what the switcher offers,
    // opened from its fold to its chips.
    const jump = $(editor, '.page-group[data-heading="heading_toolbar"] .jump [data-field]');
    expect(jump?.getAttribute('data-field')).toBe('card:toolbar.view_switcher_layouts');
    expect(
      editor.shadowRoot!.querySelectorAll('[data-composed="layouts"] button.chip'),
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

  it('switches to Grid for a part only Grid’s scope holds, and says so', async () => {
    const { editor, card } = await dialog({ card: { ...CONFIG, view: 'grid' } });
    pickButton(editor)!.click();
    await settle(editor, card);
    const said = listen(editor);
    fire(card.shadowRoot!.querySelector('.grid-axis-label')!, 'click');
    await settle(editor, card);
    expect($(editor, '.page[data-page="grid"]')).not.toBeNull();
    expect(said).toEqual(['Now editing settings for Grid.', 'Showing Grid › Hour Labels.']);
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

    $(editor, '[data-focus="nav:weather"]')!.click();
    await settle(editor, next);
    expect($(editor, '.page[data-page="weather"]')).not.toBeNull();
    expect($(editor, '[data-pick-banner]')).toBeNull();
    expect(next.shadowRoot!.querySelector('.ccp-pick-layer')).toBeNull();
  });
});
