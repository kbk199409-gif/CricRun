"""CricTrack backend tests — auth, profile, teams, matches, tournaments (NRR)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bat-bowl-connect-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def auth(s):
    phone = f"+9199{int(time.time()) % 100000000:08d}"
    r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": "123456"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "session_token" in data and "user" in data
    token = data["session_token"]
    return {"token": token, "user": data["user"], "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}


# Auth
class TestAuth:
    def test_send_ok(self, s):
        r = s.post(f"{API}/auth/phone/send", json={"phone": "+911234567890"})
        assert r.status_code == 200
        assert r.json().get("success") is True

    def test_verify_invalid_code(self, s):
        r = s.post(f"{API}/auth/phone/verify", json={"phone": "+911234567890", "code": "12"})
        assert r.status_code == 400

    def test_me_without_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, s, auth):
        r = s.get(f"{API}/auth/me", headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["user"]["user_id"] == auth["user"]["user_id"]


# Profile
class TestProfile:
    def test_update_profile(self, s, auth):
        payload = {"name": "TEST_Rohit", "batting_style": "right_hand", "bowling_style": "pacer", "role": "batsman"}
        r = s.put(f"{API}/profile", headers=auth["headers"], json=payload)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["name"] == "TEST_Rohit"
        assert u["batting_style"] == "right_hand"
        assert u["profile_complete"] is True

        # GET verify persistence
        r = s.get(f"{API}/auth/me", headers=auth["headers"])
        assert r.json()["user"]["profile_complete"] is True


# Teams
class TestTeams:
    def test_create_team_and_add_player(self, s, auth):
        r = s.post(f"{API}/teams", headers=auth["headers"], json={"name": "TEST_Mumbai", "short_name": "MUM"})
        assert r.status_code == 200
        team = r.json()["team"]
        assert team["short_name"] == "MUM"
        team_id = team["team_id"]

        r = s.post(f"{API}/teams/{team_id}/players", headers=auth["headers"], json={"name": "TEST_Player1", "role": "batsman"})
        assert r.status_code == 200
        assert r.json()["player"]["name"] == "TEST_Player1"

        # GET team and verify player persisted
        r = s.get(f"{API}/teams/{team_id}", headers=auth["headers"])
        assert r.status_code == 200
        players = r.json()["team"]["players"]
        assert len(players) == 1

    def test_short_name_defaults(self, s, auth):
        r = s.post(f"{API}/teams", headers=auth["headers"], json={"name": "TEST_Chennai"})
        assert r.status_code == 200
        assert r.json()["team"]["short_name"] == "TES"


# Matches + Tournaments (integration NRR)
@pytest.fixture(scope="module")
def two_teams(s, auth):
    r1 = s.post(f"{API}/teams", headers=auth["headers"], json={"name": "TEST_MI", "short_name": "MI"})
    r2 = s.post(f"{API}/teams", headers=auth["headers"], json={"name": "TEST_CSK", "short_name": "CSK"})
    return r1.json()["team"]["team_id"], r2.json()["team"]["team_id"]


class TestMatches:
    def test_full_match_flow(self, s, auth, two_teams):
        a, b = two_teams
        r = s.post(f"{API}/matches", headers=auth["headers"], json={"team_a_id": a, "team_b_id": b, "overs": 20})
        assert r.status_code == 200, r.text
        match = r.json()["match"]
        assert match["status"] == "live"
        mid = match["match_id"]

        # Update innings A
        r = s.put(f"{API}/matches/{mid}/innings/a", headers=auth["headers"], json={"runs": 180, "wickets": 5, "overs": 20.0})
        assert r.status_code == 200
        assert r.json()["match"]["innings_a"]["runs"] == 180

        # Update innings B (lose)
        r = s.put(f"{API}/matches/{mid}/innings/b", headers=auth["headers"], json={"runs": 150, "wickets": 10, "overs": 18.4})
        assert r.status_code == 200

        # Complete — auto pick winner = team A
        r = s.post(f"{API}/matches/{mid}/complete", headers=auth["headers"], json={})
        assert r.status_code == 200
        m = r.json()["match"]
        assert m["status"] == "completed"
        assert m["winner_team_id"] == a

    def test_invalid_side(self, s, auth, two_teams):
        a, b = two_teams
        r = s.post(f"{API}/matches", headers=auth["headers"], json={"team_a_id": a, "team_b_id": b, "overs": 20})
        mid = r.json()["match"]["match_id"]
        r = s.put(f"{API}/matches/{mid}/innings/x", headers=auth["headers"], json={"runs": 1, "wickets": 0, "overs": 0.1})
        assert r.status_code == 400


class TestTournaments:
    def test_tournament_points_table_with_nrr(self, s, auth, two_teams):
        a, b = two_teams
        # Create tournament
        r = s.post(f"{API}/tournaments", headers=auth["headers"], json={"name": "TEST_IPL", "location": "IN", "format": "T20", "overs": 20})
        assert r.status_code == 200
        tid = r.json()["tournament"]["tournament_id"]

        # Add teams
        r = s.post(f"{API}/tournaments/{tid}/teams/{a}", headers=auth["headers"])
        assert r.status_code == 200
        r = s.post(f"{API}/tournaments/{tid}/teams/{b}", headers=auth["headers"])
        assert r.status_code == 200

        # Create a completed match under the tournament (A wins big)
        r = s.post(f"{API}/matches", headers=auth["headers"], json={"team_a_id": a, "team_b_id": b, "overs": 20, "tournament_id": tid})
        mid = r.json()["match"]["match_id"]
        s.put(f"{API}/matches/{mid}/innings/a", headers=auth["headers"], json={"runs": 200, "wickets": 4, "overs": 20.0})
        s.put(f"{API}/matches/{mid}/innings/b", headers=auth["headers"], json={"runs": 100, "wickets": 10, "overs": 15.0})
        s.post(f"{API}/matches/{mid}/complete", headers=auth["headers"], json={})

        # Get tournament with points table
        r = s.get(f"{API}/tournaments/{tid}", headers=auth["headers"])
        assert r.status_code == 200
        data = r.json()
        pt = data["points_table"]
        assert len(pt) == 2
        # A must be top with 2 pts and positive NRR
        assert pt[0]["team_id"] == a
        assert pt[0]["Pts"] == 2
        assert pt[0]["W"] == 1
        assert pt[0]["NRR"] > 0
        assert pt[1]["team_id"] == b
        assert pt[1]["Pts"] == 0
        assert pt[1]["NRR"] < 0
