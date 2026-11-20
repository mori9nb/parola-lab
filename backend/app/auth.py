"""Cookie sessions. Shared development bearer tokens never grant access."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pwdlib import PasswordHash
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import db
from app.models import User, LoginSession, AuthRateLimit

router = APIRouter(prefix="/api/auth", tags=["accounts"])
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))
COOKIE = "parola_session"


def now_utc():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


async def enforce_request_origin(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("x-parola-request") != "1":
            return JSONResponse({"detail": "Missing request protection header"}, status_code=403)
        origin = request.headers.get("origin")
        if origin:
            expected = (settings.public_origin or settings.render_external_url).rstrip("/") or f"{request.url.scheme}://{request.headers.get('host', '')}"
            if not origin.lower().startswith(("http://", "https://")) or origin.rstrip("/").lower() != expected.lower():
                return JSONResponse({"detail": "Cross-origin request rejected"}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Cross-site request rejected"}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def get_current_user_id(request: Request, session: Session = Depends(db)) -> str:
    token = request.cookies.get(COOKIE, "")
    if not token or len(token) > 256:
        raise HTTPException(401, "Sign in required")
    record = session.get(LoginSession, token_digest(token))
    if record is None or utc(record.expires_at) <= now_utc():
        raise HTTPException(401, "Session expired; sign in again")
    user = session.get(User, record.user_id)
    if user is None or not user.password_hash:
        raise HTTPException(401, "Sign in required")
    return user.id


def authorize(user_id: str = Depends(get_current_user_id)):
    return user_id


def public_user(user):
    return {"id": user.id, "email": user.email, "display_name": user.display_name}


def rate_limit(session, request, email, action, limit=10, minutes=15):
    peer = request.client.host if request.client else "unknown"
    key = action + ":" + token_digest(peer + ":" + email)
    now = now_utc()
    session.execute(delete(AuthRateLimit).where(AuthRateLimit.resets_at < now - timedelta(days=1)))
    # Both PostgreSQL and modern SQLite support this conflict-safe insertion.
    from sqlalchemy import text
    session.execute(text("INSERT INTO auth_rate_limits (key, count, resets_at) VALUES (:key, 0, :reset) ON CONFLICT (key) DO NOTHING"), {"key": key, "reset": now + timedelta(minutes=minutes)})
    row = session.scalar(select(AuthRateLimit).where(AuthRateLimit.key == key).with_for_update())
    if utc(row.resets_at) <= now:
        row.count = 0
        row.resets_at = now + timedelta(minutes=minutes)
    if row.count >= limit:
        session.rollback()
        raise HTTPException(429, "Too many attempts; try again later", headers={"Retry-After": str(minutes * 60)})
    row.count += 1
    session.commit()


def issue_session(session, user_id, response, old_token=None):
    if old_token:
        session.execute(delete(LoginSession).where(LoginSession.token_hash == token_digest(old_token)))
    session.execute(delete(LoginSession).where(LoginSession.expires_at <= now_utc()))
    token = secrets.token_urlsafe(32)
    lifetime = timedelta(days=settings.session_lifetime_days)
    session.add(LoginSession(token_hash=token_digest(token), user_id=user_id, expires_at=now_utc() + lifetime))
    session.commit()
    response.set_cookie(COOKIE, token, max_age=int(lifetime.total_seconds()), path="/", httponly=True, secure=settings.session_cookie_secure, samesite="lax")


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().casefold()


class Register(Credentials):
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Display name is required")
        return value


@router.post("/register", status_code=201)
def register(data: Register, request: Request, response: Response, session: Session = Depends(db)):
    if not settings.auth_registration_enabled:
        raise HTTPException(403, "Registration is disabled")
    rate_limit(session, request, "", "register", limit=20, minutes=60)
    user = User(id=str(uuid4()), email=data.email, display_name=data.display_name, password_hash=passwords.hash(data.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "An account with this email already exists")
    issue_session(session, user.id, response, request.cookies.get(COOKIE))
    return public_user(user)


@router.post("/login")
def login(data: Credentials, request: Request, response: Response, session: Session = Depends(db)):
    rate_limit(session, request, "", "login-ip", limit=60)
    rate_limit(session, request, data.email, "login")
    user = session.scalar(select(User).where(User.email == data.email))
    valid = passwords.verify(data.password, user.password_hash if user and user.password_hash else DUMMY_HASH)
    if not valid or user is None or not user.password_hash:
        raise HTTPException(401, "Email or password is incorrect")
    issue_session(session, user.id, response, request.cookies.get(COOKIE))
    return public_user(user)


@router.get("/me")
def me(user_id: str = Depends(get_current_user_id), session: Session = Depends(db)):
    return public_user(session.get(User, user_id))


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, session: Session = Depends(db)):
    token = request.cookies.get(COOKIE)
    if token:
        session.execute(delete(LoginSession).where(LoginSession.token_hash == token_digest(token)))
        session.commit()
    response.delete_cookie(COOKIE, path="/", secure=settings.session_cookie_secure, httponly=True, samesite="lax")


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


@router.post("/password")
def change_password(data: PasswordChange, request: Request, response: Response, user_id: str = Depends(get_current_user_id), session: Session = Depends(db)):
    rate_limit(session, request, user_id, "password")
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if not passwords.verify(data.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = passwords.hash(data.new_password)
    session.execute(delete(LoginSession).where(LoginSession.user_id == user_id))
    issue_session(session, user_id, response)
    return {"updated": True}
