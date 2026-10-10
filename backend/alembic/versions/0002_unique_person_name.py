"""unique person name"""

from alembic import op

revision = "0002_unique_person_name"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_persons_name", "persons", ["name"])


def downgrade():
    op.drop_constraint("uq_persons_name", "persons")
