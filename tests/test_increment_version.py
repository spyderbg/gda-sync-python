"""Release files and publication are tested against disposable, local Git remotes."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from scripts import increment_version as release

ROOT = Path(__file__).resolve().parents[1]
GIT_ENV = {**os.environ, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_TERMINAL_PROMPT": "0"}


def git(root, *args):
    result = subprocess.run(["git", *args], cwd=root, env=GIT_ENV, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()


def commit(root, subject, push=True):
    git(root, "add", ".")
    git(root, "commit", "-m", subject)
    if push:
        git(root, "push", "origin", "HEAD")


@pytest.fixture
def repository(tmp_path, monkeypatch, request):
    # Also isolate Git commands issued by release.Git, including fetch, commit and push.
    for name in ("GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_TERMINAL_PROMPT"):
        monkeypatch.setenv(name, GIT_ENV[name])
    root, remote = tmp_path / "checkout", tmp_path / "origin.git"
    root.mkdir()
    git(root, "init", "--initial-branch=dev")
    git(root, "config", "user.name", "Release test")
    git(root, "config", "user.email", "release-test@example.invalid")
    mode = getattr(request, "param", "present")
    for name in (release.PACKAGE, release.LOCKFILE, "pyproject.toml", "scripts/increment_version.py"):
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    if mode != "missing-file":
        backend = root / release.BACKEND_VERSION
        backend.parent.mkdir(parents=True)
        source = (ROOT / release.BACKEND_VERSION).read_text(encoding="utf-8")
        backend.write_text(source if mode == "present" else 'APP_ID = "egt-gda-sync"\n', encoding="utf-8")
    (root / "conflict.txt").write_text("base\n")
    commit(root, "feat: Initial release fixture", push=False)
    git(root, "branch", "main")
    git(tmp_path, "init", "--bare", str(remote))
    git(root, "remote", "add", "origin", str(remote))
    git(root, "push", "-u", "origin", "dev", "main")
    return root, remote


@pytest.mark.parametrize(("current", "part", "expected"), [
    ("1.0.0", "build", "1.0.1"), ("1.0.9", "build", "1.1.0"), ("1.9.9", "build", "2.0.0"),
    ("9.9.8", "build", "9.9.9"), ("1.0.9", "minor", "1.1.0"), ("1.9.9", "minor", "2.0.0"),
    ("1.9.9", "major", "2.0.0"),
])
def test_version_digits_increment_with_carry(current, part, expected):
    assert release.increment(current, part) == expected


@pytest.mark.parametrize("current", ["1.0.10", "v1.0.0", "1.0", "1.0.0-dev", "9.9.9"])
def test_invalid_or_exhausted_version_is_refused(current):
    with pytest.raises(release.ReleaseError):
        release.increment(current)


@pytest.mark.parametrize("newline", ["\n", "\r\n"])
def test_backend_update_preserves_unicode_comments_and_other_definitions(tmp_path, newline):
    source = newline.join([
        '"""Версия программы."""', 'APP_ID = "egt-gda-sync"',
        '__version__: "версия" = \'1.0.0\'  # keep this note', 'OTHER = "1.0.0"', '',
    ])
    path = tmp_path / release.BACKEND_VERSION
    path.parent.mkdir()
    path.write_bytes(source.encode("utf-8"))
    result = release.backend_version_file(tmp_path, "1.0.0", "1.0.1")
    assert result == source.replace("'1.0.0'", '"1.0.1"')
    assert path.read_bytes() == source.encode("utf-8")  # Planning does not write.


def test_changelog_preserves_manual_notes_and_previous_releases():
    groups = release.change_entries([
        "feat(ui): Add cards", "fix: Repair a preview", "feat(ui): Add cards",
        "feat!: Replace the API", "fix: Prevent XSS", "Remove obsolete menu",
        "Merge branch dev", "Increment version to 1.0.0",
    ])
    assert groups["Added"] == ["- Add cards", "- Breaking change: Replace the API"]
    assert groups["Fixed"] == ["- Repair a preview"]
    assert groups["Security"] == ["- Prevent XSS"]
    assert groups["Removed"] == ["- Remove obsolete menu"]
    original = ("# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Manual note\n\n"
                "## [1.0.0] - 2026-10-01\n\n### Fixed\n\n- Old fix\n\n[1.0.0]: https://example.invalid/old\n")
    rendered = release.render_changelog(original, "1.0.1", "2026-10-29", groups,
                                        "https://github.com/spyderbg/gda-sync-python", "abc123")
    assert "## [1.0.1] - 2026-10-29" in rendered
    assert rendered.count("- Add cards") == 1
    assert "- Manual note" in rendered and "- Old fix" in rendered
    assert rendered.count("## [Unreleased]") == 1
    assert "[1.0.0]: https://example.invalid/old" in rendered
    assert "releases%2Fv1.0.1" in rendered


@pytest.mark.parametrize("repository", ["present", "missing-file", "missing-assignment"], indirect=True)
def test_dry_run_then_publish_updates_all_versions_and_main(repository):
    root, remote = repository
    current = json.loads((root / release.PACKAGE).read_text())["version"]
    version = release.increment(current)
    command = [sys.executable, str(root / "scripts/increment_version.py")]
    head, refs = git(root, "rev-parse", "HEAD"), git(remote, "show-ref")
    backend = root / release.BACKEND_VERSION
    original = backend.read_bytes() if backend.exists() else None
    preview = subprocess.run([*command, "--dry-run"], cwd=root, env=GIT_ENV, capture_output=True, text=True, timeout=30)
    assert preview.returncode == 0, preview.stdout + preview.stderr
    assert f"Version: {version}" in preview.stdout and "Dry run:" in preview.stdout
    assert git(root, "rev-parse", "HEAD") == head and git(root, "status", "--porcelain") == ""
    assert git(remote, "show-ref") == refs
    assert (backend.read_bytes() if backend.exists() else None) == original
    assert not (root / release.CHANGELOG).exists()

    published = subprocess.run(command, cwd=root, env=GIT_ENV, capture_output=True, text=True, timeout=30)
    assert published.returncode == 0, published.stdout + published.stderr
    assert git(root, "branch", "--show-current") == "dev" and git(root, "status", "--porcelain") == ""
    assert json.loads((root / release.PACKAGE).read_text())["version"] == version
    lock = json.loads((root / release.LOCKFILE).read_text())
    assert lock["version"] == lock["packages"][""]["version"] == version
    # Fresh imports use the newly written package, including when __init__.py had to be created.
    result = subprocess.run([sys.executable, "-c", "from egt_gda_sync import __version__, APP_ID; print(__version__, APP_ID)"],
                            cwd=root, env=GIT_ENV, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == f"{version} egt-gda-sync"
    assert f"## {version} - " in (root / release.CHANGELOG).read_text()
    assert set(git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines()) == {
        release.PACKAGE, release.LOCKFILE, release.BACKEND_VERSION, release.CHANGELOG,
    }
    tag = f"refs/tags/{release.release_tag(version)}"
    assert git(remote, "cat-file", "-t", tag) == "tag"
    assert git(remote, "rev-parse", "refs/heads/dev") == git(remote, "rev-parse", f"{tag}^{{commit}}")
    git(remote, "merge-base", "--is-ancestor", "refs/heads/dev", "refs/heads/main")
    assert git(remote, "show", f"refs/heads/main:{release.BACKEND_VERSION}") == backend.read_text().strip()

    (root / "followup.txt").write_text("followup")
    commit(root, "fix: Followup release change")
    plan = release.plan_release(release.Git(root), "build")
    assert plan.version == release.increment(version)
    assert plan.subjects == ["fix: Followup release change"]
    assert f"## {version} - " in plan.files[release.CHANGELOG]
    assert f'__version__ = "{plan.version}"' in plan.files[release.BACKEND_VERSION]


@pytest.mark.parametrize("condition", [
    "dirty", "wrong-branch", "ahead", "lock-mismatch", "backend-mismatch", "backend-invalid", "backend-dynamic",
    "existing-tag", "duplicate-changelog", "no-new-changes",
])
def test_refuses_invalid_release_states_without_publishing(repository, condition):
    root, remote = repository
    current = json.loads((root / release.PACKAGE).read_text())["version"]
    version = release.increment(current)
    if condition == "dirty":
        (root / "untracked.txt").write_text("untracked")
        expected = "Working tree must be clean"
    elif condition == "wrong-branch":
        git(root, "checkout", "main")
        expected = "requires branch 'dev'"
    elif condition == "ahead":
        (root / "unpublished.txt").write_text("unpublished")
        commit(root, "feat: Unpublished", push=False)
        expected = "not up to date"
    elif condition == "lock-mismatch":
        lock = json.loads((root / release.LOCKFILE).read_text())
        lock["version"] = version
        (root / release.LOCKFILE).write_text(json.dumps(lock))
        commit(root, "chore: Mismatched lock")
        expected = "must match"
    elif condition.startswith("backend-"):
        source, expected = {
            "backend-mismatch": (f'__version__ = "{version}"\n', "differs from frontend version"),
            "backend-invalid": ("__version__ = [\n", "Cannot parse"),
            "backend-dynamic": ('__version__ = get_version()\n', "must be a string literal"),
        }[condition]
        (root / release.BACKEND_VERSION).write_text(source)
        commit(root, "chore: Invalid backend version")
    elif condition == "existing-tag":
        git(root, "tag", release.release_tag(version))
        expected = "already exists"
    elif condition == "duplicate-changelog":
        path = root / release.CHANGELOG
        path.parent.mkdir()
        path.write_text(f"# Changelog\n\n## {version} - 2026-10-29\n")
        commit(root, "chore: Existing release notes")
        expected = "already contains version"
    else:
        git(root, "tag", release.release_tag(current))
        expected = "No changes found"
    refs = git(remote, "show-ref")
    with pytest.raises(release.ReleaseError, match=expected):
        release.plan_release(release.Git(root), "build")
    assert git(remote, "show-ref") == refs


def test_merge_conflict_reports_published_dev_and_tag_and_returns_to_dev(repository):
    root, remote = repository
    current = json.loads((root / release.PACKAGE).read_text())["version"]
    (root / "conflict.txt").write_text("dev\n")
    commit(root, "fix: Development version")
    git(root, "checkout", "main")
    (root / "conflict.txt").write_text("main\n")
    commit(root, "fix: Main version")
    main = git(remote, "rev-parse", "refs/heads/main")
    git(root, "checkout", "dev")
    local = release.Git(root)
    with pytest.raises(release.ReleaseError, match="origin/dev and tag pushed"):
        release.publish(local, release.plan_release(local, "build"))
    assert git(root, "branch", "--show-current") == "dev" and git(root, "status", "--porcelain") == ""
    assert git(remote, "rev-parse", "refs/heads/main") == main
    tag = f"refs/tags/{release.release_tag(release.increment(current))}^{{commit}}"
    assert git(remote, "rev-parse", "refs/heads/dev") == git(remote, "rev-parse", tag)
