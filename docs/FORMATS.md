# 版式与自定义课程模板 / Formats and Custom Templates

**适用版本 / Applies to：MLAFMT v2.4.0 开发版（未发布） / Unreleased development version。** 当前正式下载仍为 v2.3.0，不包含本文的新功能。

Published downloads are still v2.3.0 and do not contain the new features described here.

## 中文

### 快速使用

1. 在主页选择 **MLA 9**、**APA 7 · 学生论文**或**自定义课程模板**，填写姓名和标题。
2. 使用 APA 时补充学校/院系、课程、教师和截止日期；草稿末尾的参考文献标题单独占一段，下面每段一条文献。
3. 使用自定义格式时，展开网页模板设置或打开桌面 **编辑 / 新建模板**，调整排版后保存；最多保存 20 个命名模板。页码位置、起始数字与封面页码放在二级入口 **高级定制**。
4. 如需某几段保持原格式，导入 DOCX 后在高级选项中读取 Word 段落，勾选或输入 `2, 4-6` 等编号范围。
5. 生成 Word，查看结果提示并下载或保存。主页的纸张图为版式示意，不呈现草稿正文。

可先导入 [A4 课程报告示例](../examples/course-report-a4.json)：Arial 11 pt、1.5 倍行距、2.5 cm 页边距和 1 cm 首行缩进；页码在页脚居中，独立封面不编号，正文从 1 开始。它是演示配置，可按课程要求修改。

APA / 自定义模式下，Markdown 代码围栏连同其中的换行和文字原样保留，不会把代码里的 `#` 或 `References` 当作标题。

### 1. 版式概览

| 版式 | 用途 | 主要行为 |
| --- | --- | --- |
| **MLA 9** | 现有的 MLA 第 9 版常用版式 | 姓氏加页码页眉、首页信息块、0.5 英寸首行缩进、另起一页并按字母排序的 Works Cited |
| **APA 7 学生版** | APA 第 7 版学生论文的页面版式 | 标题页、仅页码页眉、正文重复标题、References 页和 APA 标题层级 |
| **自定义课程模板** | 保存课程或个人常用的布局组合 | 本机保存多个命名预设，按字段表调整页面和段落布局 |

三种版式共用同一排版核心，在桌面端、本地网页端和离线 Android 上使用相同的版式规则；各平台的界面封装可能不同。DOCX 段落选择见第 5 节，限制见第 6 节。

### 2. MLA 9

现有 MLA 9 版式保持不变：Letter 纸张、1 英寸页边距、Times New Roman 12 pt、双倍行距、0.5 英寸首行缩进；首页信息块和居中标题；右上角姓氏与页码；Works Cited 另起一页、标题居中、按字母排序并使用 0.5 英寸悬挂缩进。默认日期使用英文日月年格式；手动填写的日期文字保持原样。

### 3. APA 7 学生版式（v2.4.0 开发中）

| 项目 | 排版行为 |
| --- | --- |
| 标题页 | 包含标题、作者/姓名、所属机构（学校/院系）、课程、教师、截止日期 |
| 页码与页眉 | 右对齐页码位于右上角，不显示姓氏，不使用 running head |
| 正文开头 | 重复标题，粗体并居中 |
| 页面与字体 | Letter 纸张、1 英寸页边距、Times New Roman 12 pt、双倍行距 |
| 正文 | 首行缩进 0.5 英寸 |
| References | 另起一页，标题粗体居中，条目使用 0.5 英寸悬挂缩进，并按完整条目的起始文本排序 |
| 标题 | 现有 DOCX Heading 1–3 与 Markdown `#`、`##`、`###` 按 APA 标题层级 1–3 表示；正文中的启发式标题识别仍需手动开启。标题大小写保持原文，请按课程要求核对 |

APA 官方说明（供理解版式）：[Paper format](https://apastyle.apa.org/style-grammar-guidelines/paper-format) · [Title page](https://apastyle.apa.org/style-grammar-guidelines/paper-format/title-page)。

### 4. 自定义课程模板（v2.4.0 开发中）

自定义模板用于保存和复用一组布局设置：

- 在桌面设置、网页端浏览器 `localStorage` 和 Android 应用本地存储中保存多个命名预设。
- 桌面端、网页端和 Android 都支持保存、选择、删除和导入/导出。
- 桌面端和网页端使用**裸 JSON 文件**导入/导出。
- Android 使用模板导入/导出弹窗中的文本框复制或粘贴 JSON。
- 每个界面读取自己的本地设置；在桌面端创建的模板不会自动出现在网页端或 Android 上。
- 导出的 JSON 只包含布局设置，不包含文档、草稿、引用或其他模板列表。

#### 高级定制：页码

打开模板设置中的二级 **高级定制**，可选右上角、页脚居中或页脚右侧，以及 1–9999 的起始页码。封面页码默认显示；有独立封面且关闭封面页码时，封面不计入编号，正文第一页从所设数字 `N` 开始。例如设为 `3`，封面无页码，正文第一页为 `3`。

`header: "none"` 时页码选项禁用；未启用独立封面时，封面页码选项禁用。MLA / APA 内置预设保持默认页码规则，需要调整时使用自定义课程模板。

#### 字段与取值范围

| 字段 | 类型与范围 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `label` | 字符串，1–60 个字符 | `Course template` | 预设名称 |
| `paper_size` | `Letter` 或 `A4` | `Letter` | 纸张大小 |
| `font_name` | `Times New Roman`、`Arial`、`Calibri`、`宋体`、`黑体` 之一 | `Times New Roman` | 正文字体 |
| `font_size` | 数字，8–24 | `12` | 字号（pt） |
| `line_spacing` | 数字，1–3 | `2` | 行距倍数；`2` 为双倍行距 |
| `margin_cm` | 数字，0.5–5.08 | `2.54` | 页边距（cm） |
| `first_line_cm` | 数字，0–2.54 | `1.27` | 正文首行缩进（cm） |
| `alignment` | `left` 或 `justify` | `left` | 正文对齐方式 |
| `header` | `surname_page`、`page` 或 `none` | `page` | 页码内容：姓氏加页码 / 仅页码 / 不显示；位置由下项决定 |
| `page_number_position` | `top_right`、`bottom_center` 或 `bottom_right` | `top_right` | 页码位于右上角 / 页脚居中 / 页脚右侧 |
| `page_number_start` | 整数，1–9999 | `1` | 首个编号页的数字；封面隐藏页码时用于正文第一页 |
| `show_cover_page_number` | 布尔值 | `true` | 独立封面是否编号；`false` 时从正文开始编号 |
| `title_page` | 布尔值 | `false` | 是否生成标题页 |
| `references_title` | 字符串，1–80 个字符 | `References` | 参考文献页标题文字 |
| `sort_references` | 布尔值 | `true` | 是否按条目起始文本排序参考文献 |

#### JSON 示例

下面是一个合法的裸 JSON 对象，使用全部默认值。顶层直接是模板字段，不要再包一层。

```json
{
  "label": "Course template",
  "paper_size": "Letter",
  "font_name": "Times New Roman",
  "font_size": 12,
  "line_spacing": 2,
  "margin_cm": 2.54,
  "first_line_cm": 1.27,
  "alignment": "left",
  "header": "page",
  "page_number_position": "top_right",
  "page_number_start": 1,
  "show_cover_page_number": true,
  "title_page": false,
  "references_title": "References",
  "sort_references": true
}
```

[A4 示例](../examples/course-report-a4.json) 将 `page_number_position` 设为 `bottom_center`、`show_cover_page_number` 设为 `false`，配合 `title_page: true` 和 `page_number_start: 1`，表示封面无页码、正文从页脚居中的 `1` 开始。

导入和导出说明：

- 使用上表的字段名、类型、范围和可选取值；导入时不要增加外层包装或文档内容。
- 一次导出的 JSON 描述一个模板配置；它不携带论文正文，也不同步账号或云端数据。
- 旧模板省略三项新页码字段时，自动补为 `top_right`、`1`、`true`；段落保留选择不属于模板字段。
- 清理浏览器站点数据可能移除网页端模板；可先复制或导出 JSON 作为备份。
- 生成后仍需人工检查页眉、标题页和参考文献页。

### 5. DOCX 段落选择与对象保留

在 **高级选项 → 指定段落保持原格式** 中读取当前 Word 草稿，也可从模板 **高级定制** 的段落保留入口进入。支持多段勾选、全选、清空，以及 `2, 4-6` 这样的编号范围；应用范围会替换当前勾选。

- **编号**：按源 DOCX 正文的实际段落位置编号，空段不展示，所以编号可有间隔；只有图片的正文段落也会显示。
- **保留范围**：所选段落保持原字体、字号、行距、缩进和其他段落格式。全篇纸张、页边距、页码以及源分节、页眉和页脚仍按当前模板重建；原分页位置可能改变。
- **草稿生命周期**：选择仅属于当前文档，不保存到课程模板或导出的模板 JSON。换稿或移除草稿会清空选择。读取时记录源文件指纹；检测到文件内容变更时，需重新读取段落再选。Android 旋转或折叠重建界面时会恢复同一草稿的选择。
- **正文图片和表格**：从源 DOCX 包保留，不需要逐个勾选；表格整体保留，不提供表格内部逐段选择。原页眉页脚中的图片不属于正文图片保留范围。
- **参考文献**：开启排序时，如果参考文献中包含保留原格式的段落或对象，仅对连续、安全的普通条目排序，并提示手动核对顺序。引用内容不改写。
- **TXT / Markdown**：不支持段落保留选择；图片链接或图片语法不自动嵌图，代码围栏按文字保留。

结果区显示实际保留的段落、正文图片和表格数量。复杂文档请对照原稿检查。

### 6. 限制

本工具只整理版式，不生成或核验引文，也不判断论文是否符合课程要求。

- **APA 参考文献**：不解析、改写或核验文内引用或条目内容，也不实现复杂的同作者、同年份书目排序。不提供专业论文 running head 或作者注。
- **模板范围**：仅支持字段表中的布局项。没有账号或云同步。
- **转换内容**：DOCX 正文图片和表格从源包保留；选择的段落保持原字体、字号与段落格式。页面设置及源分节、页眉和页脚会替换，不能保证原分页或原页眉页脚对象。复杂对象、修订和异常结构请对照原稿检查；部分结构和高于 3 级的标题会出现结果提示，高于 3 级的标题文字可保留为普通段落。这不等于完整文档检查。
- **平台与要求**：网页端是电脑上的本地预览，iPhone/iPad 通过同一局域网访问；Android 可离线使用。教师或学校要求优先于预设。

## English

### Quick start

1. On the main page, choose **MLA 9**, **APA 7 · Student paper**, or **Custom course template**, then enter your name and title.
2. For APA, complete your affiliation, course, instructor and due date. Put the reference-section heading on its own paragraph at the end of the draft, followed by one entry per paragraph.
3. For custom formatting, expand the web template settings or open **Edit / create template** on desktop, adjust the layout and save it. Up to 20 named templates can be stored. The second-level **Advanced customization** settings contain page-number position, starting number and cover numbering.
4. To keep some paragraphs unchanged, choose a DOCX, read its Word paragraphs under advanced options, then select paragraphs or enter ranges such as `2, 4-6`.
5. Generate the Word document, review result messages, then download or save it. The paper illustration shows layout rather than your draft text.

Try importing the [A4 course report example](../examples/course-report-a4.json): Arial 11 pt, 1.5 spacing, 2.5 cm margins and a 1 cm first-line indent, with bottom-center numbering, an unnumbered separate cover and body numbering starting at 1. Adjust this demonstration profile for your course.

APA/custom conversion keeps Markdown fences and their contents as literal text with line breaks; `#` or `References` inside a fence is not treated as a heading.

### 1. Layout overview

| Layout | Purpose | Main behavior |
| --- | --- | --- |
| **MLA 9** | The existing common MLA 9th edition layout | Surname-and-page header, first-page block, 0.5-inch first-line indent, and an alphabetized Works Cited page on a new page |
| **APA 7 student** | Page layout for APA 7th edition student papers | Title page, page-only header, repeated body title, References page and APA heading levels |
| **Custom course template** | Save a reusable set of course or personal layout choices | Multiple named local presets that adjust page and paragraph layout through the field table |

All three layouts share the same formatting core and use the same rules on desktop, local web and offline Android; platform interfaces may differ. DOCX paragraph selection is covered in section 5, and limits in section 6.

### 2. MLA 9

The existing MLA 9 layout is unchanged: Letter paper, 1-inch margins, Times New Roman 12 pt, double spacing and a 0.5-inch first-line indent; a first-page information block with a centered title; a surname-and-page header at the top right; and a Works Cited page that starts on a new page, has a centered heading, is sorted alphabetically and uses 0.5-inch hanging indents. Default dates use the English day-month-year form; manually entered date text is kept as written.

### 3. APA 7 student layout (v2.4.0 in development)

| Item | Layout behavior |
| --- | --- |
| Title page | Includes the title, author/name, affiliation (school/department), course, instructor and due date |
| Page number and header | Right-aligned page number at the top right; no surname and no running head |
| Start of body | The title repeated, bold and centered |
| Page and type | Letter paper, 1-inch margins, Times New Roman 12 pt, double spacing |
| Body | 0.5-inch first-line indent |
| References | New page, bold centered heading, 0.5-inch hanging indents, and sorting by each complete entry's initial text |
| Headings | Existing DOCX Heading 1–3 and Markdown `#`, `##`, `###` are represented as APA heading levels 1–3; heuristic heading detection remains opt-in. Title and heading capitalization is unchanged; check it against course requirements |

APA's official guidance, for understanding the layout: [Paper format](https://apastyle.apa.org/style-grammar-guidelines/paper-format) · [Title page](https://apastyle.apa.org/style-grammar-guidelines/paper-format/title-page).

### 4. Custom course templates (v2.4.0 in development)

Custom templates save and reuse a set of layout settings:

- Store multiple named presets in desktop settings, browser `localStorage` on the web, and local app storage on Android.
- Desktop, web and Android support save, select, delete and import/export.
- Desktop and web use a **bare JSON file** for import/export.
- Android uses the template transfer dialog's text box to copy or paste JSON.
- Each interface reads its own local settings; a template created on desktop does not automatically appear on the web or Android.
- Exported JSON contains layout settings only, not documents, drafts, citations or other preset lists.

#### Advanced customization: page numbers

Open the second-level **Advanced customization** settings inside the template settings. Choose top right, bottom center or bottom right numbering, and a starting number from 1–9999. Cover numbering is enabled by default. With a separate cover and its number hidden, the cover is excluded from numbering and the first body page starts at the selected number `N`. For example, setting `3` leaves the cover unnumbered and labels the first body page `3`.

Numbering options are disabled with `header: "none"`; cover numbering is disabled without a separate title page. Built-in MLA and APA presets keep their default numbering rules; use a custom course template to change these settings.

#### Fields and bounds

| Field | Type and range | Default | Meaning |
| --- | --- | --- | --- |
| `label` | String, 1–60 characters | `Course template` | Preset name |
| `paper_size` | `Letter` or `A4` | `Letter` | Paper size |
| `font_name` | One of `Times New Roman`, `Arial`, `Calibri`, `宋体`, `黑体` | `Times New Roman` | Body font |
| `font_size` | Number, 8–24 | `12` | Font size in pt |
| `line_spacing` | Number, 1–3 | `2` | Line-spacing multiple; `2` is double spacing |
| `margin_cm` | Number, 0.5–5.08 | `2.54` | Page margin in cm |
| `first_line_cm` | Number, 0–2.54 | `1.27` | Body first-line indent in cm |
| `alignment` | `left` or `justify` | `left` | Body alignment |
| `header` | `surname_page`, `page` or `none` | `page` | Number content: surname plus page / page only / no numbers; position is set below |
| `page_number_position` | `top_right`, `bottom_center` or `bottom_right` | `top_right` | Position of the page number |
| `page_number_start` | Integer, 1–9999 | `1` | First numbered page's value; applies to the first body page when the cover number is hidden |
| `show_cover_page_number` | Boolean | `true` | Whether a separate cover is numbered; `false` starts numbering in the body |
| `title_page` | Boolean | `false` | Whether to create a title page |
| `references_title` | String, 1–80 characters | `References` | Reference-page heading text |
| `sort_references` | Boolean | `true` | Whether to sort reference entries by initial text |

#### JSON example

The following is a valid bare JSON object using all defaults. Its top level is the template fields themselves; do not add another wrapper.

```json
{
  "label": "Course template",
  "paper_size": "Letter",
  "font_name": "Times New Roman",
  "font_size": 12,
  "line_spacing": 2,
  "margin_cm": 2.54,
  "first_line_cm": 1.27,
  "alignment": "left",
  "header": "page",
  "page_number_position": "top_right",
  "page_number_start": 1,
  "show_cover_page_number": true,
  "title_page": false,
  "references_title": "References",
  "sort_references": true
}
```

The [A4 example](../examples/course-report-a4.json) sets `page_number_position` to `bottom_center` and `show_cover_page_number` to `false`, together with `title_page: true` and `page_number_start: 1`. Its cover has no number; the body starts at `1` centered in the footer.

Import and export notes:

- Use the field names, types, bounds and allowed values above; do not add an outer wrapper or document content when importing.
- One exported JSON object describes one template configuration. It carries no paper text and does not sync account or cloud data.
- Older templates without the three new numbering fields receive defaults of `top_right`, `1` and `true`. Paragraph-preservation selections are not template fields.
- Clearing browser site data may remove web templates; copy or export the JSON first if you want a backup.
- Still check the header, title page and reference page after generating.

### 5. DOCX paragraph selection and object retention

Open **Advanced options → Keep selected paragraphs unchanged** and read the current Word draft. The paragraph-preservation entry under template **Advanced customization** opens the same options. Select multiple paragraphs, select all, clear the selection, or enter ranges such as `2, 4-6`; applying a range replaces the selection.

- **IDs:** follow actual paragraph positions in the source DOCX body. Empty paragraphs are hidden, so IDs may have gaps. Body paragraphs containing only images are shown as well.
- **Formatting:** selected paragraphs keep their fonts, sizes, line spacing, indentation and other paragraph formatting. Document-wide paper size, margins, numbering, source sections, headers and footers are rebuilt for the current template. Original pagination may change.
- **Draft lifecycle:** selections belong only to the current document, not saved course templates or exported template JSON. Changing or removing the draft clears them. Reading records a source fingerprint; if the file contents change, read the paragraphs again and select what to preserve. Android restores the same draft's selections after rotation or folding recreates the interface.
- **Body images and tables:** retained from the source DOCX package without individual selection. Tables are kept whole; individual paragraphs inside tables cannot be selected. Images in original headers/footers are outside body-image retention.
- **References:** with sorting enabled, preserved paragraphs or objects limit sorting to consecutive safe ordinary entries. A result message asks you to check the order manually. Citation text is unchanged.
- **TXT / Markdown:** paragraph-preservation selection is unavailable. Image links and syntax do not embed images automatically; fenced code is retained as text.

The result shows counts of paragraphs kept unchanged, body images and tables. Compare complex documents with the original.

### 6. Limits

MLAFMT handles layout only. It does not create or verify citations, or assess whether a paper meets course requirements.

- **APA references:** MLAFMT does not parse, rewrite or verify in-text citations or entry content, and does not implement complex same-author/year bibliographic ordering. No professional-paper running head or author note is produced.
- **Template scope:** only the listed layout fields are supported. There is no account or cloud sync.
- **Conversion contents:** body images and tables are retained from the source DOCX package, and selected paragraphs keep their fonts, sizes and paragraph formatting. Page settings, source sections, headers and footers are replaced; original pagination and header/footer objects are not guaranteed. Compare complex objects, revisions and unusual structures with the original. Warnings may identify some structures or headings above level 3; higher-level heading text may appear as ordinary paragraphs. This is not a complete document check.
- **Platforms and requirements:** the web app is a local preview on the computer, with iPhone/iPad access over the same LAN; Android works offline. Instructor or institution requirements take priority over presets.

## 参考 / References

- APA Style — Paper format: <https://apastyle.apa.org/style-grammar-guidelines/paper-format>
- APA Style — Title page: <https://apastyle.apa.org/style-grammar-guidelines/paper-format/title-page>
