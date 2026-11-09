/**
 * Quick Setup's answers, and the configuration they build (backlog item 188).
 *
 * Quick Setup starts a card from one of the Example Stories (`stories.ts`) and asks the few
 * things a story cannot know: the title, the calendars, the weather entity, and whether the
 * toolbar and the two tap actions are wanted. The story replaces the card's look; the answers
 * replace only the leaves they name, so a story's toolbar and weather settings survive a "yes".
 *
 * 🚨 The configuration is built **sparse** and then minimized with itself as the authored
 * baseline: `toStoredConfig(merged, keys(desired), desired)`. Handing it a merged object as its
 * own baseline would write every default into the YAML; minimizing against nothing would drop
 * a story line that happens to equal a default.
 *
 * Every build starts from the configuration as it was when Quick Setup opened, never from a
 * preview Home Assistant has echoed back, so removing a calendar and adding it again brings
 * back the blocks it had.
 *
 * Free of Lit and the DOM, like every editor module but the element and its styles.
 */

import { type Story, type StoryId, storyById } from './stories';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/** What Quick Setup has been told. */
export interface QuickSetupAnswers {
  readonly story: StoryId;
  /** The card's title; empty for none. */
  readonly title: string;
  /** Calendar entity ids, in the order the card lists them. */
  readonly calendars: ReadonlyArray<string>;
  /** The weather entity; empty for no weather. */
  readonly weather: string;
  readonly toolbar: boolean;
  /** A tap on an event opens it in the card's popover. */
  readonly eventDetails: boolean;
  /** A tap on a day adds an event there. */
  readonly dayAdds: boolean;
}

/** The view blocks, from the registry rather than named here. */
const VIEW_BLOCK_KEYS: ReadonlyArray<string> = Object.values(ViewConfig.VIEW_BLOCKS).map(
  (block) => block.blockKey as string,
);

/**
 * Whether the card owns a key, so a story replaces it rather than leaving it be.
 *
 * Everything else belongs to Home Assistant or to the user (`grid_options`, `view_layout`,
 * `visibility`, `card_mod`) and is kept exactly as it was. A key beginning with an underscore
 * is the card picker's own annotation, not a setting, and goes.
 *
 * @param key - Top-level key
 * @returns `true` when Quick Setup decides this key
 */
function ownedByCard(key: string): boolean {
  return (
    key.startsWith('_') ||
    key === 'config_version' ||
    VIEW_BLOCK_KEYS.includes(key) ||
    Object.prototype.hasOwnProperty.call(Config.DEFAULT_CONFIG, key) ||
    Object.prototype.hasOwnProperty.call(Config.DEPRECATED_CONFIG_MAP, key)
  );
}

/**
 * The calendars a configuration lists, each once, in the order it first lists them.
 *
 * @param config - Configuration as the YAML holds it
 * @returns Calendar entity ids
 */
export function calendarsOf(config: Readonly<Record<string, unknown>>): string[] {
  const entries = Array.isArray(config.entities) ? config.entities : [];
  const ids = entries
    .map((entry) => Synthetic.entityIdOf(entry as string | Types.EntityConfig))
    .filter((id) => typeof id === 'string' && id !== '');
  return [...new Set(ids)];
}

/**
 * A story's starting answers for a card.
 *
 * The title and calendars come from the card. The weather entity is the card's own, else for a
 * story that shows weather the home's only one, else none. The toolbar and the taps come from
 * the story.
 *
 * @param opening - The configuration as Quick Setup found it
 * @param storyId - The story picked
 * @param states - Home Assistant's `hass.states`, for the home's weather entity
 * @returns The answers to start from
 */
export function initialAnswers(
  opening: Readonly<Record<string, unknown>>,
  storyId: StoryId,
  states: unknown,
): QuickSetupAnswers {
  const story = storyById(storyId);
  const shell = story.shell();
  const ownWeather = Helpers.isConfigBlock(opening.weather) ? opening.weather.entity : undefined;
  const storyWeather = Helpers.isConfigBlock(shell.weather);

  return {
    story: storyId,
    title: textOf(opening.title) || textOf(shell.title),
    calendars: calendarsOf(opening),
    weather: textOf(ownWeather) || (storyWeather ? (Config.findWeatherEntity(states) ?? '') : ''),
    toolbar: Helpers.isConfigBlock(shell.toolbar) && shell.toolbar.show === true,
    eventDetails: actionOf(shell.event_tap_action) === 'details',
    dayAdds: actionOf(shell.day_tap_action) === 'add-event',
  };
}

/**
 * A story's answers after the user picks another story, keeping what they told Quick Setup
 * about this card: its title, calendars and weather entity.
 *
 * @param previous - The answers so far
 * @param storyId - The story now picked
 * @param opening - The configuration as Quick Setup found it
 * @param states - Home Assistant's `hass.states`
 * @returns The answers for the new story
 */
export function answersForStory(
  previous: QuickSetupAnswers | undefined,
  storyId: StoryId,
  opening: Readonly<Record<string, unknown>>,
  states: unknown,
): QuickSetupAnswers {
  const fresh = initialAnswers(opening, storyId, states);
  if (previous === undefined) return fresh;

  const previousStory = initialAnswers(opening, previous.story, states);
  return {
    ...fresh,
    // A title the user typed stays; one that only came from the previous story follows the story.
    title: previous.title === previousStory.title ? fresh.title : previous.title,
    calendars: previous.calendars,
    weather: previous.weather === previousStory.weather ? fresh.weather : previous.weather,
  };
}

/**
 * The calendars that would take a color from the story.
 *
 * A calendar takes one when none of its blocks in the card as Quick Setup found it carries an
 * `accent_color`; `null` and an empty string count as none. Colors are handed out in order and
 * stop when the story runs out, so the rest keep the color they would have had anyway.
 *
 * @param opening - The configuration as Quick Setup found it
 * @param answers - What Quick Setup has been told
 * @returns Each calendar given a color, with the color, in order
 */
export function storyColors(
  opening: Readonly<Record<string, unknown>>,
  answers: QuickSetupAnswers,
): Array<{ calendar: string; color: string }> {
  const palette = storyById(answers.story).palette;
  const given: Array<{ calendar: string; color: string }> = [];

  for (const calendar of answers.calendars) {
    if (given.length >= palette.length) break;
    if (blocksOf(opening, calendar).some((entry) => hasColor(entry))) continue;
    given.push({ calendar, color: palette[given.length] });
  }

  return given;
}

/**
 * The configuration Quick Setup writes, as the editor would store it.
 *
 * @param opening - The configuration as Quick Setup found it, as the YAML holds it
 * @param answers - What Quick Setup has been told
 * @returns The configuration to store
 */
export function buildQuickSetupConfig(
  opening: Readonly<Record<string, unknown>>,
  answers: QuickSetupAnswers,
): Record<string, unknown> {
  const story: Story = storyById(answers.story);
  const shell = story.shell();
  const desired: Record<string, unknown> = {};

  if (opening.type !== undefined) desired.type = structuredClone(opening.type);
  desired.config_version = Config.CURRENT_CONFIG_VERSION;

  const title = answers.title.trim();
  if (title !== '') desired.title = title;

  for (const [key, value] of Object.entries(shell)) {
    if (key === 'title' || VIEW_BLOCK_KEYS.includes(key)) continue;
    if (key === 'weather' || key === 'toolbar') continue;
    if (key === 'event_tap_action' || key === 'day_tap_action') continue;
    desired[key] = value;
  }

  const weather = answers.weather.trim();
  if (weather !== '') {
    desired.weather = {
      ...(Helpers.isConfigBlock(shell.weather) ? shell.weather : {}),
      entity: weather,
    };
  }

  if (answers.toolbar) {
    desired.toolbar = {
      ...(Helpers.isConfigBlock(shell.toolbar) ? shell.toolbar : {}),
      show: true,
    };
  }

  if (answers.eventDetails) desired.event_tap_action = { action: 'details' };
  if (answers.dayAdds) desired.day_tap_action = { action: 'add-event' };

  desired.entities = entitiesFor(opening, answers);

  for (const key of VIEW_BLOCK_KEYS) {
    if (shell[key] !== undefined) desired[key] = shell[key];
  }

  for (const [key, value] of Object.entries(opening)) {
    if (key !== 'type' && !ownedByCard(key)) desired[key] = structuredClone(value);
  }

  const merged = { ...Config.DEFAULT_CONFIG, ...desired } as unknown as Types.Config;
  return Value.toStoredConfig(merged, new Set(Object.keys(desired)), desired);
}

/**
 * The card's calendars, each with every block it had, and the story's colors.
 *
 * @param opening - The configuration as Quick Setup found it
 * @param answers - What Quick Setup has been told
 * @returns The `entities` to write
 */
function entitiesFor(
  opening: Readonly<Record<string, unknown>>,
  answers: QuickSetupAnswers,
): Array<string | Types.EntityConfig> {
  const colors = new Map(
    storyColors(opening, answers).map(({ calendar, color }) => [calendar, color]),
  );
  const entries: Array<string | Types.EntityConfig> = [];

  for (const calendar of answers.calendars) {
    const blocks = blocksOf(opening, calendar);
    const color = colors.get(calendar);
    for (const block of blocks.length > 0 ? blocks : [calendar]) {
      if (color === undefined) entries.push(structuredClone(block));
      else entries.push({ ...structuredClone(asObject(block)), accent_color: color });
    }
  }

  return entries;
}

/**
 * Every block a calendar has in a configuration, in order.
 *
 * @param config - Configuration as the YAML holds it
 * @param calendar - Calendar entity id
 * @returns Its blocks as written
 */
function blocksOf(
  config: Readonly<Record<string, unknown>>,
  calendar: string,
): Array<string | Types.EntityConfig> {
  const entries = Array.isArray(config.entities) ? config.entities : [];
  return (entries as Array<string | Types.EntityConfig>).filter(
    (entry) => Synthetic.entityIdOf(entry) === calendar,
  );
}

function asObject(entry: string | Types.EntityConfig): Types.EntityConfig {
  return typeof entry === 'string' ? { entity: entry } : entry;
}

function hasColor(entry: string | Types.EntityConfig): boolean {
  if (typeof entry === 'string' || entry === null || typeof entry !== 'object') return false;
  const color = (entry as unknown as Record<string, unknown>).accent_color;
  return color !== undefined && color !== null && color !== '';
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function actionOf(value: unknown): unknown {
  return Helpers.isConfigBlock(value) ? value.action : undefined;
}
