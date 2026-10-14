#!/usr/bin/env bash
# Build the x64 package on Ubuntu 22.04 (glibc 2.35) for a conservative baseline.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
EXPECTED_VERSION=""
while (($#)); do
    case "$1" in
        --python) PYTHON="$2"; shift 2 ;;
        --expected-version) EXPECTED_VERSION="$2"; shift 2 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo "Build on Linux x86_64." >&2; exit 1; }
"$PYTHON" -c 'import platform, struct, sys; assert sys.version_info[:2] == (3, 12), "Use Python 3.12"; assert struct.calcsize("P") == 8; name, version=platform.libc_ver(); assert name == "glibc" and tuple(map(int, version.split("."))) <= (2,35), "Build on Ubuntu 22.04 / glibc <= 2.35"; import tkinter; tkinter.Tcl()'
for tool in curl tar sha256sum mksquashfs; do
    command -v "$tool" >/dev/null || { echo "Missing build dependency: $tool" >&2; exit 1; }
done

BUILD_DIR="$PROJECT_ROOT/build/linux/x64"
RELEASE_DIR="$PROJECT_ROOT/dist/release"
mkdir -p "$BUILD_DIR/tools" "$RELEASE_DIR"
"$PYTHON" -m venv --clear "$BUILD_DIR/venv"
BUILD_PYTHON="$BUILD_DIR/venv/bin/python"
"$BUILD_PYTHON" -m pip install -r "$PROJECT_ROOT/requirements-build.txt"
"$BUILD_PYTHON" -m pip check
VERSION="$("$BUILD_PYTHON" "$PROJECT_ROOT/scripts/prepare_desktop_build.py" --root "$PROJECT_ROOT" --output "$BUILD_DIR" --platform linux --architecture x86_64 --expected-version "$EXPECTED_VERSION" --verify-dependencies)"
"$BUILD_PYTHON" -m PyInstaller --clean --noconfirm --workpath "$BUILD_DIR/pyinstaller" --distpath "$BUILD_DIR/dist" "$BUILD_DIR/MLAFMT.spec"

STAGE_DIR="$(mktemp -d "$BUILD_DIR/package.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT
APP_DIR="$STAGE_DIR/MLAFMT.AppDir"
mkdir -p "$APP_DIR/usr/bin"
cp -a "$BUILD_DIR/dist/MLAFMT/." "$APP_DIR/usr/bin/"
cp "$SCRIPT_DIR/AppRun" "$APP_DIR/AppRun"
cp "$SCRIPT_DIR/mlafmt.desktop" "$APP_DIR/mlafmt.desktop"
cp "$BUILD_DIR/MLAFMT.png" "$APP_DIR/mlafmt.png"
cp -a "$BUILD_DIR/documentation" "$APP_DIR/Documentation"
cp "$SCRIPT_DIR/INSTALL.md" "$APP_DIR/READ-ME-FIRST.md"
ln -s mlafmt.png "$APP_DIR/.DirIcon"
chmod +x "$APP_DIR/AppRun" "$APP_DIR/usr/bin/MLAFMT"

smoke_test() {
    if [[ -n "${DISPLAY:-}" ]]; then
        "$@" --smoke-test --require-dnd
    else
        command -v xvfb-run >/dev/null || { echo "Install xvfb for the packaged GUI smoke test." >&2; exit 1; }
        xvfb-run -a "$@" --smoke-test --require-dnd
    fi
}
smoke_test "$APP_DIR/AppRun"

# Pin both the packaging tool and the embedded runtime; never fetch latest implicitly.
readarray -t TOOL_VALUES < <("$BUILD_PYTHON" -c 'import json,sys; value=json.load(open(sys.argv[1])); print(value["appimagetool"]["url"]); print(value["appimagetool"]["sha256"]); print(value["runtime"]["url"]); print(value["runtime"]["sha256"])' "$SCRIPT_DIR/appimage-tools.json")
fetch_locked() {
    local url="$1" expected="$2" destination="$3"
    if [[ ! -f "$destination" ]] || [[ "$(sha256sum "$destination" | cut -d " " -f 1)" != "$expected" ]]; then
        curl --fail --location --retry 3 "$url" --output "$destination.download"
        printf '%s  %s\n' "$expected" "$destination.download" | sha256sum --check --status || { echo "Checksum mismatch for $url" >&2; exit 1; }
        mv "$destination.download" "$destination"
    fi
    printf '%s  %s\n' "$expected" "$destination" | sha256sum --check --status || { echo "Checksum mismatch for $destination" >&2; exit 1; }
    chmod +x "$destination"
}
fetch_locked "${TOOL_VALUES[0]}" "${TOOL_VALUES[1]}" "$BUILD_DIR/tools/appimagetool.AppImage"
VENDORED_RUNTIME="$SCRIPT_DIR/vendor/runtime-x86_64"
printf '%s  %s\n' "${TOOL_VALUES[3]}" "$VENDORED_RUNTIME" | sha256sum --check --status || { echo "The vendored AppImage runtime does not match its locked checksum." >&2; exit 1; }
cp "$VENDORED_RUNTIME" "$BUILD_DIR/tools/runtime-x86_64"
chmod +x "$BUILD_DIR/tools/runtime-x86_64"
APPIMAGE_PATH="$RELEASE_DIR/MLAFMT-v$VERSION-linux-x64.AppImage"
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$BUILD_DIR/tools/appimagetool.AppImage" --runtime-file "$BUILD_DIR/tools/runtime-x86_64" "$APP_DIR" "$APPIMAGE_PATH"
chmod +x "$APPIMAGE_PATH"

# Check the actual distributable without FUSE, network access or a system Python.
mkdir -p "$STAGE_DIR/appimage-test"
(cd "$STAGE_DIR/appimage-test" && "$APPIMAGE_PATH" --appimage-extract >/dev/null)
smoke_test "$STAGE_DIR/appimage-test/squashfs-root/AppRun"
TAR_PATH="$RELEASE_DIR/MLAFMT-v$VERSION-linux-x64.tar.gz"
tar -czf "$TAR_PATH" -C "$STAGE_DIR" MLAFMT.AppDir
echo "Release assets ready: $APPIMAGE_PATH and $TAR_PATH"
