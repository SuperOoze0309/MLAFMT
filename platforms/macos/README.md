# MLAFMT for macOS / macOS 构建与使用

macOS 14+ · Apple silicon `arm64` + Intel `x64` · drag **MLAFMT** from the `.dmg` to Applications · ad-hoc signed, not Apple-notarized.

[安装 / Install](INSTALL.md) · [Apple 使用说明 / Apple guide](../../docs/APPLE.md)

## English

### Use

Download the DMG that matches the Mac: **arm64** for Apple silicon, **x64** for Intel. Open the DMG, drag **MLAFMT** to **Applications**, then open it. No Python installation is needed, and formatting runs locally without a network connection.

Enter your name and essay title, choose a `.docx`, `.txt` or `.md` draft, then create and save the Word document. For a Pages draft, use **File → Export To → Word…** first.

Common paths:

- **⌘O** (Command-O) opens the draft picker; **⌘Return** (Command-Return) starts conversion.
- In Finder, right-click a draft and choose **Open With → MLAFMT**.
- Drag a draft onto the MLAFMT icon in the Dock.
- After saving, choose **Show in Finder** in the result area to reveal and select the generated `.docx`.

See [docs/APPLE.md](../../docs/APPLE.md) for the full Mac and iPhone/iPad guide.

The app is **ad-hoc signed and not Apple-notarized**. It does not bypass Gatekeeper, and no paid Apple Developer account is required to install or use it. If macOS blocks the first launch, confirm the download source and use **System Settings → Privacy & Security → Open Anyway**; do not disable Gatekeeper.

### Build

Build on each target Mac with **Python 3.12** and working Tkinter. Run Python natively on the target architecture; the script rejects a mismatched interpreter. From the repository root:

```bash
# Apple silicon
bash platforms/macos/build_macos.sh --python python3 --architecture arm64 --expected-version v2.3.0

# Intel Mac
bash platforms/macos/build_macos.sh --python python3 --architecture x86_64 --expected-version v2.3.0
```

The script creates an isolated environment under `build/macos/<architecture>`, installs `requirements-build.txt`, reads the version from `mla_formatter.py`, and runs PyInstaller. Tcl/Tk and the matching TkDnD native library are bundled. The packaged app is smoke-tested for TkDnD availability, GUI startup and document conversion.

Outputs:

- `dist/release/MLAFMT-v2.3.0-macos-arm64.dmg`
- `dist/release/MLAFMT-v2.3.0-macos-x64.dmg`
- Uncompressed app: `build/macos/<architecture>/dist/MLAFMT.app`

The DMG contains an Applications shortcut, `Read Me.html` (the install guide), `Documentation/docs/APPLE.md`, other documentation, build metadata and license notices.

macOS 14 is the minimum because the bundled arm64 TkDnD library targets that deployment version; older systems are not claimed. Default builds are ad-hoc signed, which is not Apple notarization and does not bypass Gatekeeper. Maintainer signing and release procedures are separate from this guide.

## 中文

### 使用

下载与 Mac 匹配的 DMG：Apple 芯片用 **arm64**，Intel Mac 用 **x64**。打开 DMG，把 **MLAFMT** 拖到“应用程序”，然后打开。无需安装 Python，排版在本机完成，不需要联网。

填写姓名和论文标题，选择 `.docx`、`.txt` 或 `.md` 草稿，然后生成并保存 Word 文档。Pages 草稿请先 **文件 → 导出到 → Word…**。

常用路径：

- **⌘O**（Command-O）选择草稿；**⌘Return**（Command-Return）开始转换。
- 在 Finder 右键草稿，选择 **打开方式 → MLAFMT**。
- 把草稿拖到 Dock 中的 MLAFMT 图标。
- 保存后在结果区点 **在 Finder 中显示**，Finder 会定位并选中生成的 `.docx`。

完整的 Mac 与 iPhone/iPad 说明见 [docs/APPLE.md](../../docs/APPLE.md)。

应用为 **ad-hoc 临时签名，未经过 Apple 公证**，不会绕过 Gatekeeper；安装和使用不需要付费 Apple 开发者账号。首次打开若被 macOS 阻止，请确认下载来源后，到 **系统设置 → 隐私与安全性 → 仍要打开**；不要关闭 Gatekeeper。

### 构建

在对应架构的 Mac 上使用 **Python 3.12** 和可用的 Tkinter 构建。Python 必须原生运行在目标架构上；脚本会拒绝不匹配的解释器。在仓库根目录运行：

```bash
# Apple 芯片
bash platforms/macos/build_macos.sh --python python3 --architecture arm64 --expected-version v2.3.0

# Intel Mac
bash platforms/macos/build_macos.sh --python python3 --architecture x86_64 --expected-version v2.3.0
```

脚本会在 `build/macos/<architecture>` 创建隔离环境，安装 `requirements-build.txt`，从 `mla_formatter.py` 读取版本，然后运行 PyInstaller。Tcl/Tk 和对应的 TkDnD 原生库会一起打包。打包后的应用会做 TkDnD 可用性、GUI 启动和文档转换的冒烟测试。

输出：

- `dist/release/MLAFMT-v2.3.0-macos-arm64.dmg`
- `dist/release/MLAFMT-v2.3.0-macos-x64.dmg`
- 未压缩应用：`build/macos/<architecture>/dist/MLAFMT.app`

DMG 内包含“应用程序”快捷方式、`Read Me.html`（安装说明）、`Documentation/docs/APPLE.md` 等文档、构建元数据和许可证声明。

最低支持 macOS 14，是因为打包的 arm64 TkDnD 库以该部署版本为目标；不宣称支持更旧系统。默认构建为 ad-hoc 临时签名，不是 Apple 公证，也不能绕过 Gatekeeper。维护者的签名与发布流程不在本说明中。
