# DSH Handoff — FormCapy (MLAFMT) browser-local refactor

## 1. 状态与边界

- 工作区：`C:\Users\Ooze\.codex\worktrees\browser-local\MLAFMT`
- 分支：`codex/browser-local`
- 主工作区 `H:\DSHworkspace\Codex\MLAFMT` 未被修改；**未 push、未部署、未发布 release**。
- 本分支已完成最小完整链路、静态构建、离线缓存、统一 transport、浏览器 Python bridge、Android native 适配和文档。
- 按最新指示，`static/transport.js` 与 `templates/index.html` 已冻结，不再继续修改；已知的 Node VM 复核问题留待接手方整合后修复（见第 6 节）。
- 本地提交仅用于交接，未推送。

## 2. 交付内容

### 新增

| 文件 | 用途 |
| --- | --- |
| `browser_bridge.py` | 浏览器 Python bridge；`begin/finish/discard/initial_state`；MEMFS 唯一临时目录、finally 清理、20 MiB/80 MiB/2000 条限制、Android 同款错误码；支持 blank/convert/paragraphs；不含 Flask |
| `browser/worker.js` | 单 module Worker；串行队列、request id、Transferable、PyProxy 清理、20 MiB 校验、初始化阶段消息；取消由主线程 terminate |
| `static/transport.js` | 统一 server/browser/native transport；Flask 继续用 `/api/*`；静态站用 Worker；Android 优先 native；request id/epoch/取消/busy 归属 |
| `browser/sw.js` | 离线 app-shell 模板；仅缓存构建 manifest 中的程序资源；不缓存用户文稿；不 skipWaiting/claim |
| `browser/runtime.json` | Pyodide 314.0.7 / CPython 3.14.2 / lxml 6.1.3 / typing_extensions 4.15.0 / python-docx 1.2.0 的固定 URL、大小、SHA-256 |
| `browser/licenses.json` + `browser/licenses/*.txt` | Pyodide/CPython/Emscripten/zlib/LGPL 原始许可快照（`browser/licenses/** -text` 由主分支同步） |
| `scripts/build_browser_static.py` | 自包含静态构建；运行时 SHA-256 校验；Jinja 占位符清零；manifest；`_headers`；离线缓存；集成 source kit |
| `browser/test/node_import_test.mjs` | 真实 Pyodide import + DOCX 生成断言（页眉姓氏 Example/PAGE、正文、ZIP） |
| `browser/test/test_bridge_desktop.py` | browser bridge 桌面回归（19 项） |
| `browser/test/run_static_browser_test.mjs` | 真实 headless Chrome 端到端；在线/离线、取消重试、epoch 竞态、native 协议、20 MiB、预检、许可入口 |
| `docs/BROWSER-LOCAL.md` | 架构、构建/预览、体积、缓存升级、兼容性、已验证/未验证、风险 |

### 修改

| 文件 | 变更 |
| --- | --- |
| `templates/index.html` | 引入 `static/transport.js`；抽出 generate/paragraphs/下载 transport；阶段提示；取消/重试；浏览器隐私文案；`generationSeq` 防旧 finally 清新任务；native 忙碌由 Kotlin 独占；页脚 source/license 链接；`mlafmt-mode/runtime/materials` meta |
| `platforms/android/.../DocumentViewModel.kt` | `DocumentState.requestId`；generate 透传并回显 `request_id` |
| `platforms/android/.../MainActivity.kt` | 允许同源 `static/transport.js`；CSP 增加 `script-src 'self'`，保持 `connect-src 'none'`/`worker-src 'none'`；state 回显 request_id |
| `.gitignore` | 忽略 `browser/.cache/` |

### 由主分支/其他助手同步，未由我改写

- `docx_preserve.py`：主分支分页修复版，SHA-256 `DEF5F82945D3E93754D1E8882838E131A22E24D889119E764A8C778A960ECDB7`；静态产物中的副本已核对该哈希。
- `.gitattributes`：新增 `browser/licenses/** -text`。
- `scripts/collect_browser_runtime_materials.py`、`browser/runtime-sources.json`：材料收集器及其 pin；只被 builder 调用/读取，未覆盖。

## 3. 产物

`dist/browser-local/`（git-ignored，未提交）：

- `index.html`：无任何 Jinja `{{ }}`/`{% %}`；`mlafmt-mode=browser`、`mlafmt-runtime=314.0.7`、`mlafmt-materials=included`。
- `browser/worker.js`
- `python/{mla_formatter.py,format_profiles.py,docx_preserve.py,browser_bridge.py}`
- `runtime/pyodide/314.0.7/`：Pyodide 314.0.7 核心、`pyodide-lock.json`、lxml/typing_extensions wasm wheel
- `wheels/python_docx-1.2.0-py3-none-any.whl`
- `licenses/`：许可快照 + `licenses/runtime-materials/`（collector 输出，用户可读入口 `index.html`、`SOURCE-MANIFEST.json`、`REBUILD.md`、`sources/`、`materials/`）
- `manifest.json`、`THIRD-PARTY-NOTICES.txt`、`LICENSE.txt`、`_headers`、`sw.js`

最终 `--check` 构建结果：

```text
version:       2.4.0
Pyodide:       314.0.7 / Python 3.14.2
files:         123
app size:      15.7 MiB
source kit:    94.8 MiB (20 sources, status collected-not-rebuilt)
               native/WASM rebuild NOT performed
total size:    110.4 MiB
cache version: formcapy-2.4.0-pyodide-314.0.7-2e999ec8d295
largest file:  20 MiB (split source part, < 25 MiB)
```

离线 precache 仅 16 个程序资源；`licenses/runtime-materials/**` **不在** precache 中。

## 4. 实际执行命令与结果

```text
node browser/test/node_import_test.mjs
=> OK: Pyodide import and DOCX conversion assertions passed
   （lxml 6.1.3 + typing_extensions + python-docx 1.2.0；页眉 "Example " + PAGE；
     body 保留；ZIP 有效；18 parts；输出 48,529 bytes 左右的测试文档）

.venv/Scripts/python.exe -m pytest browser/test/test_bridge_desktop.py -q
=> 19 passed

.venv/Scripts/python.exe -m pytest browser/test/test_bridge_desktop.py test_mla_web.py test_android_bridge.py -q
=> 42 passed

.venv/Scripts/python.exe -m pytest test_mla_formatter.py -q
=> 37 passed, 1 failed
   失败项：test_docx_keeps_hyperlink_text_in_order
   原因：段落文本和 w:hyperlink/斜体 XML/relationship 均保留，但 python-docx
   Paragraph.runs 不暴露嵌套在 w:hyperlink 内的 run；这是旧断言，不是新 core 丢失
   hyperlink。主分支维护的 core 回归另行保留。

node browser/test/run_static_browser_test.mjs
=> OK: static browser build passed end-to-end checks
   步骤：mode=browser；demo 37,720 bytes/18 parts；blank 37,461 bytes/18 parts；
   读取 6 个段落；取消后重试成功；20 MiB 拒绝；预检错误不锁表单；
   epoch 竞态 old=cancelled/fresh=New_MLA_Essay.docx；
   native request_id 1..4；not_dispatched/timeout；
   无外部请求、无非 GET、无 page exception、无 console error。

node browser/test/run_static_browser_test.mjs --offline
=> OK: static browser build passed end-to-end checks
   Service worker cache 生效；离线 reload 后再次生成 37,720 bytes DOCX。

.venv/Scripts/python.exe scripts/build_browser_static.py --check
=> 通过；123 文件 manifest 逐一复核 SHA-256/大小。
```

补充核验：

- `dist/browser-local/python/docx_preserve.py` SHA-256 = `DEF5F829...ECDB7`。
- 浏览器测试通过 `fetch` 读取 `licenses/runtime-materials/index.html`，并断言页脚 source 链接在 browser 模式可见。
- 静态构建可重复：同一输入连续两次构建 cache version 相同（`...2e999ec8d295`）。
- 在线/离线测试均使用真实 Chrome headless + 真实 module Worker + 真实 Pyodide，不是 mock。

## 5. 启动/预览

```sh
python scripts/build_browser_static.py
python -m http.server 8080 --directory dist/browser-local
# http://127.0.0.1:8080/
```

Flask 桌面仍为：

```sh
python mla_web.py
```

Android native 路径优先级：`window.MLAFMTAndroid` 存在时 transport 选 native；静态站 meta 为 browser，但不会覆盖 Android bridge。

## 6. 已知问题（接手方已明确要修，勿当成已通过）

1. **独立 Node VM 复核 13 场景中有 6 失败**（用户/Codex 复核结论）。根因集中在：
   - 旧 Worker 的 `onmessage`/`onerror` 没有实例门禁：terminate 后旧 Worker 的消息/错误仍可能结算或终止新 Worker。
   - 取消发生在 `file.arrayBuffer()` 挂起期间时，返回的 Promise 仍可能保持 pending（epoch 能阻止旧 buffer 发往新 Worker，但调用方 Promise 的收敛仍需加固）。
   - 这些修复由接手方在整合后修改 `static/transport.js`/模板；本工作区按指示未继续改。
2. **builder 的 materials 版本参数错误**：`ensure_materials()` 把应用版本 `2.4.0` 传给 collector 的 `--runtime-version`，而 collector 要求 Pyodide `314.0.7`。当前因 `browser/.cache/runtime-materials/314.0.7` 已有完整缓存，构建能复用；换缓存/全新环境时收集会失败。接手方已表示会改。
3. **Android 未构建/未安装**：Kotlin request_id 回显、CSP、transport asset 放行、native busy 归属均只做了代码审查；本机没有跑 Gradle/APK。native 适配器只用模拟 payload 验证。
4. **iOS/iPadOS/macOS Safari、Firefox、真实 Android 设备均未实测**；仅 Windows headless Chrome 实测。
5. **Native/WASM rebuild 未执行**：source kit 为 `collected-not-rebuilt`，只是材料清单/原始源码/许可，不是可复现重链或法律认证。
6. **Cloudflare 未部署**：域名/DNS/AlwaysUseHTTPS 由用户侧配置；本工作区没有上传或线上 URL 验证。站点匿名公开，无登录/邮箱/分析统计/Access。
7. **旧 `test_mla_formatter.py::test_docx_keeps_hyperlink_text_in_order`** 仍失败（旧断言，见上）；主分支的 core 回归测试由用户维护，本工作区未改测试。
8. **iOS 下载/分享、Safari 内存、Service Worker 配额**未在设备上验证。
9. **Service Worker 升级策略**：已移除 `skipWaiting()`/`clients.claim()`，新版本等旧页面关闭后生效；首次访问后需再次导航才受 SW 控制，离线测试因此执行了一次 reload。没有自动刷新或丢弃当前草稿。

## 7. 合入建议顺序

1. 先修 `transport.js` 的 Worker 实例门禁与取消 pending Promise（第 6.1 条），再跑独立 13 场景。
2. 修 builder `ensure_materials` 的 `--runtime-version` 参数（第 6.2 条），用全新 cache 验证一次材料收集。
3. 合并后重建静态产物，确保 `dist/python/docx_preserve.py` 仍是 `DEF5...`。
4. 至少跑：`test_bridge_desktop.py`、`test_mla_web.py`、`test_android_bridge.py`、`node_import_test.mjs`、`run_static_browser_test.mjs`、`--offline`。
5. Android 构建/设备验收、iOS 真机验收后再视为浏览器本地路径全面通过。
6. 上传 Cloudflare 前复核 123 文件/110.4 MiB、单文件 <25 MiB、`licenses/runtime-materials` 可访问且不进入 precache。

## 8. Git

- 本地提交建议/已执行：见 `git log -1`（若已提交）；**未 push**。
- 工作区没有提交 `dist/`、`browser/.cache/`、`.venv/`；它们均在 `.gitignore` 中。
- 主工作区、Android/release 流程均未被操作。

## 9. 2026-10-21 Root 验收补记

本节记录 Root 合入、修复及发布后的验收结果。第 1–8 节保留为 DSH 交接时的历史报告，其中“未推送、未部署、未发布”等描述不代表当前发布状态。

### 当前源码与正式发布

- 源码提交 `f7c3444` 已推送至 `main`。
- [CI 39559961737](https://github.com/SuperOoze0309/MLAFMT/actions/runs/39559961737) 全部通过：Windows、Linux、macOS Intel/Apple Silicon 双架构、Android。
- 7 个发布产物的 provenance、哈希及许可材料发布准备验证通过。
- [v2.4.0 已正式发布](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0)。

### 第 6 节历史问题的当前状态

| 历史条目 | Root 验收后的状态 |
| --- | --- |
| 6.1 transport 生命周期与取消 | 已修复。任务在初始化/读文件前登记；每次异步边界校验实例与 epoch；旧 Worker 消息/错误、旧 AbortSignal 不再结算或终止新任务。独立 Node VM **13/13 通过**。 |
| 6.2 builder materials 版本参数 | 已改为传入 Pyodide `314.0.7`；新的 runtime materials 收集已完成并进入静态产物。 |
| 6.3 Android 未构建 | Android 构建与 CI 已通过；真实 Android 设备安装、交互和折叠屏行为尚未实测。 |
| 6.4 浏览器/设备覆盖 | 已补充 Edge 与 IAB 公网验收；Safari、苹果设备、Android 实机仍未测，未新增 Firefox 实测证据。 |
| 6.5 Native/WASM rebuild | **仍未执行实际重建或重链**。材料状态继续为 `collected-not-rebuilt`，不能将材料收集通过表述为实际重建完成。 |
| 6.6 Cloudflare 未部署 | 已正式上线。Cloudflare Worker `formcapy`，已验收部署标识 `6769274b`；根域名与 www 均可匿名访问。 |
| 6.7 hyperlink 旧断言失败 | 已处理。Root Python 回归结果为 **98 passed、88 subtests passed**；当前未保留该失败。 |
| 6.8 iOS 下载/分享、Safari 内存和 SW 配额 | 仍缺实机验收；IAB 离线模拟通过不能替代这些设备检查。 |
| 6.9 Service Worker 更新策略 | 一般更新仍不调用 `skipWaiting()`/`clients.claim()`，不自动刷新。仅精确检测到已公开坏缓存 `formcapy-2.4.0-pyodide-314.0.7-f7d959ab5df8`，且修复版预缓存完整成功时，调用 `skipWaiting()` 完成迁移；不操作当前文稿。 |

### 公网、离线与文稿验收

- [formcapy.com](https://formcapy.com/) 与 [www.formcapy.com](https://www.formcapy.com/) 的 HTTPS 检查 **13/13 通过**：证书链及主机名受信、HTTP 跳转 HTTPS、路径与查询参数保持，显式检查的运行时资源保持同源 HTTPS。
- 首页、manifest 与清单中 **122/122 个可下载资源**的大小及 SHA-256 均匹配本地发布目录。`_headers` 由平台消费并生效；WASM/MJS MIME 正确，缺失 WASM 返回 404。
- SW 首页预缓存改用 `./`，导航 `/` 与 `/index.html` 使用同一缓存键；返回重定向缓存响应时重新构造 `Response`，消除 `redirected` 标志。SW 模板已纳入缓存版本摘要，当前版本为 `formcapy-2.4.0-pyodide-314.0.7-d035ce17a12d`。
- 正式 SW Node VM 检查 **18/18 通过**，包括精确坏缓存迁移条件：未知/相似缓存不触发，预缓存失败不激活，不 claim、导航或刷新页面。
- 精确迁移已恢复受影响 Edge 页面；新 IAB 标签打开与 reload 均通过。IAB CDP 离线模拟下，reload 后生成及下载通过，验收后已恢复 online。
- 公网 DOCX 的 MLA/APA 转换均通过：两段保护段落、图片字节一致性、表格、超链接、参考文献另起新页检查全部通过。
- **未验证项保留**：Safari、iPhone/iPad/Mac 苹果设备、Android 实机，以及 Edge 系统文件选择器选稿流程。以上结果不代表这些设备或系统交互已通过。
