/**
 * Ends the card ripple's press where the event that would end it never reaches the card.
 *
 * Home Assistant's ripple, `ha-ripple`, follows a press through the events on its control,
 * `ha-card`. It begins on the pointer-down and ends on what follows the lift: a finger's
 * `touchend`, or a mouse's or a pen's `click`. A browser sends a finger's `touchend` to the node
 * it went down on, and a `click` only where the press and the lift share a node, so either
 * reaches `ha-card` only while the node the press began on is still drawn. A render under the
 * press can take that node away. A swipe that pages to days already loaded draws them as the
 * pointer lifts, before either event is sent, and the ripple then holds its press, a tint over
 * the whole card, until the next touch on the card ends. It also ignores that touch's own press,
 * since it follows one pointer at a time.
 *
 * So the card notes each press that reaches `ha-card`, and once its pointer has lifted or been
 * canceled and the events that follow have been sent, it sends `ha-card` a `touchend` if neither
 * a `touchend` nor a `click` came. A browser sends a finger's `touchend`, and a mouse's or a pen's
 * `click`, in the same task as the pointer-up, so one task later is when to look; the `click` a
 * finger's tap derives comes later, after its `touchend`. Home Assistant's ripple ends a press on
 * a `touchend` whatever began it, for the controls whose click never comes, so this one event
 * serves a finger, a mouse and a pen alike. A press that ended as it should is left alone.
 *
 * The ripple follows one pointer at a time, and ignores a press by another until the one it
 * follows ends. So a press that begins before that task comes ends the lifted one first, which
 * the ripple hears before the new pointer-down, since the card's listener on `ha-card` was bound
 * before the ripple's. A press by another pointer while one is still held, such as a pen beside
 * a finger, is one the ripple ignores, so it is not followed here either.
 */

/** The press the ripple follows, and whether an event ending it reached the card. */
interface Press {
  pointerId: number;
  ended: boolean;
  /** `ha-card`, once the pointer has lifted or been canceled there. */
  liftedOn: Element | null;
}

/** Follows the presses that reach `ha-card`, and ends the ripple's where nothing else does. */
export class RippleRelease {
  private _press: Press | null = null;

  /**
   * A pointer went down on `ha-card`. The ripple follows a primary press of the main button, unless
   * another pointer's press is still held; a lifted press it has not heard the end of is ended
   * first.
   *
   * @param ev - The pointer-down reaching `ha-card`
   */
  pressed(ev: PointerEvent): void {
    if (ev.isPrimary === false) return;
    if (typeof ev.button === 'number' && ev.button !== 0) return;
    const last = this._press;
    if (last && !last.ended && !last.liftedOn && last.pointerId !== ev.pointerId) return;
    if (last) this._release(last);
    this._press = { pointerId: ev.pointerId, ended: false, liftedOn: null };
  }

  /** A `touchend` or a `click` reached `ha-card`, either of which ends the ripple's press. */
  heard(): void {
    if (this._press) this._press.ended = true;
  }

  /**
   * The press's pointer lifted or was canceled. One task later, once the events that follow it
   * have been sent, ends the ripple's press if none of them reached `ha-card`. Anything but a
   * pointer-up or a pointer-cancel is no end to a press, and is ignored.
   *
   * @param ev - The pointer-up or pointer-cancel reaching `ha-card`
   */
  lifted(ev: PointerEvent): void {
    if (ev.type !== 'pointerup' && ev.type !== 'pointercancel') return;
    const press = this._press;
    const control = ev.currentTarget;
    if (!press || press.pointerId !== ev.pointerId || !(control instanceof Element)) return;
    if (press.liftedOn) return;
    press.liftedOn = control;
    setTimeout(() => this._release(press), 0);
  }

  /**
   * Ends a lifted press the ripple has not heard the end of, by sending `ha-card` a `touchend`,
   * and stops following it.
   *
   * @param press - The press to end
   */
  private _release(press: Press): void {
    if (this._press === press) this._press = null;
    const control = press.liftedOn;
    if (press.ended || !control) return;
    press.ended = true;
    const ripple = Array.from(control.children).some((el) => el.localName === 'ha-ripple');
    if (ripple) control.dispatchEvent(new Event('touchend'));
  }
}
