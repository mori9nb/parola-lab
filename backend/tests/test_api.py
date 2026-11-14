import os
os.environ['DATABASE_URL']='sqlite://'
os.environ['API_TOKEN']='test-only-token'
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.main import app, Base, db
engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
Base.metadata.create_all(engine)
def test_db():
    with Session(engine) as session: yield session
app.dependency_overrides[db]=test_db
client=TestClient(app)
headers={'Authorization':'Bearer test-only-token'}

def test_private_api_rejects_missing_credentials():
    assert client.get('/api/items').status_code==401

def test_item_lifecycle_and_review():
    r=client.post('/api/items',headers=headers,json={'text':'Ciao','meaning':'سلام'})
    assert r.status_code==201
    item=r.json(); item_id=item['id']
    assert any(x['id']==item_id for x in client.get('/api/items',headers=headers).json())
    for correct in (True,True,False):
        r=client.post(f'/api/items/{item_id}/review',headers=headers,json={'correct':correct})
        assert r.status_code==200
    assert r.json()['streak']==0
    assert r.json()['attempts']==3
    assert r.json()['correct']==2
    assert client.delete(f'/api/items/{item_id}',headers=headers).status_code==204
    assert client.post(f'/api/items/{item_id}/review',headers=headers,json={'correct':True}).status_code==404

def test_blank_content_rejected():
    assert client.post('/api/items',headers=headers,json={'text':'  ','meaning':'سلام'}).status_code==422
