# Android app

MLAFMT for Android runs entirely offline. A Kotlin Activity displays the shared
mobile HTML interface from packaged assets; a restricted origin and main-frame
WebMessage bridge calls the existing Python formatter using Chaquopy. The app
does not request network access or storage permissions.

Android 7.0 / API 24 or later, **64-bit ARM or x86_64**, is required. Update
Android System WebView if prompted. Choose a DOCX, TXT or Markdown draft with
the system file picker, generate your paper, then **Save Word document**,
**Open**, or **Share**. Saving uses the system's document location picker.
The original file is left untouched. Processing continues while the app is in
the background and survives screen rotation. After Android terminates the app,
the draft and completed output are restored where available; interrupted
processing can be retried. Documents are generated in the app's private
storage until saved or shared.

On a foldable, an expanded vertical fold shows the form and paper preview in
two independently scrolling panes with a gap for the hinge. Tabletop posture
places them above and below the hinge. If one pane becomes too short (such as
with the keyboard open), the controls move into the larger usable pane. Narrow
windows use one column. Folding, resizing and rotating retain paper details,
formatting options, the selected draft, an active conversion and its result.

## Build

Install Java 17 or 21, Python 3.12, and Android SDK platform/build tools 35.
Set `JAVA_HOME` and `ANDROID_HOME` (or put `sdk.dir` in ignored
`local.properties`). If Python 3.12 is not the default interpreter, set
`MLAFMT_BUILD_PYTHON` to its executable path. No NDK is needed.

```sh
cd platforms/android
./gradlew --no-daemon :app:assembleDebug :app:lintDebug
./gradlew --no-daemon :app:connectedDebugAndroidTest
./build_android.sh --release --expected-version v2.2.0
```

On Windows use `gradlew.bat` instead of `./gradlew`, and run
`gradlew.bat --no-daemon :app:exportRelease` to produce the signed release.

The wrapper locks Gradle 8.11.1 and validates its distribution SHA-256.
The checked-in wrapper JAR's SHA-256 is
`2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`
([official Gradle checksum](https://services.gradle.org/distributions/gradle-8.11.1-wrapper.jar.sha256)).
Dependencies are AGP 8.9.2, Kotlin 2.2.0, Chaquopy 17.0.0, Python 3.12,
python-docx 1.1.2, lxml 5.3.0 and typing-extensions 4.12.2. lxml is locked to
a version with prebuilt Android wheels for both supported ABIs. `minSdk` 24
follows [Chaquopy's requirements](https://chaquo.com/chaquopy/doc/current/versions.html).

Set `MLAFMT_ANDROID_NATIVE_WHEELS` to the absolute directory containing the
rebuilt 16 KB aligned libxml2/libxslt wheels for both ABIs when building a
release. The rebuild uses explicit local versions `2.9.8+mlafmt16k1` and
`1.1.32+mlafmt16k1`. Release builds require these wheels and fail if unavailable;
debug builds can use upstream 4 KB libraries for development.

Gradle reads `__version__` from the root formatter and derives Android's
`versionCode` as `major * 1000000 + minor * 1000 + patch`. Source and rendered
HTML are copied into `app/build/generated`, never into source directories.
The signed result is `dist/release/MLAFMT-v<version>-android.apk` at the root.
The APK includes the project's MIT license and the full bundled third-party
license notices, verified against the upstream snapshots in `licenses/`.

## Release signing

Release packaging fails if any signing value is missing. Provide:

| Environment variable | Meaning |
| --- | --- |
| `MLAFMT_ANDROID_KEYSTORE` | Absolute path to the private JKS or PKCS12 file |
| `MLAFMT_ANDROID_STORE_PASSWORD` | Keystore password |
| `MLAFMT_ANDROID_KEY_ALIAS` | Key alias |
| `MLAFMT_ANDROID_KEY_PASSWORD` | Key password |

Alternatively, create an ignored `keystore.properties` with `storeFile`,
`storePassword`, `keyAlias` and `keyPassword`. Back up the key securely and
reuse it for every update. Never commit key files or passwords. CI should
decode its keystore secret to a temporary file and supply the environment
variables above.

## Device tests

The `connectedDebugAndroidTest` task uses AndroidX instrumentation on an API
24+ emulator/device. It verifies the bundled Python and native lxml runtime,
MLA page size/margins/font/page fields, Works Cited new page and hanging
indent, invalid DOCX handling, the packaged WebView page, native file-pick and
save contracts, conversion and document retention across Activity recreation.
Jetpack WindowManager fold tests inject physical hinge features, change actual
window width, and verify pane placement and retained form/draft/output state.
Its document operations are intercepted with a local FileProvider rather
than uploading any files.
