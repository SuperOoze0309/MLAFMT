# Bundled notices

These verbatim upstream license snapshots are listed with their version, source
URL and SHA-256 in `sources.json`. Gradle verifies the snapshots and includes
their complete text as `assets/THIRD-PARTY-NOTICES.txt`, alongside the project's
own `assets/LICENSE.txt`. The original lxml Schematron resource files retain
their notices within the Python package.

Native XML/XSLT libraries use the same upstream version and license as their
original Chaquopy builds; the MLAFMT rebuild changes linkage and page alignment.
XZ 5.2.4's liblzma is statically linked in the native XML rebuild and is public
domain, as described by its complete upstream `COPYING` notice. Command line
XZ tools and their GNU getopt dependency are not packaged.

AndroidX and Kotlin are distributed under Apache 2.0. Chaquopy's runtime also
contains Python's standard library and dependencies; CPython's complete license
notice includes its incorporated code acknowledgements. OpenSSL 3 is Apache
2.0; the Apache text is included.
