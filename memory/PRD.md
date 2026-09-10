# CricTrack — Product Requirements

## Overview
A CricHeroes-style Expo mobile app for scoring cricket matches, managing teams and tournaments, and tracking player profiles.

## Users
- Casual/club cricket players and organizers who want to score matches ball-by-ball, form teams, run mini-tournaments, and see a live points table with NRR.

## MVP Feature Set (Implemented)

### Auth
- Phone + 6-digit OTP (mock — any 6 digits accepted)
- Emergent-managed Google Sign-In
- 7-day session tokens stored in `expo-secure-store` (mobile) / `localStorage` (web)

### Profile
- Name, profile picture (uploaded to Emergent Object Storage)
- Batting style: Right / Left hand
- Bowling style: Fast / Medium / Spinner / None
- Playing role: Batsman / Bowler / All-rounder / Wicketkeeper

### Teams
- Create team (name + short code)
- Add players (name)

### Matches
- Create match between two of your teams, set overs
- Live scoring: quick tap runs (0/1/2/3/4/6), wicket, +1 extra, next ball
- Toggle current batting innings
- End match — winner auto-computed from scores

### Tournaments
- Create tournament (name, format, overs)
- Add teams from your team list
- Attach matches to the tournament
- Points Table with NRR auto-computed after matches complete

## Tech Stack
- Frontend: Expo SDK 57, expo-router, react-native-safe-area-context, expo-image-picker, expo-haptics, `@react-native-vector-icons/ionicons`, expo-linear-gradient
- Backend: FastAPI + Motor (MongoDB async)
- Integrations: Emergent Google Auth, Emergent Object Storage

## Design
Blue/white sporty theme (per user choice). Design tokens live in `/app/frontend/src/theme.ts`; guidelines in `/app/design_guidelines.json`.

## Future / Next
- Ball-by-ball log & stats per player
- Man of the match, live viewer share link
- Push notifications for tournament updates (native build only)
