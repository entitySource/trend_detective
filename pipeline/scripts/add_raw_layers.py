"""Backfill the uncorrected-significance layer (raw.png) and sigArea into an existing export, from its grids.

    python scripts/add_raw_layers.py            # web/public/data
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.contract import lat_lon, read_grid, write_json  # noqa: E402
from td.export import DISPLAY, config, sig_layers  # noqa: E402

OUT = Path(sys.argv[1]) if sys.argv[1:] else Path(__file__).resolve().parents[2] / "web" / "public" / "data"

if __name__ == "__main__":
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    grid = manifest["grid"]
    lats, _ = lat_lon(grid)
    cfg = config()
    for v in manifest["variables"]:
        palette = cfg.get(v["id"], {}).get("palette") or DISPLAY.get(v["id"], {}).get("palette", "warm")
        for season, layer in v["layers"].items():
            f = read_grid(OUT / layer["grid"], grid)
            layer["raw"] = f"layers/{v['id']}/{season}/raw.png"
            layer["sigArea"] = sig_layers(f, lats, palette, OUT, layer["raw"], grid)
        print(v["id"], v["layers"]["ANN"]["sigArea"])
    write_json(OUT / "manifest.json", manifest, "manifest")
