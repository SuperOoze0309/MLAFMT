# v2.15.0 batch converter: verification

Status: Cloudflare Worker `d12ac416-c7e3-419c-89c6-69bcff6b07ee` is deployed
at 100% traffic. The full two-domain resource audit and the production Edge
checks described below passed.

- Python suite: 340 passed, one skipped, and 159 subtests passed. The skipped
  test requires a native LibreOffice installation.
- Converter UI and batch module: 30 Node tests passed, including sequential
  execution, per-item failure and skip, cancellation and late results, input
  and output limits, duplicate and long names, and ZIP readability.
- An actual regular-profile Edge session converted a mixed five-file batch:
  three documents succeeded, a damaged DOCX failed individually, and an input
  already in the target format was skipped. The downloaded ZIP passed CRC
  checks and its three PDFs had the expected distinct text markers, including
  two safely renamed outputs with the same source basename.
- The final build in regular Edge defaulted a uniform PDF batch to DOCX;
  cancelling during a cold engine start marked all three entries cancelled and
  restored the controls. A separate PDF-to-DOCX single-file conversion was
  downloaded and opened successfully with its expected text marker.
- The captured main-page and iframe requests showed same-origin GETs and local
  blob downloads, with no document upload observed. This observation did not
  include complete Worker network tracing.
- In a regular Edge session against the Cloudflare public preview, a synthetic
  five-file mixed batch produced three successes, one damaged-file error and one
  same-format skip. The downloaded ZIP passed CRC and content checks.
- The production resource audit verified 212 resources on each of
  `formcapy.com` and `www.formcapy.com`: 424/424 size, SHA-256, security-header
  and MIME checks passed, with 444 GET requests and no errors or retries.
  The report is `build/v2.15.0/production/deployment-verification.json`.
- A regular Edge page upgraded from v2.14.1 to v2.15.0 via the update notice.
  On the production site, five synthetic files converted to PDF produced three
  successes, one damaged-file error and one same-format skip. The downloaded
  ZIP passed CRC, three PDF content marker and duplicate-name checks. The
  production Worker network was not fully traced.

The local evidence files are under `build/batch-acceptance/`. The tests use
synthetic documents and do not guarantee the layout of every converted file.
