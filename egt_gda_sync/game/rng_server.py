"""The game server of the browser game (frontend/src/game): the random numbers its rounds are calculated with, its RNG
Queue, and the game's events the debug tools follow.

The browser game is a server based game: the backend deals each round's random numbers, as a cabinet's kernel deals
them to the C++ game (IKernelApi::RequestRandoms, which the playground kernel answers with SimulateRemoteServer
numbers). The RNG Queue, which the C++ game keeps in its RngPresetManager (Tools → RNG Queue in the QA builds), is the
server's: every window that shows the game's tools (the Play page, the Game tools page) reads and changes the same
queue, and when the game starts a round of the first sequence's type, the server deals the round that sequence: the
numbers the game's override engine plays instead of random ones.

The game also tells the server what its debug tools follow (the round starting, the round ended and the one it plays
next, the buttons that enter the wheel and the gamble), and the server passes it on to the tools' other windows, so that
their RNG Picker's Tab Sync shows the round the game plays next.

There is one game per workspace, in memory: it lasts until the backend stops, as the C++ queue lasts until the game
stops. Every method is thread safe.
"""

from __future__ import annotations

import secrets
import threading
from collections import deque
from dataclasses import dataclass, field

from egt_gda_sync.app.errors import AppError

MAX_QUEUE = 1000
MAX_SEQUENCE = 4096
MAX_RANDOMS = 4096
MAX_EVENTS = 64
UINT32 = 1 << 32


@dataclass
class _Game:
    """A workspace's game: its RNG Queue and the events of it that the tools follow."""
    queue: list[dict] = field(default_factory=list)
    # A queue's state: it moves on with every change, so that a window asks for the queue only when it changed.
    revision: int = 0
    next_id: int = 1
    events: deque = field(default_factory=lambda: deque(maxlen=MAX_EVENTS))
    next_event: int = 1


class GameServer:
    """The games of the workspaces, by workspace id."""

    def __init__(self):
        self._lock = threading.Lock()
        self._games: dict[str, _Game] = {}
        # this server's instance: a window that sees another knows the backend restarted, its queue and events anew
        self._instance = secrets.token_hex(8)

    def _game(self, workspace: str) -> _Game:
        return self._games.setdefault(workspace, _Game())

    @staticmethod
    def _queue(game: _Game) -> dict:
        return {"revision": game.revision, "queue": [dict(entry, sequence=list(entry["sequence"])) for entry in game.queue]}

    def state(self, workspace: str, revision: int | None = None, after: int | None = None) -> dict:
        """The game's RNG Queue, unless it is still at `revision`, and its events after the event `after` (none: the
        newest one only, what a window that opens follows)."""
        with self._lock:
            game = self._game(workspace)
            state = {"server": self._instance}
            state.update({"revision": game.revision} if revision == game.revision else self._queue(game))
            events = list(game.events)
            state["events"] = events[-1:] if after is None else [event for event in events if event["id"] > after]
            return state

    def add(self, workspace: str, sequences: list[dict]) -> dict:
        """Queues RNG sequences, each a round type's numbers and its name (C++'s AddRngSequence)."""
        with self._lock:
            game = self._game(workspace)
            if len(game.queue) + len(sequences) > MAX_QUEUE:
                raise AppError(f"The RNG Queue holds at most {MAX_QUEUE} sequences", 409)
            for sequence in sequences:
                game.queue.append({"id": game.next_id, "roundType": sequence["roundType"], "name": sequence["name"],
                                   "sequence": [dict(number) for number in sequence["sequence"]]})
                game.next_id += 1
            game.revision += 1
            return self._queue(game)

    def delete(self, workspace: str, entry_id: int) -> dict:
        """Removes a queued sequence; one another window removed already is gone."""
        with self._lock:
            game = self._game(workspace)
            game.queue = [entry for entry in game.queue if entry["id"] != entry_id]
            game.revision += 1
            return self._queue(game)

    def move(self, workspace: str, entry_id: int, before: int | None) -> dict:
        """Moves a queued sequence before another (std::list::splice), or to the end; nothing when either is gone."""
        with self._lock:
            game = self._game(workspace)
            moved = next((entry for entry in game.queue if entry["id"] == entry_id), None)
            ids = [entry["id"] for entry in game.queue]
            if moved and entry_id != before and (before is None or before in ids):
                game.queue.remove(moved)
                index = len(game.queue) if before is None else [entry["id"] for entry in game.queue].index(before)
                game.queue.insert(index, moved)
            game.revision += 1
            return self._queue(game)

    def clear(self, workspace: str) -> dict:
        """Empties the queue (C++'s ClearRngSequences)."""
        with self._lock:
            game = self._game(workspace)
            game.queue.clear()
            game.revision += 1
            return self._queue(game)

    def start_round(self, workspace: str, round_type: int) -> dict:
        """A round of the game starts: the queue's first sequence when it is of the round's type, which the round plays
        instead of random numbers (C++'s RngPresetManager on the gameflow's roundStarting), and the queue without it."""
        with self._lock:
            game = self._game(workspace)
            sequence = None
            if game.queue and game.queue[0]["roundType"] == round_type:
                entry = game.queue.pop(0)
                sequence = {"name": entry["name"], "sequence": entry["sequence"]}
                game.revision += 1
            return {"sequence": sequence, **self._queue(game)}

    @staticmethod
    def randoms(count: int) -> list[int]:
        """Random 32-bit numbers, from the system's cryptographic generator: the kernel's numbers a round is calculated
        with when the queue has none for it."""
        if not 1 <= count <= MAX_RANDOMS:
            raise AppError(f"Ask for 1 to {MAX_RANDOMS} random numbers", 400)
        return [secrets.randbelow(UINT32) for _ in range(count)]

    def post_event(self, workspace: str, event: dict) -> dict:
        """Something the game did that its debug tools follow, for the tools' other windows."""
        with self._lock:
            game = self._game(workspace)
            posted = {"id": game.next_event, **event}
            game.next_event += 1
            game.events.append(posted)
            return {"id": posted["id"]}
