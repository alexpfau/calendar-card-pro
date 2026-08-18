#!/usr/bin/env node
/**
 * Writes `src/rendering/editor/translations/en-GB.json` from `strings.ts`.
 *
 * en-GB is generated rather than maintained. `scripts/check-i18n.mjs` recomputes the
 * same data and fails on any difference.
 *
 *   node scripts/generate-en-gb.mjs
 *
 * The derivation itself lives in `scripts/en-gb.mjs`.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveEnGb } from './en-gb.mjs';
import { loadEditorModule } from './load-editor-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'src/rendering/editor/translations/en-GB.json');

const { EDITOR_STRINGS } = await loadEditorModule(ROOT);
const derived = deriveEnGb(EDITOR_STRINGS);

// Refuse to write an empty generated file.
if (Object.keys(derived).length === 0) {
  console.error(
    '\n  FATAL: the substitution list produced no overrides at all.\n' +
      '  Either strings.ts no longer contains a single divergent spelling, or\n' +
      '  scripts/en-gb.mjs was broken. Refusing to write an empty file.\n',
  );
  process.exit(2);
}

writeFileSync(TARGET, `${JSON.stringify(derived, null, 2)}\n`, 'utf-8');

console.log(
  `Wrote ${Object.keys(derived).length} en-GB overrides ` +
    `from ${Object.keys(EDITOR_STRINGS).length} English strings.`,
);
