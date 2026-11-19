"""Authenticated, user-scoped Parola API."""
from datetime import datetime, timezone, timedelta
from typing import Literal
from uuid import uuid4, UUID
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.grammar_storage_schemas import GrammarImportIn
from app.notebook_schemas import NotebookImportIn
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

from app.config import settings
from app.database import Base, engine, SessionLocal, db
from app.models import User, Item, Review, GrammarEntry, GrammarReview, DEV_USER_ID
from app.auth import authorize, get_current_user_id, router as auth_router, enforce_request_origin
from app.accounts import router as account_router, record_review

class ItemIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    meaning: str = Field(min_length=1, max_length=2000)

    kind: Literal["word", "phrase", "sentence"] = "word"
    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"] = "A2"

    source_language: str = Field(
        default="fa", min_length=2, max_length=35
    )
    target_language: str = Field(
        default="it", min_length=2, max_length=35
    )

    example: str = Field(default="", max_length=3000)
    translation: str = Field(default="", max_length=3000)
    tag: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=3000)

    origin: Literal["user", "ai", "starter"] = "user"
    source_text: str = Field(default="", max_length=2000)


class ItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    client_id: str | None

    text: str
    meaning: str
    kind: Literal["word", "phrase", "sentence", "pending"]
    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"] | None

    source_language: str
    target_language: str
    example: str
    translation: str
    tag: str
    note: str
    origin: str
    source_text: str
    analysis_status: str
    created_at: datetime
class Attempt(BaseModel):
    correct: bool
    attempt_id: UUID | None = None

app = FastAPI(title="Parola Lab API", version="0.2.0")
app.middleware("http")(enforce_request_origin)
app.include_router(auth_router)
app.include_router(account_router)
from app.chat import router as chat_router
app.include_router(chat_router)
@app.post(
    "/api/notebook/import",
    dependencies=[Depends(authorize)],
)
def import_notebook(
    data: NotebookImportIn,
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    created = 0
    existing = 0
    reviews_created = 0
    mappings = []

    try:
        # درخواست‌های انتقال یک کاربر هم‌زمان اجرا نشوند.
        user = session.scalar(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise HTTPException(404, "User not found")

        for incoming in sorted(
            data.items,
            key=lambda value: value.client_id,
        ):
            item = session.scalar(
                select(Item)
                .where(
                    Item.user_id == user_id,
                    Item.client_id == incoming.client_id,
                )
                .with_for_update()
            )

            if item is None:
                fields = incoming.model_dump(
                    exclude={"review", "created_at"}
                )

                if incoming.created_at is not None:
                    fields["created_at"] = incoming.created_at

                item = Item(
                    id=str(uuid4()),
                    user_id=user_id,
                    **fields,
                )

                session.add(item)
                session.flush()
                created += 1
            else:
                existing += 1

            if incoming.review is not None:
                review = session.get(Review, item.id)

                # انتقال اولیه است؛ مرور موجود بازنویسی نمی‌شود.
                if review is None:
                    session.add(
                        Review(
                            item_id=item.id,
                            **incoming.review.model_dump(),
                        )
                    )
                    reviews_created += 1

            mappings.append(
                {
                    "client_id": incoming.client_id,
                    "id": item.id,
                }
            )

        session.commit()

    except Exception:
        session.rollback()
        raise

    return {
        "created": created,
        "existing": existing,
        "reviews_created": reviews_created,
        "mappings": mappings,
    }
@app.get(
    "/api/notebook",
    dependencies=[Depends(authorize)],
)
def get_notebook(
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    rows = session.execute(
        select(Item, Review)
        .outerjoin(Review, Review.item_id == Item.id)
        .where(Item.user_id == user_id)
        .order_by(Item.id)
    ).all()

    fields = (
        "id",
        "client_id",
        "text",
        "meaning",
        "kind",
        "level",
        "source_language",
        "target_language",
        "example",
        "translation",
        "tag",
        "note",
        "origin",
        "source_text",
        "analysis_status",
        "created_at",
    )

    items = []

    for item, review in rows:
        record = {
            field: getattr(item, field)
            for field in fields
        }

        record["review"] = (
            {
                "streak": review.streak,
                "attempts": review.attempts,
                "correct": review.correct,
                "due": review.due,
            }
            if review is not None
            else None
        )

        items.append(record)

    return {
        "version": 1,
        "items": items,
    }
@app.get('/health')
def health(): return {'status':'ok','version':'0.2.0'}
@app.get('/api/capabilities', dependencies=[Depends(authorize)])
def capabilities(): return {'storage':'postgresql','ai':True,'speech':True,'chat':True,'push':False,'mode':'session-authenticated'}
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
    return record_review(session, user_id, "notebook", item_id, attempt.correct, attempt.attempt_id)

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

@app.post(
    "/api/grammar/import",
    dependencies=[Depends(authorize)],
)
def import_grammar_bank(
    data: GrammarImportIn,
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    created = 0
    existing = 0
    reviews_created = 0
    mappings = []

    try:
        user = session.scalar(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
        )

        if user is None:
            raise HTTPException(404, "User not found")

        for incoming in sorted(
            data.items,
            key=lambda item: item.client_id,
        ):
            entry = session.scalar(
                select(GrammarEntry)
                .where(
                    GrammarEntry.user_id == user_id,
                    GrammarEntry.client_id == incoming.client_id,
                )
                .with_for_update()
            )

            if entry is None:
                fields = incoming.model_dump(
                    exclude={"created_at", "review"}
                )

                if incoming.created_at is not None:
                    fields["created_at"] = incoming.created_at

                entry = GrammarEntry(
                    id=str(uuid4()),
                    user_id=user_id,
                    **fields,
                )

                session.add(entry)
                session.flush()
                created += 1
            else:
                existing += 1

            if incoming.review is not None:
                review = session.get(GrammarReview, entry.id)

                # انتقال دوباره، پیشرفت سرور را بازنویسی نمی‌کند.
                if review is None:
                    session.add(
                        GrammarReview(
                            entry_id=entry.id,
                            **incoming.review.model_dump(),
                        )
                    )
                    reviews_created += 1

            mappings.append(
                {
                    "client_id": incoming.client_id,
                    "id": entry.id,
                }
            )

        session.commit()

    except Exception:
        session.rollback()
        raise

    return {
        "created": created,
        "existing": existing,
        "reviews_created": reviews_created,
        "mappings": mappings,
    }


@app.get(
    "/api/grammar/bank",
    dependencies=[Depends(authorize)],
)
def get_grammar_bank(
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    rows = session.execute(
        select(GrammarEntry, GrammarReview)
        .outerjoin(
            GrammarReview,
            GrammarReview.entry_id == GrammarEntry.id,
        )
        .where(GrammarEntry.user_id == user_id)
        .order_by(GrammarEntry.id)
    ).all()

    fields = (
        "id",
        "client_id",
        "text",
        "options",
        "answer",
        "meaning",
        "explanation",
        "level",
        "source_text",
        "origin",
        "created_at",
    )

    items = []

    for entry, review in rows:
        item = {
            field: getattr(entry, field)
            for field in fields
        }

        item["review"] = (
            {
                "streak": review.streak,
                "attempts": review.attempts,
                "correct": review.correct,
                "due": review.due,
            }
            if review is not None
            else None
        )

        items.append(item)

    return {"version": 1, "items": items}


@app.post(
    "/api/grammar/entries/{entry_id}/review",
    dependencies=[Depends(authorize)],
)
def review_grammar_entry(
    entry_id: str,
    attempt: Attempt,
    session: Session = Depends(db),
    user_id: str = Depends(get_current_user_id),
):
    return record_review(session, user_id, "grammar", entry_id, attempt.correct, attempt.attempt_id)
