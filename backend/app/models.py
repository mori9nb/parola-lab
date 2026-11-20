from datetime import datetime, timezone
from sqlalchemy import JSON, UniqueConstraint, func, String, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


class User(Base):
    __tablename__ = "users"
    access_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
    __tablename__ = "items"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_id",
            name="uq_items_user_client",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    client_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    text: Mapped[str] = mapped_column(String(2000))
    meaning: Mapped[str] = mapped_column(String(2000))
    kind: Mapped[str] = mapped_column(String(16))

    level: Mapped[str | None] = mapped_column(
        String(2),
        nullable=True,
    )

    source_language: Mapped[str] = mapped_column(
        String(35),
        default="fa",
    )

    target_language: Mapped[str] = mapped_column(
        String(35),
        default="it",
    )

    example: Mapped[str] = mapped_column(
        String(3000),
        default="",
    )

    translation: Mapped[str] = mapped_column(
        String(3000),
        default="",
    )

    tag: Mapped[str] = mapped_column(
        String(100),
        default="",
    )

    note: Mapped[str] = mapped_column(
        String(3000),
        default="",
    )

    origin: Mapped[str] = mapped_column(
        String(16),
        default="user",
    )

    source_text: Mapped[str] = mapped_column(
        String(2000),
        default="",
    )

    analysis_status: Mapped[str] = mapped_column(
        String(20),
        default="completed",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
class Review(Base):
    __tablename__ = 'reviews'
    item_id: Mapped[str] = mapped_column(ForeignKey('items.id', ondelete='CASCADE'), primary_key=True)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
class GrammarEntry(Base):
    __tablename__ = "grammar_entries"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_id",
            name="uq_grammar_entries_user_client",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    client_id: Mapped[str] = mapped_column(
        String(128), nullable=False
    )

    text: Mapped[str] = mapped_column(String(1000))
    options: Mapped[list[str]] = mapped_column(JSON)
    answer: Mapped[str] = mapped_column(String(200))
    meaning: Mapped[str] = mapped_column(String(2000))
    explanation: Mapped[str] = mapped_column(String(3000))

    level: Mapped[str | None] = mapped_column(
        String(2), nullable=True
    )

    source_text: Mapped[str] = mapped_column(
        String(2000), default=""
    )

    origin: Mapped[str] = mapped_column(
        String(16), default="starter"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class GrammarReview(Base):
    __tablename__ = "grammar_reviews"

    entry_id: Mapped[str] = mapped_column(
        ForeignKey(
            "grammar_entries.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    streak: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)

    due: Mapped[datetime] = mapped_column(
        DateTime(timezone=True)
    )


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AccountPreferences(Base):
    __tablename__ = "account_preferences"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    generation_days: Mapped[dict] = mapped_column(JSON, default=dict)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    legacy_imported: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=0)

class PracticeEvent(Base):
    __tablename__ = "practice_events"
    __table_args__ = (UniqueConstraint("user_id", "attempt_id", name="uq_practice_user_attempt"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    attempt_id: Mapped[str] = mapped_column(String(36))
    client_id: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    day: Mapped[str] = mapped_column(String(10))
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

class AuthRateLimit(Base):
    __tablename__ = "auth_rate_limits"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    resets_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ChatTurn(Base):
    __tablename__ = "chat_turns"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(String(4000))
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
