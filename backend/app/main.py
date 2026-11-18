"""Single-owner development API. Public multi-user auth is a later milestone."""
from datetime import datetime, timezone, timedelta
from typing import Literal
from uuid import uuid4
from fastapi import FastAPI, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, String, Integer, DateTime, ForeignKey, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session
import secrets
from app.ai import (
    AnalysisError,
    analyze_content,
    generate_content,
    generate_grammar,
)

from app.schemas import (
    ContentAnalysis,
    GenerationRequest,
    GenerationResult,
    GrammarResult,
)

class Settings(BaseSettings):
    database_url: str = 'postgresql+psycopg://parola:parola@db:5432/parola'
    api_token: str = ''
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
settings = Settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine)
class Base(DeclarativeBase): pass
DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    display_name: Mapped[str] = mapped_column(
        String(100),
    )

    email: Mapped[str | None] = mapped_column(
        String(254),
        unique=True,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
class Item(Base):
    __tablename__ = 'items'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(String(2000))
    meaning: Mapped[str] = mapped_column(String(2000))
    kind: Mapped[str] = mapped_column(String(16))
    level: Mapped[str] = mapped_column(String(2))
    source_language: Mapped[str] = mapped_column(String(35), default='fa')
    target_language: Mapped[str] = mapped_column(String(35), default='it')
    example: Mapped[str] = mapped_column(String(3000), default='')
    translation: Mapped[str] = mapped_column(String(3000), default='')
    tag: Mapped[str] = mapped_column(String(100), default='')
class Review(Base):
    __tablename__ = 'reviews'
    item_id: Mapped[str] = mapped_column(ForeignKey('items.id', ondelete='CASCADE'), primary_key=True)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
class ItemIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    meaning: str = Field(min_length=1, max_length=2000)
    kind: Literal['word','phrase','sentence'] = 'word'
    level: Literal['A1','A2','B1','B2','C1','C2'] = 'A2'
    source_language: str = Field(default='fa', min_length=2, max_length=35)
    target_language: str = Field(default='it', min_length=2, max_length=35)
    example: str = Field(default='', max_length=3000)
    translation: str = Field(default='', max_length=3000)
    tag: str = Field(default='', max_length=100)
class ItemOut(ItemIn):
    id: str
    model_config = {'from_attributes': True}
class Attempt(BaseModel):
    correct: bool

def db():
    with SessionLocal() as session: yield session

def authorize(authorization: str = Header(default='')):
    if not settings.api_token:
        raise HTTPException(503, 'Set API_TOKEN before enabling the API')
    if not secrets.compare_digest(authorization, f'Bearer {settings.api_token}'):
        raise HTTPException(401, 'Invalid bearer token')
def get_current_user_id(
    _authorized=Depends(authorize),
) -> str:
    # فقط برای توسعهٔ محلی.
    # بعداً شناسه از نشست احراز هویت‌شده گرفته می‌شود.
    return DEV_USER_ID

app = FastAPI(title='Parola Lab API', version='0.1.0')
@app.get('/health')
def health(): return {'status':'ok','version':'0.1.0'}
@app.get('/api/capabilities', dependencies=[Depends(authorize)])
def capabilities(): return {'storage':'postgresql','ai':False,'speech':False,'push':False,'mode':'single-owner-development'}
@app.get('/api/items', response_model=list[ItemOut], dependencies=[Depends(authorize)])
def list_items(
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    statement = (
        select(Item)
        .where(Item.user_id == user_id)
        .order_by(Item.id)
    )

    return session.scalars(statement).all()
@app.post('/api/items', response_model=ItemOut, status_code=201, dependencies=[Depends(authorize)])
def add_item(data: ItemIn, session: Session = Depends(db),user_id: str = Depends(get_current_user_id),):
    if not data.text.strip() or not data.meaning.strip(): raise HTTPException(422,'Text and meaning cannot be blank')
    item = Item(
        id=str(uuid4()),
        user_id=user_id,
        **data.model_dump(),
    )
    session.add(item); session.commit(); session.refresh(item)
    return item
@app.delete('/api/items/{item_id}', status_code=204, dependencies=[Depends(authorize)])
def delete_item(
    item_id: str,
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    item = session.scalar(
        select(Item).where(
            Item.id == item_id,
            Item.user_id == user_id,
        )
    )
    if not item: raise HTTPException(404,'Item not found')
    review=session.get(Review,item_id)
    if review: session.delete(review); session.flush()
    session.delete(item); session.commit()
@app.post('/api/items/{item_id}/review', dependencies=[Depends(authorize)])
def review_item(
    item_id: str,
    attempt: Attempt,
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    # Lock the parent so concurrent attempts cannot overwrite review counters.
    item = session.scalar(
        select(Item)
        .where(
            Item.id == item_id,
            Item.user_id == user_id,
        )
        .with_for_update()
    )
    if not item: raise HTTPException(404,'Item not found')
    review=session.get(Review,item_id)
    if review is None:
        review=Review(item_id=item_id,streak=0,attempts=0,correct=0)
        session.add(review)
    review.attempts+=1
    review.correct+=int(attempt.correct)
    review.streak=review.streak+1 if attempt.correct else 0
    interval=timedelta(days=min(30,2**min(review.streak-1,5))) if attempt.correct else timedelta(minutes=10)
    review.due=datetime.now(timezone.utc)+interval
    session.commit(); session.refresh(review)
    return {'streak':review.streak,'attempts':review.attempts,'correct':review.correct,'due':review.due}

class AnalysisRequest(BaseModel):
    model_config = {
        "str_strip_whitespace": True,
        "extra": "forbid",
    }

    text: str = Field(min_length=1, max_length=2000)


@app.post(
    "/api/analyze",
    response_model=ContentAnalysis,
    dependencies=[Depends(authorize)],
)
async def analyze_input(data: AnalysisRequest):
    try:
        return await analyze_content(data.text)
    except AnalysisError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

@app.post(
    "/api/generate",
    response_model=GenerationResult,
    dependencies=[Depends(authorize)],
)
async def generate_learning_content(data: GenerationRequest):
    try:
        return await generate_content(data)
    except AnalysisError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post(
    "/api/grammar/generate",
    response_model=GrammarResult,
    dependencies=[Depends(authorize)],
)
async def generate_grammar_exercises(data: GenerationRequest):
    try:
        return await generate_grammar(data)
    except AnalysisError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc