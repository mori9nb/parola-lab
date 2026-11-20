import base64
import json
import pytest
from sqlalchemy import select
from app import chat
from app.models import ChatTurn, Item, User
from conftest import HEADERS

REPLY = {"reply":"Ciao! Come stai?", "italian":"Ciao! Come stai?", "translation":"سلام! چطوری؟", "correction":""}

def test_chat_is_authenticated(api_env):
    client,_ = api_env
    assert client.get('/api/chat/tutor').status_code == 401
    assert client.post('/api/chat/conversation', headers=HEADERS,json={"text":"ciao"}).status_code == 401
    assert client.post('/api/chat/audio/transcribe', headers=HEADERS,json={"mime_type":"audio/wav","data":"YQ=="}).status_code == 401

def test_chat_persists_scoped_history_and_notebook(signed_api, monkeypatch):
    client,sessions=signed_api
    owner=client.get('/api/auth/me').json()['id']
    with sessions() as s:
        s.add(User(id='other',display_name='other')); s.commit()
        s.add(Item(id='own',user_id=owner,text='cane',meaning='سگ',kind='word',level='A1'))
        s.add(Item(id='private',user_id='other',text='PRIVATE',meaning='PRIVATE',kind='word',level='A1'))
        s.add(ChatTurn(id='other-turn',user_id='other',channel='tutor',text='secret',response=REPLY,created_at=chat.datetime.now(chat.timezone.utc)));s.commit()
    seen=[]
    async def fake(*args, **kwargs):
        if args[0] == chat.CHECK_PROMPT:
            return json.dumps({"verdict":"not_an_answer", "task":"", "learner_answer":args[1]["learner_answer"], "expected_answer":"", "errors":[], "feedback":""})
        seen.append(args[1]);return json.dumps(REPLY)
    monkeypatch.setattr(chat,'request_json',fake)
    assert client.get('/api/chat/tutor').json()=={'turns':[]}
    response=client.post('/api/chat/tutor',headers=HEADERS,json={'text':'ciao'})
    assert response.status_code==200,response.text
    assert [x['text'] for x in seen[0]['notebook']]==['cane']
    assert client.get('/api/chat/tutor').json()['turns'][0]['reply']==REPLY['reply']
    assert client.get('/api/chat/conversation').json()=={'turns':[]}
    client.post('/api/chat/tutor',headers=HEADERS,json={'text':'e tu?'})
    assert len(seen[1]['history'])==1
    assert client.delete('/api/chat/tutor',headers=HEADERS).status_code==204
    with sessions() as s: assert s.get(ChatTurn,'other-turn') is not None

def test_chat_failed_model_does_not_save_fake_reply(signed_api, monkeypatch):
    client,sessions=signed_api
    async def fake(*args,**kwargs): return '{}'
    monkeypatch.setattr(chat,'request_json',fake)
    assert client.post('/api/chat/conversation',headers=HEADERS,json={'text':'ciao'}).status_code==502
    assert client.get('/api/chat/conversation').json()=={'turns':[]}
    assert client.post('/api/chat/tutor',headers=HEADERS,json={'text':' '}).status_code==422

@pytest.mark.parametrize('payload',[{'mime_type':'text/plain','data':'YQ=='},{'mime_type':'audio/wav','data':'!!!!'},{'mime_type':'audio/mp4','data':'='*4}])
def test_audio_rejects_invalid_input_before_provider(signed_api,payload):
    client,_=signed_api
    assert client.post('/api/chat/audio/transcribe',headers=HEADERS,json=payload).status_code==422

def test_audio_provider_payload_and_transcript(signed_api,monkeypatch):
    client,_=signed_api
    monkeypatch.setattr(chat,'AISettings',lambda:chat.AISettingsOriginal(gemini_api_key='test-key',gemini_model='test-model'))
    class FakeResponse:
        def raise_for_status(self): pass
        def json(self): return {'candidates':[{'content':{'parts':[{'text':json.dumps({'text':'Vorrei un caffè.'})}]}}]}
    class FakeClient:
        def __init__(self,**kw):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def post(self,url,**kw):
            assert url.endswith('/test-model:generateContent')
            assert kw['json']['contents'][0]['parts'][1]['inlineData']['mimeType']=='audio/mp4'
            return FakeResponse()
    monkeypatch.setattr(chat.httpx,'AsyncClient',FakeClient)
    response=client.post('/api/chat/audio/transcribe',headers=HEADERS,json={'mime_type':'audio/x-m4a','data':base64.b64encode(b'audio').decode()})
    assert response.status_code==200,response.text
    assert response.json()['text']=='Vorrei un caffè.'
    assert client.get('/api/chat/tutor').json()=={'turns':[]}

chat.AISettingsOriginal=chat.AISettings


def test_voice_message_is_answered_directly_and_saved_with_context(signed_api,monkeypatch):
    client,sessions=signed_api
    original=chat.AISettings
    monkeypatch.setattr(chat,'AISettings',lambda:original(gemini_api_key='test-key',gemini_model='test-model'))
    seen=[]
    class FakeResponse:
        def raise_for_status(self):pass
        def json(self):return {'candidates':[{'content':{'parts':[{'text':json.dumps({'transcript':'Che significa magari?', 'reply':'**Magari** یعنی «شاید» یا «کاش»، بسته به جمله.'})}]}}]}
    class FakeClient:
        def __init__(self,**kw):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def post(self,url,**kw):seen.append(kw['json']);return FakeResponse()
    monkeypatch.setattr(chat.httpx,'AsyncClient',FakeClient)
    audio={'mime_type':'audio/webm','data':base64.b64encode(b'voice').decode()}
    response=client.post('/api/chat/tutor/voice',headers=HEADERS,json=audio)
    assert response.status_code==200,response.text
    assert response.json()['input_type']=='voice'
    assert response.json()['text']=='Che significa magari?'
    assert 'شاید' in response.json()['reply']
    assert len(seen)==1
    assert seen[0]['contents'][0]['parts'][1]['inlineData']['data']==audio['data']
    assert 'COMPLETE natural answer' in seen[0]['systemInstruction']['parts'][0]['text']
    assert len(client.get('/api/chat/tutor').json()['turns'])==1
    assert client.get('/api/chat/conversation').json()['turns']==[]
    client.cookies.clear()
    assert client.post('/api/chat/tutor/voice',headers=HEADERS,json=audio).status_code==401


@pytest.mark.parametrize('answer,verdict,expected,errors',[
    ('conosco\nquesto cafe','incorrect','Conoscevo il proprietario di questo bar.',['زمان فعل و معنی با سؤال یکی نیست.']),
    ('conosco questo cafe','incorrect','Conoscevo il proprietario di questo bar.',['زمان حال به‌جای گذشته آمده و صاحب بار حذف شده است.']),
    ('Conoscevo il proprietario di questo bar.','correct','Conoscevo il proprietario di questo bar.',[]),
    ('چرا باید imperfetto باشه؟','not_an_answer','',[]),
])
def test_checker_replaces_false_praise(signed_api,monkeypatch,answer,verdict,expected,errors):
    client,sessions=signed_api
    owner=client.get('/api/auth/me').json()['id']
    task='«من صاحب این بار را می‌شناختم» را ایتالیایی بگو.'
    with sessions() as s:
        s.add(ChatTurn(id='exercise',user_id=owner,channel='tutor',text='تمرین بده',response={'reply':task},created_at=chat.datetime.now(chat.timezone.utc)));s.commit()
    calls=[]
    async def fake(prompt,payload,**kwargs):
        calls.append((prompt,payload))
        if prompt==chat.CHECK_PROMPT:
            assert payload['history'][-1]['assistant']['reply']==task
            assert payload['learner_answer']==answer
            return json.dumps({'verdict':verdict,'task':task,'learner_answer':answer+'.','expected_answer':expected,'errors':errors,'feedback':('این پاسخ با سؤال مطابقت ندارد. '+expected+' '+errors[0]) if errors else ('درست است.' if verdict=='correct' else '')})
        return json.dumps({'reply':'عالیه کاملاً درسته!'})
    monkeypatch.setattr(chat,'request_json',fake)
    response=client.post('/api/chat/tutor',headers=HEADERS,json={'text':answer})
    assert response.status_code==200,response.text
    assert len(calls)==2
    if verdict=='incorrect':
        assert 'عالیه' not in response.json()['reply']
        assert expected in response.json()['reply']
        assert response.json()['assessment']['verdict']=='incorrect'
    if verdict=='not_an_answer':assert 'assessment' not in response.json()


def test_failed_checker_does_not_save_unverified_praise(signed_api,monkeypatch):
    client,sessions=signed_api;owner=client.get('/api/auth/me').json()['id']
    with sessions() as s:
        s.add(ChatTurn(id='exercise',user_id=owner,channel='tutor',text='تمرین بده',response={'reply':'بگو من او را می‌شناختم'},created_at=chat.datetime.now(chat.timezone.utc)));s.commit()
    async def fake(prompt,payload,**kwargs):
        return '{}' if prompt==chat.CHECK_PROMPT else json.dumps({'reply':'درسته!'})
    monkeypatch.setattr(chat,'request_json',fake)
    assert client.post('/api/chat/tutor',headers=HEADERS,json={'text':'conosco'}).status_code==502
    assert len(client.get('/api/chat/tutor').json()['turns'])==1


def test_wrong_voice_answer_uses_literal_transcript_and_task_before_feedback(signed_api,monkeypatch):
    client,sessions=signed_api;owner=client.get('/api/auth/me').json()['id']
    with sessions() as s:
        s.add(ChatTurn(id='exercise',user_id=owner,channel='conversation',text='تمرین بده',response={'reply':'بگو: من صاحب این بار را می‌شناختم'},created_at=chat.datetime.now(chat.timezone.utc)));s.commit()
    original=chat.AISettings
    monkeypatch.setattr(chat,'AISettings',lambda:original(gemini_api_key='test-key',gemini_model='test-model'))
    class Response:
        def raise_for_status(self):pass
        def json(self):return {'candidates':[{'content':{'parts':[{'text':json.dumps({'transcript':'conosco questo cafe','reply':'عالیه درسته!'})}]}}]}
    class Client:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def post(self,url,**kwargs):
            assert 'Transcribe LITERALLY' in kwargs['json']['systemInstruction']['parts'][0]['text']
            return Response()
    async def check(prompt,payload,**kwargs):
        assert prompt==chat.CHECK_PROMPT
        assert payload['learner_answer']=='conosco questo cafe'
        assert 'صاحب' in payload['history'][-1]['assistant']['reply']
        return json.dumps({'verdict':'incorrect','task':'من صاحب این بار را می‌شناختم','learner_answer':'conosco questo cafe','expected_answer':'Conoscevo il proprietario di questo bar.','errors':['زمان فعل و معنی با سؤال یکی نیست.'],'feedback':'این پاسخ درست نیست. Conoscevo il proprietario di questo bar.'})
    monkeypatch.setattr(chat.httpx,'AsyncClient',Client);monkeypatch.setattr(chat,'request_json',check)
    response=client.post('/api/chat/conversation/voice',headers=HEADERS,json={'mime_type':'audio/webm','data':base64.b64encode(b'voice').decode()})
    assert response.status_code==200,response.text
    assert 'عالیه' not in response.json()['reply']
    assert response.json()['assessment']['verdict']=='incorrect'
    assert response.json()['text']=='conosco questo cafe'
    assert response.json()['input_type']=='voice'


@pytest.mark.parametrize("echo", ["Conosco questo caffè.", "conosco questo cafe ", "من این کافه را می‌شناسم"])
def test_checker_echo_variation_preserves_original_without_502(monkeypatch, echo):
    import asyncio
    original = "conosco questo cafe"
    async def fake(prompt, payload, **kwargs):
        assert payload["learner_answer"] == original
        return json.dumps({"verdict":"incorrect", "task":"من صاحب این بار را می‌شناختم", "learner_answer":echo,
                           "expected_answer":"Conoscevo il proprietario di questo bar.",
                           "errors":["زمان فعل و معنی با سؤال یکی نیست."], "feedback":"زمان فعل و صاحب بار را اصلاح کن."})
    monkeypatch.setattr(chat, "request_json", fake)
    result = asyncio.run(chat.check_answer({"history":[{"assistant":{"reply":"من صاحب این بار را می‌شناختم"}}]}, original, {"reply":"درسته!"}))
    assert result["assessment"]["learner_answer"] == original
    assert result["assessment"]["verdict"] == "incorrect"
    assert result["reply"] != "درسته!"
