import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import Renderer from 'react-test-renderer';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);
const {act}=React;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const temp=await mkdtemp(path.join(tmpdir(),'parola-ui-'));
const root=path.resolve(new URL('..',import.meta.url).pathname);
const source=(await readFile(path.join(root,'src/main.jsx'),'utf8')).replace('function App(', 'export function App(')+'\nexport { AuthGate, ChatPanel };';
const names=source.match(/import \{\n([\s\S]*?)\} from "lucide-react"/)[1].split(',').map(x=>x.trim()).filter(Boolean);
await build({stdin:{contents:source,loader:'jsx',resolveDir:path.join(root,'src')},bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'app.cjs'),plugins:[{name:'ui-test',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));
 b.onResolve({filter:/^(react-dom\/client|lucide-react)$/},a=>({path:a.path,namespace:'fake'}));
 b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:a.path==='lucide-react'?names.map(n=>`export const ${n}=()=>null;`).join('\n'):'export const createRoot=()=>({render(){}});'}));
}}],loader:{'.css':'empty'}});
globalThis.document={getElementById:()=>({})};globalThis.window=new EventTarget();
const {App,AuthGate,ChatPanel}=require(path.join(temp,'app.cjs'));
const text=node=>node==null?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.children);
const q={id:'grammar-server',client_id:'g1',text:'Ho ___ .',options:['bisogno','a','b','c'],answer:'bisogno',meaning:'نیاز دارم',explanation:'مثال',origin:'starter',level:null,review:null};
const user={id:'real-user',email:'alice@example.com',display_name:'Alice'};
function setup({signed=true,fail=false}={}){
 const calls=[],storageReads=[];let account={user:{...user},settings:{level:'A2',daily:10,base:'fa',target:'it',timezone:'Europe/Rome'},generationDays:{},onboarded:true,revision:0,history:[],stats:{attempts:0,correct:0,practiced_days:0,today:0},legacy_import_allowed:false};
 let bank=[q], generated=0;
 const notebook=Array.from({length:5},(_,i)=>({id:`s${i}`,client_id:`w${i}`,text:`Parola ${i}`,meaning:`معنی ${i}`,kind:"word",level:"A2",origin:"user",review:null}));
 const events=new EventTarget();globalThis.window=events;globalThis.document={getElementById:()=>({}),visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 globalThis.localStorage={getItem(key){storageReads.push(key);throw Error('Unexpected browser data read');},setItem(){throw Error('Account data must not be stored locally');}};
 globalThis.confirm=()=>true;
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET';const body=options.body?JSON.parse(options.body):null;calls.push({url,method,body,options});
  if(fail)return new Response(JSON.stringify({detail:'unavailable'}),{status:500});
  let data;
  if(url==='/api/auth/me')return new Response(JSON.stringify(signed?account.user:{detail:'Sign in required'}),{status:signed?200:401});
  if(url==='/api/auth/login'||url==='/api/auth/register'){signed=true;data=account.user;}
  else if(url==='/api/account'&&method==='GET')data=account;
  else if(url==='/api/account'&&method==='PATCH'){
   assert.equal(body.revision,account.revision);account={...account,revision:account.revision+1,user:{...account.user,display_name:body.display_name??account.user.display_name},settings:{...account.settings,...body.settings},onboarded:body.onboarded??account.onboarded,generationDays:{...account.generationDays,...body.generation_days}};data=account;
  }
  else if(url==='/api/notebook')data={version:1,items:notebook};
  else if(url==='/api/grammar/bank')data={version:1,items:bank};
  else if(url==='/api/generate')data={items:Array.from({length:body.count},()=>({text:`Nuova frase ${++generated}.`,kind:'sentence',meaning:`معنی تازه ${generated}`,example:`Nuova frase ${generated}.`,translation:'ترجمه',level:body.target_level,source_text:body.seeds[0]}))};
  else if(url==='/api/notebook/import'){
    const added=body.items.map((x,i)=>({...x,id:`new-${generated}-${i}`,review:null}));notebook.push(...added);
    data={created:added.length,existing:0,reviews_created:0,mappings:added.map(x=>({client_id:x.client_id,id:x.id}))};
  }
  else if(url==='/api/grammar/generate')data={items:Array.from({length:body.count},()=>({...q,text:`Frase ${++generated} ___ .`,level:body.target_level,source_text:body.seeds[0]}))};
  else if(url==='/api/grammar/import'){
    bank=body.items.map((x,i)=>({...x,id:i===0?'grammar-server':`gs${i}`,review:null}));
    data={created:body.items.length,existing:0,reviews_created:0,mappings:bank.map(x=>({client_id:x.client_id,id:x.id}))};
  }
  else if(url==='/api/grammar/entries/grammar-server/review'){
   data={attempts:1,correct:1,streak:1,due:'2026-11-21T10:00:00Z'};
   account={...account,history:[{id:'g1',attempt_id:body.attempt_id,correct:true,date:'2026-11-19',at:1795000000000}],stats:{attempts:1,correct:1,practiced_days:1,today:1}};
  }
  else if(url==='/api/auth/logout'){signed=false;return new Response(null,{status:204});}
  else throw Error('Unexpected API: '+method+' '+url);
  return new Response(JSON.stringify(data),{status:200});
 };
 return {calls,storageReads,events};
}
async function mount(element){let r;await act(async()=>{r=Renderer.create(element);});return r;}
async function click(r,label){const b=r.root.findAllByType('button').find(b=>text(b).includes(label));assert.ok(b,label);await act(async()=>await b.props.onClick());}

test('signed-in app automatically loads server account and learning data without localStorage or transfer buttons',async()=>{
 const env=setup();const app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));
 assert.equal(env.calls.some(c=>c.url==='/api/account'),true);assert.equal(env.calls.some(c=>c.url==='/api/notebook'),true);assert.deepEqual(env.storageReads,[]);
 await click(app,'تنظیمات');for(const obsolete of ['انتقال دفترچه','انتقال گرامر','ورود پشتیبان','خواندن اطلاعات موجود سرور'])assert.equal(text(app.toJSON()).includes(obsolete),false);
 assert.ok(text(app.toJSON()).includes('alice@example.com'));await act(async()=>app.unmount());
});
test('profile changes persist through API and are restored on a new mount',async()=>{
 setup();let app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));await click(app,'تنظیمات');
 const input=app.root.findAllByType('input').find(i=>i.props.placeholder==='نام نمایشی');
 await act(async()=>input.props.onChange({target:{value:'غزل'}}));await click(app,'ذخیرهٔ نام');await act(async()=>app.unmount());
 app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));await click(app,'تنظیمات');
 assert.equal(app.root.findAllByType('input').find(i=>i.props.placeholder==='نام نمایشی').props.value,'غزل');await act(async()=>app.unmount());
});
test('grammar answers write an idempotency key and reload history from the server',async()=>{
 const env=setup();const app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));await click(app,'تمرین‌ها');
 const mode=app.root.findAllByType('button').find(b=>b.props.className==='mode'&&text(b).includes('گرامر'));await act(async()=>await mode.props.onClick());
 const answer=app.root.findAllByType('button').find(b=>b.props.className?.startsWith('option ')&&text(b).includes('bisogno'));assert.ok(answer);
 await act(async()=>await answer.props.onClick());const posted=env.calls.find(c=>c.url.endsWith('/review'));
 assert.match(posted.body.attempt_id,/^[0-9a-f-]{36}$/);assert.equal(posted.options.headers.get('X-Parola-Request'),'1');
 assert.equal(env.calls.filter(c=>c.url==='/api/account').length,2);assert.deepEqual(env.storageReads,[]);await act(async()=>app.unmount());
});
test('authentication gate signs in and clears the rendered account after session expiry',async()=>{
 setup({signed:false});const gate=await mount(React.createElement(AuthGate,null,(u)=>React.createElement('p',null,'PRIVATE '+u.email)));
 assert.ok(text(gate.toJSON()).includes('خوش برگشتی'));
 const email=gate.root.findAllByType('input').find(i=>i.props.type==='email');const password=gate.root.findAllByType('input').find(i=>i.props.type==='password');
 await act(async()=>{email.props.onChange({target:{value:'alice@example.com'}});password.props.onChange({target:{value:'long-test-password'}});});
 await act(async()=>await gate.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.ok(text(gate.toJSON()).includes('PRIVATE'));
 await act(async()=>window.dispatchEvent(new Event('parola:unauthorized')));assert.equal(text(gate.toJSON()).includes('PRIVATE'),false);await act(async()=>gate.unmount());
});
test('server errors show retry and never enter a local account mode',async()=>{
 setup({fail:true});const app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));
 assert.ok(text(app.toJSON()).includes('تلاش دوباره'));const add=app.root.findAllByType('button').find(b=>text(b).includes('افزودن به دفترچه'));assert.equal(add.props.disabled,true);await act(async()=>app.unmount());
});
test.after(async()=>{await rm(temp,{recursive:true,force:true});});

test('word practice never generates; both entry points use only notebook words',async()=>{
 const env=setup();const app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));
 await click(app,'مرور کلمات دفترچه');
 assert.ok(text(app.toJSON()).includes('Parola'));
 assert.equal(env.calls.some(c=>c.url.includes('generate')),false);
 await click(app,'تمرین‌ها');
 const mode=app.root.findAllByType('button').find(b=>b.props.className==='mode'&&text(b).includes('کلمه و اصطلاح'));await act(async()=>await mode.props.onClick());
 assert.equal(env.calls.some(c=>c.url.includes('generate')),false);
 await act(async()=>app.unmount());
});
test('sentence and grammar generate every new session at unchanged level and exclude earlier exercises',async()=>{
 for(const [label,path] of [['جمله','/api/generate'],['گرامر','/api/grammar/generate']]){
  const env=setup();const app=await mount(React.createElement(App,{accountUser:user,onSignedOut(){}}));
  for(let i=0;i<2;i++){
   await click(app,'تمرین‌ها');const mode=app.root.findAllByType('button').find(b=>b.props.className==='mode'&&text(b).includes(label));await act(async()=>await mode.props.onClick());
  }
  const requests=env.calls.filter(c=>c.url===path);
  assert.equal(requests.length,4); // daily 10 = two bounded batches per session
  assert.ok(requests.every(c=>c.body.target_level==='A2'));
  assert.ok(requests[2].body.exclude.length>=10);
  assert.equal(env.calls.some(c=>c.method==='PATCH'),false);
  await act(async()=>app.unmount());
 }
});
test('messenger sends natural answers without playback controls and clears current history',async()=>{
 setup();let posted=[],history=[{id:'old',text:'ciao',reply:'Ciao!',italian:'Ciao!',translation:'سلام'}];
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET';assert.equal(url,'/api/chat/conversation');let result;
  if(method==='GET')result={turns:history};
  else if(method==='POST'){posted.push(JSON.parse(options.body));result={id:'new',text:posted[0].text,reply:'Come stai?',italian:'Come stai?',translation:'چطوری؟',correction:'توضیح'};}
  else if(method==='DELETE')return new Response(null,{status:204});
  return new Response(JSON.stringify(result));
 };
 const spoken=[];const panel=await mount(React.createElement(ChatPanel,{channel:'conversation',level:'A2',speak:x=>spoken.push(x)}));
 assert.ok(text(panel.toJSON()).includes('Ciao!'));assert.equal(panel.root.findAllByType('button').some(b=>text(b).includes('شنیدن')),false);
 const draft=panel.root.findByType('textarea');await act(async()=>draft.props.onChange({target:{value:'Sto bene'}}));
 await act(async()=>await panel.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.deepEqual(posted,[{text:'Sto bene'}]);assert.ok(text(panel.toJSON()).includes('Come stai?'));
 assert.deepEqual(spoken,[]);assert.equal(panel.root.findAllByType('input').some(i=>i.props.type==='checkbox'),false);
 await act(async()=>await panel.root.findAllByType('button').find(b=>b.props['aria-label']==='گفت‌وگوی تازه').props.onClick());assert.equal(text(panel.toJSON()).includes('Come stai?'),false);
 await act(async()=>panel.unmount());
});

test('messenger records and sends voice directly to Gemini without a transcription step',async()=>{
 setup();const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let stopped=0,requests=[];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){stopped++;}}]};}}}});
 globalThis.MediaRecorder=class {
  static isTypeSupported(){return true;}
  constructor(){this.state='inactive';this.mimeType='audio/webm';globalThis.lastRecorder=this;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['voice'],{type:this.mimeType})});this.onstop?.();}
 };
 globalThis.FileReader=class {async readAsDataURL(blob){this.result='data:audio/webm;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
 globalThis.fetch=async(url,options={})=>{
  requests.push({url,body:options.body&&JSON.parse(options.body)});
  const data=url==='/api/chat/audio/transcribe'?{text:'Vorrei un caffè.'}:options.method==='POST'?{id:'turn',text:'Vorrei un caffè, grazie.',reply:'Certo!',italian:'Certo!'}:{turns:[]};
  return new Response(JSON.stringify(data));
 };
 let panel;
 try {
  panel=await mount(React.createElement(ChatPanel,{channel:'conversation',level:'A2',speak(){}}));
  await act(async()=>await panel.root.findAllByType('button').find(b=>b.props['aria-label']==='ضبط وویس').props.onClick());
  assert.ok(panel.root.findAllByType('button').some(b=>b.props['aria-label']==='لغو ضبط'));
  await act(async()=>panel.root.findAllByType('button').find(b=>b.props['aria-label']==='لغو ضبط').props.onClick());
  assert.equal(requests.some(r=>r.url.includes('/voice')),false);
  await act(async()=>await panel.root.findAllByType('button').find(b=>b.props['aria-label']==='ضبط وویس').props.onClick());
  await act(async()=>await panel.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(stopped,2);
  const voice=requests.find(r=>r.url==='/api/chat/conversation/voice');assert.ok(voice);
  assert.equal(voice.body.mime_type,'audio/webm');assert.equal(voice.body.data,Buffer.from('voice').toString('base64'));
  assert.equal(requests.some(r=>r.url.includes('transcribe')),false);
  assert.ok(text(panel.toJSON()).includes('Certo!'));
 } finally {
  if(panel)await act(async()=>panel.unmount());
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
  delete globalThis.MediaRecorder;delete globalThis.FileReader;delete globalThis.lastRecorder;
 }
});
