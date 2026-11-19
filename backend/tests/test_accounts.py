from datetime import timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from app.main import app
from app.models import User, LoginSession, PracticeEvent, Item, GrammarEntry, DEV_USER_ID
from app.auth import COOKIE, now_utc, token_digest
from app.manage import claim_development
from conftest import HEADERS

PASSWORD = "long-test-password"
def register(client, email="alice@example.com"):
    r=client.post('/api/auth/register',headers=HEADERS,json={'email':email,'password':PASSWORD,'display_name':'Alice'})
    assert r.status_code==201,r.text
    return r

def test_cookie_auth_and_deprecated_token_cannot_bypass(api_env):
    c,sessions=api_env
    assert c.get('/api/notebook',headers={'Authorization':'Bearer test-only-token'}).status_code==401
    r=register(c)
    assert 'HttpOnly' in r.headers['set-cookie'] and 'SameSite=lax' in r.headers['set-cookie']
    assert c.get('/api/auth/me').json()['email']=='alice@example.com'
    token=c.cookies[COOKIE]
    with sessions() as s:
        u=s.get(User,r.json()['id']);assert u.password_hash.startswith('$argon2id$')
        assert u.password_hash!=PASSWORD and s.get(LoginSession,token_digest(token)) is not None
    assert c.get('/api/notebook').status_code==200

def test_logout_revokes_and_login_rotates_session(api_env):
    c,_=api_env;register(c);old=c.cookies[COOKIE]
    assert c.post('/api/auth/logout',headers=HEADERS).status_code==204
    assert c.get('/api/auth/me').status_code==401
    c.cookies.set(COOKIE,old);assert c.get('/api/auth/me').status_code==401
    c.cookies.clear()
    assert c.post('/api/auth/login',headers=HEADERS,json={'email':'ALICE@example.com','password':PASSWORD}).status_code==200
    assert c.cookies[COOKIE]!=old

def test_sessions_expire(api_env):
    c,sessions=api_env;register(c)
    with sessions() as s:
        row=s.get(LoginSession,token_digest(c.cookies[COOKIE]));row.expires_at=now_utc()-timedelta(seconds=1);s.commit()
    assert c.get('/api/account').status_code==401

@pytest.mark.parametrize('origin',['https://attacker.invalid','null','http://testserver.evil.invalid'])
def test_csrf_rejects_foreign_origin(api_env,origin):
    c,_=api_env
    assert c.post('/api/auth/login',headers={**HEADERS,'Origin':origin},json={'email':'a@example.com','password':PASSWORD}).status_code==403

def test_csrf_requires_header_and_accepts_same_origin(api_env):
    c,_=api_env;data={'email':'a@example.com','password':PASSWORD,'display_name':'A'}
    assert c.post('/api/auth/register',json=data).status_code==403
    assert c.post('/api/auth/register',headers={**HEADERS,'Origin':'http://testserver'},json=data).status_code==201

def test_login_rate_limit_and_generic_failure(api_env):
    c,_=api_env;data={'email':'missing@example.com','password':PASSWORD}
    for _ in range(10):
        r=c.post('/api/auth/login',headers=HEADERS,json=data)
        assert r.status_code==401 and r.json()['detail']=='Email or password is incorrect'
    assert c.post('/api/auth/login',headers=HEADERS,json=data).status_code==429

def test_duplicate_email_and_weak_password(api_env):
    c,_=api_env;register(c)
    assert c.post('/api/auth/register',headers=HEADERS,json={'email':'ALICE@example.com','password':PASSWORD,'display_name':'B'}).status_code==409
    assert c.post('/api/auth/register',headers=HEADERS,json={'email':'b@example.com','password':'short','display_name':'B'}).status_code==422

def test_account_preferences_and_profile_are_private(api_env):
    c,_=api_env;alice=register(c).json();state=c.get('/api/account').json()
    r=c.patch('/api/account',headers=HEADERS,json={'revision':state['revision'],'display_name':'غزل','settings':{'level':'B1','daily':20,'timezone':'Asia/Tehran'},'onboarded':True})
    assert r.status_code==200,r.text
    assert r.json()['user']['display_name']=='غزل' and r.json()['settings']['daily']==20 and r.json()['onboarded']
    token=c.cookies[COOKIE];c.cookies.clear();register(c,'bob@example.com')
    state=c.get('/api/account').json();assert state['user']['id']!=alice['id'] and state['settings']['level']=='A2' and state['history']==[]
    c.cookies.clear();c.cookies.set(COOKIE,token)
    assert c.get('/api/account').json()['settings']['level']=='B1'

def test_stale_settings_do_not_overwrite(api_env):
    c,_=api_env;register(c);rev=c.get('/api/account').json()['revision']
    assert c.patch('/api/account',headers=HEADERS,json={'revision':rev,'settings':{'daily':20}}).status_code==200
    assert c.patch('/api/account',headers=HEADERS,json={'revision':rev,'settings':{'daily':5}}).status_code==409
    assert c.get('/api/account').json()['settings']['daily']==20

def test_password_change_revokes_other_devices(api_env):
    c,_=api_env;register(c);other=TestClient(app)
    assert other.post('/api/auth/login',headers=HEADERS,json={'email':'alice@example.com','password':PASSWORD}).status_code==200
    assert c.post('/api/auth/password',headers=HEADERS,json={'current_password':PASSWORD,'new_password':'new-long-password'}).status_code==200
    assert c.get('/api/auth/me').status_code==200 and other.get('/api/auth/me').status_code==401
    other.close()

def test_local_owner_keeps_data_and_registration_never_claims_it(api_env):
    c,sessions=api_env
    with sessions() as s:
        s.add(Item(id='old-item',user_id=DEV_USER_ID,text='Ciao',meaning='سلام',kind='word',level='A1'));s.commit()
        assert claim_development(s,'owner@example.com','Owner',PASSWORD)==DEV_USER_ID
    register(c);assert c.get('/api/notebook').json()['items']==[]
    c.cookies.clear()
    assert c.post('/api/auth/login',headers=HEADERS,json={'email':'owner@example.com','password':PASSWORD}).status_code==200
    assert c.get('/api/notebook').json()['items'][0]['id']=='old-item'
    with sessions() as s:
        with pytest.raises(ValueError):claim_development(s,'other@example.com','Other',PASSWORD)

@pytest.mark.parametrize('kind',['notebook','grammar'])
def test_review_idempotency_and_history_isolation(api_env,kind):
    c,sessions=api_env;uid=register(c).json()['id']
    with sessions() as s:
        if kind=='notebook':s.add(Item(id='resource',user_id=uid,client_id='browser-1',text='Ciao',meaning='سلام',kind='word',level='A1'))
        else:s.add(GrammarEntry(id='resource',user_id=uid,client_id='g1',text='Ho ___ .',options=['a','b','c','d'],answer='a',meaning='معنی',explanation='توضیح'))
        s.commit()
    path='/api/items/resource/review' if kind=='notebook' else '/api/grammar/entries/resource/review'
    attempt=str(uuid4());data={'correct':True,'attempt_id':attempt}
    first=c.post(path,headers=HEADERS,json=data);second=c.post(path,headers=HEADERS,json=data)
    assert first.status_code==second.status_code==200 and first.json()==second.json() and first.json()['attempts']==1
    assert c.post(path,headers=HEADERS,json={**data,'correct':False}).status_code==409
    state=c.get('/api/account').json()
    assert state['stats']['attempts']==state['stats']['correct']==1 and len(state['history'])==1
    assert state['history'][0]['attempt_id']==attempt and state['history'][0]['kind']==kind
    with sessions() as s:assert s.scalar(select(func.count(PracticeEvent.id)))==1
    c.cookies.clear();register(c,'bob@example.com')
    assert c.post(path,headers=HEADERS,json={'correct':True,'attempt_id':str(uuid4())}).status_code==404
    assert c.get('/api/history').json()['items']==[]

def test_legacy_history_migrates_once_only_for_local_owner(api_env):
    c,sessions=api_env
    with sessions() as s:claim_development(s,'owner@example.com','Owner',PASSWORD)
    c.post('/api/auth/login',headers=HEADERS,json={'email':'owner@example.com','password':PASSWORD})
    assert c.get('/api/account').json()['legacy_import_allowed']
    data={'settings':{'level':'B2'},'history':[{'id':'g1','correct':True,'date':'2026-11-18','at':1795000000000}],'onboarded':True}
    r=c.post('/api/account/legacy',headers=HEADERS,json=data)
    assert r.status_code==200,r.text
    assert r.json()['stats']['attempts']==1 and r.json()['settings']['level']=='B2'
    assert c.post('/api/account/legacy',headers=HEADERS,json=data).json()['stats']['attempts']==1
    c.cookies.clear();register(c)
    assert c.post('/api/account/legacy',headers=HEADERS,json=data).status_code==403

def test_history_pagination(signed_api):
    c,_=signed_api;item=c.post('/api/items',headers=HEADERS,json={'text':'Ciao','meaning':'سلام'}).json()
    for _ in range(3):assert c.post(f"/api/items/{item['id']}/review",headers=HEADERS,json={'correct':True,'attempt_id':str(uuid4())}).status_code==200
    first=c.get('/api/history?limit=2').json();second=c.get('/api/history',params={'limit':2,'before':first['next_cursor']}).json()
    assert len(first['items'])==2 and len(second['items'])==1
    assert not ({e['attempt_id'] for e in first['items']}&{e['attempt_id'] for e in second['items']})

def test_local_password_reset_revokes_sessions(api_env):
    from app.manage import reset_password
    c,sessions=api_env;register(c)
    with sessions() as s:reset_password(s,'alice@example.com','reset-long-password')
    assert c.get('/api/auth/me').status_code==401
    c.cookies.clear()
    assert c.post('/api/auth/login',headers=HEADERS,json={'email':'alice@example.com','password':'reset-long-password'}).status_code==200

def test_registration_can_be_disabled(api_env,monkeypatch):
    from app.config import settings
    c,_=api_env;monkeypatch.setattr(settings,'auth_registration_enabled',False)
    assert c.post('/api/auth/register',headers=HEADERS,json={'email':'a@example.com','password':PASSWORD,'display_name':'A'}).status_code==403

def test_invalid_timezone_cannot_corrupt_preferences(signed_api):
    c,_=signed_api;rev=c.get('/api/account').json()['revision']
    assert c.patch('/api/account',headers=HEADERS,json={'revision':rev,'settings':{'timezone':'Missing/Timezone'}}).status_code==422
    assert c.get('/api/account').json()['settings']['timezone']=='Europe/Rome'
