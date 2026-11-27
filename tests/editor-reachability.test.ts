/**
 * Every field the editor builds is reached through the editor it draws: for every gate corpus
 * state and every scope, each present card field is found by clicking its page's row on the
 * overview (or on the overview itself, for the overview's own fields), in a `[data-field]` frame
 * holding a form whose schema carries the field's node.
 *
 * This replaces "the harness suite still passes" as the proof that moving fields onto pages lost
 * none: the harness navigates for its tests, so it can only fail on a field a test happens to
 * edit, where this walks the whole present index (`field-index.ts` › `buildFieldIndex`).
 *
 * Every page draws every setting that applies, one at its default folded to its head row, which
 * is pressed to open it, as a user would. Each place's controls are named apart as well: every
 * field's frame, and every button a setting's head and the lines draw (its toggle, ⓘ, its pill,
 * Reset).
 *
 * The walk itself runs in `editor-reachability-<n>.test.ts`, side by side
 * (`helpers/reachability.ts` › `reachShard`). Pinned here, what needs the whole corpus at once:
 * every shard has its file, the shards take each state exactly once, and the states they walk
 * hold more than ten thousand present fields between them.
 */
import { describe, expect, it } from 'vitest';

import { expectedShardFiles, shardFiles } from './helpers/file-shards';
import {
  REACH_PREFIX,
  REACH_SHARDS,
  REACH_STATES,
  presentFields,
  reachShardStates,
} from './helpers/reachability';
import { WORKSPACES } from '../src/rendering/editor/workspace';

describe('reachability through rendered navigation', () => {
  it('walks more than ten thousand present fields over the corpus in every scope, in shard files that take each state once', () => {
    expect(shardFiles(REACH_PREFIX)).toEqual(expectedShardFiles(REACH_PREFIX, REACH_SHARDS));
    const taken = Array.from({ length: REACH_SHARDS }, (_, at) => reachShardStates(at + 1)).flat();
    expect(taken.sort((a, b) => a - b)).toEqual(REACH_STATES.map((_, index) => index));

    const fields = REACH_STATES.reduce((sum, scoped) => sum + presentFields(scoped).length, 0);
    console.info(
      `reachability: ${REACH_STATES.length} corpus states over ${WORKSPACES.length} scopes, ` +
        `${fields} present fields`,
    );
    expect(fields).toBeGreaterThan(10_000);
  });
});
