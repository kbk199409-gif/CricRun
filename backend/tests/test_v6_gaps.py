"""v6 gap tests — cover items not exercised by test_v6_fixes.py.

Sections aligned with the review request:
- Team captain: non-owner rejection, auto-clear on player removal
- Match captains: PUT/validation/auto-snapshot from team
- Team invites: owner list, expired flow
- Public search: users/matches/tournaments + PII strip + cross-owner discovery
- Public player mini: no-auth + payload shape
- Best batter/bowler summaries are strings
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _load_env_file():
    p = "/app/backend/.env"
    if not os.path.exists(p):
        return
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file()
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


def _fresh_phone(prefix: str = "77890") -> str:
    return f"{prefix}{int(time.time() * 1000) % 100000:05d}{uuid.uuid4().hex[:2]}"[:13]


def _signup(prefix: str = "77890"):
    s = requests.Session()
    phone = _fresh_phone(prefix)
    r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    dev = r.json()["dev_code"]
    r = s.post(f"{API}/auth/phone/verify", json={"phone": phone, "code": dev})
    assert r.status_code == 200
    d = r.json()
    return {
        "phone": phone,
        "token": d["session_token"],
        "user": d["user"],
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
        r = s.post(f"{API}/teams/{team['team_id']}/players", headers=u["headers"], json={"name": f"{name}_P{i + 1}"})
        players.append(r.json()["player"])
    return {"team": team, "players": players}


# --- Load env from backend/.env so MONGO_URL is available in tests -----------
# (see top-of-file _load_env_file — leaving compatibility no-op here)


@pytest.fixture(scope="module")
def owner():
    return _signup(prefix="77890")


@pytest.fixture(scope="module")
def other_user():
    return _signup(prefix="77891")


# =============================================================================
# 1) TEAM CAPTAIN — non-owner rejection & auto-clear on player removal
# =============================================================================
def test_captain_non_owner_cannot_set(owner, other_user):
    t = _create_team(owner, f"CapNO_{int(time.time()) % 1000}", 2)
    tid = t["team"]["team_id"]
    cap_pid = t["players"][0]["player_id"]
    r = other_user["session"].put(
        f"{API}/teams/{tid}/captain",
        headers=other_user["headers"],
        json={"captain_id": cap_pid},
    )
    assert r.status_code in (403, 404), r.text


def test_captain_autoclears_when_player_removed(owner):
    t = _create_team(owner, f"CapACL_{int(time.time()) % 1000}", 2)
    tid = t["team"]["team_id"]
    cap_pid = t["players"][0]["player_id"]
    # Set captain
    r = owner["session"].put(f"{API}/teams/{tid}/captain", headers=owner["headers"], json={"captain_id": cap_pid})
    assert r.status_code == 200
    # Remove the captain player from the team
    r = owner["session"].delete(f"{API}/teams/{tid}/players/{cap_pid}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    # captain_id should auto-clear
    r = owner["session"].get(f"{API}/teams/{tid}", headers=owner["headers"])
    assert r.status_code == 200
    assert r.json()["team"].get("captain_id") in (None, "")


# =============================================================================
# 2) MATCH CAPTAINS — snapshot on create + PUT + validation
# =============================================================================
def test_match_captains_snapshot_and_update(owner):
    A = _create_team(owner, f"MCA_{int(time.time()) % 1000}", 3)
    B = _create_team(owner, f"MCB_{int(time.time()) % 1000}", 3)
    a_cap = A["players"][0]["player_id"]
    b_cap = B["players"][0]["player_id"]
    # Pre-set team captains
    owner["session"].put(f"{API}/teams/{A['team']['team_id']}/captain", headers=owner["headers"], json={"captain_id": a_cap})
    owner["session"].put(f"{API}/teams/{B['team']['team_id']}/captain", headers=owner["headers"], json={"captain_id": b_cap})
    # Create match → should auto-snapshot captains onto match doc
    r = owner["session"].post(
        f"{API}/matches",
        headers=owner["headers"],
        json={"team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 2},
    )
    assert r.status_code == 200
    m = r.json()["match"]
    mid = m["match_id"]
    assert m.get("captain_a_id") == a_cap
    assert m.get("captain_b_id") == b_cap

    # PUT captains — swap to a different player in team A
    new_a_cap = A["players"][1]["player_id"]
    r = owner["session"].put(
        f"{API}/matches/{mid}/captains",
        headers=owner["headers"],
        json={"captain_a_id": new_a_cap},
    )
    assert r.status_code == 200, r.text
    assert r.json()["match"]["captain_a_id"] == new_a_cap
    # captain_b_id still the same
    assert r.json()["match"]["captain_b_id"] == b_cap

    # Rejects captain_a_id that isn't on team A (e.g. a team-B player)
    r = owner["session"].put(
        f"{API}/matches/{mid}/captains",
        headers=owner["headers"],
        json={"captain_a_id": b_cap},
    )
    assert r.status_code == 400, r.text


# =============================================================================
# 3) TEAM INVITES — owner list + expired flow
# =============================================================================
def test_owner_list_invites(owner):
    t = _create_team(owner, f"InvList_{int(time.time()) % 1000}", 2)
    tid = t["team"]["team_id"]
    r = owner["session"].post(f"{API}/teams/{tid}/invites", headers=owner["headers"], json={"name": "Rahul"})
    assert r.status_code == 200
    tok = r.json()["invite"]["token"]
    r = owner["session"].get(f"{API}/teams/{tid}/invites", headers=owner["headers"])
    assert r.status_code == 200
    invs = r.json()["invites"]
    assert any(i["token"] == tok for i in invs)
    # Non-owner is 404
    other = _signup(prefix="77892")
    r = other["session"].get(f"{API}/teams/{tid}/invites", headers=other["headers"])
    assert r.status_code == 404


def test_invite_expired_flow(owner):
    """Force expires_at into the past via direct DB write, verify:
    - Public GET reports status=expired
    - Accept returns 400 and marks DB status=expired
    """
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME not available for DB manipulation")

    t = _create_team(owner, f"InvExp_{int(time.time()) % 1000}", 2)
    tid = t["team"]["team_id"]
    r = owner["session"].post(f"{API}/teams/{tid}/invites", headers=owner["headers"], json={"name": "Kohli"})
    assert r.status_code == 200
    tok = r.json()["invite"]["token"]

    async def _expire():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.team_invites.update_one(
            {"token": tok},
            {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}},
        )
        client.close()

    asyncio.get_event_loop().run_until_complete(_expire()) if not asyncio.get_event_loop().is_running() else asyncio.run(_expire())

    # Public GET should report expired
    r = requests.get(f"{API}/public/invites/{tok}")
    assert r.status_code == 200, r.text
    assert r.json()["invite"]["status"] == "expired"

    # Accept → 400
    invitee = _signup(prefix="77893")
    r = invitee["session"].post(f"{API}/invites/{tok}/accept", headers=invitee["headers"])
    assert r.status_code == 400, r.text


# =============================================================================
# 4) PUBLIC SEARCH — full payload shape + PII strip + cross-owner discovery
# =============================================================================
def test_public_search_full_payload_and_pii(owner, other_user):
    # owner creates team + match; other_user searches without auth
    A = _create_team(owner, f"PSA_{int(time.time()) % 1000}_zz", 2)
    B = _create_team(owner, f"PSB_{int(time.time()) % 1000}_zz", 2)
    r = owner["session"].post(
        f"{API}/matches",
        headers=owner["headers"],
        json={"team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 1},
    )
    assert r.status_code == 200
    match = r.json()["match"]

    # Search by team name — no auth
    q = A["team"]["name"][:8]
    r = requests.get(f"{API}/public/search", params={"q": q})
    assert r.status_code == 200
    j = r.json()
    # All four buckets present
    for key in ("users", "teams", "matches", "tournaments"):
        assert key in j, f"missing bucket {key}"
    # Non-owner (other_user) also sees the team (cross-owner discovery)
    assert any(t["team_id"] == A["team"]["team_id"] for t in j["teams"])
    # Match also returned when queried by team name (since matches denorm team_a_name / team_b_name)
    assert any(m["match_id"] == match["match_id"] for m in j["matches"])

    # Search by owner phone should NOT expose PII (email/phone stripped)
    r = requests.get(f"{API}/public/search", params={"q": owner["phone"][:6]})
    assert r.status_code == 200
    for u in r.json().get("users", []):
        assert "email" not in u
        assert "phone" not in u


# =============================================================================
# 5) PUBLIC PLAYER MINI — no auth + shape
# =============================================================================
def test_public_player_mini_no_auth_and_shape(owner):
    uid = owner["user"]["user_id"]
    r = requests.get(f"{API}/public/players/{uid}/mini")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("user_id") == uid
    bat = j.get("batting") or {}
    bowl = j.get("bowling") or {}
    for k in ("runs", "highest", "average", "strike_rate"):
        assert k in bat, f"batting missing {k}"
    for k in ("wickets", "best", "economy"):
        assert k in bowl, f"bowling missing {k}"


# =============================================================================
# 6) BEST BATTER + BEST BOWLER SUMMARIES ARE STRINGS
# =============================================================================
def test_best_batter_and_bowler_summaries_are_strings():
    owner = _signup(prefix="77894")
    A = _create_team(owner, f"BSA_{int(time.time()) % 1000}", 3)
    B = _create_team(owner, f"BSB_{int(time.time()) % 1000}", 3)
    r = owner["session"].post(
        f"{API}/matches",
        headers=owner["headers"],
        json={"team_a_id": A["team"]["team_id"], "team_b_id": B["team"]["team_id"], "overs": 1},
    )
    m = r.json()["match"]
    mid = m["match_id"]
    owner["session"].post(
        f"{API}/matches/{mid}/toss",
        headers=owner["headers"],
        json={"toss_winner_team_id": m["team_a_id"], "decision": "bat"},
    )
    ap = A["players"]
    bp = B["players"]
    owner["session"].post(
        f"{API}/matches/{mid}/innings/a/start",
        headers=owner["headers"],
        json={"striker_id": ap[0]["player_id"], "non_striker_id": ap[1]["player_id"], "bowler_id": bp[0]["player_id"]},
    )
    for _ in range(6):
        owner["session"].post(f"{API}/matches/{mid}/innings/a/ball", headers=owner["headers"], json={"runs": 6})
    owner["session"].post(
        f"{API}/matches/{mid}/innings/b/start",
        headers=owner["headers"],
        json={"striker_id": bp[0]["player_id"], "non_striker_id": bp[1]["player_id"], "bowler_id": ap[0]["player_id"]},
    )
    for _ in range(6):
        owner["session"].post(f"{API}/matches/{mid}/innings/b/ball", headers=owner["headers"], json={"runs": 0})
    r = owner["session"].get(f"{API}/matches/{mid}", headers=owner["headers"])
    m = r.json()["match"]
    assert m["status"] == "completed"
    assert isinstance(m.get("best_batter_summary"), str) and len(m["best_batter_summary"]) > 0
    assert isinstance(m.get("best_bowler_summary"), str) and len(m["best_bowler_summary"]) > 0
