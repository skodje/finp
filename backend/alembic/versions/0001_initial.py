"""initial schema"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    ownership = sa.Enum("COMMON", "PRIVATE", name="ownership")
    account_type = sa.Enum("BANK", "CREDIT_CARD", name="accounttype")
    ownership.create(op.get_bind(), checkfirst=True)
    account_type.create(op.get_bind(), checkfirst=True)
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "persons",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
    )
    op.create_table(
        "accounts",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("type", account_type, nullable=False),
        sa.Column("owner_id", uuid, sa.ForeignKey("persons.id")),
    )
    op.create_table(
        "merchants",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("normalized_name", sa.String(200), nullable=False),
    )
    op.create_index("ix_merchants_normalized_name", "merchants", ["normalized_name"])
    op.create_table(
        "categories",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
    )
    op.create_table(
        "transactions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("account_id", uuid, sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("merchant_id", uuid, sa.ForeignKey("merchants.id")),
        sa.Column("category_id", uuid, sa.ForeignKey("categories.id")),
        sa.Column("posted_at", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="NOK"),
        sa.Column("classification_confidence", sa.Numeric(5, 4)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "allocations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("transaction_id", uuid, sa.ForeignKey("transactions.id"), nullable=False),
        sa.Column("person_id", uuid, sa.ForeignKey("persons.id")),
        sa.Column("ownership", ownership, nullable=False),
        sa.Column("percentage", sa.Numeric(5, 2), nullable=False),
    )
    op.create_table(
        "rules",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("merchant_pattern", sa.String(200), nullable=False),
        sa.Column("category_id", uuid, sa.ForeignKey("categories.id")),
        sa.Column("ownership", ownership, nullable=False),
        sa.Column("person_id", uuid, sa.ForeignKey("persons.id")),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=False),
    )


def downgrade():
    for table in (
        "rules",
        "allocations",
        "transactions",
        "categories",
        "merchants",
        "accounts",
        "persons",
    ):
        op.drop_table(table)
    sa.Enum(name="accounttype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="ownership").drop(op.get_bind(), checkfirst=True)
