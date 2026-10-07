/**
 * Every font size is applied once along any chain of nested elements.
 *
 * A font size written relative to its parent (`1.5em`, `150%`, `larger`) is measured against
 * whatever font the parent ends up with. So when an element and one of its ancestors both
 * take their size from the same option, a relative value compounds. Through v4.2.0,
 * `event_font_size: 1.5em` was set on `.summary` and again on the `.event-title` inside it,
 * which drew titles at 2.25x while a text label beside them drew at 1.5x. The countdown
 * repeated `time_font_size` inside `.time`, and column view's own-row weather text repeated
 * `weather.event.font_size` inside its row. Grid view, new in v5, set the event size a third
 * time on the block, so its titles came out at 3.375x. A pixel size is the same at every
 * level, which is why every default rendered correctly and no gate noticed.
 *
 * This reconciles rather than lists, because the defect arrives as a new member of a family
 * nobody enumerates by hand (AGENTS.md, "Proximity is not reach"):
 *
 * - the family is every `font-size` declaration in the stylesheet that reads a custom
 *   property, plus every inline font size the renderer writes from an option, which is
 *   found by giving each option a sentinel value of its own;
 * - nesting is read off real rendered markup in all three views, across every placement the
 *   card draws, plus the attributes and classes the grid fitters and the title scroller add
 *   at runtime;
 * - the cascade is resolved per element, so a rule that loses to a more specific one does
 *   not count as applying;
 * - every declaration in the family has to be reached by that markup, so a rule the corpus
 *   does not draw fails here instead of passing unchecked;
 * - and every piece of text the corpus draws is pinned to the option that sizes it, so a
 *   declaration that goes missing, or text drawn outside the element it inherits its size
 *   from, fails as well.
 *
 * happy-dom cannot compute a cascade of relative font sizes, so this checks structure: which
 * element applies which option, and whether an ancestor already did. The rendered sizes,
 * measured in Chromium, are in the pull request that added this file.
 */

import { render as litRender } from 'lit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Render from '../src/rendering/render';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

//-----------------------------------------------------------------------------
// THE STYLESHEET
//-----------------------------------------------------------------------------

type Specificity = [number, number, number];

/** One `font-size` declaration, once for each selector in its rule's list. */
interface Declaration {
  /** One complex selector, a pseudo-element included. */
  selector: string;
  value: string;
  important: boolean;
  /** Position in the stylesheet, which breaks a specificity tie. */
  order: number;
  specificity: Specificity;
}

/** The stylesheet, comments stripped so prose cannot pass for a declaration. */
const STYLESHEET = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** Split a selector list at its top-level commas. */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const char = list[i];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts.filter((part) => part !== '');
}

/** Order two tuples the way the cascade does, most significant entry first. */
function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Selectors Level 4 specificity, for the selector shapes this stylesheet uses.
 *
 * `:is()`, `:not()` and `:has()` count their most specific argument and `:where()` counts
 * nothing, which is what the grid fitter's rules lean on.
 */
function specificity(selector: string): Specificity {
  const result: Specificity = [0, 0, 0];
  const add = ([a, b, c]: Specificity) => {
    result[0] += a;
    result[1] += b;
    result[2] += c;
  };
  const most = (list: string): Specificity =>
    splitList(list)
      .map(specificity)
      .reduce<Specificity>((best, next) => (compare(next, best) > 0 ? next : best), [0, 0, 0]);
  let i = 0;
  const name = (): string => {
    const match = /^-?[\w-]+/.exec(selector.slice(i));
    i += match ? match[0].length : 0;
    return match ? match[0].toLowerCase() : '';
  };
  const args = (): string | undefined => {
    if (selector[i] !== '(') return undefined;
    const start = i + 1;
    let depth = 0;
    for (; i < selector.length; i += 1) {
      if (selector[i] === '(') depth += 1;
      else if (selector[i] === ')' && (depth -= 1) === 0) break;
    }
    i += 1;
    return selector.slice(start, i - 1);
  };
  while (i < selector.length) {
    const char = selector[i];
    if (char === '#') {
      i += 1;
      name();
      result[0] += 1;
    } else if (char === '.') {
      i += 1;
      name();
      result[1] += 1;
    } else if (char === '[') {
      i = selector.indexOf(']', i) + 1;
      result[1] += 1;
    } else if (char === ':' && selector[i + 1] === ':') {
      i += 2;
      name();
      args();
      result[2] += 1;
    } else if (char === ':') {
      i += 1;
      const pseudo = name();
      const inner = args();
      if (['before', 'after', 'first-line', 'first-letter'].includes(pseudo)) result[2] += 1;
      else if (pseudo === 'where') continue;
      else if (['is', 'not', 'has', 'matches'].includes(pseudo) && inner !== undefined) {
        add(most(inner));
      } else if (/^nth-(last-)?child$/.test(pseudo) && inner?.includes(' of ')) {
        result[1] += 1;
        add(most(inner.slice(inner.indexOf(' of ') + 4)));
      } else {
        result[1] += 1;
        if ((pseudo === 'host' || pseudo === 'host-context') && inner !== undefined) {
          add(most(inner));
        }
      }
    } else if (/[A-Za-z_]/.test(char)) {
      name();
      result[2] += 1;
    } else {
      i += 1;
    }
  }
  return result;
}

/** Every `font-size` declaration in `css`, at any nesting depth, outside `@keyframes`. */
function fontDeclarations(css: string): Declaration[] {
  const out: Declaration[] = [];
  const open: Array<{ prelude: string; start: number }> = [];
  let last = 0;
  let order = 0;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === '{') {
      open.push({ prelude: css.slice(last, i).replace(/\s+/g, ' ').trim(), start: i + 1 });
      last = i + 1;
    } else if (char === '}') {
      const rule = open.pop();
      const inKeyframes = open.some(({ prelude }) => prelude.startsWith('@keyframes'));
      if (rule && !rule.prelude.startsWith('@') && !inKeyframes) {
        for (const text of css.slice(rule.start, i).split(';')) {
          const colon = text.indexOf(':');
          if (colon === -1 || text.slice(0, colon).trim() !== 'font-size') continue;
          const raw = text
            .slice(colon + 1)
            .replace(/\s+/g, ' ')
            .trim();
          const important = /!\s*important$/i.test(raw);
          order += 1;
          for (const selector of splitList(rule.prelude)) {
            out.push({
              selector,
              value: raw.replace(/\s*!\s*important$/i, ''),
              important,
              order,
              specificity: specificity(selector),
            });
          }
        }
      }
      last = i + 1;
    } else if (char === ';') {
      last = i + 1;
    }
  }
  return out;
}

/** The custom properties a value reads. */
function reads(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);
}

const DECLARATIONS = fontDeclarations(STYLESHEET);

/** The family: declarations whose size comes from a custom property. */
const FAMILY = DECLARATIONS.filter(({ value }) => reads(value).length > 0);

//-----------------------------------------------------------------------------
// THE OPTIONS
//-----------------------------------------------------------------------------

/** Every option path the shipped defaults describe that holds a string, or nothing yet. */
function stringPaths(source: Record<string, unknown>, parent?: string): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = parent === undefined ? key : `${parent}.${key}`;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return stringPaths(value as Record<string, unknown>, path);
    }
    return typeof value === 'string' || value === undefined ? [path] : [];
  });
}

/** Write `value` at an option path, creating the objects on the way. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const steps = path.split('.');
  let node = target;
  for (const step of steps.slice(0, -1)) {
    const next = node[step];
    node[step] = typeof next === 'object' && next !== null ? { ...next } : {};
    node = node[step] as Record<string, unknown>;
  }
  node[steps[steps.length - 1]] = value;
}

/** The option path behind each custom property that carries one verbatim, found by planting. */
const OPTION_OF_PROPERTY = (() => {
  const sentinel = '7301px';
  const found = new Map<string, string>();
  for (const path of stringPaths(Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)) {
    const config = JSON.parse(JSON.stringify(Config.DEFAULT_CONFIG)) as Record<string, unknown>;
    setPath(config, path, sentinel);
    const props = generateCustomPropertiesObject(config as unknown as Types.Config);
    for (const [property, value] of Object.entries(props)) {
      if (value === sentinel) found.set(property, path);
    }
  }
  return found;
})();

/** The options whose value some declaration in the family reads as a font size. */
const FAMILY_OPTIONS = [...new Set(FAMILY.flatMap(({ value }) => reads(value)))]
  .filter((property) => OPTION_OF_PROPERTY.has(property))
  .map((property) => OPTION_OF_PROPERTY.get(property)!)
  .sort();

/** A sentinel per family option, so an inline font size can be traced back to its option. */
const SENTINELS = new Map(FAMILY_OPTIONS.map((path, index) => [path, `${7311 + index}px`]));

/** The custom property each sentinel stands for. */
const PROPERTY_OF_SENTINEL = new Map(
  [...OPTION_OF_PROPERTY].flatMap(([property, path]) =>
    SENTINELS.has(path) ? [[SENTINELS.get(path)!, property] as const] : [],
  ),
);

//-----------------------------------------------------------------------------
// THE CASCADE
//-----------------------------------------------------------------------------

interface Candidate {
  source: string;
  value: string;
  reads: string[];
  important: boolean;
  inline: boolean;
  specificity: Specificity;
  order: number;
}

/** An element, or a pseudo-element of it. */
interface Box {
  element: Element;
  pseudo: string | null;
  winner: Candidate;
}

interface Analysis {
  /** Elements and pseudo-elements a font-size declaration reached. */
  boxes: Box[];
  /** Family selectors that matched at least once. */
  reached: Set<string>;
  /** An element sizing itself from a property an ancestor already sized from. */
  repeated: string[];
  /** An element sizing itself from one option inside an ancestor sized from another. */
  crossed: string[];
}

const PSEUDO_ELEMENT = /::?(before|after|first-line|first-letter|marker)$/i;

/**
 * A class or element name the subject of `selector` must carry, if one is plain enough to
 * read off. Only a speed-up: `matches` still decides, this just skips elements that cannot.
 */
function subjectKey(selector: string): { className?: string; type?: string } {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const char = selector[i];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && ' >+~'.includes(char)) start = i + 1;
  }
  // Drop functional pseudo-classes and attribute selectors, whose contents need not hold.
  let compound = selector.slice(start);
  while (/\([^()]*\)|\[[^[\]]*\]/.test(compound)) {
    compound = compound.replace(/\([^()]*\)|\[[^[\]]*\]/g, '');
  }
  const className = /\.(-?[\w-]+)/.exec(compound)?.[1];
  const type = /^[A-Za-z][\w-]*/.exec(compound)?.[0].toLowerCase();
  return { className, type };
}

/** A short, readable name for an element, such as `span.event-title`. */
function describeElement(element: Element): string {
  const classes = [...element.classList].join('.');
  return classes ? `${element.localName}.${classes}` : element.localName;
}

function describeBox(box: Pick<Box, 'element' | 'pseudo'>): string {
  return describeElement(box.element) + (box.pseudo ? `::${box.pseudo}` : '');
}

/** The options a set of custom properties carries. */
function optionsOf(properties: readonly string[]): string[] {
  return properties.filter((property) => OPTION_OF_PROPERTY.has(property));
}

/**
 * Resolve which font-size declaration wins on every element under `root`, then report every
 * element whose winner reads a custom property that an ancestor's winner also reads.
 */
function analyze(root: Element, declarations: readonly Declaration[], label: string): Analysis {
  const boxes: Box[] = [];
  const reached = new Set<string>();
  const ownBox = new Map<Element, Box>();
  const prepared = declarations.map((declaration) => {
    const pseudo = PSEUDO_ELEMENT.exec(declaration.selector);
    const origin = pseudo ? declaration.selector.slice(0, pseudo.index) : declaration.selector;
    return {
      declaration,
      origin,
      pseudo: pseudo ? pseudo[1].toLowerCase() : null,
      ...subjectKey(origin),
    };
  });

  for (const element of root.querySelectorAll('*')) {
    const candidates = new Map<string | null, Candidate[]>();
    const push = (pseudo: string | null, candidate: Candidate) =>
      candidates.set(pseudo, [...(candidates.get(pseudo) ?? []), candidate]);

    for (const { declaration, origin, pseudo, className, type } of prepared) {
      if (className !== undefined && !element.classList.contains(className)) continue;
      if (type !== undefined && element.localName !== type) continue;
      let matches: boolean;
      try {
        matches = element.matches(origin);
      } catch (error) {
        throw new Error(`cannot evaluate ${JSON.stringify(origin)}: ${String(error)}`);
      }
      if (!matches) continue;
      reached.add(declaration.selector);
      push(pseudo, {
        source: `${declaration.selector} { font-size: ${declaration.value} }`,
        value: declaration.value,
        reads: reads(declaration.value),
        important: declaration.important,
        inline: false,
        specificity: declaration.specificity,
        order: declaration.order,
      });
    }

    const style = (element as HTMLElement).style;
    const inline = style?.getPropertyValue('font-size').trim();
    if (inline) {
      const traced = PROPERTY_OF_SENTINEL.get(inline);
      push(null, {
        source: `style="font-size: ${inline}"`,
        value: inline,
        reads: [...reads(inline), ...(traced ? [traced] : [])],
        important: style.getPropertyPriority('font-size') === 'important',
        inline: true,
        specificity: [0, 0, 0],
        order: Infinity,
      });
    }

    for (const [pseudo, list] of candidates) {
      const rank = (candidate: Candidate) => [
        candidate.important ? 1 : 0,
        candidate.inline ? 1 : 0,
        ...candidate.specificity,
        candidate.order,
      ];
      const winner = list.reduce((best, next) =>
        compare(rank(next), rank(best)) > 0 ? next : best,
      );
      const box = { element, pseudo, winner };
      boxes.push(box);
      if (pseudo === null) ownBox.set(element, box);
    }
  }

  const repeated: string[] = [];
  const crossed: string[] = [];
  for (const box of boxes) {
    if (box.winner.reads.length === 0) continue;
    const ancestors: Element[] = [];
    for (
      let node: Element | null = box.pseudo ? box.element : box.element.parentElement;
      node && node !== root;
      node = node.parentElement
    ) {
      ancestors.push(node);
    }
    for (const ancestor of ancestors) {
      const outer = ownBox.get(ancestor);
      if (!outer || outer.winner.reads.length === 0) continue;
      const shared = box.winner.reads.filter((property) => outer.winner.reads.includes(property));
      const where = `${label}: ${describeBox(box)} inside ${describeBox(outer)}`;
      if (shared.length > 0) {
        repeated.push(`${where} both read ${shared.join(', ')}`);
        continue;
      }
      const inner = optionsOf(box.winner.reads);
      const around = optionsOf(outer.winner.reads);
      if (inner.length > 0 && around.length > 0) {
        crossed.push(`${where}: ${inner.join(', ')} is measured against ${around.join(', ')}`);
      }
    }
  }

  return { boxes, reached, repeated: [...new Set(repeated)], crossed: [...new Set(crossed)] };
}

//-----------------------------------------------------------------------------
// THE CORPUS
//-----------------------------------------------------------------------------

/** Local wall-clock times, which the unit project pins to UTC. */
function timed(
  day: number,
  from: string,
  to: string,
  summary: string,
  entity: string,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData {
  const at = (hhmm: string) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return new Date(2026, 5, day, hour, minute).toISOString();
  };
  return {
    start: { dateTime: at(from) },
    end: { dateTime: at(to) },
    summary,
    _entityId: entity,
    ...extra,
  };
}

function allDay(
  from: string,
  to: string,
  summary: string,
  entity: string,
): Types.CalendarEventData {
  return { start: { date: from }, end: { date: to }, summary, _entityId: entity };
}

const DETAILS = { location: '12 High Street', description: 'Bring the quarterly figures' };

/**
 * One calendar per label kind, and events chosen to draw every placement: a running event
 * for the progress bar, upcoming ones for the countdown, three overlapping for the grid's
 * overflow block, all-day ones for badges, pills and banners, and an empty day.
 */
const EVENTS: Types.CalendarEventData[] = [
  timed(17, '09:30', '11:00', 'Planning session', 'calendar.icon', DETAILS),
  timed(17, '14:00', '15:00', 'Upcoming review', 'calendar.image', DETAILS),
  timed(17, '14:00', '15:00', 'Overlapping call', 'calendar.emoji'),
  timed(17, '14:15', '15:15', 'Another overlap', 'calendar.text'),
  allDay('2026-06-17', '2026-06-18', 'Public holiday', 'calendar.text'),
  allDay('2026-06-18', '2026-06-20', 'Conference', 'calendar.emoji'),
  timed(18, '16:00', '17:00', 'Dentist', 'calendar.icon', DETAILS),
  timed(19, '10:00', '10:30', 'Delivery window', 'calendar.image'),
];

const BASE: Record<string, unknown> = {
  title: 'Family',
  days_to_show: 4,
  show_month: true,
  show_week_numbers: 'iso',
  show_location: true,
  show_description: true,
  show_countdown: true,
  show_progress_bar: true,
  show_empty_days: true,
  today_indicator: '🎯',
  weather: { entity: 'weather.home', position: 'both' },
  time_grid: { max_simultaneous_events: 2 },
  entities: [
    { entity: 'calendar.icon', label: 'mdi:star' },
    { entity: 'calendar.image', label: '/local/picture.png' },
    { entity: 'calendar.emoji', label: '🎉' },
    { entity: 'calendar.text', label: 'Work' },
  ],
};

const VIEWS = ['list', 'column', 'grid'] as const;

/** Options that change what is drawn, each on top of the base. */
const VARIANTS: Array<[string, Record<string, unknown>]> = [
  ['base', {}],
  ['no time', { show_time: false }],
  ['scrolling titles', { scroll_long_titles: true }],
  ['all-day badge', { allday_badge: 'time' }],
  ['all-day pill', { allday_badge: 'title' }],
];

/**
 * What the host writes after measuring, which no pure render produces. Each is drawn as its
 * own pass where it can occur, so a rule keyed on one of them is reached.
 */
const RUNTIME_STATES: Array<{
  name: string;
  applies: (view: (typeof VIEWS)[number], variant: string) => boolean;
  apply: (root: Element) => void;
}> = [
  { name: 'as rendered', applies: () => true, apply: () => undefined },
  ...['measuring', 'compact', 'blank', 'centered'].map((fit) => ({
    name: `grid title ${fit}`,
    applies: (view: string) => view === 'grid',
    apply: (root: Element) => {
      for (const block of root.querySelectorAll<HTMLElement>('.grid-event')) {
        block.dataset.gridTitleFit = fit;
      }
    },
  })),
  {
    name: 'grid time fitted',
    applies: (view) => view === 'grid',
    apply: (root) => {
      for (const disclosure of root.querySelectorAll('.grid-event-disclosure')) {
        disclosure.classList.add('grid-time-fits', 'grid-time-no-icon', 'grid-time-wrap');
      }
      for (const row of root.querySelectorAll('.grid-event-disclosure .location')) {
        row.classList.add('grid-event-detail-clipped');
      }
    },
  },
  {
    name: 'titles scrolling',
    applies: (_view, variant) => variant === 'scrolling titles',
    apply: (root) => {
      for (const title of root.querySelectorAll<HTMLElement>('.event-title.title-scrollable')) {
        title.classList.add('title-overflowing');
        title.dataset.titleMotion = 'a';
      }
      for (const summary of root.querySelectorAll('.summary-scroll')) {
        summary.setAttribute('data-scroll-labels', '');
      }
    },
  },
];

const HANDLERS = {
  keyDown: () => undefined,
  pointerDown: () => undefined,
  pointerMove: () => undefined,
  pointerUp: () => undefined,
  pointerCancel: () => undefined,
  pointerLeave: () => undefined,
  lostPointerCapture: () => undefined,
};

/**
 * The configuration for one view and variant, with every family option at its sentinel in
 * the effective configuration the renderer is handed. A view whose own defaults diverge
 * gets the sentinel inside its own block, since a top-level value does not reach it there.
 */
function corpusConfig(view: (typeof VIEWS)[number], variant: Record<string, unknown>) {
  const raw: Record<string, unknown> = JSON.parse(JSON.stringify({ ...BASE, ...variant, view }));
  for (const [path, sentinel] of SENTINELS) setPath(raw, path, sentinel);
  const blockKey = ViewConfig.VIEW_BLOCKS[view]?.blockKey;
  let config = buildConfig(raw as Partial<Types.Config>);
  for (const [path, sentinel] of SENTINELS) {
    const effective = ViewConfig.resolveEffectiveConfig(config, view) as unknown as Record<
      string,
      unknown
    >;
    if (!path.includes('.') && effective[path] !== sentinel && blockKey) {
      setPath(raw, `${String(blockKey)}.${path}`, sentinel);
      config = buildConfig(raw as Partial<Types.Config>);
    }
  }
  return config;
}

/** Render one view of the card, title included, the way the host does. */
function renderCard(view: (typeof VIEWS)[number], config: Types.Config): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const content =
    view === 'grid'
      ? Render.renderGridGroupedEvents(days, effective, 'en', WEATHER, null, FROZEN_NOW)
      : view === 'column'
        ? Render.renderColumnGroupedEvents(days, effective, 'en', WEATHER, null)
        : Render.renderGroupedEvents(days, effective, 'en', WEATHER, null);
  const container = document.createElement('div');
  litRender(
    Render.renderMainCardStructure(
      generateCustomPropertiesObject(effective),
      effective.title,
      content,
      HANDLERS,
    ),
    container,
  );
  return container;
}

interface Pass {
  label: string;
  view: (typeof VIEWS)[number];
  config: Types.Config;
  root: HTMLElement;
}

let PASSES: Pass[] = [];

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  PASSES = VIEWS.flatMap((view) =>
    VARIANTS.flatMap(([variant, overrides]) => {
      const config = corpusConfig(view, overrides);
      return RUNTIME_STATES.filter(({ applies }) => applies(view, variant)).map(
        ({ name, apply }) => {
          const root = renderCard(view, config);
          apply(root);
          return { label: `${view}, ${variant}, ${name}`, view, config, root };
        },
      );
    }),
  );
});

afterAll(() => {
  vi.useRealTimers();
});

const ANALYSES = new Map<readonly Declaration[], ReturnType<typeof analyzeAllUncached>>();

function analyzeAllUncached(declarations: readonly Declaration[]) {
  const runs = PASSES.map((pass) => ({ pass, ...analyze(pass.root, declarations, pass.label) }));
  return {
    runs,
    reached: new Set(runs.flatMap((run) => [...run.reached])),
    repeated: runs.flatMap((run) => run.repeated),
    crossed: runs.flatMap((run) => run.crossed),
  };
}

/** Run the analysis over every pass and merge the results, once per set of declarations. */
function analyzeAll(declarations: readonly Declaration[] = DECLARATIONS) {
  if (!ANALYSES.has(declarations)) ANALYSES.set(declarations, analyzeAllUncached(declarations));
  return ANALYSES.get(declarations)!;
}

/** A font size measured against the parent's: it defers to whatever sizes the parent. */
const RELATIVE_FONT_SIZE =
  /^(?:-?[\d.]+(?:em|ex|ch|cap|ic|lh|%)|larger|smaller|inherit|unset|revert|revert-layer)$/i;

/**
 * Which option sizes each piece of text the corpus draws, keyed by the element holding the
 * text and the nearest element with a class around it. The walk climbs past anything sized
 * relative to its parent, so a pill at 0.95em is sized by the option above it. Text that no
 * option reaches reads `the card`, and a size written into the stylesheet reads `fixed`.
 */
function sizedText(runs: ReturnType<typeof analyzeAll>['runs']): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const { pass, boxes } of runs) {
    const own = new Map(
      boxes.filter(({ pseudo }) => pseudo === null).map((box) => [box.element, box.winner]),
    );
    for (const element of pass.root.querySelectorAll('*')) {
      const drawsText = [...element.childNodes].some(
        (node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '',
      );
      if (!drawsText) continue;
      let sizedBy = 'the card';
      for (
        let node: Element | null = element;
        node && node !== pass.root;
        node = node.parentElement
      ) {
        const winner = own.get(node);
        if (!winner) continue;
        if (winner.reads.length > 0) {
          const options = optionsOf(winner.reads).map(
            (property) => OPTION_OF_PROPERTY.get(property)!,
          );
          sizedBy = (options.length > 0 ? options : winner.reads).join(' + ');
          break;
        }
        if (!RELATIVE_FONT_SIZE.test(winner.value)) {
          sizedBy = `fixed ${winner.value}`;
          break;
        }
      }
      let around = element.parentElement;
      while (around && around.classList.length === 0) around = around.parentElement;
      const key = `${element.classList[0] ?? element.localName} in ${around?.classList[0] ?? 'the card'}`;
      map.set(key, new Set([...(map.get(key) ?? []), sizedBy]));
    }
  }
  return Object.fromEntries(
    [...map].sort(([a], [b]) => a.localeCompare(b)).map(([key, set]) => [key, [...set].sort()]),
  );
}

//-----------------------------------------------------------------------------
// TESTS
//-----------------------------------------------------------------------------

describe('the matcher', () => {
  it.each<[string, Specificity]>([
    ['.summary', [0, 1, 0]],
    ['span.today-indicator.emoji', [0, 2, 1]],
    ['.summary-row > .event-weather > .event-weather-text', [0, 3, 0]],
    [':where(.summary-row) > .event-weather > .event-weather-text', [0, 2, 0]],
    ['.grid-axis-sizer span', [0, 1, 1]],
    [".grid-event:is([data-grid-title-fit='compact'], [data-x]) .summary", [0, 3, 0]],
    ['.grid-event-disclosure:where(.grid-time-fits) .summary', [0, 2, 0]],
    ['.summary:not(.summary-scroll):has(> .event-title:not(:only-child))', [0, 4, 0]],
    ['.time .time-actual .time-text > .time-countdown::before', [0, 4, 1]],
    ['#id .a', [1, 1, 0]],
  ])('gives %s a specificity of %j', (selector, expected) => {
    expect(specificity(selector)).toEqual(expected);
  });

  it('reads the declarations and the options it reconciles', () => {
    // The denominators, so an empty scan cannot pass anything below vacuously.
    expect(DECLARATIONS.length).toBeGreaterThan(FAMILY.length);
    expect(FAMILY.length).toBeGreaterThanOrEqual(15);
    expect(OPTION_OF_PROPERTY.size).toBeGreaterThan(30);

    // Every font-size option reaches CSS through a declaration in the family, so the family
    // is complete on the option side. Derived from the shipped defaults' own key names
    // rather than listed, so a new font-size option is covered the day it is added.
    const fontOptions = stringPaths(
      Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
    ).filter((path) => /(^|\.|_)font_size$/.test(path));
    expect(fontOptions.length).toBeGreaterThanOrEqual(11);
    expect(FAMILY_OPTIONS).toEqual(expect.arrayContaining(fontOptions));
  });

  it('draws a corpus large enough to mean something', () => {
    const { runs } = analyzeAll();
    for (const view of VIEWS) {
      const boxes = runs
        .filter(({ pass }) => pass.view === view)
        .reduce((total, run) => total + run.boxes.length, 0);
      expect(boxes, view).toBeGreaterThan(100);
    }
  });

  it('puts every family option at its sentinel in every pass', () => {
    // Otherwise an inline font size could not be traced to its option and would be judged as
    // applying nothing. Read from the configuration the renderer was handed.
    for (const { label, view, config } of PASSES) {
      const effective = ViewConfig.resolveEffectiveConfig(config, view) as unknown as Record<
        string,
        unknown
      >;
      for (const [path, sentinel] of SENTINELS) {
        const value = path
          .split('.')
          .reduce<unknown>(
            (node, step) =>
              typeof node === 'object' && node !== null
                ? (node as Record<string, unknown>)[step]
                : undefined,
            effective,
          );
        expect(value, `${label}: ${path}`).toBe(sentinel);
      }
    }
  });

  it('traces inline font sizes back to their options', () => {
    // The date leaves write their option's value inline as well as through the stylesheet,
    // and these are the options the renderer writes inline today. Pinned by value, so the
    // inline half is shown to be live, and a new inline writer, or one that goes, changes
    // this set and has to be looked at.
    const { runs } = analyzeAll();
    const traced = runs.flatMap(({ boxes }) =>
      boxes.filter(({ winner }) => winner.inline && winner.reads.length > 0),
    );
    const found = new Set(traced.flatMap(({ winner }) => winner.reads));

    expect(found).toEqual(
      new Set([
        '--calendar-card-font-size-weekday',
        '--calendar-card-font-size-day',
        '--calendar-card-font-size-month',
      ]),
    );
  });
});

describe('every font size is applied once along any chain of nested elements', () => {
  it('reaches every declaration in the family', () => {
    // A rule the corpus never draws is a rule this file cannot check. When this fails, draw
    // the element it styles: add a variant, an event or a runtime state above.
    const { reached } = analyzeAll();
    const unreached = FAMILY.map(({ selector }) => selector).filter(
      (selector) => !reached.has(selector),
    );

    expect(unreached).toEqual([]);
  });

  it('applies every property in the family somewhere', () => {
    const { runs } = analyzeAll();
    const applied = new Set(
      runs.flatMap(({ boxes }) => boxes.flatMap(({ winner }) => winner.reads)),
    );
    const family = new Set(FAMILY.flatMap(({ value }) => reads(value)));

    expect([...family].filter((property) => !applied.has(property))).toEqual([]);
  });

  it('never applies one where an ancestor already did', () => {
    // Each entry names the element, the ancestor that set the same size first, and the
    // property both read. Remove the inner declaration, unless something depends on that
    // element having its own size: .summary must keep the event size, because the label
    // icons, images and hanging indent are sized in em against it.
    expect(analyzeAll().repeated).toEqual([]);
  });

  it('never measures one option against another', () => {
    // A relative size is relative to the element's parent, so an option nested inside
    // another's element is measured against that option instead of the card's text: grid's
    // blocks once made a relative time_font_size a share of event_font_size, so the same
    // value drew differently in grid than in list. Every option is measured against the
    // text the card inherits.
    expect(analyzeAll().crossed).toEqual([]);
  });
});

describe('every piece of text is sized by its own option', () => {
  it('pins which option sizes each text the card draws', () => {
    // The other half of the check above. Applying an option once is not enough if it stops
    // reaching some text: a declaration that goes, like the axis label's, or an element
    // that inherits its size and is drawn outside the element it inherits from, like a
    // countdown outside .time, would leave that text at the card's size. Both change an
    // entry here. Pinned by value, so a new kind of text has to be added deliberately.
    expect(sizedText(analyzeAll().runs)).toEqual({
      'allday-badge in time-actual': ['time_font_size'],
      'allday-title-pill in event-title': ['event_font_size'],
      'calendar-label in summary': ['event_font_size'],
      'card-header in header-container': ['title_font_size'],
      'day in column-date-content': ['day_font_size'],
      'day in date-column': ['day_font_size'],
      'event-title in summary': ['event_font_size'],
      'event-title-scroll in event-title': ['event_font_size'],
      'grid-axis-label in grid-axis': ['time_font_size'],
      'grid-banner-title in event': ['event_font_size'],
      'grid-event-overflow-label in event': ['time_font_size'],
      'month in column-date-content': ['month_font_size'],
      'month in date-column': ['month_font_size'],
      'span in description': ['description_font_size'],
      'span in event-weather-text': ['weather.event.font_size'],
      'span in grid-axis-sizer': ['time_font_size'],
      'span in location': ['location_font_size'],
      'span in time-actual': ['time_font_size'],
      'span in time-text': ['time_font_size'],
      'time-countdown in time': ['time_font_size'],
      'time-countdown in time-text': ['time_font_size'],
      'time-end in time-actual': ['time_font_size'],
      'time-end in time-text': ['time_font_size'],
      'today-indicator in today-indicator-container': ['today_indicator_size'],
      'weather-temp-high in weather': ['weather.date.font_size'],
      'week-number in column-week-number': ['week_number_font_size'],
      'week-number in week-number-cell': ['week_number_font_size'],
      'weekday in column-date-content': ['weekday_font_size'],
      'weekday in date-column': ['weekday_font_size'],
    });
  });
});

describe('the check can fail', () => {
  // Each control plants one declaration or element. Detection is asserted on the planted
  // result itself, and the cascade's "adds nothing" on the difference from the shipped
  // stylesheet's findings, so a real regression fails the assertions above and not these.
  const planted = (selector: string, value: string, important = false): Declaration => ({
    selector,
    value,
    important,
    order: DECLARATIONS.length + 1,
    specificity: specificity(selector),
  });
  const EVENT = 'var(--calendar-card-font-size-event)';

  /** What planting `extra` adds to the findings for the shipped stylesheet. */
  function added(...extra: Declaration[]): string[] {
    const base = analyzeAll().repeated;
    return analyzeAll([...DECLARATIONS, ...extra]).repeated.filter(
      (entry) => !base.includes(entry),
    );
  }

  it('catches the event size declared again on the title, in every view', () => {
    // The v4.2.0 shape, planted back.
    const { repeated } = analyzeAll([...DECLARATIONS, planted('.event-title', EVENT)]);
    const title = repeated.filter((entry) => entry.includes('span.event-title inside'));

    for (const view of VIEWS) {
      expect(
        title.some((entry) => entry.startsWith(`${view},`)),
        view,
      ).toBe(true);
    }
  });

  it('catches a size declared on a pseudo-element inside its own element', () => {
    const { repeated } = analyzeAll([
      ...DECLARATIONS,
      planted('.time .time-countdown::before', 'var(--calendar-card-font-size-time)'),
    ]);

    expect(
      repeated.some((entry) => entry.includes('.time-countdown::before inside div.time')),
    ).toBe(true);
  });

  it('catches an inline font size nested inside its own option', () => {
    // Wrap a day number in an element sized inline from the same option.
    const root = renderCard('list', corpusConfig('list', {}));
    const day = root.querySelector('.day')!;
    const wrapper = document.createElement('div');
    wrapper.style.setProperty('font-size', SENTINELS.get('day_font_size')!);
    day.replaceWith(wrapper);
    wrapper.append(day);

    expect(analyze(root, DECLARATIONS, 'planted').repeated).toContain(
      'planted: div.day inside div both read --calendar-card-font-size-day',
    );
  });

  it('catches an option measured against another', () => {
    // The grid block's old event size, planted back.
    const { crossed } = analyzeAll([...DECLARATIONS, planted('.grid-event', EVENT)]);

    expect(crossed.some((entry) => entry.includes('div.time inside div.event.grid-event'))).toBe(
      true,
    );
  });

  it('does not count a declaration that loses the cascade', () => {
    // A more specific inherit beats the planted rule, and so does a later one of equal
    // specificity, so neither plant adds anything; !important beats the more specific one.
    const title = planted('.event-title', EVENT);
    const inherits = planted('.summary > .event-title', 'inherit');
    const later = { ...planted('.event-title', 'inherit'), order: title.order + 1 };

    expect(added(title, inherits)).toEqual([]);
    expect(added(title, later)).toEqual([]);
    expect(
      analyzeAll([...DECLARATIONS, { ...title, important: true }, inherits]).repeated.some(
        (entry) => entry.includes('span.event-title inside'),
      ),
    ).toBe(true);
  });

  it('notices text an option no longer reaches', () => {
    // The axis label's own declaration, outranked by a plant that sizes it from nothing,
    // and a hardcoded size on the countdown: two different ways for text to stop following
    // its option, each changing its own entry and nothing else.
    const shipped = sizedText(analyzeAll().runs);
    const changed = (...extra: Declaration[]) => {
      const now = sizedText(analyzeAll([...DECLARATIONS, ...extra]).runs);
      return Object.fromEntries(
        Object.entries(now).filter(
          ([key, value]) => JSON.stringify(shipped[key]) !== JSON.stringify(value),
        ),
      );
    };

    expect(changed(planted('.grid-axis .grid-axis-label', 'inherit'))).toEqual({
      'grid-axis-label in grid-axis': ['the card'],
    });
    expect(changed(planted('.time .time-countdown', '12px'))).toEqual({
      'time-countdown in time': ['fixed 12px'],
      'time-countdown in time-text': ['fixed 12px'],
    });
  });
});
