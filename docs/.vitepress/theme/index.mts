import DefaultTheme from 'vitepress/theme';
import { useRoute, type Theme } from 'vitepress';
import { defineComponent, h, nextTick, onMounted, watch } from 'vue';
import './custom.css';

/**
 * The feature pages show short clips that play by themselves. With reduced motion turned on in
 * the reader's system they stay on their first frame until the reader presses play, as the card
 * itself holds still under that setting.
 */
function holdClipsStill(): void {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const video of document.querySelectorAll<HTMLVideoElement>('.vp-doc video[autoplay]')) {
    video.autoplay = false;
    video.pause();
    video.currentTime = 0;
  }
}

const Layout = defineComponent({
  setup(_, { slots }) {
    const route = useRoute();
    onMounted(holdClipsStill);
    watch(
      () => route.path,
      () => nextTick(holdClipsStill),
    );
    return () => h(DefaultTheme.Layout, null, slots);
  },
});

export default { extends: DefaultTheme, Layout } satisfies Theme;
