# FormCapy web deployment

## Current public website — v2.11.0

The [independent file converter](https://formcapy.com/converter.html) and
[paper formatter](https://formcapy.com/) are live as v2.11.0. On **28 October
2026 (America/Los_Angeles)**, the accepted H-drive static artifact was deployed
to Cloudflare Worker `formcapy` using the authorized Wrangler debugging
fallback. Two earlier dashboard asset uploads had failed with HTTP 401.
Wrangler uploaded 180 assets and reused 15 already present. Version
`b0c26902-ddb7-4f8a-bc68-9558a1d4bc09` was reported at **100% traffic** and
observed as **Ready** in the existing Edge dashboard. The screenshot is
`build/v2.11.0/production/deployment/ready-b0c26902.png`.

This release adds browser-local PDF/DOCX/DOC conversion in a separate page.
The office WASM engine and Chinese font load on demand. PDF to Word rebuilds
editable text without images, table structure, original layout or OCR.
Desktop source conversion requires installed LibreOffice; Android does not
include this converter. Published native installers remain
[v2.5.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0).

| Item | Recorded result |
| --- | --- |
| Application source | `c58f3ef1a2a169f946d04e545a50b86ab6eccc5c` |
| Release | [v2.11.0 static package and source](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.11.0); ZIP and checksum asset sizes and server digests verified |
| CI | [40793176013](https://github.com/SuperOoze0309/MLAFMT/actions/runs/40793176013): all seven jobs succeeded; no new native installers were published |
| Local regression | 268 Python tests and 159 subtests passed, one native LibreOffice test skipped; 545 Node cases passed |
| Local browser | The final standalone frozen preview passed 18 checks, including all six actual conversions/downloads and offline navigation; this is separate from production browser acceptance |
| Frozen upload | `dist/formcapy-v2.11.0-standalone-preview/`; 195 manifest entries plus the manifest, 196 physical files; all bytes remained unchanged after acceptance |
| Manifest SHA-256 | `322ed026f62f89e32532bf0b3875677aeefd3ad7c997d510d5193f21d69f1507` |
| Release ZIP SHA-256 | `e54d52c826647b0ed6544691a3c44d73e1b857e0fe4049eadbc9343f8e227aa5` |
| Public cache | `formcapy-2.11.0-pyodide-314.0.7-a13935a88c02` |
| Full root / www sweep | 390/390 downloadable resources matched frozen size/SHA-256, security headers and MIME; 813,172,914 decoded bytes verified with 410 GET requests, zero errors and zero retries |
| HTTPS and pages | Both domains report v2.11.0 and the accepted manifest; homepage converter navigation and frozen page bytes match; HTTP upgrades preserve tested encoded paths and queries |
| Production browser | Edge 156.0.4314.50 passed all 18 checks and six actual conversion downloads, including Chinese content/fonts, cancellation, image-only PDF rejection and offline navigation in both directions |
| Independent production files | Both PDFs contain the exact Chinese text and embedded CJK fonts with ToUnicode maps; DOCX XML and genuine DOC WordDocument/table streams passed independent checks |
| Production browser trace | 115 GET requests, zero external requests, console/page/worker-audit errors, or unexpected request failures; one expected canceled Fetch from the cancellation check |

The browser run used normal Service Worker registration, activation and
navigation control without forcing activation or client claims. Its request
trace covers the page/iframe and conversion workers; initial Service Worker
install fetches are outside this CDP trace. A test-harness pause that affected
the first run was corrected without changing the deployed artifact; see the
provenance in [test scope](TESTING-v2.11.md).

HTTP evidence is `build/v2.11.0/production/deployment-verification.json`;
the successful browser report, actual downloads and screenshots are under
`build/v2.11.0/production/browser-fixed/`. The initial report remains in
`build/v2.11.0/production/browser/`. See [test scope](TESTING-v2.11.md) and
[conversion limits](CONVERSION.md). Safari, physical devices and installed
native LibreOffice conversion remain outside this acceptance.

## Prior public website — v2.10.0

The static website is live at [formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/). On 25 October 2026
(America/Los_Angeles), Windows MCP selected the accepted H-drive folder,
confirmed all 150 files and completed Deploy in Edge. Cloudflare active
version `ef4332f7` was observed as Ready with the same-row 100% traffic control.

This update adds local library search/type filters and reviewed CSL-JSON,
RIS and modern UTF-8 `.bib` exports for all or filtered entries. Comparison
text stays in the complete FormCapy library backup; portable exports contain
bibliographic metadata only. The website remains anonymous and browser-local.
Only an explicit DOI query contacts Crossref; no account, database, draft
upload or server conversion service was added. Offline installers remain
[v2.5.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0).

| Item | Recorded result |
| --- | --- |
| Application source | `06fa5d27620fc24bfbc66bb89514ef5872cf369e`, pushed and remote main verified through Windows MCP |
| CI | [40206817471](https://github.com/SuperOoze0309/MLAFMT/actions/runs/40206817471): test job passed; native build jobs were still running when checked and are separate from this web-only release |
| Local regression | 525 Node cases, 228 Python tests plus 159 subtests; citation pin verification and real local Pyodide/Worker smoke passed |
| Local browser | 42 real Chrome checks passed against the final layout, including three explicit live DOI requests, local imports, search/filtering, six portable downloads, full backup, MLA/APA Word, three languages and narrow layouts; controlled failure scenarios recorded separately |
| Independent local files | Six actual portable downloads passed pinned official CSL schema / external RIS and BibTeX parsers; two actual Word downloads passed ZIP/XML/relationship and preview/content/layout-property checks |
| Frozen upload | `dist/formcapy-v2.10.0/`; 149 manifest entries plus the manifest itself, copied byte for byte from the accepted preview |
| Manifest SHA-256 | `d59262177144ccc24a72b65ca45cab242caa4eb667d5cd4f3b82a2444520f764` |
| Public cache | `formcapy-2.10.0-pyodide-314.0.7-daf1a0e15016` |
| Worker sweep | 148/148 resources match size, SHA-256 and required security headers; 119,031,242 bytes verified once, all 18 MIME checks passed |
| Root / www | 46/46 key files match; both versions/manifests agree, zero analytics beacons, new export script has correct JavaScript MIME |
| HTTPS | 22/22 checks passed; trusted TLS 1.3 on both domains, HTTP upgrades preserve encoded paths and queries |
| Source and notices | Both provenance pages retain source/license links; both source archive route prefixes match and the full archive hash passed in the Worker sweep |
| Public browser | A separate complete 42-check Chrome run passed at the root HTTPS domain, with version 2.10.0, secure HTTP 200 navigation, three live DOI GETs, local imports, search/filtering, all/filtered exports and three-language narrow layouts; zero console errors or page exceptions |
| Public downloads | Nine actual clicked downloads passed byte/name/MIME checks. Root independently checked all six portable files with the pinned official CSL schema and external RIS/BibTeX parsers, and both Word files against captured previews and ZIP/XML/relationship/layout properties; complete library backup retains comparison text |

Full local and production evidence remains under `build/v2.10.0/acceptance/`
and `build/v2.10.0/production/` in the owner's H-drive workspace. No audit retry,
security/DNS/TLS setting change or post-acceptance artifact rebuild was made.
See [local verification scope](TESTING-v2.10.md). Word visual pagination,
Safari, physical devices and real Zotero application import remain unverified.

## Public v2.9.0 deployment record

The static website is live at [formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/). On 23 October 2026 (America/Los_Angeles),
Windows MCP selected the checked H-drive directory, confirmed its 149 files,
and completed Deploy in Edge. Cloudflare active version `b212e11a` was observed
as Ready with the 100% traffic control.

This version adds optional DOI batches, selective append, and offline
BibTeX/RIS/CSL-JSON import. The website remains static and anonymous. Drafts
and libraries stay in the browser; only an explicit query sends each DOI to
Crossref. Offline installers remain [v2.5.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0).

| Item | Recorded result |
| --- | --- |
| Application source | `1b6580bff3fe7701c85958f5aa331c769da6ea63` |
| CI | [40070497658](https://github.com/SuperOoze0309/MLAFMT/actions/runs/40070497658): all 7 jobs passed, confirmed on 25 October; native artifacts were not published in this web-only release |
| Local regression | 451 Node cases, 228 Python tests and 159 subtests passed; real local Pyodide/Worker smoke and citation pin verification passed |
| Local browser | 31 real Chrome checks, including explicit live Crossref batches, file imports, selection/undo, three languages and four viewport sizes; controlled failure/cancellation/429 cases recorded separately |
| Download inspection | Actual local-browser MLA/APA Word downloads passed ZIP/XML/relationship checks and exact preview text, order, italics, links and layout-property comparison |
| Uploaded snapshot | `dist/formcapy-v2.9.0/`; 148 manifest entries plus `manifest.json`, copied byte for byte from the accepted preview |
| Manifest SHA-256 | `d79ba46575e860d2bde89e1ff6060790918e56fd639f6d9d0d0cb7d2b7f2b490` |
| Public cache | `formcapy-2.9.0-pyodide-314.0.7-0b411fbea9f6` |
| Worker sweep | 147/147 downloadable resources match size, SHA-256 and required security headers; 118,978,497 bytes verified in one sweep, all 17 MIME checks passed |
| Root / www | 44/44 key-file comparisons pass, including all three new citation scripts; both versions and manifests match, zero analytics beacons |
| HTTPS | 21/21 checks passed; trusted TLS 1.3 for both domains, HTTP upgrades preserve encoded paths and query strings |
| Source and notices | Provenance pages retain license/source links; source-archive prefixes match on both domains and the full archive hash matches in the Worker sweep |
| Public browser | 19 real Chrome checks passed on the root domain: v2.9.0, main-paper generation, real DOI batch/selection, MLA/APA previews, three languages and narrow layout; no console errors or page exceptions |
| Public downloads | Both actual MLA/APA bibliography downloads also passed independent ZIP/XML/relationship and six-entry preview/content/layout comparison; the main-paper fields and original result link stayed intact |

Full local and public evidence remains under `build/v2.9.0/acceptance/` and
`build/v2.9.0/production/` in the owner's H-drive workspace. No security,
DNS or TLS setting was changed. No automatic audit retry was performed.
See [local verification scope](TESTING-v2.9.md). Word page rendering,
Safari and physical-device behavior remain unverified.

## Public v2.7.1 deployment record

The static website is live at [formcapy.com](https://formcapy.com/)
and [www.formcapy.com](https://www.formcapy.com/). The frozen H-drive folder was
uploaded on **22 October 2026**; Cloudflare production version `0cf62f91` was
observed as **Ready, 100% traffic**. This is a web-only interface update;
downloadable desktop and Android apps remain
[v2.5.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0).

The lake-blue/paper-white theme adds clearer workspace sections and capybara
details. Template controls, advanced options, dialogs and status messages now
share consistent borders, focus indicators and touch targets. Narrow and
low-resolution layouts reduce header space and allow long translated labels
to wrap. Existing update notices, course-template sharing and the reference
assistant remain available. Processing remains browser-local, anonymous and
static, without a new account, database or conversion service.

| Item | Recorded result |
| --- | --- |
| Application source | `166d739813e3cbea8f98d12b1cd9ded08f4e1e78` |
| CI | [39821220581](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39821220581): all 7 jobs passed; native artifacts were not published in this web release |
| Local regression | 309 Node checks, 228 Python tests and 159 subtests passed |
| Layout / accessibility | Main form and expanded citation assistant each passed three languages at five viewport sizes, down to 320×568; no horizontal overflow. Coarse-pointer simulation verified 44 px targets and 16 px citation fields; these are Edge simulations, not physical-device checks |
| Uploaded frozen folder | `dist/formcapy-v2.7.1/`; 145 manifest entries plus `manifest.json` (146 files); 118,848,863 declared file bytes |
| Manifest SHA-256 | `a390e1fc52610a69ecf029d62da345eef74202e0210653357b1f03e12da4ff88` |
| Public cache | `formcapy-2.7.1-pyodide-314.0.7-29810afbf0a4` |
| Worker sweep | 144/144 downloadable resources match size and SHA-256; 118,848,222 bytes verified in one full sweep; 144/144 required security-header sets and 14/14 MIME checks passed |
| Root / www | 38/38 key-file comparisons and header checks pass; both homepages match the 211,042-byte frozen HTML; manifests and service workers match the frozen version/cache |
| Analytics | Zero injected Cloudflare analytics beacon scripts across both homepages |
| Source and notices | Both provenance pages retain license/source links; both source archive routes return matching gzip prefixes; the archive's full hash is included in the Worker sweep |
| HTTPS | 18/18 checks passed with trusted TLS 1.3 and verified certificate chains/hostnames; HTTP upgrades preserve encoded paths and queries |
| Public Edge update | The existing v2.7.0 page displayed its normal update notice; explicit saved-work confirmation loaded v2.7.1 and its new theme |
| Actual paper downloads | Edge selected a fictional DOCX through the system picker, retained paragraphs 3 and 8, and saved MLA (56,743 bytes) / APA (56,816 bytes) outputs directly to H. ZIP/XML checks confirmed preserved paragraph XML, image SHA, table/order, new reference page, alphabetical sorting, spacing/indentation, margins and PAGE fields |
| Actual bibliography downloads | Separate MLA (37,186 bytes) and APA (37,166 bytes) Word files match the three fictional sources' actual DOM previews, entry order, italics and safe hyperlinks; APA heading boldness, font, spacing and hanging indents passed |
| Language retention | Chinese, English and Spanish retained the paper title/date, main APA result link, independent APA result link and citation preview; zero console warnings/errors |
| Devices / rendering | Downloaded-file checks establish ZIP/XML structure, not visual pagination. Word rendering, Safari and physical devices remain unverified |

The static artifact was not rebuilt after acceptance. The HTTP wrapper exited
0 after one full resource sweep. No request retry, repeated sweep, WAF/DNS/TLS
setting change or new credential/security permission was needed. Both original
service-worker response records already contain the JavaScript MIME result;
the finalizer validates the original captures without deriving missing fields.

Evidence is under `build/v2.7.1/production/`: `public-http-verification.md`,
`cloudflare-worker-asset-audit.json`, `domain-asset-verification.json`,
`http-verification-summary.json`, `https-audit.log` and
`cloudflare-ready-0cf62f91.png`, `public-browser.json`,
`browser-docx-inspection-papers.md`, `browser-docx-inspection-references.md` and
`browser-docx-inspection-all-four.json`. Actual browser files are saved under
`build/v2.7.1/downloads/` and are distinct from the local Python API fixtures.
The [v2.7.1 public-site screenshot](images/formcapy-live-v2.7.1.png)
uses fictional example data; the paper panel illustrates layout rather than
proving Word pagination.

## Public v2.7.0 deployment record

The checked v2.7.0 static website was deployed at [formcapy.com](https://formcapy.com/)
and [www.formcapy.com](https://www.formcapy.com/). The owner uploaded the frozen
H-drive artifact on **22 October 2026**. Cloudflare automatically deployed
production version `890b8ee5`, observed as **Ready, 100% traffic**. This is a
web-only release; downloadable desktop and Android apps remain
[v2.5.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0).

The release adds safe update notices and a browser-local reference assistant
for books, journal articles and webpages, with MLA 9 / APA 7 previews, independent
Word reference lists and citation-library JSON. It also fixes cancellation,
recovery and stale asynchronous results. No visitor account, database or server
conversion service was added. Citation libraries are session-only unless the
user explicitly saves them on the device; template exports exclude them.

| Item | Recorded result |
| --- | --- |
| Application source | `866e0cb4bc48767f96d5a8681c46609a25390c43` |
| CI | [39718820575](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39718820575): all 7 jobs passed; native artifacts were not published in this web release |
| Local regression | 309 Node checks, 228 Python tests and 159 subtests passed |
| Uploaded frozen folder | `dist/formcapy-v2.7.0-debug/`; 145 manifest entries plus `manifest.json`; 118,835,570 declared file bytes |
| Manifest SHA-256 | `fbf3eeed6b54d7fb95f61e90864c92acb929edcb4afe262b9be3c8ca187100c8` |
| Public cache | `formcapy-2.7.0-pyodide-314.0.7-a3c606097254` |
| Recovery integrity | After the unexpected shutdown, Git object checks found no missing/corrupt objects, and all 145 artifact hashes/sizes still matched |
| Worker sweep | 144/144 downloadable resources match size and SHA-256; 118,834,929 bytes verified in one full sweep; all required security headers and 14 MIME checks passed |
| Root / www | 38/38 key-file comparisons match; both manifests and SWs match the frozen version; zero injected analytics beacons |
| Source and notices | Provenance/license pages and both original source archive routes are reachable; the archive's full hash is included in the Worker sweep |
| HTTPS | 18/18 checks passed with trusted TLS 1.3; HTTP upgrades preserve encoded paths and queries |
| Public Edge | Root domain v2.7.0 generated the built-in MLA draft; reviewed/imported three fictional book/article/web records; MLA and APA previews and independent Word output links succeeded |
| State retention | Chinese, English and Spanish switching retained the manual paper date, title, main paper output link, APA reference-list link and preview; zero console warnings/errors |
| Downloads / devices | This round did not download a fresh browser DOCX for inspection; independent WASM ZIP checks are separate. Safari and physical devices remain unverified |

Edge initially served its older v2.5.0 offline cache. A normal built-in demo
conversion initialized registration; closing only the agent's completed test
tab and reopening the root domain loaded v2.7.0. No cache/storage clearing,
forced activation or closure of user tabs was used. For the first upgrade from
an older page without the new notice, save/download current work before closing
old FormCapy tabs and reopening. The v2.7 notice itself requires explicit
save-and-update consent and protects active processing and other same-scope tabs.

The static artifact was not rebuilt after acceptance. The HTTP audit ran one
full resource sweep. Its domain helper initially omitted two SW MIME result
fields; the final report derives those fields from the already captured
`text/javascript` headers, retaining the original response record and hash.
No HTTP retry or production security/DNS/TLS setting change was made.

Evidence is under `build/v2.7-web-release/production/`:
`public-http-verification.md`, `cloudflare-worker-asset-audit.json`,
`domain-asset-verification.json`, `https-audit.log`, `public-browser.json` and
`cloudflare-ready-890b8ee5.png`. The [public reference-assistant screenshot](images/formcapy-live-v2.7-citations.png)
contains fictional paper details, fictional references and the visible processor
attribution. Local debugging is separately recorded in `build/debug-v2.7/report.md`;
the post-shutdown integrity record is `build/v2.7-web-release/recovery-integrity.md`.

## Public v2.6.0 deployment record

The v2.6.0 source adds self-contained `FC1.` course-template codes, versioned
sharing JSON and review before applying. The existing layout-only JSON remains
compatible with v2.5.0 offline apps. No share-link service, server, database or
visitor account is added. Current downloadable apps remain v2.5.0; this is a
static-website update.

The owner uploaded the checked H-drive folder on 21 October 2026. The existing
Cloudflare Worker automatically deployed production version `a4500358`, shown
as **Ready, 100%**. At that deployment, both [formcapy.com](https://formcapy.com/)
and [www.formcapy.com](https://www.formcapy.com/) served the v2.6.0 snapshot.

| Item | Recorded result |
| --- | --- |
| Application source | `4e8817579e20a2003b86640e0e0dba6e3876dcfc` |
| CI | [39586840224](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39586840224): all 7 jobs passed; native build artifacts were not published in this website release |
| Local Python regression | 161 tests and 159 subtests passed |
| Node regression | 112 cases passed, including 40 codec and 7 sharing-state cases; both new suites also ran in CI |
| Uploaded folder | `dist/formcapy-v2.6.0/`; 125 manifest entries plus `manifest.json` (126 files) |
| Manifest SHA-256 | `d62c46e30d1b81fbcdd901155009322031184170e78f24eb160da61e5c071189` |
| Public cache | `formcapy-2.6.0-pyodide-314.0.7-f1db3d613220` |
| Worker asset sweep | 124/124 downloadable files match local size and SHA-256; 115,884,667 bytes checked in one sweep |
| Root / www | 10/10 homepage, manifest, SW and sharing-script comparisons match; zero analytics beacons |
| HTTPS | 15/15 checks passed, trusted TLS 1.3; HTTP upgrades preserve encoded paths and queries |
| Public Edge | Code copied on Worker, pasted/previewed/applied on `www` in Spanish; date and paper course preserved; both origins generated the demo with the shared profile |
| Sharing JSON | Actual public output has 19 settings and 4 labels; excludes fictional paper name, title and date |
| Downloads / devices | No fresh browser DOCX or JSON download inspection; Safari and physical devices remain unverified |

Edge initially displayed its v2.5.0 offline cache. A normal demo conversion
initialized the runtime and its worker registration; closing only the agent's
old test tab and opening `www` again then showed v2.6.0. No cache, storage or
user-draft clearing, forced activation or user-tab closure was used. Save or
download current work before closing old FormCapy tabs to receive an update.
The first bare visit alone was not sufficient in this observed session.

Evidence is saved under `build/v2.6-web-release/`: `public-http-verification.md`,
`browser-verification.md`, the test logs and the production dashboard screenshot.
The [public template-code screenshot](images/formcapy-live-v2.6-template-code.png)
uses fictional paper details and user-entered example course labels.

Earlier local development observations are recorded in
`build/template-sharing/acceptance.md`. Do not describe Safari, physical devices
or native v2.6 installers as verified by this web deployment.

## Public v2.5.0 deployment record

**v2.5.0 was deployed** at [formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/). The owner uploaded the final
H-drive folder on 21 October 2026; Cloudflare production version `a9a1bc2e`
shows **Ready, 100%**. Chinese course-paper and basic-thesis presets, Spanish,
and the revised on-device privacy text are available without registration.
Existing Workers Routes, DNS and HTTPS settings remain in place.

| Item | v2.5.0 recorded state |
| --- | --- |
| Application source | `930d959bb4f5844ae81abb326b6d363c0c03334f` |
| Platform CI | [Run 39568529951](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39568529951), all 7 jobs passed |
| Downloads | [v2.5.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0), published `2026-10-21T08:33:08Z`; all 8 assets checked against REST size/digest metadata; tag targets the source commit above |
| Uploaded static artifact | `dist/formcapy-v2.5.0/`; 123 manifest entries plus `manifest.json` |
| Manifest SHA-256 | `3df0bee10ae34515bf9130d683101682254fd01ad04c979e5e3df86dc3d50e5b` |
| Public cache version | `formcapy-2.5.0-pyodide-314.0.7-7d9b79703923` |
| Public Worker assets | 122/122 downloadable resources match local SHA-256 and size; 115,845,925 bytes checked |
| Public HTTPS | 13/13 checks passed; trusted TLS 1.3, HTTP upgrades preserve path/query, root and `www` return 200 |
| Public homepage | Root and `www` match the final local HTML byte for byte after RUM was disabled |
| Public Edge generation | Built-in Markdown demo generated with both Chinese presets on `www`; course preset also generated on the root domain; Spanish interface checked; no console warnings/errors |
| Existing Edge cache | Reload initially retained v2.4.0; closing the agent's old root-domain test tab and reopening loaded v2.5.0 without clearing storage or drafts |
| Python regression results | 161 pytest tests plus 159 subtests passed |
| Node results | 65 cases passed |
| Local browser | Codex in-app Chromium at `http://127.0.0.1:8606/` |
| Local preservation result | Synthetic DOCX generation reported 2 preserved paragraphs, 1 body image and 1 table |
| Offline check | Simulated offline reload and generation passed; online conditions were restored |
| Download limitation | This round's local and public browser DOCX files were not downloaded; UI counts are not a fresh downloaded-file inspection |
| Device limitation | Safari and physical Apple devices remain unverified; physical Android checks remain unverified |

Saved local evidence is `build/chinese-presets/final-browser-verification.json`.
It records the final source commit and cache version, Chinese course-preset
generation, language switching that preserved fields, and an export containing
all 19 template fields without paper details. The thesis preset was generated
before the final copy polish. The offline run used CDP network simulation,
not physical disconnection. Independent Python regression checks cover DOCX
structure; they do not establish a new browser-download or Safari result.

Public HTTP evidence is saved in `build/v2.5-web-live/verification.md` and
`analytics-before-after.md`. The initial custom-domain HTML included a
367-byte Cloudflare analytics loader absent from the build. Zone Speed → Real
user monitoring was set to **Disable completely**; the dashboard then showed
“RUM is currently disabled for this zone.” After propagation, both public
homepages returned 189,147 bytes, zero beacon scripts and SHA-256
`54194eab77962d2586bcb0c063db68540733194a7418906ea2eacb84eef9def4`, exactly
matching the local HTML. No WAF or TLS protections were changed. The initial
injection alone did not establish draft upload.

The [v2.5 local preview](images/formcapy-v2.5-chinese.png) uses fictional test
information. The [public v2.5 screenshot](images/formcapy-live-v2.5-zh.png) uses
the built-in Markdown demo and fictional paper details. Other public Edge
screenshots and generation observations are recorded separately under
`build/v2.5-web-live/`. Save or download any current work before
closing old FormCapy tabs and reopening to receive the new offline cache;
ordinary upgrades deliberately do not replace a running page's runtime.
Safari, physical devices and a fresh public DOCX download remain unverified
for this update. The v2.4.0 launch evidence below is historical.

## Historical public deployment — v2.4.0

The browser-local application first went live at
[formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/) on **Cloudflare Workers Static
Assets, free plan**. The initial launch was on **21 October 2026 UTC
(20 October in Los Angeles)**; the cache repair and public asset/TLS checks were
recorded on **21 October in both UTC and Los Angeles**. The deployed code is
`f7c3444`; subsequent
documentation edits do not change that deployed application code.

The DSH browser-local refactor (`0e5e923`) was merged in `adeca89`. At the
v2.4.0 launch, the uploaded static artifact came from `dist/browser-local/`.
The v2.5.0 update uses the separate staging directory recorded above.

| Item | Recorded state |
| --- | --- |
| Hosting product | Workers Static Assets, free plan |
| Worker / deployed version | `formcapy` / `6769274b` |
| Worker URL | [formcapy.benzooze0309.workers.dev](https://formcapy.benzooze0309.workers.dev/) |
| Domain connection | Workers Routes: `formcapy.com/*` and `www.formcapy.com/*`, fail closed |
| Root and `www` certificates | Active in Cloudflare |
| Always Use HTTPS | Enabled |
| Local static build | Built; default `--check` verified 123 manifest hashes |
| Source materials | 20 pinned inputs / 94 source files; `collected-not-rebuilt` |
| Local browser operation | MLA/APA generated and downloaded in Codex in-app Chromium |
| Public browser operation | Synthetic DOCX → MLA then APA, downloads and structure inspection passed in Codex in-app Chromium |
| Microsoft Edge | Built-in Markdown demo → MLA download passed; system file picker untested |
| Uploaded artifact | 124 files: 123 manifest entries plus `manifest.json` |
| Public Worker assets | 122/122 downloadable resources match local SHA-256 and size |
| Public domain checks | 13/13 passed, including trusted TLS 1.3 and HTTP upgrade redirects |
| Platform CI | Run `39559961737` for `f7c3444`: all jobs passed, including both Mac architectures and Android emulator checks |
| v2.4.0 launch release (historical) | [v2.4.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0), published 21 October 2026; 8 verified assets |

The `f7c3444` upload repairs the service-worker home-page redirect handling.
The public script and cache digest match the local build, and all 18 related
Node VM cases passed. The old cache's first reload can still fail while it
triggers the update; a later reload recovered automatically in real Edge
without clearing caches or drafts. A new Codex in-app Chromium tab
loaded and reloaded normally. Chromium also reloaded, generated and downloaded
under simulated offline network conditions; the network setting was then
restored. This does not establish physical disconnection or Safari behavior.

The public static app is open to everyone without registration,
sign-in or a required email address. Cloudflare accounts are for the owner's
hosting and DNS administration only. Do not add visitor accounts or put the app
behind Cloudflare Access or another sign-in gate.

The static release runs the Python formatter through **Pyodide 314.0.7** inside a
browser Web Worker. It accepts DOCX, TXT and Markdown with MLA 9, APA 7 student
and custom layouts; draft bytes and paper details stay on the device. It has no
Flask conversion endpoint or server-side Python dependency. The Tk native
desktop app and the Flask local web mode remain separate delivery paths.

First use downloads about **15.7 MiB** of program assets from the same origin.
The separate **95 MiB** source/notice kit under `licenses/runtime-materials/`
must be available through the license entry only and must stay out of the
service-worker precache. The total static artifact is about **110.4 MiB**, with
the largest file a 20 MiB archive part. The uploaded program and source files
matched the local final artifact in the public Worker audit.

### Domain routing

The live domains use **Workers Routes**, configured as `formcapy.com/*` and
`www.formcapy.com/*` for Worker `formcapy`, with **fail closed** selected. Existing
proxied DNS records and Universal SSL provide the domain entry points. Always
Use HTTPS performs the HTTP upgrade; both HTTPS hostnames serve the app directly.

The Workers **Custom Domain** wizard was not bound: it reported conflicts with
the existing parking A/CNAME records. Those records were not deleted; the live
configuration uses Routes instead. Existing mail MX/TXT records were retained.
Do not describe this deployment as a Workers Custom Domain binding.

The Render files (`render.yaml`, `requirements-web.txt`, `gunicorn.conf.py`) and
the instructions below are retained as a **fallback only**. They do not represent
the current launch procedure or evidence that a public service is running.

Reuse existing authenticated sessions and complete routine one-click sign-in
when possible. Hand off steps that require the owner, such as entering a new
password, completing a verification challenge, or supplying a code. Confirm any
new security-sensitive permission grant with its actual scope before accepting
it; do not request repeated approval for routine deployment work already
authorized by the owner.

## v2.4.0 public launch acceptance and future check requirements

The local results are documented in [BROWSER-LOCAL.md](BROWSER-LOCAL.md). DSH's
headless Chrome evidence and the Codex in-app Chromium checks are separate from
a real Edge or Safari run. The independent real Edge check passed the built-in
Markdown demo generation/download flow; Edge system file selection remains
untested. Safari/macOS, physical iPhone/iPad, Firefox and
Android physical-device checks have not been performed. The updated Android app
has passed CI compilation and emulator offline/file-operation checks. All jobs
in platform CI run `39559961737` for `f7c3444` passed, including both Mac
architectures on their first attempt. The separate
[v2.4.0 release](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0)
was published at **2026-10-21 07:20:44 UTC** with eight assets from that run.
Asset names, sizes and SHA-256 values were checked before publication.

Completed public checks and remaining interactive/device checks are distinguished
below. Keep the deployed commit, artifact manifest, date and browser/device
details with each new result. The v2.4.0 launch release targets
`f7c3444436b1bd11a06085c9ea202f7f5711e508`; later documentation-only commits did
not change that historical deployment. The v2.5.0 source and uploaded artifact are
recorded separately above.

- [ ] The finished static build loads its browser runtime and processes supported
  drafts without a Flask server. Inspect network requests during file selection,
  paragraph inspection, conversion, and download: draft bytes and paper details
  must not be sent to a server. Privacy text must match the implementation.
- [x] Public-site CUA in Codex in-app Chromium selected a synthetic DOCX, read
  eight paragraphs, selected ids 1 and 5, then generated/downloaded MLA and APA.
  Both downloads passed the document-preservation checks recorded below.
- [x] Real Microsoft Edge opened the public site anonymously, generated from
  the built-in Markdown demo and downloaded a valid 37,720-byte MLA DOCX. This
  does not cover its system file picker or DOCX paragraph-preservation flow.
- [x] An existing Edge client recovered from the first broken cache on a later
  reload after the first failed reload triggered an update; no cache or draft
  clearing was used. A new Codex in-app Chromium tab loaded and reloaded normally.
- [x] Codex in-app Chromium reloaded the public site and generated/downloaded a
  Markdown example with offline network conditions simulated through CDP. The
  test restored online conditions afterwards; physical disconnection and Safari
  offline behavior remain unverified.
- [ ] Initial loading and ordinary formatting do not request the 95 MiB source
  kit. It becomes available only through the license entry; no source-material
  URL is in the program precache. Revisit offline only after installation and a
  navigation that gives the service worker control. A first uncontrolled page
  is outside the old-cache version-isolation guarantee.
- [x] `https://formcapy.com` and `https://www.formcapy.com` both have valid,
  browser-trusted TLS certificates covering the requested hostname. Verify the
  certificate chain, validity period, and absence of browser security warnings.
  A `www` redirect still requires valid TLS before it can redirect to the root.
- [x] `http://formcapy.com` and `http://www.formcapy.com` redirect to HTTPS, preserve
  the requested path and query string, and have no redirect loop. The HTTPS `www`
  entry may redirect to the canonical root domain.
- [x] Public Chromium CUA had no Console warnings or errors. The asset audit
  verified program files, expected MIME types including `application/wasm`, and
  basic security headers. The root and `www` samples used same-origin HTTPS;
  a missing WASM URL returned 404 rather than an HTML fallback.
- [ ] In Safari, Chrome, and Edge, choose supported DOCX, TXT, and Markdown files
  using the system file picker; complete conversion; download the generated DOCX;
  and confirm that the saved document opens and has the expected filename and
  content. Include filenames containing spaces and non-ASCII characters. Record
  each browser separately; a result from one browser does not cover the others.
- [ ] On a **physical iPhone** and a **physical iPad**, separately check Safari
  file selection, conversion, download, and finding or saving the DOCX in Files.
  Record the device and iOS/iPadOS version. If either device is unavailable, mark
  that device **unverified — no physical device available** in the acceptance
  report. Desktop resizing, emulation, and another Apple device do not establish
  that the missing device has passed; do not claim full iPhone/iPad verification.

### Saved launch evidence

- `build/launch/public-https-verification-repair.txt`: **13/13 passed**. Both hostnames
  returned 200 over TLS 1.3 with trusted certificate chains and valid hostnames;
  HTTP returned 301, preserved the requested path/query and had no redirect loop.
  The service worker, transport, Worker, manifest, runtime MJS and WASM
  samples loaded over same-origin HTTPS. The earlier launch check separately
  verified the on-demand source index.
- `build/launch/cloudflare-worker-asset-audit.json`: **122/122 downloadable
  resources** matched the final local artifact's SHA-256 and size at the public
  Worker URL. WASM and MJS had the expected content types, the basic security
  headers were present, and a missing `.wasm` URL returned 404. The current cache
  is `formcapy-2.4.0-pyodide-314.0.7-d035ce17a12d`. The artifact's
  `manifest.json` SHA-256 is
  `cf144c0f0b5e5fa32a4940bf05f2fea0fb779c8e5ed69fb8ad99b2ab7ac41263`.
- `build/launch/public-docx-verification.json`: real public CUA in the Codex
  in-app browser (Chromium) generated and downloaded MLA then APA from one
  synthetic DOCX. Each result retained two selected paragraphs' fonts, sizes,
  colors and styles, one byte-identical image, one table, the hyperlink target
  and italic formatting. References used `pageBreakBefore=True`; page margins
  were 1 inch. Console warnings/errors were empty. The
  [public-site screenshot](images/formcapy-live-zh.png) uses fictional paper
  information and the synthetic draft. The viewport capture is
  `build/launch/formcapy-live-result.png`.
- `build/launch/public-edge-verification.json`: real Microsoft Edge used the
  built-in Markdown demo and downloaded `Example_MLA_Essay (4).docx`
  (**37,720 bytes**) through the page's download link into Windows Downloads.
  ZIP integrity, python-docx readability, references on a new page and the
  Example header passed; Console warnings/errors were empty. Edge system file
  selection was not tested because extension upload permission was unavailable.
  The screenshot is `build/launch/formcapy-live-edge.png`.
- `build/launch/draft-verification.json`: pre-publication release validation
  checked the eight asset names, sizes, SHA-256 values and target commit. The
  release was then published as v2.4.0, with draft and prerelease both false.
- `build/launch/public-sw-browser-verification.json`: existing-client recovery,
  new-tab reload and Chromium simulated-offline reload/generation/download
  checks. The legacy cache's first reload can fail before the replacement is
  installed; a later reload recovered without clearing caches or drafts. The
  offline test used CDP network emulation and restored online conditions.

Future [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
updates should upload the complete artifact, including the on-demand source
materials, and repeat the public checks against that build's manifest. Keep
program asset URLs on the same origin and preserve the existing Workers Routes,
DNS/mail records, certificates and
[Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/)
configuration. See also
[Universal SSL certificates](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/).

## Fallback: Render Python service

This section applies only if a later decision explicitly activates the Render
fallback. It runs the existing Flask formatter and uploads drafts to the server;
its privacy and operating details differ from the live browser-local release.

### Create the fallback service

1. Push the current source and `render.yaml` to the `main` branch of
   [SuperOoze0309/MLAFMT](https://github.com/SuperOoze0309/MLAFMT).
2. In Render, create a **Blueprint** from that repository. Sign in and authorize
   repository access when prompted. Check that the service plan is **Free** before
   creating it. The Blueprint creates one web service and no database or disk.
3. Wait for the build and initial deployment. Render assigns an `onrender.com`
   address; keep it available while configuring the custom domain.
4. Add the DNS records displayed under the service's **Settings → Custom Domains**
   for `formcapy.com`. Use the exact values shown by Render, then select **Verify**.
   Render issues and renews the TLS certificate and redirects HTTP to HTTPS.

If creating the web service manually, use these settings:

| Setting | Value |
| --- | --- |
| Repository / branch | `SuperOoze0309/MLAFMT` / `main` |
| Language | Python 3 |
| Region | Oregon |
| Instance type | Free |
| Build command | `pip install -r requirements-web.txt` |
| Start command | `gunicorn --config gunicorn.conf.py mla_web:app` |
| Health check | `/healthz` |
| Environment | `PYTHON_VERSION=3.12.15`, `FORMCAPY_PUBLIC=1`, `PYTHONUNBUFFERED=1` |

No application secret, account database, paid instance, or persistent disk is
required. `gunicorn.conf.py` listens on Render's `PORT`, with one worker and one
request thread to limit simultaneous document allocations. Requests have a
120-second worker timeout. Windows desktop/local previews continue using
`python mla_web.py`; Gunicorn runs on the Linux server.

The Blueprint deploys later commits to `main` automatically. For a rollback, use
Render's deployment history to redeploy the previous successful deployment.

### Fallback draft handling and privacy

- Public web requests send the selected draft and paper details to the Flask
  server over HTTPS. Paragraph inspection also sends the draft to that server.
- The app writes an uploaded draft to a temporary file and attempts to delete
  that file in a `finally` block after each request, including validation errors.
  An abruptly terminated process can leave a temporary file until the service's
  ephemeral filesystem is replaced. No persistent disk or document archive is
  configured.
- Generated documents are returned from memory. The browser keeps the latest
  result available for download while the page remains open. There is no account
  system, server-side document library, or cloud sync.
- API responses use `Cache-Control: no-store`. Application access logging is
  disabled in Gunicorn; the hosting provider may still process operational
  metadata such as IP addresses and request times. The app does not intentionally
  log draft text or paper details.
- Saved course templates remain in browser local storage. They contain formatting
  settings, not draft files.
- `FORMCAPY_PUBLIC=1` selects the public upload notice. A non-loopback hostname
  also selects that notice if the flag is missing. Localhost keeps the local
  server notice, and the Android native bridge keeps its offline notice.
- Uploads are limited to 20 MiB. DOCX archives also have an existing expanded-size
  limit in the document reader. Large or complex documents can still exceed the
  memory or time available on a free instance.

### Fallback free service limits

Render documents these limits for free web services as of 20 October 2026:

- The service sleeps after 15 minutes without inbound traffic. Its next request
  can take about a minute to wake it.
- Each workspace receives 750 free instance hours per month, shared by its free
  web services. Outbound bandwidth and build usage also have quotas.
- The service filesystem is ephemeral. Restarting or redeploying can replace it.
- Free services support custom domains and managed TLS. The Hobby workspace
  includes two custom domains. Confirm the dashboard's current limits before
  adding other services or domains.

The configuration explicitly sets `plan: free`; omitting that field from a
Blueprint can select a paid plan. No payment details or paid add-ons are needed
for this configuration. Review Render's dashboard if it asks to add billing or
upgrade the service.

### Render fallback references

- [Deploy Flask on Render](https://render.com/docs/deploy-flask)
- [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Pin the Python version](https://render.com/docs/python-version)
- [Free service limits](https://render.com/docs/free)
- [Custom domains and TLS](https://render.com/docs/custom-domains)
- [Gunicorn settings](https://gunicorn.org/reference/settings/)
- [Gunicorn package release](https://pypi.org/project/gunicorn/26.2.0/)
