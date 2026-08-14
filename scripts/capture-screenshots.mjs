#!/usr/bin/env node
/**
 * Capture documentation screenshots from the live Home Assistant demo dashboard.
 *
 * The published screenshots are not decoration — `docs/reference/examples.md` prints the
 * YAML beside them, so an image and its config have to stay in step. They are captured
 * from persistent dashboard tabs whose cards hold exactly those configs, which is what
 * makes a retake reproducible rather than a fresh act of art direction. The demo
 * calendars carry weekly-recurring events, so the same week renders every week.
 *
 * The card is not driven by viewport width directly: Home Assistant's own sections grid
 * changes its column count at its own breakpoints, so viewport→card width is *not*
 * monotonic — an 800px viewport can yield a wider card than a 900px one. That is why each
 * width-sensitive shot carries an `expect`, asserted against the rendered DOM, and why
 * widths are re-derived with `--probe` rather than reasoned about.
 *
 * Usage:
 *   HA_TOKEN=<long-lived token> node scripts/capture-screenshots.mjs [--only <id>] [--list]
 *
 * Optional environment:
 *   HA_URL     Base URL of the instance      (default http://homeassistant.local:8123)
 *   OUT_DIR    Where PNGs are written        (default .github/img)
 *   HA_THEME   'dark' or 'light'             (default dark)
 *
 * The token is read from the environment and never written to disk or to the captured
 * image. Revoke it in Profile → Security when a capture run is finished.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Playwright is deliberately *not* a dependency of this repo.
 *
 * Its postinstall downloads a browser, which every `npm ci` in CI would then pay for on a
 * package no gate uses. Install it where you capture instead: `npm i -g playwright` or
 * `npx playwright install chromium`.
 */
async function loadChromium() {
  // Resolvable from the repo (someone installed it here, or set NODE_PATH).
  try {
    return (await import('playwright')).chromium;
  } catch {
    /* fall through to the global lookup */
  }

  // A global install is the documented route, but Node's ESM resolver does not consult
  // the global root — so resolve it explicitly rather than telling the reader to run a
  // command that then does not work. Playwright's entry point is CommonJS, and importing
  // it by file URL puts the exports on `default` rather than exposing them as named ones.
  try {
    const { execSync } = await import('node:child_process');
    const { pathToFileURL } = await import('node:url');
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const entry = pathToFileURL(path.join(root, 'playwright', 'index.js')).href;
    const mod = await import(entry);
    const chromium = mod.chromium ?? mod.default?.chromium;
    if (chromium) return chromium;
  } catch {
    /* fall through to the error */
  }

  console.error(
    'Playwright is not installed. It is not a dependency of this repo — install it where\n' +
      'you capture:  npm i -g playwright && npx playwright install chromium',
  );
  process.exit(1);
}

const HA_URL = process.env.HA_URL ?? 'http://homeassistant.local:8123';
const OUT_DIR = process.env.OUT_DIR ?? '.github/img';
const HA_THEME = process.env.HA_THEME === 'light' ? 'light' : 'dark';
const TOKEN = process.env.HA_TOKEN;

/** The card element the card registers under. The dev build renames itself. */
const CARD_TAG = 'calendar-card-pro-dev';

/**
 * Device scale factor for the list-view captures.
 *
 * The list release views are `max_columns: 1` sections, and Home Assistant caps a section
 * column at 500 CSS px — the card cannot be made wider without changing the dashboard
 * layout. Every published list screenshot is 1600px wide, and 500 × 3.2 is exactly that,
 * so the retakes drop in beside the originals at the same resolution. Column-view cards
 * are not capped (their section spans the full width) and stay at the default 2.
 */
const LIST_SCALE = 3.2;

/**
 * One entry per published screenshot.
 *
 * `view` is the dashboard path, `index` the zero-based position among the calendar cards
 * in that view, and `out` the filename in OUT_DIR. `width` is the viewport width, which
 * for column view is the whole point — the layout drops columns as it narrows, so the
 * width is part of the config being photographed.
 */
const SHOTS = [
  // --- Column view (new in v4.0.0) -----------------------------------------
  {
    id: 'column-basic',
    view: 'ccp-release-column',
    index: 0,
    out: 'example_column_basic.png',
    width: 1800,
    note: 'Three days side by side, minimal config',
  },
  // The three-width series. One card, three viewports: the responsive behaviour is the
  // most distinctive thing about the layout and the only way to show it is to photograph
  // the same config at the widths where it changes. `expect` is asserted against the
  // rendered DOM after capture, so a config change that moves a breakpoint is reported
  // rather than silently producing the wrong picture. Re-derive widths with --probe.
  {
    id: 'column-week',
    view: 'ccp-release-column',
    index: 1,
    out: 'example_column_week.png',
    width: 1600,
    expect: 7,
    note: 'Seven columns — the full week',
  },
  {
    id: 'column-week-medium',
    view: 'ccp-release-column',
    index: 1,
    out: 'example_column_week_medium.png',
    width: 1200,
    expect: 5,
    note: 'Same card, narrower — columns given up one at a time',
  },
  {
    id: 'column-week-list',
    view: 'ccp-release-column',
    index: 1,
    out: 'example_column_week_list.png',
    width: 400,
    expect: 'list',
    note: 'Same card on a phone — fallen back to the list layout',
  },
  {
    id: 'column-styling',
    view: 'ccp-release-column',
    index: 2,
    out: 'example_column_styling.png',
    width: 1200,
    note: 'Accent colors, event backgrounds, day-header rule',
  },
  {
    id: 'column-weather',
    view: 'ccp-release-column',
    index: 3,
    out: 'example_column_weather.png',
    width: 1200,
    note: 'Weather on the day header and on each event',
  },
  {
    id: 'column-complete',
    view: 'ccp-release-column',
    index: 4,
    out: 'example_column_complete.png',
    width: 1600,
    expect: 7,
    note: 'Countdown, progress bar row, weather, today indicator, week numbers',
  },

  // --- Existing list-view screenshots, restaged for the v4 defaults --------
  //
  // `event_icon_vertical_alignment` moved from `middle` to `top` in v4.0.0, which is
  // invisible until a row wraps and then changes every wrapped location row — see backlog
  // E13. Eight of the eleven published images were captured under the old default.
  //
  // The theme is a property of the *view*, not something to emulate: `ccp-release-basic`
  // sets none and so renders stock, `ccp-release-advanced` sets the iOS dark theme and
  // `ccp-release-complete` sets Bubble. That is why the same basic card appears twice
  // below from two different views — it is how the native/iOS pair has always been made.
  // `theme` here only picks the light or dark side of the *stock* theme, which matters
  // for the one view that sets none.
  {
    id: 'basic-native',
    view: 'ccp-release-basic',
    index: 0,
    out: 'example_1_basic_native.png',
    width: 840,
    scale: LIST_SCALE,
    theme: 'light',
    note: 'Basic configuration, stock theme',
  },
  {
    id: 'basic-ios',
    view: 'ccp-release-advanced',
    index: 0,
    out: 'example_1_basic_ios.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Basic configuration, iOS dark theme',
  },
  {
    id: 'advanced-compact',
    view: 'ccp-release-advanced',
    index: 1,
    out: 'example_2_advanced_compact.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Multiple calendars, compact mode collapsed',
  },
  {
    id: 'advanced-expanded',
    view: 'ccp-release-advanced',
    index: 1,
    out: 'example_2_advanced_expanded.png',
    width: 840,
    scale: LIST_SCALE,
    expand: true,
    note: 'The same card after a tap — tap_action: expand',
  },
  {
    id: 'custom-styling',
    view: 'ccp-release-advanced',
    index: 2,
    out: 'example_3_custom_styling.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Multiple calendars with custom styling',
  },
  {
    id: 'week-numbers',
    view: 'ccp-release-advanced',
    index: 3,
    out: 'example_4_week_numbers.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Week numbers and separators',
  },
  {
    id: 'today-indicator',
    view: 'ccp-release-advanced',
    index: 4,
    out: 'example_today_indicator.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Today indicator, countdown and progress bar',
  },
  {
    id: 'weather',
    view: 'ccp-release-advanced',
    index: 5,
    out: 'example_weather.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Weather integration',
  },
  // The editor is not a dashboard card, so it needs its own path: enter the view's edit
  // mode, click the card's edit wrapper, and photograph the dialog. `card` is the index
  // among *all* cards in the section including headings, which is why it is not the same
  // number as `index` elsewhere in this file.
  {
    id: 'editor',
    view: 'ccp-release-advanced',
    editorCard: 1,
    out: 'example_editor.png',
    width: 1400,
    height: 1150,
    dark: true,
    note: 'The visual editor, nine panels and a live preview',
  },
  {
    id: 'complete',
    view: 'ccp-release-complete',
    index: 0,
    out: 'example_5_complete.png',
    width: 840,
    scale: LIST_SCALE,
    note: 'Complete configuration, Bubble theme',
  },
];

/**
 * Seed the frontend's auth so the dashboard renders instead of redirecting to /auth.
 *
 * The frontend reads `hassTokens` from localStorage. A long-lived token has no refresh
 * flow, so `expires` is pushed far out and the token doubles as its own refresh token —
 * the frontend never exercises that path within a capture run.
 */
async function authenticate(page) {
  // Seed the token on a static asset rather than on `/`. The app root redirects to
  // /auth/authorize as soon as its JS runs, and that navigation races the evaluate below
  // ("Execution context was destroyed"). `manifest.json` is served from the same origin,
  // so localStorage is the same store, and it runs no application code at all.
  await page.goto(`${HA_URL}/manifest.json`, { waitUntil: 'load' });
  await page.evaluate(
    ([url, token]) => {
      window.localStorage.setItem(
        'hassTokens',
        JSON.stringify({
          access_token: token,
          token_type: 'Bearer',
          expires_in: 1_800,
          hassUrl: url,
          clientId: null,
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
          refresh_token: token,
        }),
      );
    },
    [HA_URL, TOKEN],
  );
}

/**
 * Resolve the nth calendar card in a view.
 *
 * The card lives under nested shadow roots, so it cannot be reached with a CSS selector.
 * Playwright pierces open shadow DOM for its own locators, which is enough here.
 */
async function findCard(page, index) {
  const cards = page.locator(CARD_TAG);
  await cards.nth(index).waitFor({ state: 'visible', timeout: 20_000 });
  return cards.nth(index);
}

/**
 * Report what the card actually did at the current viewport width.
 *
 * The breakpoints are not worth deriving by hand: they depend on `min_day_width`,
 * `day_spacing` and the card's own padding, and the card re-measures itself after paint.
 * Reading the rendered DOM is both simpler and honest about what a reader will see.
 *
 * `.column-view` is the wrapper class the card sets for the column layout and drops for
 * the list layout (`viewCssClass` in `src/config/view.ts`), so its absence *is* the
 * fallback having fired.
 */
async function describeLayout(card) {
  const isColumn = (await card.locator('.column-view').count()) > 0;
  if (!isColumn) return { mode: 'list', columns: 0 };
  return { mode: 'column', columns: await card.locator('.day-column').count() };
}

/**
 * Sweep viewport widths and report the layout at each, so the three-width series can be
 * pinned to widths that demonstrably produce the intended layouts.
 */
async function probe(page, shot, widths) {
  console.log(`Probing ${shot.id} (${shot.view} #${shot.index})\n`);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1200 });
    await page.goto(`${HA_URL}/dashboard-admin/${shot.view}`, { waitUntil: 'domcontentloaded' });
    const card = await findCard(page, shot.index);
    await settle(page, card);
    const layout = await describeLayout(card);
    const box = await card.boundingBox();
    console.log(
      `  viewport ${String(width).padStart(5)}px  card ${String(Math.round(box?.width ?? 0)).padStart(5)}px  ` +
        `${layout.mode === 'list' ? 'LIST (fallback)' : `${layout.columns} columns`}`,
    );
  }
}

/**
 * Wait for the card to stop resizing.
 *
 * The card fetches events after first paint and then settles its column count against a
 * measured width, so the rendered output is not final at load.
 */
async function settle(page, card) {
  let previous = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(250);
    const box = await card.boundingBox();
    if (!box) continue;
    const signature = `${Math.round(box.width)}x${Math.round(box.height)}`;
    if (signature === previous && box.height > 40) break;
    previous = signature;
  }
}

/**
 * Photograph the card-configuration dialog.
 *
 * Home Assistant renders the dialog into the top layer, and its surface carries no stable
 * class or role that Playwright can resolve — `.mdc-dialog__surface`, `[role="dialog"]`
 * and a geometry sweep of every shadow root all come back empty. What *is* stable is the
 * dialog's own furniture, so the crop is derived from the title and the footer buttons
 * plus the dialog's measured inset. That survives Home Assistant renaming its internals,
 * which it does between releases.
 *
 * In edit mode each card is wrapped in `hui-card-edit-mode`, which intercepts pointer
 * events — clicking the card itself times out. The wrapper is the click target, and it
 * wraps *every* card including headings, so the index is not the calendar-card index.
 */
async function captureEditor(page, shot) {
  await page.goto(`${HA_URL}/dashboard-admin/${shot.view}?edit=1`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(6000);

  await page.locator('hui-card-edit-mode').nth(shot.editorCard).click();
  await page.waitForTimeout(7000);

  const title = await page.getByText('Calendar Card Pro card configuration').first().boundingBox();
  const save = await page.getByText('Save', { exact: true }).first().boundingBox();
  const code = await page.getByText('Show code editor', { exact: true }).first().boundingBox();
  if (!title || !save || !code) throw new Error('editor dialog did not open');

  const left = code.x - 16;
  const clip = {
    x: left,
    y: title.y - 19,
    width: save.x + save.width + 16 - left,
    height: save.y + save.height + 12 - (title.y - 19),
  };

  const target = path.join(OUT_DIR, shot.out);
  await page.screenshot({ path: target, clip });
  console.log(
    `  \u2713 ${shot.out.padEnd(34)} ${String(Math.round(clip.width)).padStart(4)}x${String(
      Math.round(clip.height),
    ).padStart(4)}         ${shot.note}`,
  );
  // Nothing is saved: the context is discarded without touching Save.
}

async function capture(page, shot) {
  const theme = shot.theme ?? HA_THEME;
  await page.setViewportSize({ width: shot.width, height: 1200 });
  await page.emulateMedia({ colorScheme: theme });

  await page.goto(`${HA_URL}/dashboard-admin/${shot.view}`, { waitUntil: 'domcontentloaded' });

  const card = await findCard(page, shot.index);
  await settle(page, card);

  // An expanded compact card is a second screenshot of the same card, reached by tapping
  // it — `tap_action: expand`. Without this the collapsed and expanded shots are identical.
  if (shot.expand) {
    await card.click();
    await settle(page, card);
  }

  const layout = await describeLayout(card);
  if (shot.expect) {
    const actual = layout.mode === 'list' ? 'list' : `${layout.columns}`;
    if (actual !== String(shot.expect)) {
      console.warn(
        `  ! ${shot.out}: expected ${shot.expect}, rendered ${actual} — re-probe the widths.`,
      );
    }
  }

  const target = path.join(OUT_DIR, shot.out);
  await card.screenshot({ path: target, scale: 'device' });
  const box = await card.boundingBox();
  console.log(
    `  ✓ ${shot.out.padEnd(34)} ${String(Math.round(box.width)).padStart(4)}x${String(
      Math.round(box.height),
    ).padStart(4)}  ${layout.mode === 'list' ? 'list' : `${layout.columns} col`}  ${shot.note}`,
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    for (const shot of SHOTS)
      console.log(`${shot.id.padEnd(20)} ${shot.out.padEnd(34)} ${shot.note}`);
    return;
  }

  if (!TOKEN) {
    console.error('HA_TOKEN is not set. Create a long-lived access token in Profile → Security.');
    process.exitCode = 1;
    return;
  }

  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex === -1 ? null : args[onlyIndex + 1];

  const probeIndex = args.indexOf('--probe');
  const probeId = probeIndex === -1 ? null : args[probeIndex + 1];

  const selected = only ? SHOTS.filter((s) => s.id === only) : SHOTS;

  if (!probeId && selected.length === 0) {
    console.error(`No screenshot matches --only ${only}. Run with --list to see the ids.`);
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  const chromium = await loadChromium();
  const browser = await chromium.launch();

  // A context per shot rather than one for the whole run. Two reasons: `deviceScaleFactor`
  // is fixed at context creation and differs per shot, and a fresh context guarantees no
  // state carries over — an expanded compact card must not leak into the next capture.
  const withPage = async (shot, fn) => {
    const context = await browser.newContext({
      deviceScaleFactor: shot.scale ?? 2,
      viewport: { width: shot.width ?? 1600, height: shot.height ?? 1200 },
      colorScheme: shot.dark ? 'dark' : undefined,
    });
    const page = await context.newPage();
    await authenticate(page);
    const result = await fn(page);
    await context.close();
    return result;
  };

  try {
    if (probeId) {
      const shot = SHOTS.find((s) => s.id === probeId);
      if (!shot) {
        console.error(`No screenshot matches --probe ${probeId}. Run --list to see the ids.`);
        process.exitCode = 1;
        return;
      }
      await withPage(shot, (page) =>
        probe(
          page,
          shot,
          [1800, 1600, 1400, 1200, 1100, 1000, 900, 800, 700, 600, 500, 440, 400, 380, 360, 340],
        ),
      );
      return;
    }

    console.log(`Capturing ${selected.length} screenshot(s) from ${HA_URL} into ${OUT_DIR}\n`);
    for (const shot of selected)
      await withPage(shot, (page) =>
        (shot.editorCard === undefined ? capture : captureEditor)(page, shot),
      );
    console.log('\nDone.');
  } finally {
    await browser.close();
  }
}

await main();
