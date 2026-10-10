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


def test_edit_transaction_account_person(client):
    pid = client.post("/api/persons", json={"name": "Lars"}).json()["id"]
    other = client.post("/api/persons", json={"name": "Kari"}).json()["id"]
    assert client.patch(f"/api/persons/{pid}", json={"name": "Kari"}).status_code == 400
    assert client.patch(f"/api/persons/{pid}", json={"name": "Lasse"}).json()["name"] == "Lasse"
    acc = client.post("/api/accounts", json={"name": "A", "type": "bank"}).json()
    r = client.patch(
        f"/api/accounts/{acc['id']}", json={"name": "B", "type": "credit_card", "owner_id": other}
    ).json()
    assert (r["name"], r["owner"]) == ("B", "Kari")
    tx = client.post(
        "/api/transactions",
        json={
            "account_id": acc["id"],
            "posted_at": "2026-01-02",
            "description": "x",
            "amount": "5",
        },
    ).json()
    r = client.patch(
        f"/api/transactions/{tx['id']}",
        json={
            "posted_at": "2026-01-03",
            "description": "y",
            "amount": "7.50",
            "category": "Mat",
            "ownership": "private",
            "person_id": pid,
        },
    ).json()
    assert (r["description"], r["amount"], r["category"], r["ownership"]) == (
        "y",
        "7.50",
        "Mat",
        "private",
    )


def test_settlement_and_transfers(client):
    ids = {n: client.post("/api/persons", json={"name": n}).json()["id"] for n in ("Ann", "Bob")}
    acc = {
        n: client.post(
            "/api/accounts", json={"name": n, "type": "bank", "owner_id": ids[n]}
        ).json()["id"]
        for n in ids
    }

    def add(n, desc, amount, ownership=None, person=None):
        tx = client.post(
            "/api/transactions",
            json={
                "account_id": acc[n],
                "posted_at": "2026-02-10",
                "description": desc,
                "amount": amount,
            },
        ).json()
        if ownership:
            client.patch(
                f"/api/transactions/{tx['id']}/classification",
                json={"ownership": ownership, "person_id": person},
            )
        return tx

    add("Ann", "Strøm", "1000", "common")  # Bob owes Ann 500
    add("Bob", "Mat", "200", "common")  # Ann owes Bob 100
    add("Bob", "Gave til Ann", "300", "private", ids["Ann"])  # Ann owes Bob 300
    add("Ann", "Innbetaling", "5000", "common")  # auto-flagged transfer, ignored
    add("Ann", "Ukjent", "99")  # unclassified
    r = client.get("/api/settlement?month=2026-02").json()
    assert r["payments"] == [{"from": "Bob", "to": "Ann", "amount": "100.00"}]
    assert r["unclassified"] == 1


def test_custom_split_and_mark_settled(client):
    ann = client.post("/api/persons", json={"name": "Ann", "common_share": "60"}).json()
    bob = client.post("/api/persons", json={"name": "Bob", "common_share": "40"}).json()
    acc = client.post(
        "/api/accounts", json={"name": "A", "type": "bank", "owner_id": ann["id"]}
    ).json()
    tx = client.post(
        "/api/transactions",
        json={
            "account_id": acc["id"],
            "posted_at": "2026-03-05",
            "description": "Strøm",
            "amount": "1000",
        },
    ).json()
    client.patch(f"/api/transactions/{tx['id']}/classification", json={"ownership": "common"})
    url = "/api/settlement?month=2026-03"
    assert client.get(url).json()["payments"] == [{"from": "Bob", "to": "Ann", "amount": "400.00"}]
    assert client.post(url).json()["settled_at"]
    assert client.post(url).status_code == 400
    # frozen: later edits to the split don't change a settled month
    client.patch(f"/api/persons/{bob['id']}", json={"name": "Bob", "common_share": "10"})
    assert client.get(url).json()["payments"][0]["amount"] == "400.00"
    assert [h["month"] for h in client.get("/api/settlements").json()] == ["2026-03"]
    assert client.delete(url).status_code == 204
    assert client.get("/api/settlements").json() == []


def test_per_transaction_split(client):
    ann = client.post("/api/persons", json={"name": "Ann"}).json()
    bob = client.post("/api/persons", json={"name": "Bob"}).json()
    acc = client.post(
        "/api/accounts", json={"name": "A", "type": "bank", "owner_id": ann["id"]}
    ).json()
    tx = client.post(
        "/api/transactions",
        json={
            "account_id": acc["id"],
            "posted_at": "2026-04-05",
            "description": "Strøm",
            "amount": "1000",
        },
    ).json()

    def edit(splits):
        return client.patch(
            f"/api/transactions/{tx['id']}",
            json={
                "posted_at": "2026-04-05",
                "description": "Strøm",
                "amount": "1000",
                "splits": splits,
            },
        )

    def part(p, pct):
        return {"ownership": "private", "person_id": p["id"], "percentage": pct}

    assert edit([part(ann, "70"), part(bob, "20")]).status_code == 400  # not 100
    r = edit([part(ann, "70"), part(bob, "30")]).json()
    assert r["ownership"] == "split" and len(r["splits"]) == 2
    pay = client.get("/api/settlement?month=2026-04").json()["payments"]
    assert pay == [{"from": "Bob", "to": "Ann", "amount": "300.00"}]
