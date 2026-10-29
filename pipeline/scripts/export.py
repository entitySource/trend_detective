"""Compute real trends from data/interim and write the web app's data files (replaces the mock).

    python scripts/export.py                         # every fetched variable, all five seasons
    python scripts/export.py --vars aod tws --seasons ANN JJA --out ../data/export-test
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.export import SEASONS, export_all  # noqa: E402

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "data"

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--vars", nargs="+")
    ap.add_argument("--seasons", nargs="+", default=list(SEASONS))
    args = ap.parse_args()
    # Build next to the target, then swap, so the app never sees a half-written folder.
    tmp = args.out.with_name(args.out.name + ".building")
    if tmp.exists():
        shutil.rmtree(tmp)
    t0 = time.time()
    manifest = export_all(tmp, args.vars, tuple(args.seasons))
    if args.out.exists():
        shutil.rmtree(args.out)
    tmp.rename(args.out)
    size = sum(f.stat().st_size for f in args.out.rglob("*") if f.is_file()) / 1e6
    print(f"Real data for {len(manifest['variables'])} variables x {len(args.seasons)} seasons -> {args.out} ({size:.1f} MB, {(time.time() - t0) / 60:.1f} min)")
