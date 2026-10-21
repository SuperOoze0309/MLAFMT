# Browser-local FormCapy (MLAFMT)

FormCapy runs as a native Tk desktop app, an Android app with an offline Python
bridge, or a Flask local web app. This document describes the additional
**static, browser-local** build:

- A visitor opens a static HTTPS site. No account, email, login, analytics or
  server-side Python is involved.
- The selected DOCX/TXT/MD is read in the page, passed to a module Worker as an
  `ArrayBuffer`, and formatted by the project's real Python core running in
  Pyodide (WebAssembly).
- The resulting DOCX is returned as bytes and downloaded or shared locally.
  The draft is not uploaded anywhere.

The static build is separate from the Flask local web mode. The native desktop
interface uses Tk; Android keeps its native Python bridge and never downloads
Pyodide. The DSH refactor commit `0e5e923` was merged in `adeca89`.

The static build is live on **Cloudflare's free Workers Static Assets plan** at
[formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/), deployed from code commit
`f7c3444` as Worker `formcapy`, version `6769274b`. Both entry points passed
trusted TLS and HTTP-to-HTTPS checks. The domains use **Workers Routes** with
existing proxied DNS and Universal SSL. See [deployment notes](DEPLOYMENT.md)
for the launch record and remaining device checks.

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
- **server** — Flask local web mode (`content="server"` and no Android bridge), using
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
- replaces the Jinja version/date/public-server placeholders in
  `templates/index.html`, sets `public_server` to `false`, and switches the
  transport meta tag to `browser`;
- copies the Python core and `browser_bridge.py`;
- runs or reuses `scripts/collect_browser_runtime_materials.py` and publishes its
  output under `licenses/runtime-materials/`;
- writes `manifest.json` (versions, per-file size/SHA-256, cache version,
  precache list, limits), `THIRD-PARTY-NOTICES.txt`, `LICENSE.txt`,
  Cloudflare Static Assets `_headers` (including `nosniff` and a referrer policy),
  and an offline service worker;
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
| Pyodide runtime, stdlib, lxml/typing wheels | ~15.0 MiB | yes |
| python-docx wheel | 0.25 MiB | yes |
| Top-level notices and metadata | < 0.2 MiB | no |
| **Program and top-level notices total** | **~15.7 MiB** | **16 program URLs precached** |
| Source/notice kit (`licenses/runtime-materials/`) | ~94.8 MiB | **no** |
| **Publication total** | **~110.4 MiB** | source kit is on demand |

The largest artifact file is a 20 MiB split part of a source archive, below the
builder's recorded 25 MiB per-file limit. Source materials are deliberately
**not** in the service-worker precache. The source index and its files are
requested only through the license entry; ordinary formatting does not request
the 95 MiB kit.

---

## 3. Caching and upgrades

`sw.js` is generated per build. Its cache name contains:

- the application version,
- the Pyodide version,
- a digest of every built program file and the service-worker template.

Consequences:

- Old FormCapy caches are deleted on activation of a new cache.
- Ordinary upgrades do **not** call `skipWaiting()` or `clients.claim()`. A
  replacement service worker waits until the old worker's controlled tabs are
  gone. For pages already controlled by the old worker, its cached UI, Worker,
  runtime and Python modules stay together during that session.
- One repair exception recognizes only the exact first public cache name
  `formcapy-2.4.0-pyodide-314.0.7-f7d959ab5df8`. After the replacement precache
  is complete, that case calls `skipWaiting()` to repair failed home-page
  navigation. This repair changes only service-worker/cache handling; program
  and Python runtime bytes are unchanged. It does not claim clients, navigate,
  reload, or discard in-memory drafts. Unknown and similarly named caches do
  not trigger this exception.
- The home page is precached as `./`. Home and `index.html` navigations use that
  key. Redirected cached responses are reconstructed with the same bytes,
  status and headers, clearing the redirect flag that otherwise makes a
  navigation fail when the host canonicalizes `/index.html` to `/`.
- The first page on a new origin is normally **not yet controlled** by the
  service worker and needs another navigation after installation. During an
  uncontrolled load, assets come from the network; this cache design does not
  guarantee that every possible page avoids mixing assets across a deployment.
- Service-worker updates do not auto-refresh the page or deliberately discard
  the in-memory draft. New code applies on a later navigation after activation.
  Offline use also depends on successful installation and browser cache
  retention; storage eviction can require another online load.
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
| Codex in-app browser (Chromium), local and public static builds | Real CUA MLA/APA generation, downloads and DOCX inspection passed; see below |
| Headless Chrome on Windows | DSH refactor evidence covers end-to-end conversion and offline reload; separate from the in-app browser checks |
| Microsoft Edge on Windows, public site | Built-in Markdown demo generated and downloaded successfully; system file picker not tested |
| Flask local web mode | Covered by the Python test suite; static transport is not used |
| Updated Android APK | CI compilation and Android emulator offline/file-operation checks passed; physical devices remain unverified |
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

### Public deployment checks

The launch used code commit `f7c3444` and uploaded **124 static files** (the
123 manifest entries plus `manifest.json`). At
`https://formcapy.benzooze0309.workers.dev/`, the public asset audit matched
SHA-256 and size for **122/122 downloadable resources** against the final local
artifact. WASM/MJS MIME types and the generated security headers were correct;
a missing `.wasm` URL returned 404. The saved report is
`build/launch/cloudflare-worker-asset-audit.json`.

The deployed cache name is
`formcapy-2.4.0-pyodide-314.0.7-d035ce17a12d`, and the public `sw.js` bytes match
the repaired build. Its 18 Node VM checks passed. Interactive migration from the
first public broken cache recovered in real Edge: the first reload can still
fail while triggering the update; a later reload worked without clearing caches
or drafts. A new Codex in-app Chromium tab loaded and
reloaded normally. With CDP offline network conditions simulated, Chromium
reloaded the site and generated/downloaded a Markdown example; online conditions
were restored afterwards. These are browser checks, not a physical network
disconnection or Safari test. Evidence is recorded in
`build/launch/public-sw-browser-verification.json`.

The separate custom-hostname check passed **13/13 checks**: root and `www`
returned 200 over TLS 1.3 with trusted chains and valid hostnames, HTTP upgraded
with 301 while preserving the path/query without a loop, and the sampled worker,
transport, manifest, MJS runtime and WASM resources loaded over same-origin
HTTPS. The earlier launch check separately verified the source index.
The saved report is `build/launch/public-https-verification-repair.txt`. These transport
and asset checks are separate from interactive browser conversion.

Real CUA on **`https://formcapy.com/` in the Codex in-app browser (Chromium)**
selected a synthetic DOCX, read **eight paragraphs**, selected paragraph ids
**1 and 5**, then generated and downloaded MLA followed by APA. Both downloaded
documents passed inspection: two selected paragraphs retained fonts, sizes,
colors and styles; one image retained identical bytes/SHA-256; one table,
the hyperlink target and italic formatting were preserved; references had
`pageBreakBefore=True`; page margins were 1 inch. Console warnings and errors
were empty. Results are recorded in `build/launch/public-docx-verification.json`.
The [live website screenshot](images/formcapy-live-zh.png) shows fictional paper
details and this synthetic draft; it is separate from the historical v2.3.0 UI.

A separate **real Microsoft Edge** public-site check opened `formcapy.com`
without signing in, used **Try demo** to load the built-in Markdown, generated
locally and clicked the page's download link. Windows Downloads received
`Example_MLA_Essay (4).docx` (**37,720 bytes**). Its ZIP was intact, python-docx
could read it, references started on a new page and the Example page header was
present. Console warnings/errors were empty. Evidence is in
`build/launch/public-edge-verification.json` and
`build/launch/formcapy-live-edge.png`. The Edge system file picker was **not
tested** because extension file-upload permission was unavailable; this check
establishes the built-in demo flow only.

Platform CI run **`39559961737`** for **`f7c3444`** completed successfully across
Python tests, Windows, Linux, Intel Mac, arm64 Mac and Android. Both Mac builds
passed on their first attempt in this run. Android emulator offline
conversion and native file operations passed. The separate
[v2.4.0 release](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0)
was published on **21 October 2026**, with eight assets verified against that
run and the full source commit `f7c3444436b1bd11a06085c9ea202f7f5711e508`.
Documentation-only changes after that commit do not alter the deployed program
or released installers.

### Integrated root-workspace checks

The following results were recorded after the DSH merge:

- The targeted Python checks passed:
  **98 tests passed, plus 88 subtests**. The stale hyperlink assertion reported
  by DSH was corrected in `cb3540d`; hyperlink text/XML preservation no longer
  has the recorded failing assertion.
- The Node VM transport lifecycle checks passed **13 cases**, including
  cancellation, initialization/file-read races, worker failures and retry
  isolation. These are protocol checks, separate from a browser run.
- The service-worker Node VM checks passed **18 cases**, including canonical
  home redirects, preserved response bytes/headers, scope and method handling,
  the exact legacy-cache repair and failure isolation. A service-worker-only
  edit changes the generated cache digest. These checks do not substitute for
  public reload, repeated-navigation or offline browser checks.
- The default static builder `--check` path successfully ran the source-material
  collector with Pyodide **314.0.7**: **20 pinned inputs**, **94 source files**,
  and **123 artifact manifest hashes** verified. The generated page has no Jinja
  placeholders and `public_server` is `false`.
- Real CUA in the **Codex in-app browser (Chromium)** generated and downloaded
  both MLA and APA documents from a local static preview. Inspection confirmed
  **two selected paragraphs** retained their formatting, **one image** retained
  identical bytes, **one table**, the **hyperlink**, and references starting on a
  separate page. These results do not establish Edge or Safari compatibility.

### DSH refactor verification history

The DSH refactor recorded these commands and results before integration. They
are retained as historical evidence; the integrated results above supersede its
stale formatter assertion:

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

# Historical formatter suite before the assertion correction in cb3540d
.venv/Scripts/python.exe -m pytest test_mla_formatter.py -q
# 37 passed, 1 failed: test_docx_keeps_hyperlink_text_in_order
#   The paragraph text and hyperlink XML are preserved; python-docx's
#   Paragraph.runs does not expose runs nested inside w:hyperlink. The main
#   branch later corrected this assertion in cb3540d.

# Static site in headless Chrome (DSH evidence, not a real Edge run)
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

The DSH end-to-end test also fetched the locally served artifact's
`licenses/runtime-materials/index.html`, verified that the footer link is visible
in browser mode, parsed the DOCX central directory, and asserted that all
observed HTTP requests were same-origin GETs (Blob reads excluded).

`dist/browser-local/python/docx_preserve.py` matches the synced core file
SHA-256 `DEF5F82945D3E93754D1E8882838E131A22E24D889119E764A8C778A960ECDB7`.

---

## 8. Not verified / remaining work

- No real iPhone, iPad, Mac Safari, Firefox or Android device run was performed.
- Edge passed the built-in Markdown demo flow, but its system file picker and
  DOCX selection/preservation flow remain unverified.
- The updated Android APK passed CI compilation and emulator checks for offline
  conversion and native file operations. Physical Android hardware has not been
  checked; desktop JavaScript adapter simulation remains a separate result.
- Cloudflare **Workers Static Assets, free plan** is live through Workers Routes.
  Public-origin TLS, redirects, sampled MIME types and asset integrity passed.
  Public interactive MLA/APA conversion and downloaded-document inspection
  passed in Codex in-app Chromium; real Edge passed the built-in Markdown demo
  generation/download flow. Other browser/device checks remain separate.
  The site is static and anonymous; do not add Cloudflare Access, Functions or
  a database.
- A native/WASM rebuild was **not** performed; the state remains
  **`collected-not-rebuilt`**. The collector verifies 20 pinned
  inputs and publishes 94 original/selected files, but the lxml wheel is still
  the official Pyodide wheel. The materials are an engineering inventory, not a
  legal certification or a reproducible-relink proof. Review
  `licenses/runtime-materials/REBUILD.md` and `SOURCE-MANIFEST.json` before
  claiming full corresponding-source compliance.
- The source kit's 95 MiB is part of the publication directory but not precached.
  The 124-file artifact was accepted by Workers Static Assets; its largest
  individual file is 20 MiB. Future builds still need upload and public-integrity
  checks against their own manifest.
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
