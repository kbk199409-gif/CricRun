# CricTrack — Product Requirements

## Overview
A CricHeroes-style Expo mobile cricket scoring app: teams from real users, live ball-by-ball scoring, tournaments with NRR, public shareable live match links.

## Users
Casual/club cricket players and organizers who score matches on their phone and want to share the action.

## Feature Set

### Auth
- **Phone OTP (real)** — 6-digit code, 5-min TTL, 5-attempt lockout, 30s resend cooldown. Dev preview returns `dev_code` in send response and displays on OTP screen.
- **Emergent Google Sign-In**.
- 7-day session tokens (secure store / localStorage).

### Profile
- Name, photo (Emergent Object Storage), batting hand, bowling style, role.

### Teams
- Create team, add players by searching registered users (linked identity via `user_id`) or as guests.
- Duplicate registered users blocked; owner can remove players.

### Tournaments
- Name, location (optional), start/end dates in **DD/MM/YYYY**, overs per match (5/6/8/10/12/15/20 or custom).
- No T20/ODI/T10 classification.
- Add teams. Attach matches. Auto-computed Points Table + NRR.

### Matches
- Two teams + overs. Routes through:
  1. **Toss** — winning team + Bat/Bowl → sets which team bats first.
  2. **Sequential opener wizard** (3 steps) — Striker → Non-Striker → Opening Bowler.
  3. **Live scoring** — run pads, extras (Wd/Nb/Bye/LB), swap strike, WICKET, UNDO.
- **Wicket flow**: pick from Bowled, Caught, Run Out, LBW, Stumped, Hit Wicket, Retired Hurt. Fielder picker for Caught/Run Out/Stumped.
- **End-of-over**: strike auto-swaps, next-bowler picker required.
- **Innings ends** at overs limit / all-out / target reached.
- **Match ends** with `winner_team_id` + human-readable `result_text`.
- **Man of the Match** — pick after completion.
- **Undo** — reverses last ball's runs, balls, strike, wickets, batter/bowler stats fully.

### Live Scorecard (accessible during match)
- Batting table with photo, runs, balls, 4s, 6s, SR, striker mark, dismissal line.
- Bowling table with photo, overs, runs, wickets, economy.
- Toss line displayed.

### Public Share (no login)
- Every match has a `share_token`. `/share/{token}` shows live score, batters on strike, current bowler with photos, auto-refresh every 5s.

## Tech Stack
Expo SDK 57, expo-router, FastAPI + Motor, Emergent Google Auth, Emergent Object Storage.
