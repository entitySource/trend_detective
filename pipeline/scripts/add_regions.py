"""Recompute the regional series (regions/{var}.json, regions/index.json, ranking.json) for every box in
td/regions.py, without redoing the maps. Use after adding a site; takes minutes instead of the full export.

    python scripts/add_regions.py            # web/public/data
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td import regions as R  # noqa: E402
from td.contract import lat_lon, read_grid, write_json  # noqa: E402
from td.export import YEARS, config, ranking_row, region_series, season_cube, yearly_anomalies  # noqa: E402

OUT = Path(sys.argv[1]) if sys.argv[1:] else Path(__file__).resolve().parents[2] / "web" / "public" / "data"

if __name__ == "__main__":
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    grid = manifest["grid"]
    lats, lons = lat_lon(grid)
    masks = {rid: R.box_mask(lats, lons, bbox) for rid, _, bbox in R.BOXES}
    ranking: dict = {}
    cfg = config()
    for v in manifest["variables"]:
        vid = v["id"]
        anoms, years, months, clim = yearly_anomalies(vid)
        keep = YEARS >= int(cfg[vid].get("start_year", YEARS[0]))  # same year axis as td.export.export_variable
        rows = {rid: {"id": rid, "seasons": {}} for rid in masks}
        for season, layer in v["layers"].items():
            full = season_cube(anoms, years, months, season)[keep]
            f = read_grid(OUT / layer["grid"], grid)
            for rid, m in masks.items():
                series, stats = region_series(full, clim, lats, m, vid, YEARS[keep])
                rows[rid]["seasons"][season] = {"values": series.tolist(), "stats": stats}
                row = ranking_row(f, m, vid, stats)
                if row:
                    ranking.setdefault(rid, {}).setdefault(season, []).append(row)
        write_json(OUT / v["regions"], {"variable": vid, "years": YEARS[keep].tolist(), "regions": list(rows.values())}, "regions")
        print(vid, flush=True)
    # Same finishing as td.export.main.
    for seasons in ranking.values():
        for items in seasons.values():
            for it in items:
                it["mixed"] = it["pctRising"] > 10 and it["pctFalling"] > 10
            items.sort(key=lambda it: -(it["pctRising"] + it["pctFalling"]))
    write_json(OUT / "regions/index.json", R.index(), "regions-index")
    write_json(OUT / "ranking.json", ranking, "ranking")
