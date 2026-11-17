/**
 * Small defects a user meets on the way through the editor, each pinned where it was found:
 * where focus lands after Add Calendar, Add Setting, a cross-link and a fresh card's first
 * render; what Undo says when it opens another page; Settings For's checked option after a visit
 * to a calendar's page; and the words a few lines put together.
 */

import { LitElement, html } from 'lit';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  entry,
  fakeHass,
  goEntry,
  goPage,
  helperOf,
  keysOf,
  lastConfig,
  mountEditor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

const NAMED = {
  [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna' } },
  [BEN]: { entity_id: BEN, state: 'off', attributes: { friendly_name: 'Ben' } },
};

/**
 * A stand-in for Home Assistant's form that draws one text box inside its shadow root, a frame
 * after it is connected, as Home Assistant's own forms draw their controls late.
 */
class LateForm extends LitElement {
  static override properties = { drawn: { state: true } };

  declare drawn: boolean;

  override connectedCallback(): void {
    super.connectedCallback();
    requestAnimationFrame(() => {
      this.drawn = true;
    });
  }

  override render(): unknown {
    return this.drawn ? html`<input class="late-input" />` : html``;
  }
}

beforeAll(() => {
  if (!customElements.get('ha-form')) customElements.define('ha-form', LateForm);
});
afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Mounts the editor over calendars Home Assistant knows.
 *
 * @param config - Options beside the version
 * @returns The editor
 */
function mount(config: Record<string, unknown>): Promise<Editor> {
  return mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, ...config },
    { hass: fakeHass({ states: NAMED }) },
  );
}

/**
 * Presses one of the editor's own controls by its `data-focus` key, then lets the render and the
 * focus after it settle.
 *
 * @param editor - The editor
 * @param focus - The key
 */
async function press(editor: Editor, focus: string): Promise<void> {
  const found = editor.shadowRoot!.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
  if (!found) throw new Error(`no control ${focus}`);
  found.click();
  await editor.updateComplete;
  await editor.updateComplete;
}

/**
 * Waits for a few frames, for what draws late.
 *
 * @param frames - How many
 */
async function frames(frames = 4): Promise<void> {
  for (let at = 0; at < frames; at += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * The element focus is on, through the shadow roots below the editor's.
 *
 * @param editor - The editor
 * @returns It, or null
 */
function deepFocus(editor: Editor): Element | null {
  let active: Element | null = editor.shadowRoot!.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/**
 * What the live region says now.
 *
 * @param editor - The editor
 * @returns Its text
 */
function said(editor: Editor): string {
  return editor.shadowRoot!.querySelector('.live-region')?.textContent?.trim() ?? '';
}

describe('focus', () => {
  it('lands in the calendar picker after Add Calendar, ready to type into', async () => {
    const editor = await mount({ entities: [ANNA] });

    await press(editor, 'add-calendar');
    await frames();

    expect(deepFocus(editor)?.className).toBe('late-input');
  });

  it('lands in the setting an Add row adds, never on its Remove', async () => {
    const editor = await mount({ entities: [ANNA], view: 'list' });
    await goPage(editor, 'day_header');
    const toggle = [
      ...editor.shadowRoot!.querySelectorAll<HTMLElement>('.add-toggle[data-focus]'),
    ][0];
    await press(editor, toggle.dataset.focus!);
    const item = editor.shadowRoot!.querySelector<HTMLElement>('.add-item:not(.add-all)')!;
    await press(editor, item.dataset.focus!);
    await frames();

    const active = deepFocus(editor);
    expect(active?.className).toBe('late-input');
    expect(active?.closest?.('.field-line')).toBeFalsy();
  });

  it('lands on the section a cross-link names, not on the page’s title', async () => {
    const editor = await mount({ entities: [ANNA], view: 'list' });
    await goPage(editor, 'day_header');
    const link = editor.shadowRoot!.querySelector<HTMLElement>('[data-focus^="xlink:"]')!;
    const heading = link.dataset.focus!.slice('xlink:'.length);

    await press(editor, link.dataset.focus!);

    const active = editor.shadowRoot!.activeElement as HTMLElement;
    expect(active.closest('[data-heading]')?.getAttribute('data-heading')).toBe(heading);
    expect(active.classList.contains('page-title')).toBe(false);
  });

  it('starts a fresh card on Start From an Example when nothing else has focus', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const editor = await mountEditor({ type: 'custom:calendar-card-pro' }, { hass: fakeHass() });
    await editor.updateComplete;

    expect((editor.shadowRoot!.activeElement as HTMLElement | null)?.dataset.focus).toBe(
      'quick-setup',
    );
  });

  it('waits for Home Assistant’s card picker to close before starting a fresh card', async () => {
    // The picker holds focus as the editor first draws, then closes and leaves it on the body.
    const picker = document.createElement('hui-dialog-create-card');
    const card = document.createElement('button');
    picker.appendChild(card);
    document.body.appendChild(picker);
    card.focus();
    const editor = await mountEditor({ type: 'custom:calendar-card-pro' }, { hass: fakeHass() });
    expect(document.activeElement).toBe(card);

    // Home Assistant then focuses its edit dialog's frame, and drops that on the body too.
    picker.remove();
    const frame = document.createElement('dialog');
    frame.tabIndex = -1;
    document.body.appendChild(frame);
    frame.focus();
    await frames(2);
    expect(document.activeElement).toBe(frame);
    frame.remove();
    await frames(2);

    expect((editor.shadowRoot!.activeElement as HTMLElement | null)?.dataset.focus).toBe(
      'quick-setup',
    );
  });

  it('leaves focus where it is on a fresh card when something already has it', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    await mountEditor({ type: 'custom:calendar-card-pro' }, { hass: fakeHass() });

    expect(document.activeElement).toBe(outside);
  });

  it('keeps Settings For’s option checked after Duplicate and Back', async () => {
    // A value stored for another layout keeps Settings For full rather than one line.
    const editor = await mount({
      entities: [ANNA, BEN],
      view: 'grid',
      list: { show_location: true },
    });
    const [anna] = keysOf(editor, 'entry');
    const radios = (): HTMLInputElement[] => [
      ...editor.shadowRoot!.querySelectorAll<HTMLInputElement>('input[name="scope"]'),
    ];
    const checked = (): string | undefined => radios().find((input) => input.checked)?.value;
    expect(checked()).toBe('grid');

    await press(editor, `more:entry:${anna}`);
    await press(editor, `strip:entry:${anna}:duplicate`);
    await press(editor, 'back-top');
    expect(checked()).toBe('grid');

    // The browser can uncheck a radio behind Lit's back, as Home Assistant showed after
    // Duplicate and Back: the next render checks it again.
    radios().find((input) => input.value === 'grid')!.checked = false;
    editor.requestUpdate();
    await editor.updateComplete;
    expect(checked()).toBe('grid');
  });
});

describe('announcements', () => {
  it('names the page Undo opens', async () => {
    const editor = await mount({ entities: [ANNA], view: 'list' });
    await goPage(editor, 'events');
    const chip = editor.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!;
    chip.click();
    await editor.updateComplete;
    await press(editor, 'back-top');
    expect(lastConfig(editor)).toBeDefined();

    await press(editor, 'undo');

    expect(said(editor)).toMatch(/^Undid: .+\. Showing Event Appearance\.$/);
  });
});

describe('words', () => {
  it('leaves the brackets out of a value stored blank', async () => {
    // Location is off in Grid by default, so Countries To Remove, stored blank, is not in use.
    const editor = await mount({ entities: [ANNA], view: 'grid', remove_location_country: '' });
    await goPage(editor, 'events');
    const lines = [...editor.shadowRoot!.querySelectorAll('.inactive-line')].map((line) =>
      line.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(lines.some((line) => line?.startsWith('Stored but not in use: '))).toBe(true);
    expect(lines.filter((line) => line?.includes('()'))).toEqual([]);
  });

  it('shows a label field’s helper only under the value it speaks of', async () => {
    const editor = await mount({
      entities: [
        { entity: ANNA, label: 'A' },
        { entity: BEN, label: '/local/ben.png' },
      ],
    });
    const [anna, ben] = keysOf(editor, 'entry');

    await goEntry(editor, anna);
    expect(helperOf(editor, 'calendar:label_type', entry(0)) ?? '').not.toContain('/local/');
    await goEntry(editor, ben);
    expect(helperOf(editor, 'calendar:label_type', entry(1))).toContain('/local/work.png');
  });

  it('names the Now line’s default color rather than spelling its hex code', async () => {
    const editor = await mount({ entities: [ANNA], view: 'list' });
    await goPage(editor, 'events');
    await press(editor, 'add:heading_event_state');

    expect(
      editor
        .shadowRoot!.querySelector('[data-focus="add:heading_event_state"]')
        ?.closest('.add-row')
        ?.querySelector('.add-item-value')?.textContent,
    ).toBe('Emerald');
  });
});
