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
      warn_doi: "这个 DOI 格式可能无效。请预览前检查或清空；不会联网查询。",
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
      warn_doi: "This DOI does not match the expected format. Check or clear it before previewing; no online lookup is performed.",
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
      warn_doi: "Este DOI no tiene el formato esperado. Revísalo o bórralo antes de previsualizar; no se consulta en línea.",
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

  function create(options = {}) {
    const mount = options.mount;
    if (!mount || typeof mount.replaceChildren !== "function") {
      throw new TypeError("FormCapyCitationAssistant.create needs a mount element");
    }
    const model = options.model || root.FormCapyCitations;
    const engine = options.engine || root.FormCapyCitationEngine;
    let storage = null;
    try {
      storage = options.storage === undefined ? root.localStorage : options.storage;
    } catch (_) {
      storage = null;
    }
    const allowDownloads = options.allowDownloads !== false;
    const onExportWord = typeof options.onExportWord === "function" ? options.onExportWord : null;
    const getLocale = typeof options.getLocale === "function" ? options.getLocale : () => "en";
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
    };
    const nodes = {};
    const labelNodes = {};
    const downloadTimers = new Set();
    let wordController = null;
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
      state.items = entry.items;
      state.selectedId = entry.selectedId;
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
      for (const item of state.items) {
        const li = make("li", "fc-citations-list-item");
        const buttonNode = button("", "select", "fc-citations-item");
        buttonNode.setAttribute("aria-pressed", String(item.id === state.selectedId));
        const title = make("span", "fc-citations-item-title", item.title.trim() ? item.title : t("untitled"));
        const meta = make("span", "fc-citations-item-meta", typeLabel(item.type));
        append(buttonNode, title, meta);
        buttonNode.addEventListener("click", () => selectItem(item.id));
        if (item.id === state.selectedId) buttonNode.classList.add("is-selected");
        li.append(buttonNode);
        nodes.itemList.append(li);
      }
      setText(nodes.entryCount, t("entries_count", { count: state.items.length }));
      if (nodes.empty) nodes.empty.hidden = state.items.length > 0;
    }

    function renderIssues() {
      if (!nodes.editorIssues) return;
      const item = currentItem();
      const result = model && item ? model.validateItem(item) : { errors: [], warnings: [] };
      renderIssueBox(nodes.editorIssues, result.errors, result.warnings);
    }

    function renderIssueBox(container, errors, warnings) {
      if (!container) return;
      container.replaceChildren();
      const renderList = (titleKey, list, tone) => {
        if (!list.length) return;
        const section = make("div", "fc-citations-issues-" + tone);
        section.append(make("p", "fc-citations-issues-title", t(titleKey)));
        const ul = make("ul", "fc-citations-issues-list");
        const visible = list.slice(0, MAX_VISIBLE_ISSUES);
        for (const issue of visible) {
          const li = make("li", "", issueText(issue));
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

    function renderUndo() {
      if (!nodes.undoBar) return;
      const entry = state.undo[0];
      nodes.undoBar.hidden = !entry;
      if (entry) {
        setText(nodes.undoButton, t(entry.kind === "remove" ? "undo_remove" : "undo_library"));
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
      setText(nodes.add, t("add"));
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
      setText(nodes.undoButton, state.undo[0] ? t(state.undo[0].kind === "remove" ? "undo_remove" : "undo_library") : t("undo"));
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

    const toolbar = make("div", "fc-citations-toolbar");
    nodes.add = button(t("add"), "add", "fc-citations-button is-primary");
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
    nodes.empty = make("p", "fc-citations-hint", t("empty_library"));
    nodes.itemList = make("ul", "fc-citations-list");
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
    append(librarySection, nodes.entriesHeading, nodes.entryCount, nodes.empty, nodes.itemList,
      persistence, ie);
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
    body.append(grid);

    const importPanel = make("section", "fc-citations-import");
    importPanel.hidden = true;
    nodes.importPanel = importPanel;
    nodes.importHint = make("p", "fc-citations-hint", t("import_hint"));
    nodes.importTextLabel = make("span", "fc-citations-label", t("import_text"));
    nodes.importText = make("textarea", "fc-citations-textarea");
    nodes.importText.setAttribute("data-field", "import-json");
    nodes.importFile = make("input", "fc-citations-file");
    nodes.importFile.type = "file";
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
    nodes.undoButton.addEventListener("click", undo);

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
        undo: state.undo.length,
      };
    }

    function dispose() {
      wordController?.abort();
      disposed = true;
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
