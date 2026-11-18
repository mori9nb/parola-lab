"""Preserve notebook metadata and browser identifiers."""

from alembic import op
import sqlalchemy as sa


revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "items",
        sa.Column(
            "client_id",
            sa.String(128),
            nullable=True,
        ),
    )

    # برای رکوردهای موجود، مقادیر اولیه قرار می‌دهیم.
    columns = [
        ("note", 3000, ""),
        ("origin", 16, "user"),
        ("source_text", 2000, ""),
        ("analysis_status", 20, "completed"),
    ]

    for name, length, default in columns:
        op.add_column(
            "items",
            sa.Column(
                name,
                sa.String(length),
                nullable=False,
                server_default=sa.text(f"'{default}'"),
            ),
        )

        # از این به بعد مقدار پیش‌فرض را مدل برنامه تعیین می‌کند.
        op.alter_column(
            "items",
            name,
            server_default=None,
        )

    op.add_column(
        "items",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.alter_column(
        "items",
        "level",
        existing_type=sa.String(2),
        nullable=True,
    )

    op.create_unique_constraint(
        "uq_items_user_client",
        "items",
        ["user_id", "client_id"],
    )


def downgrade():
    connection = op.get_bind()

    pending_count = connection.execute(
        sa.text(
            "SELECT COUNT(*) FROM items WHERE level IS NULL"
        )
    ).scalar_one()

    if pending_count:
        raise RuntimeError(
            "Cannot downgrade while items have an unknown level."
        )

    op.drop_constraint(
        "uq_items_user_client",
        "items",
        type_="unique",
    )

    op.alter_column(
        "items",
        "level",
        existing_type=sa.String(2),
        nullable=False,
    )

    for name in [
        "created_at",
        "analysis_status",
        "source_text",
        "origin",
        "note",
        "client_id",
    ]:
        op.drop_column("items", name)