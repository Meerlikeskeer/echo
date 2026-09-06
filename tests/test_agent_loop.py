import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('loop', Path(__file__).resolve().parents[1] / 'scripts/agent_loop.py')
loop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loop)


class LoopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'repo'
        self.root.mkdir()
        self.evidence = Path(self.temp.name) / 'evidence'
        self.evidence.mkdir()
        (self.root / 'agents').mkdir()
        for role in ('builder', 'checker'):
            (self.root / 'agents' / (role + '.md')).write_text(role)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], cwd=self.root, check=True)
        self.config = {'ready': True, 'protected': ['tests/**/*'], 'checks': [
            {'id': k, 'kind': k, 'argv': ['fake', '{report}']} for k in sorted(loop.REQUIRED)]}
        self.calls = []

    def agent(self, root, role, prompt, run_dir, cycle, timeout):
        self.calls.append((role, cycle))
        return 'implemented' if role == 'builder' else json.dumps({'goal_met': True, 'findings': []})

    def results(self, failure=None):
        return {k: {'exit_code': 1 if k == failure else 0} for k in loop.REQUIRED}

    def invoke(self, outcomes, agent=None):
        iterator = iter(outcomes)
        return loop.run(self.root, self.config, 'goal', self.evidence, agent_fn=agent or self.agent,
                        check_fn=lambda *args: next(iterator))

    def test_green_after_builder_and_independent_checker(self):
        result = self.invoke([self.results(), self.results()])
        self.assertEqual(result['status'], 'green')
        self.assertEqual(self.calls, [('builder', 1), ('checker', 1)])

    def test_fix_then_green(self):
        result = self.invoke([self.results('test'), self.results('test'), self.results()])
        self.assertEqual((result['status'], result['cycles']), ('green', 2))

    def test_five_attempt_limit(self):
        result = self.invoke([self.results('test')] * 6)
        self.assertEqual((result['status'], result['cycles']), ('cycle_limit', 5))
        self.assertEqual(len([x for x in self.calls if x[0] == 'builder']), 5)

    def test_baseline_regression_stops_before_review(self):
        result = self.invoke([self.results(), self.results('lint')])
        self.assertEqual(result['status'], 'regression')
        self.assertEqual(self.calls, [('builder', 1)])

    def test_newly_passing_check_is_remembered(self):
        base = self.results('test'); base['lint']['exit_code'] = 1
        result = self.invoke([base, self.results('test'), base])
        self.assertEqual((result['status'], result['cycles']), ('regression', 2))

    def test_per_case_regression_inside_failing_suite(self):
        previous = {'test': {'exit_code': 1, 'cases': {'old': 'fail', 'other': 'pass'}}}
        current = {'test': {'exit_code': 1, 'cases': {'old': 'pass', 'other': 'fail'}}}
        self.assertEqual(loop.decision(loop.passing(previous), current), ('regression', ['test::other']))

    def test_missing_previously_passing_case_regresses(self):
        self.assertEqual(loop.decision({'test::gone'}, {'test': {'exit_code': 0, 'cases': {'kept': 'pass'}}})[0], 'regression')

    def test_no_scaffold_blocks(self):
        self.config['ready'] = False
        with self.assertRaises(ValueError):
            loop.validate(self.config)

    def test_protected_mutation_blocks(self):
        def mutate(*args):
            (self.root / 'agents/builder.md').write_text('weakened')
            return 'done'
        result = self.invoke([self.results()], mutate)
        self.assertEqual(result['status'], 'blocked')

    def test_bad_review_blocks(self):
        result = self.invoke([self.results(), self.results()], lambda *args: 'invalid')
        self.assertEqual(result['status'], 'blocked')

    def test_goal_not_met_never_green(self):
        result = self.invoke([self.results()] * 6, lambda *args: json.dumps({'goal_met': False, 'findings': ['Missing requirement']}))
        self.assertEqual(result['status'], 'cycle_limit')

    def test_launch_failure_and_timeout(self):
        result = loop.execute(['/nonexistent/echo-test-tool'], self.root, self.root / 'missing.log', 1)
        self.assertIsNone(result['exit_code'])
        result = loop.execute(['python3', '-c', 'import time; time.sleep(10)'], self.root, self.root / 'timeout.log', .05)
        self.assertEqual(result['error'], 'timeout')

    def test_real_checker_reads_individual_results(self):
        checks = [{'id': 'test', 'kind': 'test', 'argv': ['python3', '-c',
            'import pathlib,sys;pathlib.Path(sys.argv[1]).write_text(\'{"case": "pass"}\')', '{report}']}]
        result = loop.check(self.root, checks, self.root, 1, 2, set())
        self.assertEqual(loop.passing(result), {'test', 'test::case'})

    def test_unexecuted_checks_are_not_reported_as_regressions(self):
        state, failed = loop.decision({'test', 'lint', 'typecheck'}, {'test': {'exit_code': 1}})
        self.assertEqual((state, failed), ('regression', ['test']))

    def test_checker_cannot_edit_source(self):
        def mutate(root, role, *args):
            if role == 'checker':
                (root / 'app.ts').write_text('unexpected edit')
                return json.dumps({'goal_met': True, 'findings': []})
            return 'implemented'
        result = self.invoke([self.results(), self.results()], mutate)
        self.assertEqual(result['status'], 'blocked')

    def test_missing_test_report_blocks(self):
        checks = [{'id': 'test', 'kind': 'test', 'argv': ['python3', '-c', 'pass']}]
        result = loop.check(self.root, checks, self.root, 1, 2, set())
        self.assertIsNone(result['test']['exit_code'])


if __name__ == '__main__':
    unittest.main()
