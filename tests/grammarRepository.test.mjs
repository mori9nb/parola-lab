import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const notebookSource = (await readFile(new URL('../src/services/notebookRepository.js', import.meta.url), 'utf8')).replace('import { apiFetch } from \"./api\";','const apiFetch = (...args) => globalThis.fetch(...args);').replace("import { importNotebook } from './notebookServices';", 'const importNotebook = async () => {};');
const notebookURL = moduleURL(notebookSource);
const grammarSource = (await readFile(new URL('../src/services/grammarRepository.js', import.meta.url), 'utf8')).replace('import { apiFetch } from "./api";','const apiFetch = (...args) => globalThis.fetch(...args);').replace("'./notebookRepository'", JSON.stringify(notebookURL));
const { encodeGrammar, reconcileGrammar, reconcileLearning, fetchGrammarBank, importGrammarBank, persistGrammarEntries, submitGrammarReview } = await import(moduleURL(grammarSource));
const question = (extra={}) => ({ id:'g1', text:'Ho bisogno di ___ .', options:['riposarmi','mi riposo','riposato','riposo'], answer:'riposarmi', meaning:'نیاز دارم استراحت کنم.', explanation:'مصدر پس از di', origin:'starter', ...extra });
const review = { attempts:3, correct:2, streak:0, due:'2026-11-20T10:00:00Z' };
const row = (extra={}) => ({ ...question(), id:'server-g1', client_id:'g1', level:null, source_text:'', created_at:'2026-11-19T10:00:00Z', review:null, ...extra });
const notebookRow = { id:'server-w1', client_id:'1', text:'Ciao', meaning:'سلام', kind:'word', level:'A1', analysis_status:'completed', created_at:'2026-11-19T10:00:00Z', review };
function response(data, status=200) { return { ok:status>=200 && status<300, status, json:async()=>data }; }

test('starter questions keep optional metadata and convert milliseconds to UTC ISO', () => {
 const encoded = encodeGrammar(question(), {g1:{...review,due:Date.parse(review.due)}});
 assert.equal(encoded.client_id,'g1'); assert.equal(encoded.level,null); assert.equal(encoded.source_text,'');
 assert.deepEqual(encoded.review,{...review,due:new Date(review.due).toISOString()}); assert.equal(encoded.created_at,undefined);
 assert.equal(encoded.serverId,undefined);
});
test('AI metadata and creation date survive encoding', () => {
 const encoded = encodeGrammar(question({origin:'ai',level:'B1',source_text:'bisogno',createdAt:'2026-11-19T12:00:00+01:00',serverId:'ignored'}),{});
 assert.equal(encoded.origin,'ai'); assert.equal(encoded.level,'B1'); assert.equal(encoded.created_at,'2026-11-19T11:00:00.000Z');
 assert.equal(encoded.source_text,'bisogno'); assert.equal(encoded.serverId,undefined);
});
test('snapshot uses browser ID and server ID separately; preserves notebook progress', () => {
 const previous={g1:{attempts:99},'1':{attempts:7}};
 const decoded=reconcileGrammar([row({review})],[question()],previous,['1']);
 assert.equal(decoded.bank[0].id,'g1'); assert.equal(decoded.bank[0].serverId,'server-g1');
 assert.equal(decoded.progress.g1.attempts,3); assert.equal(decoded.progress.g1.due,Date.parse(review.due));
 assert.deepEqual(decoded.progress['1'],{attempts:7}); assert.equal(previous.g1.attempts,99);
});
test('combined snapshot updates both progress domains in one result', () => {
 const result=reconcileLearning([notebookRow],[row({review})],[{id:'1'}],[question()],{'1':{attempts:99},g1:{attempts:88}});
 assert.equal(result.progress['1'].attempts,3); assert.equal(result.progress.g1.attempts,3);
 assert.equal(result.items[0].id,'1'); assert.equal(result.bank[0].id,'g1');
});
test('single-domain refresh preserves the other domain', () => {
 const initial={'1':{attempts:4},g1:{attempts:5}};
 assert.equal(reconcileLearning([notebookRow],null,[{id:'1'}],[question()],initial).progress.g1.attempts,5);
 assert.equal(reconcileLearning(null,[row({review})],[{id:'1'}],[question()],initial).progress['1'].attempts,4);
});
test('rejects collisions, duplicate IDs, invalid options and invalid reviews', () => {
 assert.throws(()=>reconcileGrammar([row({client_id:'1'})],[],{},['1']));
 assert.throws(()=>reconcileGrammar([row(),row()],[],{}));
 assert.throws(()=>encodeGrammar(question({options:['a','a','b','c']}),{}));
 assert.throws(()=>encodeGrammar(question(),{g1:{...review,correct:9,due:1000}}));
});
test('server absence removes obsolete grammar progress, not notebook progress', () => {
 const result=reconcileGrammar([], [question()], {g1:{attempts:8},'1':{attempts:7}}, ['1']);
 assert.deepEqual(result.bank,[]); assert.deepEqual(result.progress,{'1':{attempts:7}});
});
test('invalid batch is rejected before any request', async () => {
 let calls=0; globalThis.fetch=async()=>{calls++; throw Error('unexpected');};
 await assert.rejects(importGrammarBank([question(),question()],{}));
 assert.equal(calls,0);
 await assert.rejects(importGrammarBank([question(),question({id:'g2',answer:'missing'})],{}));
 assert.equal(calls,0);
});
test('import batches above 500 preserve stable IDs and do not send unrelated progress', async () => {
 const batches=[];
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/grammar/import');
  const batch=JSON.parse(options.body).items; batches.push(batch);
  return response({created:batch.length,existing:0,mappings:batch.map(q=>({client_id:q.client_id,id:`server-${q.client_id}`}))});
 };
 await importGrammarBank(Array.from({length:501},(_,i)=>question({id:`g${i}`})),{'word-1':{attempts:6}});
 assert.deepEqual(batches.map(b=>b.length),[500,1]); assert.equal(batches[1][0].client_id,'g500');
 assert.equal(batches[0][0].review,undefined);
});
test('new questions return confirmed server IDs; no background retries', async () => {
 let calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push(url);
  if (options.method==='POST') return response({created:1,existing:0,mappings:[{client_id:'g1',id:'server-g1'}]});
  return response({version:1,items:[row()]});
 };
 const saved=await persistGrammarEntries([question()]);
 assert.equal(saved[0].serverId,'server-g1'); assert.deepEqual(calls,['/api/grammar/import','/api/grammar/bank']);
});
test('review posts the grammar server ID and uses returned counters', async () => {
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/grammar/entries/server-g1/review'); assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{correct:false}); return response(review);
 };
 assert.deepEqual(await submitGrammarReview('server-g1',false),{...review,due:Date.parse(review.due)});
 let calls=0; globalThis.fetch=async()=>{calls++; throw new TypeError('lost response');};
 await assert.rejects(submitGrammarReview('server-g1',true)); assert.equal(calls,1);
});
test('failed or malformed bank responses are rejected', async () => {
 globalThis.fetch=async()=>response({detail:'blocked'},403);
 await assert.rejects(fetchGrammarBank(),/blocked/);
 globalThis.fetch=async()=>response({version:2,items:[]});
 await assert.rejects(fetchGrammarBank());
});
