"""remember the source sign convention for each account"""

import sqlalchemy as sa

from alembic import op

revision = "0005_account_expense_sign"
down_revision = "0004_shares_and_settled"
branch_labels = None
depends_on = None


def upgrade():
    expense_sign = sa.Enum("negative", "positive", name="expensesign")
    expense_sign.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "accounts",
        sa.Column(
            "expense_sign",
            expense_sign,
            nullable=False,
            server_default="negative",
        ),
    )


def downgrade():
    op.drop_column("accounts", "expense_sign")
    sa.Enum("negative", "positive", name="expensesign").drop(op.get_bind(), checkfirst=True)
