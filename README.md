# FormCapy · 论文与报告排版

<img src="static/capybara-64.png" alt="FormCapy 水豚吉祥物 / capybara mascot" width="64" height="64" />

[中文](#中文) · [English](#english) · [版式 / Formats](docs/FORMATS.md) · [下载 / Downloads](https://github.com/SuperOoze0309/MLAFMT/releases/latest)

把 `.docx`、`.txt` 或 `.md` 作文草稿整理为 MLA 第 9 版常用版式的 Word 文档。桌面端与网页端均支持中文 / English 切换；界面语言不会翻译或改写你的作文。

> **v2.4.0 开发中 / v2.4.0 in development.** 当前源码新增 **APA 7 学生论文**、**自定义课程模板与页码高级定制**、**DOCX 指定段落保持原格式**及正文图片和表格保留。下方正式下载和截图仍对应 v2.3.0；新版用法见[版式与模板说明](docs/FORMATS.md)。
>
> Current source adds **APA 7 student papers**, **custom course templates with advanced page numbering**, **selected DOCX paragraph formatting**, and retention of body images and tables. The published downloads and screenshots below are still v2.3.0. See the [format guide](docs/FORMATS.md) for the new workflow.

应用显示名为 **FormCapy**，GitHub 仓库与源码项目名称保持 **MLAFMT**。开发版使用水豚吉祥物，计划域名为 `formcapy.com`（尚未部署）。下方 v2.3.0 下载与截图保留当时的 MLAFMT 名称。见[形象说明 / Branding](docs/BRANDING.md)。

The application's display name is **FormCapy**; the GitHub repository and source project remain **MLAFMT**. The development version uses a capybara mascot, with `formcapy.com` planned but not deployed. The v2.3.0 downloads and screenshots below retain their historical MLAFMT name. See [Branding](docs/BRANDING.md).

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

## v2.4.0 开发中的功能 / v2.4.0 in development

源码开发版提供三种选择：**MLA 9 / APA 7 学生论文 / 自定义课程模板**。

- **APA 7 学生论文**：选择格式后填写学校/院系、课程、教师和截止日期；自动生成独立标题页、正文标题、页码和新页 References。保留 DOCX Heading 1–3 和 Markdown `#`–`###` 的标题层级；标题大小写保持原文，请按课程要求核对。
- **自定义课程模板**：选择该格式，打开模板设置，调整老师要求的纸张、字体、行距和页边距，再保存为命名模板；下次直接选择使用。桌面和网页可导入/导出 JSON 文件，Android 可复制/粘贴同一份 JSON。
- **高级定制**：模板设置的二级入口可调整页码位置（右上、页脚居中或页脚右侧）、起始数字（1–9999）和封面是否显示页码。默认右上、从 1 开始、封面显示；隐藏封面页码时，正文第一页从所设数字开始。
- **指定段落保持原格式**：读取 DOCX 后可多段勾选、全选、清空，或输入 `2, 4-6` 等编号范围；保留所选段落的字体、字号和段落格式。选择仅用于当前草稿，不进入课程模板；换稿清空，检测到源文件变更时需重新读取段落。
- **正文对象保留**：从源 DOCX 包保留正文图片和表格；表格整体保留，不逐段勾选。纸张、页边距、页码及源分节、页眉和页脚按所选模板重建，原分页位置可能改变。TXT/MD 图片语法不会嵌入图片。
- **课程报告示例**：[A4 模板](examples/course-report-a4.json) 使用 Arial 11 pt、1.5 倍行距和 2.5 cm 页边距；页码在页脚居中，封面不编号，正文从 1 开始。可导入后修改；它是示例，不代表任何学校规范。

三种格式共用同一排版核心，桌面、本地网页和离线 Android 的规则一致。参考文献内容保持原文，版式和完整字段说明见[格式指南](docs/FORMATS.md)。

APA 官方参考：[Paper format](https://apastyle.apa.org/style-grammar-guidelines/paper-format) · [Title page](https://apastyle.apa.org/style-grammar-guidelines/paper-format/title-page)。

## 中文

### 桌面快速开始

以下步骤适用于 v2.3.0 安装包，展示 MLA 9 流程。

1. 下载与你的系统对应的文件，按上表安装并打开。
2. 填写姓名、作文标题；老师和课程可选，日期留空会使用今天。
3. 拖入草稿，或点击选择文件，然后转换并保存 `.docx`。

#### 图示：填写信息并生成文档

![MLAFMT 中文界面：论文信息、草稿上传和 MLA 版式预览](docs/images/mlafmt-web-zh.png)

*图为 v2.3.0 本机网页端示例；桌面端使用相同的论文信息和转换步骤。*

1. 填写姓名和标题；老师、课程可选，并确认日期。
2. 拖入 `.docx`、`.txt` 或 `.md` 草稿，也可以点击上传区域选择文件。
3. 点击 **生成 MLA 文档**，然后在结果卡中点 **下载 Word**；页面保持打开时可再次下载。右侧页面是版式示意，下载的 Word 文档中会包含草稿正文。

顶部的 **中文 / English** 可随时切换界面语言，并记住你的选择。高级选项包含页眉姓氏、段落拆分、标题识别和块引用设置，也可直接创建空白 MLA 模板。

macOS 支持 ⌘O 选择文件、⌘Return 转换；Windows/Linux 使用 Ctrl。桌面与 Android 版均在设备上处理文档，转换时无需联网。

Mac 也可以在 Finder 中选择“打开方式 → MLAFMT”，或把草稿拖到 Dock 图标。保存后点 **在 Finder 中显示** 可选中生成文件。

### Android 快速开始

以下步骤对应 v2.3.0 APK。

1. 安装 APK 后，填写姓名和论文标题。
2. 点击选择草稿，通过系统文件选择器选入 `.docx`、`.txt` 或 `.md`。
3. 生成后选择保存位置；也可以直接打开或分享给 Word、WPS 等应用。

Android 版不需要账号或广泛的存储权限，仅访问你选择的文件；支持 64 位 ARM 手机和平板，以及 x86_64 模拟器。

支持折叠屏展开、合拢、半折叠与分屏窗口；界面避让折痕，并保留已填信息、草稿和转换结果。

### MLA 9 自动整理的内容（v2.3.0）

| 项目 | 输出格式 |
| --- | --- |
| 页面 | Letter 纸张（8.5 × 11 英寸）、1 英寸页边距 |
| 字体与行距 | Times New Roman 12 pt、双倍行距、段前段后 0 pt |
| 首页 | 姓名 / 老师 / 课程 / 日期、居中标题 |
| 页眉 | 右对齐的姓氏与自动页码；支持手动指定姓氏 |
| 正文 | 左对齐、首行缩进 0.5 英寸；保留 Word 草稿中的粗体、斜体、下划线 |
| Works Cited | 另起一页、标题居中、按字母排序、0.5 英寸悬挂缩进 |

在草稿正文后单独写一行 `Works Cited`，下面每段放一条文献。纯文本可用 `*Hamlet*` 表示斜体。草稿已有的姓名和标题可自动去重，高级选项可关闭此功能。MLA 默认日期使用英文日月年格式；手动填写的日期文字保持原样。

### APA 7 学生版式与自定义模板（v2.4.0 开发中）

APA 7 学生版式、自定义课程模板及其字段、边界、JSON 示例见 [docs/FORMATS.md](docs/FORMATS.md)。

在模板设置中打开 **高级定制** 调整页码；在 **高级选项 → 指定段落保持原格式** 中读取 Word 段落，再勾选或填写编号范围。编号对应源 DOCX 正文段落位置，空段不显示，编号可能有间隔。所选段落保留原字体、字号、行距和缩进等段落格式；页面布局仍按当前模板。Android 旋转或折叠重建界面时会恢复同一草稿的选择。

参考文献中含保留原格式的段落或对象时，仅对连续、安全的普通条目排序，并提示人工核对顺序；引用内容保持原文。

### 从源码运行

当前源码版本为 v2.4.0 开发版，正式下载仍为 v2.3.0。

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

本工具只整理版式，不生成或核验引文，也不判断作文是否符合课程要求。

- **APA 参考文献**：References 按完整条目的起始文本排序；含保留段落或对象时，仅对连续、安全的普通条目排序，并提示核对顺序。不解析或改写文内引用或文献内容，也不实现复杂的同作者、同年份书目排序。不提供专业论文 running head 或作者注。
- **自定义模板**：仅支持字段表中的布局项。没有账号或云同步；导出的 JSON 只含布局设置，不含文档。
- **DOCX 转换（v2.4.0 源码）**：保留源包中的正文图片和表格；所选段落保留字体、字号和段落格式。源分节、页眉和页脚会被模板设置替换，原页眉页脚中的图片不属于正文图片保留范围，原分页也可能改变。复杂对象、修订及异常结构请对照原稿核对；部分结构和高于 3 级的标题会出现结果提示，这不等于完整文档检查。
- **TXT/MD**：图片链接或图片语法不会自动嵌图；代码围栏只作为文字保留。段落保留选择仅支持 DOCX，表格整体保留且不提供表格内逐段选择。
- 网页目前由电脑提供本地预览，iPhone/iPad 通过同一局域网访问。教师或学校要求优先于预设。

### 测试、打包与发布

各平台的构建、签名和发布方法见[维护者指南](docs/RELEASING.md)。Windows 构建示例：

```powershell
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q

# Windows 打包使用 Python 3.12 x64 和独立环境
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.4.0
```

`requirements-build.txt` 锁定打包依赖。脚本收集拖放所需的 tkDnD 原生库，将两个下载文件输出至 `dist/release/`：

- `MLAFMT.exe`：独立 Windows 应用。
- `MLAFMT-v2.4.0-windows-x64.zip`：当前源码构建的应用、双语说明、更新记录、许可证与构建信息。

ZIP 内的 `build-info.json` 记录源码提交、源码哈希、Python 与依赖版本。不同 Windows / Python 补丁版本构建的二进制不保证逐字节一致。

GitHub Actions 在 push、pull request 和 tag 时测试并构建各平台安装包，上传构建产物（外部 fork 的 pull request 不生成签名 Android 包）；**发布由维护者通过命令行明确创建**。收集同一次成功构建的所有平台文件后，按[维护者指南](docs/RELEASING.md)检查来源、生成校验和并发布。

Release 中的应用是当前发布版本。仓库根目录的旧 `MLAFMT.exe` 已停止跟踪，构建脚本不会使用它。

## English

Turn an essay draft into a Word document with common **MLA 9th edition layout conventions**. Use the desktop app, local web app, Python library, or command line. Chinese and English interface settings are remembered; switching language leaves your essay text unchanged.

### Desktop quick start

These steps describe the v2.3.0 packages and the MLA 9 workflow.

1. Download the file for your system and install it as shown above.
2. Enter your name and essay title. Instructor and course are optional; a blank date uses today.
3. Choose or drag in a `.docx`, `.txt`, or `.md` draft, then convert and save.

#### Illustrated: enter details and create a document

![MLAFMT English interface showing paper details, draft upload and MLA preview](docs/images/mlafmt-web-en.png)

*This v2.3.0 screenshot shows the local web app; the desktop app uses the same fields and steps.*

1. Enter your name and essay title; instructor and course are optional. Check the date.
2. Drag in a `.docx`, `.txt`, or `.md` draft, or click the upload area to choose a file.
3. Select **Format document**, then **Download Word** in the result card. Download again while the page stays open. The paper on the right is a layout illustration; your draft text appears in the Word document.

Choose **中文 / English** at the top to switch language. Advanced settings include a header surname override, paragraph splitting, heading detection and block quotes. You can also create a blank MLA template.

On macOS, use ⌘O to choose a file and ⌘Return to convert; Windows/Linux use Ctrl. Desktop and Android apps process files on your device and work offline.

On Mac, Finder's **Open With → MLAFMT** and Dock drops also load drafts. After saving, **Show in Finder** selects the generated document.

### Android quick start

These steps describe the v2.3.0 APK.

1. Install the APK, then enter your name and essay title.
2. Tap to choose a `.docx`, `.txt`, or `.md` draft using the system file picker.
3. Format your paper and choose where to save it, or open/share it with Word, WPS or another document app.

No account or broad storage permissions are required. The app only accesses files you select and supports 64-bit ARM devices and x86_64 emulators.

Foldable and multi-window layouts adapt to available space and avoid separating hinges, while retaining your details, draft and generated document.

### MLA 9 formatting (v2.3.0)

| Element | Output |
| --- | --- |
| Page | Letter (8.5 × 11 in), 1-inch margins |
| Typography | Times New Roman 12 pt, double spacing, no paragraph space before/after |
| First page | Name / Instructor / Course / Date, centered title |
| Header | Right-aligned surname and live page number; manual surname override available |
| Body | Left alignment, 0.5-inch first-line indent; DOCX bold, italics and underline preserved |
| Works Cited | New page, centered heading, alphabetical order, 0.5-inch hanging indent |

Put `Works Cited` on its own line after the essay, with one source per paragraph. Use `*Hamlet*` for italics in plain text. Existing heading information can be removed to avoid duplicates; this is configurable in Advanced settings. Default MLA dates use the English day-month-year form; manually entered date text is kept as written.

### APA 7 student layout and custom templates (v2.4.0 in development)

- **APA 7 student layout:** select the format and enter your school/department, course, instructor and due date. It creates a title page, repeated body title, page numbers and a new References page. DOCX Heading 1–3 and Markdown `#`–`###` retain their heading levels; title and heading capitalization stays as written, so check it against course requirements.
- **Custom course templates:** choose this format, adjust your instructor's paper, font, spacing and margin requirements, then save a named template for next time. Desktop and web import/export JSON files; Android can copy/paste the same JSON text. Each interface keeps its settings locally.
- **Advanced customization:** open the second-level template settings to choose top right, bottom center or bottom right page numbers, a starting number from 1–9999, and whether the cover has a number. Defaults are top right, start at 1 and show the cover number. With the cover number hidden, the first body page starts at the chosen number.
- **Keep selected paragraph formatting:** read a DOCX and select multiple paragraphs, select all, clear, or enter ranges such as `2, 4-6`. Selected paragraphs retain their fonts, sizes and paragraph formatting. Choices apply only to the current draft and are excluded from course templates; changing drafts clears them, and changed source bytes require reading the paragraphs again.
- **Retain body objects:** preserve body images and tables from the source DOCX package. Tables are retained as whole objects, without paragraph-by-paragraph selection inside them. Paper size, margins, numbering, source sections, headers and footers are rebuilt for the chosen template; original pagination may change. TXT/MD image syntax does not embed images.
- **Course report example:** import the [A4 template](examples/course-report-a4.json), which uses Arial 11 pt, 1.5 spacing and 2.5 cm margins, with bottom-center page numbers, an unnumbered cover and body numbering starting at 1. Adjust this example for your course; it is not an institution's standard.

All three layouts share the same core on desktop, local web and offline Android. Reference text is unchanged. See the [format guide](docs/FORMATS.md) for layout rules, fields and transfer instructions.

Open **Advanced customization** inside template settings for numbering. Under **Advanced options → Keep selected paragraphs unchanged**, read the Word paragraphs and select them or enter number ranges. IDs follow paragraph positions in the source DOCX body; empty paragraphs are hidden, so numbers may have gaps. Selected paragraphs keep fonts, sizes, spacing and indentation while page layout follows the template. Android restores the same draft's selections after rotation or folding recreates the interface.

When references contain preserved paragraphs or objects, only consecutive safe ordinary entries are sorted. A result message asks you to check the reference order manually.

### Run from source

Current source is the v2.4.0 development version; published downloads are still v2.3.0.

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
python mla_formatter.py draft.docx --format apa --name "Jane Doe" --title "On Memory" --affiliation "Department, University"
python mla_formatter.py draft.docx --format custom --profile examples/course-report-a4.json --name "Jane Doe" --title "Course Report"
```

```python
from mla_formatter import convert_draft

stats = convert_draft(
    "draft.txt", "essay.docx", name="Jane Doe", instructor="Prof. Smith",
    course="ENG 101", date_str="", title="On Memory", format_id="apa",
    affiliation="Department, University",
)
```

### Limits

MLAFMT handles layout only. It does not create or verify citations, or assess whether a paper meets course requirements.

- **APA references:** References are sorted by each complete entry's initial text. With preserved paragraphs or objects, only consecutive safe ordinary entries are sorted, with a message to check the order. MLAFMT does not parse or rewrite in-text citations or reference content, and does not implement complex same-author/year bibliographic ordering. No professional-paper running head or author note is produced.
- **Custom templates:** only the listed layout fields are supported. There is no account or cloud sync, and exported JSON contains layout settings only, not documents.
- **DOCX conversion (v2.4.0 source):** retains body images and tables from the source package, plus fonts, sizes and paragraph formatting in selected paragraphs. Template settings replace source sections, headers and footers; images in original headers/footers are outside body-image retention, and pagination may change. Compare complex objects, revisions and unusual structures with the original. Warnings about some structures or headings above level 3 are not a complete document check.
- **TXT/MD:** image links and syntax do not automatically embed images; fenced code is retained as text only. Paragraph selection requires DOCX. Tables are kept whole, without selections for individual paragraphs inside them.
- The web app currently runs as a local preview on the computer, with iPhone/iPad access over the same LAN. Instructor or institution requirements take priority over presets.

### Test, build and release

See the [maintainer guide](docs/RELEASING.md) for all platforms, Android signing and release validation.

Run `python -m pytest -q` after installing `pytest` and `requirements.txt` in a virtual environment. On Windows, use Python 3.12 x64 for release builds:

```powershell
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.4.0
```

The script installs the locked `requirements-build.txt` into that virtual environment, bundles the tkDnD native libraries and creates the EXE and versioned ZIP in `dist/release/`. The ZIP includes build information for the source commit, source hashes, Python and dependencies. Byte-for-byte identity across operating system or Python patch versions is not guaranteed.

The EXE is the simplest download; the ZIP adds the guides, changelog, license and build information. The old root-level executable is no longer tracked or used by the build.

GitHub Actions tests and uploads platform packages for pushes, pull requests and tags; pull requests from external forks do not produce signed Android packages. Maintainers gather the files from one successful run, verify provenance and publish explicitly as described in the [maintainer guide](docs/RELEASING.md).

## License / 许可证

项目源码采用 MIT 许可证，见 [LICENSE](LICENSE)；项目许可证不替代各项依赖的许可证。

Project source is licensed under MIT; see [LICENSE](LICENSE). The project license does not replace dependency licenses.

v2.4.0 构建会生成 `THIRD-PARTY-NOTICES.txt`、原始许可文本与依赖清单。桌面应用的 **帮助 → 第三方许可证** 可查看声明；附带对应源码包的 Windows 构建可通过 **保存对应源码…** 导出。许可与构建材料说明见[依赖分发说明](docs/DEPENDENCIES.md)。这些改动尚未补入上方的 v2.3.0 下载文件。

v2.4.0 builds generate full third-party notices, original license texts and a dependency inventory. Use **Help → Third-party licenses** to read the notices; Windows builds carrying a corresponding source kit also offer **Save corresponding source…**. See [dependency distribution notes](docs/DEPENDENCIES.md). The v2.3.0 downloads above do not yet include these corrections.
