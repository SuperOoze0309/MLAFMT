# v2.13.1 theme rollout verification

This web update integrates YMX0913's four commits from
`codex/formcapy-light-motion`, ending at
`01b25e7bf716287bff70436097e6f265673c73e9`. It changes appearance, motion and
three-language guidance; document, citation and conversion algorithms remain
unchanged. Native installers remain v2.5.0.

## Regression and actual conversions

- All 19 regular Node suites passed: 546 formally counted cases across 17
  suites, plus the Office loader and layout-report grouped smoke checks.
- Python: 325 passed, one skipped, 159 subtests passed. The skip requires
  installed native LibreOffice. The initial missing-version-changelog failure
  is preserved; Python was rerun after adding the v2.13.1 changelog entry.
- Installed Edge completed the standalone converter's 18 real-browser checks
  against the frozen build, including six actual conversions/downloads,
  Chinese text and embedded fonts, cancellation, OCR-required rejection,
  three-language 320/390 layouts and offline navigation in both directions.
  Actual PDFs, DOCX XML and genuine DOC streams passed independent checks.
- The initial converter run stopped at a stale assertion matching old PDF
  guidance. The updated assertion requires all three new notices about layout
  changes, hidden/cropped image content and reviewing the original. Its report
  is retained separately; the final complete run passed without product changes.

## Theme review

Browser emulation checked light/dark themes and normal/reduced motion at
320, 390 and 1366 pixels: no document/body horizontal overflow; the paper
preview stayed white with dark text; primary-button transitions were zero
under reduced motion. A separate visible Chrome check generated the built-in
MLA sample and displayed its download and all three layout-report groups.
A fictional book also produced a local MLA bibliography preview in dark mode.

These checks use desktop Chromium and viewport/media simulation. They do not
verify Safari or physical phones/tablets, visual pagination in Word, or every
possible source document. This update does not claim a new native-app release.

## Frozen build

- Version: 2.13.1; directory: `dist/formcapy-v2.13.1-preview`.
- Manifest SHA-256: `5f14e21d21308e575ac1719b279686ef8aefb7c6cfb4c4df07abc5a02ef9fc50`.
- Cache: `formcapy-2.13.1-pyodide-314.0.7-12d446092011`.
- 209 manifest entries plus manifest.json; original runtime notices/sources
  included. Runtime binaries and source pins are unchanged.
- Reports and actual files remain under `build/v2.13.1/acceptance/` on H.

Production status is recorded separately in [DEPLOYMENT.md](DEPLOYMENT.md).
