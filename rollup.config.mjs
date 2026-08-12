import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import esbuild from 'rollup-plugin-esbuild';
import json from '@rollup/plugin-json';
import { readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

// Use the existing NODE_ENV variable for both purposes
const isProd = process.env.NODE_ENV === 'prod';

// A dev build exists to run side by side with the HACS-installed release in the same Home
// Assistant instance, and both land in the same flat directory. So the suffix is carried
// by everything a person or a script can see: both filenames here, and both custom
// element names (rewritten by the `replace` plugin below).
const suffix = isProd ? '' : '-dev';
const cardFile = `calendar-card-pro${suffix}.js`;
const editorFile = `editor${suffix}.js`;

// Get version from package.json reliably
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

/**
 * The plugin chain, built fresh for each output.
 *
 * A factory rather than a shared array: a Rollup plugin instance carries per-build state,
 * and handing one instance to two configs in the same process is a documented way to get
 * results that depend on which build ran first.
 *
 * @returns The plugins, in order
 */
function plugins() {
  return [
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
      // And from the editor filename the card builds a URL from — same mechanism, same
      // reason. `src/utils/editor-url.ts` names the dev file; production must name the
      // production one. A mismatch here is a dead editor and nothing else: it typechecks,
      // it builds, and it 404s only when someone opens the editor.
      // `scripts/check-bundle.mjs` asserts the emitted card names the right one.
      './editor-dev.js': `./${editorFile}`,
    }),
    json(),
    esbuild({
      tsconfig: 'tsconfig.json',
      target: 'es2017',
      // es2017 predates import.meta, so esbuild's default is to *lower* it — to the
      // literal `{}`. That makes `import.meta.url` undefined, the editor URL
      // unresolvable, and it happens silently: no build error, no type error, and a card
      // that works perfectly until someone opens the editor. Declaring support keeps it
      // as written; everything else stays at es2017. `check:bundle` asserts it survived.
      supported: { 'import-meta': true },
      // Kept in step with output.sourcemap below; input maps would only be built and
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
  ];
}

/**
 * Removes anything in `dist/` that this build will not itself write.
 *
 * Both outputs have stable names and are overwritten on every build, so this is not about
 * stale copies of *these* files. It is about the other build's: `dist/` is one flat
 * directory, `release.yml` attaches `dist/*.js`, and the dev deploy copies whatever it
 * finds — so a `calendar-card-pro-dev.js` left behind by an earlier `npm run dev` would be
 * published as a release asset by the next `npm run build`. It also sweeps up the
 * content-hashed chunks left by builds from before this shape, which nothing else removes.
 *
 * Targeted rather than `rm -rf dist`, because this runs under `--watch` too: the watcher
 * rebuilds only the config whose inputs moved, so wiping the directory would delete the
 * editor every time a card-only source file changed.
 *
 * Attached to the card build alone, so it runs once per `rollup -c` rather than once per
 * output — and so it cannot run *between* the two and delete what the first just wrote.
 */
const cleanDist = {
  name: 'clean-dist',
  buildStart() {
    const keep = new Set([cardFile, editorFile]);

    let existing;
    try {
      existing = readdirSync('dist', { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of existing) {
      if (entry.isFile() && keep.has(entry.name)) continue;
      rmSync(join('dist', entry.name), { recursive: true, force: true });
    }
  },
};

/**
 * Shared output settings.
 *
 * Sourcemaps are deliberately disabled. Nothing publishes a .map: the release workflow
 * attaches `dist/*.js`, which does not match `*.js.map`, and HACS only downloads what the
 * release carries. Emitting one anyway leaves a sourceMappingURL comment that every user's
 * browser resolves to a 404 (#315, #358). Turning them on means shipping the maps too, and
 * is its own decision rather than a drive-by.
 *
 * @param entryFileNames - The single file this build emits
 * @returns The output config
 */
function output(entryFileNames) {
  return { dir: 'dist', format: 'es', entryFileNames, sourcemap: false };
}

// Two builds rather than one build with code-splitting, and the difference is not
// cosmetic.
//
// Rollup, given one entry and a dynamic `import()`, emits the shared modules as a chunk
// that the editor imports *back from the card*. That is fatal here: HACS registers the
// Lovelace resource as `…/calendar-card-pro.js?hacstag=N`, and a relative specifier
// resolves against the importing module's URL **with the query dropped** — so the browser
// fetches the card a second time under a URL it has not seen, evaluates it again, and
// throws `NotSupportedError: the name "calendar-card-pro" has already been used with this
// registry`. A dead editor, and a card that may not render either.
//
// The previous shape avoided that with `preserveEntrySignatures: 'strict'`, which splits
// the entry into a 41-byte facade plus a hashed chunk so the real code is only ever
// addressed by one URL. It worked, but it was treating a self-inflicted problem: give the
// editor its own entry and no emitted file imports another at all, so the trap has nothing
// to act on. The card's dynamic import names a URL it computes at runtime
// (`src/utils/editor-url.ts`), which is invisible to both builds' module graphs.
//
// The cost is that the modules they share are duplicated into the editor — measured at
// +16.8 KB gzip, paid only by the people who open it. The gain lands on the path everyone
// pays for: a split entry has to *export* its shared modules, and exported symbols resist
// mangling and inlining, so collapsing the card back into one self-contained file made the
// eager path 1.1 KB gzip *smaller* than the three-file shape was.
// `scripts/check-bundle.mjs` asserts the property all of this rests on — that neither
// emitted file imports the other, or anything else.
export default [
  {
    input: 'src/calendar-card-pro.ts',
    output: output(cardFile),
    plugins: [cleanDist, ...plugins()],
  },
  {
    input: 'src/rendering/editor/index.ts',
    output: output(editorFile),
    plugins: plugins(),
  },
];
