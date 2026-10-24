# v2.9.0 verification

This record covers the local static build. Public deployment and CI results
are recorded separately in [DEPLOYMENT.md](DEPLOYMENT.md).

## Automated regression

- Python: 228 tests and 159 subtests passed, no failures or skips.
- Node: 451 cases across 14 logic/DOM suites passed.
- Pinned citation assets and licenses verified.
- Real local Pyodide/lxml/python-docx and Worker lifecycle smoke passed.

The final lookup/batch suites were rerun after repairing two interoperability
defects: repeated missing-author warnings no longer exceed the batch warning
limit, and safe warning field names survive batch validation. These tests use
controlled HTTP responses, including 50 empty source-author objects.

## Real browser

Installed desktop Chrome completed 31 checks against the frozen v2.9.0 build:

- Three explicit Crossref GETs returned HTTP 200 over trusted TLS 1.3. A mixed
  batch queried its two valid unique DOIs in order, 1307 ms apart; invalid and
  duplicate lines caused no request. Each actual URL appeared once in CDP.
- Queries omitted cookies, referrer and request bodies. No draft, paper details
  or library was sent. No lookup occurred before the query action.
- BibTeX, RIS and CSL-JSON file selection, local review, selective append,
  duplicate handling and batch undo passed.
- Select all, select none and individual selection passed, including at
  320×568 and 390×844. Existing three-language and four-viewport checks passed.
- Controlled HTTP 404, network failure, timeout, cancellation, partial success,
  HTTP 429 and late-response scenarios passed. These are simulations, not
  claims that the public provider returned those failures.
- Main-paper fields, generated preview and its original download link were
  retained. No page exceptions or console errors were recorded.

Two actual clicked Word downloads were independently inspected. Both ZIP CRCs
and XML/relationship checks passed; all six bibliography entries match their
captured CSL preview in text, order, italics and hyperlinks. Letter paper,
one-inch margins, Times New Roman 12 pt, heading style, half-inch hanging
indents and double spacing were checked.

Two early harness runs are retained separately: one started a second explicit
operation within the existing local cooldown; one used an incorrect English
message assertion. Product data assertions were retained in the final run.

## Frozen artifact

- Manifest SHA-256: `d79ba46575e860d2bde89e1ff6060790918e56fd639f6d9d0d0cb7d2b7f2b490`.
- Cache: `formcapy-2.9.0-pyodide-314.0.7-0b411fbea9f6`.
- 148 manifest entries; original runtime sources and license materials included.
- The tested preview was copied byte for byte to `dist/formcapy-v2.9.0`.

Full local reports, request traces, screenshots, fixtures and downloaded files
are retained under `build/v2.9.0/acceptance/` on the owner's H-drive workspace.
DSH used DeepSeek-V41-Flash / Max for the batch coordinator and its focused
tests; the integrated source was then reviewed and tested independently.

## Limits

Desktop Chromium viewport simulation does not verify Safari or physical
phones/tablets. Word properties and content checks are not page-rendering
acceptance. This web update does not release freshly verified native installers.
