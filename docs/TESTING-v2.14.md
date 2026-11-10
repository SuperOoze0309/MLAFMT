# v2.14.0 ICML 2026 LaTeX starter: verification

Status: development candidate in `dist/formcapy-v2.14.0-preview`. The checks
below include local and public-preview observations, but do not establish a
production deployment or a new desktop or Android installer release.

## Scope and limitations

The browser-local ICML 2026 preset produces a ZIP containing `main.tex` and
`README.txt`. It does not include an ICML style file, a TeX compiler or a PDF.
Users must obtain the official 2026 style files separately, compile the source,
and check the instructions for their actual conference year. Imported draft
content is reconstructed as text. Abstracts and citations are not identified
automatically; images, table structure, equations, pagination, rich formatting,
text boxes and notes may be omitted or need reconstruction. [Usage and scope](ICML-LATEX.md)

The starter uses anonymous author placeholders and does not insert the name
entered in the form. It does not anonymize the title, body, references, file
names, PDF metadata or supplementary material. Users must review the source
and final submission for identity information. Imported text is escaped as
LaTeX data, rather than executed as commands. The tests below use fictional
fixtures; they are not a guarantee of anonymity or correctness for arbitrary
documents.

## Automated checks

The Python test suite completed with **336 passed, one skipped, and 159
subtests**. The skipped native LibreOffice test requires a locally installed
executable. The Node test suites, including ICML UI and transport checks,
also passed. These tests do not establish visual or submission compliance.

## Pyodide generation and TeX compilation

The frozen build used Pyodide 314.0.7 to generate four actual ZIPs: a blank
starter, Markdown with special characters and a literal `\input` attempt,
an English DOCX with a table, and a Chinese DOCX. Their ZIP contents and
metadata were independently checked. The validation then copied the official
ICML 2026 files into each test folder and compiled `main.tex` with a locally
cached Tectonic installation using `--untrusted --only-cached`; no user
documents were uploaded. The four compilations exited successfully and their
PDFs contained the anonymous marker. PDF text extraction verified the English
special characters and the English DOCX sample, including linearized table
text. The LaTeX command attempt remained literal text.

The Chinese fixture is an important limitation: its compilation also exited
successfully, but logged **62 missing-character warnings**, and the Chinese
text was absent from the extracted PDF. This is not a successful Chinese
rendering result. Chinese and other non-ASCII text require suitable TeX
engine and font configuration, followed by careful PDF review. All four
compilations also reported a Fontconfig warning; results should not be
generalized to other environments or files.

The official style ZIP used only for local testing was obtained from
<https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip> and has
SHA-256 `8b29290f5828e176debb57ea9cc00252502973d55ea561a2f18a7f0a326bfc6c`.
It is not included in the generated user ZIP or the website build. Test
outputs, logs, PDFs, extracted text and metadata are in
`build/v2.14.0/acceptance/icml-pyodide-final-link/`; the summary is
`build/v2.14.0/acceptance/icml-pyodide-final-link/summary.json`. The frozen
`manifest.json` SHA-256 in that report is
`af7e784f335c202533f414ca64b19076df83ec515beb9fb108c1dfa18fffb0a0`.

## Physical Edge observations

On the physical Windows machine, the existing normal Edge profile accessed the
local build. An ICML blank starter and sample draft were generated and their
ZIP download links, limitations and the official style download link were
displayed. The same normal Edge profile also generated a blank starter on
Cloudflare public preview version `9036196a`, displaying its ZIP download
link and the official style download link. These Edge checks did **not** independently
inspect files downloaded by Edge. The four ZIPs independently inspected and
compiled above were generated through the same frozen Pyodide application,
not downloaded from those Edge sessions. No production deployment is claimed
by these observations.
