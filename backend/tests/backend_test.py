"""CricTrack backend tests — v3 with toss, MoM, undo, per-player stats, public share.
Covers new endpoints:
  POST /api/matches/{id}/toss
  POST /api/matches/{id}/mom
  POST /api/matches/{id}/innings/{side}/undo
  GET  /api/public/matches/{share_token}
  New ball semantics: out_type + fielder_id validation, batter/bowler stats.
"""
import os
import time
import copy
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers ----------
def _fresh_phone(prefix: str = "99988") -> str:
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


def _create_team_with_players(s, headers, name: str, count: int = 5) -> dict:
    r = s.post(f"{API}/teams", headers=headers, json={"name": name})
    assert r.status_code == 200
    team = r.json()["team"]
    players = []
    for i in range(count):
        r = s.post(f"{API}/teams/{team['team_id']}/players", headers=headers, json={"name": f"{name}_P{i+1}", "role": "batsman"})
        assert r.status_code == 200
        players.append(r.json()["player"])
    return {"team": team, "players": players}


def _new_match(s, headers, overs=5, players=5):
    A = _create_team_with_players(s, headers, f"TEST_A_{int(time.time()*1000)%1000000}", players)
    B = _create_team_with_players(s, headers, f"TEST_B_{int(time.time()*1000)%1000000}", players)
    r = s.post(f"{API}/matches", headers=headers, json={
        "team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": overs
    })
    assert r.status_code == 200, r.text
    return {"A": A, "B": B, "match": r.json()["match"], "headers": headers}


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def user_x(s):
    return _signup(s)


# ================= Health =================
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        b = r.json()
        assert b.get("status") == "ok"


# ================= TEST 1 — Toss & share_token =================
class TestTossAndShareToken:
    def test_create_match_has_share_token(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        m = ctx["match"]
        assert m.get("share_token") and len(m["share_token"]) >= 10
        assert m["toss_winner_team_id"] is None
        assert m["toss_decision"] is None
        # default current_innings is "a" before toss
        assert m["current_innings"] == "a"

    def test_toss_bowl_flips_current_innings(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        team_b = ctx["match"]["team_b_id"]
        # A wins toss and elects to BOWL -> B bats first -> current_innings = "b"
        r = s.post(f"{API}/matches/{mid}/toss", headers=user_x["headers"],
                   json={"toss_winner_team_id": team_a, "decision": "bowl"})
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        assert m["toss_winner_team_id"] == team_a
        assert m["toss_decision"] == "bowl"
        assert m["current_innings"] == "b"

    def test_toss_bat_keeps_a(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        r = s.post(f"{API}/matches/{mid}/toss", headers=user_x["headers"],
                   json={"toss_winner_team_id": team_a, "decision": "bat"})
        assert r.status_code == 200
        assert r.json()["match"]["current_innings"] == "a"

    def test_toss_rejects_foreign_team(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        r = s.post(f"{API}/matches/{mid}/toss", headers=user_x["headers"],
                   json={"toss_winner_team_id": "team_bogus_id", "decision": "bat"})
        assert r.status_code == 400


# ================= TEST 2 — Ball recording & per-player stats + validation =================
class TestBallStatsAndValidation:
    def test_four_updates_batter_stats(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        # No toss needed, side=a is default
        r = s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        assert r.status_code == 200

        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"], json={"runs": 4})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["runs"] == 4
        assert ia["balls"] == 1
        bat = ia["batters"][A[0]["player_id"]]
        assert bat["runs"] == 4 and bat["balls"] == 1 and bat["fours"] == 1
        bw = ia["bowlers"][B[0]["player_id"]]
        assert bw["runs"] == 4 and bw["balls"] == 1

    def test_wicket_requires_out_type(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"], json={"runs": 0, "wicket": True})
        assert r.status_code == 400
        assert "how the batsman was out" in r.json()["detail"].lower() or "out" in r.json()["detail"].lower()

    def test_catch_out_requires_fielder(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        # missing fielder_id
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"],
                   json={"runs": 0, "wicket": True, "out_type": "catch_out"})
        assert r.status_code == 400
        assert "fielder" in r.json()["detail"].lower()

        # retry with fielder
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"],
                   json={"runs": 0, "wicket": True, "out_type": "catch_out", "fielder_id": B[2]["player_id"]})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        out_bat = ia["batters"][A[0]["player_id"]]
        assert out_bat["out_type"] == "catch_out"
        assert out_bat["fielder_id"] == B[2]["player_id"]
        assert out_bat["out_by"] == B[0]["player_id"]  # bowler credited
        # bowler gets the wicket for catch_out
        assert ia["bowlers"][B[0]["player_id"]]["wickets"] == 1

    def test_bowled_credits_bowler(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"],
                   json={"runs": 0, "wicket": True, "out_type": "bowled"})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["wickets"] == 1
        assert ia["needs_new_batsman"] is True
        assert ia["bowlers"][B[0]["player_id"]]["wickets"] == 1

    def test_run_out_does_not_credit_bowler_wicket(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"],
                   json={"runs": 0, "wicket": True, "out_type": "run_out", "fielder_id": B[1]["player_id"]})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["wickets"] == 1
        # Bowler NOT credited for run_out
        assert ia["bowlers"][B[0]["player_id"]]["wickets"] == 0


# ================= TEST 3 — Undo =================
class TestUndo:
    def test_undo_restores_state(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        pre = s.get(f"{API}/matches/{mid}", headers=user_x["headers"]).json()["match"]["innings_a"]
        # record a 3 (odd -> rotates)
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"], json={"runs": 3})
        assert r.status_code == 200
        post = r.json()["match"]["innings_a"]
        assert post["runs"] == pre["runs"] + 3
        assert post["balls"] == pre["balls"] + 1
        assert post["striker_id"] != pre["striker_id"]

        # undo
        r = s.post(f"{API}/matches/{mid}/innings/a/undo", headers=user_x["headers"])
        assert r.status_code == 200, r.text
        after = r.json()["match"]["innings_a"]
        assert after["runs"] == pre["runs"]
        assert after["balls"] == pre["balls"]
        assert after["striker_id"] == pre["striker_id"]
        assert after["non_striker_id"] == pre["non_striker_id"]
        assert after["batters"] == pre["batters"]
        assert after["bowlers"] == pre["bowlers"]

    def test_undo_nothing_to_undo(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        r = s.post(f"{API}/matches/{mid}/innings/a/undo", headers=user_x["headers"])
        assert r.status_code == 400


# ================= TEST 4 — Wide/Bye bowler charging =================
class TestExtrasBowlerCharge:
    def test_wide_charges_bowler(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"],
                   json={"runs": 0, "extra_type": "wide"})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["runs"] == 1
        bw = ia["bowlers"][B[0]["player_id"]]
        assert bw["runs"] == 1
        assert bw["extras"] == 1
        assert bw["balls"] == 0
        # striker didn't face
        bat = ia["batters"].get(A[0]["player_id"], {})
        assert bat.get("balls", 0) == 0

    def test_bye_does_not_charge_bowler_runs(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        A, B = ctx["A"]["players"], ctx["B"]["players"]
        s.post(f"{API}/matches/{mid}/innings/a/start", headers=user_x["headers"], json={
            "striker_id": A[0]["player_id"], "non_striker_id": A[1]["player_id"], "bowler_id": B[0]["player_id"]
        })
        r = s.post(f"{API}/matches/{mid}/innings/a/ball", headers=user_x["headers"],
                   json={"runs": 2, "extra_type": "bye"})
        assert r.status_code == 200
        ia = r.json()["match"]["innings_a"]
        assert ia["runs"] == 2
        bw = ia["bowlers"][B[0]["player_id"]]
        assert bw["runs"] == 0
        # striker faced but didn't score
        bat = ia["batters"][A[0]["player_id"]]
        assert bat["balls"] == 1
        assert bat["runs"] == 0


# ================= TEST 5 — Public Share =================
class TestPublicShare:
    def test_public_returns_no_auth(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        token = ctx["match"]["share_token"]
        # Use bare requests without auth headers
        r = requests.get(f"{API}/public/matches/{token}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "match" in data and "team_a" in data and "team_b" in data
        assert data["match"]["share_token"] == token
        # owner_id must NOT leak
        assert "owner_id" not in data["match"]
        assert data["team_a"] and "owner_id" not in data["team_a"]
        assert isinstance(data["team_a"]["players"], list)

    def test_public_404_for_bogus(self, s):
        r = requests.get(f"{API}/public/matches/nonexistent_token")
        assert r.status_code == 404


# ================= TEST 6 — MoM =================
class TestMoM:
    def test_set_mom(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        team_a = ctx["match"]["team_a_id"]
        A = ctx["A"]["players"]
        r = s.post(f"{API}/matches/{mid}/mom", headers=user_x["headers"],
                   json={"player_id": A[0]["player_id"], "team_id": team_a})
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        assert m["man_of_the_match_id"] == A[0]["player_id"]
        assert m["man_of_the_match_team_id"] == team_a

        # Verify persistence
        r = s.get(f"{API}/matches/{mid}", headers=user_x["headers"])
        m = r.json()["match"]
        assert m["man_of_the_match_id"] == A[0]["player_id"]

    def test_mom_rejects_foreign_team(self, s, user_x):
        ctx = _new_match(s, user_x["headers"])
        mid = ctx["match"]["match_id"]
        r = s.post(f"{API}/matches/{mid}/mom", headers=user_x["headers"],
                   json={"player_id": "p_x", "team_id": "team_bogus"})
        assert r.status_code == 400


# ================= TEST 7 — Tournament date format =================
class TestTournamentDate:
    def test_iso_date_persists(self, s, user_x):
        r = s.post(f"{API}/tournaments", headers=user_x["headers"],
                   json={"name": "TEST_DateT", "overs": 5, "start_date": "2026-03-09", "end_date": "2026-03-10"})
        assert r.status_code == 200
        t = r.json()["tournament"]
        tid = t["tournament_id"]
        assert t["start_date"] == "2026-03-09"
        r = s.get(f"{API}/tournaments/{tid}", headers=user_x["headers"])
        assert r.json()["tournament"]["start_date"] == "2026-03-09"


# ================= Small OTP smoke =================
class TestOTP:
    def test_send_returns_dev_code(self, s):
        phone = _fresh_phone("77766")
        r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
        assert r.status_code == 200
        assert "dev_code" in r.json()
