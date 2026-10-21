# FormCapy 苹果设备使用说明 / Apple Devices

[v2.4.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0) 已发布，应用名为 **FormCapy**，Mac 应用包为 `FormCapy.app`；仓库与源码项目仍为 **MLAFMT**。以下安装说明使用新版名称，历史 v2.3.0 安装包仍显示 MLAFMT。

[v2.4.0](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0) is released as **FormCapy**, with a `FormCapy.app` Mac bundle; the repository and source project remain **MLAFMT**. These instructions use the new name; historical v2.3.0 packages still display MLAFMT.

Mac 原生桌面版使用 Tk，要求 macOS 14 或更新版本。网页有两种运行方式：新静态版在设备浏览器内处理；原 Flask 局域网模式由电脑处理。静态版已在 [formcapy.com](https://formcapy.com/) 与 [www.formcapy.com](https://www.formcapy.com/) 上线，两入口的可信 HTTPS 和 HTTP 升级重定向均已验证。没有原生 iPhone/iPad App；Safari、macOS、iPhone 和 iPad 实机流程尚未验证。

The native Mac desktop app uses Tk and requires macOS 14 or later. The new static web build processes documents in the device's browser; the original Flask LAN mode processes them on a computer. The static app is live at [formcapy.com](https://formcapy.com/) and [www.formcapy.com](https://www.formcapy.com/), with trusted HTTPS and HTTP upgrade redirects verified for both entry points. There is no native iPhone/iPad app. Safari, macOS, iPhone and iPad device workflows remain unverified.

> **签名状态 / Signing**：macOS 包为 **ad-hoc 临时签名，未经过 Apple 公证**；首次打开可能被 Gatekeeper 阻止。请从项目 Releases 下载，并按系统提示在“系统设置 → 隐私与安全性”中允许打开。安装和使用不需要付费 Apple 开发者账号。
>
> The macOS build is **ad-hoc signed and not Apple-notarized**. Gatekeeper may block the first launch. Download from the project's Releases, then allow it in **System Settings → Privacy & Security**. No paid Apple Developer account is required.

## 中文

### 1. Mac 桌面版

以下安装和按钮名称对应已发布的 v2.4.0。Mac 实机操作尚未验证。

1. Apple 芯片 Mac 选择 **arm64**，Intel Mac 选择 **x64**；需要 **macOS 14 或更新版本**。
2. 打开 `.dmg`，把 **FormCapy** 拖到“应用程序”，再打开。
3. 首次打开若被阻止，确认文件来自项目 Releases，再到 **系统设置 → 隐私与安全性 → 仍要打开**，按系统提示操作。

| 你想做的事 | 操作 |
| --- | --- |
| 打开草稿 | 把 `.docx` / `.txt` / `.md` 拖进窗口，点选择区域，按 **⌘O**，在 Finder 选择 **打开方式 → FormCapy**，或把草稿拖到 Dock 图标 |
| 让应用留在 Dock | 从“应用程序”把 FormCapy 拖到 Dock |
| 生成文档 | 填写姓名和论文标题，按 **⌘Return** 或点转换按钮，再选择保存位置 |
| 找到结果 | 保存后点 **在 Finder 中显示 / 打开文件夹**，或打开保存时选择的文件夹 |
| 导入 Pages 草稿 | 先在 Pages 中选择 **文件 → 导出到 → Word…**，再选入导出的 `.docx` |

若 Finder 的“打开方式”没有应用，先启动一次，或选择 **其他… → 应用程序 → FormCapy**。

桌面版在 Mac 本机处理，转换无需联网；单个草稿上限为 **20 MiB**。v2.4.0 支持 MLA、APA、自定义模板、选定段落格式以及正文图片和表格保留；页眉、页脚、分节和分页仍按模板重建。具体范围见[格式说明](FORMATS.md)。

### 2. Safari：浏览器本地静态版

静态版通过 Pyodide 314.0.7 在浏览器 Web Worker 中运行 Python 排版核心，支持 `.docx`、`.txt`、`.md`，以及 MLA 9、APA 7 学生论文、自定义模板。无需账号，草稿和论文信息不上传；不要求旁边有电脑，也不要求同一 Wi-Fi。

首次使用需联网取得约 **15.7 MiB 程序资源**。另约 **95 MiB 源码与许可证材料**仅通过许可证入口按需访问或下载，不能放入程序预缓存。程序缓存完成且页面受 service worker 控制后可离线使用；首次页面通常需再次导航才受控，浏览器也可能清理缓存。iPhone/iPad 的内存和下载流程仍需实机确认。

以下为 Safari 的使用流程；网站已上线，Safari 和 Apple 实机步骤仍待验证：

1. 在 Safari 打开 [https://formcapy.com/](https://formcapy.com/)，等待程序准备完成。
2. 填写姓名、标题并选择 MLA、APA 或自定义模板；APA 还需相应的学校、课程等信息。
3. 点选择草稿，在系统选择器中选 **浏览**，到“文件”中的 **iCloud Drive** 或 **我的 iPhone/iPad** 选择 `.docx`、`.txt` 或 `.md`。Mac 可用 Finder 选择器。Pages 文件需先导出为 Word `.docx`。
4. 如需保留 DOCX 段落格式，先读取段落并选择，再生成文档。
5. 点 **下载 Word**。若 Safari 显示下载确认，选择 **下载**，再从 Safari 的下载列表打开结果；可在“文件”App 的 **下载 / Downloads** 或你设定的位置找到它。
6. 如果 Safari 打开文档预览，点系统 **分享 → 存储到“文件” / Save to Files**，选 **我的 iPhone/iPad** 或 **iCloud Drive** 中的文件夹，再点 **存储**。也可在支持的设备上使用页面的分享按钮，再选择存储到“文件”。

保持页面打开时可 **再次下载**；刷新或关闭页面后需重新生成。下载位置随 Safari 设置变化，可在系统设置中找到 **Safari → 下载**。在 Mac 上也可从 Safari 下载列表选择放大镜，在 Finder 中显示结果。

### 3. 原 Flask 局域网模式：电脑处理

这个模式可继续用于当前源码本地预览。草稿会临时传给运行 Flask 的电脑，由电脑完成转换；它与上面的浏览器本地静态版不同。

#### 3.1 启动与连接

在项目目录运行：

```bash
python mla_web.py --lan --no-browser
```

项目虚拟环境：Windows 用 `.\.venv\Scripts\python.exe`，Mac/Linux 用 `.venv/bin/python`。源码运行需要 Python 3.10+ 和 `requirements.txt` 中的依赖。

1. 保持电脑终端开启，让手机/平板与电脑连接同一个可信 Wi-Fi。
2. 复制终端中 **iPhone / iPad (same Wi-Fi)** 对应的地址，例如 `http://192.168.1.23:8600`，在 Safari 打开。`127.0.0.1` 和 `localhost` 在手机上会指向手机自己，不能用于连接电脑。
3. 按上节的选择草稿、生成、下载和保存到“文件”步骤操作。HTTP 局域网页面通常不具备系统分享所需的安全上下文，分享按钮可能不可用；可先下载，再从 Safari 下载预览或“文件”中分享。

查看 Mac 的 IPv4 地址可用 **系统设置 → 网络 → 当前连接 → 详细信息 → TCP/IP**，或运行 `ipconfig getifaddr en0`（Wi-Fi 通常为 `en0`）。修改端口可加 `--port 8601`。

#### 3.2 数据与连接

草稿经局域网临时上传到电脑；每次请求结束时服务会尝试清理临时文件，生成结果从内存返回。这条路径不会把草稿发送到第三方云端，也不是手机本地离线转换。电脑服务开启时，同网设备可能访问该页面；完成后在终端按 **Control-C** 停止服务。

连接失败时，检查终端是否运行、两端 Wi-Fi、电脑 IP 和端口。访客网络、VPN 或防火墙可能阻止连接；如系统询问，可允许 Python 接收连接。

## English

### 1. Mac desktop app

These steps and labels describe the published v2.4.0 package. Physical Mac workflows remain unverified.

1. Choose **arm64** for Apple silicon or **x64** for Intel; **macOS 14 or later** is required.
2. Open the `.dmg`, drag **FormCapy** to **Applications**, then open it.
3. If blocked, confirm the download came from the project's Releases, then use **System Settings → Privacy & Security → Open Anyway** and follow the system prompts.

| Task | Action |
| --- | --- |
| Open a draft | Drag in `.docx`, `.txt` or `.md`, click the chooser, press **⌘O**, use Finder's **Open With → FormCapy**, or drop it on the Dock icon |
| Keep it in the Dock | Drag FormCapy from Applications to the Dock |
| Generate a document | Enter your name and title, press **⌘Return** or click the conversion button, then choose where to save |
| Find the result | Click **Show in Finder / Show in Folder** after saving, or open the chosen folder |
| Import from Pages | Use **File → Export To → Word…** in Pages, then select the exported `.docx` |

If the app is missing from **Open With**, launch it once or choose **Other… → Applications → FormCapy**.

The desktop app formats locally on the Mac without internet access, with a **20 MiB** input limit. v2.4.0 supports MLA, APA, custom templates, selected paragraph formatting and body image/table retention; template settings still rebuild headers, footers, sections and pagination. See the [format guide](FORMATS.md).

### 2. Safari: browser-local static build

The static build runs the Python formatter through Pyodide 314.0.7 in a browser Web Worker. It supports DOCX, TXT and Markdown with MLA 9, APA 7 student papers and custom templates. No account is needed; drafts and paper details stay on the device. A nearby computer and shared Wi-Fi are not required.

First use downloads about **15.7 MiB of program assets**. A separate **95 MiB source and license material kit** is available on demand through the license entry and must stay outside the program precache. Offline use needs a completed cache and a service-worker-controlled page. The first page normally needs another navigation before control begins, and browsers may evict cached data. iPhone/iPad memory and download behavior still require physical-device checks.

Use the following Safari workflow. The website is live; Safari and Apple device steps remain unverified:

1. Open [https://formcapy.com/](https://formcapy.com/) in Safari and wait for the program to be ready.
2. Enter your name/title and choose MLA, APA or a custom template. APA also uses the relevant school, course and other fields.
3. Choose a draft, select **Browse** in the system picker, and find a DOCX, TXT or Markdown file under **iCloud Drive** or **On My iPhone/iPad**. Mac uses the Finder picker. Export Pages drafts to Word `.docx` first.
4. To keep selected DOCX paragraph formatting, read and select the paragraphs before generating.
5. Tap **Download Word**. If Safari asks, choose **Download**, then open the result from Safari's Downloads list. The Files app shows it in **Downloads** or your configured location.
6. If Safari opens a document preview, use **Share → Save to Files**, choose a folder under **On My iPhone/iPad** or **iCloud Drive**, then tap **Save**. Where supported, the page's share button can also lead to **Save to Files**.

**Download again** remains available while the page stays open; refreshing or closing it requires generating again. The location depends on **Safari → Downloads** in system settings. On Mac, the magnifying glass beside a Safari download shows it in Finder.

### 3. Original Flask LAN mode: computer processing

This mode remains available for local source previews. It temporarily sends the draft to the computer running Flask, where conversion happens.

#### 3.1 Start and connect

From the project directory, run:

```bash
python mla_web.py --lan --no-browser
```

For a project virtual environment, use `.\.venv\Scripts\python.exe` on Windows or `.venv/bin/python` on Mac/Linux. Source use requires Python 3.10+ and `requirements.txt` dependencies.

1. Keep the terminal open and connect both devices to the same trusted Wi-Fi.
2. Open the address printed under **iPhone / iPad (same Wi-Fi)** in Safari, such as `http://192.168.1.23:8600`. On a phone, `127.0.0.1` and `localhost` point to that phone, so they cannot connect to the computer.
3. Follow the file selection, generation and **Save to Files** steps above. An HTTP LAN page usually lacks the secure context required for system sharing, so its share button may be unavailable. Download first, then share from Safari's preview or Files.

Find a Mac's IPv4 address under **System Settings → Network → current connection → Details → TCP/IP**, or run `ipconfig getifaddr en0` (usually Wi-Fi). Add `--port 8601` to choose a different port.

#### 3.2 Data and connection

The draft is temporarily uploaded over the LAN to the computer. The service attempts to remove temporary files at the end of each request and returns generated documents from memory. This path does not send drafts to a third-party cloud and does not convert offline on the phone. Other devices on the network may reach the page while the server runs. Press **Control-C** in the terminal when finished.

If it cannot connect, check the terminal, Wi-Fi, computer IP and port. Guest networks, VPNs and firewalls may block access; allow Python to accept connections if prompted by the system.
