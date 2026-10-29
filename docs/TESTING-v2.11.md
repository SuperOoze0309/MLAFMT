# v2.11.0 conversion verification

Verified on 28 October 2026 (America/Los_Angeles). The local sections cover
source and frozen static previews. The separate production section records
the public deployment and its current verification limits. No new native
installer is included.

## Automated regression

- Python: 268 passed, 1 skipped, 159 subtests passed. The skipped test requires
  an installed native LibreOffice, which is absent on the verification machine.
- Node: 545 cases across 17 logic/DOM suites passed, including 19 independent
  converter lifecycle cases and 11 citation-host concurrency cases. The final
  warning text change was followed by another passing 19-case converter run.
- Real Tk parent-destruction test confirms that closing the main window also
  cancels a native conversion and allows its worker cleanup to finish.
- Desktop GUI smoke with `--require-dnd` passed. This checks the source GUI;
  no native release package was produced.

PDF tests use real PDF streams and inspect actual generated DOCX files. They
cover editable text/order, page-break insertion, encrypted and image-only
documents, page/content limits, input immutability, malformed containers,
external-resource rejection, missing native dependencies, cancellation and
temporary-directory cleanup. Bridge tests cover request dispatch without paper
identity fields, error propagation and validation without a native subprocess.

## Actual browser, downloads and Chinese text

The installed desktop Chrome ran the frozen static app with normal browser
sandboxing and COOP/COEP isolation. Fourteen checks passed:

- All six format directions were explicitly clicked and downloaded: DOCX→PDF,
  DOCX→DOC, DOC→DOCX, DOC→PDF, PDF→DOCX and PDF→DOC.
- A real engine-load cancellation removed the old job, released the host lock
  and allowed retry. File selection alone did not fetch the large office engine.
- Each downloaded file's byte count, MIME and SHA-256 matched its actual Blob.
  Independent Python checks verified PDF text/fonts, DOCX ZIP CRC/XML and
  genuine DOC compound storage with WordDocument and 0Table/1Table streams.
- Both PDFs and both DOCX outputs preserve the exact Chinese fixture text
  `中文论文排版测试 水豚`, including PDF text reconstruction. Both PDFs embed
  NotoSansCJKsc-Regular with ToUnicode maps.
- PDFium rendered both actual PDF downloads. Visual review confirmed readable
  Chinese, complete text and no clipping or missing-glyph boxes. The legacy
  DOC roundtrip visibly flattens the test table; the warning discloses this.
- Existing paper fields/result stayed intact. Chinese, English and Spanish
  layouts had no horizontal overflow at 320 and 390 pixels.
- Zero external requests, document uploads, console errors or page exceptions
  were recorded by the page CDP connection and local asset server.

The separate office-driver harness passed 13 checks, including true-format
outputs, editable text, cancellation and a successful cached conversion while
runtime network access was deliberately blocked. Its expected simulated
ERR_INTERNET_DISCONNECTED is separate from the final UI run's zero errors.
The later Chinese-font office check also passed and was visually reviewed.

## Frozen artifact and evidence

- Preview: `dist/formcapy-v2.11.0-preview/`.
- Manifest SHA-256: `8f5f1983a8e831ebdc02cb5a794a8b349ff6b844d76a546322674d30d91c0a1d`.
- Cache: `formcapy-2.11.0-pyodide-314.0.7-906ba5847614`.
- 192 manifest entries plus the manifest itself: 193 physical files.
- Application files: 299,634,350 bytes, including the lazy office runtime and
  CJK font. Source materials: about 101.9 MiB. Total listed: 406,529,058 bytes.
- Fifty app-shell assets are precached; large `runtime/office/` assets are
  excluded and cached on demand. Only program files enter these caches.
- All manifest sizes/digests matched; no publication asset reaches 25 MiB.
- pypdf 6.21.4 wheel, source and original BSD license are pinned and verified.
  The unchanged upstream office runtime, source links and licenses, and the
  original CJK font/OFL license are included. No upstream native/WASM rebuild
  is claimed.

Evidence stays under `build/v2.11.0/`: `pytest.log`, the 17 Node logs,
`acceptance/browser/report.json`, its six real `downloads/`, UI screenshots,
`acceptance/pdf-render/`, `office-acceptance/`, and `office-cjk-acceptance/`.
An earlier Latin-only successful UI run is retained in
`acceptance/browser/attempt-before-final-warning/`.

Run a local preview with isolation headers:

```powershell
.venv\Scripts\python.exe scripts/preview_local.py --directory dist/formcapy-v2.11.0-preview --port 8611
```

## Practical limits

PDF→Word reconstructs editable text and inserts page boundaries. It omits
images and original layout/table structure; no OCR is included. Font
substitution and legacy DOC feature loss can change Word conversion results.
The office runtime uses 1 GiB of shared WASM memory plus additional buffers;
low-memory mobile devices may not run it. Desktop Chromium checks and viewport
simulation do not establish Safari or physical-device compatibility.

Native LibreOffice routes were validated through subprocess/validation tests
and the same browser office filters, but a real installed native LibreOffice
was not run here. Existing published installers do not contain this iteration.

## Standalone converter page follow-up

At the user's request, the converter was moved from the paper formatter into
`converter.html`. The home page now has a prominent top navigation link and
does not mount or load the converter UI/office adapter. The standalone page
opens the file and output-format controls immediately and has its own language,
update and conversion lifecycle. No new conversion engine was introduced.

The separate frozen build is `dist/formcapy-v2.11.0-standalone-preview/`.
Its manifest SHA-256 is
`322ed026f62f89e32532bf0b3875677aeefd3ad7c997d510d5193f21d69f1507`;
cache `formcapy-2.11.0-pyodide-314.0.7-a13935a88c02`. All 195 manifest entries
(196 physical files) passed size/digest verification. Both HTML pages are
precached; the large office runtime remains lazy.

Eighteen real Chrome checks passed, including all six clicked conversions and
downloads, Chinese font/content checks, startup cancellation, image-only PDF
OCR-required rejection, homepage-to-converter navigation, default-expanded
controls, return navigation and offline navigation in both directions. Three
languages at 320 and 390 pixels had no horizontal overflow. There were no
external requests, uploads, failed requests, console errors or page exceptions.

Focused regression after separation: 26 Python tests plus 132 subtests and
115 Node cases across six affected logic/DOM suites passed. A citation-host
concurrency test was replaced by the new independent-page boundary check.
Source UI and all navigation screenshots were visually reviewed.

The original frozen build and reports above remain intact. Follow-up evidence
is under `build/v2.11.0/acceptance/standalone-browser/` and
`build/v2.11.0/standalone-*.log`. Preview with:

```powershell
.venv\Scripts\python.exe scripts/preview_local.py --directory dist/formcapy-v2.11.0-standalone-preview --port 8612
```

## Production deployment and verification — 2026-10-28

The accepted standalone artifact was deployed unchanged to Cloudflare Worker
`formcapy` as version `b0c26902-ddb7-4f8a-bc68-9558a1d4bc09`.
Wrangler reported 100% traffic, and the existing Edge dashboard showed Ready;
the screenshot is
`build/v2.11.0/production/deployment/ready-b0c26902.png`.
Application source `c58f3ef1a2a169f946d04e545a50b86ab6eccc5c` passed all
seven jobs in [CI run 40793176013](https://github.com/SuperOoze0309/MLAFMT/actions/runs/40793176013).
The [GitHub release](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.11.0)
contains the static ZIP and checksum file; both assets' sizes and server
digests were verified. Existing native installers remain v2.5.0.

The GET-only public audit ran once, with no automatic retries, against both
`formcapy.com` and `www.formcapy.com` using the full asset scope. It passed:

- 390/390 downloadable resources matched the frozen sizes and SHA-256 values;
  813,172,914 decoded bytes were checked across 410 GET requests, with zero
  errors. `_headers` is deployment configuration, excluded as a downloadable
  file; applied security headers were checked on the actual responses.
- Required COOP/COEP, nosniff and MIME checks passed. Both domains reported
  v2.11.0, the accepted manifest and cache
  `formcapy-2.11.0-pyodide-314.0.7-a13935a88c02`.
- Homepage converter navigation and frozen page bytes matched. Both domains
  upgraded HTTP to trusted HTTPS while preserving tested encoded paths and
  queries.

Evidence: `build/v2.11.0/production/deployment-verification.json`, completed
28 October 2026 at 17:50:00 -07:00. The audit sent no document and does not
replace browser conversion acceptance.

Production **Edge 156.0.4314.50 passed all 18 checks**, with six actual
conversion downloads. The successful report is
`build/v2.11.0/production/browser-fixed/report.json`, completed at
17:55:05 -07:00 on 28 October 2026. Checks include all conversion directions,
startup cancellation/retry, exact Chinese text, embedded PDF CJK fonts with
ToUnicode maps, valid DOCX XML, genuine DOC WordDocument/table streams,
image-only PDF OCR-required rejection, three-language narrow layouts, and
offline navigation in both directions. Independent file validation passed.

The page/iframe and conversion-worker CDP trace recorded 115 requests, all
GET, with zero external requests, console errors, page exceptions or worker
audit errors. One Fetch was intentionally canceled by the cancellation check;
there were zero uncanceled request failures. Initial Service Worker install
fetches are outside this trace. Registration, activation and navigation
control ran normally; the offline test did not force activation or client
claims.

For provenance, the initial production run passed 17 checks and all six
downloads, then timed out on offline navigation. CDP auto-attachment had
paused the Service Worker while `Network.enable` never returned. An
independent check activated within five seconds and obtained the correct
navigation controller; unpausing restored the worker. Excluding Service
Workers from that test-only pause-on-start instrumentation resolved the
harness issue. The deployed application artifact was unchanged. The initial
report remains under `build/v2.11.0/production/browser/`; the complete passing
rerun, downloads and screenshots are in
`build/v2.11.0/production/browser-fixed/`.
