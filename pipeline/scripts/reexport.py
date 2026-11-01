"""Re-export some variables in place, keeping the rest of an existing export: their maps, grids and regional series,
their manifest entries, contrasts and ranking rows, then the validation checks.

    python scripts/reexport.py t2m soil      # into web/public/data (stop the dev server first on Windows)
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.contract import write_json  # noqa: E402
from td.export import config, export_variable, finish_ranking, write_validation  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "data"

if __name__ == "__main__":
    vids = sys.argv[1:]
    cfg = config()
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    contrasts = [c for c in json.loads((OUT / "contrasts.json").read_text(encoding="utf-8")) if c["variable"] not in vids]
    ranking = json.loads((OUT / "ranking.json").read_text(encoding="utf-8"))
    for seasons in ranking.values():
        for season, items in seasons.items():
            seasons[season] = [it for it in items if it["variable"] not in vids]
    for vid in vids:
        t0 = time.time()
        r = export_variable(vid, cfg[vid], OUT, manifest["grid"], manifest["seasons"])
        manifest["variables"] = [r["entry"] if v["id"] == vid else v for v in manifest["variables"]]
        contrasts += r["contrasts"]
        for rid, by_season in r["ranking"].items():
            for season, items in by_season.items():
                ranking.setdefault(rid, {}).setdefault(season, []).extend(items)
        print(f"== {vid} done in {(time.time() - t0) / 60:.1f} min", flush=True)
    finish_ranking(ranking)
    write_json(OUT / "contrasts.json", contrasts, "contrasts")
    write_json(OUT / "ranking.json", ranking, "ranking")
    write_validation(OUT)
    write_json(OUT / "manifest.json", manifest, "manifest")
