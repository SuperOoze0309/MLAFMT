# Dependency notices and corresponding source

## Package contents

Desktop packages carry `THIRD-PARTY-NOTICES.txt`, `license-manifest.json`,
`license-audit.json` and byte-preserved original texts in `licenses/`. The same
notice filename is embedded at the PyInstaller resource root on Windows, macOS
and Linux. Help → Third-party notices reads that resource offline.

The shared collector reads actual installed wheel files, including plural
`LICENSES.txt`, arbitrary text filenames under `.dist-info/licenses/`, and
TkDnD's original Tcl comment notices. Python's entire installed `LICENSE.txt`
is retained, including its bundled third-party notices. Original Tcl/Tk files
and pinned upstream license supplements are also retained. Build-tool notices
are labelled as build-environment provenance; listing a tool does not mean the
whole tool is distributed in the app.

`license-manifest.json` maps each attribution to its original source, exact byte
hash and saved text. It is an inventory, not a substitute for license texts.
`license-audit.json` records package RECORD hashes, lxml native-file hashes,
compiled features, component versions and import-table inspection results.
Its `release_ready` flag means the selected **engineering material checks**
passed. It is not a third-party legal certification or a claim that every
redistribution question has been independently settled.

The previously published v2.3 Windows ZIP contained the project's own `LICENSE`
but lacked a companion third-party notice inventory. The historical asset was
not replaced. The new [v2.4.0 packages](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0)
include the collected third-party notices and release materials.

## Browser-local runtime and source materials

The static browser build runs the same Python formatter in **Pyodide 314.0.7**
(CPython 3.14.2). Its pinned program assets include the official Pyodide lxml
6.1.3 WebAssembly wheel, typing_extensions 4.15.0 and the pure-Python
python-docx 1.2.0 wheel. The native desktop wheel described below is not used in
the browser. `browser/runtime.json` records the downloaded files, sizes and
SHA-256 hashes; the deployed app loads these files from its own origin.

`scripts/collect_browser_runtime_materials.py` and
`browser/runtime-sources.json` collect the matching source and notice materials.
The current collection verifies **20 pinned inputs** and contains **94 original
or selected source files**, including upstream source archives, build recipes,
patches, license texts, a source manifest and rebuild notes. The static builder
publishes them under `licenses/runtime-materials/` alongside
`THIRD-PARTY-NOTICES.txt`, the artifact's `manifest.json` and the original license
texts.

The recorded state is **`collected-not-rebuilt`**. The application still uses
the official runtime and wheel; a native/WebAssembly rebuild, relink or
byte-identical reproduction has not been established. The collection is an
engineering inventory, not a legal certification or proof that the rebuild has
been completed. Read the kit's `SOURCE-MANIFEST.json` and `REBUILD.md` for the
matching inputs, selected files and remaining rebuild work.

The program download is about **15.7 MiB**. The separate source/notice kit is
about **95 MiB** and is available only when a visitor opens the license entry
and requests its contents. It must **not** be included in the service-worker
precache or downloaded for ordinary document formatting. Large source archives
are split into parts of at most 20 MiB; the material index explains reassembly.
Build sizes and hashes are recorded in `dist/browser-local/manifest.json`.

This static artifact is deployed on Cloudflare's free Workers Static Assets
plan at [formcapy.com](https://formcapy.com/) and
[www.formcapy.com](https://www.formcapy.com/) from code commit `f7c3444`.
The public Worker asset audit matched size and SHA-256 for all **122 downloadable
resources** against the final local artifact; `_headers` is hosting configuration
and is not a downloadable program resource. Runtime and caching details are in the
[browser-local guide](BROWSER-LOCAL.md); launch status is in
[deployment notes](DEPLOYMENT.md). Android retains its native offline Python
bridge and does not download Pyodide.

## The stock Windows lxml wheel

The inspected `lxml 6.1.3` CPython 3.12 Windows x64 wheel reports:

| Component | Actual compiled metadata / binary evidence |
| --- | --- |
| libxml2 | 2.11.9 |
| libxslt / libexslt | 1.1.45 |
| GNU iconv | 1.17 compile macro; upstream Windows fork is labelled 1.17.1 |
| zlib | 1.3.2 in the native deflate/inflate version strings |

The PE import table has no separate iconv/libxml/libxslt DLL. Together with
the enabled iconv feature and upstream static build scripts, this identifies
the static dependency requiring corresponding source/relink materials.
Adding one attribution line or an LGPL text alone does not supply those
materials.

The Windows release path supports this exact wheel using a complete source
kit. It checks every installed native file against the hashes in
`scripts/lxml-windows-source-kit.json`, verifies installed wheel source/data
files against the locked published wheel, and includes:

- The full lxml source distribution, including its generated C sources.
- The complete upstream Windows dependency build repository at commit
  `4e8ae01f61145dc823ce2ae1d79f06241b7b46de`, including its project patch.
- The full libiconv, libxml2, libxslt and zlib source submodules at that
  repository's exact commits, with original licenses and build projects.
- The application source snapshot, source commit, dirty-tree status, pinned
  build requirements, build scripts, a relink helper and rebuild instructions.
- The original identified wheel and hashes tying the kit to the actual native
  files included in the application.

`MLAFMT-SOURCE-KIT.zip` is embedded in the standalone EXE and included at the
Windows ZIP root. Help → Save corresponding source makes the embedded kit
available without installing Python. Read `REBUILD.txt` in the kit to unpack,
modify and relink the native library and rebuild the application.

This selects the source-form route described in LGPL 2.1 §6(a), which permits
the work using the library to be supplied as source and/or object code. The
kit preserves the upstream local changes and build configuration rather than
assuming unmodified release tarballs are sufficient.

### Matching evidence and limits

The pinned official wheel was uploaded on 2026-09-02. Its native versions
match the preceding official Windows dependency release, dated 2026-05-17,
and that release's fixed source submodules. The next dependency release in
October changed iconv to 1.19. These are published build-history and version
matches, reinforced by exact official wheel-file hashes. The wheel does not
contain a signed per-library build attestation. This host has no native C
toolchain, so the source kit has not been rebuilt here and no byte-identical
rebuild is claimed.

Primary sources:

- [Published lxml 6.1.3 files and hashes](https://pypi.org/pypi/lxml/6.1.3/json)
- [Official Windows dependency release](https://github.com/lxml/libxml2-win-binaries/releases/tag/2026.05.17)
- [Fixed dependency build and submodule revisions](https://github.com/lxml/libxml2-win-binaries/tree/4e8ae01f61145dc823ce2ae1d79f06241b7b46de)
- [lxml static dependency build code](https://github.com/lxml/lxml/blob/lxml-6.1.3/buildlibxml.py)
- [GNU LGPL 2.1 original text](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html)

## Building without GNU iconv

`scripts/build_lxml_no_iconv.py` is the alternative release recipe. It uses
SHA-256 locked full source archives and CMake to build libxml2 with iconv, ICU,
lzma and zlib disabled, then libxslt with crypto/modules disabled, and relinks
lxml against those local libraries. DOCX ZIP compression still uses Python's
zlib; it does not require libxml2's compressed-XML input support. libxml2's
built-in UTF conversions remain available.

The recipe preserves upstream lxml notices, adds the actual native libraries'
original notices to the produced wheel, and records source and patch hashes.
It reads the installed native feature metadata in a fresh process. The
release preparation step rejects an unexpected enabled iconv dependency.

macOS/Linux release builders use this recipe by default. Windows can select it
with `-NoIconv`. A native compiler, Python headers and CMake are required.
The recipe has received static review, including its MSVC library names and
path handling. Subsequent CI for `f7c3444` successfully built Linux and both Intel
and arm64 macOS packages. All jobs in run `39559961737` passed, including both
Mac architectures on their first attempt.
These native platform results do not change the browser material kit's
`collected-not-rebuilt` state.

## Development and release checks

Windows `-Development`, or macOS/Linux `--development`, keeps local package
generation available with the existing installed wheel. These packages go to
`dist/development/` and use a `-development` archive suffix. An unresolved
iconv configuration is marked in its notices and audit.

Release builders use `--release-check`. An unknown static iconv wheel cannot
pass by merely reusing the pinned Windows kit. It needs its own matching
materials or a completed no-iconv build. `scripts/prepare_release.py` also
checks the Windows ZIP's actual notices, original text hashes and source kit,
the EXE's embedded materials, Linux's packaged texts, and macOS/Linux CI
provenance. Renaming a development archive cannot bypass those checks.

Commit the complete source change before making final release packages. A
source kit made from a dirty tree is useful for inspection but fails the final
release aggregation check. The v2.4.0 release uses source commit
`f7c3444436b1bd11a06085c9ea202f7f5711e508` and CI run `39559961737`; its eight
published assets passed provenance, size and SHA-256 validation. Historical
v2.3.0 assets were not replaced.
