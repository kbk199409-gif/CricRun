from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, random, string, httpx, requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
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
    batting_style: Optional[str] = None  # right_hand / left_hand
    bowling_style: Optional[str] = None  # pacer / medium_pacer / spinner / none
    role: Optional[str] = None  # batsman / bowler / allrounder / wicketkeeper
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
    name: str
    role: Optional[str] = None

class TournamentCreate(BaseModel):
    name: str
    location: Optional[str] = None
    format: str = "T20"  # T20 / ODI / Test
    overs: int = 20

class MatchCreate(BaseModel):
    team_a_id: str
    team_b_id: str
    overs: int = 20
    tournament_id: Optional[str] = None
    venue: Optional[str] = None

class InningsScoreUpdate(BaseModel):
    runs: int
    wickets: int
    overs: float  # e.g. 12.3 means 12 overs 3 balls

class MatchCompleteRequest(BaseModel):
    winner_team_id: Optional[str] = None


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
    # Mock: always send code 123456 (any 6-digit code will be accepted on verify)
    return {"success": True, "message": "OTP sent (demo). Use any 6-digit code, e.g. 123456"}


@api_router.post("/auth/phone/verify")
async def phone_verify(payload: PhoneVerifyRequest):
    phone = payload.phone.strip()
    code = payload.code.strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Enter a valid 6-digit code")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone required")

    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        user = existing
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
        # mark profile complete if batting_style + bowling_style set
        merged = {**user, **update}
        if merged.get("batting_style") and merged.get("bowling_style") and merged.get("name"):
            update["profile_complete"] = True
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"user": fresh}


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
    # Accept either header or query token
    if token:
        auth_header = f"Bearer {token}"
    else:
        auth_header = authorization
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
        "short_name": payload.short_name or payload.name[:3].upper(),
        "owner_id": user["user_id"],
        "players": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.teams.insert_one(team.copy())
    team.pop("_id", None)
    return {"team": team}


@api_router.get("/teams")
async def list_teams(authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    teams = await db.teams.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(500)
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
    player = {"player_id": f"p_{uuid.uuid4().hex[:8]}", "name": payload.name, "role": payload.role}
    await db.teams.update_one({"team_id": team_id}, {"$push": {"players": player}})
    return {"player": player}


# ============ TOURNAMENTS ============
@api_router.post("/tournaments")
async def create_tournament(payload: TournamentCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    t_id = f"trn_{uuid.uuid4().hex[:10]}"
    tournament = {
        "tournament_id": t_id,
        "name": payload.name,
        "location": payload.location,
        "format": payload.format,
        "overs": payload.overs,
        "owner_id": user["user_id"],
        "team_ids": [],
        "created_at": datetime.now(timezone.utc),
    }
    await db.tournaments.insert_one(tournament.copy())
    tournament.pop("_id", None)
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


def _overs_to_balls(overs: float) -> int:
    whole = int(overs)
    balls = round((overs - whole) * 10)
    return whole * 6 + balls


@api_router.get("/tournaments/{t_id}")
async def get_tournament(t_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    trn = await db.tournaments.find_one({"tournament_id": t_id}, {"_id": 0})
    if not trn:
        raise HTTPException(status_code=404, detail="Not found")
    teams = await db.teams.find({"team_id": {"$in": trn.get("team_ids", [])}}, {"_id": 0}).to_list(500)
    matches = await db.matches.find({"tournament_id": t_id}, {"_id": 0}).to_list(500)

    # Compute points table with NRR
    stats: Dict[str, Dict[str, Any]] = {t["team_id"]: {
        "team_id": t["team_id"], "name": t["name"], "short_name": t["short_name"],
        "P": 0, "W": 0, "L": 0, "T": 0, "NR": 0, "Pts": 0,
        "runs_for": 0, "balls_for": 0, "runs_against": 0, "balls_against": 0,
    } for t in teams}

    max_overs = trn.get("overs", 20)
    for m in matches:
        if m.get("status") != "completed":
            continue
        a = m["team_a_id"]; b = m["team_b_id"]
        if a not in stats or b not in stats:
            continue
        ia = m.get("innings_a", {"runs": 0, "wickets": 0, "overs": 0.0})
        ib = m.get("innings_b", {"runs": 0, "wickets": 0, "overs": 0.0})
        ra, wa, oa = ia.get("runs", 0), ia.get("wickets", 0), ia.get("overs", 0.0)
        rb, wb, ob = ib.get("runs", 0), ib.get("wickets", 0), ib.get("overs", 0.0)
        ba_balls = max_overs * 6 if wa >= 10 else _overs_to_balls(oa)
        bb_balls = max_overs * 6 if wb >= 10 else _overs_to_balls(ob)
        if ba_balls == 0: ba_balls = max_overs * 6
        if bb_balls == 0: bb_balls = max_overs * 6

        stats[a]["P"] += 1; stats[b]["P"] += 1
        stats[a]["runs_for"] += ra; stats[a]["balls_for"] += ba_balls
        stats[a]["runs_against"] += rb; stats[a]["balls_against"] += bb_balls
        stats[b]["runs_for"] += rb; stats[b]["balls_for"] += bb_balls
        stats[b]["runs_against"] += ra; stats[b]["balls_against"] += ba_balls

        w = m.get("winner_team_id")
        if w == a:
            stats[a]["W"] += 1; stats[a]["Pts"] += 2
            stats[b]["L"] += 1
        elif w == b:
            stats[b]["W"] += 1; stats[b]["Pts"] += 2
            stats[a]["L"] += 1
        else:
            stats[a]["T"] += 1; stats[b]["T"] += 1
            stats[a]["Pts"] += 1; stats[b]["Pts"] += 1

    points_table = []
    for s in stats.values():
        overs_for = s["balls_for"] / 6 if s["balls_for"] else 0
        overs_against = s["balls_against"] / 6 if s["balls_against"] else 0
        rr_for = (s["runs_for"] / overs_for) if overs_for else 0
        rr_against = (s["runs_against"] / overs_against) if overs_against else 0
        s["NRR"] = round(rr_for - rr_against, 3)
        points_table.append(s)
    points_table.sort(key=lambda x: (-x["Pts"], -x["NRR"]))

    return {"tournament": trn, "teams": teams, "matches": matches, "points_table": points_table}


# ============ MATCHES ============
@api_router.post("/matches")
async def create_match(payload: MatchCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team_a = await db.teams.find_one({"team_id": payload.team_a_id}, {"_id": 0})
    team_b = await db.teams.find_one({"team_id": payload.team_b_id}, {"_id": 0})
    if not team_a or not team_b:
        raise HTTPException(status_code=404, detail="Team not found")
    match_id = f"mch_{uuid.uuid4().hex[:10]}"
    match = {
        "match_id": match_id,
        "team_a_id": payload.team_a_id,
        "team_b_id": payload.team_b_id,
        "team_a_name": team_a["name"],
        "team_b_name": team_b["name"],
        "team_a_short": team_a["short_name"],
        "team_b_short": team_b["short_name"],
        "overs": payload.overs,
        "tournament_id": payload.tournament_id,
        "venue": payload.venue,
        "owner_id": user["user_id"],
        "status": "live",  # live / completed
        "current_innings": "a",
        "innings_a": {"runs": 0, "wickets": 0, "overs": 0.0},
        "innings_b": {"runs": 0, "wickets": 0, "overs": 0.0},
        "winner_team_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.matches.insert_one(match.copy())
    match.pop("_id", None)
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


@api_router.put("/matches/{match_id}/innings/{side}")
async def update_innings(match_id: str, side: str, payload: InningsScoreUpdate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Invalid side")
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not m or m["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Not found")
    field = "innings_a" if side == "a" else "innings_b"
    await db.matches.update_one({"match_id": match_id}, {"$set": {
        field: {"runs": payload.runs, "wickets": payload.wickets, "overs": payload.overs},
        "current_innings": side,
    }})
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    return {"match": m}


@api_router.post("/matches/{match_id}/complete")
async def complete_match(match_id: str, payload: MatchCompleteRequest, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not m or m["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Not found")
    winner = payload.winner_team_id
    if winner is None:
        ra = m["innings_a"]["runs"]; rb = m["innings_b"]["runs"]
        if ra > rb: winner = m["team_a_id"]
        elif rb > ra: winner = m["team_b_id"]
        else: winner = None
    await db.matches.update_one({"match_id": match_id}, {"$set": {"status": "completed", "winner_team_id": winner}})
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    return {"match": m}


# ============ ROOT ============
@api_router.get("/")
async def root():
    return {"message": "CricTrack API", "status": "ok"}


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
        try:
            await db.users.drop_index("email_1")
        except Exception:
            pass
        await db.users.create_index(
            "email",
            unique=True,
            partialFilterExpression={"email": {"$type": "string"}},
            name="email_unique_partial",
        )
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("phone", sparse=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.teams.create_index("team_id", unique=True)
        await db.tournaments.create_index("tournament_id", unique=True)
        await db.matches.create_index("match_id", unique=True)
    except Exception as e:
        logger.warning(f"Index setup: {e}")
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
