/**
 * Orders a Vitest run longest file first, and splits the suite across CI's test jobs by what each
 * file costs.
 *
 * Imported by `vitest.config.mjs` as `sequence.sequencer`. Vitest's own sequencer orders a run by
 * the durations it cached from the last run, and a file it has none for by its size, larger first,
 * with every project's files after the project before it; and it shards by a hash of each file's
 * path, an equal count of files to each shard. Both go wrong on CI, where every run starts without
 * a cache, and both were measured there:
 *
 * - Size says little about cost. `editor-reachability.test.ts`, one 210 s test in a small file,
 *   reached a worker 736 s into a 946 s run and ended it; the four DST projects' files all went
 *   first, ahead of every heavy unit file.
 * - An equal count of files is not an equal amount of work. Four jobs by hash would have held 721,
 *   610, 589 and 351 s of it, and the job with the most sets how long CI takes.
 *
 * So:
 *
 * - `shard` deals the files out by `WEIGHTS`, the costliest first, each to the job holding the
 *   least so far. Every job deals the same files the same way, so between them the jobs take each
 *   file once, whatever the table says; the table decides only how evenly. It reads no cache,
 *   which could differ from one job to the next.
 * - `sort` runs failed files first, as Vitest does, then the longest first: by Vitest's cached
 *   duration where this machine has one, else by `WEIGHTS`, across projects, so that no heavy file
 *   waits behind lighter ones.
 */

import { relative, sep } from 'node:path';

/**
 * What a test file costs one worker, in seconds on CI's runner, for every file that takes 10 s or
 * more there; a file in several projects costs this in each. Measured on run 46070756843 (Nov 27,
 * Vitest's per-file test time), but where a note says otherwise.
 *
 * A file missing here still runs: it counts as `DEFAULT_WEIGHT`. A stale entry costs only balance,
 * and `tests/vitest-sequencer.test.ts` fails on one naming a file that is gone. To refresh the
 * table, read the slowest files from the summary of CI's `lint-build` job.
 */
export const WEIGHTS = {
  // The corpus walk `editor-warm-up.test.ts` took 611 s for, split six ways; estimated.
  'tests/editor-warm-up-corpus-1.test.ts': 100,
  'tests/editor-warm-up-corpus-2.test.ts': 100,
  'tests/editor-warm-up-corpus-3.test.ts': 100,
  'tests/editor-warm-up-corpus-4.test.ts': 100,
  'tests/editor-warm-up-corpus-5.test.ts': 100,
  'tests/editor-warm-up-corpus-6.test.ts': 100,
  // The walk `editor-reachability.test.ts` took 210 s for, split three ways; estimated.
  'tests/editor-reachability-1.test.ts': 70,
  'tests/editor-reachability-2.test.ts': 70,
  'tests/editor-reachability-3.test.ts': 70,
  'tests/editor-field-index.test.ts': 153,
  'tests/editor-workspace.test.ts': 106,
  'tests/editor-grid-reconciliation.test.ts': 54,
  'tests/editor-routing.test.ts': 50,
  'tests/compact-payloads-emitted.dst.test.ts': 36,
  'tests/editor-config-migration.test.ts': 36,
  'tests/editor-form-wiring.test.ts': 29,
  'tests/editor-view-withholding.test.ts': 26,
  'tests/editor-schema.test.ts': 24,
  'tests/editor-serialization-state.test.ts': 22,
  'tests/editor-search-config-keys.test.ts': 20,
  'tests/editor-card-actions.test.ts': 19,
  'tests/editor-hass-read-set.test.ts': 19,
  'tests/editor-search-aliases.test.ts': 19,
  'tests/font-size-nesting.test.ts': 19,
  'tests/compact-payloads-emitted.test.ts': 17,
  // What stays of `editor-warm-up.test.ts` once its corpus walk moved out; estimated.
  'tests/editor-warm-up.test.ts': 15,
  'tests/month-cache-key.test.ts': 14,
  'tests/editor-shown-set.test.ts': 13,
  'tests/editor-audit.test.ts': 13,
  'tests/editor-panel-search.test.ts': 12,
  'tests/editor-write-owners.test.ts': 12,
  'tests/month-narrow.test.ts': 11,
  'tests/grid-draw-add.test.ts': 11,
  'tests/editor-split-review.dst.test.ts': 11,
  'tests/editor-gates.test.ts': 11,
  'tests/editor-month-day-list.test.ts': 11,
  'tests/layout-switch.dst.test.ts': 11,
  'tests/editor-keeps-authored-defaults.test.ts': 10,
  'tests/editor-split-review.test.ts': 10,
  'tests/event-details.test.ts': 10,
};

/**
 * What any other file costs, in seconds: about the mean of the rest on that run, 0.8 s, with the
 * 0.7 s each file spends importing and setting up its environment.
 */
export const DEFAULT_WEIGHT = 1.5;

/**
 * What a file costs, by its path from the repository's root.
 *
 * @param {string} file - Path, with `/` between its parts
 * @returns {number} Seconds
 */
export function weightOf(file) {
  return Object.hasOwn(WEIGHTS, file) ? WEIGHTS[file] : DEFAULT_WEIGHT;
}

/**
 * Deals items out to `count` shards, the costliest first, each to the shard holding the least so
 * far (the lowest-numbered of those that tie). Equal costs go in the order of their keys, so the
 * same items give the same shards in any order they come in.
 *
 * @template T
 * @param {ReadonlyArray<{ key: string, weight: number, item: T }>} items - What to deal out
 * @param {number} count - How many shards
 * @returns {T[][]} The shards' items, shard 1 first
 */
export function partition(items, count) {
  const shards = Array.from({ length: count }, () => ({ load: 0, items: [] }));
  const ordered = [...items].sort(
    (a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  for (const { weight, item } of ordered) {
    let least = shards[0];
    for (const shard of shards) if (shard.load < least.load) least = shard;
    least.load += weight;
    least.items.push(item);
  }
  return shards.map((shard) => shard.items);
}

/**
 * Vitest's sequencer interface: `shard` for a run given `--shard` (or `shard` in its config), then
 * `sort` for what the run holds.
 */
export default class CostSequencer {
  /**
   * @param {import('vitest/node').Vitest} ctx - The run
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * A spec's file, from the repository's root.
   *
   * @param {import('vitest/node').TestSpecification} spec - The spec
   * @returns {string} Its path, with `/` between its parts
   */
  fileOf(spec) {
    return relative(this.ctx.config.root, spec.moduleId).split(sep).join('/');
  }

  /**
   * This job's share of the specs (`partition`).
   *
   * @param {import('vitest/node').TestSpecification[]} files - Every spec the run holds
   * @returns {import('vitest/node').TestSpecification[]} This shard's
   */
  async shard(files) {
    const { index, count } = this.ctx.config.shard;
    const items = files.map((spec) => {
      const file = this.fileOf(spec);
      return { key: `${spec.project.name} ${file}`, weight: weightOf(file), item: spec };
    });
    return partition(items, count)[index - 1];
  }

  /**
   * The specs in the order they start: a group Vitest runs earlier first, then failed files,
   * then the longest first.
   *
   * @param {import('vitest/node').TestSpecification[]} files - The specs
   * @returns {import('vitest/node').TestSpecification[]} The same, ordered
   */
  async sort(files) {
    const order = files.map((spec) => {
      const file = this.fileOf(spec);
      const cached = this.ctx.cache.getTestSpecificationResult(spec);
      return {
        spec,
        group: spec.project.config.sequence.groupOrder,
        failed: cached?.failed === true,
        // Both in seconds; a cached duration is this machine's own, so it wins.
        cost: cached?.duration !== undefined ? cached.duration / 1000 : weightOf(file),
        key: `${spec.project.name} ${file}`,
      };
    });
    order.sort(
      (a, b) =>
        a.group - b.group ||
        Number(b.failed) - Number(a.failed) ||
        b.cost - a.cost ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
    return order.map(({ spec }) => spec);
  }
}
