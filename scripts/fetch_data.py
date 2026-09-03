#!/usr/bin/env python3
"""Download Cricsheet JSON data and select matches into data/raw.

Usage:
    python3 scripts/fetch_data.py --league ipl --count 45
    python3 scripts/fetch_data.py --league tests --full-members-only --since 2015-01-01
    python3 scripts/fetch_data.py --league odis  --full-members-only --since 2015-01-01 --merge
    python3 scripts/fetch_data.py --league t20is --full-members-only --since 2015-01-01 --merge

Leagues map to Cricsheet download zips (https://cricsheet.org/downloads/).
Re-run any time to refresh the dataset, then run `npm run etl` to rebuild.

All LEAGUES URLs below were verified returning HTTP 200 on 2026-09-04, including
"tests" and "odis" which follow the same {code}_json.zip convention.
"""
import argparse
import datetime
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile

LEAGUES = {
    "ipl": "https://cricsheet.org/downloads/ipl_json.zip",
    "bbl": "https://cricsheet.org/downloads/bbl_json.zip",
    "psl": "https://cricsheet.org/downloads/psl_json.zip",
    "t20is": "https://cricsheet.org/downloads/t20s_json.zip",
    "recent": "https://cricsheet.org/downloads/recently_added_7_json.zip",
    "tests": "https://cricsheet.org/downloads/tests_json.zip",
    "odis": "https://cricsheet.org/downloads/odis_json.zip",
}

# ICC Full Member nations as they appear in Cricsheet's info.teams field.
# A match is "full-members-only" if BOTH teams are in this set.
FULL_MEMBERS = {
    "India", "Australia", "England", "South Africa", "New Zealand",
    "West Indies", "Pakistan", "Sri Lanka", "Bangladesh", "Afghanistan",
    "Ireland", "Zimbabwe",
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def download(url):
    """Fetch a URL. Falls back to curl: macOS python.org builds frequently ship
    without a configured SSL trust store and fail urllib with
    CERTIFICATE_VERIFY_FAILED, which is the case on this machine."""
    try:
        with urllib.request.urlopen(url) as resp:
            return io.BytesIO(resp.read())
    except Exception as e:
        print(f"  urllib failed ({e.__class__.__name__}); falling back to curl")
        try:
            out = subprocess.run(["curl", "-fsSL", url], check=True, capture_output=True).stdout
            return io.BytesIO(out)
        except Exception as e2:
            print(f"FAILED to download {url}: {e2}", file=sys.stderr)
            print("Check https://cricsheet.org/downloads/ for the exact current zip "
                  "name and update the LEAGUES dict.", file=sys.stderr)
            sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="ipl", choices=LEAGUES.keys())
    ap.add_argument("--count", type=int, default=None,
                    help="keep only the N most recent matches (default: keep all matches "
                         "passing --since/--full-members-only)")
    ap.add_argument("--since", type=str, default=None,
                    help="only keep matches on/after YYYY-MM-DD. Cricsheet's ball-by-ball "
                         "coverage effectively starts ~2002 for men's cricket regardless.")
    ap.add_argument("--full-members-only", action="store_true",
                    help="internationals only: keep matches where both teams are ICC Full "
                         "Members. No effect on --league ipl.")
    ap.add_argument("--merge", action="store_true",
                    help="add to data/raw instead of replacing it, for back-to-back runs")
    args = ap.parse_args()

    since_date = datetime.date.fromisoformat(args.since) if args.since else None
    url = LEAGUES[args.league]
    raw_dir = os.path.join(ROOT, "data", "raw")
    print(f"Downloading {url} ...")
    zf = zipfile.ZipFile(download(url))
    names = [n for n in zf.namelist() if n.endswith(".json")]

    dated, skipped_fm, skipped_old = [], 0, 0
    for n in names:
        try:
            info = json.loads(zf.read(n))["info"]
            match_date = datetime.date.fromisoformat(info["dates"][0])
            teams = info.get("teams", [])
            if args.full_members_only and args.league != "ipl":
                if not (len(teams) == 2 and all(t in FULL_MEMBERS for t in teams)):
                    skipped_fm += 1
                    continue
            if since_date and match_date < since_date:
                skipped_old += 1
                continue
            dated.append((info["dates"][0], n))
        except Exception as e:
            print(f"  skipping {n}: {e}", file=sys.stderr)

    dated.sort(reverse=True)
    keep = dated[: args.count] if args.count else dated

    if os.path.isdir(raw_dir) and not args.merge:
        shutil.rmtree(raw_dir)
    os.makedirs(raw_dir, exist_ok=True)
    for _, n in keep:
        with open(os.path.join(raw_dir, os.path.basename(n)), "wb") as f:
            f.write(zf.read(n))

    print(f"[{args.league}] scanned {len(names)} | kept {len(keep)}"
          + (f" ({keep[-1][0]} -> {keep[0][0]})" if keep else ""))
    if args.full_members_only:
        print(f"  filtered out {skipped_fm} non-Full-Member matches")
    if since_date:
        print(f"  filtered out {skipped_old} matches before {args.since}")
    print(f"  data/raw now holds {len(os.listdir(raw_dir))} files")


if __name__ == "__main__":
    main()
