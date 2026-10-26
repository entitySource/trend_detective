"""Fetch and regrid Tier 1 datasets to 0.5° monthly fields (resumable).

    python scripts/fetch.py tws aod t2m      # specific variables
    python scripts/fetch.py all              # all five Tier 1 variables
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.fetch import ROUTE_OF, assemble, fetch  # noqa: E402

if __name__ == "__main__":
    names = list(ROUTE_OF) if sys.argv[1:] in ([], ["all"]) else sys.argv[1:]
    for name in names:
        t0 = time.time()
        print(f"== {name}", flush=True)
        fetch(name)
        out = assemble(name)
        print(f"== {name} done in {(time.time() - t0) / 60:.1f} min -> {out}", flush=True)
