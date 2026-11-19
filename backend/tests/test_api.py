from conftest import HEADERS


def test_private_api_rejects_missing_credentials(api_env):
    client, _ = api_env
    assert client.get('/api/items').status_code == 401


def test_item_lifecycle_and_review(signed_api):
    client, _ = signed_api
    r = client.post('/api/items', headers=HEADERS, json={'text':'Ciao','meaning':'سلام'})
    assert r.status_code == 201
    item_id = r.json()['id']
    assert any(x['id'] == item_id for x in client.get('/api/items').json())
    for correct in (True, True, False):
        r = client.post(f'/api/items/{item_id}/review', headers=HEADERS, json={'correct': correct})
        assert r.status_code == 200
    assert r.json()['streak'] == 0
    assert r.json()['attempts'] == 3
    assert r.json()['correct'] == 2
    assert client.delete(f'/api/items/{item_id}', headers=HEADERS).status_code == 204
    assert client.post(f'/api/items/{item_id}/review', headers=HEADERS, json={'correct':True}).status_code == 404


def test_blank_content_rejected(signed_api):
    client, _ = signed_api
    assert client.post('/api/items', headers=HEADERS, json={'text':'  ','meaning':'سلام'}).status_code == 422
