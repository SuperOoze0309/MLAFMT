// Independent integration boundaries found during root review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const model = require('../../static/citation-library.js');
const exporter = require('../../static/citation-export.js');
const importer = require('../../static/citation-import.js');
const item = () => model.createItem({id:'edge',type:'book',title:'Fictional boundary source',
  authors:[{family:'Example',given:'Ana'}],publisher:'Fictional Press',issued:{year:2024}});
const library = () => model.createLibrary([item()]);

for (const format of ['constructor','__proto__','toString']) {
  test(`rejects inherited format key ${format}`, () => {
    const result = exporter.exportLibrary(library(),{format});
    assert.equal(result.ok,false);
    assert.equal(result.text,'');
    assert.equal(result.errors[0].code,'format_unsupported');
  });
}

test('does not run inherited getters on a forged object prototype', () => {
  let invoked = 0;
  const proto = Object.create(null);
  Object.defineProperty(proto,'hasOwnProperty',{value:Object.prototype.hasOwnProperty});
  Object.defineProperty(proto,'schema',{get(){invoked++;return model.SCHEMA;}});
  const value = Object.assign(Object.create(proto),{v:model.VERSION,items:[item()]});
  const result = exporter.exportLibrary(value,{format:'csl-json'});
  assert.equal(invoked,0);
  assert.equal(result.ok,false);
  assert.equal(result.text,'');
});

test('does not read records from a forged array prototype', () => {
  let invoked=0;
  const proto=[];
  Object.setPrototypeOf(proto,Object.prototype);
  Object.defineProperty(proto,'forEach',{value:Array.prototype.forEach});
  Object.defineProperty(proto,'0',{get(){invoked++;return item();}});
  const items=[];
  Object.setPrototypeOf(items,proto);
  items.length=1;
  const result=exporter.exportLibrary({schema:model.SCHEMA,v:model.VERSION,items},{format:'csl-json'});
  assert.equal(invoked,0);
  assert.equal(result.ok,false);
  assert.equal(result.text,'');
});

for (const field of ['items','authors']) {
  test(`rejects sparse ${field} before serializing null records`, () => {
    const value=library();
    if(field==='items')value.items=new Array(1);
    else value.items[0].authors=new Array(1);
    const result=exporter.exportLibrary(value,{format:'csl-json'});
    assert.equal(result.ok,false);
    assert.equal(result.text,'');
  });
}

test('low years use four-digit interchange dates and retain date precision', () => {
  for (const year of [1,99,999,1000,9999]) {
    for (const format of ['ris','bibtex']) {
      const value=library();
      value.items[0].issued={year,month:2};
      value.items[0].accessed={year,month:3,day:1};
      const result=exporter.exportLibrary(value,{format});
      assert.equal(result.ok,true,JSON.stringify(result.errors));
      assert.ok(result.text.includes(`${String(year).padStart(4,'0')}-02`));
      const back=importer.parse(result.text,{format});
      assert.equal(back.ok,true,JSON.stringify(back.errors));
      assert.deepEqual(back.items[0].issued,value.items[0].issued);
      assert.deepEqual(back.items[0].accessed,value.items[0].accessed);
    }
  }
});
