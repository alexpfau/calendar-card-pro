import { defineConfig } from 'vitepress';

const REPO = 'https://github.com/alexpfau/calendar-card-pro';

/**
 * Strip emoji and keycap section numbers so they never reach a URL.
 *
 * VitePress keeps emoji in heading slugs, which produces fragments like
 * `#📅-calendar-events-display`. GitHub strips them, so removing them here
 * keeps anchors ASCII, copy-pasteable, and identical to the anchors the README
 * has always used.
 */
function stripDecorations(str: string): string {
  return str
    .replace(/[0-9]\uFE0F?\u20E3/gu, '') // keycap section numbers, e.g. 4️⃣
    .replace(/\p{Extended_Pictographic}/gu, '') // emoji
    .replace(/[\uFE0E\uFE0F]/gu, ''); // stray variation selectors
}

/** VitePress's default slugify, applied after decorations are removed. */
function slugify(str: string): string {
  return stripDecorations(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

export default defineConfig({
  title: 'Calendar Card Pro',
  description:
    'A sleek, fast and highly customizable calendar card for Home Assistant. Display upcoming events beautifully.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  // Fail the build on broken internal links. This is the main reason the site
  // is worth having: the README's anchors could only ever be checked by hand.
  ignoreDeadLinks: false,

  // Internal engineering docs live in the repo for contributors but must not
  // deploy to the public site. column-view.md is a v4.0.0 design plan that
  // states up front it is "not user documentation"; published, it was reachable
  // and indexable, describing an unbuilt feature as though it existed.
  srcExclude: ['development/**'],

  markdown: {
    anchor: { slugify },

    // Home Assistant templates ({{ ... }}) appear throughout these docs and Vue
    // would otherwise try to evaluate them as expressions. Fenced blocks are
    // already v-pre'd by VitePress; this extends the same treatment to inline
    // code so `{{` can be written in prose without escaping.
    config(md) {
      const defaultRender =
        md.renderer.rules.code_inline ??
        ((tokens, idx, _o, _e, self) => self.renderToken(tokens, idx, _o));
      md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
        tokens[idx].attrSet('v-pre', '');
        return defaultRender(tokens, idx, options, env, self);
      };
    },
  },

  head: [
    // Favicon order matters. Browsers pick the best-matching <link rel="icon">
    // and, on a tie, the last one — so SVG-capable browsers take the SVG below.
    // The ICO must use a plain rel="icon": rel="alternate icon" is not in the
    // WHATWG spec and Safari (which gained SVG favicon support only in 26.0)
    // does not reliably fall back to it, leaving older Safari with no icon.
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: '32x32' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }],
    ['meta', { name: 'theme-color', content: '#03a9f4' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Calendar Card Pro for Home Assistant' }],
    [
      'meta',
      {
        property: 'og:image',
        content:
          'https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/.github/img/header.png',
      },
    ],
  ],

  themeConfig: {
    search: { provider: 'local' },

    nav: [
      { text: 'Guide', link: '/guide/installation', activeMatch: '/guide/' },
      { text: 'Features', link: '/features/editor', activeMatch: '/features/' },
      { text: 'Reference', link: '/reference/configuration', activeMatch: '/reference/' },
      { text: "What's New", link: '/guide/whats-new' },
    ],

    sidebar: [
      {
        text: 'Guide',
        collapsed: false,
        items: [
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Usage', link: '/guide/usage' },
          { text: "What's New", link: '/guide/whats-new' },
        ],
      },
      {
        text: 'Essentials',
        collapsed: false,
        items: [
          { text: 'Visual Configuration Editor', link: '/features/editor' },
          { text: 'Core Settings', link: '/features/core-settings' },
          { text: 'Column View', link: '/features/column-view' },
          { text: 'Event Content & Display', link: '/features/event-content' },
          { text: 'Layout & Appearance', link: '/features/layout-appearance' },
        ],
      },
      {
        text: 'Going Further',
        collapsed: false,
        items: [
          { text: 'Dynamic Titles with Templates', link: '/features/title-templates' },
          { text: 'Split Multi-Day Events', link: '/features/multi-day-events' },
          { text: 'Dynamic Start Date', link: '/features/start-date-offset' },
          { text: 'Weather Integration', link: '/features/weather' },
          { text: 'Actions & Interactions', link: '/features/actions' },
        ],
      },
      {
        text: 'Advanced',
        collapsed: false,
        items: [
          { text: 'Theming & Card-Mod', link: '/features/theming' },
          { text: 'Performance & Caching', link: '/features/performance' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Configuration Options', link: '/reference/configuration' },
          { text: 'Examples', link: '/reference/examples' },
        ],
      },
      {
        text: 'Project',
        collapsed: false,
        items: [
          { text: 'Contributing & Roadmap', link: '/contributing' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Release Notes', link: '/RELEASE_NOTES' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: REPO }],

    editLink: {
      pattern: `${REPO}/edit/dev/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    outline: { level: [2, 3] },

    footer: {
      message: `Released under the <a href="${REPO}/blob/main/LICENSE">MIT License</a>.`,
      copyright: `Copyright © 2025–${new Date().getFullYear()} Alex Pfau`,
    },
  },
});
