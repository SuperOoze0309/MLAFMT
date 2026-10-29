# 本地文件互转 / Local file conversion

v2.11.0 source iteration adds a separate PDF / DOCX / DOC conversion page,
`converter.html`, linked from the paper formatter's top navigation.
It does not apply an MLA/APA template, edit your original file, or replace the
paper formatter's current result. This source iteration has not been deployed
to the public website or packaged as a new installer.

## 中文

静态网页版的“文件互转”支持六个方向：DOCX → PDF、DOCX → DOC、
DOC → PDF、DOC → DOCX、PDF → DOCX、PDF → DOC。
从首页顶部点击“PDF / Word 文件互转”，或直接打开 `converter.html`。
独立页面直接显示文件选择与“转换为”选项，无需展开，也不需要填写论文信息。
选取文件，选择目标格式，明确点击转换，再下载结果。文稿内容不上传。
文件上限为 20 MiB；PDF 上限为 200 页，并限制每页解压内容与总文字数。

Word 格式转换使用真正的 LibreOffice WebAssembly 引擎，不是修改扩展名。
转换组件附带开放许可的中文字体；没有原文字体时仍可能发生替换。
第一次 Word 格式转换需要下载较大的程序文件、分配较多内存，建议使用
内存充足的桌面浏览器。PDF → DOCX 只加载较小的本地 Python/PDF 引擎。
页面与 Worker 必须通过 HTTPS 或 localhost 提供，并开启 COOP/COEP；
不支持的浏览器会显示提示。取消会销毁正在运行的引擎实例。

**PDF 转 Word 是文字重建。** 提取出的文字可编辑，插入原 PDF 页间分隔；
图片不导出，原有栏位、表格结构、字体和复杂版式不会还原。扫描 PDF
没有可提取的文字时提示需要 OCR；当前不包含 OCR。部分无文字页面会
留下空白页并给出提醒。加密 PDF 不尝试解密。请核对内容与阅读顺序。

**DOC/DOCX 转换也可能改变版式。** 缺失字体可能被替换，旧版 DOC
不能保留所有现代 Word 功能。请检查页数、表格、公式和页眉页脚。
转换器不执行宏，不更新文档外链；含外部资源的 DOCX 会被拒绝。

桌面源码中从“文件 → PDF / DOCX / DOC 文件互转”打开独立窗口。
PDF 文字重建需要 pypdf，Word 格式转换还需要在本机安装 LibreOffice；
可用 `FORMCAPY_SOFFICE` 指向 `soffice` 可执行文件。没有安装依赖时会
明确提示，不会改用云服务。现有 v2.5.0 安装包不含这个入口。

## English

The independent converter supports all six directions between PDF, DOCX and
Word 97–2003 DOC. Select a file and a different output format, explicitly start
conversion, then download. The static website processes document bytes in the
browser. No conversion API, account or document upload is used.

Word conversion runs the real LibreOffice WASM filters. Its large pinned
runtime loads only after a conversion is requested; use a desktop browser with
ample memory. An open CJK font is included for Chinese text; missing source
fonts can still be substituted. PDF-to-DOCX uses the existing Pyodide worker and pypdf instead.
The page needs HTTPS/localhost and cross-origin isolation (COOP/COEP headers).
The office runtime is excluded from the initial app-shell precache.

PDF-to-Word is editable text reconstruction, with page breaks. It omits images
and does not reconstruct columns, tables, fonts or the original layout. There
is no OCR: image-only documents are rejected with an actionable message, while
partially blank pages are retained and disclosed. Encrypted PDFs are rejected.
Word layouts can also change because of font substitution and legacy DOC
feature limits. Always review the result.

Input files are bounded at 20 MiB. PDF processing is limited to 200 pages,
bounded page content and bounded extracted text. Source files are not changed.
Changing the input or output format invalidates the previous download. Cancel
terminates the active engine and late results cannot replace a later result.

The native source app exposes the same conversion routes through its File
menu. It uses local pypdf and an installed LibreOffice executable. Set
`FORMCAPY_SOFFICE` if LibreOffice is outside its usual installation path;
`FORMCAPY_TEMP_DIR` can select a local work directory. No cloud fallback exists.

## Build and engine provenance

Run the existing static builder from the repository root:

```powershell
.venv\Scripts\python.exe scripts/build_browser_static.py --out dist/formcapy-v2.11.0-preview
```

The office preparer verifies the snapshot pinned in `browser/office-runtime.json`
and splits large WASM/data resources below the hosting file limit. Conversion
program files are served from the same origin as the app. The generated
`runtime/office/runtime.json` and `licenses/office/` record provenance, hashes,
original license texts and source links. Keep these with the build.

The generated `_headers` includes `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. A generic `python -m http.server`
does not set these headers and cannot run the office engine. Use the local
preview script described in the verification record.

See [LibreOffice/ZetaJS](https://github.com/allotropia/zetajs),
[UNO document loading](https://api.libreoffice.org/docs/idl/ref/structcom_1_1sun_1_1star_1_1document_1_1MediaDescriptor.html),
and [pypdf text extraction limits](https://pypdf.readthedocs.io/en/stable/user/extract-text.html).
