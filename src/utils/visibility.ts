/**
 * Visibility conditions on one calendar of the card: Home Assistant's own card-level
 * `visibility:` shapes, judged for each entry under `entities`.
 *
 * Written from Home Assistant's frontend rather than copied from it, which a custom card
 * cannot import anyway: `checkConditionsMet` in `src/panels/lovelace/common/validate-condition.ts`
 * decides each condition, and `evaluateConditionsLocally` in
 * `src/common/condition/evaluate-locally.ts` decides how `and`, `or`, `not`, `enabled` and a
 * condition the browser cannot judge combine.
 *
 * Since 2026.10 Home Assistant splits a list as `src/common/condition/split.ts` does: it judges
 * `screen`, `user`, `time`, `view_columns` and `location` in the browser, and asks core for the
 * rest through `subscribe_condition` (`template`, `sun`, `zone`, `device`, a state held `for:` a
 * while), translated to core's shape (`translate.ts`). The card does the same: it judges the
 * browser's share here, and reads core's answers from `utils/core-conditions.ts`, which holds the
 * subscriptions `coreConditions` lists. Until core answers, or where Home Assistant is too old to,
 * a condition the browser can judge is judged here and any other is unknown, as Home Assistant
 * seeds a card's visibility before core answers.
 *
 * A list is judged true, false or unknown, and only true shows. Unknown stays unknown through
 * `not`, so `not: [template]` hides rather than shows: an entry whose conditions nobody has judged
 * yet is hidden, never shown by accident. An error from core hides the entry whatever the rest
 * says, as Home Assistant hides a card. `tests/visibility.test.ts` pins the semantics, and a probe
 * outside the repository ran Home Assistant's own functions over the same cases.
 *
 * Nothing here reads a `hass` state the configuration does not name, except where a `location`
 * condition reads the viewer's person and the zones: `locationEntityIds` lists those, so the card
 * can still skip renders for every other state (`utils/hass-relevance.ts`).
 */
import type * as Types from '../config/types';

/** One condition as written: Home Assistant's shape, read loosely because it comes from YAML. */
export type VisibilityCondition = Record<string, unknown>;

/** What judging a list reads besides the conditions. */
export interface VisibilityContext {
  /** Home Assistant: the states, the viewer and the time zone settings. */
  hass: Types.Hass | null | undefined;
  /** The calendar the entry draws, which a `state` condition naming no entity reads. */
  entityId?: string;
  /** The moment to judge `time` at, in epoch milliseconds. */
  now: number;
  /** Whether a media query matches now. */
  matches(query: string): boolean;
  /** What core answered for a condition, by `coreKey`; undefined until it has. */
  core?(key: string): CoreAnswer | undefined;
}

/** What core answered for a condition: whether it holds, or that core could not judge it. */
export type CoreAnswer = boolean | 'error';

/** The condition types the card judges; anything else is unknown until core answers. */
const JUDGED = new Set([
  'user',
  'state',
  'numeric_state',
  'screen',
  'time',
  'view_columns',
  'location',
]);

/** The types Home Assistant judges in the browser and never sends to core (`translate.ts`). */
const CLIENT = new Set(['screen', 'user', 'view_columns', 'location', 'time']);

const LOGICAL = new Set(['and', 'or', 'not']);

/** Home Assistant's weekday names, Sunday first, as `getDay()` counts. */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** An entity id as Home Assistant's dashboards recognize one (`isValidEntityId`). */
const ENTITY_ID = /^\w+\.\w+$/;

const DAY_MS = 86_400_000;

//-----------------------------------------------------------------------------
// NORMALIZING
//-----------------------------------------------------------------------------

/**
 * A calendar's `visibility` as the card reads it: a list, or nothing for no conditions.
 *
 * One condition written without a list is a list of one. An empty list is no conditions, as it
 * is to Home Assistant. Anything else is kept as written, so an entry with a malformed list is
 * judged unknown and hidden rather than shown.
 *
 * @param value - The value as written
 * @returns The conditions, or undefined for none
 */
export function normalizeVisibility(value: unknown): VisibilityCondition[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.length > 0 ? (value as VisibilityCondition[]) : undefined;
  }
  return [value as VisibilityCondition];
}

/** Signatures per list, computed once per list object. */
const signatures = new WeakMap<object, string>();

/**
 * A string that is the same for two lists exactly when they say the same, so a result can be
 * keyed by what an entry's conditions say rather than by the object holding them.
 *
 * @param conditions - A normalized list
 * @returns The signature
 */
export function visibilitySignature(conditions: ReadonlyArray<unknown>): string {
  let signature = signatures.get(conditions);
  if (signature === undefined) {
    signature = JSON.stringify(conditions) ?? '';
    signatures.set(conditions, signature);
  }
  return signature;
}

//-----------------------------------------------------------------------------
// JUDGING
//-----------------------------------------------------------------------------

/**
 * Whether a list of conditions holds: every condition must, as for a card's `visibility`.
 *
 * @param conditions - A normalized list
 * @param context - What the conditions are judged against
 * @returns True, false, or undefined where the card cannot tell
 */
export function evaluateVisibility(
  conditions: ReadonlyArray<unknown>,
  context: VisibilityContext,
): boolean | undefined {
  // An error from core hides, whatever the rest says: a `not` around it must not show it.
  if (context.core) {
    for (const { key } of coreConditions(conditions, context.entityId ?? '')) {
      if (context.core(key) === 'error') return undefined;
    }
  }
  return allOf(
    conditions.filter((condition) => !isDisabled(condition)).map((c) => judge(c, context)),
  );
}

/**
 * Whether an entry with these conditions shows: only when they are known to hold.
 *
 * @param conditions - A normalized list, or undefined for none
 * @param context - What the conditions are judged against
 * @returns True to show
 */
export function visibilityPasses(
  conditions: ReadonlyArray<unknown> | undefined,
  context: VisibilityContext,
): boolean {
  return conditions === undefined || evaluateVisibility(conditions, context) === true;
}

/** False wins, and unknown wins over true: `andOf` in Home Assistant's `evaluate-locally.ts`. */
function allOf(values: ReadonlyArray<boolean | undefined>): boolean | undefined {
  let unknown = false;
  for (const value of values) {
    if (value === false) return false;
    if (value === undefined) unknown = true;
  }
  return unknown ? undefined : true;
}

/** True wins, and unknown wins over false: `orOf` in Home Assistant's `evaluate-locally.ts`. */
function anyOf(values: ReadonlyArray<boolean | undefined>): boolean | undefined {
  let unknown = false;
  for (const value of values) {
    if (value === true) return true;
    if (value === undefined) unknown = true;
  }
  return unknown ? undefined : false;
}

function isRecord(value: unknown): value is VisibilityCondition {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a condition asks for what only core can judge: a state held `for` a while, or a
 * template. Unknown here in either shape. In core's shape, which Home Assistant's editor writes,
 * the card asks core (`isServerCondition`). In the dashboard shape Home Assistant drops `for` and
 * so ignores it, and `state_not` held `for` a while has no single reading, so the card neither
 * asks core nor ignores it: it hides the entry and says so, rather than show it at once against
 * what was written.
 */
function needsCore(condition: VisibilityCondition): boolean {
  return condition.for !== undefined || condition.value_template !== undefined;
}

/** `enabled: false`, which Home Assistant skips wherever it appears. */
function isDisabled(condition: unknown): boolean {
  return isRecord(condition) && condition.enabled === false;
}

/** A value as a list: one value is a list of one, nothing is nothing (`ensureArray`). */
function asList(value: unknown): unknown[] | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * One condition, of any kind.
 *
 * @param condition - As written
 * @param context - What it is judged against
 * @returns True, false, or undefined where the card cannot tell
 */
function judge(condition: unknown, context: VisibilityContext): boolean | undefined {
  if (!isRecord(condition)) return undefined;
  // Core's answer wins once it has one, for exactly the conditions the card asked it about.
  if (context.core && isServerCondition(condition)) {
    const answer = context.core(coreKey(condition, context.entityId ?? ''));
    if (typeof answer === 'boolean') return answer;
  }
  // A templated `enabled` only core can render.
  if ('enabled' in condition && typeof condition.enabled !== 'boolean') return undefined;

  if (!('condition' in condition)) {
    return needsCore(condition) ? undefined : judgeState(condition, context);
  }

  const type = condition.condition;
  if (typeof type !== 'string') return undefined;

  if (LOGICAL.has(type)) {
    // No `conditions` at all holds, as in Home Assistant.
    if (condition.conditions === undefined) return true;
    const values = (asList(condition.conditions) ?? [])
      .filter((child) => !isDisabled(child))
      .map((child) => judge(child, context));
    if (type === 'or') return anyOf(values);
    const all = allOf(values);
    // Home Assistant's `not` is not(all of them).
    return type === 'not' ? (all === undefined ? undefined : !all) : all;
  }

  if (!JUDGED.has(type)) return undefined;
  if (needsCore(condition)) return undefined;

  switch (type) {
    case 'user':
      return judgeUser(condition, context);
    case 'screen':
      return typeof condition.media_query === 'string' && condition.media_query !== ''
        ? context.matches(condition.media_query)
        : false;
    case 'time':
      return judgeTime(condition, context);
    case 'numeric_state':
      return judgeNumericState(condition, context);
    case 'view_columns':
      // A card has no column count to compare, which Home Assistant reads as holding.
      return true;
    case 'location':
      return judgeLocation(condition, context);
    default:
      return judgeState(condition, context);
  }
}

function judgeUser(condition: VisibilityCondition, context: VisibilityContext): boolean {
  const users = asList(condition.users);
  const id = context.hass?.user?.id;
  return users !== undefined && typeof id === 'string' && users.includes(id);
}

/** A state's value, or undefined where the entity has no state. */
function stateOf(context: VisibilityContext, entityId: unknown): Types.HassEntity | undefined {
  if (typeof entityId !== 'string' || entityId === '') return undefined;
  return context.hass?.states?.[entityId];
}

/** A value that names an entity with a state reads as that state too (`getValueFromEntityId`). */
function stateOfReference(context: VisibilityContext, value: unknown): string | undefined {
  if (typeof value !== 'string' || !ENTITY_ID.test(value)) return undefined;
  return stateOf(context, value)?.state;
}

/**
 * A `state` condition, in Home Assistant's dashboard shape (`entity`, `state`, `state_not`) or
 * in core's (`entity_id`, `state`), as Home Assistant's own editor writes it since 2026.10.
 *
 * An entity with no state is unknown rather than `unknown`: current Home Assistant asks core,
 * which reports an error for it, and hides the card.
 *
 * @param condition - The condition
 * @param context - What it is judged against
 * @returns True, false, or undefined where the card cannot tell
 */
function judgeState(
  condition: VisibilityCondition,
  context: VisibilityContext,
): boolean | undefined {
  if ('entity_id' in condition) return judgeCoreState(condition, context);

  const entityId =
    typeof condition.entity === 'string' && condition.entity !== ''
      ? condition.entity
      : context.entityId;
  const stateObj = stateOf(context, entityId);
  if (!stateObj) return undefined;

  let state: string;
  if (typeof condition.attribute === 'string' && condition.attribute !== '') {
    const value = stateObj.attributes?.[condition.attribute];
    state = value === null || value === undefined ? 'unknown' : String(value);
  } else {
    state = stateObj.state;
  }

  const wanted = condition.state ?? condition.state_not;
  if (wanted === undefined || wanted === null) return false;

  const values = asList(wanted) ?? [];
  const resolved = values.flatMap((value) => {
    const reference = stateOfReference(context, value);
    return reference === undefined ? [value] : [value, reference];
  });
  const listed = resolved.includes(state);
  return condition.state !== undefined && condition.state !== null ? listed : !listed;
}

/** A value naming an entity rather than a number (`isEntityReference` in Home Assistant). */
function isEntityReference(value: string): boolean {
  return Number.isNaN(Number(value)) && ENTITY_ID.test(value);
}

/** The entity ids a core-shaped condition names, or undefined where it names none properly. */
function coreEntityIds(condition: VisibilityCondition): string[] | undefined {
  const ids = asList(condition.entity_id);
  if (!ids || ids.length === 0 || !ids.every((id) => typeof id === 'string' && id !== '')) {
    return undefined;
  }
  return ids as string[];
}

/**
 * Whether every entity, or with `match: any` some entity, passes: core's rule for a list.
 *
 * @returns Undefined where any entity has no state, or the condition asks for what only core
 *   can judge
 */
function judgeEach(
  condition: VisibilityCondition,
  context: VisibilityContext,
  test: (stateObj: Types.HassEntity) => boolean | undefined,
): boolean | undefined {
  if (condition.attribute !== undefined) return undefined;
  const match = condition.match ?? 'all';
  if (match !== 'all' && match !== 'any') return undefined;

  const ids = coreEntityIds(condition);
  if (!ids) return undefined;

  const values = ids.map((id) => {
    const stateObj = stateOf(context, id);
    return stateObj ? test(stateObj) : undefined;
  });
  return match === 'any' ? anyOf(values) : allOf(values);
}

function judgeCoreState(
  condition: VisibilityCondition,
  context: VisibilityContext,
): boolean | undefined {
  const wanted = asList(condition.state);
  if (!wanted || wanted.length === 0) return undefined;
  // Core compares the written values as they are; Home Assistant's dashboards read one naming
  // an entity as that entity's state. Where the two could disagree, only core can tell.
  if (wanted.some((value) => typeof value === 'string' && isEntityReference(value))) {
    return undefined;
  }
  const values = wanted.map((value) => String(value));
  return judgeEach(condition, context, (stateObj) => values.includes(stateObj.state));
}

/**
 * A `numeric_state` condition, in either shape: true when the value is a number strictly above
 * `above` and below `below`. A bound may name an entity, read as its state.
 *
 * @param condition - The condition
 * @param context - What it is judged against
 * @returns True, false, or undefined where the card cannot tell
 */
function judgeNumericState(
  condition: VisibilityCondition,
  context: VisibilityContext,
): boolean | undefined {
  if ('entity_id' in condition) return judgeCoreNumericState(condition, context);

  const entityId =
    typeof condition.entity === 'string' && condition.entity !== ''
      ? condition.entity
      : context.entityId;
  const stateObj = stateOf(context, entityId);
  if (!stateObj) return undefined;

  const attribute = condition.attribute;
  const raw =
    typeof attribute === 'string' && attribute !== ''
      ? stateObj.attributes?.[attribute]
      : stateObj.state;
  const value = Number(raw);
  if (Number.isNaN(value)) return false;

  const bound = (written: unknown): number =>
    Number(typeof written === 'string' ? (stateOfReference(context, written) ?? written) : written);
  const above = bound(condition.above);
  const below = bound(condition.below);

  // An unset or unreadable bound is no bound, as in Home Assistant's dashboards.
  return (
    (condition.above === undefined ||
      condition.above === null ||
      Number.isNaN(above) ||
      above < value) &&
    (condition.below === undefined ||
      condition.below === null ||
      Number.isNaN(below) ||
      below > value)
  );
}

function judgeCoreNumericState(
  condition: VisibilityCondition,
  context: VisibilityContext,
): boolean | undefined {
  const above = coreBound(condition.above, context);
  const below = coreBound(condition.below, context);
  if (above === null || below === null) return undefined;
  if (above === undefined && below === undefined) return undefined;

  return judgeEach(condition, context, (stateObj) => {
    const value = Number(stateObj.state);
    if (stateObj.state === '' || Number.isNaN(value)) return undefined;
    return (above === undefined || above < value) && (below === undefined || value < below);
  });
}

/**
 * A core bound: a number, a number written as text, or an entity whose state is one.
 *
 * @returns The bound, undefined for none, or null where it cannot be read
 */
function coreBound(written: unknown, context: VisibilityContext): number | undefined | null {
  if (written === undefined || written === null) return undefined;
  if (typeof written === 'number') return Number.isFinite(written) ? written : null;
  if (typeof written !== 'string') return null;
  const direct = Number(written);
  if (written.trim() !== '' && !Number.isNaN(direct)) return direct;
  if (!ENTITY_ID.test(written)) return null;
  const state = stateOf(context, written)?.state;
  const value = Number(state);
  return state === undefined || state === '' || Number.isNaN(value) ? null : value;
}

//-----------------------------------------------------------------------------
// TIME
//-----------------------------------------------------------------------------

/**
 * The time zone a `time` condition reads, as Home Assistant's `checkTimeInRange` chooses it:
 * Home Assistant's own where the profile says to use the server's, else the browser's.
 *
 * @param hass - Home Assistant
 * @returns An IANA zone name
 */
export function conditionTimeZone(hass: Types.Hass | null | undefined): string {
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (hass?.locale?.time_zone === 'server' && hass.config?.time_zone) {
    return wallFormat(hass.config.time_zone) ? hass.config.time_zone : browser;
  }
  return browser;
}

const WALL_FORMATS = new Map<string, Intl.DateTimeFormat | null>();

/** A formatter reading the wall clock in a zone, or null for a zone the browser does not know. */
function wallFormat(zone: string): Intl.DateTimeFormat | null {
  let format = WALL_FORMATS.get(zone);
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
      });
    } catch {
      format = null;
    }
    WALL_FORMATS.set(zone, format);
  }
  return format;
}

/** The wall clock in a zone at a moment. */
interface Wall {
  year: number;
  /** 0 for January, as `Date` counts. */
  month: number;
  day: number;
  /** 0 for Sunday. */
  weekday: number;
  /** The wall clock read as though it were UTC, whole seconds. */
  asUtc: number;
}

function wallAt(zone: string, instant: number): Wall {
  const format = wallFormat(zone) ?? wallFormat('UTC')!;
  const part: Record<string, string> = {};
  for (const { type, value } of format.formatToParts(instant)) part[type] = value;
  const year = Number(part.year);
  const month = Number(part.month) - 1;
  const day = Number(part.day);
  return {
    year,
    month,
    day,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part.weekday),
    asUtc: Date.UTC(year, month, day, Number(part.hour), Number(part.minute), Number(part.second)),
  };
}

/** A zone's offset from UTC at a moment, in milliseconds. */
function offsetAt(zone: string, instant: number): number {
  const whole = instant - (((instant % 1000) + 1000) % 1000);
  return wallAt(zone, whole).asUtc - whole;
}

/**
 * The moment a zone's wall clock reads a time on a date.
 *
 * A time the clock skips is the moment as far past the skip as the time was into it, and a time
 * the clock reads twice is the first of the two: how Home Assistant's `time` condition resolves
 * both whenever the browser runs in the zone it reads, which is always the case unless the
 * profile asks for the server's zone from a browser elsewhere.
 *
 * @param zone - IANA zone
 * @param year - Year
 * @param month - Month, 0 for January
 * @param day - Day of the month
 * @param ms - Milliseconds into the day
 * @returns Epoch milliseconds
 */
export function zonedInstant(
  zone: string,
  year: number,
  month: number,
  day: number,
  ms: number,
): number {
  const wall = Date.UTC(year, month, day) + ms;
  const before = offsetAt(zone, wall - DAY_MS);
  const after = offsetAt(zone, wall + DAY_MS);
  const reads = (instant: number): boolean => instant + offsetAt(zone, instant) === wall;
  const candidates = [wall - before, wall - after].filter(reads);
  return candidates.length > 0 ? Math.min(...candidates) : wall - before;
}

/**
 * A time of day as Home Assistant accepts it, `HH:MM` or `HH:MM:SS` (`isValidTimeString`).
 *
 * @param value - As written
 * @returns Milliseconds into the day, or null where it is not a time
 */
export function parseTimeOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) {
    return null;
  }
  const [hours, minutes, seconds = 0] = parts.map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/** Whether a time is written at all: Home Assistant treats an empty string as none. */
function written(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * A `time` condition: on the weekdays listed, if any, and between `after` and `before`, both
 * included, where a span whose `before` comes first runs past midnight.
 *
 * A time that is not a time hides the entry; Home Assistant's editor never writes one.
 *
 * @param condition - The condition
 * @param context - What it is judged against
 * @returns True or false
 */
function judgeTime(condition: VisibilityCondition, context: VisibilityContext): boolean {
  const zone = conditionTimeZone(context.hass);
  const now = context.now;
  const today = wallAt(zone, now);

  const weekdays = asList(condition.weekdays);
  if (weekdays && weekdays.length > 0 && !weekdays.includes(WEEKDAYS[today.weekday])) {
    return false;
  }

  const hasAfter = written(condition.after);
  const hasBefore = written(condition.before);
  if (!hasAfter && !hasBefore) return true;

  const afterMs = hasAfter ? parseTimeOfDay(condition.after) : null;
  const beforeMs = hasBefore ? parseTimeOfDay(condition.before) : null;
  if ((hasAfter && afterMs === null) || (hasBefore && beforeMs === null)) return false;

  const at = (ms: number): number => zonedInstant(zone, today.year, today.month, today.day, ms);
  const after = afterMs === null ? undefined : at(afterMs);
  const before = beforeMs === null ? undefined : at(beforeMs);

  if (after !== undefined && before !== undefined) {
    return before < after ? now >= after || now <= before : now >= after && now <= before;
  }
  return after !== undefined ? now >= after : now <= before!;
}

//-----------------------------------------------------------------------------
// LOCATION
//-----------------------------------------------------------------------------

/** A registry entry, as far as resolving a `location` target reads it. */
interface RegistryEntity {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  labels?: ReadonlyArray<string>;
}

interface RegistryDevice {
  id: string;
  area_id?: string | null;
  parent_device_id?: string | null;
  labels?: ReadonlyArray<string>;
}

interface RegistryArea {
  area_id: string;
  floor_id?: string | null;
  labels?: ReadonlyArray<string>;
}

/** The person entity each user was last found as (`cachedUserPerson` in Home Assistant). */
const personOfUser = new Map<string, string>();

/** An entity id's domain: what comes before the first dot (`computeDomain`). */
function domainOf(entityId: string): string {
  return entityId.slice(0, entityId.indexOf('.'));
}

/**
 * The persons Home Assistant has registered. Read from the entity registry rather than by walking
 * every state, as Home Assistant's `getUserPerson` does, so the card can keep skipping renders for
 * states it does not read; a person is always registered.
 */
function personIds(hass: Types.Hass | null | undefined): string[] {
  return Object.keys(hass?.entities ?? {}).filter((id) => domainOf(id) === 'person');
}

/**
 * The person of the user viewing the dashboard (`getUserPerson`).
 *
 * @param hass - Home Assistant
 * @returns Its state, or undefined where the user has none
 */
function viewerPerson(hass: Types.Hass | null | undefined): Types.HassEntity | undefined {
  const userId = hass?.user?.id;
  if (!userId) return undefined;
  const cached = personOfUser.get(userId);
  if (cached) {
    const stateObj = hass?.states?.[cached];
    if (stateObj?.attributes?.user_id === userId) return stateObj;
  }
  for (const id of personIds(hass)) {
    const stateObj = hass?.states?.[id];
    if (stateObj?.attributes?.user_id === userId) {
      personOfUser.set(userId, id);
      return stateObj;
    }
  }
  return undefined;
}

/** The person's state while a zone is the one it shows: `home`, or the zone's name. */
function activeZoneState(hass: Types.Hass | null | undefined, zoneId: string): unknown {
  const stateObj = hass?.states?.[zoneId];
  if (!stateObj || stateObj.attributes?.passive) return undefined;
  return zoneId === 'zone.home' ? 'home' : stateObj.attributes?.friendly_name;
}

const TARGET_KEYS = ['entity_id', 'device_id', 'area_id', 'floor_id', 'label_id'];

function isIdList(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((id) => typeof id === 'string'))
  );
}

/** A target Home Assistant can resolve: target keys to ids, and an `exclude` of the same. */
function isTarget(value: unknown, allowExclude = true): value is VisibilityCondition {
  return (
    isRecord(value) &&
    Object.entries(value).every(([key, ids]) =>
      key === 'exclude'
        ? allowExclude && isTarget(ids, false)
        : TARGET_KEYS.includes(key) && isIdList(ids),
    )
  );
}

function idsOf(value: unknown): string[] {
  return (asList(value) ?? []) as string[];
}

/**
 * The zones a target names, directly or through a device, area, floor or label, as Home
 * Assistant's `resolveEntityIDs` resolves it with a zone-only selector: a device or area counts
 * only where it holds a zone; a device reached through an area gives only its zones that have no
 * area of their own; a device named directly brings its child devices along.
 *
 * Every zone in the registry passes the selector, stateless or not, as Home Assistant gives each
 * one a placeholder state while resolving. Its `exclude` is resolved without the selector, which
 * gives the same zones, as a device or area without a zone gives none either way.
 */
function resolveZoneTarget(
  target: VisibilityCondition,
  entities: ReadonlyArray<RegistryEntity>,
  devices: Readonly<Record<string, RegistryDevice>>,
  areas: ReadonlyArray<RegistryArea>,
): Set<string> {
  const found = new Set(idsOf(target.entity_id));
  const deviceIds = new Set(idsOf(target.device_id));
  const areaIds = new Set(idsOf(target.area_id));
  const direct = new Set(deviceIds);

  const isZone = (entity: RegistryEntity): boolean => domainOf(entity.entity_id) === 'zone';
  const holdsZone = (deviceId: string): boolean =>
    entities.some((entity) => entity.device_id === deviceId && isZone(entity));
  // A device in an area: its own, or its parent's where it has none (`devicesInEffectiveArea`).
  const inArea = (areaId: string): RegistryDevice[] =>
    Object.values(devices).filter((device) =>
      device.area_id
        ? device.area_id === areaId
        : !!device.parent_device_id && devices[device.parent_device_id]?.area_id === areaId,
    );
  const areaHoldsZone = (areaId: string): boolean =>
    inArea(areaId).some((device) => holdsZone(device.id)) ||
    entities.some((entity) => entity.area_id === areaId && isZone(entity));

  for (const label of idsOf(target.label_id)) {
    for (const area of areas) {
      if (area.labels?.includes(label) && areaHoldsZone(area.area_id)) areaIds.add(area.area_id);
    }
    for (const device of Object.values(devices)) {
      if (device.labels?.includes(label) && holdsZone(device.id)) deviceIds.add(device.id);
    }
    for (const entity of entities) {
      if (entity.labels?.includes(label) && isZone(entity)) found.add(entity.entity_id);
    }
  }
  for (const floor of idsOf(target.floor_id)) {
    for (const area of areas) {
      if (area.floor_id === floor && areaHoldsZone(area.area_id)) areaIds.add(area.area_id);
    }
  }

  const notViaArea = new Set(deviceIds);
  for (const areaId of areaIds) {
    for (const device of inArea(areaId)) if (holdsZone(device.id)) deviceIds.add(device.id);
    for (const entity of entities) {
      if (entity.area_id === areaId && isZone(entity)) found.add(entity.entity_id);
    }
  }
  for (const device of Object.values(devices)) {
    if (device.parent_device_id && direct.has(device.parent_device_id)) {
      deviceIds.add(device.id);
      notViaArea.add(device.id);
    }
  }
  for (const deviceId of deviceIds) {
    for (const entity of entities) {
      if (entity.device_id !== deviceId || !isZone(entity)) continue;
      if (notViaArea.has(deviceId) || !entity.area_id) found.add(entity.entity_id);
    }
  }
  return found;
}

/** Zones per target, kept while the registries they were resolved from stay the same objects. */
const zonesByTarget = new WeakMap<
  object,
  { entities: unknown; devices: unknown; areas: unknown; zones: string[] }
>();

/**
 * The zones a `location` condition's target names that have a state now
 * (`resolveLocationZones`).
 *
 * @param hass - Home Assistant, for its registries and states
 * @param target - A valid target
 * @returns Zone entity ids
 */
function locationZones(hass: Types.Hass | null | undefined, target: VisibilityCondition): string[] {
  const cached = zonesByTarget.get(target);
  let zones = cached?.zones;
  if (
    !cached ||
    cached.entities !== hass?.entities ||
    cached.devices !== hass?.devices ||
    cached.areas !== hass?.areas
  ) {
    const entities = Object.values(hass?.entities ?? {});
    const devices = hass?.devices ?? {};
    const areas = Object.values(hass?.areas ?? {});
    const excluded = isRecord(target.exclude)
      ? resolveZoneTarget(target.exclude, entities, devices, areas)
      : new Set<string>();
    zones = [...resolveZoneTarget(target, entities, devices, areas)].filter(
      (id) => domainOf(id) === 'zone' && !excluded.has(id),
    );
    zonesByTarget.set(target, {
      entities: hass?.entities,
      devices: hass?.devices,
      areas: hass?.areas,
      zones,
    });
  }
  // Checked every time, so a zone that loses its state drops out and one that gains it counts.
  return (zones ?? []).filter((id) => hass?.states?.[id] !== undefined);
}

/**
 * A `location` condition: whether the person of the user viewing the dashboard is in one of the
 * zones it names (`checkLocationCondition`).
 *
 * `locations` lists the person's state as written, `away` matches `not_home`, and `target` names
 * zones. A person whose tracker reports which zones it is in (`in_zones`) matches any of them, or
 * with `match_mode: active_zone` only the one its state shows; one whose tracker does not
 * matches by its state alone.
 *
 * @param condition - The condition
 * @param context - What it is judged against
 * @returns Whether it holds
 */
function judgeLocation(condition: VisibilityCondition, context: VisibilityContext): boolean {
  const hass = context.hass;
  const person = viewerPerson(hass);
  if (!person) return false;

  const locations = condition.locations;
  if (locations !== undefined && locations !== null) {
    // Home Assistant calls `includes` on whatever is written, and anything else throws there.
    if (!Array.isArray(locations) && typeof locations !== 'string') return false;
    if (locations.includes(person.state)) return true;
  }
  if (condition.away === true && person.state === 'not_home') return true;
  if (!isTarget(condition.target)) return false;

  const zones = locationZones(hass, condition.target);
  const inZones = person.attributes?.in_zones;
  if (!Array.isArray(inZones) || inZones.length === 0) {
    // A zone may be named `not_home`, but that state means away.
    return (
      person.state !== 'not_home' &&
      zones.some((zoneId) => activeZoneState(hass, zoneId) === person.state)
    );
  }
  if (condition.match_mode === 'active_zone') {
    // Zone names need not be unique, so find the zone that set the state, not one of its name.
    const active = inZones.find(
      (zoneId) => typeof zoneId === 'string' && activeZoneState(hass, zoneId) === person.state,
    );
    return active !== undefined && zones.includes(active);
  }
  return inZones.some((zoneId) => zones.includes(zoneId));
}

/**
 * The states a `location` condition reads besides those the configuration names: every
 * registered person (to find the viewer's), every registered zone, `zone.home`, which is never
 * registered, and the zones the viewer's person is in, which may be unregistered YAML zones.
 *
 * @param hass - Home Assistant
 * @returns Entity ids
 */
export function locationEntityIds(hass: Types.Hass | null | undefined): string[] {
  const ids = Object.keys(hass?.entities ?? {}).filter((id) => {
    const domain = domainOf(id);
    return domain === 'person' || domain === 'zone';
  });
  ids.push('zone.home');
  const inZones = viewerPerson(hass)?.attributes?.in_zones;
  if (Array.isArray(inZones)) {
    for (const zoneId of inZones) if (typeof zoneId === 'string') ids.push(zoneId);
  }
  return ids;
}

//-----------------------------------------------------------------------------
// CORE
//-----------------------------------------------------------------------------

function isLogical(condition: VisibilityCondition): boolean {
  return typeof condition.condition === 'string' && LOGICAL.has(condition.condition);
}

function isReference(value: unknown): boolean {
  return typeof value === 'string' && isEntityReference(value);
}

/**
 * A dashboard-shaped `state` or `numeric_state` core would judge differently, which Home
 * Assistant keeps in the browser (`hasLegacyOnlySemantics`): an attribute read as text, or a
 * value or bound naming an entity.
 */
function readsAsDashboard(condition: VisibilityCondition): boolean {
  if (condition.condition === 'numeric_state') {
    return [condition.above, condition.below].some(isReference);
  }
  if (condition.attribute !== undefined) return true;
  return [...(asList(condition.state) ?? []), ...(asList(condition.state_not) ?? [])].some(
    isReference,
  );
}

/**
 * Whether core judges a condition rather than the browser (`isServerCondition`): anything but
 * `screen`, `user`, `time`, `view_columns` and `location`, and an `and`, `or` or `not` only where
 * everything under it is. A dashboard-shaped `state` or `numeric_state` goes too, unless it reads
 * as a dashboard (`readsAsDashboard`) or waits or templates (`needsCore`), which stays unknown.
 *
 * @param condition - As written
 * @returns True to ask core
 */
export function isServerCondition(condition: unknown): boolean {
  if (!isRecord(condition)) return false;
  if (isLogical(condition)) {
    return (asList(condition.conditions) ?? []).every((child) => isServerCondition(child));
  }
  if (!('condition' in condition)) return !needsCore(condition) && !readsAsDashboard(condition);
  const type = condition.condition;
  if (typeof type !== 'string' || CLIENT.has(type)) return false;
  if ((type === 'state' || type === 'numeric_state') && !('entity_id' in condition)) {
    return !needsCore(condition) && !readsAsDashboard(condition);
  }
  return true;
}

/** The keys core reads on every condition, carried across a translation (`pickRowConfig`). */
function rowConfig(condition: VisibilityCondition): VisibilityCondition {
  const row: VisibilityCondition = {};
  for (const key of ['alias', 'note', 'enabled']) {
    if (key in condition) row[key] = condition[key];
  }
  return row;
}

/** A condition core can parse that never holds: not(and of nothing). */
function never(): VisibilityCondition {
  return { condition: 'not', conditions: [{ condition: 'and', conditions: [] }] };
}

/**
 * A dashboard-shaped `state` or `numeric_state` naming no entity reads the calendar, as Home
 * Assistant's `addEntityToCondition` points one at the card's own entity.
 */
function withEntity(condition: VisibilityCondition, entityId: string): VisibilityCondition {
  if ('conditions' in condition && condition.conditions) {
    return {
      ...condition,
      conditions: (asList(condition.conditions) ?? []).map((child) =>
        isRecord(child) ? withEntity(child, entityId) : child,
      ),
    };
  }
  const type = condition.condition ?? 'state';
  if ((type === 'state' || type === 'numeric_state') && !('entity_id' in condition)) {
    return { ...condition, entity: condition.entity || entityId };
  }
  return condition;
}

/** A sentinel for a bound that can never be met. */
const UNMET = Symbol('unmet');

/**
 * A dashboard bound in core's terms (`translateNumericBound`): a number, an entity id, nothing
 * for a bound that is unreadable or always met, or `UNMET`.
 */
function coreBoundOf(
  written: unknown,
  side: 'above' | 'below',
): string | number | undefined | typeof UNMET {
  if (written === undefined || written === null) return undefined;
  const value = typeof written === 'number' ? written : Number(written);
  if (Number.isNaN(value)) {
    return typeof written === 'string' && ENTITY_ID.test(written) ? written : undefined;
  }
  if (!Number.isFinite(value)) return (side === 'above') === value > 0 ? UNMET : undefined;
  return value;
}

/**
 * A condition in core's shape, as Home Assistant sends it to `subscribe_condition`
 * (`translateToCoreCondition`): a dashboard `state` with `entity_id`, its `state_not` as a `not`,
 * a dashboard `not` as not(all of them), since core's `not` is not(any of them).
 *
 * @param condition - A condition `isServerCondition` accepts
 * @returns The condition core is asked about
 */
function toCore(condition: VisibilityCondition): VisibilityCondition {
  if (!('condition' in condition)) return toCoreState({ condition: 'state', ...condition });
  if (isLogical(condition)) {
    const row = rowConfig(condition);
    // No `conditions` at all holds.
    if (condition.conditions === undefined) return { ...row, condition: 'and', conditions: [] };
    const conditions = (asList(condition.conditions) ?? []).map((child) =>
      toCore(child as VisibilityCondition),
    );
    return condition.condition === 'not'
      ? { ...row, condition: 'not', conditions: [{ condition: 'and', conditions }] }
      : { ...row, condition: condition.condition, conditions };
  }
  if (condition.condition === 'state') return toCoreState(condition);
  if (condition.condition === 'numeric_state') return toCoreNumericState(condition);
  return condition;
}

function toCoreState(condition: VisibilityCondition): VisibilityCondition {
  if ('entity_id' in condition) return condition;
  const row = rowConfig(condition);
  if (!condition.entity || (condition.state === undefined && condition.state_not === undefined)) {
    return { ...row, ...never() };
  }
  const base = {
    condition: 'state',
    entity_id: condition.entity,
    ...(condition.attribute !== undefined ? { attribute: condition.attribute } : {}),
  };
  // `state` wins where both are written, as the dashboards read it.
  if (condition.state !== undefined) return { ...row, ...base, state: condition.state };
  return { ...row, condition: 'not', conditions: [{ ...base, state: condition.state_not }] };
}

function toCoreNumericState(condition: VisibilityCondition): VisibilityCondition {
  if ('entity_id' in condition) return condition;
  const row = rowConfig(condition);
  if (!condition.entity) return { ...row, ...never() };

  const above = coreBoundOf(condition.above, 'above');
  const below = coreBoundOf(condition.below, 'below');
  if (above === UNMET || below === UNMET) return { ...row, ...never() };

  const entity = JSON.stringify(condition.entity);
  if (above === undefined && below === undefined) {
    // The dashboards only ask for a number here; core wants a bound, so a template asks instead.
    return {
      ...row,
      condition: 'template',
      value_template:
        condition.attribute === undefined
          ? `{{ is_number(states(${entity})) }}`
          : `{{ is_number(state_attr(${entity}, ${JSON.stringify(condition.attribute)})) }}`,
    };
  }
  return {
    ...row,
    condition: 'numeric_state',
    entity_id: condition.entity,
    ...(condition.attribute !== undefined ? { attribute: condition.attribute } : {}),
    ...(above !== undefined ? { above } : {}),
    ...(below !== undefined ? { below } : {}),
  };
}

/**
 * The string naming what a core condition says, so two entries asking the same share one
 * subscription. JSON turns infinities into `null`, so they are added after it.
 */
function signatureOf(condition: VisibilityCondition): string {
  const infinite: string[] = [];
  const json = JSON.stringify(condition, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) infinite.push(String(value));
    return value;
  });
  return infinite.length > 0 ? `${json}|${infinite.join(',')}` : json;
}

/** One question for core: the key it is answered under, and the condition in core's shape. */
export interface CoreCondition {
  readonly key: string;
  readonly condition: VisibilityCondition;
}

/** Translations per condition object and calendar. */
const coreByCondition = new WeakMap<object, Map<string, CoreCondition>>();

function coreConditionOf(condition: VisibilityCondition, entityId: string): CoreCondition {
  let byEntity = coreByCondition.get(condition);
  if (!byEntity) {
    byEntity = new Map();
    coreByCondition.set(condition, byEntity);
  }
  let core = byEntity.get(entityId);
  if (!core) {
    const translated = toCore(withEntity(condition, entityId));
    core = { key: signatureOf(translated), condition: translated };
    byEntity.set(entityId, core);
  }
  return core;
}

/**
 * The key core answers a condition under.
 *
 * @param condition - A condition `isServerCondition` accepts
 * @param entityId - The calendar its entry draws
 * @returns The key
 */
export function coreKey(condition: VisibilityCondition, entityId: string): string {
  return coreConditionOf(condition, entityId).key;
}

/** The questions per list and calendar. */
const coreByList = new WeakMap<object, Map<string, ReadonlyArray<CoreCondition>>>();

/**
 * What one entry's conditions ask core: each condition core judges whose parent the browser
 * judges, skipping any that are switched off, as Home Assistant's `splitConditionTree` asks it.
 * Home Assistant asks once for all such siblings together; asking for each gives the same answers.
 *
 * @param conditions - A normalized list
 * @param entityId - The calendar the entry draws
 * @returns The questions, each once
 */
export function coreConditions(
  conditions: ReadonlyArray<unknown>,
  entityId: string,
): ReadonlyArray<CoreCondition> {
  let byEntity = coreByList.get(conditions);
  if (!byEntity) {
    byEntity = new Map();
    coreByList.set(conditions, byEntity);
  }
  const cached = byEntity.get(entityId);
  if (cached) return cached;

  const found = new Map<string, CoreCondition>();
  const visit = (list: ReadonlyArray<unknown>): void => {
    for (const condition of list) {
      if (!isRecord(condition) || isDisabled(condition)) continue;
      if (isServerCondition(condition)) {
        const core = coreConditionOf(condition, entityId);
        found.set(core.key, core);
        continue;
      }
      // A templated `enabled` on a node the browser judges leaves it unknown, and nothing under
      // it is asked.
      if ('enabled' in condition && typeof condition.enabled !== 'boolean') continue;
      if (isLogical(condition)) visit(asList(condition.conditions) ?? []);
    }
  };
  visit(conditions);

  const result = [...found.values()];
  byEntity.set(entityId, result);
  return result;
}

//-----------------------------------------------------------------------------
// WHAT TO WATCH
//-----------------------------------------------------------------------------

/** Every condition of a list, at any depth, including those `and`, `or` and `not` hold. */
function eachCondition(
  conditions: ReadonlyArray<unknown>,
  visit: (c: VisibilityCondition) => void,
) {
  for (const condition of conditions) {
    if (!isRecord(condition)) continue;
    visit(condition);
    const children = asList(condition.conditions);
    if (children && typeof condition.condition === 'string' && LOGICAL.has(condition.condition)) {
      eachCondition(children, visit);
    }
  }
}

/**
 * The media queries a list's `screen` conditions ask, to listen for.
 *
 * @param conditions - A normalized list
 * @returns The queries, each once
 */
export function visibilityMediaQueries(conditions: ReadonlyArray<unknown>): string[] {
  const queries = new Set<string>();
  eachCondition(conditions, (condition) => {
    if (condition.condition === 'screen' && typeof condition.media_query === 'string') {
      if (condition.media_query !== '') queries.add(condition.media_query);
    }
  });
  return [...queries];
}

/**
 * The next moment a list's `time` conditions can change their answer: an `after` reached, a
 * `before` passed, or midnight, when the day they are read on moves on.
 *
 * @param conditions - A normalized list
 * @param hass - Home Assistant, for the zone
 * @param now - Epoch milliseconds
 * @returns Epoch milliseconds after `now`, or null where the list has no `time` condition
 */
export function nextVisibilityChange(
  conditions: ReadonlyArray<unknown>,
  hass: Types.Hass | null | undefined,
  now: number,
): number | null {
  const times: VisibilityCondition[] = [];
  eachCondition(conditions, (condition) => {
    if (condition.condition === 'time') times.push(condition);
  });
  if (times.length === 0) return null;

  const zone = conditionTimeZone(hass);
  const today = wallAt(zone, now);
  const tomorrow = new Date(Date.UTC(today.year, today.month, today.day + 1));
  const on = (date: { year: number; month: number; day: number }, ms: number): number =>
    zonedInstant(zone, date.year, date.month, date.day, ms);
  const next = {
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth(),
    day: tomorrow.getUTCDate(),
  };

  // The first moment after `now` at which the clock reads `ms`, plus `past` to be beyond it.
  const upcoming = (ms: number, past: number): number => {
    const at = on(today, ms) + past;
    return at > now ? at : on(next, ms) + past;
  };

  const moments = [on(next, 0)];
  for (const condition of times) {
    const after = written(condition.after) ? parseTimeOfDay(condition.after) : null;
    const before = written(condition.before) ? parseTimeOfDay(condition.before) : null;
    if (after !== null) moments.push(upcoming(after, 0));
    // `before` is included, so the answer changes the millisecond after it.
    if (before !== null) moments.push(upcoming(before, 1));
  }
  return Math.min(...moments);
}

/**
 * The kinds of condition in a list that neither the card nor core judges, to warn about once:
 * one that is not a condition at all, and a dashboard-shaped one that waits (`for`) or templates
 * (`value_template`), which stays unknown (`needsCore`). Anything else the card judges or asks
 * core about; core reports what it cannot parse, and the card warns then.
 *
 * @param conditions - A normalized list
 * @returns The kinds, each once, as written; a condition that is not one reads as `malformed`
 */
export function unjudgedConditions(conditions: ReadonlyArray<unknown>): string[] {
  const kinds = new Set<string>();
  for (const condition of conditions) {
    if (!isRecord(condition)) {
      kinds.add('malformed');
      continue;
    }
    const type = 'condition' in condition ? condition.condition : 'state';
    if (typeof type !== 'string') {
      kinds.add('malformed');
    } else if (LOGICAL.has(type)) {
      const children = asList(condition.conditions);
      if (children) unjudgedConditions(children).forEach((kind) => kinds.add(kind));
    } else if (isServerCondition(condition)) {
      continue;
    } else if (condition.for !== undefined) {
      kinds.add(`${type} with for`);
    } else if (condition.value_template !== undefined) {
      kinds.add(`${type} with value_template`);
    }
  }
  return [...kinds];
}

//-----------------------------------------------------------------------------
// THE CARD'S ENTRIES
//-----------------------------------------------------------------------------

/** An entry under `entities`, as far as its visibility goes. */
type Entry = string | { entity: string; visibility?: ReadonlyArray<unknown> };

/** What the entries' conditions decide at one moment. */
export interface EntryVerdicts {
  /** Keys (`entryKey`) of the entries hidden now. */
  readonly hidden: ReadonlySet<string>;
  /** Calendars every entry of which is hidden now: as though they were not on the card. */
  readonly calendars: ReadonlySet<string>;
}

/** Nothing hidden: no conditions, or a card being edited, which shows every entry. */
export const NO_VERDICTS: EntryVerdicts = { hidden: new Set(), calendars: new Set() };

/**
 * Names an entry by its calendar and what its conditions say, never by the object holding them.
 *
 * Events carry the entry that admitted them (`_matchedConfig`), and keep it across a new
 * configuration that changes no entry, such as a new title: the object is then an old one, its
 * conditions the same. A condition naming no entity reads the calendar, so the calendar is part
 * of the name.
 *
 * @param entityId - The entry's calendar
 * @param conditions - Its normalized conditions
 * @returns The key
 */
export function entryKey(entityId: string, conditions: ReadonlyArray<unknown>): string {
  return `${entityId}\u0000${visibilitySignature(conditions)}`;
}

/**
 * Judges every entry of a card at one moment.
 *
 * @param entities - The card's normalized entries
 * @param context - What the conditions are judged against, without an entity
 * @returns The entries hidden, and the calendars all of whose entries are
 */
export function judgeEntries(
  entities: ReadonlyArray<Entry>,
  context: Omit<VisibilityContext, 'entityId'>,
): EntryVerdicts {
  const hidden = new Set<string>();
  const shownCalendars = new Set<string>();
  const calendars = new Set<string>();

  for (const entry of entities) {
    if (typeof entry === 'string') {
      shownCalendars.add(entry);
      continue;
    }
    const conditions = entry.visibility;
    if (!conditions || visibilityPasses(conditions, { ...context, entityId: entry.entity })) {
      shownCalendars.add(entry.entity);
      continue;
    }
    hidden.add(entryKey(entry.entity, conditions));
    calendars.add(entry.entity);
  }
  for (const id of shownCalendars) calendars.delete(id);

  return hidden.size === 0 ? NO_VERDICTS : { hidden, calendars };
}

/**
 * Whether two judgments hide the same entries and the same calendars, so a card can keep the one
 * it has and every memo keyed on it keeps its hits.
 *
 * @param a - One judgment
 * @param b - The other
 * @returns True when they hide the same
 */
export function sameVerdicts(a: EntryVerdicts, b: EntryVerdicts): boolean {
  if (a === b) return true;
  return sameSet(a.hidden, b.hidden) && sameSet(a.calendars, b.calendars);
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Whether an event's entry is hidden now.
 *
 * @param event - An event, stamped with the entry that admitted it
 * @param verdicts - The current judgment
 * @returns True to leave the event out
 */
export function entryHidden(
  event: { _entityId?: string; _matchedConfig?: { visibility?: ReadonlyArray<unknown> } },
  verdicts: EntryVerdicts,
): boolean {
  if (verdicts.hidden.size === 0) return false;
  const conditions = event._matchedConfig?.visibility;
  return (
    conditions !== undefined && verdicts.hidden.has(entryKey(event._entityId ?? '', conditions))
  );
}

/**
 * Whether an entry of the configuration is hidden now.
 *
 * @param entry - An entry under `entities`
 * @param verdicts - The current judgment
 * @returns True when its conditions hide it
 */
export function configEntryHidden(entry: Entry, verdicts: EntryVerdicts): boolean {
  if (verdicts.hidden.size === 0 || typeof entry === 'string' || !entry.visibility) return false;
  return verdicts.hidden.has(entryKey(entry.entity, entry.visibility));
}

/**
 * The media queries any entry's `screen` conditions ask.
 *
 * @param entities - The card's normalized entries
 * @returns The queries, each once
 */
export function entriesMediaQueries(entities: ReadonlyArray<Entry>): string[] {
  const queries = new Set<string>();
  for (const entry of entities) {
    if (typeof entry === 'string' || !entry.visibility) continue;
    for (const query of visibilityMediaQueries(entry.visibility)) queries.add(query);
  }
  return [...queries];
}

/**
 * What every entry's conditions ask core, each question once (`coreConditions`).
 *
 * @param entities - The card's normalized entries
 * @returns The core conditions by key
 */
export function entriesCoreConditions(
  entities: ReadonlyArray<Entry>,
): Map<string, VisibilityCondition> {
  const questions = new Map<string, VisibilityCondition>();
  for (const entry of entities) {
    if (typeof entry === 'string' || !entry.visibility) continue;
    for (const { key, condition } of coreConditions(entry.visibility, entry.entity)) {
      questions.set(key, condition);
    }
  }
  return questions;
}

/**
 * Whether any entry has a `location` condition, at any depth, switched off or not, which reads
 * states the configuration does not name (`locationEntityIds`).
 *
 * @param entities - The card's normalized entries
 * @returns True where one does
 */
export function entriesUseLocation(entities: ReadonlyArray<Entry>): boolean {
  let found = false;
  for (const entry of entities) {
    if (typeof entry === 'string' || !entry.visibility) continue;
    eachCondition(entry.visibility, (condition) => {
      if (condition.condition === 'location') found = true;
    });
    if (found) return true;
  }
  return false;
}

/**
 * The next moment any entry's `time` conditions can change their answer.
 *
 * @param entities - The card's normalized entries
 * @param hass - Home Assistant, for the zone
 * @param now - Epoch milliseconds
 * @returns Epoch milliseconds, or null where no entry has a `time` condition
 */
export function entriesNextChange(
  entities: ReadonlyArray<Entry>,
  hass: Types.Hass | null | undefined,
  now: number,
): number | null {
  let next: number | null = null;
  for (const entry of entities) {
    if (typeof entry === 'string' || !entry.visibility) continue;
    const at = nextVisibilityChange(entry.visibility, hass, now);
    if (at !== null && (next === null || at < next)) next = at;
  }
  return next;
}
