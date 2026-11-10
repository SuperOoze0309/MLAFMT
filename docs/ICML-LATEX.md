# ICML 2026 LaTeX 源文件预设 / ICML 2026 LaTeX source starter

v2.14.0 开发候选在浏览器内生成 ICML 2026 匿名审稿用 LaTeX 源文件。
它是需要继续编辑和核对的起稿文件，不是已编译的 PDF。文件处理在用户
本机浏览器中完成，文稿不会自动上传。正式网站目前仍为 v2.13.1；现有
桌面和 Android 安装包不包含此入口。

## 使用

1. 在“文档格式”选择 **ICML 2026 · LaTeX**，填写标题。可选择空白模板，
   或添加 TXT、Markdown、DOCX 草稿后生成。
2. 下载 ZIP，解压得到 `main.tex` 和 `README.txt`。ZIP **不包含 ICML 官方
   样式或参考文献样式文件**，也不包含 TeX 编译器，不能单独编译。
3. 从 [ICML 2026 官方样式包](https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip)
   获取样式文件。官方 ZIP 的文件位于根目录：先将完整官方 ZIP 解压到
   LaTeX 工程，再将本项目的 `main.tex` 放在同一目录。`icml2026.sty`
   是必需的；使用 ICML 的 BibTeX 样式时还需要 `icml2026.bst`。保留
   其他官方样式文件，并安装兼容的 TeX 环境和所需宏包。
4. 阅读 [ICML 2026 作者说明](https://icml.cc/Conferences/2026/AuthorInstructions)，
   手动编辑并检查 LaTeX 源文件、参考文献和最终 PDF 后再提交。

本预设明确针对 **ICML 2026**。尚未核验 2027 年的模板或投稿说明，
不能将 2026 样式视为适用于后续会议；投稿前请以目标年份的官方要求为准。

## 内容与匿名限制

- 草稿重建为普通文本，部分 Markdown 或 Word 标题可转为章节；原有 LaTeX
  命令和公式会转义成普通文字。图片、表格结构、公式、文本框、脚注、尾注、复杂格式及分页不会
  自动还原。摘要环境默认留空，不自动识别摘要；类似参考文献的文字保留在
  正文中，需要自行整理引用和参考文献。
- 模板中的作者和机构是匿名占位符；它**不会自动清除**标题、正文、参考文献、
  文件名、PDF 元数据或补充材料中的身份信息。投稿前须按官方要求逐项检查。
- 中文等非 ASCII 文字未必能在生成的 PDF 中正确显示，本预设尚不直接
  支持中文渲染。须在编译前配置兼容的 TeX 引擎和字体，并逐字检查 PDF；
  请勿将成功编译视为文字均已正确显示。
- 生成报告不会检验投稿合规性；目标年份、页数、公式、图表和引用格式均需
  按官方说明及会议要求确认。

## English

The v2.14.0 development candidate creates a local ZIP containing `main.tex`
and `README.txt` for the **ICML 2026** anonymous-review style. It does not
include the official style files, a TeX installation or a rendered PDF. Obtain
the [official style archive](https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip),
extract the complete archive to your TeX project, and place `main.tex` alongside
those files. Consult the [2026 author instructions](https://icml.cc/Conferences/2026/AuthorInstructions)
and the rules for your actual target year; the 2027 template and instructions
have not been verified here.

Drafts are reconstructed as text. Abstracts and citations are not identified
automatically, and figures, table structures, equations, text boxes, footnotes, endnotes,
pagination and rich formatting need manual work. Anonymous placeholders do not anonymize the
title, body, references, filenames, metadata or supplementary files. Chinese and other
non-ASCII characters may not render correctly; configure a compatible TeX engine
and fonts before compiling, then check each character in the PDF. Chinese PDF
rendering is not directly supported by this starter.
