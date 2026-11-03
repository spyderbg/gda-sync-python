"""The browser game's game server: the random numbers it deals the rounds, its RNG Queue and the game's events."""

import pytest

from egt_gda_sync.game.rng_server import GameServer
from tests.conftest import session_headers

MAIN, TETRA = 1, 10
STOP_REELS = 8


def sequence(round_type: int, *values: int, name: str = "") -> dict:
    return {"roundType": round_type, "name": name, "sequence": [{"op": STOP_REELS, "range": 80, "value": value} for value in values]}


@pytest.fixture
def client(api):
    api.headers.update(session_headers(api))
    return api


def test_a_queued_sequence_is_dealt_to_the_first_round_of_its_type(client):
    queue = client.post("/api/game/rng/queue", json={"sequences": [sequence(MAIN, 1, 2, 3, name="Win"), sequence(TETRA, 4)]}).json()
    assert [(entry["roundType"], entry["name"]) for entry in queue["queue"]] == [(MAIN, "Win"), (TETRA, "")]

    # a round of another type than the first sequence's plays random numbers, and leaves the queue as it is
    other = client.post("/api/game/rng/round", json={"roundType": TETRA}).json()
    assert other["sequence"] is None and len(other["queue"]) == 2

    dealt = client.post("/api/game/rng/round", json={"roundType": MAIN}).json()
    assert dealt["sequence"] == {"name": "Win", "sequence": [{"op": STOP_REELS, "range": 80, "value": value} for value in (1, 2, 3)]}
    assert [entry["roundType"] for entry in dealt["queue"]] == [TETRA]
    assert dealt["revision"] > queue["revision"]


def test_every_window_reads_the_same_queue_and_asks_for_it_only_when_it_changed(client):
    added = client.post("/api/game/rng/queue", json={"sequences": [sequence(MAIN, 5)]}).json()
    state = client.get("/api/game/rng").json()
    assert state["queue"] == added["queue"]
    unchanged = client.get("/api/game/rng", params={"revision": state["revision"]}).json()
    assert unchanged == {"server": state["server"], "revision": state["revision"], "events": [], "active": "current"}


def test_a_page_names_the_workspace_whose_game_it_plays(client):
    client.post("/api/game/rng/queue", params={"workspace": "current"}, json={"sequences": [sequence(MAIN, 5)]})
    assert len(client.get("/api/game/rng", params={"workspace": "current"}).json()["queue"]) == 1
    missing = client.post("/api/game/rng/round", params={"workspace": "other"}, json={"roundType": MAIN})
    assert missing.status_code == 404


def test_sequences_are_deleted_and_moved_by_their_ids(client):
    queue = client.post("/api/game/rng/queue", json={"sequences": [sequence(MAIN, value, name=str(value)) for value in range(4)]}).json()["queue"]
    ids = [entry["id"] for entry in queue]
    names = lambda state: [entry["name"] for entry in state["queue"]]
    assert names(client.post("/api/game/rng/queue/move", json={"id": ids[3], "before": ids[0]}).json()) == ["3", "0", "1", "2"]
    assert names(client.post("/api/game/rng/queue/move", json={"id": ids[3]}).json()) == ["0", "1", "2", "3"]
    assert names(client.post("/api/game/rng/queue/delete", json={"id": ids[1]}).json()) == ["0", "2", "3"]
    # one another window deleted already is gone: nothing changes
    assert names(client.post("/api/game/rng/queue/delete", json={"id": ids[1]}).json()) == ["0", "2", "3"]
    assert names(client.post("/api/game/rng/queue/move", json={"id": ids[1], "before": ids[0]}).json()) == ["0", "2", "3"]
    assert client.post("/api/game/rng/queue/clear").json()["queue"] == []


def test_the_server_deals_random_32_bit_numbers(client):
    randoms = client.post("/api/game/rng/randoms", json={"count": 64}).json()["randoms"]
    assert len(randoms) == 64 and all(0 <= value < 1 << 32 for value in randoms) and len(set(randoms)) > 60
    assert client.post("/api/game/rng/randoms", json={"count": 0}).status_code == 400


def test_the_queue_refuses_numbers_that_are_not_rng_numbers(client):
    bad = sequence(MAIN, 1)
    bad["sequence"][0]["value"] = 1 << 32
    assert client.post("/api/game/rng/queue", json={"sequences": [bad]}).status_code == 400
    assert client.post("/api/game/rng/queue", json={"sequences": [{**sequence(MAIN, 1), "extra": 1}]}).status_code == 400


def test_changes_need_the_session(api):
    assert api.post("/api/game/rng/queue", json={"sequences": [sequence(MAIN, 1)]}).status_code == 403
    assert api.post("/api/game/rng/round", json={"roundType": MAIN}).status_code == 403


def test_the_game_events_reach_the_tools_other_windows(client):
    event = {"event": "roundEnded", "roundType": MAIN, "idle": False, "nextRoundType": TETRA, "currencies": [[3, 400]]}
    first = client.post("/api/game/rng/events", json=event).json()["id"]
    second = client.post("/api/game/rng/events", json={**event, "event": "roundStarting", "roundType": TETRA}).json()["id"]
    # a window that opens follows the newest event only; then the events after the last it saw
    assert [item["id"] for item in client.get("/api/game/rng").json()["events"]] == [second]
    events = client.get("/api/game/rng", params={"after": 0}).json()["events"]
    assert [(item["id"], item["event"]) for item in events] == [(first, "roundEnded"), (second, "roundStarting")]
    assert events[0]["currencies"] == [[3, 400]] and events[0]["nextRoundType"] == TETRA
    assert client.get("/api/game/rng", params={"after": second}).json()["events"] == []


def test_each_workspace_has_its_own_game():
    server = GameServer()
    server.add("a", [sequence(MAIN, 1)])
    assert server.state("b")["queue"] == []
    assert server.start_round("b", MAIN)["sequence"] is None
    assert server.start_round("a", MAIN)["sequence"] is not None
