# MLAFMT for Linux / 安装说明

The x64 package targets **Ubuntu 22.04 or newer** and comparable desktop Linux
systems with **glibc 2.35+** and X11 or XWayland. Python is included.

1. Download `MLAFMT-v…-linux-x64.AppImage`.
2. In file properties, allow execution as a program, then open the AppImage.
3. Choose a draft, fill in your name and title, then save the formatted `.docx`.

Alternatively, use a terminal:

```bash
chmod +x MLAFMT-v*-linux-x64.AppImage
./MLAFMT-v*-linux-x64.AppImage
```

If your system does not permit FUSE mounts, launch with
`./MLAFMT-v…-linux-x64.AppImage --appimage-extract-and-run`, or extract the
`.tar.gz` download and open `MLAFMT.AppDir/AppRun`.
Conversion runs offline; documents are not uploaded.

适用于 Ubuntu 22.04 或更新版本及相近的 x64 Linux 桌面系统。
下载 AppImage 后，在文件属性中允许作为程序执行，然后打开。
若系统不支持 FUSE 挂载，可以下载 tar.gz、解压并打开 `MLAFMT.AppDir/AppRun`。
程序包含 Python，无需另外安装，文档转换可以离线完成。

See `Documentation/README.md` for illustrated instructions and bundled licenses.
The application sets MLA's Times New Roman font in the Word document. Rendering
in your word processor depends on whether that font is installed on your system.
