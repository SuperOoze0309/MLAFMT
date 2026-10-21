# FormCapy web deployment

## v2.6.0 website update — awaiting production upload

The v2.6.0 source adds self-contained `FC1.` course-template codes, versioned
sharing JSON and review before applying. The existing layout-only JSON remains
compatible with v2.5.0 offline apps. No share-link service, server, database or
visitor account is added. Current downloadable apps remain v2.5.0; this is a
static-website update.

The source and static artifact are being checked before upload to the existing
Cloudflare Worker. Production still serves v2.5.0 until the upload is verified.
The previous production record below remains historical evidence for that build.

Local development observations are recorded in
`build/template-sharing/acceptance.md`; automated release checks for this update
are kept under `build/v2.6-web-release/`. Do not describe Safari, physical devices
or native v2.6 installers as verified by this web deployment.

## Public v2.5.0 deployment record

**v2.5.0 is live** at [formcapy.com](https://formcapy.com/) and
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
