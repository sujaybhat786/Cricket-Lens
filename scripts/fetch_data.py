#!/usr/bin/env python3
"""Download Cricsheet JSON data and select the N most recent matches into data/raw.

Usage:
    python3 scripts/fetch_data.py [--league ipl] [--count 45]

Leagues map to Cricsheet download zips (https://cricsheet.org/downloads/).
Re-run any time to refresh the dataset, then run `npm run data` to rebuild.
"""
import argparse
import io
import json
import os
import shutil
import sys
import urllib.request
import zipfile

LEAGUES = {
    "ipl": "https://cricsheet.org/downloads/ipl_json.zip",
    "bbl": "https://cricsheet.org/downloads/bbl_json.zip",
    "psl": "https://cricsheet.org/downloads/psl_json.zip",
    "t20is": "https://cricsheet.org/downloads/t20s_json.zip",
    "recent": "https://cricsheet.org/downloads/recently_added_7_json.zip",
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="ipl", choices=LEAGUES.keys())
    ap.add_argument("--count", type=int, default=45, help="most recent N matches to keep")
    args = ap.parse_args()

    url = LEAGUES[args.league]
    raw_dir = os.path.join(ROOT, "data", "raw")
    print(f"Downloading {url} ...")
    with urllib.request.urlopen(url) as resp:
        buf = io.BytesIO(resp.read())

    zf = zipfile.ZipFile(buf)
    names = [n for n in zf.namelist() if n.endswith(".json")]
    dated = []
    for n in names:
        try:
            info = json.loads(zf.read(n))["info"]
            dated.append((info["dates"][0], n))
        except Exception as e:
            print(f"  skipping {n}: {e}", file=sys.stderr)
    dated.sort(reverse=True)
    keep = dated[: args.count]

    if os.path.isdir(raw_dir):
        shutil.rmtree(raw_dir)
    os.makedirs(raw_dir)
    for _, n in keep:
        with open(os.path.join(raw_dir, os.path.basename(n)), "wb") as f:
            f.write(zf.read(n))
    print(f"Kept {len(keep)} matches: {keep[-1][0]} -> {keep[0][0]} in {raw_dir}")
    print("Now run: npm run data")


if __name__ == "__main__":
    main()
