# 独立参考文献助手 / Citation assistant

状态：**v2.9.0 静态网页版已上线，支持批量 DOI、勾选追加与离线书目导入。** 451 项 Node、228 项 Python 及 159 项子检查、31 项本地真实浏览器检查通过；正式网站另有 19 项浏览器检查及实际 MLA／APA Word 下载核对。见[测试范围](TESTING-v2.9.md)与[部署记录](DEPLOYMENT.md)；离线下载仍为 v2.5.0。

Status: **v2.9.0 is live on the static website, with DOI batches, selective append and offline import.** Local acceptance and 19 public-browser checks passed; actual local and public MLA/APA Word downloads were independently checked. See [test scope](TESTING-v2.9.md) and [deployment record](DEPLOYMENT.md). Offline downloads remain v2.5.0.

---

源码 v2.10.0 新增本地搜索／筛选和通用书目导出，本地验收已完成；[验收范围](TESTING-v2.10.md)与[公开部署状态](DEPLOYMENT.md)分开记录。

Source v2.10.0 adds local search/filtering and portable bibliography export.
Local acceptance has passed; see [verification scope](TESTING-v2.10.md) and
the separately recorded [public deployment status](DEPLOYMENT.md).

## 1. 用途与边界 / Purpose and scope

中文：

- 该助手只生成一份**独立的参考文献表**。现有论文、论文信息、正文、文中引用和生成结果不会被改写。
- 当前只支持 **MLA 9** 和 **APA 7**，以及 **book / article-journal / webpage** 三类来源。
- 不生成文中引用，不替换论文中的引用，不支持 GB/T 7714 或其他样式。
- 支持在本地粘贴或导入 BibTeX、RIS、CSL-JSON。点击“查询 DOI”才连接 Crossref 获取这一条 DOI 的公开书目信息；核对后追加，缺项不编造。没有 AI、转换服务器、账户或云端书库。
- 标签会随界面语言翻译；用户输入的标题、姓名、机构名等**不会被翻译或自动改写**。

English:

- The assistant creates a **standalone reference list only**. It does not rewrite the paper, paper details, body text, in-text citations, or generated results.
- It currently supports **MLA 9** and **APA 7**, and the source types **book / article-journal / webpage**.
- It does not create in-text citations, replace citations in a paper, or support GB/T 7714 or other styles.
- Paste or import BibTeX, RIS or CSL-JSON locally. Only **Look up DOI** contacts Crossref for that DOI's public metadata; review before appending. Missing fields are never invented. There is no AI, conversion server, account or cloud library.
- UI labels are translated; user-entered titles, names, and organization names are **not translated or automatically rewritten**.

## 2. 快速使用 / Quick start

中文：

1. 展开页面中的“参考文献助手”。
2. 在“快速添加”逐行粘贴 DOI 或 doi.org 链接（最多 50 行），明确点击联网查询；或切换“离线导入”，粘贴／选择 `.bib`、`.ris`、`.json` 文件。先核对候选条目、缺项和重复数，勾选需要的结果，再点击“追加到文献库”。追加保留原条目，并可整批撤销。没有结构化书目信息时仍可手动录入。
3. 添加作者；每个作者可以选“个人作者”（姓/名）或“机构/团体作者”。作者按列表顺序保存。
4. 填写可用的出版日期；允许只填年或年+月。网页可填写访问日期。
5. 按类型填写出版社、期刊/网站名称、卷/期/页码、版次、DOI、网址、语言等。
6. 选择 MLA 9 或 APA 7，再点击“预览文献表”。预览在浏览器本地生成；程序资源由本站提供，也可从已完成的离线缓存读取。
7. 预览刷新后可复制纯文本/带格式文本或下载独立 HTML。需要 Word 时，点击“下载 Word 文献表”，准备完成后再点击助手内显示的文件名链接。
8. 可选：点击“保存到本设备”保留文献库，或用“下载库 JSON”保存为文件；两者都是单独动作，不会自动发生。

Word 准备期间可点击“取消 Word 生成”；当前条目和仍有效的预览会保留，随后可以立即重试。生成期间编辑条目或切换样式也会中止该次 Word 工作；编辑后需重新预览。现有论文下载链接和手填日期不会被替换。

English:

1. Expand **Reference assistant** on the page.
2. Use **Quick add** to explicitly query up to 50 DOIs / doi.org links, one per line, or import BibTeX, RIS or CSL-JSON offline. Review candidates, warnings and duplicates, select the records to keep, then **Append to library**. Existing entries stay intact and the append can be undone as one operation. Manual entry remains available.
3. Add authors. Each author can be a **person** (family/given) or an **organization / group** (literal). Authors keep their list order.
4. Enter the publication date you actually have; a year alone, or year + month, is allowed. Webpages can also have an access date.
5. Fill type-specific fields such as publisher, journal/site name, volume/issue/pages, edition, DOI, URL, and language.
6. Select MLA 9 or APA 7 and choose **Preview bibliography**. Rendering runs locally; program assets come from this site or its completed offline cache.
7. After the preview refreshes, copy plain/formatted text or download standalone HTML. For Word, choose **Download Word reference list**, then click the filename link shown in the assistant once it is ready.
8. Optionally use **Save library on this device** to retain the library or **Download library JSON** to save a file. Each is a separate, explicit action.

Use **Cancel Word generation** while Word is being prepared. Entries and a still-current preview are kept, allowing an immediate retry. Editing entries or changing style also stops that Word operation; edits require a fresh preview. The existing paper-download link and manually entered date remain intact.

## 3. 字段 / Entry fields

| 字段 / Field | 说明 / Notes |
| --- | --- |
| `id` | 本地稳定 ID，1–64 位安全 ASCII（`A-Z a-z 0-9 _ -`）。由添加条目时生成。 / Local stable ID, 1–64 safe ASCII characters, generated when an entry is added. |
| `type` | `book`, `article-journal`, `webpage`。 / One of the three supported types. |
| `title` | 必填；保留原文。 / Required; preserved as entered. |
| `authors` | 有序数组，最多 50 个。每项为 `{family,given}` 或 `{literal}`，不能两者混用。可合法为空/缺省，此时给本地化提醒。 / Ordered array, max 50. Each item is `{family,given}` or `{literal}`, never both. Empty/absent is allowed with a localized warning. |
| `issued` | `{year, month?, day?}`；允许部分日期。月份/日期必须有年；闰日会校验。 / Partial date; month/day require a year; leap days are validated. |
| `publisher` | 书籍出版社。 / Book publisher. |
| `containerTitle` | 期刊名称或网站名称。 / Journal or site name. |
| `volume`, `issue`, `page` | 期刊卷、期、页码。 / Journal volume, issue, pages. |
| `edition` | 书籍版次。 / Book edition. |
| `DOI` | 手动编辑只做本地校验；只有“快速添加 → 查询 DOI”会连接 Crossref。异常值需核对或清空后重试。 / Manual editing only validates locally. Only Quick add → Look up DOI contacts Crossref. Check or clear malformed values before retrying. |
| `URL` | 必须是安全的 `http(s)` 地址，不能带用户名/密码。 / Must be a safe `http(s)` URL without username/password. |
| `accessed` | 网页访问日期，结构同 `issued`。 / Webpage access date, same shape as `issued`. |
| `language` | 可选，最多 64 字符。 / Optional, max 64 characters. |
| `originalText` | 可选、只读对照内容；若导入时提供则保存并只读显示，不会作为可编辑字段改写。 / Optional read-only comparison text; if supplied on import it is stored and displayed read-only, never rewritten as an editable field. |

限制 / Limits:

- 最多 200 条 / max 200 entries.
- 每条最多 50 个作者 / max 50 authors per entry.
- 普通字段最多 5000 字符 / ordinary field max 5000 characters.
- `originalText` 最多 10000 字符 / max 10000 characters.
- 原始库 JSON 最多 1 MiB（UTF-8）；导出优先美化，美化超出时使用紧凑 JSON；紧凑也超出则明确报错。/ Raw library JSON max 1 MiB UTF-8. Export uses pretty JSON when it fits, otherwise compact JSON; compact overflow is an explicit error.
- 库 JSON 的嵌套深度最多 32 层，解析节点最多 50,000 个。/ Library JSON permits at most 32 nesting levels and 50,000 parsed nodes.
- ID 必须唯一 / IDs must be unique.
- 不接受未知字段、未知 schema/版本、重复 JSON 键、原型污染键或未配对代理字符。/ Unknown fields, unknown schema/version, duplicate JSON keys, prototype-pollution keys, and unpaired surrogate code units are rejected.
- 仅允许安全 `http(s)` URL；DOI 做本地检查，不访问目标地址。/ Only safe `http(s)` URLs; DOI checks are local and never fetch the target.
- 预览及 Word 导出的排版结果也有限制：单条 HTML 和纯文本各不超过 32 KiB（UTF-8），各自合计及完整输出各不超过 2 MiB。单条 HTML 最多嵌套 32 层；完整预览允许额外一层文献表容器，共 33 层。超限会明确报错，需缩短内容或减少条目后重试，不会改写库或原稿。/ Preview and Word output limit each entry's HTML and plain text to 32 KiB each (UTF-8), with separate 2 MiB aggregate/full-output caps. Entry HTML permits 32 nesting levels; the complete preview permits one additional bibliography wrapper, 33 levels total. Oversize output is an explicit error: shorten fields or use fewer entries and retry. The library and draft stay intact.

## 4. 预览、提醒和错误 / Preview, warnings, errors

中文：

- 标题缺失、日期无效、URL 不安全、作者内容为空、数据超限等是**会阻止预览的字段错误**。
- 作者为空、年份为空、书籍缺出版社、期刊/网站名缺失、网页缺网址/访问日期、DOI 格式异常是**提醒**；提醒不会阻止有效预览。
- 任何输入、条目增删、库替换或样式修改都会使预览过期；此时复制、HTML 和 Word 导出被禁用，需重新预览。语言切换只更新标签，保留当前编辑内容、预览和错误。
- 如果预览无法处理某个 DOI，界面会提示核对或清空 DOI 后重试；不会把失败显示为成功预览。
- 如果引擎结果无法通过安全片段检查，预览失败并保留上一份安全预览；不会退化成纯文本成功，也不会启用复制/导出。

English:

- Missing title, invalid date, unsafe URL, whitespace-only author content, and size/count violations are **blocking field errors**.
- Missing author, missing year, missing book publisher, missing journal/site name, missing webpage URL/access date, and unusual DOI formats are **warnings** and do not block a valid preview.
- Any input edit, entry add/remove, library replacement, or style change makes the preview stale. Copy, HTML, and Word export stay disabled until Preview is refreshed. A language switch is label-only and preserves editor values, preview, and errors.
- If preview cannot process a DOI, the UI asks you to check or clear it and retry; a failed render is never shown as a successful preview.
- If engine output fails the safe-fragment check, preview fails and keeps the previous safe preview. It never silently downgrades to plaintext success or enables copy/export.

## 5. 导入与导出 / Import and export

中文：

- **库 JSON**：导出内容只有 `{schema, v, items}`，不含当前论文、草稿、结果、模板代码或页面状态。
- **导入**：粘贴或选择 JSON 后必须点击“预览导入”，核对条目数量和标题，再点击“确认替换”。取消不会改变当前库。
- 导入会替换当前文献库，但不会修改论文或草稿；替换前保存撤销快照。
- 文件读取使用致命 UTF-8 解码并有 1 MiB 上限。选择新文件、修改文本、关闭面板、取消或确认后，旧异步读取会失效；确认时还会核对生成号与当前原始文本。
- 粘贴一个 URL 只会作为无效 JSON 处理，**不会发起网络请求**。
- **独立 HTML**：只把引擎安全片段序列化进无脚本、无远程资源的 HTML，包含 CSL 的悬挂缩进/行距/条目间距和本地来源说明。CSL 布尔值 `hangingindent:true` 按半英寸（48px）处理，`false` 不缩进；数值像素适配器保留。
- **Word**：在浏览器本地生成独立 `.docx` 文献表，准备完成后在助手内显示下载链接，不修改现有论文结果。它使用 Letter 纸张、1 英寸页边距、Times New Roman 12 pt，以及所选 MLA／APA 的标题和文献块格式，不套用主页的自定义课程模板。生成期间有单独的取消按钮；取消释放论文表单，保留条目和仍有效的预览，晚到的结果链接不会显示。

English:

- **Library JSON** exports only `{schema, v, items}`. It never contains the current paper, draft, result, template code, or page state.
- **Import**: paste or choose JSON, choose **Preview import**, review the entry count and titles, then **Replace library**. Cancel leaves the current library unchanged.
- Import replaces the citation library only, never the paper or draft. An undo snapshot is kept before replacement.
- File reads use fatal UTF-8 decoding and a 1 MiB limit. Choosing another file, editing the text, closing the panel, cancelling, or confirming invalidates older asynchronous reads. Confirmation also checks the generation and current raw text.
- Pasting a URL is treated as invalid JSON; it **never triggers a network request**.
- **Standalone HTML**: serializes only the engine's safe fragment into a script-free, remote-resource-free HTML file, using the CSL hanging indent/line spacing/entry spacing and a local-source note. CSL boolean `hangingindent:true` is exported as a half-inch (48px) hanging indent, `false` as no indent; numeric pixel adapters are preserved.
- **Word**: generates a separate `.docx` bibliography locally and shows its download link inside the assistant, leaving paper results unchanged. It uses Letter paper, 1-inch margins, Times New Roman 12 pt, and the selected MLA/APA heading and bibliography layout. It does not apply the main page's custom course template. A separate cancel button releases the paper form while keeping entries and a still-current preview; late result links are not displayed.

## 5a. 文献库搜索与筛选 / Search and filters (v2.10 source)

文献库可按题名、作者、来源、年份、DOI 或网址搜索，并按书籍、期刊文章或网页筛选。
搜索只改变列表显示，不改写条目、不自动保存、不联网，也不使已生成的文献表过期。
筛选外的当前编辑条目仍保留；可清除筛选重新显示。显示数量是匹配数／全库总数。

Search title, authors, source, year, DOI or URL, and filter by book, journal
article or webpage. Filters change the visible list only: no data mutation,
automatic save, request or stale bibliography preview. The current editor is
kept if its record is outside the filter; clear the filter to reveal it.

## 5b. 导出到其他工具 / Portable export (v2.10 source)

展开“导出到其他工具”，明确选择全部文献或当前筛选结果，再选择格式并预览导出。
先核对数量、字段及损失提醒，再明确复制或下载。格式、范围或相关条目修改后旧导出失效，
需重新预览；不会自动下载、保存或上传。

| 格式 / Format | 用途与范围 / Purpose and limits |
| --- | --- |
| CSL-JSON（推荐 / recommended） | 标准 CSL 数组；保留当前模型的作者结构、部分日期和书目字段。/ Standard CSL array preserving current model name structures, partial dates and bibliography fields. |
| RIS | 常用书目交换格式；机构作者等存在姓名结构歧义时显示提醒。/ Bibliographic interchange with explicit warnings for ambiguous corporate/name structure. |
| `.bib` | 现代 UTF-8、BibLaTeX 兼容的 book/article/online；网页条目需要相应工具支持，不保证所有经典 BibTeX 样式兼容。/ Modern UTF-8 BibLaTeX-compatible book/article/online profile; webpage support depends on the receiving tool. |
| FormCapy 库 JSON / library JSON | 原有完整备份入口，保留应用字段及原文对照。/ Existing complete backup, retaining application fields and original comparison text. |

通用格式只导出书目元数据，不含原文对照、草稿、论文信息、模板或生成结果。
保留这些应用数据时请用原有“下载库 JSON”。通用文件导回时会重建本地 ID；
不同软件对姓名、扩展字段和转义的解释可能不同，迁移后仍应核对。
每次最多 200 条，导出文本最多 1 MiB（UTF-8）；超限明确失败，不截断或导出半份结果。

Expand **Export to other tools**, choose the whole library or the current
filtered records, then choose a format and preview. Review counts and loss
warnings before explicitly copying/downloading. Relevant edits invalidate the
prepared export. Portable formats exclude original comparison text, drafts,
paper details, templates and generated output. Use the existing FormCapy
library JSON for a complete library backup. Reimport assigns new local IDs;
receiving tools may interpret names, extensions and escaping differently.
The limit is 200 records and 1 MiB UTF-8 output; overflow fails explicitly.

## 6. 本地保存 / Local persistence

中文：

- 默认只在当前页面会话中保存；刷新或关闭页面后不会自动恢复。
- “保存到本设备”“载入已保存的库”“删除已保存的库”都是明确动作。
- 只使用键 `formcapy.citations.v1`，不写入模板偏好或其他 localStorage 键。
- 删除已保存副本**不会删除当前正在编辑的库**。
- 本地存储不可用或容量不足时显示本地化提示；不会悄悄吞掉错误。
- 加载前会校验 JSON；无效数据不会替换当前库。

English:

- By default the library lives only in this page session; refresh/close does not automatically restore it.
- **Save library on this device**, **Load saved library**, and **Remove saved library** are explicit actions.
- Only the key `formcapy.citations.v1` is used. Template preferences and unrelated localStorage keys are never written.
- Removing the saved copy **does not delete the active library**.
- Unavailable storage or quota failures produce localized messages; errors are not silently swallowed.
- Loaded JSON is validated first; invalid data never replaces the current library.

## 7. 隐私 / Privacy

中文：文稿排版、书目导入和引用渲染均在浏览器本地完成，不自动上传文稿、文献库或论文信息。只有用户明确点击“查询 DOI”，浏览器才以 HTTPS 向 `api.crossref.org/works/{DOI}` 发送该 DOI；Crossref 会收到 DOI、IP 地址及常规网络请求信息。请求不带本站 cookie 或 referrer，不发送作者／题名搜索、整篇参考文献、文稿或整个文献库。没有自动查询、自动重试、云端书库、账户或 AI。查询结果仅在当前会话缓存，最多 40 条；网站 service worker 不缓存外部查询。离线导入不联网，查询失败可改用导入或手动编辑。处理器、样式和 locale 仍由本站提供。

English: Draft formatting, bibliography import and citation rendering run locally. Drafts, libraries and paper details are not uploaded automatically. Only an explicit **Look up DOI** click sends that DOI over HTTPS to `api.crossref.org/works/{DOI}`. Crossref receives the DOI, IP address and normal request information. Requests omit credentials and referrer; no author/title search, reference-list text, draft or full library is sent. There are no automatic lookups/retries, accounts, cloud library or AI. Up to 40 successful results are cached only in session memory; the service worker does not cache external queries. Offline import needs no lookup. Failed queries can be replaced with offline import or manual entry. Processor/style/locale assets remain self-hosted.

## 7a. 快速添加的范围 / Quick-add limits

- DOI：只接受 DOI 或 doi.org 链接，固定查询 Crossref，不抓取任意网页。Crossref 未收录的 DOI、书籍章节等不支持类型、超出模型限制的记录会明确报错，不猜测作者或出版信息。结果需先核对，不能据此保证来源真实或课程格式完全合规。
- 批次最多 50 条非空行、32 KiB 文本；每次最多一个查询，两次开始至少间隔 1.3 秒，单次 15 秒超时、响应上限 2 MiB。逐行显示状态，普通失败仍保留其他成功结果；取消保留已完成结果供勾选，编辑输入则清空旧候选。429 会停止本批，等待后由用户重新启动，不自动重试。不会跟随出版商链接、联网读取文稿或请求私有代理。
- BibTeX / RIS / CSL-JSON：UTF-8，最多 1 MiB、200 条；追加后整个库仍最多 200 条。只映射现有 book / article-journal / webpage 模型。宏、复杂 LaTeX、章节／会议论文等不支持内容会给出错误或提醒，不执行导入文本。未导入字段、格式和原文截断会显示提醒。
- 只识别结构化书目数据，不把任意已排版参考文献或普通网页链接当成可靠的自动解析结果。建议从 Google Scholar、Zotero、期刊或图书馆导出 `.bib`／`.ris`。
- 新导入默认追加并跳过可确认的重复条目；旧的 **FormCapy 文献库 JSON → 确认替换** 仍单独保留。替换及追加均有撤销快照。导入文件不会进入模板导出或草稿状态。

DOI batches accept up to 50 nonempty lines and 32 KiB of DOI / doi.org-link text. Crossref requests run sequentially, at least 1.3 seconds between starts, with a 15-second timeout and 2 MiB cap per response. Cancellation retains completed candidates; input edits discard stale candidates. Ordinary failures retain other successes; HTTP 429 stops the batch for a later manual restart. Arbitrary pages are not scraped. Unsupported types are explicit errors. Select candidates before append; metadata still needs review. Offline UTF-8 BibTeX, RIS and CSL-JSON imports remain limited to 1 MiB / 200 records, including the final library limit. Unsupported/lossy data is reported. These are structured records, not arbitrary reference prose. Append skips confirmed duplicates and retains undo; FormCapy JSON replacement stays separate.

Provider documentation: [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [public access and limits](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/).

## 8. 数据格式 / Data schema

Envelope（仅此三个顶层字段 / exactly these top-level fields）:

```json
{ "schema": "formcapy-citations", "v": 1, "items": [] }
```

示例（虚构，仅展示字段结构，不代表真实发表的资料；未提供 DOI / fictional schema example, without a DOI or a claim of actual publication）:

```json
{
  "schema": "formcapy-citations",
  "v": 1,
  "items": [
    {
      "id": "cit_example_001",
      "type": "article-journal",
      "title": "A fictional study of capybaras",
      "authors": [
        { "family": "Example", "given": "Ana" },
        { "literal": "Fictional Research Group" }
      ],
      "issued": { "year": 2024, "month": 5 },
      "publisher": "",
      "containerTitle": "Journal of Fictional Studies",
      "volume": "12",
      "issue": "3",
      "page": "45-67",
      "edition": "",
      "DOI": "",
      "URL": "",
      "accessed": null,
      "language": "en",
      "originalText": ""
    }
  ]
}
```

Model API（全局/CommonJS `FormCapyCitations`）:

- `createItem(input)`, `createLibrary(items)`.
- `validateItem(item)`, `validateLibrary(library)` → `{valid, errors, warnings}`; issues carry stable `code` and `path`.
- `parseLibraryJson(text)` → `{ok, library, errors, warnings}`.
- `stringifyLibrary(library)` → canonical JSON string with aggregate 1 MiB enforcement.
- `toCslItems(library)` → CSL JSON in source order; omits empty fields, never adds authors/dates/DOIs.
- Constants `SCHEMA`, `VERSION`, `TYPES`, `MAX_ITEMS`, `MAX_AUTHORS`, `MAX_FIELD`, `MAX_ORIGINAL`, `MAX_JSON_BYTES`.
- Pure model: no DOM, storage, network, or engine access.

CSL mapping:

- `containerTitle` → `container-title`; `issued`/`accessed` → `date-parts` arrays with only supplied components; authors preserve order and literal/person shape; empty fields omitted; `originalText` is never sent to the renderer.

## 9. 页面入口与维护接口 / Page entry and maintainer interface

`templates/index.html` 已包含页面下方可展开的助手入口、引用引擎及可见来源声明。静态浏览器模式已连接本地 Word 文献表导出；普通 Flask 本地预览模式提供编辑、CSL 预览、复制、JSON 和 HTML，未提供该 Word 入口。原生 Android 界面未启用此助手。本版生产部署已核对，见[部署记录](DEPLOYMENT.md)；页面集成本身不等于完成设备验收。

`templates/index.html` already includes the expandable assistant, citation engine and visible attribution. Static browser mode is connected to local Word-bibliography export. The ordinary Flask local preview provides editing, CSL preview, copy, JSON and HTML without that Word action. The native Android interface does not enable this assistant. The production deployment was checked separately in the [deployment record](DEPLOYMENT.md); integration alone does not establish device acceptance.

<details>
<summary>维护者：资源顺序和组件接口 / Maintainers: asset order and component API</summary>

当前主页面资源顺序 / Current main-page asset order:

```html
<link rel="stylesheet" href="static/citation-assistant.css">
<script src="static/citation-library.js"></script>
<script src="static/citation-engine.js"></script>
<script src="static/citation-assistant.js"></script>
<div id="citation-assistant-mount"></div>
```
引擎排在 UI 之前；实际挂载和导出连接见 [templates/index.html](../templates/index.html)。The engine loads before the UI; the actual mounting and export connection are in [templates/index.html](../templates/index.html).

```js
const citations = FormCapyCitationAssistant.create({
  mount: document.getElementById("citation-assistant-mount"),
  getLocale: () => currentLanguage, // "zh" | "en" | "es"
  engine: FormCapyCitationEngine,    // optional; global default
  model: FormCapyCitations,          // optional; global default
  storage: window.localStorage,      // optional; safe fallback
  // Forward the second argument's signal to the local transport.
  // The actual page also owns busy guards and form locks; see index.html.
  onExportWord: async (bibliography, { signal } = {}) => {
    const result = await localTransport.generate({
      request: { kind: "bibliography", bibliography },
      file: null,
      signal,
    });
    return { downloadUrl: URL.createObjectURL(result.blob), name: result.name };
  },
  allowDownloads: true, // false on restricted native surfaces
});

// Call after the host language control changes. Label-only; keeps editor,
// preview, and error state.
citations.render();

// Optional teardown: aborts pending Word work, removes the UI,
// clears timers and revokes owned blob URLs.
citations.dispose();

// Detached status snapshot for host tests/status.
citations.state();
```

The code block illustrates the API shape; `currentLanguage` and `localTransport` are host-provided values, not standalone globals. `onExportWord(bibliography, {signal})` receives `{style,heading,html,text,entries,layout}` as its first argument and the cancellation signal as its second. A host adapter **must pass that signal through to `transport.generate()`** so cancel/edit/disposal stops pending initialization and worker work. It returns `{downloadUrl, name}` after the separate DOCX has been built. The actual page already supplies the adapter, busy guards and locks through the browser bridge. The assistant displays the link only inside its panel and revokes URLs from cancelled, stale or disposed operations. `allowDownloads:false` hides JSON/HTML/Word download controls; copy remains available.

</details>

## 10. 已知限制 / Known limits

- Only MLA 9 / APA 7 and book / article-journal / webpage. No in-text citations or GB/T.
- Missing author/year are warnings, not fabricated values.
- DOI format is a warning in the model. The CSL renderer can reject an unusual DOI; the UI then asks you to check or clear the value before retrying.
- Safe URLs reject credentials; DOI/URL are never fetched.
- Invalid date components remain visible in the editor as blocking errors; they are not silently treated as missing. Saving/exporting is blocked until fixed or cleared.
- Valid Unicode, including supplementary-plane characters, is retained. Actual glyph appearance depends on the fonts available when the preview or Word document is displayed.
- Library JSON uses compact fallback near 1 MiB; a library whose compact JSON exceeds 1 MiB cannot be saved/downloaded and shows an explicit error.
- JSON/HTML download blob URLs are revoked after a short safety delay; the current Word result remains until preview invalidation, replacement, or disposal.
- A language switch is label-only: the current preview is kept; edits or style changes invalidate it.
- Main-page mounting and static-browser Word export are connected and live on the v2.7.0 static website. Public evidence is recorded separately below; Safari and physical-device workflows remain unverified.

## 11. 实现阶段测试记录 / Implementation-stage test record

Focused Node tests (fictional data; no browser download of user documents). These logic checks are separate from browser downloads, production deployment and physical-device acceptance; final release evidence belongs in the [deployment record](DEPLOYMENT.md).

```powershell
node --test browser/test/citation_library_test.mjs browser/test/citation_assistant_test.mjs
```

当前结果 / current result: **63 passed, 0 failed** (19 model tests, 44 assistant DOM tests). The assistant tests use a small in-memory DOM adapter and injected engine/storage/clipboard stubs; they remain separate from the real Chromium checks below. An additional **10 host-state integration tests** in `browser/test/citation_host_state_test.mjs` exercise the actual page callbacks, cancellation/retry ownership, lock release and original-paper state retention.

Coverage includes: JSON roundtrip and compact 1 MiB cap; Unicode; partial/leap dates; multiple/literal/whitespace authors; no fabricated metadata; malformed/version/duplicate/prototype/oversize imports leaving state intact; explicit-only storage and storage-read errors; trilingual field preservation and scoped date labels; stale preview/race; invalid date preservation; DOI renderer rejection; unsafe/oversize engine output; explicit Word cancel/retry, automatic edit/dispose abortion and late-URL revocation; import file/review races; issue-list caps; download timers; standalone HTML layout/attribution; clipboard fallback and escaped XSS.

## 12. 最终本地验收 / Final local acceptance

本轮调试后构建为 `dist/formcapy-v2.7.0-debug/`，属于本地静态构建和本地浏览器验收，**不是生产部署证明**。构建包含 145 项 manifest 文件记录，总计 **118,835,570 字节**；离线缓存标识为 `formcapy-2.7.0-pyodide-314.0.7-a3c606097254`，`manifest.json` SHA-256 为 `fbf3eeed6b54d7fb95f61e90864c92acb929edcb4afe262b9be3c8ca187100c8`。旧 `dist/formcapy-v2.7.0/` 是本轮调试前的构建，不能代替此产物记录。

These results concern the post-debug local artifact and local Chromium, **not a production deployment**. The artifact has 145 manifest file entries, totals **118,835,570 bytes**, and uses the cache identifier and manifest digest above. The older `dist/formcapy-v2.7.0/` directory predates this debug pass.

| 检查 / Check | 本地结果 / Local result |
| --- | --- |
| 全部 Node 检查 / All Node checks | 11 个脚本共 309 项通过；其中模型 19、助手 DOM 44，共 63 项，另有 host 集成 10 项 / 309 passed across 11 scripts, including 19 model, 44 assistant DOM and 10 additional host integration cases |
| Python 回归 / Python regression | 228 项及 159 项子检查通过 / 228 tests and 159 subtests passed |
| 真实 CSL → Pyodide → DOCX | MLA、APA 各 4 条原创虚构记录的 ZIP／内容检查通过；与浏览器文件下载检查分开 / Four fictional entries per style passed ZIP/content checks, separate from browser-download inspection |
| 真实 Chromium 助手 / Real Chromium assistant | 书籍、期刊、网页 → MLA／APA 预览及独立 Word 下载链接生成通过 / All three source types produced MLA/APA previews and standalone Word download links |
| 错误保留 / Error preservation | 日期 `0` 跨语言保留并明确报错；异常 DOI 提示核对或清空 / Date `0` remained visible across languages with an error; invalid DOI prompted correction or clearing |
| 文献数据与保存 / Library data and persistence | 实际库 JSON 仅含 `schema`、`v`、`items`；显式保存及删除保存副本不清空活动库 / JSON contained only the three schema fields; explicit save/remove left the active library intact |
| 论文流程隔离 / Paper-flow separation | 原论文示例生成及后续 APA 文献 Word 均成功；论文结果链接与手填日期保持原样 / Demo-paper generation and later APA bibliography Word generation succeeded without changing the paper-result link or manual date |
| Word 取消与重试 / Word cancellation and retry | 真实 Chromium 受控暂停 `pyodide.mjs` 下载期间，取消按钮可操作，论文表单由锁定恢复；三条文献的预览及手填日期 `3 February 2027` 完全保留。放行后重试成功，生成 `FormCapy-MLA-References.docx` 链接 / During a controlled `pyodide.mjs` download hold, cancellation remained reachable and released the paper form; the three-entry preview and manual date were unchanged. Retry after release produced the standalone MLA Word link |
| 离线重载与转换 / Offline reload and conversion | 停止本地静态服务器且确认端口无监听后，真实 Chromium 离线重载成功；文献库未自动载入，手动载入已保存的三条后，APA／MLA 预览与 Word 链接均生成成功。期间原论文 MLA 示例生成成功，文献／论文既有链接分别保留；控制台警告／错误为 0 / With the local server stopped and no listener remaining, Chromium reloaded offline. The library stayed empty until explicitly loaded; all three saved entries produced APA/MLA previews and Word links. Main-paper MLA generation also succeeded while keeping the separate existing bibliography/paper links; zero console warnings/errors |
| 窄视口与语言 / Narrow viewports and languages | 390／768 px 的中文、英文、西班牙语界面未见横向溢出；警告／错误控制台记录为 0 / No horizontal overflow at 390/768 px in zh/en/es; zero console warnings/errors |
| 更新提示 / Update notice | 真实 Service Worker 独立测试页的更新流程及真实 Chromium 的 HTTP 503 后恢复通过；与生产网站检查分开记录 / The real-Service-Worker fixture flow and real Chromium recovery after HTTP 503 passed, separately from production checks |

本轮真实浏览器证据为 `build/debug-v2.7/word-cancel-real.json`、`word-cancelled.png`、`offline-browser.json` 和 `offline-bibliography.png`。取消／重试使用本地 8614 端口，离线重载／转换使用停止服务器后的 8613 端口；均属于本地验收。Current real-browser evidence is recorded in those files: cancellation/retry used local port 8614, and offline reload/conversion used port 8613 after its server was stopped. These are local acceptance results.

本轮**没有重新下载并检查浏览器生成的 DOCX 文件**；浏览器已生成下载链接不等于完成下载文件验收。上表中的 ZIP／内容检查来自独立 CSL→Pyodide 检查。窄视口结果来自桌面 Chromium，不代表手机／平板实机。Safari 与物理设备仍未验收；v2.7.0 正式网站的有限验收范围另见下节。

This round **did not freshly download and inspect browser-generated DOCX files**. Creating a download link is separate from downloaded-file acceptance; the ZIP/content results above came from the independent CSL→Pyodide checks. Narrow-viewport observations used desktop Chromium, not physical phones/tablets. Safari and physical devices remain unverified; the limited v2.7.0 public-site checks are recorded separately below.

---

本指南记录源码集成状态；生产发布结果以[部署记录](DEPLOYMENT.md)为准。 / This guide records source integration; consult the [deployment record](DEPLOYMENT.md) for production release results.


## 13. 正式网站核对 / Public-site checks — 2026-10-22

Cloudflare 生产版本 `890b8ee5` 为 **Ready / 100%**，使用上述冻结的调试后产物，应用源码为 `866e0cb4bc48767f96d5a8681c46609a25390c43`。[CI 39718820575](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39718820575) 的 7 项任务全部通过，本轮仅发布静态网页版。一次 Worker 扫描核对 **144/144** 个可下载文件、**118,834,929 字节**；root／www 的 **38/38** 个关键文件一致，未注入 analytics beacon，源码归档与许可可访问，可信 TLS 1.3 下 **18/18 HTTPS** 检查通过。

正式根域的 Edge 流程完成：内置 Markdown 草稿生成 MLA 论文链接；书籍、期刊文章、网页三类虚构条目的库 JSON 经审阅、明确确认后导入；MLA／APA 预览和各自的独立 Word 链接均生成成功。中、英、西班牙语切换保留手填日期 `3 February 2027`、论文链接、APA 文献链接和三条预览，控制台无警告或错误。证据为 `build/v2.7-web-release/production/public-browser.json`；[正式网站截图](images/formcapy-live-v2.7-citations.png)保留虚构示例和可见归属。

The public root-domain Edge workflow generated the main MLA demo result, reviewed and explicitly imported a fictional three-type library, previewed MLA/APA bibliographies and prepared both standalone Word links. Language changes retained the manual date, paper result, APA result and three-entry preview, with no console warnings/errors. The independent HTTP checks establish the exact frozen static snapshot and trusted HTTPS; the browser checks establish those observed UI flows. They **do not establish fresh downloaded-DOCX inspection, Safari or physical-device acceptance**. See the [deployment record](DEPLOYMENT.md) for cache-upgrade observations and the full scope.
