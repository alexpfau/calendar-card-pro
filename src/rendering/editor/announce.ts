/**
 * The editor's one polite live region, as a queue: every message said while one update is
 * prepared is joined into a single announcement, so a removal, a result count and a scope
 * change landing together are all spoken, rather than the last replacing the rest.
 *
 * Text the editor also shows is said through the same queue, so two regions never speak over
 * each other. The element drains the queue as it renders and writes the joined text into its
 * live region; saying the same words twice in a row still speaks them twice, because the
 * region alternates between two equivalent texts (`Announcer.take`).
 */

export class Announcer {
  private _queued: string[] = [];

  private _turn = false;

  /**
   * Queues a message for the next announcement. Empty messages and repeats within one
   * announcement are dropped.
   *
   * @param message - A whole sentence
   * @returns Whether it was queued
   */
  say(message: string | undefined): boolean {
    const text = message?.trim();
    if (!text || this._queued.includes(text)) return false;
    this._queued.push(text);
    return true;
  }

  /** Whether anything waits to be announced. */
  get pending(): boolean {
    return this._queued.length > 0;
  }

  /**
   * Takes everything queued as one announcement and empties the queue.
   *
   * Consecutive announcements alternate a trailing no-break space, so a screen reader treats
   * the same words said again as a change and speaks them.
   *
   * @returns The text for the live region, or `undefined` when nothing was queued
   */
  take(): string | undefined {
    if (this._queued.length === 0) return undefined;
    const text = this._queued.join(' ');
    this._queued = [];
    this._turn = !this._turn;
    return this._turn ? text : `${text}\u00a0`;
  }
}
