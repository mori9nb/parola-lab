import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const notebookSource=(await readFile(new URL('../src/services/notebookRepository.js',import.meta.url),'utf8')).replace('import { apiFetch } from \"./api\";','const apiFetch = (...args) => globalThis.fetch(...args);').replace("import { importNotebook } from './notebookServices';", 'const importNotebook=async()=>{throw Error("Unexpected import");};');
const notebookURL=url(notebookSource);
const grammarSource=(await readFile(new URL('../src/services/grammarRepository.js',import.meta.url),'utf8')).replace('import { apiFetch } from "./api";','const apiFetch = (...args) => globalThis.fetch(...args);').replace("'./notebookRepository'",JSON.stringify(notebookURL));
const grammarURL=url(grammarSource);
const source=(await readFile(new URL('../src/services/serverConnection.js',import.meta.url),'utf8')).replace('import { apiFetch } from "./api";','const apiFetch = (...args) => globalThis.fetch(...args);').replace("'./notebookRepository'",JSON.stringify(notebookURL)).replace("'./grammarRepository'",JSON.stringify(grammarURL));
const {readExistingLearning,createClientId}=await import(url(source));
const review={attempts:8,correct:5,streak:2,due:'2026-11-21T10:00:00Z'};
const word={id:'word-server',client_id:'1',text:'Ciao',meaning:'سلام',kind:'word',level:'A1',review};
const grammar={id:'grammar-server',client_id:'g1',text:'Ho ___ .',meaning:'دارم',options:['bisogno','a','b','c'],answer:'bisogno',explanation:'مثال',origin:'starter',level:null,review};
const cached=()=>({items:[{id:'1',text:'cached'}],bank:[{id:'g1'}],progress:{'1':{attempts:1},g1:{attempts:2}}});
const response=(items,status=200)=>({status,ok:status===200,json:async()=>({version:1,items})});

test('adopts both existing server snapshots with only GET requests',async()=>{
 const calls=[];globalThis.fetch=async(path,options)=>{calls.push(path);assert.ok(!options.method || options.method==='GET');assert.equal(options.body,undefined);return response(path==='/api/notebook'?[word]:[grammar]);};
 const local=cached();const original=structuredClone(local);
 const result=await readExistingLearning(local);
 assert.deepEqual(calls.sort(),['/api/grammar/bank','/api/notebook']);
 assert.equal(result.items[0].serverId,'word-server');assert.equal(result.bank[0].serverId,'grammar-server');
 assert.equal(result.progress['1'].attempts,8);assert.equal(result.progress.g1.attempts,8);
 assert.deepEqual(local,original);
});
test('an empty server stays empty; starter data is never uploaded or substituted',async()=>{
 let calls=0;globalThis.fetch=async(_path,options)=>{calls++;assert.equal(options.method,undefined);return response([]);};
 const result=await readExistingLearning(cached());
 assert.deepEqual(result.items,[]);assert.deepEqual(result.bank,[]);assert.deepEqual(result.progress,{});assert.equal(calls,2);
});
test('failure leaves all local input unchanged',async()=>{
 globalThis.fetch=async(path)=>path==='/api/notebook'?response([word]):response([],500);
 const local=cached();const original=structuredClone(local);
 await assert.rejects(readExistingLearning(local));assert.deepEqual(local,original);
});
test('cross-domain ID collisions reject the adoption before state can be applied',async()=>{
 globalThis.fetch=async(path)=>response(path==='/api/notebook'?[word]:[{...grammar,client_id:'1'}]);
 const local=cached();const original=structuredClone(local);
 await assert.rejects(readExistingLearning(local));assert.deepEqual(local,original);
});
test('uses native randomUUID when available',()=>{
 assert.equal(createClientId({randomUUID:()=> 'native-uuid'}),'native-uuid');
});
test('LAN fallback creates UUIDv4 with cryptographic bytes when randomUUID is missing',()=>{
 let calls=0;const id=createClientId({getRandomValues:array=>{calls++;array.fill(255);return array;}});
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(id,'ffffffff-ffff-4fff-bfff-ffffffffffff');assert.equal(calls,1);
});
test('does not silently fall back to an insecure ID generator',()=>{
 assert.throws(()=>createClientId({}));
});
