#!/bin/bash
# ============================================================
# MLAFMT Android .apk build script
#
# PREREQUISITES (run once on Ubuntu/Debian):
#   sudo apt install python3-pip openjdk-17-jdk git zip unzip
#   pip install buildozer cython
#
# USAGE (on Linux or WSL):
#   chmod +x build_android.sh
#   ./build_android.sh
# ============================================================
set -e

echo "=== MLAFMT Android .apk Builder ==="

# ---- 1. Copy source files into android/ ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR=""
for d in "${SCRIPT_DIR}/../.." "${SCRIPT_DIR}/../../.."; do
    if [ -f "$d/mla_formatter.py" ]; then PROJECT_DIR="$(cd "$d" && pwd)"; break; fi
done
[ -n "$PROJECT_DIR" ] || { echo "mla_formatter.py not found above ${SCRIPT_DIR}"; exit 1; }

echo "[1/3] Copying source files..."
cp "${PROJECT_DIR}/mla_formatter.py" "${SCRIPT_DIR}/"
cp "${PROJECT_DIR}/mla_web.py" "${SCRIPT_DIR}/"
cp -r "${PROJECT_DIR}/templates" "${SCRIPT_DIR}/"

cd "${SCRIPT_DIR}"

# ---- 2. Build with Buildozer ----
echo "[2/3] Building .apk (this will take 15-30 min first time)..."
buildozer -v android debug

# ---- 3. Locate the apk ----
echo "[3/3] Done!"
APK=$(find bin -name "*.apk" 2>/dev/null | head -1)
if [ -n "$APK" ]; then
    cp "$APK" ./MLAFMT.apk
    echo ""
    echo "=== APK ready: $(pwd)/MLAFMT.apk ==="
    echo "  Transfer to your Android device and install."
else
    echo "APK not found. Check buildozer logs above for errors."
fi
