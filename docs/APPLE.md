# MLAFMT 苹果设备使用说明 / Apple Devices

v2.4.0 开发版的应用名为 **FormCapy**，Mac 应用包为 `FormCapy.app`；项目仍为 MLAFMT。下文 MLAFMT 名称也用于已发布的 v2.3.0 安装包。

The v2.4.0 development app is **FormCapy**, with a `FormCapy.app` Mac bundle; the project remains MLAFMT. References to MLAFMT below also apply to the published v2.3.0 packages.

适用于 macOS 14 或更新版本的 Mac，以及同一 Wi-Fi 下 iPhone/iPad 的本地网页预览。

For Macs running macOS 14 or later, plus local web preview on iPhone/iPad over the same Wi-Fi.

> **签名状态 / Signing**：macOS 包为 **ad-hoc 临时签名，未经过 Apple 公证**；首次打开可能被 Gatekeeper 阻止。请只从项目 Releases 下载，并按系统提示在“系统设置 → 隐私与安全性”中允许打开。不要关闭 Gatekeeper 或绕过安全检查。安装和使用不需要付费 Apple 开发者账号。
>
> The macOS build is **ad-hoc signed and not Apple-notarized**. Gatekeeper may block the first launch. Download only from the project's Releases, then allow it in **System Settings → Privacy & Security**. Do not disable Gatekeeper or bypass security checks. No paid Apple Developer account is required.

iPhone/iPad 这一阶段**没有原生 App**，仅通过电脑上的本地网页预览；不通过公网发布，也不在手机上离线处理。

At this stage there is **no native iPhone/iPad app**. Preview runs as a local web page served by your computer; it is not published to the public internet and does not process documents offline on the phone.

## 中文

### 1. Mac 桌面版

#### 安装

1. 选对版本：M1/M2/M3/M4 等 Apple 芯片用 **arm64**；Intel Mac 用 **x64**。需要 **macOS 14 或更新版本**。
2. 打开 `.dmg`，把 **MLAFMT** 拖到“应用程序”，再从“应用程序”打开。
3. 首次打开若被阻止：确认文件来自项目 Releases，然后到 **系统设置 → 隐私与安全性** 点 **仍要打开**，按提示输入管理员密码。不要关闭 Gatekeeper 或绕过安全检查。

#### 常用路径

| 你想做的事 | 操作 |
| --- | --- |
| 打开草稿 | 把 `.docx` / `.txt` / `.md` 拖进窗口；点选择区域；按 **⌘O（Command-O）**；在 Finder 右键草稿 → **打开方式 → MLAFMT**；或把草稿拖到 Dock 中的 MLAFMT 图标 |
| 让 MLAFMT 留在 Dock | 从“应用程序”把 MLAFMT 拖到 Dock；之后可把草稿直接拖到它的 Dock 图标 |
| 生成文档 | 填写姓名和论文标题，按 **⌘Return（Command-Return）** 或点 **转换为 MLA 格式**，再选择保存位置 |
| 找到生成的文件 | 保存后点结果区的 **在 Finder 中显示 / 打开文件夹**，Finder 会打开保存位置并选中生成的 `.docx`；也可以到保存时选择的文件夹、桌面或“下载”中查找 |
| 导入 Pages 草稿 | 先在 Pages 中 **文件 → 导出到 → Word…**，保存为 `.docx`，再把该文件拖入 MLAFMT |

如果 Finder 的“打开方式”列表中没有 MLAFMT，先启动一次应用，或选择 **其他… → 应用程序 → MLAFMT**。Dock 图标需要先打开应用或手动拖到 Dock。

MLA 转换在 Mac 本机完成，桌面版不需要联网。支持 `.docx`、`.txt`、`.md`，单个文件不超过 20 MB。生成后请检查文档；图片、表格、脚注等可能丢失。

### 2. iPhone / iPad：本地网页预览

#### 2.1 在电脑上启动服务

在项目文件夹的终端运行：

```bash
python mla_web.py --lan --no-browser
```

若使用项目虚拟环境：Windows 运行 `.\.venv\Scripts\python.exe mla_web.py --lan --no-browser`；Mac/Linux 运行 `.venv/bin/python mla_web.py --lan --no-browser`。

新版服务会打印 **iPhone / iPad (same Wi-Fi)** 地址；优先直接复制其中与你的 Wi-Fi 对应的地址。更换端口可加 `--port 8601`。

保持终端窗口开启。源码运行需要 Python 3.10+ 和 `requirements.txt` 中的依赖；已经配置好的环境直接运行即可。

终端打印的 `http://127.0.0.1:8600` 只供电脑本机使用，**不要把这个地址输入手机**。在电脑上查看 IPv4：

- **系统设置 → 网络 → 当前连接（Wi-Fi/以太网）→ 详细信息 → TCP/IP → IP 地址**；或
- 在终端运行 `ipconfig getifaddr en0`（Wi-Fi 通常是 `en0`；没有输出时用系统设置查看）。

#### 2.2 在 iPhone/iPad 打开

1. 让 iPhone/iPad 和电脑连同一个 Wi-Fi，不要使用访客网络。
2. 在 Safari 地址栏输入 `http://电脑IP:8600`，例如 `http://192.168.1.23:8600`。**不要输入 `127.0.0.1` 或 `localhost`**，那会指向手机自己。
3. 填写姓名和论文标题，选择草稿，然后生成。Pages 草稿请先导出为 Word `.docx`。
4. 生成后页面会持续显示 **下载 Word / 再次下载** 入口；保持页面打开即可重复下载，刷新或关闭页面后需要重新生成。
5. 只有页面通过 **HTTPS** 打开且浏览器支持系统分享时，才会提供分享按钮。通过电脑的 **HTTP 局域网地址**预览时，**不能保证分享按钮可用**；需要分享时，先把文档下载到“文件”App，再从“文件”中转发或打开。

#### 2.3 下载文件在哪里

- **Safari**：点**下载**按钮（通常在工具栏或地址栏附近）查看下载列表；点按下载项可打开文件，若系统提供“在文件夹中显示”，会转到“文件”App。
- **文件 App**：打开 **浏览 → 我的 iPhone/iPad** 或 **iCloud Drive → Downloads（下载）**；也可能出现在 **最近项目**。
- 具体名称和位置会随 iOS/iPadOS 版本、Safari 下载设置（设置中的 **Safari → 下载**）和你选择的保存位置变化。

#### 2.4 数据与网络安全

网页草稿会通过局域网**临时上传到正在运行服务的电脑**，由电脑完成转换；转换后临时文件会被清理。它不是手机本地离线处理，也不会上传到第三方云端。服务运行期间，同一网络中的设备可能访问该页面；请只在可信 Wi-Fi 使用，完成后在电脑终端按 **Control-C** 停止服务。

#### 2.5 连不上或没有分享按钮

- 确认终端仍在运行、手机和电脑在同一 Wi-Fi、URL 使用电脑的 IPv4 地址和端口 `8600`，且没有输入 `127.0.0.1`。
- 访客网络、VPN 或 macOS 防火墙可能阻止访问；如有防火墙提示，允许 Python 接收连接。
- 没有分享按钮是 HTTP 局域网预览的正常限制；使用 **下载 Word / 再次下载** 保存即可。

## English

### 1. Mac App

#### Install

1. Choose the right build: **arm64** for Apple silicon (M1/M2/M3/M4 and later), **x64** for Intel. Requires **macOS 14 or later**.
2. Open the `.dmg`, drag **MLAFMT** to **Applications**, then open it from Applications.
3. If macOS blocks the first launch, confirm the file came from the project's Releases, then open **System Settings → Privacy & Security** and choose **Open Anyway**. Enter an administrator password if asked. Do not disable Gatekeeper or bypass security checks.

#### Common paths

| What you want | How to do it |
| --- | --- |
| Open a draft | Drag a `.docx` / `.txt` / `.md` file into the window; click the choose area; press **⌘O (Command-O)**; right-click the draft in Finder → **Open With → MLAFMT**; or drag the draft onto the MLAFMT icon in the Dock |
| Keep MLAFMT in the Dock | Drag MLAFMT from Applications to the Dock; afterwards you can drop drafts directly on its Dock icon |
| Create the document | Enter your name and essay title, press **⌘Return (Command-Return)** or click **Convert to MLA**, then choose where to save |
| Find the generated file | After saving, click **Show in Finder / Show in Folder** in the result area. Finder opens the save location and selects the generated `.docx`. You can also look in the folder you chose, the Desktop or Downloads |
| Import a Pages draft | In Pages, use **File → Export To → Word…**, save a `.docx`, then drag that file into MLAFMT |

If MLAFMT is missing from Finder's **Open With** list, launch the app once, or choose **Other… → Applications → MLAFMT**. The Dock icon must already be there because the app is open or was added manually.

Formatting runs locally on the Mac; the desktop app works offline. Supported inputs are `.docx`, `.txt` and `.md`, up to 20 MB each. Proofread the result: images, tables, footnotes and similar content may be lost.

### 2. iPhone / iPad: local web preview

#### 2.1 Start the server on the computer

In a terminal, from the project folder, run:

```bash
python mla_web.py --lan --no-browser
```

With the project virtual environment, use `.\.venv\Scripts\python.exe mla_web.py --lan --no-browser` on Windows or `.venv/bin/python mla_web.py --lan --no-browser` on Mac/Linux.

The updated server prints **iPhone / iPad (same Wi-Fi)** addresses. Copy the address for your Wi-Fi connection directly. Use `--port 8601` to choose another port.

Keep the terminal window open. Running from source requires Python 3.10+ and the dependencies in `requirements.txt`; an already configured environment only needs the command.

The `http://127.0.0.1:8600` address printed in the terminal works only on the computer. **Do not enter that address on the phone.** Find the computer's IPv4 address:

- **System Settings → Network → current connection (Wi-Fi/Ethernet) → Details → TCP/IP → IP Address**; or
- run `ipconfig getifaddr en0` in Terminal (usually `en0` for Wi-Fi; use System Settings if it prints nothing).

#### 2.2 Open it on iPhone/iPad

1. Connect the iPhone/iPad and the computer to the same Wi-Fi. Do not use a guest network.
2. In Safari, open `http://COMPUTER-IP:8600`, for example `http://192.168.1.23:8600`. **Do not enter `127.0.0.1` or `localhost`**, which would point to the phone itself.
3. Enter your name and essay title, choose a draft, and generate the document. For Pages, export to Word `.docx` first.
4. After generation, the page keeps a **Download Word / Download again** entry while it stays open. Refreshing or closing the page requires generating the document again.
5. A system share button is offered only when the page is opened over **HTTPS** and the browser supports sharing. With the computer's **HTTP LAN address**, **the share button is not guaranteed to work**. To share, download the file to the Files app first, then share or open it from there.

#### 2.3 Where downloads go

- **Safari**: tap the **Downloads** button (usually near the toolbar or address bar) to see the download list. Tap a download to open it; if the system offers "Show in Folder", it opens the Files app.
- **Files app**: open **Browse → On My iPhone/iPad** or **iCloud Drive → Downloads**; the file may also appear in **Recents**.
- Exact names and locations vary with the iOS/iPadOS version, the Safari download setting (Safari → Downloads in Settings) and the location you choose.

#### 2.4 Data and network safety

The web draft is **temporarily uploaded over the local network to the computer running the server**, which performs the conversion; temporary files are removed afterwards. It is not processed offline on the phone and is not uploaded to a third-party cloud. While the server runs, other devices on the same network may be able to reach the page. Use it only on a trusted Wi-Fi network, and press **Control-C** in the computer terminal when you are done.

#### 2.5 If the page or share button does not work

- Check that the terminal is still running, both devices are on the same Wi-Fi, and the URL uses the computer's IPv4 address and port `8600` — not `127.0.0.1`.
- A guest network, VPN or the macOS firewall may block access. If the firewall asks, allow Python to accept incoming connections.
- A missing share button is an expected limitation of HTTP LAN preview. Use **Download Word / Download again** to save the file.
