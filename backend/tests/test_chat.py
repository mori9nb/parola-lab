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
