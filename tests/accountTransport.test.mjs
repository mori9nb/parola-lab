import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const apiSource=await readFile(new URL('../src/services/api.js',import.meta.url),'utf8');
const apiURL=url(apiSource);
const {apiFetch,apiJson}=await import(apiURL);

test('session requests send same-origin cookies and CSRF header without bearer tokens',async()=>{
 let options;globalThis.fetch=async(_path,o)=>{options=o;return {status:200,ok:true,json:async()=>({ok:true})};};
 await apiFetch('/api/account',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(options.credentials,'same-origin');assert.equal(options.headers.get('X-Parola-Request'),'1');assert.equal(options.headers.get('Authorization'),null);
 await apiFetch('/api/account');assert.equal(options.headers.get('X-Parola-Request'),null);
});
test('expired sessions notify the UI, but expected login checks do not',async()=>{
 let events=0;globalThis.window={dispatchEvent:()=>events++};globalThis.fetch=async()=>({status:401,ok:false,json:async()=>({})});
 await apiFetch('/api/notebook');assert.equal(events,1);
 await assert.rejects(apiJson('/api/auth/me',{notifyUnauthorized:false}),error=>error.status===401);assert.equal(events,1);
 delete globalThis.window;
});
test('owner recovery never reads storage for another account',async()=>{
 let source=await readFile(new URL('../src/services/accountServices.js',import.meta.url),'utf8');
 source=source.replace("'./api'",JSON.stringify(apiURL)).replace("import { importNotebook } from './notebookServices';",'const importNotebook=async()=>{throw Error("unexpected import")};').replace("import { fetchNotebook } from './notebookRepository';",'const fetchNotebook=async()=>[];').replace("import { importGrammarBank, fetchGrammarBank } from './grammarRepository';",'const importGrammarBank=async()=>{throw Error("unexpected import")};const fetchGrammarBank=async()=>[];');
 const {recoverOwnerLegacy}=await import(url(source));const account={legacy_import_allowed:false};
 assert.equal(await recoverOwnerLegacy(account,{getItem(){throw Error('Another account must not read cached data');}}),account);
});
test('review attempts send a supplied idempotency key',async()=>{
 let source=await readFile(new URL('../src/services/notebookRepository.js',import.meta.url),'utf8');
 source=source.replace('import { apiFetch } from "./api";', 'const apiFetch=(...args)=>globalThis.fetch(...args);').replace("import { importNotebook } from './notebookServices';",'const importNotebook=async()=>{};');
 const {submitNotebookReview}=await import(url(source));
 globalThis.fetch=async(path,options)=>{assert.equal(path,'/api/items/server-id/review');assert.equal(JSON.parse(options.body).attempt_id,'retry-stable-id');return {ok:true,status:200,json:async()=>({streak:1,correct:1,attempts:1,due:'2026-11-20T10:00:00Z'})};};
 await submitNotebookReview('server-id',true,'retry-stable-id');
});
