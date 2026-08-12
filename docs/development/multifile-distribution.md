# Multi-File Distribution via HACS — Feasibility

**Investigation date:** 2026-08-12
**Repo state read:** `alexpfau/calendar-card-pro` @ branch `alexpfau-multifile-distribution-feasibility` (based on `feature/column-view-v4`), package version `3.5.0`
**HACS source read:** `hacs/integration` @ `3249355704d1a716e637d4d044b6cb4ae72dc271` (2026-08-07, `main`)
**HA core read:** `home-assistant/core` @ `main` (shallow, 2026-08-12)
**HA frontend read:** `home-assistant/frontend` @ `main` (2026-08-12)
**Reference card read:** `dermotduffy/advanced-camera-card` (ex `frigate-hass-card`) @ tag `v7.27.4`

All measurements below were produced by real builds, in a scratch copy at `/tmp/ccp-exp`.
**The repository working tree was not modified.**

---

## 1. Verdict

**Yes. Multi-file distribution is viable, and the premise that it is impossible is wrong.**

The recorded belief — "HACS distributes one file" — is contradicted by HACS's own source and by
its own test suite. HACS downloads **every asset attached to the release**, not just the one named
in `hacs.json`. The `filename` key does not restrict what is downloaded; it selects which file gets
registered as the Lovelace resource.

It depends on four things, all of which I verified:

| Dependency | Status |
|---|---|
| HACS downloads sibling files | ✅ Proven in source **and** in HACS's own unit test |
| Relative `import()` resolves from `/hacsfiles/` | ✅ Proven in production by a card with ~85k installs/release |
| HA awaits an async `getConfigElement()` | ✅ Proven in HA frontend source |
| The `?hacstag=` double-evaluation trap is avoidable | ✅ **Reproduced in our build, then fixed and re-verified** |

**But the more useful finding is that we do not need most of it.** Home Assistant's per-language
runtime-fetch architecture solves a problem we do not have. Our card's own strings are **19,468 B
across all 35 languages**. The entire cost is the **editor** namespace — 87.3% of our translation
payload — and that is not a translation problem, it is a *lazy-loading* problem. One dynamic import
boundary, correctly placed, removes the editor **and** all of its translations from the eager path.

Measured, on our real bundle:

| Variant | Eager raw | Eager gzip | Δ gzip |
|---|---:|---:|---:|
| Baseline (today, single file) | 375,155 | 110,444 | — |
| **A** — lazy editor only | 334,855 | 98,101 | **−11.2%** |
| **B** — lazy editor **+ its translations** | 205,570 | 64,477 | **−41.6%** |

Variant B ships **3 files** totalling 376,598 B — 1,443 B (0.4%) more than today — while cutting
what every user downloads and parses on every dashboard load by **169,585 B raw / 45,967 B gzip**.

**Recommendation: adopt Variant B (Option 3 in §5).** It resolves the maintainer's dilemma outright:
the projected ~+18,000 B gzip cost of translating the new editor namespace across 11 languages moves
entirely off the eager path. Full language support *and* clear helper prose become free for the
~99% of users who never open the editor. Nothing has to be cut.

---

## 2. What HACS Actually Does

### 2.1 The `filename` key does not limit downloads

`update_filenames()` decides where content comes from:

> `hacs/integration custom_components/hacs/repositories/plugin.py:99-135` @ `3249355`
> ```python
> if specific_filename := self.repository_manifest.filename:
>     valid_filenames = (specific_filename,)
> ...
> if not content_in_root:
>     if self.releases.objects:
>         release = self.releases.objects[0]
>         if release.assets:
>             if assetnames := [...]:
>                 self.data.file_name = assetnames[0]
>                 self.content.path.remote = "release"
>                 return
> ```

Matching a release asset sets `content.path.remote = "release"`, which sets `content.single = True`
(`plugin.py:51-52`, and again on update at `plugin.py:84-85`). That is our situation today: our
release attaches `dist/calendar-card-pro.js` and `hacs.json` names it.

Download then goes here:

> `custom_components/hacs/repositories/base.py:616-651` @ `3249355`
> ```python
> if self.content.path.remote == "release" and version is not None:
>     contents = await self.release_contents(version)
> ...
> for content in contents:
>     if self.repository_manifest.content_in_root and self.repository_manifest.filename:
>         if content.name != self.repository_manifest.filename:
>             continue
>     download_queue.add(self.dowload_repository_content(content))
> ```

And `release_contents()` returns **every** asset:

> `base.py:1236-1253` @ `3249355`
> ```python
> return [
>     FileInformation(
>         url=asset.get("browser_download_url"),
>         path=asset.get("name"),
>         name=asset.get("name"),
>     )
>     for asset in release.data.get("assets", [])
> ]
> ```

The filter at `base.py:646` is the only thing that could narrow this, and it requires
`content_in_root` — which defaults to `False` (`base.py:218`) and which we do not set
(`alexpfau/calendar-card-pro hacs.json`, current `dev`/feature branch, is `{"name", "filename"}` only).

**So: adding assets to our release is sufficient. `hacs.json` needs no change at all.**

### 2.2 HACS's own test says so, including for non-JS files

> `hacs/integration tests/helpers/download/test_gather_files_to_download.py:92-101` @ `3249355`
> ```python
> def test_gather_plugin_files_from_release_multiple(repository_plugin):
>     repository.data.file_name = "test.js"
>     repository.data.releases = True
>     repository.releases.objects = [
>         GitHubReleaseModel({"tag_name": "3", "assets": [{"name": "test.js"}, {"name": "test.png"}]}),
>     ]
>     files = [x.name for x in repository.gather_files_to_download()]
>     assert "test.js" in files
>     assert "test.png" in files
> ```

A `.png` is asserted to be downloaded. Non-`.js` assets are explicitly supported, which is a stronger
guarantee than the documentation gives.

### 2.3 Documentation vs. code — where they disagree

The HACS plugin docs say *"All `.js` files it finds in the first location it finds one that matches
the name will be downloaded"* and *"If your plugin requires files that are not `js` files, place all
files (including the card file) in the `dist` directory."*

**The code is both broader and narrower than that, and the doc is misleading on two points:**

1. **Broader:** in the *release-asset* path the extension is irrelevant — every asset of any type is
   downloaded (§2.2). The doc's `.js`-only phrasing describes only the repository-tree path.
2. **Narrower:** the doc's `dist` advice implies a directory tree is fetched. It is not. The plugin
   tree walk only accepts files whose parent directory is exactly `""` or `"dist"`:

   > `base.py:1205-1222` @ `3249355`
   > ```python
   > if category == "plugin":
   >     for treefile in tree:
   >         if treefile.path in ["", "dist"]:
   > ```

   HACS's own test pins the consequence — a file in the repo root path does *not* pull in `dist/`:

   > `tests/helpers/download/test_gather_files_to_download.py:18-33` @ `3249355`
   > ```python
   > assert "dist/test.js" not in files
   > ```

   **`dist/translations/de.json` would never be fetched.** Subdirectories are not supported on the
   tree path, and release asset names cannot contain `/` at all.

**Finding: the HACS plugin namespace is FLAT.** Any multi-file scheme must use flat filenames
(`lang-de-<hash>.js`), not a directory layout. This is exactly what the reference card does, and it
is the single most important structural constraint. It also means the HA-style
`translations/<lang>.json` layout in the brief is not directly transplantable.

### 2.4 Where files land, and the resource URL

> `plugin.py:36` — `f"{config_path}/www/community/{full_name.split('/')[-1]}"`
> `custom_components/hacs/const.py:12` — `URL_BASE = "/hacsfiles"`
> `plugin.py:146-159` —
> ```python
> return f"/hacsfiles/{self.data.full_name.split('/')[1]}"          # namespace
> ...
> return (f"{namespace}/{filename}?hacstag={self.generate_dashboard_resource_hacstag()}")
> ```

For us: files land in `<config>/www/community/calendar-card-pro/` and are served from
`/hacsfiles/calendar-card-pro/`. Only the named `filename` gets a Lovelace resource entry; siblings
are simply present on disk, reachable by relative URL.

With `content.single = True`, every asset is written **flat** into that directory:

> `base.py:1268-1284` @ `3249355`
> ```python
> if self.content.single or content.path is None:
>     local_directory = self.content.path.local
> ```

### 2.5 `zip_release` exists but is the wrong tool for a card

`zip_release` takes a different branch (`base.py:964-967`) and `extractall`s into the local directory
(`base.py:594-598`), so it **can** create subdirectories. It requires `filename`
(`custom_components/hacs/validate/hacsjson.py:43-44`).

**But for a plugin it breaks resource registration.** `update_filenames()` would set
`data.file_name = "calendar-card-pro.zip"`, and `generate_dashboard_resource_url()` (`plugin.py:152`)
would register `/hacsfiles/calendar-card-pro/calendar-card-pro.zip?hacstag=…` as a `res_type: module`.
That is not loadable JavaScript.

Consistent with that, the search across popular cards found **no standalone Lovelace card using
`zip_release`** — the only confirmed user (`mrk-its/homeassistant-blitzortung`, `hacs.json`
`zip_release: true`, `filename: "blitzortung.zip"`) is an *integration*, a category where no Lovelace
resource is registered. **Do not use `zip_release`.** It is unnecessary: release assets already work.

### 2.6 Existence proof in production

`dermotduffy/advanced-camera-card` @ `v7.27.4` — 1,122★, and its release assets carry ~85,600
downloads *each*.

- `hacs.json` verbatim: `{"name": "Advanced Camera Card", "render_readme": true, "filename": "advanced-camera-card.js", "homeassistant": "2022.3.0"}` — **no `zip_release`, nothing special.**
- The release attaches **53 assets**, including `editor-fbc253d6.js` and `lang-ca-*.js`,
  `lang-de-*.js`, `lang-fr-*.js`, `lang-it-*.js`, `lang-pl-*.js`, `lang-pt-BR-*.js`, `lang-pt-PT-*.js`.
- I downloaded the registered entry file. It is **28 bytes**:
  ```js
  import"./card-294f2ffb.js";
  ```
- Lazy editor, from the shipped bundle:
  ```js
  async getConfigElement(){return await import("./editor-fbc253d6.js"),
    document.createElement("advanced-camera-card-editor")}
  ```
- Per-language loading, from the shipped bundle:
  ```js
  "ca"===t?lv[t]=await import("./lang-ca-f85ce535.js"):"de"===t?lv[t]=await import("./lang-de-6dc05ec2.js"):…
  ```
- **English is not among the language chunks** — I confirmed `abort:"Aborted action"` is inlined in
  the main chunk. English is the bundled guaranteed fallback; only non-English is split out. That is
  precisely the graceful-degradation design the brief asks about, already proven in the field.

The near-identical download counts (entry 87,402; `card-*.js` 85,710; `editor-*.js` 85,647) are
strong empirical evidence that HACS fetches every asset at install time — those chunks are not
reachable any other way in those volumes.

**Caveat worth stating plainly:** HACS downloads the lazy chunks to disk for *everyone*. The saving is
browser-side (network + parse + execute on every dashboard load), not disk-side. Disk usage goes up
slightly.

### 2.7 Upgrade, staleness and cleanup

This is where HACS behaves in a way that is convenient for us but should be understood:

> `base.py:951` — `if self.data.installed and not self.content.single:` → create `Backup`
> `base.py:987` — cleanup, same guard
> `custom_components/hacs/utils/backup.py:59-77` — `create()` does `copytree(...)` then **`shutil.rmtree(self.local_path)`**

In the **non-single** (repository-tree) path the local directory is moved away before download, so
removed files disappear. In the **release-asset** path — ours, and the reference card's —
`content.single` is `True`, so **no backup is taken and the directory is never wiped.** New assets are
written over the old; files that vanish from a later release are **left on disk forever**.

Consequences:

- **Upgrades are additive and safe.** A v3.x → v4.0 upgrade writes the new facade plus the new chunks
  alongside the old monolith. Nothing is deleted mid-flight, so there is no window where the resource
  URL points at a file that has been removed but its replacement not yet written.
- **Downgrades are safe.** Going back to a single-file version overwrites the entry and leaves the
  orphaned chunks; the old bundle never references them.
- **The cost is clutter**, not breakage — a few hundred KB of dead chunks accumulating across releases.
  Hashed names make this cosmetic rather than dangerous, but it never self-cleans short of a
  HACS remove-and-reinstall.
- `remove_local_directory()` is only reached from `uninstall()` (`base.py:753-757`), so a full
  uninstall/reinstall is the only cleanup path.

---

## 3. Failure Modes

### 3.1 The `?hacstag=` double-evaluation trap — the biggest risk, and I reproduced it

This is not hypothetical and it is not obvious. It is the failure mode that would have shipped.

HACS registers the resource with a cache-busting query (`plugin.py:150-159`,
`?hacstag=<repo_id><version digits>`). Relative specifiers inside a module resolve against the module
URL **with the query dropped**. So if a lazily-loaded chunk imports anything back from the *entry*
module, the browser fetches the entry a second time under a different URL — and treats it as a
**different module**, evaluating the entire card again.

For a card whose entry runs `@customElement(...)` / `customElements.define(...)` at module scope
(ours does — `src/calendar-card-pro.ts`), the second evaluation throws
`NotSupportedError: the name "calendar-card-pro" has already been used with this registry`, plus a
duplicated Lit class identity.

The reference card documents exactly this, in a comment that reads like it was written in blood:

> `dermotduffy/advanced-camera-card rollup.config.js` @ `v7.27.4`
> ```js
> // Specifically want a facade created as HACS will attach a hacstag
> // queryparameter to the resource. Without a facade when chunks re-import the
> // card chunk, they'll refer to a 'different' copy of the card chunk without
> // the hacstag, causing a re-download of the same content and functionality
> // problems.
> preserveEntrySignatures: 'strict',
> ```

**I hit it in our own build.** Naively splitting the editor out produced:

```
dist/index-BxJm-dmP.js  imports:  from"./calendar-card-pro.js"     ← the ?hacstag= URL
dist/index-jFjQXa1f.js  imports:  from"./calendar-card-pro.js"     ← same
```

Both chunks import back from the entry. That build would have broken the editor for every user.

**Verified fix.** Adding `preserveEntrySignatures: 'strict'` to `rollup.config.mjs` makes Rollup emit
a facade entry:

```
calendar-card-pro.js            41 B   ->  import"./calendar-card-pro-DeycQxjF.js";
calendar-card-pro-DeycQxjF.js   205,529 B  ->  import("./index-RGN0INY1.js")
index-RGN0INY1.js               171,028 B  ->  from"./calendar-card-pro-DeycQxjF.js"
```

The real code now lives in a hashed chunk that is only ever addressed by one URL, so it evaluates
once. This is the same 28-byte-stub shape the reference card ships, arrived at independently.
**Any implementation must include this and must assert on it in CI.**

### 3.2 A missing chunk (404)

Worse than the missing sourcemap in #315/#358, because a failed `import()` rejects. Realistic causes:
an incomplete release (asset upload failed), a user who hand-copies only the entry file, or a HACS
download that partially failed.

Severity depends entirely on where the boundary is:

- **Editor chunk 404s** → `getConfigElement()` rejects → the editor dialog fails to open. **The card
  itself keeps rendering.** HA's `loadConfigElement()` awaits it
  (`home-assistant/frontend src/panels/lovelace/editor/hui-element-editor.ts:370`), so the rejection
  surfaces as a dialog error, not a dashboard crash. This is a *degraded* failure and is acceptable.
- **A language chunk 404s** → if English is inlined and the loader falls back on rejection, the user
  sees English. Also degraded, not broken.
- **The main code chunk 404s** → the card is dead. But this is no worse than today: if
  `calendar-card-pro.js` fails to download today, the card is equally dead. The facade adds one extra
  file to that critical path, which is a real (small) increase in exposure.

**Graceful degradation is achievable and should be explicit**, not assumed:
```ts
try {
  await import('./rendering/editor/index');
} catch (e) {
  Logger.error('Editor failed to load', e);
  // surface a readable message rather than an unhandled rejection
}
```

Evidence it holds up in practice: across 1,122★, 53 chunks and ~85k installs per release, I searched
the reference card's issue tracker for `dynamically imported module`, `failed to load`, `404`,
`chunk` and found **no reports of chunk-load failure**. The hits were unrelated (media playback,
camera state). That is meaningful negative evidence. Conversely, their open issues **#2531/#2532/#2533**
("Bundle: lazy-load the nunjucks template engine", "lazy-load js-yaml", "replace lodash-es deep-ops")
show a mature project actively pushing *further* in this direction — they are not retreating from it.

### 3.3 Caching

`/hacsfiles/` is registered as a static path over `www/community`:

> `custom_components/hacs/base.py:1112-1117` @ `3249355` — `async_register_static_path(..., cache_headers=use_cache)`
> where `use_cache = self.core.lovelace_mode == "storage"` (`base.py:1105`)

and HA core sets:

> `home-assistant/core homeassistant/components/http/static.py:13-14` @ `main`
> ```python
> CACHE_TIME: Final = 31 * 86400  # = 1 month
> CACHE_HEADER = f"public, max-age={CACHE_TIME}"
> ```

**Sibling chunks are cached for a month and receive no `?hacstag=`.** A same-named chunk whose
contents changed would be served stale for up to 31 days.

**This makes content-hashed chunk filenames mandatory, not stylistic.** A new build produces a new
name, so a stale cache entry is simply never requested. Rollup's `[hash]` gives this for free (our
experiment produced `index-RGN0INY1.js` unprompted). It is also why the flat-namespace constraint
(§2.3) is survivable: hashes, not directories, provide the versioning.

### 3.4 Offline / reverse proxy / install type

`/hacsfiles/` is a path on the same origin as the dashboard, resolved relatively from the module URL.
It is not an absolute URL, not a CDN, and not dependent on the external base URL. It therefore works
identically across HA OS, Container, Core and Supervised, and behind a reverse proxy or a non-root
base path — because we never construct the path ourselves. This is a strong argument for the
**relative `import()` of a `.js` chunk over `fetch('/hacsfiles/…json')`**: the former inherits the
correct base automatically; the latter hardcodes an absolute path that a non-root deployment could
break. The reference card uses `import()` of `.js` for exactly its language files, not `fetch()` of
`.json`. **We should copy that choice.**

Offline is a non-issue: the files are on the HA server's local disk, served by HA itself. There is no
internet dependency at runtime.

---

## 4. The Upgrade Path for Existing Users

**Existing users need to do nothing, and the transition is safe for people who never read release notes.**

1. The registered Lovelace resource is `/hacsfiles/calendar-card-pro/calendar-card-pro.js?hacstag=…`.
   That filename **does not change** — it becomes a 41-byte facade instead of the whole bundle.
2. HACS rewrites the `hacstag` on upgrade (`plugin.py:137-144`, `update_dashboard_resources()` at
   `plugin.py:193-220`), so the browser re-fetches the entry. Users get the facade, which immediately
   pulls the hashed main chunk.
3. The old monolithic `calendar-card-pro.js` content is overwritten in place; the stale-file behaviour
   of §2.7 means nothing is deleted out from under a running dashboard.
4. YAML-mode dashboards manage resources by hand, but the URL is unchanged, so their hand-written
   resource entry keeps working. (In YAML mode `use_cache` is `False`, so chunks revalidate — even
   safer.)

Two residual risks, both minor:

- **A user who manually installed by copying one file** (not via HACS) will get a facade that imports
  a chunk they do not have. They see a broken card until they copy the rest. Mitigation: attach a
  `calendar-card-pro.zip` of `dist/` as an extra asset for manual installers — exactly what the
  reference card does (`advanced-camera-card.zip`, 108,958 downloads, notably *more* than the entry,
  which is what manual installs look like). Mention it in the release notes.
- **A stale browser cache of the old entry.** The `hacstag` changes on upgrade, so the entry itself is
  re-fetched. Not a concern.

For extra safety the first multi-file release could be a **minor**, not folded into an unrelated
patch, so the "unusual" release is identifiable if something does go wrong.

---

## 5. The Options, Compared

Measured on our real bundle. Baseline **375,155 B raw / 110,444 B gzip**. Translation facts I measured:
35 language files, **154,165 B** minified JSON total, of which the `editor` namespace across 11
languages is **134,587 B — 87.3%**; all card-facing strings across all 35 languages are **19,468 B**;
`en.json` is 11,841 B of which only **474 B** is card strings.

| # | Option | Eager gzip | Δ | Verdict |
|---|---|---:|---:|---|
| 1 | **Change nothing** | 110,444 | — | Rejected — but honestly the second-best option |
| 2 | Bundle English only, fetch other languages at runtime | ~106,400 | −3.7% | **Reject.** All the risk, almost none of the reward |
| 3 | **Lazy editor + editor translations** (multi-file) | **64,477** | **−41.6%** | **Recommended** |
| 3a | Lazy editor only | 98,101 | −11.2% | Good, but leaves 87% of the prize |
| 4 | Translate labels but not helper prose | ~104,000* | ~−6%* | **Reject.** Degrades the product to save little |
| 5 | Reduce prose | — | — | **Reject.** Same objection, less benefit |

\* projected from the brief's stated 67%-helper-prose split; not independently measured.

**Why Option 2 is a trap.** It is the option that most resembles what Home Assistant does, and it is
the one that makes least sense for us. HA has 60+ languages of a *whole frontend*; we have 35
languages of **19,468 B of card strings**. Splitting all non-English card strings out saves roughly
4 KB gzip while introducing every failure mode in §3 — the double-evaluation trap, the month-long
cache, a 35-way loader — for a rounding error. **Copying HA's architecture here would be cargo-culting
a solution to a problem we do not have.**

**Why Option 1 is respectable.** Doing nothing costs nothing and risks nothing, and 110 KB gzip is not
an outrageous card. If the editor rebuild were not about to add ~18 KB gzip of translated helper prose,
I would probably recommend it. What tips it is that the cost is about to grow, and the maintainer has
correctly refused to pay for it by cutting languages or dumbing down the prose. Option 3 means that
refusal costs nothing.

**Why Options 4 and 5 are the wrong shape.** Both resolve a *technical* budget problem by degrading
the *product*. The helper prose is the thing that makes the new editor good. Once the editor is lazy,
its translations are downloaded by HACS but never parsed by a browser that does not open the editor —
so the argument for trimming them evaporates. Solve it structurally, then keep the prose.

**Why Option 3 over 3a.** 3a is the obvious move and gets 11.2%. But the editor *translations* are
87.3% of the translation payload and stay eager under 3a, because `src/translations/localize.ts`
statically imports all 35 JSON files (lines 13-47) and those files carry the `editor` key — and
`translate()` does dynamic key lookup, which Rollup cannot tree-shake. Moving the `editor` namespace
into editor-only modules is what converts an 11% win into a 42% win. **The two changes are separable
but should ship together; 3a alone leaves most of the value on the table.**

---

## 6. If Proceeding: Concrete Steps

Ordered so that each step is independently verifiable.

1. **Split the editor namespace out of the eagerly-imported language files.**
   Move each `editor` key from `src/translations/languages/<code>.json` into an editor-only location
   (e.g. `src/translations/editor-languages/<code>.json`), imported *only* from
   `src/rendering/editor/`. Register into `TRANSLATIONS` at editor-load time via the existing
   `addTranslations()` (`src/translations/localize.ts:398-404`), which already exists for exactly
   this kind of dynamic registration.
   *Coordinate with the in-flight editor rebuild:* `src/rendering/editor/strings.ts` (19,154 B) is
   already the new English namespace and is already editor-local, so it lands in the lazy chunk for
   free. This step is really about the 10 other languages and the legacy `editor` sections.

2. **Make the editor lazy.** In `src/calendar-card-pro.ts`: drop
   `import * as Editor from './rendering/editor/index'` (line 44) in favour of `import type`, remove
   the top-level `customElements.define(...)` (line ~1256), and make `getConfigElement()` async:
   ```ts
   static async getConfigElement() {
     if (!customElements.get('calendar-card-pro-dev-editor')) {
       const mod = await import('./rendering/editor/index');
       if (!customElements.get('calendar-card-pro-dev-editor')) {
         customElements.define('calendar-card-pro-dev-editor', mod.CalendarCardProEditor);
       }
     }
     return document.createElement('calendar-card-pro-dev-editor');
   }
   ```
   The double `customElements.get` guard matters: `getConfigElement()` can be called concurrently and
   `define()` throws on a duplicate name.
   Async is safe — `home-assistant/frontend src/panels/lovelace/editor/card-editor/hui-card-element-editor.ts:26-35`
   returns it from an `async` method and `hui-element-editor.ts:370` awaits it.
   **Verified:** this refactor typechecks with **0 `src/` errors**.

3. **Add `preserveEntrySignatures: 'strict'` to `rollup.config.mjs`.** Non-negotiable (§3.1). Keep the
   `entryFileNames` switch so the dev build still emits `calendar-card-pro-dev.js`, and add
   `chunkFileNames: '[name]-[hash].js'` explicitly rather than relying on the default.

4. **Change the release workflow to attach all built files.**
   `.github/workflows/release.yml` currently has `files: dist/calendar-card-pro.js`; it becomes
   `files: dist/*.js`. Consider also attaching a `dist` zip for manual installers (§4). Ensure the
   build runs against a clean `dist/` — my experiment produced stale chunks from a previous build
   sitting in `dist/`, which would have been published as garbage assets.

5. **`hacs.json` needs no change.** `filename: "calendar-card-pro.js"` stays correct and still names
   the facade. Do **not** add `zip_release` (§2.5).

6. **Add CI gates**, in the spirit of the existing no-`sourceMappingURL` check:
   - assert `dist/calendar-card-pro.js` is a facade (tiny, single relative import);
   - assert **no** emitted chunk imports from `./calendar-card-pro.js` — this is the §3.1 regression
     test and it is the one that matters most;
   - assert every relative specifier across `dist/*.js` resolves to a file that exists in `dist/`.
     That last check is the direct analogue of the sourcemap-404 lesson from #315/#358: never ship a
     reference to a file we do not publish.

7. **Revisit the sourcemap decision.** The comment in `rollup.config.mjs` disables sourcemaps
   *because* only one file is attached. Once the workflow globs `dist/*`, that specific reason no
   longer holds. Not part of this change — but the comment should be corrected so it does not
   mislead later, and this is worth its own decision.

### Must be verified live before shipping

None of this can be fully proven from source; it needs one real HA instance.

1. **The upgrade in place.** Install the current release via HACS, then upgrade to a multi-file
   pre-release, and confirm the card renders without clearing the browser cache.
2. **`www/community/calendar-card-pro/` contains every chunk** after the HACS download.
3. **The editor opens**, and the Network tab shows the chunk fetched *on open*, not on dashboard load.
4. **No duplicate-registration error.** Specifically watch for
   `NotSupportedError: … has already been used with this registry` after opening the editor — that is
   §3.1 recurring.
5. **YAML-mode dashboards**, where `cache_headers` is off and resources are hand-managed.
6. **A deliberate 404**: delete the editor chunk from disk and confirm the card still renders and the
   failure is a readable message rather than an unhandled rejection.
7. **A downgrade** back to a single-file version.

---

## 7. What I Could Not Verify

- **Anything against a live Home Assistant.** The brief forbade contacting HA, so every runtime claim
  rests on source reading plus the reference card's production behaviour. §6's live checklist is
  therefore genuinely load-bearing, not ceremonial.
- **That HACS's behaviour is stable across versions.** I read `main` @ `3249355`. `content.single`,
  the `content_in_root` filter, and the flat tree walk are long-standing, but none is a documented
  public contract — HACS could narrow the release-asset download in a future version. The reference
  card's dependence on it is the main protection: breaking this would break a very visible card.
- **Whether `zip_release` truly breaks plugin resource registration.** I traced the code path
  (§2.5) and found no plugin using it, which is consistent — but I did not observe the failure. The
  recommendation not to use it does not depend on resolving this.
- **The exact size of a *fully translated* new editor namespace.** The ~+18,000 B gzip figure is from
  the brief. I verified the shape it would take (the current `editor` namespace is 87.3% of the
  translation payload) but the 11 translations do not exist yet to measure.
- **Option 4's ~6% figure**, which is projected from the brief's 67%-helper-prose split rather than
  measured. It does not change the ranking.
- **The precise final chunk count.** My clean build produced 3 files; Rollup merged editor code and
  editor translations into one chunk. The real implementation may differ slightly depending on the
  module graph. Immaterial to the verdict.
- **Star count discrepancy:** the GitHub API reports 1,122★ for `dermotduffy/advanced-camera-card`,
  lower than the "~3.6k" I initially assumed from its `frigate-hass-card` days. The download counts
  (~85k per asset per release) are the better popularity signal and are directly verified.
