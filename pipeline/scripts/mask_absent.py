"""Apply td.export.mask_absent to an existing export: blank the cells where sea ice or snow is never or always there,
recompute FDR, colour range, map images and significant-area numbers for those variables. A fresh export already does
this.

    python scripts/mask_absent.py            # web/public/data
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.colors import classes, ramp  # noqa: E402
from td.contract import lat_lon, read_grid, write_grid, write_json  # noqa: E402
from td.export import ALPHA, DISPLAY, PRESENT_RANGE, _png, config, mask_absent, sig_layers, yearly_anomalies  # noqa: E402

OUT = Path(sys.argv[1]) if sys.argv[1:] else Path(__file__).resolve().parents[2] / "web" / "public" / "data"

if __name__ == "__main__":
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    grid = manifest["grid"]
    lats, _ = lat_lon(grid)
    cfg = config()
    for v in manifest["variables"]:
        vid = v["id"]
        if vid not in PRESENT_RANGE:
            continue
        palette = cfg.get(vid, {}).get("palette") or DISPLAY.get(vid, {}).get("palette", "warm")
        clim = yearly_anomalies(vid)[3]
        vmax = None
        # The first season sets the colour range, as in td.export.export_variable.
        for season in manifest["seasons"]:
            layer = v["layers"][season]
            f = mask_absent(read_grid(OUT / layer["grid"], grid), vid, clim)
            if vmax is None:
                finite = np.abs(f["slope"][np.isfinite(f["slope"])])
                vmax = float(np.percentile(finite, 98)) if finite.size else 1.0
            write_grid(OUT / layer["grid"], f)
            _png(OUT / layer["slope"], ramp(f["slope"], -vmax, vmax, palette), grid)
            _png(OUT / layer["class"], classes(f["slope"], f["q"], ALPHA, palette), grid)
            layer["sigArea"] = sig_layers(f, lats, palette, OUT, layer["raw"], grid)
        v["colorRange"] = [-vmax, vmax]
        print(vid, "range ±%.3g" % vmax, v["layers"]["ANN"]["sigArea"], flush=True)
    write_json(OUT / "manifest.json", manifest, "manifest")
