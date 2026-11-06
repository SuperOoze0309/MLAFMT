# v2.12.0 PDF image reconstruction: verification

Status: frozen build `dist/formcapy-v2.12.0-preview` is deployed to production
as Cloudflare Worker version `8cfcb05c` at 100% traffic. Existing native
installers remain v2.5.0; no new installers are claimed in this release.

## Automated checks

- The Python suite reported **301 passed, one skipped, and 159 subtests**.
  The skipped native LibreOffice test requires an installed executable.
- Node suites passed, including the actual Pyodide `node_import` test and the
  stateful document converter tests. Unit and adapter tests are not a substitute
  for full-browser or real-device acceptance.
- The image tests exercise supported direct images, multiple disjoint images,
  unsupported or oversized images, image-count and decompression limits,
  clipping, transparency, rotation, overlap and later painting. They also cover
  scanned documents without extractable text. See `test_document_conversion.py`.

## Local full-page acceptance

On physical Windows, a headless installed Edge 156.0.4314.58 ran the frozen
build served from localhost. All **18 checks** passed. Six clicked conversions
and downloads covered every direction among PDF, DOCX and DOC. Independent
inspection checked PDF text and embedded fonts, DOCX XML, real DOC compound
streams and Chinese content. The run also checked cancellation, the OCR prompt
for an image-only PDF, the three languages at narrow viewport sizes, and normal
offline navigation between the cached home and converter pages.

The browser trace recorded 115 requests, no external requests or browser
exceptions, and one expected cancellation. The trace covers the page, iframe
and attached conversion workers; initial Service Worker installation requests
are outside the CDP trace, while the localhost server logs local requests.
Report: `build/v2.12.0/acceptance/edge-final-ui/report.json`.

## Local image acceptance

The second local Edge run passed **8 checks** using a two-page generated PDF
with text and three drawn images: two on the first page and one on the second.
It performed actual PDF→DOCX and PDF→DOC downloads and then converted that DOC
back to DOCX. Independent validation confirmed genuine DOC compound streams,
page-break-delimited text markers and three embedded images with expected
dimensions on their respective logical pages in both DOCX files. In the direct
PDF→DOCX result, the JPEG bytes matched the source SHA-256 and both Flate-image
pixel arrays matched the source; the DOC roundtrip checked image counts and
dimensions, not pixel-by-pixel identity. This does not establish visual layout
or image fidelity for arbitrary documents.

| Download | SHA-256 |
| --- | --- |
| Direct PDF→DOCX | `15bdb56065f6e372b625a680fc48fd6deebab78ea3c12764caa0f8c914a87da3` |
| PDF→DOC | `d478f60049724dfdf6f345df323b2a539bd64d9bb35eda5f2ef5b24bddce6e69` |
| DOC→DOCX roundtrip | `bc3bc0cbeb707368986414853f2b6dc3e85e8cf092c38b091e2c9cca7927f315` |

The image-only input reported OCR was required and offered no download. The
run recorded 71 traced requests, no external requests, request failures or
browser exceptions; initial Service Worker installation requests are outside
the CDP trace. Report:
`build/v2.12.0/acceptance/pdf-images-final-ui/report.json`.

Both local reports identify the same frozen `manifest.json` SHA-256:
`cb952bd0d2f628e6dde95fd9a554d0cf415b2416fd25b078ec25eed6eddeed66`.
The network results describe these instrumented runs, not every possible
browser, extension or device.

## Public preview and production acceptance

The same frozen candidate was uploaded as Cloudflare version `8cfcb05c`.
Physical Windows Edge ran the complete conversion acceptance against both its
public preview and `https://formcapy.com/`: each run passed **18 checks**,
including six real clicked downloads, cancellation, three-language narrow
layouts and offline navigation. Reports:
`build/v2.12.0/acceptance/cloudflare-preview/report.json` and
`build/v2.12.0/production/browser/report.json`.

Separate image acceptance against the preview and production each passed
**8 checks**, using the same two-page, three-image fixture and actual
PDF→DOCX, PDF→DOC and DOC→DOCX downloads. The independent checks verified
logical-page text and image placement; for direct DOCX they compared JPEG
bytes and Flate pixels, while the DOC roundtrip checked image dimensions and
counts. They also tested the image-only OCR message. Reports:
`build/v2.12.0/acceptance/cloudflare-preview-images/report.json` and
`build/v2.12.0/production/browser-images/report.json`.

The network trace covers the page, iframe and attached conversion workers,
not initial Service Worker installation requests. These examples do not
establish visual fidelity or visibility handling for arbitrary PDF files.

The complete production audit checked `formcapy.com` and `www.formcapy.com`:
209 assets per domain, **418/418** size and SHA-256 checks passed, alongside
security headers and MIME types. The audit recorded 438 GET requests and no
errors; old and new runtime manifest cache headers and all 13 gzip chunk cache
headers were also checked. Report:
`build/v2.12.0/production/deployment-verification.json`.

## Scope and known limits

The converter attempts to retain eligible JPEG and 8-bit RGB/grayscale Flate
direct image XObjects. Images are inserted after the corresponding source
page's reconstructed text; Word may paginate them differently. Cropping,
transparency, rotation, layering, later painting and other complex cases may
cause images to be skipped. Detected omissions are reported, but the checks do
not cover every PDF visibility semantic and cannot identify every omission.
The result may reveal image content that was hidden or cropped in the original;
compare it with the PDF before sharing. JPEG checks inspect some structure and
the end marker, not a complete decode, and cannot guarantee detection of
internal corruption. PDF-to-Word does not provide OCR or promise original
layout or table reconstruction. See [conversion scope](CONVERSION.md).
