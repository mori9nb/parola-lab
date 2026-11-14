"""Initial notebook and review schema."""
from alembic import op
import sqlalchemy as sa
revision='001'
down_revision=None
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('items',sa.Column('id',sa.String(36),primary_key=True),sa.Column('text',sa.String(2000),nullable=False),sa.Column('meaning',sa.String(2000),nullable=False),sa.Column('kind',sa.String(16),nullable=False),sa.Column('level',sa.String(2),nullable=False),sa.Column('source_language',sa.String(35),nullable=False),sa.Column('target_language',sa.String(35),nullable=False),sa.Column('example',sa.String(3000),nullable=False),sa.Column('translation',sa.String(3000),nullable=False),sa.Column('tag',sa.String(100),nullable=False))
    op.create_table('reviews',sa.Column('item_id',sa.String(36),sa.ForeignKey('items.id',ondelete='CASCADE'),primary_key=True),sa.Column('streak',sa.Integer(),nullable=False),sa.Column('attempts',sa.Integer(),nullable=False),sa.Column('correct',sa.Integer(),nullable=False),sa.Column('due',sa.DateTime(timezone=True),nullable=False))
def downgrade():
    op.drop_table('reviews'); op.drop_table('items')
