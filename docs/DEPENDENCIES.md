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
but lacked a companion third-party notice inventory. The source changes here
do not replace or repair that old downloaded asset.

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
path handling, but has not been compiled on this Windows host or on a Mac/Linux
host during this change. Native build success remains to be established by
the corresponding platform build; its presence in the repository is not a
claim that a new wheel or distributable already exists.

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
release aggregation check. This document does not assert that previously
published packages have been replaced.
