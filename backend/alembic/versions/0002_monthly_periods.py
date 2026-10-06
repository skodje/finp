"""monthly periods"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_monthly_periods"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "monthly_periods",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("settled_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("year", "month", name="uq_monthly_periods_year_month"),
    )
    op.add_column("transactions", sa.Column("period_id", uuid, nullable=True))
    op.create_foreign_key(
        "fk_transactions_period", "transactions", "monthly_periods", ["period_id"], ["id"]
    )
    op.create_index("ix_transactions_period_id", "transactions", ["period_id"])


def downgrade():
    op.drop_index("ix_transactions_period_id", table_name="transactions")
    op.drop_constraint("fk_transactions_period", "transactions", type_="foreignkey")
    op.drop_column("transactions", "period_id")
    op.drop_table("monthly_periods")
