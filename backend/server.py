from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, random, httpx, requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "crictrack")
# Dev mode returns the generated OTP in the API response so testers can log in
# without a real SMS provider. In production, set OTP_DEV_MODE=false and wire an
# SMS provider in the send endpoint.
OTP_DEV_MODE = os.environ.get("OTP_DEV_MODE", "true").lower() != "false"
OTP_TTL_MIN = 5
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SEC = 30

storage_key = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============ MODELS ============
class User(BaseModel):
    user_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    name: str = ""
    picture: Optional[str] = None
    profile_picture_path: Optional[str] = None
    batting_style: Optional[str] = None
    bowling_style: Optional[str] = None
    role: Optional[str] = None
    profile_complete: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SessionExchange(BaseModel):
    session_id: str

class PhoneSendRequest(BaseModel):
    phone: str

class PhoneVerifyRequest(BaseModel):
    phone: str
    code: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    batting_style: Optional[str] = None
    bowling_style: Optional[str] = None
    role: Optional[str] = None
    profile_picture_path: Optional[str] = None

class TeamCreate(BaseModel):
    name: str
    short_name: Optional[str] = None

class PlayerAdd(BaseModel):
    # If user_id given -> link a registered user. Else guest by name.
    user_id: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None

class TournamentCreate(BaseModel):
    name: str
    location: Optional[str] = None
    overs: int = 20
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class MatchCreate(BaseModel):
    team_a_id: str
    team_b_id: str
    overs: int = 20
    tournament_id: Optional[str] = None
    venue: Optional[str] = None

class InningsStart(BaseModel):
    striker_id: str        # player_id from batting team
    non_striker_id: str
    bowler_id: str         # player_id from bowling team

class BallInput(BaseModel):
    runs: int = 0                            # off the bat OR added to team via bye/lb; base for wide/nb
    extra_type: Literal["none","wide","no_ball","bye","leg_bye"] = "none"
    wicket: bool = False
    out_batsman_id: Optional[str] = None     # if omitted, striker is out
    new_batsman_id: Optional[str] = None     # required when innings needs_new_batsman
    new_bowler_id: Optional[str] = None      # required when innings needs_new_bowler
    swap_strike: bool = False                # for end-of-over placement override (rare)


# ============ AUTH HELPERS ============
async def get_user_from_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = authorization.replace("Bearer ", "").strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def create_session_for_user(user_id: str) -> str:
    session_token = f"tok_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    return session_token


def _norm_phone(p: str) -> str:
    p = (p or "").strip().replace(" ", "").replace("-", "")
    if not p.startswith("+") and len(p) == 10 and p.isdigit():
        p = "+91" + p
    return p


# ============ AUTH ENDPOINTS ============
@api_router.post("/auth/session")
async def auth_session(payload: SessionExchange):
    session_id = payload.session_id
    async with httpx.AsyncClient(timeout=30) as ac:
        r = await ac.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = r.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture")
    provider_session_token = data.get("session_token")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name or existing.get("name"), "picture": picture or existing.get("picture")}})
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = User(user_id=user_id, email=email, name=name, picture=picture).dict()
        await db.users.insert_one(user_doc.copy())
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})

    await db.user_sessions.insert_one({
        "session_token": provider_session_token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    return {"session_token": provider_session_token, "user": user}


@api_router.post("/auth/phone/send")
async def phone_send(payload: PhoneSendRequest):
    phone = _norm_phone(payload.phone)
    if not phone or len(phone) < 8:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    now = datetime.now(timezone.utc)
    existing = await db.phone_otps.find_one({"phone": phone}, {"_id": 0})
    if existing:
        last_sent = existing.get("last_sent_at")
        if last_sent and last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        if last_sent and (now - last_sent).total_seconds() < OTP_RESEND_COOLDOWN_SEC:
            wait = OTP_RESEND_COOLDOWN_SEC - int((now - last_sent).total_seconds())
            raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another OTP")

    code = f"{random.randint(0, 999999):06d}"
    expires_at = now + timedelta(minutes=OTP_TTL_MIN)
    await db.phone_otps.update_one(
        {"phone": phone},
        {"$set": {
            "phone": phone,
            "code": code,
            "expires_at": expires_at,
            "attempts": 0,
            "last_sent_at": now,
        }},
        upsert=True,
    )
    resp: Dict[str, Any] = {"success": True, "message": f"OTP sent. Valid for {OTP_TTL_MIN} minutes."}
    if OTP_DEV_MODE:
        # Development helper: expose the OTP so testers can complete the flow.
        resp["dev_code"] = code
    else:
        # TODO(prod): send `code` via SMS provider here.
        pass
    return resp


@api_router.post("/auth/phone/verify")
async def phone_verify(payload: PhoneVerifyRequest):
    phone = _norm_phone(payload.phone)
    code = (payload.code or "").strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Enter a valid 6-digit code")

    rec = await db.phone_otps.find_one({"phone": phone}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP requested for this number. Please request one first.")

    exp = rec.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        await db.phone_otps.delete_one({"phone": phone})
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    attempts = int(rec.get("attempts") or 0)
    if attempts >= OTP_MAX_ATTEMPTS:
        await db.phone_otps.delete_one({"phone": phone})
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new OTP.")

    if code != rec.get("code"):
        await db.phone_otps.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # Success — consume OTP.
    await db.phone_otps.delete_one({"phone": phone})

    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = User(user_id=user_id, phone=phone, name=f"Player {phone[-4:]}").dict()
        await db.users.insert_one(user_doc.copy())
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    token = await create_session_for_user(user_id)
    return {"session_token": token, "user": user}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    return {"user": user}


@api_router.put("/profile")
async def update_profile(payload: ProfileUpdate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        merged = {**user, **update}
        if merged.get("batting_style") and merged.get("bowling_style") and merged.get("name"):
            update["profile_complete"] = True
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"user": fresh}


# ============ USERS SEARCH ============
@api_router.get("/users/search")
async def search_users(q: str = "", authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    q = (q or "").strip()
    if len(q) < 2:
        return {"users": []}
    # Match name (partial, case-insensitive) or phone/email exact-ish
    regex = {"$regex": q, "$options": "i"}
    cursor = db.users.find(
        {"$or": [{"name": regex}, {"phone": regex}, {"email": regex}]},
        {"_id": 0, "user_id": 1, "name": 1, "phone": 1, "email": 1, "picture": 1, "profile_picture_path": 1, "batting_style": 1, "bowling_style": 1, "role": 1},
    ).limit(20)
    users = await cursor.to_list(20)
    return {"users": users}


# ============ FILE UPLOAD ============
@api_router.post("/upload/profile-picture")
async def upload_profile_picture(file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    data = await file.read()
    ext = (file.filename or "img").split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "image/jpeg"
    result = await run_in_threadpool(put_object, path, data, content_type)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"profile_picture_path": path}})
    return {"path": path, "size": result.get("size")}


@api_router.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = None, authorization: Optional[str] = Header(None)):
    auth_header = f"Bearer {token}" if token else authorization
    await get_user_from_token(auth_header)
    content, ct = await run_in_threadpool(get_object, path)
    return Response(content=content, media_type=ct)


# ============ TEAMS ============
@api_router.post("/teams")
async def create_team(payload: TeamCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team_id = f"team_{uuid.uuid4().hex[:10]}"
    team = {
        "team_id": team_id,
        "name": payload.name,
        "short_name": (payload.short_name or payload.name[:3]).upper(),
        "owner_id": user["user_id"],
        "players": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.teams.insert_one(team.copy())
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    return {"team": team}


@api_router.get("/teams")
async def list_teams(authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    # Include teams the user owns AND teams they are in.
    teams = await db.teams.find(
        {"$or": [{"owner_id": user["user_id"]}, {"players.user_id": user["user_id"]}]},
        {"_id": 0},
    ).to_list(500)
    return {"teams": teams}


@api_router.get("/teams/{team_id}")
async def get_team(team_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"team": team}


@api_router.post("/teams/{team_id}/players")
async def add_player(team_id: str, payload: PlayerAdd, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team or team["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Team not found")

    player: Dict[str, Any] = {"player_id": f"p_{uuid.uuid4().hex[:8]}"}
    if payload.user_id:
        # Prevent duplicate: same registered user already on this team
        for p in team.get("players", []):
            if p.get("user_id") == payload.user_id:
                raise HTTPException(status_code=400, detail="This user is already on the team")
        u = await db.users.find_one({"user_id": payload.user_id}, {"_id": 0})
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        player.update({
            "user_id": u["user_id"],
            "name": u.get("name") or "Player",
            "role": u.get("role"),
            "batting_style": u.get("batting_style"),
            "bowling_style": u.get("bowling_style"),
            "picture": u.get("picture"),
            "profile_picture_path": u.get("profile_picture_path"),
        })
    else:
        nm = (payload.name or "").strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Name required")
        player.update({"user_id": None, "name": nm, "role": payload.role})

    await db.teams.update_one({"team_id": team_id}, {"$push": {"players": player}})
    return {"player": player}


@api_router.delete("/teams/{team_id}/players/{player_id}")
async def remove_player(team_id: str, player_id: str, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team or team["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Team not found")
    res = await db.teams.update_one({"team_id": team_id}, {"$pull": {"players": {"player_id": player_id}}})
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    return {"success": True}


# ============ TOURNAMENTS ============
@api_router.post("/tournaments")
async def create_tournament(payload: TournamentCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    t_id = f"trn_{uuid.uuid4().hex[:10]}"
    tournament = {
        "tournament_id": t_id,
        "name": payload.name,
        "location": payload.location,
        "overs": int(payload.overs),
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "owner_id": user["user_id"],
        "team_ids": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.tournaments.insert_one(tournament.copy())
    tournament = await db.tournaments.find_one({"tournament_id": t_id}, {"_id": 0})
    return {"tournament": tournament}


@api_router.get("/tournaments")
async def list_tournaments(authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    trns = await db.tournaments.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(500)
    return {"tournaments": trns}


@api_router.post("/tournaments/{t_id}/teams/{team_id}")
async def add_team_to_tournament(t_id: str, team_id: str, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    trn = await db.tournaments.find_one({"tournament_id": t_id}, {"_id": 0})
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not trn or not team:
        raise HTTPException(status_code=404, detail="Not found")
    if trn["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not owner")
    if team_id in trn.get("team_ids", []):
        return {"success": True}
    await db.tournaments.update_one({"tournament_id": t_id}, {"$push": {"team_ids": team_id}})
    return {"success": True}


@api_router.get("/tournaments/{t_id}")
async def get_tournament(t_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    trn = await db.tournaments.find_one({"tournament_id": t_id}, {"_id": 0})
    if not trn:
        raise HTTPException(status_code=404, detail="Not found")
    teams = await db.teams.find({"team_id": {"$in": trn.get("team_ids", [])}}, {"_id": 0}).to_list(500)
    matches = await db.matches.find({"tournament_id": t_id}, {"_id": 0}).to_list(500)

    stats: Dict[str, Dict[str, Any]] = {t["team_id"]: {
        "team_id": t["team_id"], "name": t["name"], "short_name": t["short_name"],
        "P": 0, "W": 0, "L": 0, "T": 0, "Pts": 0,
        "runs_for": 0, "balls_for": 0, "runs_against": 0, "balls_against": 0,
    } for t in teams}
    max_balls = trn.get("overs", 20) * 6

    def _bat_balls(ing: dict) -> int:
        b = int(ing.get("balls") or 0)
        if int(ing.get("wickets") or 0) >= 10:
            return max_balls
        return b if b > 0 else max_balls

    for m in matches:
        if m.get("status") != "completed":
            continue
        a = m["team_a_id"]; b = m["team_b_id"]
        if a not in stats or b not in stats:
            continue
        ia = m.get("innings_a", {})
        ib = m.get("innings_b", {})
        ra = int(ia.get("runs") or 0); rb = int(ib.get("runs") or 0)
        ba = _bat_balls(ia); bb = _bat_balls(ib)

        stats[a]["P"] += 1; stats[b]["P"] += 1
        stats[a]["runs_for"] += ra; stats[a]["balls_for"] += ba
        stats[a]["runs_against"] += rb; stats[a]["balls_against"] += bb
        stats[b]["runs_for"] += rb; stats[b]["balls_for"] += bb
        stats[b]["runs_against"] += ra; stats[b]["balls_against"] += ba

        w = m.get("winner_team_id")
        if w == a:
            stats[a]["W"] += 1; stats[a]["Pts"] += 2; stats[b]["L"] += 1
        elif w == b:
            stats[b]["W"] += 1; stats[b]["Pts"] += 2; stats[a]["L"] += 1
        else:
            stats[a]["T"] += 1; stats[b]["T"] += 1
            stats[a]["Pts"] += 1; stats[b]["Pts"] += 1

    table = []
    for s in stats.values():
        of = s["balls_for"] / 6 if s["balls_for"] else 0
        oa = s["balls_against"] / 6 if s["balls_against"] else 0
        rf = (s["runs_for"] / of) if of else 0
        ra = (s["runs_against"] / oa) if oa else 0
        s["NRR"] = round(rf - ra, 3)
        table.append(s)
    table.sort(key=lambda x: (-x["Pts"], -x["NRR"]))
    return {"tournament": trn, "teams": teams, "matches": matches, "points_table": table}


# ============ MATCHES ============
def _blank_innings() -> dict:
    return {
        "runs": 0, "wickets": 0, "balls": 0,
        "started": False, "completed": False,
        "striker_id": None, "non_striker_id": None, "bowler_id": None,
        "batted_ids": [],           # all players who came on strike (for scorecard)
        "dismissed_ids": [],
        "needs_new_batsman": False,
        "needs_new_bowler": False,
        "last_ball": None,
    }


@api_router.post("/matches")
async def create_match(payload: MatchCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team_a = await db.teams.find_one({"team_id": payload.team_a_id}, {"_id": 0})
    team_b = await db.teams.find_one({"team_id": payload.team_b_id}, {"_id": 0})
    if not team_a or not team_b:
        raise HTTPException(status_code=404, detail="Team not found")
    if payload.team_a_id == payload.team_b_id:
        raise HTTPException(status_code=400, detail="Teams must be different")
    match_id = f"mch_{uuid.uuid4().hex[:10]}"
    match = {
        "match_id": match_id,
        "team_a_id": payload.team_a_id, "team_b_id": payload.team_b_id,
        "team_a_name": team_a["name"], "team_b_name": team_b["name"],
        "team_a_short": team_a["short_name"], "team_b_short": team_b["short_name"],
        "overs": int(payload.overs),
        "tournament_id": payload.tournament_id,
        "venue": payload.venue,
        "owner_id": user["user_id"],
        "status": "created",                  # created -> live -> completed
        "current_innings": "a",
        "innings_a": _blank_innings(),
        "innings_b": _blank_innings(),
        "winner_team_id": None,
        "result_text": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.matches.insert_one(match.copy())
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    return {"match": match}


@api_router.get("/matches")
async def list_matches(authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    matches = await db.matches.find({"owner_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"matches": matches}


@api_router.get("/matches/{match_id}")
async def get_match(match_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return {"match": m}


async def _get_owner_match(match_id: str, user_id: str) -> dict:
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not m or m["owner_id"] != user_id:
        raise HTTPException(status_code=404, detail="Match not found")
    return m


def _batting_team_id(match: dict, side: str) -> str:
    return match["team_a_id"] if side == "a" else match["team_b_id"]


async def _team_player_ids(team_id: str) -> Dict[str, str]:
    t = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    return {p["player_id"]: p.get("name") or "Player" for p in (t or {}).get("players", [])}


@api_router.post("/matches/{match_id}/innings/{side}/start")
async def start_innings(match_id: str, side: str, payload: InningsStart, authorization: Optional[str] = Header(None)):
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Invalid side")
    user = await get_user_from_token(authorization)
    match = await _get_owner_match(match_id, user["user_id"])
    if match.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Match completed")

    bat_team = _batting_team_id(match, side)
    bowl_team = match["team_b_id"] if side == "a" else match["team_a_id"]
    bat_ids = await _team_player_ids(bat_team)
    bowl_ids = await _team_player_ids(bowl_team)

    if payload.striker_id not in bat_ids or payload.non_striker_id not in bat_ids:
        raise HTTPException(status_code=400, detail="Striker/non-striker must be from batting team")
    if payload.striker_id == payload.non_striker_id:
        raise HTTPException(status_code=400, detail="Striker and non-striker must be different players")
    if payload.bowler_id not in bowl_ids:
        raise HTTPException(status_code=400, detail="Bowler must be from bowling team")

    innings = match["innings_a"] if side == "a" else match["innings_b"]
    if innings.get("started"):
        raise HTTPException(status_code=400, detail="Innings already started")
    innings.update({
        "started": True,
        "striker_id": payload.striker_id,
        "non_striker_id": payload.non_striker_id,
        "bowler_id": payload.bowler_id,
        "batted_ids": [payload.striker_id, payload.non_striker_id],
        "needs_new_batsman": False,
        "needs_new_bowler": False,
    })
    field = "innings_a" if side == "a" else "innings_b"
    await db.matches.update_one({"match_id": match_id}, {"$set": {field: innings, "status": "live", "current_innings": side}})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


@api_router.post("/matches/{match_id}/innings/{side}/ball")
async def record_ball(match_id: str, side: str, payload: BallInput, authorization: Optional[str] = Header(None)):
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Invalid side")
    user = await get_user_from_token(authorization)
    match = await _get_owner_match(match_id, user["user_id"])
    if match.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Match completed")

    field = "innings_a" if side == "a" else "innings_b"
    innings = match[field]
    if not innings.get("started"):
        raise HTTPException(status_code=400, detail="Innings has not started. Set opening players first.")
    if innings.get("completed"):
        raise HTTPException(status_code=400, detail="Innings already completed")

    max_balls = int(match["overs"]) * 6
    bat_team = _batting_team_id(match, side)
    bowl_team = match["team_b_id"] if side == "a" else match["team_a_id"]
    bat_players = await _team_player_ids(bat_team)
    bowl_players = await _team_player_ids(bowl_team)

    # Handle new batsman if pending (from previous wicket)
    if innings.get("needs_new_batsman"):
        if not payload.new_batsman_id:
            raise HTTPException(status_code=400, detail="Select the new batsman first")
        if payload.new_batsman_id not in bat_players:
            raise HTTPException(status_code=400, detail="New batsman must be from batting team")
        if payload.new_batsman_id in innings.get("dismissed_ids", []):
            raise HTTPException(status_code=400, detail="This batsman is already out")
        if payload.new_batsman_id in (innings.get("striker_id"), innings.get("non_striker_id")):
            raise HTTPException(status_code=400, detail="This batsman is already at the crease")
        # The dismissed batsman's slot is empty (we cleared it when wicket happened).
        if innings.get("striker_id") is None:
            innings["striker_id"] = payload.new_batsman_id
        else:
            innings["non_striker_id"] = payload.new_batsman_id
        if payload.new_batsman_id not in innings["batted_ids"]:
            innings["batted_ids"].append(payload.new_batsman_id)
        innings["needs_new_batsman"] = False

    # Handle new bowler if pending (end of over)
    if innings.get("needs_new_bowler"):
        if not payload.new_bowler_id:
            raise HTTPException(status_code=400, detail="Select the next over's bowler first")
        if payload.new_bowler_id not in bowl_players:
            raise HTTPException(status_code=400, detail="Bowler must be from bowling team")
        # (Rule: same bowler can't bowl consecutive overs, but we don't enforce that here.)
        innings["bowler_id"] = payload.new_bowler_id
        innings["needs_new_bowler"] = False

    # Now record the ball.
    extra = payload.extra_type or "none"
    runs = max(0, int(payload.runs or 0))
    legal = extra not in ("wide", "no_ball")

    # Team runs accounting
    team_runs = runs
    if extra == "wide" or extra == "no_ball":
        team_runs = runs + 1  # 1 extra for the wide/no-ball itself + any additional runs

    innings["runs"] = int(innings["runs"]) + team_runs

    # Strike rotation on odd runs (runs off the bat, bye, or leg-bye)
    rotate = False
    if extra in ("none", "bye", "leg_bye"):
        rotate = (runs % 2 == 1)
    # No strike rotation for wide/no-ball unless additional runs are odd
    if extra in ("wide", "no_ball"):
        rotate = (runs % 2 == 1)

    # Wicket handling
    dismissed_now = None
    if payload.wicket:
        # Ignore wickets on no-ball (only run-out is possible, but keep simple: reject)
        if extra == "no_ball":
            raise HTTPException(status_code=400, detail="Wicket cannot be recorded on a no-ball in this app")
        innings["wickets"] = int(innings["wickets"]) + 1
        out_id = payload.out_batsman_id or innings.get("striker_id")
        dismissed_now = out_id
        if out_id and out_id not in innings["dismissed_ids"]:
            innings["dismissed_ids"].append(out_id)
        # Clear the dismissed slot
        if out_id == innings.get("striker_id"):
            innings["striker_id"] = None
        elif out_id == innings.get("non_striker_id"):
            innings["non_striker_id"] = None
        innings["needs_new_batsman"] = True

    # Increment legal balls
    if legal:
        innings["balls"] = int(innings["balls"]) + 1

    innings["last_ball"] = {
        "runs": runs, "extra_type": extra, "wicket": bool(payload.wicket),
        "team_runs": team_runs, "dismissed": dismissed_now, "legal": legal,
        "at": datetime.now(timezone.utc).isoformat(),
    }

    # End of over: swap strike, ask for new bowler
    if legal and innings["balls"] % 6 == 0 and innings["balls"] < max_balls:
        if innings.get("striker_id") and innings.get("non_striker_id"):
            innings["striker_id"], innings["non_striker_id"] = innings["non_striker_id"], innings["striker_id"]
        innings["needs_new_bowler"] = True

    # Strike rotation on runs (BEFORE any over-end swap? Standard cricket: rotate on run then over-end swap.)
    # Simplification: apply rotate after runs, and then over-end swap already handled above.
    if rotate and not payload.wicket and innings.get("striker_id") and innings.get("non_striker_id"):
        innings["striker_id"], innings["non_striker_id"] = innings["non_striker_id"], innings["striker_id"]

    if payload.swap_strike and innings.get("striker_id") and innings.get("non_striker_id"):
        innings["striker_id"], innings["non_striker_id"] = innings["non_striker_id"], innings["striker_id"]

    # End innings conditions
    all_out = innings["wickets"] >= 10
    overs_done = innings["balls"] >= max_balls
    target = None
    if side == "b":
        target = int(match["innings_a"]["runs"]) + 1
        if innings["runs"] >= target:
            innings["completed"] = True

    if all_out or overs_done:
        innings["completed"] = True

    updates = {field: innings}

    # If innings completed & match should complete
    if innings["completed"]:
        if side == "a":
            # Move to 2nd innings (still 'live' but next side needs a start)
            updates["current_innings"] = "b"
        else:
            # Match complete
            ra = match["innings_a"]["runs"]
            rb = innings["runs"]
            winner = None; text = "Match Tied"
            if ra > rb:
                winner = match["team_a_id"]
                text = f"{match['team_a_name']} won by {ra - rb} runs"
            elif rb > ra:
                winner = match["team_b_id"]
                wkts_left = 10 - int(innings["wickets"])
                text = f"{match['team_b_name']} won by {wkts_left} wickets"
            updates["status"] = "completed"
            updates["winner_team_id"] = winner
            updates["result_text"] = text

    await db.matches.update_one({"match_id": match_id}, {"$set": updates})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


@api_router.post("/matches/{match_id}/complete")
async def complete_match(match_id: str, authorization: Optional[str] = Header(None)):
    """Manually end the match (e.g. rain-abandoned). Uses current scores to pick a winner."""
    user = await get_user_from_token(authorization)
    m = await _get_owner_match(match_id, user["user_id"])
    ra = int(m["innings_a"].get("runs") or 0)
    rb = int(m["innings_b"].get("runs") or 0)
    if ra > rb: winner = m["team_a_id"]; text = f"{m['team_a_name']} won by {ra - rb} runs"
    elif rb > ra: winner = m["team_b_id"]; text = f"{m['team_b_name']} won by {rb - ra} runs"
    else: winner = None; text = "Match Tied"
    await db.matches.update_one({"match_id": match_id}, {"$set": {"status": "completed", "winner_team_id": winner, "result_text": text}})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


# ============ ROOT ============
@api_router.get("/")
async def root():
    return {"message": "CricTrack API", "status": "ok", "otp_dev_mode": OTP_DEV_MODE}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    try:
        # Ensure email index only for real emails (not for phone-only signups).
        existing = await db.users.index_information()
        if "email_1" in existing and existing["email_1"].get("sparse") and "partialFilterExpression" not in existing["email_1"]:
            await db.users.drop_index("email_1")
        await db.users.create_index("email", unique=True, partialFilterExpression={"email": {"$type": "string"}})
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("phone", partialFilterExpression={"phone": {"$type": "string"}})
        await db.users.create_index("name")
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.teams.create_index("team_id", unique=True)
        await db.tournaments.create_index("tournament_id", unique=True)
        await db.matches.create_index("match_id", unique=True)
        await db.phone_otps.create_index("phone", unique=True)
        await db.phone_otps.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.warning(f"Index setup: {e}")
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
