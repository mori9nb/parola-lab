"""Copy a local notebook database into fresh Neon; never modify the source."""
import getpass
import os
from pathlib import Path
import subprocess
import sys
from sqlalchemy import create_engine, select, func, inspect, text
from sqlalchemy.exc import SQLAlchemyError
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
SKIP={'login_sessions','auth_rate_limits'}


def require_empty(target,tables):
    existing=set(inspect(target).get_table_names(schema=None))
    known={t.name for t in tables}|{'alembic_version'}
    if existing-known:
        raise ValueError('Destination has unrelated tables; use a fresh Neon database.')
    for table in tables:
        if table.name not in existing:continue
        count=target.scalar(select(func.count()).select_from(table))
        if table.name=='users' and count==1:
            row=target.execute(select(table)).mappings().one()
            if row['id']=='00000000-0000-0000-0000-000000000001' and not row['email'] and not row['password_hash']:continue
        if count:raise ValueError('Destination already has application data; nothing will be overwritten.')


def copy_snapshot(source,target,tables):
    require_empty(target,tables)
    users=next(t for t in tables if t.name=='users')
    if not source.scalar(select(func.count()).select_from(users).where(users.c.password_hash.is_not(None))):
        raise ValueError('Source has no configured login account; create the local owner first.')
    target.execute(users.delete()) # Only the verified empty migration stub.
    counts={}
    for table in tables:
        if table.name in SKIP:continue
        rows=source.execute(select(table)).mappings();total=0
        while batch:=rows.fetchmany(500):
            target.execute(table.insert(),[dict(row) for row in batch]);total+=len(batch)
        counts[table.name]=total
    return counts


def main():
    os.chdir(ROOT/'backend')
    from app.config import Settings,settings
    from app.database import Base
    from app import models
    from sqlalchemy.engine import make_url
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    raw=getpass.getpass('Paste the DIRECT Neon connection URL (hidden): ').strip()
    target_url=Settings(_env_file=None,database_url=raw).database_url
    parsed=make_url(target_url)
    if not parsed.drivername.startswith('postgresql') or not parsed.host or not parsed.host.endswith('.neon.tech'):
        raise ValueError('Expected a Neon PostgreSQL connection URL.')
    if '-pooler' in parsed.host:raise ValueError('Disable connection pooling in Neon and copy the DIRECT URL.')
    if parsed.query.get('sslmode') not in ('require','verify-full','verify-ca'):raise ValueError('Keep sslmode=require in the Neon URL.')
    source=create_engine(settings.database_url,pool_pre_ping=True)
    target=create_engine(target_url,pool_pre_ping=True)
    tables=Base.metadata.sorted_tables
    with target.connect() as c:require_empty(c,tables)
    head=ScriptDirectory.from_config(Config('alembic.ini')).get_current_head()
    with source.connect() as c:
        if c.scalar(text('SELECT version_num FROM alembic_version'))!=head:raise ValueError('Run local alembic upgrade head first.')
    env={**os.environ,'DATABASE_URL':target_url,'SERVE_FRONTEND':'false'}
    result=subprocess.run([sys.executable,'-m','alembic','upgrade','head'],env=env,capture_output=True,text=True)
    if result.returncode:raise ValueError('Neon schema setup failed; verify SSL and connectivity. Source is untouched.')
    with source.connect().execution_options(isolation_level='REPEATABLE READ') as src:
        with src.begin(),target.begin() as dst:counts=copy_snapshot(src,dst,tables)
    source.dispose();target.dispose()
    print('Transfer complete. Local source is unchanged. Copied records:')
    for name,count in counts.items():print(f'  {name}: {count}')
    print('Deploy Render next and sign in with the same account.')


if __name__=='__main__':
    try:main()
    except ValueError as exc:print(str(exc),file=sys.stderr);raise SystemExit(1)
    except SQLAlchemyError:print('Database connection/transfer failed. Check the URL and network. Do not share credentials.',file=sys.stderr);raise SystemExit(1)
    except KeyboardInterrupt:raise SystemExit('Cancelled.')
