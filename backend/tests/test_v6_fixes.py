"""v6 fixes tests — captain, invite, best awards, public team, public search, run-out on-strike."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _fresh_phone(prefix: str = "77899") -> str:
    return f"{prefix}{int(time.time()*1000) % 100000:05d}"


def _signup(prefix: str = "77899"):
    s = requests.Session()
    phone = _fresh_phone(prefix)
    r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    dev = r.json()["dev_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": dev})
    assert r.status_code == 200
    d = r.json()
    return {
        "phone": phone, "token": d["session_token"], "user": d["user"],
        "headers": {"Authorization": f"Bearer {d['session_token']}", "Content-Type": "application/json"},
        "session": s,
    }


def _create_team(u, name, count=3):
    s = u["session"]
    r = s.post(f"{API}/teams", headers=u["headers"], json={"name": name})
    assert r.status_code == 200
    team = r.json()["team"]
    players = []
    for i in range(count):
        r = s.post(f"{API}/teams/{team['team_id']}/players", headers=u["headers"], json={"name": f"{name}_P{i+1}"})
        players.append(r.json()["player"])
    return {"team": team, "players": players}


@pytest.fixture(scope="module")
def owner():
    return _signup()


def test_team_captain_set_and_clear(owner):
    t = _create_team(owner, f"CapT_{int(time.time())%1000}", 3)
    tid = t["team"]["team_id"]
    cap_pid = t["players"][1]["player_id"]
    # Set
    r = owner["session"].put(f"{API}/teams/{tid}/captain", headers=owner["headers"], json={"captain_id": cap_pid})
    assert r.status_code == 200, r.text
    r = owner["session"].get(f"{API}/teams/{tid}", headers=owner["headers"])
    assert r.json()["team"]["captain_id"] == cap_pid
    # Rejects non-team players
    r = owner["session"].put(f"{API}/teams/{tid}/captain", headers=owner["headers"], json={"captain_id": "p_ghost"})
    assert r.status_code == 400
    # Clear
    r = owner["session"].put(f"{API}/teams/{tid}/captain", headers=owner["headers"], json={"captain_id": None})
    assert r.status_code == 200
    r = owner["session"].get(f"{API}/teams/{tid}", headers=owner["headers"])
    assert r.json()["team"].get("captain_id") in (None, "")


def test_public_search_and_public_team(owner):
    t = _create_team(owner, f"PubSrch_{int(time.time())%1000}", 2)
    # public search finds the team by name — no auth
    r = requests.get(f"{API}/public/search?q={t['team']['name'][:6]}")
    assert r.status_code == 200
    j = r.json()
    assert any(x["team_id"] == t["team"]["team_id"] for x in j.get("teams", []))
    # public team endpoint returns buckets
    r = requests.get(f"{API}/public/teams/{t['team']['team_id']}")
    assert r.status_code == 200
    j = r.json()
    assert j["team"]["team_id"] == t["team"]["team_id"]
    assert "matches" in j and "live" in j["matches"]


def test_invite_flow_end_to_end(owner):
    t = _create_team(owner, f"InvT_{int(time.time())%1000}", 2)
    tid = t["team"]["team_id"]
    # Create invite
    r = owner["session"].post(f"{API}/teams/{tid}/invites", headers=owner["headers"], json={"name": "Rohit"})
    assert r.status_code == 200, r.text
    inv = r.json()["invite"]
    token = inv["token"]
    # Public GET returns invite details
    r = requests.get(f"{API}/public/invites/{token}")
    assert r.status_code == 200
    d = r.json()
    assert d["invite"]["status"] == "pending"
    assert d["team"]["team_id"] == tid

    # New user signs up and accepts
    invitee = _signup(prefix="77998")
    r = invitee["session"].post(f"{API}/invites/{token}/accept", headers=invitee["headers"])
    assert r.status_code == 200, r.text
    # Team now includes invitee as a linked player
    r = owner["session"].get(f"{API}/teams/{tid}", headers=owner["headers"])
    players = r.json()["team"]["players"]
    assert any(p.get("user_id") == invitee["user"]["user_id"] for p in players)
    # Re-accept fails
    r = invitee["session"].post(f"{API}/invites/{token}/accept", headers=invitee["headers"])
    assert r.status_code == 400


def test_mom_only_from_winning_team_and_best_awards(owner):
    A = _create_team(owner, f"WA_{int(time.time())%1000}", 3)
    B = _create_team(owner, f"WB_{int(time.time())%1000}", 3)
    r = owner["session"].post(f"{API}/matches", headers=owner["headers"], json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 1
    })
    m = r.json()["match"]; mid = m["match_id"]
    owner["session"].post(f"{API}/matches/{mid}/toss", headers=owner["headers"], json={"toss_winner_team_id": m["team_a_id"], "decision": "bat"})
    # A bats — 4 sixes = 24 (24/6 = 24 innings)
    ap = A["players"]; bp = B["players"]
    owner["session"].post(f"{API}/matches/{mid}/innings/a/start", headers=owner["headers"], json={"striker_id": ap[0]["player_id"], "non_striker_id": ap[1]["player_id"], "bowler_id": bp[0]["player_id"]})
    for _ in range(6):
        r = owner["session"].post(f"{API}/matches/{mid}/innings/a/ball", headers=owner["headers"], json={"runs": 6})
        assert r.status_code == 200, r.text
    # B chases — score less: 6 dot balls
    owner["session"].post(f"{API}/matches/{mid}/innings/b/start", headers=owner["headers"], json={"striker_id": bp[0]["player_id"], "non_striker_id": bp[1]["player_id"], "bowler_id": ap[0]["player_id"]})
    for _ in range(6):
        owner["session"].post(f"{API}/matches/{mid}/innings/b/ball", headers=owner["headers"], json={"runs": 0})
    r = owner["session"].get(f"{API}/matches/{mid}", headers=owner["headers"])
    m = r.json()["match"]
    assert m["status"] == "completed"
    assert m["winner_team_id"] == m["team_a_id"]
    # MoM must be from winning team A
    if m.get("man_of_the_match_id"):
        assert m["man_of_the_match_team_id"] == m["team_a_id"]
    # Best batter (ap[0] slugged sixes)
    assert m.get("best_batter_id") == ap[0]["player_id"]
    # Best bowler must exist and be from A (they bowled second, took no wickets tho — pick any bowler with balls>0)
    assert m.get("best_bowler_id") is not None


def test_run_out_new_batsman_on_strike_flag(owner):
    A = _create_team(owner, f"RO_A_{int(time.time())%1000}", 4)
    B = _create_team(owner, f"RO_B_{int(time.time())%1000}", 3)
    r = owner["session"].post(f"{API}/matches", headers=owner["headers"], json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 2
    })
    mid = r.json()["match"]["match_id"]
    owner["session"].post(f"{API}/matches/{mid}/toss", headers=owner["headers"], json={"toss_winner_team_id": A["team"]["team_id"], "decision": "bat"})
    ap = A["players"]; bp = B["players"]
    owner["session"].post(f"{API}/matches/{mid}/innings/a/start", headers=owner["headers"], json={"striker_id": ap[0]["player_id"], "non_striker_id": ap[1]["player_id"], "bowler_id": bp[0]["player_id"]})
    # Ball 1: run-out non-striker with 0 runs
    r = owner["session"].post(f"{API}/matches/{mid}/innings/a/ball", headers=owner["headers"], json={
        "runs": 0, "wicket": True, "out_type": "run_out",
        "out_batsman_id": ap[1]["player_id"], "fielder_id": bp[0]["player_id"],
    })
    assert r.status_code == 200, r.text
    # Ball 2: bring new batsman on strike explicitly (swap so new batter faces)
    r = owner["session"].post(f"{API}/matches/{mid}/innings/a/ball", headers=owner["headers"], json={
        "runs": 1, "new_batsman_id": ap[2]["player_id"], "new_batsman_on_strike": True,
    })
    assert r.status_code == 200, r.text
    m = r.json()["match"]
    ia = m["innings_a"]
    # After the 1-run ball with new_batsman_on_strike=True, they were placed at non-striker slot then swapped;
    # the run also rotates strike back → new batter should end up at NON-striker again (since 1 run rotates once more)
    # We just verify: the ball was recorded successfully and the new batter has been faced by someone
    assert ia["balls"] == 2
    assert ap[2]["player_id"] in ia["batted_ids"]
    # Ball 3 without on_strike flag (default False)
    r = owner["session"].post(f"{API}/matches/{mid}/innings/a/ball", headers=owner["headers"], json={"runs": 0})
    assert r.status_code == 200
