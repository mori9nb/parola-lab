"""Optional real-PostgreSQL migration/concurrency checks, enabled by TEST_POSTGRES_URL."""
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text, select, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User, Item, Review, PracticeEvent, DEV_USER_ID
from app.accounts import record_review, update_account, AccountPatch, read_account

pytestmark = pytest.mark.skipif(not os.environ.get('TEST_POSTGRES_URL'), reason='Set TEST_POSTGRES_URL for real PostgreSQL migration/concurrency tests')

@pytest.fixture
def pg_schema():
    url=make_url(os.environ['TEST_POSTGRES_URL'])
    admin=create_engine(url)
    schema='parola_test_'+uuid4().hex
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA {schema}'))
    scoped=url.update_query_dict({'options':f'-csearch_path={schema}'})
    engine=create_engine(scoped)
    try:
        yield engine, scoped
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        admin.dispose()


def test_real_postgres_migration_preserves_existing_notebook(pg_schema):
    engine,url=pg_schema
    backend=Path(__file__).resolve().parents[1]
    env={**os.environ,'DATABASE_URL':url.render_as_string(hide_password=False)}
    def migrate(target):
        result=subprocess.run([sys.executable,'-m','alembic','upgrade',target],cwd=backend,env=env,capture_output=True,text=True)
        assert result.returncode==0,result.stdout+result.stderr
    migrate('004')
    with engine.begin() as c:
        c.execute(text("INSERT INTO items (id,user_id,text,meaning,kind,level,source_language,target_language,example,translation,tag,note,origin,source_text,analysis_status) VALUES ('preserved',:owner,'Ciao','hello','word','A1','fa','it','','','','','user','','completed')"),{'owner':DEV_USER_ID})
    migrate('head')
    with engine.connect() as c:
        assert c.execute(text('SELECT version_num FROM alembic_version')).scalar_one()=='007'
        assert c.execute(text("SELECT count(*) FROM items WHERE id='preserved'")).scalar_one()==1


def test_real_postgres_concurrent_attempts_are_idempotent(pg_schema):
    engine,_=pg_schema;Base.metadata.create_all(engine);sessions=sessionmaker(engine)
    with sessions() as s:
        s.add(User(id='user',display_name='Owner'));s.commit()
        s.add(Item(id='item',user_id='user',text='Ciao',meaning='hello',kind='word',level='A1'));s.commit()
    attempt=uuid4()
    def run(identifier):
        with sessions() as s:
            return record_review(s,'user','notebook','item',True,identifier)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(run,[attempt]*4))
    assert all(result['attempts']==1 for result in results)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(run,[uuid4() for _ in range(4)]))
    with sessions() as s:
        assert s.get(Review,'item').attempts==5
        assert s.scalar(select(func.count(PracticeEvent.id)))==5


def test_real_postgres_concurrent_settings_detect_stale_revision(pg_schema):
    engine,_=pg_schema;Base.metadata.create_all(engine);sessions=sessionmaker(engine)
    with sessions() as s:
        s.add(User(id='user',display_name='Owner'));s.commit()
        revision=read_account('user',s)['revision']
    def update(daily):
        with sessions() as s:
            try:
                update_account(AccountPatch(revision=revision,settings={'daily':daily}),'user',s)
                return 200
            except HTTPException as error:
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses=list(pool.map(update,[5,20]))
    assert sorted(statuses)==[200,409]
