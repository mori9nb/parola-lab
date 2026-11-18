"""Add users and ownership of notebook items."""

from alembic import op
import sqlalchemy as sa


revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade():
    op.create_table(
        "users",
        sa.Column(
            "id",
            sa.String(36),
            primary_key=True,
        ),
        sa.Column(
            "display_name",
            sa.String(100),
            nullable=False,
        ),
        sa.Column(
            "email",
            sa.String(254),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    users = sa.table(
        "users",
        sa.column("id", sa.String(36)),
        sa.column("display_name", sa.String(100)),
    )

    op.bulk_insert(
        users,
        [
            {
                "id": DEV_USER_ID,
                "display_name": "Development user",
            }
        ],
    )

    op.add_column(
        "items",
        sa.Column(
            "user_id",
            sa.String(36),
            nullable=True,
        ),
    )

    # اگر از قبل آیتمی وجود داشته باشد، حفظ می‌شود.
    items = sa.table(
        "items",
        sa.column("user_id", sa.String(36)),
    )

    op.execute(
        items.update()
        .where(items.c.user_id.is_(None))
        .values(user_id=DEV_USER_ID)
    )

    op.alter_column(
        "items",
        "user_id",
        nullable=False,
    )

    op.create_foreign_key(
        "fk_items_user_id",
        "items",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_index(
        "ix_items_user_id",
        "items",
        ["user_id"],
    )


def downgrade():
    op.drop_index("ix_items_user_id", table_name="items")

    op.drop_constraint(
        "fk_items_user_id",
        "items",
        type_="foreignkey",
    )

    op.drop_column("items", "user_id")
    op.drop_table("users")