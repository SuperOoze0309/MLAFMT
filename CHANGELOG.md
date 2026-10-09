# Changelog

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
