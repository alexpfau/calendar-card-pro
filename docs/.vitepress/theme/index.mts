import DefaultTheme from 'vitepress/theme';
import { inBrowser, useRoute, useRouter, type Theme } from 'vitepress';
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import './custom.css';
import MOVED from '../moved-anchors.json';

/**
 * Where a section that moved to another page now lives, for a link written before it moved: the
 * release notes on GitHub, issue comments, and the Documentation links in an editor already
 * installed. `moved-anchors.json` maps `/page#anchor` to the new `/page#anchor`, or to a bare
 * `/page` where the section became the page. It only fires for an anchor the page no longer has,
 * so a heading that comes back wins over its forward. `check:docs` holds the map to that rule
 * and resolves every target.
 *
 * @param path - The route, as the router reports it
 * @param hash - `location.hash`, with its `#`
 * @returns The address to go to instead, or `undefined`
 */
function movedTo(path: string, hash: string): string | undefined {
  if (hash.length < 2) return undefined;
  const anchor = decodeURIComponent(hash.slice(1));
  if (document.getElementById(anchor) !== null) return undefined;
  const page = path.replace(/\.html$/, '').replace(/\/index$/, '/');
  return (MOVED as Record<string, string>)[`${page}#${anchor}`];
}

/**
 * Start and stop the feature pages' clips (`video.clip`). The markup carries no autoplay, so
 * nothing moves before this runs: a clip plays while it is on screen and the reader's system
 * allows motion, and pauses when it scrolls away. With reduced motion turned on it stays on its
 * first frame until the reader presses play, as the card itself holds still under that setting.
 * A clip the reader paused stays paused. Returns a function that undoes it, for the next page.
 *
 * A clip counts as on screen by the observer's `isIntersecting`, reported as it crosses a quarter
 * of its area. A portrait journey (`video.clip.portrait`) fills most of a phone's screen, so a
 * sliver of it at the screen's edge would start it while the reader is still on the text above.
 * It has an observer of its own and counts as on screen only while at least half of it is, read
 * from `intersectionRatio`.
 */
function wireClips(): () => void {
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
  const clips = [...document.querySelectorAll<HTMLVideoElement>('.vp-doc video.clip')];
  const visible = new Set<HTMLVideoElement>();
  const heldByReader = new WeakSet<HTMLVideoElement>();
  const ourPause = new WeakSet<HTMLVideoElement>();

  const sync = (clip: HTMLVideoElement): void => {
    if (motion.matches && visible.has(clip) && !heldByReader.has(clip)) {
      void clip.play().catch(() => undefined);
    } else if (!clip.paused) {
      ourPause.add(clip);
      clip.pause();
    }
  };
  const onPause = (ev: Event): void => {
    const clip = ev.target as HTMLVideoElement;
    if (ourPause.has(clip)) ourPause.delete(clip);
    else heldByReader.add(clip);
  };
  const onPlay = (ev: Event): void => {
    heldByReader.delete(ev.target as HTMLVideoElement);
  };
  const onMotion = (): void => clips.forEach(sync);
  const watchClips = (
    threshold: number | number[],
    onScreen: (entry: IntersectionObserverEntry) => boolean,
  ): IntersectionObserver =>
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const clip = entry.target as HTMLVideoElement;
          if (onScreen(entry)) visible.add(clip);
          else visible.delete(clip);
          sync(clip);
        }
      },
      { threshold },
    );
  const landscape = watchClips(0.25, (entry) => entry.isIntersecting);
  const portrait = watchClips([0, 0.5], (entry) => entry.intersectionRatio >= 0.5);

  for (const clip of clips) {
    clip.addEventListener('pause', onPause);
    clip.addEventListener('play', onPlay);
    (clip.classList.contains('portrait') ? portrait : landscape).observe(clip);
  }
  motion.addEventListener('change', onMotion);
  return () => {
    landscape.disconnect();
    portrait.disconnect();
    motion.removeEventListener('change', onMotion);
    for (const clip of clips) {
      clip.removeEventListener('pause', onPause);
      clip.removeEventListener('play', onPlay);
    }
  };
}

const Layout = defineComponent({
  setup(_, { slots }) {
    const route = useRoute();
    const router = useRouter();
    const forward = (): void => {
      if (!inBrowser) return;
      const target = movedTo(route.path, window.location.hash);
      if (target !== undefined) void router.go(target);
    };
    let unwire = (): void => undefined;
    const rewire = (): void => {
      unwire();
      unwire = wireClips();
    };
    onMounted(() => {
      rewire();
      forward();
    });
    watch(
      () => route.path,
      () =>
        nextTick(() => {
          rewire();
          forward();
        }),
      { flush: 'post' },
    );
    onBeforeUnmount(() => unwire());
    return () => h(DefaultTheme.Layout, null, slots);
  },
});

export default { extends: DefaultTheme, Layout } satisfies Theme;
