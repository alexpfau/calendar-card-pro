/**
 * Reads the worked examples out of the walkthrough pages, so a test can run the card a page
 * publishes rather than a copy of it.
 *
 * 🚨 **The pages are the fixtures.** A second copy of a card in a test file is one more thing
 * to keep in step, and the bug being guarded against is precisely that a page and the code,
 * or two pages, drift apart. A copy would keep passing while the published page went wrong.
 *
 * The parser understands only the subset the pages use: flat card-level keys, one level of
 * nesting for a block such as `list:` or `time_grid:`, and an `entities:` block sequence of
 * flat mappings. It is deliberately not a YAML implementation, and it rejects rather than
 * guesses: a line that fits none of those shapes is an error, not something to skip.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from 'vitest';

export const GRID_GUIDE = join(__dirname, '..', 'docs', 'guide', 'family-calendar.md');
export const AGENDA_GUIDE = join(__dirname, '..', 'docs', 'guide', 'one-calendar-many-purposes.md');

export type GuideBlock = Record<string, string | number | boolean>;

export interface GuideCard {
  config: Record<string, unknown>;
  entities: GuideBlock[];
}

/** `'11:00'` -> `11:00`, `false` -> `false`, `3` -> `3`. Quotes are the page's, not data. */
function scalar(raw: string): string | number | boolean {
  const value = raw
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^'(.*)'$/, '$1')
    .replace(/^"(.*)"$/, '$1');
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

/** Every ```yaml block on a page, in order. */
function yamlBlocks(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  return (text.match(/^```ya?ml\n[\s\S]*?^```/gm) || []).map((b) =>
    b.replace(/^```ya?ml\n/, '').replace(/```$/, ''),
  );
}

/**
 * The page's card: the one complete example, card-level lines and blocks together.
 *
 * A page may carry partial YAML too — the grid page's adaptation of the work calendar is a
 * bare `entities:` fragment — so the card is the block that starts with its `type:`, and
 * there must be exactly one.
 */
export function readGuideCard(path: string): GuideCard {
  const cards = yamlBlocks(path).filter((b) => /^type:\s*custom:calendar-card-pro$/m.test(b));
  expect(cards, `${path} should contain exactly one complete card example`).toHaveLength(1);

  const config: Record<string, unknown> = {};
  const entities: GuideBlock[] = [];
  let inEntities = false;
  let nested: Record<string, unknown> | null = null;

  for (const line of cards[0].split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;

    // A key at the left margin always belongs to the card, which is also what ends the
    // `entities:` list when card-level keys follow it, as `time_grid:` does on the grid page.
    if (/^entities:\s*$/.test(line)) {
      inEntities = true;
      nested = null;
      continue;
    }
    const open = line.match(/^([a-z_]+):\s*$/);
    if (open) {
      inEntities = false;
      nested = {};
      config[open[1]] = nested;
      continue;
    }
    const top = line.match(/^([a-z_]+):\s*(.+)$/);
    if (top) {
      inEntities = false;
      nested = null;
      config[top[1]] = scalar(top[2]);
      continue;
    }

    if (inEntities) {
      const item = line.match(/^\s*-\s+([a-z_]+):\s*(.+)$/);
      if (item) {
        entities.push({ [item[1]]: scalar(item[2]) });
        continue;
      }
      const field = line.match(/^\s+([a-z_]+):\s*(.+)$/);
      if (field) {
        expect(entities.length, `a field appeared before any entity: ${line}`).toBeGreaterThan(0);
        entities[entities.length - 1][field[1]] = scalar(field[2]);
        continue;
      }
    } else if (nested) {
      const inner = line.match(/^\s+([a-z_]+):\s*(.+)$/);
      if (inner) {
        nested[inner[1]] = scalar(inner[2]);
        continue;
      }
    }
    throw new Error(`${path} uses a yaml shape this reader does not handle: ${line}`);
  }

  config.entities = entities;
  return { config, entities };
}

export interface GuideCalendarRow {
  calendar: string;
  holds: string;
  blocks: number;
}

/**
 * The `Calendar | Holds | Blocks` table under the page's `Calendars & Event Blocks` heading.
 *
 * Read by its header rather than by position, and required to have rows, so a reworded
 * heading or a reshaped table fails here instead of yielding an empty list that every
 * comparison below would then agree with.
 */
export function readGuideCalendarTable(path: string): GuideCalendarRow[] {
  const text = readFileSync(path, 'utf8');
  const section = text.split(/^## .*Calendars & Event Blocks\s*$/m)[1]?.split(/^## /m)[0];
  expect(section, `${path} has no "Calendars & Event Blocks" section`).toBeDefined();

  const lines = (section as string).split('\n').filter((l) => l.startsWith('|'));
  const cells = (l: string) =>
    l
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
  expect(cells(lines[0] ?? '|'), `${path}: unexpected calendar table header`).toEqual([
    'Calendar',
    'Holds',
    'Blocks',
  ]);

  const rows = lines.slice(2).map((l) => {
    const [calendar, holds, blocks] = cells(l);
    return { calendar: calendar.replace(/`/g, ''), holds, blocks: Number(blocks) };
  });
  expect(rows.length, `${path}: the calendar table has no rows`).toBeGreaterThan(0);
  return rows;
}
