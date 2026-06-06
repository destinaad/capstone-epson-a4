"""add image_path to detection_results

Revision ID: 001_add_image_path
Revises: 
Create Date: 2026-05-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '001_add_image_path'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # add image_path column if not exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('detection_results')] if 'detection_results' in inspector.get_table_names() else []
    if 'image_path' not in cols:
        op.add_column('detection_results', sa.Column('image_path', sa.String(), nullable=True))


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'detection_results' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('detection_results')]
        if 'image_path' in cols:
            op.drop_column('detection_results', 'image_path')
