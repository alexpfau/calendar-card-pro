/**
 * The card's own event popover: an event's details, editable in place, and a new event.
 *
 * Opened through Home Assistant's dialog manager (`show-dialog` with this element's tag), which
 * gives it Back to close and puts focus back where it was, and drawn as a native modal
 * `<dialog>` in the top layer, beside the press that opened it, or as a sheet from the bottom
 * of a narrow screen. Every field is a cell that edits in place where the event may change.
 * Nothing is written while it is open: the changes are saved once, when it closes, and Escape
 * closes it without saving them. Every word it shows is Home Assistant's own (`hass.localize`),
 * so it needs no translation of its own.
 */

import { mdiMapMarkerOutline } from '@mdi/js';
import { LitElement, PropertyValues, TemplateResult, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import * as Types from '../config/types';
import * as Writes from '../interaction/calendar-writes';
import * as EventMap from '../interaction/event-map';
import * as Times from '../interaction/event-times';
import * as Model from '../interaction/popover-model';
import * as RRule from '../interaction/rrule';
import * as Links from '../utils/links';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The popover's element name; the production build drops `-dev`, as it does for the card. */
export const EVENT_POPOVER_TAG = 'calendar-card-pro-dev-event-popover';

/** Below this viewport width the popover is a sheet from the bottom of the screen. */
const SHEET_BELOW_PX = 600;

/** The popover's width beside a press. */
const POPOVER_WIDTH = 340;

/** How far the popover keeps from the press and from the viewport's edges. */
const GAP = 14;
const MARGIN = 12;

/**
 * Below a toolbar button: how far the popover's top keeps from the button, and how far in from
 * the popover's left edge its arrow points up at the button.
 */
const BELOW_GAP = 10;
const EAR_INSET = 32;

/**
 * How the popover leaves, the reverse of how it opens, as measured from a screen recording of
 * Calendar on macOS: it shrinks toward its arrow to about a sixth of its size, slow at both
 * ends, and fades out a little ahead of it, over 180 ms. The opening half is in the stylesheet.
 */
const LEAVE_MS = 180;
const LEAVE_SCALE = 0.15;
const LEAVE_SHRINK = 'cubic-bezier(0.37, 0, 0.63, 1)';

/** The map preview's size: the popover's width inside its padding, and a strip's height. */
const MAP_WIDTH = POPOVER_WIDTH - 28;
const MAP_HEIGHT = 120;

/**
 * Where the arrow points, as a CSS position on the panel: the point the popover grows out of
 * as it opens.
 *
 * @param arrow - The arrow's side and its offset along it
 * @returns A `transform-origin` value
 */
function arrowPoint(arrow: { side: 'left' | 'right' | 'top' | 'bottom'; at: number }): string {
  return arrow.side === 'left' || arrow.side === 'right'
    ? `${arrow.side} ${arrow.at}px`
    : `${arrow.at}px ${arrow.side}`;
}

/** Home Assistant's strings, and the English each falls back to where a key is missing. */
const T = {
  summary: ['ui.components.calendar.event.summary', 'Summary'],
  location: ['ui.components.calendar.event.location', 'Location'],
  description: ['ui.components.calendar.event.description', 'Description'],
  allDay: ['ui.components.calendar.event.all_day', 'All day'],
  start: ['ui.components.calendar.event.start', 'Start'],
  end: ['ui.components.calendar.event.end', 'End'],
  calendar: ['ui.components.calendar.label', 'Calendar'],
  tentative: ['ui.components.calendar.event.tentative', 'Tentative'],
  repeat: ['ui.components.calendar.event.repeat.label', 'Repeat'],
  interval: ['ui.components.calendar.event.repeat.interval.label', 'Repeat interval'],
  monthly: ['ui.components.calendar.event.repeat.monthly.label', 'Repeat monthly'],
  endLabel: ['ui.components.calendar.event.repeat.end.label', 'End'],
  never: ['ui.components.calendar.event.repeat.end.never', 'Never'],
  after: ['ui.components.calendar.event.repeat.end.after', 'After'],
  on: ['ui.components.calendar.event.repeat.end.on', 'On'],
  occurrences: ['ui.components.calendar.event.repeat.end_after.ocurrences', 'occurrences'],
  thisEvent: ['ui.components.calendar.event.recurrence_range.this_event', 'Only this event'],
  future: [
    'ui.components.calendar.event.recurrence_range.this_and_future',
    'This and all future events',
  ],
  deletePrompt: [
    'ui.components.calendar.event.confirm_delete.prompt',
    'Do you want to delete this event?',
  ],
  deleteRecurring: [
    'ui.components.calendar.event.confirm_delete.recurring_prompt',
    'Which events do you want to delete?',
  ],
  updateRecurring: [
    'ui.components.calendar.event.confirm_update.recurring_prompt',
    'Which events do you want to update?',
  ],
  missing: [
    'ui.components.calendar.event.not_all_required_fields',
    'Not all required fields are filled in',
  ],
  duration: [
    'ui.components.calendar.event.invalid_duration',
    'The duration of the event is not valid. Please check start and end date.',
  ],
  delete: ['ui.common.delete', 'Delete'],
  save: ['ui.common.save', 'Save'],
  add: ['ui.common.add', 'Add'],
  edit: ['ui.common.edit', 'Edit'],
  cancel: ['ui.common.cancel', 'Cancel'],
  close: ['ui.common.close', 'Close'],
} as const;

type StringKey = keyof typeof T;

/**
 * What a failed write says when Home Assistant gives no reason. Its own event dialogs show
 * these words, in English in every language, so the popover does too.
 */
const UNKNOWN_ERROR = 'Unknown error';

const FREQUENCIES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
const WEEKDAYS: RRule.Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** A cell being edited; the rest show their values. */
type Cell = 'title' | 'time' | 'location' | 'description';

/** What the popover is doing: editing, asking which occurrences, or waiting on a write. */
type Phase = 'edit' | 'delete' | 'update' | 'saving';

//-----------------------------------------------------------------------------
// ELEMENT
//-----------------------------------------------------------------------------

/**
 * The event popover. Home Assistant's dialog manager creates it, hands it `hass`, calls
 * `showDialog` before attaching it, and calls `closeDialog` for Back.
 */
export class EventPopover extends LitElement {
  /** Home Assistant, handed over by its dialog manager. */
  @property({ attribute: false }) hass?: Types.Hass;

  @state() private _params?: Model.PopoverParams;
  @state() private _draft?: Model.Draft;
  @state() private _editing?: Cell;
  @state() private _phase: Phase = 'edit';
  @state() private _error?: string;
  @state() private _sheet = false;
  @state() private _place?: {
    left: number;
    top: number;
    /** Which side of the popover the arrow is on, and how far along that side it points. */
    arrow?: { side: 'left' | 'right' | 'top' | 'bottom'; at: number };
  };
  @state() private _map?: {
    tiles: EventMap.MapTile[];
    tileSize: number;
    href: string;
    label: string;
    /** Who placed the marker, whose credit the map shows beside OpenStreetMap's. */
    source: EventMap.MapPlace['source'];
  };

  /** Closing: Home Assistant has been told, and the popover is playing its way out. */
  @state() private _closing = false;
  /** The animations it is leaving by, canceled once it has gone or is opened again. */
  private _leaving?: Animation[];

  private _original?: Model.Draft;
  private _wantOpen = false;
  private _openedAt = 0;
  private _backdropDown = false;
  /** Counts opens, so a write that finishes after the popover was opened again leaves it be. */
  private _openId = 0;

  //---------------------------------------------------------------------------
  // HOME ASSISTANT'S DIALOG CONTRACT
  //---------------------------------------------------------------------------

  /**
   * Opens the popover on an event, or on a new one.
   *
   * Called before the element is attached, so the modal opens once it is (`updated`).
   *
   * @param params - What the card handed over
   */
  public showDialog(params: Model.PopoverParams): void {
    // Opened again while still playing its way out: gone at once, so it opens afresh.
    if (this._closing) this._closeNow();
    const draft = Model.draftFromParams(params);
    if (!draft) {
      Logger.warn('Event popover: the event has no readable start');
      this._fireClosed();
      return;
    }
    this._params = params;
    this._draft = draft;
    this._original = { ...draft, times: { ...draft.times } };
    this._editing = params.mode === 'new' ? 'title' : undefined;
    this._phase = 'edit';
    this._error = undefined;
    this._map = undefined;
    this._place = undefined;
    this._openId++;
    this._wantOpen = true;
    this.requestUpdate();
    void this._loadMap();
  }

  /**
   * Closes the popover for Home Assistant's Back, saving what changed.
   *
   * Home Assistant reads the answer at once rather than waiting on it, so it is a boolean.
   *
   * @returns True once the popover is gone. False keeps it open: to ask which occurrences, to
   *   show why a change was refused, or while a save is under way, which closes it when done
   */
  public closeDialog(): boolean {
    return this._requestClose('save');
  }

  //---------------------------------------------------------------------------
  // LIFECYCLE
  //---------------------------------------------------------------------------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const dialog = this._dialog;
    if (this._wantOpen && dialog && this.isConnected && !dialog.open) {
      this._wantOpen = false;
      this._openedAt = Date.now();
      try {
        dialog.showModal();
      } catch (error) {
        Logger.warn('Event popover: could not open', error);
      }
      this._position();
      // The modal opens hidden until it is placed, and a hidden control cannot take focus, so
      // the focusing steps of `showModal` land on nothing. Focus once it is drawn in place.
      void this.updateComplete.then(() => this._focusStart());
    }

    // A question takes focus, so the keyboard and a screen reader land on its choices; backing
    // out of it puts focus back where the popover started.
    const phases = changed as Map<string, unknown>;
    if (phases.has('_phase')) {
      const before = phases.get('_phase');
      if (this._phase === 'update' || this._phase === 'delete') {
        this.renderRoot.querySelector<HTMLElement>('.ask button')?.focus();
      } else if (this._phase === 'edit' && (before === 'update' || before === 'delete')) {
        this._focusStart();
      }
    }
  }

  /**
   * Puts focus where the popover starts: the title field of a new event, or the event's title
   * heading, so a screen reader announces the event and Tab moves through its cells.
   */
  private _focusStart(): void {
    const dialog = this._dialog;
    if (!dialog?.open) return;
    dialog.querySelector<HTMLElement>('[autofocus]')?.focus({ preventScroll: true });
  }

  private get _dialog(): HTMLDialogElement | null {
    return this.renderRoot?.querySelector('dialog') ?? null;
  }

  private get _panel(): HTMLElement | null {
    return this.renderRoot?.querySelector('.panel') ?? null;
  }

  //---------------------------------------------------------------------------
  // PLACING
  //---------------------------------------------------------------------------

  /**
   * Places the popover beside the press: to its right where there is room, else to its left,
   * centered on it vertically and kept inside the viewport, with the arrow pointing at it. On
   * a narrow screen it is a sheet from the bottom instead.
   */
  private _position(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this._sheet = width < SHEET_BELOW_PX;
    if (this._sheet) {
      this._place = undefined;
      return;
    }

    const anchor = this._params?.anchor;
    const panelHeight = Math.min(this._panel?.offsetHeight ?? 420, height - 2 * MARGIN);
    if (!anchor) {
      this._place = {
        left: Math.max(MARGIN, (width - POPOVER_WIDTH) / 2),
        top: Math.max(MARGIN, (height - panelHeight) / 2),
      };
      return;
    }

    // A press on an event comes with what can be seen of the event, and the popover opens
    // beside it, as macOS opens one beside an event: the edge of its box, or the end of its text
    // where it draws no box (`eventBox`). A press with no event under it, on a day or an empty
    // slot, comes with its point alone, and the popover opens right there. A toolbar button asks
    // for the popover below it instead.
    const rect = anchor.rect ?? {
      left: anchor.x,
      right: anchor.x,
      top: anchor.y,
      bottom: anchor.y,
    };
    this._place = anchor.below
      ? this._placeBelow(rect, panelHeight, width, height)
      : this._placeBeside(rect, panelHeight, width, height);
  }

  /**
   * Beside a box: to its right where the popover fits, else to its left, centered on it and
   * kept on screen, the arrow at its middle. Where neither side has room it is centered on the
   * screen, without an arrow.
   */
  private _placeBeside(
    rect: Model.PopoverBox,
    panelHeight: number,
    width: number,
    height: number,
  ): NonNullable<EventPopover['_place']> {
    const centerY = (rect.top + rect.bottom) / 2;
    let side: 'left' | 'right' | undefined = 'left';
    let left = rect.right + GAP;
    if (left + POPOVER_WIDTH > width - MARGIN) {
      side = 'right';
      left = rect.left - GAP - POPOVER_WIDTH;
    }
    if (left < MARGIN) {
      side = undefined;
      left = Math.max(MARGIN, (width - POPOVER_WIDTH) / 2);
    }
    const top = Math.min(
      Math.max(MARGIN, centerY - panelHeight / 2),
      height - panelHeight - MARGIN,
    );
    const at = Math.min(Math.max(24, centerY - top), panelHeight - 24);
    return { left, top, arrow: side ? { side, at } : undefined };
  }

  /**
   * Below a box, as macOS opens the popover of its toolbar's add button: the arrow on the top
   * edge points up at the button's middle, a little in from the popover's left, so the popover
   * hangs over the card rather than beside its corner. Above it instead where there is no room
   * below and more above.
   */
  private _placeBelow(
    rect: Model.PopoverBox,
    panelHeight: number,
    width: number,
    height: number,
  ): NonNullable<EventPopover['_place']> {
    const centerX = (rect.left + rect.right) / 2;
    const left = Math.min(
      Math.max(MARGIN, centerX - EAR_INSET),
      Math.max(MARGIN, width - POPOVER_WIDTH - MARGIN),
    );
    const at = Math.min(Math.max(20, centerX - left), POPOVER_WIDTH - 20);
    const below = rect.bottom + BELOW_GAP;
    const above = rect.top - BELOW_GAP - panelHeight;
    if (below + panelHeight > height - MARGIN && above >= MARGIN) {
      return { left, top: above, arrow: { side: 'bottom', at } };
    }
    return {
      left,
      top: Math.max(MARGIN, Math.min(below, height - panelHeight - MARGIN)),
      arrow: { side: 'top', at },
    };
  }

  //---------------------------------------------------------------------------
  // CLOSING & SAVING
  //---------------------------------------------------------------------------

  /** Whether the event may be changed here. */
  private get _editable(): boolean {
    return this._params?.mode === 'new' || Boolean(this._params?.canEdit);
  }

  /** Whether anything was changed that would be written. */
  private get _dirty(): boolean {
    return Boolean(this._draft && this._original && Model.isDirty(this._draft, this._original));
  }

  /** Whether the event pressed repeats, so a change or a delete asks which occurrences. */
  private get _recurring(): boolean {
    return Boolean(this._params?.entry?.recurrence_id);
  }

  /** Whether a save or a delete is waiting on Home Assistant. */
  private get _busy(): boolean {
    return this._phase === 'saving';
  }

  /**
   * Closes the popover, saving first unless asked to discard.
   *
   * Nothing changed, or nothing that may be changed, closes at once; so does an untouched new
   * event. A change Home Assistant would refuse, such as a new event given a date but no title,
   * keeps the popover open and says why. A change to a repeating event asks first which
   * occurrences it covers. Anything else is saved, and the popover closes once it is. Nothing
   * closes it while a write is under way.
   *
   * @param mode - Save what changed, or throw it away
   * @param range - For a repeating event, the occurrences already chosen
   * @returns Whether the popover closed now
   */
  private _requestClose(mode: 'save' | 'discard', range?: Writes.RecurrenceRange): boolean {
    if (this._closing) return true;
    if (this._busy) return false;
    const params = this._params;
    const draft = this._draft;
    if (!params || !draft) return this._finish();

    if (mode === 'discard' || !this._editable || !this._dirty) return this._finish();

    const problem = Model.draftProblem(draft);
    if (problem) {
      this._error = this._t(problem === 'missing' ? 'missing' : 'duration');
      return false;
    }
    if (params.mode === 'event' && this._recurring && range === undefined) {
      this._phase = 'update';
      this._editing = undefined;
      return false;
    }

    void this._save(range);
    return false;
  }

  /**
   * Writes the draft, and closes once Home Assistant has saved it. The popover takes no input
   * meanwhile, so nothing typed during the save is silently left out of it.
   *
   * @param range - For a repeating event, which occurrences
   */
  private async _save(range?: Writes.RecurrenceRange): Promise<void> {
    const params = this._params;
    const draft = this._draft;
    const original = this._original;
    const hass = this.hass;
    if (!params || !draft || !hass) return;

    const openId = this._openId;
    this._phase = 'saving';
    this._editing = undefined;
    this._error = undefined;
    if (params.mode === 'event' && draft.calendarId !== params.calendarId) {
      await this._move(hass, params, draft, original, range, openId);
      return;
    }
    try {
      if (params.mode === 'new') {
        await Writes.createEvent(hass, draft.calendarId, Model.eventWrite(draft, undefined));
      } else {
        const entry = params.entry;
        if (!entry?.uid) throw new Error('The event has no identifier to save it by');
        await Writes.updateEvent(
          hass,
          { entityId: params.calendarId, uid: entry.uid, recurrenceId: entry.recurrence_id, range },
          Model.eventWrite(draft, original, entry.recurrence_id ? range : undefined),
        );
      }
    } catch (error) {
      Logger.warn('Event popover: saving failed', error);
      if (openId !== this._openId) return;
      this._phase = 'edit';
      this._error = Writes.writeErrorMessage(error) ?? UNKNOWN_ERROR;
      return;
    }
    params.updated(draft.calendarId);
    if (openId === this._openId) this._finish();
  }

  /**
   * Moves the event to the calendar picked: adds it there, then deletes it from its own. In that
   * order, so a failure part way leaves it in both calendars rather than in neither.
   *
   * A repeating event moves as the occurrences chosen do: the one pressed alone, as a single
   * event, or, where `_seriesMovable`, the series from it on. Occurrences deleted from that
   * part, or changed on their own, come back as plain occurrences of the series: Home
   * Assistant's commands cannot carry either to another calendar. Nor can they carry anything
   * but the fields the popover shows, so a status, guests or reminders an integration keeps of
   * its own stay behind.
   *
   * @param hass - Home Assistant
   * @param params - What the popover opened with
   * @param draft - The draft, naming the calendar to move to
   * @param original - The draft the popover opened with
   * @param range - For a repeating event, which occurrences
   * @param openId - The open this move belongs to
   */
  private async _move(
    hass: Types.Hass,
    params: Model.PopoverParams,
    draft: Model.Draft,
    original: Model.Draft | undefined,
    range: Writes.RecurrenceRange | undefined,
    openId: number,
  ): Promise<void> {
    const entry = params.entry;
    const from = params.calendarId;
    let added = false;
    try {
      if (!entry?.uid) throw new Error('The event has no identifier to move it by');
      const scoped = entry.recurrence_id ? (range ?? '') : undefined;
      const event = Model.eventWrite(draft, original, scoped);
      // Offered only where it is safe (`_seriesMovable`); checked again before anything is
      // written, because the delete below would take the series' future with it.
      if (scoped === 'THISANDFUTURE' && !Model.seriesMovable(event.rrule)) {
        throw new Error('This series cannot be moved from here on');
      }
      await Writes.createEvent(hass, draft.calendarId, event);
      added = true;
      await Writes.deleteEvent(hass, {
        entityId: from,
        uid: entry.uid,
        recurrenceId: entry.recurrence_id,
        range: scoped,
      });
    } catch (error) {
      Logger.warn('Event popover: moving failed', error);
      if (added) params.updated(draft.calendarId);
      if (openId !== this._openId) return;
      this._phase = 'edit';
      this._error = Writes.writeErrorMessage(error) ?? UNKNOWN_ERROR;
      // Added but not deleted: the event is in both calendars, and the copy added cannot be
      // reached from here, so nothing more is offered that would write it a third time.
      if (added) this._settle(draft);
      return;
    }
    params.updated(draft.calendarId, from);
    if (openId === this._openId) this._finish();
  }

  /**
   * Whether a move may take the series from the occurrence pressed on: the occurrence carries
   * its series' rule, and the rule ends never or on a date (`Model.seriesMovable`). Anywhere
   * else only the occurrence pressed moves.
   */
  private get _seriesMovable(): boolean {
    const draft = this._draft;
    if (!draft) return false;
    return Model.seriesMovable(Model.eventWrite(draft, this._original, 'THISANDFUTURE').rrule);
  }

  /**
   * Leaves the popover showing a draft that was written in part, with nothing more to save or
   * delete: it closes as it is.
   *
   * @param draft - The draft as written
   */
  private _settle(draft: Model.Draft): void {
    const params = this._params;
    if (!params) return;
    this._params = { ...params, display: undefined, canEdit: false, canDelete: false };
    this._original = { ...draft, times: { ...draft.times } };
  }

  /**
   * Deletes the event, or the occurrences chosen, and closes.
   *
   * @param range - For a repeating event, which occurrences
   */
  private async _delete(range: Writes.RecurrenceRange): Promise<void> {
    const params = this._params;
    const entry = params?.entry;
    const hass = this.hass;
    if (this._busy || !params || !entry?.uid || !hass) return;

    const openId = this._openId;
    this._phase = 'saving';
    this._error = undefined;
    try {
      await Writes.deleteEvent(hass, {
        entityId: params.calendarId,
        uid: entry.uid,
        recurrenceId: entry.recurrence_id,
        range: entry.recurrence_id ? range : undefined,
      });
    } catch (error) {
      Logger.warn('Event popover: deleting failed', error);
      if (openId !== this._openId) return;
      this._phase = 'delete';
      this._error = Writes.writeErrorMessage(error) ?? UNKNOWN_ERROR;
      return;
    }
    params.updated(params.calendarId);
    if (openId === this._openId) this._finish();
  }

  /**
   * Tells Home Assistant's dialog manager the popover is gone, and closes the modal once it has
   * played its way out (`_leave`), or at once where there is nothing to play.
   *
   * @returns Always true
   */
  private _finish(): boolean {
    this._wantOpen = false;
    const animations = this._leave();
    if (animations.length) {
      this._closing = true;
      this._leaving = animations;
      // A tab in the background may hold animations back, so the popover goes regardless soon.
      void Promise.race([
        Promise.all(animations.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, LEAVE_MS + 200)),
      ])
        .catch(() => undefined)
        .then(() => {
          if (this._leaving === animations) this._closeNow();
        });
    } else {
      this._closeNow();
    }
    this._fireClosed();
    return true;
  }

  /** Closes the modal, drops what it showed, and stops any way out it was playing. */
  private _closeNow(): void {
    const dialog = this._dialog;
    if (dialog?.open) dialog.close();
    // Canceled after the close, so the panel never flashes back at full size.
    this._leaving?.forEach((animation) => animation.cancel());
    this._leaving = undefined;
    this._closing = false;
    this._params = undefined;
    this._draft = undefined;
    this._original = undefined;
  }

  /**
   * Plays the popover's way out: shrinking toward its arrow and fading, or a sheet sinking away.
   * Nothing where the system asks for less motion, or where the browser cannot animate.
   *
   * @returns The animations, or none
   */
  private _leave(): Animation[] {
    const dialog = this._dialog;
    const panel = dialog?.querySelector<HTMLElement>('.panel');
    if (!dialog?.open || !panel || typeof panel.animate !== 'function') return [];
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return [];

    const timing = (easing: string): KeyframeAnimationOptions => ({
      duration: LEAVE_MS,
      easing,
      fill: 'forwards',
    });
    if (this._sheet) {
      return [
        panel.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(24px)', opacity: 0 },
          ],
          timing('ease-in'),
        ),
      ];
    }
    // The panel and its arrow shrink about the same point, the arrow's center on the panel's
    // edge, which the panel's transform-origin names; the arrow keeps its quarter turn.
    const animations = [
      panel.animate(
        [{ transform: 'scale(1)' }, { transform: `scale(${LEAVE_SCALE})` }],
        timing(LEAVE_SHRINK),
      ),
      panel.animate([{ opacity: 1 }, { opacity: 0 }], timing('ease')),
    ];
    const arrow = dialog.querySelector<HTMLElement>('.arrow');
    if (arrow) {
      animations.push(
        arrow.animate(
          [
            { transform: 'rotate(45deg) scale(1)' },
            { transform: `rotate(45deg) scale(${LEAVE_SCALE})` },
          ],
          timing(LEAVE_SHRINK),
        ),
        arrow.animate([{ opacity: 1 }, { opacity: 0 }], timing('ease')),
      );
    }
    return animations;
  }

  private _fireClosed(): void {
    this.dispatchEvent(
      new CustomEvent('dialog-closed', {
        bubbles: true,
        composed: true,
        detail: { dialog: this.localName },
      }),
    );
  }

  //---------------------------------------------------------------------------
  // INPUT
  //---------------------------------------------------------------------------

  /**
   * Escape throws the changes away, the one undo the popover has, or backs out of a question.
   * While a write is under way it does nothing, as `_requestClose` refuses then.
   */
  private readonly _onCancel = (ev: Event): void => {
    ev.preventDefault();
    if (this._phase === 'update' || this._phase === 'delete') {
      this._phase = 'edit';
      return;
    }
    this._requestClose('discard');
  };

  /**
   * A press that starts and ends on the backdrop closes the popover, saving. Both ends count, so
   * the click a press on the card derives from the gesture that opened it cannot close it.
   */
  private readonly _onPointerDown = (ev: PointerEvent): void => {
    this._backdropDown = ev.target === this._dialog;
  };

  private readonly _onClick = (ev: MouseEvent): void => {
    if (ev.target !== this._dialog || !this._backdropDown) return;
    this._backdropDown = false;
    if (Date.now() - this._openedAt < 300) return;
    this._requestClose('save');
  };

  private _update(changes: Partial<Model.Draft>): void {
    if (!this._draft || this._busy) return;
    this._draft = { ...this._draft, ...changes };
    this._error = undefined;
  }

  /** Moves the event, and its repeat with it, so the series stays on the day it moved to. */
  private _setTimes(times: Times.EventTimes): void {
    const draft = this._draft;
    if (!draft) return;
    this._update({
      times,
      repeat: Model.rebaseRepeat(draft.repeat, draft.times.start, times.start),
    });
  }

  private _setStartDate(value: string): void {
    const draft = this._draft;
    const start = draft && Times.withDate(draft.times.start, value);
    if (draft && start) this._setTimes(Times.moveStart(draft.times, start));
  }

  private _setStartTime(value: string): void {
    const draft = this._draft;
    const start = draft && Times.withTime(draft.times.start, value);
    if (draft && start) this._setTimes(Times.moveStart(draft.times, start));
  }

  private _setEndDate(value: string): void {
    const draft = this._draft;
    const end = draft && Times.withDate(draft.times.end, value);
    if (draft && end) this._setTimes({ ...draft.times, end });
  }

  private _setEndTime(value: string): void {
    const draft = this._draft;
    const end = draft && Times.withTime(draft.times.end, value);
    if (draft && end) this._setTimes({ ...draft.times, end });
  }

  private _setAllDay(allDay: boolean): void {
    const draft = this._draft;
    if (!draft) return;
    this._setTimes(Times.setAllDay(draft.times, allDay, new Date().getHours()));
  }

  private _setFrequency(freq: (typeof FREQUENCIES)[number]): void {
    const draft = this._draft;
    if (!draft) return;
    this._update({
      repeat:
        freq === 'none'
          ? { kind: 'none' }
          : { kind: 'rule', rule: RRule.defaultRule(freq, draft.times.start) },
    });
  }

  private _setRule(changes: Partial<RRule.RepeatRule>): void {
    const repeat = this._draft?.repeat;
    if (repeat?.kind !== 'rule') return;
    this._update({ repeat: { kind: 'rule', rule: { ...repeat.rule, ...changes } } });
  }

  private _toggleWeekday(day: RRule.Weekday): void {
    const repeat = this._draft?.repeat;
    if (repeat?.kind !== 'rule') return;
    const has = repeat.rule.weekdays.includes(day);
    const weekdays = has
      ? repeat.rule.weekdays.filter((value) => value !== day)
      : WEEKDAYS.filter((value) => value === day || repeat.rule.weekdays.includes(value));
    if (weekdays.length) this._setRule({ weekdays });
  }

  /** Switches how the rule ends, starting from the count or date Home Assistant's editor fills in. */
  private _setEnd(kind: RRule.RepeatEnd['kind']): void {
    const repeat = this._draft?.repeat;
    if (repeat?.kind !== 'rule') return;
    this._setRule({ end: RRule.defaultEnd(kind, repeat.rule.freq) });
  }

  //---------------------------------------------------------------------------
  // MAP
  //---------------------------------------------------------------------------

  /** Draws the map under the location, when the location is a place Home Assistant knows. */
  private async _loadMap(): Promise<void> {
    const params = this._params;
    const location = (params?.display?.location ?? params?.entry?.location ?? '').trim();
    if (!params || params.mode !== 'event' || !location || params.hidden?.location) return;

    const place = await EventMap.resolveLocation(location, this.hass, MAP_WIDTH);
    if (!place || this._params !== params) return;
    const token = await EventMap.mapTilesToken(this.hass);
    if (!token || this._params !== params) return;

    const density = (window.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1;
    const { tiles, tileSize } = EventMap.mapTiles(
      place,
      { width: MAP_WIDTH, height: MAP_HEIGHT },
      token,
      density,
      place.zoom,
    );
    this._map = {
      tiles,
      tileSize,
      href: EventMap.mapsSearchUrl(location),
      label: location,
      source: place.source,
    };
  }

  //---------------------------------------------------------------------------
  // WORDS
  //---------------------------------------------------------------------------

  private _t(key: StringKey): string {
    const [id, fallback] = T[key];
    const value = this.hass?.localize?.(id);
    return value && value !== id ? value : fallback;
  }

  private _haKey(key: string, fallback: string): string {
    const value = this.hass?.localize?.(key);
    return value && value !== key ? value : fallback;
  }

  private _ruleText(rrule: string | undefined): string | undefined {
    if (!rrule) return undefined;
    return (
      RRule.describeRRule(
        rrule,
        (key) => this.hass?.localize?.(key) ?? '',
        this._params?.language ?? 'en',
      ) ?? rrule
    );
  }

  //---------------------------------------------------------------------------
  // RENDERING
  //---------------------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    const params = this._params;
    const draft = this._draft;
    if (!params || !draft) return html`<dialog></dialog>`;

    const color = this._calendar(draft.calendarId)?.color ?? params.color ?? 'var(--primary-color)';
    const place = this._place;
    const style = this._sheet
      ? ''
      : place
        ? `left:${place.left}px;top:${place.top}px;`
        : 'visibility:hidden;';
    const titleText = this._displayed('title');

    return html`
      <dialog
        class="${params.dark ? 'dark' : 'light'} ${this._sheet ? 'sheet' : 'popover'}"
        ?data-placed=${this._sheet || !!place}
        style=${style}
        aria-labelledby="popover-title"
        @cancel=${this._onCancel}
        @pointerdown=${this._onPointerDown}
        @click=${this._onClick}
      >
        <div
          class="panel"
          style="--event-color:${color};${place?.arrow ? `transform-origin:${arrowPoint(place.arrow)}` : ''}"
          ?inert=${this._busy || this._closing}
        >
          ${this._sheet ? html`<span class="grabber" aria-hidden="true"></span>` : nothing}
          <h2
            id="popover-title"
            class="visually-hidden"
            tabindex="-1"
            ?autofocus=${params.mode === 'event'}
          >
            ${titleText || this._t('summary')}
          </h2>
          <button class="btn reveal" @click=${() => this._requestClose('save')}>
            ${this._t('close')}
          </button>
          <div class="group">
            <span class="bar"></span>
            <div class="stack">${this._renderTitle()} ${this._renderTime()}</div>
          </div>
          ${this._renderLocation()} ${this._renderCalendar()} ${this._renderDescription()}
          ${this._renderMap()} ${this._renderError()} ${this._renderQuestion()}
          ${this._renderFoot()}
        </div>
        ${
          place?.arrow
            ? html`<span
                class="arrow ${place.arrow.side}"
                style="${place.arrow.side === 'left' || place.arrow.side === 'right' ? 'top' : 'left'}:${place.arrow.at}px"
              ></span>`
            : nothing
        }
      </dialog>
    `;
  }

  /**
   * A field as shown: the card's text, its replacement applied, until it is edited or
   * changed, then what is stored.
   *
   * @param field - Which field
   * @returns The text to show
   */
  private _displayed(field: 'title' | 'location' | 'description'): string {
    const draft = this._draft;
    const original = this._original;
    if (!draft) return '';
    const key = field === 'title' ? 'summary' : field;
    const changed = original && draft[key] !== original[key];
    const display = this._params?.display;
    if (!display || changed || this._editing === field) return draft[key];
    return display[field] ?? draft[key];
  }

  private _calendar(id: string): Model.PopoverCalendar | undefined {
    return this._params?.calendars.find((calendar) => calendar.id === id);
  }

  private _renderTitle(): TemplateResult {
    const text = this._displayed('title');
    if (!this._editable) {
      return html`<div class="cell title">${text}</div>
        ${
          this._params?.entry?.status === 'tentative'
            ? html`<span class="badge">${this._t('tentative')}</span>`
            : nothing
        }`;
    }
    return html`<input
      class="cell title"
      .value=${text}
      placeholder=${this._t('summary')}
      aria-label=${this._t('summary')}
      ?autofocus=${this._params?.mode === 'new'}
      @focus=${() => (this._editing = 'title')}
      @blur=${() => this._editing === 'title' && (this._editing = undefined)}
      @input=${(ev: Event) => this._update({ summary: (ev.target as HTMLInputElement).value })}
      @keydown=${(ev: KeyboardEvent) => {
        // Return confirms, as it does in a macOS popover; not while an input method composes.
        if (ev.key === 'Enter' && !ev.isComposing) this._requestClose('save');
      }}
    />`;
  }

  private _renderTime(): TemplateResult {
    const params = this._params!;
    const draft = this._draft!;
    const span = Model.spanText(draft.times, params.language, params.hour24);
    const rule = Model.writtenRule(draft);
    const ruleText =
      draft.repeat.kind === 'custom' ? this._ruleText(draft.repeat.raw) : this._ruleText(rule);

    if (this._editing !== 'time') {
      const summary = html`<div class="when">${span}</div>
        ${draft.times.allDay ? html`<div class="sub">${this._t('allDay')}</div>` : nothing}
        ${
          ruleText
            ? html`<div class="sub">${ruleText}</div>`
            : this._editable
              ? html`<div class="sub dim">${this._t('repeat')}</div>`
              : nothing
        }`;
      return this._editable
        ? html`<button
            class="cell time"
            aria-expanded="false"
            @click=${() => (this._editing = 'time')}
          >
            ${summary}
          </button>`
        : html`<div class="cell time">${summary}</div>`;
    }

    const times = draft.times;
    return html`<div class="cell time open" role="group" aria-label=${span}>
      <label class="row">
        <span class="key">${this._t('allDay')}</span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          .checked=${times.allDay}
          @change=${(ev: Event) => this._setAllDay((ev.target as HTMLInputElement).checked)}
        />
      </label>
      <div class="row">
        <span class="key">${this._t('start')}</span>
        <span class="fields">
          <input
            type="date"
            aria-label=${this._t('start')}
            .value=${Times.dateValue(times.start)}
            @change=${(ev: Event) => this._setStartDate((ev.target as HTMLInputElement).value)}
          />
          ${
            times.allDay
              ? nothing
              : html`<input
                  type="time"
                  aria-label=${this._t('start')}
                  .value=${Times.timeValue(times.start)}
                  @change=${(ev: Event) => this._setStartTime((ev.target as HTMLInputElement).value)}
                />`
          }
        </span>
      </div>
      <div class="row">
        <span class="key">${this._t('end')}</span>
        <span class="fields">
          <input
            type="date"
            aria-label=${this._t('end')}
            .value=${Times.dateValue(times.end)}
            @change=${(ev: Event) => this._setEndDate((ev.target as HTMLInputElement).value)}
          />
          ${
            times.allDay
              ? nothing
              : html`<input
                  type="time"
                  aria-label=${this._t('end')}
                  .value=${Times.timeValue(times.end)}
                  @change=${(ev: Event) => this._setEndTime((ev.target as HTMLInputElement).value)}
                />`
          }
        </span>
      </div>
      <div class="divider"></div>
      ${this._renderRepeat()}
      <button class="done" @click=${() => (this._editing = undefined)}>${span}</button>
    </div>`;
  }

  private _renderRepeat(): TemplateResult {
    const draft = this._draft!;
    const repeat = draft.repeat;
    const freq = repeat.kind === 'rule' ? repeat.rule.freq : repeat.kind === 'none' ? 'none' : '';
    const freqLabel = (value: string) =>
      this._haKey(`ui.components.calendar.event.repeat.freq.${value}`, value);

    const picker = html`<label class="row">
      <span class="key">${this._t('repeat')}</span>
      <select
        aria-label=${this._t('repeat')}
        @change=${(ev: Event) =>
          this._setFrequency(
            (ev.target as HTMLSelectElement).value as (typeof FREQUENCIES)[number],
          )}
      >
        ${
          repeat.kind === 'custom'
            ? html`<option value="" selected>${this._ruleText(repeat.raw)}</option>`
            : nothing
        }
        ${FREQUENCIES.map(
          (value) =>
            html`<option value=${value} ?selected=${value === freq}>${freqLabel(value)}</option>`,
        )}
      </select>
    </label>`;
    if (repeat.kind !== 'rule') return picker;

    const rule = repeat.rule;
    const unit =
      rule.freq === 'yearly'
        ? undefined
        : this._haKey(`ui.components.calendar.event.repeat.interval.${rule.freq}`, rule.freq);
    const monthly = rule.freq === 'monthly' ? RRule.monthlyOptions(draft.times.start) : [];
    const monthlyLabel = (mode: RRule.MonthlyMode) =>
      this._ruleText(
        RRule.buildRRule(
          {
            freq: 'monthly',
            interval: rule.interval,
            weekdays: [],
            monthly: mode,
            end: { kind: 'never' },
          },
          { allDay: draft.times.allDay, start: draft.times.start },
        ),
      );
    const sameMode = (a?: RRule.MonthlyMode, b?: RRule.MonthlyMode) =>
      JSON.stringify(a) === JSON.stringify(b);

    return html`${picker}
      ${
        unit
          ? html`<label class="row">
              <span class="key">${this._t('interval')}</span>
              <span class="fields">
                <input
                  type="number"
                  min="1"
                  class="short"
                  aria-label=${this._t('interval')}
                  .value=${String(rule.interval)}
                  @change=${(ev: Event) => {
                    const value = Math.max(
                      1,
                      Math.round(Number((ev.target as HTMLInputElement).value) || 1),
                    );
                    this._setRule({ interval: value });
                  }}
                />
                ${unit}
              </span>
            </label>`
          : nothing
      }
      ${
        rule.freq === 'weekly'
          ? html`<div class="days" role="group" aria-label=${this._t('repeat')}>
              ${WEEKDAYS.map(
                (day) =>
                  html`<button
                    class="day ${rule.weekdays.includes(day) ? 'on' : ''}"
                    aria-pressed=${rule.weekdays.includes(day) ? 'true' : 'false'}
                    @click=${() => this._toggleWeekday(day)}
                  >
                    ${this._haKey(`ui.components.calendar.event.repeat.weekly.weekday.${day.toLowerCase()}`, day)}
                  </button>`,
              )}
            </div>`
          : nothing
      }
      ${
        monthly.length
          ? html`<label class="row">
              <span class="key">${this._t('monthly')}</span>
              <select
                aria-label=${this._t('monthly')}
                @change=${(ev: Event) => this._setRule({ monthly: monthly[Number((ev.target as HTMLSelectElement).value)] })}
              >
                ${monthly.map(
                  (mode, index) =>
                    html`<option value=${index} ?selected=${sameMode(mode, rule.monthly)}>
                      ${monthlyLabel(mode)}
                    </option>`,
                )}
              </select>
            </label>`
          : nothing
      }
      <label class="row">
        <span class="key">${this._t('endLabel')}</span>
        <span class="fields">
          <select
            aria-label=${this._t('endLabel')}
            @change=${(ev: Event) => this._setEnd((ev.target as HTMLSelectElement).value as RRule.RepeatEnd['kind'])}
          >
            <option value="never" ?selected=${rule.end.kind === 'never'}>
              ${this._t('never')}
            </option>
            <option value="after" ?selected=${rule.end.kind === 'after'}>
              ${this._t('after')}
            </option>
            <option value="on" ?selected=${rule.end.kind === 'on'}>${this._t('on')}</option>
          </select>
          ${
            rule.end.kind === 'after'
              ? html`<input
                    type="number"
                    min="1"
                    class="short"
                    aria-label=${this._t('occurrences')}
                    .value=${String(rule.end.count)}
                    @change=${(ev: Event) =>
                      this._setRule({
                        end: {
                          kind: 'after',
                          count: Math.max(
                            1,
                            Math.round(Number((ev.target as HTMLInputElement).value) || 1),
                          ),
                        },
                      })}
                  />
                  ${this._t('occurrences')}`
              : rule.end.kind === 'on'
                ? html`<input
                    type="date"
                    aria-label=${this._t('on')}
                    .value=${rule.end.until}
                    @change=${(ev: Event) => {
                      const until = (ev.target as HTMLInputElement).value;
                      if (Times.parseDate(until)) this._setRule({ end: { kind: 'on', until } });
                    }}
                  />`
                : nothing
          }
        </span>
      </label>`;
  }

  private _renderLocation(): TemplateResult | typeof nothing {
    if (this._params?.hidden?.location) return nothing;
    const text = this._displayed('location');
    const pin =
      text && !this._map
        ? html`<a
            class="pin"
            href=${EventMap.mapsSearchUrl(text)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label=${`${this._t('location')}: ${text}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d=${mdiMapMarkerOutline}></path></svg>
          </a>`
        : nothing;
    if (!this._editable) {
      return text
        ? html`<div class="cell with-pin">
            <span class="text">${this._linked(text)}</span>${pin}
          </div>`
        : nothing;
    }
    return html`<div class="cell with-pin">
      <input
        class="plain"
        .value=${text}
        placeholder=${this._t('location')}
        aria-label=${this._t('location')}
        @focus=${() => (this._editing = 'location')}
        @blur=${() => this._editing === 'location' && (this._editing = undefined)}
        @input=${(ev: Event) => this._update({ location: (ev.target as HTMLInputElement).value })}
      />
      ${pin}
    </div>`;
  }

  private _renderCalendar(): TemplateResult {
    const params = this._params!;
    const draft = this._draft!;
    const current = this._calendar(draft.calendarId);
    const dot = (color: string) => html`<span class="dot" style="background:${color}"></span>`;
    if (!this._editable || params.calendars.length < 2) {
      return html`<div class="cell calendar">
        ${dot(current?.color ?? params.color ?? 'var(--primary-color)')}
        <span>${current?.name ?? draft.calendarId}</span>
      </div>`;
    }
    return html`<label class="cell calendar popup">
      ${dot(current?.color ?? 'var(--primary-color)')}
      <select
        aria-label=${this._t('calendar')}
        @change=${(ev: Event) => this._update({ calendarId: (ev.target as HTMLSelectElement).value })}
      >
        ${params.calendars.map(
          (calendar) =>
            html`<option value=${calendar.id} ?selected=${calendar.id === draft.calendarId}>
              ${calendar.name}
            </option>`,
        )}
      </select>
    </label>`;
  }

  private _renderDescription(): TemplateResult | typeof nothing {
    if (this._params?.hidden?.description) return nothing;
    const text = this._displayed('description');
    if (!this._editable || this._editing !== 'description') {
      if (!text && !this._editable) return nothing;
      const pieces = Links.linkText(text);
      const enter = (ev: Event) => {
        if ((ev.target as Element)?.closest?.('a')) return;
        this._editing = 'description';
        void this.updateComplete.then(() =>
          (this.renderRoot.querySelector('textarea') as HTMLTextAreaElement | null)?.focus(),
        );
      };
      // The text stays text, so its links are links to every reader. A press beside them edits
      // it; the keyboard reaches the same through a button that shows once it has focus.
      return this._editable
        ? html`<div class="cell notes ${text ? '' : 'dim'}" @click=${enter}>
            <button
              class="btn reveal"
              aria-label=${`${this._t('edit')}: ${this._t('description')}`}
            >
              ${this._t('edit')}
            </button>
            <span class="lines">${text ? this._pieces(pieces) : this._t('description')}</span>
          </div>`
        : html`<div class="cell notes"><span class="lines">${this._pieces(pieces)}</span></div>`;
    }
    return html`<textarea
      class="cell notes"
      rows="3"
      aria-label=${this._t('description')}
      .value=${text}
      placeholder=${this._t('description')}
      @blur=${() => this._editing === 'description' && (this._editing = undefined)}
      @input=${(ev: Event) => this._update({ description: (ev.target as HTMLTextAreaElement).value })}
    ></textarea>`;
  }

  private _linked(text: string): TemplateResult {
    return this._pieces(Links.linkPlainText(text));
  }

  private _pieces(pieces: Links.TextPiece[]): TemplateResult {
    return html`${pieces.map((piece) =>
      'href' in piece
        ? html`<a href=${piece.href} target="_blank" rel="noopener noreferrer">${piece.text}</a>`
        : piece.text,
    )}`;
  }

  private _renderMap(): TemplateResult | typeof nothing {
    const map = this._map;
    if (!map || this._editing === 'location') return nothing;
    // The credit is a sibling of the map's link, not inside it: a link may not hold links, and
    // both sources ask for one (OpenStreetMap's copyright page, Open-Meteo's site).
    const credit = (href: string, text: string) =>
      html`<a href=${href} target="_blank" rel="noopener noreferrer">${text}</a>`;
    return html`<div class="map">
      <a
        class="map-link"
        href=${map.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label=${`${this._t('location')}: ${map.label}`}
      >
        ${map.tiles.map(
          (tile) =>
            html`<img
              alt=""
              src=${tile.url}
              draggable="false"
              style="left:${tile.left}px;top:${tile.top}px;width:${map.tileSize}px;height:${map.tileSize}px"
            />`,
        )}
        <span class="marker" aria-hidden="true"></span>
      </a>
      <span class="attribution"
        >©
        ${credit('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}${
          map.source === 'open-meteo'
            ? html` · ${credit('https://open-meteo.com/', 'Open-Meteo')}`
            : nothing
        }</span
      >
    </div>`;
  }

  private _renderError(): TemplateResult | typeof nothing {
    return this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing;
  }

  private _renderQuestion(): TemplateResult | typeof nothing {
    if (this._phase === 'update') {
      // A move takes the series' future along only where it can do so whole; elsewhere it
      // moves the occurrence pressed alone, the one choice left.
      const moving = this._draft?.calendarId !== this._params?.calendarId;
      const future = !moving || this._seriesMovable;
      return html`<div class="ask" role="group" aria-label=${this._t('updateRecurring')}>
        <b>${this._t('updateRecurring')}</b>
        ${
          future
            ? html`<button
                class="btn primary"
                @click=${() => void this._requestClose('save', 'THISANDFUTURE')}
              >
                ${this._t('future')}
              </button>`
            : nothing
        }
        <button class="btn" @click=${() => void this._requestClose('save', '')}>
          ${this._t('thisEvent')}
        </button>
        <button class="btn" @click=${() => (this._phase = 'edit')}>${this._t('cancel')}</button>
      </div>`;
    }
    if (this._phase !== 'delete') return nothing;
    if (!this._recurring) {
      return html`<div class="ask" role="group" aria-label=${this._t('deletePrompt')}>
        <b>${this._t('deletePrompt')}</b>
        <button class="btn danger" @click=${() => void this._delete('')}>
          ${this._t('delete')}
        </button>
        <button class="btn" @click=${() => (this._phase = 'edit')}>${this._t('cancel')}</button>
      </div>`;
    }
    return html`<div class="ask" role="group" aria-label=${this._t('deleteRecurring')}>
      <b>${this._t('deleteRecurring')}</b>
      <button class="btn danger" @click=${() => void this._delete('')}>
        ${this._t('thisEvent')}
      </button>
      <button class="btn danger" @click=${() => void this._delete('THISANDFUTURE')}>
        ${this._t('future')}
      </button>
      <button class="btn" @click=${() => (this._phase = 'edit')}>${this._t('cancel')}</button>
    </div>`;
  }

  /**
   * The row under the cells: Delete for a stored event, on the left, and once anything was
   * changed Cancel and Save on the right, Add for a new event. Cancel throws the changes away
   * and closes, as Escape does where there is no Escape key; Save does what closing does, so a
   * change can be confirmed where a person looks for it. A new event has nothing to delete.
   */
  private _renderFoot(): TemplateResult | typeof nothing {
    const params = this._params!;
    if (this._phase === 'saving') {
      return html`<div class="foot"><span class="spinner" role="progressbar"></span></div>`;
    }
    if (this._phase !== 'edit') return nothing;
    const canDelete = params.mode === 'event' && params.canDelete;
    const changed = this._editable && this._dirty;
    if (!canDelete && !changed) return nothing;
    return html`<div class="foot">
      ${
        canDelete
          ? html`<button class="btn" @click=${() => (this._phase = 'delete')}>
              ${this._t('delete')}
            </button>`
          : nothing
      }
      ${
        changed
          ? html`<button class="btn end" @click=${() => this._requestClose('discard')}>
                ${this._t('cancel')}
              </button>
              <button class="btn primary" @click=${() => this._requestClose('save')}>
                ${this._t(params.mode === 'new' ? 'add' : 'save')}
              </button>`
          : nothing
      }
    </div>`;
  }

  static styles = css`
    :host {
      font-family:
        -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    dialog {
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      overflow: visible;
      max-width: none;
      max-height: none;
      position: fixed;
      color: var(--text);
    }
    dialog::backdrop {
      background: transparent;
    }
    dialog.sheet {
      inset: auto 0 0 0;
      width: 100%;
    }
    /* It opens as a popover in Calendar on macOS does, as measured from a screen recording of
       it: growing out of its arrow from a tenth of its size, fast and then settling, over
       230 ms, and fading in over 180 ms, with no overshoot. The arrow grows with it about the
       same point, its own center on the panel's edge, which the panel's inline transform-origin
       names. A sheet rises from the bottom instead. Each starts once the popover is placed, so
       none of it plays unseen. The way out is played from script (_leave). Without motion
       where the system asks for less. */
    dialog.popover[open][data-placed] > .panel {
      animation:
        pop-grow 230ms cubic-bezier(0.33, 1, 0.68, 1),
        pop-fade 180ms cubic-bezier(0, 0, 0.58, 1);
    }
    dialog.popover[open][data-placed] > .arrow {
      animation:
        arrow-grow 230ms cubic-bezier(0.33, 1, 0.68, 1),
        pop-fade 180ms cubic-bezier(0, 0, 0.58, 1);
    }
    dialog.sheet[open][data-placed] > .panel {
      animation: sheet-in 220ms cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    @keyframes pop-grow {
      from {
        transform: scale(0.1);
      }
    }
    @keyframes arrow-grow {
      from {
        transform: rotate(45deg) scale(0.1);
      }
    }
    @keyframes pop-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes sheet-in {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog.popover[open][data-placed] > .panel,
      dialog.popover[open][data-placed] > .arrow,
      dialog.sheet[open][data-placed] > .panel {
        animation: none;
      }
    }
    dialog.sheet::backdrop {
      background: rgba(0, 0, 0, 0.25);
    }
    .light {
      --pop-bg: rgba(246, 246, 246, 0.82);
      --pop-edge: rgba(0, 0, 0, 0.12);
      --cell: rgba(0, 0, 0, 0.045);
      --cell-hover: rgba(0, 0, 0, 0.07);
      --text: rgba(0, 0, 0, 0.86);
      --dim: rgba(0, 0, 0, 0.36);
      --button: rgba(0, 0, 0, 0.07);
      --accent: #007aff;
      --danger: #ff3b30;
      color-scheme: light;
    }
    .dark {
      --pop-bg: rgba(44, 44, 46, 0.78);
      --pop-edge: rgba(255, 255, 255, 0.14);
      --cell: rgba(255, 255, 255, 0.075);
      --cell-hover: rgba(255, 255, 255, 0.11);
      --text: rgba(255, 255, 255, 0.92);
      --dim: rgba(255, 255, 255, 0.42);
      --button: rgba(255, 255, 255, 0.13);
      --accent: #0a84ff;
      --danger: #ff453a;
      color-scheme: dark;
    }
    .panel {
      position: relative;
      box-sizing: border-box;
      width: 340px;
      max-height: calc(100vh - 24px);
      overflow-y: auto;
      padding: 14px 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 9px;
      background: var(--pop-bg);
      -webkit-backdrop-filter: blur(28px) saturate(170%);
      backdrop-filter: blur(28px) saturate(170%);
      border: 1px solid var(--pop-edge);
      border-radius: 16px;
      box-shadow:
        0 18px 50px rgba(0, 0, 0, 0.35),
        0 0 0 0.5px rgba(0, 0, 0, 0.3);
      font-size: 15px;
      line-height: 1.35;
    }
    .sheet .panel {
      width: 100%;
      max-height: 85vh;
      border-radius: 18px 18px 0 0;
      padding-bottom: calc(16px + env(safe-area-inset-bottom));
    }
    .grabber {
      align-self: center;
      width: 36px;
      height: 5px;
      border-radius: 3px;
      background: var(--dim);
    }
    /* The arrow hangs off the dialog, not the panel, whose scrolling would clip it. Only its
       outer half is drawn, overlapping the panel's border by a pixel so the two read as one. */
    .arrow {
      position: absolute;
      width: 16px;
      height: 16px;
      background: var(--pop-bg);
      border: 1px solid var(--pop-edge);
      transform: rotate(45deg);
    }
    .arrow.left,
    .arrow.right {
      margin-top: -8px;
    }
    .arrow.top,
    .arrow.bottom {
      margin-left: -8px;
    }
    .arrow.top {
      top: -8px;
      border-right: 0;
      border-bottom: 0;
      clip-path: polygon(0 0, 100% 0, 0 100%);
    }
    .arrow.bottom {
      bottom: -8px;
      border-top: 0;
      border-left: 0;
      clip-path: polygon(100% 0, 100% 100%, 0 100%);
    }
    .arrow.left {
      left: -8px;
      border-top: 0;
      border-right: 0;
      clip-path: polygon(0 0, 0 100%, 100% 100%);
    }
    .arrow.right {
      right: -8px;
      border-bottom: 0;
      border-left: 0;
      clip-path: polygon(0 0, 100% 0, 100% 100%);
    }
    /* Hidden until the keyboard reaches it, then a button like the others. */
    .reveal:not(:focus-visible),
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
    .group {
      display: grid;
      grid-template-columns: 5px minmax(0, 1fr);
      gap: 0 10px;
    }
    .bar {
      border-radius: 3px;
      background: var(--event-color);
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 9px;
      min-width: 0;
    }
    .cell {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 10px 14px;
      border: 0;
      border-radius: 11px;
      background: var(--cell);
      color: var(--text);
      font: inherit;
      text-align: start;
      overflow-wrap: anywhere;
    }
    input.cell,
    textarea.cell,
    button.cell,
    .cell[tabindex] {
      cursor: text;
    }
    button.cell {
      cursor: pointer;
    }
    .cell:hover {
      background: var(--cell-hover);
    }
    .cell:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    button:focus-visible,
    a:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
      outline-offset: 0;
    }
    input.cell,
    textarea.cell {
      outline-offset: -1px;
    }
    .title {
      font-size: 21px;
      font-weight: 500;
      padding: 12px 14px;
    }
    .title::placeholder,
    input::placeholder,
    textarea::placeholder,
    .dim {
      color: var(--dim);
    }
    .badge {
      align-self: flex-start;
      padding: 1px 10px;
      border-radius: 10px;
      border: 1px solid var(--pop-edge);
      font-size: 12px;
      color: var(--dim);
    }
    .when {
      font-weight: 600;
      font-size: 16px;
      white-space: pre-wrap;
    }
    .sub {
      margin-top: 5px;
    }
    .open {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .key {
      color: var(--dim);
      text-align: end;
    }
    .fields {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .open input:not(.switch),
    .open select,
    .calendar select {
      height: 28px;
      padding: 0 8px;
      border: 0;
      border-radius: 6px;
      background: var(--button);
      color: var(--text);
      font: inherit;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      min-width: 0;
    }
    .short {
      width: 56px;
    }
    .switch {
      justify-self: start;
      appearance: none;
      width: 34px;
      height: 20px;
      margin: 0;
      border-radius: 10px;
      background: var(--button);
      position: relative;
      cursor: pointer;
    }
    .switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      transition: left 0.15s;
    }
    .switch:checked {
      background: #34c759;
    }
    .switch:checked::after {
      left: 16px;
    }
    .divider {
      height: 1px;
      background: var(--pop-edge);
    }
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-inline-start: 84px;
    }
    .day {
      min-width: 32px;
      height: 26px;
      padding: 0 6px;
      border: 0;
      border-radius: 13px;
      background: var(--button);
      color: var(--text);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .day.on {
      background: var(--accent);
      color: #fff;
    }
    .done {
      align-self: flex-end;
      border: 0;
      background: transparent;
      color: var(--accent);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .with-pin {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .with-pin .text,
    .plain {
      flex: 1;
      min-width: 0;
    }
    .plain {
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
    }
    .pin {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 26px;
      border-radius: 7px;
      background: var(--button);
      color: var(--text);
    }
    .pin svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .calendar {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .calendar select {
      flex: 1;
      background: transparent;
      padding: 0;
    }
    .dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .notes {
      min-height: 2.6em;
      resize: vertical;
    }
    .lines {
      white-space: pre-line;
    }
    a {
      color: var(--accent);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .map {
      position: relative;
      display: block;
      height: 120px;
      border-radius: 11px;
      overflow: hidden;
      background: var(--cell);
    }
    .map img {
      position: absolute;
      max-width: none;
      user-select: none;
    }
    .dark .map img {
      filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.6);
    }
    .marker {
      position: absolute;
      left: calc(50% - 12px);
      top: calc(50% - 28px);
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: #ff453a;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    }
    .map-link {
      position: absolute;
      inset: 0;
      display: block;
    }
    .attribution {
      position: absolute;
      right: 6px;
      bottom: 4px;
      padding: 0 4px;
      border-radius: 3px;
      font-size: 9px;
      color: #333;
      background: rgba(255, 255, 255, 0.7);
    }
    .attribution a {
      color: inherit;
    }
    .error {
      padding: 8px 12px;
      border-radius: 9px;
      font-size: 13px;
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 12%, transparent);
    }
    .ask {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 4px 2px;
      text-align: center;
    }
    .ask b {
      margin-bottom: 4px;
      font-size: 15px;
    }
    .foot {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 3px;
    }
    .foot .end {
      margin-inline-start: auto;
    }
    .btn {
      height: 28px;
      padding: 0 14px;
      border: 0;
      border-radius: 7px;
      background: var(--button);
      color: var(--text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .ask .btn {
      width: 100%;
      height: 30px;
    }
    .btn.primary {
      background: var(--accent);
      color: #fff;
    }
    .btn.danger {
      color: var(--danger);
    }
    .spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--button);
      border-top-color: var(--accent);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
      .switch::after {
        transition: none;
      }
    }
  `;
}

if (!customElements.get(EVENT_POPOVER_TAG)) {
  customElements.define(EVENT_POPOVER_TAG, EventPopover);
}
