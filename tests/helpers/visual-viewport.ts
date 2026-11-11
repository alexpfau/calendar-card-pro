import { onTestFinished } from 'vitest';

/**
 * A phone's visual viewport, which its on-screen keyboard shrinks, for the panels that stand
 * above the keyboard (`popover-shell.ts`).
 *
 * Most mobile browsers shrink only the visual viewport for the keyboard, so the window keeps its
 * height while `visualViewport.height` drops by the keyboard's, and `offsetTop` grows where the
 * browser pans the page to keep a field in view. happy-dom has no visual viewport, so this one is
 * installed on the window for the test and removed once it finishes. Install it before the panel
 * opens: the panel takes hold of the visual viewport as it opens.
 *
 * @returns The viewport, with `keyboard` to set the band of the window in sight, `pan` to move
 *   that band down as a browser pans, and `listening` to count the listeners left on it
 */
export function fakeViewport() {
  const listeners = new Map<string, Set<() => void>>();
  const viewport = {
    offsetTop: 0,
    height: window.innerHeight,
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
    listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    /**
     * Sets the band of the window in sight: `px` out of sight at its foot, under the keyboard,
     * and `offsetTop` out of sight at its top. 0 and 0 lower the keyboard.
     *
     * @param px - How much of the window's foot is out of sight
     * @param offsetTop - How much of its top is out of sight
     */
    keyboard(px: number, offsetTop = 0) {
      viewport.offsetTop = offsetTop;
      viewport.height = window.innerHeight - px - offsetTop;
      listeners.get('resize')?.forEach((listener) => listener());
    },
    /**
     * Pans the band in sight down the window, as a browser does to keep a field in view above the
     * keyboard: the band keeps its height, and the visual viewport says so with a scroll.
     *
     * @param offsetTop - How far down the window the band now starts
     */
    pan(offsetTop: number) {
      viewport.offsetTop = offsetTop;
      listeners.get('scroll')?.forEach((listener) => listener());
    },
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  onTestFinished(() => {
    delete (window as { visualViewport?: unknown }).visualViewport;
  });
  return viewport;
}
