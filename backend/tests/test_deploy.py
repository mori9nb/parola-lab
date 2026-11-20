from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from app.config import Settings
from app.frontend import mount_frontend


def test_neon_url_uses_installed_psycopg_driver_without_losing_tls_query():
    config = Settings(_env_file=None, database_url='postgresql://owner:secret@ep-example.neon.tech/neondb?sslmode=require&channel_binding=require')
    assert config.database_url == 'postgresql+psycopg://owner:secret@ep-example.neon.tech/neondb?sslmode=require&channel_binding=require'
    assert Settings(_env_file=None, database_url='sqlite://').database_url == 'sqlite://'


def test_production_frontend_keeps_api_routes_and_health_on_same_origin(tmp_path):
    app=FastAPI()
    @app.get('/api/probe')
    def api():return {'private':'api'}
    @app.get('/health')
    def health():return {'status':'ok'}
    (tmp_path/'index.html').write_text('<html>PAROLA BUILD</html>')
    (tmp_path/'assets').mkdir();(tmp_path/'assets'/'app.js').write_text('console.log("parola")')
    mount_frontend(app,tmp_path)
    client=TestClient(app)
    assert client.get('/').text=='<html>PAROLA BUILD</html>'
    assert client.get('/assets/app.js').status_code==200
    assert client.get('/api/probe').json()=={'private':'api'}
    assert client.get('/health').json()=={'status':'ok'}
    assert client.get('/.env').status_code==404


def test_missing_frontend_fails_instead_of_publishing_a_broken_site(tmp_path):
    with pytest.raises(RuntimeError,match='Frontend build is missing'):
        mount_frontend(FastAPI(),tmp_path)


def test_render_https_origin_is_used_for_request_protection(signed_api,monkeypatch):
    from app.config import settings
    client,_=signed_api
    monkeypatch.setattr(settings,'public_origin','')
    monkeypatch.setattr(settings,'render_external_url','https://parola-example.onrender.com')
    allowed=client.post('/api/chat/tutor',headers={'X-Parola-Request':'1','Origin':'https://parola-example.onrender.com'},json={'text':''})
    assert allowed.status_code==422
    denied=client.post('/api/chat/tutor',headers={'X-Parola-Request':'1','Origin':'https://another-site.example'},json={'text':'ciao'})
    assert denied.status_code==403
