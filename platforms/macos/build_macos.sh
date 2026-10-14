#!/usr/bin/env bash
# Build on the target Mac architecture. The default signature is ad-hoc.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
EXPECTED_VERSION=""
ARCHITECTURE="$(uname -m)"
while (($#)); do
    case "$1" in
        --python) PYTHON="$2"; shift 2 ;;
        --expected-version) EXPECTED_VERSION="$2"; shift 2 ;;
        --architecture) ARCHITECTURE="$2"; shift 2 ;;
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
mkdir -p "$BUILD_DIR" "$RELEASE_DIR"
"$PYTHON" -m venv --clear "$BUILD_DIR/venv"
BUILD_PYTHON="$BUILD_DIR/venv/bin/python"
"$BUILD_PYTHON" -m pip install -r "$PROJECT_ROOT/requirements-build.txt"
"$BUILD_PYTHON" -m pip check
VERSION="$("$BUILD_PYTHON" "$PROJECT_ROOT/scripts/prepare_desktop_build.py" --root "$PROJECT_ROOT" --output "$BUILD_DIR" --platform macos --architecture "$ARCHITECTURE" --expected-version "$EXPECTED_VERSION" --verify-dependencies)"
"$BUILD_PYTHON" -m PyInstaller --clean --noconfirm --workpath "$BUILD_DIR/pyinstaller" --distpath "$BUILD_DIR/dist" "$BUILD_DIR/MLAFMT.spec"
APP_PATH="$BUILD_DIR/dist/MLAFMT.app"
[[ -d "$APP_PATH" ]] || { echo "PyInstaller did not produce MLAFMT.app." >&2; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")" == "$VERSION" ]]
codesign --verify --deep --strict "$APP_PATH"
"$APP_PATH/Contents/MacOS/MLAFMT" --smoke-test --require-dnd

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
fi

# Create a fresh staging directory; no mounted Finder session is needed in CI.
STAGE_DIR="$(mktemp -d "$BUILD_DIR/dmg-staging.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT
ditto "$APP_PATH" "$STAGE_DIR/MLAFMT.app"
ditto "$BUILD_DIR/documentation" "$STAGE_DIR/Documentation"
cp "$SCRIPT_DIR/INSTALL.md" "$STAGE_DIR/READ-ME-FIRST.md"
ln -s /Applications "$STAGE_DIR/Applications"
FILE_ARCHITECTURE="$ARCHITECTURE"
[[ "$ARCHITECTURE" != x86_64 ]] || FILE_ARCHITECTURE=x64
DMG_PATH="$RELEASE_DIR/MLAFMT-v$VERSION-macos-$FILE_ARCHITECTURE.dmg"
hdiutil create -volname "MLAFMT $VERSION" -srcfolder "$STAGE_DIR" -ov -format UDZO -fs HFS+ "$DMG_PATH"
if [[ -n "${MLAFMT_CODESIGN_IDENTITY:-}" ]]; then
    codesign --force --sign "$MLAFMT_CODESIGN_IDENTITY" --timestamp "$DMG_PATH"
    if [[ -n "${MLAFMT_NOTARY_PROFILE:-}" ]]; then
        notarize "$DMG_PATH" "$BUILD_DIR/notarization-dmg.json"
        xcrun stapler staple "$DMG_PATH"
        xcrun stapler validate "$DMG_PATH"
    fi
else
    echo "Ad-hoc signed build: it is not Apple-notarized. See READ-ME-FIRST.md."
fi
hdiutil verify "$DMG_PATH"
echo "Release asset ready: $DMG_PATH"
