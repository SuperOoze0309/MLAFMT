# MLAFMT · MLA 一键排版

[中文](#中文) · [English](#english) · [下载 / Downloads](https://github.com/SuperOoze0309/MLAFMT/releases/latest)

把 `.docx`、`.txt` 或 `.md` 作文草稿整理为 MLA 第 9 版常用版式的 Word 文档。桌面端与网页端均支持中文 / English 切换；界面语言不会翻译或改写你的作文。

## 中文

### Windows 快速开始

1. 从 [最新版本](https://github.com/SuperOoze0309/MLAFMT/releases/latest) 下载 `MLAFMT.exe`，或解压 `MLAFMT-v2.1.0-windows-x64.zip`。
2. 双击打开，填写姓名、作文标题；老师和课程可选，日期留空会使用今天。
3. 拖入草稿，或点击选择文件，然后转换并保存 `.docx`。

顶部的 **中文 / English** 可随时切换界面语言，并记住你的选择。高级选项包含页眉姓氏、段落拆分、标题识别和块引用设置，也可直接创建空白 MLA 模板。

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

### 测试、Windows 打包与发布

```powershell
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q

# Windows 打包使用 Python 3.12 x64 和独立环境
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.1.0
```

`requirements-build.txt` 锁定打包依赖。脚本生成应用图标与版本信息，收集拖放所需的 tkDnD 原生库，输出至 `dist/release/`：

- `MLAFMT.exe`：独立 Windows 应用。
- `MLAFMT-v2.1.0-windows-x64.zip`：应用、双语说明、更新记录、许可证与构建信息。
- `SHA256SUMS.txt`：EXE、ZIP 和构建信息的 SHA-256 校验和。
- `build-info.json`：源码提交、源码哈希、Python 与依赖版本。

校验下载文件可运行 `Get-FileHash .\MLAFMT.exe -Algorithm SHA256`，与 `SHA256SUMS.txt` 对照。记录的构建环境便于复现；不同 Windows / Python 补丁版本构建的二进制不保证逐字节一致。

GitHub Actions 在 push、pull request 和 tag 时测试并构建，上传构建产物；**发布由维护者通过命令行明确创建**。确认测试、构建和试运行通过后：

```powershell
git push origin main
git tag v2.1.0
git push origin v2.1.0
gh release create v2.1.0 --verify-tag --title "MLAFMT v2.1.0" --notes-file build/windows/release-notes.md dist/release/MLAFMT.exe dist/release/MLAFMT-v2.1.0-windows-x64.zip dist/release/SHA256SUMS.txt dist/release/build-info.json
```

Release 中的应用是当前发布版本。仓库根目录的旧 `MLAFMT.exe` 已停止跟踪，构建脚本不会使用它。

## English

Turn an essay draft into a Word document with common **MLA 9th edition layout conventions**. Use the desktop app, local web app, Python library, or command line. Chinese and English interface settings are remembered; switching language leaves your essay text unchanged.

### Windows quick start

1. Download `MLAFMT.exe` or `MLAFMT-v2.1.0-windows-x64.zip` from the [latest release](https://github.com/SuperOoze0309/MLAFMT/releases/latest).
2. Open the app and enter your name and essay title. Instructor and course are optional; a blank date uses today.
3. Choose or drag in a `.docx`, `.txt`, or `.md` draft, then convert and save.

Choose **中文 / English** at the top to switch language. Advanced settings include a header surname override, paragraph splitting, heading detection and block quotes. You can also create a blank MLA template.

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

Run `python -m pytest -q` after installing `pytest` and `requirements.txt` in a virtual environment. On Windows, use Python 3.12 x64 for release builds:

```powershell
py -3.12 -m venv .venv-build
.\scripts\build_windows.ps1 -PythonPath .\.venv-build\Scripts\python.exe -InstallDependencies -ExpectedVersion 2.1.0
```

The script installs the locked `requirements-build.txt` into that virtual environment, bundles the tkDnD native libraries, embeds the source version and app icon, and creates the EXE, versioned ZIP, `SHA256SUMS.txt` and `build-info.json` in `dist/release/`. Build information records the commit, source hashes, Python and dependencies. This makes the process repeatable; byte-for-byte identity across operating system or Python patch versions is not guaranteed.

Compare `Get-FileHash .\MLAFMT.exe -Algorithm SHA256` with the checksum manifest to verify a download. Executables are distributed through GitHub Releases. The old root-level executable is no longer tracked or used by the build.

GitHub Actions tests and uploads build artifacts for pushes, pull requests and tags. It does not create releases. Maintainers push the verified source and version tag, then explicitly run `gh release create` with `--verify-tag`, `--notes-file build/windows/release-notes.md` and the four release assets, as shown above.

## License / 许可证

MIT — see [LICENSE](LICENSE).
