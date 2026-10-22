/* FormCapy update prompt. Program updates only: no document/storage access. */
(function (root) {
  "use strict";
  const REQUEST = "FORMCAPY_ACTIVATE_UPDATE";
  const MESSAGES = Object.freeze({
    zh: {
      ready: "新版 FormCapy 已准备好。", safety: "请先保存或下载当前文稿；更新会重新加载当前页面。",
      update: "更新", later: "稍后", confirm: "已保存，更新", back: "返回",
      review: "请确认已保存文稿和文献资料。未保存的内容会在重新加载后丢失。",
      busy: "正在处理文稿，请完成后再更新。", activating: "正在切换到新版…",
      others: "请先保存并关闭其他 FormCapy 标签页，再回来更新；其他页面不会自动刷新。",
      failed: "暂时无法更新，当前文稿仍可继续处理。请稍后重试。",
      retry: "重试更新", label: "网站更新",
    },
    en: {
      ready: "A FormCapy update is ready.", safety: "Save or download your work first. Updating reloads this page.",
      update: "Update", later: "Later", confirm: "Saved — update", back: "Back",
      review: "Confirm that your document and reference data are saved. Reloading discards unsaved work.",
      busy: "A document is being processed. Finish before updating.", activating: "Switching to the new version…",
      others: "Save and close other FormCapy tabs, then return to update. Other pages will not reload automatically.",
      failed: "The update is unavailable for now. You can keep working and try again later.",
      retry: "Retry update", label: "Website update",
    },
    es: {
      ready: "Hay una actualización de FormCapy lista.", safety: "Guarda o descarga tu trabajo primero. Actualizar recarga esta página.",
      update: "Actualizar", later: "Más tarde", confirm: "Guardado: actualizar", back: "Volver",
      review: "Confirma que has guardado el documento y las referencias. Al recargar se pierde el trabajo sin guardar.",
      busy: "Se está procesando un documento. Espera a que termine antes de actualizar.", activating: "Cambiando a la nueva versión…",
      others: "Guarda y cierra las otras pestañas de FormCapy y vuelve para actualizar. Las otras páginas no se recargarán automáticamente.",
      failed: "La actualización no está disponible ahora. Puedes seguir trabajando e intentarlo más tarde.",
      retry: "Reintentar", label: "Actualización del sitio",
    },
  });

  function start(options = {}) {
    const win = options.window || root;
    const doc = options.document || win.document;
    const serviceWorker = options.serviceWorker || win.navigator?.serviceWorker;
    const getLocale = options.getLocale || (() => doc?.documentElement?.lang || "en");
    const isBusy = options.isBusy || (() => false);
    const setTimer = options.setTimeout || win.setTimeout.bind(win);
    const clearTimer = options.clearTimeout || win.clearTimeout.bind(win);
    const MessageChannelCtor = options.MessageChannel || win.MessageChannel;
    let registration = null;
    let candidate = null;
    let dismissed = null;
    let phase = "hidden";
    let alive = true;
    let started = false;
    let consent = false;
    let reloaded = false;
    let updating = false;
    let pendingCheck = null;
    let lastCheck = -Infinity;
    let interval = null;
    let requestTimer = null;
    let channel = null;
    let savedWorker = null;
    const removers = [];
    const node = doc.createElement("section");
    node.id = "formcapy-update-notice";
    node.hidden = true;
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.style.cssText = "position:relative;z-index:50;max-width:1120px;box-sizing:border-box;margin:12px auto;padding:14px 18px;border:1px solid #9dc9e7;border-radius:12px;background:#edf7ff;color:#17374b;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere";
    const title = doc.createElement("strong");
    const detail = doc.createElement("p");
    detail.style.cssText = "margin:6px 0 10px";
    const actions = doc.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
    const primary = doc.createElement("button");
    const secondary = doc.createElement("button");
    for (const button of [primary, secondary]) {
      button.type = "button";
      button.style.cssText = "font:inherit;border:1px solid #88adc7;border-radius:8px;padding:7px 12px;min-height:38px;background:white;color:inherit;cursor:pointer";
      actions.appendChild(button);
    }
    node.appendChild(title); node.appendChild(detail); node.appendChild(actions);

    function locale() {
      try { return String(getLocale() || "en").toLowerCase().split(/[-_]/)[0]; }
      catch (_) { return "en"; }
    }
    function render() {
      const text = MESSAGES[locale()] || MESSAGES.en;
      node.setAttribute("aria-label", text.label);
      node.hidden = !alive || phase === "hidden";
      title.textContent = text.ready;
      detail.textContent = phase === "review" ? text.review :
        phase === "busy" ? text.busy : phase === "activating" ? text.activating :
          phase === "other-tabs" ? text.others : phase === "failed" ? text.failed : text.safety;
      primary.textContent = phase === "review" ? text.confirm :
        phase === "failed" || phase === "other-tabs" ? text.retry : text.update;
      secondary.textContent = phase === "review" ? text.back : text.later;
      primary.disabled = secondary.disabled = phase === "activating";
      return node;
    }
    function show(next) { if (alive) { phase = next; render(); } }
    function listen(target, name, callback) {
      target?.addEventListener?.(name, callback);
      removers.push(() => target?.removeEventListener?.(name, callback));
    }
    function cancelRequest() {
      if (requestTimer !== null) clearTimer(requestTimer);
      requestTimer = null;
      channel?.port1?.close?.(); channel?.port2?.close?.(); channel = null;
    }
    function notifyUpdating(value) {
      if (updating === value) return true;
      updating = value;
      try { options.onUpdating?.(value); return true; }
      catch (_) { return false; }
    }
    function updateFailed(next = "failed") {
      consent = false;
      cancelRequest();
      const unlocked = notifyUpdating(false);
      show(unlocked ? next : "failed");
    }
    function reloadOnce() {
      // Controller changes caused by another tab never reload this page.
      if (!alive || !consent || reloaded) return;
      // Host controls unlock before a navigation. A faulty callback cannot
      // itself make navigation happen or leave an approved retry armed.
      consent = false;
      if (!notifyUpdating(false)) { cancelRequest(); show("failed"); return; }
      reloaded = true;
      cancelRequest();
      win.location.reload();
    }
    function inspect() {
      if (!alive || !registration) return;
      if (phase === "activating") return;
      const waiting = registration.waiting;
      const hasOldPage = Boolean(registration.active || serviceWorker.controller);
      if (waiting && hasOldPage && waiting !== candidate) {
        candidate = waiting;
        if (waiting !== dismissed) show("ready");
      } else if (waiting && hasOldPage && phase === "hidden" && waiting !== dismissed) {
        candidate = waiting; show("ready");
      } else if (!waiting && phase !== "activating") {
        candidate = null;
        if (phase !== "hidden") show("hidden");
      }
    }
    function trackInstalling() {
      const installing = registration?.installing;
      if (!installing) return;
      listen(installing, "statechange", inspect);
      inspect();
    }
    async function check(force = false) {
      if (!alive || !registration) return false;
      inspect();
      const now = Date.now();
      if (!force && now - lastCheck < 60000) return false;
      if (pendingCheck) return pendingCheck;
      lastCheck = now;
      pendingCheck = (async () => {
        try { await registration.update(); inspect(); return true; }
        catch (_) { return false; }
        finally { pendingCheck = null; }
      })();
      return pendingCheck;
    }
    function requestUpdate() {
      if (!alive || !candidate || phase === "activating") return;
      try { if (isBusy()) { show("busy"); return; } }
      catch (_) { show("busy"); return; }
      if (phase !== "review") { show("review"); return; }
      if (!MessageChannelCtor || registration?.waiting !== candidate) {
        show("failed"); return;
      }
      savedWorker = candidate;
      cancelRequest();
      // The host can lock editing and generation for this short transition.
      // Do not arm a reload until it has successfully acknowledged the lock.
      if (!notifyUpdating(true)) { updateFailed(); return; }
      consent = true;
      show("activating");
      try { channel = new MessageChannelCtor(); }
      catch (_) { updateFailed(); return; }
      channel.port1.onmessage = (event) => {
        if (!alive || event.data?.type !== REQUEST) return;
        const status = event.data.status;
        if (status === "activating") {
          // A state event covers browsers that activate before controllerchange.
          if (savedWorker?.state === "activated") reloadOnce();
          return;
        }
        updateFailed(status === "other-tabs" ? "other-tabs" : "failed");
      };
      listen(savedWorker, "statechange", () => {
        if (consent && savedWorker?.state === "activated") reloadOnce();
      });
      requestTimer = setTimer(() => {
        if (!alive || reloaded) return;
        updateFailed();
      }, options.timeoutMs || 15000);
      try {
        savedWorker.postMessage({ type: REQUEST, confirmed: true }, [channel.port2]);
      } catch (_) {
        updateFailed();
      }
    }
    listen(primary, "click", requestUpdate);
    listen(secondary, "click", () => {
      if (phase === "activating") return;
      if (phase === "review") { show("ready"); return; }
      dismissed = candidate; show("hidden");
    });
    function dispose() {
      alive = false; consent = false;
      if (interval !== null) clearTimer(interval);
      cancelRequest(); notifyUpdating(false); removers.splice(0).forEach((remove) => remove());
      node.remove();
    }
    function tick() {
      if (!alive) return;
      interval = setTimer(() => {
        check(); tick();
      }, options.intervalMs || 300000);
    }
    const api = Object.freeze({ check: () => check(true), render, dispose,
      state: () => Object.freeze({ phase, registered: Boolean(registration), started, consent, reloaded, updating }) });
    if (options.enabled === false || !serviceWorker || !win.isSecureContext) return api;
    let scriptURL;
    try {
      const pageURL = new URL(options.pageURL || win.location.href);
      if (!/^https?:$/.test(pageURL.protocol)) return api;
      scriptURL = new URL("sw.js", new URL(".", pageURL)).href;
    } catch (_) { return api; }
    if (options.mount) options.mount.appendChild(node);
    else doc.body.insertBefore(node, doc.body.firstChild);
    started = true;
    listen(serviceWorker, "controllerchange", reloadOnce);
    listen(win, "focus", () => check());
    listen(doc, "visibilitychange", () => { if (doc.visibilityState === "visible") check(); });
    try {
      Promise.resolve(serviceWorker.register(scriptURL, { updateViaCache: "none" })).then((result) => {
        if (!alive) return;
        registration = result;
        listen(registration, "updatefound", trackInstalling);
        trackInstalling(); inspect(); check(true); tick();
      }).catch(() => {});
    } catch (_) { /* Offline/unsupported registration never blocks formatting. */ }
    return api;
  }
  root.FormCapyUpdates = Object.freeze({ start });
  if (typeof module !== "undefined" && module.exports) module.exports = root.FormCapyUpdates;
})(typeof window !== "undefined" ? window : globalThis);
