/* FormCapy local citation adapter. Application code: MIT (repository LICENSE).
 * The unmodified processor, CSL data, their source and licenses are separate
 * files under vendor/citations/. No citation metadata is sent over a network.
 */
(function (root) {
  "use strict";
  const SCRIPT_BASE = root.document?.currentScript?.src || new URL("static/citation-engine.js", root.location?.href || "http://localhost/").href;
  const BASE = new URL("vendor/citations/", SCRIPT_BASE);
  const PINS = Object.freeze({
    "citeproc.js": "db98d3341d39eb7a9f166231b6c51118ed499f79821daa3e41f1ea8d7f8d0cbb",
    "modern-language-association.csl": "ad5398ee478760737ad04ec6f95ead6dfbea7d2ae5252fc21f337110dd564b58",
    "apa.csl": "41b4f3c9c61b58b7428ab21d653891995db7b4648d2f0a906eabcb8b2742e7ae",
    "locales-en-US.xml": "6f2cd3d1d5527ff07a2981f7ec237753e3b6787568d053c08485802cc3d04ac0",
  });
  const STYLES = Object.freeze({mla:"modern-language-association.csl",apa:"apa.csl"});
  const TYPES = new Set(["book", "article-journal", "webpage"]);
  const STRINGS = new Set(["title", "container-title", "publisher", "publisher-place", "volume", "issue", "page", "DOI", "URL", "edition", "language"]);
  const KEYS = new Set(["id", "type", "author", "issued", "accessed", ...STRINGS]);
  const MAX_ITEMS = 200;
  const textCache = new Map();
  let processorPromise = null;

  class CitationError extends Error {
    constructor(code, detail = "") { super(code); this.name="CitationError"; this.code=code; this.detail=String(detail).slice(0,160); }
  }
  function invalid() { throw new CitationError("invalid_citations"); }
  function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function text(value, maximum = 5000) {
    if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || /[\ud800-\udfff]/u.test(value)) invalid();
    return value;
  }
  function date(value) {
    if (!record(value) || Object.keys(value).some(key=>key !== "date-parts")) invalid();
    const parts = value["date-parts"];
    if (!Array.isArray(parts) || parts.length !== 1 || !Array.isArray(parts[0]) || parts[0].length < 1 || parts[0].length > 3) invalid();
    const [year, month, day] = parts[0];
    if (!Number.isInteger(year) || year < 1 || year > 9999) invalid();
    if (parts[0].length > 1 && (!Number.isInteger(month) || month < 1 || month > 12)) invalid();
    if (parts[0].length > 2) {
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
      if (!Number.isInteger(day) || day < 1 || day > days) invalid();
    }
    return {"date-parts":[parts[0].slice()]};
  }
  function safeURL(value) {
    try {
      const url = new URL(value);
      return ["http:","https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }
  function validateItems(items) {
    if (!Array.isArray(items) || items.length > MAX_ITEMS) invalid();
    const ids = new Set();
    const copy = items.map(item => {
      if (!record(item) || Object.keys(item).some(key => !KEYS.has(key))) invalid();
      if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)) invalid();
      if (!TYPES.has(item.type) || !text(item.title).trim()) invalid();
      ids.add(item.id);
      const result = {id:item.id,type:item.type};
      for (const key of STRINGS) if (key in item) result[key]=text(item[key]);
      if (result.URL && !safeURL(result.URL)) invalid();
      if (result.DOI) {
        result.DOI=result.DOI.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
        if (!/^10\.\d{4,9}\/\S+$/i.test(result.DOI)) throw new CitationError("invalid_citation_doi");
      }
      for (const key of ["issued","accessed"]) if (key in item) result[key]=date(item[key]);
      if ("author" in item) {
        if (!Array.isArray(item.author) || item.author.length > 50) invalid();
        result.author=item.author.map(author=>{
          if (!record(author) || Object.keys(author).some(key=>!["family","given","literal"].includes(key))) invalid();
          const value={};
          for (const key of ["family","given","literal"]) if (key in author) value[key]=text(author[key]);
          if (!Object.values(value).some(part=>part.trim()) || (value.literal && (value.family || value.given))) invalid();
          return value;
        });
      }
      return result;
    });
    if (new TextEncoder().encode(JSON.stringify(copy)).length > 1024*1024) invalid();
    return copy;
  }
  async function asset(file) {
    if (!Object.hasOwn(PINS,file)) throw new CitationError("citation_asset_failed");
    if (!textCache.has(file)) {
      const promise = (async()=>{
        const url = new URL(file, BASE);
        if (root.location?.origin && url.origin !== root.location.origin) throw new CitationError("citation_asset_failed");
        const controller=root.AbortController ? new root.AbortController() : null;
        const timeout=controller && root.setTimeout ? root.setTimeout(()=>controller.abort(),20000) : null;
        try {
          const settings={credentials:"same-origin",redirect:"error"};
          if(controller)settings.signal=controller.signal;
          const response = await root.fetch(url.href, settings);
          if (!response.ok) throw new CitationError("citation_asset_failed");
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 2*1024*1024 || !root.crypto?.subtle) throw new CitationError("citation_asset_failed");
          const digest=Array.from(new Uint8Array(await root.crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
          if (digest !== PINS[file]) throw new CitationError("citation_asset_failed");
          return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
        } catch (_) {throw new CitationError("citation_asset_failed");}
        finally {if(timeout!==null)root.clearTimeout(timeout);}
      })();
      textCache.set(file,promise);
      promise.catch(()=>{if(textCache.get(file)===promise)textCache.delete(file);});
    }
    return textCache.get(file);
  }
  async function processor() {
    if (root.CSL?.Engine && root.CSL.PROCESSOR_VERSION === "1.4.61") return root.CSL;
    if (!processorPromise) {
      processorPromise = new Promise((resolve,reject)=>{
        if (!root.document?.createElement) { reject(new CitationError("citation_asset_failed"));return; }
        const script = root.document.createElement("script");
        const url=new URL("citeproc.js",BASE);
        if(root.location?.origin && url.origin!==root.location.origin){reject(new CitationError("citation_asset_failed"));return;}
        script.src=url.href;
        script.async=true;
        script.integrity="sha256-25jTNB0563qfFmIxtsURGO1Jn3mCHao+QfHqjX+NDLs=";
        script.crossOrigin="anonymous";
        const timeout=root.setTimeout ? root.setTimeout(()=>{script.remove?.();reject(new CitationError("citation_asset_failed"));},20000) : null;
        const cleanup=()=>{if(timeout!==null)root.clearTimeout(timeout);};
        script.onload=()=>{
          cleanup();
          if (root.CSL?.Engine && root.CSL.PROCESSOR_VERSION === "1.4.61") resolve(root.CSL);
          else reject(new CitationError("citation_asset_failed"));
        };
        script.onerror=()=>{cleanup();script.remove?.();reject(new CitationError("citation_asset_failed"));};
        root.document.head.append(script);
      });
      processorPromise.catch(()=>{processorPromise=null;});
    }
    return processorPromise;
  }
  function entriesFor(engine, ids, format) {
    engine.setOutputFormat(format);
    engine.updateItems(ids);
    const output=engine.makeBibliography();
    if (!output || output[0].bibliography_errors?.length || output[1].length !== ids.length) throw new CitationError("citation_render_failed");
    const order=output[0].entry_ids.map(value=>{
      if (!Array.isArray(value) || value.length !== 1) throw new CitationError("citation_render_failed");
      return String(value[0]);
    });
    if (new Set(order).size !== ids.length || order.some(id=>!ids.includes(id))) throw new CitationError("citation_render_failed");
    return {parameters:output[0],values:output[1],order};
  }
  async function render(items, style="mla") {
    if (!Object.hasOwn(STYLES,style)) throw new CitationError("invalid_citation_style");
    const values=validateItems(items);
    const heading=style === "mla" ? "Works Cited" : "References";
    if (!values.length) return {style,heading,html:"",text:"",entries:[],layout:{hangingindent:true,linespacing:2,entryspacing:0,"second-field-align":false,maxoffset:0}};
    try {
      const [CSL,xml,locale]=await Promise.all([processor(),asset(STYLES[style]),asset("locales-en-US.xml")]);
      const byId=new Map(values.map(item=>[item.id,item]));
      const sys={retrieveLocale:lang=>["en-US","en"].includes(lang)?locale:false,retrieveItem:id=>byId.get(String(id))};
      // A fresh processor owns each render; the caller's records are not mutated.
      const engine=new CSL.Engine(sys,xml,"en-US",true);
      engine.opt.development_extensions.wrap_url_and_doi=true;
      const ids=values.map(item=>item.id);
      const html=entriesFor(engine,ids,"html");
      const plain=entriesFor(engine,ids,"text");
      if (JSON.stringify(html.order)!==JSON.stringify(plain.order)) throw new CitationError("citation_render_failed");
      const entries=html.order.map((id,index)=>({id,html:html.values[index].trim(),text:plain.values[index].trim()}));
      const layout={};
      for(const key of ["hangingindent","linespacing","entryspacing","second-field-align","maxoffset"]) layout[key]=html.parameters[key] ?? (key==="hangingindent" || key==="second-field-align"?false:0);
      return {style,heading,html:`<div class="csl-bib-body">\n${entries.map(entry=>entry.html).join("\n")}\n</div>`,text:entries.map(entry=>entry.text).join("\n\n"),entries,layout};
    } catch (error) {
      if(error instanceof CitationError)throw error;
      throw new CitationError("citation_render_failed",error?.message || error);
    }
  }

  const TAGS=new Set(["div","p","span","i","em","b","strong","u","sup","sub","small","br","a"]);
  const RULES=Object.freeze({
    "font-style":new Set(["normal","italic","oblique"]),
    "font-weight":new Set(["normal","bold","400","700"]),
    "font-variant":new Set(["normal","small-caps"]),
    "text-decoration":new Set(["none","underline"]),
    "vertical-align":new Set(["baseline","super","sub"]),
  });
  function sanitizedStyles(value) {
    const result=[];
    for(const raw of value.split(";")) {
      if(!raw.trim())continue;
      const parts=raw.split(":");
      if(parts.length!==2)throw new CitationError("unsafe_citation_output");
      const property=parts[0].trim().toLowerCase(),setting=parts[1].trim().toLowerCase();
      if(!Object.hasOwn(RULES,property) || !RULES[property].has(setting))throw new CitationError("unsafe_citation_output");
      result.push(`${property}: ${setting}`);
    }
    return result.join("; ");
  }
  function safeFragment(html, document=root.document) {
    if(typeof html!=="string" || html.length>2*1024*1024 || !document?.createElement) throw new CitationError("unsafe_citation_output");
    // Reject resource-bearing or executable nodes before parsing. An inert
    // template never enters the live DOM; only newly built allowlisted nodes do.
    if(/<!|<\?/.test(html))throw new CitationError("unsafe_citation_output");
    for(const match of html.matchAll(/<\s*\/?\s*([A-Za-z][\w:-]*)/g)) if(!TAGS.has(match[1].toLowerCase()))throw new CitationError("unsafe_citation_output");
    const template=document.createElement("template");
    template.innerHTML=html;
    const fragment=document.createDocumentFragment();
    function copy(node,parent) {
      if(node.nodeType===3) {parent.append(document.createTextNode(node.nodeValue));return;}
      if(node.nodeType!==1)throw new CitationError("unsafe_citation_output");
      const tag=node.localName.toLowerCase();
      if(!TAGS.has(tag) || (node.namespaceURI && node.namespaceURI!=="http://www.w3.org/1999/xhtml"))throw new CitationError("unsafe_citation_output");
      const result=document.createElement(tag);
      for(const attribute of Array.from(node.attributes)) {
        const name=attribute.name.toLowerCase(),value=attribute.value;
        if(name==="class") {
          const names=value.split(/\s+/).filter(Boolean);
          if(names.some(part=>!(/^(?:csl-[a-z-]+|nocase|nodecor)$/.test(part))))throw new CitationError("unsafe_citation_output");
          result.className=names.join(" ");
        } else if(name==="style") {
          const style=sanitizedStyles(value);
          if(style)result.setAttribute("style",style);
        } else if(tag==="a" && name==="href") {
          const href=safeURL(value);
          if(!href)throw new CitationError("unsafe_citation_output");
          result.setAttribute("href",href);
          result.setAttribute("rel","noopener noreferrer");
          result.setAttribute("target","_blank");
        } else throw new CitationError("unsafe_citation_output");
      }
      for(const child of Array.from(node.childNodes))copy(child,result);
      parent.append(result);
    }
    for(const node of Array.from(template.content.childNodes))copy(node,fragment);
    return fragment;
  }
  const api=Object.freeze({render,safeFragment,validateItems,CitationError,PINS,MAX_ITEMS,attribution:"(c) Frank Bennett — citeproc-js implements the Citation Style Language"});
  root.FormCapyCitationEngine=api;
  if(typeof module!=="undefined" && module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
