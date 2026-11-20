"""Run from your laptop to administer the Neon accounts without a public admin API."""
import argparse
import getpass
import os
from pathlib import Path
import sys
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))


def main():
    parser=argparse.ArgumentParser(description='Parola private account administration')
    parser.add_argument('action',choices=['create','list','disable','enable','rename','reset-password'])
    args=parser.parse_args()
    os.chdir(ROOT/'backend')
    from app.config import Settings
    from app.models import User
    from app.user_admin import create_user,update_user
    url=Settings(_env_file=None,database_url=getpass.getpass('DIRECT Neon database URL (hidden): ').strip()).database_url
    parsed=make_url(url)
    if not parsed.drivername.startswith('postgresql') or not parsed.host or not parsed.host.endswith('.neon.tech'):
        raise ValueError('Use the Neon PostgreSQL connection URL.')
    if parsed.query.get('sslmode') not in ('require','verify-full','verify-ca'):raise ValueError('Keep sslmode=require in the URL.')
    engine=create_engine(url,pool_pre_ping=True,connect_args={'connect_timeout':15})
    with Session(engine) as session:
        if args.action=='list':
            for user in session.scalars(select(User).where(User.email.is_not(None)).order_by(User.email)):
                print(f'{user.email} | {user.display_name} | {"enabled" if user.access_enabled else "disabled"}')
            return
        email=input('Account email: ').strip()
        value=None
        if args.action in ('create','rename'):name=input('Display name: ').strip()
        if args.action in ('create','reset-password'):
            password=getpass.getpass('Password (12–128 characters): ')
            if password!=getpass.getpass('Repeat password: '):raise ValueError('Passwords do not match.')
        if args.action=='create':user=create_user(session,email,name,password)
        else:
            if args.action=='disable' and input('Disable this account and revoke its sessions? Type DISABLE: ')!='DISABLE':
                raise ValueError('Cancelled; nothing changed.')
            value=name if args.action=='rename' else password if args.action=='reset-password' else None
            user=update_user(session,email,args.action,value)
        print(f'Done: {user.email} | {user.display_name} | {"enabled" if user.access_enabled else "disabled"}')
        if args.action=='create':print('Share the email and initial password privately. The user can change the password in Settings.')
    engine.dispose()


if __name__=='__main__':
    try:main()
    except ValueError as exc:raise SystemExit(str(exc))
    except SQLAlchemyError:raise SystemExit('Database operation failed. Verify migration 007 is deployed, then check the URL and network. Do not share credentials.')
    except KeyboardInterrupt:raise SystemExit('Cancelled.')
