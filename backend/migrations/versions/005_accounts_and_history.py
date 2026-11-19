"""Real accounts, revocable sessions, preferences and idempotent review history."""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.create_table("login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])
    op.create_index("ix_login_sessions_expires_at", "login_sessions", ["expires_at"])
    op.create_table("account_preferences",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("generation_days", sa.JSON(), nullable=False),
        sa.Column("onboarded", sa.Boolean(), nullable=False),
        sa.Column("legacy_imported", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False))
    op.create_table("practice_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_id", sa.String(36), nullable=False),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=True),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.String(10), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.UniqueConstraint("user_id", "attempt_id", name="uq_practice_user_attempt"))
    op.create_index("ix_practice_events_user_id", "practice_events", ["user_id"])
    op.create_index("ix_practice_events_occurred_at", "practice_events", ["occurred_at"])
    op.create_table("auth_rate_limits",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("resets_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_rate_limits_resets_at", "auth_rate_limits", ["resets_at"])


def downgrade():
    op.drop_table("auth_rate_limits")
    op.drop_table("practice_events")
    op.drop_table("account_preferences")
    op.drop_table("login_sessions")
    op.drop_column("users", "password_hash")
