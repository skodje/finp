import pytest

from app.domain.classification import classify


@pytest.mark.parametrize(
    "description, category",
    [
        ("REMA 1000 Skui", "Mat"),
        ("NETFLIX.COM", "Streaming"),
        ("HBOMAX", "Streaming"),
        ("HBO Max", "Streaming"),
        ("AMAZON PRIME", "Streaming"),
        ("PRIME VIDEO", "Streaming"),
        ("MEDLEMSAVGIFT", "Annet"),
    ],
)
def test_common_classification(description, category):
    result = classify(description)
    assert result is not None
    assert result.ownership == "common"
    assert result.category == category
