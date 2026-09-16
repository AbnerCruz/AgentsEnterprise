const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
global.window=global;const saved=new Map();
global.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
global.document={querySelector:()=>null,querySelectorAll:()=>[]};
for(const f of ['core.js','optimization.js'])vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname,'..',f),'utf8'),{filename:f});
(async()=>{
 const e=S.state.normalizarEstudio({id:'storage-test',nome:'Persistência',fundacao:{versao:4,estado:'operacional'},arquivos:[{id:'file',nome:'grande.md',tipo:'md',conteudo:'conteúdo real '.repeat(7000),classe:'produto',clienteVisivel:true,pacote:[{nome:'index.html',conteudo:'<html>Produto</html>'}]}]});
 S.DB.estudios=[e];S.DB.atual=e.id;
 const compact=S.persistencia.projecaoLocal,pending=[];
 S.persistencia={disponivel:true,projecaoLocal:compact,gravar:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))};
 S.state.gravarJa();assert.ok([...saved.values()].some(v=>v.includes('conteúdo real')),'local copy is complete while IndexedDB is pending');
 pending[0].reject(new Error('quota'));await new Promise(setImmediate);assert.ok([...saved.values()].some(v=>v.includes('conteúdo real')),'IDB failure cannot replace content by references');
 S.state.gravarJa();pending[1].resolve(true);await new Promise(setImmediate);
 const projection=JSON.parse([...saved.values()].find(v=>v.includes('storage-test')));assert.equal(projection.compactado,true);assert.ok(projection.estudios[0].arquivos[0].pacoteRef);assert.equal(projection.estudios[0].arquivos[0].pacote,undefined);
 S.DB.compactado=true;const count=pending.length;assert.equal(S.state.gravarJa(),false);assert.equal(pending.length,count,'unhydrated projection must never overwrite durable content');
 console.log('persistence-order: ok — full content retained on IDB failure; compact only after commit; no writes before hydration');
})().catch(e=>{console.error(e);process.exitCode=1;});
