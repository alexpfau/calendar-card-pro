#!/usr/bin/env node
/**
 * Loads the editor's schema modules as real JavaScript.
 *
 * `check-i18n.mjs` reconciles the editor's string table against the fields that use it.
 * The editor schema is DOM-free, so this can bundle and import it without a browser.
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
    // `node` enables package resolution for schema icon imports; the bundle uses no Node API.
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  });

  const code = result.outputFiles[0].text;

  // Import as a data URL so the check writes no generated file.
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
