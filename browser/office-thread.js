/* UNO driver, loaded inside LibreOffice's existing pthread. */
/* global Module */
"use strict";
Module.zetajs.then((zetajs) => {
  const css = zetajs.uno.com.sun.star;
  const desktop = css.frame.Desktop.create(zetajs.getUnoComponentContext());
  const property = (Name, Value) => new css.beans.PropertyValue({ Name, Value });
  const short = (value) => new zetajs.Any(zetajs.type.short, value);
  const filters = { pdf: "writer_pdf_Export", docx: "Office Open XML Text", doc: "MS Word 97" };
  const interactions = zetajs.unoObject([css.task.XInteractionHandler], {
    handle(request) {
      for (const continuation of request.getContinuations()) {
        const abort = continuation.queryInterface(zetajs.type.interface(css.task.XInteractionAbort));
        if (abort) { abort.select(); break; }
      }
    },
  });
  zetajs.mainPort.onmessage = (event) => {
    const request = event.data || {};
    if (request.type !== "convert") return;
    let model;
    try {
      if (!filters[request.target] || !["doc", "docx"].includes(request.extension) ||
          !/^\/tmp\/formcapy-office-\d+\.(doc|docx)$/.test(request.from) ||
          !/^\/tmp\/formcapy-office-\d+-out\.(doc|docx|pdf)$/.test(request.to)) {
        throw Error("invalid conversion request");
      }
      model = desktop.loadComponentFromURL(`file://${request.from}`, "_blank", 0, [
        property("Hidden", true),
        property("ReadOnly", true),
        property("MacroExecutionMode", short(css.document.MacroExecMode.NEVER_EXECUTE)),
        property("UpdateDocMode", short(css.document.UpdateDocMode.NO_UPDATE)),
        property("InteractionHandler", interactions),
      ]);
      if (!model || !model.queryInterface(zetajs.type.interface(css.text.XTextDocument))) {
        throw Error("input is not a Word text document");
      }
      model.storeToURL(`file://${request.to}`, [
        property("Overwrite", true), property("FilterName", filters[request.target]),
      ]);
      zetajs.mainPort.postMessage({ type: "converted", id: request.id, to: request.to, target: request.target });
    } catch (error) {
      let detail = "document conversion failed";
      try { detail = zetajs.catchUnoException(error)?.Message || detail; }
      catch (_) { detail = error?.message || detail; }
      zetajs.mainPort.postMessage({ type: "error", id: request.id, code: "office_failed", detail: String(detail).slice(0, 200) });
    } finally {
      try {
        if (model?.queryInterface(zetajs.type.interface(css.util.XCloseable))) model.close(true);
        else model?.dispose();
      } catch (_) { /* The iframe remains disposable even if a malformed file fails to close. */ }
    }
  };
  zetajs.mainPort.postMessage({ type: "ready" });
}).catch((error) => {
  Module.uno_mainPort?.postMessage({ type: "error", code: "office_failed", detail: String(error?.message || error).slice(0, 200) });
});
