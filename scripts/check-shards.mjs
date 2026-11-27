/**
 * Checks that CI's test jobs ran every test file between them, each exactly as often as the suite
 * holds it, and summarizes what they took.
 *
 * Run by the `lint-build` job in `ci.yml`, which `main`'s ruleset requires, after the test jobs
 * have each run their share of `npm test` (`scripts/vitest-sequencer.mjs`). Every job deals the
 * suite out the same way and keeps its own share, so a job that went missing from the matrix, or a
 * deal that dropped a file, would leave files run nowhere while every job that did run is green.
 * Each job therefore uploads two files, and this reads them:
 *
 * - `files.json` — every spec the suite holds, from `vitest list --filesOnly --json`, unsharded:
 *   `{ file, projectName }`, so a `.dst.test.ts` file appears once in each DST project.
 * - `report.json` — Vitest's JSON report of the share that job ran. It names files but not their
 *   projects, so files are compared by how often each ran.
 *
 * Usage: `node scripts/check-shards.mjs <dir> [root]`, where `<dir>` holds one directory per job
 * and `root` is the checkout the paths start from (the working directory by default). Writes its
 * summary to `$GITHUB_STEP_SUMMARY` where that is set. Exits 1 on any file run too often, too
 * seldom or not at all, and on jobs that disagree about what the suite holds.
 */

import { appendFileSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [dir, root = process.cwd()] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: node scripts/check-shards.mjs <dir> [root]');
  process.exit(2);
}

/**
 * A path from the checkout's root, with `/` between its parts.
 *
 * @param {string} file - Absolute path
 * @returns {string} Relative path
 */
const fromRoot = (file) => relative(realpathSync(root), file).split(sep).join('/');

/**
 * Counts each value.
 *
 * @param {string[]} values - Values
 * @returns {Map<string, number>} How often each appears
 */
function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

const jobs = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

const errors = [];
const expected = [];
const reports = [];
for (const job of jobs) {
  for (const name of ['files.json', 'report.json']) {
    if (!existsSync(join(dir, job, name))) errors.push(`${job} uploaded no ${name}.`);
  }
  if (errors.length > 0) continue;
  const files = JSON.parse(readFileSync(join(dir, job, 'files.json'), 'utf8'))
    .map((spec) => `${spec.projectName} ${fromRoot(spec.file)}`)
    .sort();
  expected.push({ job, files });
  reports.push({ job, report: JSON.parse(readFileSync(join(dir, job, 'report.json'), 'utf8')) });
}
if (jobs.length === 0) errors.push(`${dir} holds no job's files.`);

const suite = expected[0]?.files ?? [];
for (const { job, files } of expected.slice(1)) {
  if (JSON.stringify(files) !== JSON.stringify(suite)) {
    errors.push(
      `${job} lists a different suite from ${expected[0].job}; the jobs checked out different trees.`,
    );
  }
}

// How often the suite holds each file, against how often the jobs ran it.
const times = (count) => (count === 1 ? 'once' : `${count} times`);
const want = tally(suite.map((spec) => spec.slice(spec.indexOf(' ') + 1)));
const ran = tally(
  reports.flatMap(({ report }) => report.testResults.map((result) => fromRoot(result.name))),
);
for (const [file, count] of want) {
  const got = ran.get(file) ?? 0;
  if (got !== count) errors.push(`${file} ran ${times(got)}; the suite holds it ${times(count)}.`);
}
for (const [file, count] of ran) {
  if (!want.has(file)) errors.push(`${file} ran ${times(count)} but is not in the suite.`);
}

// What each job took, and the costliest files, for `WEIGHTS` in `scripts/vitest-sequencer.mjs`.
const seconds = (ms) => (ms / 1000).toFixed(1);
const lines = [
  '### Test jobs',
  '',
  '| Job | Files | Tests | Passed | Skipped | Failed | Wall s | Worker s |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
];
const perFile = [];
for (const { job, report } of reports) {
  const results = report.testResults;
  const end = Math.max(...results.map((result) => result.endTime));
  const work = results.reduce((sum, result) => sum + (result.endTime - result.startTime), 0);
  for (const result of results) {
    perFile.push({ job, file: fromRoot(result.name), ms: result.endTime - result.startTime });
  }
  lines.push(
    `| ${job} | ${results.length} | ${report.numTotalTests} | ${report.numPassedTests} | ` +
      `${report.numPendingTests + report.numTodoTests} | ${report.numFailedTests} | ` +
      `${seconds(end - report.startTime)} | ${seconds(work)} |`,
  );
}
const total = (key) => reports.reduce((sum, { report }) => sum + report[key], 0);
lines.push(
  '',
  `${suite.length} specs in the suite, ${[...ran.values()].reduce((a, b) => a + b, 0)} run; ` +
    `${total('numTotalTests')} tests, ${total('numPassedTests')} passed, ` +
    `${total('numPendingTests') + total('numTodoTests')} skipped, ${total('numFailedTests')} failed.`,
  '',
  '### Costliest Files',
  '',
  '| Seconds | Job | File |',
  '| ---: | --- | --- |',
  ...perFile
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 40)
    .map(({ job, file, ms }) => `| ${seconds(ms)} | ${job} | ${file} |`),
);
if (errors.length > 0)
  lines.unshift('### Shards Do Not Add Up', '', ...errors.map((e) => `- ${e}`), '');

const summary = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
for (const error of errors) console.error(`::error::${error}`);
process.exit(errors.length > 0 ? 1 : 0);
