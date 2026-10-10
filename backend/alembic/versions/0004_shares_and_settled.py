"""persons.common_share, settled_months"""

import sqlalchemy as sa
from alembic import op

revision = "0004_shares_and_settled"
down_revision = "0003_is_transfer"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "persons",
        sa.Column("common_share", sa.Numeric(6, 2), nullable=False, server_default="1"),
    )
    op.create_table(
        "settled_months",
        sa.Column("month", sa.String(7), primary_key=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("payload", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("settled_months")
    op.drop_column("persons", "common_share")
