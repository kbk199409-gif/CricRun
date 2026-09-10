# CricTrack — Product Requirements

## Overview
A CricHeroes-style Expo mobile app for scoring cricket matches, managing teams and tournaments, and tracking player profiles.

## Users
Casual/club cricket players and organizers who want to score matches ball-by-ball, form teams from other CricTrack users, run mini-tournaments, and see a live points table with NRR.

## Feature Set

### Auth
- **Phone OTP (real)** — 6-digit code, 5-minute TTL, 5-attempt lockout, 30s resend cooldown. Dev preview returns `dev_code` in the API response and shows it on the OTP screen; production sends via SMS.
- Emergent-managed Google Sign-In.
- 7-day session tokens in `expo-secure-store` / `localStorage`.

### Profile
- Name, profile picture (Emergent Object Storage), batting hand, bowling style, playing role.

### Teams
- Create team (name + short code).
- Add player by searching registered CricTrack users (name/phone/email) OR add a guest by name.
- Registered users keep the SAME player identity (linked by `user_id`) across all teams — stats will roll up to them.
- Duplicate registered users on a team are blocked. Owner can remove players.

### Tournaments
- Create with name, location (optional), start/end date (optional), and overs per match — **no T20/ODI/T10 classification**.
- Add teams. Attach matches. Points Table with auto NRR.

### Matches (Cricket Rules)
- Create with two teams + overs (preset 5/6/8/10/12/15/20 or custom).
- **Setup screen enforces striker, non-striker, opening bowler before any ball can be scored.**
- Ball input: runs (0/1/2/3/4/6) with extra type (Off Bat / Wide / No Ball / Bye / Leg Bye) + wicket toggle + swap-strike button.
- Wide & No Ball don't count as legal balls; each adds +1 to team runs.
- End-of-over auto-swaps strike and prompts for the next bowler.
- Wicket auto-prompts for the incoming batsman.
- Innings auto-ends at overs limit OR all-out OR (2nd innings) target reached.
- Match auto-ends with `winner_team_id` and human-readable `result_text` (e.g. "Mumbai won by 12 runs").

## Tech Stack
Expo SDK 57, expo-router, FastAPI + Motor, Emergent Google Auth, Emergent Object Storage.

## Future / Next
- Ball-by-ball history & individual player stats (rolled up to `user_id`)
- Man of the Match, live public share link
- Wagon Wheel visualization
