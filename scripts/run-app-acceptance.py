#!/usr/bin/env python3
"""Run production HTTP tests and publish their TAP-derived report."""

from pathlib import Path
import runpy


if __name__ == "__main__":
    adapter = runpy.run_path(str(Path(__file__).with_name("run-app-tap.py")))
    raise SystemExit(adapter["main"]("acceptance"))
