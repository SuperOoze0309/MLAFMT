# Browser-local FormCapy (MLAFMT)

FormCapy normally runs as a desktop Flask app, an Android app with an offline
Python bridge, or a local web preview. This document describes the additional
**static, browser-local** build:

- A visitor opens a static HTTPS site. No account, email, login, analytics or
  server-side Python is involved.
- The uploaded DOCX/TXT/MD is read in the page, passed to a module Worker as an
  `ArrayBuffer`, and formatted by the project's real Python core running in
  Pyodide (WebAssembly).
- The resulting DOCX is returned as bytes and downloaded or shared locally.
  The draft is not uploaded anywhere.

The static build is intentionally separate from the Flask app. Flask remains
the desktop preview mode; Android keeps its native Python bridge and never
downloads Pyodide.

---

## 1. Architecture

```
browser
  index.html
    static/transport.js         one interface: server | browser | native
    browser/worker.js           single module Worker, serial queue
      Pyodide 314.0.7           runtime/pyodide/314.0.7/
        lxml 6.1.3              wasm wheel from the Pyodide distribution
        typing_extensions       Pyodide package
        python-docx 1.2.0       pure-Python wheel installed into MEMFS
      python/browser_bridge.py  browser-only adapter
      python/mla_formatter.py   unchanged project formatter
      python/format_profiles.py unchanged
      python/docx_preserve.py   unchanged (synced from the main branch)
```

### Runtime choices

| Component | Version | Source / reason |
| --- | --- | --- |
| Pyodide | 314.0.7 (stable docs) | Official `pyodide-core-314.0.7.tar.bz2` release asset |
| CPython | 3.14.2 | Built into the pinned Pyodide runtime |
| lxml | 6.1.3 | Official Pyodide package table; cp314 wasm wheel |
| typing_extensions | 4.15.0 | Official Pyodide package table |
| python-docx | 1.2.0 | Pure-Python wheel installed from a same-origin file |
| Emscripten | 5.0.3 | Build input of the pinned runtime; source materials included |

`python-docx` is **not** in Pyodide's package table. The desktop native wheel
cannot be used in wasm; only the pure-Python `py3-none-any` wheel is installed.
The worker unzips that wheel into `/app/pylib` inside MEMFS and adds it to
`sys.path`. The pinned files and hashes are in `browser/runtime.json`.

Pyodide requires a **module worker** (`new Worker(..., {type: "module"})`)
because its runtime entry is `pyodide.asm.mjs`; classic workers using
`importScripts()` are not supported by the current runtime.

### Data path

1. The page reads the chosen `File` with `arrayBuffer()` after a 20 MiB check.
2. It transfers that buffer to the Worker (no base64, no JSON copy).
3. The Worker writes it into a unique MEMFS directory and calls
   `browser_bridge.finish()`. `finish()` always removes the directory in a
   `finally` block and returns `(metadata_json, document_bytes)`.
4. The Worker converts the output `bytes` to a `Uint8Array` once and transfers
   its `ArrayBuffer` back. Python proxies are destroyed in `finally`, including
   the tuple and document proxies even if `toJs()` throws.
5. The page creates a `Blob`/`File` and a Blob URL for download/share. The URL is
   revoked when replaced or on non-BFCache `pagehide`.

### Bridge protocol

`browser_bridge.py` mirrors `platforms/android/app/src/main/python/android_bridge.py`:

```text
begin(file_name)              -> {"workdir": ..., "input_path": ...}
finish(request_json, workdir) -> (metadata_json, document_bytes)
discard(workdir)              -> {"ok": true}
initial_state()               -> {"today": ..., "version": ...}
```

`finish()` supports `blank`, `convert` and `paragraphs`, preserves the Android
error codes (`no_file`, `too_large`, `empty_file`, `unsupported`,
`preserve_docx_only`, `missing_fields`, `invalid_fields`, `invalid_options`,
`bad_doc`, `failed`, `draft_changed`, `unsupported_document`), enforces the same
limits, and never imports Flask.

### Transports

`static/transport.js` exposes one `generate`/`paragraphs`/`cancel` interface:

- **native** — selected first whenever `window.MLAFMTAndroid` exists. Android
  keeps document bytes and private paths out of JavaScript. Generation carries a
  `request_id`; the adapter settles only on a non-busy terminal state
  (`native_done` with a result, or an error). A stale previous result that the
  Android state object keeps during the next run cannot resolve the new request.
  Older WebView payloads without `request_id` are settled only after a
  `busy: true` state has been observed.
- **browser** — static build (`<meta name="mlafmt-mode" content="browser">`).
  A single Worker queues requests. Each request has an id and a Worker epoch.
  Cancel/AbortSignal terminates the Worker (so synchronous Python truly stops),
  rejects pending requests, and the next attempt builds a fresh Worker. A late
  `arrayBuffer()` from the cancelled attempt is rejected by the epoch check and
  cannot post into the new Worker.
- **server** — desktop Flask (`content="server"` and no Android bridge), using
  the existing `/api/blank`, `/api/convert` and `/api/paragraphs` endpoints.

### Cancellation and busy ownership

- Browser/server: the page owns `busy`; `finally` clears it for the current
  generation only. A generation sequence number prevents an old catch/finally
  from clearing a newer task.
- Android: the Kotlin state stream owns `busy`. The page does not clear native
  busy in `finally`. An immediate dispatch failure (`not_dispatched`) is the only
  native path that unlocks locally; a 5-minute adapter timeout reports
  `native_timeout` and keeps the form busy until Android sends its terminal
  state. This prevents a still-running Kotlin job from being unlocked by a
  client-side timeout.

---

## 2. Build and preview

Requirements: Python 3.12+ (3.14 tested), network for the first pinned download.
No Node/npm or bundler is required.

```sh
python scripts/build_browser_static.py
```

The default output is `dist/browser-local/` (git-ignored). The builder:

- verifies every pinned runtime and wheel file against `browser/runtime.json`
  SHA-256 and size before copying;
- replaces the three Jinja placeholders in `templates/index.html` and switches
  the transport meta tag to `browser`;
- copies the Python core and `browser_bridge.py`;
- runs or reuses `scripts/collect_browser_runtime_materials.py` and publishes its
  output under `licenses/runtime-materials/`;
- writes `manifest.json` (versions, per-file size/SHA-256, cache version,
  precache list, limits), `THIRD-PARTY-NOTICES.txt`, `LICENSE.txt`,
  Cloudflare-Pages-style `_headers`, and an offline service worker;
- asserts that no `{{`/`{%` remains in the HTML.

Useful options:

```sh
# Re-download and re-hash pinned runtime files
python scripts/build_browser_static.py --refresh

# Rebuild without the large source kit (NOT a complete compliance artifact)
python scripts/build_browser_static.py --runtime-materials none

# Use an existing collector output directory
python scripts/build_browser_static.py --runtime-materials build/browser-runtime-materials-collected

# Re-run the collector instead of using its cache
python scripts/build_browser_static.py --refresh-materials

# Rebuild and verify every manifest entry
python scripts/build_browser_static.py --check
```

Preview:

```sh
python -m http.server 8080 --directory dist/browser-local
# open http://127.0.0.1:8080/
```

`http://127.0.0.1`/`localhost` counts as a secure context, so the service worker
can be tested locally. Do not open `index.html` through `file://`: module
workers and service workers require an HTTP(S) origin.

### Output size

The exact numbers are in `dist/browser-local/manifest.json`.

| Part | Approx. size | Precached offline? |
| --- | ---: | --- |
| App shell, transport, Worker, Python core | < 0.3 MiB | yes |
| Pyodide runtime, stdlib, lxml/typing wheels | ~13.4 MiB | yes |
| python-docx wheel | 0.25 MiB | yes |
| **App total** | **~15.7 MiB** | **yes (16 requests)** |
| Source/notice kit (`licenses/runtime-materials/`) | ~94.8 MiB | **no** |
| **Publication total** | **~110.4 MiB** | source kit is on demand |

The largest published file is a 20 MiB split part of a source archive, below the
25 MiB per-file ceiling. Source materials are deliberately **not** in the
service-worker precache; a phone never downloads the 95 MiB kit just to format
a paper.

---

## 3. Caching and upgrades

`sw.js` is generated per build. Its cache name contains:

- the application version,
- the Pyodide version,
- a digest of every built program file.

Consequences:

- Old FormCapy caches are deleted on activation of a new cache.
- `skipWaiting()` is **not** called and `clients.claim()` is **not** called.
  A new service worker waits until old FormCapy tabs are gone. A page that is
  already open keeps its old UI, Worker, runtime and Python modules together;
  it cannot mix a new Python core with an old Worker.
- The page never auto-refreshes and never discards the in-memory draft during an
  update. The new version applies on the next navigation after old tabs close.
- Only the explicit precache list is cached. Unknown URLs, POST requests and
  user documents (in-memory Blob URLs) are never cached.
- If a cache upgrade is undesirable for a first release, build with
  `--no-offline`; the site still works online and the manifest records
  `offline.service_worker: false`.

---

## 4. Limits and preserved features

The browser bridge keeps the existing limits:

- input file: 20 MiB (`20 * 1024 * 1024`);
- DOCX ZIP expansion: 80 MiB total, 2000 entries, 20 MiB per entry, encrypted
  entries rejected;
- paragraph-preservation list: at most 10,000 positive integer ids;
- generated filename stem: at most 180 UTF-8 bytes (Android parity);
- text fields: at most 5,000 characters each.

Like server and Android, the browser build uses the real formatter rather than a
JavaScript reimplementation. Supported behavior remains:

- MLA 9, APA 7 student, and custom course templates;
- advanced page-number position/start and cover-number settings;
- Works Cited/References on a new page, sorting and hanging indents;
- DOCX body images, tables, relationships, hyperlinks, footnotes and selected
  paragraphs preserved by `docx_preserve.py`;
- template replacement of headers/footers where the existing core does so;
- source-file SHA-256 binding for the preserved-paragraph selection;
- blank template generation.

TXT/Markdown image syntax is still not embedded. The UI keeps its existing
warning that complex documents and citations must be reviewed.

---

## 5. Privacy and security properties

- No analytics, no telemetry, no account database, no authentication.
- No request contains document bytes. The static build has no upload endpoint.
- All program assets are same-origin relative URLs; no CDN, font, analytics or
  PyPI request occurs at runtime.
- The only external links are the published source/notice pages and the
  repository URLs inside those static documents.
- The Worker CSP on Android was extended only to allow the same-origin
  `static/transport.js`; `connect-src` remains `'none'` and `worker-src` remains
  `'none'`, so Android never downloads Pyodide.

---

## 6. Compatibility

| Environment | Status |
| --- | --- |
| Desktop Chrome/Edge (headless Chrome on Windows) | Verified end-to-end, including offline reload and conversion |
| Desktop Flask mode | Verified by the Python test suite; static transport is not used |
| Android APK | Not built in this workspace; Kotlin/asset/CSP changes are code-reviewed only |
| Safari macOS | Not verified |
| iPhone/iPad Safari | Not verified |
| Firefox | Not verified |

The build requires a browser with WebAssembly, ES module Workers, `Blob`,
`File`, Transferable `ArrayBuffer`, and (for offline) service workers. iOS and
iPadOS memory limits are the main mobile risk; the existing 20 MiB input cap is
kept, but a large DOCX plus the runtime can still be heavy. Test on real devices
before relying on the browser build as the only delivery path.

Downloads on iOS/iPadOS use the existing `<a download>` plus Web Share API
fallback. Safari may open a preview instead of saving; the UI already instructs
users to use Share → Save to Files. This behavior was not tested on a device.

---

## 7. Verification performed

Commands and results from this workspace:

```sh
# Pyodide import and DOCX generation, with assertions (Node)
node browser/test/node_import_test.mjs
# OK: Pyodide import and DOCX conversion assertions passed

# Browser bridge (desktop CPython, same code and protocol)
.venv/Scripts/python.exe -m pytest browser/test/test_bridge_desktop.py -q
# 19 passed

# Flask, Android bridge and browser bridge suites
.venv/Scripts/python.exe -m pytest browser/test/test_bridge_desktop.py test_mla_web.py test_android_bridge.py -q
# 42 passed

# Formatter suite (one pre-existing assertion is stale with the synced core)
.venv/Scripts/python.exe -m pytest test_mla_formatter.py -q
# 37 passed, 1 failed: test_docx_keeps_hyperlink_text_in_order
#   The paragraph text and hyperlink XML are preserved; python-docx's
#   Paragraph.runs does not expose runs nested inside w:hyperlink. The main
#   branch owns the updated core tests.

# Static site in real headless Chrome
node browser/test/run_static_browser_test.mjs
# mode=browser; demo DOCX 37,720 bytes/18 parts; blank 37,461 bytes/18 parts;
# 6 paragraphs read; cancel + retry; 20 MiB rejection; preflight validation;
# epoch race old=cancelled/new=New_MLA_Essay.docx; native protocol ids 1-4;
# not_dispatched + timeout; no external requests, no page/console errors

# Same, with the network disabled after the first load
node browser/test/run_static_browser_test.mjs --offline
# service worker cache formcapy-...; offline reload; offline DOCX 37,720 bytes

# Manifest rebuild and hash verification
.venv/Scripts/python.exe scripts/build_browser_static.py --check
```

The end-to-end test also fetched the published
`licenses/runtime-materials/index.html`, verified that the footer link is visible
in browser mode, parsed the DOCX central directory, and asserted that all
observed HTTP requests were same-origin GETs (Blob reads excluded).

`dist/browser-local/python/docx_preserve.py` matches the synced core file
SHA-256 `DEF5F82945D3E93754D1E8882838E131A22E24D889119E764A8C778A960ECDB7`.

---

## 8. Not verified / remaining work

- No real iPhone, iPad, Mac Safari, Firefox or Android device run was performed.
- The Android APK was not built here. The Kotlin `request_id` echo, native busy
  ownership, CSP change and same-origin asset allowlist are code-reviewed, not
  compiled or installed. The JS native adapter was exercised with simulated
  bridge payloads only.
- Cloudflare Pages deployment was not performed from this workspace. Domain,
  DNS and HTTP→HTTPS are being configured by the project owner. The site is
  static and anonymous; do not add Cloudflare Access, Functions or a database.
- A native/WASM rebuild was **not** performed. The collector verifies 20 pinned
  inputs and publishes 94 original/selected files, but the lxml wheel is still
  the official Pyodide wheel. The materials are an engineering inventory, not a
  legal certification or a reproducible-relink proof. Review
  `licenses/runtime-materials/REBUILD.md` and `SOURCE-MANIFEST.json` before
  claiming full corresponding-source compliance.
- The source kit's 95 MiB is part of the publication directory but not precached.
  Confirm Cloudflare Pages file-count/size and deployment limits with the final
  artifact; every individual file is below 25 MiB.
- iOS download/share and service-worker quota behavior remain device risks.
- `scripts/collect_browser_runtime_materials.py` and
  `browser/runtime-sources.json` are maintained separately; the builder only
  invokes and copies their verified output. Do not edit or regenerate them as
  part of ordinary formatter changes.

---

## 9. Updating the pinned runtime

1. Update `browser/runtime.json` with the new Pyodide version, core URL, sizes
   and SHA-256 values, and the exact wasm package wheels.
2. Update `browser/runtime-sources.json` / the collector manifest through its
   owner, then re-run the collector.
3. Update `browser/licenses.json` if top-level license snapshots change.
4. Run `python scripts/build_browser_static.py --refresh --refresh-materials`.
5. Run all verification commands above, including `--offline`.
6. Change the page/worker only if the Pyodide API or distribution layout changed;
   `browser/worker.js` is pinned to the `pyodide.mjs` module entry and the 314.x
   flat package layout.

Never point the page at a CDN at runtime. The build copies the pinned files into
the artifact and the manifest is the integrity record.
