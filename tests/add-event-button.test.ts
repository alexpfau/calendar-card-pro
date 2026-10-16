/**
 * The add-event button.
 *
 * `show_add_event` defaults to `false`, so every DOM gate built from default config sees
 * no button at all and would stay green if the option did nothing. Each on-state case
 * below is paired with the state that must draw nothing — the flag off, or only
 * read-only calendars — so the pair distinguishes "the option works" from "the fixture
 * happens to produce this".
 *
 * Two behaviors are pinned beyond the rendering: a press on the button must never become
 * a press on the card (the card captures the pointer for its own tap and hold actions),
 * and the dialog must preselect the first calendar that can actually take the event.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as AddEvent from '../src/interaction/add-event';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

const handleAction = vi.hoisted(() => vi.fn());
vi.mock('../src/interaction/actions', () => ({ handleAction }));

const WRITABLE = 'calendar.anna';
const WRITABLE_2 = 'calendar.ben';
const READ_ONLY = 'calendar.holidays';

/** States for one writable calendar, a second writable one, and a read-only one. */
function states(): Record<string, Types.HassEntity> {
  return {
    [WRITABLE]: { entity_id: WRITABLE, state: 'off', attributes: { supported_features: 7 } },
    [WRITABLE_2]: { entity_id: WRITABLE_2, state: 'off', attributes: { supported_features: 1 } },
    [READ_ONLY]: { entity_id: READ_ONLY, state: 'off', attributes: { supported_features: 0 } },
  };
}

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  updateEvents(force?: boolean): Promise<void>;
  _activePointerId: number | null;
  readonly updateComplete: Promise<boolean>;
}

async function mount(
  overrides: Partial<Types.Config> = {},
  hassExtras: Record<string, unknown> = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig(overrides));
  card.hass = { states: states(), locale: { language: 'en' }, ...hassExtras };
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

function button(card: CardUnderTest): HTMLElement | null {
  return card.shadowRoot!.querySelector<HTMLElement>('.add-event-button');
}

/** Stand in for Home Assistant having already loaded its event dialog. */
function dialogAlreadyLoaded(): void {
  const original = customElements.get.bind(customElements);
  vi.spyOn(customElements, 'get').mockImplementation((tag: string) =>
    tag === AddEvent.EVENT_EDITOR_DIALOG_TAG
      ? (class {} as CustomElementConstructor)
      : original(tag),
  );
}

beforeEach(() => {
  handleAction.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writableCalendarIds', () => {
  it('keeps writable calendars in configuration order, once each', () => {
    const hass = { states: states() } as unknown as Types.Hass;

    expect(
      AddEvent.writableCalendarIds(hass, [
        READ_ONLY,
        { entity: WRITABLE_2 },
        WRITABLE,
        { entity: WRITABLE_2, event_type: 'all_day' },
        'calendar.missing',
      ]),
    ).toEqual([WRITABLE_2, WRITABLE]);
  });

  it('finds nothing before Home Assistant arrives', () => {
    expect(AddEvent.writableCalendarIds(null, [WRITABLE])).toEqual([]);
  });
});

describe('add-event button rendering', () => {
  it('draws nothing by default', async () => {
    const card = await mount({ entities: [WRITABLE] });
    expect(button(card)).toBeNull();
  });

  it('draws nothing when no configured calendar accepts events', async () => {
    const card = await mount({ entities: [READ_ONLY], show_add_event: true });
    expect(button(card)).toBeNull();
  });

  it('draws the button below the events by default once switched on', async () => {
    const card = await mount({ entities: [READ_ONLY, WRITABLE], show_add_event: true });
    const el = button(card)!;

    expect(el).not.toBeNull();
    expect(el.classList.contains('add-event-below')).toBe(true);
    expect(el.getAttribute('size')).toBe('s');
    expect(el.previousElementSibling?.classList.contains('content-container')).toBe(true);
    expect(el.textContent?.trim()).toBe('Add event');
  });

  it('honors on_top and the size', async () => {
    const card = await mount({
      entities: [WRITABLE],
      show_add_event: true,
      add_event_style: 'on_top',
      add_event_size: 'large',
    });
    const el = button(card)!;

    expect(el.classList.contains('add-event-on-top')).toBe(true);
    expect(el.getAttribute('size')).toBe('l');
  });

  it('puts a small icon button in the header, whatever the size', async () => {
    const card = await mount({
      entities: [WRITABLE],
      show_add_event: true,
      add_event_style: 'header',
      add_event_size: 'large',
    });
    const el = button(card)!;
    const header = card.shadowRoot!.querySelector('.header-container')!;

    expect(el.classList.contains('add-event-header')).toBe(true);
    expect(header.contains(el)).toBe(true);
    expect(header.classList.contains('has-add-event')).toBe(true);
    expect(el.getAttribute('size')).toBe('s');
    expect(el.getAttribute('aria-label')).toBe('Add event');
  });

  it('leaves the header row alone when the button is elsewhere', async () => {
    const card = await mount({ entities: [WRITABLE], show_add_event: true });
    const header = card.shadowRoot!.querySelector('.header-container')!;

    expect(header.classList.contains('has-add-event')).toBe(false);
  });

  it("uses Home Assistant's own translation of the label", async () => {
    const localize = (key: string) =>
      key === 'ui.components.calendar.event.add' ? 'Aggiungi evento' : '';
    const card = await mount({ entities: [WRITABLE], show_add_event: true }, { localize });

    expect(button(card)!.textContent?.trim()).toBe('Aggiungi evento');
  });
});

describe('add-event configuration values', () => {
  it('falls back to the defaults for values the card does not draw', () => {
    expect(Config.resolveAddEventStyle('sideways')).toBe('below');
    expect(Config.resolveAddEventSize(42)).toBe('small');
    expect(Config.resolveAddEventStyle('header')).toBe('header');
    expect(Config.resolveAddEventSize('medium')).toBe('medium');
  });

  it('offers exactly the documented vocabulary', () => {
    expect(Config.ADD_EVENT_STYLES).toEqual(['below', 'header', 'on_top']);
    expect(Config.ADD_EVENT_SIZES).toEqual(['small', 'medium', 'large']);
  });
});

describe('pressing the add-event button', () => {
  it('opens the dialog for the first writable calendar and refreshes once saved', async () => {
    dialogAlreadyLoaded();
    const card = await mount({ entities: [READ_ONLY, WRITABLE_2, WRITABLE], show_add_event: true });
    const updateEvents = vi.spyOn(card, 'updateEvents').mockResolvedValue();

    const shown = new Promise<CustomEvent>((resolve) =>
      document.body.addEventListener('show-dialog', (ev) => resolve(ev as CustomEvent), {
        once: true,
      }),
    );
    button(card)!.click();
    const detail = (await shown).detail as {
      dialogTag: string;
      dialogParams: { calendarId: string; updated: () => void };
    };

    expect(detail.dialogTag).toBe('dialog-calendar-event-editor');
    expect(detail.dialogParams.calendarId).toBe(WRITABLE_2);
    expect(updateEvents).not.toHaveBeenCalled();

    detail.dialogParams.updated();
    expect(updateEvents).toHaveBeenCalledWith(true);
  });

  it('does not run the card tap action', async () => {
    dialogAlreadyLoaded();
    const card = await mount({
      entities: [WRITABLE],
      show_add_event: true,
      tap_action: { action: 'expand' },
    });
    const el = button(card)!;

    el.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('pointerup', { bubbles: true, composed: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    el.click();

    expect(card._activePointerId).toBeNull();
    expect(handleAction).not.toHaveBeenCalled();
  });
});

// Order matters below: the last case defines the dialog element for real, and a custom
// element cannot be undefined again, so the fallback has to run first.
describe('loading the dialog', () => {
  it('falls back to the calendar panel when the dialog cannot be loaded', async () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    const shown = vi.fn();
    const navigated = vi.fn();
    document.body.addEventListener('show-dialog', shown);
    document.body.addEventListener('location-changed', navigated);

    await AddEvent.openCreateEventDialog(node, WRITABLE, () => {});

    expect(pushState).toHaveBeenCalledWith(null, '', '/calendar');
    expect(navigated).toHaveBeenCalledTimes(1);
    expect(shown).not.toHaveBeenCalled();
  });

  it("borrows Home Assistant's own dialog import from ha-full-calendar", async () => {
    const dialogImport = vi.fn(async () => {
      customElements.define(AddEvent.EVENT_EDITOR_DIALOG_TAG, class extends HTMLElement {});
    });
    const createCardElement = vi.fn(() => {
      class FullCalendar extends HTMLElement {
        _activeView?: string;
        _createEvent(): void {
          const event = new Event('show-dialog');
          (event as Event & { detail?: unknown }).detail = {
            dialogTag: AddEvent.EVENT_EDITOR_DIALOG_TAG,
            dialogImport,
            dialogParams: {},
          };
          this.dispatchEvent(event);
        }
      }
      customElements.define('ha-full-calendar', FullCalendar);
      return document.createElement('div');
    });
    (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => ({
      createCardElement,
    });

    await AddEvent.ensureEventEditorLoaded(WRITABLE);

    expect(createCardElement).toHaveBeenCalledWith({ type: 'calendar', entities: [WRITABLE] });
    expect(dialogImport).toHaveBeenCalledTimes(1);
    expect(customElements.get(AddEvent.EVENT_EDITOR_DIALOG_TAG)).toBeDefined();

    delete (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers;
  });
});
