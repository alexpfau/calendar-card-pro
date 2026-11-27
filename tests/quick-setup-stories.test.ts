/**
 * Quick Setup's stories are copies of the docs (backlog item 188), so each is reconciled with
 * the first YAML block on its page: the shell against the YAML without `type`, `config_version`
 * and `entities`, and the palette against the documented calendars' accent colors, in order, with
 * the shared-plan color moved last, behind at least four others (`stories.ts` says why).
 * Editing a story on one side alone fails here, in either direction.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { CURRENT_CONFIG_VERSION } from '../src/config/config';
import { buildQuickSetupConfig, initialAnswers } from '../src/rendering/editor/quick-setup';
import { STORIES } from '../src/rendering/editor/stories';

/**
 * The first YAML block on a docs page, or under the heading its fragment names, parsed.
 *
 * @param page - Page path from the site's root, with a heading's fragment where it has one
 * @returns The block's configuration
 */
function documentedCard(page: string): Record<string, unknown> {
  const [path, fragment] = page.split('#');
  const markdown = readFileSync(resolve(__dirname, '..', 'docs', `${path.slice(1)}.md`), 'utf8');
  let from = 0;
  if (fragment !== undefined) {
    // The site's slug: emoji and punctuation dropped, words joined by hyphens.
    const slug = (heading: string): string =>
      heading
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
    const heading = [...markdown.matchAll(/^#{2,3} (.*)$/gm)].find(
      (match) => slug(match[1]) === fragment,
    );
    if (heading === undefined) throw new Error(`no heading #${fragment} on ${path}`);
    from = heading.index;
  }
  const block = /^```yaml\n([\s\S]*?)^```$/m.exec(markdown.slice(from));
  if (block === null) throw new Error(`no YAML block on ${page}`);
  return parse(block[1]) as Record<string, unknown>;
}

/**
 * A documented card's calendar colors, each once, in the order its page lists them.
 *
 * @param card - The card as its page documents it
 * @returns The colors
 */
function colorsOf(card: Record<string, unknown>): string[] {
  const colors = (card.entities as Array<Record<string, unknown>>)
    .map((entry) => entry.accent_color)
    .filter((color): color is string => typeof color === 'string');
  return [...new Set(colors)];
}

/** The Family Hub's colors, which a page with fewer than four of its own continues with. */
const HUB_COLORS = colorsOf(documentedCard('/guide/family-calendar'));

describe.each(STORIES.map((story) => [story.id, story] as const))('%s', (_id, story) => {
  const documented = documentedCard(story.page);

  it('is the card its page documents, without its calendars', () => {
    const { type, config_version, entities, ...shell } = documented;

    expect(type).toBe('custom:calendar-card-pro');
    // Usage's Your First Card, Simple Agenda's, is the README's quick start, which states none.
    if (story.id !== 'simple_agenda') expect(config_version).toBe(CURRENT_CONFIG_VERSION);
    expect(Array.isArray(entities)).toBe(true);
    expect(story.shell()).toEqual(shell);
  });

  it('carries its calendars’ colors, in the order its page lists them, the shared-plan color last', () => {
    const shared = documented.duplicate_accent_color as string | undefined;
    const listed = colorsOf(documented);
    if (shared === undefined || !listed.includes(shared)) {
      expect(story.palette).toEqual(listed);
      return;
    }
    const others = listed.filter((color) => color !== shared);
    for (const color of HUB_COLORS) {
      if (others.length >= 4) break;
      if (color !== shared && !others.includes(color)) others.push(color);
    }

    expect(story.palette).toEqual([...others, shared]);
    // Never the color of one of the first four calendars Quick Setup colors.
    expect(story.palette.indexOf(shared)).toBeGreaterThanOrEqual(4);
  });

  it('hands out a fresh shell every time', () => {
    const first = story.shell();
    first.title = 'changed';
    for (const value of Object.values(first)) {
      if (value !== null && typeof value === 'object') (value as Record<string, unknown>).x = 1;
    }

    expect(story.shell()).toEqual(documentedShell(documented));
  });
});

function documentedShell(documented: Record<string, unknown>): Record<string, unknown> {
  const shell = { ...documented };
  delete shell.type;
  delete shell.config_version;
  delete shell.entities;
  return shell;
}

it('offers Simple Agenda, then the six stories that work without per-calendar filters', () => {
  expect(STORIES.map((story) => story.id)).toEqual([
    'simple_agenda',
    'family_hub',
    'small_card_big_picture',
    'now_and_next',
    'today_and_tomorrow',
    'birthdays_and_holidays',
    'house_log',
  ]);
});

describe('the visual editor page’s Quick Setup example', () => {
  // `docs/features/editor.md` prints what Quick Setup writes when it starts from Birthdays &
  // Holidays on two calendars. It is a copy of the story too, one step removed, and drifted once
  // already: it kept an `event_tap_action` line that Quick Setup has never written since taps
  // open an event by default.
  it('is exactly what Quick Setup writes for Birthdays & Holidays on two calendars', () => {
    const markdown = readFileSync(
      resolve(__dirname, '..', 'docs', 'features', 'editor.md'),
      'utf8',
    );
    // Matched across any line break, so reflowing the prose cannot fail this.
    const from = markdown.search(
      /Starting from Birthdays & Holidays on two calendars\s+writes this:/,
    );
    expect(from, 'the example’s introduction moved').toBeGreaterThan(-1);
    const block = /^```yaml\n([\s\S]*?)^```$/m.exec(markdown.slice(from));
    expect(block, 'no YAML block after the introduction').not.toBeNull();
    const printed = parse((block as RegExpExecArray)[1]) as Record<string, unknown>;

    const opening = {
      type: 'custom:calendar-card-pro',
      entities: ['calendar.birthdays', 'calendar.holidays'],
    };
    const answers = initialAnswers(opening, 'birthdays_and_holidays', {});
    expect(buildQuickSetupConfig(opening, answers)).toEqual(printed);
  });
});
