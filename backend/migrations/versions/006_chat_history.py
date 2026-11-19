"""User-owned tutor and conversation history."""
from alembic import op
import sqlalchemy as sa
revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("chat_turns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("text", sa.String(4000), nullable=False),
        sa.Column("response", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_chat_turns_user_id", "chat_turns", ["user_id"])


def downgrade():
    op.drop_table("chat_turns")
