#!/usr/bin/env bash
# Recompile the original Chaquopy XML libraries with real 16 KB load segments.
set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIRECTORY="$(cd "$SCRIPT_DIRECTORY/.." && pwd)"
NDK_DIRECTORY="${ANDROID_NDK_HOME:-${ANDROID_HOME:-}/ndk/28.2.13676358}"
PYTHON="${PYTHON:-python3}"
while (($#)); do
    case "$1" in
        --ndk) NDK_DIRECTORY="$2"; shift 2 ;;
        --python) PYTHON="$2"; shift 2 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo "Build native wheels on Linux x86_64." >&2; exit 1; }
[[ -f "$NDK_DIRECTORY/source.properties" ]] || { echo "Install Android NDK 28.2.13676358." >&2; exit 1; }
grep -q 'Pkg.Revision = 28.2.13676358' "$NDK_DIRECTORY/source.properties" || { echo "Use the locked Android NDK 28.2.13676358 (r28c)." >&2; exit 1; }
for tool in make curl tar sha256sum; do
    command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
TOOLCHAIN="$NDK_DIRECTORY/toolchains/llvm/prebuilt/linux-x86_64/bin"
BUILD_DIRECTORY="$PROJECT_DIRECTORY/build/android-native"
mkdir -p "$BUILD_DIRECTORY/downloads" "$BUILD_DIRECTORY/wheels"

fetch_source() {
    local url="$1" expected="$2" destination="$3"
    if [[ ! -f "$destination" ]] || [[ "$(sha256sum "$destination" | cut -d ' ' -f 1)" != "$expected" ]]; then
        curl --fail --location --retry 3 "$url" --output "$destination.download"
        printf '%s  %s\n' "$expected" "$destination.download" | sha256sum --check --status || { echo "Checksum mismatch: $url" >&2; exit 1; }
        mv "$destination.download" "$destination"
    fi
    printf '%s  %s\n' "$expected" "$destination" | sha256sum --check --status
}
XML_ARCHIVE="$BUILD_DIRECTORY/downloads/libxml2-2.9.8.tar.xz"
XSLT_ARCHIVE="$BUILD_DIRECTORY/downloads/libxslt-1.1.32.tar.xz"
XZ_ARCHIVE="$BUILD_DIRECTORY/downloads/xz-5.2.4.tar.xz"
fetch_source 'https://download.gnome.org/sources/libxml2/2.9/libxml2-2.9.8.tar.xz' 'dcca21d624bbbe094fcc104e1f15f2eacfb65aecd0e38ed220aeca56b62c81e2' "$XML_ARCHIVE"
fetch_source 'https://download.gnome.org/sources/libxslt/1.1/libxslt-1.1.32.tar.xz' 'b7da90eaa6b0dae9e9a3769e29a757342eef0edb9a7b431424814375414422af' "$XSLT_ARCHIVE"
# The upstream historical URL redirects to an interactive SourceForge page.
# OmniOS retains the original signed release archive with the published checksum.
fetch_source 'https://mirrors.omnios.org/xz/xz-5.2.4.tar.xz' '9717ae363760dedf573dad241420c5fea86256b65bc21d2cf71b2b12f0544f4b' "$XZ_ARCHIVE"
"$PYTHON" "$SCRIPT_DIRECTORY/prepare_android_native_wheels.py" download-baselines --directory "$BUILD_DIRECTORY/downloads"

for ABI in arm64-v8a x86_64; do
    if [[ "$ABI" == arm64-v8a ]]; then TARGET=aarch64-linux-android; else TARGET=x86_64-linux-android; fi
    WORK_DIRECTORY="$(mktemp -d "$BUILD_DIRECTORY/$ABI.XXXXXX")"
    PREFIX="$WORK_DIRECTORY/install"
    mkdir -p "$PREFIX" "$WORK_DIRECTORY/empty-pkgconfig"
    tar -xJf "$XML_ARCHIVE" -C "$WORK_DIRECTORY"
    tar -xJf "$XSLT_ARCHIVE" -C "$WORK_DIRECTORY"
    tar -xJf "$XZ_ARCHIVE" -C "$WORK_DIRECTORY"
    (
        export CC="$TOOLCHAIN/${TARGET}24-clang"
        export CXX="$TOOLCHAIN/${TARGET}24-clang++"
        export AR="$TOOLCHAIN/llvm-ar" RANLIB="$TOOLCHAIN/llvm-ranlib"
        export NM="$TOOLCHAIN/llvm-nm" STRIP="$TOOLCHAIN/llvm-strip"
        export CFLAGS='-O2 -fPIC' CPPFLAGS="-I$PREFIX/include"
        # The upstream symbol maps also list disabled DocBook and Windows-only
        # entry points. Match GNU ld's historical handling of those map entries;
        # the packaging step still requires every original exported ABI symbol.
        export LDFLAGS="-L$PREFIX/lib -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 -Wl,--undefined-version"
        export PKG_CONFIG_LIBDIR="$WORK_DIRECTORY/empty-pkgconfig"
        export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
        export CONFIG_SITE=/dev/null
        # The original XML wheel contains liblzma 5.2.4 statically. Rebuild it
        # too, so the original compressed-XML support and symbols are retained.
        cd "$WORK_DIRECTORY/xz-5.2.4"
        ./configure --host="$TARGET" --prefix="$PREFIX" --disable-shared --enable-static --with-pic --disable-xz --disable-xzdec --disable-lzmadec --disable-lzmainfo --disable-lzma-links --disable-scripts
        make -C src/liblzma -j "$(nproc)"
        make -C src/liblzma install
        cd "$WORK_DIRECTORY/libxml2-2.9.8"
        ./configure --host="$TARGET" --prefix="$PREFIX" --without-python --with-lzma="$PREFIX" --without-iconv --disable-static --enable-shared
        # Emit the same unversioned SONAMEs used by the original Chaquopy wheels,
        # directly at link time. No binary p_align or relocation patching occurs.
        "$PYTHON" "$SCRIPT_DIRECTORY/prepare_android_native_wheels.py" configure-sonames --source-directory "$WORK_DIRECTORY/libxml2-2.9.8"
        make -j "$(nproc)" libxml2.la
        make install-libLTLIBRARIES install-binSCRIPTS install-pkgconfigDATA
        make -C include install
        cd "$WORK_DIRECTORY/libxslt-1.1.32"
        ./configure --host="$TARGET" --prefix="$PREFIX" --without-python --without-crypto --disable-static --enable-shared --with-libxml-prefix="$PREFIX" --with-libxml-include-prefix="$PREFIX/include/libxml2"
        "$PYTHON" "$SCRIPT_DIRECTORY/prepare_android_native_wheels.py" configure-sonames --source-directory "$WORK_DIRECTORY/libxslt-1.1.32"
        make -C libxslt -j "$(nproc)"
        make -C libexslt -j "$(nproc)"
        make -C libxslt install
        make -C libexslt install
    )
    "$PYTHON" "$SCRIPT_DIRECTORY/prepare_android_native_wheels.py" package --prefix "$PREFIX" --source-directory "$WORK_DIRECTORY" --output "$BUILD_DIRECTORY/wheels" --abi "$ABI" --baseline-directory "$BUILD_DIRECTORY/downloads" --ndk "$NDK_DIRECTORY"
done
"$PYTHON" "$SCRIPT_DIRECTORY/prepare_android_native_wheels.py" manifest --directory "$BUILD_DIRECTORY/wheels"
echo "Verified native wheels ready: $BUILD_DIRECTORY/wheels"
