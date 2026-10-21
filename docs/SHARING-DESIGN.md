# 静态站模板分享与参考文献排版设计

> 状态：**提案，未实现**。当前源码为 **FormCapy 2.5.0（待发布）**，线上网站与正式下载仍为 **2.4.0**。2.5.0 源码已有本地模板 JSON 导入/导出和中文预设，本提案的分享链接、分享 envelope、结构化文献库及 CSL 渲染均未实现。没有后端或账号系统。
>
> 本提案只针对纯静态网站：无服务器应用、无数据库、无账号、无集中模板存储、无模板提交服务、无分析统计。`formcapy.com` 的静态 HTML/JS 之外不新增运行时服务。

## 1. 课程模板分享（下一版）

### 1.1 目标与边界

目标：让老师或同学把“排版设置 + 课程标签”作为一个**固定、可复现的 URL fragment** 发给另一个人；接收者在本地预览后明确选择是否应用。

这不是“自动把当前页面状态持久化到 URL”：只有用户点击“复制分享链接”时才生成 fragment；普通编辑不会自动改写地址栏，也不会自动写入 localStorage。

不做：

- 不生成随机短链、不做短链服务、不做服务器查询或模板 ID 注册。
- 不把分享链接当成长期云端存储；没有“撤销”“更新所有已分享链接”或访问统计。
- 不把学校名称、课程代码或缩写声明为全校/全国唯一标识，也不暗示学校认证。
- 不从当前文稿自动带入草稿正文、论文标题、姓名、教师个人信息、文件字节、段落保留选择或生成结果；模板名称和用户主动填写的课程标签按预览内容分享，不承诺链接中这些文本的保密性。

### 1.2 URL 形式

```text
https://formcapy.com/#template=v1.<base64url(UTF-8 JSON)>
```

- 使用 fragment（`#` 后内容）而不是 query string：正常 HTTP 资源请求不包含 fragment，静态托管可继续只返回同一根页面。**fragment 不是加密或保密容器**：页面脚本能读取它，完整链接也可能留在浏览器历史、书签、剪贴板和转发消息中；不增加采集 `location.href` 或 fragment 的统计代码。[RFC 3986 §3.5](https://www.rfc-editor.org/rfc/rfc3986#section-3.5)
- `<payload>` 是对规范化 JSON 的 UTF-8 字节做 **base64url**（`-`/`_`，去掉 `=` 填充）。
- 版本放在 payload 前：`v1.`，并与 envelope 的整数 `v: 1` 相符。协议版本独立于应用的 `2.5.0`；未来不兼容时使用 `v2.`，不得让旧页面把未知版本猜成 v1。
- 初始不压缩。完整公开分享 URL 的生成目标为 **不超过 2,000 个 ASCII 字符**，超过时提供分享 JSON 文件，不默认复制超长 URL；这是一项产品互操作目标，不是浏览器或聊天软件的统一标准。
- 接收端另设 **8,192 字符 fragment 硬上限**与 **4,096 字节解码后 JSON 硬上限**，见 §1.6；解析硬上限不意味着这么长的链接能被所有聊天软件或二维码完整传递。
- 不依赖 URL 缩短服务。URL fragment 必须携带完整 payload，不能仅放一个短 digest 就声称能恢复任意新模板。只有已部署到静态目录的已知模板，才可能通过固定 ID/digest 查表；本轮不增加模板目录写入服务。

### 1.3 固定 ShareV1 envelope 与默认值

以下是 **ShareV1 独立冻结的默认 envelope**，其中 `settings` 列全 19 项字段。它以 2.5.0 当前字段为起点，但不是运行时 `DEFAULT_CUSTOM_PROFILE` 的别名；未来新增设置或修改应用默认值，不得改变 v1 链接的解释。具体课程配置在生成时填入各项实际值，不能仅导出与默认值的差异。

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

### 1.4 规范化与可复现

- canonical 字节采用 **RFC 8785 JSON Canonicalization Scheme（JCS）**，不能以“递归排序后调用任意 JSON serializer”替代。JSON 语法本身没有统一的 canonical 数字表示。[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)
- JCS 使用 ECMAScript 数字序列化、按原始键名的 UTF-16 码元排序、无额外空白、UTF-8 输出。仅接受有限 IEEE 754 数值；拒绝重复属性名、无效 Unicode 和未配对 surrogate。ShareV1 不包含数组或任意深层对象。
- 业务输入清理应在生成 envelope 前完成；canonical 阶段不再修剪字符串、不做 NFC/NFKC 归一化或大小写转换。接收端原样保留已验证的 v1 值，不能把当前默认值或新的清理规则悄悄应用到旧链接。
- 流程固定为：完整 ShareV1 校验 → JCS → UTF-8 → 无填充 base64url。接收端严格解码、拒绝重复 key 并校验 schema 后，重新 canonical 化，检查 URL 中的原始字节与 canonical 字节相同；非 canonical URL payload 拒绝。文件导入可接受可读缩进，再按同一规则重新生成分享数据。
- 分享 URL 中仅允许规范的 base64url 字符和无填充表示；重新编码结果必须与输入一致，拒绝非法长度或非规范 pad bits。中文等 Unicode 字符必须先转为 UTF-8 字节，不能直接 `btoa(unicodeText)`。[RFC 4648 §5](https://www.rfc-editor.org/rfc/rfc4648#section-5)
- JavaScript 与 Python 等接入端须使用相同的 JCS 向量验证，包括 `1`/`1.0`、小数、`-0`、emoji、组合字符及错误 Unicode；同一完整模板和标签必须得到相同字节和 fragment。
- 不加入时间戳、随机数、当前域名、UA、版本号以外的环境值。
- `settings.label` 是模板名称，会进入链接；若用户认为名称敏感，应提供“分享时使用通用名称”选项，而不是偷偷改写。
- **保留现有裸 profile JSON 导入/导出格式**，不把已有“导出 JSON”按钮静默改成 envelope。另设“导出分享 JSON”，与链接使用同一 ShareV1 envelope。旧裸 profile 继续走现有兼容导入路径；创建分享数据时把导入后的具体设置转成完整 v1，**新分享链接只接受 ShareV1 envelope**。
- 若后续不兼容字段需新协议，通过明确的版本适配器处理；未知版本留在预览错误状态，不猜测迁移，不覆盖当前配置。

### 1.5 UI 流程

在自定义模板编辑区显示：

- **复制分享链接**：以固定公开基址 **`https://formcapy.com/`** 生成 `#template=v1...`，不能从 `location.origin` 或当前 localhost/局域网预览地址推导基址。只有用户点击时才生成；在完整 URL 不超过 2,000 字符时使用 Clipboard API，失败时显示可选中的文本；超长时提供分享 JSON 文件。
- **导出 JSON**：保留现有裸 profile 格式与各端兼容行为，只包含排版设置。
- **导出分享 JSON**：新增的独立动作，导出版本化 envelope，包含排版设置与用户选定的课程标签；界面明确区别于兼容格式。
- **导入 JSON**：现有能力，保留。

接收者流程：

1. 打开含 `#template=` 的页面。
2. 浏览器本地解码、校验 schema/版本/长度/字段。
3. 显示只读预览：纸张、字体、字号、行距、页边距、页码、参考文献设置，以及学校/课程标签。
4. 用户点击“应用此模板”才写入当前编辑状态；不自动覆盖已保存模板，也不自动保存。草稿、段落保留选择、已生成结果和论文信息不因打开或应用模板链接而被替换；只改变后续生成使用的模板设置。
5. 应用后用户可继续编辑；只有再次点击“保存模板”才进入本地模板列表。
6. 用户修改任何设置后，分享链接需要重新生成；没有服务器，所以旧链接不会跟着变，也没有撤销/更新全部。

分享提示必须写明：**分享链接和分享 JSON 包含模板名称、排版设置与所填课程标签，不自动带入草稿或论文信息；持有链接的人可以读取这些设置和标签。** 模板名称与标签由用户填写，不能保证其中没有个人信息。兼容裸 JSON 仍只含排版设置。若站点有 `public_privacy` 等其他隐私说明，应分开描述，不能把“模板链接不上传”扩大成对所有请求的承诺。

### 1.6 校验与安全

在浏览器内、应用状态之外完成：

- 读取后先检查 fragment 不超过 **8,192 个 ASCII 字符**，解码时检查 JSON 不超过 **4,096 个 UTF-8 字节**，再进行解析；`TextDecoder` 等接口使用严格 UTF-8 模式。新分享 JSON 文件采用同样的 4,096 字节输入上限；现有裸 profile 文件的导入上限不被此协议修改。
- 校验 base64url 字符集、长度、pad bits 和唯一编码；不重复做 URI 解码。JSON 解析阶段拒绝重复属性名，解析后只允许固定的三个对象（envelope 及两个直接子对象）；不接受数组、额外嵌套或任意附加数据。
- 顶层四 key、`settings` 全 19 key、`labels` 全四 key 均严格 allowlist；缺项或未知 key 一律拒绝。拒绝 `__proto__`、`constructor`、`prototype` 等危险键；不以 `Object.assign` 等方式把未验证对象合并进应用状态。
- 协议版本必须精确匹配前缀；字符串长度按 Unicode 码点计：`label` ≤ 60、`references_title` ≤ 80、`school_name` ≤ 120、`school_abbr` ≤ 24、`course_code` ≤ 64、`campus_term` ≤ 80。名称和参考文献标题不能全为空白；课程标签可以为空。拒绝控制字符、未配对 surrogate、U+FFFE/U+FFFF，与当前模板文本校验范围保持一致。
- 数字范围采用 §1.3 的冻结表；所有数值必须有限且不是布尔值，`page_number_start` 必须为整数，不能把空字符串或 `null` 转为 `0`。布尔字段必须为布尔，枚举必须命中 v1 allowlist。字号、字符缩进等当前允许的小数不被收窄成整数。
- 未知版本、损坏 base64url、非 canonical payload、超长、错误类型或未知 key 都显示普通错误并保留当前页面状态、草稿和已保存模板。
- 所有标签通过 `textContent` 写入；不拼 HTML，不执行 `eval`/`Function`，不远程 fetch，不把 URL 内容放进模板字符串再解析。
- 打开链接时不要立刻应用；预览页/对话框关闭后不改变任何设置。解码失败不写入 localStorage。

### 1.7 链接限制与域名路径

- fragment 不会因为路径变化自动迁移：今天 `https://formcapy.com/#template=...` 的链接，如果未来应用改到 `/app/` 或换域名，旧链接不会自动指向新路径。应保持根路径稳定；如必须迁移，只能靠静态托管重定向/说明页，无法保证所有旧链接。
- 链接长度受聊天软件、邮件客户端、二维码和浏览器地址栏限制；2,000 字符生成目标与 8,192/4,096 解析硬上限承担不同职责，均不保证第三方渠道不会截断链接。超出生成目标时使用分享 JSON 文件。未来若需要压缩，必须新增协议版本、限制解压后大小并保留 v1 解码。
- 没有服务器端模板 ID，所以“同一模板”只能通过规范化 payload 判断；不要引入本地随机 ID 冒充全局身份。

### 1.8 验收清单

- [ ] 同一模板不同 key 顺序 → 同一分享链接。
- [ ] v1 全 19 字段及四个标签完整往返；升级应用默认值不改变旧链接的含义；缺字段和未知 key 均拒绝。
- [ ] JS/Python 的 JCS 向量字节一致，包含小数、负零、Unicode、重复 key 拒绝和 malformed 编码。
- [ ] 中文/空格/emoji 学校名、课程代码可往返，预览不乱码。
- [ ] 链接/分享 JSON 不自动带入草稿、姓名、论文标题、教师、文件字节或段落选择；待分享的模板名称与课程标签可见且说明清楚。
- [ ] 未知版本、坏 base64、超长、错误类型、未知 key 均给出可恢复错误。
- [ ] 打开链接不自动应用；预览后明确点击才应用。
- [ ] 应用不覆盖已保存模板；保存仍是单独动作。
- [ ] localhost、局域网和公开网站均生成以 `https://formcapy.com/` 开头的公开链接。
- [ ] 长度目标与两项硬上限分别生效，超长可导出分享 JSON；现有裸 JSON 导入/导出保持兼容。
- [ ] 修改设置后生成新链接；旧链接保持旧设置。
- [ ] 标签只用 `textContent`；无 HTML 注入、无远程请求。
- [ ] 窄屏手机/平板/折叠屏可复制链接，键盘可操作，无横向溢出。

---

## 2. 参考文献条目的下一版设计

### 2.1 先区分“页面排版”和“引文内容”

当前 FormCapy 做的是**页面/段落布局**：纸张、页边距、字体、行距、页面标题、页码、参考文献另起页、悬挂缩进、排序等。它**保留用户已有的引用和参考文献文字**，不能声称把条目“按 MLA/APA/GB/T 7714 格式化”。

因此下一版必须把两件事分开：

1. **布局（已有）**：参考文献页位置、标题、缩进、行距等。
2. **条目渲染（新增，需独立验收）**：从结构化字段生成作者、年份、题名、期刊/出版社、卷期页、DOI/URL 等，并遵循某个 CSL/机构样式。

在没有结构化数据前，不能从任意粘贴段落无损恢复作者/年份/DOI；也不能为了“看起来完整”而编造缺失字段。

### 2.2 结构化条目模型

建议先做本地结构化编辑器（不依赖 CSL 渲染器）：

- 类型（期刊文章、书、章节、网页、学位论文等）。
- 作者/编者：`family`、`given`、`literal`（机构作者）、角色；支持多作者和顺序。
- 题名、容器题名（期刊/书名）、年份、月日、卷、期、页码。
- 出版社/出版地、期刊名、会议名、版本、编辑。
- DOI、URL、访问日期。
- 语言、原文/译名（如需要）。
- 每条记录保留“原始粘贴文本”作为只读对照，直到用户明确替换。

编辑器对缺失字段显示提示而不是自动填充；DOI/URL 只做格式提示，不联网查询。必填/建议字段按文献类型与所选样式确定，不能把 DOI、作者或日期当作所有类型都必须拥有的字段；缺失值的合法呈现由样式处理，不能编造数据。

文献记录、原始粘贴文本与替换历史使用**独立的本地文献命名空间**，例如 `formcapy.citations.v1` 的专用存储和独立版本化导出；不得写进 `custom_profiles`、模板偏好、ShareV1 `settings`/`labels`、模板分享链接或裸 profile JSON。未选择保存时留在本次会话内存，保存/清除文献库均为明确动作；无账号或云端同步。模板偏好机制只继续存布局设置。

### 2.3 浏览器本地 CSL 渲染候选与许可证据

CSL（Citation Style Language）是 XML 样式 + locale 数据 + 处理器的生态。若要做真正的 MLA/APA/GB/T 条目渲染，需要在浏览器本地运行一个 CSL 处理器，并自带样式/locale 文件。**本提案不新增依赖**，只记录官方一手证据和约束。

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
  - 这不是 MIT/Apache。把它打包进静态站之前，必须由项目方完成许可/分发义务评估：CPAL 的归属要求、AGPL 的对应源码/网络分发义务，以及“静态站只提供 JS”是否满足所选许可证。
  - 不能因为“只是浏览器本地运行”就假设 AGPL 不适用；这是法律/合规判断，本提案不作结论。
- 处理器本身是单文件/可构建 bundle；测试套件和文档很多，但**不能照搬其示例或手册文本**。
- 固定实际制品后还要检查其代码和许可文件：官方 npm `citeproc@2.4.63` 的包元数据写作 `AGPL-1.0`，但该制品的 JS 头和上游 LICENSE 写的是 AGPL **3+**；不能直接抄元数据形成许可清单。[实际 npm 制品](https://registry.npmjs.org/citeproc/-/citeproc-2.4.63.tgz)
- 若后续改用 Citation.js 包装，包装层的 MIT 声明也不改变 citeproc 或内嵌 CSL styles/locales 的许可；仍按处理器、样式数据、locale、其他依赖分别收集。[plugin-csl 依赖清单](https://raw.githubusercontent.com/citation-js/citation-js/main/packages/plugin-csl/package.json)

#### Rust/WASM 处理器：citeproc-rs

- 仓库：<https://github.com/zotero/citeproc-rs>
- 许可证：MPL 2.0，见 <https://github.com/zotero/citeproc-rs/blob/master/LICENSE.md>
- 现状：仓库已归档（archived，最近 push 2024-08），有 WASM 绑定但不再活跃维护；MPL 是文件级 copyleft，修改过的 MPL 文件需公开源代码。
- 可作为技术备选，但不应作为首版唯一依赖；需要自行构建/固定 wasm 产物、验证 CSL 1.0.2 覆盖率和中文 locale。

#### 结论

- 首版不应直接引入任一处理器；先完成结构化编辑与“保留原文”的验收。
- 若进入渲染阶段，优先评估 citeproc-js 的功能成熟度，但**先解决 CPAL/AGPL 许可问题**；citeproc-rs 可作 MPL 备选，但其归档状态是维护风险。
- 所有样式/locale/处理器文件必须自托管、固定版本和 SHA-256、随构建产物提供许可与归属，不从 CDN 运行时拉取。
- 首版不需要 DOI 服务器或任何在线查询；DOI/URL 只作为用户输入的字段。联网查 DOI 是另一个可选的未来功能，不在本提案范围。

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

### 2.5 保留原文与替换

- 现有草稿中的参考文献文字继续原样保留；新增结构化条目只能追加或由用户明确“替换此条”后替换。
- 替换前显示 diff/预览（作者、年份、题名、DOI 变化），并保留撤销或原始文本。
- 纸张、页码、页边距、参考文献页位置等文档级布局仍由 formatter 控制；CSL 结果同时提供条目富文本、顺序、编号和文献块内部布局，由 formatter 的专用渲染路径落实。该路径不能再次按普通参考文献规则重排或覆盖 CSL 指定的富文本和条目布局。
- 只有结构化数据与原稿引用映射都充分时，才允许明确应用到对应的既有文献列表。文中引用关联未建立时，独立列表预览/导出与原稿替换分开；不能隐式认领现有纯文本编号。
- 如果样式渲染失败，回退到原文，不生成半条记录或空白条目。

### 2.6 分阶段范围

**Phase 0（2.5.0 待发布源码中的本提案）**：只做分享和文献处理设计；不实现分享链接/envelope 或文献库，不新增 CSL 依赖；现有裸 JSON 导入导出保持不变。线上仍为 2.4.0。

**Phase 1（后续迭代，版本另定）**：

- 按冻结 ShareV1 实现分享链接/分享 JSON 的本地预览和明确应用；保留兼容裸 JSON。
- 结构化参考文献编辑器 + 独立本地文献命名空间 + 按类型提示缺失字段。
- 页面布局继续使用现有 formatter；条目不自动重写。
- 导出结构化 JSON（格式另定）作为后续 CSL 输入；不做渲染。

**Phase 2（需许可/技术验收）**：

- 自托管选定 CSL 处理器 + MLA/APA 样式 + es/zh locale。
- 预览 + 明确应用；保留原文/替换确认；离线可用。限制非同源资源与元数据查询，同时保留同源程序/样式/locale 的加载和 Worker 所需能力，不能以禁止所有网络请求的 CSP 阻断本地引擎初始化。
- 落实结构化富文本与文献块参数映射，不在 formatter 中二次排序。建立完整文中引用映射前，仅开放独立列表预览/导出，不替换既有编号。
- 逐条对比官方样式输出（不复制手册示例），建立回归样本。

**Phase 3（中文扩展）**：

- GB/T 7714 顺序编码/著者-出版年两种样式；中文 locale；中英混排姓名/标点验收。
- 明确“通用基础版，不保证学校专用细则”；不生成摘要/目录/学校封面。

### 2.7 验收清单（参考文献）

- [ ] 页面布局与条目文字分离；UI 不声称已按 MLA/APA/GB/T 格式化，除非实际由处理器输出。
- [ ] 结构化字段缺失时提示，不编造作者/年份/DOI。
- [ ] 原文保留；替换必须显式确认并可撤销。
- [ ] 文献库、原始引用文本和替换历史不进入模板偏好、裸 profile、ShareV1 或分享链接；独立保存/清除与导出行为明确。
- [ ] DOI/URL 标点、作者姓名、日期、斜体由样式/locale 决定，不手工拼接。
- [ ] 中文/西文姓名、机构作者、多作者、`et-al` 有回归样本。
- [ ] 富文本 run、上下标、小型大写、链接和换行边界在 DOCX 保留；无法表达的样式不静默降级。
- [ ] `hangingindent`、`entryspacing`、`linespacing`、`second-field-align`、`maxoffset` 和 `entry_ids` 被 renderer 正确应用；CSL 输出不会再次按文本排序。
- [ ] 文中引用与文献列表的顺序/编号/消歧使用同一处理器状态；引用增删移动或重复出现后同步更新且可整体撤销。
- [ ] 缺少文中引用映射时只预览/导出独立列表，不改写原稿的编号和既有列表。
- [ ] 处理失败回退原文，不产生空条目。
- [ ] 所有资源自托管、固定版本/SHA-256、无运行时 CDN；许可/归属随产物发布。
- [ ] 若使用 citeproc-js，完成 CPAL/AGPL 合规评审；若使用 citeproc-rs，记录 MPL 文件级义务和归档维护风险。

### 2.8 未决问题

- 模板链接是否允许压缩（需要 v2 版本和实测长度）。
- “分享时使用通用名称”的交互；更换已冻结的 v1 字段名、范围或默认值需新协议版本，不能借此未决项改变旧链接。
- CSL 处理器选择与许可结论；在完成评审前不新增依赖。
- 中文 GB/T 样式的学校差异（序号、文献类型标识、标点）如何提示用户核对。
- 是否需要从 DOCX 现有文本中提取结构化字段；首版建议不做自动解析，只做手工结构化编辑。

---

## 3. 明确未实现

- 分享链接、`#template=` 解码/预览/应用：**未实现**。
- CSL 渲染器、MLA/APA/GB/T 条目格式化、DOI 查询：**未实现**。
- 任何后端、账号、数据库、模板托管、短链、分析统计：**不计划加入**。
- 本提案不构成法律意见；许可证结论需项目方复核。
