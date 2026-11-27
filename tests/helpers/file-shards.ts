/**
 * A walk over the gate corpus too long for one file, split across files that differ only in their
 * name, so that they run side by side: in one run's workers, and across CI's test jobs. Each file
 * reads its shard from its own name and takes every `count`th state from its own place; the walk's
 * main file checks that every shard has its file, so that a deleted or renamed one fails rather
 * than leaving its states unwalked.
 */

import { readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The test files in `tests/`, by name: this file's directory's parent. */
const tests = (): string[] => readdirSync(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * The shard a file's name gives: `<prefix>-<n>.test.ts`, from 1.
 *
 * @param url - The file's `import.meta.url`
 * @param prefix - Its walk's prefix
 * @param count - How many shards the walk has
 * @returns The shard
 */
export function shardOf(url: string, prefix: string, count: number): number {
  const name = basename(fileURLToPath(url));
  const shard = Number(new RegExp(`^${prefix}-(\\d+)\\.test\\.ts$`).exec(name)?.[1]);
  if (!(shard >= 1 && shard <= count)) {
    throw new Error(`${name} names no shard of ${prefix} from 1 to ${count}.`);
  }
  return shard;
}

/**
 * The files in `tests/` named as a walk's shards.
 *
 * @param prefix - The walk's prefix
 * @returns The names, sorted
 */
export function shardFiles(prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}-\\d+\\.test\\.ts$`);
  return tests()
    .filter((name) => pattern.test(name))
    .sort();
}

/**
 * The files a walk's shards should have.
 *
 * @param prefix - The walk's prefix
 * @param count - How many shards it has
 * @returns The names, sorted as `shardFiles` sorts them
 */
export function expectedShardFiles(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, at) => `${prefix}-${at + 1}.test.ts`).sort();
}

/**
 * The places a shard takes in a list: every `count`th, from its own.
 *
 * @param length - The list's length
 * @param shard - The shard, from 1
 * @param count - How many shards there are
 * @returns The indexes
 */
export function shardIndices(length: number, shard: number, count: number): number[] {
  const taken: number[] = [];
  for (let index = shard - 1; index < length; index += count) taken.push(index);
  return taken;
}
