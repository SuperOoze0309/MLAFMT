#!/usr/bin/env bash
# Android SDK 35, Java 17+, Python 3.12; release requires the signing variables
# described in README.md. Run with "debug" to make a development APK.
set -euo pipefail
cd "$(dirname "$0")"
mode=release
expected_version=""
while (($#)); do
    case "$1" in
        --debug|debug) mode=debug; shift ;;
        --release|release) mode=release; shift ;;
        --expected-version) expected_version="${2:?Missing expected version}"; shift 2 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done
if [[ -n "$expected_version" ]]; then
    actual_version=$(sed -n 's/^__version__ = "\([^"]*\)"/\1/p' ../../mla_formatter.py)
    [[ "${expected_version#v}" == "$actual_version" ]] || { echo "Version mismatch" >&2; exit 1; }
fi
if [[ "$mode" == debug ]]; then
    ./gradlew --no-daemon assembleDebug
else
    ./gradlew --no-daemon exportRelease
fi
