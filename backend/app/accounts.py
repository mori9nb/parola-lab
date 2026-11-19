from datetime import datetime, timedelta, timezone, date
from typing import Literal
from uuid import UUID, uuid4, uuid5, NAMESPACE_URL
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, func, case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user_id, public_user, utc, now_utc
from app.database import db
from app.models import User, Item, Review, GrammarEntry, GrammarReview, AccountPreferences, PracticeEvent, DEV_USER_ID

router = APIRouter(tags=["account-data"])
DEFAULT_SETTINGS = {"level": "A2", "daily": 10, "base": "fa", "target": "it", "timezone": "Europe/Rome"}


def preferences(session, user_id):
    row = session.get(AccountPreferences, user_id)
    if row is None:
        row = AccountPreferences(user_id=user_id, settings=dict(DEFAULT_SETTINGS), generation_days={}, onboarded=False, legacy_imported=user_id != DEV_USER_ID, revision=0)
        session.add(row)
        session.flush()
    return row


def event_out(event):
    return {"id": event.client_id, "attempt_id": event.attempt_id, "kind": event.kind, "correct": event.correct, "date": event.day, "at": int(utc(event.occurred_at).timestamp() * 1000)}


def account_out(session, user_id, pref=None):
    user = session.get(User, user_id)
    pref = pref or preferences(session, user_id)
    config = {**DEFAULT_SETTINGS, **pref.settings}
    today = now_utc().astimezone(ZoneInfo(config["timezone"])).date().isoformat()
    total, correct, days, today_count = session.execute(select(
        func.count(PracticeEvent.id),
        func.coalesce(func.sum(case((PracticeEvent.correct.is_(True), 1), else_=0)), 0),
        func.count(func.distinct(PracticeEvent.day)),
        func.coalesce(func.sum(case((PracticeEvent.day == today, 1), else_=0)), 0),
    ).where(PracticeEvent.user_id == user_id)).one()
    events = session.scalars(select(PracticeEvent).where(PracticeEvent.user_id == user_id).order_by(PracticeEvent.occurred_at.desc(), PracticeEvent.id.desc()).limit(5000)).all()
    return {
        "user": public_user(user), "settings": config,
        "generationDays": pref.generation_days, "onboarded": pref.onboarded,
        "revision": pref.revision, "history": [event_out(e) for e in reversed(events)],
        "history_truncated": total > 5000,
        "stats": {"attempts": total, "correct": correct, "practiced_days": days, "today": today_count, "date": today},
        "legacy_import_allowed": user_id == DEV_USER_ID and not pref.legacy_imported and pref.revision == 0,
    }


@router.get("/api/account")
def read_account(user_id: str = Depends(get_current_user_id), session: Session = Depends(db)):
    session.scalar(select(User).where(User.id == user_id).with_for_update())
    pref = preferences(session, user_id)
    session.commit()
    return account_out(session, user_id, pref)


class LearningSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"] | None = None
    daily: Literal[5, 10, 15, 20] | None = None
    base: Literal["fa"] | None = None
    target: Literal["it"] | None = None
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError("Unknown time zone")
        return value


class AccountPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    settings: LearningSettings | None = None
    onboarded: bool | None = None
    generation_days: dict[str, str] | None = None

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Name cannot be blank")
        return value

    @field_validator("generation_days")
    @classmethod
    def valid_days(cls, values):
        if values is not None:
            if len(values) > 30:
                raise ValueError("Too many generation keys")
            for key, value in values.items():
                if key not in {x for level in ["A1", "A2", "B1", "B2", "C1", "C2"] for x in [level, "grammar:" + level]}:
                    raise ValueError("Invalid generation key")
                try:
                    year, month, day = map(int, value.split("-"))
                    date(year, month, day)
                except (ValueError, TypeError):
                    raise ValueError("Invalid generation date")
        return values


@router.patch("/api/account")
def update_account(data: AccountPatch, user_id: str = Depends(get_current_user_id), session: Session = Depends(db)):
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    pref = preferences(session, user_id)
    if pref.revision != data.revision:
        raise HTTPException(409, "Account changed on another device; reload and try again")
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.settings is not None:
        pref.settings = {**DEFAULT_SETTINGS, **pref.settings, **data.settings.model_dump(exclude_none=True)}
    if data.onboarded is not None:
        pref.onboarded = data.onboarded
    if data.generation_days is not None:
        pref.generation_days = {**pref.generation_days, **data.generation_days}
    pref.revision += 1
    session.commit()
    return account_out(session, user_id, pref)


def record_review(session, user_id, kind, resource_id, correct, attempt_id=None):
    model, review_model, key = (Item, Review, "item_id") if kind == "notebook" else (GrammarEntry, GrammarReview, "entry_id")
    resource = session.scalar(select(model).where(model.id == resource_id, model.user_id == user_id).with_for_update())
    if resource is None:
        raise HTTPException(404, "Item not found")
    attempt_id = str(attempt_id or uuid4())
    prior = session.scalar(select(PracticeEvent).where(PracticeEvent.user_id == user_id, PracticeEvent.attempt_id == attempt_id))
    if prior is not None:
        if prior.resource_id != resource_id or prior.kind != kind or prior.correct != correct or prior.result is None:
            raise HTTPException(409, "Attempt ID was already used for another answer")
        return prior.result
    review = session.get(review_model, resource_id)
    if review is None:
        review = review_model(**{key: resource_id}, streak=0, attempts=0, correct=0)
        session.add(review)
    review.attempts += 1
    review.correct += int(correct)
    review.streak = review.streak + 1 if correct else 0
    interval = timedelta(days=min(30, 2 ** min(review.streak - 1, 5))) if correct else timedelta(minutes=10)
    occurred = now_utc()
    review.due = occurred + interval
    pref = session.get(AccountPreferences, user_id)
    config = {**DEFAULT_SETTINGS, **(pref.settings if pref else {})}
    result = {"streak": review.streak, "attempts": review.attempts, "correct": review.correct, "due": review.due.isoformat(), "attempt_id": attempt_id}
    event = PracticeEvent(id=str(uuid4()), user_id=user_id, attempt_id=attempt_id, client_id=resource.client_id or f"server:{resource.id}", resource_id=resource_id, kind=kind, correct=correct, occurred_at=occurred, day=occurred.astimezone(ZoneInfo(config["timezone"])).date().isoformat(), result=result)
    session.add(event)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Attempt ID conflict; reload history")
    return result


@router.get("/api/history")
def read_history(limit: int = Query(default=100, ge=1, le=500), before: str | None = None, user_id: str = Depends(get_current_user_id), session: Session = Depends(db)):
    query = select(PracticeEvent).where(PracticeEvent.user_id == user_id)
    if before:
        try:
            cursor = session.get(PracticeEvent, str(UUID(before)))
        except ValueError:
            raise HTTPException(422, "Invalid history cursor")
        if cursor is None or cursor.user_id != user_id:
            raise HTTPException(404, "History cursor not found")
        from sqlalchemy import or_, and_
        query = query.where(or_(PracticeEvent.occurred_at < cursor.occurred_at, and_(PracticeEvent.occurred_at == cursor.occurred_at, PracticeEvent.id < cursor.id)))
    events = session.scalars(query.order_by(PracticeEvent.occurred_at.desc(), PracticeEvent.id.desc()).limit(limit + 1)).all()
    page = events[:limit]
    return {"items": [event_out(e) for e in page], "next_cursor": page[-1].id if len(events) > limit else None}


class LegacyEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=128)
    correct: bool
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    at: int = Field(ge=946684800000, le=4102444800000)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value):
        date.fromisoformat(value)
        return value


class LegacyAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    settings: LearningSettings | None = None
    display_name: str | None = Field(default=None, max_length=100)
    onboarded: bool = False
    history: list[LegacyEvent] = Field(default_factory=list, max_length=20000)
    generation_days: dict[str, str] = Field(default_factory=dict)

    @field_validator("generation_days")
    @classmethod
    def validate_days(cls, value):
        return AccountPatch.valid_days(value)


@router.post("/api/account/legacy")
def import_legacy_account(data: LegacyAccount, user_id: str = Depends(get_current_user_id), session: Session = Depends(db)):
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    pref = preferences(session, user_id)
    if user_id != DEV_USER_ID:
        raise HTTPException(403, "Legacy data belongs to the locally configured owner")
    if pref.legacy_imported or pref.revision != 0:
        return account_out(session, user_id, pref)
    if data.settings:
        pref.settings = {**DEFAULT_SETTINGS, **data.settings.model_dump(exclude_none=True)}
    if data.display_name and data.display_name.strip():
        user.display_name = data.display_name.strip()
    pref.onboarded = data.onboarded
    pref.generation_days = data.generation_days
    existing = set(session.scalars(select(PracticeEvent.attempt_id).where(PracticeEvent.user_id == user_id)).all())
    for event in data.history:
        identifier = str(uuid5(NAMESPACE_URL, f"{user_id}:legacy:{event.id}:{event.at}:{event.correct}"))
        if identifier in existing:
            continue
        existing.add(identifier)
        session.add(PracticeEvent(id=str(uuid4()), user_id=user_id, attempt_id=identifier, client_id=event.id, kind="legacy", resource_id=None, correct=event.correct, occurred_at=datetime.fromtimestamp(event.at / 1000, timezone.utc), day=event.date, result=None))
    pref.legacy_imported = True
    pref.revision += 1
    session.commit()
    return account_out(session, user_id, pref)
