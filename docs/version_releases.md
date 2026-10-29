# Version releases

Run the release script from a clean `dev` checkout synchronized with `origin/dev`:

```bash
python scripts/increment_version.py --dry-run
python scripts/increment_version.py
```

The default increment is the build digit. Use `--part minor` or `--part major` to increment another component. Versions use three single digits: `1.0.9` becomes `1.1.0`, and `1.9.9` becomes `2.0.0`. The maximum version is `9.9.9`.

The script updates and commits these files together:

- `frontend/package.json`: the frontend version.
- `frontend/package-lock.json`: its top-level and root package versions.
- `egt_gda_sync/__init__.py`: the backend's `__version__`, used by Python packaging, the API and the UI.
- `docs/log_changes.md`: release notes grouped from commits since the previous release, plus any manual Unreleased notes.

If the backend version file is missing, the script creates it with `__version__` and the application's `APP_ID`. An existing file without a version assignment gets one appended; its other definitions are preserved. The changelog is also created when missing. The frontend manifests must exist, since they contain the project's dependency configuration. Existing frontend, lockfile and backend versions must agree before releasing.

`--dry-run` fetches origin refs and previews the release notes. It does not write release files, create commits or tags, push, or switch branches.

Without `--dry-run`, the script:

1. Commits the version files and changelog as `Increment version to X.Y.Z`.
2. Creates the annotated tag `releases/vX.Y.Z`.
3. Pushes `dev` and the tag together using an atomic push.
4. Checks out `main`, updates it with a fast-forward-only pull, merges `dev`, and pushes `main`.
5. Returns to `dev`.

The main push is separate from the dev/tag push. If merging or pushing main fails, dev and the tag may already be published. A conflicting merge is aborted, and the error reports the completed steps. Inspect local and remote Git state before retrying; the script preserves published commits and tags and refuses to overwrite an existing release tag.
