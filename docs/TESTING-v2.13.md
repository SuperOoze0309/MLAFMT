# v2.13.0 formatting-result inspection: verification

Status: development candidate. The local candidate build is
`dist/formcapy-v2.13.0-preview`. The checks below do not establish a public
preview, production deployment, or a new native installer release. The
production website remains on v2.12.0 and the existing installers on v2.5.0.

## Scope of the report

The browser's local generation worker inspects the generated DOCX against the
profile used for that result. The report categorizes limited checks as checked,
items needing attention, and items requiring manual review. It compares section
page dimensions and margins, the Normal style's font settings, explicit line
spacing on nonempty top-level paragraphs, and page-number field placement,
alignment and cover-hiding configuration. Page-number start values and surnames
are not checked. An inspection failure must leave the Word file available and
show that the check is unavailable. The report carries fixed codes and status
values, not extracted document text.

The inspection does not render Word pages and cannot establish complete format
or academic-style compliance. Run-level formatting and content inside tables
are not covered by the Normal-style font check. Retained paragraphs, body
images and tables, heading levels, reference contents and order, the actual
page-number display, pagination and visual appearance require manual review.
The native interface does not provide this report; web results without
inspection metadata show it as unavailable.

## Automated checks

The Python suite completed with **325 passed, one skipped and 159 subtests**.
The skipped test requires a locally installed native LibreOffice. All 19 Node
`*_test.mjs` suites in the project's regular set passed; the actual Pyodide
acceptance below is counted separately.

## Pyodide checks

The local Pyodide 314.0.7 acceptance completed **11 checks**. Nine generated
DOCX files covered MLA, APA and a custom profile, each with blank, text and
preserved-DOCX fixtures. Independent inspection compared report findings with
actual DOCX structure, including section size and margins, fonts, line
spacing, page-number fields and preserved content. The additional checks
covered inspection failure without blocking document output and the distinction
between exact and minimum fixed line spacing. Report:
`build/v2.13.0/acceptance/layout-pyodide-fixed/summary.json`.

## Physical Edge check

On the physical Windows machine, the installed Edge was opened using the
normal user profile and accessed the local candidate over localhost. An MLA
sample draft and an APA blank document were generated, the language was
switched to English, and the result was reused. The three report groups and
their displayed content were visually checked.

This check did **not** independently inspect a document downloaded by Edge.
The independent checks of nine generated files above were run through Pyodide;
they do not constitute visual Word page rendering or exhaustive testing of
all templates and source documents.
