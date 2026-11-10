/**
 * Quick Setup's stories are copies of the docs (backlog item 188), so each is reconciled with
 * the first YAML block on its page: the shell against the YAML without `type`, `config_version`
 * and `entities`, and the palette against the documented calendars' accent colors, in order.
 * Editing a story on one side alone fails here, in either direction.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { STORIES } from '../src/rendering/editor/stories';

/**
 * The first YAML block on a docs page, parsed.
 *
 * @param page - Page path from the site's root
 * @returns The block's configuration
 */
function documentedCard(page: string): Record<string, unknown> {
  const markdown = readFileSync(resolve(__dirname, '..', 'docs', `${page.slice(1)}.md`), 'utf8');
  const block = /^```yaml\n([\s\S]*?)^```$/m.exec(markdown);
  if (block === null) throw new Error(`no YAML block on ${page}`);
  return parse(block[1]) as Record<string, unknown>;
}

describe.each(STORIES.map((story) => [story.id, story] as const))('%s', (_id, story) => {
  const documented = documentedCard(story.page);

  it('is the card its page documents, without its calendars', () => {
    const { type, config_version, entities, ...shell } = documented;

    expect(type).toBe('custom:calendar-card-pro');
    expect(config_version).toBe(5);
    expect(Array.isArray(entities)).toBe(true);
    expect(story.shell()).toEqual(shell);
  });

  it('carries its calendars’ colors, in the order its page lists them', () => {
    const colors = (documented.entities as Array<Record<string, unknown>>)
      .map((entry) => entry.accent_color)
      .filter((color): color is string => typeof color === 'string');

    expect(story.palette).toEqual([...new Set(colors)]);
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

it('offers the four stories that work without per-calendar filters, in this order', () => {
  expect(STORIES.map((story) => story.id)).toEqual([
    'family_hub',
    'now_and_next',
    'today_and_tomorrow',
    'birthdays_and_holidays',
  ]);
});
