# CricTrack — Product Requirements

## Overview
CricHeroes-style Expo mobile cricket scoring app: teams from real users, live ball-by-ball scoring, tournaments with NRR & MVP, public shareable live match links with ball-by-ball feed.

## Feature Set

### Auth
- Phone OTP (real, 6-digit, 5-min TTL, 5-attempt lockout, 30s resend cooldown, dev-preview returns `dev_code`).
- Emergent Google Sign-In.

### Profile & Player Stats
- Name, photo (Emergent Object Storage), batting hand, bowling style, role.
- **Auto-aggregated career stats** at `/player/{user_id}`: batting (runs, average, SR, highest, 50s/100s), bowling (wickets, econ, average, SR, best), fielding (catches/run outs/stumpings), MoM awards.

### Teams
- Create team; add players by searching registered users (linked identity) or as guests.
- Duplicate registered users blocked; owner can remove players.

### Tournaments
- Name, location, DD/MM/YYYY dates, overs (preset or custom), no format classification.
- Auto NRR points table + **auto MVP leaderboard** (batting/bowling/fielding-weighted points).

### Matches
- Two teams + overs → Toss → sequential opener wizard (Striker → Non-Striker → Bowler) → Live scoring.
- **Live scoring**: run pads (0/1/2/3/4/6), extras (Wd/Nb/Bye/LB), Wicket with 7 dismissal types + fielder picker, Undo, Swap Strike.
- **Innings auto-ends** at overs limit / all-out / target reached. Shows "INNINGS END" banner, then next-innings setup.
- **Fixed last-ball wicket freeze** — no more hung modals.
- **Match auto-ends** with winner + result text.
- **Auto Man of the Match** — impact score across bat/bowl/field. Manual override still available.
- **Delete Match** — owner-only.
- **Live Scorecard** (accessible during match): batting (R/B/4s/6s/SR + strike mark + dismissal), bowling (O/M/R/W/Econ + maidens), extras total, fall of wickets.

### Public Share (no login)
- `/share/{token}` shows both team scores in Cricbuzz-style header, LIVE badge, CRR/RRR, "Need X in Y balls", batting cards, current bowler, **ball-by-ball feed** with dot bubbles (green boundary, red wicket) and event labels ("FOUR", "WICKET — batter b bowler"). Auto-refresh every 5s.
- `INNINGS END` banner visible to public viewer.

### Search
- Global search tab: players (by name/phone/email), matches, tournaments.

## Tech Stack
Expo SDK 57, expo-router, FastAPI + Motor, Emergent Google Auth, Emergent Object Storage.
