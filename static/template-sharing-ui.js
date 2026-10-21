/* Course-template sharing UI. No network or storage access. */
(function (root) {
  "use strict";
  const TEXT = {
    zh: {
      sharing: "分享课程模板", preview: "核对导入的模板", outgoing: "分享课程模板",
      school_name: "学校名称", school_abbr: "学校简称", course_code: "课程代码", campus_term: "校区／学期",
      labels_hint: "课程标签可留空，由你填写，不代表学校认证；不会填入论文信息。",
      generic_name: "本次分享使用通用名称（不修改当前模板名）",
      copy_code: "复制模板码", export_json: "导出分享 JSON", download_json: "下载分享 JSON",
      copy_json: "复制分享 JSON", code: "模板码", json: "分享 JSON", close: "关闭",
      apply: "应用此模板", yes: "是", no: "否", empty: "未填写",
      privacy: "模板码和分享 JSON 包含模板名称、排版设置与所填课程标签，持有者可以读取；不会自动带入草稿、姓名、论文标题等论文信息。",
      receive_hint: "核对后再应用。只改变后续生成的排版设置，不会改动论文信息、当前草稿、保留段落或已有结果；保存到“我的模板”仍是单独操作。",
      outgoing_hint: "把模板码发给同学，对方在“导入模板”中粘贴即可。它包含完整设置，无需账号或服务器；修改后需重新复制。",
      copied: "已复制模板码。", copied_json: "已复制分享 JSON。", manual: "已选中内容，请使用系统的复制操作。",
      downloaded: "已发起分享 JSON 下载。", applied: "模板已应用；点击“保存模板”可保留排版设置。课程标签可用分享 JSON 留存。",
      invalid: "模板码或分享 JSON 无效，请复制完整内容后重试。", version: "此模板码的版本暂不支持，请使用支持它的新版 FormCapy。",
      large: "模板数据过长，请缩短模板名或课程标签后重试。", unavailable: "分享功能未能加载，请重新打开页面。",
      transfer_hint: "粘贴模板码或模板 JSON，也可选择 JSON 文件。先预览，确认后才应用。兼容 JSON 仅含排版设置；分享 JSON 另含课程标签。",
      transfer_text: "模板码或 JSON", inspect: "预览模板", native_hint: "粘贴模板码或 JSON，先预览后应用。导出时可复制内容。",
      compatible_hint: "兼容 JSON 只包含排版设置。需要同时保留课程标签时，请使用“导出分享 JSON”。", compatible_json: "兼容模板 JSON",
      full_settings: "完整排版设置（19 项）",
      invalid_editing: "请检查课程标签的长度和内容：学校名称最多 120 个字符、简称 24 个、课程代码 64 个、校区／学期 80 个，不可包含换行等控制字符。",
    },
    en: {
      sharing: "Share a course template", preview: "Review imported template", outgoing: "Share a course template",
      school_name: "School name", school_abbr: "School abbreviation", course_code: "Course code", campus_term: "Campus / term",
      labels_hint: "Optional labels are supplied by you, without institutional verification. They do not fill in your paper details.",
      generic_name: "Use a generic name for this share (keep the current template name)",
      copy_code: "Copy template code", export_json: "Export sharing JSON", download_json: "Download sharing JSON",
      copy_json: "Copy sharing JSON", code: "Template code", json: "Sharing JSON", close: "Close",
      apply: "Apply this template", yes: "Yes", no: "No", empty: "Not provided",
      privacy: "Codes and sharing JSON include the template name, layout settings and entered course labels. Anyone with a copy can read them. Drafts, names, paper titles and other paper details are not included automatically.",
      receive_hint: "Review before applying. Only the layout for future generation changes; paper details, the draft, preserved paragraphs and existing results stay intact. Saving to your templates is a separate action.",
      outgoing_hint: "Send the code to a classmate, who can paste it into Import template. It carries all settings without an account or server. Copy a new code after editing.",
      copied: "Template code copied.", copied_json: "Sharing JSON copied.", manual: "Content selected. Use your system's Copy action.",
      downloaded: "Sharing JSON download started.", applied: "Template applied. Choose Save template to keep the layout; use sharing JSON to retain the course labels.",
      invalid: "Invalid template code or sharing JSON. Copy the complete content and try again.", version: "This template-code version is not supported. Use a newer FormCapy version that supports it.",
      large: "Template data is too long. Shorten the template name or course labels and try again.", unavailable: "Sharing could not load. Reopen the page and try again.",
      transfer_hint: "Paste a template code or JSON, or choose a JSON file. Preview before applying. Compatible JSON contains layout settings only; sharing JSON also includes course labels.",
      transfer_text: "Template code or JSON", inspect: "Preview template", native_hint: "Paste a template code or JSON to preview before applying. Copy the content to export it.",
      compatible_hint: "Compatible JSON contains layout settings only. Use Export sharing JSON to retain course labels too.", compatible_json: "Compatible template JSON",
      full_settings: "All 19 layout settings",
      invalid_editing: "Check the course labels: school name up to 120 characters, abbreviation 24, course code 64, campus/term 80. Line breaks and control characters are not allowed.",
    },
    es: {
      sharing: "Compartir una plantilla de curso", preview: "Revisar la plantilla importada", outgoing: "Compartir una plantilla de curso",
      school_name: "Nombre de la institución", school_abbr: "Abreviatura de la institución", course_code: "Código del curso", campus_term: "Campus / periodo",
      labels_hint: "Las etiquetas son opcionales y las escribes tú; no están verificadas por la institución ni rellenan los datos del trabajo.",
      generic_name: "Usar un nombre genérico al compartir (sin cambiar el nombre actual)",
      copy_code: "Copiar código de plantilla", export_json: "Exportar JSON para compartir", download_json: "Descargar JSON para compartir",
      copy_json: "Copiar JSON para compartir", code: "Código de plantilla", json: "JSON para compartir", close: "Cerrar",
      apply: "Aplicar esta plantilla", yes: "Sí", no: "No", empty: "Sin indicar",
      privacy: "Los códigos y el JSON para compartir incluyen el nombre de la plantilla, el formato y las etiquetas del curso. Quien tenga una copia podrá leerlos. No incluyen automáticamente borradores, nombres, títulos ni otros datos del trabajo.",
      receive_hint: "Revisa antes de aplicar. Solo cambia el formato de los documentos que generes después; se conservan los datos del trabajo, el borrador, los párrafos protegidos y los resultados anteriores. Guardarla es un paso aparte.",
      outgoing_hint: "Envía el código a otra persona para que lo pegue en Importar plantilla. Contiene toda la configuración, sin cuenta ni servidor. Copia un código nuevo después de editar.",
      copied: "Código de plantilla copiado.", copied_json: "JSON para compartir copiado.", manual: "Contenido seleccionado. Usa la opción Copiar del sistema.",
      downloaded: "Se ha iniciado la descarga del JSON.", applied: "Plantilla aplicada. Pulsa Guardar plantilla para conservar el formato; usa el JSON para compartir para conservar las etiquetas del curso.",
      invalid: "Código de plantilla o JSON no válido. Copia el contenido completo e inténtalo de nuevo.", version: "Esta versión del código no es compatible. Usa una versión más reciente de FormCapy que la admita.",
      large: "Los datos son demasiado largos. Acorta el nombre o las etiquetas e inténtalo de nuevo.", unavailable: "No se pudo cargar la función de compartir. Vuelve a abrir la página.",
      transfer_hint: "Pega un código de plantilla o JSON, o elige un archivo JSON. Revisa antes de aplicar. El JSON compatible solo contiene el formato; el JSON para compartir también incluye etiquetas del curso.",
      transfer_text: "Código de plantilla o JSON", inspect: "Revisar plantilla", native_hint: "Pega un código o JSON para revisarlo antes de aplicarlo. Copia el contenido para exportarlo.",
      compatible_hint: "El JSON compatible solo incluye el formato. Usa Exportar JSON para compartir para conservar también las etiquetas del curso.", compatible_json: "JSON de plantilla compatible",
      full_settings: "Las 19 opciones de formato",
      invalid_editing: "Revisa las etiquetas: institución hasta 120 caracteres, abreviatura 24, curso 64 y campus/periodo 80. No se admiten saltos de línea ni caracteres de control.",
    },
  };
  const LABELS = ["school_name", "school_abbr", "course_code", "campus_term"];
  const FIELD_LABELS = { label: "template_name", header: "header_style" };
  const ENUM_LABELS = {
    alignment: { left: "align_left", justify: "align_justify" },
    header: { page: "header_page", surname_page: "header_surname", none: "header_none" },
    page_number_position: { top_right: "position_top_right", bottom_center: "position_bottom_center", bottom_right: "position_bottom_right" },
    typography: { western: "typography_western", chinese: "typography_chinese" },
  };
  function attach(hooks) {
    const codec = root.FormCapyTemplateShare;
    if (!codec) return null;
    const $ = (id) => document.getElementById(id);
    const dialog = $("template-share-preview");
    let language = "en", current = null, receiving = false, mode = "code", opener = null;
    let notice = "", editorNotice = "", dialogError = null, editorError = null;
    let transferExporting = false;
    const t = (key) => (TEXT[language] || TEXT.en)[key] || TEXT.en[key];
    function errorMessage(error, editing = false) {
      const code = error?.code || "";
      if (/version/.test(code)) return t("version");
      if (/large|long|size|limit/.test(code)) return t("large");
      if (editing) return t("invalid_editing");
      return t("invalid");
    }
    function drawPreview() {
      if (!current) return;
      const list = [], overview = [];
      function row(label, value, target = list) {
        const name = document.createElement("dt"), text = document.createElement("dd");
        name.textContent = label;
        text.textContent = String(value);
        target.push(name, text);
      }
      const profile = current.settings;
      row(hooks.translate("template_name"), profile.label, overview);
      for (const key of LABELS) if (current.labels[key]) row(t(key), current.labels[key], overview);
      row(hooks.translate("paper_size"), profile.paper_size, overview);
      row(hooks.translate("font_name"), `${profile.font_name}${profile.typography === "chinese" ? " / " + profile.latin_font_name : ""} · ${profile.font_size} pt`, overview);
      row(hooks.translate(profile.line_spacing_pt > 0 ? "line_spacing_pt" : "line_spacing"), profile.line_spacing_pt || profile.line_spacing, overview);
      row(hooks.translate("margin_cm"), profile.margin_cm, overview);
      $("share-preview-overview").replaceChildren(...overview);
      for (const [key, raw] of Object.entries(current.settings)) {
        const value = typeof raw === "boolean" ? t(raw ? "yes" : "no")
          : ENUM_LABELS[key]?.[raw] ? hooks.translate(ENUM_LABELS[key][raw]) : raw;
        row(hooks.translate(FIELD_LABELS[key] || key), value);
      }
      $("share-preview-settings").replaceChildren(...list);
    }
    function render(code) {
      language = TEXT[code] ? code : "en";
      document.querySelectorAll("[data-share-t]").forEach((el) => { el.textContent = t(el.dataset.shareT); });
      document.querySelectorAll("[data-share-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.shareLabel)); });
      $("share-title").textContent = t(receiving ? "preview" : "outgoing");
      $("share-preview-hint").textContent = t(receiving ? "receive_hint" : "outgoing_hint");
      $("share-output-label").textContent = t(mode === "code" ? "code" : "json");
      $("share-copy").textContent = t(mode === "code" ? "copy_code" : "copy_json");
      $("share-message").textContent = dialogError ? errorMessage(dialogError) : notice ? t(notice) : "";
      $("share-editor-message").textContent = editorError ? errorMessage(editorError, true) : editorNotice ? t(editorNotice) : "";
      document.querySelector('[data-t="transfer_hint"]').textContent = t(transferExporting ? "compatible_hint" : "transfer_hint");
      document.querySelector('[data-t="template_text"]').textContent = t(transferExporting ? "compatible_json" : "transfer_text");
      $("transfer-apply").textContent = t("inspect");
      drawPreview();
    }
    function clearLabels() {
      for (const key of LABELS) $("share-" + key).value = "";
      $("share-generic-name").checked = false;
      editorNotice = "";
      editorError = null;
      $("share-editor-message").textContent = "";
    }
    function open(envelope, incoming, source, kind = "code") {
      current = codec.validateEnvelope(envelope);
      receiving = incoming;
      mode = kind;
      opener = source || document.activeElement;
      notice = "";
      dialogError = null;
      $("share-output-row").hidden = incoming;
      $("share-apply").hidden = !incoming;
      $("share-copy").hidden = incoming;
      $("share-download").hidden = incoming || hooks.native;
      $("share-full-settings").open = false;
      render(language);
      dialog.showModal();
      (incoming ? $("share-apply") : $("share-copy")).focus();
    }
    async function copyOutput() {
      dialogError = null;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard");
        await navigator.clipboard.writeText($("share-output").value);
        notice = mode === "code" ? "copied" : "copied_json";
      } catch (_) {
        $("share-output").focus();
        $("share-output").select();
        notice = "manual";
      }
      $("share-message").textContent = t(notice);
    }
    function prepare(kind) {
      editorNotice = "";
      editorError = null;
      $("share-editor-message").textContent = "";
      const settings = hooks.getProfile();
      if (!settings) return;
      try {
        const labels = Object.fromEntries(LABELS.map((key) => [key, $("share-" + key).value]));
        const profile = { ...settings };
        if ($("share-generic-name").checked) profile.label = "Course template";
        const envelope = codec.createEnvelope(profile, labels);
        const text = kind === "code" ? codec.encodeCode(envelope) : codec.stringifyShareJson(envelope);
        $("share-output").value = text;
        $("share-output").rows = kind === "code" ? 5 : 10;
        editorNotice = "";
        open(envelope, false, $(kind === "code" ? "preset-share-code" : "preset-share-json"), kind);
        if (kind === "code") void copyOutput();
      } catch (error) {
        editorError = error;
        $("share-editor-message").textContent = errorMessage(error, true);
      }
    }
    $("preset-share-code").addEventListener("click", () => prepare("code"));
    $("preset-share-json").addEventListener("click", () => prepare("json"));
    $("share-copy").addEventListener("click", copyOutput);
    for (const id of ["share-x", "share-dismiss"]) $(id).addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { opener?.focus(); });
    $("share-download").addEventListener("click", () => {
      if (!current || receiving || hooks.native) return;
      try {
        const json = codec.stringifyShareJson(current);
        const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = current.settings.label.replace(/[\\/\u0000-\u001f\u007f:*?"<>|]/g, "_") + ".formcapy.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        notice = "downloaded";
        $("share-message").textContent = t(notice);
      } catch (error) { dialogError = error; $("share-message").textContent = errorMessage(error); }
    });
    $("share-apply").addEventListener("click", () => {
      if (!current || !receiving) return;
      try {
        const envelope = codec.validateEnvelope(current);
        hooks.applyProfile(envelope.settings);
        for (const key of LABELS) $("share-" + key).value = envelope.labels[key];
        $("share-generic-name").checked = false;
        editorNotice = "applied";
        editorError = null;
        $("template-sharing").open = true;
        $("share-editor-message").textContent = t(editorNotice);
        opener = $("preset-save");
        dialog.close();
      } catch (error) { dialogError = error; $("share-message").textContent = errorMessage(error); }
    });
    $("template-sharing").hidden = false;
    return {
      render, clearLabels, errorMessage,
      transferMode(exporting) { transferExporting = exporting; render(language); },
      preview(envelope, source) { open(envelope, true, source); },
      parseImport(text) {
        const value = text.trim();
        if (!value.startsWith("{")) return codec.decodeCode(value);
        const data = JSON.parse(value);
        if (data && ["schema", "v", "settings", "labels"].some((key) => Object.hasOwn(data, key)))
          return codec.parseShareJson(text);
        const profile = hooks.normalizeLegacy(data && Object.hasOwn(data, "custom_profile") ? data.custom_profile : data);
        return codec.createEnvelope(profile);
      },
      nativeImportHint() { return t("native_hint"); },
    };
  }
  root.FormCapyTemplateSharing = Object.freeze({ attach });
})(globalThis);
