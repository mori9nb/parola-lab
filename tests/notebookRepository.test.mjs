import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../src/services/notebookRepository.js', import.meta.url), 'utf8')).replace("import { importNotebook } from './notebookServices';", 'const importNotebook = (...args) => globalThis.mockImport(...args);');
const { reconcileNotebook, decodeReview, fetchNotebook, persistNotebookItems, submitNotebookReview, deleteNotebookItem } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const row = (extra={}) => ({ id:'uuid-1', client_id:'1', text:'Ciao', meaning:'سلام', kind:'word', level:'A1', note:'note', origin:'user', source_text:'', analysis_status:'completed', created_at:'2026-11-18T10:00:00Z', review:null, ...extra });
const review = { attempts:5, correct:3, streak:0, due:'2026-11-18T10:00:00Z' };

test('preserves browser ID and grammar progress while adopting authoritative server review', () => {
 const result = reconcileNotebook([row({review})], [{id:'1'},{id:'deleted'}], {'1':{attempts:10}, deleted:{attempts:2}, g1:{attempts:3}}, ['g1']);
 assert.equal(result.items[0].id,'1'); assert.equal(result.items[0].serverId,'uuid-1');
 assert.equal(result.items[0].note,'note'); assert.equal(result.items[0].analysisStatus,'completed');
 assert.deepEqual(result.progress.g1,{attempts:3}); assert.equal(result.progress.deleted,undefined);
 assert.equal(result.progress['1'].attempts,5); assert.equal(result.progress['1'].due,Date.parse(review.due));
});
test('native server records retain cache identity, or receive a stable namespace', () => {
 assert.equal(reconcileNotebook([row({client_id:null})], [], {}).items[0].id,'server:uuid-1');
 assert.equal(reconcileNotebook([row({client_id:null})], [{id:'old',serverId:'uuid-1'}], {}).items[0].id,'old');
});
test('accepts pending records and preserves absent server review as absent', () => {
 const r=reconcileNotebook([row({kind:'pending',level:null,meaning:''})],[{id:'1'}],{'1':review});
 assert.equal(r.items[0].level,null); assert.equal(r.progress['1'],undefined);
});
test('rejects grammar ID collisions and duplicate server identities without mutating cache', () => {
 const progress={g1:{attempts:2}};
 assert.throws(()=>reconcileNotebook([row({client_id:'g1'})],[],progress,['g1']));
 assert.throws(()=>reconcileNotebook([row(),row()],[],{}));
 assert.deepEqual(progress,{g1:{attempts:2}});
});
test('rejects invalid review data', () => {
 assert.throws(()=>decodeReview({...review,due:'invalid'}));
 assert.throws(()=>decodeReview({...review,correct:9}));
});
test('fetch rejects failed and malformed responses', async () => {
 globalThis.fetch=async()=>({status:500,ok:false,json:async()=>({detail:'failed'})});
 await assert.rejects(fetchNotebook(),/failed/);
 globalThis.fetch=async()=>({status:200,ok:true,json:async()=>({items:[]})});
 await assert.rejects(fetchNotebook(),/پاسخ/);
});
test('creation uses the same client IDs and returns confirmed server mapping', async () => {
 let supplied;
 globalThis.mockImport=async(items,progress)=>{supplied={items,progress};};
 globalThis.fetch=async()=>({status:200,ok:true,json:async()=>({version:1,items:[row()]})});
 const saved=await persistNotebookItems([{id:'1',text:'Ciao'}]);
 assert.equal(supplied.items[0].id,'1'); assert.deepEqual(supplied.progress,{});
 assert.equal(saved[0].serverId,'uuid-1');
});
test('review posts server ID and never retries a lost response', async () => {
 let calls=0;
 globalThis.fetch=async(url,options)=>{ calls++; assert.equal(url,'/api/items/uuid-1/review'); assert.deepEqual(JSON.parse(options.body),{correct:false}); throw new TypeError('network'); };
 await assert.rejects(submitNotebookReview('uuid-1',false)); assert.equal(calls,1);
});
test('review uses returned counters and deletion waits for successful response', async () => {
 globalThis.fetch=async()=>({status:200,ok:true,json:async()=>review});
 assert.deepEqual(await submitNotebookReview('uuid-1',true),decodeReview(review));
 globalThis.fetch=async(url,options)=>{assert.equal(options.method,'DELETE'); return {status:204,ok:true};};
 await deleteNotebookItem('uuid-1');
 await assert.rejects(deleteNotebookItem(null));
});
