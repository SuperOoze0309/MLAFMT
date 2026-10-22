# 独立参考文献助手 / Citation assistant

状态：**v2.7.0 参考文献助手已接入主页面，本地预览与独立 Word 导出已接通并通过本地验收，尚未正式部署。** 当前正式网站仍为 v2.6.0，离线下载仍为 v2.5.0；本指南描述 v2.7.0 源码功能。

Status: **the v2.7.0 reference assistant is mounted in the main page. Local preview and standalone Word export are connected and have passed local acceptance; it is not deployed yet.** Production remains v2.6.0 and published offline downloads remain v2.5.0. This guide describes the v2.7.0 source.

---

## 1. 用途与边界 / Purpose and scope

中文：

- 该助手只生成一份**独立的参考文献表**。现有论文、论文信息、正文、文中引用和生成结果不会被改写。
- 当前只支持 **MLA 9** 和 **APA 7**，以及 **book / article-journal / webpage** 三类来源。
- 不生成文中引用，不替换论文中的引用，不支持 GB/T 7714 或其他样式。
- 不联网查询 DOI、不联网补全作者/日期/出版社，不调用 AI，不上传到服务器，不使用账户或云端书库。
- 标签会随界面语言翻译；用户输入的标题、姓名、机构名等**不会被翻译或自动改写**。

English:

- The assistant creates a **standalone reference list only**. It does not rewrite the paper, paper details, body text, in-text citations, or generated results.
- It currently supports **MLA 9** and **APA 7**, and the source types **book / article-journal / webpage**.
- It does not create in-text citations, replace citations in a paper, or support GB/T 7714 or other styles.
- It does not look up DOIs, fill in missing authors/dates/publishers, call AI, upload to a server, use accounts, or provide a cloud library.
- UI labels are translated; user-entered titles, names, and organization names are **not translated or automatically rewritten**.

## 2. 快速使用 / Quick start

中文：

1. 展开页面中的“参考文献助手”。
2. 点击“添加条目”，选择条目类型并填写标题。
3. 添加作者；每个作者可以选“个人作者”（姓/名）或“机构/团体作者”。作者按列表顺序保存。
4. 填写可用的出版日期；允许只填年或年+月。网页可填写访问日期。
5. 按类型填写出版社、期刊/网站名称、卷/期/页码、版次、DOI、网址、语言等。
6. 选择 MLA 9 或 APA 7，再点击“预览文献表”。预览在浏览器本地生成；程序资源由本站提供，也可从已完成的离线缓存读取。
7. 预览刷新后可复制纯文本/带格式文本或下载独立 HTML。需要 Word 时，点击“下载 Word 文献表”，准备完成后再点击助手内显示的文件名链接。
8. 可选：点击“保存到本设备”保留文献库，或用“下载库 JSON”保存为文件；两者都是单独动作，不会自动发生。

English:

1. Expand **Reference assistant** on the page.
2. Choose **Add entry**, then select a type and enter a title.
3. Add authors. Each author can be a **person** (family/given) or an **organization / group** (literal). Authors keep their list order.
4. Enter the publication date you actually have; a year alone, or year + month, is allowed. Webpages can also have an access date.
5. Fill type-specific fields such as publisher, journal/site name, volume/issue/pages, edition, DOI, URL, and language.
6. Select MLA 9 or APA 7 and choose **Preview bibliography**. Rendering runs locally; program assets come from this site or its completed offline cache.
7. After the preview refreshes, copy plain/formatted text or download standalone HTML. For Word, choose **Download Word reference list**, then click the filename link shown in the assistant once it is ready.
8. Optionally use **Save library on this device** to retain the library or **Download library JSON** to save a file. Each is a separate, explicit action.

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
| `DOI` | 保留原文并提示异常；预览若拒绝该值，需核对或清空后重试，不联网查询。 / Preserved with a format warning; if preview rejects it, check or clear the value and retry. No online lookup. |
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
- ID 必须唯一 / IDs must be unique.
- 不接受未知字段、未知 schema/版本、重复 JSON 键、原型污染键或未配对代理字符。/ Unknown fields, unknown schema/version, duplicate JSON keys, prototype-pollution keys, and unpaired surrogate code units are rejected.
- 仅允许安全 `http(s)` URL；DOI 做本地检查，不访问目标地址。/ Only safe `http(s)` URLs; DOI checks are local and never fetch the target.
- Word 导出另有安全上限：单条排版 HTML 不超过 32 KiB，合计不超过 2 MiB；过长内容需缩短后重试，不会改写库或原稿。/ Word export additionally limits formatted entry HTML to 32 KiB per entry and 2 MiB in total. Shorten oversized entries and retry; the library and draft stay intact.

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
- **Word**：在浏览器本地生成独立 `.docx` 文献表，准备完成后在助手内显示下载链接，不修改现有论文结果。它使用 Letter 纸张、1 英寸页边距、Times New Roman 12 pt，以及所选 MLA／APA 的标题和文献块格式，不套用主页的自定义课程模板。

English:

- **Library JSON** exports only `{schema, v, items}`. It never contains the current paper, draft, result, template code, or page state.
- **Import**: paste or choose JSON, choose **Preview import**, review the entry count and titles, then **Replace library**. Cancel leaves the current library unchanged.
- Import replaces the citation library only, never the paper or draft. An undo snapshot is kept before replacement.
- File reads use fatal UTF-8 decoding and a 1 MiB limit. Choosing another file, editing the text, closing the panel, cancelling, or confirming invalidates older asynchronous reads. Confirmation also checks the generation and current raw text.
- Pasting a URL is treated as invalid JSON; it **never triggers a network request**.
- **Standalone HTML**: serializes only the engine's safe fragment into a script-free, remote-resource-free HTML file, using the CSL hanging indent/line spacing/entry spacing and a local-source note. CSL boolean `hangingindent:true` is exported as a half-inch (48px) hanging indent, `false` as no indent; numeric pixel adapters are preserved.
- **Word**: generates a separate `.docx` bibliography locally and shows its download link inside the assistant, leaving paper results unchanged. It uses Letter paper, 1-inch margins, Times New Roman 12 pt, and the selected MLA/APA heading and bibliography layout. It does not apply the main page's custom course template.

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

中文：所有书目输入都在浏览器本地处理。没有账户、转换服务器、后台书库存储、自动上传、云书库、DOI 查询或 AI 服务。只有用户点击预览才运行引用渲染；处理器、样式和 locale 均由本站提供，可能在首次访问或建立离线缓存时下载。输入内容不用于请求路径、查询参数或上传正文，也不请求外部书目元数据。

English: All bibliography input is processed locally in the browser. There are no accounts, conversion servers, backend library storage, automatic uploads, cloud library, DOI lookups, or AI services. Citation rendering runs only after Preview is requested; the self-hosted processor, styles and locale may download on the first visit or during offline-cache installation. Bibliographic input is never placed in request paths, query strings or upload bodies, and no external bibliographic metadata is requested.

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

`templates/index.html` 已包含页面下方可展开的助手入口、引用引擎及可见来源声明。静态浏览器模式已连接本地 Word 文献表导出；普通 Flask 本地预览模式提供编辑、CSL 预览、复制、JSON 和 HTML，未提供该 Word 入口。原生 Android 界面未启用此助手。上述集成不等于本版已经部署或完成设备验收。

`templates/index.html` already includes the expandable assistant, citation engine and visible attribution. Static browser mode is connected to local Word-bibliography export. The ordinary Flask local preview provides editing, CSL preview, copy, JSON and HTML without that Word action. The native Android interface does not enable this assistant. Integration does not establish production deployment or device acceptance.

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
  // Static browser mode supplies the existing local Word export adapter here.
  // See templates/index.html for its transport call and busy-state guards.
  onExportWord: localWordExportAdapter,
  allowDownloads: true, // false on restricted native surfaces
});

// Call after the host language control changes. Label-only; keeps editor,
// preview, and error state.
citations.render();

// Optional teardown: removes the UI, clears timers, revokes owned blob URLs.
citations.dispose();

// Detached status snapshot for host tests/status.
citations.state();
```

The code block is an API-shape illustration; `currentLanguage` and `localWordExportAdapter` refer to host-provided values, not standalone globals. `onExportWord` receives `{style,heading,html,text,entries,layout}` and returns a local download URL/name after the separate DOCX has been built. The actual page already provides this adapter through the browser bridge. The assistant displays the link only inside its panel. `allowDownloads:false` hides JSON/HTML/Word download controls; copy remains available.

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
- Main-page mounting and static-browser Word export are connected; v2.7.0 is still awaiting production deployment. Safari and physical-device workflows remain unverified.

## 11. 实现阶段测试记录 / Implementation-stage test record

Focused Node tests (fictional data; no browser download of user documents). These logic checks are separate from browser downloads, production deployment and physical-device acceptance; final release evidence belongs in the [deployment record](DEPLOYMENT.md).

```powershell
node --test browser/test/citation_library_test.mjs browser/test/citation_assistant_test.mjs
```

当前结果 / current result: **56 passed, 0 failed** (17 model tests, 39 assistant DOM tests). The assistant tests use a small in-memory DOM adapter and injected engine/storage/clipboard stubs; they remain separate from the real Chromium checks below.

Coverage includes: JSON roundtrip and compact 1 MiB cap; Unicode; partial/leap dates; multiple/literal/whitespace authors; no fabricated metadata; malformed/version/duplicate/prototype/oversize imports leaving state intact; explicit-only storage; trilingual field preservation and scoped date labels; stale preview/race; invalid date preservation; DOI renderer rejection; unsafe engine output; stale Word edit/dispose and URL revocation; import file/review races; issue-list caps; download timers; standalone HTML layout/attribution; clipboard fallback and escaped XSS.

## 12. 最终本地验收 / Final local acceptance

以下记录来自 `dist/formcapy-v2.7.0/`，属于本地静态构建和本地浏览器验收，**不是生产部署证明**。构建包含 145 项 manifest 文件记录，总计 118,827,803 字节；离线缓存标识为 `formcapy-2.7.0-pyodide-314.0.7-067d00d3c8d6`。

These results concern the local static artifact and local Chromium, **not a production deployment**. The artifact has 145 manifest file entries, totals 118,827,803 bytes, and uses the cache identifier recorded above.

| 检查 / Check | 本地结果 / Local result |
| --- | --- |
| 全部 Node 检查 / All Node checks | 267 项通过；其中模型 17、助手 DOM 39，共 56 项 / 267 passed, including 17 model and 39 assistant DOM cases |
| Python 回归 / Python regression | 222 项及 159 项子检查通过 / 222 tests and 159 subtests passed |
| 真实 CSL → Pyodide → DOCX | MLA、APA 各 4 条原创虚构记录的 ZIP／内容检查通过；与浏览器文件下载检查分开 / Four fictional entries per style passed ZIP/content checks, separate from browser-download inspection |
| 真实 Chromium 助手 / Real Chromium assistant | 书籍、期刊、网页 → MLA／APA 预览及独立 Word 下载链接生成通过 / All three source types produced MLA/APA previews and standalone Word download links |
| 错误保留 / Error preservation | 日期 `0` 跨语言保留并明确报错；异常 DOI 提示核对或清空 / Date `0` remained visible across languages with an error; invalid DOI prompted correction or clearing |
| 文献数据与保存 / Library data and persistence | 实际库 JSON 仅含 `schema`、`v`、`items`；显式保存及删除保存副本不清空活动库 / JSON contained only the three schema fields; explicit save/remove left the active library intact |
| 论文流程隔离 / Paper-flow separation | 原论文示例生成及后续 APA 文献 Word 均成功；论文结果链接与手填日期保持原样 / Demo-paper generation and later APA bibliography Word generation succeeded without changing the paper-result link or manual date |
| 窄视口与语言 / Narrow viewports and languages | 390／768 px 的中文、英文、西班牙语界面未见横向溢出；警告／错误控制台记录为 0 / No horizontal overflow at 390/768 px in zh/en/es; zero console warnings/errors |
| 更新提示 / Update notice | 真实 Service Worker 独立测试页的更新流程通过；与助手和生产网站检查分开记录 / The real-Service-Worker fixture flow passed, separately from assistant and production checks |

本轮**没有重新下载并检查浏览器生成的 DOCX 文件**；浏览器已生成下载链接不等于完成下载文件验收。上表中的 ZIP／内容检查来自独立 CSL→Pyodide 检查。窄视口结果来自桌面 Chromium，不代表手机／平板实机。Safari、物理设备及 v2.7.0 正式网站流程仍未验收。

This round **did not freshly download and inspect browser-generated DOCX files**. Creating a download link is separate from downloaded-file acceptance; the ZIP/content results above came from the independent CSL→Pyodide checks. Narrow-viewport observations used desktop Chromium, not physical phones/tablets. Safari, physical devices and the v2.7.0 production site remain unverified.

---

本指南记录源码集成状态；生产发布结果以[部署记录](DEPLOYMENT.md)为准。 / This guide records source integration; consult the [deployment record](DEPLOYMENT.md) for production release results.
