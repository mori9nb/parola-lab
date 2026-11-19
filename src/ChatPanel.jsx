import React, { useEffect, useRef, useState } from "react";
import { readChat, sendChat, sendVoice, clearChat } from "./services/chatServices";

function Icon({ name }) {
  const paths = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    send: <><path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 5-5"/></>,
    attach: <path d="m8 12 6-6a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L12 4m-7 13a2 2 0 0 0 3 3L18 10"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    plus: <path d="M12 4v16M4 12h16"/>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,i) => part.startsWith('**') ? <strong key={i}>{part.slice(2,-2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1,-1)}</code> : part);
}
// Deliberately renders text, never model HTML. Support common conversational Markdown.
export function Answer({ text }) {
  return <div className="assistant-answer">{String(text || '').split(/(```[\s\S]*?```)/g).map((block,i) => {
    if(block.startsWith('```')) return <pre dir="ltr" key={i}><code>{block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre>;
    return block.split('\n').map((line,j) => {
      const heading=line.match(/^#{1,3}\s+(.+)/);
      if(heading)return <h3 dir="auto" key={`${i}-${j}`}>{inline(heading[1])}</h3>;
      const bullet=line.match(/^\s*[-*]\s+(.+)/);
      return <p dir="auto" className={bullet?'answer-bullet':undefined} key={`${i}-${j}`}>{bullet?'• ':''}{inline(bullet?bullet[1]:line) || '\u00a0'}</p>;
    });
  })}</div>;
}
export default function ChatPanel({ channel, level }) {
  const conversation=channel==='conversation';
  const [turns,setTurns]=useState([]), [draft,setDraft]=useState('');
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [recording,setRecording]=useState(false), [seconds,setSeconds]=useState(0), [audio,setAudio]=useState(null), [audioUrl,setAudioUrl]=useState('');
  const [pending,setPending]=useState(null), [failed,setFailed]=useState(null);
  const lock=useRef(false), alive=useRef(true), recorder=useRef(null), stream=useRef(null), timer=useRef(null), ticker=useRef(null), disposition=useRef('preview'), file=useRef(null), end=useRef(null), input=useRef(null);
  const canRecord=!!globalThis.navigator?.mediaDevices?.getUserMedia && typeof MediaRecorder!=='undefined';
  async function load() {
    setLoading(true);setError('');
    try { const result=await readChat(channel);if(alive.current)setTurns(result.turns); }
    catch(e){if(alive.current)setError(e.message);}
    finally{if(alive.current)setLoading(false);}
  }
  useEffect(()=>{
    alive.current=true;load();
    return ()=>{alive.current=false;clearTimeout(timer.current);clearInterval(ticker.current);if(recorder.current?.state==='recording'){recorder.current.onstop=null;recorder.current.stop();}stream.current?.getTracks().forEach(t=>t.stop());};
  },[channel]);
  useEffect(()=>{end.current?.scrollIntoView?.({behavior:'smooth',block:'nearest'});},[turns,pending]);
  useEffect(()=>{
    if(!audio || typeof URL.createObjectURL!=='function'){setAudioUrl('');return;}
    const url=URL.createObjectURL(audio);setAudioUrl(url);return ()=>URL.revokeObjectURL(url);
  },[audio]);
  useEffect(()=>{if(input.current?.style){input.current.style.height='auto';input.current.style.height=`${Math.min(input.current.scrollHeight,140)}px`;}},[draft]);
  async function send(message=draft, blob=null) {
    if(lock.current || loading || (!blob&&!message.trim()))return;
    const text=message.trim();lock.current=true;setBusy(true);setError('');setFailed(null);setPending({text,voice:!!blob});
    try {
      const turn=blob?await sendVoice(channel,blob):await sendChat(channel,text);
      if(!alive.current)return;
      setTurns(x=>[...x,turn]);if(!blob)setDraft('');setAudio(null);
    } catch(e) {
      if(alive.current){
        // The response may have been lost after the server saved it. Read first.
        let recovered=false;
        try{const result=await readChat(channel);if(alive.current){setTurns(result.turns);const last=result.turns.at(-1);recovered=!!last&&!turns.some(t=>t.id===last.id)&&(blob?last.input_type==='voice':last.text===text);}}catch{}
        if(!recovered){setError(e.message);setFailed({text,blob});}else{if(!blob)setDraft('');setAudio(null);}
      }
    } finally {lock.current=false;if(alive.current){setBusy(false);setPending(null);}}
  }
  function stop(action='preview') {
    disposition.current=action;clearTimeout(timer.current);clearInterval(ticker.current);
    if(recorder.current?.state==='recording')recorder.current.stop();
  }
  async function record() {
    if(lock.current || loading || recording)return;
    if(!canRecord){setError('برای ضبط مستقیم روی تبلت، آدرس HTTPS لازم است. فعلاً می‌توانی با دکمهٔ پیوست وویس بفرستی.');file.current?.click();return;}
    lock.current=true;setError('');
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(x=>MediaRecorder.isTypeSupported(x));
      const rec=new MediaRecorder(media,mime?{mimeType:mime}:{}),chunks=[];let size=0;
      rec.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>6_000_000)stop('preview');}};
      rec.onstop=()=>{
        media.getTracks().forEach(t=>t.stop());clearTimeout(timer.current);clearInterval(ticker.current);
        if(!alive.current)return;setRecording(false);
        const blob=new Blob(chunks,{type:rec.mimeType});
        if(disposition.current==='cancel')return;
        if(blob.size>6_000_000){setError('وویس طولانی است؛ کوتاه‌تر ضبط کن.');return;}
        if(disposition.current==='send')send('',blob);else setAudio(blob);
      };
      rec.onerror=()=>{stop('cancel');if(alive.current)setError('ضبط انجام نشد؛ دوباره تلاش کن.');};
      disposition.current='preview';recorder.current=rec;rec.start(1000);setSeconds(0);setRecording(true);setAudio(null);
      ticker.current=setInterval(()=>setSeconds(x=>x+1),1000);timer.current=setTimeout(()=>stop('preview'),60_000);
    }catch{stream.current?.getTracks().forEach(t=>t.stop());if(alive.current)setError('اجازهٔ میکروفون را در مرورگر فعال کن.');}
    finally{lock.current=false;}
  }
  async function reset(){
    if(lock.current||recording||!confirm('این گفت‌وگو پاک شود و از نو شروع کنیم؟'))return;
    lock.current=true;setBusy(true);
    try{await clearChat(channel);if(alive.current){setTurns([]);setError('');setFailed(null);setAudio(null);setDraft('');}}
    catch(e){if(alive.current)setError(e.message);}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  return <section className="messenger" dir="rtl" aria-label={conversation?'تمرین مکالمه':'دستیار زبان'}>
    <header className="messenger-header"><div className="assistant-avatar">p<span/></div><div><h1>{conversation?'هم‌صحبت ایتالیایی':'دستیار زبان'}</h1><span>Parola · Gemini <span className="chat-level">{level}</span></span></div><button className="messenger-icon new-chat" aria-label="گفت‌وگوی تازه" title="گفت‌وگوی تازه" disabled={busy||loading||recording} onClick={reset}><Icon name="plus"/></button></header>
    <div className="messenger-feed" role="log" aria-label="پیام‌ها" aria-live="polite">
      {!turns.length&&!loading&&!pending&&<div className="messenger-welcome"><div className="welcome-symbol">✳</div><h2>{conversation?'بیا ایتالیایی حرف بزنیم.':'از کجا شروع کنیم؟'}</h2><p>{conversation?'مثل یک گفت‌وگوی واقعی؛ بنویس یا وویس بده.':'معنی یک عبارت، توضیح گرامر، تصحیح نوشته… هر چیزی که می‌خواهی یاد بگیری.'}</p><div className="chat-suggestions">{(conversation?['تو کافه سفارش بدیم','برای مصاحبه تمرین کنیم']:['فرق passato prossimo و imperfetto چیه؟','از کلمات دفترچه‌ام ازم سؤال بپرس']).map(text=><button key={text} disabled={busy} onClick={()=>send(text)}>{text}</button>)}</div></div>}
      {turns.map(turn=><React.Fragment key={turn.id}><article className="chat-bubble outgoing">{turn.input_type==='voice'&&<span className="voice-message-label"><Icon name="mic"/>پیام صوتی</span>}<p dir="auto">{turn.text}</p></article><article className="chat-bubble incoming"><Answer text={turn.reply}/>{turn.translation&&<Answer text={turn.translation}/>}{turn.correction&&<Answer text={turn.correction}/>}</article></React.Fragment>)}
      {pending&&<><article className="chat-bubble outgoing pending">{pending.voice?<span className="voice-message-label"><Icon name="mic"/>در حال ارسال وویس…</span>:<p dir="auto">{pending.text}</p>}</article><div className="typing-indicator" role="status" aria-label="دستیار در حال پاسخ دادن است"><i/><i/><i/></div></>}
      {loading&&<p className="chat-loading" role="status">در حال خواندن گفت‌وگو…</p>}<div ref={end}/>
    </div>
    <footer className="messenger-bottom">
      {error&&<div className="messenger-error" role="alert"><span>{error}</span>{failed?<button onClick={()=>send(failed.text,failed.blob)} disabled={busy}>تلاش دوباره</button>:<button onClick={load} disabled={busy}>بازخوانی</button>}</div>}
      <form className={`messenger-composer ${recording?'is-recording':''}`} onSubmit={e=>{e.preventDefault();if(recording)stop('send');else if(audio)send('',audio);else send();}}>
        {recording?<><button type="button" className="messenger-icon cancel-recording" aria-label="لغو ضبط" onClick={()=>stop('cancel')}><Icon name="close"/></button><div className="recording-track"><span className="recording-dot"/><span className="recording-time">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><div className="recording-wave">{Array.from({length:24},(_,i)=><i key={i} style={{height:`${8+(i*7)%22}px`,animationDelay:`${i*.04}s`}}/>)}</div></div><button type="button" className="messenger-icon" aria-label="توقف و بازبینی وویس" onClick={()=>stop('preview')}><Icon name="stop"/></button><button className="messenger-send" aria-label="ارسال وویس" title="ارسال وویس"><Icon name="send"/></button></>:audio?<><button type="button" className="messenger-icon" aria-label="حذف وویس" disabled={busy} onClick={()=>setAudio(null)}><Icon name="close"/></button><div className="voice-draft">{audioUrl&&<audio controls src={audioUrl}/>}</div><button className="messenger-send" aria-label="ارسال وویس" disabled={busy} title="ارسال وویس"><Icon name="send"/></button></>:<><button type="button" className="messenger-icon" title="پیوست وویس" aria-label="پیوست وویس" disabled={busy||loading} onClick={()=>file.current?.click()}><Icon name="attach"/></button><textarea ref={input} rows={1} maxLength={4000} dir="auto" aria-label="پیام" value={draft} disabled={busy||loading} placeholder="پیام بنویس…" onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent?.isComposing){e.preventDefault();send();}}}/>{draft.trim()?<button className="messenger-send" aria-label="ارسال پیام" title="ارسال" disabled={busy||loading}><Icon name="send"/></button>:<button type="button" className="messenger-send" aria-label="ضبط وویس" title="ضبط وویس" disabled={busy||loading} onClick={record}><Icon name="mic"/></button>}</>}
      </form>
      <input className="chat-file-input" ref={file} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm" capture="user" aria-label="فایل وویس" onChange={e=>{const blob=e.target.files?.[0];e.target.value='';if(blob){setAudio(blob);setError('');}}}/>
      <small className="messenger-footnote">پاسخ‌ها با Gemini · مخصوص یادگیری زبان</small>
    </footer>
  </section>;
}
