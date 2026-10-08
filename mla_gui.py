"""
mla_gui.py  (v2.0)
Desktop app for one-click MLA formatting.  中英双语 / Chinese-English UI.

Home screen = only what most people need:
    1. fill in name + title   2. drop the draft   3. click Convert
Everything else lives in  ⚙ Advanced / 高级选项  (secondary window).
"""

import json
import locale
import os
import subprocess
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

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".mlafmt.json")

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

ACCENT = "#2f6fdb"
ACCENT_DARK = "#2459b3"
MUTED = "#6b7280"
BG = "#f6f7f9"
CARD = "#ffffff"
BORDER = "#d7dbe2"


def _default_lang():
    try:
        loc = (locale.getlocale()[0] or "") + (os.environ.get("LANG", ""))
        if sys.platform.startswith("win"):
            import ctypes
            lcid = ctypes.windll.kernel32.GetUserDefaultUILanguage()
            if (lcid & 0x3FF) == 0x04:  # LANG_CHINESE
                return "zh"
        return "zh" if "zh" in loc.lower() or "chinese" in loc.lower() else "en"
    except Exception:
        return "en"


def _load_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=1)
    except Exception:
        pass


class MLAGui:
    def __init__(self):
        self.root = TkinterDnD.Tk() if HAS_DND else tk.Tk()
        self.root.configure(bg=BG)
        self.root.minsize(520, 0)

        cfg = _load_config()
        self.lang = cfg.get("lang") or _default_lang()
        self._input_file = None
        self._adv_win = None

        # persistent state (survives language switch)
        self.v = {k: tk.StringVar() for k in ("name", "title", "instructor", "course", "date",
                                              "last_name")}
        self.v["name"].set(cfg.get("name", ""))
        self.v["instructor"].set(cfg.get("instructor", ""))
        self.v["course"].set(cfg.get("course", ""))
        self.v["date"].set(today_mla())
        self.txt_mode = tk.StringVar(value=cfg.get("txt_mode", "blank_line"))
        self.opt = {k: tk.BooleanVar(value=cfg.get(k, d)) for k, d in (
            ("md", True), ("strip", True), ("headings", False), ("bq", False),
            ("open_after", True))}

        self._style()
        self._build()

    # ── helpers ─────────────────────────────────────────────────────
    def t(self, key, **kw):
        s = T[self.lang].get(key) or T["en"][key]
        return s.format(**kw) if kw else s

    def _style(self):
        st = ttk.Style(self.root)
        try:
            st.theme_use("clam")
        except tk.TclError:
            pass
        base = ("Microsoft YaHei UI", 10) if sys.platform.startswith("win") else ("", 11)
        self.font = base
        st.configure(".", font=base, background=BG)
        st.configure("Card.TFrame", background=CARD)
        st.configure("Card.TLabel", background=CARD)
        st.configure("Muted.TLabel", background=CARD, foreground=MUTED,
                     font=(base[0], base[1] - 1))
        st.configure("Step.TLabel", background=CARD, foreground=ACCENT,
                     font=(base[0], base[1], "bold"))
        st.configure("Card.TCheckbutton", background=CARD)
        st.configure("Card.TRadiobutton", background=CARD)
        st.configure("Accent.TButton", foreground="white", background=ACCENT,
                     font=(base[0], base[1] + 2, "bold"), padding=(10, 10), borderwidth=0)
        st.map("Accent.TButton", background=[("active", ACCENT_DARK), ("disabled", "#9db7e8")])
        st.configure("Link.TButton", foreground=ACCENT, background=BG, borderwidth=0,
                     padding=(2, 2))
        st.map("Link.TButton", background=[("active", BG)], foreground=[("active", ACCENT_DARK)])
        st.configure("Ghost.TButton", padding=(8, 3))
        st.configure("TEntry", padding=5)
        st.configure("Ph.TEntry", padding=5, foreground="#9aa1ad")

    def _card(self, parent):
        outer = tk.Frame(parent, bg=BORDER)       # 1-px border
        outer.pack(fill=tk.X, pady=(0, 10))
        inner = ttk.Frame(outer, style="Card.TFrame", padding=14)
        inner.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)
        return inner

    # ── UI ──────────────────────────────────────────────────────────
    def _build(self):
        for w in self.root.winfo_children():
            w.destroy()
        self.root.title(f"{self.t('app')} v{__version__}")
        self._build_menu()

        main = ttk.Frame(self.root, padding=(18, 14, 18, 12))
        main.pack(fill=tk.BOTH, expand=True)

        # Top bar: title + language toggle
        top = ttk.Frame(main)
        top.pack(fill=tk.X)
        ttk.Label(top, text=self.t("app"),
                  font=(self.font[0], self.font[1] + 9, "bold")).pack(side=tk.LEFT)
        ttk.Button(top, text=self.t("lang_btn"), style="Ghost.TButton",
                   command=self._toggle_lang).pack(side=tk.RIGHT)
        ttk.Label(main, text=self.t("tagline"), wraplength=500,
                  font=(self.font[0], self.font[1] + 1)).pack(fill=tk.X, pady=(4, 2))
        ttk.Label(main, text=self.t("what"), wraplength=500, foreground=MUTED,
                  font=(self.font[0], self.font[1] - 1)).pack(fill=tk.X, pady=(0, 12))

        # ① info
        c1 = self._card(main)
        ttk.Label(c1, text=self.t("step1"), style="Step.TLabel").grid(
            row=0, column=0, columnspan=4, sticky=tk.W, pady=(0, 8))
        rows = [("name", "title"), ("instructor", "course")]
        r = 1
        for left, right in rows:
            for col, key in ((0, left), (2, right)):
                ttk.Label(c1, text=self.t(key), style="Card.TLabel").grid(
                    row=r, column=col, columnspan=2, sticky=tk.W, padx=(0 if col == 0 else 10, 0))
                e = ttk.Entry(c1, textvariable=self.v[key], width=26)
                e.grid(row=r + 1, column=col, columnspan=2, sticky=tk.EW,
                       padx=(0 if col == 0 else 10, 0), pady=(2, 8))
                self._placeholder(e, key)
            r += 2
        ttk.Label(c1, text=self.t("date"), style="Card.TLabel").grid(
            row=r, column=0, columnspan=2, sticky=tk.W)
        ttk.Entry(c1, textvariable=self.v["date"], width=26).grid(
            row=r + 1, column=0, columnspan=2, sticky=tk.EW, pady=(2, 0))
        for col in range(4):
            c1.columnconfigure(col, weight=1)

        # ② draft
        c2 = self._card(main)
        ttk.Label(c2, text=self.t("step2"), style="Step.TLabel").pack(anchor=tk.W, pady=(0, 8))
        self._drop = tk.Label(c2, bg="#f2f6fd", fg=ACCENT, cursor="hand2", height=4,
                              relief=tk.FLAT, highlightthickness=2,
                              highlightbackground="#b9cdf3", highlightcolor="#b9cdf3",
                              font=(self.font[0], self.font[1]))
        self._drop.pack(fill=tk.X)
        self._drop.bind("<Button-1>", lambda _e: self._on_browse())
        if HAS_DND:
            self._drop.drop_target_register(DND_FILES)
            self._drop.dnd_bind("<<Drop>>", self._on_drop)
        self._refresh_drop()

        # ③ create
        self._btn = ttk.Button(main, text=self.t("convert"), style="Accent.TButton",
                               command=self._on_convert)
        self._btn.pack(fill=tk.X, pady=(4, 6))

        bottom = ttk.Frame(main)
        bottom.pack(fill=tk.X)
        ttk.Button(bottom, text=self.t("blank"), style="Link.TButton",
                   command=self._on_blank, cursor="hand2").pack(side=tk.LEFT)
        ttk.Button(bottom, text=self.t("advanced"), style="Ghost.TButton",
                   command=self._open_advanced).pack(side=tk.RIGHT)

        self._status = ttk.Label(main, text=self.t("ready"), foreground=MUTED,
                                 wraplength=500, font=(self.font[0], self.font[1] - 1))
        self._status.pack(fill=tk.X, pady=(8, 0))

    def _placeholder(self, entry, key):
        """Grey example text that disappears on focus (only when empty)."""
        ph = self.t(f"{key}_ph")
        var = self.v[key]

        def show(_e=None):
            if not var.get():
                entry.configure(style="Ph.TEntry")
                entry.insert(0, ph)
                entry._ph = True

        def hide(_e=None):
            if getattr(entry, "_ph", False):
                entry.delete(0, tk.END)
                entry.configure(style="TEntry")
                entry._ph = False

        entry._ph = False
        entry.bind("<FocusIn>", hide)
        entry.bind("<FocusOut>", show)
        show()

    def _val(self, key):
        """Read a field, ignoring placeholder text."""
        val = self.v[key].get().strip()
        phs = {T[lg].get(f"{key}_ph") for lg in T}
        return "" if val in phs else val

    def _build_menu(self):
        mb = tk.Menu(self.root)
        m_file = tk.Menu(mb, tearoff=0)
        m_file.add_command(label=self.t("menu_open"), command=self._on_browse)
        m_file.add_command(label=self.t("menu_blank"), command=self._on_blank)
        m_file.add_separator()
        m_file.add_command(label=self.t("menu_quit"), command=self.root.destroy)
        mb.add_cascade(label=self.t("menu_file"), menu=m_file)

        m_set = tk.Menu(mb, tearoff=0)
        m_set.add_command(label=self.t("adv_title") + "…", command=self._open_advanced)
        m_lang = tk.Menu(m_set, tearoff=0)
        m_lang.add_command(label="中文", command=lambda: self._set_lang("zh"))
        m_lang.add_command(label="English", command=lambda: self._set_lang("en"))
        m_set.add_cascade(label="语言 / Language", menu=m_lang)
        mb.add_cascade(label=self.t("menu_settings"), menu=m_set)

        m_help = tk.Menu(mb, tearoff=0)
        m_help.add_command(label=self.t("menu_howto"),
                           command=lambda: messagebox.showinfo(self.t("menu_howto"),
                                                               self.t("howto")))
        m_help.add_command(label=self.t("menu_about"),
                           command=lambda: messagebox.showinfo(
                               self.t("menu_about"), self.t("about", v=__version__)))
        mb.add_cascade(label=self.t("menu_help"), menu=m_help)
        self.root.config(menu=mb)

    def _refresh_drop(self):
        if self._input_file:
            self._drop.config(text="📄 " + os.path.basename(self._input_file),
                              fg="#1f2937", bg="#e6efff")
        else:
            self._drop.config(text=self.t("drop" if HAS_DND else "drop_nodnd"),
                              fg=ACCENT, bg="#f2f6fd")

    def _set_status(self, text, kind="muted"):
        color = {"muted": MUTED, "ok": "#15803d", "err": "#b91c1c"}[kind]
        self._status.config(text=text, foreground=color)

    # ── language ────────────────────────────────────────────────────
    def _set_lang(self, lang):
        if lang == self.lang:
            return
        # clear placeholder text before rebuilding
        for key in ("name", "title", "instructor", "course"):
            self.v[key].set(self._val(key))
        self.lang = lang
        if self._adv_win is not None and self._adv_win.winfo_exists():
            self._adv_win.destroy()
        self._build()
        self._save_prefs()

    def _toggle_lang(self):
        self._set_lang("en" if self.lang == "zh" else "zh")

    def _save_prefs(self):
        cfg = {"lang": self.lang, "txt_mode": self.txt_mode.get(),
               "name": self._val("name"), "instructor": self._val("instructor"),
               "course": self._val("course")}
        cfg.update({k: v.get() for k, v in self.opt.items()})
        _save_config(cfg)

    # ── advanced (secondary) window ─────────────────────────────────
    def _open_advanced(self):
        if self._adv_win is not None and self._adv_win.winfo_exists():
            self._adv_win.lift()
            return
        w = tk.Toplevel(self.root)
        self._adv_win = w
        w.title(self.t("adv_title"))
        w.configure(bg=BG)
        w.transient(self.root)
        w.resizable(False, False)
        body = ttk.Frame(w, padding=16)
        body.pack(fill=tk.BOTH, expand=True)

        def section(key):
            c = self._card(body)
            ttk.Label(c, text=self.t(key), style="Step.TLabel").pack(anchor=tk.W, pady=(0, 6))
            return c

        c = section("adv_header")
        row = ttk.Frame(c, style="Card.TFrame")
        row.pack(fill=tk.X)
        ttk.Label(row, text=self.t("lastname"), style="Card.TLabel").pack(side=tk.LEFT)
        ln_entry = ttk.Entry(row, textvariable=self.v["last_name"], width=22)
        ln_entry.pack(side=tk.LEFT, padx=(8, 0))
        ttk.Label(c, text=self.t("lastname_hint"), style="Muted.TLabel",
                  justify=tk.LEFT).pack(anchor=tk.W, pady=(6, 0))

        c = section("adv_txt")
        ttk.Radiobutton(c, text=self.t("mode_blank"), variable=self.txt_mode,
                        value="blank_line", style="Card.TRadiobutton").pack(anchor=tk.W)
        ttk.Radiobutton(c, text=self.t("mode_line"), variable=self.txt_mode,
                        value="line_by_line", style="Card.TRadiobutton").pack(anchor=tk.W)
        ttk.Checkbutton(c, text=self.t("md"), variable=self.opt["md"],
                        style="Card.TCheckbutton").pack(anchor=tk.W, pady=(4, 0))

        c = section("adv_body")
        for k in ("strip", "headings", "bq"):
            ttk.Checkbutton(c, text=self.t(k), variable=self.opt[k],
                            style="Card.TCheckbutton").pack(anchor=tk.W)

        c = section("adv_after")
        ttk.Checkbutton(c, text=self.t("open_after"), variable=self.opt["open_after"],
                        style="Card.TCheckbutton").pack(anchor=tk.W)

        c = section("adv_preview")
        prev = tk.StringVar()
        ttk.Label(c, textvariable=prev, style="Muted.TLabel", justify=tk.LEFT,
                  font=("Consolas", 9)).pack(anchor=tk.W)

        def refresh(*_):
            prev.set("\n".join(format_summary(self._val("name"),
                                              self.v["last_name"].get().strip() or None)))
        refresh()
        ln_entry.bind("<KeyRelease>", refresh)

        def close():
            self._save_prefs()
            w.destroy()

        ttk.Button(body, text=self.t("close"), style="Accent.TButton",
                   command=close).pack(fill=tk.X)
        w.protocol("WM_DELETE_WINDOW", close)

    # ── file selection ──────────────────────────────────────────────
    def _set_file(self, path):
        if not os.path.isfile(path):
            self._set_status(self.t("not_found"), "err")
            return
        if os.path.splitext(path)[1].lower() not in SUPPORTED_EXTS:
            self._set_status(self.t("unsupported").split("\n")[0], "err")
            messagebox.showerror(self.t("app"), self.t("unsupported"))
            return
        self._input_file = path
        self._refresh_drop()
        self._set_status(self.t("loaded", f=path))

    def _on_drop(self, event):
        paths = self.root.tk.splitlist(event.data)   # handles {paths with spaces}
        if paths:
            self._set_file(paths[0])

    def _on_browse(self):
        path = filedialog.askopenfilename(
            filetypes=[("Draft", "*.docx *.txt *.md"), ("Word", "*.docx"),
                       ("Text / Markdown", "*.txt *.md")])
        if path:
            self._set_file(path)

    # ── actions ─────────────────────────────────────────────────────
    def _meta(self):
        return {k: self._val(k) for k in ("name", "title", "instructor", "course", "date")} | {
            "last_name": self.v["last_name"].get().strip() or None}

    def _check(self, meta):
        if not meta["name"]:
            messagebox.showwarning(self.t("app"), self.t("need_name"))
            return False
        if not meta["title"]:
            messagebox.showwarning(self.t("app"), self.t("need_title"))
            return False
        if date_warning(meta["date"]):
            return messagebox.askyesno(self.t("date_tip_title"),
                                       self.t("date_tip", d=today_mla()))
        return True

    def _ask_save(self, meta, title_key):
        return filedialog.asksaveasfilename(
            defaultextension=".docx", filetypes=[("Word", "*.docx")],
            initialfile=generate_filename(meta["name"], meta["last_name"]),
            initialdir=os.path.dirname(self._input_file) if self._input_file else None,
            title=self.t(title_key))

    def _open_file(self, path):
        if not self.opt["open_after"].get():
            return
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # noqa
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception:
            pass

    def _report_error(self, e):
        if isinstance(e, PermissionError):
            msg = self.t("perm")
        elif "package not found" in str(e).lower() or "not a zip" in str(e).lower() \
                or "badzipfile" in type(e).__name__.lower():
            msg = self.t("bad_doc")
        else:
            msg = self.t("error", e=e)
        self._set_status(msg, "err")
        messagebox.showerror(self.t("app"), msg)

    def _on_blank(self):
        meta = self._meta()
        if not self._check(meta):
            return
        out = self._ask_save(meta, "save_blank")
        if not out:
            return
        try:
            create_blank_template(out, name=meta["name"], instructor=meta["instructor"],
                                  course=meta["course"], date_str=meta["date"],
                                  title=meta["title"], last_name_override=meta["last_name"])
            self._set_status(self.t("done_blank", f=os.path.basename(out)), "ok")
            self._save_prefs()
            self._open_file(out)
        except Exception as e:  # noqa
            self._report_error(e)

    def _on_convert(self):
        if not self._input_file:
            self._set_status(self.t("need_file"), "err")
            self._on_browse()
            if not self._input_file:
                return
        meta = self._meta()
        if not self._check(meta):
            return
        out = self._ask_save(meta, "save_as")
        if not out:
            return
        if os.path.abspath(out) == os.path.abspath(self._input_file):
            messagebox.showerror(self.t("app"), self.t("same_file"))
            return
        self._set_status(self.t("working"))
        self.root.update_idletasks()
        try:
            st = convert_draft_to_mla(
                self._input_file, out, name=meta["name"], instructor=meta["instructor"],
                course=meta["course"], date_str=meta["date"], title=meta["title"],
                last_name_override=meta["last_name"],
                txt_paragraph_mode=self.txt_mode.get(),
                enable_heading_detection=self.opt["headings"].get(),
                enable_block_quote=self.opt["bq"].get(),
                markdown_emphasis=self.opt["md"].get(),
                strip_existing_heading=self.opt["strip"].get(),
            )
        except Exception as e:  # noqa
            self._report_error(e)
            return
        removed = self.t("removed", n=st["removed_heading_lines"]) \
            if st["removed_heading_lines"] else ""
        self._set_status(self.t("done", f=os.path.basename(out), b=st["body"],
                                w=st["works_cited"], r=removed), "ok")
        self._save_prefs()
        if st["body"] == 0:
            messagebox.showwarning(self.t("app"), self.t("empty"))
        self._open_file(out)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    MLAGui().run()
