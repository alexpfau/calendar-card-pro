import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CreateDialogParams,
  type DetailDialogParams,
  type DialogTag,
  EVENT_DETAIL_DIALOG_TAG,
  EVENT_EDITOR_DIALOG_TAG,
  LOAD_TIMEOUT_MS,
  ensureDialogLoaded,
  openCreateEventDialog,
  openEventDetailDialog,
} from '../src/interaction/ha-calendar-dialogs';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

/**
 * How the card gets Home Assistant's calendar dialogs defined, and what it does when it
 * cannot.
 *
 * The page's real custom-element registry cannot forget a definition, which would chain
 * every case here to the one before it. Each case therefore runs against a registry of its
 * own, standing in for `customElements` the way Home Assistant's would: an element is
 * defined only once something defines it. `ha-full-calendar` is a fake whose two handlers
 * do what Home Assistant's do with the parts the card relies on, dispatching `show-dialog`
 * with an import that defines the dialog. It cannot detect a change in Home Assistant's
 * real internals; that limit is inherent, and the loader fails closed for it.
 */

class FakeRegistry {
  private readonly defined = new Map<string, CustomElementConstructor>();
  private readonly pending = new Map<string, Array<() => void>>();

  get(tag: string): CustomElementConstructor | undefined {
    return this.defined.get(tag);
  }

  define(tag: string, ctor: CustomElementConstructor): void {
    this.defined.set(tag, ctor);
    for (const resolve of this.pending.get(tag) ?? []) resolve();
    this.pending.delete(tag);
  }

  whenDefined(tag: string): Promise<CustomElementConstructor> {
    const ctor = this.defined.get(tag);
    if (ctor) return Promise.resolve(ctor);
    return new Promise((resolve) =>
      this.pending.set(tag, [
        ...(this.pending.get(tag) ?? []),
        () => resolve(this.defined.get(tag)!),
      ]),
    );
  }
}

type HelperWindow = Window & { loadCardHelpers?: unknown };

interface StandIn {
  dispatchEvent(ev: Event): boolean;
}

let registry: FakeRegistry;

const Element = class {} as unknown as CustomElementConstructor;

/**
 * Install a fake Home Assistant: card helpers that define a fake `ha-full-calendar`.
 *
 * @param gate - Resolves when `loadCardHelpers` may answer; immediate by default
 */
function fakeHomeAssistant(gate: Promise<void> = Promise.resolve()) {
  const dialogImports = {
    [EVENT_EDITOR_DIALOG_TAG]: vi.fn(async () => registry.define(EVENT_EDITOR_DIALOG_TAG, Element)),
    [EVENT_DETAIL_DIALOG_TAG]: vi.fn(async () => registry.define(EVENT_DETAIL_DIALOG_TAG, Element)),
  };
  const showDialog = (tag: DialogTag, dialogParams: unknown) =>
    Object.assign(new Event('show-dialog'), {
      detail: { dialogTag: tag, dialogImport: dialogImports[tag], dialogParams },
    });

  const createEvent = vi.fn(function (this: StandIn & { _activeView?: string }) {
    this.dispatchEvent(
      showDialog(EVENT_EDITOR_DIALOG_TAG, { selectedDate: this._activeView, updated: () => {} }),
    );
  });
  const handleEventClick = vi.fn(function (
    this: StandIn & { hass: { states: Record<string, unknown> } },
    info: { event: { extendedProps: { calendar: string }; backgroundColor: string } },
  ) {
    const calendar = info.event.extendedProps.calendar;
    this.dispatchEvent(
      showDialog(EVENT_DETAIL_DIALOG_TAG, {
        calendarId: calendar,
        color: info.event.backgroundColor,
        canEdit: Boolean(this.hass.states[calendar]),
      }),
    );
  });

  class FullCalendar {}
  Object.assign(FullCalendar.prototype, {
    _createEvent: createEvent,
    _handleEventClick: handleEventClick,
  });

  const createCardElement = vi.fn(() => {
    registry.define('ha-full-calendar', FullCalendar as unknown as CustomElementConstructor);
    return {};
  });
  const loadCardHelpers = vi.fn(async () => {
    await gate;
    return { createCardElement };
  });
  (window as HelperWindow).loadCardHelpers = loadCardHelpers;

  return {
    loadCardHelpers,
    createCardElement,
    createEvent,
    handleEventClick,
    dialogImports,
    prototype: FullCalendar.prototype as unknown as Record<string, unknown>,
  };
}

/** An element in the page, recording what it dispatches. */
function host() {
  const node = document.createElement('div');
  document.body.appendChild(node);
  const dispatched: { type: string; detail: unknown }[] = [];
  for (const type of ['show-dialog', 'hass-action', 'hass-more-info', 'location-changed']) {
    node.addEventListener(type, (ev) =>
      dispatched.push({ type, detail: (ev as Event & { detail?: unknown }).detail }),
    );
  }
  return { node, dispatched };
}

/** One callback for every request, so parameters compare equal across requests. */
const updated = () => undefined;

const createParams = (calendarId = 'calendar.anna'): CreateDialogParams => ({
  calendarId,
  updated,
});

const detailParams = (calendarId = 'calendar.anna'): DetailDialogParams => ({
  calendarId,
  entry: {
    summary: 'Dentist',
    dtstart: '2026-06-17T14:00:00Z',
    dtend: '2026-06-17T15:00:00Z',
    uid: 'uid-dentist',
  },
  color: '#ff0000',
  canEdit: true,
  canDelete: false,
  updated,
});

const OPENERS = [
  {
    tag: EVENT_EDITOR_DIALOG_TAG,
    open: (node: HTMLElement, calendarId?: string) =>
      openCreateEventDialog(node, createParams(calendarId)),
    params: createParams,
  },
  {
    tag: EVENT_DETAIL_DIALOG_TAG,
    open: (node: HTMLElement, calendarId?: string) =>
      openEventDetailDialog(node, detailParams(calendarId)),
    params: detailParams,
  },
] as const;

/**
 * Whether a request settled before its load would have timed out.
 *
 * A load that cannot complete has to fail at once, not after `LOAD_TIMEOUT_MS` of nothing
 * happening: the timeout is for a Home Assistant that is slow, not for one the card can
 * already tell will never answer.
 *
 * @param request - An open request, made with fake timers installed
 * @returns True once it has settled short of the timeout
 */
async function settledBeforeTimeout(request: Promise<void>): Promise<boolean> {
  let settled = false;
  void request.then(() => (settled = true));
  await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);
  return settled;
}

/** The fallback each dialog takes, as the host records it. */
function expectFallback(
  tag: DialogTag,
  dispatched: { type: string; detail: unknown }[],
  calendarId = 'calendar.anna',
): void {
  if (tag === EVENT_EDITOR_DIALOG_TAG) {
    // Home Assistant is asked to navigate, so its own navigation runs: it closes open
    // dialogs and lets a page with unsaved changes refuse. The card moves no history itself.
    expect(dispatched).toEqual([
      {
        type: 'hass-action',
        detail: {
          config: { tap_action: { action: 'navigate', navigation_path: '/calendar' } },
          action: 'tap',
        },
      },
    ]);
  } else {
    // The details fallback keeps the user on the dashboard, showing the event's calendar.
    expect(dispatched).toEqual([{ type: 'hass-more-info', detail: { entityId: calendarId } }]);
  }
  expect(window.location.pathname).toBe('/');
}

beforeEach(() => {
  registry = new FakeRegistry();
  vi.stubGlobal('customElements', registry);
});

afterEach(() => {
  delete (window as HelperWindow).loadCardHelpers;
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(OPENERS)('opening $tag', ({ tag, open, params }) => {
  it('opens straight away, borrowing nothing, once the dialog is defined', async () => {
    registry.define(tag, Element);
    const ha = fakeHomeAssistant();
    const { node, dispatched } = host();

    await open(node);

    expect(ha.loadCardHelpers).not.toHaveBeenCalled();
    expect(ha.createEvent).not.toHaveBeenCalled();
    expect(ha.handleEventClick).not.toHaveBeenCalled();
    expect(dispatched).toEqual([
      {
        type: 'show-dialog',
        detail: { dialogTag: tag, dialogImport: expect.any(Function), dialogParams: params() },
      },
    ]);
  });

  it('falls back when Home Assistant offers no card helpers', async () => {
    vi.useFakeTimers();
    const { node, dispatched } = host();

    expect(await settledBeforeTimeout(open(node, 'calendar.ben'))).toBe(true);
    expectFallback(tag, dispatched, 'calendar.ben');
  });

  it("borrows the dialog's import and opens it with the card's own parameters", async () => {
    const ha = fakeHomeAssistant();
    const { node, dispatched } = host();

    await open(node);

    // A core calendar card for a calendar the card shows is what makes Home Assistant
    // load `ha-full-calendar`.
    expect(ha.createCardElement).toHaveBeenCalledWith({
      type: 'calendar',
      entities: ['calendar.anna'],
    });
    expect(ha.dialogImports[tag]).toHaveBeenCalledOnce();
    expect(registry.get(tag)).toBeDefined();
    // The borrowed `show-dialog` went to a stand-in; only the card's reaches the page, and
    // it carries what the card decided rather than what Home Assistant computed.
    expect(dispatched).toEqual([
      {
        type: 'show-dialog',
        detail: { dialogTag: tag, dialogImport: expect.any(Function), dialogParams: params() },
      },
    ]);
  });

  it('starts one load for repeated requests during the first, and opens once', async () => {
    let release!: () => void;
    const ha = fakeHomeAssistant(new Promise<void>((resolve) => (release = resolve)));
    const { node, dispatched } = host();

    const requests = [
      open(node, 'calendar.anna'),
      open(node, 'calendar.ben'),
      open(node, 'calendar.cleo'),
    ];
    await Promise.resolve();
    release();

    await Promise.all(requests);
    expect(ha.loadCardHelpers).toHaveBeenCalledOnce();
    expect(ha.createCardElement).toHaveBeenCalledOnce();
    expect(ha.dialogImports[tag]).toHaveBeenCalledOnce();
    expect(dispatched.map((d) => d.type)).toEqual(['show-dialog']);
    // The newest request wins; the core card was created for the first.
    expect(dispatched[0].detail).toMatchObject({ dialogParams: params('calendar.cleo') });
    expect(ha.createCardElement).toHaveBeenCalledWith({
      type: 'calendar',
      entities: ['calendar.anna'],
    });
  });

  it('falls back once the load has taken too long, and tries afresh next time', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const ha = fakeHomeAssistant(new Promise<void>((resolve) => (release = resolve)));
    const { node, dispatched } = host();

    const first = open(node);
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);
    expect(dispatched).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    expectFallback(tag, dispatched);

    // The hung load is forgotten rather than joined forever.
    dispatched.length = 0;
    release();
    await open(node);
    expect(ha.loadCardHelpers).toHaveBeenCalledTimes(2);
    expect(dispatched.map((d) => d.type)).toEqual(['show-dialog']);
  });
});

describe('a load that cannot complete', () => {
  it.each(OPENERS)(
    "falls back when Home Assistant's calendar has no handler ($tag)",
    async ({ tag, open }) => {
      vi.useFakeTimers();
      const ha = fakeHomeAssistant();
      ha.createCardElement.mockImplementation(() => {
        registry.define('ha-full-calendar', class {} as unknown as CustomElementConstructor);
        return {};
      });
      const { node, dispatched } = host();

      expect(await settledBeforeTimeout(open(node))).toBe(true);
      expectFallback(tag, dispatched);
    },
  );

  it.each(OPENERS)(
    'falls back when the handler dispatches a different dialog ($tag)',
    async ({ tag, open }) => {
      vi.useFakeTimers();
      const ha = fakeHomeAssistant();
      const other = tag === EVENT_EDITOR_DIALOG_TAG ? ha.createEvent : ha.handleEventClick;
      other.mockImplementation(function (this: StandIn) {
        this.dispatchEvent(
          Object.assign(new Event('show-dialog'), {
            detail: { dialogTag: 'some-other-dialog', dialogImport: async () => {} },
          }),
        );
      });
      const { node, dispatched } = host();

      expect(await settledBeforeTimeout(open(node))).toBe(true);
      expectFallback(tag, dispatched);
    },
  );

  it.each(OPENERS)(
    'falls back when the card helpers cannot create a card ($tag)',
    async ({ tag, open }) => {
      vi.useFakeTimers();
      (window as HelperWindow).loadCardHelpers = async () => ({});
      const { node, dispatched } = host();

      expect(await settledBeforeTimeout(open(node))).toBe(true);
      expectFallback(tag, dispatched);
    },
  );
});

describe('a borrowed handler that is asynchronous', () => {
  type AnyHandler = Mock<(this: StandIn, ...args: unknown[]) => unknown>;

  /** The fake handler each dialog's import is borrowed through. */
  const handlerFor = (ha: ReturnType<typeof fakeHomeAssistant>, tag: DialogTag) =>
    (tag === EVENT_EDITOR_DIALOG_TAG
      ? ha.createEvent
      : ha.handleEventClick) as unknown as AnyHandler;

  it.each(OPENERS)(
    'opens the dialog when the handler dispatches after an await ($tag)',
    async ({ tag, open, params }) => {
      const ha = fakeHomeAssistant();
      const handler = handlerFor(ha, tag);
      const dispatchNow = handler.getMockImplementation()!;
      handler.mockImplementation(async function (this: StandIn, ...args: unknown[]) {
        await Promise.resolve();
        return dispatchNow.apply(this, args);
      });
      const { node, dispatched } = host();

      await open(node);

      expect(dispatched).toEqual([
        {
          type: 'show-dialog',
          detail: { dialogTag: tag, dialogImport: expect.any(Function), dialogParams: params() },
        },
      ]);
    },
  );

  it.each(OPENERS)(
    'falls back, leaving nothing unhandled, when the handler rejects ($tag)',
    async ({ tag, open }) => {
      const ha = fakeHomeAssistant();
      // A plain function, not a mock: a mock attaches its own handler to any promise it
      // returns, to record how it settled, so a rejection from one is never unhandled and
      // this test could not fail.
      ha.prototype[tag === EVENT_EDITOR_DIALOG_TAG ? '_createEvent' : '_handleEventClick'] =
        async () => {
          throw new Error('Home Assistant changed');
        };
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      const { node, dispatched } = host();

      try {
        await open(node);
        // Node reports an unhandled rejection once the microtask queue has drained.
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        process.off('unhandledRejection', unhandled);
      }

      expectFallback(tag, dispatched);
      expect(unhandled).not.toHaveBeenCalled();
    },
  );
});

describe('asking for both dialogs', () => {
  const ORDERS = [
    { first: OPENERS[0], second: OPENERS[1] },
    { first: OPENERS[1], second: OPENERS[0] },
  ];

  it.each(ORDERS)(
    'opens only $second.tag when it is asked for while $first.tag loads',
    async ({ first, second }) => {
      let release!: () => void;
      fakeHomeAssistant(new Promise<void>((resolve) => (release = resolve)));
      const { node, dispatched } = host();

      const requests = [first.open(node, 'calendar.anna'), second.open(node, 'calendar.ben')];
      await Promise.resolve();
      release();
      await Promise.all(requests);

      expect(dispatched).toEqual([
        {
          type: 'show-dialog',
          detail: {
            dialogTag: second.tag,
            dialogImport: expect.any(Function),
            dialogParams: second.params('calendar.ben'),
          },
        },
      ]);

      // The replaced request is forgotten, not left waiting to open later.
      dispatched.length = 0;
      await first.open(node, 'calendar.cleo');
      expect(dispatched.map((d) => (d.detail as { dialogTag: string }).dialogTag)).toEqual([
        first.tag,
      ]);
    },
  );

  it.each(ORDERS)(
    'does not open $first.tag after $second.tag, already loaded, opened in its place',
    async ({ first, second }) => {
      registry.define(second.tag, Element);
      let release!: () => void;
      fakeHomeAssistant(new Promise<void>((resolve) => (release = resolve)));
      const { node, dispatched } = host();

      const loading = first.open(node, 'calendar.anna');
      await second.open(node, 'calendar.ben');
      release();
      await loading;

      expect(dispatched.map((d) => (d.detail as { dialogTag: string }).dialogTag)).toEqual([
        second.tag,
      ]);
    },
  );
});

describe('loading both dialogs', () => {
  it('creates one core card for both, and borrows each through its own handler', async () => {
    const ha = fakeHomeAssistant();

    await Promise.all([
      ensureDialogLoaded(EVENT_EDITOR_DIALOG_TAG, 'calendar.anna'),
      ensureDialogLoaded(EVENT_DETAIL_DIALOG_TAG, 'calendar.ben'),
    ]);

    expect(ha.createCardElement).toHaveBeenCalledOnce();
    expect(ha.createEvent).toHaveBeenCalledOnce();
    expect(ha.handleEventClick).toHaveBeenCalledOnce();
    expect(ha.handleEventClick.mock.calls[0][0]).toMatchObject({
      event: { extendedProps: { calendar: 'calendar.ben' } },
    });
    expect(ha.dialogImports[EVENT_EDITOR_DIALOG_TAG]).toHaveBeenCalledOnce();
    expect(ha.dialogImports[EVENT_DETAIL_DIALOG_TAG]).toHaveBeenCalledOnce();
  });
});
