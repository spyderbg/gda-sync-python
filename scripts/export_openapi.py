#!/usr/bin/env python3
"""Export FastAPI's auto-generated OpenAPI spec of the EGT GDA Sync backend to docs/openapi.yaml.

The spec is derived directly from the route decorators and Pydantic models in egt_gda_sync/app/server.py — no
manual editing required. Run this script after any change to routes or request bodies.

Usage:
    python scripts/export_openapi.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML is not installed. Run:  pip install pyyaml", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Path setup — allow running from project root without installing the package
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent  # Project root: gda-sync-python/
OUTPUT = ROOT / "docs" / "openapi.yaml"
sys.path.insert(0, str(ROOT))

from egt_gda_sync import __version__  # noqa: E402 pylint: disable=wrong-import-position
from egt_gda_sync.app.server import BODY_LIMIT, BODY_LIMITS, create_app  # noqa: E402 pylint: disable=wrong-import-position
from egt_gda_sync.workspace.library import Library  # noqa: E402 pylint: disable=wrong-import-position

TITLE = "EGT GDA Sync API"
DESCRIPTION = (
    "The local HTTP API of EGT GDA Sync. It answers only requests to a loopback host; requests other than "
    "GET and HEAD need the session token that GET /api/session returns, in the X-GDA-Token header."
)

# ---------------------------------------------------------------------------
# Section registry — a route goes under the first section with a prefix of its path.
# Add an entry here for a new group of routes; routes that match none are listed last, under "Other".
# ---------------------------------------------------------------------------
SECTIONS: dict[str, tuple[str, ...]] = {
    "Session": ("/api/session", "/api/lifecycle", "/api/shutdown", "/api/health"),
    "Workspace": (
        "/api/library", "/api/dashboard", "/api/scan", "/api/sync", "/api/settings", "/api/workspace", "/api/open-folder",
    ),
    "GDA sync": ("/api/rss-sync",),
    "Backups": ("/api/backups",),
    "Asset library": ("/api/asset-report",),
}
OTHER = "Other"

# The errors the app answers with, all as {"error": message}, by response name: an invalid request (invalid_request in
# server.py, in place of FastAPI's 422 and its validation details), the requests LocalGuard rejects, and a failed
# operation (the OSError and Exception handlers).
ERROR_SCHEMA = {
    "properties": {"error": {"type": "string", "title": "Error"}},
    "type": "object",
    "required": ["error"],
    "title": "Error",
}
ERROR_RESPONSES = {
    "InvalidRequest": "Invalid request",
    "Forbidden": (
        "Not a same-site request to a loopback host or, for a method other than GET and HEAD, "
        "no valid X-GDA-Token header"
    ),
    "ContentTooLarge": f"The request body is larger than {BODY_LIMIT // 1024} KiB",  # The routes not in BODY_LIMITS.
    "ServerError": "The operation could not be completed",
}


def _section(path: str) -> str:
    for name, prefixes in SECTIONS.items():
        if any(path == p or path.startswith(p + "/") for p in prefixes):
            return name
    return OTHER


def _section_index(path: str) -> int:
    section = _section(path)
    return list(SECTIONS).index(section) if section in SECTIONS else len(SECTIONS)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def build_schema() -> dict:
    """Return the app's OpenAPI schema, with each operation tagged with its section.

    No server is started; app.openapi() is a synchronous introspection call.
    """
    # create_app needs a Library but never reads its workspace: a throwaway home leaves the user's data untouched.
    with tempfile.TemporaryDirectory() as home:
        app = create_app(Library(home), frontend={})
        app.title = TITLE
        app.version = __version__
        app.description = DESCRIPTION
        schema = app.openapi()

    # Tags group the routes the same way in API viewers as the separators do in the YAML.
    for path, item in schema.get("paths", {}).items():
        for operation in item.values():
            operation.setdefault("tags", [_section(path)])
    _use_error_responses(schema)
    return schema


# These return a new object each time: PyYAML writes a shared one as anchors, which clash between the paths dumped
# separately.
def _error_response(name: str) -> dict:
    return {"$ref": f"#/components/responses/{name}"}


def _error_content() -> dict:
    return {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}


def _use_error_responses(schema: dict) -> None:
    """Document the errors the app actually returns: 400 in place of FastAPI's 422, and 403, 413 and 500."""
    for path, item in schema.get("paths", {}).items():
        for operation in item.values():
            responses = operation.setdefault("responses", {})
            if responses.pop("422", None) is not None:
                responses["400"] = _error_response("InvalidRequest")
            responses["403"] = _error_response("Forbidden")
            # LocalGuard checks the Content-Length of any request, but only one with a body can exceed the limit.
            if "requestBody" in operation:
                limit = BODY_LIMITS.get(path)
                responses["413"] = _error_response("ContentTooLarge") if limit is None else {
                    "description": f"The request body is larger than {limit // 1024} KiB", "content": _error_content(),
                }
            responses["500"] = _error_response("ServerError")
            operation["responses"] = dict(sorted(responses.items()))

    components = schema.setdefault("components", {})
    # Only the 422 responses refer to the validation schemas.
    schemas = components.setdefault("schemas", {})
    for name in ("HTTPValidationError", "ValidationError"):
        schemas.pop(name, None)
    schemas["Error"] = ERROR_SCHEMA
    components["schemas"] = dict(sorted(schemas.items()))
    components["responses"] = {
        name: {"description": description, "content": _error_content()}
        for name, description in ERROR_RESPONSES.items()
    }

# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------

_YAML_OPTS: dict = dict(default_flow_style=False, allow_unicode=True, sort_keys=False)
_SEP_WIDTH = 70


def _section_separator(label: str) -> str:
    prefix = f"# ─── {label} "
    return prefix + "─" * max(4, _SEP_WIDTH - len(prefix))


def _paths_yaml(paths: dict) -> str:
    """Serialize the paths dict section by section, each under a comment separator.

    Within a section, routes keep the order server.py declares them in.
    """
    lines: list[str] = ["paths:"]
    current: str | None = None
    for path, defn in sorted(paths.items(), key=lambda kv: _section_index(kv[0])):
        section = _section(path)
        if section != current:
            lines.append("")
            lines.append(f"  {_section_separator(section)}")
            current = section
        for line in yaml.dump({path: defn}, **_YAML_OPTS).splitlines():
            lines.append(("  " + line) if line.strip() else "")
    return "\n".join(lines) + "\n"


def export(schema: dict) -> None:
    """Write the spec to docs/openapi.yaml: the header and components first, then the paths by section."""
    paths = schema.get("paths", {})
    header = {key: value for key, value in schema.items() if key != "paths"}

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as fh:
        fh.write(yaml.dump(header, **_YAML_OPTS))
        fh.write("\n")
        fh.write(_paths_yaml(paths))

    schemas = schema.get("components", {}).get("schemas", {})
    print(f"[{TITLE}]  {len(paths)} path(s), {len(schemas)} schema(s) → {OUTPUT.relative_to(ROOT)}")
    unsorted = [path for path in paths if _section(path) == OTHER]
    if unsorted:
        print(f"  Not in any section (listed under {OTHER!r}; add them to SECTIONS):")
        for path in unsorted:
            print(f"    {path}")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    export(build_schema())


if __name__ == "__main__":
    main()
