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
    captain_id: Optional[str] = None  # player_id after players are added — set via PUT /teams/{id}/captain

class TeamCaptainUpdate(BaseModel):
    captain_id: Optional[str] = None

class PlayerAdd(BaseModel):
    # If user_id given -> link a registered user. Else guest by name.
    user_id: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    invite_id: Optional[str] = None  # if this player was added via invite acceptance, link back

class TeamInviteCreate(BaseModel):
    name: str
    role: Optional[str] = None
    phone_hint: Optional[str] = None

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

class MatchCaptains(BaseModel):
    captain_a_id: Optional[str] = None
    captain_b_id: Optional[str] = None

class InningsStart(BaseModel):
    striker_id: str        # player_id from batting team
    non_striker_id: str
    bowler_id: str         # player_id from bowling team

class TossPayload(BaseModel):
    toss_winner_team_id: str
    decision: Literal["bat", "bowl"]

class MoMPayload(BaseModel):
    player_id: str
    team_id: str

class BallInput(BaseModel):
    runs: int = 0
    extra_type: Literal["none","wide","no_ball","bye","leg_bye"] = "none"
    wicket: bool = False
    out_type: Optional[Literal["bowled","catch_out","run_out","lbw","stumped","hit_wicket","retired_hurt"]] = None
    out_batsman_id: Optional[str] = None
    fielder_id: Optional[str] = None
    new_batsman_id: Optional[str] = None
    new_batsman_on_strike: bool = False  # scorer-controlled: put incoming batter on strike?
    new_bowler_id: Optional[str] = None
    swap_strike: bool = False


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


async def _enrich_team_players(team: Optional[dict]) -> Optional[dict]:
    """Hydrate each player's latest profile picture / styles from the users collection.
    Team.players stores a SNAPSHOT at add-time; if the user updates their profile pic later,
    we still want the latest photo to show everywhere. Guests (no user_id) are untouched."""
    if not team:
        return team
    players = team.get("players") or []
    user_ids = [p["user_id"] for p in players if p.get("user_id")]
    if not user_ids:
        return team
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
    umap = {u["user_id"]: u for u in users}
    for p in players:
        uid = p.get("user_id")
        if uid and uid in umap:
            u = umap[uid]
            # Always overwrite from source of truth
            p["name"] = u.get("name") or p.get("name") or "Player"
            p["profile_picture_path"] = u.get("profile_picture_path")
            p["picture"] = u.get("picture")
            p["batting_style"] = u.get("batting_style") or p.get("batting_style")
            p["bowling_style"] = u.get("bowling_style") or p.get("bowling_style")
            p["role"] = u.get("role") or p.get("role")
    team["players"] = players
    return team


@api_router.get("/teams/{team_id}")
async def get_team(team_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team = await _enrich_team_players(team)
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
    updates: Dict[str, Any] = {"$pull": {"players": {"player_id": player_id}}}
    # If the removed player was captain, clear captain_id
    if team.get("captain_id") == player_id:
        updates["$set"] = {"captain_id": None}
    await db.teams.update_one({"team_id": team_id}, updates)
    return {"ok": True}


@api_router.put("/teams/{team_id}/captain")
async def set_team_captain(team_id: str, payload: TeamCaptainUpdate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team or team["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Team not found")
    if payload.captain_id:
        pids = {p["player_id"] for p in team.get("players", [])}
        if payload.captain_id not in pids:
            raise HTTPException(status_code=400, detail="Captain must be a player on this team")
    await db.teams.update_one({"team_id": team_id}, {"$set": {"captain_id": payload.captain_id}})
    return {"ok": True, "captain_id": payload.captain_id}


# ============ TEAM INVITES ============
@api_router.post("/teams/{team_id}/invites")
async def create_team_invite(team_id: str, payload: TeamInviteCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team or team["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Team not found")
    nm = (payload.name or "").strip()
    if not nm:
        raise HTTPException(status_code=400, detail="Player name is required to create an invite")
    token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    invite = {
        "invite_id": f"inv_{uuid.uuid4().hex[:10]}",
        "team_id": team_id,
        "token": token,
        "name": nm,
        "role": payload.role,
        "phone_hint": payload.phone_hint,
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
        "status": "pending",  # pending | accepted | expired
        "used_by": None,
        "used_at": None,
    }
    await db.team_invites.insert_one(invite.copy())
    invite.pop("_id", None)
    invite["created_at"] = invite["created_at"].isoformat()
    invite["expires_at"] = invite["expires_at"].isoformat()
    return {"invite": invite}


@api_router.get("/teams/{team_id}/invites")
async def list_team_invites(team_id: str, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not team or team["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Team not found")
    invites = await db.team_invites.find({"team_id": team_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for inv in invites:
        for k in ("created_at", "expires_at", "used_at"):
            if inv.get(k) and not isinstance(inv[k], str):
                inv[k] = inv[k].isoformat()
    return {"invites": invites}


@api_router.get("/public/invites/{token}")
async def get_invite_public(token: str):
    inv = await db.team_invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    # Expiry check
    exp = inv.get("expires_at")
    now = datetime.now(timezone.utc)
    if isinstance(exp, datetime):
        exp_aware = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
        expired = exp_aware < now
    else:
        try:
            expired = datetime.fromisoformat(str(exp).replace("Z", "+00:00")) < now
        except Exception:
            expired = False
    status = inv.get("status") or "pending"
    if status == "pending" and expired:
        status = "expired"
    team = await db.teams.find_one({"team_id": inv["team_id"]}, {"_id": 0, "owner_id": 0})
    owner = await db.users.find_one({"user_id": inv.get("created_by")}, {"_id": 0, "name": 1, "picture": 1, "profile_picture_path": 1})
    return {
        "invite": {
            "token": inv["token"],
            "name": inv["name"],
            "role": inv.get("role"),
            "status": status,
            "expires_at": inv["expires_at"].isoformat() if isinstance(inv.get("expires_at"), datetime) else inv.get("expires_at"),
        },
        "team": {"team_id": team.get("team_id"), "name": team.get("name"), "short_name": team.get("short_name")} if team else None,
        "invited_by": owner,
    }


@api_router.post("/invites/{token}/accept")
async def accept_invite(token: str, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    inv = await db.team_invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.get("status") == "accepted":
        raise HTTPException(status_code=400, detail="This invite has already been used")
    exp = inv.get("expires_at")
    if isinstance(exp, datetime):
        exp_aware = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
        if exp_aware < datetime.now(timezone.utc):
            await db.team_invites.update_one({"token": token}, {"$set": {"status": "expired"}})
            raise HTTPException(status_code=400, detail="This invite has expired")
    team = await db.teams.find_one({"team_id": inv["team_id"]}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team no longer exists")
    # If user already on team → mark invite accepted but no-op add
    already = any(p.get("user_id") == user["user_id"] for p in team.get("players", []))
    if not already:
        player = {
            "player_id": f"p_{uuid.uuid4().hex[:8]}",
            "user_id": user["user_id"],
            "name": user.get("name") or inv.get("name") or "Player",
            "role": user.get("role") or inv.get("role"),
            "batting_style": user.get("batting_style"),
            "bowling_style": user.get("bowling_style"),
            "picture": user.get("picture"),
            "profile_picture_path": user.get("profile_picture_path"),
            "from_invite": inv["invite_id"],
        }
        await db.teams.update_one({"team_id": inv["team_id"]}, {"$push": {"players": player}})
    await db.team_invites.update_one({"token": token}, {"$set": {
        "status": "accepted", "used_by": user["user_id"], "used_at": datetime.now(timezone.utc)
    }})
    return {"ok": True, "team_id": inv["team_id"]}
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
        "batted_ids": [],
        "dismissed_ids": [],
        "needs_new_batsman": False,
        "needs_new_bowler": False,
        "last_ball": None,
        "events": [],                # ball-by-ball log for undo & scorecard
        "batters": {},               # player_id -> {runs, balls, fours, sixes, out_type, out_by, fielder_id}
        "bowlers": {},               # player_id -> {balls, runs, wickets, extras}
    }


def _ensure_batter(innings: dict, pid: str) -> dict:
    b = innings["batters"].get(pid)
    if not b:
        b = {"runs": 0, "balls": 0, "fours": 0, "sixes": 0, "out_type": None, "out_by": None, "fielder_id": None}
        innings["batters"][pid] = b
    return b


def _ensure_bowler(innings: dict, pid: str) -> dict:
    b = innings["bowlers"].get(pid)
    if not b:
        b = {"balls": 0, "runs": 0, "wickets": 0, "extras": 0, "maidens": 0}
        innings["bowlers"][pid] = b
    return b


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
        "share_token": uuid.uuid4().hex[:16],
        "team_a_id": payload.team_a_id, "team_b_id": payload.team_b_id,
        "team_a_name": team_a["name"], "team_b_name": team_b["name"],
        "team_a_short": team_a["short_name"], "team_b_short": team_b["short_name"],
        "captain_a_id": team_a.get("captain_id"),
        "captain_b_id": team_b.get("captain_id"),
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
        "toss_winner_team_id": None,
        "toss_decision": None,
        "man_of_the_match_id": None,
        "man_of_the_match_team_id": None,
        "best_batter_id": None,
        "best_batter_team_id": None,
        "best_batter_summary": None,
        "best_bowler_id": None,
        "best_bowler_team_id": None,
        "best_bowler_summary": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.matches.insert_one(match.copy())
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    return {"match": match}


@api_router.put("/matches/{match_id}/captains")
async def set_match_captains(match_id: str, payload: MatchCaptains, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    m = await _get_owner_match(match_id, user["user_id"])
    updates: Dict[str, Any] = {}
    # Validate captains belong to correct teams
    if payload.captain_a_id is not None:
        pids_a = await _team_player_ids(m["team_a_id"])
        if payload.captain_a_id and payload.captain_a_id not in pids_a:
            raise HTTPException(status_code=400, detail="Team A captain must be a player on Team A")
        updates["captain_a_id"] = payload.captain_a_id
    if payload.captain_b_id is not None:
        pids_b = await _team_player_ids(m["team_b_id"])
        if payload.captain_b_id and payload.captain_b_id not in pids_b:
            raise HTTPException(status_code=400, detail="Team B captain must be a player on Team B")
        updates["captain_b_id"] = payload.captain_b_id
    if updates:
        await db.matches.update_one({"match_id": match_id}, {"$set": updates})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


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


@api_router.post("/matches/{match_id}/toss")
async def set_toss(match_id: str, payload: TossPayload, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    m = await _get_owner_match(match_id, user["user_id"])
    if payload.toss_winner_team_id not in (m["team_a_id"], m["team_b_id"]):
        raise HTTPException(status_code=400, detail="Toss winner must be one of the match teams")
    winner_bats = (payload.decision == "bat")
    # If toss winner elects to bat → they bat first. Else they bowl → the other team bats first.
    bats_first_team = payload.toss_winner_team_id if winner_bats else (m["team_b_id"] if payload.toss_winner_team_id == m["team_a_id"] else m["team_a_id"])
    # Set current_innings so side "a" always refers to team_a_id; if team_b_id bats first we flip current_innings to "b"
    current_innings = "a" if bats_first_team == m["team_a_id"] else "b"
    await db.matches.update_one({"match_id": match_id}, {"$set": {
        "toss_winner_team_id": payload.toss_winner_team_id,
        "toss_decision": payload.decision,
        "current_innings": current_innings,
    }})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


@api_router.post("/matches/{match_id}/mom")
async def set_mom(match_id: str, payload: MoMPayload, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    m = await _get_owner_match(match_id, user["user_id"])
    if payload.team_id not in (m["team_a_id"], m["team_b_id"]):
        raise HTTPException(status_code=400, detail="Team must belong to the match")
    await db.matches.update_one({"match_id": match_id}, {"$set": {
        "man_of_the_match_id": payload.player_id,
        "man_of_the_match_team_id": payload.team_id,
    }})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


def _apply_ball_effects(innings: dict, ball: dict) -> None:
    """Apply the ball to innings state (idempotently for a fresh ball).
    Mutates `innings`. Ball dict must already have final values for extra/runs/wicket."""
    extra = ball["extra_type"]
    runs = int(ball["runs"] or 0)
    legal = extra not in ("wide", "no_ball")
    team_runs = runs + (1 if extra in ("wide", "no_ball") else 0)
    striker_id = innings.get("striker_id")
    bowler_id = innings.get("bowler_id")

    # Team score
    innings["runs"] = int(innings["runs"]) + team_runs

    # Batter stats — striker faces the ball (except wides)
    if striker_id and extra != "wide":
        bat = _ensure_batter(innings, striker_id)
        bat["balls"] += 1
        # Off-bat runs credit the batter: this applies to legal balls (extra == "none")
        # AND to no-balls (extra == "no_ball") where `runs` is the off-bat portion.
        # Byes / leg-byes do NOT credit the batter.
        if extra == "none" or extra == "no_ball":
            bat["runs"] += runs
            if runs == 4: bat["fours"] += 1
            elif runs == 6: bat["sixes"] += 1

    # Bowler stats
    if bowler_id:
        bw = _ensure_bowler(innings, bowler_id)
        if legal:
            bw["balls"] += 1
        # Runs charged to bowler: off bat, wide, no-ball (NOT byes/leg-byes)
        if extra == "none":
            bw["runs"] += runs
        elif extra == "wide":
            bw["runs"] += team_runs
            bw["extras"] += team_runs
        elif extra == "no_ball":
            # Bowler is charged the full team_runs (penalty + off-bat) BUT only the 1-run
            # penalty is booked as "extras". Off-bat runs are batter runs, not extras.
            bw["runs"] += team_runs
            bw["extras"] += 1

    # Wicket
    if ball.get("wicket"):
        out_id = ball.get("out_batsman_id") or striker_id
        out_type = ball.get("out_type") or "bowled"
        innings["wickets"] = int(innings["wickets"]) + 1
        if out_id and out_id not in innings["dismissed_ids"]:
            innings["dismissed_ids"].append(out_id)
        # Mark batter as out
        if out_id:
            bat = _ensure_batter(innings, out_id)
            bat["out_type"] = out_type
            bat["out_by"] = bowler_id if out_type in ("bowled","catch_out","lbw","stumped","hit_wicket") else None
            bat["fielder_id"] = ball.get("fielder_id")
        # Credit bowler for eligible dismissals
        if bowler_id and out_type in ("bowled","catch_out","lbw","stumped","hit_wicket"):
            bw = _ensure_bowler(innings, bowler_id)
            bw["wickets"] += 1
        # Clear crease slot
        if out_id == innings.get("striker_id"):
            innings["striker_id"] = None
        elif out_id == innings.get("non_striker_id"):
            innings["non_striker_id"] = None
        innings["needs_new_batsman"] = True

    # Legal ball counter for over progress
    if legal:
        innings["balls"] = int(innings["balls"]) + 1


def _rotate_strike(innings: dict) -> None:
    if innings.get("striker_id") and innings.get("non_striker_id"):
        innings["striker_id"], innings["non_striker_id"] = innings["non_striker_id"], innings["striker_id"]


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

    # Snapshot pre-state for undo BEFORE any mutation
    pre_state = {
        "runs": innings["runs"], "wickets": innings["wickets"], "balls": innings["balls"],
        "striker_id": innings.get("striker_id"), "non_striker_id": innings.get("non_striker_id"), "bowler_id": innings.get("bowler_id"),
        "needs_new_batsman": innings.get("needs_new_batsman", False),
        "needs_new_bowler": innings.get("needs_new_bowler", False),
        "dismissed_ids": list(innings.get("dismissed_ids", [])),
        "batters": {k: dict(v) for k, v in innings.get("batters", {}).items()},
        "bowlers": {k: dict(v) for k, v in innings.get("bowlers", {}).items()},
        "batted_ids": list(innings.get("batted_ids", [])),
    }

    # Handle new batsman if pending
    if innings.get("needs_new_batsman"):
        # SAFETY: if the innings is really already at all-out (or over-limit), auto-complete.
        # This prevents any UI-driven freeze from a lingering needs_new_batsman flag.
        if int(innings.get("wickets") or 0) >= 10 or int(innings.get("balls") or 0) >= max_balls:
            innings["needs_new_batsman"] = False
            innings["needs_new_bowler"] = False
            innings["completed"] = True
            await db.matches.update_one({"match_id": match_id}, {"$set": {field: innings}})
            return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}
        # If no eligible batsmen remain (everyone dismissed), auto-complete.
        dismissed = set(innings.get("dismissed_ids") or [])
        remaining = [pid for pid in bat_players.keys() if pid not in dismissed and pid != innings.get("striker_id") and pid != innings.get("non_striker_id")]
        if not remaining:
            innings["needs_new_batsman"] = False
            innings["needs_new_bowler"] = False
            innings["completed"] = True
            await db.matches.update_one({"match_id": match_id}, {"$set": {field: innings}})
            return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}
        if not payload.new_batsman_id:
            raise HTTPException(status_code=400, detail="Select the new batsman first")
        if payload.new_batsman_id not in bat_players:
            raise HTTPException(status_code=400, detail="New batsman must be from batting team")
        if payload.new_batsman_id in innings.get("dismissed_ids", []):
            raise HTTPException(status_code=400, detail="This batsman is already out")
        if payload.new_batsman_id in (innings.get("striker_id"), innings.get("non_striker_id")):
            raise HTTPException(status_code=400, detail="This batsman is already at the crease")
        if innings.get("striker_id") is None:
            innings["striker_id"] = payload.new_batsman_id
            # If scorer explicitly wants the incoming batter at the non-striker end (e.g. retired hurt),
            # rotate so the current non-striker faces this delivery.
            if payload.new_batsman_on_strike is False and innings.get("non_striker_id"):
                _rotate_strike(innings)
        else:
            innings["non_striker_id"] = payload.new_batsman_id
            # If scorer wants incoming batter on strike (common when a run-out happens while running),
            # swap so the new batter faces the next delivery.
            if payload.new_batsman_on_strike:
                _rotate_strike(innings)
        if payload.new_batsman_id not in innings["batted_ids"]:
            innings["batted_ids"].append(payload.new_batsman_id)
        innings["needs_new_batsman"] = False

    # Handle new bowler if pending
    if innings.get("needs_new_bowler"):
        if not payload.new_bowler_id:
            raise HTTPException(status_code=400, detail="Select the next over's bowler first")
        if payload.new_bowler_id not in bowl_players:
            raise HTTPException(status_code=400, detail="Bowler must be from bowling team")
        innings["bowler_id"] = payload.new_bowler_id
        innings["needs_new_bowler"] = False

    extra = payload.extra_type or "none"
    runs = max(0, int(payload.runs or 0))

    # Validate dismissal
    if payload.wicket:
        if extra == "no_ball":
            raise HTTPException(status_code=400, detail="Wicket cannot be recorded on a no-ball in this app")
        if payload.out_type is None:
            raise HTTPException(status_code=400, detail="Select how the batsman was out")
        if payload.out_type in ("catch_out","run_out","stumped") and not payload.fielder_id:
            raise HTTPException(status_code=400, detail="Select the fielder for this dismissal")

    ball = {
        "runs": runs, "extra_type": extra, "wicket": bool(payload.wicket),
        "out_type": payload.out_type,
        "out_batsman_id": payload.out_batsman_id or innings.get("striker_id"),
        "fielder_id": payload.fielder_id,
        "at": datetime.now(timezone.utc).isoformat(),
        "pre": pre_state,
        "striker_at_ball": innings.get("striker_id"),
        "non_striker_at_ball": innings.get("non_striker_id"),
        "bowler_at_ball": innings.get("bowler_id"),
    }

    _apply_ball_effects(innings, ball)

    # Determine strike rotation & over end
    legal = extra not in ("wide", "no_ball")
    rotate_on_runs = (runs % 2 == 1)

    # End of over: swap strike + record maiden + require new bowler (unless last ball of innings)
    if legal and innings["balls"] % 6 == 0:
        # Maiden detection: last 6 legal balls by this bowler in this over
        bowler_id = ball.get("bowler_at_ball")
        if bowler_id:
            # scan events backwards to collect this over's legal balls
            over_runs = 0
            legal_count = 0
            for ev in reversed(innings["events"] + [ball]):
                if legal_count >= 6:
                    break
                if ev.get("extra_type") in ("wide", "no_ball"):
                    over_runs += int(ev.get("runs", 0)) + 1  # bowler still charged for wd/nb
                    # not a legal ball, keep scanning
                else:
                    legal_count += 1
                    # bowler-attributed runs: none/wide/nb (but not byes/leg-byes)
                    if ev.get("extra_type") == "none":
                        over_runs += int(ev.get("runs", 0))
            if over_runs == 0 and legal_count == 6:
                bw = _ensure_bowler(innings, bowler_id)
                bw["maidens"] = int(bw.get("maidens") or 0) + 1
        if innings["balls"] < max_balls:
            _rotate_strike(innings)
            innings["needs_new_bowler"] = True

    if rotate_on_runs and not payload.wicket:
        _rotate_strike(innings)

    if payload.swap_strike:
        _rotate_strike(innings)

    # End innings conditions
    all_out = innings["wickets"] >= 10
    overs_done = innings["balls"] >= max_balls
    # Chase completion — only when the OTHER innings has already completed (i.e. this is the 2nd innings)
    other_field_local = "innings_b" if field == "innings_a" else "innings_a"
    other_local = match[other_field_local]
    if other_local.get("started") and other_local.get("completed"):
        if innings["runs"] > int(other_local.get("runs") or 0):
            innings["completed"] = True
    if all_out or overs_done:
        innings["completed"] = True

    # CRITICAL: when innings completes, clear pending flags so subsequent frontend loads
    # do not open picker modals against a closed innings.
    if innings["completed"]:
        innings["needs_new_batsman"] = False
        innings["needs_new_bowler"] = False

    innings["last_ball"] = {k: ball[k] for k in ("runs","extra_type","wicket","out_type","fielder_id","at")}
    innings["events"].append(ball)

    updates = {field: innings}

    # Match completion: complete when BOTH innings completed (or the chasing side completed win)
    other_field = "innings_b" if field == "innings_a" else "innings_a"
    other_innings = match[other_field]
    if innings["completed"] and other_innings.get("started") and other_innings.get("completed"):
        # Match ends
        ra = match["innings_a"]["runs"] if field != "innings_a" else innings["runs"]
        rb = match["innings_b"]["runs"] if field != "innings_b" else innings["runs"]
        team_a_runs = ra; team_b_runs = rb
        winner = None; text = "Match Tied"
        if team_a_runs > team_b_runs:
            winner = match["team_a_id"]
            text = f"{match['team_a_name']} won by {team_a_runs - team_b_runs} runs"
        elif team_b_runs > team_a_runs:
            winner = match["team_b_id"]
            wkts_left = 10 - int(innings["wickets"] if field == "innings_b" else other_innings.get("wickets", 0))
            text = f"{match['team_b_name']} won by {wkts_left} wickets"
        updates["status"] = "completed"
        updates["winner_team_id"] = winner
        updates["result_text"] = text
        # Auto Man of the Match if not already set manually — winning team only
        match_snapshot = {**match, field: innings, other_field: other_innings, "winner_team_id": winner}
        if not match.get("man_of_the_match_id"):
            mom = _compute_mom(match_snapshot)
            if mom:
                updates["man_of_the_match_id"] = mom["player_id"]
                updates["man_of_the_match_team_id"] = mom["team_id"]
                updates["man_of_the_match_summary"] = _player_perf_summary(match_snapshot, mom["player_id"])
        # Best Batter (most runs across both teams)
        bb = _compute_best_batter(match_snapshot)
        if bb:
            updates["best_batter_id"] = bb["player_id"]
            updates["best_batter_team_id"] = bb["team_id"]
            updates["best_batter_summary"] = f"{bb['runs']} runs ({bb['balls']} balls, {bb['fours']}×4, {bb['sixes']}×6)"
        # Best Bowler (most wickets across both teams)
        bw = _compute_best_bowler(match_snapshot)
        if bw:
            o = f"{bw['balls']//6}.{bw['balls']%6}"
            updates["best_bowler_id"] = bw["player_id"]
            updates["best_bowler_team_id"] = bw["team_id"]
            updates["best_bowler_summary"] = f"{bw['wickets']}/{bw['runs']} in {o} overs (Econ {bw['econ']:.2f})"
    elif innings["completed"] and not other_innings.get("started"):
        # First innings just completed — flip current_innings to the other side
        updates["current_innings"] = "b" if field == "innings_a" else "a"

    await db.matches.update_one({"match_id": match_id}, {"$set": updates})
    return {"match": await db.matches.find_one({"match_id": match_id}, {"_id": 0})}


def _compute_mom(match: dict) -> Optional[Dict[str, str]]:
    """Score each player: bat_impact + bowl_impact + fielding. Higher = better.
    If a winner exists, restrict candidates to the winning team only.
    Returns {player_id, team_id, score}."""
    scores: Dict[str, Dict[str, Any]] = {}  # player_id -> {score, team_id}
    for side, team_id in (("innings_a", match["team_a_id"]), ("innings_b", match["team_b_id"])):
        inn = match.get(side) or {}
        # Batting
        for pid, st in (inn.get("batters") or {}).items():
            runs = int(st.get("runs") or 0)
            balls = int(st.get("balls") or 0)
            fours = int(st.get("fours") or 0)
            sixes = int(st.get("sixes") or 0)
            # Points: runs + 4*fours + 6*sixes + SR bonus (per run above 100 SR)
            sr_bonus = 0
            if balls >= 5:
                sr_bonus = int(max(0, (runs / balls * 100 - 100)) / 2)
            impact = runs + fours * 2 + sixes * 4 + sr_bonus
            scores.setdefault(pid, {"score": 0, "team_id": team_id})
            scores[pid]["score"] += impact
    # Bowling & fielding from OPPOSITE innings (bowlers are opposing team)
    for side, bowl_team_id in (("innings_a", match["team_b_id"]), ("innings_b", match["team_a_id"])):
        inn = match.get(side) or {}
        for pid, st in (inn.get("bowlers") or {}).items():
            wkts = int(st.get("wickets") or 0)
            balls = int(st.get("balls") or 0)
            runs = int(st.get("runs") or 0)
            maidens = int(st.get("maidens") or 0)
            econ_bonus = 0
            if balls >= 6:
                econ = runs / (balls / 6)
                econ_bonus = int(max(0, (7 - econ) * 3))  # under 7 econ gets bonus
            impact = wkts * 25 + maidens * 8 + econ_bonus
            scores.setdefault(pid, {"score": 0, "team_id": bowl_team_id})
            scores[pid]["score"] += impact
    # Fielding pass
    for side, bowl_team_id in (("innings_a", match["team_b_id"]), ("innings_b", match["team_a_id"])):
        inn = match.get(side) or {}
        for st in (inn.get("batters") or {}).values():
            fid = st.get("fielder_id")
            if not fid: continue
            ot = st.get("out_type")
            pts = 10 if ot == "catch_out" else 15 if ot == "run_out" else 20 if ot == "stumped" else 0
            scores.setdefault(fid, {"score": 0, "team_id": bowl_team_id})
            scores[fid]["score"] += pts

    # Restrict to winning team if we have one
    winner = match.get("winner_team_id")
    if winner:
        scores = {pid: s for pid, s in scores.items() if s["team_id"] == winner}
    if not scores:
        return None
    best_pid, best = max(scores.items(), key=lambda kv: kv[1]["score"])
    if best["score"] <= 0:
        return None
    return {"player_id": best_pid, "team_id": best["team_id"], "score": best["score"]}


def _compute_best_batter(match: dict) -> Optional[Dict[str, Any]]:
    """Most runs across BOTH teams; tie-break: higher strike rate."""
    candidates = []
    for side, team_id in (("innings_a", match["team_a_id"]), ("innings_b", match["team_b_id"])):
        inn = match.get(side) or {}
        for pid, st in (inn.get("batters") or {}).items():
            runs = int(st.get("runs") or 0)
            balls = int(st.get("balls") or 0)
            if balls <= 0 and runs <= 0:
                continue
            sr = (runs / balls * 100) if balls else 0
            candidates.append({"player_id": pid, "team_id": team_id, "runs": runs, "balls": balls, "sr": sr, "fours": int(st.get("fours") or 0), "sixes": int(st.get("sixes") or 0)})
    if not candidates:
        return None
    candidates.sort(key=lambda c: (-c["runs"], -c["sr"], -c["balls"]))
    top = candidates[0]
    if top["runs"] <= 0:
        return None
    return top


def _compute_best_bowler(match: dict) -> Optional[Dict[str, Any]]:
    """Most wickets across BOTH teams; tie-break: better economy, then fewer runs."""
    candidates = []
    for side, bowl_team_id in (("innings_a", match["team_b_id"]), ("innings_b", match["team_a_id"])):
        inn = match.get(side) or {}
        for pid, st in (inn.get("bowlers") or {}).items():
            wkts = int(st.get("wickets") or 0)
            balls = int(st.get("balls") or 0)
            runs = int(st.get("runs") or 0)
            if balls <= 0 and wkts <= 0:
                continue
            econ = (runs / (balls / 6)) if balls else 99
            candidates.append({"player_id": pid, "team_id": bowl_team_id, "wickets": wkts, "balls": balls, "runs": runs, "econ": econ, "maidens": int(st.get("maidens") or 0)})
    if not candidates:
        return None
    candidates.sort(key=lambda c: (-c["wickets"], c["econ"], c["runs"]))
    top = candidates[0]
    if top["wickets"] <= 0 and top["balls"] <= 0:
        return None
    return top


def _player_perf_summary(match: dict, player_id: str) -> str:
    parts = []
    for side in ("innings_a", "innings_b"):
        inn = match.get(side) or {}
        bat = (inn.get("batters") or {}).get(player_id)
        if bat and (int(bat.get("balls") or 0) > 0):
            parts.append(f"{bat.get('runs',0)} runs")
        bowl = (inn.get("bowlers") or {}).get(player_id)
        if bowl and int(bowl.get("balls") or 0) > 0:
            parts.append(f"{bowl.get('wickets',0)}/{bowl.get('runs',0)}")
    return " • ".join(parts) if parts else ""



@api_router.post("/matches/{match_id}/innings/{side}/undo")
async def undo_ball(match_id: str, side: str, authorization: Optional[str] = Header(None)):
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Invalid side")
    user = await get_user_from_token(authorization)
    match = await _get_owner_match(match_id, user["user_id"])
    field = "innings_a" if side == "a" else "innings_b"
    innings = match[field]
    if not innings.get("events"):
        raise HTTPException(status_code=400, detail="Nothing to undo")
    last = innings["events"].pop()
    pre = last.get("pre") or {}
    # Restore state from snapshot
    for k in ("runs", "wickets", "balls", "striker_id", "non_striker_id", "bowler_id",
              "needs_new_batsman", "needs_new_bowler", "dismissed_ids", "batters", "bowlers", "batted_ids"):
        if k in pre:
            innings[k] = pre[k]
    innings["completed"] = False
    innings["last_ball"] = None
    updates = {field: innings, "status": "live"}
    # If match was completed by this ball, revert.
    if match.get("status") == "completed":
        updates["winner_team_id"] = None
        updates["result_text"] = None
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


# ============ DELETE MATCH ============
@api_router.delete("/matches/{match_id}")
async def delete_match(match_id: str, authorization: Optional[str] = Header(None)):
    user = await get_user_from_token(authorization)
    m = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    if m["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the match creator can delete it")
    await db.matches.delete_one({"match_id": match_id})
    return {"success": True}


# ============ PLAYER STATS ============
def _accumulate_batting(agg: dict, st: dict) -> None:
    agg["innings"] += 1
    runs = int(st.get("runs") or 0)
    balls = int(st.get("balls") or 0)
    agg["runs"] += runs
    agg["balls"] += balls
    agg["fours"] += int(st.get("fours") or 0)
    agg["sixes"] += int(st.get("sixes") or 0)
    if not st.get("out_type"):
        agg["not_outs"] += 1
    if runs >= 100: agg["hundreds"] += 1
    elif runs >= 50: agg["fifties"] += 1
    if runs > agg["highest"]:
        agg["highest"] = runs


def _accumulate_bowling(agg: dict, st: dict) -> None:
    balls = int(st.get("balls") or 0)
    runs = int(st.get("runs") or 0)
    wkts = int(st.get("wickets") or 0)
    if balls == 0: return
    agg["innings"] += 1
    agg["balls"] += balls
    agg["runs"] += runs
    agg["wickets"] += wkts
    agg["maidens"] += int(st.get("maidens") or 0)
    if wkts > agg["best_w"] or (wkts == agg["best_w"] and (agg["best_w"] > 0 and runs < agg["best_r"])):
        agg["best_w"] = wkts
        agg["best_r"] = runs


@api_router.get("/players/{user_id}/stats")
async def player_stats(user_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    return await _player_stats_data(user_id)


async def _player_stats_data(user_id: str) -> Dict[str, Any]:
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Find teams the user belongs to
    teams = await db.teams.find({"players.user_id": user_id}, {"_id": 0}).to_list(500)
    # Map team_id -> the player_id used to represent this user in that team
    team_pid: Dict[str, str] = {}
    for t in teams:
        for p in t.get("players", []):
            if p.get("user_id") == user_id:
                team_pid[t["team_id"]] = p["player_id"]
                break
    if not team_pid:
        return {"user": user, "stats": {
            "matches": 0,
            "batting": {"innings": 0, "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "highest": 0, "fifties": 0, "hundreds": 0, "not_outs": 0, "average": 0, "strike_rate": 0},
            "bowling": {"innings": 0, "balls": 0, "runs": 0, "wickets": 0, "maidens": 0, "best_w": 0, "best_r": 0, "economy": 0, "average": 0, "strike_rate": 0},
            "fielding": {"catches": 0, "run_outs": 0, "stumpings": 0},
            "mom_awards": 0,
        }}
    matches = await db.matches.find(
        {"status": "completed", "$or": [{"team_a_id": {"$in": list(team_pid.keys())}}, {"team_b_id": {"$in": list(team_pid.keys())}}]},
        {"_id": 0},
    ).to_list(1000)

    bat = {"innings": 0, "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "highest": 0, "fifties": 0, "hundreds": 0, "not_outs": 0}
    bowl = {"innings": 0, "balls": 0, "runs": 0, "wickets": 0, "maidens": 0, "best_w": 0, "best_r": 0}
    field = {"catches": 0, "run_outs": 0, "stumpings": 0}
    mom_awards = 0
    match_count = 0

    for m in matches:
        pid_a = team_pid.get(m["team_a_id"])
        pid_b = team_pid.get(m["team_b_id"])
        pid_this = pid_a or pid_b
        if not pid_this:
            continue
        match_count += 1
        # Batting: check both innings for this pid
        for side in ("innings_a", "innings_b"):
            inn = m.get(side) or {}
            b = (inn.get("batters") or {}).get(pid_this)
            if b:
                _accumulate_batting(bat, b)
            # Fielding events: scan opponent's batters for this player's fielder_id (if opponent innings)
            for st in (inn.get("batters") or {}).values():
                if st.get("fielder_id") == pid_this:
                    ot = st.get("out_type")
                    if ot == "catch_out": field["catches"] += 1
                    elif ot == "run_out": field["run_outs"] += 1
                    elif ot == "stumped": field["stumpings"] += 1
        # Bowling: check both innings for this pid
        for side in ("innings_a", "innings_b"):
            inn = m.get(side) or {}
            b = (inn.get("bowlers") or {}).get(pid_this)
            if b:
                _accumulate_bowling(bowl, b)
        if m.get("man_of_the_match_id") == pid_this:
            mom_awards += 1

    bat_avg = round(bat["runs"] / max(1, bat["innings"] - bat["not_outs"]), 2) if bat["innings"] > 0 and (bat["innings"] - bat["not_outs"]) > 0 else bat["runs"]
    bat_sr = round((bat["runs"] / bat["balls"]) * 100, 2) if bat["balls"] > 0 else 0
    bowl_econ = round(bowl["runs"] / (bowl["balls"] / 6), 2) if bowl["balls"] > 0 else 0
    bowl_avg = round(bowl["runs"] / bowl["wickets"], 2) if bowl["wickets"] > 0 else 0
    bowl_sr = round(bowl["balls"] / bowl["wickets"], 2) if bowl["wickets"] > 0 else 0

    return {"user": user, "stats": {
        "matches": match_count,
        "batting": {**bat, "average": bat_avg, "strike_rate": bat_sr},
        "bowling": {**bowl, "economy": bowl_econ, "average": bowl_avg, "strike_rate": bowl_sr},
        "fielding": field,
        "mom_awards": mom_awards,
    }}


@api_router.get("/public/players/{user_id}/stats")
async def public_player_stats(user_id: str):
    """No-auth player profile — safe subset for share links."""
    data = await _player_stats_data(user_id)
    u = data.get("user") or {}
    # Strip PII (email/phone) from public payload — keep display fields only
    data["user"] = {
        "user_id": u.get("user_id"),
        "name": u.get("name"),
        "picture": u.get("picture"),
        "profile_picture_path": u.get("profile_picture_path"),
        "batting_style": u.get("batting_style"),
        "bowling_style": u.get("bowling_style"),
        "role": u.get("role"),
    }
    return data


async def _player_mini_stats(user_id: str) -> Dict[str, Any]:
    """Compact "career card" payload used for the New Batsman / New Bowler in-scoring overlay."""
    d = await _player_stats_data(user_id)
    u = d["user"]; s = d["stats"]
    bat = s.get("batting") or {}
    bowl = s.get("bowling") or {}
    return {
        "user_id": u.get("user_id"),
        "name": u.get("name"),
        "picture": u.get("picture"),
        "profile_picture_path": u.get("profile_picture_path"),
        "batting_style": u.get("batting_style"),
        "bowling_style": u.get("bowling_style"),
        "role": u.get("role"),
        "matches": s.get("matches") or 0,
        "batting": {
            "runs": bat.get("runs") or 0,
            "innings": bat.get("innings") or 0,
            "highest": bat.get("highest") or 0,
            "fours": bat.get("fours") or 0,
            "sixes": bat.get("sixes") or 0,
            "average": bat.get("average") or 0,
            "strike_rate": bat.get("strike_rate") or 0,
            "not_outs": bat.get("not_outs") or 0,
        },
        "bowling": {
            "wickets": bowl.get("wickets") or 0,
            "innings": bowl.get("innings") or 0,
            "runs": bowl.get("runs") or 0,
            "balls": bowl.get("balls") or 0,
            "best": bowl.get("best") or "-",
            "economy": bowl.get("economy") or 0,
            "average": bowl.get("average") or 0,
        },
    }


@api_router.get("/players/{user_id}/mini")
async def player_mini_stats(user_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    return await _player_mini_stats(user_id)


@api_router.get("/public/players/{user_id}/mini")
async def public_player_mini_stats(user_id: str):
    return await _player_mini_stats(user_id)


@api_router.get("/public/teams/{team_id}")
async def public_team(team_id: str):
    """No-auth team page — team info + captain + live/upcoming/previous matches."""
    team = await db.teams.find_one({"team_id": team_id}, {"_id": 0, "owner_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team = await _enrich_team_players(team)
    matches = await db.matches.find(
        {"$or": [{"team_a_id": team_id}, {"team_b_id": team_id}]},
        {"_id": 0, "owner_id": 0, "innings_a.events": 0, "innings_b.events": 0},
    ).sort("created_at", -1).to_list(200)
    live, upcoming, previous = [], [], []
    for m in matches:
        s = m.get("status")
        if s == "live":
            live.append(m)
        elif s == "completed":
            previous.append(m)
        else:
            upcoming.append(m)
    return {"team": team, "matches": {"live": live, "upcoming": upcoming, "previous": previous}}


# ============ TOURNAMENT MVP ============
@api_router.get("/tournaments/{t_id}/mvp")
async def tournament_mvp(t_id: str, authorization: Optional[str] = Header(None)):
    await get_user_from_token(authorization)
    trn = await db.tournaments.find_one({"tournament_id": t_id}, {"_id": 0})
    if not trn:
        raise HTTPException(status_code=404, detail="Not found")
    teams = await db.teams.find({"team_id": {"$in": trn.get("team_ids", [])}}, {"_id": 0}).to_list(500)
    matches = await db.matches.find({"tournament_id": t_id, "status": "completed"}, {"_id": 0}).to_list(500)
    # Build player_id -> player info + team
    players: Dict[str, Dict[str, Any]] = {}
    for t in teams:
        for p in t.get("players", []):
            pid = p["player_id"]
            players[pid] = {
                "player_id": pid,
                "name": p.get("name"),
                "user_id": p.get("user_id"),
                "picture": p.get("picture"),
                "profile_picture_path": p.get("profile_picture_path"),
                "team_id": t["team_id"],
                "team_short": t["short_name"],
                "team_name": t["name"],
                "matches": 0, "runs": 0, "balls_faced": 0, "wickets": 0, "balls_bowled": 0, "runs_conceded": 0,
                "maidens": 0, "catches": 0, "run_outs": 0, "stumpings": 0, "fours": 0, "sixes": 0,
                "mvp_points": 0,
            }

    seen_match_players: Dict[str, set] = {}
    for m in matches:
        for side in ("innings_a", "innings_b"):
            inn = m.get(side) or {}
            for pid, st in (inn.get("batters") or {}).items():
                if pid not in players: continue
                seen_match_players.setdefault(m["match_id"], set()).add(pid)
                runs = int(st.get("runs") or 0)
                balls = int(st.get("balls") or 0)
                fours = int(st.get("fours") or 0)
                sixes = int(st.get("sixes") or 0)
                players[pid]["runs"] += runs
                players[pid]["balls_faced"] += balls
                players[pid]["fours"] += fours
                players[pid]["sixes"] += sixes
                # Bat points
                sr_bonus = 0
                if balls >= 5:
                    sr_bonus = int(max(0, (runs / balls * 100 - 100)) / 2)
                players[pid]["mvp_points"] += runs + fours * 2 + sixes * 4 + sr_bonus
            for pid, st in (inn.get("bowlers") or {}).items():
                if pid not in players: continue
                seen_match_players.setdefault(m["match_id"], set()).add(pid)
                wkts = int(st.get("wickets") or 0)
                balls = int(st.get("balls") or 0)
                runs = int(st.get("runs") or 0)
                mds = int(st.get("maidens") or 0)
                players[pid]["wickets"] += wkts
                players[pid]["balls_bowled"] += balls
                players[pid]["runs_conceded"] += runs
                players[pid]["maidens"] += mds
                econ_bonus = 0
                if balls >= 6:
                    econ = runs / (balls / 6)
                    econ_bonus = int(max(0, (7 - econ) * 3))
                players[pid]["mvp_points"] += wkts * 25 + mds * 8 + econ_bonus
            for st in (inn.get("batters") or {}).values():
                fid = st.get("fielder_id")
                if fid and fid in players:
                    ot = st.get("out_type")
                    if ot == "catch_out":
                        players[fid]["catches"] += 1; players[fid]["mvp_points"] += 10
                    elif ot == "run_out":
                        players[fid]["run_outs"] += 1; players[fid]["mvp_points"] += 15
                    elif ot == "stumped":
                        players[fid]["stumpings"] += 1; players[fid]["mvp_points"] += 20
                    seen_match_players.setdefault(m["match_id"], set()).add(fid)
    # matches played
    for mid, pids in seen_match_players.items():
        for pid in pids:
            if pid in players:
                players[pid]["matches"] += 1
    board = sorted(players.values(), key=lambda x: -x["mvp_points"])
    board = [p for p in board if p["matches"] > 0 or p["mvp_points"] > 0]
    return {"leaderboard": board}


# ============ SEARCH ============
@api_router.get("/search")
async def global_search(q: str = "", authorization: Optional[str] = Header(None)):
    # Auth optional — same result set as public search
    q = (q or "").strip()
    return await _do_search(q)


@api_router.get("/public/search")
async def public_search(q: str = ""):
    """No-auth global search — returns players/teams/tournaments/matches from ANY user."""
    return await _do_search((q or "").strip())


async def _do_search(q: str) -> Dict[str, Any]:
    if len(q) < 2:
        return {"users": [], "teams": [], "matches": [], "tournaments": []}
    regex = {"$regex": q, "$options": "i"}
    users = await db.users.find(
        {"$or": [{"name": regex}, {"phone": regex}, {"email": regex}]},
        {"_id": 0, "user_id": 1, "name": 1, "phone": 1, "email": 1, "picture": 1, "profile_picture_path": 1, "batting_style": 1, "bowling_style": 1},
    ).limit(15).to_list(15)
    # Strip PII on users
    for u in users:
        u.pop("email", None)
        u.pop("phone", None)
    teams = await db.teams.find(
        {"$or": [{"name": regex}, {"short_name": regex}]},
        {"_id": 0, "team_id": 1, "name": 1, "short_name": 1, "captain_id": 1},
    ).limit(15).to_list(15)
    matches = await db.matches.find(
        {"$or": [{"team_a_name": regex}, {"team_b_name": regex}, {"venue": regex}, {"match_id": regex}]},
        {"_id": 0, "match_id": 1, "team_a_name": 1, "team_b_name": 1, "team_a_short": 1, "team_b_short": 1, "status": 1, "overs": 1, "share_token": 1, "result_text": 1, "team_a_id": 1, "team_b_id": 1, "created_at": 1},
    ).sort("created_at", -1).limit(15).to_list(15)
    tournaments = await db.tournaments.find(
        {"$or": [{"name": regex}, {"location": regex}]},
        {"_id": 0, "tournament_id": 1, "name": 1, "location": 1, "overs": 1, "start_date": 1, "end_date": 1},
    ).limit(15).to_list(15)
    return {"users": users, "teams": teams, "matches": matches, "tournaments": tournaments}


# ============ PUBLIC / SHARE ============
@api_router.get("/public/matches/{share_token}")
async def public_match(share_token: str):
    """No-auth match viewer for share links. Returns match + team players."""
    m = await db.matches.find_one({"share_token": share_token}, {"_id": 0, "owner_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    team_a = await db.teams.find_one({"team_id": m["team_a_id"]}, {"_id": 0, "owner_id": 0})
    team_b = await db.teams.find_one({"team_id": m["team_b_id"]}, {"_id": 0, "owner_id": 0})
    team_a = await _enrich_team_players(team_a)
    team_b = await _enrich_team_players(team_b)
    return {"match": m, "team_a": team_a, "team_b": team_b}


@api_router.get("/public/matches/{share_token}/events")
async def public_match_events(share_token: str, side: Optional[str] = None, limit: int = 50):
    """Ball-by-ball event feed for public share (newest first)."""
    m = await db.matches.find_one({"share_token": share_token}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    if side and side in ("a", "b"):
        events = (m.get("innings_a") if side == "a" else m.get("innings_b") or {}).get("events") or []
    else:
        # combine, mark innings side on each
        events = []
        for s in ("a", "b"):
            inn = m.get("innings_a" if s == "a" else "innings_b") or {}
            for i, ev in enumerate(inn.get("events") or []):
                # strip pre_state from public feed (heavy + internal)
                clean = {k: v for k, v in ev.items() if k != "pre"}
                clean["side"] = s
                clean["ball_index"] = i
                events.append(clean)
    events = events[-limit:][::-1]
    return {"events": events, "current_innings": m.get("current_innings"), "status": m.get("status")}


@api_router.get("/public/files/{path:path}")
async def public_file(path: str):
    """No-auth image proxy — only images inside the app namespace are exposed."""
    if not path.startswith(f"{APP_NAME}/"):
        raise HTTPException(status_code=403, detail="Forbidden")
    content, ct = await run_in_threadpool(get_object, path)
    return Response(content=content, media_type=ct)


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
