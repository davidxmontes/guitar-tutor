import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.v2.router import router
from app.v2.store import InMemoryV2Store, get_v2_store


@pytest.fixture
def store():
    return InMemoryV2Store()


@pytest.fixture
def client(store):
    app = FastAPI()
    app.include_router(router, prefix="/api/v2")
    app.dependency_overrides[get_current_user] = lambda: "user_1"
    app.dependency_overrides[get_v2_store] = lambda: store
    return TestClient(app)


@pytest.fixture
def session_and_branch(client):
    session = client.post("/api/v2/sessions").json()
    return session["id"], session["branches"][0]["id"]


