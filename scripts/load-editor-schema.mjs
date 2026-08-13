#!/usr/bin/env node
/**
 * Loads the editor's schema modules as real JavaScript.
 *
 * `check-i18n.mjs` reconciles the editor's string table against the fields that use
 * it, and the only honest way to know what a panel references is to build its schema
 * and look. Everything under `src/rendering/editor/` except the element and its
 * stylesheet is deliberately free of Lit and of the DOM for exactly this reason, so
 * bundling the schema half and importing it needs no browser and no build step of the
 * project's own.
 *
 * esbuild is already a devDependency — it is what Rollup transpiles with — so this
 * costs nothing in shipped bytes. AGENTS.md's bundle rule governs `dependencies`.
 *
 * The alternative, scraping the source with regexes, is what the check used to do to
 * the old editor and is what the rebuild exists to stop needing: a schema is data, so
 * it can be read rather than parsed out of the text that produces it.
 */

import { build } from 'esbuild';

/**
 * Bundles a set of named exports from the editor and returns the live module.
 *
 * @param root - Repository root
 * @returns The bundled module's exports
 */
export async function loadEditorModule(root) {
  const result = await build({
    stdin: {
      contents: `
        export { PANELS, walkSchema } from './src/rendering/editor/panels.js';
        export { panelSubforms, chassisSubforms, CHASSIS_STRINGS } from './src/rendering/editor/subforms.js';
        export { EDITOR_STRINGS } from './src/rendering/editor/strings.js';
        export { EDITOR_LANGUAGE_STRINGS } from './src/rendering/editor/translations/index.js';
        export { humanize, lookup, qualifiedKey } from './src/rendering/editor/localize.js';
        export { SYNTHETIC_FIELDS } from './src/rendering/editor/synthetic.js';
        export { DEFAULT_CONFIG } from './src/config/config.js';
        export { VIEWS, VIEW_SCOPE, ENTITY_VIEW_SCOPE, DEFAULT_OVERRIDES_BY_VIEW } from './src/config/view.js';
      `,
      resolveDir: root,
      sourcefile: 'check-i18n-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    // `node`, not `neutral`, purely so that package resolution works — the schema half
    // of the editor imports `@mdi/js` for its icons, and `neutral` resolves no package
    // conditions at all. Nothing bundled here touches a Node API.
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  });

  const code = result.outputFiles[0].text;

  // Imported as a data URL rather than written to disk, so the check leaves nothing
  // behind and cannot race a concurrent run.
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
