import os
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("API_TOKEN", "test-only-token")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app, Base, db, User, DEV_USER_ID

HEADERS = {"X-Parola-Request": "1"}

@pytest.fixture
def api_env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)
    with sessions() as session:
        session.add(User(id=DEV_USER_ID, display_name="Development owner"))
        session.commit()
    previous = app.dependency_overrides.copy()
    def override_db():
        with sessions() as session:
            yield session
    app.dependency_overrides[db] = override_db
    try:
        with TestClient(app) as client:
            yield client, sessions
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()

@pytest.fixture
def signed_api(api_env):
    client, sessions = api_env
    response = client.post("/api/auth/register", headers=HEADERS, json={"email": "learner@example.com", "display_name": "Learner", "password": "long-test-password"})
    assert response.status_code == 201, response.text
    return client, sessions
