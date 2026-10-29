/* Standalone file converter host. Components are initialized only after the
 * user explicitly converts a file; no document is sent to a server. */
(function () {
  "use strict";
  const LANGUAGES = ["zh", "en", "es"];
  const TEXT = {
    zh: {
      title: "PDF / Word 文件互转 · FormCapy", language: "界面语言", tools: "FormCapy 工具", home: "FormCapy 首页",
      paper: "论文排版", converter: "文件互转", skip: "跳到文件转换", eyebrow: "本地文件工具",
      heading: "PDF / Word 文件互转", intro: "选择文件和目标格式，转换后直接下载。",
      offline: "转换组件完整缓存后可离线使用；清除浏览器缓存后需要重新下载。",
      licenses: "第三方许可", sources: "Office 运行组件源码", license_nav: "许可与源码",
      unavailable: "本地转换工具未能加载。请检查程序文件是否完整，然后重新打开此页面。",
    },
    en: {
      title: "PDF / Word file converter · FormCapy", language: "Interface language", tools: "FormCapy tools", home: "FormCapy home",
      paper: "Paper formatter", converter: "File converter", skip: "Skip to file conversion", eyebrow: "LOCAL FILE TOOLS",
      heading: "Convert PDF and Word files.", intro: "Choose a file, choose its new format, then download the result.",
      offline: "Offline use is available after the conversion components are fully cached. Clearing the browser cache requires another download.",
      licenses: "Third-party licenses", sources: "Office runtime sources", license_nav: "Licenses and source",
      unavailable: "The local converter could not load. Check that its application files are complete, then reopen this page.",
    },
    es: {
      title: "Conversor de PDF / Word · FormCapy", language: "Idioma de la interfaz", tools: "Herramientas de FormCapy", home: "Inicio de FormCapy",
      paper: "Formato de trabajos", converter: "Convertir archivos", skip: "Ir a la conversión", eyebrow: "HERRAMIENTAS LOCALES",
      heading: "Convierte archivos PDF y Word.", intro: "Elige un archivo y su nuevo formato; después, descarga el resultado.",
      offline: "Puedes trabajar sin conexión cuando los componentes estén completamente en caché. Si borras la caché del navegador, tendrás que descargarlos otra vez.",
      licenses: "Licencias de terceros", sources: "Código fuente de Office", license_nav: "Licencias y código fuente",
      unavailable: "No se pudo cargar el conversor local. Comprueba que los archivos de la aplicación estén completos y vuelve a abrir esta página.",
    },
  };
  let storedLanguage;
  try { storedLanguage = localStorage.getItem("mlafmt.lang"); } catch (_) {}
  const browserLanguage = String(navigator.language || "en").toLowerCase().split(/[-_]/)[0];
  let language = LANGUAGES.includes(storedLanguage) ? storedLanguage : LANGUAGES.includes(browserLanguage) ? browserLanguage : "en";
  const mount = document.getElementById("document-converter-mount");
  const errorNode = document.getElementById("converter-page-error");
  let converter = null;
  let updates = null;
  let transport = null;
  let updating = false;
  let unavailable = false;
  let activeStage = null;
  let conversionSequence = 0;

  function renderLocale() {
    const text = TEXT[language];
    document.documentElement.lang = language;
    document.title = text.title;
    for (const node of document.querySelectorAll("[data-page-t]")) {
      const value = text[node.getAttribute("data-page-t")];
      if (value) node.textContent = value;
    }
    for (const value of LANGUAGES) {
      const button = document.getElementById("lang-" + value);
      if (button) { button.setAttribute("aria-pressed", String(value === language)); button.disabled = updating; }
    }
    document.getElementById("converter-languages")?.setAttribute("aria-label", text.language);
    document.getElementById("converter-tools")?.setAttribute("aria-label", text.tools);
    document.getElementById("converter-brand")?.setAttribute("aria-label", text.home);
    document.getElementById("converter-license-nav")?.setAttribute("aria-label", text.license_nav);
    if (unavailable) { errorNode.textContent = text.unavailable; errorNode.hidden = false; }
    converter?.setLocale();
    updates?.render();
  }
  for (const value of LANGUAGES) {
    document.getElementById("lang-" + value)?.addEventListener("click", () => {
      if (updating) return;
      language = value;
      try { localStorage.setItem("mlafmt.lang", value); } catch (_) {}
      renderLocale();
    });
  }
  const cancelled = () => Object.assign(new Error("cancelled"), { code: "cancelled" });
  async function convertLocal({ file, targetFormat, signal, onStage }) {
    const sequence = ++conversionSequence;
    activeStage = { sequence, callback: onStage };
    const progress = stage => { if (activeStage?.sequence === sequence) onStage?.(stage); };
    try {
      if (signal?.aborted) throw cancelled();
      if (file.name.toLowerCase().endsWith(".pdf")) {
        progress("extracting");
        const reconstructed = await transport.generate({
          request: { kind: "file_convert", target_format: "docx" }, file, signal,
        });
        if (signal?.aborted) throw cancelled();
        if (targetFormat === "docx") return {
          blob: reconstructed.blob,
          name: reconstructed.name,
          warnings: reconstructed.conversionWarnings || [],
        };
        const intermediate = new File([reconstructed.blob], reconstructed.name, { type: reconstructed.blob.type });
        const result = await window.FormCapyLocalOffice.convert(intermediate, targetFormat, { signal, onProgress: progress });
        return { ...result, warnings: [...(reconstructed.conversionWarnings || []), ...(result.warnings || [])] };
      }
      await transport.checkFile({ file, signal });
      if (signal?.aborted) throw cancelled();
      return await window.FormCapyLocalOffice.convert(file, targetFormat, { signal, onProgress: progress });
    } finally {
      if (activeStage?.sequence === sequence) activeStage = null;
    }
  }

  try {
    if (!window.MLAFMTTransport || !window.FormCapyDocumentConverter || !window.FormCapyLocalOffice || !mount) throw new Error("missing local components");
    transport = window.MLAFMTTransport.create({ mode: "browser" });
    if (transport.kind !== "browser") throw new Error("unsupported host");
    transport.onStage?.(stage => activeStage?.callback?.(stage));
    converter = window.FormCapyDocumentConverter.create({
      mount,
      getLocale: () => language,
      canStart: () => !updating,
      convert: convertLocal,
    });
    const panel = mount.querySelector("[data-fc-convert=panel]");
    if (panel) {
      panel.open = true;
      panel.setAttribute("aria-labelledby", "conversion-heading");
      const summary = panel.querySelector("summary");
      if (summary) summary.hidden = true;
    }
    if (window.FormCapyUpdates) updates = window.FormCapyUpdates.start({
      enabled: document.querySelector('meta[name="formcapy-offline"]')?.content === "true",
      version: document.querySelector('meta[name="formcapy-version"]')?.content || "",
      mount: document.getElementById("converter-update-mount"),
      getLocale: () => language,
      isBusy: () => Boolean(converter?.state().busy),
      onUpdating(active) {
        updating = active;
        mount.inert = active;
        renderLocale();
      },
    });
  } catch (_) {
    unavailable = true;
  }
  renderLocale();
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    activeStage = null;
    transport?.dispose?.();
    updates?.dispose?.();
  });
})();
