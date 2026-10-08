# MLAFMT — One-Click MLA Formatter · MLA 一键排版

**English** | [中文](#中文说明)

Turn an essay draft (`.docx`, `.txt` or `.md`) into a correctly formatted **MLA 9th edition** Word document in one click.

<p>
<b>Desktop app</b> (Windows / macOS / Linux) · <b>Web app</b> (any browser, incl. Android) · <b>Python library</b> · <b>CLI</b>
</p>

## What it does

| | |
|---|---|
| Page | 8.5 × 11 in, 1-inch margins, header 0.5 in from top |
| Text | Times New Roman 12 pt everywhere (incl. CJK), double-spaced, 0 pt before/after, left-aligned |
| Header | `LastName 1` flush right, live page number (Jr./Sr./III are skipped automatically) |
| First page | Name / Instructor / Course / Date block, centered title |
| Body | 0.5-inch first-line indent; italic / bold / underline from your draft are **kept** |
| Works Cited | New page, centered heading, alphabetized (ignores *A/An/The* and quotes), hanging indent |

## Quick start

### Windows
Download **MLAFMT.exe** from [Releases](../../releases) and double-click it.

1. Enter your name and essay title
2. Drag in your draft (or click to choose)
3. Click **Convert to MLA**

Click **中文 / English** in the top-right corner to switch language. Rarely-needed settings are under **⚙ Advanced**.

### From source (Python 3.10+)
```bash
pip install -r requirements.txt
python mla_gui.py          # desktop app
python mla_web.py          # web app at http://127.0.0.1:8600  (add --lan to use from your phone)
```

### Command line
```bash
python mla_formatter.py draft.docx --name "Jane Doe" --title "On Memory" --instructor "Prof. Smith" --course "ENG 101"
python mla_formatter.py --blank --name "Jane Doe" --title "On Memory"      # blank template
```

### As a library
```python
from mla_formatter import convert_draft_to_mla
stats = convert_draft_to_mla("draft.txt", "essay.docx", name="Jane Doe", instructor="Prof. Smith",
                             course="ENG 101", date_str="", title="On Memory")   # date "" = today
```

## Writing tips for your draft
- Put a line **`Works Cited`** after your essay, then one source per paragraph — it is moved to a new page, sorted and indented for you. (`Work Cited`, `Bibliography`, `References` are recognised too.)
- In a plain-text draft, write `*Hamlet*` to get *Hamlet* in italics.
- If your draft already starts with your name/title, it is removed so it isn't duplicated (can be turned off in ⚙ Advanced).

## Advanced options (⚙)
Header last-name override · TXT paragraph mode (blank-line / line-by-line) · `*asterisk*` italics · remove duplicate heading · heading detection (experimental) · `>` block quotes · open file after saving.

## Limitations
Images, tables, footnotes, comments and tracked changes are not carried over. Always proofread before submitting.

## Development
```bash
pip install -r requirements.txt pytest
pytest -q
```
Windows EXE is built automatically by GitHub Actions (`.github/workflows/build.yml`) — push a tag like `v2.0.0` to publish a release. Android / macOS build scripts are in `platforms/`.

---

## 中文说明

把英文作文草稿（`.docx` / `.txt` / `.md`）一键变成符合 **MLA 第 9 版** 格式的 Word 文档。

### 怎么用（Windows）
1. 从 [Releases](../../releases) 下载 **MLAFMT.exe**，双击打开
2. 填写 **姓名** 和 **作文标题**（老师、课程可选，日期默认今天）
3. 把草稿拖进窗口，或点击选择文件
4. 点 **转换为 MLA 格式**

右上角可切换 **中文 / English**；不常用的设置都在 **⚙ 高级选项** 里。

### 会自动设置
- Times New Roman 12 号、双倍行距、1 英寸页边距、左对齐
- 右上角“姓 + 页码”（自动忽略 Jr. / III 等后缀）
- 左上角姓名 / 老师 / 课程 / 日期，标题居中
- 正文首行缩进 0.5 英寸，**保留草稿里的斜体、粗体、下划线**
- Works Cited 另起一页、居中标题、按字母排序、悬挂缩进

### 写草稿的小技巧
- 正文后写一行 **`Works Cited`**，下面每段一条参考文献，会自动处理
- 纯文本里用 `*书名*` 表示斜体
- 草稿开头已经写了姓名/标题也没关系，会自动去重

### 注意
图片、表格、脚注、批注不会保留。提交前请自己检查一遍。

## License
MIT — see [LICENSE](LICENSE).
