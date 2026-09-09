"""Strict Node TAP reporting shared by the two fixed-suite adapters.

Only complete, numbered, planned scopes supply outcomes. Diagnostic YAML and
comments never supply results. Unsupported output fails closed rather than
being silently discarded.
"""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
RESULT = re.compile(r"(not ok|ok) ([1-9][0-9]*) - (.+)")
PLAN = re.compile(r"1\.\.([0-9]+)(?: # (?:SKIP|TODO)\b.*)?", re.IGNORECASE)
DIRECTIVE = re.compile(r"(?<!\\)\s+#\s*(SKIP|TODO)\b.*$", re.IGNORECASE)


class InvalidTap(ValueError):
    """The stream cannot certify a complete selection of tests."""


class TapParser:
    def __init__(self, output):
        if not isinstance(output, bytes):
            raise InvalidTap("runner stdout was not bytes")
        text = output.decode("utf-8", errors="strict")
        if not text.endswith("\n") or "\x00" in text:
            raise InvalidTap("unterminated or invalid TAP stream")
        self.lines = text.splitlines()
        if not self.lines or self.lines[0] != "TAP version 13":
            raise InvalidTap("missing TAP version 13")
        self.index = 1
        self.results = {}

    def parse(self):
        self.scope(0, ())
        if self.index != len(self.lines) or not self.results:
            raise InvalidTap("empty or incomplete selection")
        return self.results

    def scope(self, indent, parents):
        count = 0
        plan = None
        trailing_plan = False
        pending = None
        child_seen = False
        diagnostic_allowed = False
        while self.index < len(self.lines):
            line = self.lines[self.index]
            if not line.strip():
                self.index += 1
                continue
            spaces = len(line) - len(line.lstrip(" "))
            if spaces < indent:
                break
            if spaces > indent:
                if spaces == indent + 2 and line.strip() == "---" and diagnostic_allowed:
                    self.diagnostic(indent + 2)
                    diagnostic_allowed = False
                    continue
                if spaces == indent + 4 and pending is not None and not child_seen:
                    self.scope(indent + 4, parents + (pending,))
                    child_seen = True
                    continue
                raise InvalidTap("unexpected TAP indentation")

            text = line[indent:]
            self.index += 1
            if text.startswith("# Subtest: "):
                if pending is not None or trailing_plan:
                    raise InvalidTap("unresolved or unplanned subtest")
                pending = text[len("# Subtest: "):]
                if not pending.strip():
                    raise InvalidTap("empty subtest name")
                child_seen = False
                diagnostic_allowed = False
                continue
            if text.startswith("#"):
                continue
            if text.lower().startswith("bail out!"):
                raise InvalidTap("runner bailed out")
            match = PLAN.fullmatch(text)
            if match:
                if plan is not None or pending is not None:
                    raise InvalidTap("duplicate plan or unresolved subtest")
                plan = int(match.group(1))
                if plan == 0 or "#" in text:
                    raise InvalidTap("empty or skipped scope")
                trailing_plan = count > 0
                diagnostic_allowed = False
                continue
            match = RESULT.fullmatch(text)
            if not match or trailing_plan:
                raise InvalidTap("unknown or unplanned TAP record")
            state, number, name = match.groups()
            if int(number) != count + 1:
                raise InvalidTap("duplicate or out-of-order result number")
            directive = DIRECTIVE.search(name)
            if directive:
                name = name[:directive.start()]
            if not name.strip() or (pending is not None and name != pending):
                raise InvalidTap("missing or mismatched result name")
            test_id = "/".join(parents + (name,))
            if test_id in self.results:
                raise InvalidTap("ambiguous test ID")
            self.results[test_id] = "pass" if state == "ok" and not directive else "fail"
            count += 1
            pending = None
            child_seen = False
            diagnostic_allowed = True
        if plan is None or count != plan or pending is not None:
            raise InvalidTap("missing plan or incomplete scope")

    def diagnostic(self, indent):
        self.index += 1  # Opening YAML marker.
        while self.index < len(self.lines):
            line = self.lines[self.index]
            self.index += 1
            if line == " " * indent + "...":
                return
            if line.strip() and (len(line) - len(line.lstrip(" ")) < indent):
                raise InvalidTap("truncated diagnostic block")
        raise InvalidTap("unterminated diagnostic block")


def command(suite):
    if suite == "unit":
        directory = ROOT / "apps/web/tests"
        # Matches the two top-level globs in apps/web/package.json.
        selected = sorted(directory.glob("*.test.ts")) + sorted(directory.glob("*.test.tsx"))
        if not selected:
            raise InvalidTap("unit suite selects no test files")
        return ["node", "--import", "tsx", "--test", "--test-reporter=tap", *map(str, selected)]
    if suite == "acceptance":
        return ["node", "--test", "--test-reporter=tap", str(ROOT / "scripts/production.test.mjs")]
    raise ValueError("unknown fixed suite")


def publish(report, results):
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix=".echo-test-report-", suffix=".json", dir=report.parent)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(results, stream, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, report)
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


def main(suite):
    parser = argparse.ArgumentParser(description="Run a fixed suite and publish complete TAP outcomes.")
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    report = args.report.absolute()
    runner_exit = 0
    try:
        # Unlink the report itself, including a stale symlink, before launch.
        report.unlink(missing_ok=True)
        completed = subprocess.run(command(suite), cwd=ROOT, capture_output=True, check=False)
        runner_exit = completed.returncode
        if runner_exit < 0:
            runner_exit = 128 - runner_exit
        results = TapParser(completed.stdout).parse()
        publish(report, results)
        return runner_exit or (1 if "fail" in results.values() else 0)
    except (OSError, UnicodeError, ValueError) as error:
        # Do not echo recording content, test output, or environment values.
        print("Test adapter blocked: " + type(error).__name__, file=sys.stderr)
        return runner_exit or 1

