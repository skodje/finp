"""transactions.is_transfer"""

import sqlalchemy as sa
from alembic import op

revision = "0003_is_transfer"
down_revision = "0002_unique_person_name"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "transactions",
        sa.Column("is_transfer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("transactions", "is_transfer")
