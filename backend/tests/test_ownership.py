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