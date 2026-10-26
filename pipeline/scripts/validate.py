"""Run the science checks on the public validation CSVs (no login needed).

    python scripts/validate.py                      # writes data/validation.json
    python scripts/validate.py --sea-ice-published -12.2   # also compare with NSIDC's stated rate
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.validate import ROOT, run  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "validation.json")
    ap.add_argument("--sea-ice-published", type=float, default=None, help="NSIDC's published September trend, %% per decade")
    args = ap.parse_args()
    r = run(args.out, args.sea_ice_published)
    ice, gis = r["seaIce"], r["gistemp"]
    print(f"Sea ice (September, {ice['years']}): OLS {ice['olsPctPerDecade']:.2f} %/decade, Sen {ice['senPctPerDecade']:.2f} %/decade, p={ice['p']:.2g}")
    print(f"GISTEMP global 2003-2025: Sen {gis['senPerDecade']:.3f} C/decade, OLS {gis['olsPerDecade']:.3f}, p={gis['p']:.2g}, n={gis['n']}")
    print(f"Wrote {args.out}")
