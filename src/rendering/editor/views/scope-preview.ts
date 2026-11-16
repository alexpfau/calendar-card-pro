/**
 * The preview switch on Settings For: the card in Home Assistant's dialog drawn in the layout being
 * edited, without writing `view`.
 *
 * Nothing is sent to Home Assistant, so nothing a Save could keep changes. The editor hands the
 * preview's own card the configuration with `view` replaced, through the card's `setConfig`, which
 * is the one method every card has. The card is found as Pick From Preview finds it
 * (`pick.ts` › `findPreviewCard`). Home Assistant builds a new card element for every change in
 * preview mode and configures it before putting it in place, so this watches the card's parent as
 * the picker does and configures each replacement again once it arrives. Turned off, it hands the
 * card the configuration as written, unless Home Assistant has already replaced it.
 *
 * The card itself is unchanged: on a dashboard nothing calls it this way, so it costs the card
 * nothing.
 */

import type * as Types from '../../../config/types';

/** A card that takes a configuration. */
type ConfigurableCard = HTMLElement & { setConfig?: (config: unknown) => void };

/** What the preview should show while the switch is on. */
export interface ScopePreviewWant {
  /** The layout to draw. */
  readonly view: Types.EffectiveView;
  /** The configuration as written, which `view` is laid over. */
  readonly config: Readonly<Record<string, unknown>>;
}

/** Keeps the preview's card in the layout asked for while the switch is on. */
export class ScopePreview {
  private _want?: ScopePreviewWant;
  /** The card last configured, and with what, so a render that changes nothing does nothing. */
  private _card?: ConfigurableCard;
  private _shown?: ScopePreviewWant;
  private _watch?: MutationObserver;
  private _parent?: Node;

  /**
   * @param _find - The preview's card, where it is found
   */
  constructor(private readonly _find: () => HTMLElement | undefined) {}

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
    this._watch = this._parent = this._card = this._shown = undefined;
    // A card Home Assistant has already replaced is gone, and its replacement was never touched.
    if (card?.isConnected && shown !== undefined) card.setConfig?.(shown.config);
  }

  /** Configures the card found now, where it is not already showing what is wanted. */
  private _apply = (): void => {
    const want = this._want;
    if (want === undefined) return;
    const card = this._find() as ConfigurableCard | undefined;
    if (card === undefined || typeof card.setConfig !== 'function') return;
    if (card.parentNode && card.parentNode !== this._parent) {
      this._watch?.disconnect();
      this._parent = card.parentNode;
      this._watch = new MutationObserver(this._apply);
      this._watch.observe(card.parentNode, { childList: true });
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
