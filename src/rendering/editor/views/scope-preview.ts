/**
 * The preview follows the layout being edited: the card in Home Assistant's dialog drawn in the
 * layout whose page is open, without writing `view`.
 *
 * Nothing is sent to Home Assistant, so nothing a Save could keep changes. The editor hands the
 * preview's own card the configuration with `view` replaced, through the card's `setConfig`, which
 * is the one method every card has. The card is found as Pick From Preview finds it
 * (`pick.ts` › `findPreviewCard`). Home Assistant builds a new card element for every change in
 * preview mode and configures it before putting it in place, and on a sections dashboard it builds
 * the element around the card anew as well. So this watches every shadow root from the card up to
 * the one it shares with the editor, Home Assistant's dialog, each with its whole subtree, and
 * configures whatever card it finds after a change there. Once the card is to show the layout it
 * opens in again, it hands the card the configuration as written, unless Home Assistant has
 * already replaced it.
 *
 * The card itself is unchanged: on a dashboard nothing calls it this way, so it costs the card
 * nothing.
 */

import type * as Types from '../../../config/types';

/** A card that takes a configuration. */
type ConfigurableCard = HTMLElement & { setConfig?: (config: unknown) => void };

/** What the preview should show other than the card as written. */
export interface ScopePreviewWant {
  /** The layout to draw. */
  readonly view: Types.EffectiveView;
  /** The configuration as written, which `view` is laid over. */
  readonly config: Readonly<Record<string, unknown>>;
}

/** Keeps the preview's card in the layout asked for. */
export class ScopePreview {
  private _want?: ScopePreviewWant;
  /** The card last configured, and with what, so a render that changes nothing does nothing. */
  private _card?: ConfigurableCard;
  private _shown?: ScopePreviewWant;
  private _watch?: MutationObserver;
  /** The roots watched, the card's own first. */
  private _roots: Node[] = [];

  /**
   * @param _find - The preview's card, where it is found
   * @param _editor - The editor, whose dialog is as far up as anything is watched
   */
  constructor(
    private readonly _find: () => HTMLElement | undefined,
    private readonly _editor?: Element,
  ) {}

  /**
   * Shows the preview in a layout, or as Home Assistant configured it.
   *
   * @param want - The layout and configuration, or `undefined` for the card as written
   */
  sync(want: ScopePreviewWant | undefined): void {
    this._want = want;
    if (want === undefined) {
      this._release();
      return;
    }
    this._apply();
  }

  /** Lets go of the card, giving it back the configuration as written. */
  private _release(): void {
    const card = this._card;
    const shown = this._shown;
    this._watch?.disconnect();
    this._watch = this._card = this._shown = undefined;
    this._roots = [];
    // A card Home Assistant has already replaced is gone, and its replacement was never touched.
    if (card?.isConnected && shown !== undefined) card.setConfig?.(shown.config);
  }

  /** Configures the card found now, where it is not already showing what is wanted. */
  private _apply = (): void => {
    const want = this._want;
    if (want === undefined) return;
    const card = this._find() as ConfigurableCard | undefined;
    if (card === undefined || typeof card.setConfig !== 'function') return;
    const roots = shadowRoots(card, this._editor);
    if (roots.length !== this._roots.length || roots.some((root, at) => root !== this._roots[at])) {
      this._watch?.disconnect();
      this._roots = roots;
      this._watch = new MutationObserver(this._apply);
      for (const root of roots) this._watch.observe(root, { childList: true, subtree: true });
    }
    if (
      card === this._card &&
      this._shown?.view === want.view &&
      this._shown.config === want.config
    ) {
      return;
    }
    this._card = card;
    this._shown = want;
    card.setConfig({ ...want.config, view: want.view });
  };
}

/**
 * The shadow roots an element sits in, its own first, up to and including the first one that also
 * holds `near`; the document is never one of them.
 *
 * @param element - The element
 * @param near - The element whose roots end the climb, where given
 * @returns The roots
 */
function shadowRoots(element: Element, near?: Element): ShadowRoot[] {
  const stops = new Set<Node>();
  for (let root = near?.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) {
    stops.add(root);
  }
  const roots: ShadowRoot[] = [];
  for (
    let root = element.getRootNode();
    root instanceof ShadowRoot;
    root = root.host.getRootNode()
  ) {
    roots.push(root);
    if (stops.has(root)) break;
  }
  return roots;
}
