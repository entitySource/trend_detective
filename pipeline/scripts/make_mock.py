"""Write mock contract data into web/public/data so the front-end can run without real data.

    python scripts/make_mock.py                 # ANN + JJA
    python scripts/make_mock.py --seasons ANN DJF MAM JJA SON
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.mock import generate  # noqa: E402

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "data"

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--seasons", nargs="+", default=["ANN", "JJA"])
    args = ap.parse_args()
    if args.out.exists():
        shutil.rmtree(args.out)
    manifest = generate(args.out, tuple(args.seasons))
    size = sum(f.stat().st_size for f in args.out.rglob("*") if f.is_file()) / 1e6
    print(f"Mock data for {len(manifest['variables'])} variables x {len(args.seasons)} seasons -> {args.out} ({size:.1f} MB)")
