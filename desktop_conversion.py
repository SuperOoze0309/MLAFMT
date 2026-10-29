"""Small, local-only document conversion dialog for the native Tk application."""

from __future__ import annotations

import os
from pathlib import Path
import queue
import tempfile
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from document_conversion import ConversionError, MAX_FILE_SIZE, convert_document

_TEXT = {
    "en": {
        "title": "PDF / Word conversion", "choose": "Choose a document", "none": "No document selected",
        "target": "Convert to", "convert": "Convert locally", "cancel": "Cancel", "save": "Save converted file",
        "close": "Close", "ready": "Choose a PDF, DOCX or DOC file, then select the output format.",
        "privacy": "Conversion runs on this computer. Your document is not uploaded.",
        "limits": "Word conversions require LibreOffice installed on this computer. PDF to Word extracts editable text; images, tables and original layout are not retained. Scans require OCR first.",
        "working": "Converting on this computer…", "cancelling": "Cancelling…", "done": "Conversion complete. Save the file when ready.",
        "cancelled": "Conversion cancelled.", "saved": "Converted file saved.",
        "office_engine_missing": "Install LibreOffice on this computer and try again. For a custom installation, set FORMCAPY_SOFFICE to the soffice executable path.",
        "pdf_engine_missing": "PDF text extraction needs the optional pypdf package. Install requirements-conversion.txt in this application's Python environment.",
        "pdf_needs_ocr": "This PDF has no readable text layer. Run OCR locally first; no editable Word file was generated.",
        "encrypted_document": "Password-protected documents are not supported. Open and save an unlocked local copy first.",
        "too_large": "The document exceeds the 20 MiB input or 80 MiB expanded/output limit.",
        "pdf_page_limit": "The PDF must contain between 1 and 200 pages.",
        "pdf_content_limit": "This PDF exceeds the text or page-content processing limit.",
        "conversion_timeout": "Conversion timed out. Try a smaller document.",
        "external_content": "This Word file references external images or templates. Embed those resources locally before converting.",
        "same_format": "Choose a different output format.", "invalid_file": "Choose a readable PDF, DOCX or DOC file.",
        "bad_pdf": "The PDF could not be read.", "bad_doc": "The Word document could not be read or does not match its file extension.",
        "unsupported_document": "Macro-enabled or unsupported documents cannot be converted.",
        "failed": "The document could not be converted. Check the source file and local conversion dependencies.",
        "save_failed": "The converted file could not be saved. Choose a writable local folder.",
        "source_overwrite": "Choose another filename. The original document must be preserved.",
        "pdf_text_reconstruction": "PDF text was reconstructed. Review reading order, line breaks and missing layout, graphics, images and tables.",
        "pdf_images_omitted": "PDF image and drawing resources were omitted.",
        "pdf_blank_pages": "Some PDF pages contain no readable text and remain blank. They may need OCR.",
        "office_layout_review": "Review fonts, pagination and layout in the converted file.",
        "legacy_doc_limits": "The older DOC format can lose features available in DOCX.",
    },
    "zh": {
        "title": "PDF / Word 格式互转", "choose": "选择文档", "none": "尚未选择文档",
        "target": "转换为", "convert": "在本机转换", "cancel": "取消", "save": "保存转换结果",
        "close": "关闭", "ready": "选择 PDF、DOCX 或 DOC 文件，再选择输出格式。",
        "privacy": "转换在这台电脑上完成，文稿不会上传。",
        "limits": "Word 互转需要本机安装 LibreOffice。PDF 转 Word 提取可编辑文字，不保留图片、表格和原排版；扫描件需要先做本地 OCR。",
        "working": "正在本机转换…", "cancelling": "正在取消…", "done": "转换完成，可以保存结果。",
        "cancelled": "已取消转换。", "saved": "转换结果已保存。",
        "office_engine_missing": "请在本机安装 LibreOffice 后重试。自定义安装位置可通过 FORMCAPY_SOFFICE 指定 soffice 可执行文件。",
        "pdf_engine_missing": "PDF 文字提取需要可选的 pypdf 组件，请在应用的 Python 环境中安装 requirements-conversion.txt。",
        "pdf_needs_ocr": "这份 PDF 没有可读取的文字层，需要先做本地 OCR；未生成可编辑 Word 文件。",
        "encrypted_document": "暂不支持加密文档。请先在本机打开并另存为不加密的副本。",
        "too_large": "文档超过 20 MiB 输入或 80 MiB 解压／输出限制。",
        "pdf_page_limit": "PDF 页数需要在 1 至 200 页之间。",
        "pdf_content_limit": "这份 PDF 超过文字量或单页内容处理限制。",
        "conversion_timeout": "转换超时，请尝试较小的文档。",
        "external_content": "这份 Word 文档引用了外部图片或模板，请先把这些资源嵌入本地文档。",
        "same_format": "请选择不同的输出格式。", "invalid_file": "请选择可读取的 PDF、DOCX 或 DOC 文件。",
        "bad_pdf": "无法读取这份 PDF。", "bad_doc": "无法读取这份 Word 文档，或内容与扩展名不一致。",
        "unsupported_document": "暂不转换含宏或不受支持的文档。",
        "failed": "转换失败，请检查源文件和本机转换组件。",
        "save_failed": "无法保存结果，请选择本机可写入的文件夹。",
        "source_overwrite": "请选择其他文件名，需要保留原始文档。",
        "pdf_text_reconstruction": "PDF 文字已经重建，请核对阅读顺序、换行及未保留的版式、图形、图片和表格。",
        "pdf_images_omitted": "PDF 图片和绘图资源未保留。",
        "pdf_blank_pages": "部分 PDF 页面没有可读取文字，结果中保持空白；这些页面可能需要 OCR。",
        "office_layout_review": "请核对转换结果中的字体、分页和排版。",
        "legacy_doc_limits": "旧版 DOC 格式可能丢失 DOCX 的部分功能。",
    },
    "es": {
        "title": "Conversión PDF / Word", "choose": "Elegir documento", "none": "Ningún documento seleccionado",
        "target": "Convertir a", "convert": "Convertir en este equipo", "cancel": "Cancelar", "save": "Guardar resultado",
        "close": "Cerrar", "ready": "Elige un archivo PDF, DOCX o DOC y el formato de salida.",
        "privacy": "La conversión se realiza en este equipo. El documento no se sube a Internet.",
        "limits": "Las conversiones de Word requieren LibreOffice instalado. De PDF a Word se extrae texto editable; no se conservan imágenes, tablas ni el diseño original. Los escaneos necesitan OCR local primero.",
        "working": "Convirtiendo en este equipo…", "cancelling": "Cancelando…", "done": "Conversión terminada. Ya puedes guardar el resultado.",
        "cancelled": "Conversión cancelada.", "saved": "Archivo convertido guardado.",
        "office_engine_missing": "Instala LibreOffice en este equipo y vuelve a intentarlo. Para otra ubicación, configura FORMCAPY_SOFFICE con la ruta del ejecutable soffice.",
        "pdf_engine_missing": "La extracción de texto PDF requiere pypdf. Instala requirements-conversion.txt en el entorno Python de la aplicación.",
        "pdf_needs_ocr": "El PDF no tiene una capa de texto legible. Ejecuta OCR local primero; no se ha generado un archivo Word editable.",
        "encrypted_document": "No se admiten documentos cifrados. Guarda primero una copia local sin contraseña.",
        "too_large": "El documento supera el límite de entrada de 20 MiB o de expansión/salida de 80 MiB.",
        "pdf_page_limit": "El PDF debe tener entre 1 y 200 páginas.",
        "pdf_content_limit": "El PDF supera el límite de texto o contenido por página.",
        "conversion_timeout": "Se agotó el tiempo. Prueba un documento más pequeño.",
        "external_content": "El archivo Word contiene imágenes o plantillas externas. Incorpóralas localmente antes de convertir.",
        "same_format": "Elige un formato de salida diferente.", "invalid_file": "Elige un archivo PDF, DOCX o DOC legible.",
        "bad_pdf": "No se pudo leer el PDF.", "bad_doc": "No se pudo leer el documento Word o su contenido no coincide con la extensión.",
        "unsupported_document": "No se convierten documentos con macros o no compatibles.",
        "failed": "No se pudo convertir el documento. Comprueba el archivo y las dependencias locales.",
        "save_failed": "No se pudo guardar. Elige una carpeta local con permiso de escritura.",
        "source_overwrite": "Elige otro nombre para conservar el documento original.",
        "pdf_text_reconstruction": "Se reconstruyó el texto PDF. Revisa el orden de lectura, los saltos y el diseño, gráficos, imágenes y tablas omitidos.",
        "pdf_images_omitted": "Se omitieron los recursos de imágenes y dibujos del PDF.",
        "pdf_blank_pages": "Algunas páginas no tienen texto legible y quedan en blanco. Pueden necesitar OCR.",
        "office_layout_review": "Revisa las fuentes, la paginación y el diseño del archivo convertido.",
        "legacy_doc_limits": "El formato DOC antiguo puede perder funciones de DOCX.",
    },
}


def save_result(destination, data, source):
    """Atomically save explicit user-selected output, preserving the input file."""
    destination = Path(destination)
    source = Path(source)
    if os.path.normcase(os.path.realpath(destination)) == os.path.normcase(os.path.realpath(source)):
        raise ConversionError("source_overwrite")
    if destination.exists() and source.exists() and os.path.samefile(destination, source):
        raise ConversionError("source_overwrite")
    descriptor, temporary = tempfile.mkstemp(prefix=".formcapy-", suffix=".tmp", dir=str(destination.parent))
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class ConversionDialog:
    def __init__(self, parent, locale="en"):
        language = str(locale).lower().split("-")[0].split("_")[0]
        self.text = _TEXT.get(language, _TEXT["en"])
        self.window = tk.Toplevel(parent)
        self.window.title(self.text["title"])
        self.window.transient(parent)
        self.window.minsize(440, 360)
        self.window.geometry("640x470")
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.source = None
        self.result = None
        self.busy = False
        self.closed = False
        self.token = 0
        self.cancel_event = threading.Event()
        self.messages = queue.Queue()
        self.worker = None
        # Parent/root destruction bypasses WM_DELETE_WINDOW. Cancel that path
        # too, while the worker can still stop its isolated office subprocess.
        self.window.bind("<Destroy>", self._on_destroy, add="+")
        self.target = tk.StringVar(self.window, value="DOCX")
        self.file_label = tk.StringVar(self.window, value=self.text["none"])
        self.status = tk.StringVar(self.window, value=self.text["ready"])
        self.frame = ttk.Frame(self.window, padding=20)
        self.frame.pack(fill="both", expand=True)
        ttk.Label(self.frame, text=self.text["privacy"], wraplength=590).pack(anchor="w", pady=(0, 12))
        self.choose = ttk.Button(self.frame, text=self.text["choose"], command=self.select_source)
        self.choose.pack(anchor="w")
        ttk.Label(self.frame, textvariable=self.file_label, wraplength=590).pack(anchor="w", pady=(6, 14))
        row = ttk.Frame(self.frame)
        row.pack(fill="x")
        ttk.Label(row, text=self.text["target"]).pack(side="left", padx=(0, 10))
        self.formats = ttk.Combobox(row, textvariable=self.target, values=("PDF", "DOCX", "DOC"), state="readonly", width=10)
        self.formats.pack(side="left")
        self.formats.bind("<<ComboboxSelected>>", self.change_target)
        ttk.Label(self.frame, text=self.text["limits"], wraplength=590).pack(anchor="w", pady=(14, 12))
        buttons = ttk.Frame(self.frame)
        buttons.pack(fill="x")
        self.convert_button = ttk.Button(buttons, text=self.text["convert"], command=self.convert, state="disabled")
        self.convert_button.pack(side="left")
        self.cancel_button = ttk.Button(buttons, text=self.text["cancel"], command=self.cancel, state="disabled")
        self.cancel_button.pack(side="left", padx=8)
        self.save_button = ttk.Button(buttons, text=self.text["save"], command=self.save, state="disabled")
        self.save_button.pack(side="left")
        ttk.Label(self.frame, textvariable=self.status, wraplength=590).pack(anchor="w", pady=(14, 10))
        ttk.Button(self.frame, text=self.text["close"], command=self.close).pack(side="bottom", anchor="e")
        self.window.bind("<Configure>", self.resize)
        self.window.after(80, self.poll)

    def resize(self, event):
        if event.widget == self.window:
            for widget in self.frame.winfo_children():
                if isinstance(widget, ttk.Label):
                    widget.configure(wraplength=max(360, event.width - 48))

    def reset_result(self):
        self.result = None
        self.token += 1
        self.save_button.configure(state="disabled")
        self.status.set(self.text["ready"])

    def select_source(self):
        if self.busy:
            return
        path = filedialog.askopenfilename(parent=self.window, title=self.text["choose"],
                                         filetypes=[("PDF / Word", "*.pdf *.docx *.doc"), ("PDF", "*.pdf"), ("Word", "*.docx *.doc")])
        if not path:
            return
        if not Path(path).is_file() or Path(path).suffix.lower() not in (".pdf", ".docx", ".doc"):
            self.status.set(self.text["invalid_file"])
            return
        self.source = path
        self.file_label.set(path)
        self.reset_result()
        choices = tuple(value for value in ("PDF", "DOCX", "DOC") if "." + value.lower() != Path(path).suffix.lower())
        self.formats.configure(values=choices)
        if self.target.get() not in choices:
            self.target.set(choices[0])
        self.convert_button.configure(state="normal")

    def change_target(self, _event=None):
        if not self.busy:
            self.reset_result()

    def set_busy(self, value):
        self.busy = value
        self.choose.configure(state="disabled" if value else "normal")
        self.formats.configure(state="disabled" if value else "readonly")
        self.convert_button.configure(state="disabled" if value or not self.source else "normal")
        self.cancel_button.configure(state="normal" if value else "disabled")
        self.save_button.configure(state="normal" if not value and self.result else "disabled")

    def convert(self):
        if self.busy or not self.source:
            return
        self.reset_result()
        self.set_busy(True)
        self.status.set(self.text["working"])
        self.cancel_event = threading.Event()
        source, target, token, event = self.source, self.target.get().lower(), self.token, self.cancel_event

        def work():
            try:
                with open(source, "rb") as stream:
                    data = stream.read(MAX_FILE_SIZE + 1)
                result = convert_document(data, Path(source).name, target, cancel_event=event)
                if event.is_set():
                    raise ConversionError("cancelled")
                self.messages.put((token, result, None))
            except ConversionError as error:
                self.messages.put((token, None, error.code))
            except OSError:
                self.messages.put((token, None, "invalid_file"))
            except Exception:
                self.messages.put((token, None, "failed"))

        # Python waits for non-daemon workers on application exit. Combined
        # with the Destroy cancellation above, this permits the backend's
        # subprocess/temporary-directory finally blocks to finish cleanly.
        self.worker = threading.Thread(target=work, name="FormCapy-local-conversion", daemon=False)
        self.worker.start()

    def poll(self):
        if self.closed:
            return
        try:
            while True:
                token, result, error = self.messages.get_nowait()
                if token != self.token:
                    continue
                self.result = None if self.cancel_event.is_set() else result
                self.set_busy(False)
                if self.cancel_event.is_set():
                    self.status.set(self.text["cancelled"])
                elif error:
                    self.status.set(self.text.get(error, self.text["failed"]))
                else:
                    warnings = " ".join(self.text.get(code, "") for code in result.warnings)
                    self.status.set(self.text["done"] + ("\n" + warnings if warnings else ""))
        except queue.Empty:
            pass
        self.window.after(80, self.poll)

    def cancel(self):
        if self.busy:
            self.cancel_event.set()
            self.cancel_button.configure(state="disabled")
            self.status.set(self.text["cancelling"])

    def save(self):
        if self.busy or not self.result or not self.source:
            return
        result = self.result
        destination = filedialog.asksaveasfilename(parent=self.window, title=self.text["save"],
            initialfile=result.filename, defaultextension="." + result.target_format,
            filetypes=[(result.target_format.upper(), "*." + result.target_format)])
        if not destination:
            return
        try:
            save_result(destination, result.data, self.source)
        except ConversionError as error:
            messagebox.showerror(self.text["title"], self.text.get(error.code, self.text["save_failed"]), parent=self.window)
        except OSError:
            messagebox.showerror(self.text["title"], self.text["save_failed"], parent=self.window)
        else:
            self.status.set(self.text["saved"])

    def close(self):
        self.closed = True
        self.cancel_event.set()
        self.result = None
        self.window.destroy()

    def _on_destroy(self, event):
        if event.widget is self.window:
            self.closed = True
            self.cancel_event.set()
            self.result = None


def launch(parent, locale="en"):
    """Open a non-blocking dialog; all document processing stays on this machine."""
    return ConversionDialog(parent, locale)
