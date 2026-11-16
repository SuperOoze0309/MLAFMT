/* Sequential, browser-local batch conversion and ZIP packaging. */
(function (root) {
  "use strict";
  const MAX_FILES = 20;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
  const formats = new Set(["pdf", "docx", "doc"]);
  const makeError = code => Object.assign(new Error(code), { code });
  const isAborted = signal => Boolean(signal && signal.aborted);
  const sourceFormat = name => String(name || "").toLowerCase().match(/\.(pdf|docx|doc)$/)?.[1] || "";

  function safeName(value, target) {
    const clean = String(value || "").replace(/[\\/<>:"|?*\x00-\x1f]/g, "_").trim().replace(/[. ]+$/, "");
    return clean || `converted.${target}`;
  }
  function truncate(value, limit) {
    let shortened = value.slice(0, limit);
    if (/[\uD800-\uDBFF]$/.test(shortened)) shortened = shortened.slice(0, -1);
    return shortened;
  }
  function uniqueName(value, target, used) {
    const name = safeName(value, target);
    const match = name.match(/(\.[^.]{1,16})$/);
    const extension = match ? match[1] : "";
    const base = extension ? name.slice(0, -extension.length) : name;
    let candidate, number = 1;
    do {
      const suffix = number === 1 ? "" : ` (${number})`;
      candidate = truncate(base, 240 - extension.length - suffix.length) + suffix + extension;
      number++;
    } while (used.has(candidate.toLowerCase()));
    used.add(candidate.toLowerCase());
    return candidate;
  }
  function notify(onUpdate, entries) {
    if (typeof onUpdate === "function") onUpdate(entries.map(entry => ({ ...entry })));
  }
  async function run({ files, targetFormat, convert, signal, onUpdate }) {
    const input = Array.from(files || []);
    if (input.length > MAX_FILES) throw makeError("too_many_files");
    if (input.reduce((sum, file) => sum + (Number.isFinite(file?.size) && file.size > 0 ? file.size : 0), 0) > MAX_TOTAL_BYTES) throw makeError("batch_too_large");
    if (!formats.has(targetFormat) || typeof convert !== "function") throw makeError("unsupported");
    const entries = input.map((file, index) => ({ index, name: String(file?.name || ""), status: "pending", stage: null, result: null, error: null }));
    let retainedBytes = 0;
    const names = new Set();
    notify(onUpdate, entries);
    for (let index = 0; index < input.length; index++) {
      const entry = entries[index], file = input[index];
      if (isAborted(signal)) {
        entry.status = "cancelled";
        notify(onUpdate, entries);
        continue;
      }
      const format = sourceFormat(entry.name);
      const error = !formats.has(format) ? "unsupported" :
        !file || typeof file.arrayBuffer !== "function" || !Number.isFinite(file.size) || file.size < 0 ? "bad_document" :
        file.size === 0 ? "empty_file" : file.size > MAX_FILE_BYTES ? "too_large" : null;
      if (error) {
        entry.status = "error"; entry.error = error;
        notify(onUpdate, entries);
        continue;
      }
      if (format === targetFormat) {
        entry.status = "skipped";
        notify(onUpdate, entries);
        continue;
      }
      entry.status = "converting";
      notify(onUpdate, entries);
      try {
        const result = await convert({ file, targetFormat, signal, onStage(stage) {
          if (entry.status !== "converting" || isAborted(signal)) return;
          entry.stage = stage;
          notify(onUpdate, entries);
        } });
        if (isAborted(signal)) {
          entry.status = "cancelled";
        } else if (!(result?.blob instanceof root.Blob) || !result.blob.size) {
          entry.status = "error"; entry.error = "invalid_output";
        } else if (result.blob.size + retainedBytes > MAX_TOTAL_BYTES) {
          entry.status = "error"; entry.error = "output_limit";
        } else {
          retainedBytes += result.blob.size;
          entry.result = { ...result, name: uniqueName(result.name || entry.name.replace(/\.[^.]+$/, `.${targetFormat}`), targetFormat, names) };
          entry.status = "success";
        }
      } catch (error) {
        if (isAborted(signal) || error?.name === "AbortError" || error?.code === "cancelled") entry.status = "cancelled";
        else { entry.status = "error"; entry.error = error?.code || "conversion_failed"; }
      }
      entry.stage = null;
      notify(onUpdate, entries);
    }
    return entries.map(entry => ({ ...entry }));
  }

  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    crcTable[index] = crc >>> 0;
  }
  function header(size) { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)]; }
  async function crc32(blob, signal) {
    let crc = 0xffffffff;
    const chunkSize = 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      if (isAborted(signal)) throw makeError("cancelled");
      const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
      if (isAborted(signal)) throw makeError("cancelled");
      for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function createZip(entries, { signal, onProgress } = {}) {
    const results = Array.from(entries || []).filter(entry => entry.status === "success" && entry.result?.blob instanceof root.Blob && entry.result.blob.size > 0);
    if (!results.length) throw makeError("no_results");
    if (results.length > MAX_FILES || results.reduce((sum, entry) => sum + entry.result.blob.size, 0) > MAX_TOTAL_BYTES) throw makeError("output_limit");
    const encoder = new TextEncoder();
    const parts = [], directory = [], names = new Set();
    let offset = 0, directorySize = 0;
    for (let index = 0; index < results.length; index++) {
      if (isAborted(signal)) throw makeError("cancelled");
      const result = results[index].result, blob = result.blob;
      const name = encoder.encode(uniqueName(result.name, "bin", names));
      if (name.length > 65535) throw makeError("invalid_output");
      const crc = await crc32(blob, signal);
      const [local, l] = header(30);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
      l.setUint16(12, 0x21, true); l.setUint32(14, crc, true); l.setUint32(18, blob.size, true); l.setUint32(22, blob.size, true); l.setUint16(26, name.length, true);
      const [central, c] = header(46);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, blob.size, true); c.setUint32(24, blob.size, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      parts.push(local, name, blob); directory.push(central, name);
      offset += local.length + name.length + blob.size;
      directorySize += central.length + name.length;
      if (typeof onProgress === "function") onProgress(index + 1, results.length);
    }
    if (isAborted(signal)) throw makeError("cancelled");
    const [end, e] = header(22);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, results.length, true); e.setUint16(10, results.length, true);
    e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    return new root.Blob([...parts, ...directory, end], { type: "application/zip" });
  }
  root.FormCapyBatchConverter = Object.freeze({ run, createZip, limits: Object.freeze({ maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES }) });
})(window);
