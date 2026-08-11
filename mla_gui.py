"""
mla_gui.py
Tkinter GUI for one-click MLA formatting.
Supports drag-and-drop (via tkinterdnd2, optional) and file browsing.
"""

import os
import re
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from mla_formatter import (
    convert_draft_to_mla,
    create_blank_template,
    validate_inputs,
    generate_filename,
    format_summary,
    MLG_DISCLAIMER,
)

# ── Optional drag-and-drop ──────────────────────
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    HAS_DND = True
except ImportError:
    HAS_DND = False


class MLAGui:
    """Main GUI window for MLAFMT."""

    PAD = {"padx": 10, "pady": 4}

    def __init__(self):
        if HAS_DND:
            self.root = TkinterDnD.Tk()
        else:
            self.root = tk.Tk()
        self.root.title("MLAFMT - MLA Essay Formatter")
        self.root.resizable(False, False)
        self._input_file = None
        self._build_ui()

    # ── UI ───────────────────────────────────────

    def _build_ui(self):
        main = ttk.Frame(self.root, padding=14)
        main.pack(fill=tk.BOTH, expand=True)

        # ─ Section 1: Paper Information ──────────
        meta = ttk.LabelFrame(main, text="Paper Information", padding=8)
        meta.pack(fill=tk.X, **self.PAD)

        fields = [
            ("Student Name:", "student_name"),
            ("Header Last Name:", "last_name"),
            ("  (blank = auto from Student Name)", None),
            ("Instructor:", "instructor"),
            ("Course:", "course"),
            ("Date:", "date"),
            ("Essay Title:", "title"),
        ]
        self._entries = {}
        row = 0
        for label, key in fields:
            if key is None:
                ttk.Label(meta, text=label, foreground="#888", font=("", 9)).grid(
                    row=row, column=0, columnspan=2, sticky=tk.W, pady=(0, 4)
                )
                row += 1
                continue
            ttk.Label(meta, text=label).grid(row=row, column=0, sticky=tk.W, pady=2)
            e = ttk.Entry(meta, width=48)
            e.grid(row=row, column=1, sticky=tk.EW, padx=(8, 0), pady=2)
            self._entries[key] = e
            row += 1
        meta.columnconfigure(1, weight=1)

        # Default placeholders
        self._entries["student_name"].insert(0, "Your Name")
        self._entries["instructor"].insert(0, "Instructor Name")
        self._entries["course"].insert(0, "Course Number")
        self._entries["date"].insert(0, "20 June 2026")
        self._entries["title"].insert(0, "Title of Your Paper")

        # ─ Section 2: Input File ────────────────
        file_frame = ttk.LabelFrame(main, text="Input File", padding=8)
        file_frame.pack(fill=tk.X, **self.PAD)

        self._drop_label = tk.Label(
            file_frame,
            text="Drag & drop a .docx or .txt file here\nor click Browse below",
            bg="#f0f0f0",
            relief=tk.GROOVE,
            height=3,
            font=("Segoe UI", 10),
        )
        self._drop_label.pack(fill=tk.X, pady=(0, 6))
        if HAS_DND:
            self._drop_label.drop_target_register(DND_FILES)
            self._drop_label.dnd_bind("<<Drop>>", self._on_drop)

        browse_row = ttk.Frame(file_frame)
        browse_row.pack(fill=tk.X)
        ttk.Button(browse_row, text="Browse...", command=self._on_browse).pack(side=tk.LEFT)
        self._file_label = ttk.Label(browse_row, text="No file selected", foreground="#888")
        self._file_label.pack(side=tk.LEFT, padx=(10, 0))

        # ─ Section 3: Options ──────────────────
        opt = ttk.LabelFrame(main, text="Options", padding=8)
        opt.pack(fill=tk.X, **self.PAD)

        # TXT paragraph mode
        mode_row = ttk.Frame(opt)
        mode_row.pack(fill=tk.X, pady=(0, 6))
        ttk.Label(mode_row, text="TXT paragraph mode:").pack(side=tk.LEFT)
        self._txt_mode = tk.StringVar(value="blank_line")
        ttk.Radiobutton(mode_row, text="Blank-line", variable=self._txt_mode,
                        value="blank_line").pack(side=tk.LEFT, padx=(8, 4))
        ttk.Radiobutton(mode_row, text="Line-by-line", variable=self._txt_mode,
                        value="line_by_line").pack(side=tk.LEFT, padx=4)

        # Checkboxes
        self._heading_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opt, text="Auto-detect headings (experimental)",
                        variable=self._heading_var).pack(anchor=tk.W)

        self._blockquote_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opt, text="Treat >-prefixed lines as block quotes",
                        variable=self._blockquote_var).pack(anchor=tk.W)

        # ─ Section 4: Format Preview ────────────
        prev_frame = ttk.LabelFrame(main, text="Format Preview", padding=8)
        prev_frame.pack(fill=tk.X, **self.PAD)
        self._preview_text = tk.StringVar()
        self._preview_label = ttk.Label(
            prev_frame, textvariable=self._preview_text,
            foreground="#333", font=("Consolas", 9), justify=tk.LEFT
        )
        self._preview_label.pack(anchor=tk.W)
        self._update_preview()

        # Bind entry changes to update preview
        for e in self._entries.values():
            e.bind("<KeyRelease>", lambda _: self._update_preview())

        # ─ Section 5: Disclaimer ────────────────
        disc = ttk.Label(main, text=MLG_DISCLAIMER, foreground="#888",
                         wraplength=500, font=("", 9), justify=tk.LEFT)
        disc.pack(fill=tk.X, **self.PAD)

        # ─ Section 6: Buttons ──────────────────
        btn_row = ttk.Frame(main)
        btn_row.pack(fill=tk.X, **self.PAD)

        ttk.Button(btn_row, text="Convert & Save", command=self._on_convert).pack(
            side=tk.RIGHT, padx=(6, 0)
        )
        ttk.Button(btn_row, text="Create Blank Template", command=self._on_blank).pack(
            side=tk.RIGHT, padx=(6, 0)
        )

        # ─ Section 7: Status ───────────────────
        self._status = ttk.Label(main, text="Ready", foreground="#555",
                                 font=("Segoe UI", 9))
        self._status.pack(fill=tk.X, **self.PAD)

    # ── helpers ──────────────────────────────────

    def _get_meta(self):
        return {k: v.get().strip() for k, v in self._entries.items()}

    def _update_preview(self, *_):
        meta = self._get_meta()
        lines = format_summary(meta.get("student_name", ""),
                               meta.get("last_name", "") or None)
        # Update preview on the fly from the last_name field if filled
        actual_ln = (meta.get("last_name", "").strip()
                     or (meta.get("student_name", "").strip().split()[-1]
                         if meta.get("student_name", "").strip()
                         else "LastName"))
        lines[0] = f"Header: {actual_ln} 1"
        self._preview_text.set("\n".join(lines))

    def _set_file(self, path):
        if not os.path.isfile(path):
            self._status.config(text="Error: file does not exist", foreground="red")
            return
        ext = os.path.splitext(path)[1].lower()
        if ext not in (".docx", ".txt"):
            self._status.config(text="Unsupported format. Only .docx and .txt allowed.",
                                foreground="red")
            messagebox.showerror("Unsupported Format",
                                 "Only .docx and .txt files are supported.")
            return
        self._input_file = path
        self._file_label.config(text=os.path.basename(path), foreground="#000")
        self._status.config(text=f"Loaded: {path}", foreground="#555")

    # ── event handlers ──────────────────────────

    def _on_drop(self, event):
        raw = event.data
        if raw.startswith("{") and raw.endswith("}"):
            raw = raw[1:-1]
        path = raw.split(",")[0].strip().strip('"').strip("'")
        self._set_file(path)

    def _on_browse(self):
        path = filedialog.askopenfilename(
            title="Select a draft file",
            filetypes=[("Word / Text files", "*.docx *.txt"),
                       ("Word documents", "*.docx"),
                       ("Text files", "*.txt")],
        )
        if path:
            self._set_file(path)

    def _validate(self, meta):
        """Return list of error messages; empty list means valid."""
        errs = []
        # Required fields
        errs.extend(validate_inputs(meta["student_name"], meta["title"]))
        # Date format hint
        if meta["date"] and not re.search(r"\d{1,2}\s+[A-Za-z]+\s+\d{4}", meta["date"]):
            errs.append("Tip: MLA date format is '20 June 2026'.")
        return errs

    def _on_blank(self):
        meta = self._get_meta()
        errs = self._validate(meta)
        if errs:
            messagebox.showwarning("Validation", "\n".join(errs))
            if any("cannot be empty" in e for e in errs):
                return
        # Generate a default filename
        default_name = generate_filename(meta["student_name"],
                                         meta.get("last_name") or None)
        out_path = filedialog.asksaveasfilename(
            defaultextension=".docx",
            filetypes=[("Word documents", "*.docx")],
            initialfile=default_name,
            title="Save blank MLA template as...",
        )
        if not out_path:
            return
        try:
            self._status.config(text="Generating blank template...", foreground="#555")
            self.root.update()
            create_blank_template(
                out_path,
                name=meta["student_name"],
                instructor=meta["instructor"],
                course=meta["course"],
                date_str=meta["date"],
                title=meta["title"],
                last_name_override=meta.get("last_name") or None,
            )
            self._status.config(text=f"Saved: {out_path}", foreground="green")
            messagebox.showinfo("Done", f"Blank MLA template saved to:\n{out_path}")
        except PermissionError:
            self._status.config(text="Permission denied — cannot write to that location.",
                                foreground="red")
            messagebox.showerror("Permission Error",
                                 "Cannot write to that location. Try a different folder.")
        except Exception as e:
            self._status.config(text=f"Error: {e}", foreground="red")
            messagebox.showerror("Error", str(e))

    def _on_convert(self):
        if not self._input_file:
            messagebox.showwarning("No File", "Please select or drop a draft file first.")
            return

        meta = self._get_meta()
        errs = self._validate(meta)
        if errs:
            messagebox.showwarning("Validation", "\n".join(errs))
            if any("cannot be empty" in e for e in errs):
                return

        # Generate default filename based on last name
        default_name = generate_filename(meta["student_name"],
                                         meta.get("last_name") or None)

        out_path = filedialog.asksaveasfilename(
            defaultextension=".docx",
            filetypes=[("Word documents", "*.docx")],
            initialfile=default_name,
            title="Save MLA-formatted document as...",
        )
        if not out_path:
            return

        try:
            self._status.config(text="Converting...", foreground="#555")
            self.root.update()

            convert_draft_to_mla(
                self._input_file,
                out_path,
                name=meta["student_name"],
                instructor=meta["instructor"],
                course=meta["course"],
                date_str=meta["date"],
                title=meta["title"],
                last_name_override=meta.get("last_name") or None,
                txt_paragraph_mode=self._txt_mode.get(),
                enable_heading_detection=self._heading_var.get(),
                enable_block_quote=self._blockquote_var.get(),
            )

            self._status.config(text=f"Saved: {out_path}", foreground="green")
            messagebox.showinfo("Done", f"MLA document saved to:\n{out_path}")

        except PermissionError:
            self._status.config(text="Permission denied — cannot write to that location.",
                                foreground="red")
            messagebox.showerror("Permission Error",
                                 "Cannot write to that location. Try a different folder.")
        except Exception as e:
            err_msg = str(e)
            if "cannot read document" in err_msg.lower() or "docx" in err_msg.lower():
                self._status.config(text="Cannot read document — file may be corrupted.",
                                    foreground="red")
                messagebox.showerror("File Error",
                                     "Cannot read the source document. "
                                     "The file may be corrupted or in an unsupported format.")
            else:
                self._status.config(text=f"Conversion failed: {err_msg}", foreground="red")
                messagebox.showerror("Conversion Error", err_msg)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    MLAGui().run()
