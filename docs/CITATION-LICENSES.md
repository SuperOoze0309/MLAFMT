# Browser citation component distribution

The reference assistant renders structured records locally with the CSL
processor. Source v2.9.0 adds locally parsed BibTeX/RIS/CSL-JSON and optional
Crossref DOI batches: only an explicit query action sends each DOI and normal
network request information to Crossref. Drafts and libraries are not sent.
The new import and lookup adapters are project code, with no new bundled
third-party parser. Arbitrary reference prose and in-text synchronization
remain outside its scope. See [privacy and import limits](CITATIONS.md#7-隐私--privacy).

Source v2.10.0 adds an original portable-export adapter for CSL-JSON, RIS and
a modern UTF-8 `.bib` profile. It uses the existing model and no new bundled
third-party implementation. Format references are the [official CSL input
schema](https://github.com/citation-style-language/schema/blob/master/schemas/input/csl-data.json),
[BibTeX documentation](https://mirrors.ctan.org/biblio/bibtex/base/btxdoc.pdf)
and the field mappings in Zotero's [RIS](https://github.com/zotero/translators/blob/master/RIS.js)
and [BibTeX](https://github.com/zotero/translators/blob/master/BibTeX.js) translators.
Zotero's implementation is not copied or distributed. The adapter explicitly
reports format limitations; FormCapy JSON remains the complete library backup.

## Selected component and license

- Unmodified `citeproc.js` from Juris-M/citeproc-js commit
  `cc9153c45293af878de08cafddbefe6ea150c380` is distributed under the upstream
  **CPAL 1.0** option. The alternative AGPL 3.0-or-later notice is retained.
- The actual processor file reports **1.4.61**. The upstream `package.json`
  describes 2.4.63 / 1.4.63 and has a conflicting AGPL metadata value. Those
  metadata strings are not used to relabel the actual code or license. The
  processor header, upstream LICENSE and complete license texts are retained.
- Original processor source, all upstream `src/` files and build tools are
  published in the same static directory as `citeproc-source.tar.gz`. The
  readable unmodified runtime source is also directly accessible. There are
  **no modifications** to Covered Code, no minification and no rebundling.
- The original source archive's commit, SHA-256, byte size and every downloaded
  file's exact source URL are recorded in
  [sources.json](../static/vendor/citations/sources.json).
- The MIT application adapter is a separate, independently written file.
  Project MIT licensing does not replace CPAL or CSL data licensing.

CPAL sections 3.1–3.6 and 15 are implemented by retaining original notices and
the complete CPAL license, identifying the chosen license and supplying source
with the static distribution. The original source archive must remain part of
future website builds; an upstream-only link is not the publication plan.
Section 3.7 permits a larger work while retaining the covered component's terms.

CPAL Exhibit B requires visible attribution in the interface accessing this
component. The assistant must display, from its first opening, at normal text
size and without hiding it behind an About disclosure:

> (c) Frank Bennett — citeproc-js implements the Citation Style Language

Link the phrase to <https://citationstyles.org/> and provide the local
[notices/source index](../static/vendor/citations/index.html). It must be no
less prominent than any other component attribution. This display also clearly
credits the CSL project. Do not remove it from screenshots or embed versions.

The original CPAL text and original dual-license header determine recipient
rights; this implementation record is not a replacement license.

## CSL data

The official version branches were resolved to exact commits, then original
bytes were collected:

| Component | Pinned commit | Files |
| --- | --- | --- |
| CSL styles v1.0.2 | `3e2bce83321ef96b678acd82249bb446b7c3aa26` | `modern-language-association.csl`, `apa.csl`, original `README.md` |
| CSL locales v1.0.2 | `6b70fe79264543aa538f8927fcc98d5b72425a94` | `locales-en-US.xml`, original `README.md` |

These files retain the full author/contributor/translator and rights metadata.
They are unmodified and licensed under **CC BY-SA 3.0 Unported**. The original
project licensing statements and full legal code are bundled. Any future
modified style must be identified as modified and distributed under the same
license, retaining attribution. No official manual text or sample paper is
part of this component.

Only these two styles and the en-US locale are supported by this first
renderer. Interface language is independent of the source's language and the
citation style. Switching the UI to Chinese or Spanish does not translate
reference titles or authors. There is no claim of institutional endorsement.

## Verification and reproduction

Run `python scripts/verify_citation_assets.py` before building. Static builds
must copy **all** files in `static/vendor/citations/`, including sources,
licenses, README files, provenance and the local index. The builder's main
manifest separately records the copied files. `citation-engine.js` additionally
pins processor script integrity and verifies downloaded style/locale hashes.

To recollect, retrieve the exact `source` URL for each `entries` item in
`sources.json`, save it under its listed `path`, then verify byte length and
SHA-256 with the command above. The URLs contain immutable commit IDs; no
runtime or build process follows a moving branch. All collection, build and
test outputs on the owner's machine remain under `H:\DSHworkspace`.

The source archive contains the original generated processor, its `src/`
modules, upstream `tools/`, `.gitmodules` and README build instructions
unchanged. As a GitHub source snapshot, it does not embed the contents of
optional Git submodules (full test-suite fixtures, docs, schema, jurisdiction
modules and all locale variants). Those are not runtime dependencies bundled
in the assistant; the selected styles and en-US locale are supplied separately
under their own license above. Upstream's full test/rebuild environment also
uses the external `citeproc-test-runner`, as described by its original README.
FormCapy does not claim that it rebuilt this processor or vendored that full
test environment; it verifies and distributes the original pinned artifact
with the preferred core source and upstream build instructions.

## Integration contract

Load `static/citation-engine.js` before the citation assistant UI. No processor
script is required in the HTML: the adapter loads the same-origin pinned
processor lazily on first render. Style and locale requests are fixed
same-origin URLs; no citation input is in a request body, path or query.

`FormCapyCitationEngine.render(cslItems, "mla" | "apa")` returns an object with
`style`, `heading`, `html`, `text`, `entries` and `layout`. Each entry has
`id`, `html`, `text`; `layout` has `hangingindent`, `linespacing`, `entryspacing`,
`second-field-align`, `maxoffset`. Preserve this order and layout when exporting
Word; do not apply the normal formatter's alphabetical sorting afterwards.
Identifiers are ASCII, at most 64 characters. At most 200 records are accepted,
with fields at most 5,000 UTF-16 code units and total CSL input at most 1 MiB.

Use `safeFragment(output.html)` for display. It rejects non-allowlisted tags,
attributes, resource-bearing markup, arbitrary CSS and unsafe link schemes.
It rebuilds only safe DOM nodes in an inert parsing context; no original node
or event attribute is copied into the visible document. Display errors in the
assistant while keeping the user's records and any original paper unchanged.
