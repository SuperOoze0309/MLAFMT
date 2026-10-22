import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import test from "node:test";

const ROOT=path.resolve(new URL("../..",import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
const VENDOR=path.join(ROOT,"static/vendor/citations");
const [processorCode,adapterCode,modelCode]=await Promise.all([
  readFile(path.join(VENDOR,"citeproc.js"),"utf8"),
  readFile(path.join(ROOT,"static/citation-engine.js"),"utf8"),
  readFile(path.join(ROOT,"static/citation-library.js"),"utf8"),
]);
const originalBytes=new Map(await Promise.all(["modern-language-association.csl","apa.csl","locales-en-US.xml"].map(async file=>[file,new Uint8Array(await readFile(path.join(VENDOR,file)))])));

function harness(options={}) {
  const requested=[];
  const scripts=[];
  let context;
  const document=options.lazy?{currentScript:{src:"https://formcapy.test/static/citation-engine.js"},createElement:tag=>{assert.equal(tag,"script");return {remove(){this.removed=true;}};},head:{append(script){scripts.push(script);Promise.resolve().then(()=>{
    if(options.failScript){script.onerror();return;}
    vm.runInContext(processorCode,context,{filename:"lazy-original-citeproc.js"});script.onload();
  });}}}:undefined;
  context=vm.createContext({URL,TextEncoder,TextDecoder,crypto:webcrypto,console,document,location:{href:"https://formcapy.test/",origin:"https://formcapy.test"},
    fetch:async(url,settings)=>{
      requested.push({url,settings});
      if(options.fail)throw new Error("offline");
      const file=new URL(url).pathname.split("/").at(-1);
      const data=originalBytes.get(file);
      assert.ok(data,"all fetches must be fixed local component assets");
      const bytes=options.tamper?new Uint8Array([1,2,3]):data.slice();
      return {ok:true,arrayBuffer:async()=>bytes.buffer};
    },
  });
  if(!options.lazy)vm.runInContext(processorCode,context,{filename:"original-citeproc.js"});
  vm.runInContext(adapterCode,context,{filename:"citation-engine.js"});
  vm.runInContext(modelCode,context,{filename:"citation-library.js"});
  return {engine:context.FormCapyCitationEngine,model:context.FormCapyCitations,requested,scripts,context};
}
const shared=harness();
const book=(overrides={})=>({id:"book1",type:"book",title:"A fictional book",author:[{family:"Rivera",given:"Ana"}],issued:{"date-parts":[[2024]]},publisher:"Example Press",...overrides});
const plain=value=>JSON.parse(JSON.stringify(value));

test("APA original fictitious book uses CSL punctuation, author initials and italic title",async()=>{
  const result=await shared.engine.render([book()],"apa");
  assert.equal(result.entries[0].text,"Rivera, A. (2024). A fictional book. Example Press.");
  assert.match(result.entries[0].html,/<i>A fictional book<\/i>/);
  assert.deepEqual(plain(result.layout),{hangingindent:true,linespacing:2,entryspacing:0,"second-field-align":false,maxoffset:0});
  assert.equal(result.heading,"References");
});
test("MLA original fictitious book uses CSL punctuation and full given name",async()=>{
  const result=await shared.engine.render([book()],"mla");
  assert.equal(result.entries[0].text,"Rivera, Ana. A Fictional Book. Example Press, 2024.");
  assert.match(result.entries[0].html,/<i>A Fictional Book<\/i>/);
  assert.equal(result.heading,"Works Cited");
});
test("CSL author sorting is preserved in both HTML and plain output",async()=>{
  const result=await shared.engine.render([book({id:"z",author:[{family:"Zola",given:"Zoe"}]}),book({id:"a",author:[{family:"Acorn",given:"Amy"}]})],"apa");
  assert.deepEqual(plain(result.entries.map(entry=>entry.id)),["a","z"]);
  assert.equal(result.text,result.entries.map(entry=>entry.text).join("\n\n"));
  assert.ok(result.html.indexOf("Acorn")<result.html.indexOf("Zola"));
});
test("journal rendering has volume, issue, page range and DOI",async()=>{
  const result=await shared.engine.render([{id:"j",type:"article-journal",title:"Imagined coastal learning",author:[{family:"Lee",given:"Mira"}],issued:{"date-parts":[[2023]]},"container-title":"Fictional Learning Review",volume:"12",issue:"3",page:"41-55",DOI:"10.9999/example.123"}],"apa");
  const entry=result.entries[0];
  assert.match(entry.text,/Fictional Learning Review, 12\(3\), 41–55/);
  assert.match(entry.text,/https:\/\/doi\.org\/10\.9999\/example\.123/);
  assert.match(entry.html,/<i>Fictional Learning Review<\/i>/);
  assert.match(entry.html,/<a href="https:\/\/doi\.org\/10\.9999\/example\.123">/);
});
test("webpage date and safe URL are rendered, not fetched",async()=>{
  const result=await shared.engine.render([{id:"w",type:"webpage",title:"An imaginary field notebook",author:[{literal:"Example Research Group"}],issued:{"date-parts":[[2022,5,19]]},"container-title":"Example Archive",URL:"https://example.org/notebook",accessed:{"date-parts":[[2026,10,21]]}}],"apa");
  assert.match(result.text,/Example Research Group/);
  assert.match(result.text,/2022, May 19/);
  assert.match(result.text,/https:\/\/example.org\/notebook/);
  assert.match(result.html,/<a href="https:\/\/example.org\/notebook">/);
  assert.ok(shared.requested.every(request=>new URL(request.url).origin==="https://formcapy.test"));
  assert.ok(shared.requested.every(request=>!request.url.includes("notebook")));
});
test("unknown author is omitted without fabrication and title sorts first",async()=>{
  const result=await shared.engine.render([book({author:[]})],"apa");
  assert.match(result.text,/^A fictional book\. \(2024\)\./);
  assert.doesNotMatch(result.text,/Rivera|Anonymous/);
});
test("no date delegates n.d. to APA without inserting a year",async()=>{
  const input=book();delete input.issued;
  const result=await shared.engine.render([input],"apa");
  assert.match(result.text,/\(n\.d\.\)/);
  assert.doesNotMatch(result.text,/2024/);
});
test("institutional author remains literal",async()=>{
  const result=await shared.engine.render([book({author:[{literal:"The Imaginary Institute"}]})],"mla");
  assert.match(result.text,/^The Imaginary Institute\./);
  assert.doesNotMatch(result.text,/Institute, The/);
});
test("two and many authors use style-specific separators and et al",async()=>{
  const two=book({author:[{family:"Rivers",given:"Ana"},{family:"Stone",given:"Ben"}]});
  assert.match((await shared.engine.render([two],"apa")).text,/Rivers, A\., & Stone, B\./);
  const many=book({author:[{family:"Rivers",given:"Ana"},{family:"Stone",given:"Ben"},{family:"Vale",given:"Cora"}]});
  assert.match((await shared.engine.render([many],"mla")).text,/Rivers, Ana, et al\./);
});
test("Chinese and Spanish names and titles remain supplied text",async()=>{
  const result=await shared.engine.render([book({title:"虚构研究与 imaginación",author:[{literal:"张华与García研究组"}],language:"zh-CN"})],"apa");
  assert.match(result.text,/张华与García研究组/);
  assert.match(result.text,/虚构研究与 imaginación/);
});
test("render does not mutate frozen caller data",async()=>{
  const input=book();Object.freeze(input.author[0]);Object.freeze(input.author);Object.freeze(input.issued["date-parts"][0]);Object.freeze(input.issued["date-parts"]);Object.freeze(input.issued);Object.freeze(input);
  const snapshot=JSON.stringify(input);
  await shared.engine.render(Object.freeze([input]),"mla");
  assert.equal(JSON.stringify(input),snapshot);
});
test("repeated rendering caches only program data",async()=>{
  const h=harness();await h.engine.render([book()],"apa");await h.engine.render([book({title:"Different private title"})],"apa");
  assert.equal(h.requested.length,2);
  assert.ok(h.requested.every(request=>Object.keys(request.settings).sort().join(",")==="credentials,redirect"));
});
test("different styles share locale cache and fetch only three fixed assets",async()=>{
  const h=harness();await h.engine.render([book()],"apa");await h.engine.render([book()],"mla");assert.equal(h.requested.length,3);
});
test("processor is loaded only on first render with fixed same-origin SRI",async()=>{
  const h=harness({lazy:true});assert.equal(h.scripts.length,0);
  await h.engine.render([book()],"mla");
  assert.equal(h.scripts.length,1);
  assert.equal(h.scripts[0].src,"https://formcapy.test/static/vendor/citations/citeproc.js");
  assert.equal(h.scripts[0].integrity,"sha256-25jTNB0563qfFmIxtsURGO1Jn3mCHao+QfHqjX+NDLs=");
  assert.equal(h.scripts[0].crossOrigin,"anonymous");
});
test("concurrent renders share one processor script and fixed asset promises",async()=>{
  const h=harness({lazy:true});await Promise.all([h.engine.render([book()],"mla"),h.engine.render([book({id:"other"})],"mla")]);
  assert.equal(h.scripts.length,1);assert.equal(h.requested.length,2);
});
test("script failure is retriable and does not retain a rejected loader",async()=>{
  const options={lazy:true,failScript:true},h=harness(options);
  await assert.rejects(h.engine.render([book()],"mla"),error=>error.code==="citation_asset_failed");
  assert.equal(h.scripts[0].removed,true);options.failScript=false;
  assert.match((await h.engine.render([book()],"mla")).text,/Rivera/);assert.equal(h.scripts.length,2);
});
test("failed program-data request is retriable after connectivity returns",async()=>{
  const options={fail:true},h=harness(options);
  await assert.rejects(h.engine.render([book()],"mla"),error=>error.code==="citation_asset_failed");options.fail=false;
  assert.match((await h.engine.render([book()],"mla")).text,/Rivera/);
});
test("runtime digest constants match the committed source provenance",async()=>{
  const manifest=JSON.parse(await readFile(path.join(VENDOR,"sources.json"),"utf8"));
  for(const [file,digest]of Object.entries(shared.engine.PINS)) assert.equal(manifest.entries.find(entry=>entry.path===file).sha256,digest);
  assert.equal(manifest.processor.version,shared.context.CSL.PROCESSOR_VERSION);
  assert.equal(manifest.processor.selected_license,"CPAL-1.0");
});
test("empty library has safe empty output without loading runtime assets",async()=>{
  const h=harness();const value=await h.engine.render([],"mla");assert.equal(value.entries.length,0);assert.equal(h.requested.length,0);
});
test("tampered style or locale bytes fail closed",async()=>{
  await assert.rejects(harness({tamper:true}).engine.render([book()],"apa"),error=>error.code==="citation_asset_failed");
});
test("offline asset failure preserves original input",async()=>{
  const h=harness({fail:true}),input=[book()],snapshot=JSON.stringify(input);
  await assert.rejects(h.engine.render(input,"apa"),error=>error.code==="citation_render_failed" || error.code==="citation_asset_failed");
  assert.equal(JSON.stringify(input),snapshot);
});
test("invalid style does not fetch or render",async()=>{
  const h=harness();await assert.rejects(h.engine.render([book()],"unknown"),error=>error.code==="invalid_citation_style");assert.equal(h.requested.length,0);
});
const invalidCases=[
  ["duplicate IDs",[book(),book()]],
  ["unsupported type",[book({type:"speech"})]],
  ["empty title",[book({title:" "})]],
  ["long title",[book({title:"x".repeat(5001)})]],
  ["unknown draft field",[book({draft:"private"})]],
  ["unsafe URL",[book({URL:"javascript:alert(1)"})]],
  ["credentialed URL",[book({URL:"https://name:password@example.org/"})]],
  ["bad author shape",[book({author:[{literal:"Group",family:"Name"}]})]],
  ["empty author object",[book({author:[{}]})]],
  ["invalid leap day",[book({issued:{"date-parts":[[2023,2,29]]}})]],
  ["invalid year",[book({issued:{"date-parts":[[0]]}})]],
  ["date range unsupported",[book({issued:{"date-parts":[[2024],[2025]]}})]],
  ["unsafe controls",[book({title:"x\u0000y"})]],
  ["unpaired surrogate",[book({title:"x\ud800y"})]],
  ["long ID",[book({id:"x".repeat(65)})]],
  ["non ASCII ID",[book({id:"书"})]],
  ["too many authors",[book({author:Array.from({length:51},()=>({literal:"Group"}))})]],
  ["too many items",Array.from({length:201},(_,index)=>book({id:`x${index}`}))],
];
for(const [label,input]of invalidCases)test(`rejects ${label}`,async()=>{await assert.rejects(shared.engine.render(input,"apa"),error=>error.code==="invalid_citations");});
test("bad DOI has a dedicated actionable code",async()=>{await assert.rejects(shared.engine.render([book({DOI:"not-a-doi"})],"apa"),error=>error.code==="invalid_citation_doi");});
test("full doi.org DOI is normalized without a network request",async()=>{const result=await shared.engine.render([book({DOI:"https://doi.org/10.9999/sample"})],"apa");assert.match(result.text,/https:\/\/doi\.org\/10\.9999\/sample/);assert.doesNotMatch(result.text,/doi\.org\/https/);});
test("valid leap date and emoji are accepted",()=>{assert.equal(shared.engine.validateItems([book({title:"Fictional 🦫",issued:{"date-parts":[[2024,2,29]]}})])[0].title,"Fictional 🦫");});
test("engine metadata rejects the same controls and invalid XML characters as the model",()=>{
  const controls=[...Array.from({length:32},(_,index)=>index),...Array.from({length:33},(_,index)=>127+index),0x202a,0x202b,0x202c,0x202d,0x202e,0x2066,0x2067,0x2068,0x2069,0x200e,0x200f,0x061c,0xfffe,0xffff];
  for(const code of controls){
    const title=`A${String.fromCodePoint(code)}B`;
    assert.throws(()=>shared.engine.validateItems([book({title})]),error=>error.code==="invalid_citations",`U+${code.toString(16)}`);
  }
  const title="العربية עברית 中文 🦫 𝄞";
  assert.equal(shared.engine.validateItems([book({title})])[0].title,title);
});
test("DOI reserved characters are encoded exactly once in both styles without changing source data",async()=>{
  for(const style of ["mla","apa"]){
    const input=book({DOI:'10.9999/a<b>c"d?e#f%g'}),snapshot=JSON.stringify(input);
    const result=await shared.engine.render([input],style);
    const expected="https://doi.org/10.9999/a%3Cb%3Ec%22d%3Fe%23f%25g";
    assert.ok(result.entries[0].html.includes(`href="${expected}"`));
    assert.ok(result.entries[0].text.includes(expected));
    assert.doesNotMatch(result.entries[0].html,/%253C|%2522|%253F/);
    assert.equal(JSON.stringify(input),snapshot);
  }
});
test("an encoded doi.org URL and bare DOI resolve to the same once-encoded target",async()=>{
  for(const DOI of ['10.9999/a<b>','https://doi.org/10.9999/a%3Cb%3E']){
    const result=await shared.engine.render([book({DOI})],"apa");
    assert.ok(result.entries[0].html.includes('href="https://doi.org/10.9999/a%3Cb%3E"'));
  }
  assert.throws(()=>shared.engine.validateItems([book({DOI:"https://doi.org/10.9999/a%00b"})]),error=>error.code==="invalid_citation_doi");
});
test("valid URL quotes and Unicode use an encoded URI without malformed anchor attributes",async()=>{
  for(const URL of ['https://example.org/"<&>','https://例子.中国/文稿?x=壹&y=two']){
    const input=book({URL}),snapshot=JSON.stringify(input);
    const result=await shared.engine.render([input],"apa");
    const uri=new globalThis.URL(URL).href;
    assert.ok(result.entries[0].text.includes(uri));
    assert.ok(result.entries[0].html.includes(`href="${uri.replaceAll("&","&#38;")}"`));
    assert.equal(JSON.stringify(input),snapshot);
  }
  assert.throws(()=>shared.engine.validateItems([book({URL:"https://example.org/\\record"})]),error=>error.code==="invalid_citations");
});
test("render rejects an output larger than Word's per-entry bound before previewing",async()=>{
  const input=book({title:"文".repeat(5000),publisher:"社".repeat(5000),author:[{literal:"組".repeat(5000)}]});
  const snapshot=JSON.stringify(input);
  assert.equal(shared.engine.validateItems([input]).length,1);
  await assert.rejects(shared.engine.render([input],"apa"),error=>error.code==="citation_output_too_large");
  assert.equal(JSON.stringify(input),snapshot);
});
test("real CSL output nesting is bounded before a preview can promise Word export",async()=>{
  const title="<i>".repeat(40)+"Nested"+"</i>".repeat(40);
  for(const style of ["mla","apa"])await assert.rejects(shared.engine.render([book({title})],style),error=>error.code==="unsafe_citation_output");
});
test("model → actual engine roundtrip excludes originalText",async()=>{
  const library=shared.model.createLibrary([{id:"model",type:"book",title:"Model generated fiction",authors:[{family:"Ortega",given:"Luz"}],issued:{year:2025},publisher:"Example Publisher",originalText:"Keep my original; not rendered"}]);
  const csl=shared.model.toCslItems(library);
  assert.ok(!("originalText"in csl[0]));
  const rendered=await shared.engine.render(csl,"mla");
  assert.match(rendered.text,/Ortega, Luz/);assert.doesNotMatch(rendered.text,/Keep my original/);
});
test("all three model types reach both real CSL styles",async()=>{
  const library=shared.model.createLibrary([
    {id:"b",type:"book",title:"Fictional ocean notebooks",authors:[{literal:"Example Group"}],issued:{year:2024},publisher:"Demo Press"},
    {id:"j",type:"article-journal",title:"An invented classroom study",authors:[{family:"Hill",given:"Eva"}],issued:{year:2023},containerTitle:"Fictional Journal",volume:"4",issue:"2",page:"10-19",DOI:"10.9999/classroom"},
    {id:"w",type:"webpage",title:"Demonstration archive",authors:[],issued:null,containerTitle:"Example Archive",URL:"https://example.org/archive",accessed:{year:2026,month:10,day:21}},
  ]);
  for(const style of ["mla","apa"]){const value=await shared.engine.render(shared.model.toCslItems(library),style);assert.equal(value.entries.length,3);assert.ok(value.entries.every(entry=>entry.text && entry.html.includes("csl-entry")));}
});
test("model legal 5000-character field and author are accepted by engine validation",()=>{
  const library=shared.model.createLibrary([{id:"long",title:"x".repeat(5000),authors:[{literal:"y".repeat(5000)}]}]);
  assert.equal(shared.engine.validateItems(shared.model.toCslItems(library))[0].title.length,5000);
});
test("model legal 200 records are accepted by engine validation",()=>{
  const library=shared.model.createLibrary(Array.from({length:200},(_,i)=>({id:`book_${i}`,title:`Fiction ${i}`,authors:[]})));
  assert.equal(shared.engine.validateItems(shared.model.toCslItems(library)).length,200);
});

// These sanitizer unit fixtures model the DOM parser's output, not a replacement
// HTML parser. Real browser parsing/display is separately checked by UI acceptance.
class FixtureNode {
  constructor(tag,attributes={},children=[]){this.nodeType=1;this.localName=tag;this.namespaceURI="http://www.w3.org/1999/xhtml";this.attributes=Object.entries(attributes).map(([name,value])=>({name,value}));this.childNodes=children;}
  append(child){this.childNodes.push(child);}
  setAttribute(name,value){this.attributes=this.attributes.filter(item=>item.name!==name);this.attributes.push({name,value});}
  set className(value){this.setAttribute("class",value);}
}
const txt=value=>({nodeType:3,nodeValue:value});
function fixtureDocument(nodes){return {createElement:tag=>tag==="template"?{content:{childNodes:nodes},set innerHTML(_){}}:new FixtureNode(tag),createTextNode:txt,createDocumentFragment:()=>({childNodes:[],append(child){this.childNodes.push(child);}})};}
test("safeFragment rebuilds supported formatting without sharing original nodes",()=>{
  const source=new FixtureNode("div",{class:"csl-entry"},[new FixtureNode("i",{},[txt("Title")]),new FixtureNode("span",{style:"font-variant:small-caps;"},[txt("Author")]),new FixtureNode("sup",{},[txt("2")])]);
  const fragment=shared.engine.safeFragment('<div class="csl-entry"><i>Title</i></div>',fixtureDocument([source]));
  assert.notEqual(fragment.childNodes[0],source);
  assert.equal(fragment.childNodes[0].childNodes[1].attributes[0].value,"font-variant: small-caps");
  assert.equal(fragment.childNodes[0].childNodes[2].localName,"sup");
});
test("safeFragment accepts only safe absolute links and adds rel",()=>{
  const node=new FixtureNode("a",{href:"https://example.org/a"},[txt("link")]);
  const f=shared.engine.safeFragment('<a href="https://example.org/a">link</a>',fixtureDocument([node]));
  assert.ok(f.childNodes[0].attributes.some(attr=>attr.name==="rel" && attr.value==="noopener noreferrer"));
  assert.ok(f.childNodes[0].attributes.some(attr=>attr.name==="target" && attr.value==="_blank"));
});
test("safeFragment rejects oversized UTF-8 and deep nesting before DOM parsing",()=>{
  let parsed=false;
  const document={createElement(){parsed=true;throw new Error("must not parse");}};
  for(const html of ["<div>"+"文".repeat(700000)+"</div>","<i>".repeat(34)+"Text"+"</i>".repeat(34)]){
    assert.throws(()=>shared.engine.safeFragment(html,document),error=>error.code==="unsafe_citation_output");
  }
  assert.equal(parsed,false);
});
test("safeFragment rejects input target attributes instead of adopting navigation targets",()=>{
  for(const target of ["_self","_parent","_top","_blank","named-window"]){
    const node=new FixtureNode("a",{href:"https://example.org/a",target},[txt("link")]);
    assert.throws(()=>shared.engine.safeFragment(`<a href="https://example.org/a" target="${target}">link</a>`,fixtureDocument([node])),error=>error.code==="unsafe_citation_output");
  }
});
for(const markup of ['<script>alert(1)</script>','<img src="https://evil.example/">','<iframe src="https://evil.example/">','<svg><a></a></svg>','<!DOCTYPE html>','<object></object>'])test(`sanitizer rejects resource markup before DOM parsing: ${markup.split('>')[0]}`,()=>{
  let parsed=false;const document={createElement(){parsed=true;throw new Error("must not parse");}};
  assert.throws(()=>shared.engine.safeFragment(markup,document),error=>error.code==="unsafe_citation_output");assert.equal(parsed,false);
});
for(const [label,node]of [
  ["event",new FixtureNode("div",{onclick:"alert(1)"})],
  ["arbitrary CSS",new FixtureNode("span",{style:"background:url(https://evil.example)"})],
  ["unsafe href",new FixtureNode("a",{href:"javascript:alert(1)"})],
  ["credential href",new FixtureNode("a",{href:"https://user:secret@example.org"})],
  ["unknown class",new FixtureNode("div",{class:"application-toolbar"})],
  ["foreign namespace",Object.assign(new FixtureNode("div"),{namespaceURI:"http://www.w3.org/2000/svg"})],
])test(`sanitizer rejects ${label}`,()=>{assert.throws(()=>shared.engine.safeFragment("<div></div>",fixtureDocument([node])),error=>error.code==="unsafe_citation_output");});
