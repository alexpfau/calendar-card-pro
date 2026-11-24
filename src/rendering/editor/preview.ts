/**
 * A preview transaction: configurations the editor sends Home Assistant so the card beside it
 * shows a change before it is made, and the configuration to put back when it is not.
 * Quick Setup previews its story this way, and Split This Calendar its two parts.
 *
 * 🚨 A transaction, not a cursor. Every preview is rebuilt from `opening`, never from a
 * configuration Home Assistant echoed back, and `previews` holds every one sent, so that an echo
 * of an earlier preview arriving after a later one is still known for what it is. Cancel sends
 * `opening` back, with the authorship it was opened with.
 *
 * DOM-free.
 */

import { equalConfigs } from './value';

/** One run of a preview, from opening to applying or canceling it. */
export interface PreviewSession {
  /** The configuration as the YAML held it when the preview opened. */
  readonly opening: Readonly<Record<string, unknown>>;
  readonly openingAuthoredRootKeys: ReadonlySet<string>;
  /** Every preview sent, in order. */
  readonly previews: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Whether a configuration Home Assistant sent is the echo of one of a session's previews. Home
 * Assistant answers each write with its editor's current value, read after an await
 * (`_updateConfigElement` in its `hui-element-editor`), so echoes carry the newest preview;
 * recognizing every one costs nothing and holds for a host that echoes in send order.
 *
 * @param session - The run, if one is open
 * @param raw - The configuration Home Assistant sent
 * @returns True for an echo of a preview
 */
export function isPreviewEcho(
  session: PreviewSession | undefined,
  raw: Readonly<Record<string, unknown>>,
): boolean {
  return session !== undefined && session.previews.some((preview) => equalConfigs(raw, preview));
}

/**
 * The session with one more preview, where it differs from the one shown now.
 *
 * @param session - The run
 * @param preview - The configuration to show
 * @returns The session, the same one where the preview is what is shown already
 */
export function withPreview(
  session: PreviewSession,
  preview: Record<string, unknown>,
): PreviewSession {
  const shown = session.previews[session.previews.length - 1] ?? session.opening;
  return equalConfigs(preview, shown)
    ? session
    : { ...session, previews: [...session.previews, preview] };
}
