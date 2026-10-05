"""Resolve backend and development UI ports from workspace settings and launch overrides."""

import os


def _resolve_port(config: dict | None, key: str, default: int, variable: str) -> int:
    config = config or {}
    settings = config.get("config", {})
    if not isinstance(settings, dict):
        raise RuntimeError("config in workspace.json must be an object")
    override = os.environ.get(variable)
    raw = override or settings.get(key, config.get(key, default))
    try:
        port = int(raw) if isinstance(raw, (int, str)) and not isinstance(raw, bool) else 0
    except ValueError:
        port = 0
    if not 1 <= port <= 65535:
        source = variable if override else f"{'config.' if key in settings else ''}{key} in workspace.json"
        raise RuntimeError(f"{source} must be an integer between 1 and 65535")
    return port


def backend_port(config: dict | None = None) -> int:
    return _resolve_port(config, "port", 3456, "PORT")


def vite_port(config: dict | None = None) -> int:
    return _resolve_port(config, "vite_port", 5173, "VITE_PORT")


def dev_ui_url(config: dict | None = None) -> str:
    return f"http://127.0.0.1:{vite_port(config)}"
