# Changelog

## v2.3.0 — 2026-10-20

### 中文

- Mac 支持 Finder“打开方式”和把草稿拖到 Dock 图标；保存或转换期间收到的新草稿会等待当前操作完成。
- 接入 macOS 原生退出、重新激活和偏好设置操作，菜单显示 Command 快捷键；生成后可在 Finder 中选中文档。
- Mac 安装包加入可双击的中英双语安装说明，并检查最终 DMG 中的应用、文档、文件关联和签名。
- 网页生成后保留 Word 下载入口，可再次下载；支持时提供点击触发的系统分享，并补充 iPhone/iPad 保存说明与试用示例。
- 本地网页预览打印同一 Wi-Fi 下的访问地址，支持自定义端口；iPhone/iPad 此阶段使用本地网页预览。
- 增加经审阅的 Apple 设备指南，说明 Pages 导入方式与实际签名状态。Mac 版本仍未经过 Apple 公证。

### English

- Open Mac drafts from Finder's Open With menu or by dropping them on the Dock icon; incoming files wait during save dialogs or conversion.
- Handle native Quit, Reopen and Preferences actions, show Command shortcuts and reveal generated documents in Finder.
- Include a double-clickable bilingual Mac installation guide and inspect the final DMG's app, documentation and signature.
- Keep a reusable Word download link, offer file sharing when supported, and add iPhone/iPad save guidance and an editable sample.
- Print same-network addresses for local web preview and allow a custom port; iPhone/iPad support is a local web preview at this stage.
- Add a reviewed Apple device guide covering Pages import and actual signing status. Mac builds remain not Apple-notarized.

## v2.2.0 — 2026-10-13

### 中文

- 新增 macOS 14+ 的 Apple silicon / Intel DMG，以及 Linux x64 AppImage / 便携 tar.gz。
- 新增 Android 7+ 的 64 位离线 APK，使用系统文件选择器导入草稿，保存、打开和分享生成的 Word 文档。
- 适配折叠屏展开、合拢、半折叠和分屏窗口；避让折痕并保留填写信息、草稿和转换结果。
- 所有平台复用同一 MLA 排版核心；保持 Works Cited 新页、双倍行距、页码和悬挂缩进规则。
- 适配各桌面系统的设置目录、滚轮和 macOS 快捷键；构建时验证实际打包的拖放库和文档转换。
- 增加各平台构建与测试流程、固定 Android 发布签名、依赖版本和下载校验和。
- README 加入中英文实际界面截图，并用简明平台下载表组织 Release。
- macOS 包使用临时签名，尚未经过 Apple 公证；首次打开可能需要系统确认。

### English

- Add macOS 14+ DMGs for Apple silicon and Intel, plus Linux x64 AppImage and portable tar.gz packages.
- Add a fully offline 64-bit Android 7+ APK with system draft selection, document saving, opening and sharing.
- Adapt foldable and multi-window layouts, avoid separating hinges and retain paper details, drafts and generated documents.
- Share the same MLA engine across platforms, including a new Works Cited page, double spacing, page fields and hanging indents.
- Adapt desktop settings locations, scrolling and macOS shortcuts; verify the bundled drag-and-drop library and actual conversion.
- Add platform build/test jobs, a stable Android release signature, locked dependencies and download checksums.
- Add bilingual interface screenshots to the README and simplify Releases with a platform download table.
- macOS builds are ad-hoc signed and not Apple-notarized; first launch may require system confirmation.

## v2.1.1 — 2026-10-12

### 下载 / Download

- [Windows 应用 / Windows app: MLAFMT.exe](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.1.1/MLAFMT.exe) — 下载后双击运行 / Download and double-click to run.
- [便携 ZIP / Portable ZIP](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.1.1/MLAFMT-v2.1.1-windows-x64.zip) — 含说明文件 / Includes guides.

### 中文

- 修正单条文献时的 Works Cited 标题，并确保论文标题不使用粗体。
- 简化下载选择：直接运行 `MLAFMT.exe`，或下载包含说明文档的 ZIP。

### English

- Fix MLA formatting for one-entry Works Cited lists and paper titles.
- Simplify downloads: use `MLAFMT.exe` or the portable ZIP with documentation.

## v2.1.0 — 2026-10-08

### 中文

- 更新桌面与网页界面，采用暖纸白与深靛蓝配色，让草稿选择、资料填写和转换操作更清晰。
- 顶部提供中文 / English 切换，并记住语言选择；切换界面语言不改写作文内容。
- 完善文档格式说明、文件选择状态与操作反馈，保留高级排版选项和空白模板功能。
- 加入随信息变化的纸张布局示意、后台排版、打开结果入口，以及损坏设置文件的恢复处理。
- 修复 Word 超链接文字和继承斜体等强调丢失；收紧抬头去重，避免误删正文。
- 禁止转换覆盖原稿，并采用原子保存，写入失败时保留已有输出文件。
- 恢复迁移前保存的 v2.0.0 源码，让此版本的排版、网页端与测试功能进入正式发布。
- 新增独立 Windows 构建脚本、锁定依赖、应用图标、版本资源、构建信息和 SHA-256 校验和。
- GitHub Actions 测试并上传构建产物；Release 由命令行明确创建，避免自动发布竞争。
- Windows EXE 通过 Release 分发，停止在 Git 中跟踪旧的根目录二进制；更新双语使用与发布说明。

### English

- Refresh the desktop and web interfaces with warm paper and indigo colors, clearer draft selection, paper details and conversion controls.
- Provide a visible Chinese / English switch and remember the selected language without changing essay content.
- Improve formatting guidance, file selection status and action feedback while retaining advanced layout settings and blank templates.
- Add a live paper layout illustration, background conversion, result-opening controls and recovery from invalid settings.
- Keep visible Word hyperlink text and inherited emphasis; detect duplicate headings without deleting matching body text.
- Prevent conversion from overwriting the original draft and save atomically to protect existing output when writing fails.
- Restore the saved v2.0.0 migration source so its formatter improvements, web app and automated tests reach a public release.
- Add an isolated Windows build script, locked dependencies, app icon, version resources, build metadata and SHA-256 checksums.
- Let GitHub Actions test and upload build artifacts, with explicit command-line release creation to avoid competing publishers.
- Distribute Windows executables through Releases, stop tracking the stale root binary, and update the bilingual usage and release guide.

## v2.0.0

### New
- **Redesigned, simpler UI** — home screen explains what the tool does and shows only 3 steps; rarely-used settings moved to a secondary **⚙ Advanced** window / menu.
- **Chinese / English interface** (desktop + web), auto-detected, switchable, remembered.
- **Web app** (`mla_web.py`) with the same design, mobile-friendly, dark mode.
- Italic / bold / underline from `.docx` drafts are now **kept** (titles of works stay italic).
- `*asterisk*` italics for `.txt` / `.md` drafts; `.md` input supported.
- Removes a heading block the draft already contains (no duplicate name/title).
- Blank date = today; app remembers your name / instructor / course.
- Command-line interface: `python mla_formatter.py draft.docx --name … --title …`.
- 28 automated tests (`test_mla_formatter.py`); GitHub Actions builds the Windows EXE.

### Fixed
- Hard-wrapped `.txt` lines became line breaks inside paragraphs → now joined.
- Empty line at the top of the Works Cited page → uses "page break before".
- Header showed "Jr." for names like "Mary Smith Jr." → suffixes skipped.
- Works Cited sorting wrong for entries starting with quotes (`"The …"`).
- Word showed an "update fields?" prompt on open → page field now has a cached value.
- Theme fonts could override Times New Roman in some Word versions.
- GBK / UTF-16 encoded `.txt` files failed to open.
- Drag-and-drop broke on paths containing commas or spaces.
- Web: server listened on all network interfaces by default (now local only, `--lan` to opt in); concurrent requests could overwrite each other's files; no upload size limit.
- Android: wrapper imported a non-existent Kivy WebView and lacked the INTERNET permission.

## v1.0.0

Initial public release.
