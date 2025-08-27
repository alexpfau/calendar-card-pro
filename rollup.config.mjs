import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import esbuild from 'rollup-plugin-esbuild';
import json from '@rollup/plugin-json';
import { readFileSync } from 'fs';

// Use the existing NODE_ENV variable for both purposes
const isProd = process.env.NODE_ENV === 'prod';
// Use NODE_ENV to determine filename as well
const outputFilename = isProd ? 'calendar-card-pro.js' : 'calendar-card-pro-dev.js';

// Get version from package.json reliably
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

export default {
  input: 'src/calendar-card-pro.ts',
  output: {
    dir: 'dist',
    format: 'es',
    // Use the dynamic filename based on NODE_ENV
    entryFileNames: outputFilename,
    sourcemap: true,
  },
  plugins: [
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
      sourceMap: true,
    }),
    resolve(),
    commonjs(),
    terser(),
  ],
};
