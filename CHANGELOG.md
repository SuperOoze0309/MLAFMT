# Changelog

## v2.10.0 — 2026-10-25

- 文献库新增本地搜索和来源类型筛选；筛选不改写条目、论文或已生成的文献表。
- 增加通用 CSL-JSON、RIS 与现代 UTF-8 `.bib` 导出，明确选择全部或筛选结果；先核对字段和格式损失提醒，再复制或下载。
- 完整 FormCapy 文献库 JSON 继续用于备份原文对照等应用数据；通用导出只包含书目元数据，不混入文稿、论文信息或模板。
- 导出区采用全宽布局，重复的原文遗漏提醒合并为计数提示；中文、英文和西班牙语同步支持。
- 525 项 Node 检查、228 项 Python 测试及 159 项子检查通过；最终静态构建完成 42 项真实 Chrome 验收。实际下载的六份通用文件通过独立 CSL schema／RIS／BibTeX 解析检查，两份 MLA／APA Word 文献表通过预览内容及 ZIP/XML 核对。范围和限制见[测试记录](docs/TESTING-v2.10.md)。
- 静态网页版已部署为 Cloudflare `ef4332f7`（Ready／100%）。148/148 个资源、root／www 46/46 个关键文件及 22/22 个 HTTPS 检查通过；完整公开验收范围见[上线记录](docs/DEPLOYMENT.md)。离线安装包仍为 v2.5.0。
- 正式网站另一次完整 42 项浏览器检查通过；实际六份通用导出、完整库 JSON 和两份 Word 下载的字节及内容／结构分别核验通过。

## v2.9.0 — 2026-10-23

- 支持一次粘贴最多 50 行 DOI / doi.org 链接。用户明确启动后按顺序查询，逐行显示成功、失败、无效和重复状态，并显示进度。
- 取消保留已完成的候选；普通失败不丢成功结果；遇限流停止本批，稍后由用户手动重试，不自动重试。
- DOI 与离线文件候选均可逐条勾选、全选或全不选，只追加所选条目；保留去重、整批撤销和原有文献库。
- 修复来源中大量空作者导致重复警告、被批处理误判失败的问题；保留安全字段的提醒信息。
- 451 项 Node 检查、228 项 Python 测试及 159 项子检查通过。最终构建完成 31 项真实 Chrome 验收，包含真实 DOI 批量查询、三种文件导入、三语四档视口及实际 MLA/APA Word 下载；下载内容与预览、排版属性独立比对通过。设备及部署范围见[测试记录](docs/TESTING-v2.9.md)与[上线记录](docs/DEPLOYMENT.md)。
- 静态网页版已部署为 Cloudflare `b212e11a`（Ready／100%）。147/147 个资源、root／www 44/44 个关键文件及 21/21 个 HTTPS 检查通过；正式网站另有 19 项真实浏览器检查和两份实际 Word 下载核对。离线安装包仍为 v2.5.0。

### v2.8.0 内部基线（合并进 v2.9.0）/ Internal baseline included in v2.9.0

- 将引用助手的“快速添加”放在前面：可明确点击查询 DOI，或在本地粘贴／导入 BibTeX、RIS、CSL-JSON；手动编辑继续用于补充和修正。
- 候选先显示题名、作者、年份和提醒，再确认追加；保留已有文献库、识别可确认的重复项，并支持整批撤销。原 FormCapy 文献库 JSON 的核对／替换流程单独保留。
- DOI 查询固定连接 Crossref HTTPS，只发送该 DOI 和常规网络请求信息，不发文稿、论文信息或整个文献库。无自动查询、自动重试或服务端代理，包含取消、过期结果隔离、超时、限流及响应大小限制。
- 离线导入复用现有数据模型和本地 CSL 渲染；明确提醒未导入字段、缺失资料和不支持的类型，不编造作者或日期。中文、英文、西班牙语界面同步增加新入口和提示。
- v2.8.0 未单独发布，功能随 v2.9.0 交付；本地与生产验收结果分别记录，不沿用 v2.7.1 的检查结果。

## v2.7.1 — 2026-10-22

### 中文

- 调整静态网页版视觉：采用湖蓝、纸白与暖棕配色，增加水豚与纸张装饰，区分文稿表单、纸张预览和参考文献区域。
- 优化低分辨率与窄屏布局：压缩短屏页头、收起装饰，窄屏工作区改为单栏，并限制纸张预览宽度；短屏预览不再吸顶。
- 统一模板设置、二级高级定制、对话框与次级按钮的样式，强化键盘焦点、展开箭头、选中状态及禁用状态。
- 改善长中英西文案换行、提示文字对比度及触屏点击区域；错误输入使用虚线边框，成功和错误提示增加不同形状，减少仅依靠颜色区分状态的情况。
- v2.7.1 静态网页版已上线，Cloudflare 生产版本 `0cf62f91` 为 Ready／100%。Worker 144/144 文件、root／www 38/38 关键文件与 18/18 HTTPS 检查通过；应用源码 `166d739813e3cbea8f98d12b1cd9ded08f4e1e78` 的 [CI 39821220581](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39821220581) 7 项任务通过。本轮为网页版界面优化，离线安装包仍为 v2.5.0；Safari／实机验收及下载文件检查与线上资源核对分开记录，见[部署记录](docs/DEPLOYMENT.md)。

### English

- Refresh the static web interface with lake blue, paper white and warm brown, capybara/paper details, and clearer separation between the paper form, layout preview and reference assistant.
- Improve narrow and low-resolution layouts with a compact short-screen header, fewer decorations, a single-column workspace at narrow widths and a bounded paper preview. Disable the sticky preview on short screens.
- Unify template settings, advanced customization, dialogs and secondary controls, with clearer keyboard focus, disclosure arrows, selected states and disabled states.
- Improve wrapping for long Chinese, English and Spanish labels, muted-text contrast and touch targets. Add dashed invalid-field borders and distinct success/error shapes so state is not conveyed by color alone.
- The v2.7.1 static website is live as Cloudflare version `0cf62f91` (Ready / 100%). Its frozen assets and HTTPS checks passed, and all seven jobs in CI run 39821220581 succeeded for application source `166d739813e3cbea8f98d12b1cd9ded08f4e1e78`. This web-interface update retains the existing processing/export scope; offline installers remain v2.5.0. Safari, physical-device and downloaded-file acceptance are separate from HTTP verification; see the [deployment record](docs/DEPLOYMENT.md).

## v2.7.0 — 2026-10-22

- 静态网页版增加新版可用提示：先保存，再明确确认更新；处理中或同作用域还有其他标签页时保护当前工作，不自动刷新文稿。
- 新增浏览器本地参考文献助手，支持书籍、期刊文章、网页的结构化录入、MLA 9／APA 7 预览、独立文献列表 Word 导出与文献库 JSON。
- 文献库默认仅本次会话保留，保存到设备、载入与清除均为明确操作；文献数据不进入模板码或排版模板 JSON。
- 自托管固定字节的 citeproc-js、CSL 样式及 locale，包含原始源码快照、完整许可与界面归属；保留条目顺序、斜体、悬挂缩进和安全链接。
- 排错：首次断网后能恢复注册更新服务；模板文件的迟到读取不会覆盖新选择、手输内容或导出窗口；取消后的旧引擎重试不会覆盖当前状态。
- 独立 Word 文献导出增加可达的取消操作；取消或编辑条目会终止本次任务，释放论文表单并保留已有内容。保存库读取失败和过期预览不再显示误导性的成功状态。
- 修正文献 DOI 的重复编码和特殊网址处理；统一模型、渲染及 Word 的字符、输出大小和富文本层级限制，并核对审阅文本与导出内容一致，超限时明确提示。
- 本地排错验收：309 项 Node 检查、228 项 Python 测试及 159 项子检查通过；真实 Chromium 取消／重试、HTTP 503 恢复、服务器停止后的离线重载及文献／论文生成通过。
- v2.7.0 静态网页版已上线，离线安装包仍为 v2.5.0。应用源码 `866e0cb4bc48767f96d5a8681c46609a25390c43` 的 [CI 39718820575](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39718820575) 7 项任务通过；Cloudflare 生产版本 `890b8ee5` 为 Ready／100%。Worker 144/144 文件、root／www 38/38 关键文件及 18/18 HTTPS 检查通过，未注入 beacon；Edge 的三类条目导入、MLA／APA 预览及独立 Word 链接生成通过。实际范围与新下载文件／设备限制见[部署记录](docs/DEPLOYMENT.md)。

## v2.6.0 — 2026-10-21

- 网页版新增课程模板码：复制完整的 `FC1.` 模板码，在“导入模板”粘贴、预览后应用；不需要分享网址、服务器、账号或模板数据库。
- 新增独立的分享 JSON，包含完整排版设置与自填学校／课程标签；保留现有裸模板 JSON 导入导出。不会自动带入文稿、论文信息、段落选择或生成结果。
- 应用分享模板不自动保存、不改写论文日期，也不覆盖当前文稿和已有结果。课程标签可通过模板码或分享 JSON 留存；“我的模板”和兼容 JSON 仍仅保存排版设置。
- Add self-contained course-template codes and sharing JSON to the web UI, with review before applying and no server lookup. Existing layout-only JSON remains compatible. The [v2.6.0 website](https://formcapy.com/) is live; existing offline downloads remain v2.5.0.
- 上线核对：124/124 公网资源匹配本地构建，HTTPS 15/15 检查通过，真实 Edge 模板码预览／应用及文档生成通过。112 项 Node 检查、161 项 Python 测试和 159 项子检查通过；CI 7 个任务全部通过。安装包下载仍为 v2.5.0，本次只发布静态网页版。

## v2.5.0 — 2026-10-21

[FormCapy v2.5.0 下载已发布](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.5.0) / Downloads released at **2026-10-21 08:33:08 UTC**. All 8 assets were verified against REST size/digest metadata from [CI run 39568529951](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39568529951) (7 jobs passed); the release tag targets `930d959bb4f5844ae81abb326b6d363c0c03334f`. **[公网网站](https://formcapy.com/)已更新至 v2.5.0 / The public website has been updated to v2.5.0.** See the [deployment record](docs/DEPLOYMENT.md).

### 中文

- 在自定义课程模板中增加 **中文课程论文（通用）**、**中文毕业论文（基础版）** 两项内置预设；可修改并保存独立副本，不占个人模板名额。
- 增加中文与西文字体分别设置、首行字符缩进和固定磅值行距；旧模板继续使用原来的倍数行距和厘米缩进。
- 中文预设使用 A4、宋体小四、黑体标题、两端对齐和页脚居中页码；参考文献保留原顺序。毕业论文基础版采用固定 20 pt 行距和不编号的基础封面。
- 补充中文模板 JSON 与格式说明。预设提供基础排版，不生成目录、摘要或学校专用封面，不自动改写 GB/T 7714 引用。v2.5.0 网页版、源码及下载均已具备这些功能。
- 静态网页构建、桌面与 Android 新增西班牙语界面，保留显式语言选择；文稿、个人信息和个人模板名保持原文。
- 网页版更新隐私文案：排版在你的设备上完成，当前文稿不会自动上传。课程模板分享和结构化引用先记录为下一版静态设计，不新增账号、数据库或转换服务器。

### English

- Add built-in Chinese course-paper and basic-thesis presets under custom course templates, with independent editable copies outside the personal-template limit.
- Support separate Chinese/Latin fonts, character-based first-line indentation and exact point line spacing while retaining older profile defaults.
- Use A4, 12 pt 宋体 body text, 黑体 headings, justified paragraphs and centered footer numbers; retain reference order. The basic-thesis preset uses exactly 20 pt spacing and an unnumbered basic cover.
- Add Chinese JSON examples and scope documentation. These are starting layouts, without generated contents/abstracts/institutional covers or GB/T 7714 citation rewriting. These features are available on the v2.5.0 public website and in the source and downloads.
- Add Spanish to the static web build, desktop and Android interfaces, retaining explicit language choices and original draft text, paper details and personal template names.
- Clarify browser-local privacy on the public website: formatting takes place on your device and the current draft is not automatically uploaded. Record self-contained template sharing and structured citations as a future static design; no accounts, database or conversion server are added.

## v2.4.0 — 2026-10-21

[FormCapy v2.4.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0) 发布及[网页版](https://formcapy.com/)首次上线记录。Historical record of the FormCapy v2.4.0 release and initial browser-app launch.

### 中文

- 应用显示名改为 FormCapy，新增抱纸水豚吉祥物，统一网页、桌面和 Android 标识及图标；项目名保持 MLAFMT。见[形象说明](docs/BRANDING.md)。
- 网页版在 [formcapy.com](https://formcapy.com/) 上线，采用 Cloudflare 免费静态托管与 HTTPS；无需注册，DOCX/TXT/MD 在浏览器本地处理，草稿与论文信息不上传。首次需联网下载程序，缓存保留且页面受 service worker 控制后可离线使用。
- 浏览器任务取消会终止 Worker，并隔离旧任务回调；可立即重试。修复 Cloudflare 规范化首页地址后缓存响应导致重复访问失败的问题；精确识别首个错误缓存并在完整预缓存后激活修复，不刷新页面或清除内存中的文稿。
- 处理时显示像素水豚沿蓝线跑动的进度动画；未知耗时阶段不显示百分比，完成或失败后收起。网页在减少动态效果模式下保留静态状态。
- 新增 APA 7 学生论文版式：独立标题页、学校/院系信息、仅页码页眉、正文重复标题、新页 References 和悬挂缩进。
- APA / 自定义格式识别 DOCX Heading 1–3 和 Markdown `#`–`###`，启发式标题识别仍为可选项；参考文献按完整条目的起始文字排序，引用内容保持原文。
- 新增最多 20 个命名课程模板，支持纸张、字体、字号、行距、页边距、首行缩进、对齐、页眉、独立标题页及参考文献设置。
- 模板设置新增二级 **高级定制**：`page_number_position` 支持 `top_right` / `bottom_center` / `bottom_right`，`page_number_start` 为 1–9999 的整数，`show_cover_page_number` 控制封面页码；旧模板默认补为右上、起始 1、封面显示。隐藏封面页码时，正文第一页从所设数字开始。
- 桌面与网页支持 JSON 模板导入/导出；Android 通过文本框复制/粘贴同一份 JSON，各端分别在本机保存设置。
- DOCX 可读取源正文段落，多段勾选、全选、清空或用 `2, 4-6` 等编号范围指定保留原格式；所选段落保持字体、字号、行距和缩进等段落格式。选择不进入课程模板，换稿清空；检测到源文件指纹变化时要求重新读取。
- DOCX 转换改用源文档包保留正文图片和表格；表格整体保留，不提供表格内部逐段选择。纸张、页边距、页码及源分节、页眉和页脚按模板重建，原分页位置可能改变，原页眉页脚图片不属于正文图片保留范围。
- 参考文献中含保留段落或对象时，仅对连续、安全的普通条目排序，并在结果中提示人工核对顺序。TXT/MD 图片链接或语法不会自动嵌图，代码围栏仅作为文字保留。
- Android 同一草稿的段落保留选择与指纹可在旋转、折叠及界面重建后恢复；切换或移除草稿会清空，旧草稿的异步段落读取结果会被忽略。
- 桌面、网页、离线 Android 和命令行共用 MLA / APA / 自定义排版核心，摘要与预览随所选格式更新。
- 结果显示实际保留的段落、正文图片和表格数量，并对部分复杂结构或超出 1–3 级的标题提示核对；这不等于完整文档检查。当前处理范围见[格式指南](docs/FORMATS.md)。
- 新增[格式与模板说明](docs/FORMATS.md)及 [A4 课程报告示例](examples/course-report-a4.json)：页码在页脚居中、封面不编号、正文从 1 开始。README 加入公网图文使用说明，保留并标注 v2.3.0 历史截图。
- Markdown 代码围栏按原文字保留，避免误判其中的标题或参考文献标记；模板导入会拒绝 Word 文档不支持的字符。
- 统一桌面构建的第三方许可证收集，修复 `LICENSES.txt` 漏收；Windows 构建附带原始声明、依赖清单及匹配的对应源码材料，帮助菜单提供查看和导出入口。历史 v2.3.0 下载文件未被替换；新版下载使用 v2.4.0。

### English

- Rename the application's display name to FormCapy and add a paper-holding capybara mascot across web, desktop and Android branding and icons. The project remains MLAFMT. See the [branding notes](docs/BRANDING.md).
- Launch [formcapy.com](https://formcapy.com/) on Cloudflare free static hosting with HTTPS. No registration is required; DOCX/TXT/MD processing runs locally in the browser without uploading drafts or paper details. First use needs a program download; offline use depends on retained caches and service-worker control.
- Terminate the browser Worker on cancellation and isolate old callbacks so users can retry immediately. Repair failed repeat visits caused by cached redirected home responses after Cloudflare URL canonicalization. Only the exact first broken cache activates the repair after the full precache succeeds, without refreshing pages or clearing in-memory drafts.
- Show a pixel capybara running along a blue line during processing. Unknown-duration work has no percentage; the animation closes on success or failure. Reduced-motion web settings retain a static status display.
- Add APA 7 student layout with a separate title page, affiliation, page-only header, repeated body title and a new References page with hanging indents.
- Recognize DOCX Heading 1–3 and Markdown `#`–`###` in APA/custom formats; heuristic detection remains opt-in. Sort complete reference paragraphs by their initial text and leave citation text unchanged.
- Add up to 20 named course templates for paper, font, size, spacing, margins, indentation, alignment, header, title page and reference settings.
- Add second-level **Advanced customization** to template settings: `page_number_position` supports `top_right` / `bottom_center` / `bottom_right`, `page_number_start` is an integer from 1–9999, and `show_cover_page_number` controls cover numbering. Older templates default to top right, start at 1 and show the cover number. With the cover number hidden, the first body page starts at the chosen number.
- Import/export template JSON on desktop and web; copy/paste the same JSON through an Android text editor. Each interface saves its settings locally.
- Read source DOCX body paragraphs and select multiple paragraphs, select all, clear, or use ranges such as `2, 4-6` to keep fonts, sizes, spacing, indentation and other paragraph formatting. Selections are excluded from course templates and cleared on draft changes; a changed source fingerprint requires reading the paragraphs again.
- Retain body images and tables from the source DOCX package. Tables stay whole, without individual paragraph selection inside them. Template settings rebuild paper size, margins, numbering, source sections, headers and footers. Original pagination may change; images in original headers/footers are outside body-image retention.
- With preserved reference paragraphs or objects, sort only consecutive safe ordinary entries and display a message to check the order manually. TXT/MD image links and syntax do not embed images; fenced code is retained as text only.
- Restore the same Android draft's paragraph selections and fingerprint after rotation, folding or interface recreation. Changing or removing drafts clears them, and asynchronous inspection results for an old draft are ignored.
- Share MLA, APA and custom formatting across desktop, web, offline Android and CLI, with summaries and previews reflecting the selected format.
- Show counts of paragraphs kept unchanged, body images and tables; warn about some complex structures and headings above level 3. This is not a complete document check. See the [format guide](docs/FORMATS.md) for the current scope.
- Add a [format and template guide](docs/FORMATS.md) and an [A4 course report example](examples/course-report-a4.json) with bottom-center numbering, an unnumbered cover and body numbering starting at 1. Add an illustrated public-site guide to the README and retain clearly labelled historical v2.3.0 screenshots.
- Keep fenced Markdown text literal so its headings and reference labels are not misclassified; reject template characters that cannot be written to Word documents.
- Share third-party notice collection across desktop builds and include `LICENSES.txt`. Windows builds carry original notices, an inventory and matching corresponding-source materials, with Help entries to view or export them. Historical v2.3.0 files were not replaced; use the new v2.4.0 downloads.

## v2.3.0 — 2026-10-20

### 中文

- Mac 支持 Finder“打开方式”和把草稿拖到 Dock 图标；保存或转换期间收到的新草稿会等待当前操作完成。
- 接入 macOS 原生退出、重新激活和偏好设置操作，菜单显示 Command 快捷键；生成后可在 Finder 中选中文档。
- Mac 安装包加入可双击的中英双语安装说明，并检查最终 DMG 中的应用、文档、文件关联和签名。
- 网页生成后保留 Word 下载入口，可再次下载；支持时提供点击触发的系统分享，并补充 iPhone/iPad 保存说明与试用示例。
- 本地网页预览打印同一 Wi-Fi 下的访问地址，支持自定义端口；iPhone/iPad 此阶段使用本地网页预览。
- 增加经审阅的 Apple 设备指南，说明 Pages 导入方式与实际签名状态。Mac 版本仍未经过 Apple 公证。

### English

- Open Mac drafts from Finder's Open With menu or by dropping them on the Dock icon; incoming files wait during save dialogs or conversion.
- Handle native Quit, Reopen and Preferences actions, show Command shortcuts and reveal generated documents in Finder.
- Include a double-clickable bilingual Mac installation guide and inspect the final DMG's app, documentation and signature.
- Keep a reusable Word download link, offer file sharing when supported, and add iPhone/iPad save guidance and an editable sample.
- Print same-network addresses for local web preview and allow a custom port; iPhone/iPad support is a local web preview at this stage.
- Add a reviewed Apple device guide covering Pages import and actual signing status. Mac builds remain not Apple-notarized.

## v2.2.0 — 2026-10-13

### 中文

- 新增 macOS 14+ 的 Apple silicon / Intel DMG，以及 Linux x64 AppImage / 便携 tar.gz。
- 新增 Android 7+ 的 64 位离线 APK，使用系统文件选择器导入草稿，保存、打开和分享生成的 Word 文档。
- 适配折叠屏展开、合拢、半折叠和分屏窗口；避让折痕并保留填写信息、草稿和转换结果。
- 所有平台复用同一 MLA 排版核心；保持 Works Cited 新页、双倍行距、页码和悬挂缩进规则。
- 适配各桌面系统的设置目录、滚轮和 macOS 快捷键；构建时验证实际打包的拖放库和文档转换。
- 增加各平台构建与测试流程、固定 Android 发布签名、依赖版本和下载校验和。
- README 加入中英文实际界面截图，并用简明平台下载表组织 Release。
- macOS 包使用临时签名，尚未经过 Apple 公证；首次打开可能需要系统确认。

### English

- Add macOS 14+ DMGs for Apple silicon and Intel, plus Linux x64 AppImage and portable tar.gz packages.
- Add a fully offline 64-bit Android 7+ APK with system draft selection, document saving, opening and sharing.
- Adapt foldable and multi-window layouts, avoid separating hinges and retain paper details, drafts and generated documents.
- Share the same MLA engine across platforms, including a new Works Cited page, double spacing, page fields and hanging indents.
- Adapt desktop settings locations, scrolling and macOS shortcuts; verify the bundled drag-and-drop library and actual conversion.
- Add platform build/test jobs, a stable Android release signature, locked dependencies and download checksums.
- Add bilingual interface screenshots to the README and simplify Releases with a platform download table.
- macOS builds are ad-hoc signed and not Apple-notarized; first launch may require system confirmation.

## v2.1.1 — 2026-10-12

### 下载 / Download

- [Windows 应用 / Windows app: MLAFMT.exe](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.1.1/MLAFMT.exe) — 下载后双击运行 / Download and double-click to run.
- [便携 ZIP / Portable ZIP](https://github.com/SuperOoze0309/MLAFMT/releases/download/v2.1.1/MLAFMT-v2.1.1-windows-x64.zip) — 含说明文件 / Includes guides.

### 中文

- 修正单条文献时的 Works Cited 标题，并确保论文标题不使用粗体。
- 简化下载选择：直接运行 `MLAFMT.exe`，或下载包含说明文档的 ZIP。

### English

- Fix MLA formatting for one-entry Works Cited lists and paper titles.
- Simplify downloads: use `MLAFMT.exe` or the portable ZIP with documentation.

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
