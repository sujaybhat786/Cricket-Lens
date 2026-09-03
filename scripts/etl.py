#!/usr/bin/env python3
"""CricLens ETL: data/raw/*.json (Cricsheet) -> data/processed/* static bundles.

Everything computable at build time is computed here. The browser only renders.

Provenance tiers baked into output:
  RECORDED - straight from Cricsheet ball-by-ball data.
  DERIVED  - computed but fully factual (phase splits, win-prob model, indices).
  MODELED  - wagon-wheel directions and pitch-map coordinates are statistical
             reconstructions from priors conditioned on (handedness, bowler
             type, run value, phase, dismissal kind), seeded per delivery id
             so they are stable across builds. Run values / outcomes are real.
"""
import hashlib
import json
import math
import os
import random
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "public", "data", "processed")
META_PATH = os.path.join(ROOT, "scripts", "players_meta.json")

PACE = {"RF", "RM", "LF", "LM"}
SPIN = {"OB", "LB", "SLA", "LWS"}

TEAM_SHORT = {
    "Chennai Super Kings": "CSK", "Delhi Capitals": "DC", "Gujarat Titans": "GT",
    "Kolkata Knight Riders": "KKR", "Lucknow Super Giants": "LSG",
    "Mumbai Indians": "MI", "Punjab Kings": "PBKS", "Rajasthan Royals": "RR",
    "Royal Challengers Bengaluru": "RCB", "Royal Challengers Bangalore": "RCB",
    "Sunrisers Hyderabad": "SRH",
}


def slug(name):
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-").replace("--", "-")


def rng_for(*parts):
    h = hashlib.md5(":".join(str(p) for p in parts).encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def phase_of(over):
    if over < 6:
        return 1  # Powerplay
    if over < 16:
        return 2  # Middle
    return 3  # Death


# ---------------------------------------------------------------- win probability
# Simple DLS-flavoured resource model + logistic. DERIVED, not a broadcast model.
PAR = 175.0


def resources(balls_left, wkts_in_hand):
    if balls_left <= 0 or wkts_in_hand <= 0:
        return 0.0
    return (balls_left / 120.0) ** 0.82 * (wkts_in_hand / 10.0) ** 0.52


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def win_prob_first_innings(runs, balls_bowled, wkts):
    proj = runs + PAR * resources(120 - balls_bowled, 10 - wkts)
    return round(sigmoid((proj - PAR) / 16.0), 4)


def win_prob_chase(target, runs, balls_bowled, wkts, innings_balls=120):
    """Returns P(team batting FIRST wins)."""
    need = target - runs
    if need <= 0:
        return 0.0
    balls_left = innings_balls - balls_bowled
    if balls_left <= 0 or wkts >= 10:
        return 1.0
    available = PAR * resources(balls_left, 10 - wkts)
    p_chase = sigmoid((available - need) / (5.0 + 9.0 * (balls_left / 120.0)))
    return round(1.0 - p_chase, 4)


# ---------------------------------------------------------------- wagon wheel priors
# Field angle convention: batter at centre, bowler's end at 0 degrees (top of the
# drawn field), increasing clockwise. For a RHB the off side is 0..180, leg side
# 180..360. LHB is mirrored at sampling time.
# Sectors (RHB): 0 straight, 1 cover, 2 point, 3 third, 4 fine/keeper,
#                5 square leg, 6 midwicket, 7 long-on.
SECTOR_CENTERS = [0, 45, 90, 135, 180, 225, 270, 315]

WHEEL_WEIGHTS = {
    # (bowlKind, runClass): eight sector weights for a RHB
    ("pace", "rot"):  [10, 12, 13, 9, 8, 12, 14, 10],
    ("pace", "four"): [11, 13, 12, 12, 9, 10, 12, 9],
    ("pace", "six"):  [16, 9, 4, 2, 4, 10, 20, 18],
    ("spin", "rot"):  [10, 12, 11, 7, 6, 14, 15, 11],
    ("spin", "four"): [12, 14, 11, 6, 4, 14, 13, 10],
    ("spin", "six"):  [20, 10, 3, 1, 2, 9, 19, 20],
}
DEATH_BEHIND_SQUARE_BOOST = [0, 0, 3, 6, 7, 5, 0, 0]  # scoops/ramps/edges late


def run_class(rb):
    if rb >= 6:
        return "six"
    if rb >= 4:
        return "four"
    return "rot"


def sample_wheel(rng, rb, bat_hand, bowl_kind, phase):
    w = list(WHEEL_WEIGHTS[(bowl_kind or "pace", run_class(rb))])
    if phase == 3:
        w = [a + b for a, b in zip(w, DEATH_BEHIND_SQUARE_BOOST)]
    sector = rng.choices(range(8), weights=w)[0]
    angle = SECTOR_CENTERS[sector] + rng.uniform(-21, 21)
    if bat_hand == "L":
        angle = (360 - angle) % 360
    if rb >= 6:
        dist = rng.uniform(1.02, 1.14)
    elif rb >= 4:
        dist = 1.0
    elif rb == 3:
        dist = rng.uniform(0.62, 0.88)
    elif rb == 2:
        dist = rng.uniform(0.45, 0.72)
    else:
        dist = rng.uniform(0.22, 0.55)
    return [round(angle % 360, 1), round(dist, 3)]


# ---------------------------------------------------------------- pitch map priors
# line: -1 (well outside leg stump of the facing batter) .. +1 (well outside off),
# 0 = middle stump. length: metres from the batting stumps (1.5 yorker .. 11 short).
def sample_pitch(rng, bowl_kind, outcome, wicket_kind, wheel):
    spin = bowl_kind == "spin"
    good_len = (3.2, 5.4) if spin else (5.5, 8.0)
    line_mu, line_sd = (0.18, 0.28)

    if wicket_kind in ("bowled", "lbw", "hit wicket"):
        length = rng.uniform(1.8, 4.2) if spin else rng.uniform(2.5, 6.0)
        line = rng.gauss(0.02, 0.10)
    elif wicket_kind in ("caught", "caught and bowled", "stumped"):
        if wicket_kind == "stumped":
            length = rng.uniform(2.2, 4.5)
            line = rng.gauss(0.30, 0.22)
        else:
            length = rng.uniform(*good_len) + rng.uniform(0, 1.5)
            line = rng.gauss(0.28, 0.24)
    elif outcome == "six" or outcome == "four":
        angle = wheel[0] if wheel else 0
        behind_square = 90 < angle < 270
        if behind_square and not spin:
            length = rng.uniform(8.5, 10.8)  # short, pulled/hooked/ramped
            line = rng.gauss(0.05, 0.20)
        else:
            length = rng.uniform(2.8, 5.2) if spin else rng.uniform(3.8, 6.2)
            line = rng.gauss(0.22, 0.24)
    elif outcome == "wide":
        line = rng.choice([rng.uniform(0.85, 1.4), rng.uniform(-1.3, -0.75)])
        length = rng.uniform(*good_len)
    elif outcome == "dot":
        length = rng.uniform(*good_len)
        line = rng.gauss(line_mu, line_sd * 0.8)
    else:
        length = rng.uniform(*good_len) + rng.uniform(-0.8, 1.2)
        line = rng.gauss(line_mu, line_sd)
    return [round(max(-1.4, min(1.4, line)), 3), round(max(0.4, min(11.5, length)), 2)]


# ---------------------------------------------------------------- load meta
with open(META_PATH) as f:
    PMETA = json.load(f)["players"]


def p_meta(name):
    m = PMETA.get(name, {})
    return {
        "bat": m.get("bat", "R"),
        "bowl": m.get("bowl"),
        "wk": bool(m.get("wk")),
        "uncertain": m.get("uncertain", name not in PMETA),
    }


def bowl_kind(name):
    b = p_meta(name)["bowl"]
    if b in PACE:
        return "pace"
    if b in SPIN:
        return "spin"
    return None


# ---------------------------------------------------------------- process matches
def process_match(mid, m):
    info = m["info"]
    teams = info["teams"]
    innings_out = []
    target = None
    target_balls = 120
    first_total = None

    for inn_idx, inn in enumerate(m["innings"]):
        team = inn["team"]
        if inn_idx == 1 and "target" in inn:  # D/L revised targets recorded by Cricsheet
            target = inn["target"]["runs"]
            target_balls = int(inn["target"].get("overs", 20) * 6)
        deliveries = []
        cum_runs = 0
        cum_wkts = 0
        legal = 0
        for ov in inn.get("overs", []):
            over_no = ov["over"]
            ball_in_over = 0
            for d in ov["deliveries"]:
                ek = None
                ex = d.get("extras", {})
                for kind in ("wides", "noballs", "byes", "legbyes", "penalty"):
                    if kind in ex:
                        ek = kind
                        break
                is_legal = ek not in ("wides", "noballs")
                if is_legal:
                    ball_in_over += 1
                rb, re_, rt = d["runs"]["batter"], d["runs"]["extras"], d["runs"]["total"]
                cum_runs += rt
                wk = None
                if d.get("wickets"):
                    w0 = d["wickets"][0]
                    if w0["kind"] != "retired hurt":
                        cum_wkts += 1
                    wk = {
                        "kind": w0["kind"],
                        "out": w0["player_out"],
                        "fielders": [f.get("name", "?") for f in w0.get("fielders", [])],
                    }
                if is_legal:
                    legal += 1
                phase = phase_of(over_no)
                bat = d["batter"]
                bwl = d["bowler"]
                bm = p_meta(bat)
                bk = bowl_kind(bwl)

                if inn_idx == 0:
                    wp = win_prob_first_innings(cum_runs, legal, cum_wkts)
                else:
                    wp = win_prob_chase(target or 0, cum_runs, legal, cum_wkts, target_balls)

                rng = rng_for(mid, inn_idx, over_no, ball_in_over, len(deliveries))
                wheel = sample_wheel(rng, rb, bm["bat"], bk, phase) if rb > 0 else None
                if wk:
                    outcome = "wicket"
                elif ek == "wides":
                    outcome = "wide"
                elif rb >= 6:
                    outcome = "six"
                elif rb >= 4:
                    outcome = "four"
                elif rt == 0:
                    outcome = "dot"
                else:
                    outcome = "runs"
                pitch = sample_pitch(rng, bk or "pace", outcome, wk["kind"] if wk else None, wheel)

                deliveries.append({
                    "ov": over_no, "b": ball_in_over,
                    "bat": bat, "bwl": bwl, "ns": d["non_striker"],
                    "rb": rb, "re": re_, "rt": rt, "ek": ek,
                    "wk": wk, "cr": cum_runs, "cw": cum_wkts,
                    "ph": phase, "wp": wp,
                    "wh": wheel, "pm": pitch,
                })
        total = cum_runs
        if inn_idx == 0:
            first_total = total
            target = total + 1
        innings_out.append({
            "team": team,
            "total": total,
            "wickets": cum_wkts,
            "balls": legal,
            "deliveries": deliveries,
        })

    outcome = info.get("outcome", {})
    result = "No result"
    if "winner" in outcome:
        by = outcome.get("by", {})
        if "runs" in by:
            result = f"{outcome['winner']} won by {by['runs']} runs"
        elif "wickets" in by:
            result = f"{outcome['winner']} won by {by['wickets']} wickets"
        else:
            result = f"{outcome['winner']} won"
        if outcome.get("method"):
            result += f" ({outcome['method']})"
    elif "result" in outcome:
        result = outcome["result"].title()
        # A tie decided by a Super Over records the winner under "eliminator",
        # not "winner" — without this the match reads as just "Tie".
        if outcome.get("eliminator"):
            result = f"Match tied — {outcome['eliminator']} won the Super Over"

    return {
        "id": mid,
        "info": {
            "teams": teams,
            "short": [TEAM_SHORT.get(t, t[:3].upper()) for t in teams],
            "venue": info.get("venue", "Unknown"),
            "city": info.get("city", ""),
            "date": info["dates"][0],
            "event": info.get("event", {}).get("name", ""),
            "matchNumber": info.get("event", {}).get("match_number"),
            "stage": info.get("event", {}).get("stage"),
            "toss": info.get("toss", {}),
            "outcome": outcome,
            "result": result,
            "eliminator": outcome.get("eliminator"),
            # Multi-day formats have 4 innings by design; only a limited-overs
            # match with >2 innings has been decided by a Super Over.
            "superOver": len(m["innings"]) > 2
                         and info.get("match_type") not in ("Test", "MDM"),
            "winner": outcome.get("winner"),
            "pom": (info.get("player_of_match") or [None])[0],
            "matchType": info.get("match_type", "T20"),
            "players": info.get("players", {}),
            "firstTotal": first_total,
            "target": target,
            "targetBalls": target_balls,
        },
        "innings": innings_out,
    }


def main():
    os.makedirs(os.path.join(OUT, "matches"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "players"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "teams"), exist_ok=True)

    matches = []
    for fn in sorted(os.listdir(RAW)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(RAW, fn)) as f:
            matches.append(process_match(fn[:-5], json.load(f)))
    matches.sort(key=lambda m: m["info"]["date"], reverse=True)

    # ---------------- matches/index.json + matches/{id}.json
    index = []
    for m in matches:
        i = m["info"]
        index.append({
            "id": m["id"], "teams": i["teams"], "short": i["short"],
            "venue": i["venue"], "city": i["city"], "date": i["date"],
            "matchNumber": i["matchNumber"], "stage": i.get("stage"),
            "result": i["result"], "winner": i["winner"], "pom": i["pom"],
            "scores": [
                {"team": inn["team"], "runs": inn["total"], "wkts": inn["wickets"], "balls": inn["balls"]}
                for inn in m["innings"]
            ],
        })
        with open(os.path.join(OUT, "matches", f"{m['id']}.json"), "w") as f:
            json.dump(m, f, separators=(",", ":"))
    with open(os.path.join(OUT, "matches", "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))

    # ---------------- player dossiers
    bat_balls = defaultdict(list)   # name -> enriched balls faced
    bowl_balls = defaultdict(list)  # name -> enriched balls bowled
    player_teams = defaultdict(set)
    player_matches = defaultdict(set)

    for m in matches:
        mid = m["id"]
        for t, ps in m["info"]["players"].items():
            for p in ps:
                player_teams[p].add(t)
                player_matches[p].add(mid)
        for inn_idx, inn in enumerate(m["innings"]):
            bowling_team = [t for t in m["info"]["teams"] if t != inn["team"]]
            bt = bowling_team[0] if bowling_team else ""
            for d in inn["deliveries"]:
                ball = dict(d)
                ball["m"] = mid
                ball["inn"] = inn_idx
                ball["batTeam"] = inn["team"]
                bat_balls[d["bat"]].append(ball)
                bowl_balls[d["bwl"]].append(ball)
                player_teams[d["bwl"]].add(bt)

    def agg_batting(balls):
        runs = sum(b["rb"] for b in balls)
        faced = [b for b in balls if b["ek"] != "wides"]
        n = len(faced)
        outs = sum(1 for b in balls if b["wk"] and b["wk"]["out"] == b["bat"]
                   and b["wk"]["kind"] not in ("run out", "retired hurt", "retired out", "obstructing the field"))
        outs_all = sum(1 for b in balls if b["wk"] and b["wk"]["out"] == b["bat"] and b["wk"]["kind"] != "retired hurt")
        fours = sum(1 for b in balls if b["rb"] >= 4 and b["rb"] < 6)
        sixes = sum(1 for b in balls if b["rb"] >= 6)
        dots = sum(1 for b in faced if b["rt"] == 0)
        return {
            "runs": runs, "balls": n, "outs": outs_all, "bowlerOuts": outs,
            "sr": round(100 * runs / n, 1) if n else None,
            "avg": round(runs / outs_all, 1) if outs_all else None,
            "boundaryPct": round(100 * (fours + sixes) / n, 1) if n else None,
            "dotPct": round(100 * dots / n, 1) if n else None,
            "fours": fours, "sixes": sixes,
        }

    def agg_bowling(balls):
        legal = [b for b in balls if b["ek"] not in ("wides", "noballs")]
        n = len(legal)
        runs = sum(b["rb"] + (b["re"] if b["ek"] in ("wides", "noballs") else 0) for b in balls)
        wkts = sum(1 for b in balls if b["wk"] and b["wk"]["kind"] not in
                   ("run out", "retired hurt", "retired out", "obstructing the field"))
        dots = sum(1 for b in legal if b["rt"] == 0)
        bnd = sum(1 for b in balls if b["rb"] >= 4)
        return {
            "balls": n, "runs": runs, "wkts": wkts,
            "econ": round(6 * runs / n, 2) if n else None,
            "sr": round(n / wkts, 1) if wkts else None,
            "avg": round(runs / wkts, 1) if wkts else None,
            "dotPct": round(100 * dots / n, 1) if n else None,
            "boundaryPct": round(100 * bnd / n, 1) if n else None,
        }

    all_players = sorted(set(list(bat_balls) + list(bowl_balls) + list(player_teams)))
    players_index = []
    comp_bat = agg_batting([b for bs in bat_balls.values() for b in bs])

    # competition acceleration curve (ghost line): SR by balls-at-crease bucket
    def innings_of(balls):
        by = defaultdict(list)
        for b in balls:
            by[(b["m"], b["inn"])].append(b)
        return list(by.values())

    def acceleration(balls, bucket=10, nbuckets=6):
        out = []
        inns = innings_of(balls)
        for k in range(nbuckets):
            r = n = 0
            for inn in inns:
                faced = [b for b in inn if b["ek"] != "wides"]
                seg = faced[k * bucket:(k + 1) * bucket]
                r += sum(b["rb"] for b in seg)
                n += len(seg)
            out.append({"bucket": f"{k*bucket+1}-{(k+1)*bucket}", "sr": round(100*r/n, 1) if n >= 10 else None, "balls": n})
        return out

    comp_accel = acceleration([b for bs in bat_balls.values() for b in bs])

    for name in all_players:
        pid = slug(name)
        meta = p_meta(name)
        bb = bat_balls.get(name, [])
        wb = bowl_balls.get(name, [])
        bat_a = agg_batting(bb)
        bowl_a = agg_bowling(wb)
        role = "allrounder" if bat_a["balls"] >= 30 and bowl_a["balls"] >= 30 else \
               ("bowler" if bowl_a["balls"] > bat_a["balls"] else
                ("wk-batter" if meta["wk"] else "batter"))

        def split(balls, key):
            groups = defaultdict(list)
            for b in balls:
                groups[key(b)].append(b)
            return groups

        bat_phase = {str(ph): agg_batting(g) for ph, g in split(bb, lambda b: b["ph"]).items()}
        bowl_phase = {str(ph): agg_bowling(g) for ph, g in split(wb, lambda b: b["ph"]).items()}
        bat_vs_kind = {k or "unknown": agg_batting(g) for k, g in split(bb, lambda b: bowl_kind(b["bwl"])).items()}
        bat_vs_type = {k or "unknown": agg_batting(g) for k, g in split(bb, lambda b: p_meta(b["bwl"])["bowl"]).items()}
        bowl_vs_hand = {k: agg_bowling(g) for k, g in split(wb, lambda b: p_meta(b["bat"])["bat"]).items()}

        dismissals = defaultdict(int)
        for b in bb:
            if b["wk"] and b["wk"]["out"] == name and b["wk"]["kind"] != "retired hurt":
                dismissals[b["wk"]["kind"]] += 1
        wicket_kinds = defaultdict(int)
        for b in wb:
            if b["wk"] and b["wk"]["kind"] not in ("run out", "retired hurt", "retired out", "obstructing the field"):
                wicket_kinds[b["wk"]["kind"]] += 1

        # innings list
        inns = []
        for key_balls in innings_of(bb):
            faced = [b for b in key_balls if b["ek"] != "wides"]
            runs = sum(b["rb"] for b in key_balls)
            out_ball = next((i for i, b in enumerate(faced)
                             if b["wk"] and b["wk"]["out"] == name and b["wk"]["kind"] != "retired hurt"), None)
            inns.append({
                "m": key_balls[0]["m"], "inn": key_balls[0]["inn"], "team": key_balls[0]["batTeam"],
                "runs": runs, "balls": len(faced), "out": out_ball is not None,
                "prog": [b["rb"] for b in faced],
            })
        inns.sort(key=lambda x: x["m"], reverse=True)

        # batter matchup vs specific bowlers (>=6 balls)
        vs_bowlers = []
        for bwl, g in split(bb, lambda b: b["bwl"]).items():
            a = agg_batting(g)
            if a["balls"] >= 6:
                vs_bowlers.append({"name": bwl, "type": p_meta(bwl)["bowl"], **a})
        vs_bowlers.sort(key=lambda x: -x["balls"])

        vs_batters = []
        for bat, g in split(wb, lambda b: b["bat"]).items():
            a = agg_bowling(g)
            if a["balls"] >= 6:
                vs_batters.append({"name": bat, "hand": p_meta(bat)["bat"], **a})
        vs_batters.sort(key=lambda x: -x["balls"])

        dossier = {
            "id": pid, "name": name, "teams": sorted(t for t in player_teams[name] if t),
            "meta": meta, "role": role,
            "matches": len(player_matches[name]) or len(set(b["m"] for b in bb + wb)),
            "batting": {
                "overall": bat_a, "phase": bat_phase, "vsKind": bat_vs_kind, "vsType": bat_vs_type,
                "dismissals": dict(dismissals),
                "dismissalPhase": {str(ph): sum(1 for b in g if b["wk"] and b["wk"]["out"] == name)
                                   for ph, g in split(bb, lambda b: b["ph"]).items()},
                "acceleration": acceleration(bb),
                "innings": inns, "vsBowlers": vs_bowlers,
            },
            "bowling": {
                "overall": bowl_a, "phase": bowl_phase, "vsHand": bowl_vs_hand,
                "wicketKinds": dict(wicket_kinds), "vsBatters": vs_batters,
            },
            "balls": {"bat": bb, "bowl": wb},
        }
        with open(os.path.join(OUT, "players", f"{pid}.json"), "w") as f:
            json.dump(dossier, f, separators=(",", ":"))

        players_index.append({
            "id": pid, "name": name, "teams": sorted(t for t in player_teams[name] if t),
            "role": role, "bat": meta["bat"], "bowl": meta["bowl"], "wk": meta["wk"],
            "uncertain": meta["uncertain"], "matches": dossier["matches"],
            "runs": bat_a["runs"], "ballsFaced": bat_a["balls"], "sr": bat_a["sr"],
            "wkts": bowl_a["wkts"], "ballsBowled": bowl_a["balls"], "econ": bowl_a["econ"],
        })

    with open(os.path.join(OUT, "players", "index.json"), "w") as f:
        json.dump(players_index, f, separators=(",", ":"))

    # ---------------- team files
    team_names = sorted({t for m in matches for t in m["info"]["teams"]})
    comp_phase_bat = {}
    all_balls = [b for bs in bat_balls.values() for b in bs]
    for ph in (1, 2, 3):
        g = [b for b in all_balls if b["ph"] == ph]
        legal = [b for b in g if b["ek"] not in ("wides", "noballs")]
        runs = sum(b["rt"] for b in g)
        comp_phase_bat[str(ph)] = {
            "rr": round(6 * runs / len(legal), 2) if legal else None,
            "balls": len(legal),
        }

    for team in team_names:
        tid = slug(team)
        tmatches = [m for m in matches if team in m["info"]["teams"]]
        bat = [b for m in tmatches for inn in m["innings"] if inn["team"] == team for b in inn["deliveries"]]
        bowl = [b for m in tmatches for inn in m["innings"] if inn["team"] != team for b in inn["deliveries"]]
        wins = sum(1 for m in tmatches if m["info"]["winner"] == team)

        def phase_rr(balls):
            out = {}
            for ph in (1, 2, 3):
                g = [b for b in balls if b["ph"] == ph]
                legal = [b for b in g if b["ek"] not in ("wides", "noballs")]
                runs = sum(b["rt"] for b in g)
                wk = sum(1 for b in g if b["wk"])
                out[str(ph)] = {"rr": round(6 * runs / len(legal), 2) if legal else None,
                                "runs": runs, "balls": len(legal), "wkts": wk}
            return out

        squad = sorted({p for m in tmatches for p in m["info"]["players"].get(team, [])})
        squad_cards = []
        for pname in squad:
            pm = p_meta(pname)
            pb = bat_balls.get(pname, [])
            pw = bowl_balls.get(pname, [])
            ba = agg_batting(pb)
            bo = agg_bowling(pw)
            death_bowl = agg_bowling([b for b in pw if b["ph"] == 3])
            pp_bowl = agg_bowling([b for b in pw if b["ph"] == 1])
            pp_bat = agg_batting([b for b in pb if b["ph"] == 1])
            death_bat = agg_batting([b for b in pb if b["ph"] == 3])
            squad_cards.append({
                "name": pname, "bat": pm["bat"], "bowl": pm["bowl"], "wk": pm["wk"],
                "uncertain": pm["uncertain"],
                "runs": ba["runs"], "sr": ba["sr"], "ballsFaced": ba["balls"],
                "ppSR": pp_bat["sr"], "deathSR": death_bat["sr"],
                "wkts": bo["wkts"], "econ": bo["econ"], "ballsBowled": bo["balls"],
                "ppEcon": pp_bowl["econ"], "ppBalls": pp_bowl["balls"],
                "deathEcon": death_bowl["econ"], "deathBalls": death_bowl["balls"],
            })
        with open(os.path.join(OUT, "teams", f"{tid}.json"), "w") as f:
            json.dump({
                "id": tid, "name": team, "short": TEAM_SHORT.get(team, team[:3].upper()),
                "matches": [m["id"] for m in tmatches], "wins": wins, "played": len(tmatches),
                "squad": squad,
                "squadCards": squad_cards,
                "batPhase": phase_rr(bat), "bowlPhase": phase_rr(bowl),
                "catches": sum(1 for b in bowl if b["wk"] and b["wk"]["kind"] in ("caught", "caught and bowled")),
                "runOuts": sum(1 for b in bowl if b["wk"] and b["wk"]["kind"] == "run out"),
            }, f, separators=(",", ":"))

    # ---------------- venues + meta
    venues = {}
    for m in matches:
        v = m["info"]["venue"]
        venues.setdefault(v, {"name": v, "city": m["info"]["city"], "matches": 0,
                              "firstTotals": [], "chaseWins": 0, "results": 0,
                              "spinRuns": 0, "spinBalls": 0, "paceRuns": 0, "paceBalls": 0})
        ven = venues[v]
        ven["matches"] += 1
        if m["info"]["firstTotal"] is not None and len(m["innings"]) >= 2:
            ven["firstTotals"].append(m["info"]["firstTotal"])
        w = m["info"]["winner"]
        if w and len(m["innings"]) >= 2:
            ven["results"] += 1
            if w == m["innings"][1]["team"]:
                ven["chaseWins"] += 1
        for inn in m["innings"]:
            for b in inn["deliveries"]:
                k = bowl_kind(b["bwl"])
                if b["ek"] in ("wides", "noballs"):
                    continue
                if k == "spin":
                    ven["spinRuns"] += b["rt"]; ven["spinBalls"] += 1
                elif k == "pace":
                    ven["paceRuns"] += b["rt"]; ven["paceBalls"] += 1

    venue_list = []
    for v in venues.values():
        venue_list.append({
            "name": v["name"], "city": v["city"], "matches": v["matches"],
            "avgFirstInnings": round(sum(v["firstTotals"]) / len(v["firstTotals"]), 1) if v["firstTotals"] else None,
            "chaseWinPct": round(100 * v["chaseWins"] / v["results"], 0) if v["results"] else None,
            "spinEcon": round(6 * v["spinRuns"] / v["spinBalls"], 2) if v["spinBalls"] else None,
            "paceEcon": round(6 * v["paceRuns"] / v["paceBalls"], 2) if v["paceBalls"] else None,
            "spinBalls": v["spinBalls"], "paceBalls": v["paceBalls"],
        })
    venue_list.sort(key=lambda v: -v["matches"])


    # ---------------- key moments + pre-match reports (DERIVED)
    # Both are attached to each match bundle in a second pass, because the
    # pre-match report needs the venue profiles computed above.
    venue_by_name = {v["name"]: v for v in venue_list}

    def describe_ball(d):
        if d["wk"]:
            return f"WICKET - {d['wk']['out']} {d['wk']['kind']}"
        if d["ek"] == "wides":
            return "wide"
        if d["ek"] == "noballs":
            return f"no-ball, {d['rb']} off the bat"
        if d["rb"] >= 6:
            return "SIX"
        if d["rb"] >= 4:
            return "FOUR"
        if d["rt"] == 0:
            return "dot ball"
        return f"{d['rt']} run" + ("s" if d["rt"] > 1 else "")

    def key_moments(match, n=8):
        """Top-N deliveries by absolute win-probability swing, max one per over.
        Reuses the same per-ball win probability the worm already renders."""
        cands = []
        # Only the two main innings: a Super Over is a separate 1-over shootout,
        # so the innings win-probability model does not apply to it.
        for ii, inn in enumerate(match["innings"][:2]):
            prev = None
            for d in inn["deliveries"]:
                if prev is not None:
                    cands.append({
                        "inn": ii, "team": inn["team"], "ov": d["ov"], "b": d["b"],
                        "swing": round(abs(d["wp"] - prev), 4), "wpFrom": prev, "wpTo": d["wp"],
                        "bat": d["bat"], "bwl": d["bwl"], "rb": d["rb"], "rt": d["rt"],
                        "wk": d["wk"], "score": f"{d['cr']}/{d['cw']}",
                        "desc": describe_ball(d),
                    })
                prev = d["wp"]
        cands.sort(key=lambda x: -x["swing"])
        picked, seen = [], set()
        for c in cands:
            k = (c["inn"], c["ov"])
            if k in seen:
                continue
            seen.add(k)
            picked.append(c)
            if len(picked) == n:
                break
        return picked

    # per-(batter,bowler,match) tallies so battles can exclude the previewed match
    pair_by_match = defaultdict(lambda: defaultdict(lambda: {"runs": 0, "balls": 0, "outs": 0}))
    for m in matches:
        for inn in m["innings"]:
            for d in inn["deliveries"]:
                c = pair_by_match[(d["bat"], d["bwl"])][m["id"]]
                c["runs"] += d["rb"]
                if d["ek"] != "wides":
                    c["balls"] += 1
                if d["wk"] and d["wk"]["out"] == d["bat"] and d["wk"]["kind"] not in (
                        "run out", "retired hurt", "retired out", "obstructing the field"):
                    c["outs"] += 1

    for m in matches:
        a, b = m["info"]["teams"][0], m["info"]["teams"][1]
        prior = [x for x in matches
                 if x["id"] != m["id"] and set(x["info"]["teams"]) == {a, b}]
        h2h = {
            "played": len(prior),
            "wins": {a: sum(1 for x in prior if x["info"]["winner"] == a),
                     b: sum(1 for x in prior if x["info"]["winner"] == b)},
            "matches": [{"id": x["id"], "date": x["info"]["date"], "result": x["info"]["result"],
                         "venue": x["info"]["venue"], "stage": x["info"].get("stage")}
                        for x in sorted(prior, key=lambda x: x["info"]["date"], reverse=True)],
        }
        battles = []
        for bat_team, bowl_team in ((a, b), (b, a)):
            for bat in m["info"]["players"].get(bat_team, []):
                for bwl in m["info"]["players"].get(bowl_team, []):
                    per = pair_by_match.get((bat, bwl))
                    if not per:
                        continue
                    # EXCLUDE the match being previewed so this reads as genuinely pre-toss
                    runs = balls = outs = 0
                    mids = 0
                    for mid, c in per.items():
                        if mid == m["id"]:
                            continue
                        runs += c["runs"]; balls += c["balls"]; outs += c["outs"]; mids += 1
                    if balls >= 6:
                        battles.append({
                            "batter": bat, "batTeam": bat_team, "bowler": bwl, "bowlTeam": bowl_team,
                            "runs": runs, "balls": balls, "outs": outs,
                            "sr": round(100 * runs / balls) if balls else None,
                            "matches": mids,
                            "batHand": p_meta(bat)["bat"], "bowlType": p_meta(bwl)["bowl"],
                        })
        # rank by how lopsided the duel is: dismissals first, then distance from a par SR
        battles.sort(key=lambda x: (-(x["outs"] * 30 + abs((x["sr"] or 0) - 130)), -x["balls"]))
        m["keyMoments"] = key_moments(m)
        m["preMatch"] = {"h2h": h2h,
                         "venue": venue_by_name.get(m["info"]["venue"]),
                         "battles": battles[:3]}
        with open(os.path.join(OUT, "matches", f"{m['id']}.json"), "w") as f:
            json.dump(m, f, separators=(",", ":"))

    meta = {
        "generated": True,
        "matchCount": len(matches),
        "dateRange": [matches[-1]["info"]["date"], matches[0]["info"]["date"]],
        "events": sorted({m["info"]["event"] for m in matches}),
        "formats": sorted({m["info"]["matchType"] for m in matches}),
        "teams": [{"id": slug(t), "name": t, "short": TEAM_SHORT.get(t, t[:3].upper())} for t in team_names],
        "venues": venue_list,
        "competition": {"bat": comp_bat, "phase": comp_phase_bat, "acceleration": comp_accel, "par": PAR},
        "provenance": {
            "source": "Cricsheet (https://cricsheet.org)",
            "license": "This dataset is made available under the Open Data Commons Attribution License: http://opendatacommons.org/licenses/by/1.0/",
            "note": "Wagon wheels and pitch maps are statistical reconstructions (MODELED), not ball-tracking. Run values, outcomes and dismissals are real (RECORDED). Win probability and phase metrics are computed (DERIVED).",
            "winProbMethod": "Logistic model over a DLS-style resource fraction (balls remaining x wickets in hand), par score 175.",
        },
    }
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    print(f"Processed {len(matches)} matches, {len(players_index)} players, {len(team_names)} teams, {len(venue_list)} venues -> {OUT}")


if __name__ == "__main__":
    main()
