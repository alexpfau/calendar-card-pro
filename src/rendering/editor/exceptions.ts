/** Removes stored view overrides for the editor Reset controls. */

import * as Types from '../../config/types';
import * as Helpers from '../../utils/helpers';

/**
 * Removes an exception from a view's override block.
 *
 * @param config - Merged configuration, defaults already applied
 * @param blockKey - Config key holding the view's override block
 * @param key - Option to stop overriding
 * @returns A new configuration, or the original when the key was not overridden
 */
export function removeException(
  config: Readonly<Types.Config>,
  blockKey: keyof Types.Config,
  key: string,
): Types.Config {
  const block = config[blockKey];

  if (!Helpers.isConfigBlock(block)) {
    return config as Types.Config;
  }

  if (!Object.prototype.hasOwnProperty.call(block, key)) {
    return config as Types.Config;
  }

  const next = { ...(block as Record<string, unknown>) };
  delete next[key];

  const draft = { ...(config as unknown as Record<string, unknown>) };

  if (Object.keys(next).length === 0) {
    delete draft[blockKey];
  } else {
    draft[blockKey] = next;
  }

  return draft as unknown as Types.Config;
}
