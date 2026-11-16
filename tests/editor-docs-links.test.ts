/**
 * Each editor page's Documentation link (backlog item 307). The helpers under the settings say
 * only what is not obvious, and the page's foot links to the rest, so every address in
 * `docs-pages.ts` has to open a page and heading the site publishes.
 *
 * The addresses are reconciled against `docs/` read here, not against a list: a renamed heading
 * fails this file the day it is renamed. The anchors follow the site's slugify, as
 * `docs/.vitepress/config.mts` defines it and `scripts/check-docs.mjs` mirrors it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { type MountedEditor, goEntry, goPage, keysOf, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { PAGE_DOCS, docsUrl } from '../src/rendering/editor/docs-pages';
import { PAGES } from '../src/rendering/editor/pages';
import { DOCS_SITE } from '../src/rendering/editor/stories';

const DOCS = join(__dirname, '..', 'docs');

/** The site's slugify, after its decorations (emoji, keycaps) are stripped. */
function slugify(text: string): string {
  return text
    .replace(/[0-9]\uFE0F?\u20E3/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0E\uFE0F]/gu, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** The anchors a page's headings make, fenced YAML comments left out. */
function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let fenced = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6} (.*)$/.exec(line);
    if (heading === null) continue;
    const base = slugify(heading[1].trim());
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

/**
 * Why a site path does not resolve, or `undefined` where it does.
 *
 * @param path - `/features/weather#anchor`
 * @returns The reason
 */
function unresolved(path: string): string | undefined {
  const [page, anchor] = path.split('#');
  const file = join(DOCS, `${page}.md`);
  if (!page.startsWith('/') || page.includes('development/') || !existsSync(file)) {
    return `${path}: no page publishes at ${page}`;
  }
  if (anchor !== undefined && !anchorsOf(file).has(anchor)) {
    return `${path}: #${anchor} is not a heading on that page`;
  }
  return undefined;
}

describe('the Documentation link', () => {
  let editor: MountedEditor | undefined;
  afterEach(() => {
    editor?.remove();
    editor = undefined;
  });

  it('has an address for every section page, a calendar entry and the pages under More', () => {
    expect(Object.keys(PAGE_DOCS).sort()).toEqual(
      [...PAGES.map((page) => page.id), 'entry', 'audit', 'notices'].sort(),
    );
  });

  it('opens a page and heading the site publishes, for every page', () => {
    // The resolver can say no: a missing heading and a missing page both fail it.
    expect(unresolved('/features/weather#no-such-heading')).toBeDefined();
    expect(unresolved('/features/no-such-page')).toBeDefined();
    const wrong = Object.values(PAGE_DOCS).map(unresolved).filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it('is an absolute address on the site', () => {
    expect(DOCS_SITE).toBe('https://calendar-card-pro.alexpfau.com');
    for (const page of Object.keys(PAGE_DOCS) as Array<keyof typeof PAGE_DOCS>) {
      expect(docsUrl(page)).toBe(`${DOCS_SITE}${PAGE_DOCS[page]}`);
    }
  });

  it('sits at the foot of a section page and an entry page, opening in a new tab', async () => {
    editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    const link = () =>
      editor!.shadowRoot!.querySelector<HTMLAnchorElement>('.page-foot .docs-link');
    for (const page of PAGES.filter((each) => each.onlyIn === undefined)) {
      await goPage(editor, page.id);
      expect(link()?.getAttribute('href'), page.id).toBe(docsUrl(page.id));
    }
    expect(link()?.textContent?.trim()).toBe('Documentation');
    expect(link()?.getAttribute('target')).toBe('_blank');
    expect(link()?.getAttribute('rel')).toBe('noopener noreferrer');

    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(link()?.getAttribute('href')).toBe(docsUrl('entry'));
  });
});
