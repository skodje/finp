CSV = (
    "date,description,amount\n2025-03-04,REMA 1000,100\n2025-03-04,Kiosk,50\n2025-03-04,Kiosk,50\n"
)


def _account(client):
    return client.post("/api/accounts", json={"name": "Amex", "type": "credit_card"}).json()


def _import(client, account_id, csv=CSV):
    preview = client.post(
        f"/api/imports/csv/preview?account_id={account_id}",
        files={"file": ("tx.csv", csv.encode(), "text/csv")},
    ).json()
    return client.post(
        "/api/imports/csv", json={"account_id": account_id, "rows": preview["rows"]}
    ).json()


def test_import_is_idempotent_but_keeps_identical_rows(client):
    acc = _account(client)
    assert _import(client, acc["id"]) == {"imported": 3, "skipped_duplicates": 0}
    assert _import(client, acc["id"]) == {"imported": 0, "skipped_duplicates": 3}
    # a new identical purchase beyond what's stored still imports
    more = CSV + "2025-03-04,Kiosk,50\n"
    assert _import(client, acc["id"], more) == {"imported": 1, "skipped_duplicates": 3}
    assert len(client.get("/api/transactions").json()) == 4


def test_reclassify_updates_and_validates(client):
    acc = _account(client)
    _import(client, acc["id"])
    tx = client.get("/api/transactions").json()[0]
    url = f"/api/transactions/{tx['id']}/classification"
    ok = client.patch(url, json={"ownership": "private"})
    assert ok.status_code == 200 and ok.json()["ownership"] == "private"
    assert client.patch(url, json={"ownership": "bogus"}).status_code == 422
    missing = "00000000-0000-0000-0000-000000000000"
    assert client.patch(url, json={"ownership": "common", "person_id": missing}).status_code == 404


def test_account_validation_and_person_idempotent(client):
    assert client.post("/api/accounts", json={"name": "x", "type": "nope"}).status_code == 422
    a = client.post("/api/persons", json={"name": " Ole "}).json()
    b = client.post("/api/persons", json={"name": "Ole"}).json()
    assert a["id"] == b["id"]
    assert (
        client.post(
            "/api/imports/csv/preview?account_id=" + a["id"],
            files={"file": ("a.csv", b"x", "text/csv")},
        ).status_code
        == 404
    )


def test_manual_transaction_create(client):
    acc = _account(client)
    r = client.post(
        "/api/transactions",
        json={
            "account_id": acc["id"],
            "posted_at": "2025-03-04",
            "description": "Kiosk",
            "amount": "-49.90",
        },
    )
    assert r.status_code == 201 and r.json()["account"] == "Amex"
    bad = {"account_id": acc["id"], "posted_at": "2025-03-04", "description": "", "amount": "1"}
    assert client.post("/api/transactions", json=bad).status_code == 422


def test_preview_flags_rows_already_stored(client):
    acc = _account(client)
    _import(client, acc["id"])
    overlap = CSV + "2025-03-05,Ny,10\n"
    preview = client.post(
        f"/api/imports/csv/preview?account_id={acc['id']}",
        files={"file": ("tx.csv", overlap.encode(), "text/csv")},
    ).json()
    assert (preview["valid_rows"], preview["duplicate_rows"]) == (1, 3)
    assert [r["duplicate"] for r in preview["rows"]] == [True, True, True, False]
