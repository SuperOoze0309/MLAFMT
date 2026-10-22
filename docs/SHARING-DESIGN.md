# 静态站模板分享与参考文献排版设计

> 状态：**FC1 课程模板码与 ShareV1 分享 JSON 已在 v2.6.0 静态网页版上线；v2.7.0 源码已加入本地参考文献助手与安全更新提示，正在验收，尚未部署。** [线上网站](https://formcapy.com/)仍为 **v2.6.0**，[离线下载](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0)仍为 **v2.5.0**，不包含模板码或参考文献助手。没有后端或账号系统；本轮不发布新的桌面或 Android 安装包。
>
> 本文保留 v2.5.0 调研与后续设计历史，并记录当前实现。全部范围针对纯静态网站：无服务器应用、无数据库、无账号、无集中模板存储、无模板提交服务、无分析统计。`formcapy.com` 的静态 HTML/JS 之外不新增运行时服务。

## 1. 课程模板分享（v2.6.0 静态网页版，已上线）

### 1.1 目标与边界

老师或同学可以把“排版设置 + 课程标签”复制成一串 **模板码** 发给对方；接收者在“导入模板”中粘贴，预览后明确应用。本轮按用户决定取消分享链接方案，不生成或自动读取 URL fragment。

- 模板码完整自带数据，不是需要后台查询的随机 ID；不需要服务器、账号、数据库、模板目录或短码服务。
- 普通编辑不会自动生成码、改写地址栏或保存课程标签。只有用户明确复制或导出时才产生分享内容。
- 修改设置后需重新复制；旧码不会更新，也没有远程撤销、集中更新或访问统计。
- 学校名称、学校简称、课程代码、校区／学期分别由用户填写，可留空，不互相推导，不声明全局唯一或学校认证。
- 不从当前文稿自动带入正文、论文标题、姓名、教师、文件字节、段落保留选择或生成结果。模板名称和主动填写的标签按预览分享，持有者可以读取。
- 保存到“我的模板”仍只存 19 项排版字段；课程标签留在当前会话，刷新或关闭后不保留。模板码和分享 JSON 可连同标签留存；兼容裸 JSON 不含标签。

### 1.2 FC1 模板码

```text
FC1.<base64url(UTF-8 canonical packed JSON)>
```

- `FC1.` 是冻结的码版本前缀，不随应用版本号变化；未知版本不猜测迁移。
- packed JSON 将全部 19 项设置和全部 4 项标签按冻结顺序放进数组；枚举使用固定索引，布尔值使用 `0` 或 `1`。省去重复字段名，不省略备用数值或空标签，不依赖未来的应用默认值。
- 不使用压缩库。它通常比直接编码完整字段名的 JSON 短，但不是固定 30 位短码；名称和标签越长，码越长。
- canonical packed JSON 使用 UTF-8，再做无填充 base64url（`-` / `_`，不带 `=`）。不把 Unicode 文字直接交给 `btoa`。
- 完整码的硬上限为 **8,192 个 ASCII 字符**，解码后 JSON 为 **4,096 个 UTF-8 字节**。超过时提示缩短模板名称或课程标签；不自动截断，也不生成后台短码。
- 不加入时间戳、随机数、域名、UA 或应用版本等环境值；相同完整设置与标签产生相同模板码。
- 模板码不是加密或保密容器。分享前检查名称和标签；持有码的人可以在本地读出数据，码也可能留在剪贴板或聊天记录中。

#### 冻结的 packed 映射

顶层是长度为 2 的数组：`[settingsValues, labelValues]`。两个子数组分别必须恰好有 19 项和 4 项，不接受缺项或多项。

`settingsValues` 按以下顺序排列，索引从 0 开始：

```text
label, paper_size, font_name, font_size, line_spacing, margin_cm,
first_line_cm, alignment, header, title_page, references_title,
sort_references, page_number_position, show_cover_page_number,
page_number_start, typography, latin_font_name, first_line_chars,
line_spacing_pt
```

`labelValues` 顺序为：`school_name, school_abbr, course_code, campus_term`。

| 枚举字段 | 从索引 0 开始的冻结值表 |
| --- | --- |
| `paper_size` | `Letter`, `A4` |
| `font_name` | `Times New Roman`, `Arial`, `Calibri`, `宋体`, `黑体` |
| `alignment` | `left`, `justify` |
| `header` | `surname_page`, `page`, `none` |
| `page_number_position` | `top_right`, `bottom_center`, `bottom_right` |
| `typography` | `western`, `chinese` |
| `latin_font_name` | `Times New Roman`, `Arial`, `Calibri` |

`title_page`、`sort_references`、`show_cover_page_number` 三项布尔值严格映射为 `false → 0`、`true → 1`。其余数值和字符串保留原类型，不能把数字字符串自动转为数字。下节的完整默认配置对应：

```json
[["Course template",0,0,12,2,2.54,1.27,0,1,0,"References",1,0,1,1,0,0,0,0],["","","",""]]
```

### 1.3 固定 ShareV1 envelope 与默认值

以下是 **ShareV1 独立冻结的默认 envelope**，其中 `settings` 列全 19 项字段。它以 2.5.0 当前字段为起点，但不是运行时 `DEFAULT_CUSTOM_PROFILE` 的别名；未来新增设置或修改应用默认值，不得改变 v1 数据的解释。具体课程配置在生成时填入各项实际值，不能仅导出与默认值的差异。

```json
{
  "schema": "formcapy-template",
  "v": 1,
  "settings": {
    "label": "Course template",
    "paper_size": "Letter",
    "font_name": "Times New Roman",
    "font_size": 12,
    "line_spacing": 2,
    "margin_cm": 2.54,
    "first_line_cm": 1.27,
    "alignment": "left",
    "header": "page",
    "title_page": false,
    "references_title": "References",
    "sort_references": true,
    "page_number_position": "top_right",
    "show_cover_page_number": true,
    "page_number_start": 1,
    "typography": "western",
    "latin_font_name": "Times New Roman",
    "first_line_chars": 0,
    "line_spacing_pt": 0
  },
  "labels": {
    "school_name": "",
    "school_abbr": "",
    "course_code": "",
    "campus_term": ""
  }
}
```

协议字段规则：

- 顶层只接受 `schema`、`v`、`settings`、`labels` 四项，值和类型必须符合 ShareV1；`settings` 必须包含上面列出的全部 19 项，缺项或任何层级的未知 key 一律拒绝，不警告后忽略，也不从未来应用默认值补齐。
- `labels` 的四项在编辑界面均可留空；canonical envelope 中必须列全，以空字符串表达未填写。`school_name`、`school_abbr`、`course_code`、`campus_term` 分开存储，不互相推导。
- `UCSBLING36`、`COCENGL1001C`、`CSWMP16` 只作为用户输入示例：它们可能是课程代码、专业缩写或老师自定义写法；不得据此猜测学校全名，也不得假设全局唯一。
- `school_name` 允许 Unicode、空格和本地命名；`course_code` 允许 Unicode/空格/连字符；不强制大写或某种分隔符。
- 标签只是“这个模板的说明文字”，不是学校官方名称、不是课程注册 ID、不是模板全局身份。接收者看到的学校/课程信息以发送者填写为准。

冻结的 `settings` 取值规则与 2.5.0 当前实现一致：

| 字段 | ShareV1 类型与范围 | v1 默认值 |
| --- | --- | --- |
| `label` | 非空字符串，最多 60 个 Unicode 码点 | `Course template` |
| `paper_size` | `Letter` / `A4` | `Letter` |
| `font_name` | `Times New Roman` / `Arial` / `Calibri` / `宋体` / `黑体` | `Times New Roman` |
| `font_size` | 有限数值，8–24 | `12` |
| `line_spacing` | 有限数值，1–3 | `2` |
| `margin_cm` | 有限数值，0.5–5.08 | `2.54` |
| `first_line_cm` | 有限数值，0–2.54 | `1.27` |
| `alignment` | `left` / `justify` | `left` |
| `header` | `surname_page` / `page` / `none` | `page` |
| `title_page` | 布尔值 | `false` |
| `references_title` | 非空字符串，最多 80 个 Unicode 码点 | `References` |
| `sort_references` | 布尔值 | `true` |
| `page_number_position` | `top_right` / `bottom_center` / `bottom_right` | `top_right` |
| `show_cover_page_number` | 布尔值 | `true` |
| `page_number_start` | 整数，1–9999；布尔值不是整数输入 | `1` |
| `typography` | `western` / `chinese` | `western` |
| `latin_font_name` | `Times New Roman` / `Arial` / `Calibri` | `Times New Roman` |
| `first_line_chars` | 有限数值，0–4 | `0` |
| `line_spacing_pt` | 有限数值，0–60 | `0` |

`line_spacing_pt > 0` 时采用固定磅值，否则采用 `line_spacing` 倍数；`first_line_chars > 0` 时采用字符缩进，否则采用 `first_line_cm`。备用值也完整保留并校验。协议的“相同配置”指全部字段和标签相同，不能因为两组配置暂时呈现同一版式，就省略它们不同的备用数值。

### 1.4 规范化与兼容 JSON

- canonical 字节使用 RFC 8785 JCS 的数值与字符串规则：ECMAScript 数字序列化、对象键按 UTF-16 码元排序、无多余空白、UTF-8。packed 数组保持冻结顺序。仅接受有限 IEEE 754 数值、合法 Unicode；拒绝重复属性名、未配对 surrogate 和非规范编码。
- 模板码流程为：完整 ShareV1 校验 → 冻结 packed 映射 → canonical JSON → UTF-8 → 无填充 base64url。接收端严格解码、校验并重新编码比对，拒绝非 canonical payload、非法 pad bits 或多余填充。
- 分享 JSON 继续使用上面的 `schema: "formcapy-template"`、`v: 1`、全 19 项 `settings`、全 4 项 `labels` 对象，不使用 packed 数组作为文件格式。可接受可读缩进；文件输入上限 **4,096 字节**。
- **保留兼容裸 profile JSON**：原“导出模板”仍只输出排版字段，不静默改成分享包装。旧裸 JSON 走既有兼容路径和 **32 KB** 文件上限；新增“导出分享 JSON”才包含标签和版本化包装。
- 分享协议不从当前默认值补缺失字段，不做 Unicode 归一化、大小写转换或静默修剪。旧版 bare JSON 的默认字段补齐不等于 ShareV1 允许缺项。
- `settings.label` 会进入分享数据。选中“本次分享使用通用名称（不修改当前模板名）”时，仅本次分享使用通用名；不改当前模板名。
- 当前 v2.5.0 安装包不识别 FC1 或 ShareV1 包装；与旧桌面／Android 版本交换时使用兼容裸 JSON。

### 1.5 UI 流程

发送者在自定义模板编辑区展开 **分享课程模板**：

1. 填写可选的学校名称、学校简称、课程代码、校区／学期。
2. 可选“本次分享使用通用名称（不修改当前模板名）”。
3. 点击 **复制模板码** 或 **导出分享 JSON**，核对只读预览中的完整设置和标签后分享；复制失败时显示可选中的内容供手动复制。

接收者：

1. 点击 **导入模板**，粘贴 FC1 模板码或任一种模板 JSON，或选择 JSON 文件。
2. 点击 **预览模板**，在独立预览中核对纸张、字体、行距、缩进、页边距、页码、参考文献设置和四项标签。
3. 点击 **应用此模板** 才改变后续生成使用的排版设置；取消或校验失败不改变当前状态。
4. 不自动保存或覆盖已保存模板，不替换草稿、段落保留选择、已有生成结果或论文信息。
5. 再点 **保存模板** 可把排版设置加入“我的模板”；四项课程标签需通过码或分享 JSON 留存。

分享提示应明确：**模板码和分享 JSON 包含模板名称、排版设置与所填课程标签，不自动带入草稿或论文信息；持有者可以读取。** 用户可能主动把个人信息写在名称或标签中，不能对这些文本承诺保密。

### 1.6 校验与安全

校验在浏览器内、应用状态之外完成，不联网查询模板：

- 先检查码的 ASCII 字符、前缀和 8,192 字符上限，再检查解码 JSON 的 4,096 字节上限；UTF-8 解码必须严格。
- packed 数组的形状、长度、枚举索引、布尔 `0` / `1` 和全部数值范围固定；解码后还需通过完整 ShareV1 校验。
- 分享 JSON 只允许 envelope 及两个直接子对象；顶层四 key、settings 19 key、labels 四 key 全部列全，缺项或未知 key 均拒绝。拒绝危险键、重复属性名、任意附加数据及错误类型。
- 字符串按 Unicode 码点计数：模板名 ≤ 60、参考文献标题 ≤ 80、学校名称 ≤ 120、学校简称 ≤ 24、课程代码 ≤ 64、校区／学期 ≤ 80；名称和参考文献标题不能全为空白。拒绝控制字符、未配对 surrogate 和 U+FFFE/U+FFFF。
- 数值必须有限且不是布尔值；页码起始值为整数，不能把空字符串或 null 转成零。备用行距和缩进也保留并校验。
- 未知版本、损坏编码、超限或非法数据给出普通错误，保留当前文稿、设置和已保存模板；不写入 localStorage。
- 标签通过 `textContent` 显示，不拼 HTML、不执行 `eval` / `Function`、不远程 fetch、不把未验证对象合并进应用状态。

### 1.7 传递与版本限制

- 码可在聊天中复制粘贴，或以分享 JSON 文件传递。不依赖域名、路径、URL fragment 或服务器查表。
- 传递渠道可能截断文本；接收者需复制完整码，校验失败时保留原设置。上限不是对任一聊天软件传递能力的保证。
- FC1 的字段顺序、枚举表和 ShareV1 的字段规则均为协议的一部分。不兼容扩展必须新建码版本，保留旧版本解释；不能改变默认值后重新解释旧码。
- 原 `#template=v1.…` 分享链接仅为被替换的历史方案，本轮不提供生成、读取或 URL 长度目标。

### 1.8 验收范围与后续清单

本地 Chromium 已手动走通模板码复制／预览／应用，以及分享 JSON 从 H 盘读取；中文和 emoji 标签可往返，西班牙语导入与错误提示正常。应用前仍保留原字号，点击应用后姓名、手动日期、草稿及旧 APA 结果和下载地址不变，未新增保存模板。兼容 JSON 仍只含 19 项排版字段；默认配置的码长 123 字符。390px 与 768px 视口检查未见横向溢出；这不代表实机验证。

v2.6.0 生产部署为 Cloudflare `a4500358`（Ready / 100%）。独立 HTTP 核对通过：124/124 个资源、root／www 的 10/10 个关键文件哈希及 15/15 个 HTTPS 检查，未发现注入的 beacon。真实 Edge 中，www 自然缓存更新后显示 v2.6.0；从 Worker 生成的模板码已在 www 西班牙语界面完成导入预览和明确应用，论文课程 `ENG 101` 未被课程标签 `LING36` 替换，手动日期 `2026-12-01` 保持原样。Worker 与 www 均按新模板成功生成文档，结果区显示 37.1 KB、3 段正文和 1 条参考文献；www 的西班牙语结果标签保留原模板名，控制台无警告或错误。公开网站实际导出的分享 JSON 含 19 项设置和 4 项标签，不含测试姓名、论文标题或手动日期。这些生成数量是页面结果，不是本轮下载 Word 文件的结构检查。

源代码另经独立只读审查和 JavaScript 语法检查。本地基础流程与公开 HTTP 核对不等于完整的协议异常覆盖；本轮未重新下载并检查 DOCX，也未验证 Safari 或物理设备。完整的协议异常与设备覆盖仍按下列清单独立记录，不能把基础操作核对等同于全部通过。

- [ ] 同一完整设置和标签无论输入对象键顺序如何，都产生相同码。
- [ ] 19 项设置和 4 项标签完整往返；备用值不丢失，应用默认值变化不影响 FC1。
- [ ] 中文、空格、emoji、组合字符不乱码；小数、负零、重复 key、错误 Unicode 与 malformed 编码覆盖。
- [ ] 模板码／分享 JSON 不自动携带草稿、论文信息、文件字节、段落选择或结果。
- [ ] 预览不自动应用；明确应用不覆盖已保存模板、不改变草稿或旧结果。
- [ ] 保存“我的模板”只保存排版；课程标签留存方式提示准确。
- [ ] 未知版本、错误类型、超限、缺字段和未知 key 可恢复，当前状态不变。
- [ ] 8,192 字符码与 4,096 字节 JSON 上限生效；兼容裸 JSON 仍保持 32 KB 与旧字段补齐。
- [ ] 通用名称只影响本次分享；编辑后复制新码，旧码保持原设置。
- [ ] 标签只通过 textContent 显示，无 HTML 注入或远程请求。
- [ ] 窄屏、平板、折叠屏与键盘可操作，无横向溢出；剪贴板失败可手动复制。


---

## 2. 参考文献助手：v2.7.0 源码实施与后续设计

v2.7.0 的结构化编辑器、独立文献库、MLA 9／APA 7 本地 CSL 渲染和独立 Word／HTML 文献列表导出已经进入源码验收。使用说明见 [CITATIONS.md](CITATIONS.md)，固定处理器、源码与许可落实见 [CITATION-LICENSES.md](CITATION-LICENSES.md)。当前公网仍为 v2.6.0。下文中的文内引用同步、原稿条目替换、GB/T、更多文献类型及其他 locale 仍属于后续设计，不能视为当前功能。

### 2.1 先区分“页面排版”和“引文内容”

原有草稿转换做的是**页面/段落布局**：纸张、页边距、字体、行距、页面标题、页码、参考文献另起页、悬挂缩进、排序等。它**保留用户已有的引用和参考文献文字**。v2.7.0 的独立助手另外接收结构化字段，由实际 CSL 处理器输出 MLA／APA 条目；这不等于解析原稿、转换原稿中的既有条目或同步文内引用，也不包括 GB/T 7714。

两条路径保持分开：

1. **布局（已有）**：参考文献页位置、标题、缩进、行距等。
2. **独立条目渲染（v2.7.0 源码，验收中）**：从用户录入的字段生成作者、年份、题名、期刊/出版社、卷期页、DOI/URL 等，使用固定的官方 MLA／APA CSL 样式，不声明学校认证。

在没有结构化数据前，不能从任意粘贴段落无损恢复作者/年份/DOI；也不能为了“看起来完整”而编造缺失字段。

### 2.2 结构化条目模型

v2.7.0 的本地模型 `static/citation-library.js` 与渲染器分离，支持书籍、期刊文章、网页：

- 独立版本化 envelope：`schema: "formcapy-citations"`、`v: 1`、`items`。
- 稳定条目 ID、个人或机构作者及作者顺序、题名、出版日期、出版社、期刊／网站、卷期页、版次、DOI、URL、访问日期、语言与可保留的原始内容。
- 最大 200 条、每条最多 50 位作者，库 JSON 最大 1 MiB；非法／未知版本或字段不会自动替换当前库。
- 默认当前会话内使用；保存到本设备、载入、删除保存副本均是明确操作。JSON 导入先预览再确认替换，可撤销；删除保存副本不删除活动库。

以下保留较完整的早期字段设计，**章节、学位论文、编者、出版地、译名等不属于本轮已支持字段**：

- 类型（期刊文章、书、章节、网页、学位论文等）。
- 作者/编者：`family`、`given`、`literal`（机构作者）、角色；支持多作者和顺序。
- 题名、容器题名（期刊/书名）、年份、月日、卷、期、页码。
- 出版社/出版地、期刊名、会议名、版本、编辑。
- DOI、URL、访问日期。
- 语言、原文/译名（如需要）。
- 每条记录保留“原始粘贴文本”作为只读对照，直到用户明确替换。

编辑器对缺失字段显示提示而不是自动填充；DOI/URL 做本地格式校验，不联网查询。标题为当前条目的必填内容；作者、日期或 DOI 并非所有资料都必须具备，缺失值按样式处理。错误字段需要修正，缺失提示不用于编造数据。切换中文、English、Español 界面只改变标签，不翻译文献字段；当前渲染仅供应 en-US locale。

文献记录、原始粘贴文本与替换历史使用**独立的本地文献命名空间**，例如 `formcapy.citations.v1` 的专用存储和独立版本化导出；不得写进 `custom_profiles`、模板偏好、ShareV1 `settings`/`labels`、模板码或裸 profile JSON。未选择保存时留在本次会话内存，保存/清除文献库均为明确动作；无账号或云端同步。模板偏好机制只继续存布局设置。

### 2.3 浏览器本地 CSL 组件与许可来源

CSL（Citation Style Language）是 XML 样式 + locale 数据 + 处理器的生态。v2.7.0 已在 `static/vendor/citations/` 固定供应未修改的 **citeproc-js 1.4.61（选择上游 CPAL 1.0 许可）**、官方 MLA／APA 样式及 en-US locale。原始源码快照、完整 CPAL／备选 AGPL／CC BY-SA 许可、作者元数据、来源及 SHA-256 与程序一起本地分发；助手有可见归属与本地许可／源码入口。实际制品与集成记录以 [CITATION-LICENSES.md](CITATION-LICENSES.md) 为准。

以下保留调研时的一手来源及备选方案；GB/T、其他 locale、Citation.js 和 citeproc-rs 未因此成为本轮依赖。原有“先分阶段评估”的文字属于历史取舍，不构成对本轮已授权实现的再次审批要求。

#### CSL 规范与 schema

- CSL 1.0.2 规范（官方文档）：<https://docs.citationstyles.org/en/stable/specification.html>
  - 规范文本采用 CC BY-SA 4.0（页面底部版权声明）。
- CSL schema：<https://github.com/citation-style-language/schema>
  - `LICENSE.txt` 为 MIT：<https://github.com/citation-style-language/schema/blob/master/LICENSE.txt>
  - 官方开发者页也说明 schema 已同意改为 MIT：<https://citationstyles.org/developers/>

#### 官方样式数据（MLA / APA / 中文 GB/T）

样式仓库：<https://github.com/citation-style-language/styles>

- 许可证：CC BY-SA 3.0 Unported；README 明确要求使用方清晰提及 CSL 项目并链接 <https://citationstyles.org/>，重分发时保留样式元数据中的作者/贡献者列表。
  - <https://github.com/citation-style-language/styles#licensing>
- 稳定版本分支：官方 README 建议下游使用对应 CSL 版本的版本分支（例如 `v1.0.2`），而不是永远跟随 `master`。

可用的具体文件（建议实现时固定到某个 tag/commit，并记录 SHA-256）：

- MLA 9：<https://github.com/citation-style-language/styles/blob/v1.0.2/modern-language-association.csl>
  - raw：<https://raw.githubusercontent.com/citation-style-language/styles/v1.0.2/modern-language-association.csl>
  - 元数据标题为 “MLA Handbook 9th edition (in-text citations)”。
- APA 7：<https://github.com/citation-style-language/styles/blob/v1.0.2/apa.csl>
  - raw：<https://raw.githubusercontent.com/citation-style-language/styles/v1.0.2/apa.csl>
  - 元数据标题为 “APA Style 7th edition”。
- GB/T 7714-2015（顺序编码制，中文）：<https://github.com/citation-style-language/styles/blob/v1.0.2/china-national-standard-gb-t-7714-2015-numeric.csl>
  - raw：<https://raw.githubusercontent.com/citation-style-language/styles/v1.0.2/china-national-standard-gb-t-7714-2015-numeric.csl>
  - 元数据标题为 “China National Standard GB/T 7714-2015 (numeric, 中文)”，`default-locale="zh-CN"`。
- GB/T 7714-2015（著者-出版年制，中文）：<https://github.com/citation-style-language/styles/blob/v1.0.2/china-national-standard-gb-t-7714-2015-author-date.csl>
  - raw：<https://raw.githubusercontent.com/citation-style-language/styles/v1.0.2/china-national-standard-gb-t-7714-2015-author-date.csl>

材料约束：

- 这些 `.csl` 是 CC BY-SA 3.0，不是 MIT；应用可以整体分发，但必须保留归属/作者元数据，修改后的样式文件需同许可共享。不要复制 APA/MLA 官方手册正文或示例作为产品文案。
- 样式文件本身不包含机构认证；GB/T 样式元数据中的作者/贡献者是个人贡献记录，不代表标准机构背书。
- 不得为了“支持中文”自造一个声称等同 GB/T 7714 的样式而不做逐条验收。

#### 官方 locale 数据

仓库：<https://github.com/citation-style-language/locales>

- 许可证：CC BY-SA 3.0；README 要求提及 CSL 项目并链接 citationstyles.org，重分发时保留译者元数据。
  - <https://github.com/citation-style-language/locales#licensing>
- 西班牙语 locale（示例）：<https://github.com/citation-style-language/locales/blob/v1.0.2/locales-es-ES.xml>
- 中文 locale（示例）：<https://github.com/citation-style-language/locales/blob/v1.0.2/locales-zh-CN.xml>
- CSL 1.0.2 规范中的 locale fallback 规则（es-ES 主方言、es-CL/es-MX 次方言；zh-CN 主方言等）：<https://docs.citationstyles.org/en/stable/specification.html#locale-fallback>

#### JS 处理器：citeproc-js

- 官方开发者页将其列为 JavaScript 处理器，已知用于 Zotero、Mendeley 等：<https://citationstyles.org/developers/>
- 仓库：<https://github.com/Juris-M/citeproc-js>（当前仍在维护）
- 许可证：**CPAL 1.0-or-later 或 AGPL 3.0-or-later（二选一）**，见 <https://github.com/Juris-M/citeproc-js/blob/master/LICENSE>
  - 这不是 MIT/Apache。v2.7.0 选择实际制品允许的 CPAL 1.0 路径，保留双许可原始声明，并落实源码、本地完整许可和界面归属；项目 MIT 不替代组件条款。分发落实记录见 [CITATION-LICENSES.md](CITATION-LICENSES.md)。
  - “只在浏览器运行”不能替代检查实际文件许可。备选 AGPL 原文仍随原始组件保存，但本轮不依赖 npm 元数据选择许可。
- 处理器本身是单文件/可构建 bundle；测试套件和文档很多，但**不能照搬其示例或手册文本**。
- 固定实际制品后还要检查其代码和许可文件：官方 npm `citeproc@2.4.63` 的包元数据写作 `AGPL-1.0`，但该制品的 JS 头和上游 LICENSE 写的是 AGPL **3+**；不能直接抄元数据形成许可清单。[实际 npm 制品](https://registry.npmjs.org/citeproc/-/citeproc-2.4.63.tgz)
- 若后续改用 Citation.js 包装，包装层的 MIT 声明也不改变 citeproc 或内嵌 CSL styles/locales 的许可；仍按处理器、样式数据、locale、其他依赖分别收集。[plugin-csl 依赖清单](https://raw.githubusercontent.com/citation-js/citation-js/main/packages/plugin-csl/package.json)

#### Rust/WASM 处理器：citeproc-rs

- 仓库：<https://github.com/zotero/citeproc-rs>
- 许可证：MPL 2.0，见 <https://github.com/zotero/citeproc-rs/blob/master/LICENSE.md>
- 现状：仓库已归档（archived，最近 push 2024-08），有 WASM 绑定但不再活跃维护；MPL 是文件级 copyleft，修改过的 MPL 文件需公开源代码。
- 可作为技术备选，但不应作为首版唯一依赖；需要自行构建/固定 wasm 产物、验证 CSL 1.0.2 覆盖率和中文 locale。

#### 当前实施结论

- v2.7.0 已同时实现结构化编辑与独立 MLA／APA CSL 渲染；它不接管原稿引用，输出为单独文献列表。
- citeproc-js 采用未修改原始文件与 CPAL 1.0 分发路径；citeproc-rs 只保留作历史备选，没有随产品引入。
- 处理器、样式及 en-US locale 均自托管、固定版本和 SHA-256，随构建产物提供原始源码、许可及可见归属，不从 CDN 运行时拉取。处理器按真实字节识别为 1.4.61，不照上游有冲突的 package 元数据重命名。
- DOI/URL 仅作为本地输入字段，不进行在线查询。GB/T 条目和其他 locale 仍需后续实现与独立验收。

### 2.4 排序、标点、姓名和斜体

- 排序：参考文献顺序由样式定义的 `cs:sort` 与处理器状态共同决定，不能用简单 `localeCompare` 冒充。生成后的条目顺序和样式编号必须原样进入输出管线，不能再被现有 formatter 的按文本排序或 `sort_references` 选项二次改写。
- 文中引用同步：保留稳定的文献 `item.id`、文档内 `citationID`、引用位置和有序 citation clusters，交由处理器处理首次出现顺序、重复引用、定位信息与消歧。插入/删除/移动引用可能同时影响多个文中引用和文献列表，应用时应把这些更新作为一个可撤销事务，不能只更换文末数字。[citeproc-js citation-cluster 接口](https://citeproc-js.readthedocs.io/en/latest/running.html#processcitationcluster)
- GB/T 顺序编码制在获得完整映射前，不自动重排既有参考文献编号，也不通过正则猜测原稿 `[1]` 对应哪条记录。第一阶段可独立编辑/导出文献库；后续渲染若尚无文中引用映射，只能预览或导出**独立文献列表**，不能据此替换原稿已编号列表或声称完成整篇同步。
- DOI/URL：是否输出、是否带 `https://doi.org/`、末尾是否有句点、访问日期格式都由样式决定；不要手工拼接。缺失 DOI 时不要生成假 DOI。
- 作者姓名：使用 CSL 的姓名变量与 `initialize-with`、姓名顺序、`et-al` 规则；中文/西文混排要保留姓名原文，不能把机构作者强行拆成姓/名。
- 日期：文献条目的日期按所选样式和 locale 渲染；论文抬头/封面的 MLA/APA 日期继续按 formatter 规则，中文 GB/T 条目使用对应的 `zh-CN` locale。用户手填的论文日期不因 UI 语言切换被改写，不能与文献出版日期字段混为一谈。
- 富文本：处理器结果转换为经过 allowlist 校验的结构化 run/块数据，保留文字顺序、粗体、斜体、小型大写、上下标、适用的下划线、链接及换行边界，再映射到 DOCX 属性。只有 `{text, italic, bold}` 不足以表达完整结果。预览不直接插入未经清理的 HTML；链接仅在允许的协议下创建，不自动访问目标。遇到当前 renderer 无法表达的样式应提示并保留原条目，不能静默降为纯文本。
- 文献块布局：处理器的 `makeBibliography()` 还返回 `hangingindent`、`entryspacing`、`linespacing`、`second-field-align`、`maxoffset`、`entry_ids` 等参数。renderer 应使用它们设置条目缩进、内部与条目间行距、编号对齐和条目映射，不能把 CSL 当作仅产生标点和文字。[makeBibliography 返回值](https://citeproc-js.readthedocs.io/en/latest/running.html#makebibliography)
- 缺失字段：按文献类型和样式提示需要核对的字段；没有 DOI 等可选信息不自动判为错误。允许用户保留原条目或补字段。**绝不静默编造元数据**，也不承诺把任意粘贴文本无损解析成结构化字段。

### 2.5 原稿保留与后续替换设计

本轮只生成独立列表，以下针对原稿内“替换此条”、diff 和引用映射的步骤是后续约束，尚未提供对应入口。文献库条目删除和库替换的撤销已在独立助手实现，不等于原稿引用替换。

- 现有草稿中的参考文献文字继续原样保留；新增结构化条目只能追加或由用户明确“替换此条”后替换。
- 替换前显示 diff/预览（作者、年份、题名、DOI 变化），并保留撤销或原始文本。
- 纸张、页码、页边距、参考文献页位置等文档级布局仍由 formatter 控制；CSL 结果同时提供条目富文本、顺序、编号和文献块内部布局，由 formatter 的专用渲染路径落实。该路径不能再次按普通参考文献规则重排或覆盖 CSL 指定的富文本和条目布局。
- 只有结构化数据与原稿引用映射都充分时，才允许明确应用到对应的既有文献列表。文中引用关联未建立时，独立列表预览/导出与原稿替换分开；不能隐式认领现有纯文本编号。
- 如果样式渲染失败，回退到原文，不生成半条记录或空白条目。

### 2.6 分阶段范围

**Phase 0（已发布的 2.5.0，历史范围）**：仅记录分享和文献处理设计；有兼容裸 JSON 导入导出，无模板码／分享包装或文献库，不含 CSL 依赖。离线下载仍为此版本。

**Phase 1A（v2.6.0 静态网页版，已上线）**：

- 实现 FC1 模板码和 ShareV1 分享 JSON 的本地预览与明确应用，保留兼容裸 JSON；不加入文献编辑或渲染。

**Phase 1B／独立 Phase 2（v2.7.0 源码，开发与验收中，尚未上线）**：
- 三类结构化参考文献编辑器、独立本地文献库、按类型提示字段；默认会话内使用，显式保存／载入／删除保存副本。
- 库 JSON 导入预览、明确替换及撤销；库内容不进入模板码、模板偏好或排版 JSON。
- 自托管 citeproc-js、官方 MLA／APA 样式和 en-US locale，输出预览、复制、独立 Word／HTML 文献列表；保留处理器顺序、富文本、安全链接与文献块布局。
- 安全新版提示：启动即注册 SW，用户先保存再确认更新；处理中或其他同作用域标签页存在时阻止激活。v2.6.0 旧页面须正常升级一次，才具备新提示。

**Phase 2B（后续原稿引用联动，未实现）**：

- 建立结构化文献与原稿文内引用的完整映射，支持关联更新、替换前差异预览及原稿层面的撤销。
- 需要时增加其他文献类型与 locale；继续限制非同源资源与元数据查询，保留同源程序／样式／locale 加载。
- 在完整映射及独立验收前，维持独立列表预览／导出范围，不替换原稿已有编号。

**Phase 3（中文扩展）**：

- GB/T 7714 顺序编码/著者-出版年两种样式；中文 locale；中英混排姓名/标点验收。
- 明确“通用基础版，不保证学校专用细则”；不生成摘要/目录/学校封面。

### 2.7 验收清单（参考文献）

这是覆盖当前独立助手及未来原稿联动的完整维护清单，并未全部完成。源码、协议和 Word 结构检查与浏览器、生产分发、设备检查分开记录；当前 v2.7.0 尚未部署，不能用历史 v2.6.0 网站结果证明新助手的公开下载或设备流程。

- [ ] 页面布局与条目文字分离；UI 不声称已按 MLA/APA/GB/T 格式化，除非实际由处理器输出。
- [ ] 结构化字段缺失时提示，不编造作者/年份/DOI。
- [ ] 原文保留；替换必须显式确认并可撤销。
- [ ] 文献库、原始引用文本和替换历史不进入模板偏好、裸 profile、ShareV1 或模板码；独立保存/清除与导出行为明确。
- [ ] DOI/URL 标点、作者姓名、日期、斜体由样式/locale 决定，不手工拼接。
- [ ] 中文/西文姓名、机构作者、多作者、`et-al` 有回归样本。
- [ ] 富文本 run、上下标、小型大写、链接和换行边界在 DOCX 保留；无法表达的样式不静默降级。
- [ ] `hangingindent`、`entryspacing`、`linespacing`、`second-field-align`、`maxoffset` 和 `entry_ids` 被 renderer 正确应用；CSL 输出不会再次按文本排序。
- [ ] 文中引用与文献列表的顺序/编号/消歧使用同一处理器状态；引用增删移动或重复出现后同步更新且可整体撤销。
- [ ] 缺少文中引用映射时只预览/导出独立列表，不改写原稿的编号和既有列表。
- [ ] 处理失败回退原文，不产生空条目。
- [ ] 所有资源自托管、固定版本/SHA-256、无运行时 CDN；许可/归属随产物发布。
- [ ] 生产构建复核已选 CPAL 1.0 的源码、完整许可、归属和固定资产分发记录；citeproc-rs 仍为未采用的历史备选。

### 2.8 未决问题

- 将来是否需要另一个带压缩的码版本；FC1 保持当前无压缩库的冻结表示。
- 更换已冻结的字段名、顺序、枚举表、范围或默认值需要新协议版本，不能改变既有 FC1 数据的解释。
- 新组件、样式或 locale 的后续变更需重新记录来源、许可、完整资产及验证范围；当前 citeproc-js／MLA／APA／en-US 的选择和分发已记录。
- 中文 GB/T 样式的学校差异（序号、文献类型标识、标点）如何提示用户核对。
- 是否需要从 DOCX 现有文本中提取结构化字段；首版建议不做自动解析，只做手工结构化编辑。

---

## 3. 当前交付状态

- FC1 模板码、ShareV1 分享 JSON、预览和明确应用：**v2.6.0 静态网页版已上线**；当前 v2.5.0 安装包不含此功能，本轮不发布新 APK 或桌面包。
- 分享链接、`#template=` 自动读取：**已取消，不在本轮范围**。
- 本地 CSL 渲染器、三类结构化条目、MLA／APA 独立列表与库 JSON：**v2.7.0 源码已实现，开发与验收中，尚未上线**；操作及固定资产见 [CITATIONS.md](CITATIONS.md) 和 [CITATION-LICENSES.md](CITATION-LICENSES.md)。
- 原稿条目自动识别／替换、文内引用同步、GB/T 条目格式化及 DOI 查询：**未实现**。
- 任何后端、账号、数据库、模板托管、短链、分析统计：**不计划加入**。
- 本文保留设计与来源证据；实际许可文本、对应源码及分发落实见引用组件记录，不把项目 MIT 作为第三方许可替代。
