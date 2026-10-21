# FormCapy 形象说明 / Branding

## 中文

### 名称与水豚

GitHub 仓库与源码项目名称保持 **MLAFMT**，应用显示名为 **FormCapy**。网页、桌面和 Android 界面采用 FormCapy 名称与水豚吉祥物。内部模块、Android 包 ID、原有设置和安装升级标识继续沿用现有项目身份。

### 网站

浏览器本地静态版已通过 Cloudflare 免费 Workers Static Assets 上线：[formcapy.com](https://formcapy.com/) · [www.formcapy.com](https://www.formcapy.com/)。实际域名连接使用 Workers Routes；两入口均已验证可信 HTTPS 和 HTTP 升级重定向。静态版在浏览器内通过 Pyodide 运行 Python 排版核心，无需账号且草稿不上传。原 Flask 本地网页预览仍可使用。部署记录见[部署说明](DEPLOYMENT.md)。

### 图像资源

- [透明水豚主图](../static/capybara-mascot.png)：统一形象的源 PNG。
- [64 像素界面图](../static/capybara-64.png)：供网页、桌面顶栏、Android 内嵌页面与 README 使用。
- `assets/icons/capybara-{16,32,48,64,128,256,512,1024}.png`：从主图机械缩放的应用图标尺寸，供各平台打包使用。
- Android 使用同一水豚前景，周围保留留白，由系统应用图标遮罩。

主图使用内置 imagegen 工具生成，[提示词记录](../static/capybara-mascot.prompt.txt)包含生成过程。各尺寸只做透明背景下的机械缩放；Windows 可运行 `scripts/prepare_brand_assets.ps1` 重新派生，其他平台构建直接使用仓库内的 PNG。

### 版本与截图

FormCapy 应用名称与水豚形象已用于上线网页版及 [v2.4.0 桌面和 Android 安装包](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0)。README 的新网站截图使用真实公网操作与虚构示例；标注 **v2.3.0** 的历史界面截图保留当时的 MLAFMT 名称。

## English

### Name and mascot

The GitHub repository and source project remain **MLAFMT**, and the application's display name is **FormCapy**. The web, desktop and Android interfaces use FormCapy and its capybara mascot. Internal modules, Android package ID, existing settings and installation/update identifiers keep their current project identity.

### Website

The browser-local static build is live at [formcapy.com](https://formcapy.com/) and [www.formcapy.com](https://www.formcapy.com/) on Cloudflare's free Workers Static Assets plan. The domains use Workers Routes; both entry points passed trusted HTTPS and HTTP upgrade redirect checks. The static build runs the Python formatter through Pyodide in the browser, with no account or draft upload. The original Flask local web preview remains available. See [deployment notes](DEPLOYMENT.md) for the launch record.

### Image assets

- [Transparent capybara master](../static/capybara-mascot.png): the source PNG for the shared mascot.
- [64-pixel interface image](../static/capybara-64.png): used by the web, desktop header, embedded Android page and README.
- `assets/icons/capybara-{16,32,48,64,128,256,512,1024}.png`: mechanically resized application-icon assets for platform packaging.
- Android uses the same capybara foreground with surrounding space for the system's icon mask.

The master was generated with the built-in imagegen tool; the [prompt record](../static/capybara-mascot.prompt.txt) documents the process. Size variants only resize the artwork with transparency preserved. On Windows, run `scripts/prepare_brand_assets.ps1` to regenerate them; other platforms build from the committed PNGs.

### Versions and screenshots

The live website and [v2.4.0 desktop and Android packages](https://github.com/SuperOoze0309/MLAFMT/releases/tag/v2.4.0) use the FormCapy name and capybara. The new README website screenshot shows a real public-site session with fictional details. Historical screenshots labelled **v2.3.0** retain their original MLAFMT name.
