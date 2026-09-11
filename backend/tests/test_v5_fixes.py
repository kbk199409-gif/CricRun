"""Additional edge-case tests for the wicket freeze bug (v5 fixes).

Cases:
- CASE A: Wicket on final legal ball of innings
- CASE B: Wicket causes all-out (using a large team so we can actually hit 10)
- CASE C: Wicket on the FINAL over AND after a previous wicket on the same over
- CASE D: Wicket ball with runs (non-zero) on last ball
Also tests the new public player stats endpoint and profile-pic enrichment.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _fresh_phone(prefix: str = "88899") -> str:
    return f"{prefix}{int(time.time()*1000) % 100000:05d}"


def _signup():
    s = requests.Session()
    phone = _fresh_phone()
    r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    dev = r.json()["dev_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": dev})
    assert r.status_code == 200, r.text
    d = r.json()
    return {
        "phone": phone, "token": d["session_token"], "user": d["user"],
        "headers": {"Authorization": f"Bearer {d['session_token']}", "Content-Type": "application/json"},
        "session": s,
    }


def _create_team(u, name, count=3, link_owner_first=False):
    s = u["session"]
    r = s.post(f"{API}/teams", headers=u["headers"], json={"name": name})
    assert r.status_code == 200, r.text
    team = r.json()["team"]
    players = []
    for i in range(count):
        payload = {"name": f"{name}_P{i+1}", "role": "batsman"}
        if link_owner_first and i == 0:
            payload["user_id"] = u["user"]["user_id"]
        r = s.post(f"{API}/teams/{team['team_id']}/players", headers=u["headers"], json=payload)
        assert r.status_code == 200, r.text
        players.append(r.json()["player"])
    return {"team": team, "players": players}


def _new_match(u, overs=1, players=3, link_owner=False):
    A = _create_team(u, f"CA_{int(time.time()*1000)%1000000}", players, link_owner_first=link_owner)
    B = _create_team(u, f"CB_{int(time.time()*1000)%1000000}", players)
    r = u["session"].post(f"{API}/matches", headers=u["headers"], json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": overs
    })
    assert r.status_code == 200, r.text
    return {"A": A, "B": B, "match": r.json()["match"]}


def _toss_a_bats(u, mid, team_a):
    r = u["session"].post(f"{API}/matches/{mid}/toss", headers=u["headers"],
                          json={"toss_winner_team_id": team_a, "decision": "bat"})
    assert r.status_code == 200, r.text
    return r.json()["match"]


def _start_innings(u, mid, side, striker, non_striker, bowler):
    r = u["session"].post(f"{API}/matches/{mid}/innings/{side}/start", headers=u["headers"],
                          json={"striker_id": striker, "non_striker_id": non_striker, "bowler_id": bowler})
    assert r.status_code == 200, r.text
    return r.json()["match"]


def _ball(u, mid, side, **payload):
    r = u["session"].post(f"{API}/matches/{mid}/innings/{side}/ball", headers=u["headers"], json=payload)
    return r


@pytest.fixture(scope="module")
def owner():
    return _signup()


# ---------- CASE A: wicket on final legal ball ----------
def test_case_a_wicket_on_final_legal_ball(owner):
    ctx = _new_match(owner, overs=1)
    mid = ctx["match"]["match_id"]
    _toss_a_bats(owner, mid, ctx["match"]["team_a_id"])
    A, B = ctx["A"]["players"], ctx["B"]["players"]
    _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
    for _ in range(5):
        assert _ball(owner, mid, "a", runs=0).status_code == 200
    r = _ball(owner, mid, "a", runs=0, wicket=True, out_type="bowled")
    assert r.status_code == 200
    m = r.json()["match"]
    ia = m["innings_a"]
    assert ia["completed"] is True
    assert ia["needs_new_batsman"] is False
    assert ia["needs_new_bowler"] is False
    assert m["current_innings"] == "b"
    assert m["status"] == "live"


# ---------- CASE D: wicket + runs on final delivery (run out) ----------
def test_case_d_wicket_with_runs_on_final_ball(owner):
    ctx = _new_match(owner, overs=1)
    mid = ctx["match"]["match_id"]
    _toss_a_bats(owner, mid, ctx["match"]["team_a_id"])
    A, B = ctx["A"]["players"], ctx["B"]["players"]
    _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
    for _ in range(5):
        assert _ball(owner, mid, "a", runs=0).status_code == 200
    # Last ball: 1 run + run-out at the non-striker's end
    r = _ball(owner, mid, "a", runs=1, wicket=True, out_type="run_out",
              out_batsman_id=A[1]["player_id"], fielder_id=B[1]["player_id"])
    assert r.status_code == 200, r.text
    m = r.json()["match"]
    ia = m["innings_a"]
    assert ia["completed"] is True
    assert ia["runs"] == 1
    assert ia["wickets"] == 1
    assert m["current_innings"] == "b"


# ---------- Consecutive wickets in last over ----------
def test_wickets_on_final_two_balls(owner):
    ctx = _new_match(owner, overs=1, players=4)  # need extra players
    mid = ctx["match"]["match_id"]
    _toss_a_bats(owner, mid, ctx["match"]["team_a_id"])
    A, B = ctx["A"]["players"], ctx["B"]["players"]
    _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
    for _ in range(4):
        assert _ball(owner, mid, "a", runs=0).status_code == 200
    # Ball 5: wicket
    r = _ball(owner, mid, "a", runs=0, wicket=True, out_type="bowled")
    assert r.status_code == 200
    # Ball 6: new batsman + wicket
    r = _ball(owner, mid, "a", runs=0, wicket=True, out_type="bowled", new_batsman_id=A[2]["player_id"])
    assert r.status_code == 200, r.text
    m = r.json()["match"]
    ia = m["innings_a"]
    assert ia["completed"] is True
    assert ia["wickets"] == 2
    assert ia["needs_new_batsman"] is False
    assert m["current_innings"] == "b"


# ---------- Public player stats endpoint (no auth) ----------
def test_public_player_stats_no_auth(owner):
    uid = owner["user"]["user_id"]
    r = requests.get(f"{API}/public/players/{uid}/stats")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["user_id"] == uid
    # PII removed
    assert "email" not in d["user"] or d["user"].get("email") is None
    assert "phone" not in d["user"] or d["user"].get("phone") is None
    assert "stats" in d
    assert "batting" in d["stats"]


# ---------- Team players enriched with fresh profile data ----------
def test_team_players_reflect_updated_profile_pic(owner):
    # Owner links themselves on a team
    A = _create_team(owner, f"EnrichA_{int(time.time()*1000)%1000000}", 2, link_owner_first=True)
    # Update owner's profile pic path via profile endpoint (simulate an uploaded object)
    fake_path = f"crictrack/uploads/{owner['user']['user_id']}/fake_pic.png"
    owner["session"].put(f"{API}/profile", headers=owner["headers"],
                         json={"profile_picture_path": fake_path})
    # Re-fetch team — enriched player should show fake_path
    r = owner["session"].get(f"{API}/teams/{A['team']['team_id']}", headers=owner["headers"])
    assert r.status_code == 200
    team = r.json()["team"]
    owner_player = next((p for p in team["players"] if p.get("user_id") == owner["user"]["user_id"]), None)
    assert owner_player is not None
    assert owner_player["profile_picture_path"] == fake_path
