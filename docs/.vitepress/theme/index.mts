import DefaultTheme from 'vitepress/theme';
import { useRoute, type Theme } from 'vitepress';
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import './custom.css';

/**
 * Start and stop the feature pages' clips (`video.clip`). The markup carries no autoplay, so
 * nothing moves before this runs: a clip plays while it is on screen and the reader's system
 * allows motion, and pauses when it scrolls away. With reduced motion turned on it stays on its
 * first frame until the reader presses play, as the card itself holds still under that setting.
 * A clip the reader paused stays paused. Returns a function that undoes it, for the next page.
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
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const clip = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) visible.add(clip);
        else visible.delete(clip);
        sync(clip);
      }
    },
    { threshold: 0.25 },
  );

  for (const clip of clips) {
    clip.addEventListener('pause', onPause);
    clip.addEventListener('play', onPlay);
    observer.observe(clip);
  }
  motion.addEventListener('change', onMotion);
  return () => {
    observer.disconnect();
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
    let unwire = (): void => undefined;
    const rewire = (): void => {
      unwire();
      unwire = wireClips();
    };
    onMounted(rewire);
    watch(
      () => route.path,
      () => nextTick(rewire),
      { flush: 'post' },
    );
    onBeforeUnmount(() => unwire());
    return () => h(DefaultTheme.Layout, null, slots);
  },
});

export default { extends: DefaultTheme, Layout } satisfies Theme;
