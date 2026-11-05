# v2.11.1 local Office startup verification

Status: the source and candidate static build at
`dist/formcapy-v2.11.1-preview` passed local full-page acceptance. Cloudflare
version `74e5d598` has been uploaded as a preview; its public-preview 18-case
Edge acceptance passed. The production website remains v2.11.0 and
v2.11.1 is not yet released. Existing native installers remain v2.5.0.

## Design and integrity

- Office program components are still loaded on an explicit conversion, and
  documents stay in the browser. A shared pool limits loading concurrency to
  four jobs; completion order does not change the order of assembled bytes.
- `runtime/office/runtime.json`, the original uncompressed chunk paths and
  bytes, and the Office cache identifier remain compatible with v2.11.0.
  A separate `runtime-gzip-v1.json` describes the added gzip representations.
  Their URLs include the SHA-256 of the compressed bytes.
- The loader verifies compressed size and SHA-256, bounds decompression to the
  pinned original length, verifies the original chunk and complete assembly,
  and caches verified original bytes under the existing keys. Previously cached
  raw assets can therefore be reused. Browsers lacking `DecompressionStream`
  use the original uncompressed chunks. A missing gzip asset can fall back to
  its original; integrity failures are reported rather than silently ignored.
- Cancellation or a failed component aborts remaining requests and drains
  in-flight jobs. The document validation and external-resource restrictions
  remain in place before a Word document is passed to Office.
- The 13 WASM/data chunks contain 261,188,103 uncompressed bytes and
  83,865,122 gzip bytes. These counts exclude the CJK font, JavaScript and
  metadata; they are artifact sizes, not a measurement of all visitor traffic.

The builder's offline cached-input check verified that its legacy
`runtime.json` is byte-for-byte equal to the accepted v2.11.0 manifest, and
independently decompressed and checked all 13 chunks. Synthetic loader checks
cover bounded concurrency, out-of-order assembly, raw-cache reuse, gzip and
original-byte digests, malformed/oversized streams, 404 fallback and
cancellation. Real-browser tests of existing raw-cache migration to the gzip
loader and fallback without `DecompressionStream` passed.

## Acceptance status

- Local Edge 156.0.4314.58 full-page acceptance passed all 18 cases, including
  six actual conversion downloads, Chinese font handling, cancellation,
  image-only PDF guidance, three languages and normal service-worker offline
  operation in both directions. The report records zero external or unexpected
  requests, three expected cancellations and no unexpected failures:
  `build/v2.11.1/acceptance/edge/report.json`.
- Meta tests passed 26 scenarios; pytest reported 271 passed, one skipped and
  159 subtests; 17 Node suites passed. All 210 physical files matched their
  expected hashes.
- Cloudflare preview version `74e5d598` was uploaded and spot checks passed
  for gzip responses, MIME types, hashes and cache headers. Edge public-preview
  acceptance passed all 18 cases with six actual downloads, 13 unique gzip
  chunks, 114 GETs, zero external requests or browser exceptions, one expected
  cancellation, no unexpected failures and normal service-worker offline
  operation in both directions. Initial service-worker installation requests
  are outside the CDP trace. Evidence:
  `build/v2.11.1/acceptance/cloudflare-preview/report.json`. This does not
  establish production deployment.

## Local network simulation

Two baseline and two candidate runs used the same small DOCX fixture and
installed desktop Edge on the same physical Windows machine. The static files
were served by localhost, with CDP network conditions set to 100 ms latency and
80 Mbps download speed. These limited observations are not a production
benchmark.

| Office adapter measurement | v2.11.0 baseline | gzip + concurrency candidate |
| --- | ---: | ---: |
| First DOCX→DOC, cold cache (two runs) | 33,673 / 33,667 ms | 12,785 / 12,815 ms |
| First DOCX→DOC, cold cache (mean of two) | 33,670 ms | 12,800 ms |
| `/runtime/office/` response bodies for that first run | 278,745,860 bytes | 101,427,235 bytes |
| Subsequent conversion in the same page | 128 ms | 133 ms |
| Restart with cached Office components (two runs) | 2,303 / 2,299 ms | 2,205 / 2,245 ms |

In these local comparisons the mean first adapter conversion was about 62.0%
faster and measured Office response bodies were 63.6% smaller. The fixture is small;
times vary with device, browser, document, cache and network. The benchmark
exercises the Office adapter and real format output, not the complete
converter UI: it excludes the page's Pyodide document/container validation,
the separate PDF extraction engine and HTTP headers. The byte counts include
the Office runtime manifest, components and Chinese font, but exclude the
Office frame and driver, adapter script and other application resources.
No time saving is promised for other devices or documents.

Evidence: `build/v2.12.0/performance/baseline-net-v2/report.json`,
`build/v2.12.0/performance/gzip-net/report.json`,
`build/v2.12.0/performance/baseline-net-repeat/report.json` and
`build/v2.12.0/performance/gzip-net-repeat/report.json` are local experiment files;
their directory name is historical and does not denote a v2.12 release.
The builder compatibility check is recorded under
`build/office-gzip-real-audit-964ac1e5e46d4710b5164261d24387a0/`.

## Conversion limits

PDF→DOCX uses the separate Pyodide/pypdf path and does not load Office. PDF→DOC
and conversions involving Word input use the Office engine. PDF→Word rebuilds
editable extracted text; images, original layout and table structure are not
reconstructed, and OCR is not provided. Image-only PDFs report that OCR is
needed. Source Word formatting may still change because of missing fonts or DOC
format limitations. These limits are independent of the startup optimization.
