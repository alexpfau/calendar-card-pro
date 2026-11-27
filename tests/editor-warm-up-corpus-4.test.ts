/**
 * The warm-up over the gate corpus, the shard this file's name gives: what the warm-up holds in
 * each of its states, compared with what the editor's forms draw with every panel open. The six
 * files are identical, so that they run side by side (`helpers/warm-up.ts` › `corpusShard`);
 * `editor-warm-up.test.ts` checks that each has its file and that together they take every state.
 */
import { corpusShard } from './helpers/warm-up';

corpusShard(import.meta.url);
