"""
Add measured_weight column to inspections and create audit_logs table
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_audit_logs'
down_revision = '001_add_image_path'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('inspections', sa.Column('measured_weight', sa.Float(), nullable=True))
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('entity', sa.String(), nullable=False),
        sa.Column('entity_id', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('audit_logs')
    op.drop_column('inspections', 'measured_weight')
