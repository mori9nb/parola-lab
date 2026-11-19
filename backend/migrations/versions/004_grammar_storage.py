"""Add user-owned grammar questions and reviews."""

from alembic import op
import sqlalchemy as sa


revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "grammar_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("text", sa.String(1000), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("answer", sa.String(200), nullable=False),
        sa.Column("meaning", sa.String(2000), nullable=False),
        sa.Column(
            "explanation", sa.String(3000), nullable=False
        ),
        sa.Column("level", sa.String(2), nullable=True),
        sa.Column(
            "source_text", sa.String(2000), nullable=False
        ),
        sa.Column("origin", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "user_id",
            "client_id",
            name="uq_grammar_entries_user_client",
        ),
    )

    op.create_index(
        "ix_grammar_entries_user_id",
        "grammar_entries",
        ["user_id"],
    )

    op.create_table(
        "grammar_reviews",
        sa.Column(
            "entry_id",
            sa.String(36),
            sa.ForeignKey(
                "grammar_entries.id",
                ondelete="CASCADE",
            ),
            primary_key=True,
        ),
        sa.Column("streak", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("correct", sa.Integer(), nullable=False),
        sa.Column(
            "due",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )


def downgrade():
    op.drop_table("grammar_reviews")

    op.drop_index(
        "ix_grammar_entries_user_id",
        table_name="grammar_entries",
    )

    op.drop_table("grammar_entries")