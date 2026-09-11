"""CricTrack v4 — Feature tests requested in review.

Covers:
- Last-ball wicket must not freeze (needs_new_batsman=False, needs_new_bowler=False, innings completed, current_innings flipped)
- Auto Man of the Match after full match (both innings complete)
- Delete match: owner 200, non-owner 403, listing excludes deleted
- Player stats aggregation (batting/bowling/fielding/mom_awards)
- Tournament MVP leaderboard schema + sort
- Public ball-by-ball events feed (newest first, required fields)
- Global search restricts matches to owner
- Maiden after 6 dot balls
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers ----------
def _fresh_phone(prefix: str = "88877") -> str:
    return f"{prefix}{int(time.time()*1000) % 100000:05d}"


def _signup() -> dict:
    s = requests.Session()
    phone = _fresh_phone()
    r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    dev = r.json()["dev_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": dev})
    assert r.status_code == 200, r.text
    d = r.json()
    return {
        "phone": phone,
        "token": d["session_token"],
        "user": d["user"],
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
    A = _create_team(u, f"TEST_A_{int(time.time()*1000)%1000000}", players, link_owner_first=link_owner)
    B = _create_team(u, f"TEST_B_{int(time.time()*1000)%1000000}", players)
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


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def owner():
    return _signup()


@pytest.fixture(scope="module")
def other_user():
    return _signup()


# ============ 1. Last-ball wicket freeze bug ============
class TestLastBallWicketFreeze:
    def test_wicket_on_last_ball_completes_and_does_not_freeze(self, owner):
        ctx = _new_match(owner, overs=1)
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        _toss_a_bats(owner, mid, team_a)
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
        # 5 singles
        for _ in range(5):
            r = _ball(owner, mid, "a", runs=1)
            assert r.status_code == 200, r.text
        # 6th ball: last-ball wicket
        r = _ball(owner, mid, "a", runs=0, wicket=True, out_type="bowled")
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        ia = m["innings_a"]
        assert ia["completed"] is True, ia
        assert ia["needs_new_batsman"] is False
        assert ia["needs_new_bowler"] is False
        assert m["current_innings"] == "b"
        assert m["status"] == "live"

        # Follow-up GET is consistent
        t0 = time.time()
        r = owner["session"].get(f"{API}/matches/{mid}", headers=owner["headers"])
        assert r.status_code == 200
        assert (time.time() - t0) < 5  # not hung
        m2 = r.json()["match"]
        assert m2["innings_a"]["completed"] is True
        assert m2["current_innings"] == "b"


# ============ 2. Auto MoM ============
class TestAutoMoM:
    def test_full_match_sets_mom_automatically(self, owner):
        ctx = _new_match(owner, overs=1)
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        _toss_a_bats(owner, mid, team_a)
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        # Innings A: 6 singles → 6 runs
        _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
        for _ in range(6):
            r = _ball(owner, mid, "a", runs=1)
            assert r.status_code == 200, r.text
        # Now innings B
        _start_innings(owner, mid, "b", B[0]["player_id"], B[1]["player_id"], A[0]["player_id"])
        # bat out — chase 7 by hitting a boundary (4) then get bowled 5 times (all out with 3 wickets? overs=1 → 6 balls)
        # Simpler: bowl A all out (3 wickets = all-out since only 3 players)
        # Ball 1: B scores 4
        r = _ball(owner, mid, "b", runs=4); assert r.status_code == 200, r.text
        # Ball 2: wicket bowled → needs_new_batsman=True
        r = _ball(owner, mid, "b", runs=0, wicket=True, out_type="bowled"); assert r.status_code == 200
        # Ball 3: pick new batsman B[2] and score 0
        r = _ball(owner, mid, "b", runs=0, new_batsman_id=B[2]["player_id"]); assert r.status_code == 200, r.text
        # Ball 4: wicket bowled
        r = _ball(owner, mid, "b", runs=0, wicket=True, out_type="bowled"); assert r.status_code == 200
        # Need a new batsman but only 3 players (2 already out, 1 still not-out) — team is all-out (2 out, only 1 remaining who's non-striker)
        # After 2nd wicket, striker is out. non-striker B[1] still there. needs_new_batsman but no one left → we test if all_out triggered.
        # Actually the app uses wickets>=10 for all_out. Since only 3 players, we can't hit 10 wickets.
        # Continue: ball 5: new_batsman must be someone not yet out. B[0] and B[2] are out. B[1] is on non_striker. No one else!
        # So we complete the innings by finishing the over. Ball 5 with new_batsman required — pass swap or scoring? Let's just score 6 balls total.
        # Actually we already did 4 balls. Need 2 more to hit overs_done.
        # But we can't score without new_batsman since needs_new_batsman=True.
        # Alternative: instead of second wicket, hit boundaries to overtake target.
        # Restart: use different approach
        pytest.skip("Skipping — will use overtake-target flow in next test")

    def test_full_match_chase_wins_and_sets_mom(self, owner):
        ctx = _new_match(owner, overs=1)
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        _toss_a_bats(owner, mid, team_a)
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        # Innings A: 3 runs (6 dot balls except 3 singles)
        _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
        for i in range(6):
            r = _ball(owner, mid, "a", runs=1 if i < 3 else 0)
            assert r.status_code == 200, r.text
        m = r.json()["match"]
        assert m["innings_a"]["completed"] is True
        # Innings B: chase 4 → score 6 on 1st ball
        _start_innings(owner, mid, "b", B[0]["player_id"], B[1]["player_id"], A[0]["player_id"])
        r = _ball(owner, mid, "b", runs=6)
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        assert m["innings_b"]["completed"] is True
        assert m["status"] == "completed"
        assert m["winner_team_id"] == m["team_b_id"]
        assert m["result_text"]
        # Auto MoM
        assert m.get("man_of_the_match_id"), m
        assert m.get("man_of_the_match_team_id") in (m["team_a_id"], m["team_b_id"])
        assert m.get("man_of_the_match_summary")
        # MoM should be a valid player from either team
        all_pids = {p["player_id"] for p in ctx["A"]["players"] + ctx["B"]["players"]}
        assert m["man_of_the_match_id"] in all_pids


# ============ 3. Delete match ============
class TestDeleteMatch:
    def test_owner_can_delete(self, owner):
        ctx = _new_match(owner)
        mid = ctx["match"]["match_id"]
        r = owner["session"].delete(f"{API}/matches/{mid}", headers=owner["headers"])
        assert r.status_code == 200, r.text
        assert r.json() == {"success": True}
        # 404 on GET
        r = owner["session"].get(f"{API}/matches/{mid}", headers=owner["headers"])
        assert r.status_code == 404
        # Not in listing
        r = owner["session"].get(f"{API}/matches", headers=owner["headers"])
        ids = [m["match_id"] for m in r.json().get("matches", [])]
        assert mid not in ids

    def test_non_owner_gets_403(self, owner, other_user):
        ctx = _new_match(owner)
        mid = ctx["match"]["match_id"]
        r = other_user["session"].delete(f"{API}/matches/{mid}", headers=other_user["headers"])
        assert r.status_code == 403, r.text
        assert "creator" in r.json()["detail"].lower()


# ============ 4. Player stats ============
class TestPlayerStats:
    def test_stats_after_completed_match(self, owner):
        # Create match where owner is a player in team A
        ctx = _new_match(owner, overs=1, link_owner=True)
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        _toss_a_bats(owner, mid, team_a)
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        # A[0] is the linked owner
        _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
        # Owner scores a boundary, then 5 dots. A total = 4
        r = _ball(owner, mid, "a", runs=4); assert r.status_code == 200
        for _ in range(5):
            r = _ball(owner, mid, "a", runs=0)
            assert r.status_code == 200
        # B chases 5: hit a 6 on first ball
        _start_innings(owner, mid, "b", B[0]["player_id"], B[1]["player_id"], A[0]["player_id"])
        r = _ball(owner, mid, "b", runs=6); assert r.status_code == 200
        m = r.json()["match"]
        assert m["status"] == "completed"

        # Now call player stats
        uid = owner["user"]["user_id"]
        r = owner["session"].get(f"{API}/players/{uid}/stats", headers=owner["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "stats" in data
        st = data["stats"]
        for k in ("matches", "batting", "bowling", "fielding", "mom_awards"):
            assert k in st, f"missing key {k}"
        for k in ("runs","balls","highest","fifties","hundreds","not_outs","average","strike_rate"):
            assert k in st["batting"], f"batting missing {k}"
        for k in ("wickets","balls","runs","maidens","best_w","best_r","economy","average","strike_rate"):
            assert k in st["bowling"], f"bowling missing {k}"
        for k in ("catches","run_outs","stumpings"):
            assert k in st["fielding"], f"fielding missing {k}"
        # Owner batted at least one ball (4) and bowled 1 over
        assert st["matches"] >= 1
        assert st["batting"]["runs"] >= 4
        assert st["batting"]["highest"] >= 4
        assert st["bowling"]["balls"] >= 1  # A[0] bowled to B


# ============ 5. Tournament MVP ============
class TestTournamentMVP:
    def test_mvp_leaderboard_schema(self, owner):
        # Create a tournament, add teams, play a match tied to tournament
        s = owner["session"]
        r = s.post(f"{API}/tournaments", headers=owner["headers"],
                   json={"name": f"TEST_T_{int(time.time())%1000000}", "overs": 1})
        assert r.status_code == 200
        tid = r.json()["tournament"]["tournament_id"]
        A = _create_team(owner, f"TEST_TA_{int(time.time()*1000)%1000000}", 3)
        B = _create_team(owner, f"TEST_TB_{int(time.time()*1000)%1000000}", 3)
        s.post(f"{API}/tournaments/{tid}/teams/{A['team']['team_id']}", headers=owner["headers"])
        s.post(f"{API}/tournaments/{tid}/teams/{B['team']['team_id']}", headers=owner["headers"])
        r = s.post(f"{API}/matches", headers=owner["headers"], json={
            "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 1,
            "tournament_id": tid,
        })
        assert r.status_code == 200, r.text
        mid = r.json()["match"]["match_id"]
        _toss_a_bats(owner, mid, A["team"]["team_id"])
        Ap, Bp = A["players"], B["players"]
        _start_innings(owner, mid, "a", Ap[0]["player_id"], Ap[1]["player_id"], Bp[0]["player_id"])
        for i in range(6):
            _ball(owner, mid, "a", runs=1 if i < 2 else 0)
        _start_innings(owner, mid, "b", Bp[0]["player_id"], Bp[1]["player_id"], Ap[0]["player_id"])
        r = _ball(owner, mid, "b", runs=6)
        assert r.status_code == 200
        assert r.json()["match"]["status"] == "completed"

        r = s.get(f"{API}/tournaments/{tid}/mvp", headers=owner["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert "leaderboard" in data
        board = data["leaderboard"]
        assert isinstance(board, list) and len(board) > 0
        top = board[0]
        for k in ("name", "team_short", "matches", "runs", "wickets", "catches", "run_outs", "stumpings", "mvp_points"):
            assert k in top, f"missing {k} in leaderboard entry"
        # Sorted desc
        pts = [p["mvp_points"] for p in board]
        assert pts == sorted(pts, reverse=True)


# ============ 6. Public ball-by-ball events ============
class TestPublicEvents:
    def test_events_newest_first(self, owner):
        ctx = _new_match(owner, overs=1)
        mid = ctx["match"]["match_id"]
        token = ctx["match"]["share_token"]
        team_a = ctx["match"]["team_a_id"]
        _toss_a_bats(owner, mid, team_a)
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
        _ball(owner, mid, "a", runs=1)
        _ball(owner, mid, "a", runs=0, extra_type="wide")
        _ball(owner, mid, "a", runs=4)
        _ball(owner, mid, "a", runs=0, wicket=True, out_type="bowled")

        r = requests.get(f"{API}/public/matches/{token}/events?limit=20")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "events" in data and "current_innings" in data and "status" in data
        events = data["events"]
        assert len(events) >= 4
        # Newest first: last event should be the wicket → first in list
        assert events[0]["wicket"] is True
        assert events[0]["out_type"] == "bowled"
        # required fields present
        top = events[0]
        for k in ("runs", "extra_type", "wicket", "out_type", "out_batsman_id", "bowler_at_ball", "fielder_id", "side"):
            assert k in top, f"missing {k} in event"
        # 'pre' internal snapshot must be stripped
        assert "pre" not in top


# ============ 7. Global search ============
class TestGlobalSearch:
    def test_search_returns_owner_matches_only(self, owner, other_user):
        # Owner creates a match with 'Alpha' name
        s = owner["session"]
        r = s.post(f"{API}/teams", headers=owner["headers"], json={"name": "AlphaWarriors"})
        assert r.status_code == 200
        A = r.json()["team"]
        r = s.post(f"{API}/teams", headers=owner["headers"], json={"name": "Betas"})
        B = r.json()["team"]
        r = s.post(f"{API}/matches", headers=owner["headers"], json={
            "team_a_id": A["team_id"], "team_b_id": B["team_id"], "overs": 3,
        })
        assert r.status_code == 200
        mid = r.json()["match"]["match_id"]

        # Owner search
        r = s.get(f"{API}/search?q=Alpha", headers=owner["headers"])
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("users", "matches", "tournaments"):
            assert k in d
        assert any(m["match_id"] == mid for m in d["matches"])

        # Other user searches — should NOT see owner's match
        r = other_user["session"].get(f"{API}/search?q=Alpha", headers=other_user["headers"])
        assert r.status_code == 200
        d2 = r.json()
        assert not any(m["match_id"] == mid for m in d2["matches"]), "match leaked to non-owner"


# ============ 8. Maidens ============
class TestMaiden:
    def test_six_dot_balls_credits_maiden(self, owner):
        ctx = _new_match(owner, overs=2)
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        _toss_a_bats(owner, mid, team_a)
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        _start_innings(owner, mid, "a", A[0]["player_id"], A[1]["player_id"], B[0]["player_id"])
        for _ in range(6):
            r = _ball(owner, mid, "a", runs=0)
            assert r.status_code == 200, r.text
        m = r.json()["match"]
        ia = m["innings_a"]
        bw = ia["bowlers"][B[0]["player_id"]]
        assert bw["maidens"] == 1, bw
        assert bw["runs"] == 0
        assert bw["balls"] == 6
