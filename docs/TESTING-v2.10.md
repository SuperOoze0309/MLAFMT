# v2.10.0 verification

This record covers the frozen local static build. Public deployment, CI and
production-browser results are recorded separately in [DEPLOYMENT.md](DEPLOYMENT.md).

## Automated regression

- Python: 228 tests and 159 subtests passed, with no failures or skips.
- Node: 525 cases across 16 logic/DOM suites passed.
- Pinned citation assets and notices verified; real local Pyodide, lxml,
  python-docx and Worker lifecycle smoke passed.
- The portable serializer has 18 focused tests and eight additional edge tests.
  They cover supported fields and explicit loss warnings, TeX escaping,
  size/count limits, unknown formats, sparse arrays and descriptor/prototype
  checks which reject inherited getters without invoking them.

The initial complete regression passed 522 Node cases. After an observed visual
review, only assistant UI/CSS and corresponding DOM tests changed: the export
panel moved below the grid at full width and repeated omission notices became
one count summary. Assistant DOM (121 cases) and host-state (10) then passed
again; hashes confirmed all other product sources unchanged. Both original
reports and the final 525-case coverage record are retained.

DSH was explicitly set to DeepSeek-V41-Flash / Max for the original portable
adapter and focused tests. Its handoff was reviewed independently; the root
review strengthened fabricated-prototype rejection and four-digit interchange
dates before the final acceptance. No new production dependency was added.

## Actual browser and downloads

Installed desktop Chrome completed all 42 checks against the final frozen build,
with its normal sandbox and trusted certificates. The earlier complete 42-check
run before the visual refinement is retained separately; neither run used an
automatic retry.

- Three explicit Crossref GETs succeeded over TLS 1.3. The two valid batch
  requests were sequential, 1301 ms apart. Invalid/duplicate rows made no request.
  Calls omitted credentials, referrer and request bodies; drafts and libraries
  were not sent. Search, edits and exports caused no metadata request.
- Existing imports, candidate selection, duplicate handling, undo, MLA/APA
  preview, paper-state retention and four viewport sizes passed. Controlled
  failure, timeout, cancellation, HTTP 429 and late-response checks are
  simulations, separate from actual provider results.
- Ten search/type scenarios cover accent-insensitive and Chinese text,
  personal/corporate authors, year, DOI, AND terms, clear and no-match states.
  Selected editor values, saved library bytes/order, previews, paper fields and
  existing output links remained intact when filtering.
- All nine records and the one-record filtered scope each produced three
  actual clicked downloads. Filenames, MIME, byte lengths and SHA-256 matched
  the observed Blob bytes. An additional complete FormCapy JSON backup retained
  the comparison-only marker; all six portable files omitted it.
- CSL-JSON exactly matches supported model fields. RIS differences are limited
  to the disclosed author-structure ambiguities; the tested safe Unicode
  BibLaTeX profile round-tripped without metadata differences. Stale exports
  were disabled after relevant edits, format or scope changes.
- The export panel spans the desktop grid; multiple original-text omissions
  have one visible count summary while original module warnings remain intact.
  Chinese, English and Spanish passed at 320×568 and 390×844 without overflow.
- No console errors or page exceptions were recorded.

Root independently checked the actual six downloaded portable files using
the official CSL input schema pinned to commit
`e3ce254a72c4470a5ed3b9d23b428017d25674e9`, jsonschema 4.25.1,
rispy 0.10.0 and bibtexparser 1.4.3. Syntax and record counts passed; an additional
three-record fictional fixture independently checked field mappings, escaping
and input immutability. These tools are isolated QA dependencies, not shipped
application libraries.

Both actual MLA/APA Word downloads passed ZIP CRC, XML and relationship checks.
All six entries match captured previews in text, order, italics and hyperlinks.
Letter paper, one-inch margins, Times New Roman 12 pt, heading style,
half-inch hanging indents and double spacing were checked.

## Frozen artifact

- Manifest SHA-256: `d59262177144ccc24a72b65ca45cab242caa4eb667d5cd4f3b82a2444520f764`.
- Cache: `formcapy-2.10.0-pyodide-314.0.7-daf1a0e15016`.
- 149 manifest entries plus the manifest itself: 150 physical files.
- 42 precached assets; source/license materials included and verified.
- Tested preview copied byte for byte to `dist/formcapy-v2.10.0`.

Reports, screenshots, actual downloads, source hashes and QA tool records remain
under `build/v2.10.0/acceptance/` on the owner's H-drive workspace.

## Limits

Desktop Chromium viewport simulation does not verify Safari or physical devices.
Word property/content checks do not establish visual pagination. A real Zotero
application import was not performed. Modern UTF-8 `.bib` is not guaranteed
lossless with every classic BibTeX style, and RIS can lose author structure;
review the displayed warnings. This release does not replace reference regions
inside papers, generate in-text citations or publish new native installers.
