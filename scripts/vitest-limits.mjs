/**
 * Sizes a Vitest run to the machine it starts on, so test runs in several worktrees at once
 * share the machine instead of each claiming all of it.
 *
 * Imported by `vitest.config.mjs`. Vitest's own default in run mode is one worker per core
 * but one, so on an 18-core machine three parallel runs start 51 workers. Measured there, that made
 * every one of the three runs fail: Vitest timed out starting workers and dropped test
 * files without running them. Here a run counts the other runs that are testing and takes
 * an equal share of one budget, between a floor and a ceiling. Nothing waits for anything:
 * a run that starts when the machine is busy gets its share at once.
 *
 * - `VITEST_MAX_WORKERS` or `--maxWorkers` set: untouched. Vitest reads both itself.
 * - `CI` set: untouched. A CI runner runs one suite, so Vitest's default is right there.
 * - Otherwise: the budget divided among the runs testing, held under a machine-wide
 *   total and under what free memory allows, clamped to the floor and the ceiling.
 *   Elevated macOS memory pressure takes it to the floor, and critical pressure to one.
 *
 * Each run decides once, at start, and keeps its count when others finish. A share rather
 * than whatever is left keeps a late run from crawling on the floor after the early ones
 * are done. A run cannot see another whose workers have not started yet; the memory guard
 * in `vitest-guard.mjs` still bounds every one of them.
 */

import { execFileSync } from 'child_process';
import { availableParallelism, freemem } from 'os';

/**
 * Test workers the runs testing at once share. Two below the core count leaves room for
 * the Vitest main processes and the rest of the machine.
 */
const BUDGET = Math.max(availableParallelism() - 2, 2);

/**
 * The most one run takes. On an 18-core machine the full suite took 53 s at 12 workers and
 * 49 s at 17, so workers past 12 buy little.
 */
const CEILING = Math.min(12, BUDGET);

/**
 * The most workers all runs together may hold, since each run keeps the share it started
 * with. Three runs holding 18 between them ran clean; holding 51, all three failed.
 */
const MACHINE_CAP = 2 * BUDGET;

const FLOOR = 2;

/**
 * Memory one worker needs and memory left for everything else, in bytes. A run's workers
 * do not peak together: twelve held 6.5 GB between them with the main process included,
 * about half of this each.
 */
const PER_WORKER_BYTES = 2 ** 30;
const RESERVE_BYTES = 4 * 2 ** 30;

/**
 * Run a command and return its stdout, or '' on any failure.
 *
 * @param {string} file - Executable
 * @param {string[]} args - Arguments
 * @returns {string} Standard output
 */
function read(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', timeout: 2000 });
  } catch {
    return '';
  }
}

/**
 * Find the Vitest test workers running on this machine, from any checkout, and the other
 * runs they belong to. A run counts only while it has workers, so a watch-mode Vitest
 * sitting idle takes no share. Only process pools can be seen: a run on a threads pool
 * holds its workers inside its own process.
 *
 * @returns {{ workers: number, runs: number }} Worker processes, and other runs owning them
 */
function otherRuns() {
  const parents = read('/bin/ps', ['-axo', 'ppid=,command='])
    .split('\n')
    .filter((line) => /vitest[/\\]dist[/\\]workers[/\\](forks|vmForks)\.js/.test(line))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((ppid) => ppid !== process.pid);
  return { workers: parents.length, runs: new Set(parents).size };
}

/**
 * Memory a new worker could use without pushing the machine into swap. On macOS that is
 * free, inactive and purgeable pages, since `os.freemem()` counts free pages only and
 * macOS keeps few of those.
 *
 * @returns {number} Bytes
 */
function availableMemory() {
  if (process.platform !== 'darwin') return freemem();
  const stats = read('/usr/bin/vm_stat', []);
  const pageSize = Number(/page size of (\d+) bytes/.exec(stats)?.[1]);
  const pages = ['free', 'inactive', 'speculative', 'purgeable'].reduce(
    (sum, kind) => sum + Number(new RegExp(`Pages ${kind}:\\s+(\\d+)`).exec(stats)?.[1] ?? 0),
    0,
  );
  return pageSize && pages ? pages * pageSize : freemem();
}

/**
 * macOS memory pressure: 1 normal, 2 warning, 4 critical. 1 elsewhere.
 *
 * @returns {number} Pressure level
 */
function memoryPressure() {
  if (process.platform !== 'darwin') return 1;
  return Number(read('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'])) || 1;
}

const CHOSEN = Symbol.for('calendar-card-pro.vitest-limits');

/**
 * Choose this run's worker count, once per run. Vitest may load the config more than once,
 * and it refuses to run projects that disagree on their worker count.
 *
 * @returns {number | undefined} Workers, or undefined to leave Vitest's own choice
 */
export function resolveMaxWorkers() {
  if (!(CHOSEN in globalThis)) globalThis[CHOSEN] = chooseMaxWorkers();
  return globalThis[CHOSEN];
}

/**
 * Work out this run's worker count and say why.
 *
 * @returns {number | undefined} Workers, or undefined to leave Vitest's own choice
 */
function chooseMaxWorkers() {
  if (process.env.VITEST_MAX_WORKERS || process.env.CI) return undefined;
  if (process.argv.some((arg) => /^--max-?workers\b/i.test(arg))) return undefined;

  const others = otherRuns();
  const pressure = memoryPressure();
  const share = Math.floor(BUDGET / (others.runs + 1));
  const byMemory = Math.floor((availableMemory() - RESERVE_BYTES) / PER_WORKER_BYTES);
  let workers = Math.max(FLOOR, Math.min(CEILING, share, MACHINE_CAP - others.workers, byMemory));
  if (pressure >= 2) workers = FLOOR;
  if (pressure >= 4) workers = 1;

  const why = [
    others.runs
      ? `${others.runs} other runs testing with ${others.workers} workers`
      : 'no other runs testing',
    `budget ${BUDGET}`,
    byMemory < CEILING ? `memory for ${Math.max(byMemory, 0)}` : '',
    pressure >= 2 ? `memory pressure ${pressure >= 4 ? 'critical' : 'elevated'}` : '',
  ];
  console.log(
    `[vitest-limits] ${workers} workers (${why.filter(Boolean).join(', ')}). ` +
      'Set VITEST_MAX_WORKERS to override.',
  );
  return workers;
}
