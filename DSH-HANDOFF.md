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
