"""The browser game times everything on the game Clock (engine/Game/Utils/Clock.ts, C++'s Egt::Game::Clock), whose speed
and pause the Automation window sets, as the C++ game times its reels, tweens and timers on Clock::now(). Only the Clock
itself and the tools that must keep the page's time at any game speed read the page's clock."""

import re
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent / "frontend/src/game"

# The page's time sources: none of them follows the game Clock's speed or pause.
PAGE_TIME = re.compile(r"performance\.now\(|Date\.now\(|new Date\(|\.timeStamp\b")

# Files allowed to read the page's time, and why.
PAGE_TIME_USERS = {
    "engine/Game/Utils/Clock.ts": "the Clock: the page's time at a speed",
    "engine/FileWatch/FileWatch.ts": "polls the backend for changed files while the game is paused too (C++: inotify)",
    "GameView.vue": "refreshes the Play page's panels 5 times a second",
    "export/translator/Translator.mjs": "translates performance.now() into C++",
}


def test_only_the_clock_and_page_tools_read_the_page_time():
    users = {}
    for path in GAME.rglob("*"):
        if path.suffix not in {".ts", ".vue", ".mjs"} or "tests" in path.relative_to(GAME).parts:
            continue
        if PAGE_TIME.search(path.read_text(encoding="utf-8")):
            users[path.relative_to(GAME).as_posix()] = True
    unexpected = sorted(set(users) - set(PAGE_TIME_USERS))
    assert not unexpected, f"time these on Clock.now() (engine/Game/Utils/Clock.ts), as C++ does on Clock::now(): {unexpected}"
