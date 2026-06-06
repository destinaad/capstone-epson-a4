"""
Remove actual_weight and measured_weight from inspections
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_remove_weights'
down_revision = '002_audit_logs'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'inspections' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('inspections')]
        if 'measured_weight' in cols:
            op.drop_column('inspections', 'measured_weight')
        if 'actual_weight' in cols:
            op.drop_column('inspections', 'actual_weight')


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'inspections' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('inspections')]
        if 'actual_weight' not in cols:
            op.add_column('inspections', sa.Column('actual_weight', sa.Float(), nullable=True))
        if 'measured_weight' not in cols:
            op.add_column('inspections', sa.Column('measured_weight', sa.Float(), nullable=True))
