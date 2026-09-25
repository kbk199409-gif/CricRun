"""v6.1 run-out details tests — verify runs + extra_type applied correctly on run-out."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _phone():
    return f"78899{int(time.time() * 1000) % 100000:05d}"


def _signup():
    s = requests.Session()
    p = _phone()
    r = s.post(f"{API}/auth/phone/send", json={"phone": p})
    assert r.status_code == 200, r.text
    dev = r.json()["dev_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": p, "code": dev})
    assert r.status_code == 200
    d = r.json()
    return {"session": s, "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['session_token']}", "Content-Type": "application/json"}}


def _create_team(u, name, count=4):
    r = u["session"].post(f"{API}/teams", headers=u["headers"], json={"name": name})
    team = r.json()["team"]
    ps = []
    for i in range(count):
        rr = u["session"].post(f"{API}/teams/{team['team_id']}/players", headers=u["headers"], json={"name": f"{name}_P{i+1}"})
        ps.append(rr.json()["player"])
    return {"team": team, "players": ps}


def _match(u, overs=2):
    A = _create_team(u, f"RA_{int(time.time()*1000)%1000000}", 4)
    B = _create_team(u, f"RB_{int(time.time()*1000)%1000000}", 4)
    r = u["session"].post(f"{API}/matches", headers=u["headers"], json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": overs})
    m = r.json()["match"]
    u["session"].post(f"{API}/matches/{m['match_id']}/toss", headers=u["headers"], json={"toss_winner_team_id": m["team_a_id"], "decision": "bat"})
    ap, bp = A["players"], B["players"]
    u["session"].post(f"{API}/matches/{m['match_id']}/innings/a/start", headers=u["headers"], json={
        "striker_id": ap[0]["player_id"], "non_striker_id": ap[1]["player_id"], "bowler_id": bp[0]["player_id"]})
    return {"match": m, "A": A, "B": B}


@pytest.fixture(scope="module")
def owner():
    return _signup()


def _ball(u, mid, side, **payload):
    return u["session"].post(f"{API}/matches/{mid}/innings/{side}/ball", headers=u["headers"], json=payload)


def _get(u, mid):
    return u["session"].get(f"{API}/matches/{mid}", headers=u["headers"]).json()["match"]


def test_runout_0_runs(owner):
    ctx = _match(owner)
    mid = ctx["match"]["match_id"]; A = ctx["A"]; B = ctx["B"]
    r = _ball(owner, mid, "a", runs=0, wicket=True, out_type="run_out",
              out_batsman_id=A["players"][1]["player_id"], fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200, r.text
    m = _get(owner, mid); ia = m["innings_a"]
    assert ia["runs"] == 0
    assert ia["wickets"] == 1


def test_runout_1_off_bat(owner):
    ctx = _match(owner)
    mid = ctx["match"]["match_id"]; A = ctx["A"]; B = ctx["B"]
    striker = A["players"][0]["player_id"]
    r = _ball(owner, mid, "a", runs=1, extra_type="none", wicket=True, out_type="run_out",
              out_batsman_id=A["players"][1]["player_id"], fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200, r.text
    m = _get(owner, mid); ia = m["innings_a"]
    assert ia["runs"] == 1
    # Off bat 1 run: striker's balls++ and runs=1
    st = ia["batters"][striker]
    assert st["runs"] == 1 and st["balls"] == 1


def test_runout_2_off_bat(owner):
    ctx = _match(owner); mid = ctx["match"]["match_id"]; A, B = ctx["A"], ctx["B"]
    striker = A["players"][0]["player_id"]
    r = _ball(owner, mid, "a", runs=2, extra_type="none", wicket=True, out_type="run_out",
              out_batsman_id=A["players"][1]["player_id"], fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200
    ia = _get(owner, mid)["innings_a"]
    assert ia["runs"] == 2
    assert ia["batters"][striker]["runs"] == 2


def test_runout_3_off_bat(owner):
    ctx = _match(owner); mid = ctx["match"]["match_id"]; A, B = ctx["A"], ctx["B"]
    striker = A["players"][0]["player_id"]
    r = _ball(owner, mid, "a", runs=3, extra_type="none", wicket=True, out_type="run_out",
              out_batsman_id=A["players"][1]["player_id"], fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200
    ia = _get(owner, mid)["innings_a"]
    assert ia["runs"] == 3
    assert ia["batters"][striker]["runs"] == 3


def test_runout_2_byes(owner):
    ctx = _match(owner); mid = ctx["match"]["match_id"]; A, B = ctx["A"], ctx["B"]
    striker = A["players"][0]["player_id"]
    r = _ball(owner, mid, "a", runs=2, extra_type="bye", wicket=True, out_type="run_out",
              out_batsman_id=A["players"][1]["player_id"], fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200
    m = _get(owner, mid); ia = m["innings_a"]
    # Byes: team +2, batter runs unchanged, batter balls +1, bowler runs NOT charged
    assert ia["runs"] == 2
    st = ia["batters"][striker]
    assert st["runs"] == 0 and st["balls"] == 1
    bw = ia["bowlers"][B["players"][0]["player_id"]]
    assert bw["runs"] == 0


def test_runout_3_leg_byes(owner):
    ctx = _match(owner); mid = ctx["match"]["match_id"]; A, B = ctx["A"], ctx["B"]
    striker = A["players"][0]["player_id"]
    r = _ball(owner, mid, "a", runs=3, extra_type="leg_bye", wicket=True, out_type="run_out",
              out_batsman_id=A["players"][1]["player_id"], fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200
    ia = _get(owner, mid)["innings_a"]
    assert ia["runs"] == 3
    st = ia["batters"][striker]
    assert st["runs"] == 0 and st["balls"] == 1


def test_runout_striker_out_and_choose_new_striker(owner):
    """After a striker run-out, verify new_batsman_on_strike=True places new batter at striker slot."""
    ctx = _match(owner); mid = ctx["match"]["match_id"]; A, B = ctx["A"], ctx["B"]
    striker = A["players"][0]["player_id"]
    non_striker = A["players"][1]["player_id"]
    # Ball 1: run-out the STRIKER on a 1-run play (off bat, 1 run completed)
    r = _ball(owner, mid, "a", runs=1, extra_type="none", wicket=True, out_type="run_out",
              out_batsman_id=striker, fielder_id=B["players"][1]["player_id"])
    assert r.status_code == 200, r.text
    ia = _get(owner, mid)["innings_a"]
    # Striker now cleared, needs_new_batsman=True. New batter must be added to striker slot.
    assert ia["needs_new_batsman"] is True
    assert ia["striker_id"] is None
    # Ball 2: new batter arrives — with on_strike=True (comes on strike)
    r = _ball(owner, mid, "a", runs=0, new_batsman_id=A["players"][2]["player_id"], new_batsman_on_strike=True)
    assert r.status_code == 200, r.text
    ia = _get(owner, mid)["innings_a"]
    # Since striker_id was None, the new batter fills striker slot; on_strike=True → no rotation.
    assert ia["striker_id"] == A["players"][2]["player_id"]
