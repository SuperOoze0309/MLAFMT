# v2.14.1 ICML style bundle: verification

Status: the build at `dist/formcapy-v2.14.1-preview` is a development
candidate. The checks below do not establish production deployment or a new
desktop or Android installer release. The production website remains on
v2.14.0; the existing installers remain v2.5.0.

## Scope and implementation

The browser creates an ICML 2026 LaTeX source ZIP locally. It includes
`main.tex`, `README.txt`, and five files from the official ICML archive:
`icml2026.sty`, `icml2026.bst`, `algorithm.sty`, `algorithmic.sty`, and
`fancyhdr.sty`. Their original copyright and license notices are retained.
This output still requires a compatible TeX installation and standard LaTeX
packages; FormCapy does not produce a compiled PDF.

The build downloads the [official ICML 2026 style archive](https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip)
and verifies its size and SHA-256
`8b29290f5828e176debb57ea9cc00252502973d55ea561a2f18a7f0a326bfc6c`.
It copies the original DEFLATE streams of the five needed files into a
deterministic 24,486-byte bundle, verifying each extracted file against the
official source. The bundle SHA-256 is
`03be9bd927f247198af11eed05a83865531edcacde80804ee8e831f512e2c293`.
The bundle is excluded from the initial service-worker precache. The browser
requests it from the same origin only when ICML generation is requested,
verifies its bounded length and hash, and caches the verified bytes when
CacheStorage is available. Python verifies the bundle again before inserting
the five files into the generated ZIP. A missing or invalid bundle returns an
error instead of a supposedly complete project. No draft is uploaded.

## Automated checks

The Python suite reported **340 passed, one skipped, and 159 subtests**; the
skipped native LibreOffice test requires an installed executable. The ICML
worker tests cover on-demand fetching, verified cache use while offline,
corrupt cache and network responses, an offline cache miss, unavailable or
unwritable cache, cancellation, same-origin enforcement, and rejection of a
response without a bounded stream. These tests do not prove that every browser
or document behaves identically.

## Pyodide generation and offline TeX compilation

The frozen build's Pyodide 314.0.7 generated four ICML ZIPs: a blank starter,
Markdown with special characters and a literal LaTeX command, an English DOCX
with a table, and a Chinese DOCX. Independent inspection checked the ZIP
metadata, anonymous placeholders, escaped input, and the five included style
files against the official archive. Each ZIP was extracted and compiled using
only its own included style files and a locally cached Tectonic installation
with `--untrusted --only-cached`. All four compilations exited successfully;
English text, special characters and anonymous markers were verified by PDF
text extraction. This is not a guarantee for arbitrary files.

The Chinese sample produced **62 missing-character warnings** and its Chinese
text was absent from the extracted PDF, despite the successful compiler exit.
Chinese and other non-ASCII text may require a compatible TeX engine and fonts,
followed by visual and text review of the final PDF. A Fontconfig warning was
also recorded. Evidence is under
`build/v2.14.1/acceptance/icml-complete-final/`; the detailed summary is
`build/v2.14.1/acceptance/icml-complete-final/summary.json` and identifies
frozen manifest SHA-256
`1a2d017ebd7afa85f2d92223849a2cf7272bd54725986533ae2c9751a400d932`.

## Physical Edge observations

On physical Windows using the regular Edge profile, the local candidate's
first ICML generation downloaded the 24,486-byte style bundle once and
generated a result. After the local server was stopped, the page was reloaded
and ICML generation succeeded using the previously verified cache.

A separate fresh origin generated a normal Word document without requesting
the ICML bundle. After its server was stopped, an uncached ICML request showed
the failure state and retained the previous Word result. These observations
show the tested interactions, not universal offline or browser behavior.

The same Edge profile was used against the Cloudflare public preview
`https://4270e25b-formcapy.benzooze0309.workers.dev/`. Selecting ICML and
generating a project displayed that the style files were included and cached,
alongside the ZIP download link. A separate GET verified the preview bundle
was 24,486 bytes with the pinned SHA-256, served as `application/zip` without
`Content-Encoding` and with an immutable cache policy. This is a preview
check; the candidate has not been deployed to production.

## Remaining submission checks

The output uses anonymous author placeholders but does **not** remove identity
information from titles, body text, references, filenames, PDF metadata or
supplementary material. Users must check the complete submission. Imported
drafts are reconstructed as text: abstracts and citations need manual editing,
and figures, table structure, equations, text boxes, footnotes, endnotes and
complex layout may be omitted. Check the official instructions and style for
the actual target year; the included version is specifically ICML 2026.
