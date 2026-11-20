"""Database-owner administration, deliberately not exposed over HTTP."""
from uuid import uuid4
from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select, delete
from app.auth import passwords
from app.models import User, LoginSession, DEV_USER_ID


def email_address(value):
    return str(TypeAdapter(EmailStr).validate_python(value)).strip().casefold()


def create_user(session, email, name, password):
    email=email_address(email)
    if not 12 <= len(password) <= 128:raise ValueError('Password must contain 12–128 characters.')
    if not name.strip() or len(name.strip())>100:raise ValueError('Name must contain 1–100 characters.')
    if session.scalar(select(User).where(User.email==email)):raise ValueError('Account already exists; use rename/reset instead.')
    user=User(id=str(uuid4()),email=email,display_name=name.strip(),password_hash=passwords.hash(password),access_enabled=True)
    session.add(user);session.commit()
    return user


def update_user(session, email, action, value=None):
    user=session.scalar(select(User).where(User.email==email_address(email)).with_for_update())
    if user is None:raise ValueError('Account not found.')
    if action=='disable':
        if user.id==DEV_USER_ID:raise ValueError('The migrated owner account cannot be disabled with this tool.')
        user.access_enabled=False
    elif action=='enable':user.access_enabled=True
    elif action=='rename':
        if not value or not value.strip() or len(value.strip())>100:raise ValueError('Name must contain 1–100 characters.')
        user.display_name=value.strip()
    elif action=='reset-password':
        if not value or not 12<=len(value)<=128:raise ValueError('Password must contain 12–128 characters.')
        user.password_hash=passwords.hash(value)
    else:raise ValueError('Unknown action.')
    if action in ('disable','reset-password'):
        session.execute(delete(LoginSession).where(LoginSession.user_id==user.id))
    session.commit()
    return user
