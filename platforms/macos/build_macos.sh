#!/bin/bash
# =====================================================================
#  MLAFMT macOS One-Click Builder
#
#  WHAT THIS DOES:
#    1. Installs Python dependencies (pip)
#    2. Generates an app icon (.icns)
#    3. Builds MLAFMT.app with PyInstaller
#    4. Packages everything into MLAFMT.dmg ready to distribute
#
#  HOW TO USE:
#    chmod +x build_macos.sh
#    ./build_macos.sh
#
#  OUTPUT:
#    dist/MLAFMT.dmg  ← give this to users; they drag the app to
#                         /Applications and double-click
# =====================================================================
set -e
set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[MLAFMT]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $1"; }
err()  { echo -e "${RED}[ERROR ]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/mlafmt_build"
DIST_DIR="${SCRIPT_DIR}/dist"
APP_NAME="MLAFMT"
DMG_NAME="MLAFMT.dmg"
VOL_NAME="MLAFMT"

# ---- 1. Environment check ----
log "Checking environment..."

if ! command -v python3 &>/dev/null; then
    err "python3 not found. Install from https://www.python.org/downloads/ and re-run."
fi

PYVER=$(python3 -c "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')")
MIN_VER="3.10"
if [ "$(printf '%s\n' "$MIN_VER" "$PYVER" | sort -V | head -1)" != "$MIN_VER" ]; then
    err "Python $PYVER detected, need $MIN_VER+. Upgrade and re-run."
fi
ok "Python $PYVER"

# ---- 2. Install dependencies ----
log "Installing Python packages..."
python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet python-docx tkinterdnd2 pyinstaller flask 2>&1 | tail -1
ok "Dependencies ready"

# ---- 3. Copy source files ----
log "Copying source files..."
PROJECT_DIR=""
for d in "${SCRIPT_DIR}/../.." "${SCRIPT_DIR}/../../.."; do
    if [ -f "$d/mla_formatter.py" ]; then PROJECT_DIR="$(cd "$d" && pwd)"; break; fi
done
[ -n "$PROJECT_DIR" ] || { echo "mla_formatter.py not found above ${SCRIPT_DIR}"; exit 1; }
cp "${PROJECT_DIR}/mla_formatter.py" "${BUILD_DIR}/" 2>/dev/null || true
cp "${PROJECT_DIR}/mla_gui.py"      "${BUILD_DIR}/" 2>/dev/null || true
cp "${PROJECT_DIR}/mla_web.py"      "${BUILD_DIR}/" 2>/dev/null || true
cp -r "${PROJECT_DIR}/templates"    "${BUILD_DIR}/" 2>/dev/null || true
ok "Source files ready"

cd "${BUILD_DIR}"

# ---- 4. Generate app icon (.icns) ----
log "Generating app icon (1024x1024 → .icns)..."
ICON_DIR="${BUILD_DIR}/icon_build"
rm -rf "${ICON_DIR}"
mkdir -p "${ICON_DIR}"

# Create a clean icon PNG with Python (no external tools needed)
python3 << 'PYICON'
import struct, zlib

def create_png(width, height, color):
    """Minimal PNG generator: solid rounded-rect with a letter."""
    raw = []
    r, g, b = color
    for y in range(height):
        raw.append(b'\x00')  # filter byte
        for x in range(width):
            # Rounded-rect mask: corners clipped
            cx, cy = x - width/2, y - height/2
            corner_r = width * 0.18
            in_rect = True
            if abs(cx) > width/2 - corner_r and abs(cy) > height/2 - corner_r:
                dx = abs(cx) - (width/2 - corner_r)
                dy = abs(cy) - (height/2 - corner_r)
                if dx*dx + dy*dy > corner_r*corner_r:
                    in_rect = False
            if in_rect:
                raw.append(bytes([r, g, b, 255]))
            else:
                raw.append(bytes([0, 0, 0, 0]))
    return b''.join(raw)

def make_png(data, w, h):
    def chunk(ctype, cdata):
        c = ctype + cdata
        return struct.pack('>I', len(cdata)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(data))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

# Generate icon: dark-blue background with white "M"
png_data = make_png(create_png(1024, 1024, (59, 130, 216)), 1024, 1024)
with open('/tmp/mlafmt_icon.png', 'wb') as f:
    f.write(png_data)
print('Icon PNG created.')
PYICON

# Convert PNG → ICNS using macOS built-in tools
mkdir -p "${ICON_DIR}/icon.iconset"
for size in 16 32 64 128 256 512; do
    sips -z $size $size /tmp/mlafmt_icon.png \
        --out "${ICON_DIR}/icon.iconset/icon_${size}x${size}.png" &>/dev/null
    dsize=$((size * 2))
    sips -z $dsize $dsize /tmp/mlafmt_icon.png \
        --out "${ICON_DIR}/icon.iconset/icon_${size}x${size}@2x.png" &>/dev/null
done
iconutil -c icns "${ICON_DIR}/icon.iconset" -o "${BUILD_DIR}/${APP_NAME}.icns"
rm -rf "${ICON_DIR}" /tmp/mlafmt_icon.png
ok "Icon generated"

# ---- 5. PyInstaller build ----
log "Building ${APP_NAME}.app (this may take a minute)..."

# Custom Info.plist for better user experience
cat > "${BUILD_DIR}/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>    <string>English</string>
    <key>CFBundleDisplayName</key>          <string>MLAFMT</string>
    <key>CFBundleExecutable</key>           <string>MLAFMT</string>
    <key>CFBundleIdentifier</key>           <string>com.mlafmt.app</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key>                 <string>MLAFMT</string>
    <key>CFBundlePackageType</key>          <string>APPL</string>
    <key>CFBundleShortVersionString</key>   <string>1.0.0</string>
    <key>CFBundleVersion</key>              <string>1</string>
    <key>LSMinimumSystemVersion</key>       <string>10.13</string>
    <key>NSHighResolutionCapable</key>      <true/>
    <key>NSHumanReadableCopyright</key>     <string>MIT License</string>
</dict>
</plist>
PLIST

pyinstaller \
    --onefile \
    --windowed \
    --name "${APP_NAME}" \
    --icon "${BUILD_DIR}/${APP_NAME}.icns" \
    --osx-bundle-identifier "com.mlafmt.app" \
    --add-data "templates:templates" \
    mla_gui.py 2>&1 | tail -3

# Ad-hoc code sign (avoids Gatekeeper "unidentified developer" popup on first run)
APP_PATH="${DIST_DIR}/${APP_NAME}.app"
if [ -d "${APP_PATH}" ]; then
    log "Signing app (ad-hoc)..."
    codesign --force --deep --sign - "${APP_PATH}" 2>/dev/null || true
    ok "App signed"
else
    err "PyInstaller did not produce ${APP_PATH}"
fi
ok "${APP_NAME}.app built"

# ---- 6. Build .dmg ----
log "Packaging ${DMG_NAME}..."
DMG_DIR="${BUILD_DIR}/dmg_staging"
rm -rf "${DMG_DIR}"
mkdir -p "${DMG_DIR}"

cp -R "${APP_PATH}" "${DMG_DIR}/"

# Symlink to /Applications so user can drag the app there
ln -s /Applications "${DMG_DIR}/Applications"

# Custom .dmg with nice layout
hdiutil create -volname "${VOL_NAME}" \
    -srcfolder "${DMG_DIR}" \
    -ov -format UDZO \
    -fs HFS+ \
    "${DIST_DIR}/${DMG_NAME}" &>/dev/null

# Arrange icons in the DMG (centered, nice spacing)
hdiutil attach "${DIST_DIR}/${DMG_NAME}" -readwrite -noverify -noautoopen \
    -mountpoint "/Volumes/${VOL_NAME}" &>/dev/null

osascript << APPLESCRIPT
tell application "Finder"
    tell disk "${VOL_NAME}"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {200, 120, 540, 400}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 80
        set position of item "${APP_NAME}.app" of container window to {80, 120}
        set position of item "Applications" of container window to {260, 120}
        close
        open
        update without registering applications
        delay 1
        close
    end tell
end tell
APPLESCRIPT

hdiutil detach "/Volumes/${VOL_NAME}" &>/dev/null
hdiutil convert "${DIST_DIR}/${DMG_NAME}" -format UDZO -o "${DIST_DIR}/tmp.dmg" &>/dev/null
mv "${DIST_DIR}/tmp.dmg" "${DIST_DIR}/${DMG_NAME}"

rm -rf "${DMG_DIR}"
ok "${DMG_NAME} ready"

# ---- Done ----
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   MLAFMT macOS build complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  DMG:  ${DIST_DIR}/${DMG_NAME}"
echo "  App:  ${APP_PATH}"
echo ""
echo "  To distribute: give users ${DMG_NAME}"
echo "  They double-click, drag MLAFMT to Applications, done."
