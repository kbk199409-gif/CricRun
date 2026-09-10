"""CricTrack backend tests — post-fix flow:
OTP with dev_code, user search, team player linking (registered+guest),
tournament without format, ball-by-ball scoring (start, extras, wickets, overs, completion).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers ----------
def _fresh_phone(prefix: str = "99988") -> str:
    # 10-digit phone; server normalises to +91
    return f"{prefix}{int(time.time()*1000) % 100000:05d}"


def _signup(session: requests.Session) -> dict:
    phone = _fresh_phone()
    r = session.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("dev_code"), f"dev_code missing: {body}"
    r = session.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": body["dev_code"]})
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "phone": phone,
        "token": data["session_token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['session_token']}", "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def user_x(s):
    return _signup(s)


# ================= TEST 1 — OTP =================
class TestOTP:
    def test_send_returns_dev_code(self, s):
        phone = _fresh_phone("77766")
        r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert "dev_code" in body and len(body["dev_code"]) == 6 and body["dev_code"].isdigit()

    def test_verify_wrong_code(self, s):
        phone = _fresh_phone("77767")
        r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
        assert r.status_code == 200
        r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": "000000"})
        assert r.status_code == 400, r.text
        assert "invalid otp" in r.json()["detail"].lower()

    def test_verify_correct_then_reuse_fails(self, s):
        phone = _fresh_phone("77768")
        r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
        code = r.json()["dev_code"]
        r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": code})
        assert r.status_code == 200
        assert "session_token" in r.json()
        # Reuse: OTP should have been consumed
        r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": code})
        assert r.status_code == 400
        assert "no otp" in r.json()["detail"].lower() or "expired" in r.json()["detail"].lower()


# ================= TEST 2 — User Search + Team Linking =================
class TestUserSearchAndTeamLink:
    def test_full_flow(self, s, user_x):
        # Create a second user (Y) with a unique name
        y = _signup(s)
        y_name = f"TEST_YUser_{int(time.time()*1000)%1000000}"
        r = s.put(f"{API}/profile", headers=y["headers"], json={"name": y_name, "batting_style": "right_hand", "bowling_style": "pacer", "role": "batsman"})
        assert r.status_code == 200

        # X creates team "Alpha"
        r = s.post(f"{API}/teams", headers=user_x["headers"], json={"name": "TEST_Alpha", "short_name": "ALP"})
        assert r.status_code == 200
        alpha = r.json()["team"]

        # X searches for Y by name
        r = s.get(f"{API}/users/search?q={y_name[:8]}", headers=user_x["headers"])
        assert r.status_code == 200
        users = r.json()["users"]
        assert any(u["user_id"] == y["user"]["user_id"] for u in users), f"Y not found: {users}"

        # X adds Y to Alpha
        r = s.post(f"{API}/teams/{alpha['team_id']}/players", headers=user_x["headers"], json={"user_id": y["user"]["user_id"]})
        assert r.status_code == 200, r.text
        player = r.json()["player"]
        assert player["user_id"] == y["user"]["user_id"]
        pid = player["player_id"]

        # Adding Y again → 400
        r = s.post(f"{API}/teams/{alpha['team_id']}/players", headers=user_x["headers"], json={"user_id": y["user"]["user_id"]})
        assert r.status_code == 400
        assert "already" in r.json()["detail"].lower()

        # Delete Y
        r = s.delete(f"{API}/teams/{alpha['team_id']}/players/{pid}", headers=user_x["headers"])
        assert r.status_code == 200

        # Verify removed via GET
        r = s.get(f"{API}/teams/{alpha['team_id']}", headers=user_x["headers"])
        assert not any(p["player_id"] == pid for p in r.json()["team"]["players"])

    def test_search_short_query_returns_empty(self, s, user_x):
        r = s.get(f"{API}/users/search?q=a", headers=user_x["headers"])
        assert r.status_code == 200
        assert r.json()["users"] == []


# ================= TEST 3 — Tournament Without Format =================
class TestTournamentNoFormat:
    def test_create_and_get(self, s, user_x):
        r = s.post(f"{API}/tournaments", headers=user_x["headers"], json={"name": "TEST_NoFmt", "overs": 5})
        assert r.status_code == 200, r.text
        t = r.json()["tournament"]
        assert "format" not in t or t.get("format") in (None, ""), f"format leaked: {t}"
        assert t["overs"] == 5
        tid = t["tournament_id"]

        r = s.get(f"{API}/tournaments/{tid}", headers=user_x["headers"])
        assert r.status_code == 200
        data = r.json()
        assert "points_table" in data and isinstance(data["points_table"], list)


# ================= TEST 4/5/6/7 — Match Ball-by-Ball =================
def _create_team_with_players(s, headers, name: str, count: int = 4) -> dict:
    r = s.post(f"{API}/teams", headers=headers, json={"name": name})
    assert r.status_code == 200
    team = r.json()["team"]
    players = []
    for i in range(count):
        r = s.post(f"{API}/teams/{team['team_id']}/players", headers=headers, json={"name": f"{name}_P{i+1}", "role": "batsman"})
        assert r.status_code == 200
        players.append(r.json()["player"])
    return {"team": team, "players": players}


@pytest.fixture(scope="module")
def match_ctx(s, user_x):
    """Create teams A, B (4 players each) + a 5-over match."""
    A = _create_team_with_players(s, user_x["headers"], f"TEST_A_{int(time.time())%100000}")
    B = _create_team_with_players(s, user_x["headers"], f"TEST_B_{int(time.time())%100000}")
    r = s.post(f"{API}/matches", headers=user_x["headers"], json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 5
    })
    assert r.status_code == 200, r.text
    match = r.json()["match"]
    return {"A": A, "B": B, "match": match, "headers": user_x["headers"]}


class TestMatchScoring:
    def test_ball_before_start_rejected(self, s, match_ctx):
        mid = match_ctx["match"]["match_id"]
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 1})
        assert r.status_code == 400
        assert "not started" in r.json()["detail"].lower()

    def test_start_innings_a(self, s, match_ctx):
        mid = match_ctx["match"]["match_id"]
        A = match_ctx["A"]["players"]; B = match_ctx["B"]["players"]
        r = s.post(f"{API}/matches/{mid}/innings/a/start", headers=match_ctx["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        assert m["status"] == "live"
        assert m["innings_a"]["started"] is True
        assert m["innings_a"]["striker_id"] == A[0]["player_id"]

    def test_wide_and_no_ball_extras(self, s, match_ctx):
        """Wide/no-ball don't count balls but add +1 to team runs."""
        mid = match_ctx["match"]["match_id"]
        # Get current state
        before = s.get(f"{API}/matches/{mid}", headers=match_ctx["headers"]).json()["match"]["innings_a"]
        # Wide
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 0, "extra_type": "wide"})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["balls"] == before["balls"], "wide must not increment balls"
        assert ia["runs"] == before["runs"] + 1, "wide adds +1"

        # No-ball with 2 extra runs = +3
        before = ia
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 2, "extra_type": "no_ball"})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["balls"] == before["balls"]
        assert ia["runs"] == before["runs"] + 3

    def test_bye_increments_ball_and_rotates_strike_on_odd(self, s, match_ctx):
        mid = match_ctx["match"]["match_id"]
        before = s.get(f"{API}/matches/{mid}", headers=match_ctx["headers"]).json()["match"]["innings_a"]
        striker_before = before["striker_id"]; non_striker_before = before["non_striker_id"]
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 1, "extra_type": "bye"})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["balls"] == before["balls"] + 1
        assert ia["runs"] == before["runs"] + 1
        # Odd runs -> strike rotated
        assert ia["striker_id"] == non_striker_before
        assert ia["non_striker_id"] == striker_before

    def test_wicket_flow_requires_new_batsman(self, s, match_ctx):
        mid = match_ctx["match"]["match_id"]
        # Take a wicket (0 runs)
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 0, "wicket": True})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["needs_new_batsman"] is True
        assert ia["wickets"] == 1

        # Next ball without new batsman -> 400
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 1})
        assert r.status_code == 400
        assert "new batsman" in r.json()["detail"].lower()

        # Provide teammate P3 (not already at crease, not dismissed)
        new_bat = match_ctx["A"]["players"][2]["player_id"]
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 0, "new_batsman_id": new_bat})
        assert r.status_code == 200, r.text
        ia = r.json()["match"]["innings_a"]
        assert ia["needs_new_batsman"] is False
        assert new_bat in (ia["striker_id"], ia["non_striker_id"])

    def test_end_of_over_requires_new_bowler(self, s, match_ctx):
        """Fill up to 6 legal balls in innings A total, then check needs_new_bowler."""
        mid = match_ctx["match"]["match_id"]
        # Currently balls = 2 (bye + wicket-ball post new-batsman = 1 more legal). Let's inspect.
        ia = s.get(f"{API}/matches/{mid}", headers=match_ctx["headers"]).json()["match"]["innings_a"]
        need = 6 - ia["balls"]
        assert need > 0
        # Score 'need' dot balls to reach 6 legal
        for _ in range(need):
            r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 0})
            assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["balls"] == 6
        assert ia["needs_new_bowler"] is True

        # Ball without new bowler -> 400
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 0})
        assert r.status_code == 400
        assert "bowler" in r.json()["detail"].lower()

        # Provide new bowler from team B
        new_bowl = match_ctx["B"]["players"][1]["player_id"]
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=match_ctx["headers"], json={"runs": 0, "new_bowler_id": new_bowl})
        assert r.status_code == 200
        assert r.json()["match"]["innings_a"]["bowler_id"] == new_bowl

    def test_innings_auto_completes_at_overs(self, s, match_ctx):
        """Continue scoring dot balls till 30 legal balls => innings_a completed, current='b'."""
        mid = match_ctx["match"]["match_id"]
        headers = match_ctx["headers"]
        B_players = match_ctx["B"]["players"]
        A_players = match_ctx["A"]["players"]
        bowlers = [B_players[i]["player_id"] for i in range(len(B_players))]
        bat_reserve = [p["player_id"] for p in A_players[3:]]

        for _ in range(200):  # safety cap
            m = s.get(f"{API}/matches/{mid}", headers=headers).json()["match"]
            ia = m["innings_a"]
            if ia["completed"]:
                break
            payload = {"runs": 0}
            if ia.get("needs_new_bowler"):
                payload["new_bowler_id"] = bowlers[(ia["balls"] // 6) % len(bowlers)]
            if ia.get("needs_new_batsman"):
                if not bat_reserve:
                    break
                payload["new_batsman_id"] = bat_reserve.pop(0)
            r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=headers, json=payload)
            assert r.status_code == 200, r.text

        m = s.get(f"{API}/matches/{mid}", headers=headers).json()["match"]
        assert m["innings_a"]["completed"] is True
        assert m["innings_a"]["balls"] == 30
        assert m["current_innings"] == "b"

        # Any more ball on side 'a' -> 400
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=headers, json={"runs": 0})
        assert r.status_code == 400
        assert "completed" in r.json()["detail"].lower()

    def test_innings_b_and_match_completion(self, s, match_ctx):
        mid = match_ctx["match"]["match_id"]
        headers = match_ctx["headers"]
        A_players = match_ctx["A"]["players"]
        B_players = match_ctx["B"]["players"]

        # Start innings B
        r = s.post(f"{API}/matches/{mid}/innings/b/start", headers=headers, json={
            "striker_id": B_players[0]["player_id"],
            "non_striker_id": B_players[1]["player_id"],
            "bowler_id": A_players[0]["player_id"],
        })
        assert r.status_code == 200, r.text

        # Score dot balls till completion (30 balls or 10 wickets)
        bowlers = [p["player_id"] for p in A_players]
        for _ in range(200):
            m = s.get(f"{API}/matches/{mid}", headers=headers).json()["match"]
            ib = m["innings_b"]
            if ib["completed"] or m["status"] == "completed":
                break
            payload = {"runs": 0}
            if ib.get("needs_new_bowler"):
                payload["new_bowler_id"] = bowlers[(ib["balls"] // 6) % len(bowlers)]
            r = s.post(f"{API}/matches/{mid}/innings/b/ball", headers=headers, json=payload)
            assert r.status_code == 200, r.text

        m = s.get(f"{API}/matches/{mid}", headers=headers).json()["match"]
        assert m["status"] == "completed", m
        # Team A scored 0 too? Let's check: innings_a runs and innings_b runs after all dots
        ra = m["innings_a"]["runs"]; rb = m["innings_b"]["runs"]
        assert m["result_text"], "result_text should be set"
        if ra == rb:
            assert m["winner_team_id"] is None
        else:
            assert m["winner_team_id"] in (m["team_a_id"], m["team_b_id"])
