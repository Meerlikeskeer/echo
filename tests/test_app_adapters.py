"""Independent ENG-017 CLI acceptance, frozen before adapter implementation."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import os
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
ADAPTERS = ('run-app-tests.py', 'run-app-acceptance.py')
PASS = b'TAP version 13\n# Subtest: alpha\nok 1 - alpha\n# Subtest: beta\nok 2 - beta\n1..2\n# tests 2\n# pass 2\n# fail 0\n'


class AdapterAcceptance(unittest.TestCase):
    def invoke(self, adapter, tap=PASS, runner_exit=0, error=None, stale=False, publication_error=False):
        # Avoid temporary-directory cleanup: this sandbox denies rmdir even
        # for empty directories. Only temporary files are needed here.
        with tempfile.NamedTemporaryFile(suffix='.json') as target:
            report = Path(target.name)
            if stale:
                report.write_text('{"old-success":"pass"}')
            else:
                report.unlink()
            launch = subprocess.CompletedProcess(['fixture'], runner_exit, tap, b'')
            def run(*args, **kwargs):
                self.assertFalse(report.exists(), 'stale report survived launch')
                self.assertFalse(kwargs.get('shell', False))
                if error:
                    raise error
                return launch
            with patch.object(sys, 'argv', [str(ROOT / 'scripts' / adapter), '--report', str(report)]), \
                    patch('subprocess.run', side_effect=run) as mocked, \
                    patch('os.replace', side_effect=PermissionError('synthetic publication failure') if publication_error else os.replace), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                try:
                    runpy.run_path(str(ROOT / 'scripts' / adapter), run_name='__main__')
                    code = 0
                except SystemExit as exc:
                    code = exc.code or 0
            results = json.loads(report.read_text()) if report.exists() else None
            # NamedTemporaryFile expects its file to exist when closing.
            if not report.exists():
                report.touch()
            return code, results, mocked

    def assert_blocked(self, tap, runner_exit=0, error=None):
        for adapter in ADAPTERS:
            with self.subTest(adapter=adapter):
                code, report, _ = self.invoke(adapter, tap, runner_exit, error, stale=True)
                self.assertNotEqual(code, 0)
                self.assertIsNone(report, 'invalid stream left a usable report')
                if runner_exit > 0:
                    self.assertEqual(code, runner_exit)

    def test_complete_pass_and_fixed_runner(self):
        for adapter in ADAPTERS:
            with self.subTest(adapter=adapter):
                code, report, mocked = self.invoke(adapter)
                self.assertEqual(code, 0)
                self.assertEqual(len(report), 2)
                self.assertEqual(list(report.values()), ['pass', 'pass'])
                mocked.assert_called_once()
                argv = mocked.call_args.args[0]
                self.assertIsInstance(argv, (list, tuple))
                self.assertIn('--test-reporter=tap', argv)
                self.assertIn('--test', argv)
                self.assertEqual(Path(mocked.call_args.kwargs['cwd']).resolve(), ROOT)
                self.assertFalse(mocked.call_args.kwargs.get('text', False))
                self.assertTrue(mocked.call_args.kwargs.get('capture_output') or mocked.call_args.kwargs.get('stdout') == subprocess.PIPE)
                if adapter == 'run-app-tests.py':
                    self.assertTrue(any('tsx' in str(arg) for arg in argv))
                    selected = {Path(arg).resolve() for arg in argv if str(arg).endswith(('.test.ts', '.test.tsx'))}
                    expected = set((ROOT / 'apps/web/tests').glob('*.test.ts')) | set((ROOT / 'apps/web/tests').glob('*.test.tsx'))
                    self.assertEqual(selected, expected)
                else:
                    self.assertTrue(any(str(arg).endswith('scripts/production.test.mjs') for arg in argv))

    def test_failure_report_and_exit_preserved(self):
        tap = PASS.replace(b'ok 2 - beta', b'not ok 2 - beta').replace(b'# pass 2', b'# pass 1').replace(b'# fail 0', b'# fail 1')
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, tap, 7)
            self.assertEqual(code, 7)
            self.assertEqual(sorted(report.values()), ['fail', 'pass'])

    def test_nonzero_with_complete_passes_is_preserved(self):
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, PASS, 9)
            self.assertEqual(code, 9)
            self.assertEqual(len(report), 2)

    def test_skip_is_fail(self):
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, PASS.replace(b'ok 2 - beta', b'ok 2 - beta # SKIP unavailable'))
            self.assertNotEqual(code, 0)
            self.assertEqual(sorted(report.values()), ['fail', 'pass'])

    def test_todo_is_fail(self):
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, PASS.replace(b'ok 2 - beta', b'not ok 2 - beta # TODO later'))
            self.assertNotEqual(code, 0)
            self.assertEqual(sorted(report.values()), ['fail', 'pass'])

    def test_empty(self):
        self.assert_blocked(b'')

    def test_missing_version(self):
        self.assert_blocked(PASS.replace(b'TAP version 13\n', b''))

    def test_missing_plan(self):
        self.assert_blocked(PASS.replace(b'1..2\n', b''))

    def test_zero_tests(self):
        self.assert_blocked(b'TAP version 13\n1..0\n')

    def test_partial_plan(self):
        self.assert_blocked(PASS.replace(b'1..2', b'1..3'))

    def test_invalid_plan(self):
        self.assert_blocked(PASS.replace(b'1..2', b'1..wat'))

    def test_duplicate_plan(self):
        self.assert_blocked(PASS + b'1..2\n')

    def test_duplicate_ids(self):
        self.assert_blocked(PASS.replace(b'beta', b'alpha'))

    def test_duplicate_numbers(self):
        self.assert_blocked(PASS.replace(b'ok 2 - beta', b'ok 1 - beta'))

    def test_out_of_order_numbers(self):
        self.assert_blocked(PASS.replace(b'ok 1 - alpha', b'ok 3 - alpha'))

    def test_bailout(self):
        self.assert_blocked(PASS + b'Bail out! worker died\n', 2)

    def test_unknown_output(self):
        self.assert_blocked(PASS + b'garbled output\n')

    def test_truncated_diagnostic(self):
        self.assert_blocked(b'TAP version 13\nok 1 - alpha\n  ---\n  duration_ms: 1\n1..1\n')

    def test_crashed_runner(self):
        self.assert_blocked(b'TAP version 13\n# Subtest: alpha\n', 11)

    def test_signal_runner(self):
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, b'', -15, stale=True)
            self.assertEqual(code, 143)
            self.assertIsNone(report)

    def test_launch_error(self):
        self.assert_blocked(b'', error=FileNotFoundError('synthetic missing runner'))

    def test_invalid_utf8(self):
        self.assert_blocked(PASS + b'\xff\n')

    def test_stale_report_replaced(self):
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, stale=True)
            self.assertEqual(code, 0)
            self.assertNotIn('old-success', report)

    def test_ids_stable_across_number_changes(self):
        extended = PASS.replace(b'ok 1 - alpha', b'ok 2 - alpha').replace(b'ok 2 - beta', b'ok 3 - beta').replace(b'1..2', b'1..3').replace(b'# tests 2', b'# tests 3').replace(b'# pass 2', b'# pass 3')
        extended = extended.replace(b'TAP version 13\n', b'TAP version 13\nok 1 - inserted\n')
        for adapter in ADAPTERS:
            _, old, _ = self.invoke(adapter)
            code, new, _ = self.invoke(adapter, extended)
            self.assertEqual(code, 0)
            self.assertTrue(old.keys() <= new.keys())

    def test_nested_cases_and_diagnostics(self):
        tap = b'TAP version 13\n# Subtest: parent\n    # Subtest: child\n    ok 1 - child\n      ---\n      duration_ms: 1\n      ...\n    1..1\nok 1 - parent\n  ---\n  duration_ms: 2\n  type: suite\n  ...\n1..1\n# tests 1\n# suites 1\n# pass 1\n# fail 0\n'
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, tap)
            self.assertEqual(code, 0)
            self.assertEqual(report, {'parent/child': 'pass', 'parent': 'pass'})
            self.assertTrue(all(value == 'pass' for value in report.values()))

    def test_truncated_child_plan(self):
        self.assert_blocked(b'TAP version 13\n# Subtest: parent\n    ok 1 - child\nok 1 - parent\n1..1\n')

    def test_nested_failure_and_same_child_in_distinct_parents(self):
        tap = b'TAP version 13\n# Subtest: first\n    ok 1 - child\n    1..1\nok 1 - first\n# Subtest: second\n    not ok 1 - child\n    1..1\nnot ok 2 - second\n1..2\n'
        for adapter in ADAPTERS:
            code, report, _ = self.invoke(adapter, tap, 1)
            self.assertEqual(code, 1)
            self.assertEqual(report, {'first/child': 'pass', 'first': 'pass', 'second/child': 'fail', 'second': 'fail'})

    def test_nested_count_mismatch(self):
        self.assert_blocked(b'TAP version 13\n# Subtest: parent\n    ok 1 - child\n    1..2\nok 1 - parent\n1..1\n')

    def test_publication_failure(self):
        for adapter in ADAPTERS:
            for runner_exit in (0, 9):
                code, report, _ = self.invoke(adapter, runner_exit=runner_exit, stale=True, publication_error=True)
                self.assertNotEqual(code, 0)
                if runner_exit:
                    self.assertEqual(code, runner_exit)
                self.assertIsNone(report)
