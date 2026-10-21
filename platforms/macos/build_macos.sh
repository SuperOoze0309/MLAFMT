#!/usr/bin/env bash
# Build on the target Mac architecture. The default signature is ad-hoc.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
EXPECTED_VERSION=""
DEVELOPMENT=0
ARCHITECTURE="$(uname -m)"
while (($#)); do
    case "$1" in
        --python) PYTHON="$2"; shift 2 ;;
        --expected-version) EXPECTED_VERSION="$2"; shift 2 ;;
        --architecture) ARCHITECTURE="$2"; shift 2 ;;
        --development) DEVELOPMENT=1; shift ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done
[[ "$(uname -s)" == Darwin ]] || { echo "Build this package on macOS." >&2; exit 1; }
[[ "$ARCHITECTURE" == arm64 || "$ARCHITECTURE" == x86_64 ]] || { echo "Use arm64 or x86_64." >&2; exit 1; }
"$PYTHON" -c 'import platform, sys; assert sys.version_info[:2] == (3, 12), "Use Python 3.12"; assert platform.machine() == sys.argv[1], "Run Python natively on the target architecture"; import tkinter; tkinter.Tcl()' "$ARCHITECTURE"
if [[ -n "${MLAFMT_CODESIGN_IDENTITY:-}" && "${MLAFMT_CODESIGN_IDENTITY}" != "Developer ID Application:"* ]]; then
    echo "MLAFMT_CODESIGN_IDENTITY must be a Developer ID Application identity." >&2; exit 1
fi
if [[ -n "${MLAFMT_NOTARY_PROFILE:-}" && -z "${MLAFMT_CODESIGN_IDENTITY:-}" ]]; then
    echo "Notarization requires MLAFMT_CODESIGN_IDENTITY and a notarytool keychain profile." >&2; exit 1
fi

BUILD_DIR="$PROJECT_ROOT/build/macos/$ARCHITECTURE"
RELEASE_DIR="$PROJECT_ROOT/dist/release"
if ((DEVELOPMENT)); then RELEASE_DIR="$PROJECT_ROOT/dist/development"; fi
mkdir -p "$BUILD_DIR" "$RELEASE_DIR"
"$PYTHON" -m venv --clear "$BUILD_DIR/venv"
BUILD_PYTHON="$BUILD_DIR/venv/bin/python"
"$BUILD_PYTHON" -m pip install -r "$PROJECT_ROOT/requirements-build.txt"
"$BUILD_PYTHON" -m pip check
PREPARE_ARGS=(--root "$PROJECT_ROOT" --output "$BUILD_DIR" --platform macos --architecture "$ARCHITECTURE" --expected-version "$EXPECTED_VERSION" --verify-dependencies)
if ((!DEVELOPMENT)); then
    "$BUILD_PYTHON" "$PROJECT_ROOT/scripts/build_lxml_no_iconv.py" --output "$BUILD_DIR/native" --install
    PREPARE_ARGS+=(--release-check)
fi
VERSION="$("$BUILD_PYTHON" "$PROJECT_ROOT/scripts/prepare_desktop_build.py" "${PREPARE_ARGS[@]}")"
"$BUILD_PYTHON" -m PyInstaller --clean --noconfirm --workpath "$BUILD_DIR/pyinstaller" --distpath "$BUILD_DIR/dist" "$BUILD_DIR/MLAFMT.spec"
APP_PATH="$BUILD_DIR/dist/FormCapy.app"
[[ -d "$APP_PATH" ]] || { echo "PyInstaller did not produce FormCapy.app." >&2; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")" == "$VERSION" ]]
codesign --verify --deep --strict "$APP_PATH"
"$APP_PATH/Contents/MacOS/MLAFMT" --smoke-test --require-dnd
INSTALL_STATUS=ad-hoc
if [[ -n "${MLAFMT_CODESIGN_IDENTITY:-}" ]]; then INSTALL_STATUS=developer-id; fi

notarize() {
    local artifact="$1" report="$2"
    xcrun notarytool submit "$artifact" --keychain-profile "$MLAFMT_NOTARY_PROFILE" --wait --output-format json > "$report"
    "$BUILD_PYTHON" -c 'import json, sys; report=json.load(open(sys.argv[1])); assert report.get("status") == "Accepted", report' "$report"
}
if [[ -n "${MLAFMT_NOTARY_PROFILE:-}" ]]; then
    ditto -c -k --keepParent "$APP_PATH" "$BUILD_DIR/notarization-app.zip"
    notarize "$BUILD_DIR/notarization-app.zip" "$BUILD_DIR/notarization-app.json"
    xcrun stapler staple "$APP_PATH"
    xcrun stapler validate "$APP_PATH"
    INSTALL_STATUS=notarized
fi
"$BUILD_PYTHON" "$PROJECT_ROOT/scripts/prepare_desktop_build.py" --root "$PROJECT_ROOT" --output "$BUILD_DIR" --platform macos --architecture "$ARCHITECTURE" --expected-version "$VERSION" --macos-install-status "$INSTALL_STATUS"

# Create a fresh staging directory; no mounted Finder session is needed in CI.
STAGE_DIR="$(mktemp -d "$BUILD_DIR/dmg-staging.XXXXXX")"
MOUNT_POINT=""
cleanup() {
    if [[ -n "$MOUNT_POINT" ]]; then
        hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || hdiutil detach -force "$MOUNT_POINT" >/dev/null 2>&1 || true
        rmdir "$MOUNT_POINT" >/dev/null 2>&1 || true
    fi
    rm -rf "$STAGE_DIR"
}
trap cleanup EXIT
ditto "$APP_PATH" "$STAGE_DIR/FormCapy.app"
ditto "$BUILD_DIR/documentation" "$STAGE_DIR/Documentation"
cp "$BUILD_DIR/Read Me.html" "$STAGE_DIR/Read Me.html"
ln -s /Applications "$STAGE_DIR/Applications"
FILE_ARCHITECTURE="$ARCHITECTURE"
[[ "$ARCHITECTURE" != x86_64 ]] || FILE_ARCHITECTURE=x64
DMG_PATH="$RELEASE_DIR/MLAFMT-v$VERSION-macos-$FILE_ARCHITECTURE.dmg"
if ((DEVELOPMENT)); then DMG_PATH="$RELEASE_DIR/MLAFMT-v$VERSION-macos-$FILE_ARCHITECTURE-development.dmg"; fi
hdiutil create -volname "FormCapy $VERSION" -srcfolder "$STAGE_DIR" -ov -format UDZO -fs HFS+ "$DMG_PATH"
if [[ -n "${MLAFMT_CODESIGN_IDENTITY:-}" ]]; then
    codesign --force --sign "$MLAFMT_CODESIGN_IDENTITY" --timestamp "$DMG_PATH"
    if [[ -n "${MLAFMT_NOTARY_PROFILE:-}" ]]; then
        notarize "$DMG_PATH" "$BUILD_DIR/notarization-dmg.json"
        xcrun stapler staple "$DMG_PATH"
        xcrun stapler validate "$DMG_PATH"
    fi
else
    echo "Ad-hoc signed build: it is not Apple-notarized. See Read Me.html."
fi
hdiutil verify "$DMG_PATH"

# Verify the app in the actual read-only download, including its
# source metadata. This catches staging, resource and relative-path problems.
MOUNT_POINT="$(mktemp -d "$BUILD_DIR/dmg-mount.XXXXXX")"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT_POINT" "$DMG_PATH"
MOUNTED_APP="$MOUNT_POINT/FormCapy.app"
[[ -d "$MOUNTED_APP" && ! -L "$MOUNTED_APP" ]]
[[ -L "$MOUNT_POINT/Applications" && "$(readlink "$MOUNT_POINT/Applications")" == /Applications ]]
[[ -f "$MOUNT_POINT/Read Me.html" && -f "$MOUNT_POINT/Documentation/README.md" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$MOUNTED_APP/Contents/Info.plist")" == "$VERSION" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$MOUNTED_APP/Contents/Info.plist")" == com.mlafmt.app ]]
cmp "$APP_PATH/Contents/MacOS/MLAFMT" "$MOUNTED_APP/Contents/MacOS/MLAFMT"
cmp "$APP_PATH/Contents/Info.plist" "$MOUNTED_APP/Contents/Info.plist"
cmp "$BUILD_DIR/build-info.json" "$MOUNT_POINT/Documentation/build-info.json"
cmp "$BUILD_DIR/build-info.json" "$MOUNTED_APP/Contents/Resources/documentation/build-info.json"
codesign --verify --deep --strict "$MOUNTED_APP"
if [[ "$INSTALL_STATUS" == notarized ]]; then xcrun stapler validate "$MOUNTED_APP"; fi
hdiutil detach "$MOUNT_POINT"
rmdir "$MOUNT_POINT"
MOUNT_POINT=""
echo "Release asset ready: $DMG_PATH"
