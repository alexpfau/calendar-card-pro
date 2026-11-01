import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import { transformSync } from 'esbuild';
import {
  type Plugin,
  type RollupCache,
  type RollupWatcher,
  type RollupWatcherEvent,
  rollup,
  watch,
} from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EDITOR_TRANSLATION_GLOB,
  compactDayjsLocales,
  compactEditorStrings,
  editorDecoderSource,
  parseEditorTranslation,
  parseEnglishStrings,
  trimDayjsLocaleFields,
  validateDayjsUsage,
} from '../scripts/compact-payloads.mjs';

const require = createRequire(import.meta.url);
const scratch: string[] = [];
const fixtures = () => {
  const root = join(process.cwd(), 'tests', `.compact-payload-${randomUUID()}`);
  scratch.push(root);
  mkdirSync(join(root, 'src/rendering/editor/translations'), { recursive: true });
  return root;
};
const english = (body: string) => `export const EDITOR_STRINGS: Record<string,string> = {${body}};`;
const sourceImports = `import dayjs from 'dayjs';import relativeTime from 'dayjs/plugin/relativeTime';dayjs.extend(relativeTime);`;
const source = (body: string) =>
  `${sourceImports}function probe(date:Date, locale:string){${body}}`;
const grammar =
  'future:"in %s",past:"%s ago",s:"seconds",m:"minute",mm:"%d minutes",h:"hour",hh:"%d hours",d:"day",dd:"%d days",M:"month",MM:"%d months",y:"year",yy:"%d years"';
const locale = (fields = 'months:"One_Two".split("_")', relative = `{${grammar}}`) =>
  `function factory(dayjs){var data={name:"xx",${fields ? fields + ',' : ''}relativeTime:${relative}};return dayjs.locale(data,null,!0),data}`;

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical English literal validation', () => {
  it('normalizes escaped keys and concatenations, retaining empty strings and sorted keys', () => {
    const result = parseEnglishStrings(
      english(`z:'', "\\u0061":'A' + ('B' + \`C\`), "constructor":'own'`),
      'authoring.ts',
    );
    expect(result.keys).toEqual(['a', 'constructor', 'z']);
    expect([...result.entries]).toEqual([
      ['z', ''],
      ['a', 'ABC'],
      ['constructor', 'own'],
    ]);
  });

  it.each([
    [`a:"one","\\u0061":"two"`, /Duplicate normalized key.*|Duplicate normalized key/],
    [`"__proto__":"one"`, /__proto__/],
    [`["a"]:"one"`, /static property key/],
    [`...other`, /spreads/],
    [`a`, /shorthand/],
    [`get a(){return "one"}`, /getters/],
    [`a(){return "one"}`, /methods/],
    [`a:1`, /string literal/],
    [`a:null`, /string literal/],
    [`a:true`, /string literal/],
    [`a:undefined`, /string literal/],
    [`a:"one"+2`, /string literal/],
    [`a:compute()`, /string literal/],
    ['a:`value ${name}`', /string literal/],
    [`a:"\\uZZZZ"`, /Invalid syntax/],
  ])('rejects unsupported English member %s', (body, diagnostic) => {
    expect(() => parseEnglishStrings(english(body), 'authoring.ts')).toThrow(diagnostic);
    expect(() => parseEnglishStrings(english(body), 'authoring.ts')).toThrow('authoring.ts');
  });

  it.each([
    'export const EDITOR_STRINGS = build();',
    'export const EDITOR_STRINGS = ({a:"A"} as const);',
    'export let EDITOR_STRINGS = {a:"A"};',
    'const EDITOR_STRINGS = {a:"A"};',
    'function local(){const EDITOR_STRINGS={a:"A"}}',
    `${english('a:"A"')} function local(){const EDITOR_STRINGS={b:"B"}}`,
    `${english('a:"A"')} function local({EDITOR_STRINGS}:any){}`,
    `${english('a:"A"')} const {EDITOR_STRINGS} = other;`,
    `${english('a:"A"')} import {EDITOR_STRINGS} from "./other";`,
    'export const EDITOR_STRINGS = {a: "A";',
    'export const OTHER = {};',
  ])('fails closed on ambiguous or invalid table declarations: %s', (code) => {
    expect(() => parseEnglishStrings(code, 'authoring.ts')).toThrow('authoring.ts');
  });

  it('parses the live table independently of the emitted decoder', () => {
    const result = parseEnglishStrings(
      readFileSync(join(process.cwd(), 'src/rendering/editor/strings.ts'), 'utf8'),
    );
    expect(result.keys.length).toBeGreaterThan(400);
    expect(result.keys).toEqual([...result.entries.keys()].sort());
  });
});

describe('raw editor JSON vectors', () => {
  it('uses the English key order, omits absent values, and preserves empty translations', () => {
    const keys = ['a', 'b', 'constructor'];
    const values = parseEditorTranslation('{"b":"","constructor":"own"}', keys, 'xx.json');
    expect(values).toEqual([null, '', 'own']);
    const decode = runInNewContext(editorDecoderSource(keys).replace('export default', 'decode='));
    const result = decode(values);
    expect(Object.getPrototypeOf(result)).not.toBeNull();
    expect(Object.keys(result)).toEqual(['b', 'constructor']);
    expect(result.b).toBe('');
    expect(result.constructor).toBe('own');
    expect(Object.prototype.hasOwnProperty.call(result, 'a')).toBe(false);
  });

  it.each([
    ['{"a":"first","a":"second"}', /Duplicate normalized JSON key/],
    ['{"a":"first","\\u0061":"second"}', /Duplicate normalized JSON key/],
    ['{"unknown":"value"}', /Unknown editor translation key/],
    ['{"a":null}', /string value/],
    ['{"a":3}', /string value/],
    ['{"a":false}', /string value/],
    ['{"a":[]}', /string value/],
    ['{"a":{}}', /string value/],
    ['[]', /object root/],
    ['null', /object root|Invalid syntax/],
    ['"text"', /object root/],
    ['{"a":"one",}', /Invalid JSON/],
    ["{'a':'one'}", /Invalid JSON|Invalid syntax/],
    ['{"a":"one"} // comment', /Invalid JSON/],
    ['{"a":"one"} {"a":"two"}', /Invalid syntax|object root/],
  ])('rejects invalid raw JSON %s before information is lost', (code, diagnostic) => {
    expect(() => parseEditorTranslation(code, ['a'], 'xx.json')).toThrow(diagnostic);
    expect(() => parseEditorTranslation(code, ['a'], 'xx.json')).toThrow('xx.json');
  });

  it('includes the offending normalized key in duplicate and value diagnostics', () => {
    expect(() => parseEditorTranslation('{"a":null}', ['a'], 'xx.json')).toThrow('xx.json ["a"]');
    expect(() => parseEditorTranslation('{"a":"A","\\u0061":"B"}', ['a'], 'xx.json')).toThrow(
      'xx.json ["a"]',
    );
  });

  it('validates every shipped editor JSON, including partial and override-only files', () => {
    const editor = join(process.cwd(), 'src/rendering/editor');
    const keys = parseEnglishStrings(readFileSync(join(editor, 'strings.ts'), 'utf8')).keys;
    const files = readdirSync(join(editor, 'translations')).filter((file) =>
      file.endsWith('.json'),
    );
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const code = readFileSync(join(editor, 'translations', file), 'utf8');
      const values = parseEditorTranslation(code, keys, file);
      expect(values).toHaveLength(keys.length);
      expect(values.filter((value: string | null) => value !== null)).toHaveLength(
        Object.keys(JSON.parse(code)).length,
      );
    }
  });
});

describe('Day.js source API guard', () => {
  it('accepts the live relative-time call surface and recognizes locale imports', () => {
    const code = readFileSync(join(process.cwd(), 'src/translations/dayjs.ts'), 'utf8');
    const imports = validateDayjsUsage(code, 'dayjs.ts');
    expect(imports).toContain('dayjs/plugin/relativeTime');
    expect(imports.filter((id: string) => id.startsWith('dayjs/locale/'))).toHaveLength(35);
    expect(() =>
      validateDayjsUsage(
        source('const target=dayjs(date).locale(locale);return target.from(dayjs(date));'),
      ),
    ).not.toThrow();
    expect(() =>
      validateDayjsUsage(
        source('const target=dayjs(date).locale(locale);return target.fromNow();'),
      ),
    ).not.toThrow();
  });

  it.each([
    'return dayjs(date).format("MMMM");',
    'return dayjs(date).month();',
    'return dayjs(date).day();',
    'return dayjs(date).week();',
    'return dayjs(date).startOf("week");',
    'return dayjs(date).localeData();',
    'return dayjs(date).$locale();',
    'return dayjs(date)["format"]("MMMM");',
    'const format=dayjs(date).format;return format("MMMM");',
    'const target=dayjs(date);const format=target.format;',
    'const target=dayjs(date);const method=target.fromNow;',
    'const target=dayjs(date);const {format}=target;',
    'const target=dayjs(date);return target["month"]();',
    'const target=dayjs(date);const alias=target;',
    'const target=dayjs(date);return target;',
    'const target=dayjs(date);return {target};',
    'const target=dayjs(date);return consume(target);',
    'return consume(dayjs(date));',
    'return {target:dayjs(date)};',
    'return dayjs(date);',
    'const factory=dayjs;return factory(date).format();',
    'const {extend}=dayjs;',
    'dayjs["extend"](relativeTime);',
    'return dayjs.locale("de");',
    'return dayjs.Ls.de.months;',
    'return dayjs.prototype.format;',
    'dayjs.extend(unknown);',
    'const plugin=relativeTime;',
    'const target=dayjs(date) as any;return target.format();',
    'const target=(dayjs as any)(date);return target.format();',
    'let target=dayjs(date);return target.fromNow();',
    'return dayjs(date).locale({name:"de"}).fromNow();',
    'return dayjs(date).locale();',
    'return dayjs(date).fromNow(true);',
    'const target=dayjs(date);return target.from(date);',
    'return dayjs(...dates).fromNow();',
    'return dayjs(date)?.locale(locale).fromNow();',
    'return window.dayjs(date).format();',
    'return window["dayjs"](date).format();',
    'return import(moduleName);',
    'return require(moduleName);',
  ])('rejects new formatting, aliases, computed members, or escaping instances: %s', (body) => {
    expect(() => validateDayjsUsage(source(body), 'mutation.ts')).toThrow('mutation.ts');
  });

  it.each([
    "import advancedFormat from 'dayjs/plugin/advancedFormat';",
    "import localeData from 'dayjs/plugin/localeData';",
    "import * as factory from 'dayjs';",
    "import {Dayjs} from 'dayjs';",
    "import type {Dayjs} from 'dayjs';",
    "import factory from 'dayjs/esm';",
    "export {default as factory} from 'dayjs';",
    "export * from 'dayjs';",
    "const factory=require('dayjs');",
    "const factory=await import('dayjs');",
    "const factory=await import('dayjs'+'/esm');",
    "import data from 'dayjs/locale/de';",
  ])('rejects future dependency/plugin import forms: %s', (code) => {
    expect(() => validateDayjsUsage(code, 'mutation.ts')).toThrow('mutation.ts');
  });

  it('follows import binding symbols even with renamed factories and nested shadowing', () => {
    const code = source(
      'const target=dayjs(date);function nested(target:string){return target.toUpperCase()}return target.fromNow();',
    );
    expect(() => validateDayjsUsage(code)).not.toThrow();
    expect(() =>
      validateDayjsUsage(
        code
          .replace('import dayjs', 'import factory')
          .replace('dayjs.extend', 'factory.extend')
          .replace(/dayjs\(/g, 'factory('),
      ),
    ).not.toThrow();
    expect(() =>
      validateDayjsUsage(
        source(
          'const target=dayjs(date);function nested(){return {target}}return target.fromNow();',
        ),
      ),
    ).toThrow();
    expect(() => validateDayjsUsage(`${sourceImports}export {dayjs as alias};`)).toThrow();
    expect(() => validateDayjsUsage(`${sourceImports}export const target=dayjs(date);`)).toThrow();
  });
});

describe('fail-closed locale trimming', () => {
  it('preserves whole relative-time functions and reachable helpers, removing only metadata', () => {
    const code = locale(
      'months:"One_Two".split("_"),ordinal:function(n){return n+"th"}',
      `{${grammar.replace('mm:"%d minutes"', 'mm:translate')}}`,
    ).replace(
      'var data=',
      'function helper(n){return n+" units"}function translate(n){return helper(n)}var data=',
    );
    const result = trimDayjsLocaleFields(code, '/locales/xx.js');
    expect(result).toContain('function helper(n){return n+" units"}');
    expect(result).toContain('function translate(n){return helper(n)}');
    expect(result).not.toContain('months:');
    expect(result).not.toContain('ordinal:');
    const original = runInNewContext(`${code};factory({locale(){}})`);
    const compacted = runInNewContext(`${result};factory({locale(){}})`);
    expect(Object.keys(compacted)).toEqual(['name', 'relativeTime']);
    expect(Object.keys(compacted.relativeTime)).toEqual(Object.keys(original.relativeTime));
    expect(compacted.relativeTime.mm(7)).toBe(original.relativeTime.mm(7));
  });

  it.each([
    [locale().replace('name:"xx"', 'name:"other"'), /filename/],
    [locale().replace('name:"xx"', 'name:dynamic'), /filename/],
    [locale().replace('name:"xx",', ''), /locale object/],
    [locale() + ';var extra={name:"xx"}', /found 2/],
    [
      locale()
        .replace('var data={', 'var data=Object.assign({}, {')
        .replace('};return', '});return'),
      /composition/,
    ],
    [locale('...more'), /spreads/],
    [locale('get months(){return []}'), /getters/],
    [locale('["months"]:[]'), /static property key/],
    [locale('name:"xx"'), /Duplicate normalized key/],
    [locale('"__proto__":null'), /__proto__/],
    [locale('months:sideEffect()'), /side effects/],
    [locale('months:(counter++,[])'), /side effects/],
    [locale('months:new Months()'), /side effects/],
    [locale('months:other.months'), /side effects/],
    [locale('months:unknown'), /side effects/],
    [locale('months:values').replace('var data=', 'var values=effect();var data='), /side effects/],
    [locale('months:class {static {effect()}}'), /side effects/],
    [locale('months:[...values]'), /side effects/],
    [locale('', `{...grammar}`), /spreads/],
    [locale('', '{}'), /relativeTime.future/],
    [locale('', `{${grammar.replace('mm:"%d minutes"', 'mm:null')}}`), /relativeTime.mm/],
    [locale('', `{${grammar.replace('mm:"%d minutes"', 'mm:dynamic()')}}`), /relativeTime.mm/],
    [locale('', '{get future(){return "in %s"}}'), /getters/],
    [locale().replace(',relativeTime:', ',relativeTimes:'), /Missing relativeTime/],
    [
      locale().replace('dayjs.locale(data,null,!0)', 'dayjs.locale({...data},null,!0)'),
      /unsupported use/,
    ],
    [
      locale().replace('dayjs.locale(data,null,!0)', 'dayjs.locale(data,null,false)'),
      /unsupported use/,
    ],
    [locale().replace('dayjs.locale(data,null,!0)', 'other(data)'), /unsupported use/],
    [locale().replace('return dayjs.locale', 'data.months;return dayjs.locale'), /unsupported use/],
    [locale().replace('};return', '};const copy={data};return'), /unsupported use/],
    [locale().replace('var data=', 'var data=;'), /Invalid syntax/],
  ])('rejects changed locale shape or unsafe removed initializer', (code, diagnostic) => {
    expect(() => trimDayjsLocaleFields(code, '/locales/xx.js')).toThrow(diagnostic);
    expect(() => trimDayjsLocaleFields(code, '/locales/xx.js')).toThrow('/locales/xx.js');
  });

  it('leaves shipped English without relativeTime byte-identical', () => {
    const file = require.resolve('dayjs/locale/en');
    const code = readFileSync(file, 'utf8');
    expect(trimDayjsLocaleFields(code, file)).toBe(code);
    expect(() => trimDayjsLocaleFields(code, '/locales/xx.js')).toThrow();
  });

  it('validates the shipped imported locale corpus and every source file at build start', async () => {
    const plugin = compactDayjsLocales() as Plugin;
    const watched: string[] = [];
    const start = plugin.buildStart as (this: unknown) => void;
    start.call({
      addWatchFile(file: string) {
        watched.push(file);
      },
    });
    const payloads = watched.filter((file) => /dayjs[/\\]locale[/\\].+\.js$/.test(file));
    expect(payloads).toHaveLength(35);
    expect(watched).toContain(join(process.cwd(), 'src/calendar-card-pro.ts'));
    expect(watched).toContain(join(process.cwd(), 'src'));
    for (const file of payloads) {
      const compacted = trimDayjsLocaleFields(readFileSync(file, 'utf8'), file);
      expect(compacted).toContain(`name:"${file.split('/').pop()!.slice(0, -3)}"`);
      if (!file.endsWith('/en.js')) expect(compacted).toContain('relativeTime:');
    }
  });

  it('checks newly introduced API use on every build, not only transformed modules', () => {
    const root = fixtures();
    const file = join(root, 'src/probe.ts');
    writeFileSync(file, source('return dayjs(date).fromNow();'));
    const plugin = compactDayjsLocales(root);
    const context = { addWatchFile() {} };
    expect(() => plugin.buildStart.call(context)).not.toThrow();
    writeFileSync(file, source('return dayjs(date).format("MMMM");'));
    expect(() => plugin.buildStart.call(context)).toThrow('probe.ts');
  });
});

function writeFixture(root: string, body: string) {
  const file = join(root, 'src/rendering/editor/strings.ts');
  writeFileSync(file, english(body));
  return file;
}

function buildPlugins(root: string, transformed: string[]) {
  const record: Plugin = {
    name: 'record-vectors',
    transform(_code, id) {
      if (id.endsWith('.json') || id.includes('compact-editor-strings:decoder'))
        transformed.push(id);
      return null;
    },
  };
  return [
    compactEditorStrings(root),
    record,
    json({ exclude: EDITOR_TRANSLATION_GLOB }),
    esbuild({ target: 'es2021' }),
  ];
}

function evaluate(code: string): Record<string, Record<string, string>> {
  const cjs = transformSync(code, { format: 'cjs', target: 'es2021' }).code;
  const module = { exports: {} };
  runInNewContext(cjs, { module, exports: module.exports });
  return module.exports;
}

describe('real Rollup builds and cache invalidation', () => {
  it('keeps locale subsetting and source guards effective across real cached Day.js builds', async () => {
    const root = fixtures();
    const entry = join(root, 'entry.ts');
    const probe = join(root, 'src/probe.ts');
    const imports = `${sourceImports}import 'dayjs/locale/de';`;
    const instance = `dayjs(new Date("2024-01-16T12:00:00")).locale("de")`;
    const body = `${imports}export const rendered=${instance}.from(dayjs(new Date("2024-01-15T12:00:00")));`;
    writeFileSync(entry, `export * from "./src/probe";import "./dependency";`);
    writeFileSync(probe, body);
    writeFileSync(join(root, 'dependency.ts'), `import 'dayjs/locale/de';`);
    const marker = 'Sonntag_Montag_Dienstag_Mittwoch_Donnerstag_Freitag_Samstag';
    expect(readFileSync(require.resolve('dayjs/locale/de'), 'utf8')).toContain(marker);
    const ordinaryPlugins = () => [esbuild({ target: 'es2021' }), resolve(), commonjs()];
    const control = await rollup({ input: entry, plugins: ordinaryPlugins() });
    let original: string;
    try {
      const { output } = await control.generate({ format: 'es' });
      expect(output[0].code).toContain(marker);
      original = output[0].code;
    } finally {
      await control.close();
    }
    const plugins = [compactDayjsLocales(root), ...ordinaryPlugins()];
    let cache: RollupCache | undefined;
    for (let build = 0; build < 2; build++) {
      const bundle = await rollup({ input: entry, plugins, cache });
      try {
        const { output } = await bundle.generate({ format: 'es' });
        expect(output[0].code).not.toContain(marker);
        expect(evaluate(output[0].code)).toEqual(evaluate(original));
        expect(bundle.watchFiles).toContain(entry);
        cache = bundle.cache;
      } finally {
        await bundle.close();
      }
    }
    // The dependency retains cached de.js while only fr remains approved by source.
    writeFileSync(probe, body.replace('locale/de', 'locale/fr').replace('"de"', '"fr"'));
    await expect(rollup({ input: entry, plugins, cache })).rejects.toThrow(
      'Locale bypassed the validated source imports',
    );
    writeFileSync(probe, `${imports}export const rendered=${instance}.format("MMMM");`);
    await expect(rollup({ input: entry, plugins, cache })).rejects.toThrow(
      'Unsupported Day.js instance API format',
    );
  });

  function setup() {
    const root = fixtures();
    writeFixture(root, 'z:"Z",a:"A"');
    const editor = join(root, 'src/rendering/editor');
    const first = join(editor, 'translations/xx.json');
    const second = join(editor, 'translations/yy.json');
    writeFileSync(first, '{"z":""}');
    writeFileSync(second, '{"a":"Translated"}');
    writeFileSync(join(root, 'other.json'), '{"unrelated":true}');
    const entry = join(root, 'entry.ts');
    writeFileSync(
      entry,
      `export {EDITOR_STRINGS as english} from "./src/rendering/editor/strings";export {default as first} from "./src/rendering/editor/translations/xx.json";export {default as second} from "./src/rendering/editor/translations/yy.json";export {default as other} from "./other.json";`,
    );
    return { root, entry, first, second };
  }

  it('regenerates ALL unchanged language vectors and the decoder on add/reorder/remove with real cache builds', async () => {
    const { root, entry, first, second } = setup();
    const transformed: string[] = [];
    const plugins = buildPlugins(root, transformed);
    let cache: RollupCache | undefined;
    for (const [body, expected] of [
      ['z:"Z",a:"A"', { a: 'A', z: 'Z' }],
      ['z:"Z",middle:"Added",a:"A"', { a: 'A', middle: 'Added', z: 'Z' }],
      ['a:"A",middle:"Added",z:"Z"', { a: 'A', middle: 'Added', z: 'Z' }],
      ['a:"A",z:"Z"', { a: 'A', z: 'Z' }],
    ] as const) {
      const stringsPath = writeFixture(root, body);
      transformed.length = 0;
      const bundle = await rollup({ input: entry, plugins, cache });
      try {
        const { output } = await bundle.generate({ format: 'es' });
        const result = evaluate(output[0].code);
        expect(result.english).toEqual(expected);
        expect(result.first).toEqual({ z: '' });
        expect(result.second).toEqual({ a: 'Translated' });
        expect(result.other).toEqual({ unrelated: true });
        expect(transformed).toContain(first);
        expect(transformed).toContain(second);
        expect(transformed.some((id) => id.includes('compact-editor-strings:decoder'))).toBe(true);
        expect(bundle.watchFiles).toContain(stringsPath);
        cache = bundle.cache;
        for (const file of [first, second]) {
          expect(
            cache?.modules.find((module) => module.id === file)?.transformDependencies,
          ).toContain(stringsPath);
        }
      } finally {
        await bundle.close();
      }
    }
  }, 20000);

  it('does not capture English at factory evaluation or share state across plugin instances', async () => {
    const one = setup();
    const two = setup();
    const pluginsOne = buildPlugins(one.root, []);
    const pluginsTwo = buildPlugins(two.root, []);
    writeFixture(one.root, 'a:"One",z:"Z",unique:"First root"');
    writeFixture(two.root, 'z:"Z",a:"Two",distinct:"Second root"');
    const bundles = await Promise.all([
      rollup({ input: one.entry, plugins: pluginsOne }),
      rollup({ input: two.entry, plugins: pluginsTwo }),
    ]);
    try {
      const results = await Promise.all(
        bundles.map(async (bundle) => {
          const { output } = await bundle.generate({ format: 'es' });
          return evaluate(output[0].code);
        }),
      );
      expect(results[0].english).toEqual({ a: 'One', unique: 'First root', z: 'Z' });
      expect(results[1].english).toEqual({ a: 'Two', distinct: 'Second root', z: 'Z' });
    } finally {
      await Promise.all(bundles.map((bundle) => bundle.close()));
    }
  });

  it('rejects unknown translated keys after canonical removal even when JSON is cached', async () => {
    const { root, entry } = setup();
    const plugins = buildPlugins(root, []);
    const bundle = await rollup({ input: entry, plugins });
    const cache = bundle.cache;
    await bundle.close();
    writeFixture(root, 'z:"Z"');
    await expect(rollup({ input: entry, plugins, cache })).rejects.toThrow(
      'Unknown editor translation key',
    );
  });

  it('watches English as a dependency of JSON-only entry points and rebuilds unchanged languages', async () => {
    const { root, first } = setup();
    const transformed: string[] = [];
    const watcher = watch({
      input: first,
      plugins: buildPlugins(root, transformed),
      output: { file: join(root, 'bundle.js'), format: 'es' },
      watch: { skipWrite: true },
    });
    function nextBuild(watcher: RollupWatcher) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          watcher.off('event', listener);
          reject(new Error('English dependency did not trigger a watch rebuild'));
        }, 10000);
        const listener = async (event: RollupWatcherEvent) => {
          if (event.code !== 'ERROR' && event.code !== 'BUNDLE_END') return;
          clearTimeout(timer);
          watcher.off('event', listener);
          if (event.code === 'ERROR') reject(event.error);
          else {
            try {
              const { output } = await event.result.generate({ format: 'es' });
              resolve(output[0].code);
            } catch (error) {
              reject(error);
            } finally {
              await event.result.close();
            }
          }
        };
        watcher.on('event', listener);
      });
    }
    try {
      expect(evaluate(await nextBuild(watcher)).default).toEqual({ z: '' });
      transformed.length = 0;
      const rebuilt = nextBuild(watcher);
      writeFixture(root, 'a:"A",middle:"Added",z:"Z"');
      expect(evaluate(await rebuilt).default).toEqual({ z: '' });
      expect(transformed).toContain(first);
      expect(transformed.some((id) => id.includes('compact-editor-strings:decoder'))).toBe(true);
      transformed.length = 0;
      const removed = nextBuild(watcher);
      writeFixture(root, 'a:"A",z:"Z"');
      expect(evaluate(await removed).default).toEqual({ z: '' });
      expect(transformed).toContain(first);
    } finally {
      await watcher.close();
    }
  }, 20000);

  it('keeps the JSON exclusion narrow and never wraps another plugin by generated-code sniffing', () => {
    expect(EDITOR_TRANSLATION_GLOB).toBe('**/src/rendering/editor/translations/*.json');
    expect(dirname(require.resolve('@rollup/plugin-json'))).toContain('@rollup/plugin-json');
  });
});
