"""Regenerate everything the app shows, from NASA servers to web/public/data, in one command.

    python scripts/run_all.py                # fetch (resumes from cache) + export all 15 variables
    python scripts/run_all.py --skip-fetch   # recompute from data/interim only (~90 min)

Needs an Earthdata login in ~/.netrc (or _netrc on Windows) for the fetch step. A full fetch from
scratch takes several hours; cached months in data/interim/{var}/ are skipped. Stop the web dev server
first: on Windows its file watcher blocks the final folder swap.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
# The static site must stay deployable on free static hosting.
SIZE_BUDGET_MB = 500


def step(name: str, *args: str) -> None:
    t0 = time.time()
    print(f"\n### {name}", flush=True)
    subprocess.run([sys.executable, "-W", "ignore", "-u", str(HERE / args[0]), *args[1:]], check=True)
    print(f"### {name} done in {(time.time() - t0) / 60:.1f} min", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skip-fetch", action="store_true")
    args = ap.parse_args()
    t0 = time.time()
    if not args.skip_fetch:
        step("Fetch and regrid", "fetch.py", "all")
    step("Trends, maps, regions, checks", "export.py")

    out = HERE.parents[1] / "web" / "public" / "data"
    files = [f for f in out.rglob("*") if f.is_file()]
    size = sum(f.stat().st_size for f in files) / 1e6
    biggest = max(files, key=lambda f: f.stat().st_size)
    print(f"\nTotal {(time.time() - t0) / 60:.0f} min. Output {size:.0f} MB (budget {SIZE_BUDGET_MB} MB); largest file {biggest.name} {biggest.stat().st_size / 1e6:.1f} MB.")
    if size > SIZE_BUDGET_MB:
        sys.exit(f"Over the {SIZE_BUDGET_MB} MB size budget.")
