# MLAFMT · MLA 一键排版

[中文](#中文) · [English](#english) · [下载 / Downloads](https://github.com/SuperOoze0309/MLAFMT/releases/latest)

把 `.docx`、`.txt` 或 `.md` 作文草稿整理为 MLA 第 9 版常用版式的 Word 文档。桌面端与网页端均支持中文 / English 切换；界面语言不会翻译或改写你的作文。

## 下载 / Downloads

| 设备 / Device | v2.3.0 下载 / Download | 安装 / Install |
| --- | --- | --- |
| Windows 10/11 · x64 | [MLAFMT.exe](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT.exe) | 双击运行 / Open the EXE |
| macOS 14+ · M 系列 / Apple silicon | [Mac DMG](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT-v2.3.0-macos-arm64.dmg) | 拖入应用程序 / Drag to Applications |
| macOS 14+ · Intel | [Mac DMG](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT-v2.3.0-macos-x64.dmg) | 拖入应用程序 / Drag to Applications |
| Linux · x64 · Ubuntu 22.04+ 或兼容系统 / or compatible | [Linux AppImage](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT-v2.3.0-linux-x64.AppImage) | 允许执行后运行 / Mark executable and open |
| Android 7+ · 64 位 / 64-bit | [Android APK](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT-v2.3.0-android.apk) | 下载后安装 / Download and install |

macOS 包目前未经过 Apple 公证。首次打开若被系统阻止，可在“系统设置 → 隐私与安全”确认打开。macOS builds are not Apple-notarized; if blocked on first launch, confirm the app in System Settings → Privacy & Security.

Mac 文件打开、Pages 导入及 iPhone/iPad 本地预览见 [Apple 设备指南 / Apple guide](docs/APPLE.md)。iPhone/iPad 当前提供本地网页预览。See the guide for Mac file handling and local iPhone/iPad web preview.

<details>
<summary>其他下载 / Other downloads</summary>

- [Windows ZIP（包含图文说明）/ Windows ZIP with illustrated guide](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT-v2.3.0-windows-x64.zip)
- [Linux tar.gz（无 FUSE 时使用）/ Linux tar.gz for systems without FUSE](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/MLAFMT-v2.3.0-linux-x64.tar.gz)
- [SHA-256 校验和 / Checksums](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.3.0/SHA256SUMS.txt)

</details>

## 中文

### 桌面快速开始

1. 下载与你的系统对应的文件，按上表安装并打开。
2. 填写姓名、作文标题；老师和课程可选，日期留空会使用今天。
3. 拖入草稿，或点击选择文件，然后转换并保存 `.docx`。

#### 图示：填写信息并生成文档

![MLAFMT 中文界面：论文信息、草稿上传和 MLA 版式预览](docs/images/mlafmt-web-zh.png)

*图为本机网页端示例；桌面端使用相同的论文信息和转换步骤。*

1. 填写姓名和标题；老师、课程可选，并确认日期。
2. 拖入 `.docx`、`.txt` 或 `.md` 草稿，也可以点击上传区域选择文件。
3. 点击 **生成 MLA 文档**，然后在结果卡中点 **下载 Word**；页面保持打开时可再次下载。右侧页面是版式示意，下载的 Word 文档中会包含草稿正文。

顶部的 **中文 / English** 可随时切换界面语言，并记住你的选择。高级选项包含页眉姓氏、段落拆分、标题识别和块引用设置，也可直接创建空白 MLA 模板。

macOS 支持 ⌘O 选择文件、⌘Return 转换；Windows/Linux 使用 Ctrl。桌面与 Android 版均在设备上处理文档，转换时无需联网。

Mac 也可以在 Finder 中选择“打开方式 → MLAFMT”，或把草稿拖到 Dock 图标。保存后点 **在 Finder 中显示** 可选中生成文件。

### Android 快速开始

1. 安装 APK 后，填写姓名和论文标题。
2. 点击选择草稿，通过系统文件选择器选入 `.docx`、`.txt` 或 `.md`。
3. 生成后选择保存位置；也可以直接打开或分享给 Word、WPS 等应用。

Android 版不需要账号或广泛的存储权限，仅访问你选择的文件；支持 64 位 ARM 手机和平板，以及 x86_64 模拟器。

支持折叠屏展开、合拢、半折叠与分屏窗口；界面避让折痕，并保留已填信息、草稿和转换结果。

### 自动整理的内容

| 项目 | 输出格式 |
| --- | --- |
| 页面 | Letter 纸张（8.5 × 11 英寸）、1 英寸页边距 |
| 字体与行距 | Times New Roman 12 pt、双倍行距、段前段后 0 pt |
| 首页 | 姓名 / 老师 / 课程 / 日期、居中标题 |
| 页眉 | 右对齐的姓氏与自动页码；支持手动指定姓氏 |
| 正文 | 左对齐、首行缩进 0.5 英寸；保留 Word 草稿中的粗体、斜体、下划线 |
| Works Cited | 另起一页、标题居中、按字母排序、0.5 英寸悬挂缩进 |

在草稿正文后单独写一行 `Works Cited`，下面每段放一条文献。纯文本可用 `*Hamlet*` 表示斜体。草稿已有的姓名和标题可自动去重，高级选项可关闭此功能。

### 从源码运行

需要 Python 3.10+。建议先创建虚拟环境，再安装依赖。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe mla_gui.py
# 本机网页端：http://127.0.0.1:8600
.\.venv\Scripts\python.exe mla_web.py
```

macOS / Linux 使用 `.venv/bin/python`。网页端默认只监听本机；需要同一局域网内的其他设备访问时，运行 `python mla_web.py --lan`。单个草稿大小上限为 20 MiB。

### 使用限制

本工具整理文档版式，不会生成引文、核验引用信息或判断作文是否符合课程要求。图片、表格、脚注、尾注、批注和修订记录不会保留；提交前请检查生成的 Word 文档。日期按 MLA 的英文日月年格式输出。

### 测试、打包与发布

各平台的构建、签名和发布方法见[维护者指南](docs/RELEASING.md)。Windows 构建示例：

```powershell
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q

# Windows 打包使用 Python 3.12 x64 和独立环境
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.3.0
```

`requirements-build.txt` 锁定打包依赖。脚本收集拖放所需的 tkDnD 原生库，将两个下载文件输出至 `dist/release/`：

- `MLAFMT.exe`：独立 Windows 应用。
- `MLAFMT-v2.3.0-windows-x64.zip`：应用、双语说明、更新记录、许可证与构建信息。

ZIP 内的 `build-info.json` 记录源码提交、源码哈希、Python 与依赖版本。不同 Windows / Python 补丁版本构建的二进制不保证逐字节一致。

GitHub Actions 在 push、pull request 和 tag 时测试并构建各平台安装包，上传构建产物（外部 fork 的 pull request 不生成签名 Android 包）；**发布由维护者通过命令行明确创建**。收集同一次成功构建的所有平台文件后，按[维护者指南](docs/RELEASING.md)检查来源、生成校验和并发布。

Release 中的应用是当前发布版本。仓库根目录的旧 `MLAFMT.exe` 已停止跟踪，构建脚本不会使用它。

## English

Turn an essay draft into a Word document with common **MLA 9th edition layout conventions**. Use the desktop app, local web app, Python library, or command line. Chinese and English interface settings are remembered; switching language leaves your essay text unchanged.

### Desktop quick start

1. Download the file for your system and install it as shown above.
2. Enter your name and essay title. Instructor and course are optional; a blank date uses today.
3. Choose or drag in a `.docx`, `.txt`, or `.md` draft, then convert and save.

#### Illustrated: enter details and create a document

![MLAFMT English interface showing paper details, draft upload and MLA preview](docs/images/mlafmt-web-en.png)

*This screenshot shows the local web app; the desktop app uses the same fields and steps.*

1. Enter your name and essay title; instructor and course are optional. Check the date.
2. Drag in a `.docx`, `.txt`, or `.md` draft, or click the upload area to choose a file.
3. Select **Format document**, then **Download Word** in the result card. Download again while the page stays open. The paper on the right is a layout illustration; your draft text appears in the Word document.

Choose **中文 / English** at the top to switch language. Advanced settings include a header surname override, paragraph splitting, heading detection and block quotes. You can also create a blank MLA template.

On macOS, use ⌘O to choose a file and ⌘Return to convert; Windows/Linux use Ctrl. Desktop and Android apps process files on your device and work offline.

On Mac, Finder's **Open With → MLAFMT** and Dock drops also load drafts. After saving, **Show in Finder** selects the generated document.

### Android quick start

1. Install the APK, then enter your name and essay title.
2. Tap to choose a `.docx`, `.txt`, or `.md` draft using the system file picker.
3. Format your paper and choose where to save it, or open/share it with Word, WPS or another document app.

No account or broad storage permissions are required. The app only accesses files you select and supports 64-bit ARM devices and x86_64 emulators.

Foldable and multi-window layouts adapt to available space and avoid separating hinges, while retaining your details, draft and generated document.

### Formatting

| Element | Output |
| --- | --- |
| Page | Letter (8.5 × 11 in), 1-inch margins |
| Typography | Times New Roman 12 pt, double spacing, no paragraph space before/after |
| First page | Name / Instructor / Course / Date, centered title |
| Header | Right-aligned surname and live page number; manual surname override available |
| Body | Left alignment, 0.5-inch first-line indent; DOCX bold, italics and underline preserved |
| Works Cited | New page, centered heading, alphabetical order, 0.5-inch hanging indent |

Put `Works Cited` on its own line after the essay, with one source per paragraph. Use `*Hamlet*` for italics in plain text. Existing heading information can be removed to avoid duplicates; this is configurable in Advanced settings.

### Run from source

Requires Python 3.10+. Create a virtual environment and install the application dependencies:

```bash
python -m venv .venv
# Windows: .venv\Scripts\python.exe
# macOS / Linux: .venv/bin/python
python -m pip install -r requirements.txt
python mla_gui.py
python mla_web.py     # http://127.0.0.1:8600
```

Run these commands with the virtual environment's Python, or activate it first. The web app listens on the local machine by default. Add `--lan` to allow devices on your local network to connect. Each draft may be up to 20 MiB.

### Command line and library

```bash
python mla_formatter.py draft.docx --name "Jane Doe" --title "On Memory" --instructor "Prof. Smith" --course "ENG 101"
python mla_formatter.py --blank --name "Jane Doe" --title "On Memory"
```

```python
from mla_formatter import convert_draft_to_mla

stats = convert_draft_to_mla(
    "draft.txt", "essay.docx", name="Jane Doe", instructor="Prof. Smith",
    course="ENG 101", date_str="", title="On Memory",
)
```

### Limits

MLAFMT handles layout. It does not create citations, verify source details, or assess course requirements. Images, tables, footnotes, endnotes, comments and tracked changes are not preserved. Proofread the generated document before submitting. Dates use the English MLA day-month-year form.

### Test, build and release

See the [maintainer guide](docs/RELEASING.md) for all platforms, Android signing and release validation.

Run `python -m pytest -q` after installing `pytest` and `requirements.txt` in a virtual environment. On Windows, use Python 3.12 x64 for release builds:

```powershell
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.3.0
```

The script installs the locked `requirements-build.txt` into that virtual environment, bundles the tkDnD native libraries and creates the EXE and versioned ZIP in `dist/release/`. The ZIP includes build information for the source commit, source hashes, Python and dependencies. Byte-for-byte identity across operating system or Python patch versions is not guaranteed.

The EXE is the simplest download; the ZIP adds the guides, changelog, license and build information. The old root-level executable is no longer tracked or used by the build.

GitHub Actions tests and uploads platform packages for pushes, pull requests and tags; pull requests from external forks do not produce signed Android packages. Maintainers gather the files from one successful run, verify provenance and publish explicitly as described in the [maintainer guide](docs/RELEASING.md).

## License / 许可证

MIT — see [LICENSE](LICENSE).
