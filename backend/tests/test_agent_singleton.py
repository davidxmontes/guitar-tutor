from concurrent.futures import ThreadPoolExecutor
import importlib
from threading import Event
from types import SimpleNamespace

from app.config import Settings


def test_concurrent_first_chats_share_checkpoint_memory(monkeypatch):
    agent = importlib.import_module("app.agent.agent")
    monkeypatch.setattr(agent, "_agent_instance", None)
    monkeypatch.setattr("app.config.get_settings", lambda: Settings(_env_file=None))
    entered, duplicate, release = Event(), Event(), Event()

    def initialize(**kwargs):
        if entered.is_set():
            duplicate.set()
        entered.set()
        assert release.wait(5)
        return SimpleNamespace(checkpoints={})

    monkeypatch.setattr(agent, "GuitarTutorAgent", initialize)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(agent.get_agent)
        try:
            assert entered.wait(2)
            second = pool.submit(agent.get_agent)
            duplicate.wait(.5)
        finally:
            release.set()
        first_agent, second_agent = first.result(), second.result()

    first_agent.checkpoints["owner:thread-1"] = {"answer": "Keep this conversation"}
    assert first_agent is second_agent is agent.get_agent()
    assert second_agent.checkpoints["owner:thread-1"] == {"answer": "Keep this conversation"}
