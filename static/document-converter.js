/* Independent file conversion UI. Document bytes are passed only to the
 * injected local converter, after the user explicitly starts a conversion. */
(function (root) {
  "use strict";

  const MAX_SIZE = 20 * 1024 * 1024;
  const MAX_FILES = 20;
  const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
  const FORMATS = ["pdf", "docx", "doc"];
  let instances = 0;
  const TEXT = {
    zh: {
      title: "PDF / Word 文件互转", summary: "PDF、DOCX、DOC，在本设备处理",
      privacy: "文件在浏览器中转换，不会上传；原文件不受影响。",
      file: "原始文件", choose: "选择文件", no_file_selected: "尚未选择文件（每个最大 20 MiB，最多 20 个，总计最大 100 MiB）",
      target: "转换为", convert: "开始转换", cancel: "取消转换", clear: "清除", download: "下载转换结果",
      ready: "选择 PDF、DOCX 或 DOC，再选择需要的格式。", selected: "已选择文件，可以开始转换。",
      engine: "DOC 转换或导出 PDF 首次需下载数百 MB，可能占用超过 1 GiB 内存。建议用电脑浏览器，加载时请保持页面打开。",
      light_engine: "首次使用需下载转换组件，下载完成后才能离线使用。",
      pdf_limits: "PDF 转 Word 后，图片和复杂版式可能改变或丢失；扫描件需先做 OCR。结果可能显示原 PDF 中隐藏或裁掉的图片内容，分享前请核对。",
      word_limits: "Word 格式互转或转 PDF 时，字体替换、复杂表格和旧 DOC 格式可能改变版式，请核对结果。",
      working: "正在本地转换…", loading: "正在加载本地转换组件，首次可能需要几分钟…", extracting: "正在读取 PDF 并重建可编辑文字…",
      exporting: "正在本地导出文件…", done: "转换完成，请下载并核对结果。", cancelled: "已取消转换。",
      unsupported: "请选择 PDF、DOCX 或 DOC 文件。", no_file: "请先选择文件。", too_large: "文件超过 20 MiB，请选择较小的文件。",
      empty_file: "这个文件为空，请重新选择。", bad_document: "无法读取文件，请确认文件未损坏且扩展名与实际格式一致。",
      needs_ocr: "未找到可提取文字。扫描版 PDF 需要先进行 OCR。", encrypted_pdf: "PDF 已加密，请先在本设备解密后重试。",
      engine_unavailable: "本地转换组件不可用，请检查组件是否安装或已完整下载。", engine_init_failed: "转换组件加载失败，请检查网络、可用内存并重试。",
      timeout: "转换超时，请尝试较小或较简单的文档。", invalid_output: "转换结果无效，未提供下载，请换一份文档重试。",
      conversion_failed: "转换失败，请检查文件并重试。", unsupported_browser: "当前浏览器不支持本地 Office 转换，请使用最新版桌面 Chrome、Edge 或 Firefox。",
      host_busy: "其他文档任务正在运行，请等待完成后再转换。", dependency_missing: "缺少本地转换组件，请按使用说明安装或下载后重试。",
      pdf_reconstructed: "图片、分页和表格可能改变或丢失；原 PDF 中隐藏或裁掉的图片内容也可能显示。分享前请对照原文件核对。",
      layout_changed: "格式转换可能改变分页、字体和版式，请对照原文件核对。", images_omitted: "PDF 中的部分或全部图片未能保留，请对照原文件核对。", legacy_doc_limits: "旧版 DOC 格式的功能有限；表格可能变为普通文本，复杂版式或新版 Word 功能可能改变或丢失。请核对导出文件。",
      partial_text: "部分页面没有可提取文字，可能为扫描内容；请核对是否遗漏。", warning: "请对照原文件核对转换结果。",
      choose_many: "选择文件（可多选）", many_selected: "已选择 {count} 个文件", batch_selected: "已选择多个文件，可以开始批量转换。",
      batch_limit: "一次最多选择 20 个文件，总大小不超过 100 MiB。", pending: "等待转换", skipped: "已跳过：文件已是目标格式。",
      batch_done: "批量转换结束，请检查各文件的结果。", batch_cancelled: "已取消批量转换；已完成的结果仍可下载。", batch_download: "打包下载全部成功结果（ZIP）", batch_packaging: "正在打包…",
      output_limit: "批量结果总大小超过 100 MiB，无法保留此结果。", zip_failed: "打包失败，请重试或逐个下载结果。",
      batch_progress: "正在处理第 {current} / {count} 个文件。",
    },
    en: {
      title: "PDF / Word file converter", summary: "PDF, DOCX and DOC, processed on this device",
      privacy: "Files stay in your browser; the original is unchanged.",
      file: "Source files", choose: "Choose file", no_file_selected: "No files selected (20 MiB each; up to 20 files and 100 MiB total)",
      target: "Convert to", convert: "Convert file", cancel: "Cancel conversion", clear: "Clear", download: "Download converted file",
      ready: "Choose a PDF, DOCX or DOC file, then choose the output format.", selected: "File selected. Ready to convert.",
      engine: "DOC conversion or PDF export first downloads hundreds of MB and may use over 1 GiB of memory. Use a desktop browser and keep this page open while it loads.",
      light_engine: "The first use downloads conversion components. Offline use requires a complete download.",
      pdf_limits: "PDF to Word may change or omit images and complex layouts. Scans need OCR first. Hidden or cropped image content may appear, so review before sharing.",
      word_limits: "Word conversions may change layout because of font substitution, complex tables or legacy DOC limitations. Review the output.",
      working: "Converting locally…", loading: "Loading local conversion components; the first run may take a few minutes…", extracting: "Reading the PDF and reconstructing editable text…",
      exporting: "Exporting the file locally…", done: "Conversion complete. Download and review the result.", cancelled: "Conversion cancelled.",
      unsupported: "Choose a PDF, DOCX or DOC file.", no_file: "Choose a file first.", too_large: "The file exceeds 20 MiB. Choose a smaller file.",
      empty_file: "This file is empty. Choose another file.", bad_document: "The file could not be read. Check that it is not damaged and its extension matches its real format.",
      needs_ocr: "No extractable text was found. Scanned PDFs require OCR first.", encrypted_pdf: "This PDF is encrypted. Decrypt it on your device and try again.",
      engine_unavailable: "The local conversion engine is unavailable. Check that it is installed or fully downloaded.", engine_init_failed: "The engine could not load. Check your connection and available memory, then retry.",
      timeout: "Conversion timed out. Try a smaller or simpler document.", invalid_output: "The output is invalid and has not been offered for download. Try another document.",
      conversion_failed: "Conversion failed. Check the document and try again.", unsupported_browser: "This browser cannot run the local Office engine. Use the latest desktop Chrome, Edge or Firefox.",
      host_busy: "Another document task is running. Wait for it to finish before converting.", dependency_missing: "A local conversion component is missing. Install or download it as described in the usage guide.",
      pdf_reconstructed: "Images, pages and tables may change or be lost. Hidden or cropped image content may also appear. Compare with the original before sharing.",
      layout_changed: "Conversion may change fonts, pagination and layout. Compare with the original file.", images_omitted: "Some or all PDF images could not be retained. Compare with the original file.", legacy_doc_limits: "Legacy DOC has limited support for newer Word features. Tables may become plain text, and complex layouts or other features may change or be lost. Review the exported file.",
      partial_text: "Some pages have no extractable text and may contain scanned content. Check for omissions.", warning: "Compare the converted file with the original.",
      choose_many: "Choose files (multiple allowed)", many_selected: "{count} files selected", batch_selected: "Files selected. Ready to convert.",
      batch_limit: "Choose up to 20 files totaling no more than 100 MiB.", pending: "Waiting", skipped: "Skipped: already in the selected format.",
      batch_done: "Batch finished. Check each file's result.", batch_cancelled: "Batch cancelled. Completed results are still available.", batch_download: "Download all successful results (ZIP)", batch_packaging: "Preparing ZIP…",
      output_limit: "The batch results exceed 100 MiB, so this result could not be kept.", zip_failed: "Could not create the ZIP. Try again or download each result individually.",
      batch_progress: "Processing file {current} of {count}.",
    },
    es: {
      title: "Conversor de PDF / Word", summary: "PDF, DOCX y DOC, en este dispositivo",
      privacy: "Los archivos se procesan en el navegador; el original no cambia.",
      file: "Archivos originales", choose: "Elegir archivo", no_file_selected: "Ningún archivo seleccionado (20 MiB cada uno; hasta 20 archivos y 100 MiB en total)",
      target: "Convertir a", convert: "Convertir archivo", cancel: "Cancelar conversión", clear: "Borrar", download: "Descargar archivo convertido",
      ready: "Elige un PDF, DOCX o DOC y selecciona el formato de salida.", selected: "Archivo seleccionado. Listo para convertir.",
      engine: "Convertir DOC o exportar a PDF descarga cientos de MB la primera vez y puede usar más de 1 GiB de memoria. Usa un navegador de escritorio y mantén abierta esta página durante la carga.",
      light_engine: "El primer uso descarga componentes de conversión. Para trabajar sin conexión, la descarga debe completarse.",
      pdf_limits: "Al pasar de PDF a Word, pueden cambiar o perderse imágenes y diseños complejos. Los escaneos necesitan OCR. Puede aparecer contenido oculto o recortado de imágenes; revisa antes de compartir.",
      word_limits: "Las conversiones de Word pueden cambiar el diseño por sustitución de fuentes, tablas complejas o limitaciones de DOC. Revisa el resultado.",
      working: "Convirtiendo localmente…", loading: "Cargando los componentes locales; la primera vez puede tardar unos minutos…", extracting: "Leyendo el PDF y reconstruyendo texto editable…",
      exporting: "Exportando el archivo localmente…", done: "Conversión terminada. Descarga y revisa el resultado.", cancelled: "Conversión cancelada.",
      unsupported: "Elige un archivo PDF, DOCX o DOC.", no_file: "Primero elige un archivo.", too_large: "El archivo supera los 20 MiB. Elige uno más pequeño.",
      empty_file: "El archivo está vacío. Elige otro.", bad_document: "No se puede leer el archivo. Comprueba que no esté dañado y que su extensión coincida con el formato real.",
      needs_ocr: "No se encontró texto extraíble. Los PDF escaneados necesitan OCR primero.", encrypted_pdf: "El PDF está cifrado. Descífralo en tu dispositivo e inténtalo de nuevo.",
      engine_unavailable: "El motor local no está disponible. Comprueba que esté instalado o descargado por completo.", engine_init_failed: "No se pudo cargar el motor. Revisa la conexión y la memoria disponible e inténtalo de nuevo.",
      timeout: "La conversión tardó demasiado. Prueba un documento más pequeño o sencillo.", invalid_output: "El resultado no es válido y no se ofrece para descargar. Prueba otro documento.",
      conversion_failed: "No se pudo convertir el archivo. Revísalo e inténtalo de nuevo.", unsupported_browser: "Este navegador no admite el motor Office local. Usa la última versión de Chrome, Edge o Firefox de escritorio.",
      host_busy: "Hay otra tarea de documentos en curso. Espera a que termine antes de convertir.", dependency_missing: "Falta un componente local. Instálalo o descárgalo según la guía de uso.",
      pdf_reconstructed: "Las imágenes, páginas y tablas pueden cambiar o perderse. También puede aparecer contenido oculto o recortado de imágenes. Compara con el original antes de compartir.",
      layout_changed: "La conversión puede cambiar fuentes, paginación y diseño. Compara con el archivo original.", images_omitted: "No se pudieron conservar algunas o todas las imágenes del PDF. Compara con el archivo original.", legacy_doc_limits: "DOC antiguo no admite todas las funciones nuevas de Word. Las tablas pueden convertirse en texto y los diseños complejos u otras funciones pueden cambiar o perderse. Revisa el archivo exportado.",
      partial_text: "Algunas páginas no tienen texto extraíble y pueden contener imágenes escaneadas. Comprueba si falta contenido.", warning: "Compara el archivo convertido con el original.",
      choose_many: "Elegir archivos (se permite seleccionar varios)", many_selected: "{count} archivos seleccionados", batch_selected: "Archivos seleccionados. Listos para convertir.",
      batch_limit: "Elige hasta 20 archivos con un máximo total de 100 MiB.", pending: "En espera", skipped: "Omitido: ya tiene el formato elegido.",
      batch_done: "Conversión por lotes terminada. Revisa el resultado de cada archivo.", batch_cancelled: "Conversión cancelada. Los resultados terminados aún se pueden descargar.", batch_download: "Descargar todos los resultados correctos (ZIP)", batch_packaging: "Preparando ZIP…",
      output_limit: "Los resultados superan los 100 MiB; no se pudo guardar este resultado.", zip_failed: "No se pudo crear el ZIP. Inténtalo de nuevo o descarga cada resultado por separado.",
      batch_progress: "Procesando archivo {current} de {count}.",
    },
  };

  const ERROR_ALIASES = {
    failed: "conversion_failed", bad_doc: "bad_document", invalid_file: "bad_document",
    missing_dependency: "dependency_missing", pdf_dependency_missing: "dependency_missing",
    soffice_missing: "engine_unavailable", libreoffice_missing: "engine_unavailable",
    cancelled: "cancelled", encrypted: "encrypted_pdf", too_many_pages: "too_large",
    bad_pdf: "bad_document", pdf_needs_ocr: "needs_ocr", encrypted_document: "encrypted_pdf",
    pdf_page_limit: "too_large", pdf_content_limit: "too_large", pdf_engine_missing: "dependency_missing",
    office_engine_missing: "engine_unavailable", conversion_timeout: "timeout", conversion_io: "conversion_failed",
    external_content: "bad_document", same_format: "unsupported",
    office_runtime_missing: "engine_unavailable", office_integrity: "engine_init_failed",
    office_isolation_required: "unsupported_browser", office_failed: "conversion_failed", office_busy: "host_busy",
  };
  const WARNING_ALIASES = {
    pdf_text_reconstruction: "pdf_reconstructed", pdf_layout_reconstructed: "pdf_reconstructed",
    pdf_layout_loss: "pdf_reconstructed", layout_may_change: "layout_changed",
    font_substitution: "layout_changed", scanned_pages: "partial_text",
    pdf_images_omitted: "images_omitted", pdf_blank_pages: "partial_text", office_layout_review: "layout_changed",
    legacy_format: "legacy_doc_limits",
  };
  const sourceFormat = (file) => String(file?.name || "").toLowerCase().match(/\.(pdf|docx|doc)$/)?.[1] || "";
  const safeName = (name, extension) => String(name || `Converted.${extension}`)
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 240) || `Converted.${extension}`;
  const stageKey = (stage) => {
    const key = typeof stage === "string" ? stage : stage?.stage;
    return /extract|pdf_text/.test(key || "") ? "extracting" :
      /export|convert/.test(key || "") ? "exporting" : /load|download|runtime|init|office|packages|application/.test(key || "") ? "loading" : "working";
  };

  function create({ mount, getLocale = () => "en", convert, canStart = () => true, onBusyChange = () => {} }) {
    if (!mount || typeof mount.replaceChildren !== "function" || typeof convert !== "function") {
      throw new TypeError("A mount and a local convert function are required.");
    }
    const document = mount.ownerDocument || root.document;
    const id = `fc-document-converter-${++instances}`;
    let file = null;
    let files = [];
    let batchEntries = [];
    let batchURLs = new Map();
    let zipURL = null;
    let batchAction = false;
    let busy = false;
    let destroyed = false;
    let epoch = 0;
    let controller = null;
    let resultURL = null;
    let statusKey = "ready";
    let statusError = false;
    let warningCodes = [];
    const localized = [];
    const locale = () => TEXT[getLocale()] ? getLocale() : "en";
    const text = (key) => TEXT[locale()][key] || TEXT.en[key] || TEXT[locale()].warning;
    const node = (tag, className, key, role) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (key) { localized.push([element, key]); element.textContent = text(key); }
      if (role) element.setAttribute("data-fc-convert", role);
      return element;
    };
    const panel = node("details", "fc-converter", null, "panel");
    const summary = node("summary", "fc-converter-summary");
    summary.append(node("span", "fc-converter-title", "title"), node("span", "fc-converter-subtitle", "summary"));
    const body = node("div", "fc-converter-body");
    const privacy = node("p", "fc-converter-privacy", "privacy");
    const grid = node("div", "fc-converter-grid");
    const fileGroup = node("div", "fc-converter-field");
    const fileLabel = node("label", "fc-converter-label", "file");
    fileLabel.setAttribute("for", id + "-file");
    const fileInput = node("input", "fc-converter-file", null, "file");
    fileInput.id = id + "-file";
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = ".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    fileInput.hidden = true;
    const choose = node("button", "fc-converter-button", "choose_many", "choose");
    choose.type = "button";
    const fileName = node("p", "fc-converter-filename", null, "filename");
    fileName.id = id + "-filename";
    choose.setAttribute("aria-describedby", fileName.id);
    fileGroup.append(fileLabel, fileInput, choose, fileName);
    const targetGroup = node("div", "fc-converter-field");
    const targetLabel = node("label", "fc-converter-label", "target");
    targetLabel.setAttribute("for", id + "-target");
    const target = node("select", "fc-converter-target", null, "target");
    target.id = id + "-target";
    targetGroup.append(targetLabel, target);
    grid.append(fileGroup, targetGroup);
    const engineNotice = node("p", "fc-converter-note", null, "engine-notice");
    const limitation = node("p", "fc-converter-note", null, "limitations");
    limitation.id = id + "-limitations";
    target.setAttribute("aria-describedby", limitation.id);
    const actions = node("div", "fc-converter-actions");
    const start = node("button", "fc-converter-button fc-converter-primary", "convert", "convert");
    const cancel = node("button", "fc-converter-button", "cancel", "cancel");
    const clear = node("button", "fc-converter-button fc-converter-clear", "clear", "clear");
    for (const button of [start, cancel, clear]) button.type = "button";
    actions.append(start, cancel, clear);
    const status = node("p", "fc-converter-status", null, "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    const warnings = node("ul", "fc-converter-warnings", null, "warnings");
    const download = node("a", "fc-converter-download", "download", "download");
    download.hidden = true;
    const batchList = node("ol", "fc-converter-batch", null, "batch-list");
    batchList.hidden = true;
    const batchDownload = node("button", "fc-converter-button fc-converter-batch-download", "batch_download", "batch-download");
    batchDownload.type = "button";
    batchDownload.hidden = true;
    body.append(privacy, grid, engineNotice, limitation, actions, status, warnings, download, batchList, batchDownload);
    panel.append(summary, body);
    mount.replaceChildren(panel);

    function clearResult() {
      if (resultURL) root.URL.revokeObjectURL(resultURL);
      resultURL = null;
      download.hidden = true;
      download.removeAttribute("href");
      download.removeAttribute("download");
      warningCodes = [];
      for (const url of batchURLs.values()) root.URL.revokeObjectURL(url);
      batchURLs.clear();
      if (zipURL) root.URL.revokeObjectURL(zipURL);
      zipURL = null;
      batchEntries = [];
    }
    function updateTargets() {
      const previous = target.value;
      target.replaceChildren();
      const firstSource = sourceFormat(file);
      const source = files.every((item) => sourceFormat(item) === firstSource) ? firstSource : "";
      for (const format of FORMATS.filter((format) => format !== source)) {
        const option = node("option");
        option.value = format;
        option.textContent = format.toUpperCase();
        target.append(option);
      }
      target.value = FORMATS.includes(previous) && previous !== source ? previous : source === "pdf" ? "docx" : "pdf";
    }
    function render() {
      if (destroyed) return;
      for (const [element, key] of localized) element.textContent = text(key);
      panel.setAttribute("aria-busy", String(busy));
      choose.disabled = busy;
      fileInput.disabled = busy;
      target.disabled = busy || !file;
      start.disabled = busy || !file;
      clear.disabled = busy || !file;
      cancel.hidden = !busy;
      cancel.disabled = busy && Boolean(controller?.signal.aborted);
      fileName.textContent = files.length > 1 ? text("many_selected").replace("{count}", String(files.length)) : file ? file.name : text("no_file_selected");
      const hasPDF = files.some((item) => sourceFormat(item) === "pdf");
      const hasDoc = files.some((item) => sourceFormat(item) === "doc");
      engineNotice.textContent = text(hasDoc || target.value === "doc" || target.value === "pdf" ? "engine" : "light_engine");
      limitation.textContent = hasPDF && files.length > 1 ? text("pdf_limits") + " " + text("word_limits") : text(hasPDF ? "pdf_limits" : "word_limits");
      status.textContent = text(statusKey);
      const currentEntry = batchEntries.find((entry) => entry.status === "converting");
      if (busy && !batchAction && currentEntry && !controller?.signal.aborted) {
        status.textContent = text("batch_progress").replace("{current}", String(currentEntry.index + 1)).replace("{count}", String(files.length)) + " " + text(stageKey(currentEntry.stage));
      }
      status.classList.toggle("fc-converter-error", statusError);
      warnings.replaceChildren();
      const translated = [...new Set(warningCodes.map((code) => text(WARNING_ALIASES[code] || code)))];
      for (const message of translated) {
        const item = node("li");
        item.textContent = message;
        warnings.append(item);
      }
      warnings.hidden = !translated.length;
      batchList.hidden = files.length < 2;
      batchList.replaceChildren();
      for (const entry of batchEntries) {
        const item = node("li", "fc-converter-batch-item", null, "batch-item");
        const label = node("strong", "fc-converter-batch-name");
        label.textContent = entry.name;
        const entryStatus = node("span", "fc-converter-batch-status");
        const error = ERROR_ALIASES[entry.error] || entry.error;
        const key = entry.status === "converting" ? stageKey(entry.stage) : entry.status === "success" ? "done" : entry.status === "error" ? (Object.prototype.hasOwnProperty.call(TEXT.en, error) ? error : "conversion_failed") : entry.status;
        entryStatus.textContent = text(key || "pending");
        entryStatus.classList.toggle("fc-converter-error", entry.status === "error");
        item.append(label, entryStatus);
        if (entry.result?.blob && entry.status === "success") {
          let url = batchURLs.get(entry.index);
          if (!url) { url = root.URL.createObjectURL(entry.result.blob); batchURLs.set(entry.index, url); }
          const link = node("a", "fc-converter-download", null, "batch-item-download");
          link.textContent = text("download");
          link.setAttribute("aria-label", `${text("download")} — ${entry.name}`);
          link.href = url;
          link.download = safeName(entry.result.name, target.value);
          item.append(link);
          const codes = Array.isArray(entry.result.warnings) ? entry.result.warnings.filter((code) => typeof code === "string") : [];
          if (sourceFormat(files[entry.index]) === "pdf" && !codes.includes("pdf_reconstructed")) codes.unshift("pdf_reconstructed");
          const messages = [...new Set(codes.map((code) => text(WARNING_ALIASES[code] || code)))];
          if (messages.length) {
            const list = node("ul", "fc-converter-warnings");
            for (const message of messages) { const warning = node("li"); warning.textContent = message; list.append(warning); }
            item.append(list);
          }
        }
        batchList.append(item);
      }
      batchDownload.hidden = files.length < 2 || !batchEntries.some((entry) => entry.status === "success");
      batchDownload.disabled = busy;
      if (batchAction) batchDownload.textContent = text("batch_packaging");
    }
    function setBusy(next) {
      if (busy === next) return;
      busy = next;
      onBusyChange(next);
    }
    function reset(nextFiles) {
      if (busy || destroyed) return;
      epoch++;
      clearResult();
      files = Array.from(nextFiles || []);
      file = files[0] || null;
      const problem = files.length > MAX_FILES || files.reduce((sum, item) => sum + (Number.isFinite(Number(item.size)) ? Number(item.size) : 0), 0) > MAX_TOTAL_SIZE ? "batch_limit" : files.length === 1 && file && (!FORMATS.includes(sourceFormat(file)) ? "unsupported" :
        !Number.isFinite(Number(file.size)) || file.size < 0 ? "bad_document" :
          file.size > MAX_SIZE ? "too_large" : file.size === 0 ? "empty_file" : null);
      if (problem) {
        file = null;
        files = [];
        fileInput.value = "";
      }
      updateTargets();
      batchEntries = files.length > 1 ? files.map((item, index) => ({ index, name: item.name, status: "pending" })) : [];
      statusKey = problem || (files.length > 1 ? "batch_selected" : file ? "selected" : "ready");
      statusError = Boolean(problem);
      render();
    }
    function stop() {
      if (!busy || destroyed) return;
      if (files.length > 1) {
        controller?.abort();
        statusKey = "batch_cancelled";
        render();
        return;
      }
      epoch++;
      controller?.abort();
      controller = null;
      setBusy(false);
      statusKey = "cancelled";
      statusError = false;
      render();
    }
    async function runBatch() {
      if (!FORMATS.includes(target.value)) { statusKey = "unsupported"; statusError = true; render(); return; }
      if (!canStart()) { statusKey = "host_busy"; statusError = true; render(); return; }
      if (!root.FormCapyBatchConverter?.run) { statusKey = "dependency_missing"; statusError = true; render(); return; }
      clearResult();
      const activeEpoch = ++epoch;
      const activeController = new root.AbortController();
      controller = activeController;
      batchEntries = files.map((item, index) => ({ index, name: item.name, status: "pending" }));
      statusKey = "working"; statusError = false; setBusy(true); render();
      try {
        const entries = await root.FormCapyBatchConverter.run({
          files, targetFormat: target.value, convert, signal: activeController.signal,
          onUpdate(entries) {
            if (destroyed || activeEpoch !== epoch) return;
            batchEntries = entries;
            render();
          },
        });
        if (destroyed || activeEpoch !== epoch) return;
        batchEntries = entries;
        statusKey = activeController.signal.aborted ? "batch_cancelled" : "batch_done";
      } catch (error) {
        if (destroyed || activeEpoch !== epoch) return;
        statusKey = activeController.signal.aborted || error?.name === "AbortError" ? "batch_cancelled" : "conversion_failed";
        statusError = statusKey !== "batch_cancelled";
      } finally {
        if (!destroyed && activeEpoch === epoch) { controller = null; setBusy(false); render(); }
      }
    }
    async function downloadBatch() {
      if (busy || destroyed || !root.FormCapyBatchConverter?.createZip || !batchEntries.some((entry) => entry.status === "success")) return;
      const activeEpoch = ++epoch;
      const activeController = new root.AbortController();
      controller = activeController;
      batchAction = true; statusKey = "batch_packaging"; statusError = false; setBusy(true); render();
      try {
        const blob = await root.FormCapyBatchConverter.createZip(batchEntries, { signal: activeController.signal });
        if (destroyed || activeEpoch !== epoch || activeController.signal.aborted) return;
        if (!blob || !Number.isFinite(blob.size) || blob.size <= 0) throw new Error("invalid zip");
        if (zipURL) root.URL.revokeObjectURL(zipURL);
        zipURL = root.URL.createObjectURL(blob);
        const link = node("a");
        link.href = zipURL; link.download = "converted-files.zip";
        link.click();
        statusKey = "batch_done";
      } catch (error) {
        if (destroyed || activeEpoch !== epoch) return;
        statusKey = activeController.signal.aborted || error?.name === "AbortError" ? "batch_cancelled" : "zip_failed";
        statusError = statusKey === "zip_failed";
      } finally {
        if (!destroyed && activeEpoch === epoch) { controller = null; batchAction = false; setBusy(false); render(); }
      }
    }
    async function run() {
      if (busy || destroyed) return;
      if (!file) { statusKey = "no_file"; statusError = true; render(); return; }
      if (files.length > 1) return runBatch();
      if (!FORMATS.includes(target.value) || target.value === sourceFormat(file)) {
        statusKey = "unsupported"; statusError = true; render(); return;
      }
      if (!canStart()) { statusKey = "host_busy"; statusError = true; render(); return; }
      clearResult();
      const activeEpoch = ++epoch;
      const activeController = new root.AbortController();
      controller = activeController;
      statusKey = "working";
      statusError = false;
      setBusy(true);
      render();
      try {
        const result = await convert({
          file, targetFormat: target.value, signal: activeController.signal,
          onStage(stage) {
            if (destroyed || epoch !== activeEpoch || !busy) return;
            statusKey = stageKey(stage);
            render();
          },
        });
        if (destroyed || epoch !== activeEpoch || activeController.signal.aborted) return;
        if (!result?.blob || !Number.isFinite(result.blob.size) || result.blob.size <= 0 || typeof result.blob.arrayBuffer !== "function") {
          throw Object.assign(new Error("invalid_output"), { code: "invalid_output" });
        }
        resultURL = root.URL.createObjectURL(result.blob);
        download.href = resultURL;
        download.download = safeName(result.name, target.value);
        download.hidden = false;
        warningCodes = Array.isArray(result.warnings) ? result.warnings.filter((code) => typeof code === "string") : [];
        if (sourceFormat(file) === "pdf" && !warningCodes.includes("pdf_reconstructed")) warningCodes.unshift("pdf_reconstructed");
        statusKey = "done";
      } catch (error) {
        if (destroyed || epoch !== activeEpoch) return;
        const code = error?.name === "AbortError" ? "cancelled" : ERROR_ALIASES[error?.code] || error?.code || "conversion_failed";
        statusKey = Object.prototype.hasOwnProperty.call(TEXT.en, code) ? code : "conversion_failed";
        statusError = statusKey !== "cancelled";
      } finally {
        if (!destroyed && epoch === activeEpoch) {
          controller = null;
          setBusy(false);
          render();
        }
      }
    }
    choose.addEventListener("click", () => { if (!busy) fileInput.click(); });
    fileInput.addEventListener("change", () => reset(fileInput.files));
    target.addEventListener("change", () => {
      if (busy || destroyed) return;
      epoch++;
      clearResult();
      batchEntries = files.length > 1 ? files.map((item, index) => ({ index, name: item.name, status: "pending" })) : [];
      statusKey = files.length > 1 ? "batch_selected" : file ? "selected" : "ready";
      statusError = false;
      render();
    });
    clear.addEventListener("click", () => { if (!busy) { fileInput.value = ""; reset([]); } });
    start.addEventListener("click", run);
    cancel.addEventListener("click", stop);
    batchDownload.addEventListener("click", downloadBatch);
    const pagehide = (event) => { if (!event.persisted) destroy(); };
    root.addEventListener?.("pagehide", pagehide);
    function destroy() {
      if (destroyed) return;
      epoch++;
      controller?.abort();
      controller = null;
      clearResult();
      file = null;
      files = [];
      fileInput.value = "";
      setBusy(false);
      destroyed = true;
      root.removeEventListener?.("pagehide", pagehide);
      mount.replaceChildren();
    }
    updateTargets();
    render();
    return Object.freeze({
      setLocale() { render(); },
      state: () => ({ busy, hasFile: Boolean(file), sourceFormat: sourceFormat(file), targetFormat: target.value, hasResult: Boolean(resultURL) || batchURLs.size > 0 }),
      destroy,
    });
  }
  root.FormCapyDocumentConverter = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
