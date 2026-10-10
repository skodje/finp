from app.domain.classification import classify


def test_rema_is_common_food():
    result = classify("REMA 1000 Skui")
    assert result is not None
    assert result.ownership == "common"
    assert result.category == "Mat"
