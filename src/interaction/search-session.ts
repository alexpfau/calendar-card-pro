/**
 * The card's side of a search: the year-wide load behind it, the rows the search panel finds
 * among, and the source the panel reads while it is open (`SearchSource`).
 *
 * The load asks every calendar once, as the panel opens, through the card's own `fetchEvents`
 * without its live subscriptions: plain REST, one request per calendar, each bounded by the same
 * 30 seconds, so no subscription is leased or disturbed. It is kept in memory for this card alone,
 * never in `localStorage` or the page store, and later openings reuse it until a calendar is
 * written to (the write generation), the events of one of its calendars really change live
 * (`LiveCalendars.eventChanges`, which a new subscription's first push does not count), the
 * card's refresh interval passes, or the day moves on; a calendar that failed is asked again at
 * the next opening. A write or a live change while the panel is open loads the year again at
 * once (`calendarsChanged`), the term and the result the keyboard is on kept. Typing asks
 * nothing: every term is matched against what is in memory.
 *
 * Until a calendar answers, its rows are the events the card already holds. Every event goes
 * through the card's own matching (`processEvents`) and grouping (`groupEventsByDay`), in the view
 * on screen and as it draws it (`drawnIn`), so a search finds exactly the events the card would
 * draw on some page of that view, in the words it would draw them in, and the calendars the
 * filter hides stay hidden.
 */

import * as Types from '../config/types';
import type { SearchPanelHandle, SearchSource } from '../rendering/search-panel';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';
import * as LiveCalendars from '../utils/live-calendars';
import * as Logger from '../utils/logger';
import * as Paging from '../utils/paging';
import * as Search from '../utils/search';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** What a search reads from the card, read again each time it is needed. */
export interface SearchHost {
  /** Home Assistant, which the load asks and whose locale the rows are written for. */
  hass: Types.Hass | undefined;
  /** The card's configuration: its calendars, and how fetched events are matched to them. */
  config: Types.Config;
  /** The configuration as it applies to the view on screen, which says what each row draws. */
  viewConfig: Types.Config;
  /** The view on screen, which a pick pages in, so the search finds what it draws. */
  view: Types.EffectiveView;
  /** The card's language. */
  language: string;
  /** The calendars the filter hides on this device. */
  hidden: ReadonlySet<string>;
  /** The events the card holds now, matched to its calendars. */
  held: ReadonlyArray<Types.CalendarEventData>;
  /** Home Assistant's word for today, or undefined where it has none. */
  today: string | undefined;
  /** An event's calendar color as the card draws it, for use outside the card. */
  colorOf(event: Types.CalendarEventData): string;
  /** A calendar's name on this card. */
  nameOf(entityId: string): string;
  /** A calendar's name where it could not be loaded. */
  failedNameOf(entityId: string): string;
}

/** What a search tells the card. */
export interface SearchEvents {
  /** A result was picked: page the card to it, and ring it. */
  picked(row: Search.SearchRow): void;
  /** The panel has closed, and focus has gone back where it was. */
  gone(): void;
}

/** The year-wide load, and what it has heard so far. */
interface WideLoad {
  window: Search.SearchWindow;
  /** The calendars it asks, each once, in the order configured. */
  ids: string;
  startedAt: number;
  /** The write generation, and its calendars' real live changes, when it started. */
  writeGeneration: number;
  liveChanges: number;
  /** Each calendar that answered, with its events as Home Assistant returned them. */
  answered: Map<string, Types.CalendarEventData[]>;
  failed: Set<string>;
  pending: Set<string>;
  /** Bumped as each calendar answers. */
  version: number;
}

//-----------------------------------------------------------------------------
// SESSION
//-----------------------------------------------------------------------------

/**
 * Each calendar the configuration names, once, in the order it first appears.
 *
 * @param entities - The configured calendars
 * @returns Their ids
 */
function calendarIds(entities: Types.Config['entities']): string[] {
  return [...new Set(entities.map((entry) => (typeof entry === 'string' ? entry : entry.entity)))];
}

/**
 * Rows with an id each. A calendar listed twice, with two blocks that both take an event, draws
 * that event twice, and the search lists both copies; the panel tells its results apart by id,
 * so a copy after the first gets its place among the copies added to its id.
 *
 * @param rows - The rows, in the order the panel draws them
 * @returns The same rows
 */
function withOwnIds(rows: Search.SearchRow[]): Search.SearchRow[] {
  const copies = new Map<string, number>();
  for (const row of rows) {
    const copy = copies.get(row.id) ?? 0;
    copies.set(row.id, copy + 1);
    if (copy > 0) row.id = `${row.id}#${copy}`;
  }
  return rows;
}

/** One card's search: its year-wide load, and the panel open on it, if any. */
export class SearchSession implements SearchSource {
  private _load: WideLoad | null = null;
  private _panel: SearchPanelHandle | null = null;
  private _rows?: { key: unknown[]; rows: Search.SearchRow[] };

  /**
   * @param _host - Reads what the search needs of the card
   * @param _events - Tells the card about a pick, and the panel closing
   */
  constructor(
    private readonly _host: () => SearchHost,
    private readonly _events: SearchEvents,
  ) {}

  /** Whether a search panel is open on this card. */
  get isOpen(): boolean {
    return this._panel !== null;
  }

  /**
   * Readies the year-wide load as the panel opens: keeps the one in memory while it can still be
   * trusted, asking again only the calendars that failed, and starts a new one otherwise.
   *
   * @param now - The current moment, in epoch milliseconds
   */
  prepare(now: number = Date.now()): void {
    const host = this._host();
    const hass = host.hass;
    if (!hass) return;

    const load = this._load;
    if (load && this._current(load, host, now)) {
      if (load.failed.size > 0 && load.pending.size === 0) {
        this._fetch(load, [...load.failed], hass, host.config);
      }
      return;
    }
    this._start(host, hass, now);
  }

  /**
   * A calendar the card shows was written to, or its events changed live. While the panel is
   * open and that leaves the year in memory out of date, the year is loaded again, once, and the
   * panel told; the term and the result the keyboard is on are the panel's, and stay. Closed, the
   * next opening decides (`prepare`).
   *
   * @param now - The current moment, in epoch milliseconds
   */
  calendarsChanged(now: number = Date.now()): void {
    const load = this._load;
    if (!this._panel || !load) return;
    const host = this._host();
    if (!host.hass || this._current(load, host, now)) return;
    Logger.debug('Search: a calendar changed while the panel is open; loading the year again');
    this._start(host, host.hass, now);
    this._panel.changed();
  }

  /**
   * Whether a load still describes the calendars: the same day and calendars, no write since it
   * started, no real change to its calendars' events live, and within the refresh interval.
   *
   * @param load - The load
   * @param host - What the card holds now
   * @param now - The current moment, in epoch milliseconds
   * @returns True while it can be trusted
   */
  private _current(load: WideLoad, host: SearchHost, now: number): boolean {
    const ids = calendarIds(host.config.entities);
    return (
      load.window.key === Search.searchWindow(new Date(now)).key &&
      load.ids === ids.join('\u0000') &&
      load.writeGeneration === EventUtils.currentWriteGeneration() &&
      load.liveChanges === LiveCalendars.eventChanges(ids) &&
      now - load.startedAt < EventUtils.getCacheDuration(host.config)
    );
  }

  /**
   * Starts a new load of every calendar, superseding any before it, whose answers are dropped.
   *
   * @param host - What the card holds now
   * @param hass - Home Assistant
   * @param now - The current moment, in epoch milliseconds
   */
  private _start(host: SearchHost, hass: Types.Hass, now: number): void {
    const ids = calendarIds(host.config.entities);
    const next: WideLoad = {
      window: Search.searchWindow(new Date(now)),
      ids: ids.join('\u0000'),
      startedAt: now,
      writeGeneration: EventUtils.currentWriteGeneration(),
      liveChanges: LiveCalendars.eventChanges(ids),
      answered: new Map(),
      failed: new Set(),
      pending: new Set(),
      version: 0,
    };
    this._load = next;
    this._rows = undefined;
    this._fetch(next, ids, hass, host.config);
  }

  /**
   * Asks calendars for the load's whole window, each answer heard as it comes.
   *
   * @param load - The load they belong to
   * @param ids - The calendars to ask
   * @param hass - Home Assistant
   * @param config - The card's configuration
   */
  private _fetch(load: WideLoad, ids: string[], hass: Types.Hass, config: Types.Config): void {
    for (const id of ids) {
      load.pending.add(id);
      load.failed.delete(id);
    }
    const entities = config.entities
      .map((entry) => (typeof entry === 'string' ? { entity: entry } : entry))
      .filter((entry) => ids.includes(entry.entity)) as Types.EntityConfig[];
    Logger.debug(
      `Search: loading ${ids.length} calendar(s) from ${load.window.key} for ${load.window.days} days`,
    );
    // No `live`: plain requests, which neither lease nor disturb a live subscription.
    void EventUtils.fetchEvents(hass, entities, load.window, (entityId, events) => {
      if (this._load !== load) return;
      load.pending.delete(entityId);
      if (events) load.answered.set(entityId, events);
      else load.failed.add(entityId);
      load.version += 1;
      this._panel?.changed();
    });
  }

  /** Closes the panel open on this card, if one is. */
  close(): void {
    this._panel?.close();
  }

  //---------------------------------------------------------------------------
  // WHAT THE PANEL READS
  //---------------------------------------------------------------------------

  get loading(): boolean {
    return (this._load?.pending.size ?? 0) > 0;
  }

  get failed(): ReadonlyArray<string> {
    const host = this._host();
    return [...(this._load?.failed ?? [])].map((id) => host.failedNameOf(id));
  }

  find(term: string): Search.SearchResults {
    const host = this._host();
    const now = Date.now();
    return Search.findRows(this._rowsFor(host, now), term, host.language, now);
  }

  attach(panel: SearchPanelHandle): () => void {
    this._panel = panel;
    return () => {
      if (this._panel === panel) this._panel = null;
      this._events.gone();
    };
  }

  pick(id: string): void {
    const row = this._rows?.rows.find((candidate) => candidate.id === id);
    if (row) this._events.picked(row);
  }

  //---------------------------------------------------------------------------
  // ROWS
  //---------------------------------------------------------------------------

  /**
   * Every event the search can find, described as the card draws it: held events for the
   * calendars still to answer, the load's for those that have, none for those that failed,
   * matched to the card's calendars, the hidden ones left out, grouped as the view on screen
   * groups them over the whole window, and only those it draws. Built again only when one of
   * those changes.
   *
   * @param host - What the card holds now
   * @param now - The current moment, in epoch milliseconds
   * @returns The rows
   */
  private _rowsFor(host: SearchHost, now: number): Search.SearchRow[] {
    const load = this._load;
    const today = FormatUtils.getLocalDateKey(new Date(now));
    const key: unknown[] = [
      host.held,
      load,
      load?.version,
      host.config,
      host.viewConfig,
      host.view,
      host.language,
      host.hidden,
      host.today,
      host.hass?.locale,
      today,
    ];
    const memo = this._rows;
    if (memo && memo.key.every((part, index) => part === key[index])) return memo.rows;

    const loaded = (entityId: string | undefined): boolean =>
      load !== null && (load.answered.has(entityId ?? '') || load.failed.has(entityId ?? ''));
    const answered = load ? [...load.answered.values()].flat() : [];
    const events = [
      ...host.held.filter((event) => !loaded(event._entityId)),
      ...(answered.length > 0 ? EventUtils.processEvents(answered, host.config) : []),
    ].filter((event) => !host.hidden.has(event._entityId ?? ''));

    let rows: Search.SearchRow[] = [];
    if (events.length > 0) {
      const window = load?.window ?? Search.searchWindow(new Date(now));
      const grouping = Search.searchGroupingConfig(host.viewConfig, window, host.view);
      const days = Search.drawnIn(
        EventUtils.groupEventsByDay(events, grouping, true, host.language, host.view, host.hass),
        grouping,
        host.view,
      );
      const describe = this._describer(host, today);
      rows = withOwnIds(Search.occurrencesIn(days).map(describe));
    }

    this._rows = { key, rows };
    return rows;
  }

  /**
   * Describes events as the panel draws them, reading each calendar's color, name and month
   * heading once.
   *
   * @param host - What the card holds now
   * @param today - Today's date, `YYYY-MM-DD`
   * @returns The describer
   */
  private _describer(
    host: SearchHost,
    today: string,
  ): (occurrence: Search.Occurrence) => Search.SearchRow {
    const language = host.language;
    const colors = new Map<unknown, string>();
    const names = new Map<string, string>();
    const months = new Map<string, string>();
    const cached = <K, V>(cache: Map<K, V>, key: K, make: () => V): V => {
      if (!cache.has(key)) cache.set(key, make());
      return cache.get(key)!;
    };

    return ({ event, startPoint, endPoint, start, end }) => {
      const entityId = event._entityId ?? '';
      const day = FormatUtils.getLocalDateKey(start);
      const title = event.summary ?? '';
      const location = event.location ?? '';
      return {
        id: JSON.stringify([
          entityId,
          start.getTime(),
          end.getTime(),
          title,
          event._source?.uid ?? null,
          event._source?.recurrence_id ?? null,
        ]),
        entityId,
        title,
        location,
        folded: {
          title: Search.foldText(title, language),
          location: Search.foldText(location, language),
          description: Search.foldText(event.description ?? '', language).text,
        },
        start: start.getTime(),
        end: end.getTime(),
        day,
        monthKey: day.slice(0, 7),
        month: cached(months, day.slice(0, 7), () => Paging.monthHeading(start, language)),
        dayText:
          day === today
            ? (host.today ?? Paging.todayWord(language))
            : Paging.dayName(start, language),
        timeText: FormatUtils.formatEventTime(
          { ...event, start: startPoint, end: endPoint },
          host.viewConfig,
          language,
          host.hass,
        ),
        color: cached(colors, event._matchedConfig ?? entityId, () => host.colorOf(event)),
        calendar: cached(names, entityId, () => host.nameOf(entityId)),
        target: Search.ringTargetOf(event),
      };
    };
  }
}
