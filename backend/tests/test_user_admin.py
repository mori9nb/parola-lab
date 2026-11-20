import pytest
from sqlalchemy import select
from app.auth import passwords
from app.models import User, Item, LoginSession, DEV_USER_ID
from app.user_admin import create_user,update_user
from conftest import HEADERS


def test_admin_created_account_has_private_space_and_public_registration_stays_closed(api_env,monkeypatch):
    from app.config import settings
    client,sessions=api_env
    monkeypatch.setattr(settings,'auth_registration_enabled',False)
    with sessions() as s:
        user=create_user(s,'Friend@EXAMPLE.com','Friend','long-test-password')
        assert user.email=='friend@example.com'
        assert passwords.verify('long-test-password',user.password_hash)
    body={'email':'friend@example.com','password':'long-test-password'}
    assert client.post('/api/auth/register',headers=HEADERS,json={**body,'display_name':'Friend'}).status_code==403
    assert client.post('/api/auth/login',headers=HEADERS,json=body).status_code==200
    assert client.get('/api/notebook').json()['items']==[]


def test_disabled_user_loses_session_and_login_but_data_survives(api_env):
    client,sessions=api_env
    with sessions() as s:
        user=create_user(s,'friend@example.com','Friend','long-test-password');uid=user.id
        s.add(Item(id='private-item',user_id=uid,text='cane',meaning='سگ',kind='word',level='A1'));s.commit()
    body={'email':'friend@example.com','password':'long-test-password'}
    assert client.post('/api/auth/login',headers=HEADERS,json=body).status_code==200
    with sessions() as s:update_user(s,body['email'],'disable')
    assert client.get('/api/notebook').status_code==401
    assert client.post('/api/auth/login',headers=HEADERS,json=body).status_code==401
    with sessions() as s:
        assert s.get(Item,'private-item') is not None
        assert s.scalars(select(LoginSession).where(LoginSession.user_id==uid)).all()==[]
        update_user(s,body['email'],'enable')
    assert client.post('/api/auth/login',headers=HEADERS,json=body).status_code==200
    assert len(client.get('/api/notebook').json()['items'])==1


def test_admin_validation_rename_reset_and_owner_protection(api_env):
    _,sessions=api_env
    with sessions() as s:
        owner=s.get(User,DEV_USER_ID);owner.email='owner@example.com';s.commit()
        with pytest.raises(ValueError,match='cannot be disabled'):update_user(s,'owner@example.com','disable')
        user=create_user(s,'friend@example.com','Old','long-test-password')
        with pytest.raises(ValueError,match='already exists'):create_user(s,'FRIEND@example.com','Other','long-test-password')
        update_user(s,user.email,'rename','New')
        update_user(s,user.email,'reset-password','another-long-password')
        assert user.display_name=='New'
        assert passwords.verify('another-long-password',user.password_hash)
