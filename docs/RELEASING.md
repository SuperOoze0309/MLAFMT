# MLAFMT builds and releases

The source version in `mla_formatter.py` is the version for every platform. Release builds use Python 3.12; Android uses the same formatter with its own locked mobile dependencies. All distributable files go to `dist/release/`.

## Validate before publishing

```bash
python -m pip install -r requirements.txt pytest
python -m pytest -q
python mla_gui.py --smoke-test --require-dnd
```

On Linux, run GUI checks with `xvfb-run -a` if there is no display. Desktop smoke checks load native TkDnD, switch both languages, create a blank template and convert a Unicode draft containing Works Cited, then inspect the resulting Word layout.

GitHub Actions builds Windows, both Mac architectures, Linux and signed Android packages. Android instrumentation checks run on an x86_64 emulator. Download only release artifacts from the same successful workflow run; test reports are separate artifacts. The workflow never publishes a Release automatically.

## Windows

Use Python 3.12 x64 in a virtual environment:

```powershell
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.3.0
.\dist\release\MLAFMT.exe --smoke-test --require-dnd
```

The EXE includes the app version. The versioned ZIP adds build provenance, the README and its image assets.

## macOS

Build natively on Apple silicon and Intel separately with Python 3.12, including working Tk:

```bash
bash platforms/macos/build_macos.sh --python python3 --architecture arm64 --expected-version v2.3.0
# On an Intel Mac, use --architecture x86_64.
```

The script creates an isolated build environment, app bundle and DMG, then checks the app and disk image. The bundled arm64 TkDnD library requires macOS 14; both packages declare macOS 14 as the minimum supported system.

Default builds are ad-hoc signed and **not notarized**. For Developer ID distribution, configure `MLAFMT_CODESIGN_IDENTITY` and optionally `MLAFMT_NOTARY_PROFILE` on the build Mac. The latter refers to a `notarytool` keychain profile; credentials and certificates must never be committed. The script waits for Apple's acceptance and staples the app and DMG when notarization is enabled.

## Linux

Use Ubuntu 22.04 x64 / glibc 2.35 as the build baseline, Python 3.12 and the system X11/Tcl/Tk libraries:

```bash
sudo apt-get install xvfb squashfs-tools libx11-6 libxext6 libxrender1 libxft2 fontconfig libtcl8.6 libtk8.6
bash platforms/linux/build_linux.sh --python python3 --expected-version v2.3.0
```

The script checks the staged app and extracts the finished AppImage to test it without FUSE. A portable tar.gz is also produced. AppImage packaging inputs are versioned and SHA-256 verified. Runtime documentation and third-party notices accompany the app.

## Android

The native project is in `platforms/android`. Use JDK 21, Android SDK 35 and Python 3.12 as the build Python. Gradle bundles the root formatter and HTML into generated assets; no Flask service or network connection is needed by the installed app. WindowManager and the shared interface support vertical hinges, tabletop folding, compact layouts and multi-window resizing.

Release builds use XML libraries rebuilt for modern Android 16 KiB memory pages. On Linux, install Android NDK `28.2.13676358`, then run:

```bash
bash scripts/build_android_native.sh --ndk "$ANDROID_HOME/ndk/28.2.13676358" --python python3
export MLAFMT_ANDROID_NATIVE_WHEELS="$PWD/build/android-native/wheels"
```

Alternatively download the verified native-wheel artifact from a successful CI run and point `MLAFMT_ANDROID_NATIVE_WHEELS` at it. This avoids requiring an NDK on the APK build host. Local dependency versions are pinned explicitly; release tasks refuse to fall back to the older wheels.

The release signing inputs are:

- `MLAFMT_ANDROID_KEYSTORE`: path to the private keystore.
- `MLAFMT_ANDROID_STORE_PASSWORD`, `MLAFMT_ANDROID_KEY_ALIAS`, `MLAFMT_ANDROID_KEY_PASSWORD`.
- `MLAFMT_BUILD_PYTHON`: optional path to the Python 3.12 build interpreter.
- `MLAFMT_ANDROID_NATIVE_WHEELS`: directory of the verified 16 KiB native wheels.

On GitHub, the same password/alias names are repository secrets. `MLAFMT_ANDROID_KEYSTORE_BASE64` supplies the keystore; CI writes it to a temporary file. Local signing backups are kept under `.secrets/android/`, which is ignored by Git. Keep a secure backup of the keystore and credentials: subsequent APK updates must use the same signing key.

```bash
bash platforms/android/build_android.sh --release --expected-version v2.3.0
cd platforms/android
bash gradlew :app:lintDebug :app:testDebugUnitTest
bash gradlew :app:connectedDebugAndroidTest  # Requires a running Android emulator/device.
python ../../scripts/verify_android_apk.py ../../dist/release/MLAFMT-v2.3.0-android.apk
```

On Windows, use `gradlew.bat :app:exportRelease` with the signing environment configured. The APK supports arm64-v8a and x86_64 on Android 7+ (API 24), with a target SDK of 35. See the Android project's README for the complete local setup.

## Publish one version

After all platform checks pass, gather the seven release files and the macOS/Linux provenance sidecars into `dist/release/`. Validate the packages' clean source commit and exact hashes, and create a checksum manifest and concise bilingual download notes:

```bash
python scripts/prepare_release.py
git tag v2.3.0
git push origin main v2.3.0
```

Create the GitHub Release explicitly using `gh release create v2.3.0 --verify-tag --title "MLAFMT v2.3.0" --notes-file build/release-notes.md`, passing the seven validated files and `SHA256SUMS.txt` as assets. Keep the main download table to recommended files; place portable archives and checksums under Other downloads. Never upload a debug APK or a signing key.
