"""Day-1 dataset check (PLAN-02 Phase 0). Uses NASA's public CMR search API: no login needed.

For each product in config/variables.yaml: does the collection exist, and how many monthly granules
fall in the analysis window? Also checks that the validation CSVs are reachable.

    python scripts/check_datasets.py
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

CMR = "https://cmr.earthdata.nasa.gov/search"
CONFIG = Path(__file__).resolve().parents[1] / "config" / "variables.yaml"


def months_in(start: str, end: str) -> int:
    (y0, m0), (y1, m1) = (map(int, s.split("-")) for s in (start, end))
    return (y1 - y0) * 12 + (m1 - m0) + 1


def cmr(path: str, **params: str) -> tuple[dict, dict]:
    url = f"{CMR}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r), dict(r.headers)


def main() -> int:
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    start, end = cfg["window"]["start"], cfg["window"]["end"]
    expected = months_in(start, end)
    temporal = f"{start}-01T00:00:00Z,{end}-31T23:59:59Z"
    ok = True

    print(f"| Tier | Variable | Product | Version | Collection | Coverage | Granules {start}..{end} (expect {expected}) |")
    print("|---|---|---|---|---|---|---|")
    for key, v in cfg["variables"].items():
        feed, _ = cmr("collections.json", short_name=v["product"], version=v["version"])
        entries = feed["feed"]["entry"]
        if not entries:
            print(f"| {v.get('tier', '')} | {key} | {v['product']} | {v['version']} | **NOT FOUND** | | |")
            ok = False
            continue
        c = entries[0]
        _, headers = cmr("granules.json", short_name=v["product"], version=v["version"], temporal=temporal, page_size="0")
        hits = int(headers.get("CMR-Hits", headers.get("cmr-hits", "0")))
        flag = "" if hits == v.get("expected_granules", expected) else " **check**"
        print(f"| {v.get('tier', '')} | {key} | {v['product']} | {v['version']} | {c['id']} | {c.get('time_start', '')[:10]} to {(c.get('time_end') or 'present')[:10]} | {hits}{flag} |")

    for name, url in cfg["validation"].items():
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
                print(f"\n{name}: HTTP {r.status} {url}")
        except Exception as e:  # report and carry on
            print(f"\n{name}: FAILED ({e}) {url}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
