# Browser-local FormCapy (MLAFMT)

**Published static package and source v2.11.0:** local PDF/DOCX/DOC conversion is implemented and
verified in a frozen preview, including a lazy same-origin office WASM engine.
The [GitHub release](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.11.0)
is published; production website deployment and public verification remain pending.
See [conversion scope](CONVERSION.md) and
[v2.11 verification](TESTING-v2.11.md). Use `scripts/preview_local.py` for
COOP/COEP headers when previewing the converter.

**Public website status:** the static website remains v2.10.0, with local library search,
type filters and portable exports, alongside DOI batches and offline import.
Offline installers remain v2.5.0.
Current verification is recorded in [deployment notes](DEPLOYMENT.md) and
[v2.10 testing](TESTING-v2.10.md); earlier version records below remain historical.

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

The v2.7.0 static build is live on **Cloudflare's free Workers Static Assets plan** at
[formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/). The original v2.4.0 launch used
code commit `f7c3444` as Worker `formcapy`, version `6769274b`; those identifiers
are historical. The domains use **Workers Routes** with existing proxied DNS
and Universal SSL. The current and earlier public-integrity/TLS results are
recorded separately in [deployment notes](DEPLOYMENT.md).

---

## 1. Architecture

```
browser
  index.html
    static/transport.js         one interface: server | browser | native
    static/update-notice.js     explicit website-update flow, no draft access
    static/template-share.js    FC1 template-code and sharing-JSON protocol
    static/citation-library.js  separate structured reference data
    static/citation-import.js   offline BibTeX / RIS / CSL-JSON parser
    static/citation-lookup.js   explicit, bounded single-DOI Crossref request
    static/citation-doi-batch.js sequential DOI batches and partial results
    static/citation-export.js  local CSL-JSON / RIS / modern .bib serialization
    static/citation-assistant.js / .css  local editor and reviewed preview
    static/citation-engine.js   same-origin CSL adapter, lazy renderer loading
      static/vendor/citations/ original processor, styles, locale, source/licenses
    browser/worker.js           single module Worker, serial queue
      Pyodide 314.0.7           runtime/pyodide/314.0.7/
        lxml 6.1.3              wasm wheel from the Pyodide distribution
        typing_extensions       Pyodide package
        python-docx 1.2.0       pure-Python wheel installed into MEMFS
      python/browser_bridge.py  browser-only adapter
      python/bibliography_export.py standalone reviewed reference-list DOCX
      python/mla_formatter.py   shared project formatter
      python/format_profiles.py shared layout profiles
      python/docx_preserve.py   shared DOCX preservation
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
| citeproc-js | Actual processor 1.4.61 | Original pinned processor; CPAL 1.0 option, with source and full notices |
| CSL styles / locale | Pinned official commits | MLA 9, APA 7 and en-US data; CC BY-SA 3.0 |

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

`finish()` supports `blank`, `convert`, `paragraphs` and the browser-only
`bibliography` request, preserves the existing Android
error codes (`no_file`, `too_large`, `empty_file`, `unsupported`,
`preserve_docx_only`, `missing_fields`, `invalid_fields`, `invalid_options`,
`bad_doc`, `failed`, `draft_changed`, `unsupported_document`), enforces the same
limits, and never imports Flask.

`bibliography` receives an explicitly reviewed CSL result rather than a draft
file or paper details. `bibliography_export.py` creates a separate Word list
from bounded, allowlisted entry HTML, preserving the processor's order and
supported rich formatting. It does not sort the result a second time or modify
an existing paper's in-text citations. The original draft conversion and its
download result are separate from this export.

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

### Local citation path (v2.10.0 static website)

The reference assistant accepts **books, journal articles and webpages** by
manual entry or offline BibTeX/RIS/CSL-JSON import. Optional, explicit DOI
lookup accepts up to 50 DOI lines and obtains Crossref records sequentially
over HTTPS; it sends only each DOI and
normal network request information, without draft/library bytes. Candidates
are reviewed and selected before appending, with duplicate handling and batch undo.
Cancellation retains completed candidates; rate limiting stops the batch without
automatic retry. Its
separate versioned library maps to CSL JSON and renders **MLA 9 or APA 7**
locally. Missing metadata is flagged. No author/date/DOI is invented, arbitrary
reference prose is not parsed and in-text citation numbering is not synchronized.

The assistant supports plain/formatted copying, standalone HTML, separate
library JSON, and a standalone Word list through the browser bridge. Changing
inputs or style makes the old preview stale until the user previews again.
Library JSON imports are reviewed before explicit replacement. Citation data
does not enter FC1 codes, ShareV1 settings/labels or layout-only template JSON.

Local title/author/source/DOI/URL/year search and type filters change only the
library view. An explicit portable-export preview serializes all entries or
the selected filtered scope into CSL-JSON, RIS or a modern UTF-8
BibLaTeX-compatible `.bib` file. Format losses are disclosed before copying or
downloading. Portable output excludes comparison text and application state;
the existing complete library JSON remains the backup. No export adds network
requests, storage writes or a production dependency. Changing relevant data,
format or scope invalidates the prepared export.

Word generation has its own cancel button outside the locked paper form.
Cancellation releases that form and keeps the entries and a still-current
preview, allowing an immediate retry. Entry/style edits and assistant disposal
also abort pending Word work; edits make the preview stale. Cancelled or stale
results never replace the original paper link, and late bibliography URLs are
revoked. The existing manually entered paper date is retained.

The host callback is `onExportWord(bibliography, {signal})`. Its adapter **must
forward the second argument's `signal` to `transport.generate()`**, including
while runtime initialization is pending. The current page supplies the local
adapter and busy guards. Browser cancellation terminates the current worker;
retry creates a fresh worker. The native transport's five-minute timeout is
separate and does not supply a browser initialization timeout.

The renderer and Word validator enforce UTF-8 output limits: **32 KiB for each
entry's HTML and plain text**, with separate **2 MiB aggregate/full-output
caps**. Entry HTML has at most 32 nesting levels; the full safe preview permits
one additional bibliography wrapper (33 levels total). Oversize or unsafe
output is an explicit failure, leaving the source library and paper intact.
Library JSON separately permits 1 MiB, 32 nesting levels and 50,000 parsed nodes.

The library is **session-only by default**. Saving, loading and removing the
saved library are explicit actions using only `formcapy.citations.v1`; removing
the saved copy leaves the active library intact. The page does not
automatically load or save a library. Save or export this library separately
before reloading, as well as saving any current paper.

The processor, official styles and en-US locale are all same-origin files.
Their original core source snapshot, complete licenses, provenance hashes and
visible attribution ship with the static build. The chosen processor license
is **CPAL 1.0**; the preserved dual-license notice also includes AGPL 3.0-or-later.
Application MIT licensing does not replace component licenses. The interface's
Chinese/English/Spanish switch does not translate reference titles or authors
or change the chosen citation style. See [citation guide](CITATIONS.md) and
[component distribution details](CITATION-LICENSES.md). GB/T entry rendering is
not included in this version.

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
# Versioned v2.7.0 staging directory, with integrity checks
python scripts/verify_citation_assets.py
python scripts/build_browser_static.py --out dist/formcapy-v2.7.0 --check
```

The default output is `dist/browser-local/` (git-ignored). The builder:

- verifies every pinned runtime and wheel file against `browser/runtime.json`
  SHA-256 and size before copying;
- replaces the Jinja version/date/public-server placeholders in
  `templates/index.html`, sets `public_server` to `false`, and switches the
  transport meta tag to `browser`;
- copies the Python core, `browser_bridge.py` and `bibliography_export.py`;
- verifies the citation component pins and copies all files from
  `static/vendor/citations/`, including the unmodified processor, styles,
  locale, core source snapshot and license files; component notices are also
  appended to `THIRD-PARTY-NOTICES.txt`;
- copies the template-sharing, update-prompt and citation modules/styles, and
  records the offline feature in the `formcapy-offline` meta tag;
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
# Or preview the versioned staging directory
python -m http.server 8080 --directory dist/formcapy-v2.7.0
```

`http://127.0.0.1`/`localhost` counts as a secure context, so the service worker
can be tested locally. Do not open `index.html` through `file://`: module
workers and service workers require an HTTP(S) origin.

### Output size

The exact numbers for each build are in its `manifest.json`. The table below
records the **historical v2.4.0** artifact and is not a size or file-count claim
for v2.7.0. The new citation component adds its own processor/data/source files;
measure the final v2.7.0 manifest after acceptance rather than reusing these
launch counts.

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
- Background updates do **not** call `skipWaiting()` or `clients.claim()`. A
  replacement service worker waits, so cached UI, Worker, runtime and Python
  modules remain together while a controlled page is in use. The v2.7.0
  prompt offers an explicit activation path described below; it never calls
  `clients.claim()`.
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
- A background service-worker update does not auto-refresh a page. New code
  applies on a later navigation or the user's explicitly confirmed update.
  Offline use also depends on successful installation and browser cache
  retention; storage eviction can require another online load.
- Only the explicit precache list is cached. Unknown URLs, POST requests and
  user documents (in-memory Blob URLs) are never cached.
- If a cache upgrade is undesirable for a first release, build with
  `--no-offline`; the site still works online and the manifest records
  `offline.service_worker: false`.

### Update prompt in the v2.7.0 source

Browser-mode startup registers the update module without waiting for Python
initialization or a conversion. It checks for a waiting replacement worker at
startup and during later foreground/periodic checks. First installation does
not show an update banner, and failed checks leave formatting available.

When a replacement is ready, **Update** first asks the user to save/download
the paper and save/export the separate reference library. Only the subsequent
**Saved — update** confirmation asks the worker to activate and reloads the
consenting page. **Later** keeps the current page and its work. Processing
blocks activation; another window within the same FormCapy worker scope also
blocks it and prompts the user to save and close those other site tabs first.
Other pages are not forcibly refreshed, and no document/storage clearing is
performed. During confirmed activation, the host temporarily locks the working
forms so a new task cannot start immediately before the reload.

An already loaded **v2.6.0** page does not contain this module and cannot gain a
banner in place. Save work and upgrade/reopen once to enter v2.7.0; only then
can later releases use its update prompt. Local source/fixture checks and a
future production check must be reported separately.

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
- Citation import and rendering run locally. The optional **Look up DOI** action
  sends that DOI in a fixed Crossref HTTPS endpoint path; the provider also sees
  normal network request information. Cookies/referrer, drafts, libraries and
  paper details are not sent. There is no automatic lookup or retry. External
  results are bounded and reviewed before append; only session-memory caching
  is used. Offline import makes no metadata request.
- All program assets are same-origin relative URLs; no CDN, font, analytics or
  PyPI request occurs at runtime.
- Attribution/source links are navigation links. Safe
  DOI/URL links in the reviewed reference list are opened only by the user.
- Native Android retains a fixed same-origin asset allowlist;
  `connect-src` remains `'none'` and `worker-src` remains `'none'`. It never
  downloads Pyodide, and the new browser citation assistant is not activated
  by the native interface.

---

## 6. Compatibility

The table below summarizes **earlier formatter-build evidence**, not v2.7.0
citation-assistant or update-prompt acceptance. Separate v2.7.0 production
checks are recorded below; fresh browser-download inspection and device/Safari
results remain separate and unverified for this release.

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

### v2.7.0 local debug acceptance

The post-debug artifact is `dist/formcapy-v2.7.0-debug/`: **145 manifest file
entries**, **118,835,570 total bytes**, cache version
`formcapy-2.7.0-pyodide-314.0.7-a3c606097254`. Its `manifest.json` SHA-256 is
`fbf3eeed6b54d7fb95f61e90864c92acb929edcb4afe262b9be3c8ca187100c8`.
The older `dist/formcapy-v2.7.0/` directory predates this debug pass.

- All **11 Node scripts passed 309 checks**. The focused citation library and
  assistant account for **19 + 44 = 63**; another **10 host-state integration
  tests** exercise actual page callbacks with a bounded DOM/transport adapter.
- The full Python regression passed **228 tests plus 159 subtests**.
- Independent real CSL → Pyodide MLA/APA DOCX checks and the actual worker's
  serial request queue passed. These checks are distinct from browser-download
  inspection.
- Real Chromium controlled-runtime-download checks confirmed a reachable Word
  cancel button, paper-form `inert` changing from `true` to `false`, and retained
  entries, the exact three-entry preview and manual date `3 February 2027`.
  The held resource was `/runtime/pyodide/314.0.7/pyodide.mjs` on local port 8614.
  After release, retry succeeded and produced the
  `FormCapy-MLA-References.docx` link.
- With the local static server on port 8613 stopped and no listener remaining,
  real Chromium reloaded offline. The library did not load automatically;
  explicitly loading its three saved entries enabled successful APA preview and
  Word generation. Main-paper MLA demo generation then kept the existing APA
  link; switching the assistant to MLA and generating its Word result kept the
  main paper link unchanged. Console warnings/errors were zero.
- Real Chromium recovery after an update check returned HTTP 503 passed. The
  real-Service-Worker fixture update checks also passed; these were local tests.

Real-browser evidence is recorded in
`build/debug-v2.7/word-cancel-real.json`, `word-cancelled.png`,
`offline-browser.json` and `offline-bibliography.png`. This round has not
freshly downloaded and inspected browser-generated DOCX files;
creating their links is a separate result. No new Safari or physical-device
acceptance is claimed. The same frozen artifact is now deployed as **v2.7.0**;
its production checks are recorded separately below. Published offline
installers remain **v2.5.0**.
See the [citation guide](CITATIONS.md) for current local evidence and
[deployment notes](DEPLOYMENT.md) for the production record.

### v2.7.0 production acceptance — 2026-10-22

Cloudflare production version `890b8ee5` is **Ready, 100%**, serving the frozen
post-debug artifact from application source `866e0cb4bc48767f96d5a8681c46609a25390c43`.
[CI run 39718820575](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39718820575)
passed all seven jobs; this website release does not publish their native artifacts.
One Worker sweep verified **144/144 downloadable files**, **118,834,929 bytes**.
Root/www matched **38/38 key files**, with zero injected analytics beacons;
source archives and notices are reachable. **18/18 HTTPS checks** passed with
trusted TLS 1.3. No WAF, DNS or TLS settings were changed.

Public Edge checks on the root domain generated the main MLA demo result and
independent MLA/APA Word links from a reviewed three-type fictional library.
Chinese/English/Spanish switching retained the manual date, main-paper link,
APA link and three-entry preview; console warnings/errors were zero. The first
Edge visit used its old v2.5.0 cache: a normal demo run followed by closing only
the agent's old test tab and reopening loaded v2.7.0. No cache/storage clearing,
forced activation or user-tab closure was used.

Evidence is under `build/v2.7-web-release/production/`, including
`public-http-verification.md` and `public-browser.json`. The
[public screenshot](images/formcapy-live-v2.7-citations.png) uses fictional data
and retains visible citation-component attribution. These output-link results
do not establish fresh downloaded-DOCX inspection, Safari or physical-device
acceptance. See [deployment notes](DEPLOYMENT.md) for the full record.

### Historical v2.4.0/refactor evidence

The following results retain their original historical numbers. They do not
establish acceptance of the current v2.7.0 artifact.

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
