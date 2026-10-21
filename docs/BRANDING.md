# FormCapy 形象说明 / Branding

## 中文

### 名称与水豚

GitHub 仓库与源码项目名称保持 **MLAFMT**，应用显示名为 **FormCapy**。网页、桌面和 Android 界面采用 FormCapy 名称与水豚吉祥物。内部模块、Android 包 ID、原有设置和安装升级标识继续沿用现有项目身份。

### 域名规划

计划使用 `formcapy.com` 作为网站域名。目前这是规划，尚未部署，也不表示已经提供可访问的线上服务。本地网页预览仍按现有方式运行。

### 图像资源

- [透明水豚主图](../static/capybara-mascot.png)：统一形象的源 PNG。
- [64 像素界面图](../static/capybara-64.png)：供网页、桌面顶栏、Android 内嵌页面与 README 使用。
- `assets/icons/capybara-{16,32,48,64,128,256,512,1024}.png`：从主图机械缩放的应用图标尺寸，供各平台打包使用。
- Android 使用同一水豚前景，周围保留留白，由系统应用图标遮罩。

主图使用内置 imagegen 工具生成，[提示词记录](../static/capybara-mascot.prompt.txt)包含生成过程。各尺寸只做透明背景下的机械缩放；Windows 可运行 `scripts/prepare_brand_assets.ps1` 重新派生，其他平台构建直接使用仓库内的 PNG。

### 版本与截图

FormCapy 应用名称与水豚形象属于 **v2.4.0 未发布开发版**。README 中现有界面截图和正式下载仍对应 **v2.3.0**，保留当时的 MLAFMT 名称与原截图。

## English

### Name and mascot

The GitHub repository and source project remain **MLAFMT**, and the application's display name is **FormCapy**. The web, desktop and Android interfaces use FormCapy and its capybara mascot. Internal modules, Android package ID, existing settings and installation/update identifiers keep their current project identity.

### Planned domain

`formcapy.com` is the planned website domain. It is not deployed, and the plan does not indicate that a public online service is available. The existing local web preview workflow continues to apply.

### Image assets

- [Transparent capybara master](../static/capybara-mascot.png): the source PNG for the shared mascot.
- [64-pixel interface image](../static/capybara-64.png): used by the web, desktop header, embedded Android page and README.
- `assets/icons/capybara-{16,32,48,64,128,256,512,1024}.png`: mechanically resized application-icon assets for platform packaging.
- Android uses the same capybara foreground with surrounding space for the system's icon mask.

The master was generated with the built-in imagegen tool; the [prompt record](../static/capybara-mascot.prompt.txt) documents the process. Size variants only resize the artwork with transparency preserved. On Windows, run `scripts/prepare_brand_assets.ps1` to regenerate them; other platforms build from the committed PNGs.

### Versions and screenshots

The FormCapy application name and capybara belong to the **unreleased v2.4.0 development version**. Existing README screenshots and published downloads still represent **v2.3.0**, retaining their historical MLAFMT name and original screenshots.
