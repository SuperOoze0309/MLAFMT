/* FormCapy citation assistant.
 *
 * Self-contained, dependency-free UI for a local citation library. The model
 * (static/citation-library.js) and render engine
 * (static/citation-engine.js) are injected by the host page. This file owns
 * only DOM interaction, session state and explicit localStorage persistence.
 */
(function (root) {
  "use strict";

  const STORAGE_KEY = "formcapy.citations.v1";
  const MAX_VISIBLE_ISSUES = 20;
  let instanceCount = 0;
  const TEXT = {
    zh: {
      assistant: "参考文献助手",
      summary_hint: "在本地整理书目，生成独立的 MLA 9 或 APA 7 参考文献表。",
      scope: "只生成独立的参考文献表；现有正文、论文信息和文中引用不会被改写。当前只支持 MLA 9 与 APA 7。",
      add: "添加条目",
      entries: "条目",
      entries_count: "共 {count} 条",
      empty_library: "还没有条目。可添加书籍、期刊文章或网页。",
      untitled: "未命名条目",
      editor: "编辑条目",
      no_selection: "从左侧选择一个条目，或添加新条目。",
      type: "类型", type_book: "书籍", type_article: "期刊文章", type_webpage: "网页",
      title: "标题", authors: "作者",
      author_person: "个人作者", author_literal: "机构/团体作者",
      family: "姓", given: "名", literal: "机构名称",
      add_author: "添加作者", remove_author: "删除此作者", move_up: "上移", move_down: "下移",
      issued: "出版日期", accessed: "访问日期",
      year: "年", month: "月", day: "日",
      publisher: "出版社", container: "期刊/网站名称", volume: "卷", issue: "期", page: "页码",
      edition: "版次", doi: "DOI", url: "网址", language: "语言",
      original_text: "原始内容（只读）", original_hint: "导入时保存的原始内容；不会作为可编辑字段被改写。",
      optional: "可选",
      delete_entry: "删除条目",
      undo: "撤销", undo_remove: "撤销删除", undo_library: "撤销替换", undo_applied: "已撤销。",
      style: "样式", style_mla: "MLA 9", style_apa: "APA 7",
      style_scope: "预览只用于这里独立生成的文献表，不会改论文中的引用。",
      preview: "预览文献表", preview_busy: "正在生成预览…", preview_stale: "输入或样式已更改，请重新预览。",
      preview_required: "填写条目后点击“预览文献表”。", preview_error: "预览生成失败，请稍后重试。",
      engine_missing: "引用渲染器尚未加载，无法预览。", model_missing: "引用数据模块尚未加载。",
      preview_ready: "预览已更新。",
      copy_text: "复制纯文本", copy_rich: "复制带格式文本", copy_json: "复制库 JSON",
      download_json: "下载库 JSON", download_html: "下载 HTML", download_word: "下载 Word 文献表",
      word_busy: "正在准备 Word 文献表…", word_error: "无法生成 Word 文献表。",
      word_cancel: "取消 Word 生成", word_cancelled: "已取消 Word 生成，条目和预览已保留。",
      word_ready: "Word 文献表已准备好。", copied: "已复制。", copy_failed: "无法复制，请手动选择文本。",
      copy_manual: "内容已选中，请使用系统的复制操作。", json_copied: "库 JSON 已复制。",
      import_export: "导入 / 导出",
      import_library_json: "导入文献库 JSON",
      import_hint: "粘贴或选择库 JSON；先预览，再确认替换当前库。不会读取草稿或论文数据。",
      import_text: "库 JSON", choose_file: "选择 JSON 文件", review: "预览导入",
      review_import: "核对导入的库", review_count: "{count} 条将替换当前库。",
      review_titles: "条目：", apply_import: "确认替换", cancel: "取消",
      import_applied: "已导入并替换当前库；可用“撤销替换”恢复。", import_invalid: "库 JSON 无效，当前库未改变。",
      import_stale: "导入文本已改变，请重新预览核对。",
      file_too_large: "文件超过 1 MiB。", invalid_encoding: "文件不是有效的 UTF-8。",
      library_json: "库 JSON",
      save: "保存到本设备", save_hint: "只保存这个文献库；不会保存草稿、论文信息或模板。",
      load: "载入已保存的库", load_hint: "只读取本设备上由你明确保存的库。",
      remove_saved: "删除已保存的库", remove_hint: "删除本设备上的保存副本，不会删除当前正在使用的库。",
      saved: "已保存到本设备。", unsaved: "有未保存的更改。", not_saved: "尚未保存到本设备。",
      removed_saved: "已删除本设备上的保存副本；当前库未改变。",
      download_unavailable: "此环境不支持下载，请使用复制。",
      storage_unavailable: "此浏览器无法使用本地存储。", storage_error: "本地存储操作失败。",
      storage_quota: "本地存储空间不足，无法保存。",
      warnings: "提醒", errors: "需要修正",
      warn_author: "未填写作者；部分资料可以没有作者。", warn_year: "未填写出版年份。",
      warn_publisher: "书籍缺少出版社。", warn_container: "缺少期刊或网站名称。",
      warn_url: "网页缺少网址。", warn_accessed: "网页缺少访问日期。",
      warn_doi: "这个 DOI 格式可能无效。请预览前检查或清空；不会自动联网查询。",
      more_issues: "…另有 {count} 条未显示",
      error_title: "标题为必填项。", error_date: "日期无效；允许只填部分日期。",
      error_url: "请输入有效的 http(s) 网址。", error_control: "请移除控制字符。",
      error_unicode: "文本包含无效的 Unicode 代理字符。", error_text: "这里需要文本。",
      error_author: "作者信息无效。", error_unknown: "包含未知字段。",
      error_schema: "不是 FormCapy 文献库。", error_version: "库版本不受支持。",
      error_duplicate: "条目 ID 重复。", error_too_many: "条目数量超过上限。",
      error_author_count: "作者数量超过上限。", error_too_long: "文本超过长度上限。",
      error_id: "条目 ID 无效。", error_type: "条目类型无效。", error_library: "文献库结构无效。",
      error_json: "JSON 无效。", error_duplicate_key: "JSON 含重复键。",
      error_forbidden: "JSON 含不允许的对象键。", error_json_large: "JSON 超过 1 MiB。",
      error_json_complex: "JSON 结构过深或过于复杂。", error_generic: "数据无效。",
      error_date_year: "日期必须包含有效的年份。", error_date_month: "填写日之前需要先填写月份。",
      error_author_empty: "作者至少需要姓、名或机构名之一。",
      error_author_exclusive: "机构作者不能同时包含个人姓名。",
      error_file_too_large: "文件超过 1 MiB。", error_storage: "本地存储操作失败。",
      error_engine: "引用渲染器返回了无效结果。",
      error_engine_content: "渲染器拒绝了这些条目数据。请检查不常见的 Unicode 字符或缺失字段。",
      error_doi_engine: "渲染器不接受这个 DOI 格式。请检查或清空 DOI 后再预览。",
      error_engine_size: "文献表超过导出大小限制。请缩短过长字段或减少条目后重新预览。",
      preview_unsafe: "预览内容无法安全显示，复制和导出仍保持禁用。",
      status_ready: "就绪。", status_changed: "有未预览的更改。",
      session_note: "默认只在当前页面会话中保留；保存到本设备是单独操作。",
      export_note: "导出的库 JSON 只含文献条目，不含草稿、论文信息或模板。",
      word_note: "可下载这份独立参考文献表的 Word 文件；论文和文中引用不会被改动。",
      preview_note: "每次修改条目或样式后都需要重新预览，复制/导出会在刷新前禁用。",
      warning_note: "提醒不会阻止预览。", error_note: "请修正后再预览。",
      import_note: "导入只替换文献库；当前草稿、论文信息和生成结果保持不变。",
      replace_note: "替换前会保留一份撤销快照。",
    },
    en: {
      assistant: "Reference assistant",
      summary_hint: "Build a standalone MLA 9 or APA 7 reference list locally.",
      scope: "This creates an independent reference list only. Your paper, paper details and in-text citations are not rewritten. Currently MLA 9 and APA 7 only.",
      add: "Add entry",
      entries: "Entries",
      entries_count: "{count} entries",
      empty_library: "No entries yet. Add a book, journal article or webpage.",
      untitled: "Untitled entry",
      editor: "Edit entry",
      no_selection: "Select an entry on the left or add a new one.",
      type: "Type", type_book: "Book", type_article: "Journal article", type_webpage: "Webpage",
      title: "Title", authors: "Authors",
      author_person: "Person", author_literal: "Organization / group",
      family: "Family name", given: "Given name", literal: "Organization name",
      add_author: "Add author", remove_author: "Remove this author", move_up: "Move up", move_down: "Move down",
      issued: "Publication date", accessed: "Access date",
      year: "Year", month: "Month", day: "Day",
      publisher: "Publisher", container: "Journal / site name", volume: "Volume", issue: "Issue", page: "Pages",
      edition: "Edition", doi: "DOI", url: "URL", language: "Language",
      original_text: "Original content (read-only)", original_hint: "Original content stored on import; it is never rewritten as an editable field.",
      optional: "Optional",
      delete_entry: "Delete entry",
      undo: "Undo", undo_remove: "Undo removal", undo_library: "Undo replacement", undo_applied: "Undone.",
      style: "Style", style_mla: "MLA 9", style_apa: "APA 7",
      style_scope: "Preview applies only to this independent list, not to citations in your paper.",
      preview: "Preview bibliography", preview_busy: "Building preview…", preview_stale: "Inputs or style changed. Preview again.",
      preview_required: "Add entries, then choose Preview bibliography.", preview_error: "Preview failed. Please try again.",
      engine_missing: "The citation renderer is not loaded, so preview is unavailable.", model_missing: "The citation data module is not loaded.",
      preview_ready: "Preview updated.",
      copy_text: "Copy plain text", copy_rich: "Copy formatted text", copy_json: "Copy library JSON",
      download_json: "Download library JSON", download_html: "Download HTML", download_word: "Download Word reference list",
      word_busy: "Preparing Word reference list…", word_error: "The Word reference list could not be created.",
      word_cancel: "Cancel Word generation", word_cancelled: "Word generation cancelled. Entries and preview are kept.",
      word_ready: "The Word reference list is ready.", copied: "Copied.", copy_failed: "Could not copy. Select the text manually.",
      copy_manual: "Content selected. Use your system's copy action.", json_copied: "Library JSON copied.",
      import_export: "Import / export",
      import_library_json: "Import library JSON",
      import_hint: "Paste or choose library JSON. Review before replacing the current library. Drafts and paper details are not read.",
      import_text: "Library JSON", choose_file: "Choose JSON file", review: "Preview import",
      review_import: "Review imported library", review_count: "{count} entries will replace the current library.",
      review_titles: "Entries:", apply_import: "Replace library", cancel: "Cancel",
      import_applied: "Imported and replaced the current library. Use Undo replacement to restore it.", import_invalid: "Invalid library JSON. The current library was not changed.",
      import_stale: "The import text changed. Review it again before replacing the library.",
      file_too_large: "The file exceeds 1 MiB.", invalid_encoding: "The file is not valid UTF-8.",
      library_json: "Library JSON",
      save: "Save library on this device", save_hint: "Saves this citation library only; drafts, paper details and templates are not included.",
      load: "Load saved library", load_hint: "Reads only a library you explicitly saved on this device.",
      remove_saved: "Remove saved library", remove_hint: "Removes the saved copy on this device. The active library is not deleted.",
      saved: "Saved on this device.", unsaved: "Unsaved changes.", not_saved: "Not saved on this device.",
      removed_saved: "Removed the saved copy on this device. The active library is unchanged.",
      download_unavailable: "Downloads are unavailable here; use Copy instead.",
      storage_unavailable: "Local storage is unavailable in this browser.", storage_error: "The local storage operation failed.",
      storage_quota: "There is not enough local storage space to save.",
      warnings: "Warnings", errors: "Needs attention",
      warn_author: "No author entered; some sources legitimately have none.", warn_year: "No publication year entered.",
      warn_publisher: "This book is missing a publisher.", warn_container: "Add the journal or site name.",
      warn_url: "This webpage is missing a URL.", warn_accessed: "This webpage is missing an access date.",
      warn_doi: "This DOI does not match the expected format. Check or clear it before previewing; it is never looked up automatically.",
      more_issues: "… and {count} more",
      error_title: "A title is required.", error_date: "Enter a valid date. Partial dates are allowed.",
      error_url: "Enter a valid http(s) URL.", error_control: "Remove control characters.",
      error_unicode: "The text contains invalid Unicode surrogate characters.", error_text: "Text is expected here.",
      error_author: "Author information is invalid.", error_unknown: "An unknown field is present.",
      error_schema: "This is not a FormCapy citation library.", error_version: "This library version is not supported.",
      error_duplicate: "An entry ID is duplicated.", error_too_many: "There are too many entries.",
      error_author_count: "There are too many authors.", error_too_long: "The text exceeds the length limit.",
      error_id: "The entry ID is invalid.", error_type: "The entry type is invalid.", error_library: "The library structure is invalid.",
      error_json: "The JSON is invalid.", error_duplicate_key: "The JSON contains a duplicate key.",
      error_forbidden: "The JSON contains a forbidden object key.", error_json_large: "The JSON exceeds 1 MiB.",
      error_json_complex: "The JSON is nested too deeply or is too complex.", error_generic: "The data is invalid.",
      error_date_year: "The date must include a valid year.", error_date_month: "A month is required before a day.",
      error_author_empty: "An author needs a family name, given name or organization.",
      error_author_exclusive: "An organization author cannot also contain personal names.",
      error_file_too_large: "The file exceeds 1 MiB.", error_storage: "The local storage operation failed.",
      error_engine: "The citation renderer returned an invalid result.",
      error_engine_content: "The renderer rejected these entry records. Check unusual Unicode characters or missing fields.",
      error_doi_engine: "The renderer rejected this DOI format. Check or clear the DOI before previewing.",
      error_engine_size: "The reference list exceeds the export size limit. Shorten very long fields or use fewer entries, then preview again.",
      preview_unsafe: "The preview could not be displayed safely. Copy and export remain disabled.",
      status_ready: "Ready.", status_changed: "Changes have not been previewed.",
      session_note: "By default this library lives only in this page session; saving to this device is a separate action.",
      export_note: "Exported library JSON contains citation entries only, not drafts, paper details or templates.",
      word_note: "Download the independent reference list for Word. Your paper and in-text citations stay untouched.",
      preview_note: "Preview again after changing entries or style. Copy and export stay disabled until the preview is refreshed.",
      warning_note: "Warnings do not block preview.", error_note: "Fix these before previewing.",
      import_note: "Import replaces only the citation library; the current draft, paper details and generated results stay unchanged.",
      replace_note: "An undo snapshot is kept before replacement.",
    },
    es: {
      assistant: "Asistente de referencias",
      summary_hint: "Crea localmente una lista de referencias MLA 9 o APA 7 independiente.",
      scope: "Solo crea una lista de referencias independiente. No reescribe el trabajo, los datos del trabajo ni las citas del texto. Por ahora, solo MLA 9 y APA 7.",
      add: "Añadir entrada",
      entries: "Entradas",
      entries_count: "{count} entradas",
      empty_library: "Aún no hay entradas. Añade un libro, un artículo de revista o una página web.",
      untitled: "Entrada sin título",
      editor: "Editar entrada",
      no_selection: "Selecciona una entrada a la izquierda o añade una nueva.",
      type: "Tipo", type_book: "Libro", type_article: "Artículo de revista", type_webpage: "Página web",
      title: "Título", authors: "Autores",
      author_person: "Persona", author_literal: "Organización / grupo",
      family: "Apellido", given: "Nombre", literal: "Nombre de la organización",
      add_author: "Añadir autor", remove_author: "Eliminar este autor", move_up: "Subir", move_down: "Bajar",
      issued: "Fecha de publicación", accessed: "Fecha de acceso",
      year: "Año", month: "Mes", day: "Día",
      publisher: "Editorial", container: "Revista / sitio", volume: "Volumen", issue: "Número", page: "Páginas",
      edition: "Edición", doi: "DOI", url: "URL", language: "Idioma",
      original_text: "Contenido original (solo lectura)", original_hint: "Contenido original guardado al importar; nunca se reescribe como campo editable.",
      optional: "Opcional",
      delete_entry: "Eliminar entrada",
      undo: "Deshacer", undo_remove: "Deshacer eliminación", undo_library: "Deshacer reemplazo", undo_applied: "Deshecho.",
      style: "Estilo", style_mla: "MLA 9", style_apa: "APA 7",
      style_scope: "La vista previa solo afecta a esta lista independiente, no a las citas del trabajo.",
      preview: "Previsualizar bibliografía", preview_busy: "Creando vista previa…", preview_stale: "Los datos o el estilo cambiaron. Vuelve a previsualizar.",
      preview_required: "Añade entradas y elige Previsualizar bibliografía.", preview_error: "No se pudo crear la vista previa. Inténtalo de nuevo.",
      engine_missing: "El motor de citas no está cargado; no se puede previsualizar.", model_missing: "El módulo de datos de citas no está cargado.",
      preview_ready: "Vista previa actualizada.",
      copy_text: "Copiar texto sin formato", copy_rich: "Copiar texto con formato", copy_json: "Copiar JSON de la biblioteca",
      download_json: "Descargar JSON de la biblioteca", download_html: "Descargar HTML", download_word: "Descargar lista Word",
      word_busy: "Preparando la lista Word…", word_error: "No se pudo crear la lista Word.",
      word_cancel: "Cancelar generación Word", word_cancelled: "Generación Word cancelada. Se conservan las entradas y la vista previa.",
      word_ready: "La lista Word está lista.", copied: "Copiado.", copy_failed: "No se pudo copiar. Selecciona el texto manualmente.",
      copy_manual: "Contenido seleccionado. Usa la acción Copiar del sistema.", json_copied: "JSON de la biblioteca copiado.",
      import_export: "Importar / exportar",
      import_library_json: "Importar biblioteca JSON",
      import_hint: "Pega o elige un JSON de biblioteca. Revísalo antes de sustituir la biblioteca actual. No se leen borradores ni datos del trabajo.",
      import_text: "JSON de la biblioteca", choose_file: "Elegir archivo JSON", review: "Revisar importación",
      review_import: "Revisar biblioteca importada", review_count: "{count} entradas sustituirán la biblioteca actual.",
      review_titles: "Entradas:", apply_import: "Sustituir biblioteca", cancel: "Cancelar",
      import_applied: "Biblioteca importada y sustituida. Usa Deshacer reemplazo para restaurarla.", import_invalid: "JSON de biblioteca no válido. La biblioteca actual no cambió.",
      import_stale: "El texto de importación cambió. Revísalo de nuevo antes de sustituir la biblioteca.",
      file_too_large: "El archivo supera 1 MiB.", invalid_encoding: "El archivo no es UTF-8 válido.",
      library_json: "JSON de la biblioteca",
      save: "Guardar biblioteca en este dispositivo", save_hint: "Guarda solo esta biblioteca; no incluye borradores, datos del trabajo ni plantillas.",
      load: "Cargar biblioteca guardada", load_hint: "Solo lee una biblioteca que hayas guardado explícitamente en este dispositivo.",
      remove_saved: "Eliminar biblioteca guardada", remove_hint: "Elimina la copia guardada en este dispositivo. La biblioteca activa no se borra.",
      saved: "Guardada en este dispositivo.", unsaved: "Hay cambios sin guardar.", not_saved: "Aún no se ha guardado en este dispositivo.",
      removed_saved: "Se eliminó la copia guardada en este dispositivo. La biblioteca activa no cambió.",
      download_unavailable: "Las descargas no están disponibles aquí; usa Copiar.",
      storage_unavailable: "El almacenamiento local no está disponible en este navegador.", storage_error: "La operación de almacenamiento local falló.",
      storage_quota: "No hay espacio suficiente en el almacenamiento local para guardar.",
      warnings: "Avisos", errors: "Requiere corrección",
      warn_author: "No hay autor; algunas fuentes pueden no tenerlo.", warn_year: "No hay año de publicación.",
      warn_publisher: "Falta la editorial de este libro.", warn_container: "Añade el nombre de la revista o del sitio.",
      warn_url: "Falta la URL de esta página web.", warn_accessed: "Falta la fecha de acceso de esta página web.",
      warn_doi: "Este DOI no tiene el formato esperado. Revísalo o bórralo antes de previsualizar; nunca se consulta automáticamente.",
      more_issues: "… y {count} más",
      error_title: "El título es obligatorio.", error_date: "Introduce una fecha válida. Se permiten fechas parciales.",
      error_url: "Introduce una URL http(s) válida.", error_control: "Elimina los caracteres de control.",
      error_unicode: "El texto contiene sustitutos Unicode no válidos.", error_text: "Aquí se esperaba texto.",
      error_author: "Los datos del autor no son válidos.", error_unknown: "Hay un campo desconocido.",
      error_schema: "Esto no es una biblioteca de citas de FormCapy.", error_version: "Esta versión de biblioteca no es compatible.",
      error_duplicate: "Hay un ID de entrada duplicado.", error_too_many: "Hay demasiadas entradas.",
      error_author_count: "Hay demasiados autores.", error_too_long: "El texto supera el límite de longitud.",
      error_id: "El ID de la entrada no es válido.", error_type: "El tipo de entrada no es válido.", error_library: "La estructura de la biblioteca no es válida.",
      error_json: "El JSON no es válido.", error_duplicate_key: "El JSON contiene una clave duplicada.",
      error_forbidden: "El JSON contiene una clave de objeto no permitida.", error_json_large: "El JSON supera 1 MiB.",
      error_json_complex: "El JSON está demasiado anidado o es demasiado complejo.", error_generic: "Los datos no son válidos.",
      error_date_year: "La fecha debe incluir un año válido.", error_date_month: "Hace falta un mes antes del día.",
      error_author_empty: "Un autor necesita apellido, nombre u organización.",
      error_author_exclusive: "Un autor de organización no puede contener nombres personales.",
      error_file_too_large: "El archivo supera 1 MiB.", error_storage: "La operación de almacenamiento local falló.",
      error_engine: "El motor de citas devolvió un resultado no válido.",
      error_engine_content: "El motor rechazó estos datos. Revisa caracteres Unicode poco habituales o campos ausentes.",
      error_doi_engine: "El motor rechazó este formato de DOI. Revisa o borra el DOI antes de previsualizar.",
      error_engine_size: "La lista supera el límite de exportación. Acorta los campos muy largos o reduce las entradas y vuelve a previsualizar.",
      preview_unsafe: "La vista previa no se pudo mostrar de forma segura. Copiar y exportar siguen desactivados.",
      status_ready: "Listo.", status_changed: "Hay cambios sin previsualizar.",
      session_note: "Por defecto, la biblioteca solo existe en esta sesión de página; guardarla en el dispositivo es una acción aparte.",
      export_note: "El JSON exportado contiene solo entradas de citas, no borradores, datos del trabajo ni plantillas.",
      word_note: "Descarga la lista de referencias independiente en Word. El trabajo y las citas del texto no cambian.",
      preview_note: "Vuelve a previsualizar después de cambiar entradas o estilo. Copiar y exportar permanecen desactivados hasta refrescar la vista previa.",
      warning_note: "Los avisos no impiden la vista previa.", error_note: "Corrige esto antes de previsualizar.",
      import_note: "La importación solo sustituye la biblioteca de citas; el borrador, los datos del trabajo y los resultados generados no cambian.",
      replace_note: "Se guarda una instantánea para deshacer antes de sustituir.",
    },
  };

  const fieldLabelKeys = {
    id: "id", type: "type", title: "title", authors: "authors", issued: "issued",
    accessed: "accessed", publisher: "publisher", containerTitle: "container",
    volume: "volume", issue: "issue", page: "page", edition: "edition",
    DOI: "doi", URL: "url", language: "language", originalText: "original_text",
    family: "family", given: "given", literal: "literal", year: "year",
    month: "month", day: "day",
  };
  const errorKeys = {
    title_required: "error_title", date_invalid: "error_date", date_year_required: "error_date_year",
    date_month_required: "error_date_month", url_invalid: "error_url",
    control_character: "error_control", invalid_unicode: "error_unicode",
    expected_text: "error_text", text_too_long: "error_too_long",
    author_invalid: "error_author", author_empty: "error_author_empty",
    author_literal_exclusive: "error_author_exclusive", authors_invalid: "error_author",
    too_many_authors: "error_author_count", unknown_field: "error_unknown",
    schema_invalid: "error_schema", version_unsupported: "error_version",
    duplicate_id: "error_duplicate", too_many_items: "error_too_many",
    item_id_invalid: "error_id", item_type_invalid: "error_type",
    item_invalid: "error_generic", library_invalid: "error_library",
    library_items_invalid: "error_library", json_too_large: "error_json_large",
    duplicate_key: "error_duplicate_key", forbidden_key: "error_forbidden",
    json_too_deep: "error_json_complex", json_too_complex: "error_json_complex",
    json_invalid: "error_json", json_unexpected_end: "error_json",
    json_control_character: "error_json", json_invalid_escape: "error_json",
    json_unterminated_string: "error_json", json_number_invalid: "error_json",
    json_key_expected: "error_json", json_colon_expected: "error_json",
    json_comma_expected: "error_json", json_unterminated_object: "error_json",
    json_unterminated_array: "error_json", json_string_expected: "error_json",
    json_unexpected_character: "error_json", json_trailing_content: "error_json",
  };

  const warningKeys = {
    author_missing: "warn_author", year_missing: "warn_year",
    publisher_missing: "warn_publisher", container_missing: "warn_container",
    url_missing: "warn_url", accessed_missing: "warn_accessed", doi_format: "warn_doi",
  };

  // Intake copy lives together so every new workflow has the same three locales.
  const INTAKE_TEXT = {
    zh: {
      quick_add: "快速添加参考文献", quick_hint: "用 DOI 自动填写，或导入 Zotero、数据库导出的 BibTeX / RIS / CSL JSON。核对后再加入文献库。",
      manual_add: "手动添加", quick_doi: "DOI 自动填写", quick_import: "导入文献", quick_doi_label: "DOI 或 doi.org 链接",
      quick_doi_placeholder: "例如 10.1234/example 或 https://doi.org/…", quick_query: "查询 DOI（联网）", quick_cancel: "取消查询",
      quick_privacy: "只有点击查询才联网：Crossref 会收到这个 DOI 和常规网络请求信息，不会收到文稿、文献库或论文信息。",
      quick_lookup_hint: "自动填写仅使用 Crossref 的公开记录；查不到时可导入数据库记录或手动添加。请核对来源信息。",
      quick_import_hint: "粘贴 BibTeX、RIS 或 CSL JSON，也可选择文件。识别与导入完全在此设备上进行，限 1 MiB、UTF-8。FormCapy 库备份请使用下方“导入文献库 JSON”。",
      quick_text: "粘贴文献记录", quick_format: "文件格式", quick_auto: "自动识别", quick_choose_file: "选择 .bib / .ris / .json / .txt 文件",
      quick_review: "识别并核对", quick_review_title: "核对识别结果", quick_review_hint: "自动记录可能不完整。加入后仍可编辑作者、日期等字段；不会替换已有文献。",
      quick_count: "识别 {count} 条 · 可追加 {added} 条 · 重复 {skipped} 条", quick_append: "追加到文献库（{count} 条）", quick_dismiss: "取消本次添加",
      quick_added: "已追加 {added} 条，跳过 {skipped} 条重复记录；可撤销本次追加。", quick_no_new: "这些记录已在文献库中，没有新增条目。", undo_append: "撤销本次追加",
      quick_busy: "正在向 Crossref 查询这个 DOI…", quick_reading: "正在读取本地文件…", quick_cancelled: "查询已取消。", quick_ready: "已识别，核对后再追加。",
      quick_invalid: "无法识别这些记录；当前文献库未改变。", quick_unavailable: "自动添加模块尚未加载，可继续手动添加。", quick_file_error: "无法读取文件，请重新选择 UTF-8 文本文件。",
      quick_missing_author: "作者待补充", quick_missing_year: "年份待补充", quick_source: "来源", quick_record: "第 {count} 条", quick_problem: "记录中有不能导入的内容，请检查原始记录。",
      quick_warn: "部分信息需要核对。", quick_field_lost: "这个字段未导入，请对照原始记录补充。", quick_macro: "未展开的 BibTeX 宏需要改为实际文本。", quick_type_unsupported: "暂不支持这种文献类型，请选择书籍、期刊文章或网页记录。",
      quick_format_invalid: "记录格式不受支持或与所选格式不符。", quick_csl_expected: "这个入口需要 CSL JSON 记录；FormCapy 库备份请使用下方“导入文献库 JSON”。", quick_empty: "请先输入 DOI 或粘贴文献记录。", quick_doi_invalid: "请输入一个有效 DOI 或 doi.org 链接。",
      quick_not_found: "Crossref 未找到这个 DOI。可检查 DOI，或改用离线导入、手动添加。", quick_network: "无法连接 Crossref。请稍后重试，或使用离线导入。", quick_timeout: "Crossref 查询超时，请稍后重试。", quick_rate: "查询太频繁，请稍等再试。", quick_response: "Crossref 的记录无法安全导入，可改用离线导入或手动添加。",
      quick_detected_format: "识别格式：{format}", quick_original_truncated: "原始内容过长，只保存了前半部分；请保留原文件。", quick_field_conflict: "同一字段有多个不同值，已采用其中一个，请核对。", quick_date_lost: "无法识别日期，请在加入后补充。", quick_date_range: "日期为一个范围，已采用起始日期，请核对。", quick_formatting_lost: "原记录的文字格式未保留，请核对标题文字。", quick_latex: "部分 LaTeX 写法未转换，请核对并修正文字。", quick_directive: "BibTeX 指令未导入，请核对依赖该指令的记录。", quick_authors_incomplete: "作者列表可能不完整，请核对。", quick_type_review: "记录已映射到支持的文献类型，请核对类型。", quick_duplicate_author: "原记录中有重复作者，请核对。", quick_duplicate_skipped: "这条重复记录将跳过。", quick_author_name: "作者姓名的拆分需要核对。",
    },
    en: {
      quick_add: "Quickly add references", quick_hint: "Fill fields from a DOI, or import BibTeX, RIS or CSL JSON from Zotero and research databases. Review before adding to your library.",
      manual_add: "Add manually", quick_doi: "Fill from DOI", quick_import: "Import references", quick_doi_label: "DOI or doi.org link",
      quick_doi_placeholder: "e.g. 10.1234/example or https://doi.org/…", quick_query: "Look up DOI (online)", quick_cancel: "Cancel lookup",
      quick_privacy: "Only Look up connects online: Crossref receives this DOI and normal network request information. Your draft, library and paper details are not sent.",
      quick_lookup_hint: "Automatic filling uses public Crossref records only. If none is found, import a database record or add it manually. Check the source details.",
      quick_import_hint: "Paste BibTeX, RIS or CSL JSON, or choose a file. Detection and import stay on this device. Limit: 1 MiB, UTF-8. For a FormCapy library backup, use Import library JSON below.",
      quick_text: "Paste reference records", quick_format: "Record format", quick_auto: "Detect automatically", quick_choose_file: "Choose a .bib / .ris / .json / .txt file",
      quick_review: "Detect and review", quick_review_title: "Review detected references", quick_review_hint: "Automatic records may be incomplete. You can edit authors, dates and other fields after adding. Existing references are kept.",
      quick_count: "{count} detected · {added} to add · {skipped} duplicates", quick_append: "Add to library ({count})", quick_dismiss: "Dismiss this batch",
      quick_added: "Added {added} and skipped {skipped} duplicates. You can undo this batch.", quick_no_new: "These references are already in your library. Nothing was added.", undo_append: "Undo this batch",
      quick_busy: "Looking up this DOI with Crossref…", quick_reading: "Reading the local file…", quick_cancelled: "Lookup cancelled.", quick_ready: "References detected. Review before adding.",
      quick_invalid: "These records could not be read. Your library is unchanged.", quick_unavailable: "Automatic adding is not loaded. You can still add manually.", quick_file_error: "Could not read the file. Choose a UTF-8 text file again.",
      quick_missing_author: "Author needs review", quick_missing_year: "Year needs review", quick_source: "Source", quick_record: "Record {count}", quick_problem: "This record contains content that could not be imported. Check the original record.",
      quick_warn: "Some details need review.", quick_field_lost: "This field was not imported. Check and add it from the original record.", quick_macro: "Replace this unresolved BibTeX macro with its actual text.", quick_type_unsupported: "This source type is not supported. Use a book, journal article or webpage record.",
      quick_format_invalid: "The record format is unsupported or does not match the selected format.", quick_csl_expected: "This entry point needs CSL JSON records. For a FormCapy library backup, use Import library JSON below.", quick_empty: "Enter a DOI or paste reference records first.", quick_doi_invalid: "Enter one valid DOI or doi.org link.",
      quick_not_found: "Crossref has no record for this DOI. Check it, import an offline record or add manually.", quick_network: "Could not connect to Crossref. Try again later or use offline import.", quick_timeout: "The Crossref lookup timed out. Try again later.", quick_rate: "Too many requests. Wait before trying again.", quick_response: "This Crossref record could not be safely imported. Use offline import or add manually.",
      quick_detected_format: "Detected format: {format}", quick_original_truncated: "The original record was too long, so only its beginning is stored. Keep the source file.", quick_field_conflict: "This field had different values. One was chosen; please check it.", quick_date_lost: "The date could not be read. Add it after importing.", quick_date_range: "This date is a range. The starting date was used; please check it.", quick_formatting_lost: "Text formatting in the source record was not preserved. Check the title text.", quick_latex: "Some LaTeX notation was not converted. Check and correct the text.", quick_directive: "A BibTeX directive was not imported. Check any records that depend on it.", quick_authors_incomplete: "The author list may be incomplete. Check it.", quick_type_review: "This record was mapped to a supported source type. Check the type.", quick_duplicate_author: "The source record has duplicate authors. Check them.", quick_duplicate_skipped: "This duplicate record will be skipped.", quick_author_name: "Check how this author's name was split.",
    },
    es: {
      quick_add: "Añadir referencias rápidamente", quick_hint: "Rellena los campos con un DOI o importa BibTeX, RIS o CSL JSON de Zotero y bases bibliográficas. Revisa antes de añadir a la biblioteca.",
      manual_add: "Añadir manualmente", quick_doi: "Rellenar con DOI", quick_import: "Importar referencias", quick_doi_label: "DOI o enlace doi.org",
      quick_doi_placeholder: "p. ej., 10.1234/example o https://doi.org/…", quick_query: "Consultar DOI (en línea)", quick_cancel: "Cancelar consulta",
      quick_privacy: "Solo Consultar se conecta a internet: Crossref recibe este DOI y la información habitual de la solicitud de red. No se envían el borrador, la biblioteca ni los datos del trabajo.",
      quick_lookup_hint: "El rellenado utiliza solo registros públicos de Crossref. Si no hay resultados, importa un registro o añádelo manualmente. Comprueba los datos de la fuente.",
      quick_import_hint: "Pega BibTeX, RIS o CSL JSON, o elige un archivo. La detección y la importación se realizan en este dispositivo. Límite: 1 MiB, UTF-8. Para una copia de FormCapy, usa Importar biblioteca JSON más abajo.",
      quick_text: "Pegar registros bibliográficos", quick_format: "Formato de los registros", quick_auto: "Detectar automáticamente", quick_choose_file: "Elegir archivo .bib / .ris / .json / .txt",
      quick_review: "Detectar y revisar", quick_review_title: "Revisar referencias detectadas", quick_review_hint: "Los registros automáticos pueden estar incompletos. Puedes editar autores, fechas y otros campos después de añadirlos. Se conservan las referencias existentes.",
      quick_count: "{count} detectadas · {added} para añadir · {skipped} duplicadas", quick_append: "Añadir a la biblioteca ({count})", quick_dismiss: "Descartar este lote",
      quick_added: "Se añadieron {added} y se omitieron {skipped} duplicadas. Puedes deshacer este lote.", quick_no_new: "Estas referencias ya están en la biblioteca. No se añadió ninguna.", undo_append: "Deshacer este lote",
      quick_busy: "Consultando este DOI en Crossref…", quick_reading: "Leyendo el archivo local…", quick_cancelled: "Consulta cancelada.", quick_ready: "Referencias detectadas. Revísalas antes de añadirlas.",
      quick_invalid: "No se pudieron leer los registros. La biblioteca no cambió.", quick_unavailable: "El módulo automático no está cargado. Puedes añadir manualmente.", quick_file_error: "No se pudo leer el archivo. Elige de nuevo un archivo de texto UTF-8.",
      quick_missing_author: "Revisar autor", quick_missing_year: "Revisar año", quick_source: "Fuente", quick_record: "Registro {count}", quick_problem: "El registro contiene datos que no se pudieron importar. Comprueba el registro original.",
      quick_warn: "Hay datos que requieren revisión.", quick_field_lost: "Este campo no se importó. Compruébalo y añádelo desde el registro original.", quick_macro: "Sustituye esta macro BibTeX sin resolver por su texto real.", quick_type_unsupported: "Este tipo de fuente no es compatible. Usa un libro, un artículo de revista o una página web.",
      quick_format_invalid: "El formato no es compatible o no coincide con el seleccionado.", quick_csl_expected: "Este apartado necesita registros CSL JSON. Para una copia de biblioteca FormCapy, usa Importar biblioteca JSON más abajo.", quick_empty: "Introduce un DOI o pega registros bibliográficos primero.", quick_doi_invalid: "Introduce un DOI válido o un enlace doi.org.",
      quick_not_found: "Crossref no encontró este DOI. Revísalo, importa un registro sin conexión o añádelo manualmente.", quick_network: "No se pudo conectar con Crossref. Inténtalo más tarde o importa sin conexión.", quick_timeout: "La consulta de Crossref agotó el tiempo. Inténtalo más tarde.", quick_rate: "Demasiadas consultas. Espera antes de intentarlo de nuevo.", quick_response: "No se pudo importar este registro de Crossref de forma segura. Importa sin conexión o añade manualmente.",
      quick_detected_format: "Formato detectado: {format}", quick_original_truncated: "El registro original era demasiado largo; solo se guarda el principio. Conserva el archivo original.", quick_field_conflict: "Este campo tenía valores diferentes. Se eligió uno; compruébalo.", quick_date_lost: "No se pudo leer la fecha. Añádela después de importar.", quick_date_range: "La fecha es un intervalo. Se usó la fecha inicial; compruébala.", quick_formatting_lost: "No se conservó el formato de texto del registro. Comprueba el título.", quick_latex: "Parte de la notación LaTeX no se convirtió. Comprueba y corrige el texto.", quick_directive: "No se importó una directiva BibTeX. Comprueba los registros que dependen de ella.", quick_authors_incomplete: "La lista de autores puede estar incompleta. Compruébala.", quick_type_review: "El registro se asignó a un tipo de fuente compatible. Comprueba el tipo.", quick_duplicate_author: "El registro contiene autores duplicados. Compruébalos.", quick_duplicate_skipped: "Se omitirá este registro duplicado.", quick_author_name: "Comprueba cómo se dividió el nombre de este autor.",
    },
  };
  for (const language of Object.keys(INTAKE_TEXT)) Object.assign(TEXT[language], INTAKE_TEXT[language]);
  const BATCH_TEXT = {
    zh: {
      batch_doi_label: "DOI 或 doi.org 链接（一行一个，最多 50 条）", batch_placeholder: "10.1234/example-one\nhttps://doi.org/10.1234/example-two",
      batch_hint: "一行一条，按顺序查询，最多 50 条、32 KiB。无效和重复行不会联网；失败不会丢掉已查到的记录。",
      batch_privacy: "只有点击查询才联网：逐个向 Crossref 发送本次列表中的有效 DOI 及常规网络请求信息，不发送文稿、文献库或论文信息。不会自动重试。",
      batch_rows: "逐行查询状态", batch_line: "第 {line} 行", batch_ready: "等待查询", batch_unqueried: "未查询", batch_running: "查询中", batch_success: "已找到", batch_failed: "查询失败", batch_invalid: "无效 DOI", batch_duplicate: "重复行（同第 {line} 行）", batch_cancelled_row: "未查询 / 已取消",
      batch_progress: "顺序查询：完成 {completed}/{total} · 成功 {succeeded} · 失败 {failed}", batch_current: "当前队列：第 {line} 行", batch_cancel: "取消批量查询",
      batch_done: "本次查询完成：找到 {succeeded} 条，失败 {failed} 条。核对并选择要追加的记录。", batch_cancelled: "已取消；保留 {succeeded} 条已完成结果，未完成的不会再加入。",
      batch_rate_limited: "Crossref 要求稍后再查，本批已停止。已找到 {succeeded} 条可继续核对；请稍后手动重新查询，不会自动重试。",
      batch_invalid_input: "没有开始查询，请检查逐行状态和输入限制。", batch_limit: "最多输入 50 条非空 DOI，文本不超过 32 KiB。", batch_no_valid: "没有可查询的有效 DOI。请检查逐行状态。",
      select_record: "选择：{title}", select_all: "全选", select_none: "全不选", quick_count: "识别 {count} 条 · 已选 {selected} 条 · 可追加 {added} 条 · 重复 {skipped} 条",
      select_hint: "仅追加勾选的条目；按 DOI 或保守的书目信息去重。", batch_lookup_invalid: "查询模块返回的数据无效。已完成的成功记录仍可核对。",
    },
    en: {
      batch_doi_label: "DOIs or doi.org links (one per line, up to 50)", batch_placeholder: "10.1234/example-one\nhttps://doi.org/10.1234/example-two",
      batch_hint: "One per line, queried in order. Up to 50 entries and 32 KiB. Invalid and duplicate lines are not queried; failures keep earlier successful records.",
      batch_privacy: "Only Look up connects online: valid DOIs in this list and normal request information are sent individually to Crossref. Drafts, your library and paper details are not sent. No automatic retries.",
      batch_rows: "Lookup status by line", batch_line: "Line {line}", batch_ready: "Waiting", batch_unqueried: "Not queried", batch_running: "Looking up", batch_success: "Found", batch_failed: "Lookup failed", batch_invalid: "Invalid DOI", batch_duplicate: "Duplicate of line {line}", batch_cancelled_row: "Not queried / cancelled",
      batch_progress: "Sequential lookup: {completed}/{total} completed · {succeeded} found · {failed} failed", batch_current: "Current queue item: line {line}", batch_cancel: "Cancel batch",
      batch_done: "Lookup finished: {succeeded} found and {failed} failed. Review and select the records to add.", batch_cancelled: "Cancelled. Kept {succeeded} completed results; unfinished results will not be added.",
      batch_rate_limited: "Crossref requested a pause, so this batch stopped. You can review {succeeded} completed results. Try again manually later; there are no automatic retries.",
      batch_invalid_input: "No lookup started. Check the line statuses and input limits.", batch_limit: "Enter no more than 50 nonempty DOI lines and 32 KiB of text.", batch_no_valid: "There are no valid DOIs to look up. Check the line statuses.",
      select_record: "Select: {title}", select_all: "Select all", select_none: "Select none", quick_count: "{count} detected · {selected} selected · {added} to add · {skipped} duplicates",
      select_hint: "Only checked records are added. Duplicates are detected using DOI or a conservative match of source details.", batch_lookup_invalid: "The lookup module returned invalid data. Completed successful records are still available to review.",
    },
    es: {
      batch_doi_label: "DOI o enlaces doi.org (uno por línea, hasta 50)", batch_placeholder: "10.1234/example-one\nhttps://doi.org/10.1234/example-two",
      batch_hint: "Uno por línea, consultados en orden. Máximo 50 entradas y 32 KiB. No se consultan las líneas no válidas ni duplicadas; los fallos conservan los registros encontrados.",
      batch_privacy: "Solo Consultar se conecta a internet: los DOI válidos de esta lista y la información habitual de la solicitud se envían individualmente a Crossref. No se envían borradores, biblioteca ni datos del trabajo. No hay reintentos automáticos.",
      batch_rows: "Estado de consulta por línea", batch_line: "Línea {line}", batch_ready: "En espera", batch_unqueried: "Sin consultar", batch_running: "Consultando", batch_success: "Encontrado", batch_failed: "Consulta fallida", batch_invalid: "DOI no válido", batch_duplicate: "Duplicado de la línea {line}", batch_cancelled_row: "Sin consultar / cancelado",
      batch_progress: "Consulta en orden: {completed}/{total} completadas · {succeeded} encontradas · {failed} fallidas", batch_current: "Registro actual en cola: línea {line}", batch_cancel: "Cancelar lote",
      batch_done: "Consulta terminada: {succeeded} encontradas y {failed} fallidas. Revisa y selecciona los registros que añadir.", batch_cancelled: "Cancelado. Se conservan {succeeded} resultados completados; no se añadirán resultados pendientes.",
      batch_rate_limited: "Crossref pidió esperar; el lote se detuvo. Puedes revisar {succeeded} resultados completados. Vuelve a consultar manualmente más tarde; no hay reintentos automáticos.",
      batch_invalid_input: "No se inició la consulta. Revisa los estados de las líneas y los límites.", batch_limit: "Introduce como máximo 50 líneas DOI no vacías y 32 KiB de texto.", batch_no_valid: "No hay DOI válidos que consultar. Revisa los estados de las líneas.",
      select_record: "Seleccionar: {title}", select_all: "Seleccionar todas", select_none: "No seleccionar ninguna", quick_count: "{count} detectadas · {selected} seleccionadas · {added} para añadir · {skipped} duplicadas",
      select_hint: "Solo se añaden los registros marcados. Los duplicados se detectan por DOI o una coincidencia conservadora de los datos bibliográficos.", batch_lookup_invalid: "El módulo de consulta devolvió datos no válidos. Los registros ya encontrados se pueden revisar.",
    },
  };
  for (const language of Object.keys(BATCH_TEXT)) Object.assign(TEXT[language], BATCH_TEXT[language]);

  const MANAGEMENT_TEXT = {
    zh: {
      library_search: "搜索文献", library_search_hint: "标题、作者、来源、DOI、网址或年份；多个词需同时匹配。",
      library_type: "筛选类型", library_all_types: "全部类型", library_matches: "显示 {visible} / {total} 条",
      library_no_matches: "没有匹配的条目。可以调整搜索词或清除筛选。", library_clear: "清除筛选",
      library_hidden_selection: "当前编辑的条目不在筛选结果中；编辑内容和文献表预览保持不变。",
      portable_title: "导出到其他工具", portable_hint: "导出书目元数据，完全在本设备完成。原文对照不包含在通用格式中；完整备份请使用“下载库 JSON”。",
      portable_format: "通用格式", portable_scope: "导出范围", portable_all: "全部文献（{count} 条）", portable_filtered: "当前筛选（{count} 条）",
      portable_bibtex: "BibLaTeX / BibTeX（.bib）", portable_format_hint: "CSL-JSON 最完整地保留当前书目字段。.bib 中的网页条目需要支持 BibLaTeX 的工具；RIS 的机构作者等字段需要核对。",
      portable_preview: "预览导出", portable_copy: "复制导出内容", portable_download: "下载导出文件", portable_text: "通用格式导出内容（只读）",
      portable_ready: "已准备 {count} 条 {format} 记录。核对提醒后再复制或下载。", portable_empty: "这个范围内没有条目。",
      portable_stale: "文献或导出范围已改变，请重新预览导出。", portable_unavailable: "通用导出模块尚未加载；仍可下载 FormCapy 库 JSON。",
      portable_invalid: "无法导出这些记录，请检查字段和提醒；当前文献库未改变。", portable_large: "导出内容超过 1 MiB；减少条目或缩短字段后重试。",
      portable_original_omitted: "原文对照未放入通用格式；请另存 FormCapy 库 JSON 以完整备份。", portable_loss: "这种格式无法完整表示部分字段，请核对，或选用 CSL-JSON。",
      portable_original_summary: "已省略 {count} 条文献的原文对照；完整备份请使用“下载库 JSON”。",
      portable_author_review: "这种格式中的作者姓名或机构作者可能存在歧义，请在目标工具中核对。", portable_issue: "这个字段在所选格式中需要核对。",
      portable_whitespace: "所选格式会规范化这个字段中的空白，请核对。", portable_special_text: "特殊字符在不同工具中可能显示不同；请核对或选用 CSL-JSON。",
      portable_copied: "已复制当前导出内容。", portable_downloaded: "已下载当前导出文件。", portable_manual: "自动复制不可用，已选中下方内容，请手动复制。",
    },
    en: {
      library_search: "Search references", library_search_hint: "Title, authors, source, DOI, URL or year; all search words must match.",
      library_type: "Filter by type", library_all_types: "All types", library_matches: "Showing {visible} / {total} references",
      library_no_matches: "No matching references. Change the search or clear the filters.", library_clear: "Clear filters",
      library_hidden_selection: "The entry being edited is outside these filters. Its contents and bibliography preview are kept.",
      portable_title: "Export to other tools", portable_hint: "Export bibliography metadata on this device. Comparison text is omitted from portable formats; use Download library JSON for a full backup.",
      portable_format: "Portable format", portable_scope: "Export scope", portable_all: "All references ({count})", portable_filtered: "Current filters ({count})",
      portable_bibtex: "BibLaTeX / BibTeX (.bib)", portable_format_hint: "CSL-JSON preserves the current bibliography fields most faithfully. Webpage records in .bib need a BibLaTeX-compatible tool; check organization authors and other ambiguous fields in RIS.",
      portable_preview: "Preview export", portable_copy: "Copy export", portable_download: "Download export", portable_text: "Portable export contents (read-only)",
      portable_ready: "Prepared {count} {format} records. Review the notices before copying or downloading.", portable_empty: "There are no references in this scope.",
      portable_stale: "References or export scope changed. Preview the export again.", portable_unavailable: "Portable export is not loaded. You can still download FormCapy library JSON.",
      portable_invalid: "These records could not be exported. Check their fields and notices; the library is unchanged.", portable_large: "The export exceeds 1 MiB. Use fewer references or shorter fields and try again.",
      portable_original_omitted: "Comparison text is omitted from this format. Keep a FormCapy library JSON for a full backup.", portable_loss: "This format cannot represent every field faithfully. Check it or choose CSL-JSON.",
      portable_original_summary: "Comparison text was omitted for {count} references. Use Download library JSON for a full backup.",
      portable_author_review: "Author parts or organization authors may be ambiguous in this format. Check them in the destination tool.", portable_issue: "Review this field in the selected format.",
      portable_whitespace: "Whitespace in this field will be normalized. Check it in the exported record.", portable_special_text: "Special characters may display differently between tools. Check them or choose CSL-JSON.",
      portable_copied: "Current export copied.", portable_downloaded: "Current export downloaded.", portable_manual: "Automatic copying is unavailable. The contents below are selected for manual copying.",
    },
    es: {
      library_search: "Buscar referencias", library_search_hint: "Título, autores, fuente, DOI, URL o año; deben coincidir todas las palabras.",
      library_type: "Filtrar por tipo", library_all_types: "Todos los tipos", library_matches: "Mostrando {visible} / {total} referencias",
      library_no_matches: "No hay referencias coincidentes. Cambia la búsqueda o borra los filtros.", library_clear: "Borrar filtros",
      library_hidden_selection: "La entrada que editas queda fuera de estos filtros. Se conservan su contenido y la vista previa de la bibliografía.",
      portable_title: "Exportar a otras herramientas", portable_hint: "Exporta metadatos bibliográficos en este dispositivo. El texto de comparación se omite; usa Descargar JSON de la biblioteca para una copia completa.",
      portable_format: "Formato de intercambio", portable_scope: "Alcance de exportación", portable_all: "Todas las referencias ({count})", portable_filtered: "Filtros actuales ({count})",
      portable_bibtex: "BibLaTeX / BibTeX (.bib)", portable_format_hint: "CSL-JSON conserva los campos bibliográficos con mayor fidelidad. Las páginas web en .bib necesitan una herramienta compatible con BibLaTeX; revisa los autores de organización y otros campos ambiguos de RIS.",
      portable_preview: "Previsualizar exportación", portable_copy: "Copiar exportación", portable_download: "Descargar exportación", portable_text: "Contenido exportado (solo lectura)",
      portable_ready: "Preparadas {count} referencias {format}. Revisa los avisos antes de copiar o descargar.", portable_empty: "No hay referencias en este alcance.",
      portable_stale: "Las referencias o el alcance cambiaron. Previsualiza la exportación otra vez.", portable_unavailable: "La exportación de intercambio no está cargada. Puedes descargar el JSON de FormCapy.",
      portable_invalid: "No se pudieron exportar estos registros. Revisa campos y avisos; la biblioteca no cambia.", portable_large: "La exportación supera 1 MiB. Reduce las referencias o acorta los campos y vuelve a intentarlo.",
      portable_original_omitted: "El texto de comparación se omite. Guarda el JSON de FormCapy para una copia completa.", portable_loss: "Este formato no conserva todos los campos con fidelidad. Revísalo o elige CSL-JSON.",
      portable_original_summary: "Se omitió el texto de comparación de {count} referencias. Descarga el JSON de la biblioteca para una copia completa.",
      portable_author_review: "Los nombres personales o de organización pueden ser ambiguos en este formato. Revísalos en la herramienta de destino.", portable_issue: "Revisa este campo en el formato seleccionado.",
      portable_whitespace: "Se normalizarán los espacios de este campo. Revisa el registro exportado.", portable_special_text: "Los caracteres especiales pueden mostrarse de forma distinta entre herramientas. Revísalos o elige CSL-JSON.",
      portable_copied: "Exportación actual copiada.", portable_downloaded: "Exportación actual descargada.", portable_manual: "No se puede copiar automáticamente. El contenido de abajo está seleccionado para copiarlo manualmente.",
    },
  };
  for (const language of Object.keys(MANAGEMENT_TEXT)) Object.assign(TEXT[language], MANAGEMENT_TEXT[language]);
  const PORTABLE_FORMATS = Object.freeze({
    "csl-json": { label: "CSL-JSON", filename: "formcapy-references.csl.json", mime: "application/vnd.citationstyles.csl+json" },
    ris: { label: "RIS", filename: "formcapy-references.ris", mime: "application/x-research-info-systems" },
    bibtex: { label: "BibLaTeX / BibTeX", filename: "formcapy-references.bib", mime: "application/x-bibtex" },
  });

  const intakeIssueKeys = {
    doi_invalid: "quick_doi_invalid", lookup_busy: "quick_rate", lookup_rate_limited: "quick_rate",
    lookup_not_found: "quick_not_found", lookup_network: "quick_network", lookup_timeout: "quick_timeout",
    lookup_response_large: "quick_response", lookup_response_invalid: "quick_response",
    lookup_type_unsupported: "quick_type_unsupported", lookup_metadata_invalid: "quick_response",
    lookup_cancelled: "quick_cancelled", metadata_incomplete: "quick_warn",
    metadata_markup_removed: "quick_warn", metadata_fields_omitted: "quick_field_lost",
    field_not_imported: "quick_field_lost", type_unsupported: "quick_type_unsupported",
    bibtex_macro_unsupported: "quick_macro", format_unsupported: "quick_format_invalid",
    format_invalid: "quick_format_invalid", input_empty: "quick_empty",
    input_too_large: "error_file_too_large", file_too_large: "error_file_too_large",
    original_text_truncated: "quick_original_truncated", field_conflict: "quick_field_conflict",
    date_not_imported: "quick_date_lost", date_range_first_only: "quick_date_range",
    formatting_not_imported: "quick_formatting_lost", bibtex_latex_unconverted: "quick_latex",
    bibtex_directive_not_imported: "quick_directive", authors_incomplete: "quick_authors_incomplete",
    type_review: "quick_type_review", duplicate_author: "quick_duplicate_author",
    duplicate_skipped: "quick_duplicate_skipped", author_name_review: "quick_author_name",
    model_unavailable: "model_missing", input_too_complex: "error_json_complex",
    input_too_deep: "error_json_complex", no_items: "quick_empty",
    csl_json_expected: "quick_csl_expected", format_unrecognized: "quick_format_invalid",
    bibtex_invalid: "quick_format_invalid", ris_invalid: "quick_format_invalid",
    ris_record_unterminated: "quick_format_invalid", import_invalid: "quick_invalid",
    batch_too_many: "batch_limit", too_many_dois: "batch_limit", batch_input_large: "batch_limit",
    no_valid_dois: "batch_no_valid", batch_input_invalid: "batch_invalid_input",
    batch_lookup_invalid: "batch_lookup_invalid",
    input_invalid: "batch_invalid_input", normalizer_unavailable: "quick_unavailable",
    too_many_lines: "batch_limit", rows_invalid: "batch_invalid_input", lookup_unavailable: "quick_unavailable",
    lookup_items_invalid: "quick_response", lookup_item_invalid: "quick_response",
    lookup_doi_mismatch: "quick_response", lookup_failed: "quick_network",
  };

  function create(options = {}) {
    const mount = options.mount;
    if (!mount || typeof mount.replaceChildren !== "function") {
      throw new TypeError("FormCapyCitationAssistant.create needs a mount element");
    }
    const model = options.model || root.FormCapyCitations;
    const engine = options.engine || root.FormCapyCitationEngine;
    const importer = options.importer === undefined ? root.FormCapyCitationImport : options.importer;
    const lookup = options.lookup === undefined ? root.FormCapyCitationLookup : options.lookup;
    const batch = options.batch === undefined ? root.FormCapyDoiBatch : options.batch;
    const exporter = options.exporter === undefined ? root.FormCapyCitationExport : options.exporter;
    const canPortableExport = Boolean(model && exporter && typeof exporter.exportLibrary === "function");
    const canImport = Boolean(model && importer && typeof importer.parse === "function" && typeof importer.planAppend === "function");
    const canLookup = Boolean(canImport && lookup && typeof lookup.lookup === "function");
    const canBatch = Boolean(canLookup && batch && typeof batch.parse === "function" && typeof batch.run === "function");
    let storage = null;
    try {
      storage = options.storage === undefined ? root.localStorage : options.storage;
    } catch (_) {
      storage = null;
    }
    const allowDownloads = options.allowDownloads !== false;
    const onExportWord = typeof options.onExportWord === "function" ? options.onExportWord : null;
    const getLocale = typeof options.getLocale === "function" ? options.getLocale : () => "en";
    const instanceId = `fc-citations-${++instanceCount}`;
    let locale = readLocale();
    let lastLocale = locale;
    let disposed = false;
    let rebuilding = false;
    let ownedUrls = new Set();
    const state = {
      items: [],
      style: "mla",
      selectedId: null,
      preview: null,
      previewStale: true,
      previewBusy: false,
      previewToken: 0,
      previewIssues: { errors: [], warnings: [] },
      statusKey: "status_ready",
      statusVars: {},
      statusTone: "",
      pendingImport: null,
      importIssues: [],
      importRevision: 0,
      undo: [],
      savedFingerprint: null,
      busyExport: false,
      fallbackVisible: false,
      wordLink: false,
      wordUrl: null,
      query: "",
      typeFilter: "all",
      portableFormat: "csl-json",
      portableScope: "all",
      portablePending: null,
      portableIssues: { errors: [], warnings: [] },
      portableRevision: 0,
      portableStatus: "",
      portableStatusTone: "",
      portableStatusVars: {},
      quickMode: canLookup ? "doi" : "import",
      quickRevision: 0,
      quickBusy: false,
      quickPending: null,
      quickErrors: [],
      quickWarnings: [],
      quickStatusKey: "",
      quickStatusVars: {},
      quickStatusTone: "",
      quickSelected: new Set(),
      batchRows: [],
      batchRunning: false,
      batchCancelled: false,
      batchRateLimited: false,
    };
    const nodes = {};
    const labelNodes = {};
    const downloadTimers = new Set();
    let wordController = null;
    let lookupController = null;
    let quickRenderKey = "";
    let batchRenderKey = "";
    const DOWNLOAD_URL_TTL = 1000;

    function readLocale() {
      let value = "en";
      try { value = String(getLocale() || "en"); } catch (_) {}
      return Object.prototype.hasOwnProperty.call(TEXT, value) ? value : "en";
    }

    function t(key, vars) {
      let value = (TEXT[locale] && Object.prototype.hasOwnProperty.call(TEXT[locale], key))
        ? TEXT[locale][key] : TEXT.en[key];
      if (value === undefined) value = key;
      return String(value).replace(/\{(\w+)\}/g, (_, name) =>
        vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : "");
    }

    function make(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function append(node, ...children) {
      for (const child of children.flat()) {
        if (child === null || child === undefined) continue;
        node.append(typeof child === "string" ? document.createTextNode(child) : child);
      }
      return node;
    }

    function button(label, action, className = "fc-citations-button") {
      const node = make("button", className, label);
      node.type = "button";
      node.setAttribute("data-action", action);
      return node;
    }

    function input(type, value, action) {
      const node = make("input", "fc-citations-input");
      node.type = type;
      node.value = value === undefined || value === null ? "" : String(value);
      if (action) node.setAttribute("data-field", action);
      return node;
    }

    function select(action, options) {
      const node = make("select", "fc-citations-select");
      if (action) node.setAttribute("data-field", action);
      for (const [value, label] of options) {
        const option = make("option", "", label);
        option.value = value;
        node.append(option);
      }
      return node;
    }

    function field(labelText, control, className = "fc-citations-field") {
      const label = make("label", className);
      append(label, make("span", "fc-citations-label", labelText), control);
      return label;
    }

    function labelForKey(id, textKey = id) {
      const label = make("span", "fc-citations-label", t(textKey));
      labelNodes[id] = { node: label, textKey };
      return label;
    }

    function fieldKey(id, control, className = "fc-citations-field", textKey = id) {
      const label = make("label", className);
      append(label, labelForKey(id, textKey), control);
      return label;
    }

    function setText(node, text) {
      if (node && node.textContent !== text) node.textContent = text;
    }

    function fieldLabel(path) {
      if (!path) return "";
      const match = /\.([A-Za-z]+)(?:\[\d+\])?(?:\.[A-Za-z]+)?$/.exec(path);
      const key = match ? match[1] : "";
      const labelKey = fieldLabelKeys[key];
      return labelKey ? t(labelKey) : "";
    }

    function issueText(issue) {
      const key = warningKeys[issue.code] || errorKeys[issue.code] || "error_generic";
      const label = fieldLabel(issue.path);
      return label ? `${t(key)} (${label})` : t(key);
    }

    function setStatus(key, vars, tone) {
      if (disposed) return;
      state.statusKey = key;
      state.statusVars = vars || {};
      state.statusTone = tone || "";
      renderStatusOnly();
    }

    function renderStatusOnly() {
      if (!nodes.status) return;
      nodes.status.textContent = t(state.statusKey, state.statusVars);
      nodes.status.className = "fc-citations-status" + (state.statusTone ? " is-" + state.statusTone : "");
    }

    function currentItem() {
      return state.items.find((item) => item.id === state.selectedId) || null;
    }

    function typeLabel(type) {
      if (type === "book") return t("type_book");
      if (type === "article-journal") return t("type_article");
      if (type === "webpage") return t("type_webpage");
      return t("type");
    }

    function library() {
      if (!model) return { schema: "formcapy-citations", v: 1, items: state.items };
      return { schema: model.SCHEMA, v: model.VERSION, items: state.items };
    }

    function fingerprint() {
      try { return JSON.stringify(state.items); } catch (_) { return ""; }
    }

    function searchText(value) {
      return String(value === undefined || value === null ? "" : value)
        .normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    }

    function visibleItems() {
      const words = searchText(state.query).trim().split(/\s+/).filter(Boolean);
      return state.items.filter((item) => {
        if (state.typeFilter !== "all" && item.type !== state.typeFilter) return false;
        if (!words.length) return true;
        const authors = (Array.isArray(item.authors) ? item.authors : []).flatMap((author) =>
          [author.family, author.given, author.literal]);
        const haystack = searchText([item.title, ...authors, item.containerTitle, item.publisher,
          item.DOI, item.URL, item.issued?.year].filter((value) => value !== undefined && value !== null).join(" "));
        return words.every((word) => haystack.includes(word));
      });
    }

    function portableSource() {
      return JSON.stringify([fingerprint(), state.portableFormat, state.portableScope,
        state.portableScope === "filtered" ? [state.query, state.typeFilter] : null]);
    }

    function setPortableStatus(key = "", tone = "", vars = {}) {
      state.portableStatus = key;
      state.portableStatusTone = tone;
      state.portableStatusVars = vars;
    }

    function invalidatePortable(key = "portable_stale") {
      state.portableRevision += 1;
      state.portablePending = null;
      state.portableIssues = { errors: [], warnings: [] };
      setPortableStatus(key, key ? "warn" : "");
    }

    function changeFilters(query, type) {
      if (disposed) return;
      const nextQuery = String(query || "").slice(0, 500);
      const nextType = ["all", "book", "article-journal", "webpage"].includes(type) ? type : "all";
      if (state.query === nextQuery && state.typeFilter === nextType) return;
      state.query = nextQuery;
      state.typeFilter = nextType;
      if (state.portableScope === "filtered") invalidatePortable(state.portablePending ? "portable_stale" : "");
      render();
    }

    function portableIssueText(issue) {
      const code = typeof issue?.code === "string" ? issue.code : "";
      if (code === "portable_original_omitted_summary" && Number.isSafeInteger(issue.count) && issue.count > 0) {
        return t("portable_original_summary", { count: issue.count });
      }
      const keys = {
        original_text_omitted: "portable_original_omitted", original_omitted: "portable_original_omitted",
        comparison_omitted: "portable_original_omitted", source_text_omitted: "portable_original_omitted",
        lossy_fields: "portable_loss", field_omitted: "portable_loss", field_not_exported: "portable_loss",
        fields_omitted: "portable_loss", field_not_representable: "portable_loss", type_mapped: "portable_loss",
        author_ambiguous: "portable_author_review", author_name_review: "portable_author_review",
        corporate_author_ambiguous: "portable_author_review", author_lossy: "portable_author_review",
        ris_author_literal: "portable_author_review", ris_author_given_only: "portable_author_review",
        ris_author_comma: "portable_author_review", ris_author_whitespace: "portable_author_review",
        bibtex_author_given_only: "portable_author_review", bibtex_author_whitespace: "portable_author_review",
        ris_field_whitespace: "portable_whitespace", bibtex_field_whitespace: "portable_whitespace",
        bibtex_tex_escape_lossy: "portable_special_text", bibtex_page_dash_lossy: "portable_loss",
        ris_page_semantics: "portable_loss", ris_container_semantics: "portable_loss", bibtex_container_semantics: "portable_loss",
        output_too_large: "portable_large", export_too_large: "portable_large",
        no_items: "portable_empty", empty_library: "portable_empty", library_empty: "portable_empty", model_unavailable: "model_missing",
      };
      const own = (map, name) => Object.prototype.hasOwnProperty.call(map, name) ? map[name] : "";
      const key = own(keys, code) || own(errorKeys, code) || own(warningKeys, code) || "portable_issue";
      const rawField = typeof issue?.field === "string" ? issue.field : "";
      const pathField = /\.([A-Za-z]+)(?:\[\d+\])?(?:\.[A-Za-z]+)?$/.exec(issue?.path || "")?.[1] || "";
      const labelKey = own(fieldLabelKeys, rawField) || own(fieldLabelKeys, pathField);
      const label = labelKey ? t(labelKey) : "";
      const text = t(key) + (label ? ` (${label})` : "");
      const index = Number.isSafeInteger(issue?.index) && issue.index >= 0 && issue.index < 200 ? issue.index : null;
      return index === null ? text : `${t("quick_record", { count: index + 1 })}: ${text}`;
    }

    function safePortableIssues(value) {
      // A full 200-record export can carry one notice for many fields per
      // record. Render only MAX_VISIBLE_ISSUES, while retaining the full count.
      if (!Array.isArray(value) || value.length > 10000) throw new TypeError("portable_result_invalid");
      return value.map((issue) => {
        if (!issue || typeof issue !== "object" || typeof issue.code !== "string" || issue.code.length > 100) {
          throw new TypeError("portable_result_invalid");
        }
        const clean = { code: issue.code };
        if (Number.isSafeInteger(issue.index) && issue.index >= 0 && issue.index < 200) clean.index = issue.index;
        if (typeof issue.field === "string" && issue.field.length <= 80) clean.field = issue.field;
        if (typeof issue.path === "string" && issue.path.length <= 500) clean.path = issue.path;
        return clean;
      });
    }

    function freshPortable() {
      if (disposed || !state.portablePending) return null;
      if (state.portablePending.source !== portableSource()) {
        invalidatePortable();
        return null;
      }
      return state.portablePending;
    }

    function portableDisplayWarnings() {
      const warnings = state.portableIssues.warnings;
      const originals = warnings.filter((issue) => issue.code === "original_text_omitted");
      if (originals.length < 2) return warnings;
      const indices = new Set(originals.filter((issue) => Number.isSafeInteger(issue.index)).map((issue) => issue.index));
      const count = indices.size + originals.filter((issue) => !Number.isSafeInteger(issue.index)).length;
      let summarized = false;
      // Summarize only this repetitive presentation notice. The module's
      // diagnostics and every other field notice stay intact and ordered.
      return warnings.flatMap((issue) => {
        if (issue.code !== "original_text_omitted") return [issue];
        if (summarized) return [];
        summarized = true;
        return [{ code: "portable_original_omitted_summary", count }];
      });
    }

    function renderPortable() {
      if (!nodes.portablePanel) return;
      const pending = freshPortable();
      const count = state.portableScope === "filtered" ? visibleItems().length : state.items.length;
      for (const [node, key] of nodes.portableLabels) setText(node, t(key));
      setText(nodes.portableAll, t("portable_all", { count: state.items.length }));
      setText(nodes.portableFiltered, t("portable_filtered", { count: visibleItems().length }));
      setText(nodes.portableBibtex, t("portable_bibtex"));
      nodes.portableFormat.value = state.portableFormat;
      nodes.portableScope.value = state.portableScope;
      nodes.portablePrepare.disabled = !canPortableExport || !count;
      nodes.portableResult.hidden = !pending;
      nodes.portableCopy.disabled = !pending;
      nodes.portableDownload.disabled = !pending || !canDownload();
      nodes.portableDownload.hidden = !allowDownloads;
      nodes.portableText.setAttribute("aria-label", t("portable_text"));
      const text = pending ? pending.text : "";
      if (nodes.portableText.value !== text) nodes.portableText.value = text;
      const key = !canPortableExport ? "portable_unavailable" : state.portableStatus;
      nodes.portableStatus.textContent = key ? t(key, state.portableStatusVars) : "";
      nodes.portableStatus.className = "fc-citations-portable-status" +
        (state.portableStatusTone ? " is-" + state.portableStatusTone : "");
      renderIssueBox(nodes.portableIssues, state.portableIssues.errors, portableDisplayWarnings(), portableIssueText);
    }

    function preparePortable() {
      if (disposed) return;
      invalidatePortable("");
      if (!canPortableExport) { setPortableStatus("portable_unavailable", "err"); renderPortable(); return; }
      const items = state.portableScope === "filtered" ? visibleItems() : state.items;
      if (!items.length) { setPortableStatus("portable_empty", "warn"); renderPortable(); return; }
      const source = portableSource();
      try {
        // Pass a detached snapshot: exporting may never edit the active library.
        const payload = JSON.parse(JSON.stringify({ ...library(), items }));
        const result = exporter.exportLibrary(payload, { format: state.portableFormat });
        if (!result || typeof result !== "object" || result.format !== state.portableFormat ||
            typeof result.ok !== "boolean") throw new TypeError("portable_result_invalid");
        const errors = safePortableIssues(result.errors);
        const warnings = safePortableIssues(result.warnings);
        state.portableIssues = { errors, warnings };
        if (!result.ok || errors.length) {
          setPortableStatus("portable_invalid", "err");
        } else {
          if (typeof result.text !== "string" || !result.text.trim()) throw new TypeError("portable_result_invalid");
          const bytes = typeof model.utf8Length === "function" ? model.utf8Length(result.text) : new TextEncoder().encode(result.text).length;
          if (bytes > 1048576) {
            state.portableIssues = { errors: [{ code: "output_too_large" }], warnings: [] };
            setPortableStatus("portable_large", "err");
          } else if (!disposed && source === portableSource()) {
            const config = PORTABLE_FORMATS[state.portableFormat];
            state.portablePending = { text: result.text, filename: config.filename, mime: config.mime, source };
            setPortableStatus("portable_ready", warnings.length ? "warn" : "ok", { count: items.length, format: config.label });
          }
        }
      } catch (_) {
        state.portablePending = null;
        state.portableIssues = { errors: [], warnings: [] };
        setPortableStatus("portable_invalid", "err");
      }
      renderPortable();
    }

    async function copyPortable() {
      const pending = freshPortable();
      if (!pending) { renderPortable(); return; }
      const revision = state.portableRevision;
      const stillCurrent = () => !disposed && revision === state.portableRevision &&
        state.portablePending === pending && pending.source === portableSource();
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (clipboard && typeof clipboard.writeText === "function") {
          await clipboard.writeText(pending.text);
          if (!stillCurrent()) return;
          setPortableStatus("portable_copied", "ok");
          renderPortable();
          return;
        }
      } catch (_) {}
      if (!stillCurrent()) return;
      nodes.portableText.focus?.();
      nodes.portableText.select?.();
      setPortableStatus("portable_manual", "warn");
      renderPortable();
    }

    function downloadPortable() {
      const pending = freshPortable();
      if (!pending) { renderPortable(); return; }
      if (downloadBlob(pending.filename, pending.mime, pending.text)) setPortableStatus("portable_downloaded", "ok");
      renderPortable();
    }

    function clearWordUrl() {
      if (state.wordUrl) {
        revokeUrl(state.wordUrl);
        ownedUrls.delete(state.wordUrl);
        state.wordUrl = null;
      }
      state.wordLink = false;
    }

    function invalidatePreview() {
      wordController?.abort();
      state.previewToken += 1;
      state.previewBusy = false;
      state.previewStale = true;
      state.previewIssues = { errors: [], warnings: [] };
      clearWordUrl();
      setStatus("status_changed", null, "warn");
    }

    function snapshot(kind) {
      state.undo.unshift({
        kind,
        items: JSON.parse(JSON.stringify(state.items)),
        selectedId: state.selectedId,
      });
      if (state.undo.length > 10) state.undo.length = 10;
    }

    function replaceLibrary(items, selectedId, undoKind) {
      if (undoKind) snapshot(undoKind);
      state.items = items;
      state.selectedId = selectedId || (items[0] ? items[0].id : null);
      invalidatePreview();
      rebuildEditor();
      render();
    }

    function selectItem(id) {
      state.selectedId = id;
      rebuildEditor();
      render();
    }

    function addEntry() {
      if (!model) { setStatus("model_missing", null, "err"); return; }
      const item = model.createItem({ type: "book" });
      state.items.push(item);
      state.query = "";
      state.typeFilter = "all";
      state.selectedId = item.id;
      invalidatePreview();
      rebuildEditor();
      render();
      if (nodes.titleInput && typeof nodes.titleInput.focus === "function") nodes.titleInput.focus();
    }

    function removeEntry() {
      const item = currentItem();
      if (!item) return;
      snapshot("remove");
      const index = state.items.findIndex((entry) => entry.id === item.id);
      state.items.splice(index, 1);
      state.selectedId = state.items[Math.min(index, state.items.length - 1)]?.id || null;
      invalidatePreview();
      rebuildEditor();
      render();
      setStatus("status_changed");
    }

    function undo() {
      const entry = state.undo.shift();
      if (!entry) return;
      if (entry.kind === "append" && Array.isArray(entry.addedIds)) {
        // Undo only the batch's new IDs, preserving subsequent edits to older
        // records and any entries the user added manually afterward.
        const added = new Set(entry.addedIds);
        state.items = state.items.filter((item) => !added.has(item.id));
        if (!state.items.some((item) => item.id === state.selectedId)) {
          state.selectedId = state.items.some((item) => item.id === entry.selectedId)
            ? entry.selectedId : state.items[0]?.id || null;
        }
      } else {
        state.items = entry.items;
        state.selectedId = entry.selectedId;
      }
      invalidatePreview();
      rebuildEditor();
      render();
      setStatus("undo_applied", null, "ok");
    }

    function updateCurrent(mutator) {
      const item = currentItem();
      if (!item) return;
      mutator(item);
      invalidatePreview();
      render();
    }

    function setDate(which, item) {
      const group = nodes[which];
      if (!group) return;
      const read = (inputNode) => {
        const raw = String(inputNode.value === undefined || inputNode.value === null ? "" : inputNode.value).trim();
        if (!raw) return undefined;
        // Keep invalid components as entered so validation blocks preview and
        // the value survives a locale/style re-render. Valid integers can be
        // stored as numbers for the CSL mapping.
        if (/^-?\d+$/.test(raw)) {
          const value = Number(raw);
          if (Number.isSafeInteger(value)) return value;
        }
        return raw;
      };
      const date = {};
      for (const part of ["year", "month", "day"]) {
        const value = read(group[part]);
        if (value !== undefined) date[part] = value;
      }
      item[which] = Object.keys(date).length ? date : null;
    }

    function dateValues(date) {
      const component = (value) => {
        if (value === undefined || value === null) return "";
        return String(value);
      };
      return {
        year: date ? component(date.year) : "",
        month: date ? component(date.month) : "",
        day: date ? component(date.day) : "",
      };
    }

    function buildDateGroup(which) {
      const group = make("fieldset", "fc-citations-date");
      const legend = make("legend", "", t(which));
      const row = make("div", "fc-citations-date-row");
      const parts = {};
      for (const part of ["year", "month", "day"]) {
        const control = input("number", "", which + "-" + part);
        control.min = "1";
        control.max = part === "year" ? "9999" : part === "month" ? "12" : "31";
        parts[part] = control;
        row.append(fieldKey(which + "-" + part, control, "fc-citations-field fc-citations-date-field", part));
      }
      append(group, legend, row);
      parts.legend = legend;
      parts.wrap = group;
      nodes[which] = parts;
      for (const part of ["year", "month", "day"]) {
        parts[part].addEventListener("input", () => {
          const item = currentItem();
          if (!item) return;
          setDate(which, item);
          invalidatePreview();
          render();
        });
      }
      return group;
    }

    function authorLabel(author) {
      if (!author) return "";
      if (author.literal) return author.literal;
      return [author.family, author.given].filter(Boolean).join(", ");
    }

    function updateAuthor(index, key, value) {
      const item = currentItem();
      if (!item || !item.authors[index]) return;
      item.authors[index][key] = value;
      invalidatePreview();
      render();
    }

    function changeAuthorMode(index, mode) {
      const item = currentItem();
      if (!item || !item.authors[index]) return;
      item.authors[index] = mode === "literal" ? { literal: "" } : { family: "", given: "" };
      invalidatePreview();
      renderAuthors();
      render();
    }

    function moveAuthor(index, direction) {
      const item = currentItem();
      if (!item) return;
      const target = index + direction;
      if (target < 0 || target >= item.authors.length) return;
      const copy = item.authors.slice();
      [copy[index], copy[target]] = [copy[target], copy[index]];
      item.authors = copy;
      invalidatePreview();
      renderAuthors();
      render();
    }

    function removeAuthor(index) {
      const item = currentItem();
      if (!item) return;
      item.authors.splice(index, 1);
      invalidatePreview();
      renderAuthors();
      render();
    }

    function addAuthor() {
      const item = currentItem();
      if (!item || item.authors.length >= (model ? model.MAX_AUTHORS : 50)) return;
      item.authors.push({ family: "", given: "" });
      invalidatePreview();
      renderAuthors();
      render();
    }

    function renderAuthors() {
      if (!nodes.authorsList) return;
      nodes.authorsList.replaceChildren();
      const item = currentItem();
      if (!item) return;
      if (!item.authors.length) {
        nodes.authorsList.append(make("p", "fc-citations-hint", t("warn_author")));
      }
      item.authors.forEach((author, index) => {
        const row = make("div", "fc-citations-author");
        row.setAttribute("data-author-index", String(index));
        const mode = select("author-mode-" + index, [
          ["person", t("author_person")], ["literal", t("author_literal")],
        ]);
        mode.value = author.literal !== undefined ? "literal" : "person";
        mode.addEventListener("change", () => changeAuthorMode(index, mode.value));
        row.append(field(t("type"), mode, "fc-citations-field fc-citations-author-mode"));
        if (mode.value === "literal") {
          const literal = input("text", author.literal || "", "author-literal-" + index);
          literal.addEventListener("input", () => updateAuthor(index, "literal", literal.value));
          row.append(field(t("literal"), literal, "fc-citations-field fc-citations-author-name"));
        } else {
          const family = input("text", author.family || "", "author-family-" + index);
          const given = input("text", author.given || "", "author-given-" + index);
          family.addEventListener("input", () => updateAuthor(index, "family", family.value));
          given.addEventListener("input", () => updateAuthor(index, "given", given.value));
          row.append(field(t("family"), family, "fc-citations-field"));
          row.append(field(t("given"), given, "fc-citations-field"));
        }
        const controls = make("div", "fc-citations-author-actions");
        const up = button("↑", "author-up", "fc-citations-icon");
        up.setAttribute("aria-label", t("move_up"));
        up.disabled = index === 0;
        up.addEventListener("click", () => moveAuthor(index, -1));
        const down = button("↓", "author-down", "fc-citations-icon");
        down.setAttribute("aria-label", t("move_down"));
        down.disabled = index === item.authors.length - 1;
        down.addEventListener("click", () => moveAuthor(index, 1));
        const remove = button("×", "author-remove", "fc-citations-icon");
        remove.setAttribute("aria-label", t("remove_author"));
        remove.addEventListener("click", () => removeAuthor(index));
        controls.append(up, down, remove);
        row.append(controls);
        nodes.authorsList.append(row);
      });
      if (nodes.addAuthor) nodes.addAuthor.disabled = item.authors.length >= (model ? model.MAX_AUTHORS : 50);
    }

    function renderItemList() {
      if (!nodes.itemList) return;
      nodes.itemList.replaceChildren();
      const visible = visibleItems();
      for (const item of visible) {
        const li = make("li", "fc-citations-list-item");
        const buttonNode = button("", "select", "fc-citations-item");
        buttonNode.setAttribute("aria-pressed", String(item.id === state.selectedId));
        buttonNode.setAttribute("data-entry-id", item.id);
        const title = make("span", "fc-citations-item-title", item.title.trim() ? item.title : t("untitled"));
        const meta = make("span", "fc-citations-item-meta", typeLabel(item.type));
        append(buttonNode, title, meta);
        buttonNode.addEventListener("click", () => selectItem(item.id));
        if (item.id === state.selectedId) buttonNode.classList.add("is-selected");
        li.append(buttonNode);
        nodes.itemList.append(li);
      }
      setText(nodes.entryCount, t("library_matches", { visible: visible.length, total: state.items.length }));
      if (nodes.empty) nodes.empty.hidden = state.items.length > 0;
      setText(nodes.noMatches, t("library_no_matches"));
      nodes.noMatches.hidden = !state.items.length || Boolean(visible.length);
      for (const [node, key] of nodes.filterLabels) setText(node, t(key));
      nodes.libraryQuery.placeholder = t("library_search_hint");
      if (nodes.libraryQuery.value !== state.query) nodes.libraryQuery.value = state.query;
      nodes.libraryType.value = state.typeFilter;
      nodes.clearFilters.disabled = !state.query && state.typeFilter === "all";
      nodes.hiddenSelection.hidden = !currentItem() || visible.some((item) => item.id === state.selectedId);
    }

    function renderIssues() {
      if (!nodes.editorIssues) return;
      const item = currentItem();
      const result = model && item ? model.validateItem(item) : { errors: [], warnings: [] };
      renderIssueBox(nodes.editorIssues, result.errors, result.warnings);
    }

    function renderIssueBox(container, errors, warnings, describe = issueText) {
      if (!container) return;
      container.replaceChildren();
      const renderList = (titleKey, list, tone) => {
        if (!list.length) return;
        const section = make("div", "fc-citations-issues-" + tone);
        section.append(make("p", "fc-citations-issues-title", t(titleKey)));
        const ul = make("ul", "fc-citations-issues-list");
        const visible = list.slice(0, MAX_VISIBLE_ISSUES);
        for (const issue of visible) {
          const li = make("li", "", describe(issue));
          ul.append(li);
        }
        if (list.length > visible.length) {
          ul.append(make("li", "fc-citations-more-issues", t("more_issues", { count: list.length - visible.length })));
        }
        section.append(ul);
        container.append(section);
      };
      renderList("errors", errors, "error");
      renderList("warnings", warnings, "warning");
      container.hidden = !errors.length && !warnings.length;
    }

    function renderPreviewIssues() {
      if (!nodes.previewIssues) return;
      renderIssueBox(nodes.previewIssues, state.previewIssues.errors, state.previewIssues.warnings);
    }

    function styleStatus() {
      if (!model) return { key: "model_missing", tone: "err" };
      if (!engine) return { key: "engine_missing", tone: "err" };
      if (state.previewBusy) return { key: "preview_busy", tone: "working" };
      if (!state.preview) return { key: "preview_required", tone: "" };
      if (state.previewStale) return { key: "preview_stale", tone: "warn" };
      return { key: "preview_ready", tone: "ok" };
    }

    function renderPreview() {
      if (!nodes.previewButton) return;
      const status = styleStatus();
      setText(nodes.previewStatus, t(status.key));
      nodes.previewStatus.className = "fc-citations-preview-status" + (status.tone ? " is-" + status.tone : "");
      const fresh = Boolean(state.preview && !state.previewStale && !state.previewBusy);
      nodes.previewButton.disabled = Boolean(state.previewBusy || !engine || !model);
      nodes.previewButton.setAttribute("aria-busy", String(Boolean(state.previewBusy)));
      for (const node of [nodes.copyButton, nodes.copyRichButton, nodes.htmlButton, nodes.wordButton]) {
        if (!node) continue;
        node.disabled = !fresh || state.busyExport;
      }
      if (nodes.copyRichButton) {
        nodes.copyRichButton.hidden = !(fresh && typeof root.ClipboardItem === "function" &&
          engine && typeof engine.safeFragment === "function" && root.ClipboardItem);
      }
      if (nodes.wordButton) nodes.wordButton.hidden = !(allowDownloads && onExportWord);
      if (nodes.wordCancel) {
        nodes.wordCancel.hidden = !state.busyExport || !wordController;
        nodes.wordCancel.disabled = Boolean(wordController?.signal.aborted);
      }
      if (nodes.wordNote) nodes.wordNote.hidden = !(allowDownloads && onExportWord);
      if (nodes.htmlButton) nodes.htmlButton.disabled = !fresh || !canDownload();
      if (nodes.wordLink) nodes.wordLink.hidden = !state.wordLink;
      if (nodes.wordLinkWrap) nodes.wordLinkWrap.hidden = !state.wordLink;
    }

    function canDownload() {
      return allowDownloads && typeof Blob === "function" && typeof URL === "function" &&
        typeof URL.createObjectURL === "function";
    }

    function renderPersistence() {
      if (!nodes.savedState) return;
      const current = fingerprint();
      const isSaved = state.savedFingerprint !== null && state.savedFingerprint === current;
      setText(nodes.savedState, isSaved ? t("saved") : state.savedFingerprint !== null ? t("unsaved") : t("not_saved"));
      for (const node of [nodes.saveButton, nodes.loadButton, nodes.removeSavedButton]) {
        if (node) node.disabled = !storage;
      }
      if (nodes.saveButton) nodes.saveButton.disabled = !storage || !state.items.length;
      if (nodes.exportJsonButton) nodes.exportJsonButton.hidden = !canDownload();
      if (nodes.htmlButton) nodes.htmlButton.hidden = !canDownload();
    }

    function renderImport() {
      if (!nodes.importPanel) return;
      nodes.importPanel.hidden = !state.importOpen;
      nodes.importToggle.setAttribute("aria-expanded", String(state.importOpen));
      if (nodes.reviewSection) nodes.reviewSection.hidden = !state.pendingImport;
      if (nodes.importIssues) {
        renderIssueBox(nodes.importIssues, state.importIssues, []);
        nodes.importIssues.hidden = !state.importIssues.length;
      }
      if (state.pendingImport) {
        const pendingItems = state.pendingImport.library.items;
        setText(nodes.reviewCount, t("review_count", { count: pendingItems.length }));
        nodes.reviewList.replaceChildren();
        for (const item of pendingItems) {
          nodes.reviewList.append(make("li", "", item.title || t("untitled")));
        }
      }
    }

    function intakeIssueText(issue) {
      const value = issue || {};
      const key = intakeIssueKeys[value.code] || warningKeys[value.code] || errorKeys[value.code] || "quick_problem";
      const labelKey = fieldLabelKeys[value.field];
      const rawField = typeof value.field === "string" ? value.field.slice(0, 120) : "";
      const label = labelKey ? t(labelKey) : fieldLabel(value.path) || rawField;
      const detail = label ? `${t(key)} (${label})` : t(key);
      const pathIndex = /^(?:\$\[|\$\.items\[|library\.items\[)(\d+)\]/.exec(value.path || "");
      const index = Number.isSafeInteger(value.index) ? value.index : pathIndex ? Number(pathIndex[1]) : null;
      return index !== null ? `${t("quick_record", { count: index + 1 })}: ${detail}` : detail;
    }

    function setQuickStatus(key = "", tone = "", vars = {}) {
      state.quickStatusKey = key;
      state.quickStatusTone = tone;
      state.quickStatusVars = vars;
    }

    // Intake has its own cancellation token. It never takes the paper/Word
    // export lock and never writes into a selected entry while awaiting a DOI.
    function resetIntake(status = "") {
      state.quickRevision += 1;
      lookupController?.abort();
      lookupController = null;
      state.quickBusy = false;
      state.quickPending = null;
      state.quickSelected = new Set();
      state.batchRows = [];
      state.batchRunning = false;
      state.batchCancelled = false;
      state.batchRateLimited = false;
      state.quickErrors = [];
      state.quickWarnings = [];
      setQuickStatus(status);
    }

    function plannedAppend(items) {
      if (!canImport) return { ok: false, items: [], added: 0, skipped: 0, errors: [], warnings: [] };
      try {
        const result = importer.planAppend(state.items, items);
        if (!result || !Array.isArray(result.items) || !Array.isArray(result.errors || [])) throw new TypeError();
        return result;
      } catch (_) {
        return { ok: false, items: [], added: 0, skipped: 0, errors: [{ code: "item_invalid" }], warnings: [] };
      }
    }

    function authorSummary(item) {
      const names = (Array.isArray(item.authors) ? item.authors : []).map((author) =>
        author.literal || [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean);
      return names.length ? names.slice(0, 3).join("; ") + (names.length > 3 ? " …" : "") : t("quick_missing_author");
    }

    function selectedIntakeItems() {
      return state.quickPending ? state.quickPending.items.filter((_, index) => state.quickSelected.has(index)) : [];
    }

    function batchCounts() {
      const rows = state.batchRows;
      const succeeded = rows.filter((row) => row.status === "success").length;
      const failed = rows.filter((row) => row.status === "failed").length;
      return { total: rows.filter((row) => !["invalid", "duplicate"].includes(row.status)).length,
        completed: succeeded + failed, succeeded, failed };
    }

    function renderBatchRows() {
      nodes.batchPanel.hidden = !state.batchRows.length;
      setText(nodes.batchHeading, t("batch_rows"));
      const counts = batchCounts();
      setText(nodes.batchProgress, t("batch_progress", counts));
      const current = state.batchRunning ? state.batchRows.find((row) => !["success", "failed", "invalid", "duplicate", "cancelled"].includes(row.status)) : null;
      nodes.batchCurrent.hidden = !current;
      if (current) setText(nodes.batchCurrent, t("batch_current", { line: current.line }));
      const key = JSON.stringify([locale, state.batchRunning, state.batchRows]);
      if (key === batchRenderKey) return;
      batchRenderKey = key;
      nodes.batchRows.replaceChildren();
      for (const row of state.batchRows) {
        const entry = make("li", "fc-citations-batch-row");
        entry.setAttribute("data-batch-line", String(row.line));
        let label = { success: "batch_success", failed: "batch_failed", invalid: "batch_invalid",
          duplicate: "batch_duplicate", cancelled: "batch_cancelled_row", ready: "batch_ready" }[row.status] || "batch_running";
        if (!state.batchRunning && !["success", "failed", "invalid", "duplicate", "cancelled"].includes(row.status)) label = "batch_unqueried";
        append(entry, make("strong", "fc-citations-batch-line", t("batch_line", { line: row.line })),
          make("span", "fc-citations-batch-input", row.doi || row.input || ""),
          make("span", `fc-citations-batch-state is-${row.status}`, t(label, { line: row.duplicateOf || "?" })));
        const issues = make("div", "fc-citations-issues");
        renderIssueBox(issues, row.status === "duplicate" ? [] : row.errors || [], [], intakeIssueText);
        entry.append(issues);
        nodes.batchRows.append(entry);
      }
    }

    function updateBatchSnapshot(snapshot, revision) {
      if (disposed || revision !== state.quickRevision) return;
      if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length > 50) {
        throw new TypeError("batch_lookup_invalid");
      }
      state.batchRows = snapshot.rows;
      state.quickErrors = Array.isArray(snapshot.errors) ? snapshot.errors.map((issue) => issue.code === "input_too_large"
        ? { ...issue, code: "batch_input_large" } : issue) : [];
      state.batchCancelled = Boolean(snapshot.cancelled);
      state.batchRateLimited = Boolean(snapshot.rateLimited);
      const items = [], warnings = [];
      for (const row of snapshot.rows) {
        if (row.status !== "success" || !Array.isArray(row.items)) continue;
        const offset = items.length;
        items.push(...row.items);
        for (const warning of row.warnings || []) {
          warnings.push({ ...warning, index: offset + (Number.isSafeInteger(warning.index) ? warning.index : 0) });
        }
      }
      state.quickWarnings = warnings;
      state.quickPending = items.length ? { items, revision, source: "doi", format: "doi" } : null;
      state.quickSelected = new Set(items.map((_, index) => index));
      const counts = batchCounts();
      if (state.quickErrors.length) setQuickStatus("batch_lookup_invalid", "err", counts);
      else if (state.batchRateLimited) setQuickStatus("batch_rate_limited", "warn", counts);
      else if (state.batchCancelled) setQuickStatus("batch_cancelled", "", counts);
      else setQuickStatus(state.batchRunning ? "batch_progress" : "batch_done", state.batchRunning ? "working" : "ok", counts);
    }

    function cancelIntakeLookup() {
      if (!state.batchRunning) { resetIntake("quick_cancelled"); renderIntake(); return; }
      // Capture only the last completed progress snapshot. Abort invalidates the
      // run immediately; a provider that ignores abort cannot add late records.
      state.quickRevision += 1;
      lookupController?.abort();
      lookupController = null;
      state.quickBusy = false;
      state.batchRunning = false;
      state.batchCancelled = true;
      state.batchRows = state.batchRows.map((row) => ["success", "failed", "invalid", "duplicate"].includes(row.status)
        ? row : { ...row, status: "cancelled", errors: [], items: [] });
      if (state.quickPending) state.quickPending.revision = state.quickRevision;
      setQuickStatus("batch_cancelled", "", batchCounts());
      renderIntake();
    }

    function renderIntake() {
      if (!nodes.quickSection) return;
      nodes.quickSection.hidden = !canImport;
      nodes.quickDoiTab.hidden = !canLookup;
      nodes.quickDoiPanel.hidden = state.quickMode !== "doi" || !canLookup;
      nodes.quickImportPanel.hidden = state.quickMode !== "import";
      for (const [node, key] of nodes.quickLabels) setText(node, t(key));
      setText(nodes.quickDoiLabel, t(canBatch ? "batch_doi_label" : "quick_doi_label"));
      setText(nodes.quickPrivacy, t(canBatch ? "batch_privacy" : "quick_privacy"));
      nodes.batchHint.hidden = !canBatch;
      nodes.quickDoiInput.placeholder = t(canBatch ? "batch_placeholder" : "quick_doi_placeholder");
      setText(nodes.quickCancel, t(canBatch ? "batch_cancel" : "quick_cancel"));
      nodes.quickDoiTab.setAttribute("aria-pressed", String(state.quickMode === "doi"));
      nodes.quickImportTab.setAttribute("aria-pressed", String(state.quickMode === "import"));
      nodes.quickQuery.disabled = state.quickBusy || !canLookup || !nodes.quickDoiInput.value.trim();
      nodes.quickQuery.setAttribute("aria-busy", String(state.quickBusy && state.quickMode === "doi"));
      nodes.quickCancel.hidden = !(state.quickBusy && state.quickMode === "doi");
      nodes.quickReviewButton.disabled = state.quickBusy || !canImport || !nodes.quickText.value.trim();
      nodes.quickStatus.textContent = state.quickStatusKey ? t(state.quickStatusKey, state.quickStatusVars) : "";
      nodes.quickStatus.className = "fc-citations-intake-status" + (state.quickStatusTone ? " is-" + state.quickStatusTone : "");
      nodes.quickReview.hidden = !state.quickPending;
      const pending = state.quickPending;
      const selected = selectedIntakeItems();
      const plan = pending ? selected.length ? plannedAppend(selected) : { ok: true, items: state.items, added: 0, skipped: 0, errors: [], warnings: [] } : null;
      const key = JSON.stringify([locale, state.quickRevision, state.quickErrors, state.quickWarnings, pending?.items || []]);
      if (key !== quickRenderKey) {
        quickRenderKey = key;
        renderIssueBox(nodes.quickIssues, state.quickErrors,
          state.quickWarnings.filter((warning) => !pending || !Number.isSafeInteger(warning.index)), intakeIssueText);
        nodes.quickReviewList.replaceChildren();
        nodes.quickCheckboxes = [];
        if (pending) {
          for (const [index, item] of pending.items.entries()) {
            const card = make("li", "fc-citations-intake-record");
            const check = input("checkbox", "", `intake-select-${index}`);
            check.className = "fc-citations-intake-checkbox";
            check.checked = state.quickSelected.has(index);
            check.setAttribute("aria-label", t("select_record", { title: item.title || t("untitled") }));
            check.addEventListener("change", () => {
              if (state.quickBusy) return;
              if (check.checked) state.quickSelected.add(index); else state.quickSelected.delete(index);
              renderIntake();
            });
            nodes.quickCheckboxes.push(check);
            card.append(append(make("label", "fc-citations-intake-record-heading"), check,
              make("span", "", item.title || t("untitled"))));
            const year = item.issued?.year || t("quick_missing_year");
            card.append(make("p", "fc-citations-intake-meta", `${authorSummary(item)} · ${year}`));
            const source = item.containerTitle || item.publisher || "";
            card.append(make("p", "fc-citations-intake-meta", `${t("quick_source")}: ${source ? source + " · " : ""}${typeLabel(item.type)}`));
            if (item.DOI || item.URL) card.append(make("p", "fc-citations-intake-meta", item.DOI || item.URL));
            const validation = model.validateItem(item);
            const issues = make("div", "fc-citations-issues");
            const knownWarnings = new Set((validation.warnings || []).map((warning) => warning.code));
            const warnings = [...(validation.warnings || []), ...state.quickWarnings.filter((warning) => warning.index === index && !knownWarnings.has(warning.code))];
            renderIssueBox(issues, validation.errors || [], warnings, intakeIssueText);
            card.append(issues);
            nodes.quickReviewList.append(card);
          }
        }
      }
      if (pending) {
        for (const [index, check] of nodes.quickCheckboxes.entries()) {
          check.checked = state.quickSelected.has(index);
          check.disabled = state.quickBusy;
        }
        nodes.quickSelectAll.disabled = state.quickBusy;
        nodes.quickSelectNone.disabled = state.quickBusy;
        renderIssueBox(nodes.quickPlanIssues, plan.errors || [], plan.warnings || [], intakeIssueText);
        const format = { bibtex: "BibTeX", ris: "RIS", json: "CSL JSON", doi: "Crossref DOI" }[pending.format] || "JSON";
        setText(nodes.quickDetectedFormat, t("quick_detected_format", { format }));
        setText(nodes.quickCount, t("quick_count", { count: pending.items.length, selected: selected.length, added: plan.added || 0, skipped: plan.skipped || 0 }));
        setText(nodes.quickAppend, t("quick_append", { count: plan.added || 0 }));
        nodes.quickAppend.disabled = !plan.ok || !plan.added || state.quickBusy;
      }
      renderBatchRows();
    }

    function acceptIntake(result, revision, source) {
      if (disposed || revision !== state.quickRevision) return;
      const valid = Boolean(result && result.ok && Array.isArray(result.items) && result.items.length);
      state.quickErrors = Array.isArray(result?.errors) ? result.errors : [];
      state.quickWarnings = Array.isArray(result?.warnings) ? result.warnings : [];
      state.quickPending = valid ? { items: result.items, revision, source, format: result.format || source } : null;
      state.quickSelected = new Set(valid ? result.items.map((_, index) => index) : []);
      setQuickStatus(valid ? "quick_ready" : "quick_invalid", valid ? "ok" : "err");
    }

    async function queryDoi() {
      if (!canLookup || disposed || state.quickBusy) return;
      // Keep blank lines in batches so displayed line numbers match the input.
      const raw = canBatch ? nodes.quickDoiInput.value : nodes.quickDoiInput.value.trim();
      resetIntake();
      const revision = state.quickRevision;
      if (!raw.trim()) { setQuickStatus("quick_empty", "err"); renderIntake(); return; }
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      lookupController = controller;
      if (canBatch) {
        let parsed;
        try { parsed = batch.parse(raw); } catch (_) { parsed = { ok: false, rows: [], errors: [{ code: "batch_input_invalid" }] }; }
        state.batchRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
        state.quickErrors = Array.isArray(parsed?.errors) ? parsed.errors.map((issue) => issue.code === "input_too_large"
          ? { ...issue, code: "batch_input_large" } : issue) : [];
        if (!parsed?.ok || state.batchRows.length > 50 || !state.batchRows.some((row) => row.status === "ready")) {
          lookupController = null;
          setQuickStatus("batch_invalid_input", "err");
          renderIntake();
          return;
        }
        state.quickBusy = true;
        state.batchRunning = true;
        setQuickStatus("batch_progress", "working", batchCounts());
        renderIntake();
        let invalidProgress = false;
        try {
          const result = await batch.run(state.batchRows, { lookup, signal: controller?.signal,
            onProgress: (snapshot) => {
              if (disposed || revision !== state.quickRevision || !state.batchRunning || invalidProgress) return;
              try { updateBatchSnapshot(snapshot, revision); }
              catch (_) {
                invalidProgress = true;
                controller?.abort();
                state.quickErrors = [{ code: "batch_lookup_invalid" }];
                setQuickStatus("batch_lookup_invalid", "err");
              }
              renderIntake();
            },
          });
          if (disposed || revision !== state.quickRevision || raw !== nodes.quickDoiInput.value) return;
          state.batchRunning = false;
          if (!invalidProgress) updateBatchSnapshot(result, revision);
        } catch (_) {
          if (!disposed && revision === state.quickRevision) {
            state.quickErrors = [{ code: "batch_lookup_invalid" }];
            setQuickStatus("batch_lookup_invalid", "err");
          }
        } finally {
          if (lookupController === controller) lookupController = null;
          if (!disposed && revision === state.quickRevision) {
            state.quickBusy = false;
            state.batchRunning = false;
            renderIntake();
          }
        }
        return;
      }
      state.quickBusy = true;
      setQuickStatus("quick_busy", "working");
      renderIntake();
      try {
        const result = await lookup.lookup(raw, { signal: controller?.signal });
        if (disposed || revision !== state.quickRevision || raw !== nodes.quickDoiInput.value.trim()) return;
        acceptIntake(result, revision, "doi");
      } catch (error) {
        if (!disposed && revision === state.quickRevision) {
          state.quickErrors = [{ code: controller?.signal.aborted || error?.name === "AbortError" ? "lookup_cancelled" : "lookup_network" }];
          setQuickStatus(controller?.signal.aborted ? "quick_cancelled" : "quick_network", controller?.signal.aborted ? "" : "err");
        }
      } finally {
        if (lookupController === controller) lookupController = null;
        if (!disposed && revision === state.quickRevision) {
          state.quickBusy = false;
          renderIntake();
        }
      }
    }

    function reviewIntake() {
      if (!canImport || disposed || state.quickBusy) return;
      resetIntake();
      const revision = state.quickRevision;
      try {
        acceptIntake(importer.parse(nodes.quickText.value, { format: nodes.quickFormat.value }), revision, "import");
      } catch (_) {
        state.quickErrors = [{ code: "item_invalid" }];
        setQuickStatus("quick_invalid", "err");
      }
      renderIntake();
    }

    async function readIntakeFile() {
      resetIntake();
      const revision = state.quickRevision;
      const file = nodes.quickFile.files?.[0];
      if (!file) { renderIntake(); return; }
      // Clear a previous pasted record so a failed file cannot leave a valid
      // looking stale batch available for confirmation.
      nodes.quickText.value = "";
      if (file.size > 1048576) { setQuickStatus("file_too_large", "err"); renderIntake(); return; }
      state.quickBusy = true;
      setQuickStatus("quick_reading", "working");
      renderIntake();
      let failureKey = "quick_file_error";
      try {
        const buffer = await file.arrayBuffer();
        if (disposed || revision !== state.quickRevision) return;
        if (buffer.byteLength > 1048576) throw new RangeError("size");
        failureKey = "invalid_encoding";
        let text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        nodes.quickText.value = text;
        failureKey = "quick_invalid";
        acceptIntake(importer.parse(text, { format: nodes.quickFormat.value }), revision, "import");
      } catch (error) {
        if (disposed || revision !== state.quickRevision) return;
        setQuickStatus(error?.name === "RangeError" ? "file_too_large" : failureKey, "err");
      } finally {
        if (!disposed && revision === state.quickRevision) { state.quickBusy = false; renderIntake(); }
      }
    }

    function appendIntake() {
      const pending = state.quickPending;
      if (disposed || !pending || pending.revision !== state.quickRevision || state.quickBusy) return;
      // Recalculate against the latest library: users may have edited, loaded
      // or replaced entries while inspecting an independent pending batch.
      const selected = selectedIntakeItems();
      if (!selected.length) return;
      const plan = plannedAppend(selected);
      if (!plan.ok || !plan.added) {
        setQuickStatus(plan.ok ? "quick_no_new" : "quick_invalid", plan.ok ? "" : "err");
        renderIntake();
        return;
      }
      const existingIds = new Set(state.items.map((item) => item.id));
      snapshot("append");
      state.undo[0].addedIds = plan.items.filter((item) => !existingIds.has(item.id)).map((item) => item.id);
      state.items = plan.items;
      state.selectedId = state.items.some((item) => item.id === state.selectedId)
        ? state.selectedId : state.items[0]?.id || null;
      invalidatePreview();
      rebuildEditor();
      resetIntake();
      setQuickStatus("quick_added", "ok", { added: plan.added, skipped: plan.skipped || 0 });
      render();
      setStatus("quick_added", { added: plan.added, skipped: plan.skipped || 0 }, "ok");
    }

    function renderUndo() {
      if (!nodes.undoBar) return;
      const entry = state.undo[0];
      nodes.undoBar.hidden = !entry;
      if (entry) {
        setText(nodes.undoButton, t(entry.kind === "append" ? "undo_append" : entry.kind === "remove" ? "undo_remove" : "undo_library"));
      }
    }

    function render() {
      if (disposed) return;
      const nextLocale = readLocale();
      if (nextLocale !== lastLocale) {
        lastLocale = nextLocale;
        locale = nextLocale;
        // Language switches are label-only. Keep the current editor values,
        // preview and error state intact; the host calls render() after its
        // language control changes.
        rebuildEditor();
      }
      renderStatusOnly();
      setText(nodes.summaryTitle, t("assistant"));
      setText(nodes.summaryHint, t("summary_hint"));
      setText(nodes.scope, t("scope"));
      setText(nodes.add, t(canImport ? "manual_add" : "add"));
      setText(nodes.entriesHeading, t("entries"));
      setText(nodes.styleLabel, t("style"));
      setText(nodes.styleMla, t("style_mla"));
      setText(nodes.styleApa, t("style_apa"));
      setText(nodes.styleScope, t("style_scope"));
      setText(nodes.editorHeading, t("editor"));
      setText(nodes.noSelection, t("no_selection"));
      for (const { node, textKey } of Object.values(labelNodes)) setText(node, t(textKey));
      setText(nodes.empty, t("empty_library"));
      setText(nodes.typeBook, t("type_book"));
      setText(nodes.typeArticle, t("type_article"));
      setText(nodes.typeWebpage, t("type_webpage"));
      setText(nodes.authorsLegend, t("authors"));
      setText(nodes.addAuthor, t("add_author"));
      setText(nodes.issuedLegend, t("issued"));
      setText(nodes.accessedLegend, t("accessed"));
      setText(nodes.originalSummary, t("original_text"));
      setText(nodes.originalHint, t("original_hint"));
      setText(nodes.originalText, currentItem()?.originalText || "");
      setText(nodes.deleteEntry, t("delete_entry"));
      setText(nodes.previewHeading, t("preview"));
      setText(nodes.previewButton, t(state.previewBusy ? "preview_busy" : "preview"));
      setText(nodes.previewNote, t("preview_note"));
      setText(nodes.copyButton, t("copy_text"));
      setText(nodes.copyRichButton, t("copy_rich"));
      setText(nodes.copyJsonButton, t("copy_json"));
      setText(nodes.exportJsonButton, t("download_json"));
      setText(nodes.htmlButton, t("download_html"));
      setText(nodes.wordButton, t("download_word"));
      setText(nodes.wordCancel, t("word_cancel"));
      setText(nodes.importExportHeading, t("import_export"));
      setText(nodes.importToggle, t("import_library_json"));
      setText(nodes.importHint, t("import_hint"));
      setText(nodes.importTextLabel, t("import_text"));
      setText(nodes.chooseFileLabel, t("choose_file"));
      nodes.importText.setAttribute("aria-label", t("import_text"));
      nodes.importFile.setAttribute("aria-label", t("choose_file"));
      nodes.previewBody.setAttribute("aria-label", t("preview"));
      setText(nodes.reviewButton, t("review"));
      setText(nodes.reviewHeading, t("review_import"));
      setText(nodes.reviewTitles, t("review_titles"));
      setText(nodes.applyImportButton, t("apply_import"));
      setText(nodes.cancelImportButton, t("cancel"));
      setText(nodes.cancelReviewButton, t("cancel"));
      setText(nodes.saveButton, t("save"));
      setText(nodes.loadButton, t("load"));
      setText(nodes.removeSavedButton, t("remove_saved"));
      setText(nodes.saveHint, t("save_hint"));
      setText(nodes.loadHint, t("load_hint"));
      setText(nodes.removeHint, t("remove_hint"));
      setText(nodes.sessionNote, t("session_note"));
      setText(nodes.exportNote, t("export_note"));
      setText(nodes.wordNote, t("word_note"));
      setText(nodes.importNote, t("import_note"));
      setText(nodes.replaceNote, t("replace_note"));
      setText(nodes.warningNote, t("warning_note"));
      setText(nodes.errorNote, t("error_note"));
      setText(nodes.libraryJsonLabel, t("library_json"));
      setText(nodes.undoButton, state.undo[0] ? t(state.undo[0].kind === "append" ? "undo_append" : state.undo[0].kind === "remove" ? "undo_remove" : "undo_library") : t("undo"));
      nodes.styleSelect.value = state.style;
      nodes.styleSelect.setAttribute("aria-label", t("style"));
      nodes.editorSection.hidden = false;
      nodes.noSelection.hidden = Boolean(currentItem());
      nodes.editorFields.hidden = !currentItem();
      if (currentItem()) {
        nodes.typeSelect.value = currentItem().type;
        renderItemList();
        renderEditorVisibility();
        renderIssues();
      } else {
        renderItemList();
        renderIssues();
      }
      renderPreview();
      renderPreviewIssues();
      renderPersistence();
      renderImport();
      renderIntake();
      renderPortable();
      renderUndo();
      if (nodes.fallback) nodes.fallback.hidden = !state.fallbackVisible;
    }

    function renderEditorVisibility() {
      const item = currentItem();
      if (!item) {
        if (nodes.editorFields) nodes.editorFields.hidden = true;
        return;
      }
      nodes.editorFields.hidden = false;
      const type = item.type;
      const show = (node, visible) => { if (node) node.hidden = !visible; };
      show(nodes.publisherWrap, type === "book");
      show(nodes.editionWrap, type === "book");
      show(nodes.containerWrap, type === "article-journal" || type === "webpage");
      show(nodes.volumeWrap, type === "article-journal");
      show(nodes.issueWrap, type === "article-journal");
      show(nodes.pageWrap, type === "article-journal");
      show(nodes.accessedWrap, type === "webpage");
      show(nodes.issuedWrap, true);
      setText(nodes.originalText, item.originalText || "");
      nodes.originalWrap.hidden = !item.originalText;
      if (nodes.authorsEmpty) nodes.authorsEmpty.hidden = Boolean(item.authors.length);
    }

    function rebuildEditor() {
      if (rebuilding) return;
      rebuilding = true;
      try {
        const item = currentItem();
        if (!item) {
          nodes.noSelection.hidden = false;
          nodes.editorFields.hidden = true;
          return;
        }
        nodes.noSelection.hidden = true;
        nodes.editorFields.hidden = false;
        nodes.typeSelect.value = item.type;
        nodes.titleInput.value = item.title || "";
        for (const [key, node] of Object.entries(nodes.stringInputs)) {
          node.value = item[key] || "";
        }
        const issued = dateValues(item.issued);
        nodes.issued.year.value = issued.year;
        nodes.issued.month.value = issued.month;
        nodes.issued.day.value = issued.day;
        const accessed = dateValues(item.accessed);
        nodes.accessed.year.value = accessed.year;
        nodes.accessed.month.value = accessed.month;
        nodes.accessed.day.value = accessed.day;
        renderAuthors();
        renderEditorVisibility();
        renderIssues();
      } finally {
        rebuilding = false;
      }
    }

    // ---- DOM construction -------------------------------------------------
    const rootElement = make("details", "fc-citations");
    nodes.summary = make("summary", "fc-citations-summary");
    nodes.summaryTitle = make("span", "fc-citations-summary-title", t("assistant"));
    nodes.summaryHint = make("span", "fc-citations-summary-hint", t("summary_hint"));
    append(nodes.summary, nodes.summaryTitle, nodes.summaryHint);
    rootElement.append(nodes.summary);

    const body = make("div", "fc-citations-body");
    nodes.scope = make("p", "fc-citations-scope", t("scope"));
    body.append(nodes.scope);

    nodes.quickLabels = [];
    const quickNode = (tag, className, key) => {
      const node = make(tag, className, t(key));
      nodes.quickLabels.push([node, key]);
      return node;
    };
    const quickButton = (key, action, primary = false) => {
      const node = button(t(key), action, "fc-citations-button" + (primary ? " is-primary" : ""));
      nodes.quickLabels.push([node, key]);
      return node;
    };
    const quickField = (key, control) => append(make("label", "fc-citations-field"),
      quickNode("span", "fc-citations-label", key), control);
    nodes.quickSection = make("section", "fc-citations-intake");
    nodes.quickHeading = quickNode("h3", "", "quick_add");
    nodes.quickHeading.id = `${instanceId}-intake-title`;
    nodes.quickSection.setAttribute("aria-labelledby", nodes.quickHeading.id);
    nodes.quickHint = quickNode("p", "fc-citations-hint", "quick_hint");
    const modes = make("div", "fc-citations-intake-modes");
    nodes.quickDoiTab = quickButton("quick_doi", "intake-doi");
    nodes.quickImportTab = quickButton("quick_import", "intake-import");
    append(modes, nodes.quickDoiTab, nodes.quickImportTab);
    const setMode = (mode) => {
      if (state.quickMode === mode) return;
      resetIntake();
      state.quickMode = mode;
      renderIntake();
    };
    nodes.quickDoiTab.addEventListener("click", () => setMode("doi"));
    nodes.quickImportTab.addEventListener("click", () => setMode("import"));

    nodes.quickDoiPanel = make("div", "fc-citations-intake-panel");
    nodes.quickDoiInput = make("textarea", "fc-citations-textarea fc-citations-doi-input");
    nodes.quickDoiInput.setAttribute("data-field", "intake-doi");
    nodes.quickDoiInput.rows = canBatch ? 3 : 1;
    nodes.quickDoiInput.maxLength = canBatch ? 32768 : 2048;
    nodes.quickDoiInput.spellcheck = false;
    nodes.quickDoiInput.autocomplete = "off";
    nodes.quickDoiInput.setAttribute("autocapitalize", "none");
    nodes.quickDoiInput.addEventListener("input", () => { resetIntake(); renderIntake(); });
    nodes.quickDoiInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (!canBatch || event.ctrlKey || event.metaKey)) { event.preventDefault(); queryDoi(); }
    });
    nodes.quickQuery = quickButton("quick_query", "intake-query", true);
    nodes.quickCancel = quickButton("quick_cancel", "intake-cancel");
    nodes.quickQuery.addEventListener("click", queryDoi);
    nodes.quickCancel.addEventListener("click", cancelIntakeLookup);
    const doiRow = make("div", "fc-citations-intake-doi-row");
    const doiActions = append(make("div", "fc-citations-intake-actions"), nodes.quickQuery, nodes.quickCancel);
    nodes.quickDoiLabel = quickNode("span", "fc-citations-label", "quick_doi_label");
    append(doiRow, append(make("label", "fc-citations-field"), nodes.quickDoiLabel, nodes.quickDoiInput), doiActions);
    nodes.quickPrivacy = quickNode("p", "fc-citations-note fc-citations-intake-privacy", "quick_privacy");
    nodes.quickPrivacy.id = `${instanceId}-intake-privacy`;
    nodes.quickDoiInput.setAttribute("aria-describedby", nodes.quickPrivacy.id);
    nodes.batchHint = quickNode("p", "fc-citations-hint", "batch_hint");
    append(nodes.quickDoiPanel, doiRow, nodes.quickPrivacy,
      nodes.batchHint, quickNode("p", "fc-citations-hint", "quick_lookup_hint"));
    nodes.batchPanel = make("section", "fc-citations-batch");
    nodes.batchHeading = quickNode("h4", "", "batch_rows");
    nodes.batchHeading.id = `${instanceId}-batch-title`;
    nodes.batchPanel.setAttribute("aria-labelledby", nodes.batchHeading.id);
    nodes.batchProgress = make("p", "fc-citations-hint");
    nodes.batchCurrent = make("p", "fc-citations-hint");
    nodes.batchRows = make("ol", "fc-citations-batch-rows");
    append(nodes.batchPanel, nodes.batchHeading, nodes.batchProgress, nodes.batchCurrent, nodes.batchRows);

    nodes.quickImportPanel = make("div", "fc-citations-intake-panel");
    nodes.quickText = make("textarea", "fc-citations-textarea fc-citations-intake-text");
    nodes.quickText.setAttribute("data-field", "intake-text");
    nodes.quickText.spellcheck = false;
    nodes.quickText.addEventListener("input", () => { resetIntake(); renderIntake(); });
    nodes.quickFormat = make("select", "fc-citations-select");
    nodes.quickFormat.setAttribute("data-field", "intake-format");
    const autoFormat = quickNode("option", "", "quick_auto");
    autoFormat.value = "auto";
    nodes.quickFormat.append(autoFormat);
    for (const [value, label] of [["bibtex", "BibTeX"], ["ris", "RIS"], ["json", "CSL JSON"]]) {
      const option = make("option", "", label); option.value = value; nodes.quickFormat.append(option);
    }
    nodes.quickFormat.addEventListener("change", () => { resetIntake(); renderIntake(); });
    nodes.quickFile = make("input", "fc-citations-file");
    nodes.quickFile.type = "file";
    nodes.quickFile.accept = ".bib,.ris,.json,.txt,application/json,text/plain,application/x-bibtex,application/x-research-info-systems";
    nodes.quickFile.setAttribute("data-field", "intake-file");
    nodes.quickFile.addEventListener("change", readIntakeFile);
    nodes.quickReviewButton = quickButton("quick_review", "intake-review", true);
    nodes.quickReviewButton.addEventListener("click", reviewIntake);
    const importControls = append(make("div", "fc-citations-intake-import-controls"),
      quickField("quick_format", nodes.quickFormat),
      quickField("quick_choose_file", nodes.quickFile), nodes.quickReviewButton);
    append(nodes.quickImportPanel, quickNode("p", "fc-citations-hint", "quick_import_hint"),
      quickField("quick_text", nodes.quickText), importControls);

    nodes.quickStatus = make("p", "fc-citations-intake-status");
    nodes.quickStatus.setAttribute("role", "status");
    nodes.quickStatus.setAttribute("aria-live", "polite");
    nodes.quickStatus.setAttribute("aria-atomic", "true");
    nodes.quickIssues = make("div", "fc-citations-issues");
    nodes.quickReview = make("section", "fc-citations-intake-review");
    nodes.quickReview.hidden = true;
    nodes.quickReviewHeading = quickNode("h4", "", "quick_review_title");
    nodes.quickReviewHeading.id = `${instanceId}-intake-review-title`;
    nodes.quickReview.setAttribute("aria-labelledby", nodes.quickReviewHeading.id);
    nodes.quickCount = make("p", "fc-citations-hint");
    nodes.quickDetectedFormat = make("p", "fc-citations-hint");
    nodes.quickReviewList = make("ol", "fc-citations-intake-results");
    nodes.quickCheckboxes = [];
    nodes.quickSelectAll = quickButton("select_all", "intake-select-all");
    nodes.quickSelectNone = quickButton("select_none", "intake-select-none");
    const selectBatch = (all) => {
      if (!state.quickPending || state.quickBusy) return;
      state.quickSelected = new Set(all ? state.quickPending.items.map((_, index) => index) : []);
      renderIntake();
    };
    nodes.quickSelectAll.addEventListener("click", () => selectBatch(true));
    nodes.quickSelectNone.addEventListener("click", () => selectBatch(false));
    nodes.quickPlanIssues = make("div", "fc-citations-issues");
    nodes.quickAppend = button(t("quick_append", { count: 0 }), "intake-append", "fc-citations-button is-primary");
    nodes.quickAppend.addEventListener("click", appendIntake);
    nodes.quickDismiss = quickButton("quick_dismiss", "intake-dismiss");
    nodes.quickDismiss.addEventListener("click", () => { resetIntake(); renderIntake(); });
    append(nodes.quickReview, nodes.quickReviewHeading, nodes.quickDetectedFormat, nodes.quickCount,
      quickNode("p", "fc-citations-hint", "quick_review_hint"),
      quickNode("p", "fc-citations-hint", "select_hint"),
      append(make("div", "fc-citations-intake-actions"), nodes.quickSelectAll, nodes.quickSelectNone), nodes.quickReviewList,
      nodes.quickPlanIssues, append(make("div", "fc-citations-intake-actions"), nodes.quickAppend, nodes.quickDismiss));
    append(nodes.quickSection, nodes.quickHeading, nodes.quickHint, modes,
      nodes.quickDoiPanel, nodes.quickImportPanel, nodes.quickStatus, nodes.quickIssues,
      nodes.batchPanel, nodes.quickReview);
    body.append(nodes.quickSection);

    const toolbar = make("div", "fc-citations-toolbar");
    nodes.add = button(t(canImport ? "manual_add" : "add"), "add", "fc-citations-button" + (canImport ? "" : " is-primary"));
    nodes.add.addEventListener("click", addEntry);
    const styleWrap = make("label", "fc-citations-field fc-citations-style");
    nodes.styleLabel = make("span", "fc-citations-label", t("style"));
    nodes.styleSelect = make("select", "fc-citations-select");
    nodes.styleSelect.setAttribute("data-field", "style");
    nodes.styleMla = make("option", "", t("style_mla")); nodes.styleMla.value = "mla";
    nodes.styleApa = make("option", "", t("style_apa")); nodes.styleApa.value = "apa";
    nodes.styleSelect.append(nodes.styleMla, nodes.styleApa);
    nodes.styleSelect.addEventListener("change", () => {
      state.style = nodes.styleSelect.value === "apa" ? "apa" : "mla";
      invalidatePreview();
      render();
    });
    append(styleWrap, nodes.styleLabel, nodes.styleSelect);
    nodes.status = make("span", "fc-citations-status", t("status_ready"));
    nodes.status.setAttribute("role", "status");
    nodes.status.setAttribute("aria-live", "polite");
    append(toolbar, nodes.add, styleWrap, nodes.status);
    body.append(toolbar);

    const grid = make("div", "fc-citations-grid");
    const librarySection = make("section", "fc-citations-library");
    nodes.entriesHeading = make("h3", "", t("entries"));
    nodes.entryCount = make("p", "fc-citations-count", t("entries_count", { count: 0 }));
    nodes.entryCount.setAttribute("aria-live", "polite");
    nodes.empty = make("p", "fc-citations-hint", t("empty_library"));
    nodes.itemList = make("ul", "fc-citations-list");
    nodes.filterLabels = [];
    const filterNode = (tag, className, key) => {
      const node = make(tag, className, t(key));
      nodes.filterLabels.push([node, key]);
      return node;
    };
    const filters = make("div", "fc-citations-filters");
    nodes.libraryQuery = input("search", "", "library-query");
    nodes.libraryQuery.maxLength = 500;
    nodes.libraryQuery.setAttribute("autocomplete", "off");
    nodes.libraryQueryHint = filterNode("p", "fc-citations-hint", "library_search_hint");
    nodes.libraryQueryHint.id = `${instanceId}-library-search-hint`;
    nodes.libraryQuery.setAttribute("aria-describedby", nodes.libraryQueryHint.id);
    nodes.libraryType = make("select", "fc-citations-select");
    nodes.libraryType.setAttribute("data-field", "library-type");
    for (const [value, key] of [["all", "library_all_types"], ["book", "type_book"],
      ["article-journal", "type_article"], ["webpage", "type_webpage"]]) {
      const option = filterNode("option", "", key); option.value = value; nodes.libraryType.append(option);
    }
    nodes.clearFilters = button(t("library_clear"), "library-clear");
    nodes.filterLabels.push([nodes.clearFilters, "library_clear"]);
    nodes.noMatches = filterNode("p", "fc-citations-hint", "library_no_matches");
    nodes.hiddenSelection = filterNode("p", "fc-citations-hidden-selection", "library_hidden_selection");
    nodes.hiddenSelection.setAttribute("data-field", "library-hidden-selection");
    append(filters, append(make("label", "fc-citations-field"), filterNode("span", "fc-citations-label", "library_search"), nodes.libraryQuery),
      nodes.libraryQueryHint,
      append(make("label", "fc-citations-field"), filterNode("span", "fc-citations-label", "library_type"), nodes.libraryType), nodes.clearFilters);
    nodes.libraryQuery.addEventListener("input", () => changeFilters(nodes.libraryQuery.value, state.typeFilter));
    nodes.libraryType.addEventListener("change", () => changeFilters(state.query, nodes.libraryType.value));
    nodes.clearFilters.addEventListener("click", () => changeFilters("", "all"));
    const persistence = make("div", "fc-citations-persistence");
    nodes.savedState = make("p", "fc-citations-saved-state");
    nodes.savedState.setAttribute("aria-live", "polite");
    nodes.saveButton = button(t("save"), "save");
    nodes.loadButton = button(t("load"), "load");
    nodes.removeSavedButton = button(t("remove_saved"), "remove-saved");
    nodes.saveHint = make("p", "fc-citations-hint", t("save_hint"));
    nodes.loadHint = make("p", "fc-citations-hint", t("load_hint"));
    nodes.removeHint = make("p", "fc-citations-hint", t("remove_hint"));
    nodes.sessionNote = make("p", "fc-citations-note", t("session_note"));
    append(persistence, nodes.savedState, nodes.saveButton, nodes.loadButton, nodes.removeSavedButton,
      nodes.saveHint, nodes.loadHint, nodes.removeHint, nodes.sessionNote);
    const ie = make("div", "fc-citations-io");
    nodes.importExportHeading = make("h4", "", t("import_export"));
    nodes.importToggle = button(t("import_export"), "import-toggle");
    nodes.copyJsonButton = button(t("copy_json"), "json-copy");
    nodes.exportJsonButton = button(t("download_json"), "json-download");
    nodes.libraryJsonLabel = make("span", "fc-citations-hint", t("library_json"));
    nodes.exportNote = make("p", "fc-citations-note", t("export_note"));
    append(ie, nodes.importExportHeading, nodes.importToggle, nodes.copyJsonButton,
      nodes.exportJsonButton, nodes.exportNote);
    append(librarySection, nodes.entriesHeading, filters, nodes.entryCount, nodes.empty, nodes.noMatches,
      nodes.hiddenSelection, nodes.itemList,
      persistence, ie);

    nodes.portableLabels = [];
    const portableNode = (tag, className, key) => {
      const node = make(tag, className, t(key));
      nodes.portableLabels.push([node, key]);
      return node;
    };
    nodes.portablePanel = make("details", "fc-citations-portable");
    nodes.portableSummary = portableNode("summary", "", "portable_title");
    nodes.portableSummary.setAttribute("data-action", "portable-toggle");
    const portableBody = make("div", "fc-citations-portable-body");
    nodes.portableFormat = make("select", "fc-citations-select");
    nodes.portableFormat.setAttribute("data-field", "portable-format");
    for (const [value, label] of [["csl-json", "CSL-JSON"], ["ris", "RIS"]]) {
      const option = make("option", "", label); option.value = value; nodes.portableFormat.append(option);
    }
    nodes.portableBibtex = portableNode("option", "", "portable_bibtex");
    nodes.portableBibtex.value = "bibtex"; nodes.portableFormat.append(nodes.portableBibtex);
    nodes.portableScope = make("select", "fc-citations-select");
    nodes.portableScope.setAttribute("data-field", "portable-scope");
    nodes.portableAll = make("option", ""); nodes.portableAll.value = "all";
    nodes.portableFiltered = make("option", ""); nodes.portableFiltered.value = "filtered";
    nodes.portableScope.append(nodes.portableAll, nodes.portableFiltered);
    nodes.portablePrepare = button(t("portable_preview"), "portable-preview", "fc-citations-button is-primary");
    nodes.portableLabels.push([nodes.portablePrepare, "portable_preview"]);
    nodes.portableStatus = make("p", "fc-citations-portable-status");
    nodes.portableStatus.setAttribute("role", "status");
    nodes.portableStatus.setAttribute("aria-live", "polite");
    nodes.portableIssues = make("div", "fc-citations-issues fc-citations-portable-issues");
    nodes.portableResult = make("div", "fc-citations-portable-result");
    nodes.portableText = make("textarea", "fc-citations-textarea fc-citations-portable-text");
    nodes.portableText.setAttribute("data-field", "portable-text");
    nodes.portableText.readOnly = true;
    nodes.portableText.spellcheck = false;
    nodes.portableText.rows = 10;
    nodes.portableCopy = button(t("portable_copy"), "portable-copy");
    nodes.portableDownload = button(t("portable_download"), "portable-download");
    nodes.portableLabels.push([nodes.portableCopy, "portable_copy"], [nodes.portableDownload, "portable_download"]);
    const portableActions = append(make("div", "fc-citations-portable-actions"), nodes.portableCopy, nodes.portableDownload);
    append(nodes.portableResult, nodes.portableText, portableActions);
    const portableControls = append(make("div", "fc-citations-portable-controls"),
      append(make("label", "fc-citations-field"), portableNode("span", "fc-citations-label", "portable_format"), nodes.portableFormat),
      append(make("label", "fc-citations-field"), portableNode("span", "fc-citations-label", "portable_scope"), nodes.portableScope));
    append(portableBody, portableNode("p", "fc-citations-note", "portable_hint"), portableControls,
      portableNode("p", "fc-citations-hint", "portable_format_hint"), nodes.portablePrepare,
      nodes.portableStatus, nodes.portableIssues, nodes.portableResult);
    append(nodes.portablePanel, nodes.portableSummary, portableBody);
    nodes.portableFormat.addEventListener("change", () => {
      state.portableFormat = Object.prototype.hasOwnProperty.call(PORTABLE_FORMATS, nodes.portableFormat.value)
        ? nodes.portableFormat.value : "csl-json";
      invalidatePortable(state.portablePending ? "portable_stale" : ""); renderPortable();
    });
    nodes.portableScope.addEventListener("change", () => {
      state.portableScope = nodes.portableScope.value === "filtered" ? "filtered" : "all";
      invalidatePortable(state.portablePending ? "portable_stale" : ""); renderPortable();
    });
    nodes.portablePrepare.addEventListener("click", preparePortable);
    nodes.portableCopy.addEventListener("click", copyPortable);
    nodes.portableDownload.addEventListener("click", downloadPortable);
    grid.append(librarySection);

    const editorSection = make("section", "fc-citations-editor");
    nodes.editorSection = editorSection;
    nodes.editorHeading = make("h3", "", t("editor"));
    nodes.noSelection = make("p", "fc-citations-hint", t("no_selection"));
    nodes.editorFields = make("div", "fc-citations-editor-fields");
    nodes.typeSelect = select("type", []);
    nodes.typeBook = make("option", "", t("type_book")); nodes.typeBook.value = "book";
    nodes.typeArticle = make("option", "", t("type_article")); nodes.typeArticle.value = "article-journal";
    nodes.typeWebpage = make("option", "", t("type_webpage")); nodes.typeWebpage.value = "webpage";
    nodes.typeSelect.append(nodes.typeBook, nodes.typeArticle, nodes.typeWebpage);
    nodes.typeSelect.addEventListener("change", () => {
      const item = currentItem();
      if (!item) return;
      item.type = nodes.typeSelect.value;
      invalidatePreview();
      rebuildEditor();
      render();
    });
    nodes.titleInput = input("text", "", "title");
    nodes.titleInput.addEventListener("input", () => {
      updateCurrent((item) => { item.title = nodes.titleInput.value; });
    });
    nodes.authorsLegend = make("legend", "", t("authors"));
    nodes.authorsList = make("div", "fc-citations-authors");
    nodes.addAuthor = button(t("add_author"), "add-author");
    nodes.addAuthor.addEventListener("click", addAuthor);
    const authorsFieldset = make("fieldset", "fc-citations-authors-fieldset");
    append(authorsFieldset, nodes.authorsLegend, nodes.authorsList, nodes.addAuthor);
    nodes.issuedWrap = buildDateGroup("issued");
    nodes.issuedLegend = nodes.issued.legend;
    nodes.accessedWrap = buildDateGroup("accessed");
    nodes.accessedLegend = nodes.accessed.legend;

    nodes.stringInputs = {};
    const stringFields = [
      ["publisher", "publisher", "publisherWrap"],
      ["containerTitle", "container", "containerWrap"],
      ["volume", "volume", "volumeWrap"],
      ["issue", "issue", "issueWrap"],
      ["page", "page", "pageWrap"],
      ["edition", "edition", "editionWrap"],
      ["DOI", "doi", "doiWrap"],
      ["URL", "url", "urlWrap"],
      ["language", "language", "languageWrap"],
    ];
    const stringGrid = make("div", "fc-citations-fields");
    for (const [key, labelKey, wrapName] of stringFields) {
      const control = input(key === "URL" ? "url" : "text", "", key);
      control.addEventListener("input", () => {
        updateCurrent((item) => { item[key] = control.value; });
      });
      nodes.stringInputs[key] = control;
      const wrap = fieldKey(labelKey, control);
      nodes[wrapName] = wrap;
      stringGrid.append(wrap);
    }

    nodes.originalWrap = make("details", "fc-citations-original");
    nodes.originalSummary = make("summary", "", t("original_text"));
    nodes.originalHint = make("p", "fc-citations-hint", t("original_hint"));
    nodes.originalText = make("pre", "fc-citations-original-text", "");
    append(nodes.originalWrap, nodes.originalSummary, nodes.originalHint, nodes.originalText);
    nodes.editorIssues = make("div", "fc-citations-issues");
    nodes.deleteEntry = button(t("delete_entry"), "delete-entry", "fc-citations-button is-danger");
    nodes.deleteEntry.addEventListener("click", removeEntry);
    append(nodes.editorFields,
      fieldKey("type", nodes.typeSelect),
      fieldKey("title", nodes.titleInput),
      authorsFieldset, nodes.issuedWrap, nodes.accessedWrap,
      stringGrid, nodes.originalWrap, nodes.editorIssues, nodes.deleteEntry);
    append(editorSection, nodes.editorHeading, nodes.noSelection, nodes.editorFields);
    grid.append(editorSection);

    const previewSection = make("section", "fc-citations-preview");
    nodes.previewHeading = make("h3", "", t("preview"));
    nodes.previewButton = button(t("preview"), "preview", "fc-citations-button is-primary");
    nodes.previewButton.addEventListener("click", previewBibliography);
    nodes.previewStatus = make("p", "fc-citations-preview-status", t("preview_required"));
    nodes.previewStatus.setAttribute("role", "status");
    nodes.previewStatus.setAttribute("aria-live", "polite");
    nodes.styleScope = make("p", "fc-citations-note", t("style_scope"));
    nodes.previewNote = make("p", "fc-citations-note", t("preview_note"));
    nodes.previewHeadingText = make("h4", "fc-citations-preview-heading", "");
    nodes.previewBody = make("div", "fc-citations-preview-body");
    nodes.previewIssues = make("div", "fc-citations-issues");
    nodes.copyButton = button(t("copy_text"), "copy");
    nodes.copyRichButton = button(t("copy_rich"), "copy-rich");
    nodes.copyJsonButton = nodes.copyJsonButton || button(t("copy_json"), "json-copy");
    nodes.htmlButton = button(t("download_html"), "html");
    nodes.wordButton = button(t("download_word"), "word");
    nodes.wordCancel = button(t("word_cancel"), "word-cancel");
    nodes.wordCancel.hidden = true;
    nodes.wordCancel.addEventListener("click", () => {
      if (!state.busyExport || !wordController || wordController.signal.aborted) return;
      wordController.abort();
      setStatus("word_cancelled");
      render();
    });
    nodes.wordNote = make("p", "fc-citations-note", t("word_note"));
    nodes.wordLinkWrap = make("p", "fc-citations-word-link");
    nodes.wordLink = make("a", "");
    nodes.wordLink.target = "_blank";
    nodes.wordLink.rel = "noopener";
    nodes.wordLink.hidden = true;
    nodes.wordLinkWrap.append(nodes.wordLink);
    nodes.previewActions = make("div", "fc-citations-preview-actions");
    append(nodes.previewActions, nodes.copyButton, nodes.copyRichButton,
      nodes.htmlButton, nodes.wordButton, nodes.wordCancel);
    nodes.fallback = make("textarea", "fc-citations-fallback");
    nodes.fallback.readOnly = true;
    nodes.fallback.hidden = true;
    nodes.fallback.setAttribute("aria-label", t("copy_text"));
    append(previewSection, nodes.previewHeading, nodes.previewButton, nodes.previewStatus,
      nodes.styleScope, nodes.previewNote, nodes.previewHeadingText, nodes.previewBody,
      nodes.previewIssues, nodes.previewActions, nodes.wordLinkWrap, nodes.wordNote, nodes.fallback);
    grid.append(previewSection);
    body.append(grid, nodes.portablePanel);

    const importPanel = make("section", "fc-citations-import");
    importPanel.hidden = true;
    nodes.importPanel = importPanel;
    nodes.importHint = make("p", "fc-citations-hint", t("import_hint"));
    nodes.importTextLabel = make("span", "fc-citations-label", t("import_text"));
    nodes.importText = make("textarea", "fc-citations-textarea");
    nodes.importText.setAttribute("data-field", "import-json");
    nodes.importFile = make("input", "fc-citations-file");
    nodes.importFile.type = "file";
    nodes.importFile.setAttribute("data-field", "library-file");
    nodes.importFile.accept = ".json,application/json";
    nodes.chooseFileLabel = make("span", "fc-citations-label", t("choose_file"));
    nodes.reviewButton = button(t("review"), "review-import");
    nodes.cancelImportButton = button(t("cancel"), "cancel-import");
    nodes.importIssues = make("div", "fc-citations-issues");
    nodes.importNote = make("p", "fc-citations-note", t("import_note"));
    nodes.reviewSection = make("div", "fc-citations-review");
    nodes.reviewSection.hidden = true;
    nodes.reviewHeading = make("h4", "", t("review_import"));
    nodes.reviewCount = make("p", "", "");
    nodes.reviewTitles = make("p", "", t("review_titles"));
    nodes.reviewList = make("ul", "fc-citations-review-list");
    nodes.applyImportButton = button(t("apply_import"), "apply-import", "fc-citations-button is-primary");
    nodes.cancelReviewButton = button(t("cancel"), "cancel-review");
    nodes.replaceNote = make("p", "fc-citations-note", t("replace_note"));
    append(nodes.reviewSection, nodes.reviewHeading, nodes.reviewCount, nodes.reviewTitles, nodes.reviewList,
      nodes.replaceNote, nodes.applyImportButton, nodes.cancelReviewButton);
    const fileLabel = make("label", "fc-citations-file-label");
    append(fileLabel, nodes.chooseFileLabel, nodes.importFile);
    append(importPanel, nodes.importHint, nodes.importTextLabel, nodes.importText, fileLabel,
      nodes.reviewButton, nodes.cancelImportButton, nodes.importIssues, nodes.reviewSection, nodes.importNote);
    body.append(importPanel);

    const undoBar = make("div", "fc-citations-undo");
    undoBar.hidden = true;
    nodes.undoBar = undoBar;
    nodes.undoButton = button(t("undo"), "undo");
    nodes.undoButton.addEventListener("click", undo);
    undoBar.append(nodes.undoButton);
    body.append(undoBar);
    rootElement.append(body);

    // ---- Events -----------------------------------------------------------
    nodes.saveButton.addEventListener("click", saveLibrary);
    nodes.loadButton.addEventListener("click", loadLibrary);
    nodes.removeSavedButton.addEventListener("click", removeSavedLibrary);
    nodes.importToggle.addEventListener("click", () => {
      state.importRevision += 1;
      state.importOpen = !state.importOpen;
      state.pendingImport = null;
      state.importIssues = [];
      render();
    });
    nodes.reviewButton.addEventListener("click", reviewImport);
    nodes.cancelImportButton.addEventListener("click", () => {
      state.importRevision += 1;
      state.importOpen = false;
      state.pendingImport = null;
      state.importIssues = [];
      render();
    });
    nodes.applyImportButton.addEventListener("click", applyImport);
    nodes.cancelReviewButton.addEventListener("click", () => {
      state.importRevision += 1;
      state.pendingImport = null;
      state.importIssues = [];
      render();
    });
    nodes.importFile.addEventListener("change", readImportFile);
    nodes.importText.addEventListener("input", () => {
      state.importRevision += 1;
      state.pendingImport = null;
      state.importIssues = [];
      render();
    });
    nodes.copyButton.addEventListener("click", () => {
      if (state.preview && !state.previewStale) copyText(state.preview.text, "copied");
    });
    nodes.copyRichButton.addEventListener("click", copyRich);
    nodes.copyJsonButton.addEventListener("click", copyJson);
    nodes.exportJsonButton.addEventListener("click", downloadJson);
    nodes.htmlButton.addEventListener("click", downloadHtml);
    nodes.wordButton.addEventListener("click", exportWord);

    mount.replaceChildren(rootElement);

    // ---- Persistence / import / preview -----------------------------------
    function storageError(error) {
      const name = error && (error.name || error.code);
      setStatus(name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED"
        ? "storage_quota" : "storage_error", null, "err");
    }

    function getStored() {
      if (!storage) { setStatus("storage_unavailable", null, "err"); return undefined; }
      try { return storage.getItem(STORAGE_KEY); } catch (error) { storageError(error); return undefined; }
    }

    function saveLibrary() {
      if (!model) { setStatus("model_missing", null, "err"); return; }
      if (!storage) { setStatus("storage_unavailable", null, "err"); return; }
      const validation = model.validateLibrary(library());
      state.previewIssues = validation;
      if (!validation.valid) { setStatus("error_note", null, "err"); render(); return; }
      let serialized;
      try {
        serialized = model.stringifyLibrary(library());
      } catch (error) {
        setStatus(error && error.code === "json_too_large" ? "error_json_large" : "error_note", null, "err");
        render();
        return;
      }
      try {
        storage.setItem(STORAGE_KEY, serialized);
        state.savedFingerprint = fingerprint();
        setStatus("saved", null, "ok");
      } catch (error) {
        storageError(error);
      }
      render();
    }

    function loadLibrary() {
      if (!model) { setStatus("model_missing", null, "err"); return; }
      const text = getStored();
      if (text === undefined) { render(); return; }
      if (text === null) { setStatus("not_saved"); render(); return; }
      const parsed = model.parseLibraryJson(text);
      if (!parsed.ok) {
        state.importIssues = parsed.errors || [];
        setStatus("import_invalid", null, "err");
        render();
        return;
      }
      try {
        replaceLibrary(parsed.library.items.map((item) => model.createItem(item)), parsed.library.items[0]?.id || null, "library");
        state.savedFingerprint = fingerprint();
        setStatus("saved", null, "ok");
        render();
      } catch (error) {
        setStatus("import_invalid", null, "err");
        render();
      }
    }

    function removeSavedLibrary() {
      if (!storage) { setStatus("storage_unavailable", null, "err"); return; }
      try {
        storage.removeItem(STORAGE_KEY);
        state.savedFingerprint = null;
        setStatus("removed_saved", null, "ok");
      } catch (error) {
        storageError(error);
      }
      render();
    }

    async function readImportFile() {
      const revision = ++state.importRevision;
      state.pendingImport = null;
      state.importIssues = [];
      const file = nodes.importFile.files && nodes.importFile.files[0];
      if (!file) { render(); return; }
      render();
      const limit = model ? model.MAX_JSON_BYTES : 1048576;
      if (file.size > limit) {
        setStatus("file_too_large", null, "err");
        render();
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        if (disposed || revision !== state.importRevision) return;
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch (_) {
          setStatus("invalid_encoding", null, "err");
          render();
          return;
        }
        if (disposed || revision !== state.importRevision) return;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        nodes.importText.value = text;
        state.pendingImport = null;
        state.importIssues = [];
        setStatus("import_hint");
        render();
      } catch (_) {
        if (!disposed && revision === state.importRevision) {
          setStatus("invalid_encoding", null, "err");
          render();
        }
      }
    }

    function reviewImport() {
      if (!model) { setStatus("model_missing", null, "err"); return; }
      const raw = nodes.importText.value;
      const revision = state.importRevision;
      const parsed = model.parseLibraryJson(raw);
      if (revision !== state.importRevision || raw !== nodes.importText.value) {
        state.pendingImport = null;
        state.importIssues = [];
        render();
        return;
      }
      state.pendingImport = parsed.ok ? { library: parsed.library, raw, revision } : null;
      state.importIssues = parsed.errors || [];
      setStatus(parsed.ok ? "review_import" : "import_invalid", null, parsed.ok ? "" : "err");
      render();
    }

    function applyImport() {
      const pending = state.pendingImport;
      if (!pending || !model) return;
      if (disposed || pending.revision !== state.importRevision ||
          pending.raw !== nodes.importText.value) {
        state.pendingImport = null;
        state.importIssues = [];
        setStatus("import_stale", null, "err");
        render();
        return;
      }
      try {
        const items = pending.library.items.map((item) => model.createItem(item));
        replaceLibrary(items, items[0]?.id || null, "library");
        state.importRevision += 1;
        state.importOpen = false;
        state.pendingImport = null;
        state.importIssues = [];
        nodes.importText.value = "";
        setStatus("import_applied", null, "ok");
        render();
      } catch (_) {
        setStatus("import_invalid", null, "err");
        render();
      }
    }

    async function previewBibliography() {
      if (!model || !engine) { setStatus(model ? "engine_missing" : "model_missing", null, "err"); return; }
      const validation = model.validateLibrary(library());
      state.previewIssues = validation;
      if (!validation.valid) {
        state.previewStale = true;
        clearWordUrl();
        setStatus("error_note", null, "err");
        render();
        return;
      }
      clearWordUrl();
      const token = ++state.previewToken;
      const style = state.style;
      state.previewBusy = true;
      state.previewStale = true;
      setStatus("preview_busy", null, "working");
      render();
      try {
        const csl = model.toCslItems(library());
        const rendered = await engine.render(csl, style);
        if (token !== state.previewToken) return;
        if (!rendered || typeof rendered.html !== "string" || typeof rendered.text !== "string") {
          throw new Error("invalid engine result");
        }
        if (typeof engine.safeFragment !== "function") {
          const unsafe = new Error("safe fragment unavailable");
          unsafe.code = "unsafe_preview";
          throw unsafe;
        }
        let holder;
        try {
          const fragment = engine.safeFragment(rendered.html, document);
          if (!fragment) throw new Error("empty safe fragment");
          holder = document.createElement("div");
          holder.append(fragment);
        } catch (_) {
          const unsafe = new Error("unsafe preview");
          unsafe.code = "unsafe_preview";
          throw unsafe;
        }
        state.preview = rendered;
        state.previewStale = false;
        state.previewBusy = false;
        state.previewIssues = validation;
        renderPreviewContent(rendered, holder);
        setStatus("preview_ready", null, "ok");
        render();
      } catch (error) {
        if (token === state.previewToken) {
          state.previewBusy = false;
          state.previewStale = true;
          const code = error && error.code;
          if (code === "invalid_citation_doi") {
            setStatus("error_doi_engine", null, "err");
          } else if (code === "citation_output_too_large") {
            setStatus("error_engine_size", null, "err");
          } else if (code === "invalid_citations") {
            setStatus("error_engine_content", null, "err");
          } else if (code === "unsafe_preview" || code === "unsafe_citation_output") {
            setStatus("preview_unsafe", null, "err");
          } else {
            setStatus("preview_error", null, "err");
          }
          render();
        }
      }
    }

    function renderPreviewContent(rendered, holder) {
      nodes.previewHeadingText.textContent = rendered.heading || "";
      const children = holder.childNodes ? Array.from(holder.childNodes) : Array.from(holder.children || []);
      nodes.previewBody.replaceChildren(...children);
    }

    function fallbackCopy(text) {
      if (disposed) return;
      nodes.fallback.value = text;
      state.fallbackVisible = true;
      nodes.fallback.hidden = false;
      if (typeof nodes.fallback.focus === "function") nodes.fallback.focus();
      if (typeof nodes.fallback.select === "function") nodes.fallback.select();
      setStatus("copy_manual", null, "warn");
      render();
    }

    async function copyText(text, successKey) {
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (clipboard && typeof clipboard.writeText === "function") {
          await clipboard.writeText(text);
          if (disposed) return;
          state.fallbackVisible = false;
          setStatus(successKey || "copied", null, "ok");
          render();
          return;
        }
      } catch (_) {}
      fallbackCopy(text);
    }

    async function copyRich() {
      const clipboard = root.navigator && root.navigator.clipboard;
      if (!state.preview || state.previewStale || !engine || typeof engine.safeFragment !== "function" ||
          typeof root.ClipboardItem !== "function" || !clipboard ||
          typeof clipboard.write !== "function") {
        if (state.preview) await copyText(state.preview.text, "copied");
        return;
      }
      try {
        const holder = document.createElement("div");
        holder.append(engine.safeFragment(state.preview.html, document));
        const html = holder.innerHTML;
        const item = new root.ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([state.preview.text], { type: "text/plain" }),
        });
        await clipboard.write([item]);
        if (disposed) return;
        state.fallbackVisible = false;
        setStatus("copied", null, "ok");
        render();
      } catch (_) {
        await copyText(state.preview.text, "copied");
      }
    }

    function libraryJson() {
      if (!model) { setStatus("model_missing", null, "err"); return null; }
      try {
        const validation = model.validateLibrary(library());
        if (!validation.valid) {
          state.previewIssues = validation;
          setStatus("error_note", null, "err");
          render();
          return null;
        }
        return model.stringifyLibrary(library());
      } catch (error) {
        setStatus(error && error.code === "json_too_large" ? "error_json_large" : "error_note", null, "err");
        render();
        return null;
      }
    }

    async function copyJson() {
      const json = libraryJson();
      if (json !== null) await copyText(json, "json_copied");
    }

    function revokeUrl(url) {
      try {
        if (url && typeof url === "string" && url.startsWith("blob:") &&
            typeof URL !== "undefined" && URL.revokeObjectURL) {
          URL.revokeObjectURL(url);
        }
      } catch (_) {}
    }

    function downloadBlob(name, type, content) {
      if (!canDownload()) { setStatus("download_unavailable", null, "err"); return null; }
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      ownedUrls.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      if (document.body && typeof document.body.append === "function") document.body.append(anchor);
      else rootElement.append(anchor);
      anchor.click();
      if (typeof anchor.remove === "function") anchor.remove();
      const schedule = root.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
      if (schedule) {
        const timer = schedule(() => {
          downloadTimers.delete(timer);
          revokeUrl(url);
          ownedUrls.delete(url);
        }, DOWNLOAD_URL_TTL);
        downloadTimers.add(timer);
      }
      return url;
    }

    function downloadJson() {
      const json = libraryJson();
      if (json === null) return;
      const url = downloadBlob("formcapy-citations.v1.json", "application/json", json);
      if (url) setStatus("export_note", null, "ok");
      render();
    }

    function escapeHtml(text) {
      return String(text === undefined || text === null ? "" : text).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[character]));
    }

    function layoutNumber(value, fallback, minimum, maximum) {
      if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
      return Math.min(maximum, Math.max(minimum, value));
    }

    function exportLayoutStyle(layout) {
      const source = layout && typeof layout === "object" ? layout : {};
      // CSL reports a boolean for the standard half-inch hanging indent.
      // Preserve numeric adapters used by hosts which already supply pixels.
      const hanging = source.hangingindent === true ? 48
        : source.hangingindent === false ? 0
          : layoutNumber(source.hangingindent, 0, 0, 200);
      const line = layoutNumber(source.linespacing, 2, 0.8, 4);
      const entry = layoutNumber(source.entryspacing, 0, 0, 100);
      const maxoffset = layoutNumber(source.maxoffset, 0, 0, 500);
      const secondValue = source["second-field-align"];
      const second = secondValue === true || secondValue === "flush" || secondValue === "margin";
      const rules = [
        "body{font-family:Georgia,\"Times New Roman\",serif;line-height:" + line +
          ";max-width:42rem;margin:2rem auto;padding:0 1rem;color:#111}",
        "h1{font-size:1.2rem;line-height:1.4;text-align:center;margin:0 0 1.5rem}",
        ".csl-bib-body{margin:0}",
        ".csl-entry{margin-bottom:" + entry + "px;overflow-wrap:anywhere}",
        ".csl-entry:last-child{margin-bottom:0}",
        "a{color:inherit}",
        ".fc-export-source{margin-top:2rem;padding-top:.75rem;border-top:1px solid #ddd;color:#555;font-size:.75rem;line-height:1.4}",
      ];
      if (second) {
        rules.push(".csl-entry{display:flex;gap:.5em}");
        rules.push(".csl-left-margin{flex:0 0 " + maxoffset + "px}");
        rules.push(".csl-right-inline{flex:1;min-width:0}");
      } else if (hanging > 0) {
        rules.push(".csl-entry{padding-left:" + hanging + "px;text-indent:-" + hanging + "px}");
      }
      return rules.join("\n");
    }

    function downloadHtml() {
      if (!state.preview || state.previewStale || !engine || typeof engine.safeFragment !== "function" || !canDownload()) return;
      try {
        const holder = document.createElement("div");
        holder.append(engine.safeFragment(state.preview.html, document));
        const heading = String(state.preview.heading || "");
        const attribution = engine && typeof engine.attribution === "string"
          ? engine.attribution : "citeproc-js";
        const documentHtml = "<!doctype html><html><head><meta charset=\"utf-8\">" +
          "<meta name=\"generator\" content=\"FormCapy\"><title>" + escapeHtml(heading) +
          "</title><style>" + exportLayoutStyle(state.preview.layout) + "</style></head><body>" +
          (heading ? "<h1>" + escapeHtml(heading) + "</h1>" : "") +
          holder.innerHTML +
          "<p class=\"fc-export-source\">Generated locally with FormCapy. Citation rendering: " +
          escapeHtml(attribution) + ".</p></body></html>";
        const url = downloadBlob("formcapy-references.html", "text/html", documentHtml);
        if (url) setStatus("export_note", null, "ok");
      } catch (_) {
        setStatus("preview_error", null, "err");
      }
      render();
    }

    async function exportWord() {
      if (!state.preview || state.previewStale || !onExportWord || state.busyExport) return;
      const preview = state.preview;
      const token = state.previewToken;
      const style = state.style;
      const started = fingerprint();
      const controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
      wordController = controller;
      state.busyExport = true;
      setStatus("word_busy", null, "working");
      render();
      try {
        const result = await onExportWord(preview, { signal: controller?.signal });
        const resultUrl = result && typeof result.downloadUrl === "string" ? result.downloadUrl : null;
        if (disposed) {
          if (resultUrl) revokeUrl(resultUrl);
          return;
        }
        if (controller?.signal.aborted) {
          if (resultUrl) revokeUrl(resultUrl);
          if (token === state.previewToken && !state.previewStale) setStatus("word_cancelled");
          return;
        }
        if (token !== state.previewToken || state.preview !== preview ||
            state.previewStale || style !== state.style || started !== fingerprint()) {
          if (resultUrl) revokeUrl(resultUrl);
          return;
        }
        if (resultUrl) {
          clearWordUrl();
          state.wordUrl = resultUrl;
          ownedUrls.add(resultUrl);
          state.wordLink = true;
          nodes.wordLink.href = resultUrl;
          nodes.wordLink.download = result.name || "formcapy-references.docx";
          nodes.wordLink.textContent = result.name || t("word_ready");
          nodes.wordLink.hidden = false;
        }
        setStatus("word_ready", null, "ok");
      } catch (_) {
        if (!disposed && token === state.previewToken && !state.previewStale) {
          setStatus(controller?.signal.aborted ? "word_cancelled" : "word_error", null,
            controller?.signal.aborted ? "" : "err");
        }
      } finally {
        if (wordController === controller) wordController = null;
        state.busyExport = false;
        if (!disposed) {
          if (state.statusKey === "word_busy" &&
              (token !== state.previewToken || state.previewStale)) {
            setStatus("preview_stale", null, "warn");
          }
          render();
        }
      }
    }

    function snapshotState() {
      let copied;
      try { copied = JSON.parse(JSON.stringify(state.items)); } catch (_) { copied = []; }
      return {
        items: copied,
        selectedId: state.selectedId,
        style: state.style,
        preview: state.preview ? {
          style: state.preview.style, heading: state.preview.heading,
          text: state.preview.text, stale: state.previewStale,
        } : null,
        previewStale: state.previewStale,
        previewBusy: state.previewBusy,
        saved: state.savedFingerprint !== null && state.savedFingerprint === fingerprint(),
        pendingImport: Boolean(state.pendingImport),
        pendingIntake: Boolean(state.quickPending),
        intakeBusy: state.quickBusy,
        batchActive: state.batchRunning,
        batchRows: JSON.parse(JSON.stringify(state.batchRows)),
        query: state.query,
        typeFilter: state.typeFilter,
        visibleIds: visibleItems().map((item) => item.id),
        portableFormat: state.portableFormat,
        portableScope: state.portableScope,
        portablePending: Boolean(!disposed && state.portablePending && state.portablePending.source === portableSource()),
        undo: state.undo.length,
      };
    }

    function dispose() {
      wordController?.abort();
      disposed = true;
      lookupController?.abort();
      lookupController = null;
      state.quickRevision += 1;
      state.quickBusy = false;
      state.batchRunning = false;
      state.batchRows = [];
      state.quickPending = null;
      state.quickSelected = new Set();
      state.portableRevision += 1;
      state.portablePending = null;
      state.previewToken += 1;
      state.importRevision += 1;
      const clear = root.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout : null);
      for (const timer of downloadTimers) {
        if (clear) clear(timer);
      }
      downloadTimers.clear();
      for (const url of ownedUrls) revokeUrl(url);
      ownedUrls = new Set();
      state.wordUrl = null;
      state.wordLink = false;
      if (typeof rootElement.remove === "function") rootElement.remove();
    }

    render();
    return Object.freeze({ render, dispose, state: snapshotState });
  }

  root.FormCapyCitationAssistant = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : this);
