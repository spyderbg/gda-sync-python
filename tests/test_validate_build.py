import sys

import pytest

from scripts import validate_build


def test_compile_errors_report_the_source_and_line(tmp_path):
    source = tmp_path / "broken.py"
    source.write_text("def broken(:\n", encoding="utf-8")
    stdout, stderr, code = validate_build._run_capture(
        [sys.executable, "-m", "compileall", "-q", str(source)]
    )
    assert code != 0
    issues = validate_build._parse_compile_errors(stdout, stderr)
    assert len(issues) == 1
    assert issues[0][:2] == (str(source), 1)
    assert "SyntaxError" in issues[0][2]


@pytest.mark.parametrize("lint_code", [0, 2, 6, 32, 34])
def test_validation_propagates_lint_failures_and_exports_json(monkeypatch, tmp_path, lint_code):
    calls = []

    def capture(command, **options):
        calls.append(command)
        if "--output-format=text" in command:
            return "egt_gda_sync/example.py:1:0: E0602: Undefined variable 'missing' (undefined-variable)\n", "", lint_code
        if "--output-format=json" in command:
            return "[]", "", lint_code
        return "", "", 0

    monkeypatch.setattr(validate_build, "_run_capture", capture)
    report = tmp_path / "reports" / "pylint.json"
    assert validate_build.main(["--skip-install", "--json", str(report)]) == (1 if lint_code & 32 else lint_code)
    compile_command = next(command for command in calls if "compileall" in command)
    assert compile_command[-4:] == ["egt_gda_sync", "scripts", "bundle/launcher.py", "tests"]
    if lint_code & 32:
        assert not report.exists()
    else:
        assert report.read_text(encoding="utf-8") == "[]"


def test_missing_environment_with_skip_install_has_actionable_error(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(validate_build, "_resolve_paths", lambda: (tmp_path, tmp_path / ".venv"))
    assert validate_build.main(["--skip-install"]) == 1
    assert "Run without --skip-install" in capsys.readouterr().err
