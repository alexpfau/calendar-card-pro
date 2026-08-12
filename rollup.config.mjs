import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import esbuild from 'rollup-plugin-esbuild';
import json from '@rollup/plugin-json';
import { readFileSync, rmSync } from 'fs';

// Use the existing NODE_ENV variable for both purposes
const isProd = process.env.NODE_ENV === 'prod';
// Use NODE_ENV to determine filename as well
const outputFilename = isProd ? 'calendar-card-pro.js' : 'calendar-card-pro-dev.js';

// Get version from package.json reliably
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

/**
 * Names an emitted chunk, in a namespace that is flat and shared.
 *
 * HACS writes every release asset directly into
 * `<config>/www/community/calendar-card-pro/` — it fetches no subdirectories — so these
 * filenames are the only handle anyone has on a chunk. Two things follow.
 *
 * **The editor is named for what it is.** Rollup names a chunk after its entry module,
 * which for the editor is `index.ts`: accurate, and useless to anyone reading a
 * directory listing or deleting a file to test the missing-chunk failure mode. Matched
 * on the module path rather than on the chunk name, so a future `index.ts` elsewhere
 * cannot quietly claim it.
 *
 * **Dev chunks keep the `-dev` suffix**, exactly as the entry and the custom element
 * names do. A dev build exists to run side by side with the HACS-installed release, and
 * its chunks land in the same flat directory — so without this, the dev build's main
 * chunk is `calendar-card-pro-<hash>.js`, which is indistinguishable from a production
 * one. Nothing would misload (each facade names its own chunk by hash), but the point of
 * the suffix is that a human can tell which build a file belongs to.
 *
 * @param chunk - Rollup's pre-render chunk info
 * @returns The filename pattern for the chunk
 */
function chunkFileName(chunk) {
  const isEditor = chunk.facadeModuleId?.replace(/\\/g, '/').endsWith('/rendering/editor/index.ts');
  const base = isEditor ? 'editor' : chunk.name;

  return `${base}${isProd ? '' : '-dev'}-[hash].js`;
}

export default {
  input: 'src/calendar-card-pro.ts',
  output: {
    dir: 'dist',
    format: 'es',
    // Use the dynamic filename based on NODE_ENV
    entryFileNames: outputFilename,
    // Content-hashed, and that is mandatory rather than stylistic. HACS serves
    // /hacsfiles/** with `max-age=2678400` (one month) and appends its `?hacstag=`
    // cache-buster to the *registered resource only* — a sibling chunk gets no query at
    // all, so a stable chunk name whose contents changed would be served from cache for
    // up to 31 days after an update. A new hash is simply a URL the cache has never
    // seen.
    chunkFileNames: chunkFileName,
    // Sourcemaps are deliberately disabled. Nothing publishes a .map: the release
    // workflow attaches `dist/*.js`, which does not match `*.js.map`, and HACS only
    // downloads what the release carries. Emitting one anyway leaves a sourceMappingURL
    // comment that every user's browser resolves to a 404 (#315, #358). Turning them on
    // means shipping the maps too, and is its own decision rather than a drive-by.
    sourcemap: false,
  },

  // Non-negotiable, and the one thing in this file that will break the card if removed.
  //
  // HACS registers the Lovelace resource with a `?hacstag=` query. A relative import
  // specifier resolves against the importing module's URL **with the query dropped**, so
  // if any emitted chunk imports back from the entry, the browser fetches the entry a
  // second time under a different URL and evaluates the whole card again — producing
  // `NotSupportedError: the name "calendar-card-pro" has already been used with this
  // registry`, a dead editor and a possibly dead card.
  //
  // 'strict' makes the entry a small facade that imports the real code from a hashed
  // chunk, so the code is only ever addressed by one URL. `scripts/check-bundle.mjs`
  // asserts this held, because the same trap was first met as a comment in another
  // card's config and a comment did not hold it.
  preserveEntrySignatures: 'strict',

  plugins: [
    // Chunk names carry a content hash, so a rebuild leaves the previous build's chunks
    // behind rather than overwriting them. That matters more than it used to: the
    // release workflow attaches `dist/*.js`, so a stale chunk from an earlier build
    // would be published as a release asset and downloaded by every user, and the dev
    // deploy copies whatever is in dist/ to Home Assistant.
    //
    // Here rather than in the npm script, so `npx rollup -c` and the watcher get it too.
    // `scripts/check-bundle.mjs` asserts the property this maintains — every emitted
    // file reachable from the entry — so a clean that silently stopped working is caught
    // rather than merely hoped for.
    {
      name: 'clean-dist',
      buildStart() {
        rmSync('dist', { recursive: true, force: true });
      },
    },
    replace({
      preventAssignment: true,
      delimiters: ['', ''],
      // Replace version placeholders in main header and constants.ts
      '@version vPLACEHOLDER': `@version ${version}`,
      "CURRENT: 'vPLACEHOLDER'": `CURRENT: '${version}'`,
      // Change log level in constants.ts to 0 in production
      'CURRENT_LOG_LEVEL: 1': `CURRENT_LOG_LEVEL: ${isProd ? 0 : 1}`,
      'CURRENT_LOG_LEVEL: 2': `CURRENT_LOG_LEVEL: ${isProd ? 0 : 2}`,
      'CURRENT_LOG_LEVEL: 3': `CURRENT_LOG_LEVEL: ${isProd ? 0 : 3}`,
      // Remove -dev suffix from component name in production
      'calendar-card-pro-dev': isProd ? 'calendar-card-pro' : 'calendar-card-pro-dev',
    }),
    json(),
    esbuild({
      tsconfig: 'tsconfig.json',
      target: 'es2017',
      // Kept in step with output.sourcemap above; input maps would only be built and
      // then discarded.
      sourceMap: false,
      define: {
        // Define NODE_ENV as production to ensure Lit uses production builds
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    }),
    resolve({
      // Prefer browser versions and use production exports
      browser: true,
      exportConditions: ['production', 'default'],
      // Ensure we get production builds of dependencies
      mainFields: ['browser', 'module', 'main'],
    }),
    commonjs(),
    terser({
      // Ensure production optimizations
      compress: {
        // Remove development-only code
        drop_console: false,
        drop_debugger: true,
        pure_funcs: ['console.debug'],
      },
      format: {
        // Remove comments in production
        comments: false,
      },
    }),
  ],
};
