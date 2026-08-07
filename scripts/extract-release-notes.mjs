#!/usr/bin/env node
/**
 * Extract the release-notes section for a given version out of docs/RELEASE_NOTES.md.
 *
 * docs/RELEASE_NOTES.md is the curated, human-reviewed source of truth for what ships
 * in a release. The release workflow feeds this script's stdout straight into the
 * GitHub release body, so the notes maintainers actually wrote are the notes users
 * actually read — no copy-paste step, no divergence between the two.
 *
 * The file is a reverse-chronological list of sections, each shaped like:
 *
 *   # Calendar Card Pro v3.2.0
 *   ...body...
 *   ---
 *   # Calendar Card Pro v3.1.0
 *
 * Usage:
 *   node scripts/extract-release-notes.mjs v3.2.1
 *   node scripts/extract-release-notes.mjs 3.2.1     # leading "v" optional
 *
 * Exits non-zero when the requested version has no section, so a release can never
 * silently ship with empty or wrong notes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HEADING = /^#\s+Calendar Card Pro\s+v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/;

/**
 * Split the notes file into sections, in file order.
 *
 * @param {string} markdown Full contents of docs/RELEASE_NOTES.md.
 * @returns {Array<{ version: string, body: string }>} Parsed sections.
 */
export function parseSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      if (current) sections.push(current);
      current = { version: match[1], lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);

  return sections.map((section) => ({
    version: section.version,
    body: trimSection(section.lines),
  }));
}

/**
 * Drop the trailing `---` separator that divides one release from the next, plus any
 * surrounding blank lines. The separator is a file-level formatting artifact and has no
 * place in a standalone GitHub release body.
 *
 * @param {string[]} lines Raw lines of a single section, heading included.
 * @returns {string} Cleaned section body.
 */
function trimSection(lines) {
  const out = [...lines];
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  if (out.length && out[out.length - 1].trim() === '---') out.pop();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}

/**
 * Look up a single release section by version.
 *
 * @param {string} markdown Full contents of docs/RELEASE_NOTES.md.
 * @param {string} version Version to find, with or without a leading `v`.
 * @returns {string} The matching section body.
 * @throws {Error} When no section matches or the section has no content.
 */
export function extractNotes(markdown, version) {
  const wanted = String(version).trim().replace(/^v/, '');
  const sections = parseSections(markdown);
  const hit = sections.find((section) => section.version === wanted);

  if (!hit) {
    const known = sections.map((s) => `v${s.version}`).join(', ') || '(none found)';
    throw new Error(
      `No release notes found for v${wanted} in docs/RELEASE_NOTES.md.\n` +
        `Add a "# Calendar Card Pro v${wanted}" section before tagging.\n` +
        `Sections present: ${known}`,
    );
  }

  if (!hit.body.split('\n').slice(1).join('\n').trim()) {
    throw new Error(`Release notes section for v${wanted} is empty.`);
  }

  return hit.body;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/extract-release-notes.mjs <version>');
    process.exit(2);
  }

  const notesPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'docs',
    'RELEASE_NOTES.md',
  );

  try {
    process.stdout.write(extractNotes(readFileSync(notesPath, 'utf8'), version) + '\n');
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
