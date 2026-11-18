import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import (
    app,
    Base,
    User,
    Item,
    DEV_USER_ID,
    db,
    get_current_user_id,
    settings,
)


USER_A = DEV_USER_ID
USER_B = "00000000-0000-0000-0000-000000000002"
ITEM_B = "00000000-0000-0000-0000-000000000003"

HEADERS = {
    "Authorization": "Bearer ownership-test-token",
}


@pytest.fixture
def ownership_api(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # SQLite به‌صورت پیش‌فرض کلید خارجی را بررسی نمی‌کند.
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)

    with sessions() as session:
        session.add_all(
            [
                User(id=USER_A, display_name="User A"),
                User(id=USER_B, display_name="User B"),
            ]
        )
        session.commit()

        session.add(
            Item(
                id=ITEM_B,
                user_id=USER_B,
                text="Ciao",
                meaning="سلام",
                kind="word",
                level="A1",
            )
        )
        session.commit()

    def override_db():
        with sessions() as session:
            yield session

    previous_overrides = app.dependency_overrides.copy()

    monkeypatch.setattr(
        settings,
        "api_token",
        "ownership-test-token",
    )

    app.dependency_overrides[db] = override_db

    # هویت کاربر را برای تست شبیه‌سازی می‌کنیم.
    app.dependency_overrides[get_current_user_id] = (
        lambda: USER_A
    )

    try:
        with TestClient(app) as client:
            yield client, sessions
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)
        engine.dispose()


def test_create_uses_current_user(ownership_api):
    client, sessions = ownership_api

    response = client.post(
        "/api/items",
        headers=HEADERS,
        json={
            "text": "Grazie",
            "meaning": "ممنون",
            # ارسال مالک دلخواه نباید مالک واقعی را تغییر دهد.
            "user_id": USER_B,
        },
    )

    assert response.status_code == 201

    item_id = response.json()["id"]

    with sessions() as session:
        item = session.get(Item, item_id)

        assert item.user_id == USER_A


def test_list_hides_other_users_items(ownership_api):
    client, _sessions = ownership_api

    response = client.get(
        "/api/items",
        headers=HEADERS,
    )

    assert response.status_code == 200
    assert response.json() == []

    # همان داده برای صاحبش قابل مشاهده است.
    app.dependency_overrides[get_current_user_id] = (
        lambda: USER_B
    )

    response = client.get(
        "/api/items",
        headers=HEADERS,
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [ITEM_B]


@pytest.mark.parametrize("operation", ["delete", "review"])
def test_other_user_cannot_modify_item(
    ownership_api,
    operation,
):
    client, sessions = ownership_api

    if operation == "delete":
        response = client.delete(
            f"/api/items/{ITEM_B}",
            headers=HEADERS,
        )
    else:
        response = client.post(
            f"/api/items/{ITEM_B}/review",
            headers=HEADERS,
            json={"correct": True},
        )

    assert response.status_code == 404

    with sessions() as session:
        assert session.get(Item, ITEM_B) is not None


def test_owner_can_review_item(ownership_api):
    client, _sessions = ownership_api

    app.dependency_overrides[get_current_user_id] = (
        lambda: USER_B
    )

    response = client.post(
        f"/api/items/{ITEM_B}/review",
        headers=HEADERS,
        json={"correct": True},
    )

    assert response.status_code == 200
    assert response.json()["attempts"] == 1
    assert response.json()["correct"] == 1

from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import select

from app.main import Review


def notebook_payload():
    return {
        "version": 1,
        "items": [
            {
                "client_id": "browser-1",
                "text": "Avere bisogno di",
                "meaning": "نیاز داشتن به",
                "kind": "phrase",
                "level": "A2",
                "note": "یادداشت شخصی",
                "origin": "ai",
                "source_text": "bisogno",
                "analysis_status": "completed",
                "created_at": "2026-11-01T10:00:00Z",
                "review": {
                    "streak": 2,
                    "attempts": 5,
                    "correct": 4,
                    "due": "2026-11-20T10:00:00Z",
                },
            }
        ],
    }


def test_notebook_import_preserves_metadata_and_review(ownership_api):
    client, sessions = ownership_api

    response = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=notebook_payload(),
    )

    assert response.status_code == 200
    result = response.json()
    assert result["created"] == 1
    assert result["reviews_created"] == 1

    item_id = result["mappings"][0]["id"]

    with sessions() as session:
        item = session.get(Item, item_id)
        review = session.get(Review, item_id)

        assert item.user_id == USER_A
        assert item.client_id == "browser-1"
        assert item.note == "یادداشت شخصی"
        assert item.origin == "ai"
        assert item.source_text == "bisogno"
        assert item.analysis_status == "completed"
        assert item.created_at.isoformat().startswith(
            "2026-11-01T10:00:00"
        )

        assert review.attempts == 5
        assert review.correct == 4
        assert review.streak == 2
        assert review.due.isoformat().startswith(
            "2026-11-20T10:00:00"
        )


def test_notebook_import_is_repeatable(ownership_api):
    client, sessions = ownership_api
    payload = notebook_payload()

    first = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )
    second = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )

    assert first.status_code == second.status_code == 200
    assert second.json()["created"] == 0
    assert second.json()["existing"] == 1
    assert second.json()["reviews_created"] == 0
    assert first.json()["mappings"] == second.json()["mappings"]

    with sessions() as session:
        items = session.scalars(
            select(Item).where(Item.user_id == USER_A)
        ).all()

        assert len(items) == 1
        assert session.get(Review, items[0].id).attempts == 5


def test_notebook_import_keeps_existing_server_state(ownership_api):
    client, sessions = ownership_api
    payload = notebook_payload()

    first = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )
    assert first.status_code == 200
    item_id = first.json()["mappings"][0]["id"]

    with sessions() as session:
        item = session.get(Item, item_id)
        item.note = "Updated on server"

        review = session.get(Review, item_id)
        review.attempts = 8
        review.correct = 6
        review.streak = 0
        review.due = datetime(
            2026, 11, 21, 12, tzinfo=timezone.utc
        )
        session.commit()

    repeated = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )
    assert repeated.status_code == 200

    with sessions() as session:
        assert session.get(Item, item_id).note == "Updated on server"

        review = session.get(Review, item_id)
        assert review.attempts == 8
        assert review.correct == 6
        assert review.streak == 0
        assert review.due.isoformat().startswith(
            "2026-11-21T12:00:00"
        )


def test_notebook_client_ids_are_scoped_to_user(ownership_api):
    client, sessions = ownership_api
    payload = notebook_payload()

    first = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )

    app.dependency_overrides[get_current_user_id] = lambda: USER_B

    second = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )

    assert first.status_code == second.status_code == 200
    first_id = first.json()["mappings"][0]["id"]
    second_id = second.json()["mappings"][0]["id"]
    assert first_id != second_id

    with sessions() as session:
        assert session.get(Item, first_id).user_id == USER_A
        assert session.get(Item, second_id).user_id == USER_B


def test_notebook_import_accepts_pending_item(ownership_api):
    client, sessions = ownership_api

    response = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json={
            "version": 1,
            "items": [
                {
                    "client_id": "old-pending",
                    "text": "Comunque",
                    "kind": "pending",
                    "level": None,
                    "analysis_status": "pending",
                }
            ],
        },
    )

    assert response.status_code == 200
    item_id = response.json()["mappings"][0]["id"]

    with sessions() as session:
        item = session.get(Item, item_id)
        assert item.level is None
        assert item.meaning == ""
        assert item.kind == "pending"
        assert session.get(Review, item_id) is None


@pytest.mark.parametrize(
    "invalid_case",
    ["duplicate_id", "invalid_review", "missing_meaning"],
)
def test_invalid_notebook_batch_writes_nothing(
    ownership_api,
    invalid_case,
):
    client, sessions = ownership_api
    payload = notebook_payload()

    second = deepcopy(payload["items"][0])
    second["client_id"] = "browser-2"

    if invalid_case == "duplicate_id":
        second["client_id"] = "browser-1"
    elif invalid_case == "invalid_review":
        second["review"]["correct"] = 6
    else:
        second["meaning"] = ""

    payload["items"].append(second)

    response = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=payload,
    )

    assert response.status_code == 422

    with sessions() as session:
        assert session.scalars(
            select(Item).where(Item.user_id == USER_A)
        ).all() == []


def test_notebook_import_requires_authorization(ownership_api):
    client, sessions = ownership_api

    response = client.post(
        "/api/notebook/import",
        json=notebook_payload(),
    )

    assert response.status_code in (401, 403)

    with sessions() as session:
        assert session.scalars(
            select(Item).where(Item.user_id == USER_A)
        ).all() == []    

def test_notebook_read_preserves_data_and_isolates_users(
    ownership_api,
):
    client, _sessions = ownership_api

    imported = client.post(
        "/api/notebook/import",
        headers=HEADERS,
        json=notebook_payload(),
    )
    assert imported.status_code == 200

    response = client.get(
        "/api/notebook",
        headers=HEADERS,
    )
    assert response.status_code == 200

    items = response.json()["items"]
    assert len(items) == 1

    item = items[0]
    assert item["id"] == imported.json()["mappings"][0]["id"]
    assert item["client_id"] == "browser-1"
    assert item["note"] == "یادداشت شخصی"
    assert item["origin"] == "ai"
    assert item["source_text"] == "bisogno"
    assert item["review"]["attempts"] == 5
    assert item["review"]["correct"] == 4
    assert item["review"]["streak"] == 2

    app.dependency_overrides[get_current_user_id] = lambda: USER_B

    response = client.get(
        "/api/notebook",
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert [entry["id"] for entry in response.json()["items"]] == [
        ITEM_B
    ]
    assert response.json()["items"][0]["review"] is None