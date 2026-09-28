"""No-ball off-bat runs correction:
   NB + N off-bat runs → team +(N+1), batter +N (with 4s/6s counted), bowler_extras += 1.
"""
import os, time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _phone():
    return f"78933{int(time.time() * 1000) % 100000:05d}"


def _signup():
    s = requests.Session()
    p = _phone()
    r = s.post(f"{API}/auth/phone/send", json={"phone": p})
    assert r.status_code == 200, r.text
    dev = r.json()["dev_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": p, "code": dev})
    assert r.status_code == 200
    d = r.json()
    return {"session": s, "user": d["user"], "headers": {"Authorization": f"Bearer {d['session_token']}", "Content-Type": "application/json"}}


def _team(u, name, n=3):
    r = u["session"].post(f"{API}/teams", headers=u["headers"], json={"name": name})
    team = r.json()["team"]
    ps = []
    for i in range(n):
        rr = u["session"].post(f"{API}/teams/{team['team_id']}/players", headers=u["headers"], json={"name": f"{name}_P{i+1}"})
        ps.append(rr.json()["player"])
    return {"team": team, "players": ps}


def _match(u, overs=1):
    A = _team(u, f"NA_{int(time.time()*1000)%1000000}", 3)
    B = _team(u, f"NB_{int(time.time()*1000)%1000000}", 3)
    r = u["session"].post(f"{API}/matches", headers=u["headers"], json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": overs})
    m = r.json()["match"]
    u["session"].post(f"{API}/matches/{m['match_id']}/toss", headers=u["headers"], json={"toss_winner_team_id": m["team_a_id"], "decision": "bat"})
    ap, bp = A["players"], B["players"]
    u["session"].post(f"{API}/matches/{m['match_id']}/innings/a/start", headers=u["headers"],
                      json={"striker_id": ap[0]["player_id"], "non_striker_id": ap[1]["player_id"], "bowler_id": bp[0]["player_id"]})
    return {"match": m, "A": A, "B": B}


def _ball(u, mid, **payload):
    return u["session"].post(f"{API}/matches/{mid}/innings/a/ball", headers=u["headers"], json=payload)


def _get(u, mid):
    return u["session"].get(f"{API}/matches/{mid}", headers=u["headers"]).json()["match"]


@pytest.fixture(scope="module")
def owner():
    return _signup()


@pytest.mark.parametrize("off_bat,expected_team,expected_bat,expected_boundary_key,expected_boundary_val", [
    (0, 1, 0, None, 0),   # No-ball alone → team +1, batter +0
    (1, 2, 1, None, 0),
    (2, 3, 2, None, 0),
    (3, 4, 3, None, 0),
    (4, 5, 4, "fours", 1),
    (6, 7, 6, "sixes", 1),
])
def test_no_ball_off_bat_split(owner, off_bat, expected_team, expected_bat, expected_boundary_key, expected_boundary_val):
    ctx = _match(owner)
    mid = ctx["match"]["match_id"]; A = ctx["A"]; B = ctx["B"]
    striker = A["players"][0]["player_id"]
    bowler = B["players"][0]["player_id"]

    r = _ball(owner, mid, runs=off_bat, extra_type="no_ball")
    assert r.status_code == 200, r.text
    m = _get(owner, mid); ia = m["innings_a"]

    # Team score = off_bat + 1 (no-ball penalty)
    assert ia["runs"] == expected_team, f"team runs got {ia['runs']} expected {expected_team}"

    # Batter runs = off_bat only (NOT the 1-run penalty)
    st = ia["batters"][striker]
    assert st["runs"] == expected_bat, f"batter runs got {st['runs']} expected {expected_bat}"

    # Boundary counter
    if expected_boundary_key:
        assert st.get(expected_boundary_key, 0) == expected_boundary_val

    # Bowler total runs = team_runs (off_bat + 1)
    bw = ia["bowlers"][bowler]
    assert bw["runs"] == expected_team, f"bowler runs {bw['runs']} expected {expected_team}"

    # Bowler extras = only the 1-run penalty (regardless of off_bat)
    assert bw["extras"] == 1, f"bowler extras {bw['extras']} expected 1"

    # Not a legal delivery — bowler & innings ball count unchanged
    assert ia["balls"] == 0
    assert bw["balls"] == 0


def test_wide_still_correct(owner):
    """Regression: wide behaviour is untouched (batter gets 0, bowler extras += team_runs)."""
    ctx = _match(owner)
    mid = ctx["match"]["match_id"]; A = ctx["A"]; B = ctx["B"]
    striker = A["players"][0]["player_id"]
    bowler = B["players"][0]["player_id"]
    r = _ball(owner, mid, runs=3, extra_type="wide")   # 3 wides + 1 penalty = 4
    assert r.status_code == 200
    ia = _get(owner, mid)["innings_a"]
    assert ia["runs"] == 4
    assert ia["batters"].get(striker, {}).get("runs", 0) == 0
    bw = ia["bowlers"][bowler]
    assert bw["runs"] == 4
    assert bw["extras"] == 4    # WIDE behaviour unchanged (all runs are extras)


def test_bye_and_legbye_still_correct(owner):
    """Regression: byes/leg-byes still give batter 0 runs and bowler 0 runs/extras."""
    ctx = _match(owner)
    mid = ctx["match"]["match_id"]; A = ctx["A"]; B = ctx["B"]
    striker = A["players"][0]["player_id"]
    bowler = B["players"][0]["player_id"]
    r = _ball(owner, mid, runs=2, extra_type="bye")
    assert r.status_code == 200
    ia = _get(owner, mid)["innings_a"]
    assert ia["runs"] == 2
    assert ia["batters"][striker]["runs"] == 0
    bw = ia["bowlers"][bowler]
    assert bw["runs"] == 0
    assert bw["extras"] == 0
