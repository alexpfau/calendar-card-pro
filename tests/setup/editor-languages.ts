/**
 * Holds every editor language from the start, as though each one's file had already loaded.
 *
 * The built editor holds British English alone and loads any other language from a file of its
 * own the first time it is drawn in it (`src/rendering/editor/translations/loader.ts`). A test
 * cannot import those files, and almost none is about loading them, so every test gets the
 * editor as it is once its language has arrived. `tests/editor-language-files.test.ts` takes
 * this away to test the loading itself.
 */

import { EDITOR_HELD_STRINGS } from '../../src/rendering/editor/translations/held';
import { EDITOR_LANGUAGE_STRINGS } from '../../src/rendering/editor/translations/index';

Object.assign(EDITOR_HELD_STRINGS, EDITOR_LANGUAGE_STRINGS);
