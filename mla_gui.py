"""
mla_gui.py  (v2.1)
Desktop app for one-click MLA formatting.  中英双语 / Chinese-English UI.

Home screen = only what most people need:
    1. fill in name + title   2. drop the draft   3. click Convert
Everything else lives in  ⚙ Advanced / 高级选项  (secondary window).
"""

import json
import locale
import os
import subprocess
import queue
import tempfile
import threading
from pathlib import Path
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from mla_formatter import (
    MLG_DISCLAIMER,
    SUPPORTED_EXTS,
    __version__,
    convert_draft_to_mla,
    create_blank_template,
    date_warning,
    extract_last_name,
    format_summary,
    generate_filename,
    today_mla,
)

try:  # optional drag-and-drop
    from tkinterdnd2 import DND_FILES, TkinterDnD
    HAS_DND = True
except ImportError:
    HAS_DND = False

CONFIG_PATH = os.path.join(
    os.environ.get("APPDATA") or os.environ.get("XDG_CONFIG_HOME")
    or os.path.join(os.path.expanduser("~"), ".config"), "MLAFMT", "settings.json")
LEGACY_CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".mlafmt.json")

# ──────────────────────────────────────────────────────────────────────
#  Strings
# ──────────────────────────────────────────────────────────────────────
T = {
    "zh": {
        "app": "MLA 一键排版",
        "tagline": "把你的英文作文草稿，一键变成符合 MLA 第 9 版格式的 Word 文档。",
        "what": "自动设置：Times New Roman 12 号 · 双倍行距 · 1 英寸页边距 · 右上角“姓 页码” · "
                "左上角个人信息 · 标题居中 · 首行缩进 · Works Cited 另起一页并按字母排序",
        "step1": "① 填写信息",
        "step2": "② 选择草稿",
        "step3": "③ 生成",
        "name": "你的姓名 *",
        "title": "作文标题 *",
        "instructor": "老师",
        "course": "课程",
        "date": "日期",
        "name_ph": "例：Jane Doe",
        "title_ph": "例：The Role of Memory in Hamlet",
        "instructor_ph": "例：Professor Smith",
        "course_ph": "例：ENG 101",
        "drop": "把草稿拖到这里，或点击选择文件\n支持 .docx / .txt / .md",
        "drop_nodnd": "点击这里选择草稿文件\n支持 .docx / .txt / .md",
        "convert": "转换为 MLA 格式",
        "blank": "还没写？生成空白 MLA 模板",
        "advanced": "⚙ 高级选项",
        "lang_btn": "English",
        "ready": "准备就绪：填好姓名和标题，选择草稿即可。",
        "loaded": "已选择：{f}",
        "need_file": "请先选择或拖入一个草稿文件。",
        "need_name": "请填写你的姓名。",
        "need_title": "请填写作文标题。",
        "date_tip": "日期建议用 MLA 格式（日 月 年），例如 “{d}”。\n\n仍然继续吗？",
        "date_tip_title": "检查日期",
        "unsupported": "只支持 .docx、.txt、.md 文件。\n（.doc / Pages / Google Docs 请先另存为 .docx）",
        "not_found": "找不到这个文件。",
        "save_as": "保存 MLA 文档为…",
        "save_blank": "保存空白模板为…",
        "same_file": "不能覆盖原草稿，请换一个文件名。",
        "working": "正在生成…",
        "done": "✓ 已保存：{f}（{b} 段正文，{w} 条参考文献{r}）",
        "removed": "，已去掉草稿里重复的 {n} 行抬头",
        "done_blank": "✓ 空白模板已保存：{f}",
        "empty": "草稿里没有读到正文，请检查文件。",
        "perm": "无法写入文件。如果它正在 Word 里打开，请先关闭再试，或换个文件夹。",
        "bad_doc": "无法读取这个文档，文件可能已损坏或格式不对。",
        "error": "出错了：{e}",
        "menu_file": "文件",
        "menu_open": "选择草稿…",
        "menu_blank": "生成空白模板…",
        "menu_quit": "退出",
        "menu_settings": "设置",
        "menu_help": "帮助",
        "menu_howto": "使用说明",
        "menu_about": "关于",
        # advanced window
        "adv_title": "高级选项",
        "adv_header": "页眉",
        "lastname": "页眉里的姓",
        "lastname_hint": "留空则自动取姓名最后一个词（会自动忽略 Jr. / III 等）。\n"
                         "复姓或特殊情况手动填写，例如 “Smith-Jones”。",
        "adv_txt": "纯文本（.txt / .md）草稿",
        "mode_blank": "空一行算一段（推荐）",
        "mode_line": "每一行都算一段",
        "md": "用 *星号* 包住的文字变斜体（书名、期刊名）",
        "adv_body": "正文处理",
        "strip": "去掉草稿里已有的姓名/标题抬头，避免重复",
        "headings": "自动识别小标题并加粗（实验性）",
        "bq": "以 > 开头的段落作为长引文缩进 0.5 英寸",
        "adv_after": "保存后",
        "open_after": "自动打开生成的文档",
        "adv_preview": "将应用的格式",
        "close": "完成",
        "howto": "1. 填写你的姓名和作文标题（老师、课程可选，日期默认今天）。\n"
                 "2. 把草稿 .docx 或 .txt 拖进窗口，或点击选择。\n"
                 "3. 点「转换为 MLA 格式」，选择保存位置。\n\n"
                 "小提示：\n"
                 "• 草稿最后写一行 “Works Cited”，下面每段一条文献，会自动另起一页、排序、悬挂缩进。\n"
                 "• Word 草稿里的斜体会保留；纯文本里用 *书名* 表示斜体。\n"
                 "• 其它设置在「⚙ 高级选项」。",
        "about": "MLA 一键排版 v{v}\n按 MLA Handbook 第 9 版排版。\n\n"
                 "本工具只处理正文文字：斜体/粗体/下划线会保留，图片、脚注、表格、列表等可能丢失。"
                 "提交前请自己再检查一遍。",
    },
    "en": {
        "app": "MLA Formatter",
        "tagline": "Turn your essay draft into a correctly formatted MLA (9th ed.) Word document in one click.",
        "what": "Sets up automatically: Times New Roman 12 pt · double spacing · 1-inch margins · "
                "\"LastName page#\" header · heading block · centered title · indents · "
                "Works Cited on a new page, alphabetized",
        "step1": "① Your info",
        "step2": "② Your draft",
        "step3": "③ Create",
        "name": "Your name *",
        "title": "Essay title *",
        "instructor": "Instructor",
        "course": "Course",
        "date": "Date",
        "name_ph": "e.g. Jane Doe",
        "title_ph": "e.g. The Role of Memory in Hamlet",
        "instructor_ph": "e.g. Professor Smith",
        "course_ph": "e.g. ENG 101",
        "drop": "Drag your draft here, or click to choose a file\n.docx / .txt / .md",
        "drop_nodnd": "Click here to choose your draft\n.docx / .txt / .md",
        "convert": "Convert to MLA",
        "blank": "No draft yet? Create a blank MLA template",
        "advanced": "⚙ Advanced",
        "lang_btn": "中文",
        "ready": "Ready: enter your name and title, then choose a draft.",
        "loaded": "Selected: {f}",
        "need_file": "Please choose or drop a draft file first.",
        "need_name": "Please enter your name.",
        "need_title": "Please enter the essay title.",
        "date_tip": "MLA dates are day month year, e.g. \"{d}\".\n\nContinue anyway?",
        "date_tip_title": "Check date",
        "unsupported": "Only .docx, .txt and .md files are supported.\n"
                       "(For .doc / Pages / Google Docs, save as .docx first.)",
        "not_found": "That file does not exist.",
        "save_as": "Save MLA document as…",
        "save_blank": "Save blank template as…",
        "same_file": "That would overwrite your draft — please pick a different name.",
        "working": "Working…",
        "done": "✓ Saved: {f} ({b} paragraphs, {w} Works Cited entries{r})",
        "removed": ", removed {n} duplicate heading line(s)",
        "done_blank": "✓ Blank template saved: {f}",
        "empty": "No body text was found in the draft. Please check the file.",
        "perm": "Can't write that file. If it is open in Word, close it and try again, "
                "or choose another folder.",
        "bad_doc": "Can't read that document — it may be damaged or not a real .docx.",
        "error": "Something went wrong: {e}",
        "menu_file": "File",
        "menu_open": "Choose draft…",
        "menu_blank": "Create blank template…",
        "menu_quit": "Quit",
        "menu_settings": "Settings",
        "menu_help": "Help",
        "menu_howto": "How to use",
        "menu_about": "About",
        "adv_title": "Advanced options",
        "adv_header": "Page header",
        "lastname": "Last name in header",
        "lastname_hint": "Blank = last word of your name (Jr., III etc. are skipped).\n"
                         "Fill in for special cases, e.g. \"Smith-Jones\".",
        "adv_txt": "Plain-text (.txt / .md) drafts",
        "mode_blank": "Blank line between paragraphs (recommended)",
        "mode_line": "Every line is a paragraph",
        "md": "*Asterisks* make italics (titles of books, journals)",
        "adv_body": "Body text",
        "strip": "Remove a name/title heading already in the draft (no duplicates)",
        "headings": "Detect section headings and bold them (experimental)",
        "bq": "Paragraphs starting with > become block quotes (0.5 in)",
        "adv_after": "After saving",
        "open_after": "Open the document automatically",
        "adv_preview": "Formatting that will be applied",
        "close": "Done",
        "howto": "1. Enter your name and essay title (instructor/course optional, date defaults to today).\n"
                 "2. Drag your .docx or .txt draft into the window, or click to choose it.\n"
                 "3. Click \"Convert to MLA\" and choose where to save.\n\n"
                 "Tips:\n"
                 "• End the draft with a line \"Works Cited\" and one source per paragraph — "
                 "it goes on a new page, sorted, with hanging indents.\n"
                 "• Italics in a Word draft are kept; in plain text write *Title*.\n"
                 "• Everything else is under \"⚙ Advanced\".",
        "about": "MLA Formatter v{v}\nFollows the MLA Handbook, 9th edition.\n\n" + MLG_DISCLAIMER,
    },
}


T["zh"].update({
    "hero": "让草稿，成为一篇好论文。", "eyebrow": "专注写作 · 排版交给我们",
    "tagline": "填写信息，选择草稿。几秒钟，得到整洁的 MLA Word 文档。",
    "step1": "01  论文信息", "step2": "02  导入草稿", "advanced": "高级选项",
    "name": "姓名 *", "title": "论文标题 *", "blank": "生成空白模板",
    "preview": "排版预览", "preview_hint": "布局示意 · 实际正文以生成文档为准",
    "preview_name": "Your Name", "preview_title": "Your Essay Title",
    "spec_title": "MLA 9 格式，自动就位", "spec_font": "Times New Roman · 12 号",
    "spec_spacing": "双倍行距 · 1 英寸页边距", "spec_header": "姓氏 + 自动页码",
    "spec_cited": "Works Cited · 排序与悬挂缩进",
    "local": "在本机处理，草稿无需上传", "draft_types": "Word / 文本 / Markdown 草稿",
    "word_type": "Word 文档", "text_type": "文本 / Markdown", "choose": "选择草稿",
    "remove": "移除文件", "selected": "已选择草稿", "file_size": "{size} KB · 点击更换",
    "limit": "支持 .docx / .txt / .md · 最大 20 MB", "too_large": "文件超过 20 MB，请选择较小的草稿。",
    "disclaimer": "保留斜体、粗体和下划线。图片、表格、脚注等可能丢失，提交前请检查。",
    "status_ready": "就绪 · 先填写姓名与标题，再选择草稿。",
    "done": "已保存 {f} · {b} 段正文 · {w} 条参考文献{r}",
    "done_blank": "空白模板已保存：{f}", "working": "正在排版，请稍候…",
    "done_removed": "已保存 {f} · {b} 段正文 · {w} 条参考文献 · 去重 {r} 行抬头",
    "open_result": "打开文档", "view_folder": "打开文件夹", "menu_language": "语言 / Language",
    "format_preview": "MLA 格式预览", "missing_source": "草稿已被移动或删除，请重新选择。",
    "preview_header": "页眉：{name} 1", "preview_specs": "Times New Roman 12 号\n双倍行距 · 1 英寸页边距\n正文首行缩进 0.5 英寸\nWorks Cited 另起一页，悬挂缩进",
})
T["en"].update({
    "hero": "Your words. Beautifully in order.", "eyebrow": "FOCUS ON YOUR WORDS",
    "tagline": "Add your details and a draft. Get a clean MLA Word document in seconds.",
    "step1": "01  Paper details", "step2": "02  Add your draft", "advanced": "Advanced options",
    "name": "Your name *", "title": "Essay title *", "blank": "Create blank template",
    "preview": "Paper preview", "preview_hint": "Layout illustration · your document contains your draft",
    "preview_name": "Your Name", "preview_title": "Your Essay Title",
    "spec_title": "MLA 9, taken care of", "spec_font": "Times New Roman · 12 pt",
    "spec_spacing": "Double spacing · 1-inch margins", "spec_header": "Last name + automatic page number",
    "spec_cited": "Works Cited · sorted, hanging indents",
    "local": "Processed on your device. No upload needed.", "draft_types": "Word / text / Markdown drafts",
    "word_type": "Word documents", "text_type": "Text / Markdown", "choose": "Choose your draft",
    "remove": "Remove file", "selected": "Draft selected", "file_size": "{size} KB · click to replace",
    "limit": ".docx / .txt / .md · up to 20 MB", "too_large": "This file exceeds 20 MB. Please choose a smaller draft.",
    "disclaimer": "Italic, bold and underline are kept. Images, tables and footnotes may be lost. Always proofread.",
    "status_ready": "Ready · add your name and title, then choose a draft.",
    "done": "Saved {f} · {b} paragraphs · {w} sources{r}",
    "done_blank": "Blank template saved: {f}", "working": "Formatting your paper…",
    "done_removed": "Saved {f} · {b} paragraphs · {w} sources · removed {r} heading lines",
    "open_result": "Open document", "view_folder": "Show in folder", "menu_language": "Language / 语言",
    "format_preview": "MLA format preview", "missing_source": "Your draft was moved or deleted. Please select it again.",
    "preview_header": "Header: {name} 1", "preview_specs": "Times New Roman 12 pt\nDouble spacing · 1-inch margins\nBody first-line indent: 0.5 inch\nWorks Cited: new page, hanging indents",
})

ACCENT = "#4446a6"
ACCENT_DARK = "#303278"
MUTED = "#686a77"
BG = "#f7f6f2"
CARD = "#ffffff"
BORDER = "#e5e3dd"
TEXT = "#262839"
SOFT = "#f0f0fa"
MAX_FILE_SIZE = 20 * 1024 * 1024


def _default_lang():
    try:
        loc = (locale.getlocale()[0] or "") + os.environ.get("LANG", "")
        if sys.platform.startswith("win"):
            import ctypes
            if (ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3FF) == 0x04:
                return "zh"
        return "zh" if "zh" in loc.lower() or "chinese" in loc.lower() else "en"
    except Exception:
        return "en"


def _load_config():
    for path in (CONFIG_PATH, LEGACY_CONFIG_PATH):
        try:
            with open(path, encoding="utf-8") as f:
                cfg = json.load(f)
            if isinstance(cfg, dict):
                return cfg
        except (OSError, ValueError):
            continue
    return {}


def _save_config(cfg):
    """Save atomically in the platform's application-settings directory."""
    tmp = None
    try:
        folder = os.path.dirname(CONFIG_PATH)
        os.makedirs(folder, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=folder,
                                         suffix=".tmp", delete=False) as f:
            tmp = f.name
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        os.replace(tmp, CONFIG_PATH)
        return True
    except OSError:
        return False
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def _same_file(source, output):
    try:
        return os.path.samefile(source, output)
    except OSError:
        return os.path.normcase(os.path.realpath(source)) == os.path.normcase(os.path.realpath(output))


class MLAGui:
    def __init__(self, remember=True):
        self.remember = remember
        try:
            self.root = TkinterDnD.Tk() if HAS_DND else tk.Tk()
            self.has_dnd = HAS_DND
        except tk.TclError:
            self.root = tk.Tk()
            self.has_dnd = False
        self.root.configure(bg=BG)
        if sys.platform.startswith("win"):
            icon = Path(getattr(sys, "_MEIPASS", Path(__file__).parent / "build" / "windows")) / "MLAFMT.ico"
            if icon.is_file():
                try:
                    self.root.iconbitmap(default=str(icon))
                except tk.TclError:
                    pass
        self.root.geometry("1080x820")
        self.root.minsize(880, 620)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        cfg = _load_config() if remember else {}
        saved_lang = cfg.get("lang")
        self.lang = saved_lang if isinstance(saved_lang, str) and saved_lang in T else _default_lang()
        self._input_file = None
        self._last_output = None
        self._adv_win = None
        self._busy = False
        self._results = queue.Queue()
        self._status_state = ("status_ready", "muted", {})
        self.v = {k: tk.StringVar(self.root) for k in
                  ("name", "title", "instructor", "course", "date", "last_name")}
        for key in ("name", "instructor", "course", "last_name"):
            value = cfg.get(key, "")
            self.v[key].set(value if isinstance(value, str) else "")
        self.v["date"].set(today_mla())
        mode = cfg.get("txt_mode", "blank_line")
        self.txt_mode = tk.StringVar(self.root, value=mode if mode in
                                    ("blank_line", "line_by_line") else "blank_line")
        self.opt = {k: tk.BooleanVar(self.root, value=cfg[k] if isinstance(cfg.get(k), bool) else d)
                    for k, d in (("md", True), ("strip", True), ("headings", False),
                                 ("bq", False), ("open_after", False))}
        self._style()
        self._build()
        for var in self.v.values():
            var.trace_add("write", self._draw_preview)
        self.root.bind("<Control-o>", lambda _e: self._on_browse())
        self.root.bind("<Control-Return>", lambda _e: self._on_convert())
        self.root.after(80, self._poll_results)

    def t(self, key, **kw):
        value = T[self.lang].get(key, T["en"].get(key, key))
        return value.format(**kw) if kw else value

    def _style(self):
        st = ttk.Style(self.root)
        st.theme_use("clam")
        self.font = ("Microsoft YaHei UI" if sys.platform.startswith("win") else "Arial", 10)
        st.configure(".", font=self.font, background=BG, foreground=TEXT)
        st.configure("Card.TFrame", background=CARD)
        st.configure("Card.TLabel", background=CARD)
        st.configure("Muted.TLabel", background=CARD, foreground=MUTED, font=(self.font[0], 9))
        st.configure("Step.TLabel", background=CARD, foreground=ACCENT, font=(self.font[0], 10, "bold"))
        for style in ("Card.TCheckbutton", "Card.TRadiobutton"):
            st.configure(style, background=CARD, padding=(0, 4))
        st.configure("Accent.TButton", foreground=CARD, background=ACCENT,
                     font=(self.font[0], 11, "bold"), padding=(14, 11), borderwidth=0)
        st.map("Accent.TButton", background=[("disabled", "#a5a5c5"), ("active", ACCENT_DARK)])
        st.configure("Ghost.TButton", background=CARD, bordercolor=BORDER, padding=(10, 7))
        st.map("Ghost.TButton", background=[("active", SOFT)])
        st.configure("Lang.TRadiobutton", background=CARD, padding=(10, 6), indicatoron=False)
        st.map("Lang.TRadiobutton", background=[("selected", ACCENT), ("active", SOFT)],
               foreground=[("selected", CARD)])
        st.configure("TEntry", padding=(8, 7), fieldbackground=CARD, bordercolor=BORDER)
        st.map("TEntry", bordercolor=[("focus", ACCENT)])

    def _card(self, parent, padding=18):
        outer = tk.Frame(parent, bg=BORDER)
        outer.pack(fill=tk.X, pady=(0, 12))
        inner = ttk.Frame(outer, style="Card.TFrame", padding=padding)
        inner.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)
        return inner

    def _build(self):
        for widget in self.root.winfo_children():
            widget.destroy()
        self.root.title(f"MLAFMT · {self.t('app')} · v{__version__}")
        self._build_menu()
        canvas = tk.Canvas(self.root, background=BG, highlightthickness=0)
        bar = ttk.Scrollbar(self.root, orient="vertical", command=canvas.yview)
        bar.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(fill=tk.BOTH, expand=True)
        canvas.configure(yscrollcommand=bar.set)
        main = ttk.Frame(canvas, padding=(28, 20, 28, 16))
        item = canvas.create_window((0, 0), window=main, anchor="nw")
        canvas.bind("<Configure>", lambda e: canvas.itemconfigure(item, width=e.width))
        main.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        def wheel(event):
            if event.widget.winfo_toplevel() == self.root:
                amount = int(-event.delta / 120) if abs(event.delta) >= 120 else (-1 if event.delta > 0 else 1)
                canvas.yview_scroll(amount, "units")
        self.root.bind_all("<MouseWheel>", wheel)

        top = ttk.Frame(main)
        top.pack(fill=tk.X, pady=(0, 16))
        tk.Label(top, text="M", font=("Georgia", 20, "bold"), bg=ACCENT, fg=CARD,
                 padx=11, pady=3).pack(side=tk.LEFT)
        ttk.Label(top, text="MLAFMT", font=(self.font[0], 16, "bold")).pack(side=tk.LEFT, padx=(10, 8))
        ttk.Label(top, text=f"v{__version__}", foreground=MUTED, font=(self.font[0], 9)).pack(side=tk.LEFT)
        self._lang_var = tk.StringVar(self.root, value=self.lang)
        self._language_buttons = []
        for value, label in (("en", "English"), ("zh", "中文")):
            button = ttk.Radiobutton(top, text=label, value=value, variable=self._lang_var,
                                     style="Lang.TRadiobutton", command=lambda: self._set_lang(self._lang_var.get()))
            button.pack(side=tk.RIGHT)
            self._language_buttons.append(button)
        ttk.Label(main, text=self.t("eyebrow"), foreground=ACCENT,
                  font=(self.font[0], 9, "bold")).pack(anchor=tk.W)
        ttk.Label(main, text=self.t("hero"), font=(self.font[0], 23, "bold")).pack(anchor=tk.W, pady=(4, 4))
        ttk.Label(main, text=self.t("tagline"), foreground=MUTED, wraplength=920).pack(anchor=tk.W, pady=(0, 18))
        columns = ttk.Frame(main)
        columns.pack(fill=tk.BOTH, expand=True)
        columns.columnconfigure(0, weight=3, minsize=440)
        columns.columnconfigure(1, weight=2, minsize=300)
        left = ttk.Frame(columns)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 20))
        right = ttk.Frame(columns)
        right.grid(row=0, column=1, sticky="nsew")
        info = self._card(left)
        ttk.Label(info, text=self.t("step1"), style="Step.TLabel").grid(row=0, column=0, columnspan=2, sticky=tk.W, pady=(0, 12))
        self._entries = {}
        for row, pair in ((1, ("name", "date")), (3, ("title",)), (5, ("instructor", "course"))):
            for col, key in enumerate(pair):
                span = 2 if key == "title" else 1
                pad = (0, 12) if col == 0 and span == 1 else (0, 0)
                ttk.Label(info, text=self.t(key), style="Card.TLabel").grid(row=row, column=col, columnspan=span, sticky="w", padx=pad)
                entry = ttk.Entry(info, textvariable=self.v[key], width=20)
                entry.grid(row=row + 1, column=col, columnspan=span, sticky="ew", padx=pad, pady=(4, 10))
                self._entries[key] = entry
        for col in (0, 1):
            info.columnconfigure(col, weight=1)
        draft = self._card(left)
        row = ttk.Frame(draft, style="Card.TFrame")
        row.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(row, text=self.t("step2"), style="Step.TLabel").pack(side=tk.LEFT)
        self._remove_btn = ttk.Button(row, text=self.t("remove"), style="Ghost.TButton", command=self._clear_file)
        self._drop = tk.Label(draft, bg=SOFT, fg=ACCENT, cursor="hand2", height=3,
                              highlightthickness=1, highlightbackground="#d8d8ef",
                              font=self.font, takefocus=True, wraplength=410)
        self._drop.pack(fill=tk.X)
        for event in ("<Button-1>", "<Return>", "<space>"):
            self._drop.bind(event, lambda _e: self._on_browse())
        if self.has_dnd:
            self._drop.drop_target_register(DND_FILES)
            self._drop.dnd_bind("<<Drop>>", self._on_drop)
        self._refresh_drop()
        ttk.Label(draft, text=self.t("limit"), style="Muted.TLabel").pack(anchor=tk.W, pady=(8, 0))
        self._btn = ttk.Button(left, text=self.t("convert"), style="Accent.TButton", command=self._on_convert)
        self._btn.pack(fill=tk.X, pady=(0, 10))
        actions = ttk.Frame(left)
        actions.pack(fill=tk.X)
        self._blank_btn = ttk.Button(actions, text=self.t("blank"), style="Ghost.TButton", command=self._on_blank)
        self._blank_btn.pack(side=tk.LEFT)
        self._advanced_btn = ttk.Button(actions, text=self.t("advanced"), style="Ghost.TButton", command=self._open_advanced)
        self._advanced_btn.pack(side=tk.RIGHT)
        self._status = ttk.Label(left, foreground=MUTED, wraplength=390, font=(self.font[0], 9))
        self._status.pack(fill=tk.X, pady=(12, 0))
        self._result_row = ttk.Frame(left)
        self._result_row.pack(fill=tk.X, pady=(8, 0))
        self._render_result()
        preview = self._card(right, padding=16)
        ttk.Label(preview, text=self.t("preview"), style="Step.TLabel").pack(anchor=tk.W)
        self._paper = tk.Canvas(preview, background=CARD, height=340, highlightthickness=0)
        self._paper.pack(fill=tk.X, pady=(12, 8))
        self._paper.bind("<Configure>", self._draw_preview)
        ttk.Label(preview, text=self.t("preview_hint"), style="Muted.TLabel", wraplength=300).pack(anchor=tk.W)
        specs = self._card(right, padding=16)
        ttk.Label(specs, text=self.t("spec_title"), style="Step.TLabel").pack(anchor=tk.W, pady=(0, 8))
        for key in ("spec_font", "spec_spacing", "spec_header", "spec_cited"):
            ttk.Label(specs, text="✓  " + self.t(key), style="Muted.TLabel", wraplength=300).pack(anchor=tk.W, pady=3)
        ttk.Label(right, text=self.t("disclaimer"), foreground=MUTED, wraplength=330,
                  font=(self.font[0], 9)).pack(anchor=tk.W, pady=(0, 8))
        ttk.Label(main, text=self.t("local"), foreground=MUTED, font=(self.font[0], 9)).pack(anchor=tk.W, pady=(12, 0))
        self._render_status()
        self._draw_preview()

    def _draw_preview(self, *_):
        if not hasattr(self, "_paper") or not self._paper.winfo_exists():
            return
        c = self._paper
        c.delete("all")
        width = max(c.winfo_width(), 280)
        page_width = min(width - 12, 300)
        x0 = (width - page_width) / 2
        c.create_rectangle(x0 + 3, 4, x0 + page_width + 3, 333, fill="#eeede8", outline="")
        c.create_rectangle(x0, 0, x0 + page_width, 329, fill="#fffefa", outline=BORDER)
        left, right = x0 + 32, x0 + page_width - 32
        name = self.v["name"].get().strip() or self.t("preview_name")
        last = extract_last_name(name, self.v["last_name"].get().strip() or None)
        c.create_text(right, 24, text=f"{last[:28]} 1", anchor="e", font=("Times New Roman", 9), fill=TEXT)
        for index, value in enumerate((name, self.v["instructor"].get().strip() or "Professor Smith",
                                       self.v["course"].get().strip() or "ENG 101",
                                       self.v["date"].get().strip() or today_mla())):
            c.create_text(left, 52 + index * 20, text=value[:52], anchor="w", width=right-left,
                          font=("Times New Roman", 9), fill=TEXT)
        title = self.v["title"].get().strip() or self.t("preview_title")
        title_item = c.create_text(width / 2, 132, text=title[:100], width=right-left, anchor="n",
                                   font=("Times New Roman", 10), fill=TEXT)
        body_top = max(175, c.bbox(title_item)[3] + 18)
        for index in range(max(0, min(8, int((312 - body_top) / 17) + 1))):
            y = body_top + index * 17
            indent = 12 if index in (0, 5) else 0
            end = right - (38 if index in (4, 7) else 0)
            c.create_line(left + indent, y, end, y, fill="#d6d3cb", width=2)

    def _build_menu(self):
        mb = tk.Menu(self.root)
        file = tk.Menu(mb, tearoff=0)
        file.add_command(label=self.t("menu_open"), accelerator="Ctrl+O", command=self._on_browse)
        file.add_command(label=self.t("menu_blank"), command=self._on_blank)
        file.add_separator()
        file.add_command(label=self.t("menu_quit"), command=self._on_close)
        mb.add_cascade(label=self.t("menu_file"), menu=file)
        settings = tk.Menu(mb, tearoff=0)
        settings.add_command(label=self.t("advanced"), command=self._open_advanced)
        language = tk.Menu(settings, tearoff=0)
        for lang, label in (("zh", "中文"), ("en", "English")):
            language.add_command(label=label, command=lambda lg=lang: self._set_lang(lg))
        settings.add_cascade(label=self.t("menu_language"), menu=language)
        mb.add_cascade(label=self.t("menu_settings"), menu=settings)
        help_menu = tk.Menu(mb, tearoff=0)
        help_menu.add_command(label=self.t("menu_howto"), command=lambda: messagebox.showinfo(self.t("menu_howto"), self.t("howto"), parent=self.root))
        help_menu.add_command(label=self.t("menu_about"), command=lambda: messagebox.showinfo(self.t("menu_about"), self.t("about", v=__version__), parent=self.root))
        mb.add_cascade(label=self.t("menu_help"), menu=help_menu)
        self.root.config(menu=mb)

    def _set_status(self, key, kind="muted", **kw):
        self._status_state = (key, kind, kw)
        self._render_status()

    def _render_status(self):
        key, kind, kw = self._status_state
        self._status.configure(text=self.t(key, **kw), foreground={"muted": MUTED, "ok": "#24725b", "err": "#b84040"}[kind])

    def _set_lang(self, lang):
        if self._busy or lang not in T or lang == self.lang:
            return
        was_open = self._adv_win is not None and self._adv_win.winfo_exists()
        self.lang = lang
        self._adv_win = None
        self._build()
        if was_open:
            self._open_advanced()
        self._save_prefs()

    def _save_prefs(self):
        if not self.remember:
            return
        cfg = {"lang": self.lang, "txt_mode": self.txt_mode.get()}
        cfg.update({key: self.v[key].get().strip() for key in ("name", "instructor", "course", "last_name")})
        cfg.update({key: value.get() for key, value in self.opt.items()})
        _save_config(cfg)

    def _open_advanced(self):
        if self._busy:
            return
        if self._adv_win is not None and self._adv_win.winfo_exists():
            self._adv_win.lift()
            return
        w = tk.Toplevel(self.root)
        self._adv_win = w
        w.title(self.t("adv_title"))
        w.configure(bg=BG)
        w.transient(self.root)
        w.geometry("620x690")
        w.minsize(560, 420)
        canvas = tk.Canvas(w, bg=BG, highlightthickness=0)
        bar = ttk.Scrollbar(w, orient="vertical", command=canvas.yview)
        bar.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(fill=tk.BOTH, expand=True)
        canvas.configure(yscrollcommand=bar.set)
        body = ttk.Frame(canvas, padding=18)
        item = canvas.create_window(0, 0, window=body, anchor="nw")
        canvas.bind("<Configure>", lambda e: canvas.itemconfigure(item, width=e.width))
        body.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        w.bind("<MouseWheel>", lambda e: canvas.yview_scroll(int(-e.delta / 120), "units"))
        def section(key):
            card = self._card(body)
            ttk.Label(card, text=self.t(key), style="Step.TLabel").pack(anchor=tk.W, pady=(0, 6))
            return card
        card = section("adv_header")
        ttk.Label(card, text=self.t("lastname"), style="Card.TLabel").pack(anchor=tk.W)
        lastname_entry = ttk.Entry(card, textvariable=self.v["last_name"])
        lastname_entry.pack(fill=tk.X, pady=4)
        ttk.Label(card, text=self.t("lastname_hint"), style="Muted.TLabel", wraplength=510).pack(anchor=tk.W)
        card = section("adv_txt")
        for key, mode in (("mode_blank", "blank_line"), ("mode_line", "line_by_line")):
            ttk.Radiobutton(card, text=self.t(key), variable=self.txt_mode, value=mode, style="Card.TRadiobutton").pack(anchor=tk.W)
        ttk.Checkbutton(card, text=self.t("md"), variable=self.opt["md"], style="Card.TCheckbutton").pack(anchor=tk.W)
        card = section("adv_body")
        for key in ("strip", "headings", "bq"):
            ttk.Checkbutton(card, text=self.t(key), variable=self.opt[key], style="Card.TCheckbutton").pack(anchor=tk.W)
        card = section("adv_after")
        ttk.Checkbutton(card, text=self.t("open_after"), variable=self.opt["open_after"], style="Card.TCheckbutton").pack(anchor=tk.W)
        card = section("adv_preview")
        summary = tk.StringVar(w)
        def refresh_summary(*_):
            summary.set(self.t("preview_header", name=extract_last_name(self.v["name"].get(), self.v["last_name"].get() or None)) + "\n" + self.t("preview_specs"))
        refresh_summary()
        lastname_entry.bind("<KeyRelease>", refresh_summary)
        ttk.Label(card, textvariable=summary, style="Muted.TLabel").pack(anchor=tk.W)
        def close():
            self._save_prefs()
            self._adv_win = None
            w.destroy()
        ttk.Button(body, text=self.t("close"), style="Accent.TButton", command=close).pack(fill=tk.X)
        w.protocol("WM_DELETE_WINDOW", close)
        w.bind("<Escape>", lambda _e: close())

    def _refresh_drop(self):
        if self._input_file:
            try:
                size = os.path.getsize(self._input_file) / 1024
            except OSError:
                size = 0
            self._drop.config(text=os.path.basename(self._input_file) + "\n" + self.t("file_size", size=f"{size:.1f}"), fg=TEXT)
            self._remove_btn.pack(side=tk.RIGHT)
        else:
            self._drop.config(text=self.t("drop" if self.has_dnd else "drop_nodnd"), fg=ACCENT)
            self._remove_btn.pack_forget()

    def _clear_file(self):
        if self._busy:
            return
        self._input_file = None
        self._refresh_drop()
        self._set_status("status_ready")

    def _set_file(self, path):
        if self._busy:
            return
        if not os.path.isfile(path):
            self._set_status("not_found", "err")
            return
        if Path(path).suffix.lower() not in SUPPORTED_EXTS:
            self._set_status("unsupported", "err")
            return
        if os.path.getsize(path) > MAX_FILE_SIZE:
            self._set_status("too_large", "err")
            return
        self._input_file = os.path.abspath(path)
        self._refresh_drop()
        self._set_status("loaded", f=os.path.basename(path))

    def _on_drop(self, event):
        paths = self.root.tk.splitlist(event.data)
        if paths:
            self._set_file(paths[0])

    def _on_browse(self):
        if self._busy:
            return
        path = filedialog.askopenfilename(parent=self.root, title=self.t("choose"),
            filetypes=[(self.t("draft_types"), "*.docx *.txt *.md"), (self.t("word_type"), "*.docx"), (self.t("text_type"), "*.txt *.md")])
        if path:
            self._set_file(path)

    def _meta(self):
        return {k: self.v[k].get().strip() for k in ("name", "title", "instructor", "course", "date")} | {"last_name": self.v["last_name"].get().strip() or None}

    def _check(self, meta):
        for key, error in (("name", "need_name"), ("title", "need_title")):
            if not meta[key]:
                self._set_status(error, "err")
                self._entries[key].focus_set()
                return False
        if date_warning(meta["date"]):
            return messagebox.askyesno(self.t("date_tip_title"), self.t("date_tip", d=today_mla()), parent=self.root)
        return True

    def _ask_save(self, meta, title_key):
        return filedialog.asksaveasfilename(parent=self.root, defaultextension=".docx", filetypes=[(self.t("word_type"), "*.docx")],
            initialfile=generate_filename(meta["name"], meta["last_name"]), initialdir=os.path.dirname(self._input_file) if self._input_file else None, title=self.t(title_key))

    def _open_file(self, path):
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)
            else:
                subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path])
        except OSError as e:
            self._set_status("error", "err", e=str(e))

    def _render_result(self):
        for w in self._result_row.winfo_children():
            w.destroy()
        if self._last_output:
            ttk.Button(self._result_row, text=self.t("open_result"), style="Ghost.TButton", command=lambda: self._open_file(self._last_output)).pack(side=tk.LEFT)
            ttk.Button(self._result_row, text=self.t("view_folder"), style="Ghost.TButton", command=lambda: self._open_file(os.path.dirname(self._last_output))).pack(side=tk.LEFT, padx=8)

    def _report_error(self, e):
        if isinstance(e, PermissionError):
            key, kw = "perm", {}
        elif isinstance(e, FileNotFoundError):
            key, kw = "missing_source", {}
        elif "package not found" in str(e).lower() or "zip" in str(e).lower() or "badzip" in type(e).__name__.lower():
            key, kw = "bad_doc", {}
        else:
            key, kw = "error", {"e": str(e)}
        self._set_status(key, "err", **kw)
        messagebox.showerror(self.t("app"), self.t(key, **kw), parent=self.root)

    def _set_busy(self, busy):
        self._busy = busy
        for button in (self._btn, self._blank_btn, self._advanced_btn, self._remove_btn, *self._language_buttons):
            button.state(["disabled"] if busy else ["!disabled"])

    def _on_blank(self):
        self._generate(True)

    def _on_convert(self):
        self._generate(False)

    def _generate(self, blank):
        if self._busy:
            return
        if not blank and not self._input_file:
            self._set_status("need_file", "err")
            self._on_browse()
            if not self._input_file:
                return
        meta = self._meta()
        if not self._check(meta):
            return
        out = self._ask_save(meta, "save_blank" if blank else "save_as")
        if not out:
            return
        if self._input_file and _same_file(self._input_file, out):
            self._set_status("same_file", "err")
            return
        kwargs = dict(name=meta["name"], instructor=meta["instructor"], course=meta["course"], date_str=meta["date"], title=meta["title"], last_name_override=meta["last_name"])
        source = self._input_file
        options = dict(txt_paragraph_mode=self.txt_mode.get(), enable_heading_detection=self.opt["headings"].get(), enable_block_quote=self.opt["bq"].get(), markdown_emphasis=self.opt["md"].get(), strip_existing_heading=self.opt["strip"].get())
        self._save_prefs()
        self._set_busy(True)
        self._set_status("working")
        def worker():
            try:
                stats = create_blank_template(out, **kwargs) if blank else convert_draft_to_mla(source, out, **kwargs, **options)
                self._results.put((out, blank, stats, None))
            except Exception as e:
                self._results.put((out, blank, None, e))
        threading.Thread(target=worker, name="MLAFMT-convert").start()

    def _poll_results(self):
        try:
            out, blank, stats, error = self._results.get_nowait()
        except queue.Empty:
            pass
        else:
            self._set_busy(False)
            if error:
                self._report_error(error)
            else:
                self._last_output = os.path.abspath(out)
                if blank:
                    self._set_status("done_blank", "ok", f=os.path.basename(out))
                else:
                    removed = stats.get("removed_heading_lines", 0)
                    self._set_status("done_removed" if removed else "done", "ok", f=os.path.basename(out), b=stats["body"], w=stats["works_cited"], r=removed if removed else "")
                    if stats["body"] == 0:
                        messagebox.showwarning(self.t("app"), self.t("empty"), parent=self.root)
                self._render_result()
                if self.opt["open_after"].get():
                    self._open_file(out)
        self.root.after(80, self._poll_results)

    def _on_close(self):
        self._save_prefs()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    if "--smoke-test" in sys.argv:
        app = MLAGui(remember=False)
        app.root.withdraw()
        for language in ("zh", "en"):
            app._set_lang(language)
            app.root.update_idletasks()
        with tempfile.TemporaryDirectory(prefix="mlafmt-smoke-") as folder:
            create_blank_template(Path(folder) / "smoke.docx", name="MLAFMT", title="Smoke test")
        app.root.destroy()
    else:
        MLAGui().run()
