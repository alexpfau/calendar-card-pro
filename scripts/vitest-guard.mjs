/**
 * Kills a test process that runs away with memory before it can take the machine down.
 *
 * `vitest.config.mjs` calls `startGuard()`, which starts it in the Vitest main process and
 * adds it to `NODE_OPTIONS`, so every test fork preloads it too. Vitest builds each fork's
 * environment from its own, so this reaches every fork whatever `execArgv` a run is given.
 * Each process watches itself and dies, normally with one line on stderr naming the cap it
 * crossed; Vitest then reports the fork as having exited unexpectedly while running a named
 * test file. A kill here is a leak to fix, not a cap to raise.
 *
 * It needs a process pool, the default. On a threads pool every test shares the main
 * process, so one cap would be a cap on the whole suite, and the guard stands down.
 *
 * Each process runs two checks, because each catches what the other misses:
 *
 * - A main-thread timer reads V8's own accounting, heap plus external memory. That counts
 *   Buffers and ArrayBuffers, which `--max-old-space-size` does not bound, and keeps
 *   counting them after macOS compresses their pages, which RSS does not.
 * - A worker thread reads RSS. It runs while the process's own thread is stuck in a
 *   synchronous loop. In a fork it also ends the fork once its Vitest has gone. In the main
 *   process on macOS under memory pressure, it also reads the physical footprint of the
 *   main process and its forks with `top`: the figure macOS kills processes on, and the
 *   only one here that sees compressed memory V8 does not account for. That read costs
 *   about half a second of system time, so it runs only once pressure has risen.
 *
 * A process that was killed on 2026-11-16 held 368 GiB, nearly all of it compressed, in a
 * Vitest main process whose V8 heap was capped at 4 GiB. None of these checks existed then.
 */

import { execFile } from 'child_process';
import { writeSync } from 'fs';
import { isMainThread, Worker, workerData } from 'worker_threads';

const GIB = 2 ** 30;

/**
 * The most memory one test process may hold. The heaviest file in the suite peaks near
 * 1.2 GiB of heap, so this leaves about three times that.
 */
const CAP_BYTES = (Number(process.env.VITEST_MEMORY_CAP_GB) || 4) * GIB;

/**
 * The V8 old-space limit given to each fork, in MiB. Below the cap, so a leak in the heap
 * ends with V8's own out-of-memory message, which names the cause more precisely.
 */
const HEAP_LIMIT_MB = Math.round((CAP_BYTES / 2 ** 20) * 0.75);

const POLL_MS = 500;
const FOOTPRINT_POLL_MS = 2000;

const STARTED = Symbol.for('calendar-card-pro.vitest-guard');

/**
 * Write one line to stderr and kill this process. `writeSync` on the file descriptor
 * because a worker thread's `process.stderr` is relayed through the main thread, which may
 * be the thread that is stuck. The kill does not depend on the write: once Vitest has gone,
 * nothing reads the pipe and the write fails.
 *
 * @param {string} message - Why
 */
function die(message) {
  try {
    writeSync(2, `\n[vitest-guard] pid ${process.pid} ${message}\n`);
  } finally {
    process.kill(process.pid, 'SIGKILL');
  }
}

/**
 * Kill this process for holding more memory than the cap.
 *
 * @param {number} bytes - Memory held
 * @param {string} kind - Which measure crossed the cap
 */
function dieOverCap(bytes, kind) {
  die(
    `reached ${gib(bytes)} ${kind} (cap ${gib(CAP_BYTES)}); killed. ` +
      'A test is leaking memory: fix the leak, do not raise the cap to make it pass.',
  );
}

/**
 * Format a byte count as GiB for a message.
 *
 * @param {number} bytes - Byte count
 * @returns {string} The count in GiB, one decimal place
 */
const gib = (bytes) => `${(bytes / GIB).toFixed(1)} GiB`;

/**
 * Check V8's accounting of this thread's isolate against the cap.
 */
function checkIsolate() {
  const { heapTotal, external } = process.memoryUsage();
  if (heapTotal + external > CAP_BYTES) dieOverCap(heapTotal + external, 'of heap and buffers');
}

/**
 * Parse one size from `top`'s MEM column, such as `1824K`, `2062M` or `3G`.
 *
 * @param {string} text - The column value
 * @returns {number} Bytes, or 0 when unreadable
 */
function parseTopSize(text) {
  const match = /^([\d.]+)([BKMGT])?\+?$/.exec(text ?? '');
  if (!match) return 0;
  const power = { B: 0, K: 1, M: 2, G: 3, T: 4 }[match[2] ?? 'B'];
  return Number(match[1]) * 1024 ** power;
}

/**
 * Run a command and resolve with its stdout, or with '' on any failure.
 *
 * @param {string} file - Executable
 * @param {string[]} args - Arguments
 * @returns {Promise<string>} Standard output
 */
const run = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 5000 }, (error, stdout) => resolve(error ? '' : stdout));
  });

/**
 * On macOS under memory pressure, kill this process or any of its children whose physical
 * footprint, compressed pages included, is over the cap.
 */
async function checkFootprints() {
  const level = Number(
    await run('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
  );
  if (!(level >= 2)) return;
  const children = (await run('/usr/bin/pgrep', ['-P', String(process.pid)])).split(/\s+/);
  const pids = [String(process.pid), ...children.filter(Boolean)];
  const args = ['-l', '1', '-stats', 'pid,mem', ...pids.flatMap((pid) => ['-pid', pid])];
  for (const line of (await run('/usr/bin/top', args)).split('\n')) {
    const [pid, mem] = line.trim().split(/\s+/);
    const footprint = parseTopSize(mem);
    if (!pids.includes(pid) || footprint <= CAP_BYTES) continue;
    if (pid === String(process.pid)) dieOverCap(footprint, 'physical footprint');
    try {
      writeSync(
        2,
        `\n[vitest-guard] test fork pid ${pid} reached ${gib(footprint)} physical footprint ` +
          `(cap ${gib(CAP_BYTES)}); killing it. A test is leaking memory: fix the leak.\n`,
      );
    } catch {
      // Nothing to tell.
    }
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

/**
 * The body of the guard's worker thread: checks that keep running while the process's own
 * thread is busy.
 *
 * @param {{ parentPid?: number, footprints: boolean }} options - The fork's parent at
 *   start, and whether to read physical footprints
 */
function watchFromThread({ parentPid, footprints }) {
  setInterval(() => {
    if (parentPid && process.ppid !== parentPid) {
      die(`lost its Vitest process (pid ${parentPid}); exiting.`);
    }
    const rss = process.memoryUsage.rss();
    if (rss > CAP_BYTES) dieOverCap(rss, 'resident');
  }, POLL_MS);
  if (!footprints) return;
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    checkFootprints().finally(() => (busy = false));
  }, FOOTPRINT_POLL_MS);
}

/**
 * Start the guard in this process, once.
 *
 * @param {boolean} fork - Whether this is a test fork rather than the Vitest main process
 */
function start(fork) {
  if (globalThis[STARTED]) return;
  globalThis[STARTED] = true;
  setInterval(checkIsolate, POLL_MS).unref();
  const options = fork
    ? { parentPid: process.ppid, footprints: false }
    : { footprints: process.platform === 'darwin' };
  new Worker(new URL(import.meta.url), { workerData: { vitestGuard: options } }).unref();
}

/**
 * The pool named on the command line, if any.
 *
 * @returns {string | undefined} Pool name
 */
function commandLinePool() {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--pool=')) return args[i].slice('--pool='.length);
    if (args[i] === '--pool') return args[i + 1];
  }
  return undefined;
}

/**
 * Start the guard in the Vitest main process, and in every process it forks from now on.
 * A heap limit already in `NODE_OPTIONS` is kept.
 */
export function startGuard() {
  if (/^(vm)?threads$/i.test(commandLinePool() ?? '')) {
    console.log(
      '[vitest-guard] off: a threads pool shares one process, so it has no per-test cap.',
    );
    return;
  }
  start(false);
  let options = process.env.NODE_OPTIONS ?? '';
  const preload = `--import=${import.meta.url}`;
  if (!options.includes(preload)) options += ` ${preload}`;
  if (!options.includes('--max-old-space-size')) {
    options += ` --max-old-space-size=${HEAP_LIMIT_MB}`;
  }
  process.env.NODE_OPTIONS = options.trim();
}

if (!isMainThread && workerData?.vitestGuard) watchFromThread(workerData.vitestGuard);
// A test fork is the one that has an IPC channel to its Vitest. Node processes a test starts
// inherit NODE_OPTIONS too: they get the heap limit, and the guard as well if they have an
// IPC channel of their own.
else if (isMainThread && process.send) start(true);
