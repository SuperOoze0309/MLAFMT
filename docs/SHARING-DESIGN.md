# 静态站模板分享与参考文献排版设计

> 状态：**提案，未实现**。当前版本（FormCapy 2.4.0）只有本地模板 JSON 导入/导出，没有分享链接，也没有引用渲染器、后端或账号系统。
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
- 不在链接、导出 JSON 或分享提示中放入草稿正文、论文标题、姓名、教师个人信息、文件字节、段落保留选择或生成结果。

### 1.2 URL 形式

```text
https://formcapy.com/#template=v1.<base64url(UTF-8 JSON)>
```

- 使用 fragment（`#` 后内容）而不是 query string：fragment 不随 HTTP 请求发送，静态服务器日志不会收到模板内容。
- `<payload>` 是对规范化 JSON 的 UTF-8 字节做 **base64url**（`-`/`_`，去掉 `=` 填充）。
- 版本放在 payload 前：`v1.`。未来不兼容时使用 `v2.`，不得让旧页面把未知版本猜成 v1。
- 初始不压缩。当前模板约十余个字段、几十条设置，base64url 后通常在数百字节到 2 KB 量级；压缩会增加实现和兼容成本，等实测超长再单独立项。
- 不依赖 URL 缩短服务。链接过长时，静态站只能提示用户复制/粘贴或导出 JSON；这是无后端方案的现实限制。

### 1.3 Envelope

```json
{
  "v": 1,
  "settings": {
    "label": "My course template",
    "paper_size": "A4",
    "font_name": "宋体",
    "font_size": 12,
    "line_spacing": 1.5,
    "margin_cm": 2.5,
    "first_line_cm": 0.85,
    "alignment": "justify",
    "header": "page",
    "title_page": false,
    "references_title": "参考文献",
    "sort_references": false,
    "page_number_position": "bottom_center",
    "show_cover_page_number": false,
    "page_number_start": 1,
    "typography": "chinese",
    "latin_font_name": "Times New Roman",
    "first_line_chars": 2,
    "line_spacing_pt": 0
  },
  "labels": {
    "school_name": "Example University",
    "school_abbr": "",
    "course_code": "UCSBLING36",
    "campus_term": "2026 Fall"
  }
}
```

字段规则：

- `settings` 只允许当前 `DEFAULT_CUSTOM_PROFILE` 的 key；未知 key 拒绝或按明确警告忽略，不能静默写入。
- `labels` 全部可选；`school_name`、`school_abbr`、`course_code`、`campus_term` 分开存储，不互相推导。
- `UCSBLING36`、`COCENGL1001C`、`CSWMP16` 只作为用户输入示例：它们可能是课程代码、专业缩写或老师自定义写法；不得据此猜测学校全名，也不得假设全局唯一。
- `school_name` 允许 Unicode、空格和本地命名；`course_code` 允许 Unicode/空格/连字符；不强制大写或某种分隔符。
- 标签只是“这个模板的说明文字”，不是学校官方名称、不是课程注册 ID、不是模板全局身份。接收者看到的学校/课程信息以发送者填写为准。

### 1.4 规范化与可复现

- 对 JSON 对象递归按 key 排序；数组保持原顺序；数字使用 JSON 规范的最短表示（避免 `1` 与 `1.0` 产生不同链接）。
- 先构造固定 envelope，再序列化、UTF-8 编码、base64url；同一模板和标签必须得到同一 fragment。
- 不加入时间戳、随机数、当前域名、UA、版本号以外的环境值。
- `settings.label` 是模板名称，会进入链接；若用户认为名称敏感，应提供“分享时使用通用名称”选项，而不是偷偷改写。
- 导出 JSON 与分享链接使用同一 envelope/schema；导入旧版裸 profile JSON 时仍走现有兼容路径，但**新分享链接只接受 v1 envelope**。

### 1.5 UI 流程

在自定义模板编辑区显示：

- **复制分享链接**：生成 `https://<当前站点路径>/#template=v1...`，使用 Clipboard API；失败时显示可选中的 URL 文本。
- **导出 JSON**：现有能力，导出同一 envelope（或明确标注的兼容格式）。
- **导入 JSON**：现有能力，保留。

接收者流程：

1. 打开含 `#template=` 的页面。
2. 浏览器本地解码、校验 schema/版本/长度/字段。
3. 显示只读预览：纸张、字体、字号、行距、页边距、页码、参考文献设置，以及学校/课程标签。
4. 用户点击“应用此模板”才写入当前编辑状态；不自动覆盖已保存模板，也不自动保存。
5. 应用后用户可继续编辑；只有再次点击“保存模板”才进入本地模板列表。
6. 用户修改任何设置后，分享链接需要重新生成；没有服务器，所以旧链接不会跟着变，也没有撤销/更新全部。

分享提示必须写明：**链接和 JSON 只包含模板设置与课程标签，不包含草稿正文或个人论文信息。** 若站点有 `public_privacy` 等其他隐私说明，应分开描述，不能把“模板链接不上传”扩大成对所有请求的承诺。

### 1.6 校验与安全

在浏览器内、应用状态之外完成：

- fragment 长度上限（建议 16 KB，实际可更小）；base64url 字符集严格校验；UTF-8 严格解码失败即拒绝。
- JSON 解析后限制对象深度/数组长度/总 key 数量；拒绝 `__proto__`、`constructor` 等危险键（按普通数据读取时也要用 `Object.create(null)` 或显式 allowlist）。
- 版本必须精确匹配；`settings` 只取 allowlist；字符串长度：`label` ≤ 60、`references_title` ≤ 80、`school_name` ≤ 120、`school_abbr` ≤ 24、`course_code` ≤ 64、`campus_term` ≤ 80（最终值以产品确认为准）。
- 数字范围与现有 `normalizeCustomProfile` 一致：字号 8–24、行距 1–3、页边距 0.5–5.08 cm、首行缩进 0–2.54 cm、起始页 1–9999、`first_line_chars` 0–4、`line_spacing_pt` 0–60。
- 布尔字段必须为布尔；枚举必须命中 allowlist；未知版本/损坏 base64/超长/字段类型错误都显示普通错误并保留当前页面状态、草稿和已保存模板。
- 所有标签通过 `textContent` 写入；不拼 HTML，不执行 `eval`/`Function`，不远程 fetch，不把 URL 内容放进模板字符串再解析。
- 打开链接时不要立刻应用；预览页/对话框关闭后不改变任何设置。解码失败不写入 localStorage。

### 1.7 链接限制与域名路径

- fragment 不会因为路径变化自动迁移：今天 `https://formcapy.com/#template=...` 的链接，如果未来应用改到 `/app/` 或换域名，旧链接不会自动指向新路径。应保持根路径稳定；如必须迁移，只能靠静态托管重定向/说明页，无法保证所有旧链接。
- 链接长度受聊天软件、邮件客户端、二维码和浏览器地址栏限制；不压缩时优先把 payload 控制在几 KB 内。未来若确实需要压缩，必须新增版本并保留 v1 解码。
- 没有服务器端模板 ID，所以“同一模板”只能通过规范化 payload 判断；不要引入本地随机 ID 冒充全局身份。

### 1.8 验收清单

- [ ] 同一模板不同 key 顺序 → 同一分享链接。
- [ ] 中文/空格/emoji 学校名、课程代码可往返，预览不乱码。
- [ ] 链接/JSON 中不含草稿、姓名、标题、教师、文件字节、段落选择。
- [ ] 未知版本、坏 base64、超长、错误类型、未知 key 均给出可恢复错误。
- [ ] 打开链接不自动应用；预览后明确点击才应用。
- [ ] 应用不覆盖已保存模板；保存仍是单独动作。
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

编辑器对缺失字段显示提示而不是自动填充；DOI/URL 只做格式提示，不联网查询。保存到本地（现有模板/偏好机制），不引入账号或云端同步。

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
- 许可证：**CPAL 1.0 或 AGPL 3.0（二选一）**，见 <https://github.com/Juris-M/citeproc-js/blob/master/LICENSE>
  - 这不是 MIT/Apache。把它打包进静态站之前，必须由项目方完成许可/分发义务评估：CPAL 的归属要求、AGPL 的对应源码/网络分发义务，以及“静态站只提供 JS”是否满足所选许可证。
  - 不能因为“只是浏览器本地运行”就假设 AGPL 不适用；这是法律/合规判断，本提案不作结论。
- 处理器本身是单文件/可构建 bundle；测试套件和文档很多，但**不能照搬其示例或手册文本**。

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

- 排序：不要用简单 `localeCompare` 冒充 CSL 排序。参考文献顺序应由样式定义的 `cs:sort` 决定（作者/年份/题名等）；中文 GB/T 顺序编码制还涉及引用序号，必须由处理器输出，不能手工猜。
- DOI/URL：是否输出、是否带 `https://doi.org/`、末尾是否有句点、访问日期格式都由样式决定；不要手工拼接。缺失 DOI 时不要生成假 DOI。
- 作者姓名：使用 CSL 的姓名变量与 `initialize-with`、姓名顺序、`et-al` 规则；中文/西文混排要保留姓名原文，不能把机构作者强行拆成姓/名。
- 日期：使用 locale 的本地化日期格式；MLA/APA 的日期默认仍按现有 formatter 规则，中文 GB/T 使用 `zh-CN` locale。用户手填日期不因 UI 语言切换被改写。
- 斜体/粗体：内部使用结构化 span（`{text, italic, bold}`）并在 DOCX 写入 run 属性，禁止把 `<i>` 或 HTML 字符串直接插入文档；标题/期刊名的斜体由样式决定。
- 缺失字段：显示“缺少 DOI/出版年/作者”等提示；允许用户保留原条目或补字段。**绝不静默编造元数据**，也不承诺把任意粘贴文本无损解析成结构化字段。

### 2.5 保留原文与替换

- 现有草稿中的参考文献文字继续原样保留；新增结构化条目只能追加或由用户明确“替换此条”后替换。
- 替换前显示 diff/预览（作者、年份、题名、DOI 变化），并保留撤销或原始文本。
- 参考文献页的页面布局仍由现有 formatter 控制；CSL 只负责条目文本，不改变纸张/页码/页边距。
- 如果样式渲染失败，回退到原文，不生成半条记录或空白条目。

### 2.6 分阶段范围

**Phase 0（本版）**：只做模板分享设计；不实现分享链接；不新增 CSL 依赖；现有 JSON 导入导出保持不变。

**Phase 1（下一版最小可用）**：

- 结构化参考文献编辑器 + 本地保存 + 缺失字段提示。
- 页面布局继续使用现有 formatter；条目不自动重写。
- 导出结构化 JSON（格式另定）作为后续 CSL 输入；不做渲染。

**Phase 2（需许可/技术验收）**：

- 自托管选定 CSL 处理器 + MLA/APA 样式 + es/zh locale。
- 预览 + 明确应用；保留原文/替换确认；离线可用；CSP 不允许远程请求。
- 逐条对比官方样式输出（不复制手册示例），建立回归样本。

**Phase 3（中文扩展）**：

- GB/T 7714 顺序编码/著者-出版年两种样式；中文 locale；中英混排姓名/标点验收。
- 明确“通用基础版，不保证学校专用细则”；不生成摘要/目录/学校封面。

### 2.7 验收清单（参考文献）

- [ ] 页面布局与条目文字分离；UI 不声称已按 MLA/APA/GB/T 格式化，除非实际由处理器输出。
- [ ] 结构化字段缺失时提示，不编造作者/年份/DOI。
- [ ] 原文保留；替换必须显式确认并可撤销。
- [ ] DOI/URL 标点、作者姓名、日期、斜体由样式/locale 决定，不手工拼接。
- [ ] 中文/西文姓名、机构作者、多作者、`et-al` 有回归样本。
- [ ] 处理失败回退原文，不产生空条目。
- [ ] 所有资源自托管、固定版本/SHA-256、无运行时 CDN；许可/归属随产物发布。
- [ ] 若使用 citeproc-js，完成 CPAL/AGPL 合规评审；若使用 citeproc-rs，记录 MPL 文件级义务和归档维护风险。

### 2.8 未决问题

- 模板链接是否允许压缩（需要 v2 版本和实测长度）。
- 课程标签的最终字段名/长度和“分享时使用通用名称”的交互。
- CSL 处理器选择与许可结论；在完成评审前不新增依赖。
- 中文 GB/T 样式的学校差异（序号、文献类型标识、标点）如何提示用户核对。
- 是否需要从 DOCX 现有文本中提取结构化字段；首版建议不做自动解析，只做手工结构化编辑。

---

## 3. 明确未实现

- 分享链接、`#template=` 解码/预览/应用：**未实现**。
- CSL 渲染器、MLA/APA/GB/T 条目格式化、DOI 查询：**未实现**。
- 任何后端、账号、数据库、模板托管、短链、分析统计：**不计划加入**。
- 本提案不构成法律意见；许可证结论需项目方复核。
