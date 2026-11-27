/**
 * The sequencer CI's test jobs split the suite with (`scripts/vitest-sequencer.mjs`).
 *
 * Each job deals out the same files and keeps its own share, so a deal that dropped a file, or
 * gave one to two jobs, would run it nowhere or twice with every job green. The deal is checked
 * here on the suite's own files, as the projects in `vitest.config.mjs` hold them, for any number
 * of jobs; CI checks again what its jobs actually ran (`scripts/check-shards.mjs`).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import CostSequencer, {
  DEFAULT_WEIGHT,
  WEIGHTS,
  partition,
  weightOf,
} from '../scripts/vitest-sequencer.mjs';

const ROOT = join(__dirname, '..');

/** The DST projects, as `vitest.config.mjs` names them. */
const DST_PROJECTS = ['dst-berlin', 'dst-sydney', 'dst-new_york', 'dst-azores'];

/** A spec as the sequencer reads one. */
interface Spec {
  moduleId: string;
  project: { name: string; config: { sequence: { groupOrder: number } } };
}

/**
 * Every spec the suite holds: each `.test.ts` file under `tests/` once in `unit`, but a
 * `.dst.test.ts` file once in each DST project instead.
 *
 * @returns The specs
 */
function suite(): Spec[] {
  const files = (readdirSync(join(ROOT, 'tests'), { recursive: true }) as string[])
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.test.ts'))
    .sort();
  const spec = (name: string, file: string): Spec => ({
    moduleId: join(ROOT, 'tests', file),
    project: { name, config: { sequence: { groupOrder: 0 } } },
  });
  return files.flatMap((file) =>
    file.endsWith('.dst.test.ts')
      ? DST_PROJECTS.map((name) => spec(name, file))
      : [spec('unit', file)],
  );
}

/**
 * The sequencer, on a run whose cache holds the results given.
 *
 * @param shard - The run's `--shard`, if any
 * @param cached - Cached results by file, from the repository's root
 * @returns It
 */
function sequencer(
  shard?: { index: number; count: number },
  cached: Record<string, { duration: number; failed: boolean }> = {},
) {
  return new CostSequencer({
    config: { root: ROOT, shard },
    cache: {
      getTestSpecificationResult: (spec: Spec) =>
        cached[
          spec.moduleId
            .slice(ROOT.length + 1)
            .split('\\')
            .join('/')
        ],
    },
  });
}

/** A spec's name, for comparing lists of them. */
const nameOf = (spec: Spec): string =>
  `${spec.project.name} ${spec.moduleId.slice(ROOT.length + 1)}`;

describe('the shard each CI test job runs', () => {
  const specs = suite();

  it('holds the suite', () => {
    // A null must prove it can be non-zero: the suite read here is the real one.
    expect(specs.length).toBeGreaterThan(500);
    expect(specs.filter((spec) => spec.project.name === 'dst-azores').length).toBeGreaterThan(10);
  });

  it('takes each spec exactly once between the jobs, for any number of jobs', async () => {
    for (let count = 1; count <= 8; count++) {
      const shards = await Promise.all(
        Array.from({ length: count }, (_, at) =>
          sequencer({ index: at + 1, count }).shard(specs as never),
        ),
      );
      const dealt = shards.flat().map(nameOf).sort();
      expect(dealt, `${count} jobs`).toEqual(specs.map(nameOf).sort());
      for (const shard of shards) expect(shard.length, `${count} jobs`).toBeGreaterThan(0);
    }
  });

  it('deals the same shards whatever order the specs come in', async () => {
    const deal = async (input: Spec[]) =>
      (
        await Promise.all(
          [1, 2, 3, 4].map((index) => sequencer({ index, count: 4 }).shard(input as never)),
        )
      ).map((shard) => shard.map(nameOf));
    const forward = await deal(specs);
    expect(await deal([...specs].reverse())).toEqual(forward);
    expect(await deal([...specs.slice(97), ...specs.slice(0, 97)])).toEqual(forward);
  });

  it('leaves no job holding more than its costliest file over the lightest', () => {
    const items = specs.map((spec) => {
      const file = spec.moduleId.slice(ROOT.length + 1);
      return { key: nameOf(spec), weight: weightOf(file), item: weightOf(file) };
    });
    for (let count = 2; count <= 8; count++) {
      const loads = partition(items, count).map((shard: number[]) =>
        shard.reduce((sum, weight) => sum + weight, 0),
      );
      const heaviest = Math.max(...loads);
      const costliest = Math.max(...items.map((item) => item.weight));
      expect(heaviest - Math.min(...loads), `${count} jobs`).toBeLessThanOrEqual(costliest);
    }
  });

  it('weighs only files that exist, and any other at the default', () => {
    const missing = Object.keys(WEIGHTS).filter((file) => !existsSync(join(ROOT, file)));
    expect(missing).toEqual([]);
    expect(weightOf('tests/a-file-the-table-does-not-name.test.ts')).toBe(DEFAULT_WEIGHT);
    for (const weight of Object.values(WEIGHTS)) expect(weight).toBeGreaterThan(DEFAULT_WEIGHT);
  });
});

describe('the order a run starts its files in', () => {
  const spec = (file: string, name = 'unit', groupOrder = 0): Spec => ({
    moduleId: join(ROOT, file),
    project: { name, config: { sequence: { groupOrder } } },
  });
  const heavy = 'tests/editor-field-index.test.ts';
  const lighter = 'tests/editor-workspace.test.ts';
  const unlisted = 'tests/a-file-the-table-does-not-name.test.ts';

  it('starts the costliest first, across projects, by the table where nothing is cached', async () => {
    const files = [
      spec(unlisted),
      spec('tests/compact-payloads-emitted.dst.test.ts', 'dst-azores'),
      spec(lighter),
      spec(heavy),
    ];
    expect((await sequencer().sort(files as never)).map(nameOf)).toEqual([
      `unit ${heavy}`,
      `unit ${lighter}`,
      'dst-azores tests/compact-payloads-emitted.dst.test.ts',
      `unit ${unlisted}`,
    ]);
  });

  it('prefers this machine’s cached durations, and starts a file that failed before the rest', async () => {
    const files = [spec(heavy), spec(lighter), spec(unlisted)];
    const cached = {
      [heavy]: { duration: 1_000, failed: false },
      [lighter]: { duration: 400_000, failed: false },
      [unlisted]: { duration: 10, failed: true },
    };
    expect((await sequencer(undefined, cached).sort(files as never)).map(nameOf)).toEqual([
      `unit ${unlisted}`,
      `unit ${lighter}`,
      `unit ${heavy}`,
    ]);
  });

  it('keeps a group Vitest runs earlier ahead of every costlier file', async () => {
    const files = [spec(heavy), spec(unlisted, 'early', -1)];
    expect((await sequencer().sort(files as never)).map(nameOf)).toEqual([
      `early ${unlisted}`,
      `unit ${heavy}`,
    ]);
  });
});
